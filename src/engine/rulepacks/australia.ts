// ───────────────────────────────────────────────────────────────────────────
// RULE PACK · Australia (New Vehicle Efficiency Standard, NVES)
// Two break-pointed mass-limit lines (Type 1 cars, Type 2 light commercials).
// Mirrors Australia_NVES NVES Parameters sheet. Credits trade at A$50/unit.
// ───────────────────────────────────────────────────────────────────────────
import type { RulePack, Vehicle, LimitContext } from '../types'

type P = { head: number; maf: number; ref: number; lower: number; upper: number }
// year → { Type 1, Type 2 }
const PARAMS: Record<number, { t1: P; t2: P }> = {
  2025: { t1: { head: 141, maf: 0.0663, ref: 1723, lower: 1500, upper: 2200 }, t2: { head: 210, maf: 0.0324, ref: 2155, lower: 1500, upper: 2400 } },
  2026: { t1: { head: 117, maf: 0.0663, ref: 1723, lower: 1500, upper: 2200 }, t2: { head: 180, maf: 0.0324, ref: 2155, lower: 1500, upper: 2400 } },
  2027: { t1: { head: 92, maf: 0.0663, ref: 1723, lower: 1500, upper: 2200 }, t2: { head: 150, maf: 0.0324, ref: 2155, lower: 1500, upper: 2400 } },
  2028: { t1: { head: 68, maf: 0.0663, ref: 1723, lower: 1500, upper: 2200 }, t2: { head: 122, maf: 0.0324, ref: 2155, lower: 1500, upper: 2400 } },
  2029: { t1: { head: 58, maf: 0.0663, ref: 1723, lower: 1500, upper: 2200 }, t2: { head: 110, maf: 0.0324, ref: 2155, lower: 1500, upper: 2400 } },
  2030: { t1: { head: 50, maf: 0.0663, ref: 1723, lower: 1500, upper: 2200 }, t2: { head: 100, maf: 0.0324, ref: 2155, lower: 1500, upper: 2400 } },
}
const FINE_RATE = 100 // A$ per g/km over · per unit
const isType2 = (vclass: string) => /type 2|2/.test(vclass) && !/type 1/.test(vclass)

export const AU: RulePack = {
  id: 'AU',
  name: 'Australia',
  flag: 'AUS',
  currency: 'A$',
  metricUnit: 'g/km',
  metricLabel: 'Fleet CO₂',
  massLabel: 'MIRO',
  fineRate: FINE_RATE,
  fineRateLabel: 'A$100 per g/km over · per unit',
  creditPrice: 50,
  creditPriceLabel: 'A$50 per g/km · per unit (illustrative market)',
  years: [2025, 2026, 2027, 2028, 2029, 2030],
  classes: ['Type 1', 'Type 2'],
  smallVolumeThreshold: 0,
  pooling: { enabled: true, note: 'Makers may transfer/trade credits; illustrative credit price A$50 per unit.' },
  credits: 'Over-achievers bank credits and may sell them to laggards (A$50/unit illustrative). No super-credit multiplier.',
  limitNote: 'Two break-pointed lines: a headline target tightening each year ± a mass-adjustment per kg vs the reference MIRO, clamped between break-points.',
  source: 'DCCEEW — New Vehicle Efficiency Standard determinations.',

  vehicleMetric: (v: Vehicle) => (v.co2 === 0 ? 0 : Math.max(0, v.co2)),
  vehicleUnits: (v: Vehicle) => v.sales,
  isZeroEmission: (v) => v.co2 === 0 || v.zev === 1,
  isPlugInHybrid: (v) => /phev|plug/i.test(v.powertrain),
  limit: (ctx: LimitContext) => {
    const p = (PARAMS[ctx.year] ?? PARAMS[2030])[isType2(ctx.vclass) ? 't2' : 't1']
    const miro = Math.min(p.upper, Math.max(p.lower, ctx.avgMass))
    return p.head + p.maf * (miro - p.ref)
  },
  forecast: (year) => ({ limit: (PARAMS[year] ?? PARAMS[2030]).t1.head, note: `Type 1 headline ${(PARAMS[year] ?? PARAMS[2030]).t1.head} g` }),
}
