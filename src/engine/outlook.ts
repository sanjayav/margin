// ───────────────────────────────────────────────────────────────────────────
// Autocred AI · OUTLOOK engine (pure) — the fundamentals layer under Forecast.
//
// A Big-4-grade forecast is a driver tree, not an extrapolation. This module
// owns the drivers (the Assumption Book), turns them into a synthetic per-year
// fleet (volumes × mix × attributes), and provides the audit artifacts:
//   · adoptionShare      S-curve of zero-emission share (mandate-floored)
//   · outlookFleetForYear volumes/CO₂/mass transformed base-year rows
//   · casePlan           per-year scenario (the ZE share path) for a case
//   · CASES              Base / Upside / Downside driver deltas
//   · bridgeYear         YoY fine decomposition: regulation+volume+attr+mix
//   · twoWay             sensitivity matrix over two drivers
//   · breakEvenAdoption  ZE horizon share at which a year's fine reaches zero
//
// Everything downstream still computes through the deterministic compliance
// engine — the outlook only *builds fleets*; it never estimates a fine itself.
// ───────────────────────────────────────────────────────────────────────────
import type { CountryId, RulePack, Scenario, Vehicle } from './types.js'
import { buildTree } from './engine.js'
import { baselineScenario } from './forecast.js'

// ── the driver registry ──────────────────────────────────────────────────────
export type DriverKey = 'marketGrowth' | 'evShareHorizon' | 'iceCo2Improve' | 'massDrift'
export type DriverSet = Record<DriverKey, number>

export interface DriverMeta {
  key: DriverKey
  label: string
  unit: string
  min: number
  max: number
  step: number
  rationale: string
  source: string
  owner: 'Market intelligence' | 'Powertrain engineering' | 'Regulatory affairs'
}

export const DRIVER_META: DriverMeta[] = [
  {
    key: 'marketGrowth', label: 'Market growth', unit: '%/yr', min: -5, max: 10, step: 0.5,
    rationale: 'Total new-registration volume trend; makers hold share (mean-reverting extremes is a case, not the base).',
    source: 'Recent registrations trend (EEA / SIAM / VFACTS / SMMT)', owner: 'Market intelligence',
  },
  {
    key: 'evShareHorizon', label: 'Zero-emission share at horizon', unit: '%', min: 0, max: 95, step: 1,
    rationale: 'S-curve from today\'s as-sold ZE share to this end-of-horizon share; floored by the statutory mandate where one exists (UK VETS).',
    source: 'IEA Global EV Outlook · ICCT market monitor · statutory trajectory', owner: 'Market intelligence',
  },
  {
    key: 'iceCo2Improve', label: 'Combustion CO₂ improvement', unit: '%/yr', min: 0, max: 5, step: 0.25,
    rationale: 'Tailpipe reduction of the non-ZE pool per year — engine efficiency plus continued hybridisation of the combustion mix.',
    source: 'ICCT technology assessments · historical EEA fleet drift', owner: 'Powertrain engineering',
  },
  {
    key: 'massDrift', label: 'Fleet mass drift', unit: 'kg/yr', min: -20, max: 20, step: 1,
    rationale: 'Segment creep (SUV shift) raises kerb/test mass; mass-based limits move with the fleet, so this affects target AND performance.',
    source: 'EEA mass-in-running-order trend · segment mix history', owner: 'Market intelligence',
  },
]

/** Per-market defaults — every number is an editable assumption with the
 *  rationale/source above, not a hidden constant. */
export const DRIVER_DEFAULTS: Record<CountryId, DriverSet> = {
  EU: { marketGrowth: 1.0, evShareHorizon: 55, iceCo2Improve: 1.5, massDrift: 5 },
  UK: { marketGrowth: 1.5, evShareHorizon: 80, iceCo2Improve: 1.5, massDrift: 5 }, // horizon = the 2030 ZEV mandate
  IN: { marketGrowth: 4.5, evShareHorizon: 30, iceCo2Improve: 1.75, massDrift: 8 }, // 30@30 ambition; SUV shift strongest
  AU: { marketGrowth: 1.5, evShareHorizon: 45, iceCo2Improve: 1.5, massDrift: 4 },
}

// ── cases (the scenario matrix) ──────────────────────────────────────────────
export type CaseId = 'base' | 'upside' | 'downside'
export interface CaseDef { id: CaseId; name: string; blurb: string; delta: Partial<DriverSet>; defaultWeight: number }
export const CASES: CaseDef[] = [
  { id: 'base', name: 'Base case', blurb: 'house view — the Assumption Book as signed off', delta: {}, defaultWeight: 0.5 },
  {
    id: 'upside', name: 'Upside', blurb: 'faster transition — adoption +10pp, tech +0.5%/yr, mass flat',
    delta: { evShareHorizon: +10, iceCo2Improve: +0.5, massDrift: -3, marketGrowth: -0.5 }, defaultWeight: 0.25,
  },
  {
    id: 'downside', name: 'Downside', blurb: 'stalled transition — adoption −10pp, tech −0.5%/yr, heavier mix',
    delta: { evShareHorizon: -10, iceCo2Improve: -0.5, massDrift: +3, marketGrowth: +1 }, defaultWeight: 0.25,
  },
]

export function caseDrivers(base: DriverSet, c: CaseDef): DriverSet {
  const out = { ...base }
  for (const [k, d] of Object.entries(c.delta)) {
    const meta = DRIVER_META.find((m) => m.key === (k as DriverKey))!
    out[k as DriverKey] = Math.min(meta.max, Math.max(meta.min, out[k as DriverKey] + (d as number)))
  }
  return out
}

// ── the adoption S-curve ─────────────────────────────────────────────────────
/** Smoothstep S-curve from the as-sold ZE share to the horizon share — slow
 *  start, fast middle, saturating end. Monotonic by construction (never below
 *  today's share), and floored by the statutory mandate where the regime is a
 *  unit mandate (UK VETS: limit = allowed non-ZE %, so floor = 100 − limit). */
export function adoptionShare(s0Pct: number, horizonPct: number, i: number, n: number, mandateFloorPct?: number | null): number {
  const x = n <= 1 ? 1 : i / (n - 1)
  const ease = x * x * (3 - 2 * x)
  const target = Math.max(s0Pct, horizonPct) // adoption doesn't run backwards in the outlook
  const curve = s0Pct + (target - s0Pct) * ease
  return Math.min(95, Math.max(curve, mandateFloorPct ?? 0))
}

/** The statutory ZE floor for unit-mandate regimes; null where the limit is a
 *  CO₂/FC line (EU/IN/AU) and adoption is market-driven, not mandated. */
export function mandateFloor(pack: RulePack, year: number): number | null {
  if (pack.massBasedLimit !== false) return null
  const allowedNonZe = pack.limit({ year, avgMass: 0, zlevShare: 0, vclass: pack.classes[0], scenario: { ...baselineScenario(pack), year } })
  return Number.isFinite(allowedNonZe) ? Math.min(95, Math.max(0, 100 - allowedNonZe)) : null
}

// ── the synthetic fleet ──────────────────────────────────────────────────────
/** The most recent year at/before the dataset vintage that actually has rows —
 *  the outlook projects the latest ACTUALS, not the first demo year. */
export function outlookBaseYear(raw: Vehicle[], pack: RulePack, vintageYear: number): number {
  const withRows = pack.years.filter((y) => raw.some((v) => v.year === y && v.sales > 0))
  const atOrBefore = withRows.filter((y) => y <= vintageYear)
  return atOrBefore.length ? Math.max(...atOrBefore) : (withRows[0] ?? pack.years[0])
}

/** Volumes × attributes transform of the base-year rows for projected year i
 *  steps out. ZE-share movement is applied via the engine's own evSharePct
 *  lever (see casePlan) so mix reallocation uses one trusted code path. */
export function outlookFleetForYear(baseRows: Vehicle[], d: DriverSet, i: number, year: number): Vehicle[] {
  const vol = Math.pow(1 + d.marketGrowth / 100, i)
  const co2f = Math.pow(1 - d.iceCo2Improve / 100, i)
  const dm = d.massDrift * i
  return baseRows.map((v) => ({
    ...v,
    year,
    sales: v.sales * vol,
    co2: v.co2 > 0 ? v.co2 * co2f : v.co2,
    mass: Math.max(1, v.mass + dm),
    ...(v.kerbMass != null ? { kerbMass: Math.max(1, v.kerbMass + dm) } : {}),
    ...(v.testMass != null ? { testMass: Math.max(1, v.testMass + dm) } : {}),
  }))
}

export interface OutlookConfig {
  raw: Vehicle[]
  pack: RulePack
  drivers: DriverSet
  vintageYear: number
}

/** Everything a forecast run needs for one case: the per-year fleet function
 *  and the per-year plan (the ZE adoption path). */
export function outlookRun(cfg: OutlookConfig) {
  const { raw, pack, drivers, vintageYear } = cfg
  const years = pack.years
  const baseYear = outlookBaseYear(raw, pack, vintageYear)
  const baseRows = raw.filter((v) => v.year === baseYear)
  // as-sold ZE share of the base year (units-weighted)
  const units = baseRows.reduce((a, v) => a + v.sales, 0)
  const zeUnits = baseRows.filter((v) => pack.isZeroEmission(v)).reduce((a, v) => a + v.sales, 0)
  const s0 = units > 0 ? (zeUnits / units) * 100 : 0

  const idx = (year: number) => Math.max(0, year - baseYear)
  const n = Math.max(...years) - baseYear + 1
  const fleetForYear = (year: number) => outlookFleetForYear(baseRows, drivers, idx(year), year)
  const shareFor = (year: number) => adoptionShare(s0, drivers.evShareHorizon, idx(year), n, mandateFloor(pack, year))
  const scenarioFor = (year: number): Scenario => ({ ...baselineScenario(pack), year, evSharePct: Math.round(shareFor(year) * 10) / 10 })
  return { baseYear, baseRows, s0, fleetForYear, shareFor, scenarioFor }
}

// ── market fine under an outlook configuration (the bridge/sensitivity core) ─
function marketFine(rows: Vehicle[], pack: RulePack, sc: Scenario): number {
  const t = buildTree(rows, pack, sc, {})
  return (t.children ?? []).reduce((a, c) => a + c.fine, 0)
}

/** Fine for a given year with INDEPENDENT progress indices per factor — the
 *  primitive that lets the bridge advance one factor at a time. */
function fineAt(run: ReturnType<typeof outlookRun>, pack: RulePack, d: DriverSet, year: number, iVol: number, iAttr: number, sharePct: number): number {
  const volOnly: DriverSet = { ...d, iceCo2Improve: 0, massDrift: 0 }
  const attrOnly: DriverSet = { ...d, marketGrowth: 0 }
  // compose: volumes at iVol, attributes at iAttr
  const rows = outlookFleetForYear(outlookFleetForYear(run.baseRows, volOnly, iVol, year), attrOnly, iAttr, year)
  return marketFine(rows, pack, { ...baselineScenario(pack), year, evSharePct: sharePct })
}

export interface BridgeEffect { label: 'Regulation' | 'Volume' | 'CO₂ & mass tech' | 'ZE mix'; delta: number }
export interface YearBridge { year: number; from: number; to: number; effects: BridgeEffect[]; residual: number }

/** Sequential YoY attribution of the market fine (standard bridge convention:
 *  regulation first, then volume, technology, mix — order is disclosed).
 *  The four effects sum to the total change by construction; `residual` is the
 *  numerical guard and should be ~0. */
export function bridgeYear(cfg: OutlookConfig, year: number): YearBridge | null {
  const run = outlookRun(cfg)
  const { pack, drivers } = cfg
  const years = pack.years
  const k = years.indexOf(year)
  if (k <= 0) return null
  const prev = years[k - 1]
  const iP = Math.max(0, prev - run.baseYear)
  const iY = Math.max(0, year - run.baseYear)
  const shP = run.shareFor(prev)
  const shY = run.shareFor(year)

  const f0 = fineAt(run, pack, drivers, prev, iP, iP, shP)   // last year, in full
  const f1 = fineAt(run, pack, drivers, year, iP, iP, shP)   // + this year's statutory line
  const f2 = fineAt(run, pack, drivers, year, iY, iP, shP)   // + volume growth
  const f3 = fineAt(run, pack, drivers, year, iY, iY, shP)   // + CO₂/mass technology drift
  const f4 = fineAt(run, pack, drivers, year, iY, iY, shY)   // + ZE adoption step  (= this year, in full)
  const effects: BridgeEffect[] = [
    { label: 'Regulation', delta: f1 - f0 },
    { label: 'Volume', delta: f2 - f1 },
    { label: 'CO₂ & mass tech', delta: f3 - f2 },
    { label: 'ZE mix', delta: f4 - f3 },
  ]
  return { year, from: f0, to: f4, effects, residual: f4 - f0 - effects.reduce((a, e) => a + e.delta, 0) }
}

// ── sensitivities ────────────────────────────────────────────────────────────
export interface TwoWayCell { row: number; col: number; fine: number }
/** Final-year market fine over a grid of two driver values (row-major). */
export function twoWay(cfg: OutlookConfig, rowKey: DriverKey, colKey: DriverKey, rowVals: number[], colVals: number[], year: number): TwoWayCell[][] {
  return rowVals.map((rv) => colVals.map((cv) => {
    const d: DriverSet = { ...cfg.drivers, [rowKey]: rv, [colKey]: cv }
    const run = outlookRun({ ...cfg, drivers: d })
    const fine = marketFine(run.fleetForYear(year), cfg.pack, run.scenarioFor(year))
    return { row: rv, col: cv, fine }
  }))
}

/** The ZE horizon share at which the market fine for `year` first reaches ~0.
 *  Fine is monotonically non-increasing in adoption, so bisection is valid.
 *  Returns null when even 95% cannot clear it (or it's already clear at the
 *  current setting's floor). */
export function breakEvenAdoption(cfg: OutlookConfig, year: number): number | null {
  const fineFor = (h: number) => {
    const run = outlookRun({ ...cfg, drivers: { ...cfg.drivers, evShareHorizon: h } })
    return marketFine(run.fleetForYear(year), cfg.pack, run.scenarioFor(year))
  }
  if (fineFor(95) > 1) return null      // infeasible by electrification alone
  if (fineFor(0) <= 1) return 0         // clear even with no extra adoption
  let lo = 0, hi = 95
  for (let it = 0; it < 18; it++) {
    const mid = (lo + hi) / 2
    if (fineFor(mid) <= 1) hi = mid
    else lo = mid
  }
  return Math.round(hi * 10) / 10
}
