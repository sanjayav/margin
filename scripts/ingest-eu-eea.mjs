// EU ingestion from the OFFICIAL open source — European Environment Agency.
//
//   node scripts/ingest-eu-eea.mjs                 # cars + vans → bundle + local store
//   node scripts/ingest-eu-eea.mjs --cars-only
//   DATABASE_URL=... node scripts/ingest-eu-eea.mjs   # also writes Neon
//
// Source of record: EEA Datahub "Monitoring of CO2 emissions from passenger cars
// / vans — Regulation (EU) 2019/631", queried live through the EEA DiscoData SQL
// endpoint. Each source row is ONE registered vehicle (verified: COUNT(*) ==
// SUM(r)), so COUNT(*) is real registrations and every average below is
// registration-weighted — exactly the basis Regulation (EU) 2019/631 uses.
//
// Methodology notes that make the numbers reproduce the EEA's own publication:
//   • `Mh NOT LIKE 'AA-%'` drops the individual/small-series approval buckets.
//     With that filter the car fleet average is 96.72 g/km on 10,799,313
//     registrations — the EEA press release of 25 Jun 2026 says 96.7 g/km and
//     10.8 million. Without it you get 96.88 and the figure no longer ties out.
//   • Eco-innovation (`Erwltp`) is NULL on vehicles that claim none, so it MUST
//     be COALESCEd to 0 before averaging. AVG(Erwltp) averages only claimants
//     and reports 1.50 g/km where the true per-vehicle credit is 0.78 g/km —
//     which would understate fleet CO2 and therefore understate the fine.
//   • Powertrain comes from `Fm` (fuel mode), not `Ft`. Fm: E electric,
//     P off-vehicle-charging hybrid (= PHEV), H non-off-vehicle-charging hybrid
//     (= HEV), M mono-fuel, B bi-fuel, F flex-fuel. Reading `Ft` alone puts 3.3M
//     petrol NOVC hybrids in with plain ICE and cannot see a plug-in at all.
//   • Mass is test mass `Mt` (cars) / `Mt (kg)` (vans) — the basis the post-2024
//     target formula uses (TM0 = 1609.6 kg for cars). `Mt` is NULL on ~2.6% of
//     car rows, so it falls back to kerb mass `M (kg)`.
//   • `parent` is the compliance manufacturer `Mh`; `pool` is the declared
//     Article 6 pool `Mp` when present, else standalone. These are different
//     things in the source: Mh "HYUNDAI TURKIYE" sits in pool "HYUNDAI MOTOR
//     EUROPE", and the 2025 pools really are e.g. TESLA (Tesla + Toyota + Ford +
//     Mazda + Suzuki + Honda + Leapmotor + Alfa Romeo + Subaru) and
//     "MERCEDES-BENZ, VOLVO CARS, POLESTAR AND SMART".
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = join(here, '..')
const JSON_PATH = join(ROOT, 'src', 'data', 'fleet_data.json')
const TS_PATH = join(ROOT, 'src', 'data', 'fleet_data.ts')
const DATA_DIR = join(ROOT, '.data')
const DATA_FILE = join(DATA_DIR, 'underline.json')

const DISCO = 'https://discodata.eea.europa.eu/sql'
const BASE_YEAR = 2025
const HORIZON = [2025, 2026, 2027, 2028, 2029, 2030]
const PUBLISHED = '2026-06-25' // EEA publication date of the 2025 provisional release

// Per-class caps. Every manufacturer keeps its EXACT registrations, CO2, mass and
// eco-credit regardless of these — the tail beyond the cap is folded into
// "Other models" rows per powertrain, back-solved from the exact sums.
const CARS = {
  key: 'cars',
  table: '[CO2Emission].[latest].[co2cars_2025Pv31]',
  vclass: 'Passenger car',
  mass: 'Mt',
  pool: 'Mp',
  topModels: 6,
  // EEA press release, 25 Jun 2026 — the numbers this pull must reproduce.
  official: { regs: 10_799_313, co2: 96.7, bev: 18.9, phev: 9.7, label: '96.7 g/km · 10.8M · BEV 18.9% · PHEV 9.7%' },
}
const VANS = {
  key: 'vans',
  table: '[CO2Emission].[latest].[co2vans_2025Pv27]',
  vclass: 'Light commercial vehicle',
  mass: '[Mt (kg)]',
  pool: 'MP',
  topModels: 4,
  // NOTE (vans): unlike cars, the van pull does NOT land exactly on the published
  // headline. This filter gives 172.53 g/km where the EEA says 172.1, BEV 10.52%
  // vs 10.3%, PHEV 1.64% vs 1.7%. Every plausible filter combination was swept
  // (±AA-*, Ct = N1 / N1G / M1 / N2, S = COMPLETE / COMPLETED, ±NO/IS) and none
  // reproduces all three published figures at once — the closest single match is
  // S='COMPLETE' which nails BEV 10.3% but gives 171.77 g/km. The likely cause is
  // the multi-stage attribution vans need (a COMPLETED van's emissions are booked
  // to the base-vehicle maker under Reg 2019/631 Annex III), which the flat file
  // does not expose: CO2, CO2mon, Mmon, MRObaseI and MRObaseC are all NULL in
  // v27. So the van fleet here is the honest registration-weighted read of the
  // official file, accurate to ~0.25% of the published average, and the class is
  // marked 'partial' in the rule pack for that reason. Cars are exact.
  official: { regs: 1_168_249, co2: 172.1, bev: 10.3, phev: 1.7, label: '172.1 g/km · 1.2M · BEV 10.3% · PHEV 1.7%' },
}
const SMALL_VOLUME = 1000 // Reg 2019/631 derogation floor — below this, one row per maker

const SOURCE = {
  name: 'European Environment Agency — CO₂ monitoring of new cars & vans, Reg (EU) 2019/631 (2025 provisional)',
  url: 'https://www.eea.europa.eu/en/datahub/datahubitem-view/fa8b1229-3db6-495d-b18e-9c9b3267c02b',
}

async function disco(query, page, hits) {
  const u = `${DISCO}?query=${encodeURIComponent(query)}&p=${page}&nrOfHits=${hits}`
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(u, { signal: AbortSignal.timeout(300_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const j = await res.json()
      if (j.errors) throw new Error(JSON.stringify(j.errors))
      return j.results ?? []
    } catch (e) {
      if (attempt >= 3) throw e
      console.warn(`  retry ${attempt} (${e.message})`)
      await new Promise((r) => setTimeout(r, 3000 * attempt))
    }
  }
}

/** The manufacturer roster: one row per compliance entity (Mh) with its declared
 *  Article 6 pool and its display make.
 *
 *  `Mk` (make) is dirty free-text in the source — SKODA alone carries "SKODA"
 *  (724,218 regs) and "SKODA AUTO AS" (3), and Mercedes-Benz carries typos like
 *  "MERCSDES BENZ" and even a stray "BMW". So the make is the MODAL value by
 *  registrations, never MAX(), then trimmed at the first comma/slash so
 *  "VOLKSWAGEN, VW" reads "Volkswagen". Same for the pool, defensively. */
async function roster(spec) {
  const q =
    `SELECT Mh, Mk, ${spec.pool} AS pool, COUNT(*) AS regs ` +
    `FROM ${spec.table} ` +
    `WHERE [Ewltp (g/km)] IS NOT NULL AND Mh NOT LIKE 'AA-%' AND Cn IS NOT NULL ` +
    `GROUP BY Mh, Mk, ${spec.pool} ORDER BY regs DESC`
  const raw = []
  for (let p = 1; ; p++) {
    const batch = await disco(q, p, 500)
    raw.push(...batch)
    if (batch.length < 500) break
  }
  const byMh = new Map()
  for (const r of raw) {
    const mh = String(r.Mh || '').trim()
    if (!mh) continue
    let e = byMh.get(mh)
    if (!e) byMh.set(mh, (e = { Mh: mh, regs: 0, mkVotes: new Map(), poolVotes: new Map() }))
    const n = Number(r.regs) || 0
    e.regs += n
    const mk = String(r.Mk || '').trim()
    if (mk) e.mkVotes.set(mk, (e.mkVotes.get(mk) ?? 0) + n)
    const pool = String(r.pool || '').trim()
    if (pool) e.poolVotes.set(pool, (e.poolVotes.get(pool) ?? 0) + n)
  }
  const modal = (votes) => [...votes.entries()].sort((a, z) => z[1] - a[1])[0]?.[0] ?? ''
  return [...byMh.values()]
    .map((e) => ({ Mh: e.Mh, regs: e.regs, mk: modal(e.mkVotes), pool: modal(e.poolVotes) }))
    .sort((a, z) => z.regs - a.regs)
}

/** One manufacturer's exhaustive model × fuel × mode grid. Sums, not averages, so
 *  the residual roll-up below stays exact. Scoping each query to a single Mh keeps
 *  it inside the DiscoData query timeout — the equivalent whole-table GROUP BY
 *  does not complete. */
async function makerGrid(spec, mh) {
  const safe = String(mh).replace(/'/g, "''")
  const q =
    `SELECT Cn, Ft, Fm, COUNT(*) AS regs, ` +
    `SUM(CAST([Ewltp (g/km)] AS float)) AS co2sum, ` +
    `SUM(COALESCE(CAST(${spec.mass} AS float), CAST([M (kg)] AS float))) AS masssum, ` +
    `SUM(COALESCE(CAST([M (kg)] AS float), 0)) AS kerbsum, ` +
    `SUM(COALESCE(CAST([Erwltp (g/km)] AS float), 0)) AS ecosum, ` +
    `SUM(COALESCE(CAST([Ec (cm3)] AS float), 0)) AS ccsum, ` +
    `SUM(CASE WHEN [Ec (cm3)] IS NOT NULL THEN 1 ELSE 0 END) AS ccn, ` +
    `SUM(COALESCE(CAST([Z (Wh/km)] AS float), 0)) AS whsum, ` +
    `SUM(CASE WHEN [Z (Wh/km)] IS NOT NULL THEN 1 ELSE 0 END) AS whn ` +
    `FROM ${spec.table} ` +
    `WHERE Mh = '${safe}' AND [Ewltp (g/km)] IS NOT NULL AND Cn IS NOT NULL ` +
    `GROUP BY Cn, Ft, Fm ORDER BY regs DESC`
  const out = []
  for (let p = 1; ; p++) {
    const batch = await disco(q, p, 500)
    out.push(...batch)
    if (batch.length < 500) break
  }
  return out
}

/** Full grid, assembled maker by maker with bounded concurrency. */
async function grid(spec) {
  const makers = await roster(spec)
  const total = makers.reduce((a, m) => a + Number(m.regs), 0)
  console.log(`  ${spec.key}: ${makers.length} manufacturers · ${total.toLocaleString()} registrations`)
  const groups = []
  let done = 0
  const CONC = 5
  const queue = [...makers]
  await Promise.all(
    Array.from({ length: CONC }, async () => {
      for (;;) {
        const m = queue.shift()
        if (!m) return
        const rows = await makerGrid(spec, m.Mh)
        for (const r of rows) groups.push({ ...r, Mh: m.Mh, pool: m.pool, mk: m.mk })
        done++
        process.stdout.write(`\r  ${spec.key}: ${done}/${makers.length} makers · ${groups.length} groups…   `)
      }
    }),
  )
  process.stdout.write('\n')
  // Cross-check: the per-maker pulls must add up to the roster total.
  const got = groups.reduce((a, g) => a + Number(g.regs), 0)
  if (got !== total) console.warn(`  ⚠ ${spec.key}: grid ${got.toLocaleString()} != roster ${total.toLocaleString()}`)
  return groups
}

// ── classification ───────────────────────────────────────────────────────────
// Fm is authoritative for the powertrain; Ft only names the fuel.
function classify(ft, fm) {
  const f = String(ft || '').toLowerCase()
  const m = String(fm || '').toUpperCase()
  if (f === 'hydrogen') return 'FCEV'
  if (f === 'electric' || m === 'E') return 'BEV'
  // A 'P'/'H' code is only believable when the fuel string actually names an
  // electric leg — the source carries a handful of mislabelled pure-ICE rows.
  if (m === 'P' && f.includes('electric')) return 'PHEV'
  if (m === 'H') return 'HEV'
  return 'ICE'
}

const FUEL_LABEL = {
  petrol: 'Petrol', diesel: 'Diesel', electric: 'Electric', hydrogen: 'Hydrogen',
  'petrol/electric': 'Petrol/Electric', 'diesel/electric': 'Diesel/Electric',
  lpg: 'LPG', ng: 'NG', 'ng-biomethane': 'NG-Biomethane', e85: 'E85', unknown: 'Unknown',
}
const fuelLabel = (ft) => FUEL_LABEL[String(ft || '').toLowerCase()] ?? titleCase(ft)

const KEEP_UPPER = new Set(['AG', 'BMW', 'BV', 'NV', 'SA', 'SAS', 'SPA', 'AB', 'AS', 'KG', 'SAIC', 'BYD', 'MG', 'DR', 'KIA', 'JLR', 'CV', 'UK', 'EU', 'USA', 'MAN', 'DS', 'SEAT', 'GT', 'RS', 'XL', 'SUV', 'LLC', 'INC', 'AMG', 'GMC', 'SPA', 'NIO', 'MAZ'])
const UPPER_FIX = { GMBH: 'GmbH', LTD: 'Ltd', SRL: 'Srl', PLC: 'Plc', CO: 'Co', OY: 'Oy', KFT: 'Kft' }
// Particles stay lower-case unless they lead. Without this the 2-letter
// all-caps rule turns "OUT OF SCOPE" into "Out OF Scope".
const SMALL_WORDS = new Set(['OF', 'AND', 'THE', 'DE', 'DA', 'VAN', 'DER', 'DEN', 'EN', 'ET', 'A'])
function titleCase(s) {
  return String(s || '')
    .trim()
    .split(/\s+/)
    .map((w, wi) =>
      w.split('-').map((p) => {
        const u = p.toUpperCase()
        if (UPPER_FIX[u]) return UPPER_FIX[u]
        if (KEEP_UPPER.has(u)) return u
        if (wi > 0 && SMALL_WORDS.has(u)) return u.toLowerCase()
        if (p.length <= 2 && /^[A-Z0-9]+$/.test(p)) return u
        return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()
      }).join('-'),
    )
    .join(' ')
}

/** First name in a dirty free-text make: "VOLKSWAGEN, VW" → "Volkswagen". */
const cleanMake = (s) => titleCase(String(s || '').split(/[,/]|\s+\.\s+/)[0].replace(/\.$/, '').trim())

const num = (x) => (x == null ? 0 : Number(x))
const r1 = (x) => Math.round(x * 10) / 10
const r2 = (x) => Math.round(x * 100) / 100

/** Build engine rows for one vehicle class, preserving each maker's exact totals. */
function buildRows(spec, groups) {
  // manufacturer → { pool, mk, groups[] }
  const byMaker = new Map()
  for (const g of groups) {
    const mh = String(g.Mh || '').trim()
    if (!mh) continue
    let m = byMaker.get(mh)
    if (!m) byMaker.set(mh, (m = { mh, pool: g.pool, mk: g.mk, groups: [] }))
    if (!m.pool && g.pool) m.pool = g.pool
    m.groups.push(g)
  }

  const rows = []
  const audit = { regs: 0, co2sum: 0, masssum: 0, ecosum: 0, bev: 0, phev: 0, hev: 0, zlev: 0, makers: 0, pools: new Set() }

  for (const m of byMaker.values()) {
    const parent = titleCase(m.mh)
    const poolName = String(m.pool || '').trim()
    // A maker with no declared Article 6 pool stands alone UNDER ITS OWN NAME —
    // the same convention the engine's parentPoolMap uses. Inventing a distinct
    // "X (standalone)" pool label would make 85 of the EU's 92 pools look like
    // real pools, cost a redundant drill click each, and read "Skoda
    // (standalone) › Skoda" in the breadcrumb.
    const pool = poolName ? titleCase(poolName) : parent
    const brand = cleanMake(m.mk) || parent
    const makerRegs = m.groups.reduce((a, g) => a + num(g.regs), 0)

    audit.makers++
    audit.pools.add(pool)

    // Bucket the maker's groups by powertrain so a residual can be emitted per
    // powertrain — folding a maker's tail into one bucket would smear its BEV
    // share, and the ZLEV relaxation depends on that share.
    const byPT = new Map()
    for (const g of m.groups) {
      const pt = classify(g.Ft, g.Fm)
      let b = byPT.get(pt)
      if (!b) byPT.set(pt, (b = { pt, regs: 0, co2sum: 0, masssum: 0, kerbsum: 0, ecosum: 0, whsum: 0, whn: 0, ccsum: 0, ccn: 0, items: [], fuel: g.Ft }))
      b.regs += num(g.regs); b.co2sum += num(g.co2sum); b.masssum += num(g.masssum)
      b.kerbsum += num(g.kerbsum); b.ecosum += num(g.ecosum)
      b.whsum += num(g.whsum); b.whn += num(g.whn); b.ccsum += num(g.ccsum); b.ccn += num(g.ccn)
      b.items.push({ ...g, pt })
      audit.regs += num(g.regs); audit.co2sum += num(g.co2sum)
      audit.masssum += num(g.masssum); audit.ecosum += num(g.ecosum)
      if (pt === 'BEV' || pt === 'FCEV') audit.bev += num(g.regs)
      if (pt === 'PHEV') audit.phev += num(g.regs)
      if (pt === 'HEV') audit.hev += num(g.regs)
      if (num(g.regs) && num(g.co2sum) / num(g.regs) <= 50) audit.zlev += num(g.regs)
    }

    // Below the derogation floor a maker collapses to one row per powertrain.
    const cap = makerRegs < SMALL_VOLUME ? 0 : spec.topModels

    const mk = (extra) => ({
      parent, pool, brand, make: brand, year: BASE_YEAR, vclass: spec.vclass, market: 'EU',
      source: `EEA ${BASE_YEAR} provisional`, ...extra,
    })

    for (const b of byPT.values()) {
      // Merge duplicate model names within a powertrain (same Cn, different Ft/Fm)
      const byModel = new Map()
      for (const it of b.items) {
        const name = titleCase(it.Cn)
        let e = byModel.get(name)
        if (!e) byModel.set(name, (e = { name, regs: 0, co2sum: 0, masssum: 0, kerbsum: 0, ecosum: 0, whsum: 0, whn: 0, ccsum: 0, ccn: 0, ft: it.Ft }))
        e.regs += num(it.regs); e.co2sum += num(it.co2sum); e.masssum += num(it.masssum)
        e.kerbsum += num(it.kerbsum); e.ecosum += num(it.ecosum)
        e.whsum += num(it.whsum); e.whn += num(it.whn); e.ccsum += num(it.ccsum); e.ccn += num(it.ccn)
      }
      const models = [...byModel.values()].sort((a, z) => z.regs - a.regs)
      const kept = models.slice(0, cap).filter((x) => x.regs > 0)

      const emit = (name, e, variant) => {
        const co2 = e.co2sum / e.regs
        const mass = e.masssum / e.regs
        const kerb = e.kerbsum / e.regs
        const wh = e.whn ? e.whsum / e.whn : 0
        const cc = e.ccn ? e.ccsum / e.ccn : 0
        rows.push(mk({
          model: name,
          powertrain: b.pt,
          fuel: fuelLabel(e.ft ?? b.fuel),
          co2: r1(co2),
          mass: Math.round(mass),
          testMass: Math.round(mass),
          kerbMass: Math.round(kerb),
          sales: Math.round(e.regs),
          ecoBenefit: r2(e.ecosum / e.regs),
          ...(wh ? { energy: Math.round(wh) } : {}),
          ...(cc ? { engineCC: Math.round(cc) } : {}),
          variant,
        }))
      }

      for (const e of kept) emit(e.name, e, `${b.pt} · ${fuelLabel(e.ft)}`)

      // Exact residual: whatever the cap left behind, back-solved from the sums.
      const res = {
        regs: b.regs - kept.reduce((a, x) => a + x.regs, 0),
        co2sum: b.co2sum - kept.reduce((a, x) => a + x.co2sum, 0),
        masssum: b.masssum - kept.reduce((a, x) => a + x.masssum, 0),
        kerbsum: b.kerbsum - kept.reduce((a, x) => a + x.kerbsum, 0),
        ecosum: b.ecosum - kept.reduce((a, x) => a + x.ecosum, 0),
        whsum: b.whsum - kept.reduce((a, x) => a + x.whsum, 0),
        whn: b.whn - kept.reduce((a, x) => a + x.whn, 0),
        ccsum: b.ccsum - kept.reduce((a, x) => a + x.ccsum, 0),
        ccn: b.ccn - kept.reduce((a, x) => a + x.ccn, 0),
        ft: b.fuel,
      }
      if (res.regs >= 1) {
        const label = cap === 0 ? `All ${b.pt} models` : 'Other models'
        emit(label, res, `${b.pt} · ${models.length - kept.length} further model${models.length - kept.length === 1 ? '' : 's'}`)
      }
    }
  }
  return { rows, audit }
}

/** Two independent checks, deliberately kept apart:
 *
 *   PIPELINE  — the emitted rows must reproduce the source query's own totals
 *               to the last unit. This is the capping/residual maths and it has
 *               to be exact; any drift is a bug in this script.
 *   OFFICIAL  — the source totals must reproduce the figures the EEA published
 *               in its press release of 25 Jun 2026. The EEA TRUNCATES to one
 *               decimal (96.725 → "96.7", 18.979 → "18.9", 9.772 → "9.7"), so
 *               the comparison truncates too rather than rounding.
 */
function verify(spec, rows, audit) {
  const src = {
    regs: audit.regs,
    co2: audit.co2sum / audit.regs,
    mass: audit.masssum / audit.regs,
    eco: audit.ecosum / audit.regs,
    bev: (audit.bev / audit.regs) * 100,
    phev: (audit.phev / audit.regs) * 100,
  }
  const base = rows.filter((r) => r.year === BASE_YEAR)
  const n = base.reduce((a, r) => a + r.sales, 0)
  const share = (pred) => (base.filter(pred).reduce((a, r) => a + r.sales, 0) / n) * 100
  const built = {
    regs: n,
    co2: base.reduce((a, r) => a + r.co2 * r.sales, 0) / n,
    mass: base.reduce((a, r) => a + r.mass * r.sales, 0) / n,
    eco: base.reduce((a, r) => a + (r.ecoBenefit ?? 0) * r.sales, 0) / n,
    bev: share((r) => r.powertrain === 'BEV' || r.powertrain === 'FCEV'),
    phev: share((r) => r.powertrain === 'PHEV'),
  }
  const trunc1 = (x) => Math.trunc(x * 10) / 10
  const o = spec.official
  let pipelineOk = true
  let officialOk = true

  console.log(`\n  ── ${spec.key} · pipeline integrity (source query → emitted rows) ──`)
  for (const [name, key, unit, tol] of [
    ['registrations', 'regs', '', 0.5], ['avg CO₂', 'co2', 'g/km', 0.02],
    ['avg test mass', 'mass', 'kg', 0.1], ['avg eco-innov', 'eco', 'g/km', 0.01],
    ['BEV+FCEV share', 'bev', '%', 0.01], ['PHEV share', 'phev', '%', 0.01],
  ]) {
    const d = Math.abs(built[key] - src[key])
    const ok = d <= tol
    if (!ok) pipelineOk = false
    console.log(`  ${ok ? '✓' : '✗'} ${name.padEnd(15)} source ${src[key].toFixed(3).padStart(13)} → rows ${built[key].toFixed(3).padStart(13)} ${unit.padEnd(5)} Δ ${d.toFixed(4)}`)
  }

  console.log(`  ── ${spec.key} · reconciliation vs EEA published (${PUBLISHED}) ──`)
  for (const [name, key, unit] of [['registrations', 'regs', ''], ['avg CO₂', 'co2', 'g/km'], ['BEV share', 'bev', '%'], ['PHEV share', 'phev', '%']]) {
    const pub = o[key === 'bev' ? 'bev' : key]
    if (pub == null) continue
    const mine = key === 'regs' ? built.regs : trunc1(built[key])
    const ok = key === 'regs' ? Math.abs(mine - pub) <= 0.5 : mine === pub
    if (!ok) officialOk = false
    console.log(`  ${ok ? '✓' : '~'} ${name.padEnd(15)} EEA ${String(pub).padStart(12)} | computed ${String(mine).padStart(12)} ${unit}`)
  }
  console.log(`  makers ${audit.makers} · pools ${audit.pools.size} · rows(${BASE_YEAR}) ${base.length}`)
  if (!officialOk) console.log(`  note: ${spec.key} differ from the published headline — see NOTE in this file.`)
  return { pipelineOk, officialOk }
}

// ── writers ──────────────────────────────────────────────────────────────────
function writeBundle(rows) {
  const db = JSON.parse(readFileSync(JSON_PATH, 'utf8'))
  db.EU = rows
  writeFileSync(JSON_PATH, JSON.stringify(db, null, 0))
  const header =
    '// AUTO-GENERATED from fleet_data.json — do not edit by hand.\n' +
    '// Bundled as a TS module so serverless functions (Vercel Node ESM runtime)\n' +
    '// load the data without JSON import-attribute issues.\n' +
    '/* eslint-disable */\n'
  writeFileSync(TS_PATH, `${header}const data: Record<string, any[]> = ${JSON.stringify(db)}\nexport default data\n`)
  console.log(`Bundle · ${rows.length} EU rows → src/data/fleet_data.json + .ts`)
}

function writeLocal(rows) {
  let db = {}
  try { db = JSON.parse(readFileSync(DATA_FILE, 'utf8')) } catch { db = {} }
  db.EU = { version: String(Date.now()), name: SOURCE.name, url: SOURCE.url, refreshed: new Date().toISOString(), rows }
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
  writeFileSync(DATA_FILE, JSON.stringify(db))
  console.log(`Local store · ${rows.length} EU rows → .data/underline.json`)
}

async function writeNeon(rows) {
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL)
  const version = Date.now()
  const payload = rows.map((r) => ({
    parent: r.parent, pool: r.pool ?? null, brand: r.brand ?? null, make: r.make ?? null, model: r.model,
    year: r.year, powertrain: r.powertrain ?? null, fuel: r.fuel ?? null, co2: r.co2 ?? null, mass: r.mass ?? null,
    sales: r.sales ?? 0, vclass: r.vclass ?? null, eco_benefit: r.ecoBenefit ?? null, cnf: null, zev: null,
    engine_cc: r.engineCC ?? null, variant: r.variant ?? null, variant_id: null, battery: null, range_km: null,
    energy: r.energy ?? null, kerb_mass: r.kerbMass ?? null, test_mass: r.testMass ?? null, footprint: null,
    gearbox: null, driveline: null, market_label: r.market ?? null,
  }))
  await sql`insert into refresh_runs (market, dataset_version, status) values ('EU', ${version}, 'running')`
  for (let i = 0; i < payload.length; i += 1000) {
    const chunk = payload.slice(i, i + 1000)
    await sql`
      insert into vehicles (market, dataset_version, parent, pool, brand, make, model, year, powertrain, fuel, co2, mass, sales, vclass, eco_benefit, cnf, zev, engine_cc,
        variant, variant_id, battery, range_km, energy, kerb_mass, test_mass, footprint, gearbox, driveline, market_label)
      select 'EU', ${version}, x.parent, x.pool, x.brand, x.make, x.model, x.year, x.powertrain, x.fuel, x.co2, x.mass, x.sales, x.vclass, x.eco_benefit, x.cnf, x.zev, x.engine_cc,
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
    values ('EU', ${SOURCE.name}, ${SOURCE.url}, ${version}, now(), 'ok')
    on conflict (market) do update set name = excluded.name, url = excluded.url,
      current_version = excluded.current_version, last_refreshed = excluded.last_refreshed, status = 'ok'`
  await sql`update refresh_runs set finished_at = now(), rows_in = ${rows.length}, rows_out = ${rows.length}, status = 'ok' where market = 'EU' and dataset_version = ${version}`
  console.log(`Neon · ${rows.length} EU rows as version ${version}`)
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  const carsOnly = process.argv.includes('--cars-only')
  const specs = carsOnly ? [CARS] : [CARS, VANS]

  let base = []
  let allOk = true
  for (const spec of specs) {
    console.log(`\nEEA · ${spec.table}`)
    const groups = await grid(spec)
    const { rows, audit } = buildRows(spec, groups)
    const v = verify(spec, rows, audit)
    if (!v.pipelineOk) allOk = false
    base = base.concat(rows)
  }

  // The 2025 registrations are measured. Carry them across the compliance horizon
  // so every year-aware screen has a fleet to work on; the held years are labelled
  // as such, since they are a baseline projection and not observed data.
  const rows = HORIZON.flatMap((year) =>
    base.map((r) => (year === BASE_YEAR ? r : { ...r, year, source: `EEA ${BASE_YEAR} provisional (baseline held)` })),
  )

  console.log(`\n${base.length} base ${BASE_YEAR} rows → ${rows.length} rows across ${HORIZON[0]}–${HORIZON.at(-1)}`)
  if (!allOk) { console.error('✗ pipeline integrity failed — refusing to write'); process.exit(1) }

  writeBundle(rows)
  writeLocal(rows)
  if (process.env.DATABASE_URL) await writeNeon(rows)
  console.log(`\nDone. Source published ${PUBLISHED}. Set DATA_REFRESHED.EU = '${PUBLISHED}' in src/data/fleet.ts.`)
}

main().catch((e) => { console.error('Ingestion failed:', e.message); process.exit(1) })
