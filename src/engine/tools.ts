// ───────────────────────────────────────────────────────────────────────────
// AGENT TOOL LAYER — the compliance engine, exposed as verifiable tools.
//
// This is the platform's single grounding surface. Every tool is a thin, typed
// wrapper over an existing engine function; it returns engine-computed values
// ONLY, each tagged with provenance (dataset version, rule pack, basis, the
// exact inputs) so any claim the co-pilot makes is re-runnable and auditable.
//
// Three invariants live here, not in a prompt:
//   1. NEVER INVENT A NUMBER. Agents may compose and quote tool results — never
//      compute them. If a figure has no tool, the co-pilot cannot state it.
//   2. ENTITLEMENTS ARE ENFORCED IN THE EXECUTOR. A market the workspace has not
//      subscribed to is refused here, so a jailbroken prompt cannot reach it.
//   3. ONE EXECUTOR, TWO CALLERS. The browser (deterministic monitor) and the
//      server (LLM tool-use loop) run the same code over the same rule packs;
//      they differ only in which fleet they are pointed at.
// ───────────────────────────────────────────────────────────────────────────
import { getPack, PACK_LIST } from './rulepacks/index.js'
import { getFleet, getMeta } from '../data/fleet.js'
import {
  buildTree, aggregateParent, monthlyCompliance, threeYearAverage, fmtNum,
} from './engine.js'
import { recommend } from './recommend.js'
import { simulateRisk as mcSimulateRisk } from './montecarlo.js'
import { poolOptimise, standings, bestForMaker } from './pooling.js'
import { buildDualCredit } from './china/dualcredit.js'
import {
  baselineScenario, buildForecast, summariseForecast, materializeSpec,
  MARKET_TARGET, type ForecastScenarioDef,
} from './forecast.js'
import {
  outlookRun, bridgeYear, breakEvenAdoption, DRIVER_DEFAULTS, DRIVER_META,
  type DriverSet,
} from './outlook.js'
import { reconcile } from './reconcile.js'
import { scanAnomalies, summariseAnomalies } from './anomaly.js'
import type { CountryId, Scenario, Vehicle, Aggregate } from './types.js'

// ── provenance & result envelope ────────────────────────────────────────────

export interface Provenance {
  dataVersion: string
  refreshed: string | null
  rulePack: CountryId
  /** 'actuals' = the book of record · 'scenario' = levers applied · 'forecast'. */
  basis: string
  /** Coverage tier of the dataset the number came from — a preview fleet must
   *  never be quoted as a market position without saying so. */
  coverage: 'market' | 'partial' | 'preview'
  source: string
}

export interface ToolResult<T> {
  tool: string
  inputs: Record<string, unknown>
  value: T
  provenance: Provenance
  /** Milliseconds the engine spent. Surfaced in the audit trail. */
  ms?: number
}

/** Where the rows come from. The browser reads the live/bundled fleet; the
 *  server reads the WORKSPACE's own imported dataset, so the co-pilot always
 *  reasons over exactly what the screens show. */
export interface FleetSource {
  rows: (c: CountryId) => Vehicle[]
  meta: (c: CountryId) => { datasetVersion: string; lastRefreshed: string | null; source: string }
}

/** The default source: whatever the browser has loaded (live DB else extract). */
export const clientFleetSource: FleetSource = {
  rows: (c) => getFleet(c),
  meta: (c) => { const m = getMeta(c); return { datasetVersion: m.datasetVersion, lastRefreshed: m.lastRefreshed, source: m.source } },
}

/** Build a source over an explicit set of rows (the server's workspace fleets). */
export function fleetSourceFrom(
  fleets: Partial<Record<CountryId, Vehicle[]>>,
  metas: Partial<Record<CountryId, { datasetVersion: string; lastRefreshed: string | null; source: string }>> = {},
): FleetSource {
  return {
    rows: (c) => fleets[c] ?? getFleet(c),
    meta: (c) => metas[c] ?? { ...getMeta(c) },
  }
}

// ── execution context ───────────────────────────────────────────────────────

/** A change the co-pilot wants made to the live workspace. Never applied by the
 *  engine — collected here, applied (or approved first) by the client. */
export interface WorkspaceAction {
  country?: CountryId
  screen?: string
  parent?: string
  drillPath?: string[]
  year?: number
  evSharePct?: number
  massShiftKg?: number
  salesMultiplier?: number
  ecoBoostG?: number
  mix?: Record<string, number>
  creditPrice?: number
  phevUF?: boolean
  poolingEnabled?: boolean
  superCreditsEnabled?: boolean
  /** Plain-language reason, shown on the approval chip. */
  why?: string
}

export interface ToolContext {
  fleet: FleetSource
  /** Markets this workspace has subscribed to. Enforced in `runTool`. */
  allowed: CountryId[]
  /** Pooling & credit-market add-on. Gates the pool optimiser. */
  pooling: boolean
  /** Collected workspace actions, in request order. */
  actions: WorkspaceAction[]
}

export class ToolError extends Error {
  constructor(message: string, readonly code: string = 'tool_error') { super(message) }
}

// ── shared helpers ──────────────────────────────────────────────────────────

const prov = (ctx: ToolContext, country: CountryId, basis = 'actuals'): Provenance => {
  const m = ctx.fleet.meta(country)
  const pack = getPack(country)
  return {
    dataVersion: m.datasetVersion,
    refreshed: m.lastRefreshed,
    rulePack: country,
    basis,
    coverage: pack.coverage.tier,
    source: pack.source,
  }
}

/** Scenario for a year, with optional lever overrides layered on the pack's
 *  neutral baseline. Anything not named stays as-sold. */
const scen = (country: CountryId, year: number, ov: Partial<Scenario> = {}): Scenario =>
  ({ ...baselineScenario(getPack(country)), year, ...ov })

/** Lever names an agent may set. Kept explicit so a stray key from the model
 *  can never reach the engine as an undeclared assumption. */
const LEVERS = ['evSharePct', 'salesMultiplier', 'massShiftKg', 'ecoBoostG', 'targetShiftPct', 'cycleWltp',
  'poolingEnabled', 'superCreditsEnabled', 'phevUF', 'creditPrice', 'cnfEnabled',
  'nevRatioTarget', 'nevCreditPrice'] as const

function leversOf(input: any): Partial<Scenario> {
  const out: Record<string, unknown> = {}
  for (const k of LEVERS) if (input?.[k] != null) out[k] = input[k]
  return out as Partial<Scenario>
}

const makerNodes = (t: Aggregate) => (t.children ?? []).filter((c) => c.rawUnits > 0)
const n2 = (x: number) => +fmtNum(x, 2)
const money = (x: number) => Math.round(x)

/** Resolve a maker name loosely — the model may say "Suzuki" for "Suzuki Motor
 *  Corporation". Exact match wins; then unique prefix; then unique substring. */
function resolveMaker(ctx: ToolContext, country: CountryId, name: string): string {
  const names = [...new Set(ctx.fleet.rows(country).map((v) => v.parent))]
  const exact = names.find((n) => n === name)
  if (exact) return exact
  const q = name.trim().toLowerCase()
  const starts = names.filter((n) => n.toLowerCase().startsWith(q))
  if (starts.length === 1) return starts[0]
  const has = names.filter((n) => n.toLowerCase().includes(q))
  if (has.length === 1) return has[0]
  throw new ToolError(
    `No single maker matches "${name}" in ${getPack(country).name}. Candidates: ${(starts.length ? starts : has).slice(0, 8).join(', ') || names.slice(0, 12).join(', ')}. Call list_makers first.`,
    'maker_not_found',
  )
}

/** The entitlement gate. Exported because the deterministic monitor reaches the
 *  tool functions directly and must be held to the same boundary as the LLM. */
export function assertEntitled(ctx: ToolContext, country: unknown): CountryId {
  const c = String(country ?? '') as CountryId
  if (!PACK_LIST.some((p) => p.id === c)) throw new ToolError(`Unknown market "${country}".`, 'bad_market')
  if (!ctx.allowed.includes(c)) {
    throw new ToolError(
      `This workspace has not subscribed to ${getPack(c).name}. Subscribed markets: ${ctx.allowed.join(', ') || 'none'}. Do not analyse or mention ${getPack(c).name}.`,
      'not_entitled',
    )
  }
  return c
}
const assertMarket = assertEntitled

// ═══════════════════════════════════════════════════════════════════════════
// THE TOOLS
// ═══════════════════════════════════════════════════════════════════════════

export interface MakerPosition {
  name: string; gap: number; fine: number; over: boolean; units: number
  avgMetric: number; limit: number; status: Aggregate['status']; zeroEmissionSharePct: number
}
export interface Position {
  market: string; entity: string; year: number; unit: string; currency: string
  avgMetric: number; limit: number; gap: number; status?: Aggregate['status']
  fine?: number; fineExpression?: string
  marketFine?: number; makersOver?: number; makers?: number
  registrations: number; zeroEmissionSharePct: number
  perMaker?: MakerPosition[]
  note?: string
}

/** The compliance position of a maker, or of the whole market, in one year. */
export function getPosition(ctx: ToolContext, country: CountryId, year: number, maker?: string | null, ov: Partial<Scenario> = {}): ToolResult<Position> {
  const pack = getPack(country), raw = ctx.fleet.rows(country)
  const s = scen(country, year, ov)
  const basis = Object.keys(ov).length ? 'scenario' : 'actuals'
  const inputs = { country, year, maker: maker ?? null, ...ov }

  if (maker) {
    const name = resolveMaker(ctx, country, maker)
    const a = aggregateParent(raw, pack, s, name)
    return {
      tool: 'get_position', inputs: { ...inputs, maker: name },
      value: {
        market: pack.name, entity: name, year, unit: pack.metricUnit, currency: pack.currency,
        avgMetric: n2(a.avgMetric), limit: n2(a.limit), gap: n2(a.gap), status: a.status,
        fine: money(a.fine), fineExpression: a.fineMath.expression,
        registrations: a.rawUnits, zeroEmissionSharePct: Math.round(a.zlevShare * 100),
      },
      provenance: prov(ctx, country, basis),
    }
  }

  // Fines are assessed PER MAKER — whole-market exposure is the SUM of per-maker
  // fines, never the fine of the market average (a clean maker offsets a dirty
  // one in the mean, so the average is routinely under the line at €X00m risk).
  const t = buildTree(raw, pack, s)
  const kids = makerNodes(t)
  const perMaker: MakerPosition[] = kids.map((c) => ({
    name: c.label, gap: n2(c.gap), fine: money(c.fine), over: c.gap > 0.0001, units: c.rawUnits,
    avgMetric: n2(c.avgMetric), limit: n2(c.limit), status: c.status,
    zeroEmissionSharePct: Math.round(c.zlevShare * 100),
  })).sort((a, b) => b.fine - a.fine)

  return {
    tool: 'get_position', inputs,
    value: {
      market: pack.name, entity: 'Whole market', year, unit: pack.metricUnit, currency: pack.currency,
      avgMetric: n2(t.avgMetric), limit: n2(t.limit), gap: n2(t.gap),
      marketFine: money(perMaker.reduce((a, m) => a + m.fine, 0)),
      makersOver: perMaker.filter((m) => m.over).length, makers: perMaker.length,
      registrations: t.rawUnits, zeroEmissionSharePct: Math.round(t.zlevShare * 100),
      perMaker,
      note: 'marketFine is the SUM of per-maker fines. A market average under the line does NOT mean zero exposure — assess each maker.',
    },
    provenance: prov(ctx, country, basis),
  }
}

export interface Route {
  maker: string; year: number; currency: string; unit: string
  gap: number; fineBefore: number; fineAfter: number; cleared: boolean; totalCost: number
  creditsCovered: number
  cheapest: { lever: string; title: string; cost: number; costPerUnit: number } | null
  actions: { rank: number; title: string; detail: string; lever: string; difficulty: string; cost: number; clears: number; fineAvoided: number }[]
}

/** The cheapest costed route to clear a maker — the same optimiser the app runs. */
export function cheapestPath(ctx: ToolContext, country: CountryId, maker: string, year: number, ov: Partial<Scenario> = {}): ToolResult<Route> {
  const pack = getPack(country), raw = ctx.fleet.rows(country)
  const name = resolveMaker(ctx, country, maker)
  const plan = recommend(raw, pack, scen(country, year, ov), name, {})
  const priced = [...plan.actions].filter((a) => a.gramsCleared > 0.0001)
  const cheapest = priced.sort((a, b) => a.cost / a.gramsCleared - b.cost / b.gramsCleared)[0]
  return {
    tool: 'cheapest_path', inputs: { country, maker: name, year, ...ov },
    value: {
      maker: name, year, currency: pack.currency, unit: pack.metricUnit,
      gap: n2(plan.before.gap), fineBefore: money(plan.fineBefore), fineAfter: money(plan.fineAfter),
      cleared: plan.cleared, totalCost: money(plan.totalCost), creditsCovered: n2(plan.creditsCovered),
      cheapest: cheapest ? { lever: cheapest.lever, title: cheapest.title, cost: money(cheapest.cost), costPerUnit: money(cheapest.cost / cheapest.gramsCleared) } : null,
      actions: plan.actions.map((a, i) => ({
        rank: i + 1, title: a.title, detail: a.detail, lever: a.lever, difficulty: a.difficulty,
        cost: money(a.cost), clears: n2(a.gramsCleared), fineAvoided: money(a.fineAvoided),
      })),
    },
    provenance: prov(ctx, country, Object.keys(ov).length ? 'scenario' : 'actuals'),
  }
}

export interface RiskResultOut {
  scope: string; year: number; currency: string
  p10: number; p50: number; p90: number; mean: number; probabilityOfAFine: number
  draws: number
  note: string
}

/** Monte-Carlo exposure: samples ZE-share, volume and mass uncertainty and
 *  re-runs the engine. The only tool that can answer "how likely" or "worst case". */
export function simulateRisk(ctx: ToolContext, country: CountryId, year: number, maker?: string | null): ToolResult<RiskResultOut> {
  const pack = getPack(country), raw = ctx.fleet.rows(country)
  const s = scen(country, year)
  const N = 300
  let r
  if (maker) {
    const name = resolveMaker(ctx, country, maker)
    const by: Record<string, number> = {}; let tot = 0
    for (const v of raw) if (v.year === year && v.parent === name) { by[v.powertrain] = (by[v.powertrain] || 0) + v.sales; tot += v.sales }
    const shares: Record<string, number> = {}
    for (const p in by) shares[p] = tot ? (by[p] / tot) * 100 : 0
    r = mcSimulateRisk({ base: s, groups: [{ key: name, shares }], currentOverrides: {}, fineOf: (sc, o) => aggregateParent(raw, pack, sc, name, o).fine, n: N })
    return {
      tool: 'simulate_risk', inputs: { country, year, maker: name },
      value: { scope: name, year, currency: pack.currency, p10: money(r.p10), p50: money(r.p50), p90: money(r.p90), mean: money(r.mean), probabilityOfAFine: +r.probOver.toFixed(2), draws: N, note: 'P90 is the 1-in-10 bad year, not a worst case.' },
      provenance: prov(ctx, country, 'scenario'),
    }
  }
  const by: Record<string, Record<string, number>> = {}, tot: Record<string, number> = {}
  for (const v of raw) if (v.year === year) { (by[v.parent] ??= {})[v.powertrain] = (by[v.parent]?.[v.powertrain] || 0) + v.sales; tot[v.parent] = (tot[v.parent] || 0) + v.sales }
  const groups = Object.entries(by).map(([mk, b]) => {
    const sh: Record<string, number> = {}
    for (const p in b) sh[p] = tot[mk] ? (b[p] / tot[mk]) * 100 : 0
    return { key: mk, shares: sh }
  })
  r = mcSimulateRisk({ base: s, groups, currentOverrides: {}, fineOf: (sc, o) => (buildTree(raw, pack, sc, o).children ?? []).reduce((a, c) => a + c.fine, 0), n: N })
  return {
    tool: 'simulate_risk', inputs: { country, year, maker: null },
    value: { scope: 'Whole market', year, currency: pack.currency, p10: money(r.p10), p50: money(r.p50), p90: money(r.p90), mean: money(r.mean), probabilityOfAFine: +r.probOver.toFixed(2), draws: N, note: 'Sum of per-maker exposure under sampled ZE-share, volume and mass uncertainty.' },
    provenance: prov(ctx, country, 'scenario'),
  }
}
export interface PoolResultOut {
  market: string; year: number; currency: string; instrument: string
  members: string[]; fineRemoved: number; pooledResidualFine: number
  settlements: { maker: string; role: string; standaloneFine: number; shapleyShare: number; receives: number; pays: number }[]
  note: string
}

/** The value-maximising pool and its fair (Shapley) settlement per member. */
export function optimisePool(ctx: ToolContext, country: CountryId, year: number): ToolResult<PoolResultOut> {
  const pack = getPack(country)
  if (!ctx.pooling) throw new ToolError('The Pooling & credit-market add-on is not active on this workspace. Do not use this tool or open the pooling screen.', 'not_entitled')
  if (!pack.pooling.enabled) throw new ToolError(`${pack.name} assesses every maker standalone — there is no pooling instrument. ${pack.pooling.note}`, 'not_applicable')
  const opt = poolOptimise(ctx.fleet.rows(country), pack, scen(country, year))
  return {
    tool: 'optimise_pool', inputs: { country, year },
    value: {
      market: pack.name, year, currency: pack.currency, instrument: pack.transfer.kind,
      members: opt.members, fineRemoved: money(opt.savings), pooledResidualFine: money(opt.pooledFine),
      settlements: opt.split.map((m) => ({
        maker: m.parent, role: m.role, standaloneFine: money(m.standaloneFine), shapleyShare: money(m.shapley),
        receives: m.finalCost < 0 ? money(-m.finalCost) : 0, pays: m.finalCost > 0 ? money(m.finalCost) : 0,
      })),
      note: pack.transfer.note,
    },
    provenance: prov(ctx, country, 'scenario'),
  }
}

export interface DualCreditOut {
  market: string; year: number; currency: string
  makers: number; makersShort: number
  cafcCredit: number; nevBalance: number; creditsToBuy: number; costToClear: number; batteryGWh: number
  note: string
}

/** China's two-axis dual-credit position (CAFC fuel-economy + NEV volume). */
export function dualCreditPosition(ctx: ToolContext, country: CountryId, year: number): ToolResult<DualCreditOut> {
  const pack = getPack(country)
  if (country !== 'CN') throw new ToolError(`Dual-credit applies to China only; ${pack.name} has a single ${pack.metricUnit} limit. Use get_position.`, 'not_applicable')
  const s = scen(country, year)
  const dc = buildDualCredit(buildTree(ctx.fleet.rows(country), pack, s), s, pack.creditPrice ?? pack.fineRate)
  return {
    tool: 'dual_credit', inputs: { country, year },
    value: {
      market: pack.name, year, currency: pack.currency,
      makers: dc.totals.makers, makersShort: dc.totals.makersOver,
      cafcCredit: Math.round(dc.totals.cafcCredit), nevBalance: Math.round(dc.totals.nevBalance),
      creditsToBuy: Math.round(dc.totals.creditsToBuy), costToClear: money(dc.totals.cost),
      batteryGWh: n2(dc.totals.batteryGWh),
      note: 'A CAFC deficit clears with the entity’s own NEV surplus first; only the residual, plus any NEV deficit, must be bought.',
    },
    provenance: prov(ctx, country, 'actuals'),
  }
}

export interface ForecastOut {
  market: string; target: string; years: number[]; currency: string; unit: string
  firstBreachYear: number | null; cumulativeExposure: number; peakYearFine: number
  finalYear: number; finalMetric: number; finalLimit: number; finalGap: number
  requiredZeShareFinalYear: number | null; zeroEmissionAloneCannotClear: boolean
  limitTightensPct: number
  perYear: { year: number; metric: number; limit: number; gap: number; fine: number }[]
}

/** Project a maker (or the market) across the regime's whole horizon under a
 *  named plan. Levers may ramp: {"from":8,"to":45} interpolates linearly. */
export function runForecast(ctx: ToolContext, country: CountryId, target: string, def?: Partial<ForecastScenarioDef['levers']>, years?: number[]): ToolResult<ForecastOut> {
  const pack = getPack(country), raw = ctx.fleet.rows(country)
  const isMarket = !target || target === MARKET_TARGET || /^(market|whole market|all)$/i.test(target)
  const resolved = isMarket ? MARKET_TARGET : resolveMaker(ctx, country, target)
  const horizon = (years?.length ? years : pack.years).filter((y) => pack.years.includes(y))
  if (!horizon.length) throw new ToolError(`No valid years. ${pack.name} covers ${pack.years[0]}–${pack.years[pack.years.length - 1]}.`, 'bad_years')
  const baseline = baselineScenario(pack)
  const plan = materializeSpec(
    { id: 'ai', name: 'plan', description: '', levers: (def ?? {}) as ForecastScenarioDef['levers'] },
    baseline, horizon,
  )
  const r = buildForecast({ raw, pack, target: resolved, baseline, plan, years: horizon, glide: true, bandN: 0 })
  const sum = summariseForecast(r)
  return {
    tool: 'run_forecast', inputs: { country, target: resolved, levers: def ?? {}, years: horizon },
    value: {
      market: pack.name, target: isMarket ? 'Whole market' : resolved, years: horizon,
      currency: pack.currency, unit: pack.metricUnit,
      firstBreachYear: sum.firstBreachYear, cumulativeExposure: money(sum.cumExposure), peakYearFine: money(sum.peakFine),
      finalYear: sum.finalYear, finalMetric: n2(sum.finalMetric), finalLimit: n2(sum.finalLimit), finalGap: n2(sum.finalGap),
      requiredZeShareFinalYear: sum.requiredEvShareFinal == null ? null : n2(sum.requiredEvShareFinal),
      zeroEmissionAloneCannotClear: sum.evOnlyInfeasible,
      limitTightensPct: n2(r.limitDropPct),
      perYear: r.years.map((y) => ({ year: y.year, metric: n2(y.lMetric), limit: n2(y.lLimit), gap: n2(y.lGap), fine: money(y.lFine) })),
    },
    provenance: prov(ctx, country, 'forecast'),
  }
}

export interface OutlookOut {
  market: string; year: number; currency: string
  drivers: { key: string; label: string; value: number; unit: string }[]
  bridge: { from: number; to: number; effects: { label: string; delta: number }[]; residual: number } | null
  breakEvenZeSharePct: number | null
  note: string
}

/** Fundamentals-driven outlook: what moves the market's exposure year on year
 *  (regulation, volume, technology, ZE mix) and the ZE share that clears it. */
export function outlookBridge(ctx: ToolContext, country: CountryId, year: number, drivers?: Partial<DriverSet>): ToolResult<OutlookOut> {
  const pack = getPack(country), raw = ctx.fleet.rows(country)
  const d: DriverSet = { ...DRIVER_DEFAULTS[country], ...(drivers ?? {}) }
  const vintage = pack.actualsThroughYear ?? pack.defaultYear ?? pack.years[0]
  const cfg = { raw, pack, drivers: d, vintageYear: vintage }
  const b = bridgeYear(cfg, year)
  const be = breakEvenAdoption(cfg, year)
  return {
    tool: 'outlook_bridge', inputs: { country, year, drivers: d },
    value: {
      market: pack.name, year, currency: pack.currency,
      drivers: DRIVER_META.map((m) => ({ key: m.key, label: m.label, value: d[m.key], unit: m.unit })),
      bridge: b ? { from: money(b.from), to: money(b.to), effects: b.effects.map((e) => ({ label: e.label, delta: money(e.delta) })), residual: money(b.residual) } : null,
      breakEvenZeSharePct: be == null ? null : n2(be),
      note: 'Bridge order is disclosed and sequential: regulation, then volume, then CO₂/mass technology, then ZE mix. Effects sum to the year-on-year change by construction.',
    },
    provenance: prov(ctx, country, 'forecast'),
  }
}

export interface LedgerOut {
  market: string; year: number; currency: string; unit: string
  instrument: string; unitName: string; verb: string; supplierLabel: string; takerLabel: string; mechanism: string
  totalSurplus: number; totalDeficit: number; netPosition: number
  creditPrice: number | null
  positions: { maker: string; units: number; headroom: number; balance: number; role: string; fine: number; value: number | null }[]
  note: string
}

/** The credit book: who holds headroom, who is short, and what it is worth —
 *  stated in the regime's own instrument (the EU pools, it does not trade). */
export function creditLedger(ctx: ToolContext, country: CountryId, year: number): ToolResult<LedgerOut> {
  const pack = getPack(country)
  const st = standings(ctx.fleet.rows(country), pack, scen(country, year))
  const price = pack.creditPrice ?? null
  const positions = st.map((s) => ({
    maker: s.parent, units: s.units, headroom: n2(s.headroom), balance: Math.round(s.creditBalance),
    role: s.creditBalance > 0 ? pack.transfer.supplier : s.creditBalance < 0 ? pack.transfer.taker : 'balanced',
    fine: money(s.fine),
    value: price != null ? money(Math.abs(s.creditBalance) * price) : null,
  }))
  const totalSurplus = st.filter((s) => s.creditBalance > 0).reduce((a, s) => a + s.creditBalance, 0)
  const totalDeficit = st.filter((s) => s.creditBalance < 0).reduce((a, s) => a - s.creditBalance, 0)
  return {
    tool: 'credit_ledger', inputs: { country, year },
    value: {
      market: pack.name, year, currency: pack.currency, unit: pack.metricUnit,
      instrument: pack.transfer.kind, unitName: pack.transfer.unit, verb: pack.transfer.verb,
      supplierLabel: pack.transfer.supplier, takerLabel: pack.transfer.taker, mechanism: pack.transfer.note,
      totalSurplus: Math.round(totalSurplus), totalDeficit: Math.round(totalDeficit), netPosition: Math.round(totalSurplus - totalDeficit),
      creditPrice: price, positions,
      note: pack.transfer.kind === 'pool'
        ? `${pack.name} has NO transfer instrument. Headroom is real and valuable but moves by joining a pool — nothing is issued, sold, priced or banked. Never say "sell credits" here.`
        : `Headroom ${pack.transfer.verb}s as ${pack.transfer.unit}s.`,
    },
    provenance: prov(ctx, country, 'actuals'),
  }
}

export interface PricingOut {
  market: string; entity: string; year: number; currency: string
  registrations: number
  fine: number; finePerCar: number
  gap: number; unit: string
  clearCost: number | null; clearCostPerCar: number | null
  creditCost: number | null; creditCostPerCar: number | null
  cheapestRoute: string | null
  note: string
}

/** Compliance economics per car: what the exposure and the fix cost per unit. */
export function pricingImpact(ctx: ToolContext, country: CountryId, year: number, maker?: string | null): ToolResult<PricingOut> {
  const pack = getPack(country), raw = ctx.fleet.rows(country)
  const s = scen(country, year)
  const name = maker ? resolveMaker(ctx, country, maker) : null
  const a = name ? aggregateParent(raw, pack, s, name) : buildTree(raw, pack, s)
  const kids = name ? [] : makerNodes(a)
  const fine = name ? a.fine : kids.reduce((x, c) => x + c.fine, 0)
  const units = a.rawUnits || 1
  let clearCost: number | null = null, route: string | null = null
  if (name) {
    const plan = recommend(raw, pack, s, name, {})
    clearCost = plan.totalCost
    route = plan.actions[0]?.title ?? null
  }
  const price = pack.creditPrice ?? null
  const creditCost = price != null && a.gap > 0 ? a.gap * price * a.rawUnits : null
  return {
    tool: 'pricing_impact', inputs: { country, year, maker: name },
    value: {
      market: pack.name, entity: name ?? 'Whole market', year, currency: pack.currency,
      registrations: a.rawUnits, fine: money(fine), finePerCar: money(fine / units),
      gap: n2(a.gap), unit: pack.metricUnit,
      clearCost: clearCost == null ? null : money(clearCost),
      clearCostPerCar: clearCost == null ? null : money(clearCost / units),
      creditCost: creditCost == null ? null : money(creditCost),
      creditCostPerCar: creditCost == null ? null : money(creditCost / units),
      cheapestRoute: route,
      note: 'Per-car figures divide by actual registrations, not effective (super-credited) units.',
    },
    provenance: prov(ctx, country, 'actuals'),
  }
}

export interface QualityOut {
  market: string; year: number
  verdict: 'pass' | 'warn' | 'fail'
  checks: { label: string; status: string; detail: string }[]
  coverage: { parents: number; models: number; years: number; rows: number; units: number }
  anomalies: { errors: number; warns: number; total: number; byKind: Record<string, number> }
  worstRows: { severity: string; kind: string; label: string; message: string }[]
  datasetTier: string
  note: string
}

/** Can these numbers be filed? Reconciliation + outlier scan over the dataset. */
export function dataQuality(ctx: ToolContext, country: CountryId, year: number): ToolResult<QualityOut> {
  const pack = getPack(country), raw = ctx.fleet.rows(country)
  const rec = reconcile(raw, pack, scen(country, year))
  const rows = raw.filter((v) => v.year === year)
  const an = scanAnomalies(rows)
  const sum = summariseAnomalies(an)
  return {
    tool: 'data_quality', inputs: { country, year },
    value: {
      market: pack.name, year, verdict: rec.worst,
      checks: rec.checks.map((c) => ({ label: c.label, status: c.status, detail: c.detail })),
      coverage: rec.coverage,
      anomalies: sum,
      worstRows: an.filter((a) => a.severity === 'error').slice(0, 8).map((a) => ({ severity: a.severity, kind: a.kind, label: a.label, message: a.message })),
      datasetTier: pack.coverage.tier,
      note: pack.coverage.tier === 'preview'
        ? 'PREVIEW DATASET — a sample fleet carried to exercise the rule pack. Arithmetic is correct; the position is not a market view. Say so in any answer.'
        : pack.coverage.label,
    },
    provenance: prov(ctx, country, 'actuals'),
  }
}

export interface RegBriefOut {
  market: string; regulation: string; regime: string | null; draft: boolean
  unit: string; currency: string; years: number[]
  limitBuiltFrom: string; fineRate: string; illustrativeRates: boolean
  massBasedLimit: boolean; ecoCapThisYear: number | null
  superCredits: string; pooling: string; transfer: string
  cycle: string | null; cycleNote: string | null
  coverage: string; source: string
  limitByYear: { year: number; limit: number; note: string }[]
}

/** The rule pack, in plain language: how the limit is built, what the penalty
 *  is, what flexibilities exist, and where the numbers come from. */
export function regulationBrief(ctx: ToolContext, country: CountryId, year?: number): ToolResult<RegBriefOut> {
  const pack = getPack(country)
  const y = year ?? pack.defaultYear ?? pack.years[0]
  const regime = pack.regimeFor?.(y)
  return {
    tool: 'regulation_brief', inputs: { country, year: y },
    value: {
      market: pack.name, regulation: pack.source, regime: regime?.name ?? null, draft: !!regime?.draft,
      unit: pack.metricUnit, currency: pack.currency, years: pack.years,
      limitBuiltFrom: pack.limitNote, fineRate: pack.fineRateLabel, illustrativeRates: !!pack.illustrativeRates,
      massBasedLimit: pack.massBasedLimit !== false,
      ecoCapThisYear: pack.ecoCap ? pack.ecoCap(y) : null,
      superCredits: pack.credits, pooling: pack.pooling.note, transfer: pack.transfer.note,
      cycle: regime?.cycle ?? null, cycleNote: regime?.cycleNote ?? null,
      coverage: pack.coverage.label, source: pack.source,
      limitByYear: pack.years.map((yy) => { const f = pack.forecast(yy); return { year: yy, limit: n2(f.limit), note: f.note } }),
    },
    provenance: prov(ctx, country, 'rulepack'),
  }
}

export interface MonthlyOut {
  market: string; entity: string; year: number; unit: string; currency: string
  monthsFiled: number
  months: { month: number; label: string; units: number; metric: number; ytdMetric: number; ytdLimit: number; ytdGap: number; ytdExposureIfYearEnded: number }[]
  threeYearAverage: { metric: number; limit: number; gap: number; years: number[]; fine: number; singleYearFine: number; saved: number } | null
  note: string
}

/** Where a maker stands part-way through the compliance year, month by month. */
export function monthlyTrace(ctx: ToolContext, country: CountryId, year: number, maker?: string | null): ToolResult<MonthlyOut> {
  const pack = getPack(country), raw = ctx.fleet.rows(country)
  const name = maker ? resolveMaker(ctx, country, maker) : null
  const rows = name ? raw.filter((v) => v.parent === name) : raw
  const pts = monthlyCompliance(rows, pack, scen(country, year))
  // EU 2025–2027 averaging flexibility (Reg (EU) 2025/1214) — a maker is judged
  // on its three-year weighted average, so a single bad year need not be a fine.
  let ty: MonthlyOut['threeYearAverage'] = null
  if (name && country === 'EU' && [2025, 2026, 2027].includes(year)) {
    const t = threeYearAverage(raw, pack, scen(country, year), name)
    ty = { metric: n2(t.avgMetric), limit: n2(t.avgLimit), gap: n2(t.gap), years: t.years, fine: money(t.fine), singleYearFine: money(t.singleYearFine), saved: money(t.saved) }
  }
  return {
    tool: 'monthly_trace', inputs: { country, year, maker: name },
    value: {
      market: pack.name, entity: name ?? 'Whole market', year, unit: pack.metricUnit, currency: pack.currency,
      monthsFiled: pts.length,
      months: pts.map((p) => ({
        month: p.month, label: p.label, units: p.units, metric: n2(p.metric),
        ytdMetric: n2(p.ytdMetric), ytdLimit: n2(p.ytdLimit), ytdGap: n2(p.ytdGap),
        ytdExposureIfYearEnded: money(p.ytdFineIfYearEnded),
      })),
      threeYearAverage: ty,
      note: pts.length
        ? 'ytdExposureIfYearEnded is what the year would cost if it closed on that month. It is NOT a levied fine — the penalty is only assessed once the full year is filed.'
        : `${pack.name} ${year} carries no monthly split in this dataset.`,
    },
    provenance: prov(ctx, country, 'actuals'),
  }
}

export interface PortfolioOut {
  markets: { market: string; country: CountryId; year: number; currency: string; fleet: number; limit: number; unit: string; makers: number; makersOver: number; exposure: number; registrations: number; coverage: string }[]
  note: string
}

/** The group view: every subscribed market's position side by side. The only
 *  tool that crosses markets — currencies are NOT summed. */
export function portfolio(ctx: ToolContext, countries?: CountryId[], year?: number): ToolResult<PortfolioOut> {
  const list = (countries?.length ? countries : ctx.allowed).filter((c) => ctx.allowed.includes(c))
  if (!list.length) throw new ToolError('No subscribed markets to compare.', 'not_entitled')
  const markets = list.map((c) => {
    const pack = getPack(c)
    const y = year && pack.years.includes(year) ? year : (pack.defaultYear ?? pack.years[0])
    const t = buildTree(ctx.fleet.rows(c), pack, scen(c, y))
    const kids = makerNodes(t)
    return {
      market: pack.name, country: c, year: y, currency: pack.currency,
      fleet: n2(t.avgMetric), limit: n2(t.limit), unit: pack.metricUnit,
      makers: kids.length, makersOver: kids.filter((k) => k.gap > 0.0001).length,
      exposure: money(kids.reduce((a, k) => a + k.fine, 0)), registrations: t.rawUnits,
      coverage: pack.coverage.tier,
    }
  })
  return {
    tool: 'portfolio', inputs: { countries: list, year: year ?? null },
    value: { markets, note: 'Exposure is per market in its OWN currency — never add them together. Compare relative severity, not totals.' },
    provenance: { ...prov(ctx, list[0], 'actuals'), rulePack: list[0] },
  }
}

/** Pool partners worth approaching for one maker (regimes that pool/trade). */
export function poolPartners(ctx: ToolContext, country: CountryId, maker: string, year: number): ToolResult<{ market: string; maker: string; instrument: string; standaloneFine: number; options: { rank: number; type: string; label: string; detail: string; cost: number; best: boolean }[]; note: string }> {
  const pack = getPack(country)
  if (!ctx.pooling) throw new ToolError('The Pooling & credit-market add-on is not active on this workspace.', 'not_entitled')
  if (!pack.pooling.enabled) throw new ToolError(`${pack.name} assesses every maker standalone. ${pack.pooling.note}`, 'not_applicable')
  const name = resolveMaker(ctx, country, maker)
  const s = scen(country, year)
  const raw = ctx.fleet.rows(country)
  const opts = [...bestForMaker(raw, pack, s, name)].sort((a, b) => a.cost - b.cost)
  return {
    tool: 'pool_partners', inputs: { country, maker: name, year },
    value: {
      market: pack.name, maker: name, instrument: pack.transfer.kind,
      standaloneFine: money(aggregateParent(raw, pack, s, name).fine),
      options: opts.map((o, k) => ({ rank: k + 1, type: o.type, label: o.label, detail: o.detail, cost: money(o.cost), best: k === 0 })),
      note: `${pack.transfer.note} Options are ranked by total cost to ${name}; "fine" is the do-nothing baseline.`,
    },
    provenance: prov(ctx, country, 'scenario'),
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXECUTOR — the single entry point. Entitlements enforced here.
// ═══════════════════════════════════════════════════════════════════════════

/** Every tool an agent may call. Adding a name here without a case below is a
 *  build-time-visible mistake, not a runtime surprise. */
export const TOOL_REGISTRY = [
  'list_makers', 'get_position', 'cheapest_path', 'simulate_risk', 'optimise_pool',
  'pool_partners', 'dual_credit', 'run_forecast', 'outlook_bridge', 'credit_ledger',
  'pricing_impact', 'data_quality', 'regulation_brief', 'monthly_trace', 'portfolio',
  'update_workspace',
] as const
export type ToolName = (typeof TOOL_REGISTRY)[number]

export function runTool(name: string, input: any, ctx: ToolContext): ToolResult<unknown> {
  const t0 = Date.now()
  const stamp = <T,>(r: ToolResult<T>): ToolResult<T> => ({ ...r, ms: Date.now() - t0 })
  const i = input ?? {}

  // `portfolio` validates its own list; every other tool is single-market.
  if (name === 'portfolio') {
    const cs = Array.isArray(i.countries) ? i.countries.map((c: unknown) => assertMarket(ctx, c)) : undefined
    return stamp(portfolio(ctx, cs, i.year))
  }
  if (name === 'update_workspace') {
    const a: WorkspaceAction = { ...i }
    if (a.country) a.country = assertMarket(ctx, a.country)
    if (a.screen === 'pooling' && !ctx.pooling) throw new ToolError('The Pooling add-on is not active — do not open the pooling screen.', 'not_entitled')
    ctx.actions.push(a)
    return stamp({ tool: 'update_workspace', inputs: a as Record<string, unknown>, value: { staged: true, note: 'Proposed to the user for approval; the workspace has not moved yet.' }, provenance: { dataVersion: '—', refreshed: null, rulePack: (a.country ?? ctx.allowed[0]) as CountryId, basis: 'ui', coverage: 'market', source: 'workspace' } })
  }

  const country = assertMarket(ctx, i.country)
  const pack = getPack(country)
  const year: number = i.year ?? pack.defaultYear ?? pack.years[0]
  if (name !== 'list_makers' && name !== 'regulation_brief' && name !== 'run_forecast' && !pack.years.includes(year)) {
    throw new ToolError(`${pack.name} covers ${pack.years.join(', ')}. ${year} is outside the regime's horizon.`, 'bad_year')
  }

  switch (name) {
    case 'list_makers': {
      const rows = ctx.fleet.rows(country)
      const byMaker = new Map<string, number>()
      for (const v of rows) if (v.year === year) byMaker.set(v.parent, (byMaker.get(v.parent) ?? 0) + v.sales)
      const makers = [...byMaker.entries()].sort((a, b) => b[1] - a[1]).map(([name_, units]) => ({ maker: name_, registrations: units }))
      return stamp({ tool: 'list_makers', inputs: { country, year }, value: { market: pack.name, year, makers }, provenance: prov(ctx, country) })
    }
    case 'get_position': return stamp(getPosition(ctx, country, year, i.maker, leversOf(i)))
    case 'cheapest_path': {
      if (!i.maker) throw new ToolError('cheapest_path needs a maker — the optimiser works on one compliance entity at a time.', 'bad_input')
      return stamp(cheapestPath(ctx, country, i.maker, year, leversOf(i)))
    }
    case 'simulate_risk': return stamp(simulateRisk(ctx, country, year, i.maker))
    case 'optimise_pool': return stamp(optimisePool(ctx, country, year))
    case 'pool_partners': {
      if (!i.maker) throw new ToolError('pool_partners needs a maker.', 'bad_input')
      return stamp(poolPartners(ctx, country, i.maker, year))
    }
    case 'dual_credit': return stamp(dualCreditPosition(ctx, country, year))
    case 'run_forecast': return stamp(runForecast(ctx, country, i.target ?? i.maker ?? MARKET_TARGET, i.levers, i.years))
    case 'outlook_bridge': return stamp(outlookBridge(ctx, country, year, i.drivers))
    case 'credit_ledger': return stamp(creditLedger(ctx, country, year))
    case 'pricing_impact': return stamp(pricingImpact(ctx, country, year, i.maker))
    case 'data_quality': return stamp(dataQuality(ctx, country, year))
    case 'regulation_brief': return stamp(regulationBrief(ctx, country, i.year))
    case 'monthly_trace': return stamp(monthlyTrace(ctx, country, year, i.maker))
    default:
      throw new ToolError(`Unknown tool "${name}". Available: ${TOOL_REGISTRY.join(', ')}.`, 'unknown_tool')
  }
}

/** Run a tool and never throw — the shape the LLM loop feeds back as a
 *  tool_result. An error is information the model can act on (pick another
 *  maker, drop the market), not a crash. */
export function runToolSafe(name: string, input: any, ctx: ToolContext): { ok: true; result: ToolResult<unknown> } | { ok: false; error: { code: string; message: string } } {
  try {
    return { ok: true, result: runTool(name, input, ctx) }
  } catch (e: any) {
    return { ok: false, error: { code: e?.code ?? 'tool_error', message: String(e?.message ?? e) } }
  }
}

/** A browser-side context over the loaded fleet. */
export function clientContext(allowed: CountryId[], pooling: boolean): ToolContext {
  return { fleet: clientFleetSource, allowed, pooling, actions: [] }
}
