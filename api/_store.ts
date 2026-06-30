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
  const num = (x: any) => (x == null ? undefined : Number(x))
  return {
    parent: r.parent, pool: r.pool, brand: r.brand, make: r.make, model: r.model, year: r.year,
    powertrain: r.powertrain, fuel: r.fuel, co2: Number(r.co2), mass: Number(r.mass), sales: Number(r.sales),
    vclass: r.vclass, ecoBenefit: r.eco_benefit ?? undefined, cnf: r.cnf ?? undefined, zev: r.zev ?? undefined, engineCC: r.engine_cc ?? undefined,
    // richer per-variant spec (round-trips the bundled EU extract)
    variant: r.variant ?? undefined, variantId: r.variant_id ?? undefined,
    battery: num(r.battery), range: num(r.range_km), energy: num(r.energy),
    kerbMass: num(r.kerb_mass), testMass: num(r.test_mass), footprint: num(r.footprint),
    gearbox: r.gearbox ?? undefined, driveline: r.driveline ?? undefined, market: r.market_label ?? undefined,
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
      variant: r.variant ?? null, variant_id: r.variantId ?? null, battery: r.battery ?? null, range_km: r.range ?? null,
      energy: r.energy ?? null, kerb_mass: r.kerbMass ?? null, test_mass: r.testMass ?? null, footprint: r.footprint ?? null,
      gearbox: r.gearbox ?? null, driveline: r.driveline ?? null, market: r.market ?? null,
    }))
    await sql`insert into refresh_runs (market, dataset_version, status) values (${market}, ${version}, 'running')`
    await sql`
      insert into vehicles (market, dataset_version, parent, pool, brand, make, model, year, powertrain, fuel, co2, mass, sales, vclass, eco_benefit, cnf, zev, engine_cc,
        variant, variant_id, battery, range_km, energy, kerb_mass, test_mass, footprint, gearbox, driveline, market_label)
      select ${market}, ${version}, x.parent, x.pool, x.brand, x.make, x.model, x.year, x.powertrain, x.fuel, x.co2, x.mass, x.sales, x.vclass, x.eco_benefit, x.cnf, x.zev, x.engine_cc,
        x.variant, x.variant_id, x.battery, x.range_km, x.energy, x.kerb_mass, x.test_mass, x.footprint, x.gearbox, x.driveline, x.market
      from jsonb_to_recordset(${JSON.stringify(payload)}::jsonb) as x(
        parent text, pool text, brand text, make text, model text, year int, powertrain text, fuel text,
        co2 double precision, mass double precision, sales int, vclass text,
        eco_benefit double precision, cnf double precision, zev int, engine_cc double precision,
        variant text, variant_id text, battery double precision, range_km double precision, energy double precision,
        kerb_mass double precision, test_mass double precision, footprint double precision, gearbox text, driveline text, market text)`
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

// ── Scenario / assumptions store ──────────────────────────────────────────────
// Durable home for the analyst's saved scenarios and the active per-country
// assumption set, so nothing is lost on reload or across devices. Single
// workspace for now (one demo login); keyed for an easy multi-tenant upgrade.
export interface ScenarioBlob { scenarios?: unknown[]; assumptions?: Record<string, unknown> }
const WORKSPACE = 'default'
const SCEN_FILE = join(DATA_DIR, 'scenarios.json')

function readScenLocal(): ScenarioBlob {
  try { return JSON.parse(readFileSync(SCEN_FILE, 'utf8')) } catch { return {} }
}
function writeScenLocal(blob: ScenarioBlob) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
  writeFileSync(SCEN_FILE, JSON.stringify(blob))
}

export async function getScenarioBlob(): Promise<ScenarioBlob> {
  if (sql) {
    try {
      const rows = await sql`select scenarios, assumptions from scenario_store where workspace = ${WORKSPACE}`
      const r = rows[0]
      if (!r) return {}
      return { scenarios: r.scenarios ?? [], assumptions: r.assumptions ?? {} }
    } catch { return {} }
  }
  if (onVercel) return {} // read-only FS without Neon → client localStorage is source of truth
  return readScenLocal()
}

/** Merge-patch the workspace blob (only the provided keys are replaced). */
export async function putScenarioBlob(patch: ScenarioBlob): Promise<ScenarioBlob> {
  const cur = await getScenarioBlob()
  const next: ScenarioBlob = {
    scenarios: patch.scenarios ?? cur.scenarios ?? [],
    assumptions: patch.assumptions ?? cur.assumptions ?? {},
  }
  if (sql) {
    await sql`
      insert into scenario_store (workspace, scenarios, assumptions, updated_at)
      values (${WORKSPACE}, ${JSON.stringify(next.scenarios)}::jsonb, ${JSON.stringify(next.assumptions)}::jsonb, now())
      on conflict (workspace) do update set scenarios = excluded.scenarios,
        assumptions = excluded.assumptions, updated_at = now()`
    return next
  }
  if (onVercel) return next // can't persist on read-only FS; client keeps localStorage
  writeScenLocal(next)
  return next
}
