// ───────────────────────────────────────────────────────────────────────────
// RULE PACK · European Union (Regulation (EU) 2019/631, 2025/1214 flexibility)
// Mirrors the EU_CO2_Three_Parent workbook's Assumptions + Calculator sheets.
// ───────────────────────────────────────────────────────────────────────────
import type { RulePack, Vehicle, LimitContext } from '../types.js'

// Annex-I style mass-based target proxy
const BASE_CAR = 95 // g CO₂/km, 2021 fleet-wide reference
const BASE_VAN = 147
const SLOPE_CAR = 0.0333 // g per kg
const SLOPE_VAN = 0.096
const TM0_CAR = 1609 // kg
const TM0_VAN = 1900
const ECO_CAP = 7 // Article 11 eco-innovation cap, g
const ZLEV_CAP = 1.05 // Annex I cap on target relaxation
const FINE_RATE = 95 // €/g/km · per vehicle (Article 8)

// Reduction factor + ZLEV benchmark by year (Assumptions H:L)
const reduction: Record<number, number> = {
  2025: 0.15, 2026: 0.15, 2027: 0.15, 2028: 0.15, 2029: 0.15,
  2030: 0.55, 2031: 0.55, 2032: 0.55, 2033: 0.55, 2034: 0.55, 2035: 1,
}
const zlevBenchmark: Record<number, number> = {
  2025: 0.15, 2026: 0.15, 2027: 0.15, 2028: 0.15, 2029: 0.15,
  2030: 0.35, 2031: 0.35, 2032: 0.35, 2033: 0.35, 2034: 0.35, 2035: 0.35,
}

const isCar = (vclass: string) => !/van|lcv|light commercial/i.test(vclass)

function referenceTarget(vclass: string, year: number, avgMass: number) {
  const r = reduction[year] ?? 0.55
  return isCar(vclass)
    ? BASE_CAR * (1 - r) + SLOPE_CAR * (avgMass - TM0_CAR)
    : BASE_VAN * (1 - r) + SLOPE_VAN * (avgMass - TM0_VAN)
}

function zlevFactor(year: number, zlevShare: number) {
  const bench = zlevBenchmark[year] ?? 0.35
  return Math.max(1, Math.min(ZLEV_CAP, 1 + zlevShare - bench))
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
  credits: 'Eco-innovation credits up to 7 g/km, plus a ZLEV target relaxation when the zero/low-emission share beats the yearly benchmark.',
  limitNote: 'Mass-based: 95 g baseline, reduced each year, ±0.0333 g per kg vs the 1609 kg reference, then relaxed by the ZLEV factor.',
  source: 'European Environment Agency — CO₂ monitoring of new passenger cars & vans.',

  vehicleMetric: (v: Vehicle, s) => {
    if (v.co2 === 0) return 0
    const eco = Math.min((v.ecoBenefit ?? 0) + s.ecoBoostG, ECO_CAP)
    return Math.max(0, v.co2 - eco)
  },
  vehicleUnits: (v: Vehicle) => v.sales, // EU super-credits expired; 1 car = 1 unit
  isZeroEmission: (v) => v.co2 === 0,
  isPlugInHybrid: (v) => /phev|plug/i.test(v.powertrain),
  limit: (ctx: LimitContext) => {
    const ref = referenceTarget(ctx.vclass, ctx.year, ctx.avgMass)
    return ref * zlevFactor(ctx.year, ctx.zlevShare)
  },
  forecast: (year) => ({
    limit: referenceTarget('Passenger car', year, TM0_CAR),
    note: year >= 2030 ? '55% reduction step in force' : '15% reduction phase',
  }),
}
