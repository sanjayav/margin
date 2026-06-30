// Open-data ingestion — scrapes real registration data from public sources and
// loads it into the store the app reads (Neon when DATABASE_URL is set, else the
// local file store at .data/underline.json, exactly like api/_store.ts).
//
//   node scripts/ingest-open.mjs            # local file store (zero config)
//   DATABASE_URL=... node scripts/ingest-open.mjs   # also writes Neon
//
// EU  → European Environment Agency (EEA) CO₂-monitoring of new passenger cars,
//       queried LIVE and aggregated server-side via the EEA DiscoData SQL API.
//       Each source row is one registered vehicle, so COUNT(*) is real
//       registrations and AVG(metric) is registration-weighted — exactly the
//       level the engine consumes. No multi-GB download required.
//
// The other markets (IN/AU/UK) have no comparable open registration API, so they
// keep their official-workbook extract; see README. Extend `ADAPTERS` to add one.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = join(here, '..')
const DATA_DIR = join(ROOT, '.data')
const DATA_FILE = join(DATA_DIR, 'underline.json')

// ── EEA DiscoData SQL API ─────────────────────────────────────────────────────
const DISCO = 'https://discodata.eea.europa.eu/sql'
const EEA_TABLE = '[CO2Emission].[latest].[co2cars_2025Pv31]' // 2025 provisional (latest)
const EEA_YEAR = 2025
const EEA_SOURCE = { name: 'European Environment Agency — CO₂ monitoring of new passenger cars (DiscoData, 2025 provisional)', url: 'https://discodata.eea.europa.eu/' }

async function disco(query, nrOfHits = 5000) {
  const u = `${DISCO}?query=${encodeURIComponent(query)}&p=1&nrOfHits=${nrOfHits}`
  const res = await fetch(u)
  if (!res.ok) throw new Error(`DiscoData HTTP ${res.status}`)
  const j = await res.json()
  if (j.errors) throw new Error('DiscoData: ' + JSON.stringify(j.errors))
  return j.results ?? []
}

// Note: DiscoData rejects aggregate expressions in ORDER BY — always order by an
// alias. Each query is TOP-limited and paged, so nothing huge is transferred.
function powertrain(ft = '') {
  const f = String(ft).toLowerCase()
  if (f.includes('electric') && (f.includes('petrol') || f.includes('diesel'))) return 'PHEV'
  if (f === 'electric' || f === 'hydrogen') return 'BEV'
  return 'ICE'
}
const isZE = (ft) => powertrain(ft) === 'BEV'

async function scrapeEEA({ topManufacturers = 20, topModels = 18, minModelRegs = 150 } = {}) {
  console.log(`EEA · querying ${EEA_TABLE} …`)
  // 1. top compliance manufacturers — with their REAL pool (Mp), the registration-
  //    weighted fleet totals (to anchor the average), the eco-innovation credit
  //    (Erwltp) and the zero-emission count. Exclude AA-* approval buckets.
  const mfrs = await disco(
    `SELECT TOP ${topManufacturers} Mh, MAX(Mp) AS pool, COUNT(*) AS regs, ` +
    `AVG(CAST([Ewltp (g/km)] AS float)) AS co2, AVG(CAST(Mt AS float)) AS mass, ` +
    `AVG(CAST([Erwltp (g/km)] AS float)) AS eco, ` +
    `SUM(CASE WHEN Ft IN ('electric','hydrogen') THEN 1 ELSE 0 END) AS ze ` +
    `FROM ${EEA_TABLE} WHERE Mh IS NOT NULL AND Mh NOT LIKE 'AA-%' AND [Ewltp (g/km)] IS NOT NULL ` +
    `GROUP BY Mh ORDER BY regs DESC`,
    topManufacturers,
  )
  console.log(`  ${mfrs.length} manufacturers (top by registrations)`)

  const rows = []
  for (const m of mfrs) {
    const Mh = m.Mh
    const safe = Mh.replace(/'/g, "''")
    // real compliance pool: the EEA Mp pool when declared, else standalone.
    const poolName = m.pool && String(m.pool).trim() ? String(m.pool).trim() : Mh
    // 2. that manufacturer's top models × fuel, registration-weighted metrics
    const models = await disco(
      `SELECT TOP ${topModels} Cn, Ft, COUNT(*) AS regs, ` +
      `AVG(CAST([Ewltp (g/km)] AS float)) AS co2, AVG(CAST([Erwltp (g/km)] AS float)) AS eco, ` +
      `AVG(CAST(Mt AS float)) AS testmass, AVG(CAST([M (kg)] AS float)) AS kerb, ` +
      `AVG(CAST([Ec (cm3)] AS float)) AS cc, AVG(CAST([Z (Wh/km)] AS float)) AS wh ` +
      `FROM ${EEA_TABLE} WHERE Mh = '${safe}' AND Cn IS NOT NULL AND [Ewltp (g/km)] IS NOT NULL ` +
      `GROUP BY Cn, Ft ORDER BY regs DESC`,
      topModels,
    )
    const mk = (extra) => ({ parent: Mh, pool: poolName, make: Mh, year: EEA_YEAR, vclass: 'Passenger car', market: 'EU', ...extra })
    let topRegs = 0, topCo2Sum = 0, topMassSum = 0, topEcoSum = 0, topZe = 0
    for (const r of models) {
      if (!r.Cn || r.regs < minModelRegs) continue
      const ft = r.Ft || 'petrol'
      const pt = powertrain(ft)
      const ze = pt === 'BEV'
      const testMass = r.testmass ? Math.round(r.testmass) : (r.kerb ? Math.round(r.kerb) : 1500)
      const eco = ze ? 0 : Math.max(0, +(r.eco ?? 0))
      const variant = ze ? (r.wh ? `${Math.round(r.wh)} Wh/km` : 'electric') : (r.cc ? `${(r.cc / 1000).toFixed(1)}L ${ft}` : ft)
      topRegs += r.regs; topCo2Sum += r.regs * (r.co2 ?? 0); topMassSum += r.regs * (r.testmass ?? testMass); topEcoSum += r.regs * (r.eco ?? 0); if (ze) topZe += r.regs
      rows.push(mk({
        brand: r.Cn?.split(' ')[0] ?? Mh, model: String(r.Cn).trim(), powertrain: pt, fuel: ft,
        co2: ze ? 0 : Math.max(0, Math.round(r.co2)), mass: testMass, sales: r.regs,
        ecoBenefit: +eco.toFixed(2), variant,
        energy: r.wh ? Math.round(r.wh) : undefined, kerbMass: r.kerb ? Math.round(r.kerb) : undefined,
        testMass, engineCC: r.cc ? Math.round(r.cc) : undefined,
      }))
    }

    // 3. RESIDUAL "Other models" — the long tail beyond top-N, so the fleet average
    //    is the manufacturer's TRUE registration-weighted figure (no truncation bias
    //    that would overstate fines). Split into ZE/non-ZE to keep the ZE share right.
    const resRegs = Math.round(m.regs - topRegs)
    if (resRegs > 500) {
      const resCo2Sum = m.regs * (m.co2 ?? 0) - topCo2Sum
      const resMassSum = m.regs * (m.mass ?? 1500) - topMassSum
      const resEcoSum = Math.max(0, m.regs * (m.eco ?? 0) - topEcoSum)
      const resMass = Math.max(800, Math.round(resMassSum / resRegs))
      const resZe = Math.max(0, Math.round((m.ze ?? 0) - topZe))
      const resNonZe = Math.max(0, resRegs - resZe)
      if (resZe > 0) rows.push(mk({ brand: Mh, model: 'Other models', powertrain: 'BEV', fuel: 'electric', co2: 0, mass: resMass, sales: resZe, ecoBenefit: 0, variant: 'other zero-emission', testMass: resMass }))
      if (resNonZe > 0) {
        const resCo2 = Math.max(0, Math.round(resCo2Sum / resNonZe)) // BEVs add 0 to the co2 sum
        rows.push(mk({ brand: Mh, model: 'Other models', powertrain: 'ICE', fuel: 'petrol', co2: resCo2, mass: resMass, sales: resNonZe, ecoBenefit: +(resEcoSum / resNonZe).toFixed(2), variant: 'other ICE / hybrid', testMass: resMass }))
      }
    }
    console.log(`  ${Mh.padEnd(20)} pool=${poolName.slice(0, 22).padEnd(22)} ${models.length} models${resRegs > 500 ? ` +${resRegs.toLocaleString()} other` : ''}`)
  }

  // Hold the real current-year fleet across the EU compliance horizon (the limit
  // tightens per the rule pack) so every year-aware view has data. Clearly the
  // 2026-2030 rows are the 2025 baseline projected forward, not measured.
  const horizon = [2025, 2026, 2027, 2028, 2029, 2030]
  const expanded = horizon.flatMap((y) => rows.map((r) => ({ ...r, year: y })))
  console.log(`EEA · ${rows.length} real ${EEA_YEAR} rows → ${expanded.length} across ${horizon[0]}–${horizon.at(-1)} (baseline held)`)
  return expanded
}

// ── Store writers (mirror api/_store.ts) ──────────────────────────────────────
function writeLocal(market, name, url, rows) {
  let db = {}
  try { db = JSON.parse(readFileSync(DATA_FILE, 'utf8')) } catch { db = {} }
  db[market] = { version: String(Date.now()), name, url, refreshed: new Date().toISOString(), rows }
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
  writeFileSync(DATA_FILE, JSON.stringify(db))
  console.log(`Local store · wrote ${rows.length} ${market} rows to ${DATA_FILE}`)
}

async function writeNeon(market, name, url, rows) {
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL)
  const version = Date.now()
  const payload = rows.map((r) => ({
    parent: r.parent, pool: r.pool ?? null, brand: r.brand ?? null, make: r.make ?? null, model: r.model, year: r.year,
    powertrain: r.powertrain ?? null, fuel: r.fuel ?? null, co2: r.co2 ?? null, mass: r.mass ?? null, sales: r.sales ?? 0,
    vclass: r.vclass ?? null, eco_benefit: r.ecoBenefit ?? null, cnf: null, zev: null, engine_cc: r.engineCC ?? null,
    variant: r.variant ?? null, variant_id: r.variantId ?? null, battery: r.battery ?? null, range_km: null,
    energy: r.energy ?? null, kerb_mass: r.kerbMass ?? null, test_mass: r.testMass ?? null, footprint: r.footprint ?? null,
    gearbox: r.gearbox ?? null, driveline: r.driveline ?? null, market_label: r.market ?? null,
  }))
  await sql`insert into refresh_runs (market, dataset_version, status) values (${market}, ${version}, 'running')`
  for (let i = 0; i < payload.length; i += 1000) {
    const chunk = payload.slice(i, i + 1000)
    await sql`
      insert into vehicles (market, dataset_version, parent, pool, brand, make, model, year, powertrain, fuel, co2, mass, sales, vclass, eco_benefit, cnf, zev, engine_cc,
        variant, variant_id, battery, range_km, energy, kerb_mass, test_mass, footprint, gearbox, driveline, market_label)
      select ${market}, ${version}, x.parent, x.pool, x.brand, x.make, x.model, x.year, x.powertrain, x.fuel, x.co2, x.mass, x.sales, x.vclass, x.eco_benefit, x.cnf, x.zev, x.engine_cc,
        x.variant, x.variant_id, x.battery, x.range_km, x.energy, x.kerb_mass, x.test_mass, x.footprint, x.gearbox, x.driveline, x.market_label
      from jsonb_to_recordset(${JSON.stringify(chunk)}::jsonb) as x(
        parent text, pool text, brand text, make text, model text, year int, powertrain text, fuel text,
        co2 double precision, mass double precision, sales int, vclass text,
        eco_benefit double precision, cnf double precision, zev int, engine_cc double precision,
        variant text, variant_id text, battery double precision, range_km double precision, energy double precision,
        kerb_mass double precision, test_mass double precision, footprint double precision, gearbox text, driveline text, market_label text)`
  }
  await sql`
    insert into data_sources (market, name, url, current_version, last_refreshed, status)
    values (${market}, ${name}, ${url}, ${version}, now(), 'ok')
    on conflict (market) do update set name = excluded.name, url = excluded.url,
      current_version = excluded.current_version, last_refreshed = excluded.last_refreshed, status = 'ok'`
  await sql`update refresh_runs set finished_at = now(), rows_in = ${rows.length}, rows_out = ${rows.length}, status = 'ok' where market = ${market} and dataset_version = ${version}`
  await sql`delete from vehicles where market = ${market} and dataset_version < (
    select min(v) from (select distinct dataset_version v from vehicles where market = ${market} order by v desc limit 3) t)`
  console.log(`Neon · wrote ${rows.length} ${market} rows as version ${version}`)
}

const ADAPTERS = {
  EU: { source: EEA_SOURCE, scrape: scrapeEEA },
}

async function main() {
  const want = (process.argv[2] || 'EU').toUpperCase().split(',')
  for (const market of want) {
    const a = ADAPTERS[market]
    if (!a) { console.warn(`No open-data adapter for ${market} — skipping (keeps the bundled extract).`); continue }
    const rows = await a.scrape()
    if (!rows.length) { console.warn(`${market}: scrape returned no rows — leaving the store unchanged.`); continue }
    writeLocal(market, a.source.name, a.source.url, rows)
    if (process.env.DATABASE_URL) await writeNeon(market, a.source.name, a.source.url, rows)
  }
  console.log('\nDone. Restart the app (or reload) — Admin → Data freshness will show the live source.')
}

main().catch((e) => { console.error('Ingestion failed:', e.message); process.exit(1) })
