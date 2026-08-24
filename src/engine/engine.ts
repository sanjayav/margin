// ───────────────────────────────────────────────────────────────────────────
// AiRE · the shared calculation engine
//
// ONE operation — "group the cars and compute the weighted average" — runs at
// every level of detail: whole market, one maker, one model, one powertrain.
// Built once here, reused everywhere. All country differences come in via the
// RulePack argument. Nothing about EU/India/etc. is hard-coded below.
// ───────────────────────────────────────────────────────────────────────────

import type { Aggregate, FineMath, PowertrainOption, RulePack, Scenario, Vehicle, LimitContext } from './types.js'

export const fmtInt = (n: number) =>
  Math.round(n).toLocaleString('en-US')

export const fmtMoney = (n: number, currency: string) => {
  const abs = Math.abs(n)
  // Indian numbering: rupee amounts read in crore (1e7) and lakh (1e5), never B/M.
  if (currency === '₹') {
    if (abs >= 1e7) return `${currency}${(n / 1e7).toFixed(abs >= 1e9 ? 0 : abs >= 1e8 ? 1 : 2)} Cr`
    if (abs >= 1e5) return `${currency}${(n / 1e5).toFixed(1)} L`
    if (abs >= 1e3) return `${currency}${(n / 1e3).toFixed(1)}k`
    return `${currency}${Math.round(n)}`
  }
  if (abs >= 1e9) return `${currency}${(n / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${currency}${(n / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `${currency}${(n / 1e3).toFixed(1)}k`
  return `${currency}${Math.round(n)}`
}

export const fmtNum = (n: number, d = 1) =>
  n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })

/** Stable identity of a VARIANT within a model — the spec descriptor when the
 *  source has one (e.g. "Auto · FWD · 61 kWh", "1.4L petrol"), else the
 *  powertrain. Used as BOTH the drill-node label and the override-key suffix so
 *  the two never drift apart. */
export const variantKey = (v: Vehicle): string => (v.variant && v.variant.trim() ? v.variant.trim() : v.powertrain)

/**
 * Apply the live scenario to the raw fleet for a given year. Returns adjusted
 * vehicle copies. This is where "change anything" turns into new numbers:
 *  · evSharePct  — reallocate volume toward zero-emission vehicles
 *  · salesMultiplier — scale total registrations
 *  · massShiftKg — heavier/lighter fleet (moves the limit AND nudges CO₂)
 */
export function applyScenario(
  raw: Vehicle[], s: Scenario, pack: RulePack,
  overrides: Record<string, Partial<Scenario>> = {},
): Vehicle[] {
  let v = raw.filter((x) => x.year === s.year).map((x) => ({ ...x }))

  // Overrides are keyed by scope, most-specific wins, layering base < pool <
  // manufacturer < model < variant — so edits at any level coexist on one fleet.
  //   pool:NAME · MAKER · MAKER/MODEL · MAKER/MODEL/VARIANTKEY
  const poolOv = (p: string) => overrides[`pool:${p}`]
  const makerOv = (p: string) => overrides[p]
  const modelOv = (p: string, m: string) => overrides[`${p}/${m}`]
  const variantOv = (p: string, m: string, vk: string) => overrides[`${p}/${m}/${vk}`]
  const effFor = (x: Vehicle): Scenario => {
    let e = s
    const pl = poolOv(x.pool || x.parent); if (pl) e = { ...e, ...pl }
    const mk = makerOv(x.parent); if (mk) e = { ...e, ...mk }
    const md = modelOv(x.parent, x.model); if (md) e = { ...e, ...md }
    const vr = variantOv(x.parent, x.model, variantKey(x)); if (vr) e = { ...e, ...vr }
    return e
  }

  // 0. Parallel powertrain launches. A handful of models are offered by their
  //    source as mutually-exclusive options ("petrol OR mild-hybrid OR
  //    electric"), so the row's spec is a CHOICE, not a fact. Resolve it first,
  //    before every other lever, so the whole chain sees one coherent spec.
  //    Default (and the shipped row) is the conservative, highest-CO₂ option.
  for (const x of v) {
    const opts = x.powertrainOptions
    if (!opts?.length) continue
    const chosen = effFor(x).powertrainOptionMode
    const mode = chosen ?? 'conservative'
    // An EXPLICIT choice is the user's assumption about a product decision, so
    // it is pinned — the same doctrine hypothetical variants follow. Without
    // this a pinned powertrain mix silently undoes the choice: switching these
    // models to BEV would make the mix lever shrink them back to its BEV share
    // and the metric would move the WRONG way. Left unset (the default), the
    // rows behave like any other and the fleet levers own them.
    if (chosen) x.pinned = true
    if (mode === 'blended') {
      // a portfolio view: volume-weight the options. Deliberately NOT the
      // default — the result is an average of futures, not an achievable one.
      const w = opts.reduce((a, o) => a + (o.share ?? 1 / opts.length), 0) || 1
      const wt = (f: (o: PowertrainOption) => number | undefined) =>
        opts.reduce((a, o) => a + (f(o) ?? 0) * (o.share ?? 1 / opts.length), 0) / w
      x.co2 = wt((o) => o.co2)
      const m = wt((o) => o.mass); if (m) x.mass = m
      x.powertrain = opts[0].powertrain
      x.fuel = opts[0].fuel
      x.powertrainOption = 'Blended'
      continue
    }
    // opts are sorted richest-CO₂ first, so conservative = head, electrified = tail
    const pick = mode === 'electrified' ? opts[opts.length - 1] : opts[0]
    x.powertrain = pick.powertrain
    x.fuel = pick.fuel
    x.co2 = pick.co2
    if (pick.mass != null) x.mass = pick.mass
    x.battery = pick.battery
    x.powertrainOption = pick.powertrain
  }

  // 1. Sales multiplier (per vehicle, deepest scope wins). Runs BEFORE the
  //    hypothetical variants so a typed unit count is never multiplied, and a
  //    share-mode variant takes its share of the post-multiplier market.
  for (const x of v) { const m = effFor(x).salesMultiplier; if (m !== 1) x.sales *= m }

  // 1b. Hypothetical variants the user added (attached to the current year). A
  //    variant carrying `share` takes that fraction of its scope and shrinks the
  //    existing scope volume proportionately (constant total); otherwise its
  //    `sales` are added on top. Either way the row is PINNED: its spec and
  //    volume are the user's explicit assumption — the fleet-level levers below
  //    (mix reweighting, EV-share reallocation, mass shift, eco) never rescale
  //    it. Without the pin, a 5,000-unit variant under a 25% BEV mix lever
  //    could silently land as 25,000 units.
  for (const raw0 of s.extraVariants ?? []) {
    const ev: Vehicle = { ...raw0, year: s.year, pinned: true }
    // Inherit the manufacturer's real pool so the variant nests under the same
    // pool node in the hierarchy (not a stray "" pool).
    if (!ev.pool) { const sib = v.find((x) => x.parent === ev.parent); if (sib) ev.pool = sib.pool }
    if (ev.share != null && ev.share > 0) {
      const scope = ev.shareScope ?? 'model'
      const inScope = v.filter((x) =>
        scope === 'market' ? true : scope === 'manufacturer' ? x.parent === ev.parent : x.parent === ev.parent && x.model === ev.model)
      const total = inScope.reduce((a, x) => a + x.sales, 0)
      const sh = Math.min(0.95, Math.max(0, ev.share))
      ev.sales = Math.round(total * sh)
      for (const x of inScope) x.sales *= 1 - sh // proportional give-up
    }
    v.push(ev)
  }
  if (v.length === 0) return v

  // 2. Powertrain mix — reweight within the DEEPEST scope that defines a mix
  //    (model > maker > market), preserving that scope's total volume. A model
  //    with its own mix is excluded from its maker's reweighting (it's pinned).
  // Precedence model > manufacturer > pool > market; the mix reweights within
  // each manufacturer (preserving per-maker totals) using the deepest scope's mix.
  const groups = new Map<string, { weights: Record<string, number>; items: Vehicle[] }>()
  for (const x of v) {
    if (x.pinned) continue // hypothetical variants keep their typed volume
    const md = modelOv(x.parent, x.model)
    const mk = makerOv(x.parent)
    const pl = poolOv(x.pool || x.parent)
    let key: string | null = null, weights: Record<string, number> | null = null
    if (md?.mix) { key = `m:${x.parent}/${x.model}`; weights = md.mix }
    else if (mk?.mix) { key = `k:${x.parent}`; weights = mk.mix }
    else if (pl?.mix) { key = `p:${x.parent}`; weights = pl.mix } // pool mix → each member maker
    else if (s.mix) { key = `g:${x.parent}`; weights = s.mix } // market mix applies within each maker
    if (key && weights) {
      const g = groups.get(key) ?? { weights, items: [] }
      g.items.push(x); groups.set(key, g)
    }
  }
  for (const { weights, items } of groups.values()) {
    const present = [...new Set(items.map((i) => i.powertrain))]
    let wsum = 0
    const w: Record<string, number> = {}
    for (const pt of present) { w[pt] = Math.max(0, weights[pt] ?? 0); wsum += w[pt] }
    if (wsum <= 0) continue
    const total = items.reduce((a, i) => a + i.sales, 0)
    const cur: Record<string, number> = {}
    for (const i of items) cur[i.powertrain] = (cur[i.powertrain] ?? 0) + i.sales
    const factor: Record<string, number> = {}
    for (const pt of present) factor[pt] = cur[pt] > 0 ? ((w[pt] / wsum) * total) / cur[pt] : 0
    for (const i of items) i.sales *= factor[i.powertrain] ?? 1
  }

  // 2b. EV-share lever (brand/market scope, only when no mix set) — per maker.
  //     Pinned hypothetical rows sit outside the reallocation: the lever moves
  //     the EXISTING fleet; the variant adds on top exactly as entered.
  const byMaker = new Map<string, Vehicle[]>()
  for (const x of v) { if (!x.pinned) (byMaker.get(x.parent) ?? byMaker.set(x.parent, []).get(x.parent)!).push(x) }
  const synthesised: Vehicle[] = []
  for (const [parent, group] of byMaker) {
    const e = { ...s, ...(poolOv(group[0].pool || parent) ?? {}), ...(makerOv(parent) ?? {}) }
    if (!e.mix && e.evSharePct != null) {
      const total = group.reduce((a, x) => a + x.sales, 0)
      const evUnits = group.filter((x) => pack.isZeroEmission(x)).reduce((a, x) => a + x.sales, 0)
      const nonEv = total - evUnits
      const target = Math.min(0.999, Math.max(0, e.evSharePct / 100))
      if (total > 0 && evUnits > 0 && nonEv > 0) {
        const fe = (target * total) / evUnits
        const fn = ((1 - target) * total) / nonEv
        group.forEach((x) => (x.sales *= pack.isZeroEmission(x) ? fe : fn))
      } else if (total > 0 && evUnits === 0 && nonEv > 0 && target > 0) {
        // No existing zero-emission seed to scale up: synthesise a BEV bucket so
        // the lever still works for all-combustion makers (previously a silent
        // no-op). Shrink the combustion fleet and add one modelled BEV row.
        group.forEach((x) => (x.sales *= 1 - target))
        const refMass = group.reduce((a, x) => a + x.mass * x.sales, 0) / Math.max(1, group.reduce((a, x) => a + x.sales, 0))
        const cls = groupBy(group, (x) => x.vclass)
        const dominantClass = [...cls.entries()].sort((a, b) => b[1].length - a[1].length)[0]?.[0] ?? group[0].vclass
        synthesised.push({
          parent, pool: group[0].pool, brand: group[0].brand, make: group[0].make,
          model: 'BEV (modelled)', year: s.year, powertrain: 'BEV', fuel: 'Electric',
          co2: 0, mass: refMass > 0 ? refMass : group[0].mass, sales: target * total,
          vclass: dominantClass, variant: 'modelled zero-emission',
        })
      }
    }
  }
  if (synthesised.length) v = [...v, ...synthesised]

  // 3. Mass shift (per vehicle, deepest scope wins) — moves fleet & the limit together.
  for (const x of v) {
    if (x.pinned) continue // a hypothetical's typed spec is not re-engineered
    const ms = effFor(x).massShiftKg
    if (ms !== 0) {
      x.mass = Math.max(800, x.mass + ms)
      if (!pack.isZeroEmission(x)) x.co2 = Math.max(0, x.co2 * (1 + (ms / 1500) * 0.35))
    }
  }

  // 4. Eco-innovation is certified per manufacturer (Art 11 certificates belong
  //    to the OEM, not the market) — a scoped ecoBoostG is baked into the
  //    vehicle's ecoBenefit so vehicleMetric, which only sees the global
  //    scenario, still applies exactly the scoped credit for that scope.
  for (const x of v) {
    if (x.pinned) continue
    const e = effFor(x).ecoBoostG
    if (e !== s.ecoBoostG) x.ecoBenefit = (x.ecoBenefit ?? 0) + (e - s.ecoBoostG)
  }

  return v
}

/** Weighted-average aggregate for a set of vehicles at one level. */
export function aggregate(
  vehicles: Vehicle[],
  pack: RulePack,
  s: Scenario,
  label: string,
  level: Aggregate['level'],
  key: string,
): Aggregate {
  let units = 0,
    rawUnits = 0,
    wMetric = 0,
    wRawMetric = 0,
    wMass = 0,
    zeUnits = 0,
    zlevUnits = 0

  // ZE = zero-emission (0 g, shown as the headline ZE share); ZLEV = zero/low-
  // emission (0–50 g for the EU), which drives the benchmark target relaxation.
  const isZlev = pack.isZLEV ?? pack.isZeroEmission
  for (const v of vehicles) {
    const eu = pack.vehicleUnits(v, s) // effective (super-credit) units
    const ru = v.sales
    units += eu
    rawUnits += ru
    wMetric += pack.vehicleMetric(v, s) * eu
    wRawMetric += v.co2 * ru
    wMass += v.mass * ru
    if (pack.isZeroEmission(v)) zeUnits += ru
    if (isZlev(v)) zlevUnits += ru
  }

  const avgMetric = units > 0 ? wMetric / units : 0
  const rawAvgMetric = rawUnits > 0 ? wRawMetric / rawUnits : 0
  const avgMass = rawUnits > 0 ? wMass / rawUnits : 0
  const zlevShare = rawUnits > 0 ? zeUnits / rawUnits : 0 // headline ZE share (display)
  const zlevBenchShare = rawUnits > 0 ? zlevUnits / rawUnits : 0 // 0–50 g share (limit relaxation)

  // The limit is class-specific (EU car vs van, AU Type 1 vs Type 2). For a
  // mixed fleet we units-weight each class's limit for DISPLAY — still one
  // shared formula.
  const byClass = groupBy(vehicles, (x) => x.vclass)
  const classPos: { vclass: string; units: number; limit: number; metric: number }[] = []
  let wLimit = 0
  for (const [vclass, cv] of byClass) {
    const cu = cv.reduce((a, x) => a + x.sales, 0)
    if (cu === 0) continue
    const cMass = cv.reduce((a, x) => a + x.mass * x.sales, 0) / cu
    // The ZLEV relaxation is a property of the CLASS's own fleet, not the
    // combined one — a van fleet's benchmark is measured on vans.
    const cEff = cv.reduce((a, x) => a + pack.vehicleUnits(x, s), 0)
    const cMetric = cEff > 0 ? cv.reduce((a, x) => a + pack.vehicleMetric(x, s) * pack.vehicleUnits(x, s), 0) / cEff : 0
    const cZlev = cu > 0 ? cv.filter((x) => isZlev(x)).reduce((a, x) => a + x.sales, 0) / cu : 0
    const cLimit = pack.limit({ year: s.year, avgMass: cMass, zlevShare: pack.classSeparateCompliance ? cZlev : zlevBenchShare, vclass, scenario: s })
    wLimit += cLimit * cu
    classPos.push({ vclass, units: cu, limit: cLimit, metric: cMetric })
  }
  const limit = rawUnits > 0 ? wLimit / rawUnits : 0
  const gap = avgMetric - limit

  // Small-volume makers are exempt from fines.
  const exempt = rawUnits > 0 && rawUnits < pack.smallVolumeThreshold && level === 'parent'
  const excess = Math.max(0, gap)
  // Where a regime sets a SEPARATE obligation per vehicle class, the premium is
  // charged per class and the classes do NOT net. Under Reg (EU) 2019/631 a
  // manufacturer holds two distinct targets (M1 and N1) and Article 8 charges
  // each independently — so van headroom cannot pay for a car deficit, and
  // blending them into one gap both understates the bill and reports a
  // compliance position that does not legally exist.
  const classFine = (c: { units: number; limit: number; metric: number }) => {
    const ex = Math.max(0, c.metric - c.limit)
    if (ex <= 0 || exempt) return 0
    return pack.fineFor ? pack.fineFor(ex, c.units, s) : ex * pack.fineRate * c.units
  }
  const perClassFine = () => classPos.reduce((a, c) => a + classFine(c), 0)
  // Stepped statutory schedules (pack.fineFor) replace the linear formula.
  const fine = exempt ? 0
    : pack.classSeparateCompliance && classPos.length > 1 ? perClassFine()
    : gap <= 0 ? 0
    : pack.fineFor ? pack.fineFor(excess, rawUnits, s)
    : excess * pack.fineRate * rawUnits

  const fineMath: FineMath = {
    excess,
    fineRate: pack.fineRate,
    units: rawUnits,
    fine,
    expression:
      excess <= 0
        ? 'Under the limit — no fine'
        : pack.fineFor
          ? `${fmtNum(excess, 2)} ${pack.metricUnit} over × statutory schedule (${pack.fineRateLabel}) × ${fmtInt(rawUnits)} units`
          : `${fmtNum(excess, 2)} ${pack.metricUnit} over × ${pack.currency}${pack.fineRate} × ${fmtInt(rawUnits)} units`,
  }

  const status: Aggregate['status'] =
    rawUnits === 0 ? 'no-sales' : exempt && gap > 0 ? 'exempt' : fine > 0 ? 'fine' : 'compliant'

  return {
    label,
    level,
    key,
    units,
    rawUnits,
    avgMetric,
    rawAvgMetric,
    avgMass,
    zlevShare,
    classes: classPos.map((c) => ({
      vclass: c.vclass, units: c.units, avgMetric: c.metric, limit: c.limit,
      gap: c.metric - c.limit, fine: classFine(c),
    })),
    limit,
    gap,
    fine,
    status,
    fineMath,
    vehicles,
  }
}

const groupBy = <T,>(arr: T[], fn: (x: T) => string) => {
  const m = new Map<string, T[]>()
  for (const x of arr) {
    const k = fn(x)
    ;(m.get(k) ?? m.set(k, []).get(k)!).push(x)
  }
  return m
}

// Single-entry, reference-keyed caches. The two trees are pure functions of
// (raw, pack, scenario, overrides); since Analyze and ScenarioRail each call
// useCompliance with the SAME store refs in one render, the second build is free.
// Results are read-only (aggregate() returns fresh objects), so sharing is safe.
type TreeCache = { raw: Vehicle[]; pack: RulePack; s: Scenario; ov: Record<string, Partial<Scenario>>; r: Aggregate } | null
let _btCache: TreeCache = null
let _dtCache: TreeCache = null
const cacheHit = (c: TreeCache, raw: Vehicle[], pack: RulePack, s: Scenario, ov: Record<string, Partial<Scenario>>) =>
  !!c && c.raw === raw && c.pack === pack && c.s === s && c.ov === ov

/** Drill-down tree: market → parent → model → powertrain. */
export function buildTree(raw: Vehicle[], pack: RulePack, s: Scenario, overrides: Record<string, Partial<Scenario>> = {}): Aggregate {
  if (cacheHit(_btCache, raw, pack, s, overrides)) return _btCache!.r
  const v = applyScenario(raw, s, pack, overrides)
  const root = aggregate(v, pack, s, pack.name, 'fleet', 'fleet')

  root.children = [...groupBy(v, (x) => x.parent).entries()]
    .map(([parent, pv]) => {
      const node = aggregate(pv, pack, s, parent, 'parent', parent)
      node.children = [...groupBy(pv, (x) => x.model).entries()]
        .map(([model, mv]) => {
          const mnode = aggregate(mv, pack, s, model, 'model', `${parent}/${model}`)
          mnode.children = [...groupBy(mv, (x) => x.powertrain).entries()]
            .map(([pt, ptv]) => aggregate(ptv, pack, s, pt, 'powertrain', `${parent}/${model}/${pt}`))
            .sort((a, b) => b.rawUnits - a.rawUnits)
          return mnode
        })
        .sort((a, b) => b.rawUnits - a.rawUnits)
      return node
    })
    .sort((a, b) => b.rawUnits - a.rawUnits)

  _btCache = { raw, pack, s, ov: overrides, r: root }
  return root
}

/**
 * Five-level drill tree for the bubble explorer & assumptions scope:
 *   Market → Pool (compliance pool) → Manufacturer → Model → Variant (leaf).
 * Node keys match the override scope keys (`pool:NAME` / `MAKER` /
 * `MAKER/MODEL` / `MAKER/MODEL/VARIANTKEY`) and the variant node's LABEL equals
 * its variantKey so a drill path reconstructs the scope exactly.
 */
export function buildDrillTree(raw: Vehicle[], pack: RulePack, s: Scenario, overrides: Record<string, Partial<Scenario>> = {}): Aggregate {
  if (cacheHit(_dtCache, raw, pack, s, overrides)) return _dtCache!.r
  const v = applyScenario(raw, s, pack, overrides)
  const root = aggregate(v, pack, s, pack.name, 'fleet', 'fleet')
  const byUnits = (a: Aggregate, b: Aggregate) => b.rawUnits - a.rawUnits

  root.children = [...groupBy(v, (x) => x.pool || x.parent).entries()]
    .map(([pool, pv]) => {
      const pnode = aggregate(pv, pack, s, pool, 'pool', `pool:${pool}`)
      pnode.children = [...groupBy(pv, (x) => x.parent).entries()]
        .map(([parent, mfrv]) => {
          const mfr = aggregate(mfrv, pack, s, parent, 'parent', parent)
          mfr.children = [...groupBy(mfrv, (x) => x.model).entries()]
            .map(([model, modv]) => {
              const mod = aggregate(modv, pack, s, model, 'model', `${parent}/${model}`)
              mod.children = [...groupBy(modv, variantKey).entries()]
                .map(([vk, vv]) => aggregate(vv, pack, s, vk, 'variant', `${parent}/${model}/${vk}`))
                .sort(byUnits)
              return mod
            })
            .sort(byUnits)
          return mfr
        })
        .sort(byUnits)
      return pnode
    })
    .sort(byUnits)

  _dtCache = { raw, pack, s, ov: overrides, r: root }
  return root
}

export interface ThreeYear {
  years: number[]
  perYear: { year: number; metric: number; limit: number; units: number; fine: number }[]
  avgMetric: number
  avgLimit: number
  gap: number
  units: number
  fine: number // premium on the 3-year averaged excess
  singleYearFine: number // sum of the per-year premiums
  saved: number
  exempt: boolean
}

/**
 * EU 2025–2027 three-year averaging flexibility (Reg (EU) 2025/1214). Instead of
 * meeting the target every single year, a maker is assessed on its registration-
 * weighted average specific emissions vs its average target over 2025–2027. By
 * convexity this premium is always ≤ the sum of the per-year premiums.
 */
// ── month-by-month compliance ───────────────────────────────────────────────
// Compliance is settled on the FULL year, but the registrations arrive monthly,
// so the useful question mid-year is "where do we stand, and which month moved
// us". Two readings, both computed with the same `aggregate` the annual number
// uses so they cannot drift from it:
//
//   • the month on its own — how that month's registrations performed, which is
//     what tells you a bad month from a good one; and
//   • YTD — the running sales-weighted average from month 1 to here, which IS
//     the compliance position so far and lands exactly on the annual figure at
//     the final reported month.
//
// The limit moves too: it is mass-based, so a month heavy in large vehicles
// raises its own target. Both readings therefore carry their own limit.
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** How far through the compliance year a Plan reading stands.
 *  through = null → the whole year (every row, monthly or not).
 *  'ytd'   → months 1..through, the cumulative compliance position.
 *  'month' → that month alone, the diagnostic reading. */
export interface MonthScope { through: number | null; mode: 'ytd' | 'month' }

/**
 * Rescale a fleet to a point in the compliance year. Rows for OTHER years pass
 * through untouched (the tree filters by year anyway).
 *
 * Rows in the scoped year with no monthly split are DROPPED, not carried at
 * their annual volume — a brand-total row cannot be attributed to June, and
 * holding it whole would inflate whichever month you looked at. `unscoped()`
 * reports how much volume that is, so a screen can say so rather than quietly
 * losing it.
 */
export function scopeToMonth(rows: Vehicle[], year: number, scope: MonthScope): Vehicle[] {
  if (scope.through == null) return rows
  const t = scope.through
  const out: Vehicle[] = []
  for (const v of rows) {
    if (v.year !== year) { out.push(v); continue }
    const m = v.monthly
    if (!m?.length) continue
    const sales = scope.mode === 'month' ? (m[t - 1] ?? 0) : m.slice(0, t).reduce((a, b) => a + b, 0)
    if (sales > 0) out.push({ ...v, sales })
  }
  return out
}

/** Volume in `year` that carries no monthly split, so it sits outside a
 *  month-scoped reading. 0 when the whole year is in view. */
export function unscopedVolume(rows: Vehicle[], year: number, scope: MonthScope): number {
  if (scope.through == null) return 0
  return rows.filter((v) => v.year === year && !v.monthly?.length).reduce((a, v) => a + v.sales, 0)
}

/** The months a year has actually filed — drives the period selector. */
export function monthsFiled(rows: Vehicle[], year: number): number {
  return Math.max(0, ...rows.filter((v) => v.year === year).map((v) => v.monthly?.length ?? 0))
}

export interface MonthPoint {
  /** 1-based index within the compliance year (1 = fiscalYearStartMonth). */
  month: number
  label: string            // 'Apr', 'May' …
  /** calendar year this month falls in — a fiscal year straddles two */
  calendarYear: number
  units: number            // registrations in the month alone
  metric: number
  limit: number
  gap: number
  status: Aggregate['status']
  zlevShare: number
  ytdUnits: number
  ytdMetric: number        // running sales-weighted average, month 1 → here
  ytdLimit: number
  ytdGap: number
  ytdStatus: Aggregate['status']
  /** exposure if the year closed on this month — NOT a levied fine, which is
   *  only assessed once the full year is filed */
  ytdFineIfYearEnded: number
  ytdZlevShare: number
}

/**
 * Month-by-month + running-YTD compliance for the rows that carry a monthly
 * split. Returns [] when the year has no monthly filing.
 *
 * This is an ACTUALS reading: hypothetical variants are excluded, since adding
 * them to each month would count them twelve times.
 */
export function monthlyCompliance(rows: Vehicle[], pack: RulePack, s: Scenario): MonthPoint[] {
  const yearRows = rows.filter((v) => v.year === s.year && v.monthly?.length)
  if (!yearRows.length) return []
  const months = Math.max(...yearRows.map((v) => v.monthly!.length))
  const start = (pack.fiscalYearStartMonth ?? 1) - 1
  const sc: Scenario = { ...s, extraVariants: [] }

  const at = (pick: (m: number[], i: number) => number, i: number, key: string) => {
    const slice = yearRows
      .map((v) => ({ ...v, sales: pick(v.monthly!, i) }))
      .filter((v) => v.sales > 0)
    return aggregate(applyScenario(slice, sc, pack, {}), pack, sc, key, 'fleet', key)
  }

  const out: MonthPoint[] = []
  for (let i = 0; i < months; i++) {
    const one = at((m, k) => m[k] ?? 0, i, `m${i + 1}`)
    const ytd = at((m, k) => m.slice(0, k + 1).reduce((a, b) => a + b, 0), i, `ytd${i + 1}`)
    const cal = start + i
    out.push({
      month: i + 1,
      label: MONTH_NAMES[cal % 12],
      calendarYear: s.year + Math.floor(cal / 12),
      units: one.rawUnits,
      metric: one.avgMetric,
      limit: one.limit,
      gap: one.gap,
      status: one.status,
      zlevShare: one.zlevShare,
      ytdUnits: ytd.rawUnits,
      ytdMetric: ytd.avgMetric,
      ytdLimit: ytd.limit,
      ytdGap: ytd.gap,
      ytdStatus: ytd.status,
      ytdFineIfYearEnded: ytd.fine,
      ytdZlevShare: ytd.zlevShare,
    })
  }
  return out
}

export function threeYearAverage(
  raw: Vehicle[], pack: RulePack, s: Scenario, parent: string,
  years: number[] = [2025, 2026, 2027], overrides: Record<string, Partial<Scenario>> = {},
): ThreeYear {
  const perYear = years.map((year) => {
    const n = aggregateParent(raw, pack, { ...s, year }, parent, overrides)
    return { year, metric: n.avgMetric, limit: n.limit, units: n.rawUnits, fine: n.fine }
  })
  const units = perYear.reduce((a, p) => a + p.units, 0)
  const avgMetric = units ? perYear.reduce((a, p) => a + p.metric * p.units, 0) / units : 0
  const avgLimit = units ? perYear.reduce((a, p) => a + p.limit * p.units, 0) / units : 0
  const gap = avgMetric - avgLimit
  const singleYearFine = perYear.reduce((a, p) => a + p.fine, 0)
  // Small-volume exemption mirrors the per-year rule (average annual registrations).
  const exempt = units / years.length < pack.smallVolumeThreshold
  const fine = exempt || gap <= 0 ? 0 : gap * pack.fineRate * units
  return { years, perYear, avgMetric, avgLimit, gap, units, fine, singleYearFine, saved: Math.max(0, singleYearFine - fine), exempt }
}

/**
 * Cheap scope fine for the risk Monte-Carlo hot loop — sums per-MANUFACTURER
 * fines WITHOUT building the model/variant sub-tree (the full buildDrillTree is
 * ~40× heavier). market = Σ all makers · pool = Σ the pool's makers · maker = one.
 */
export function fleetFineFast(
  raw: Vehicle[], pack: RulePack, s: Scenario, overrides: Record<string, Partial<Scenario>> = {},
  opts: { pool?: string; maker?: string } = {},
): number {
  let v = applyScenario(raw, s, pack, overrides)
  if (opts.maker) return aggregate(v.filter((x) => x.parent === opts.maker), pack, s, opts.maker, 'parent', opts.maker).fine
  if (opts.pool) v = v.filter((x) => (x.pool || x.parent) === opts.pool)
  let total = 0
  for (const [parent, pv] of groupBy(v, (x) => x.parent)) total += aggregate(pv, pack, s, parent, 'parent', parent).fine
  return total
}

/** Aggregate for one parent (the selected maker), with its model breakdown. */
export function aggregateParent(raw: Vehicle[], pack: RulePack, s: Scenario, parent: string, overrides: Record<string, Partial<Scenario>> = {}): Aggregate {
  const v = applyScenario(raw, s, pack, overrides).filter((x) => x.parent === parent)
  const node = aggregate(v, pack, s, parent, 'parent', parent)
  node.children = [...groupBy(v, (x) => x.model).entries()]
    .map(([model, mv]) => aggregate(mv, pack, s, model, 'model', `${parent}/${model}`))
    .sort((a, b) => b.rawUnits - a.rawUnits)
  return node
}
