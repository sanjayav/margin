// ───────────────────────────────────────────────────────────────────────────
// RULE PACK · European Union — Reg (EU) 2019/631, amended by 2023/851 & 2025/1214
//
// A manufacturer's specific CO₂ target is the published EU fleet-wide target for
// the year plus a SIGNED mass term, then relaxed by the ZLEV factor:
//
//   cars  2025-2029:  ref = 93.6  − 0.0144 · (TM − 1609.6)
//   cars  2030-2034:  ref = 49.5  − 0.0076 · (TM − TM0)
//   vans  2025-2029:  ref = 153.9 + α · (TM − 2163.0)
//   vans  2030-2034:  ref = 90.6  + α · (TM − TM0)
//   2035+:            0 g/km, both classes
//   target = ref × ZLEV factor   (2025-2029 only)
//
// Two things here are easy to get wrong and both are load-bearing:
//
//   1. THE CAR SLOPE IS NEGATIVE. A heavier car fleet gets a TIGHTER target, not
//      a looser one. That is not a transcription slip in the statute — the 2021
//      CO₂-vs-test-mass regression for cars slopes DOWN (a2021 = −0.0175)
//      because the heavy vehicles in the 2021 fleet were the zero- and
//      low-emission ones. Flipping this sign hands every heavy premium fleet
//      several g/km of target it has not earned, and flatters the whole market.
//
//   2. VANS ARE PIECEWISE. Below TM0 the renormalised slope applies; above TM0
//      the steeper 2021 regression slope a2021 = 0.1064 does (Annex I Part B
//      point 6; JRC133502 eq 17/18). Since the EU van fleet averages ~2,216 kg
//      against a 2,163 kg TM0, the market sits on the STEEP branch — using the
//      shallow one understates van targets.
//
// Every constant below is from the Commission's own parameter report
// JRC133502 "2025 and 2030 CO₂ emission targets for light duty vehicles",
// eq (27)–(41), which is the analysis Commission Implementing Decision (EU)
// 2023/1623 Annex II is built on.
// ───────────────────────────────────────────────────────────────────────────
import type { RulePack, Vehicle, LimitContext } from '../types.js'

// EU fleet-wide 2021 WLTP reference values (JRC133502 §4.3.1, §4.4.1). Used for
// the "−x% vs 2021" headline; the target line itself uses the published targets.
const EU2021_CAR = 110.1
const EU2021_VAN = 181.1

// Published EU fleet-wide targets, g/km WLTP (JRC133502 eq 31/32/40/41).
const TARGET_CAR = { near: 93.6, far: 49.5 } // 2025-2029 · 2030-2034
const TARGET_VAN = { near: 153.9, far: 90.6 }

// Mass-adjustment slopes, g/(km·kg). SIGNED — see note 1 above.
const SLOPE_CAR_NEAR = -0.0144 // a2025 (JRC eq 28)
const SLOPE_CAR_FAR = -0.0076 // a2030 (JRC eq 29)
const SLOPE_VAN_NEAR = 0.0848 // a2025, applies at or below TM0 (JRC eq 37)
const SLOPE_VAN_FAR = 0.0499 // a2030, applies at or below TM0 (JRC eq 38)
const SLOPE_VAN_ABOVE = 0.1064 // a2021, applies ABOVE TM0 in both periods (JRC eq 36)

// Reference test masses (JRC eq 30, 39). Art 14(1)(d) has the Commission
// recalculate TM0 every second year from October 2024, so the 2030-2034 value is
// not yet fixed; the 2025 value is carried forward as the modelling assumption.
const TM0_CAR = 1609.6
const TM0_VAN = 2163.0

const FINE_RATE = 95 // €/g/km over · per car (Article 8)
// ZLEV target relaxation (2025–2029 only; removed from 2030). +1% per 1pp of
// ZLEV share above the benchmark, capped at 5%. ZLEV = 0–50 g/km.
const ZLEV_BENCH_CAR = 0.25
const ZLEV_BENCH_VAN = 0.17
const ZLEV_RELAX_CAP = 0.05

const isCar = (vclass: string) => !/van|lcv|light commercial/i.test(vclass)
const isPHEV = (pt: string) => /phev|plug/i.test(pt)
// Eco-innovation cap: 7 g/km ≤2024, 6 g/km 2025–2029, 4 g/km 2030–2034 (Art 11, amended 2023/851).
const ecoCap = (year: number) => (year <= 2024 ? 7 : year <= 2029 ? 6 : 4)

// PHEV utility-factor correction (Comm. Reg (EU) 2023/443). The revised WLTP UF
// (distance parameter 800→2200 km) roughly DOUBLES official PHEV CO₂ under Euro
// 6e-bis (new types 2025, all registrations 2026), with a further step under
// 6e-bis-FCM (new types 2027, all 2028). Multiplier vs the pre-2025 official
// figure, registration-weighted across the new-type/all-registration phase-in.
const PHEV_UF: Record<number, number> = {
  2024: 1.0, 2025: 1.35, 2026: 2.0, 2027: 2.2, 2028: 2.5, 2029: 2.5, 2030: 2.5,
}
const phevUF = (year: number) => PHEV_UF[year] ?? (year < 2024 ? 1 : 2.5)

/** Which target era a year sits in. 2035 is the zero-emission end state. */
const era = (year: number): 'near' | 'far' | 'zero' => (year >= 2035 ? 'zero' : year >= 2030 ? 'far' : 'near')

function fleetTarget(vclass: string, year: number) {
  const e = era(year)
  if (e === 'zero') return 0
  return isCar(vclass) ? TARGET_CAR[e] : TARGET_VAN[e]
}

/** The mass-adjustment slope for a class/year/mass. Cars use one signed slope
 *  per era; vans switch to the steeper a2021 above TM0. */
function slopeFor(vclass: string, year: number, avgMass: number) {
  const e = era(year)
  if (isCar(vclass)) return e === 'far' ? SLOPE_CAR_FAR : SLOPE_CAR_NEAR
  if (avgMass > TM0_VAN) return SLOPE_VAN_ABOVE
  return e === 'far' ? SLOPE_VAN_FAR : SLOPE_VAN_NEAR
}

function referenceTarget(vclass: string, year: number, avgMass: number) {
  // From 2035 the target is 0 g/km flat — no mass relief off a zero target.
  if (era(year) === 'zero') return 0
  const tm0 = isCar(vclass) ? TM0_CAR : TM0_VAN
  return fleetTarget(vclass, year) + slopeFor(vclass, year, avgMass) * (avgMass - tm0)
}

function zlevFactor(vclass: string, year: number, zlevShare: number) {
  if (year < 2025 || year >= 2030) return 1 // mechanism applies 2025–2029 only
  const bench = isCar(vclass) ? ZLEV_BENCH_CAR : ZLEV_BENCH_VAN
  return 1 + Math.min(ZLEV_RELAX_CAP, Math.max(0, zlevShare - bench))
}

/** Reduction vs the 2021 reference, for the forecast headline. */
const reductionVs2021 = (vclass: string, year: number) =>
  1 - fleetTarget(vclass, year) / (isCar(vclass) ? EU2021_CAR : EU2021_VAN)

export const EU: RulePack = {
  id: 'EU',
  name: 'European Union',
  flag: 'EU',
  currency: '€',
  metricUnit: 'g/km',
  metricLabel: 'Fleet CO₂',
  massLabel: 'Test mass',
  fineRate: FINE_RATE,
  fineRateLabel: '€95 per g/km over · per car (Article 8)',
  years: [2025, 2026, 2027, 2028, 2029, 2030],
  classes: ['Passenger car', 'Light commercial vehicle'],
  smallVolumeThreshold: 1000,
  // M1 and N1 are separate obligations with separate Article 8 premiums.
  classSeparateCompliance: true,
  pooling: { enabled: true, note: 'Article 6 — makers may pool registrations and share one average.' },
  // Reg (EU) 2025/1214 lets 2025–2027 be met on a three-year average rather
  // than year by year. It is the same mechanism as India's blocks and the same
  // trap: a maker over the line in 2025 alone does not breach if the three
  // years together clear. Nothing is banked or traded — this is time, not an
  // instrument — so credits do not lapse because there are no credits.
  complianceBlocks: [
    {
      id: 'eu-2527', label: 'Three-year averaging · 2025–2027', years: [2025, 2026, 2027],
      note: 'Reg (EU) 2025/1214 permits compliance across 2025, 2026 and 2027 to be assessed on the three-year average. Nothing is issued or banked; this is a timing flexibility, not a credit.',
    },
  ],
  transfer: {
    kind: 'pool',
    unit: 'g/km · car of pooled headroom',
    verb: 'pool',
    supplier: 'pool partner',
    taker: 'pool member',
    note: 'The EU issues no compliance credit. Article 6 lets manufacturers form a pool and be assessed on ONE combined fleet average — nothing is transferred, priced, banked or carried forward, and super-credits expired in 2022. Headroom still has real value (it is the fine a partner avoids), but it can only be realised by pooling, and the price is whatever the members privately agree. Reg (EU) 2025/1214 adds the only time flexibility: 2025-2027 may be met on a three-year average.',
  },
  credits: 'Eco-innovation credits up to 6 g/km (2025–2029), plus a ZLEV target relaxation (up to 5%) when the 0–50 g share beats the 25% car benchmark. Super-credits expired in 2022.',
  limitNote: 'EU fleet target (93.6 g/km for 2025 cars) MINUS 0.0144 g per kg of test mass above the 1609.6 kg reference — the car slope is negative, so a heavier fleet gets a tighter target. Vans add 0.0848 g/kg below the 2163.0 kg reference and 0.1064 above it. The result is then relaxed by the ZLEV factor (2025–2029).',
  source: 'Reg (EU) 2019/631 (Annex I Parts A & B), amended by 2023/851 and 2025/1214; target-line parameters from the Commission\'s JRC133502 eq (27)–(41); fleet from the EEA CO₂-monitoring file.',
  coverage: {
    tier: 'market',
    label: 'Full EEA registrations · 119 car makers (10.80M) + 87 van makers (1.17M) · 2025 provisional, published 25 Jun 2026',
    detail: 'Every new car and van registered in the EU, Norway and Iceland in 2025, from the EEA CO₂-monitoring file behind Reg (EU) 2019/631, aggregated to model · powertrain · maker with each maker\'s registrations, CO₂, test mass and eco-innovation credit preserved exactly. The car fleet reproduces the EEA\'s published headline to the decimal (96.7 g/km, BEV 18.9%, PHEV 9.7%); the van fleet reads 172.5 g/km against a published 172.1 because multi-stage van attribution is not exposed in the file. Declared Article 6 pools are the real 2025 ones. 2026-2030 hold the 2025 fleet as a baseline — the limit tightens, the fleet does not move until you model it.',
  },

  vehicleMetric: (v: Vehicle, s) => {
    if (v.co2 === 0) return 0
    // PHEV official CO₂ is corrected upward by the revised utility factor from 2025
    // (analysts can freeze it via scenario.phevUF = false to see the gross effect).
    const co2 = isPHEV(v.powertrain) ? v.co2 * (s.phevUF === false ? 1 : phevUF(s.year)) : v.co2
    const eco = Math.min((v.ecoBenefit ?? 0) + s.ecoBoostG, ecoCap(s.year))
    return Math.max(0, co2 - eco)
  },
  vehicleUnits: (v: Vehicle) => v.sales, // EU super-credits expired; 1 car = 1 unit
  isZeroEmission: (v) => v.co2 === 0,
  isZLEV: (v) => v.co2 <= 50, // zero/low-emission band for the benchmark relaxation
  isPlugInHybrid: (v) => /phev|plug/i.test(v.powertrain),
  limit: (ctx: LimitContext) => referenceTarget(ctx.vclass, ctx.year, ctx.avgMass) * zlevFactor(ctx.vclass, ctx.year, ctx.zlevShare),
  forecast: (year) => ({
    limit: fleetTarget('Passenger car', year),
    // Derived from the published target vs the 2021 reference, so it stays
    // correct at every year (−15% phase, −55% step, −100% in 2035) rather than
    // being a hand-maintained string that can drift from the maths above.
    note: `−${Math.round(reductionVs2021('Passenger car', year) * 100)}% vs 2021`,
  }),
  ecoCap, // Art 11 cap: 7 g/km ≤2024, 6 g/km 2025–2029, 4 g/km 2030+
}
