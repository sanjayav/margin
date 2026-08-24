// ───────────────────────────────────────────────────────────────────────────
// RULE PACK · India — a market IN TRANSITION, modelled as such
//
// Three regulatory layers, each handled explicitly:
//   1. CAFE II  (in force to 31 Mar 2027): 113 gCO₂/km at the 1,145 kg
//      reference kerb mass ⇒ 4.765 L/100km petrol-equivalent, 0.002 L/kg slope.
//      No super-credits, no CNF discounts.
//   2. CAFE III (DRAFT, BEE 25 Sep 2025; applies FY2027-28 → FY2031-32):
//      tightening constant d 3.73 → 3.01 L/100km, super-credits (BEV ×3 …),
//      carbon-neutral-fuel discounts, and a credit-trading mechanism.
//      Every CAFE III year is flagged `draft: true` until BEE notifies the
//      final rules — the UI badges it, and scenario.targetShiftPct lets an
//      analyst stress the target line for "final lands tighter/looser".
//   3. The PENALTY is not draft: the Energy Conservation (Amendment) Act 2022
//      sets a stepped statutory schedule — ₹25,000 per vehicle when the fleet
//      exceedance is ≤ 0.2 L/100km, ₹50,000 per vehicle beyond — modelled
//      exactly via fineFor (replacing the old ₹1,000/L placeholder).
// ───────────────────────────────────────────────────────────────────────────
import type { RulePack, Vehicle, LimitContext } from '../types.js'

// CAFE III (draft): slope + reference + yearly constant d (L/100km)
const A = 0.002          // slope, per kg
const C3 = 1170          // kg reference (kerb / unladen mass), draft CAFE III
const D3: Record<number, number> = {
  2027: 3.7264, 2028: 3.5737, 2029: 3.4573, 2030: 3.2224, 2031: 3.0139,
  // The BEE draft schedule ENDS at FY2031-32. The fleet data runs one year
  // further, so 2032 holds the 2031 constant flat rather than extrapolating a
  // target BEE has not drafted — see `beyondDraftFrom` / the regimeFor note.
  2032: 3.0139,
}
/** First year past the end of the drafted CAFE III schedule. */
const BEYOND_DRAFT_FROM = 2032
// CAFE II (in force): 113 gCO₂/km at 1,145 kg reference ⇒ petrol-equivalent
const C2 = 1145
const D2 = 113 / 23.7135 // ≈ 4.765 L/100km
const CAFE3_FROM = 2027  // FY2027-28 onward per the draft

const PETROL_DIV = 23.7135 // CO₂ → petrol-equiv L/100km
// EC (Amendment) Act 2022 stepped penalty per vehicle of the non-compliant fleet
const FINE_TIER1 = 25_000  // ₹/vehicle · exceedance ≤ 0.2 L/100km
const FINE_TIER2 = 50_000  // ₹/vehicle · exceedance > 0.2 L/100km
const FINE_STEP = 0.2
// The step is a statutory threshold, and the exceedance reaching it has been
// through a CO₂ → L/100km conversion — so a fleet that is arithmetically AT
// 0.2 can land a few ulps above it (0.20000000000000018) and get charged the
// wrong tier. That doubles a per-vehicle penalty on floating-point noise, which
// across a million-unit fleet is a multi-thousand-crore error. Compare with a
// tolerance far below any real homologation precision.
const STEP_EPS = 1e-9
// Draft CAFE III credit trading: ~₹2,500 per gCO₂/km per vehicle at FY2027-28
// (rising toward ₹4,500 by FY2031-32) ⇒ per L/100km-unit: × 23.7135
const CREDIT_PER_L = Math.round(2500 * PETROL_DIV) // ≈ ₹59,300

const SUPER: Record<string, number> = {
  BEV: 3, 'Range-Extender Hybrid': 3, PHEV: 2.5, 'Strong Hybrid Flex Fuel': 2.5,
  'Strong Hybrid': 2, 'Flex Fuel Ethanol': 1.5,
}

// Draft CAFE III carbon-neutral-fuel discounts, auto-derived from the fuel when
// a row carries no explicit cnf: Indian pump petrol is E20 nationwide → 8%;
// CNG 5%; flex-fuel ethanol 22.3%. An explicit v.cnf always wins.
function autoCnf(fuel: string): number {
  if (/flex/i.test(fuel)) return 0.223
  if (/cng|natural gas/i.test(fuel)) return 0.05
  if (/petrol|gasoline/i.test(fuel)) return 0.08
  return 0
}

export const IN: RulePack = {
  id: 'IN',
  name: 'India',
  flag: 'IND',
  currency: '₹',
  metricUnit: 'L/100km',
  metricLabel: 'Fleet fuel use',
  massLabel: 'Kerb mass',
  // Linear-equivalent of the first statutory tier (₹25,000 per 0.2 L/100km) —
  // used only for benchmark lines (MACC); the actual fine is fineFor below.
  fineRate: FINE_TIER1 / FINE_STEP,
  fineRateLabel: '₹25,000/car (≤0.2 L/100km over) · ₹50,000/car beyond · EC Act 2022',
  creditPrice: CREDIT_PER_L,
  creditPriceLabel: '≈₹2,500 per gCO₂/km per car (draft CAFE III trading price, FY28)',
  // 2025 (FY2025-26) is the complete 12-month actual. 2026 (FY2026-27) is a
  // 3-month YTD part-year — carried as recorded and badged, since a
  // sales-weighted average is volume-invariant and so compliance is unaffected;
  // only that year's absolute volume and fine exposure are partial. 2027–2032
  // are the OEMs' own per-year plan from the source workbook, not a replay of a
  // base year. defaultYear opens on the CAFE III headline year.
  years: [2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032],
  // CAFE is assessed on the Indian fiscal year: FY2025-26 = Apr 2025 → Mar 2026,
  // so month 1 of a monthly filing is April.
  fiscalYearStartMonth: 4,
  defaultYear: 2027,
  classes: ['Passenger car'],
  smallVolumeThreshold: 1000,
  pooling: { enabled: false, note: 'CAFE is assessed per manufacturer; the draft provides credit trading between makers, not pooled averages.' },
  transfer: {
    kind: 'trade',
    unit: 'credit',
    verb: 'trade',
    supplier: 'seller',
    taker: 'buyer',
    note: 'CAFE is assessed per manufacturer — there is no pooled average. Draft CAFE III provides banked credits that trade between makers at a notified price; none of this exists under CAFE II.',
  },
  credits: 'Draft CAFE III: super-credits multiply clean-tech volume (BEV ×3, PHEV ×2.5, strong hybrid ×2), carbon-neutral fuels (E20, CNG) discount fuel use, and banked credits trade at a notified price. None of these exist under CAFE II.',
  limitNote: 'CAFE III (draft): 0.002 × (kerb mass − 1,170 kg) + a constant tightening 3.73 → 3.01 L/100km by FY2031-32. Before FY2027-28, CAFE II applies: 0.002 × (mass − 1,145) + 4.765 (113 gCO₂/km equivalent). Draft years can be stress-tested with the stringency lever.',
  source: 'Two workbooks, merged with no entity taken from both. DEMO DATA_SHARED.xlsx (Aug 2026) — 5 entities with the makers’ own FY2027-28 → FY2032-33 plan. “update dat india 27 july.xlsx” (VIJAY) — the full-market registrations file adding Maruti Suzuki, Hyundai, Tata, Mahindra, Kia, Renault, Nissan and FCA. Model-level sales-weighted CO₂ (MIDC/WLTC) and kerb mass, with the monthly filing. FY2025-26 complete actual ≈4.80M units. BEE Draft CAFE 2027 norms (25 Sep 2025); CAFE II (in force); Energy Conservation (Amendment) Act 2022 penalty schedule.',
  coverage: {
    tier: 'market',
    label: 'Model-level registrations for 13 compliance entities · ≈4.80M units FY2025-26 · benchmarked against VAHAN',
  },
  coverageNote: '13 compliance entities covering essentially the whole Indian PV market (≈4.80M units in FY2025-26). FY2025-26 is a complete 12-month actual; FY2026-27 is a 3-month YTD part-year (badged in Data), so its volume and fine exposure are partial while its sales-weighted average is not. From FY2027-28 the five entities carrying their own plan (Toyota Kirloskar, Škoda-VW, MG, Honda, BYD) use it; the eight from the registrations file, which stops at FY2026-27, hold their complete FY2025-26 fleet against each tightening line and are tagged “Baseline projection”. FY2032-33 sits beyond the drafted CAFE III schedule and holds the FY2031-32 target line flat.',

  regimeFor: (year) =>
    year < CAFE3_FROM
      ? {
          name: 'CAFE II', cycle: 'MIDC · NEDC-based',
          cycleNote: 'CAFE II is assessed on the Modified Indian Driving Cycle (NEDC-derived). Makers dual-declare MIDC + WLTP from 2026.',
        }
      : {
          name: year >= BEYOND_DRAFT_FROM ? 'CAFE III (beyond draft)' : 'CAFE III',
          draft: true,
          cycle: 'MIDC → WLTP',
          cycleNote:
            (year >= BEYOND_DRAFT_FROM
              ? `The drafted CAFE III schedule ends at FY2031-32; FY${year}-${(year + 1) % 100} holds that final target line flat because BEE has drafted no constant beyond it. Treat this year's headroom as indicative. `
              : '') +
            'Draft CAFE III starts on MIDC and transitions to WLTP once MoRTH adopts it. The MIDC→WLTP conversion factor is to be notified separately (Ministry of Power).',
        },

  vehicleMetric: (v: Vehicle, s) => {
    if (/electric|bev/i.test(v.fuel) || v.co2 === 0) return 0
    const petrolEq = v.co2 / PETROL_DIV
    const cafe3 = s.year >= CAFE3_FROM
    // CNF discounts are a CAFE III (draft) mechanism — inert in CAFE II years.
    // Auto-derived from fuel (E20 petrol 8% · CNG 5% · flex 22.3%) unless the
    // row carries an explicit cnf; the cnfEnabled lever stress-tests "CNF is
    // struck from the final notification".
    let cnf = cafe3 && s.cnfEnabled !== false ? (v.cnf ?? autoCnf(v.fuel)) : 0
    // Fuel-pathway lever: a richer blend/CNG pathway (E27, flex, CNG conversion)
    // adds CNF points to every combustion row. Capped so it stays defensible.
    if (cafe3 && s.cnfBoostPct && cnf >= 0) cnf = Math.min(0.35, cnf + s.cnfBoostPct / 100)
    // MIDC→WLTP cycle conversion: the transition raises the measured number
    // ~18% while the (MIDC-based) limit is unchanged — the FY27-28 cliff.
    const wltp = cafe3 && s.cycleWltp ? 1.18 : 1
    return Math.max(0, petrolEq * (1 - cnf) * wltp)
  },
  vehicleUnits: (v: Vehicle, s) => {
    // Super-credits exist only in the draft CAFE III regime.
    if (s.year < CAFE3_FROM || !s.superCreditsEnabled) return v.sales
    const f = SUPER[v.powertrain] ?? (v.co2 === 0 || /electric|bev/i.test(v.fuel) ? 3 : 1)
    return v.sales * f
  },
  isZeroEmission: (v) => v.co2 === 0 || /electric|bev/i.test(v.fuel),
  isPlugInHybrid: (v) => /phev|plug/i.test(v.powertrain),
  limit: (ctx: LimitContext) => {
    if (ctx.year < CAFE3_FROM) return A * (ctx.avgMass - C2) + D2 // CAFE II, as in force
    const d = D3[ctx.year] ?? 3.0139
    // Draft-stringency stress: the constant is the negotiable part of the draft.
    const shift = 1 + (ctx.scenario.targetShiftPct ?? 0) / 100
    return A * (ctx.avgMass - C3) + d * shift
  },
  // EC Act 2022: stepped per-vehicle penalty on the fleet's average exceedance.
  fineFor: (excess, units) => (excess <= FINE_STEP + STEP_EPS ? FINE_TIER1 : FINE_TIER2) * units,
  forecast: (year) => ({
    limit: year < CAFE3_FROM ? A * (1300 - C2) + D2 : A * (1300 - C3) + (D3[year] ?? 3.0139),
    note:
      year < CAFE3_FROM
        ? `FY ${year}-${(year + 1) % 100} · CAFE II`
        : year >= BEYOND_DRAFT_FROM
          ? `FY ${year}-${(year + 1) % 100} · CAFE III beyond draft — FY2031-32 line held flat`
          : `FY ${year}-${(year + 1) % 100} · CAFE III draft`,
  }),
}
