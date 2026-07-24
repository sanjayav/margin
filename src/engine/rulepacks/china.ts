// ───────────────────────────────────────────────────────────────────────────
// RULE PACK · China — the dual-credit (双积分) regime, CAFC axis
//
// China runs TWO parallel mandates on every passenger-car maker:
//   1. CAFC  (Corporate Average Fuel Consumption) — a fleet fuel-use average vs
//      a kerb-mass-based target curve (GB 27999). This is the axis the shared
//      single-metric engine models directly (metric = L/100km, like India).
//   2. NEV credits — a separate mandate requiring NEV credits ≥ (NEV ratio ×
//      conventional-car volume). This second axis does not fit the one-metric
//      engine cleanly; it is surfaced here through the CREDIT ECONOMICS, because
//      an NEV credit is the currency that clears a CAFC deficit (see fineRate).
//      A full second-axis NEV-ratio ledger is tracked as a follow-up.
//
// Two eras, both IN FORCE (neither is draft):
//   · Phase 5 — GB 27999-2019 (CAFC, effective 2021-01) + GB 19578-2021
//     (per-model, effective 2021-07). WLTC basis. NEVs count ZERO fuel use and
//     are multiplied in the CAFC denominator (2.0 in 2021 → 1.0 by 2025).
//   · Phase 6 — GB 27999-2025 (CAFC 2026-2030) + GB 19578-2024 (per-model),
//     effective 2026-01-01. WLTC basis, ~48% tighter fleet goal (3.3 L/100km by
//     2030). BEV/PHEV electric energy now COUNTS in CAFC; NEV multipliers phase
//     1.4 (2026-27) → 1.2 (2028-29) → 1.0 (2030).
//
// Penalty: China levies NO monetary fine. A deficit maker that cannot clear its
// balance faces suspension of high-consumption model type-approvals / production
// until the deficit is offset. The engine's "fine" is therefore the COST OF
// CLEARING the deficit by buying NEV credits (1 NEV credit offsets 1 CAFC
// credit), priced at the volatile credit-market rate — flagged illustrative.
//
// CALIBRATION NOTE: the exact GB 27999 target-curve breakpoints were not fully
// transcribable from primary text in time, so the curve here is fitted to the
// VERIFIED 2023 MIIT per-OEM 达标值 points (Chery 5.58@1537kg, BYD 5.73@1625kg
// & 6.01@1758kg, Tesla 6.27@1889kg ⇒ slope ≈0.00196 L/100km·kg⁻¹), extended by
// the published compliance-ratio phase-in and the 3.3 L/100km-by-2030 goal.
// Phase 6 curve values are approximate — stress them with the stringency lever.
// ───────────────────────────────────────────────────────────────────────────
import type { RulePack, Vehicle, LimitContext } from '../types.js'

const PETROL_DIV = 23.7135 // g CO₂/km → petrol-equivalent L/100km (as in India)
const PHASE6_FROM = 2026

// Target curve: T(CM) = SLOPE·(CM − CM0) + D[year], CM in kg (kerb / 整备质量).
// Calibrated to the file's CAFC STANDARD (目标值), because the dual-credit CAFC
// credit = (Standard − actual) × volume (verified exact vs China Data.xlsx: e.g.
// Brilliance-BMW (5.73−4.84)×491,572 = +437,499). Standard slope ≈ 0.0017.
const SLOPE = 0.0017
const CM0 = 1500 // reference kerb mass for the per-year constant D

// Per-year target constant at CM0 = 1500 kg (WLTC L/100km).
// 2024-2025: back-solved from the REAL 达标值 in China Data.xlsx (target ≈ 4.80
// at 1500 kg for both years). 2026-2027: Phase 6 (GB 27999-2025) — blank in the
// source, modelled declining toward the 3.3 L/100km 2030 goal.
const D: Record<number, number> = {
  2024: 5.18, 2025: 4.80,   // Phase 5 · CAFC STANDARD @1500kg from China Data.xlsx
  2026: 4.50, 2027: 4.20, 2028: 3.90, 2029: 3.60, 2030: 3.30,   // Phase 6 (modelled)
}
const dFor = (year: number) => D[year] ?? (year < PHASE6_FROM ? 5.18 : 3.30)

// NEV production-count multiplier applied in the CAFC average (a clean NEV counts
// as N vehicles of zero fuel use, diluting the fleet average). Phase 5 tapers
// 2.0→1.0; Phase 6 tapers 1.4→1.0. Intermediate Phase-5 steps are the widely
// reported schedule (not independently re-verified this pass).
const NEV_MULT: Record<number, number> = {
  2021: 2.0, 2022: 1.8, 2023: 1.6, 2024: 1.3, 2025: 1.0,
  2026: 1.4, 2027: 1.4, 2028: 1.2, 2029: 1.2, 2030: 1.0,
}
const nevMult = (year: number) => NEV_MULT[year] ?? (year < PHASE6_FROM ? 1.0 : year >= 2030 ? 1.0 : 1.4)

// NEV credit market price (¥ per credit; 1 credit ≈ 1 L/100km·vehicle of CAFC
// deficit). The traded price is highly volatile — ~¥2,000+ at the 2021 peak,
// then collapsed on oversupply. Used as the shadow clearing-cost; illustrative.
const CREDIT_PRICE = 1_000

// A BEV counted in Phase 6 CAFC: convert electric energy (Wh/km, if the row
// carries it) to a petrol-equivalent L/100km. Wh/km → kWh/100km (÷10), then
// ÷8.9 kWh/L petrol energy content ⇒ L/100km = Wh/km ÷ 89. Phase 6 only.
const evPetrolEq = (whPerKm: number) => whPerKm / 89

// Zero-fuel-use in CAFC = battery-electric & fuel-cell only (a PHEV counts its
// low official fuel figure, not zero). isNEV = the broader set that earns the
// production-count multiplier: BEV + FCEV + PHEV.
const isElectric = (v: Vehicle) => v.co2 === 0 || /fuel cell|fcev|hydrogen/i.test(v.fuel) || /bev|fcev|fuel cell/i.test(v.powertrain) || (/electric/i.test(v.fuel) && !/plug|phev/i.test(v.powertrain))
const isNEV = (v: Vehicle) => isElectric(v) || /phev|plug/i.test(v.powertrain)

export const CN: RulePack = {
  id: 'CN',
  name: 'China',
  flag: 'CN',
  currency: '¥',
  metricUnit: 'L/100km',
  metricLabel: 'Fleet fuel use (CAFC)',
  massLabel: 'Kerb mass',
  fineRate: CREDIT_PRICE, // ¥ per L/100km·vehicle of deficit = credits to buy × price
  fineRateLabel: '≈¥1,000 per credit to clear the CAFC deficit (NEV-credit market price; no statutory fine — deficits force type-approval suspension)',
  illustrativeRates: true, // credit price is volatile & the latest print was not pinned
  creditPrice: CREDIT_PRICE,
  creditPriceLabel: '≈¥1,000 per NEV credit (traded; peaked >¥2,000 in 2021, collapsed on oversupply)',
  // Real data spans 2024–2027 (China Data.xlsx). 2024–25 Phase 5 (WLTC), 2026–27
  // Phase 6 (GB 27999-2025). Open on 2025 — the latest fully-accounted actuals.
  years: [2024, 2025, 2026, 2027],
  defaultYear: 2025,
  actualsThroughYear: 2025, // 2024–25 settled (full credit accounting); 2026–27 are the file's Phase-6 planning rows

  classes: ['Passenger car'],
  smallVolumeThreshold: 2000, // small-scale producers/importers (≤2,000/yr) are eased
  massBasedLimit: true,
  pooling: {
    // China has NO EU-style pooled average — makers are NOT allowed to combine
    // fleets and be judged on one shared CAFC. Compliance is per compliance
    // entity, cleared through the dual-credit ledger (Credit book), not a pool.
    enabled: false,
    note: 'China does not pool fleets. Each compliance entity is judged standalone on both axes; a CAFC deficit is cleared by carried-over own surplus, transfer from AFFILIATES (关联企业, ≥25% shareholding), or purchased NEV credits (1:1, the 2023 credit pool adds deposit/withdraw with 5-yr validity). An NEV deficit can ONLY be cleared by buying NEV credits. All of this lives in the Credit book.',
  },
  credits:
    'Dual-credit (双积分): NEVs count as zero fuel use AND are multiplied in the CAFC denominator (×2.0 in 2021 tapering to ×1.0 by 2025; ×1.4→×1.0 over 2026–30), so a high-NEV maker banks a large CAFC surplus. A separate NEV-ratio mandate (14/16/18% for 2021–23; 28/38% for 2024–25; 48/58% announced for 2026–27) requires NEV credits ≥ ratio × conventional volume — surfaced here via credit pricing; a full NEV-ratio ledger is a follow-up.',
  limitNote:
    'CAFC target = 0.0017 × (kerb mass − 1,500 kg) + a per-year constant (5.18 in 2024, 4.80 in 2025) — the CAFC Standard (目标值) from the source, against which the dual-credit CAFC credit = (Standard − actual) × volume. Tightens toward the 3.3 L/100km 2030 goal (Phase 6, modelled). WLTC basis.',
  source:
    'China Data.xlsx — variant-level dual-credit dataset (6 compliance entities, 2024–2027, real WLTP CO₂ / kerb mass / battery / e-range / sales, with per-entity CAFC & NEV credit accounting). GB 27999-2019/2025; GB 19578-2021/2024.',
  coverageNote:
    'Real dataset, but partial market — 6 compliance entities (BMW, Brilliance-BMW, Porsche, Tata, Chery-Tata, Tesla), not all-China. Verdicts read as covered-scope. Add more via Data & imports.',

  vehicleMetric: (v: Vehicle, s) => {
    if (isElectric(v)) {
      // Phase 5: NEVs count as zero fuel use. Phase 6: electric energy is counted
      // when the row carries an energy figure (Wh/km); otherwise still ~0.
      if (s.year < PHASE6_FROM) return 0
      return v.energy && v.energy > 0 ? Math.max(0, evPetrolEq(v.energy)) : 0
    }
    return Math.max(0, v.co2 / PETROL_DIV)
  },
  vehicleUnits: (v: Vehicle, s) => {
    // NEV count multiplier — the statutory CAFC-denominator credit for clean tech.
    // Applies to every NEV (BEV, FCEV AND PHEV), not just the zero-fuel ones.
    if (!s.superCreditsEnabled) return v.sales
    return isNEV(v) ? v.sales * nevMult(s.year) : v.sales
  },
  isZeroEmission: (v) => isElectric(v),
  isPlugInHybrid: (v) => /phev|plug/i.test(v.powertrain),
  limit: (ctx: LimitContext) => {
    // targetShiftPct stresses the (approximate) target constant, as for India's draft.
    const shift = 1 + (ctx.scenario.targetShiftPct ?? 0) / 100
    return SLOPE * (ctx.avgMass - CM0) + dFor(ctx.year) * shift
  },
  forecast: (year) => ({
    limit: SLOPE * (1500 - CM0) + dFor(year),
    note: year < PHASE6_FROM ? `${year} · Phase 5 (GB 27999-2019)` : `${year} · Phase 6 (GB 27999-2025)`,
  }),
  regimeFor: (year) =>
    year < PHASE6_FROM
      ? {
          name: 'Dual-credit · Phase 5', cycle: 'WLTC',
          cycleNote: 'GB 27999-2019 CAFC on WLTC; NEVs count zero fuel use and are multiplied (×2.0→×1.0) in the fleet average.',
        }
      : {
          name: 'Dual-credit · Phase 6', cycle: 'WLTC',
          cycleNote: 'GB 27999-2025 (in force 2026-01-01): ~48% tighter, 3.3 L/100km fleet goal by 2030; BEV/PHEV electric energy now counted; NEV multipliers ×1.4→×1.0. Curve values here are approximate.',
        },
}
