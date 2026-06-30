// ───────────────────────────────────────────────────────────────────────────
// RULE PACK · European Union — Reg (EU) 2019/631, amended by 2023/851 & 2025/1214
//
// Target model (post-2021, WLTP): a manufacturer's specific CO₂ target is the
// EU fleet-wide reference target for the year PLUS a mass-adjustment term:
//     target = fleetTarget(year) + a · (testMass − TM0)
// The 2025 EU car fleet target is 93.6 g/km WLTP = 2021 reference × (1 − 15%).
// Sources: EC "Cars and vans"; ICCT 2025 manufacturer targets (Oct 2024);
// Commission Implementing Decision (EU) 2023/1623 (a, TM0); JRC133502.
// ───────────────────────────────────────────────────────────────────────────
import type { RulePack, Vehicle, LimitContext } from '../types.js'

// EU fleet-wide 2021 WLTP reference. 2025 car target 93.6 = 110.118 × (1 − 0.15).
const EU2021_CAR = 110.118
const EU2021_VAN = 181.06 // × 0.85 ≈ 153.9 g (WLTP, approximate)

// Reduction vs the 2021 reference, by year. Cars and vans diverge from 2030
// (cars −55%, vans −50%); both reach −100% in 2035.
const REDUCTION_CAR: Record<number, number> = {
  2025: 0.15, 2026: 0.15, 2027: 0.15, 2028: 0.15, 2029: 0.15,
  2030: 0.55, 2031: 0.55, 2032: 0.55, 2033: 0.55, 2034: 0.55, 2035: 1,
}
const REDUCTION_VAN: Record<number, number> = {
  2025: 0.15, 2026: 0.15, 2027: 0.15, 2028: 0.15, 2029: 0.15,
  2030: 0.5, 2031: 0.5, 2032: 0.5, 2033: 0.5, 2034: 0.5, 2035: 1,
}

// Mass adjustment. 2025 switched to a TEST-MASS basis with a smaller slope than
// the 2020–2024 MIRO-basis 0.0333; TM0 recalculated to 1609.6 kg for 2025–2027.
const SLOPE_CAR = 0.0144
const SLOPE_VAN = 0.0427 // approximate test-mass van slope
const TM0_CAR = 1609.6
const TM0_VAN = 1900

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

function fleetTarget(vclass: string, year: number) {
  return isCar(vclass)
    ? EU2021_CAR * (1 - (REDUCTION_CAR[year] ?? 0.55))
    : EU2021_VAN * (1 - (REDUCTION_VAN[year] ?? 0.5))
}

function referenceTarget(vclass: string, year: number, avgMass: number) {
  const slope = isCar(vclass) ? SLOPE_CAR : SLOPE_VAN
  const tm0 = isCar(vclass) ? TM0_CAR : TM0_VAN
  return fleetTarget(vclass, year) + slope * (avgMass - tm0)
}

function zlevFactor(vclass: string, year: number, zlevShare: number) {
  if (year < 2025 || year >= 2030) return 1 // mechanism applies 2025–2029 only
  const bench = isCar(vclass) ? ZLEV_BENCH_CAR : ZLEV_BENCH_VAN
  return 1 + Math.min(ZLEV_RELAX_CAP, Math.max(0, zlevShare - bench))
}

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
  pooling: { enabled: true, note: 'Article 6 — makers may pool registrations and share one average.' },
  credits: 'Eco-innovation credits up to 6 g/km (2025–2029), plus a ZLEV target relaxation (up to 5%) when the 0–50 g share beats the 25% car benchmark. Super-credits expired in 2022.',
  limitNote: 'EU fleet target (93.6 g/km for 2025 cars = 2021 WLTP reference −15%) + 0.0144 g per kg of test mass vs the 1609.6 kg reference, then relaxed by the ZLEV factor (2025–2029).',
  source: 'EC Cars & Vans; ICCT 2025 targets; Reg (EU) 2019/631, 2023/851, 2025/1214.',

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
    // derive the headline from the actual reduction table so it stays correct at
    // every year (−15% phase, −55% step, −100% in 2035) instead of a fixed string.
    note: `−${Math.round((REDUCTION_CAR[year] ?? 0.55) * 100)}% vs 2021`,
  }),
  ecoCap, // Art 11 cap: 7 g/km ≤2024, 6 g/km 2025–2029, 4 g/km 2030+
}
