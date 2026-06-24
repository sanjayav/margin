// ───────────────────────────────────────────────────────────────────────────
// Monte-Carlo €-at-risk. The deterministic engine gives one number; reality has
// a distribution. We sample the uncertain levers (zero-emission share, sales
// volume, fleet mass) around the current assumptions and re-run the REAL engine
// for each draw — so the band is grounded, not a guess. Returns P10/P50/P90, the
// probability of a fine, and a histogram. No incumbent ships this (see BENCHMARK).
// ───────────────────────────────────────────────────────────────────────────
import type { RulePack, Scenario, Vehicle } from './types.js'
import { aggregateParent } from './engine.js'

export interface RiskResult {
  p10: number; p50: number; p90: number; mean: number
  probOver: number // fraction of draws that incur a fine
  buckets: { x0: number; x1: number; count: number }[]
  n: number
}

// standard normal via Box–Muller
function gauss(): number {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))

/** A powertrain mix targeting a given BEV %, scaling the rest from a baseline. */
function mixFromBEV(shares: Record<string, number>, bev: number): Record<string, number> {
  const base = shares['BEV'] ?? 0
  const scale = 100 - base > 0 ? (100 - bev) / (100 - base) : 0
  const mix: Record<string, number> = {}
  for (const p of Object.keys(shares)) mix[p] = p === 'BEV' ? bev : (shares[p] ?? 0) * scale
  return mix
}

/** A scope to perturb independently. key=null perturbs the global scenario.mix
 *  (single group); a string key (Maker or Maker/Model) perturbs that override —
 *  so at market level each maker drifts on its OWN BEV share, preserving the
 *  heterogeneity that actually drives fines. */
export interface RiskGroup { key: string | null; shares: Record<string, number> }

export interface RiskOpts {
  base: Scenario
  groups: RiskGroup[]
  currentOverrides: Record<string, Partial<Scenario>>
  fineOf: (s: Scenario, ov: Record<string, Partial<Scenario>>) => number
  n?: number
  bevSigmaPP?: number // 1σ on each group's BEV-share, in percentage points
  salesSigma?: number // 1σ on sales multiplier (relative, global)
  massSigmaKg?: number // 1σ on mass drift (global)
}

export function simulateRisk(opts: RiskOpts): RiskResult {
  const { base, groups, currentOverrides, fineOf,
    n = 220, bevSigmaPP = 8, salesSigma = 0.08, massSigmaKg = 25 } = opts
  const fines: number[] = []

  for (let i = 0; i < n; i++) {
    const sales = Math.max(0.3, base.salesMultiplier * (1 + gauss() * salesSigma))
    const s: Scenario = { ...base, salesMultiplier: sales, massShiftKg: base.massShiftKg + gauss() * massSigmaKg }
    const ov: Record<string, Partial<Scenario>> = { ...currentOverrides }
    for (const g of groups) {
      const mix = mixFromBEV(g.shares, clamp((g.shares['BEV'] ?? 0) + gauss() * bevSigmaPP, 0, 100))
      if (g.key) ov[g.key] = { ...(currentOverrides[g.key] ?? {}), mix }
      else s.mix = mix
    }
    fines.push(Math.max(0, fineOf(s, ov)))
  }

  fines.sort((a, b) => a - b)
  const q = (p: number) => fines[clamp(Math.floor(p * fines.length), 0, fines.length - 1)]
  const mean = fines.reduce((a, b) => a + b, 0) / fines.length
  const probOver = fines.filter((f) => f > 0).length / fines.length

  const lo = fines[0], hi = fines[fines.length - 1]
  const span = hi - lo || 1
  const B = 10
  const buckets = Array.from({ length: B }, (_, k) => ({ x0: lo + (span * k) / B, x1: lo + (span * (k + 1)) / B, count: 0 }))
  for (const f of fines) buckets[clamp(Math.floor(((f - lo) / span) * B), 0, B - 1)].count++

  return { p10: q(0.1), p50: q(0.5), p90: q(0.9), mean, probOver, buckets, n }
}

// ── Forecast confidence bands (per maker) ─────────────────────────────────────
export interface YearBand { year: number; metric: number; limit: number; p10: number; p50: number; p90: number; probOver: number }

/** For each year, sample the maker's BEV share, sales and mass around as-sold and
 *  return the fleet-metric P10/P50/P90 ribbon + the probability it's over the line. */
export function simulateForecastMaker(
  raw: Vehicle[], pack: RulePack, base: Scenario, parent: string, years: number[],
  n = 140, bevSigmaPP = 8, salesSigma = 0.08, massSigmaKg = 25,
): YearBand[] {
  return years.map((year) => {
    const by: Record<string, number> = {}
    let tot = 0
    for (const v of raw) if (v.year === year && v.parent === parent) { by[v.powertrain] = (by[v.powertrain] ?? 0) + v.sales; tot += v.sales }
    const shares: Record<string, number> = {}
    for (const p of Object.keys(by)) shares[p] = tot ? (by[p] / tot) * 100 : 0
    const baseBev = shares['BEV'] ?? 0

    const det = aggregateParent(raw, pack, { ...base, year, mix: null, salesMultiplier: 1, massShiftKg: 0 }, parent)
    const metrics: number[] = []
    let over = 0
    for (let i = 0; i < n; i++) {
      const mix = mixFromBEV(shares, clamp(baseBev + gauss() * bevSigmaPP, 0, 100))
      const sales = Math.max(0.3, base.salesMultiplier * (1 + gauss() * salesSigma))
      const a = aggregateParent(raw, pack, { ...base, year, mix, salesMultiplier: sales, massShiftKg: base.massShiftKg + gauss() * massSigmaKg }, parent)
      metrics.push(a.avgMetric)
      if (a.gap > 0) over++
    }
    metrics.sort((a, b) => a - b)
    const q = (p: number) => metrics[clamp(Math.floor(p * metrics.length), 0, metrics.length - 1)]
    return { year, metric: det.avgMetric, limit: det.limit, p10: q(0.1), p50: q(0.5), p90: q(0.9), probOver: over / n }
  })
}
