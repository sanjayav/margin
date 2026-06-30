import type { RulePack, Scenario, Vehicle } from '../engine/types'
import { buildTree, aggregateParent, applyScenario } from '../engine/engine'

type Ov = Record<string, Partial<Scenario>>
/** When `focus` is a manufacturer (compliance parent) the dashboard zooms into
 *  that OEM and every breakdown re-keys from makers to that OEM's models. `null`
 *  / 'ALL' keeps the whole-market view. */
export type Focus = string | null

const isFocused = (f: Focus) => !!f && f !== 'ALL'

export interface YearPoint { year: number; fleet: number; limit: number; fine: number; gap: number }
export function yearSeries(raw: Vehicle[], pack: RulePack, s: Scenario, ov: Ov, focus: Focus = null): YearPoint[] {
  return pack.years.map((year) => {
    if (isFocused(focus)) {
      const n = aggregateParent(raw, pack, { ...s, year }, focus as string, ov)
      return { year, fleet: n.avgMetric, limit: n.limit, gap: n.gap, fine: n.fine }
    }
    const t = buildTree(raw, pack, { ...s, year }, ov)
    return { year, fleet: t.avgMetric, limit: t.limit, gap: t.gap, fine: (t.children ?? []).reduce((a, c) => a + c.fine, 0) }
  })
}

export interface MixPoint { year: number; shares: Record<string, number> }
export function mixSeries(raw: Vehicle[], pack: RulePack, s: Scenario, ov: Ov, focus: Focus = null): { pts: string[]; series: MixPoint[] } {
  const ptSet = new Set<string>()
  const series = pack.years.map((year) => {
    let v = applyScenario(raw, { ...s, year }, pack, ov)
    if (isFocused(focus)) v = v.filter((x) => x.parent === focus)
    const by: Record<string, number> = {}
    let tot = 0
    for (const x of v) { by[x.powertrain] = (by[x.powertrain] ?? 0) + x.sales; tot += x.sales; ptSet.add(x.powertrain) }
    const shares: Record<string, number> = {}
    for (const k in by) shares[k] = tot ? by[k] / tot : 0
    return { year, shares }
  })
  const order = ['BEV', 'PHEV', 'HEV', 'MHEV', 'Strong Hybrid', 'ICE']
  const rank = (p: string) => { const i = order.indexOf(p); return i < 0 ? 99 : i }
  const pts = [...ptSet].sort((a, b) => rank(a) - rank(b))
  return { pts, series }
}

export interface Heat { makers: string[]; years: number[]; cells: number[][] }
export function makerYearGap(raw: Vehicle[], pack: RulePack, s: Scenario, ov: Ov, focus: Focus = null): Heat {
  if (isFocused(focus)) {
    // one row per model within the focused OEM; cell = that model's gap that year.
    // Row set = models present in the ACTIVE year so it matches the ranking/mekko
    // and click→drill always lands on a model that exists in the current tree.
    const perYear = pack.years.map((y) => aggregateParent(raw, pack, { ...s, year: y }, focus as string, ov))
    const models = (aggregateParent(raw, pack, s, focus as string, ov).children ?? []).map((c) => c.label).sort()
    return {
      makers: models, years: pack.years,
      cells: models.map((m) => perYear.map((n) => (n.children ?? []).find((c) => c.label === m)?.gap ?? 0)),
    }
  }
  const makers = [...new Set(raw.map((v) => v.parent))].sort()
  return {
    makers, years: pack.years,
    cells: makers.map((m) => pack.years.map((y) => aggregateParent(raw, pack, { ...s, year: y }, m, ov).gap)),
  }
}

export interface MakerRow { maker: string; fine: number; gap: number; units: number; avg: number; mass: number; status: string }
export function makerRows(raw: Vehicle[], pack: RulePack, s: Scenario, ov: Ov, focus: Focus = null): MakerRow[] {
  if (isFocused(focus)) {
    // OEM is the compliance entity, so its models share ONE fine. Allocate it by
    // each model's positive excess × units so the per-model column still sums to
    // the OEM's exposure — a fair "which models pull us over" ranking.
    const node = aggregateParent(raw, pack, s, focus as string, ov)
    const kids = node.children ?? []
    let alloc = kids.map((m) => Math.max(0, m.gap) * m.rawUnits)
    let W = alloc.reduce((a, b) => a + b, 0)
    // Edge: the OEM is fined but every model is individually ≤ its limit (the
    // raw-vs-effective unit weighting can produce this). Fall back to allocating
    // by volume so the per-model column still sums to the OEM's exposure.
    if (W === 0 && node.fine > 0) { alloc = kids.map((m) => m.rawUnits); W = alloc.reduce((a, b) => a + b, 0) }
    return kids.map((m, i) => ({
      maker: m.label,
      fine: W > 0 ? node.fine * (alloc[i] / W) : 0,
      gap: m.gap, units: m.rawUnits, avg: m.avgMetric, mass: m.avgMass, status: m.status,
    }))
  }
  const t = buildTree(raw, pack, s, ov)
  return (t.children ?? []).map((c) => ({ maker: c.label, fine: c.fine, gap: c.gap, units: c.rawUnits, avg: c.avgMetric, mass: c.avgMass, status: c.status }))
}

export interface MekkoCol { maker: string; units: number; segs: { pt: string; u: number }[] }
export function makerMekko(raw: Vehicle[], pack: RulePack, s: Scenario, ov: Ov, focus: Focus = null): MekkoCol[] {
  const node = isFocused(focus) ? aggregateParent(raw, pack, s, focus as string, ov) : buildTree(raw, pack, s, ov)
  return (node.children ?? []).map((c) => {
    const by: Record<string, number> = {}
    for (const v of c.vehicles) by[v.powertrain] = (by[v.powertrain] ?? 0) + v.sales
    return { maker: c.label, units: c.rawUnits, segs: Object.entries(by).map(([pt, u]) => ({ pt, u })).sort((a, b) => b.u - a.u) }
  }).filter((c) => c.units > 0).sort((a, b) => b.units - a.units)
}
