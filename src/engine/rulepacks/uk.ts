// ───────────────────────────────────────────────────────────────────────────
// RULE PACK · United Kingdom (VETS / ZEV mandate, illustrative CO₂ view)
// The UK mechanism is a ZEV sales mandate; here it is surfaced on the shared
// CO₂ chart as a target = baseline × the year's non-ZE allowance, mirroring the
// UK_VETS workbook Assumptions (CRTS/VRTS NZE allowance %).
// ───────────────────────────────────────────────────────────────────────────
import type { RulePack, Vehicle, LimitContext } from '../types.js'

// non-ZE allowance share by year (workbook Assumptions rows 2-3)
const ALLOW_CAR: Record<number, number> = {
  2024: 0.78, 2025: 0.72, 2026: 0.67, 2027: 0.62, 2028: 0.48, 2029: 0.34, 2030: 0.2,
}
const ALLOW_VAN: Record<number, number> = {
  2024: 0.9, 2025: 0.84, 2026: 0.76, 2027: 0.66, 2028: 0.54, 2029: 0.42, 2030: 0.3,
}
const BASE_CAR = 150
const BASE_VAN = 180
const ECO_CAP = 7
const FINE_RATE = 100 // £/g/km over · per car (illustrative bridge of CRTS payments)
const isVan = (vclass: string) => /van/i.test(vclass)

export const UK: RulePack = {
  id: 'UK',
  name: 'United Kingdom',
  flag: 'UK',
  currency: '£',
  metricUnit: 'g/km',
  metricLabel: 'Fleet CO₂',
  massLabel: 'Test mass',
  fineRate: FINE_RATE,
  fineRateLabel: '£100 per g/km over · per car (illustrative)',
  creditPrice: 50,
  creditPriceLabel: '£50 per g/km · per car (illustrative market)',
  years: [2024, 2025, 2026, 2027, 2028, 2029, 2030],
  classes: ['Car', 'Van'],
  smallVolumeThreshold: 0,
  pooling: { enabled: true, note: 'CRTS/VRTS allow transfer and borrowing of allowances between schemes.' },
  credits: 'Eco-innovation credits up to 7 g/km; the binding lever is the rising zero-emission sales mandate.',
  limitNote: 'Illustrative CO₂ target = baseline × the year\'s non-ZE allowance (0.78 → 0.20 for cars), so the line falls as the ZEV mandate tightens.',
  source: 'DfT — Vehicle Emissions Trading Schemes (VETS) Order.',

  vehicleMetric: (v: Vehicle, s) => {
    if (v.co2 === 0) return 0
    const eco = Math.min((v.ecoBenefit ?? 0) + s.ecoBoostG, ECO_CAP)
    return Math.max(0, v.co2 - eco)
  },
  vehicleUnits: (v: Vehicle) => v.sales,
  isZeroEmission: (v) => v.co2 === 0,
  isPlugInHybrid: (v) => /phev|plug/i.test(v.powertrain),
  limit: (ctx: LimitContext) => {
    const allow = (isVan(ctx.vclass) ? ALLOW_VAN : ALLOW_CAR)[ctx.year] ?? 0.2
    const base = isVan(ctx.vclass) ? BASE_VAN : BASE_CAR
    return base * allow
  },
  forecast: (year) => ({ limit: BASE_CAR * (ALLOW_CAR[year] ?? 0.2), note: `${Math.round((1 - (ALLOW_CAR[year] ?? 0.2)) * 100)}% ZE mandate` }),
}
