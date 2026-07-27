// ───────────────────────────────────────────────────────────────────────────
// AGENT TOOL LAYER — the compliance engine, exposed as verifiable tools.
//
// Every tool is a thin, typed wrapper over an existing engine function. It
// returns engine-computed values ONLY, each tagged with provenance (dataset
// version, rule pack, basis) so any claim an agent makes is re-runnable and
// auditable. This boundary is where the "never invent a number" invariant is
// enforced: agents may compose and quote tool results — never compute them.
// ───────────────────────────────────────────────────────────────────────────
import { getPack } from './rulepacks'
import { getFleet, getMeta } from '../data/fleet'
import { buildTree } from './engine'
import { recommend } from './recommend'
import { buildDualCredit } from './china/dualcredit'
import { baselineScenario } from './forecast'
import type { CountryId, Scenario, Aggregate } from './types'

export interface Provenance { dataVersion: string; refreshed: string | null; rulePack: CountryId; basis: string }
export interface ToolResult<T> { tool: string; inputs: Record<string, unknown>; value: T; provenance: Provenance }

const prov = (country: CountryId, basis = 'actuals'): Provenance => {
  const m = getMeta(country)
  return { dataVersion: m.datasetVersion, refreshed: m.lastRefreshed, rulePack: country, basis }
}
const scen = (country: CountryId, year: number, ov: Partial<Scenario> = {}): Scenario => ({ ...baselineScenario(getPack(country)), year, ...ov })
const makerNodes = (t: Aggregate) => (t.children ?? []).filter((c) => c.rawUnits > 0)

export interface MakerPosition { name: string; gap: number; fine: number; over: boolean; units: number; avgMetric: number; limit: number; status: Aggregate['status'] }
export interface Position { avgMetric: number; limit: number; gap: number; marketFine: number; over: number; makers: MakerPosition[]; unit: string; currency: string }

/** The market's standing in a year (optionally under scenario overrides). */
export function getPosition(country: CountryId, year: number, ov: Partial<Scenario> = {}): ToolResult<Position> {
  const pack = getPack(country), raw = getFleet(country)
  const t = buildTree(raw, pack, scen(country, year, ov))
  const makers = makerNodes(t).map((c) => ({ name: c.label, gap: c.gap, fine: c.fine, over: c.gap > 0.0001, units: c.rawUnits, avgMetric: c.avgMetric, limit: c.limit, status: c.status }))
  return {
    tool: 'get_position', inputs: { country, year, ov },
    value: { avgMetric: t.avgMetric, limit: t.limit, gap: t.gap, marketFine: makers.reduce((a, m) => a + m.fine, 0), over: makers.filter((m) => m.over).length, makers, unit: pack.metricUnit, currency: pack.currency },
    provenance: prov(country),
  }
}

export interface Route { gap: number; fine: number; cleared: boolean; cheapest: { lever: string; title: string; cost: number } | null; totalCost: number; creditsCovered: number }
/** The cheapest costed route to clear a maker (same optimiser as the app). */
export function cheapestPath(country: CountryId, maker: string, year: number): ToolResult<Route> {
  const pack = getPack(country), raw = getFleet(country)
  const plan = recommend(raw, pack, scen(country, year), maker, {})
  const cheapest = [...plan.actions].filter((a) => a.gramsCleared > 0.0001).sort((a, b) => a.cost / (a.gramsCleared || 1) - b.cost / (b.gramsCleared || 1))[0]
  return {
    tool: 'cheapest_path', inputs: { country, maker, year },
    value: { gap: plan.before.gap, fine: plan.fineBefore, cleared: plan.cleared, cheapest: cheapest ? { lever: cheapest.lever, title: cheapest.title, cost: cheapest.cost } : null, totalCost: plan.totalCost, creditsCovered: plan.creditsCovered },
    provenance: prov(country),
  }
}

export interface DualCreditPos { makers: number; over: number; cafcCredit: number; nevBalance: number; creditsToBuy: number; cost: number; batteryGWh: number }
/** China two-axis dual-credit position for a year. */
export function dualCreditPosition(country: CountryId, year: number): ToolResult<DualCreditPos> {
  const pack = getPack(country), raw = getFleet(country)
  const s = scen(country, year)
  const dc = buildDualCredit(buildTree(raw, pack, s), s, pack.creditPrice ?? pack.fineRate)
  return {
    tool: 'dual_credit', inputs: { country, year },
    value: { makers: dc.totals.makers, over: dc.totals.makersOver, cafcCredit: dc.totals.cafcCredit, nevBalance: dc.totals.nevBalance, creditsToBuy: dc.totals.creditsToBuy, cost: dc.totals.cost, batteryGWh: dc.totals.batteryGWh },
    provenance: prov(country),
  }
}

/** The list of tools an agent may call — the whole verifiable surface. */
export const TOOL_REGISTRY = ['get_position', 'cheapest_path', 'dual_credit'] as const
