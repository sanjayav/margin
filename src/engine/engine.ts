// ───────────────────────────────────────────────────────────────────────────
// Margin · the shared calculation engine
//
// ONE operation — "group the cars and compute the weighted average" — runs at
// every level of detail: whole market, one maker, one model, one powertrain.
// Built once here, reused everywhere. All country differences come in via the
// RulePack argument. Nothing about EU/India/etc. is hard-coded below.
// ───────────────────────────────────────────────────────────────────────────

import type { Aggregate, FineMath, RulePack, Scenario, Vehicle, LimitContext } from './types.js'

export const fmtInt = (n: number) =>
  Math.round(n).toLocaleString('en-US')

export const fmtMoney = (n: number, currency: string) => {
  const abs = Math.abs(n)
  if (abs >= 1e9) return `${currency}${(n / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${currency}${(n / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `${currency}${(n / 1e3).toFixed(1)}k`
  return `${currency}${Math.round(n)}`
}

export const fmtNum = (n: number, d = 1) =>
  n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })

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

  // 0. Hypothetical variants the user added (attached to the current year).
  if (s.extraVariants?.length) v = [...v, ...s.extraVariants.map((x) => ({ ...x, year: s.year }))]
  if (v.length === 0) return v

  // Overrides are keyed by scope: "Maker" (brand level) or "Maker/Model" (model
  // level). Edits layer base < maker < model, most-specific wins — so a market
  // edit, a brand edit, and a model edit can all coexist on the same fleet.
  const makerOv = (p: string) => overrides[p]
  const modelOv = (p: string, m: string) => overrides[`${p}/${m}`]
  const effFor = (x: Vehicle): Scenario => {
    let e = s
    const mk = makerOv(x.parent); if (mk) e = { ...e, ...mk }
    const md = modelOv(x.parent, x.model); if (md) e = { ...e, ...md }
    return e
  }

  // 1. Sales multiplier (per vehicle, deepest scope wins).
  for (const x of v) { const m = effFor(x).salesMultiplier; if (m !== 1) x.sales *= m }

  // 2. Powertrain mix — reweight within the DEEPEST scope that defines a mix
  //    (model > maker > market), preserving that scope's total volume. A model
  //    with its own mix is excluded from its maker's reweighting (it's pinned).
  const groups = new Map<string, { weights: Record<string, number>; items: Vehicle[] }>()
  for (const x of v) {
    const md = modelOv(x.parent, x.model)
    const mk = makerOv(x.parent)
    let key: string | null = null, weights: Record<string, number> | null = null
    if (md?.mix) { key = `m:${x.parent}/${x.model}`; weights = md.mix }
    else if (mk?.mix) { key = `k:${x.parent}`; weights = mk.mix }
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
  const byMaker = new Map<string, Vehicle[]>()
  for (const x of v) (byMaker.get(x.parent) ?? byMaker.set(x.parent, []).get(x.parent)!).push(x)
  for (const [parent, group] of byMaker) {
    const e = makerOv(parent) ? { ...s, ...makerOv(parent) } : s
    if (!e.mix && e.evSharePct != null) {
      const total = group.reduce((a, x) => a + x.sales, 0)
      const evUnits = group.filter((x) => pack.isZeroEmission(x)).reduce((a, x) => a + x.sales, 0)
      const nonEv = total - evUnits
      const target = Math.min(0.999, Math.max(0, e.evSharePct / 100))
      if (total > 0 && evUnits > 0 && nonEv > 0) {
        const fe = (target * total) / evUnits
        const fn = ((1 - target) * total) / nonEv
        group.forEach((x) => (x.sales *= pack.isZeroEmission(x) ? fe : fn))
      }
    }
  }

  // 3. Mass shift (per vehicle, deepest scope wins) — moves fleet & the limit together.
  for (const x of v) {
    const ms = effFor(x).massShiftKg
    if (ms !== 0) {
      x.mass = Math.max(800, x.mass + ms)
      if (!pack.isZeroEmission(x)) x.co2 = Math.max(0, x.co2 * (1 + (ms / 1500) * 0.35))
    }
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
  // mixed fleet we units-weight each class's limit — still one shared formula.
  const byClass = groupBy(vehicles, (x) => x.vclass)
  let wLimit = 0
  for (const [vclass, cv] of byClass) {
    const cu = cv.reduce((a, x) => a + x.sales, 0)
    if (cu === 0) continue
    const cMass = cv.reduce((a, x) => a + x.mass * x.sales, 0) / cu
    const ctx: LimitContext = { year: s.year, avgMass: cMass, zlevShare: zlevBenchShare, vclass, scenario: s }
    wLimit += pack.limit(ctx) * cu
  }
  const limit = rawUnits > 0 ? wLimit / rawUnits : 0
  const gap = avgMetric - limit

  // Small-volume makers are exempt from fines.
  const exempt = rawUnits > 0 && rawUnits < pack.smallVolumeThreshold && level === 'parent'
  const excess = Math.max(0, gap)
  const fine = exempt || gap <= 0 ? 0 : excess * pack.fineRate * rawUnits

  const fineMath: FineMath = {
    excess,
    fineRate: pack.fineRate,
    units: rawUnits,
    fine,
    expression:
      excess <= 0
        ? 'Under the limit — no fine'
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

/** Drill-down tree: market → parent → model → powertrain. */
export function buildTree(raw: Vehicle[], pack: RulePack, s: Scenario, overrides: Record<string, Partial<Scenario>> = {}): Aggregate {
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

/** Aggregate for one parent (the selected maker), with its model breakdown. */
export function aggregateParent(raw: Vehicle[], pack: RulePack, s: Scenario, parent: string, overrides: Record<string, Partial<Scenario>> = {}): Aggregate {
  const v = applyScenario(raw, s, pack, overrides).filter((x) => x.parent === parent)
  const node = aggregate(v, pack, s, parent, 'parent', parent)
  node.children = [...groupBy(v, (x) => x.model).entries()]
    .map(([model, mv]) => aggregate(mv, pack, s, model, 'model', `${parent}/${model}`))
    .sort((a, b) => b.rawUnits - a.rawUnits)
  return node
}
