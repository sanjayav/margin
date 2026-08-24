import type { Aggregate, RulePack, Scenario, Vehicle } from '../engine/types'
import type { ChartPoint } from '../components/LimitChart'

// Data colour lives in one place — see lib/palette.ts for why.
export { PT_COLORS, ptColor, ptRing, ptSoft, PT_ORDER, ptRank } from './palette'

/** One bubble per model·powertrain: x=mass, y=emissions (after credits),
 *  size=sales, colour=powertrain. Added variants appear as new bubbles. */
export function bubblePoints(vehicles: Vehicle[], pack: RulePack, scenario: Scenario): ChartPoint[] {
  const m = new Map<string, { label: string; pt: string; mass: number; metricW: number; units: number }>()
  for (const v of vehicles) {
    if (v.sales <= 0) continue
    const key = `${v.model}|${v.powertrain}`
    const cur = m.get(key) ?? { label: v.model, pt: v.powertrain, mass: 0, metricW: 0, units: 0 }
    cur.mass += v.mass * v.sales
    cur.metricW += pack.vehicleMetric(v, scenario) * v.sales
    cur.units += v.sales
    m.set(key, cur)
  }
  return [...m.entries()].map(([key, c]) => ({
    key, label: c.label, powertrain: c.pt, mass: c.units ? c.mass / c.units : 0,
    metric: c.units ? c.metricW / c.units : 0, units: c.units, status: 'compliant' as const,
  }))
}

/** A limit-as-function-of-mass closure for the chart, using a fleet's ZLEV share & class. */
export function makeLimitAt(pack: RulePack, scenario: Scenario, agg: Aggregate) {
  const vclass = dominantClass(agg)
  return (mass: number) => pack.limit({ year: scenario.year, avgMass: mass, zlevShare: agg.zlevShare, vclass, scenario })
}

/** Same, with a scenario patch — powers the chart's ghost year lines
 *  ({ year: y }) and the draft corridor / stringency drag ({ targetShiftPct }). */
export function makeLimitAtWith(pack: RulePack, scenario: Scenario, agg: Aggregate, patch: Partial<Scenario>) {
  const s = { ...scenario, ...patch }
  const vclass = dominantClass(agg)
  return (mass: number) => pack.limit({ year: s.year, avgMass: mass, zlevShare: agg.zlevShare, vclass, scenario: s })
}

export function dominantClass(agg: Aggregate): string {
  const counts = new Map<string, number>()
  for (const v of agg.vehicles) counts.set(v.vclass, (counts.get(v.vclass) ?? 0) + v.sales)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? agg.vehicles[0]?.vclass ?? ''
}

export function pointsFromChildren(children: Aggregate[], fleetKey?: string): ChartPoint[] {
  return children
    .filter((c) => c.rawUnits > 0 && c.avgMass > 0)
    .map((c) => ({ key: c.key, label: c.label, mass: c.avgMass, metric: c.avgMetric, units: c.rawUnits, status: c.status, isFleet: c.key === fleetKey }))
}

export function fleetPoint(agg: Aggregate): ChartPoint {
  return { key: agg.key, label: agg.label, mass: agg.avgMass, metric: agg.avgMetric, units: agg.rawUnits, status: agg.status, isFleet: true }
}
