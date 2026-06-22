// Storage layer with two interchangeable backends:
//   • Neon Postgres  — when DATABASE_URL is set (production)
//   • Local JSON file — otherwise (zero-config; auto-seeded from the official
//     extract so the backend is fully live on `npm run dev` with no cloud account)
// Both expose the same getCurrent / putDataset interface, so the API routes and
// the engine don't care which is active.
import { neon } from '@neondatabase/serverless'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { CountryId, Vehicle } from '../src/engine/types.js'
import fleet from '../src/data/fleet_data.js'

export interface StoreMeta { source: string; url: string | null; lastRefreshed: string | null; datasetVersion: string; live: boolean }
export interface CurrentData { meta: StoreMeta; vehicles: Vehicle[] }

export const SOURCES: Record<string, { name: string; url: string }> = {
  EU: { name: 'European Environment Agency — CO₂ monitoring of new cars & vans', url: 'https://www.eea.europa.eu/en/datahub' },
  IN: { name: 'Bureau of Energy Efficiency / SIAM', url: 'https://beeindia.gov.in' },
  AU: { name: 'DCCEEW — New Vehicle Efficiency Standard', url: 'https://www.dcceew.gov.au' },
  UK: { name: 'DfT — Vehicle Emissions Trading Schemes', url: 'https://www.gov.uk/government/collections/vehicle-emissions-trading-schemes' },
}

export const backend: 'neon' | 'local' = process.env.DATABASE_URL ? 'neon' : 'local'
const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null
// Vercel's serverless filesystem is read-only (except /tmp), so the local JSON
// file store only makes sense in dev. On Vercel without Neon we return null and
// the client falls back to the bundled extract.
const onVercel = !!process.env.VERCEL

// ── local file store ────────────────────────────────────────────────────────
const DATA_DIR = join(process.cwd(), '.data')
const DATA_FILE = join(DATA_DIR, 'underline.json')
type LocalDb = Record<string, { version: string; name: string; url: string; refreshed: string; rows: Vehicle[] }>

function readLocal(): LocalDb {
  try { return JSON.parse(readFileSync(DATA_FILE, 'utf8')) } catch { return {} }
}
function writeLocal(db: LocalDb) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
  writeFileSync(DATA_FILE, JSON.stringify(db))
}
function ensureSeed(): LocalDb {
  const db = readLocal()
  let changed = false
  for (const m of ['EU', 'IN', 'AU', 'UK'] as CountryId[]) {
    if (!db[m] && (fleet as any)[m]) {
      db[m] = { version: String(Date.now()), name: `${SOURCES[m].name} (bundled extract)`, url: SOURCES[m].url, refreshed: new Date().toISOString(), rows: (fleet as any)[m] }
      changed = true
    }
  }
  if (changed) writeLocal(db)
  return db
}

function mapRow(r: any): Vehicle {
  return {
    parent: r.parent, pool: r.pool, brand: r.brand, make: r.make, model: r.model, year: r.year,
    powertrain: r.powertrain, fuel: r.fuel, co2: Number(r.co2), mass: Number(r.mass), sales: Number(r.sales),
    vclass: r.vclass, ecoBenefit: r.eco_benefit ?? undefined, cnf: r.cnf ?? undefined, zev: r.zev ?? undefined, engineCC: r.engine_cc ?? undefined,
  }
}

// ── public API ──────────────────────────────────────────────────────────────
export async function getCurrent(market: CountryId): Promise<CurrentData | null> {
  if (sql) {
    const src = await sql`select * from data_sources where market = ${market}`
    const meta = src[0]
    if (!meta?.current_version) return null
    const rows = await sql`select * from vehicles where market = ${market} and dataset_version = ${meta.current_version} order by parent, model, year`
    if (!rows.length) return null
    return {
      meta: { source: meta.name, url: meta.url, lastRefreshed: meta.last_refreshed, datasetVersion: String(meta.current_version), live: true },
      vehicles: rows.map(mapRow),
    }
  }
  if (onVercel) return null // read-only FS in serverless → use bundled extract
  const db = ensureSeed()
  const d = db[market]
  if (!d) return null
  return { meta: { source: d.name, url: d.url, lastRefreshed: d.refreshed, datasetVersion: d.version, live: true }, vehicles: d.rows }
}

export async function putDataset(market: CountryId, name: string, url: string, rows: Vehicle[]): Promise<string> {
  const version = Date.now()
  if (sql) {
    const payload = rows.map((r) => ({
      parent: r.parent, pool: r.pool ?? null, brand: r.brand ?? null, make: r.make ?? null, model: r.model, year: r.year,
      powertrain: r.powertrain ?? null, fuel: r.fuel ?? null, co2: r.co2 ?? null, mass: r.mass ?? null, sales: r.sales ?? 0,
      vclass: r.vclass ?? null, eco_benefit: r.ecoBenefit ?? null, cnf: r.cnf ?? null, zev: r.zev ?? null, engine_cc: r.engineCC ?? null,
    }))
    await sql`insert into refresh_runs (market, dataset_version, status) values (${market}, ${version}, 'running')`
    await sql`
      insert into vehicles (market, dataset_version, parent, pool, brand, make, model, year, powertrain, fuel, co2, mass, sales, vclass, eco_benefit, cnf, zev, engine_cc)
      select ${market}, ${version}, x.parent, x.pool, x.brand, x.make, x.model, x.year, x.powertrain, x.fuel, x.co2, x.mass, x.sales, x.vclass, x.eco_benefit, x.cnf, x.zev, x.engine_cc
      from jsonb_to_recordset(${JSON.stringify(payload)}::jsonb) as x(
        parent text, pool text, brand text, make text, model text, year int, powertrain text, fuel text,
        co2 double precision, mass double precision, sales int, vclass text,
        eco_benefit double precision, cnf double precision, zev int, engine_cc double precision)`
    await sql`
      insert into data_sources (market, name, url, current_version, last_refreshed, status)
      values (${market}, ${name}, ${url}, ${version}, now(), 'ok')
      on conflict (market) do update set name = excluded.name, url = excluded.url,
        current_version = excluded.current_version, last_refreshed = excluded.last_refreshed, status = 'ok'`
    await sql`update refresh_runs set finished_at = now(), rows_in = ${rows.length}, rows_out = ${rows.length}, status = 'ok' where market = ${market} and dataset_version = ${version}`
    await sql`delete from vehicles where market = ${market} and dataset_version < (
      select min(v) from (select distinct dataset_version v from vehicles where market = ${market} order by v desc limit 3) t)`
    return String(version)
  }
  const db = readLocal()
  db[market] = { version: String(version), name, url, refreshed: new Date().toISOString(), rows }
  writeLocal(db)
  return String(version)
}
