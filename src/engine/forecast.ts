// ───────────────────────────────────────────────────────────────────────────
// Autocred AI · forecast engine (pure)
//
// One place that turns "a scenario" into a full multi-year trajectory: the
// baseline (hold today's mix), the plan (your levers — optionally ramping year
// by year), the Monte-Carlo confidence ribbon, the compliance glide path, the
// regulatory cliffs, and the headline KPIs.
//
// Both the Forecast screen and the AI forecast tools compute through THIS
// function, so a chart and an AI brief can never disagree. Every number still
// comes from the deterministic engine — nothing here estimates.
// ───────────────────────────────────────────────────────────────────────────
import type { Aggregate, RulePack, Scenario, Vehicle } from './types.js'
import { aggregateParent, buildTree } from './engine.js'
import { simulateForecastMaker, type YearBand } from './montecarlo.js'

/** Sentinel target: forecast the whole market (Σ per-maker fines, so a clean
 *  maker can't offset a dirty one) rather than a single maker. */
export const MARKET_TARGET = '__market__'

/** The neutral "hold today's mix" reference the plan is measured against.
 *  Matches the baseline the Forecast screen has always used. */
export function baselineScenario(pack: RulePack): Scenario {
  return {
    year: pack.years[0],
    evSharePct: null,
    salesMultiplier: 1,
    massShiftKg: 0,
    ecoBoostG: 0,
    poolingEnabled: false,
    superCreditsEnabled: pack.id === 'IN',
    mix: null,
    phevUF: true,
    creditPrice: null,
  }
}

/** A forecast scenario definition: base levers, plus OPTIONAL per-year evolution.
 *
 *  For a given year the effective scenario is  base → ramp(year) → perYear[year]
 *  (most-specific last, then `year` is pinned to the projected year). This is what
 *  lets a scenario ramp — e.g. BEV share 22% (2025) → 65% (2030) — instead of
 *  applying one flat lever to every year, which is all a bare `Scenario` can do. */
export interface ScenarioSpec {
  base: Scenario
  /** Exact lever overrides for specific years (wins over `ramp`). */
  perYear?: Record<number, Partial<Scenario>>
  /** Computed lever ramp; receives the year, its 0-based index and the horizon. */
  ramp?: (year: number, index: number, years: number[]) => Partial<Scenario>
}

/** Accept either a plain `Scenario` (flat, applied to every year) or a full spec. */
export function toSpec(s: Scenario | ScenarioSpec): ScenarioSpec {
  return 'base' in s ? (s as ScenarioSpec) : { base: s as Scenario }
}

/** The effective scenario a spec resolves to for one projected year. */
export function scenarioForYear(spec: ScenarioSpec, year: number, index: number, years: number[]): Scenario {
  return {
    ...spec.base,
    ...(spec.ramp ? spec.ramp(year, index, years) : {}),
    ...(spec.perYear?.[year] ?? {}),
    year,
  }
}

/** One projected year: the as-sold baseline (b*), the plan (l*), and the
 *  zero-emission share the baseline would need to just clear the limit (`req`). */
export interface ForecastYear {
  year: number
  note: string
  // baseline — hold today's mix
  bMetric: number
  bLimit: number
  bGap: number
  bFine: number
  bStatus: Aggregate['status']
  bShare: number
  // plan — your levers (may ramp per year)
  lMetric: number
  lLimit: number
  lGap: number
  lFine: number
  lStatus: Aggregate['status']
  /** EV-only share needed to clear the baseline limit this year; null if even
   *  95% zero-emission can't (electrification alone is infeasible that year). */
  req: number | null
}

export interface ForecastResult {
  years: ForecastYear[]
  bands: YearBand[]           // Monte-Carlo P10–P90 ribbon (per maker; [] for market)
  cumBase: number            // Σ baseline fines over the horizon
  cumPlan: number            // Σ plan fines over the horizon
  firstBreach: ForecastYear | null
  peak: number               // worst single-year baseline fine
  first: ForecastYear
  last: ForecastYear
  limitDropPct: number       // how much the limit tightens first→last, %
  reductionNeeded: number    // metric to shed to clear the final-year limit
  cliffs: number[]           // per-year fractional limit drop vs the prior year
  maxDrop: number            // steepest cliff
  isMarket: boolean
}

export interface ForecastInput {
  raw: Vehicle[]
  pack: RulePack
  /** A maker name, or MARKET_TARGET for the whole market. */
  target: string
  /** The as-sold reference; defaults to the neutral baseline for the pack. */
  baseline?: Scenario
  /** The plan to project — a flat Scenario or a ramping ScenarioSpec. */
  plan: Scenario | ScenarioSpec
  /** Per-scope overrides applied to the PLAN only (never the baseline). */
  overrides?: Record<string, Partial<Scenario>>
  /** Which years to project; defaults to the pack's whole horizon. */
  years?: number[]
  /** Compute the EV-only glide path (up to ~96 engine calls/year). Default true. */
  glide?: boolean
  /** Monte-Carlo draws for the per-maker ribbon; 0 disables. Default 140. */
  bandN?: number
  /** Outlook hook: a synthetic fleet per projected year (fundamentals-driven
   *  volumes/CO₂/mass). When present, the PLAN computes on this fleet while the
   *  as-sold baseline keeps `raw` — so a case line is always measured against
   *  the same hold-today's-mix reference. */
  fleetForYear?: (year: number) => Vehicle[]
}

// ── Serializable scenario descriptors (the AI ⇄ client ⇄ engine wire format) ──
//
// The forecast API and the UI can't ship engine `ScenarioSpec`s over the wire
// (the `ramp` is a function). Instead the AI emits — and the client stores — a
// plain `ForecastScenarioDef`: each lever is either a flat value or a {from,to}
// ramp. `materializeSpec` linearly interpolates it into a real `ScenarioSpec`
// grounded on a baseline, so the same numbers come out on the server and the UI.

/** A lever that is either constant across the horizon or ramps linearly. */
export type Ramp = number | { from: number; to: number }

/** A serializable, engine-computable forecast scenario. `null`/omitted levers are
 *  left at the baseline. `evSharePct` uses a number/ramp to FORCE a zero-emission
 *  share, or null to keep the fleet's as-sold mix. */
export interface ForecastScenarioDef {
  id: string
  name: string
  description: string
  color?: string
  kind?: 'baseline' | 'ai' | 'user'
  levers: {
    evSharePct?: Ramp | null
    salesMultiplier?: Ramp | null
    massShiftKg?: Ramp | null
    ecoBoostG?: Ramp | null
    targetShiftPct?: Ramp | null
    poolingEnabled?: boolean | null
    superCreditsEnabled?: boolean | null
    phevUF?: boolean | null
    creditPrice?: number | null
  }
  /** Narrative annotations (e.g. "2027 · diesel ban") — display only. */
  events?: { year: number; label: string }[]
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))

/** Value of a ramp lever at horizon index `i` of `n` (linear interpolation). */
function rampAt(r: Ramp, i: number, n: number): number {
  if (typeof r === 'number') return r
  return n <= 1 ? r.to : r.from + (r.to - r.from) * (i / (n - 1))
}

/** Interpolate a `ForecastScenarioDef` into an engine `ScenarioSpec`. Levels that
 *  are null/undefined fall through to the baseline; numeric/ramp levers are applied
 *  per year (so a scenario can ramp BEV share across the whole horizon). */
export function materializeSpec(def: ForecastScenarioDef, baseline: Scenario, years: number[]): ScenarioSpec {
  const L = def.levers ?? {}
  const n = years.length
  const perYear: Record<number, Partial<Scenario>> = {}
  years.forEach((y, i) => {
    const p: Partial<Scenario> = {}
    if (L.evSharePct != null) p.evSharePct = clamp(Math.round(rampAt(L.evSharePct, i, n)), 0, 95)
    if (L.salesMultiplier != null) p.salesMultiplier = Math.max(0, rampAt(L.salesMultiplier, i, n))
    if (L.massShiftKg != null) p.massShiftKg = rampAt(L.massShiftKg, i, n)
    if (L.ecoBoostG != null) p.ecoBoostG = Math.max(0, rampAt(L.ecoBoostG, i, n))
    if (L.targetShiftPct != null) p.targetShiftPct = rampAt(L.targetShiftPct, i, n)
    if (L.poolingEnabled != null) p.poolingEnabled = L.poolingEnabled
    if (L.superCreditsEnabled != null) p.superCreditsEnabled = L.superCreditsEnabled
    if (L.phevUF != null) p.phevUF = L.phevUF
    if (L.creditPrice != null) p.creditPrice = L.creditPrice
    perYear[y] = p
  })
  return { base: baseline, perYear }
}

/** Compact, wire-friendly summary of a computed forecast — what the AI brief and
 *  the compare matrix are built from (all numbers straight off the engine). */
export interface ForecastSummary {
  firstBreachYear: number | null
  cumExposure: number       // Σ plan fines over the horizon
  peakFine: number          // worst single plan year
  finalYear: number
  finalGap: number          // plan gap in the last year (over the limit if > 0)
  finalMetric: number
  finalLimit: number
  requiredEvShareFinal: number | null  // ZE share the baseline needs in the last year
  evOnlyInfeasible: boolean            // some year no ZE share alone can clear
}

export function summariseForecast(r: ForecastResult): ForecastSummary {
  const planBreach = r.years.find((y) => y.lGap > 0) ?? null
  return {
    firstBreachYear: planBreach ? planBreach.year : null,
    cumExposure: r.cumPlan,
    peakFine: Math.max(...r.years.map((y) => y.lFine), 0),
    finalYear: r.last.year,
    finalGap: r.last.lGap,
    finalMetric: r.last.lMetric,
    finalLimit: r.last.lLimit,
    requiredEvShareFinal: r.last.req,
    evOnlyInfeasible: r.years.some((y) => y.req == null && y.bGap > 0),
  }
}

/** Turn one scenario into a full multi-year compliance trajectory. */
export function buildForecast(input: ForecastInput): ForecastResult {
  const { raw, pack, target, overrides = {}, glide = true } = input
  const years = input.years ?? pack.years
  const isMarket = target === MARKET_TARGET
  const parent = isMarket ? '' : target
  const baseline = input.baseline ?? baselineScenario(pack)
  const plan = toSpec(input.plan)

  // The whole-market fine is the SUM of per-maker fines — a clean maker cannot
  // offset a dirty one, exactly as the board verdict assesses it.
  const marketFine = (t: Aggregate) => (t.children ?? []).reduce((a, c) => a + c.fine, 0)
  const nodeFor = (sc: Scenario, ov: Record<string, Partial<Scenario>>, fleet: Vehicle[] = raw): Aggregate => {
    if (isMarket) {
      const t = buildTree(fleet, pack, sc, ov)
      return { ...t, fine: marketFine(t), status: t.rawUnits === 0 ? 'no-sales' : t.gap > 0 ? 'fine' : 'compliant' }
    }
    return aggregateParent(fleet, pack, sc, parent, ov)
  }

  const rows: ForecastYear[] = years.map((y, i) => {
    const planFleet = input.fleetForYear ? input.fleetForYear(y) : raw
    const b = nodeFor({ ...baseline, year: y }, {})
    const l = nodeFor(scenarioForYear(plan, y, i, years), overrides, planFleet)
    let req: number | null = null
    if (glide) {
      for (let s = 0; s <= 95; s += 1) {
        const a = nodeFor({ ...baseline, year: y, evSharePct: s }, {})
        if (a.gap <= 0.0001) { req = s; break }
      }
    }
    return {
      year: y,
      note: pack.forecast(y).note,
      bMetric: b.avgMetric, bLimit: b.limit, bGap: b.gap, bFine: b.fine, bStatus: b.status, bShare: Math.round(b.zlevShare * 100),
      lMetric: l.avgMetric, lLimit: l.limit, lGap: l.gap, lFine: l.fine, lStatus: l.status,
      req,
    }
  })

  const bandN = input.bandN ?? 140
  const bands = isMarket || bandN <= 0 ? [] : simulateForecastMaker(raw, pack, baseline, parent, years, bandN)

  const cumBase = rows.reduce((a, s) => a + s.bFine, 0)
  const cumPlan = rows.reduce((a, s) => a + s.lFine, 0)
  const firstBreach = rows.find((s) => s.bGap > 0) ?? null
  const peak = Math.max(...rows.map((s) => s.bFine), 0)
  const first = rows[0]
  const last = rows[rows.length - 1]
  const limitDropPct = first && first.bLimit > 0 ? Math.round((1 - last.bLimit / first.bLimit) * 100) : 0
  const reductionNeeded = last ? Math.max(0, last.bMetric - last.bLimit) : 0
  const cliffs = rows.map((s, i) => (i > 0 && rows[i - 1].bLimit > 0 ? (rows[i - 1].bLimit - s.bLimit) / rows[i - 1].bLimit : 0))
  const maxDrop = Math.max(...cliffs, 0)

  return { years: rows, bands, cumBase, cumPlan, firstBreach, peak, first, last, limitDropPct, reductionNeeded, cliffs, maxDrop, isMarket }
}
