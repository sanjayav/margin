import type { RulePack, Scenario, Vehicle } from '../engine/types'
import { buildTree, aggregateParent, applyScenario } from '../engine/engine'

type Ov = Record<string, Partial<Scenario>>

export interface YearPoint { year: number; fleet: number; limit: number; fine: number; gap: number }
export function yearSeries(raw: Vehicle[], pack: RulePack, s: Scenario, ov: Ov): YearPoint[] {
  return pack.years.map((year) => {
    const t = buildTree(raw, pack, { ...s, year }, ov)
    return { year, fleet: t.avgMetric, limit: t.limit, gap: t.gap, fine: (t.children ?? []).reduce((a, c) => a + c.fine, 0) }
  })
}

export interface MixPoint { year: number; shares: Record<string, number> }
export function mixSeries(raw: Vehicle[], pack: RulePack, s: Scenario, ov: Ov): { pts: string[]; series: MixPoint[] } {
  const ptSet = new Set<string>()
  const series = pack.years.map((year) => {
    const v = applyScenario(raw, { ...s, year }, pack, ov)
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
export function makerYearGap(raw: Vehicle[], pack: RulePack, s: Scenario, ov: Ov): Heat {
  const makers = [...new Set(raw.map((v) => v.parent))].sort()
  return {
    makers, years: pack.years,
    cells: makers.map((m) => pack.years.map((y) => aggregateParent(raw, pack, { ...s, year: y }, m, ov).gap)),
  }
}

export interface MakerRow { maker: string; fine: number; gap: number; units: number; avg: number; mass: number; status: string }
export function makerRows(raw: Vehicle[], pack: RulePack, s: Scenario, ov: Ov): MakerRow[] {
  const t = buildTree(raw, pack, s, ov)
  return (t.children ?? []).map((c) => ({ maker: c.label, fine: c.fine, gap: c.gap, units: c.rawUnits, avg: c.avgMetric, mass: c.avgMass, status: c.status }))
}

export interface MekkoCol { maker: string; units: number; segs: { pt: string; u: number }[] }
export function makerMekko(raw: Vehicle[], pack: RulePack, s: Scenario, ov: Ov): MekkoCol[] {
  const t = buildTree(raw, pack, s, ov)
  return (t.children ?? []).map((c) => {
    const by: Record<string, number> = {}
    for (const v of c.vehicles) by[v.powertrain] = (by[v.powertrain] ?? 0) + v.sales
    return { maker: c.label, units: c.rawUnits, segs: Object.entries(by).map(([pt, u]) => ({ pt, u })).sort((a, b) => b.u - a.u) }
  }).filter((c) => c.units > 0).sort((a, b) => b.units - a.units)
}
