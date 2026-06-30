// ───────────────────────────────────────────────────────────────────────────
// RULE PACK · India (Draft CAFE III, FY2027-32, BEE 25 Sep 2025)
// Limit & fleet figure are in L/100km (petrol-equivalent fuel consumption).
// Mirrors the India_CAFE_III workbook Assumptions + Calculator.
// ───────────────────────────────────────────────────────────────────────────
import type { RulePack, Vehicle, LimitContext } from '../types.js'

const A = 0.002          // slope, per kg
const C = 1170           // kg reference (kerb / unladen mass)
// Constant d (L/100km) by fiscal year
const D: Record<number, number> = {
  2027: 3.7264, 2028: 3.5737, 2029: 3.4573, 2030: 3.2224, 2031: 3.0139,
}
const PETROL_DIV = 23.7135 // CO₂ → petrol-equiv L/100km
const FINE_RATE = 1000     // ₹ per excess L/100km-unit · per vehicle (illustrative)
const SUPER: Record<string, number> = {
  BEV: 3, 'Range-Extender Hybrid': 3, PHEV: 2.5, 'Strong Hybrid Flex Fuel': 2.5,
  'Strong Hybrid': 2, 'Flex Fuel Ethanol': 1.5,
}

export const IN: RulePack = {
  id: 'IN',
  name: 'India',
  flag: 'IND',
  currency: '₹',
  metricUnit: 'L/100km',
  metricLabel: 'Fleet fuel use',
  massLabel: 'Kerb mass',
  fineRate: FINE_RATE,
  fineRateLabel: '₹1,000 per L/100km over · per car (illustrative)',
  years: [2027, 2028, 2029, 2030, 2031],
  classes: ['Passenger car'],
  smallVolumeThreshold: 1000,
  pooling: { enabled: false, note: 'CAFE III is assessed per manufacturer; pooling not provided in the draft.' },
  credits: 'Super-credits multiply clean-tech volume (BEV ×3, PHEV ×2.5, strong hybrid ×2) and carbon-neutral fuels (E20, CNG) discount fuel use.',
  limitNote: 'Fuel-use target: 0.002 × (kerb mass − 1170 kg) + a yearly constant that tightens from 3.73 to 3.01 L/100km.',
  source: 'Bureau of Energy Efficiency — Draft CAFE 2027 norms (25 Sep 2025).',

  vehicleMetric: (v: Vehicle) => {
    if (/electric|bev/i.test(v.fuel) || v.co2 === 0) return 0
    const petrolEq = v.co2 / PETROL_DIV
    // CAFE III has no eco-innovation lever; the only discount is the data-driven
    // carbon-neutral-fuel fraction (E20/CNG). (Previously the g/km `ecoBoostG`
    // lever was mis-applied here as a flat 5% fuel discount — a unit error.)
    const cnf = v.cnf ?? 0
    return Math.max(0, petrolEq * (1 - cnf))
  },
  vehicleUnits: (v: Vehicle, s) => {
    if (!s.superCreditsEnabled) return v.sales
    // Super-credits boost clean-tech volume; key off the same zero-emission test
    // the share/limit use, so a BEV labelled e.g. "Battery Electric" still gets ×3.
    const f = SUPER[v.powertrain] ?? (v.co2 === 0 || /electric|bev/i.test(v.fuel) ? 3 : 1)
    return v.sales * f
  },
  isZeroEmission: (v) => v.co2 === 0 || /electric|bev/i.test(v.fuel),
  isPlugInHybrid: (v) => /phev|plug/i.test(v.powertrain),
  limit: (ctx: LimitContext) => {
    const d = D[ctx.year] ?? 3.0139
    return A * (ctx.avgMass - C) + d
  },
  forecast: (year) => ({ limit: A * (1300 - C) + (D[year] ?? 3.0139), note: `FY ${year}-${(year + 1) % 100}` }),
}
