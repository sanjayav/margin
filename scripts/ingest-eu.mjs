// EU ingestion adapter — the real production path.
//
//   node --env-file=.env scripts/ingest-eu.mjs
//
// With EEA_EU_URL set, streams the European Environment Agency CO₂-monitoring
// CSV (one row per registered vehicle), aggregates it to the engine's level
// (parent · model · fuel · year → sales-weighted CO₂ + mass), and loads it as a
// new dataset version that becomes live atomically. Without EEA_EU_URL it seeds
// from the bundled official extract so you can wire the DB before fetching the
// full file.
//
// Note: EEA release column names drift between years. The resolver below matches
// the common headers; adjust the *_KEYS arrays (or use the Claude column-mapper)
// if a release differs.
import { neon } from '@neondatabase/serverless'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const url = process.env.DATABASE_URL
if (!url) { console.error('DATABASE_URL is not set'); process.exit(1) }
const sql = neon(url)
const MARKET = 'EU'
const SOURCE = { name: 'European Environment Agency — CO₂ monitoring of new cars & vans', url: 'https://www.eea.europa.eu/en/datahub' }

const PARENT_KEYS = ['Mh', 'Man', 'manufacturer']
const MODEL_KEYS = ['Cn', 'commercial name', 'Model']
const CO2_KEYS = ['Ewltp (g/km)', 'Ewltp', 'Enedc (g/km)', 'co2']
const MASS_KEYS = ['m (kg)', 'Mt', 'mass']
const FUEL_KEYS = ['Ft', 'fuel type']
const YEAR_KEYS = ['year', 'Year']

const idx = (header, keys) => {
  const lower = header.map((h) => h.trim().toLowerCase())
  for (const k of keys) { const i = lower.indexOf(k.toLowerCase()); if (i >= 0) return i }
  return -1
}

function powertrain(ft = '') {
  const f = ft.toLowerCase()
  if (f.includes('electric') && (f.includes('petrol') || f.includes('diesel'))) return 'PHEV'
  if (f.includes('electric') || f.includes('bev')) return 'BEV'
  if (f.includes('hybrid')) return 'HEV'
  return 'ICE'
}

async function loadAggregated(rows, rowsIn) {
  const version = Date.now()
  await sql`insert into refresh_runs (market, dataset_version, status) values (${MARKET}, ${version}, 'running')`
  for (let i = 0; i < rows.length; i += 1000) {
    const chunk = rows.slice(i, i + 1000)
    await sql`
      insert into vehicles (market, dataset_version, parent, model, year, powertrain, fuel, co2, mass, sales, vclass)
      select ${MARKET}, ${version}, x.parent, x.model, x.year, x.powertrain, x.fuel, x.co2, x.mass, x.sales, 'Passenger car'
      from jsonb_to_recordset(${JSON.stringify(chunk)}::jsonb) as x(
        parent text, model text, year int, powertrain text, fuel text,
        co2 double precision, mass double precision, sales int)`
  }
  await sql`
    insert into data_sources (market, name, url, current_version, last_refreshed, status)
    values (${MARKET}, ${SOURCE.name}, ${SOURCE.url}, ${version}, now(), 'ok')
    on conflict (market) do update set name = excluded.name, url = excluded.url,
      current_version = excluded.current_version, last_refreshed = excluded.last_refreshed, status = 'ok'`
  await sql`update refresh_runs set finished_at = now(), rows_in = ${rowsIn}, rows_out = ${rows.length}, status = 'ok' where market = ${MARKET} and dataset_version = ${version}`
  await sql`delete from vehicles where market = ${MARKET} and dataset_version < (
    select min(v) from (select distinct dataset_version v from vehicles where market = ${MARKET} order by v desc limit 3) t)`
  console.log(`Loaded ${rows.length} aggregated rows (from ${rowsIn} source rows) as version ${version}.`)
}

async function fromEEA(src) {
  const delim = process.env.EEA_EU_DELIMITER || ','
  console.log('Fetching', src)
  const resp = await fetch(src)
  if (!resp.ok || !resp.body) throw new Error(`fetch failed ${resp.status}`)
  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buf = '', header = null, cols = null, rowsIn = 0
  const agg = new Map() // key -> {parent,model,fuel,year, co2sum, masssum, n}

  const handle = (line) => {
    if (!line) return
    const f = line.split(delim)
    if (!header) {
      header = f
      cols = {
        parent: idx(header, PARENT_KEYS), model: idx(header, MODEL_KEYS), co2: idx(header, CO2_KEYS),
        mass: idx(header, MASS_KEYS), fuel: idx(header, FUEL_KEYS), year: idx(header, YEAR_KEYS),
      }
      if (cols.parent < 0 || cols.co2 < 0) throw new Error('could not resolve EEA columns; adjust *_KEYS')
      return
    }
    rowsIn++
    const parent = (f[cols.parent] || '').trim()
    const model = (f[cols.model] || 'Unknown').trim()
    const fuel = (f[cols.fuel] || '').trim()
    const year = parseInt(f[cols.year], 10) || new Date().getFullYear()
    const co2 = parseFloat(f[cols.co2])
    const mass = parseFloat(f[cols.mass])
    if (!parent || Number.isNaN(co2)) return
    const key = `${parent}|${model}|${fuel}|${year}`
    const a = agg.get(key) || { parent, model, fuel, year, co2sum: 0, masssum: 0, n: 0 }
    a.co2sum += co2; a.masssum += Number.isNaN(mass) ? 0 : mass; a.n += 1
    agg.set(key, a)
  }

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let nl
    while ((nl = buf.indexOf('\n')) >= 0) { handle(buf.slice(0, nl).replace(/\r$/, '')); buf = buf.slice(nl + 1) }
  }
  handle(buf.replace(/\r$/, ''))

  const rows = [...agg.values()].map((a) => ({
    parent: a.parent, model: a.model, year: a.year, fuel: a.fuel, powertrain: powertrain(a.fuel),
    co2: +(a.co2sum / a.n).toFixed(2), mass: a.n ? +(a.masssum / a.n).toFixed(0) : 0, sales: a.n,
  }))
  await loadAggregated(rows, rowsIn)
}

async function fromExtract() {
  const here = dirname(fileURLToPath(import.meta.url))
  const fleet = JSON.parse(readFileSync(join(here, '..', 'src', 'data', 'fleet_data.json'), 'utf8'))
  const rows = fleet.EU.map((r) => ({
    parent: r.parent, model: r.model, year: r.year, fuel: r.fuel, powertrain: r.powertrain,
    co2: r.co2, mass: r.mass, sales: r.sales,
  }))
  console.log('EEA_EU_URL not set — seeding from bundled extract.')
  await loadAggregated(rows, rows.length)
}

const src = process.env.EEA_EU_URL
await (src ? fromEEA(src) : fromExtract())
