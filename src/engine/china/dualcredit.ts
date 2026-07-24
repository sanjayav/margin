// ───────────────────────────────────────────────────────────────────────────
// CHINA DUAL-CREDIT (双积分) — the two-axis compliance engine, bespoke to CN
//
// Unlike every other market in this app, China judges a manufacturer on TWO
// independent credit balances, and a maker passes ONLY if both clear:
//
//   1. CAFC credits (企业平均燃料消耗量积分)
//        = (CAFC_target − CAFC_actual) × total production
//        positive when the fleet beats its fuel-consumption target.
//
//   2. NEV credits (新能源汽车积分)
//        earned   = Σ per-vehicle standard credit (BEV/PHEV/FCEV formulas)
//        required = NEV_ratio(year) × adjusted conventional-car production
//        balance  = earned − required
//
// OFFSETTING (the part that makes it a *dual*-credit system):
//   · A CAFC deficit may be cleared by own NEV surplus (1:1), by carried-over
//     CAFC surplus, or by affiliate transfer (≥25% equity).
//   · A NEV deficit may ONLY be cleared by *buying* NEV credits — CAFC surplus
//     cannot rescue it. So the market always bids NEV credits.
//   · There is no statutory monetary fine; the economic cost is the price of the
//     NEV credits a deficit maker must buy, and the sanction for not clearing is
//     suspension of high-consumption model type-approvals.
//
// The generic shared engine (buildTree) already gives us the CAFC axis per
// manufacturer (avgMetric = CAFC actual, limit = CAFC target, rawUnits =
// volume). This module adds the NEV axis and the offsetting, per OEM and for
// the market, from the same fleet — so the bespoke ledger and the generic Plan
// view stay perfectly consistent.
//
// SOURCES: MIIT dual-credit measures (令第44号, amended 令第53号 2020, 2023 &
// 2025 notices). Per-vehicle NEV credit formulas and ratios are the widely
// documented values; treat the exact caps/coefficients as calibratable — the
// UI badges the NEV axis "illustrative" alongside the pack's credit price.
// ───────────────────────────────────────────────────────────────────────────
import type { Aggregate, RulePack, Scenario, Vehicle } from '../types.js'
import { buildTree } from '../engine.js'

// ── NEV credit RATIO requirement, % of the (adjusted) conventional base ──────
// 2019 10 · 2020 12 · 2021 14 · 2022 16 · 2023 18 (MIIT 令第53号, 2020);
// 2024 28 · 2025 38 (2023 notice); 2026 48 · 2027 58 (Nov 2025 notice).
export const NEV_RATIO: Record<number, number> = {
  2019: 0.10, 2020: 0.12, 2021: 0.14, 2022: 0.16, 2023: 0.18,
  2024: 0.28, 2025: 0.38, 2026: 0.48, 2027: 0.58,
  // 2028–30 not yet notified — held at the 2027 mandate as the forecast floor.
  2028: 0.58, 2029: 0.58, 2030: 0.58,
}
export const nevRatioFor = (year: number, override?: number | null): number =>
  override != null ? override / 100 : (NEV_RATIO[year] ?? (year < 2019 ? 0.10 : 0.58))

// ── Per-vehicle NEV standard credit ──────────────────────────────────────────
// Two eras (verified vs MIIT 令第53号 + the 2023 notice; 2024+ roughly halved
// per-vehicle credits to curb oversupply):
//   BEV  2021–23  SMP = min(0.0056·R + 0.4, 3.4), ×DRAC range-adjust band
//        2024+    SMP = R<150 ? 0.6 : min(0.0034·R + 0.2, 2.3)
//   PHEV 2021–23  1.6                              2024+  1.0   (×0.5 if it fails
//        the ≥43 km electric-range / charge-sustaining fuel-use condition)
//   FCEV 2021–23  min(0.08·P, 6.0)                2024+  min(0.05·P, 4.0)
//   R = electric range (km), P = rated fuel-cell power (kW). Below 100 km a BEV
//   earns no standard credit.
const amendedEra = (year: number) => year >= 2024

// DRAC (里程调整系数) for the 2021–23 BEV formula — verified banding.
const bevDrac = (range: number) =>
  range < 100 ? 0 : range < 150 ? 0.7 : range < 200 ? 0.8 : range < 300 ? 0.9 : 1.0

export function perVehicleNevCredit(v: Vehicle, year: number): number {
  const amended = amendedEra(year)
  const range = v.range ?? 0
  const pt = v.powertrain.toUpperCase()
  const fuel = (v.fuel || '').toLowerCase()
  const isFcev = /fcev|fuel cell/i.test(pt) || /hydrogen|fuel cell/i.test(fuel)
  const isPhev = /phev|plug|erev|range.?ext/i.test(pt)
  const isBev = !isFcev && !isPhev && (/bev/i.test(pt) || /electric/i.test(fuel) || v.co2 === 0)

  if (isFcev) {
    const p = v.powerKW ?? 60
    return Math.min(amended ? 0.05 * p : 0.08 * p, amended ? 4.0 : 6.0)
  }
  if (isPhev) {
    // ≥43 km electric range + charge-sustaining fuel-use condition, else ×0.5. EREVs qualify.
    const base = amended ? 1.0 : 1.6
    return range >= 43 ? base : base * 0.5
  }
  if (isBev) {
    if (range < 100) return 0
    if (amended) return range < 150 ? 0.6 : Math.min(0.0034 * range + 0.2, 2.3)
    return Math.min(0.0056 * range + 0.4, 3.4) * bevDrac(range)
  }
  return 0
}

// ── Classification helpers (mirror the CN rule pack) ─────────────────────────
const isElectricish = (v: Vehicle) =>
  v.co2 === 0 || /fuel cell|fcev|hydrogen/i.test(v.fuel) || /bev|fcev|fuel cell/i.test(v.powertrain) ||
  (/electric/i.test(v.fuel) && !/plug|phev/i.test(v.powertrain))
const isNev = (v: Vehicle) => isElectricish(v) || /phev|plug|erev|range.?ext/i.test(v.powertrain)

// ── Battery demand (the CATL / supply-side lens) ─────────────────────────────
// Usable battery capacity per NEV, kWh. Uses the row's explicit `battery` where
// present, else estimates from electric range × a per-powertrain consumption
// factor (BEV ~0.14 kWh/km, PHEV/EREV ~0.19). FCEVs carry only a small buffer.
// This is what turns "NEV credits" into GWh of cells — the number CATL plans on.
export function batteryKWh(v: Vehicle): number {
  if (v.battery && v.battery > 0) return v.battery
  const r = v.range ?? 0
  const pt = (v.powertrain || '').toUpperCase()
  if (/fcev|fuel cell/i.test(pt) || /hydrogen/i.test(v.fuel || '')) return 1.5
  if (/erev|range.?ext/i.test(pt)) return Math.max(20, r * 0.19)
  if (/phev|plug/i.test(pt)) return Math.max(8, r * 0.19)
  return Math.max(20, r * 0.14) // BEV
}
// Credits a marginal long-range BEV earns (2024+ era) and its cell size — used to
// translate a maker's residual credit shortfall into the GWh it would take to
// close it by BUILDING EVs instead of buying credits (CATL's addressable demand).
const CREDITS_PER_MARGINAL_BEV = 2.0
const KWH_PER_MARGINAL_BEV = 62
// "Low fuel-consumption passenger vehicle" (低油耗乘用车): a conventional car whose
// fuel use is at/under the era's preferential threshold counts as a FRACTION of
// a normal conventional car in the NEV-required base — the reward DEEPENS over
// time (0.5 in 2021 → 0.2 by 2023 → 0.1 from 2026), lowering NEV obligation.
const LOW_FC_L100 = 5.5 // ≈ the low-consumption threshold, WLTC L/100km (illustrative)
const lowFcWeight: Record<number, number> = { 2021: 0.5, 2022: 0.3, 2023: 0.2, 2024: 0.2, 2025: 0.2, 2026: 0.1, 2027: 0.1 }

export interface DualCreditLine {
  model: string
  powertrain: string
  sales: number
  isNev: boolean
  nevCreditEach: number   // per-vehicle NEV standard credit (0 for conventional)
  nevCreditTotal: number  // × sales
  cafcL100: number        // this line's fuel-use contribution (0 for BEV/FCEV)
}

export interface OemDualCredit {
  parent: string
  pool: string
  volume: number          // total passenger-car production
  convVolume: number      // conventional (non-NEV) units — the NEV-required base
  nevVolume: number       // BEV + PHEV + FCEV units
  nevSharePct: number
  // CAFC axis
  cafcActual: number      // L/100km (post NEV-multiplier average)
  cafcTarget: number      // L/100km compliance value
  cafcCredit: number      // (target − actual) × volume, signed
  // NEV axis
  nevEarned: number       // Σ per-vehicle standard credits
  nevRequired: number     // ratio × adjusted conventional base
  nevBalance: number      // earned − required
  // offsetting → net
  nevUsedForCafc: number  // own NEV surplus consumed to clear the CAFC deficit
  cafcResidual: number    // CAFC still short after own NEV (must buy / transfer)
  nevShort: number        // NEV deficit that must be bought
  creditsToBuy: number    // cafcResidual + nevShort (both need purchased NEV credits)
  cost: number            // creditsToBuy × credit price (¥)
  compliant: boolean      // both axes clear after own offsetting
  status: 'both-clear' | 'self-offset' | 'cafc-short' | 'nev-short' | 'both-short'
  lines: DualCreditLine[] // per-model breakdown (drill-down)
  // battery-demand lens (supply-side / CATL)
  batteryGWh: number      // cells this maker's NEV volume represents
  gwhToClose: number      // GWh of extra BEVs to clear its residual credit shortfall
}

export interface DualCreditMarket {
  year: number
  ratio: number
  creditPrice: number
  oems: OemDualCredit[]
  totals: {
    volume: number
    cafcCredit: number      // Σ signed
    cafcSurplus: number     // Σ positive
    cafcDeficit: number     // Σ |negative|
    nevEarned: number
    nevRequired: number
    nevBalance: number
    nevSurplus: number
    nevDeficit: number
    creditsToBuy: number    // Σ residual demand for purchased NEV credits
    cost: number
    batteryGWh: number      // total NEV battery demand (cells) this year
    gwhToClose: number      // GWh of extra BEVs to clear all residual shortfalls
    makersOver: number      // makers not clearing both axes
    makers: number
  }
}

/** Build the full dual-credit ledger for one market year from the CAFC drill
 *  tree (per-manufacturer aggregates carrying their vehicles) and the scenario. */
export function buildDualCredit(tree: Aggregate, scenario: Scenario, packCreditPrice: number): DualCreditMarket {
  const year = scenario.year
  const ratio = nevRatioFor(year, scenario.nevRatioTarget)
  const creditPrice = scenario.nevCreditPrice ?? scenario.creditPrice ?? packCreditPrice
  const lowW = lowFcWeight[year] ?? (year >= 2026 ? 0.1 : 0.5)

  const oems: OemDualCredit[] = (tree.children ?? [])
    .filter((c) => c.rawUnits > 0)
    .map((c) => {
      const vehicles = c.vehicles ?? []
      let convVolume = 0, nevVolume = 0, nevEarned = 0, lowFcAdj = 0, batteryKWhTotal = 0
      const lines: DualCreditLine[] = []
      for (const v of vehicles) {
        const nev = isNev(v)
        const each = nev ? perVehicleNevCredit(v, year) : 0
        const l100 = isElectricish(v) ? 0 : v.co2 / 23.7135
        if (nev) {
          nevVolume += v.sales
          nevEarned += each * v.sales
          batteryKWhTotal += batteryKWh(v) * v.sales
        } else {
          convVolume += v.sales
          // low-FC conventional cars count as a fraction of the required base
          lowFcAdj += v.sales * (l100 <= LOW_FC_L100 ? lowW : 1)
        }
        lines.push({ model: v.model, powertrain: v.powertrain, sales: v.sales, isNev: nev, nevCreditEach: each, nevCreditTotal: each * v.sales, cafcL100: l100 })
      }
      lines.sort((a, b) => b.sales - a.sales)
      const volume = c.rawUnits
      const cafcActual = c.avgMetric
      const cafcTarget = c.limit
      const cafcCredit = (cafcTarget - cafcActual) * volume

      const nevRequired = ratio * lowFcAdj
      const nevBalance = nevEarned - nevRequired

      // Offsetting: own NEV surplus clears the CAFC deficit (1:1); a NEV deficit
      // can't be rescued by CAFC surplus and must be bought.
      const nevSurplus = Math.max(0, nevBalance)
      const nevShort = Math.max(0, -nevBalance)
      const cafcDeficit = Math.max(0, -cafcCredit)
      const nevUsedForCafc = Math.min(cafcDeficit, nevSurplus)
      const cafcResidual = cafcDeficit - nevUsedForCafc
      const creditsToBuy = cafcResidual + nevShort
      const cost = creditsToBuy * creditPrice
      const compliant = creditsToBuy <= 0.5

      const status: OemDualCredit['status'] =
        cafcResidual > 0.5 && nevShort > 0.5 ? 'both-short'
          : nevShort > 0.5 ? 'nev-short'
            : cafcResidual > 0.5 ? 'cafc-short'
              : nevUsedForCafc > 0.5 ? 'self-offset'
                : 'both-clear'

      const batteryGWh = batteryKWhTotal / 1e6
      const gwhToClose = (creditsToBuy / CREDITS_PER_MARGINAL_BEV) * KWH_PER_MARGINAL_BEV / 1e6
      return {
        parent: c.label, pool: (vehicles[0]?.pool || c.label),
        volume, convVolume, nevVolume, nevSharePct: volume > 0 ? (nevVolume / volume) * 100 : 0,
        cafcActual, cafcTarget, cafcCredit,
        nevEarned, nevRequired, nevBalance,
        nevUsedForCafc, cafcResidual, nevShort, creditsToBuy, cost, compliant, status, lines,
        batteryGWh, gwhToClose,
      }
    })
    .sort((a, b) => a.cost - b.cost || b.cafcCredit - a.cafcCredit)

  const totals = oems.reduce(
    (t, o) => {
      t.volume += o.volume
      t.cafcCredit += o.cafcCredit
      t.cafcSurplus += Math.max(0, o.cafcCredit)
      t.cafcDeficit += Math.max(0, -o.cafcCredit)
      t.nevEarned += o.nevEarned
      t.nevRequired += o.nevRequired
      t.nevBalance += o.nevBalance
      t.nevSurplus += Math.max(0, o.nevBalance)
      t.nevDeficit += Math.max(0, -o.nevBalance)
      t.creditsToBuy += o.creditsToBuy
      t.cost += o.cost
      t.batteryGWh += o.batteryGWh
      t.gwhToClose += o.gwhToClose
      if (!o.compliant) t.makersOver += 1
      return t
    },
    { volume: 0, cafcCredit: 0, cafcSurplus: 0, cafcDeficit: 0, nevEarned: 0, nevRequired: 0, nevBalance: 0, nevSurplus: 0, nevDeficit: 0, creditsToBuy: 0, cost: 0, batteryGWh: 0, gwhToClose: 0, makersOver: 0, makers: oems.length },
  )

  return { year, ratio, creditPrice, oems, totals }
}

// ── FORECAST: the dual-credit position year by year ──────────────────────────
export interface DualCreditYear {
  year: number
  ratio: number            // NEV credit ratio requirement that year
  phase: 5 | 6
  cafcActual: number       // fleet CAFC (L/100km)
  cafcLimit: number        // fleet CAFC target
  cafcGap: number          // actual − limit (fundamental compliance gap)
  cafcCredit: number       // Σ signed CAFC credits
  nevBalance: number       // Σ signed NEV credits
  nevSurplus: number
  nevDeficit: number
  nevSharePct: number      // NEV (BEV+PHEV) share of the fleet — the adoption fundamental
  volume: number           // total registrations (market growth fundamental)
  batteryGWh: number       // NEV battery demand — the CATL / supply-side fundamental
  creditsToBuy: number     // residual NEV-credit demand after self-offset
  cost: number             // ¥ to clear
  makersOver: number
  makers: number
}

/** Project the whole-market dual-credit position across the horizon. For each
 *  year it builds the (optionally outlook-projected) fleet under `scenarioFor`,
 *  runs the full two-axis engine, and returns the market summary — the series
 *  the China forecast studio charts. Grounded entirely in the deterministic
 *  engine, so the AI narrates it but never invents a number. */
export function buildDualCreditForecast(
  raw: Vehicle[],
  pack: RulePack,
  years: number[],
  scenarioFor: (year: number) => Scenario,
  packCreditPrice: number,
  fleetForYear?: (year: number) => Vehicle[],
): DualCreditYear[] {
  return years.map((year) => {
    const fleet = fleetForYear ? fleetForYear(year) : raw
    const sc = scenarioFor(year)
    const tree = buildTree(fleet, pack, sc, {})
    const dc = buildDualCredit(tree, sc, packCreditPrice)
    const t = dc.totals
    const nevVol = dc.oems.reduce((a, o) => a + o.volume * o.nevSharePct / 100, 0)
    return {
      year, ratio: dc.ratio, phase: year >= 2026 ? 6 : 5,
      cafcActual: tree.avgMetric, cafcLimit: tree.limit, cafcGap: tree.avgMetric - tree.limit,
      cafcCredit: t.cafcCredit, nevBalance: t.nevBalance, nevSurplus: t.nevSurplus, nevDeficit: t.nevDeficit,
      nevSharePct: t.volume > 0 ? (nevVol / t.volume) * 100 : 0, volume: t.volume, batteryGWh: t.batteryGWh,
      creditsToBuy: t.creditsToBuy, cost: t.cost, makersOver: t.makersOver, makers: t.makers,
    }
  })
}

