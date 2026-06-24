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

  // The effective scenario for a maker = global, with that maker's overrides
  // layered on top (mix/mass/sales/EV). This lets EU-wide edits at the market
  // level coexist with OEM-specific edits when drilled into one maker.
  const eff = (parent: string): Scenario => {
    const o = overrides[parent]
    return o ? { ...s, ...o } : s
  }

  // group by maker, then apply each maker's effective levers within its own fleet
  const byParent = new Map<string, Vehicle[]>()
  for (const x of v) (byParent.get(x.parent) ?? byParent.set(x.parent, []).get(x.parent)!).push(x)

  for (const [parent, group] of byParent) {
    const e = eff(parent)

    // 1. Sales multiplier
    if (e.salesMultiplier !== 1) group.forEach((x) => (x.sales *= e.salesMultiplier))

    // 2. Powertrain mix (renormalized weights), or the simpler ZE-share lever —
    //    reweighted within this maker so its total volume is preserved.
    if (e.mix && Object.keys(e.mix).length) {
      const present = [...new Set(group.map((x) => x.powertrain))]
      let wsum = 0
      const w: Record<string, number> = {}
      for (const pt of present) { w[pt] = Math.max(0, e.mix[pt] ?? 0); wsum += w[pt] }
      if (wsum > 0) {
        const total = group.reduce((a, x) => a + x.sales, 0)
        const cur: Record<string, number> = {}
        for (const x of group) cur[x.powertrain] = (cur[x.powertrain] ?? 0) + x.sales
        const factor: Record<string, number> = {}
        for (const pt of present) factor[pt] = cur[pt] > 0 ? ((w[pt] / wsum) * total) / cur[pt] : 0
        group.forEach((x) => (x.sales *= factor[x.powertrain] ?? 1))
      }
    } else if (e.evSharePct != null) {
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

    // 3. Mass shift — moves the maker's fleet and its mass-based limit together.
    if (e.massShiftKg !== 0) {
      group.forEach((x) => {
        x.mass = Math.max(800, x.mass + e.massShiftKg)
        if (!pack.isZeroEmission(x)) x.co2 = Math.max(0, x.co2 * (1 + (e.massShiftKg / 1500) * 0.35))
      })
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

/** Aggregate for one parent (the selected maker), with its model breakdown. */
export function aggregateParent(raw: Vehicle[], pack: RulePack, s: Scenario, parent: string, overrides: Record<string, Partial<Scenario>> = {}): Aggregate {
  const v = applyScenario(raw, s, pack, overrides).filter((x) => x.parent === parent)
  const node = aggregate(v, pack, s, parent, 'parent', parent)
  node.children = [...groupBy(v, (x) => x.model).entries()]
    .map(([model, mv]) => aggregate(mv, pack, s, model, 'model', `${parent}/${model}`))
    .sort((a, b) => b.rawUnits - a.rawUnits)
  return node
}
