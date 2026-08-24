// ───────────────────────────────────────────────────────────────────────────
// RULE PACK · United Kingdom — VETS / ZEV mandate, modelled AS a unit mandate
//
// The UK scheme is not a CO₂ average: it mandates a rising share of zero-
// emission registrations (CRTS cars / VRTS vans), with a fixed £ payment per
// missing ZEV and tradable allowances. We map that exactly onto the shared
// engine by scoring each vehicle 0 (ZEV) or 100 (non-ZE):
//   · fleet avgMetric  = non-ZE share, in %
//   · limit            = allowed non-ZE share for the year/class (1 − ZEV target)
//   · gap              = percentage points of missing ZEV share
//   · fine             = gap/100 × units × £12,000  ⇒ fineRate = £120 per pp·unit
// So "£12,000 per missing ZEV car" is reproduced exactly, and every screen
// (bubble chart, waterfall, pooling, Monte-Carlo) works on the true mechanism.
// ───────────────────────────────────────────────────────────────────────────
import type { RulePack, Vehicle, LimitContext } from '../types.js'

// Non-ZE allowance (= 1 − ZEV mandate trajectory), DfT VETS Order 2023 Sch.1:
// cars 22→80% ZEV 2024–2030, vans 10→70%.
const ALLOW_CAR: Record<number, number> = {
  2024: 0.78, 2025: 0.72, 2026: 0.67, 2027: 0.62, 2028: 0.48, 2029: 0.34, 2030: 0.2,
}
const ALLOW_VAN: Record<number, number> = {
  2024: 0.9, 2025: 0.84, 2026: 0.76, 2027: 0.66, 2028: 0.54, 2029: 0.42, 2030: 0.3,
}
// £12,000 per missing ZEV car — statutory rate after the April 2025 flexibility
// package (was £15,000; vans are £15,000, approximated at the car rate here —
// see validate.ts review note). Expressed per percentage-point per unit.
const CAR_FINE_PER_UNIT = 12_000
const FINE_RATE = CAR_FINE_PER_UNIT / 100 // £ per pp of missing ZEV share, per unit
// Observed year-one CRTS credit trades ≈ £4,000 per ZEV credit (market price,
// not statutory) — the buy-vs-build benchmark for the optimiser and MACC.
const CREDIT_PER_UNIT = 4_000
const isVan = (vclass: string) => /van/i.test(vclass)

export const UK: RulePack = {
  id: 'UK',
  name: 'United Kingdom',
  flag: 'UK',
  currency: '£',
  metricUnit: '% non-ZE',
  metricLabel: 'Non-ZE share',
  massLabel: 'Test mass',
  fineRate: FINE_RATE,
  fineRateLabel: '£12,000 per missing ZEV car (VETS, Apr 2025 rate)',
  creditPrice: CREDIT_PER_UNIT / 100,
  creditPriceLabel: '≈£4,000 per ZEV credit (observed CRTS trading, year 1)',
  years: [2024, 2025, 2026, 2027, 2028, 2029, 2030],
  classes: ['Car', 'Van'],
  smallVolumeThreshold: 2500, // <2,500 registrations/yr are out of VETS scope
  // A unit mandate doesn't move with vehicle mass — hide mass levers so nobody
  // "lightweights" their way to ZEV compliance in a scenario.
  massBasedLimit: false,
  pooling: {
    enabled: true,
    note: 'CRTS/VRTS allowances are tradable between manufacturers (Nov–Dec window); banking (≤3 yrs) and borrowing (2024–29, repay by 2030) smooth year-to-year positions.',
  },
  transfer: {
    kind: 'trade',
    unit: 'ZEV allowance',
    verb: 'trade',
    supplier: 'seller',
    taker: 'buyer',
    note: 'CRTS/VRTS allowances transfer between manufacturers in the Nov–Dec window, bank for up to 3 years, and can be borrowed 2024–29 at 3.5% compounding (repaid by 2030).',
  },
  credits:
    'Unit-based: one allowance per ZEV registration. Tradable (≈£4k observed), bankable ≤3 years, borrowable 2024–29 at 3.5% compounding interest (repay by 2030); non-ZE CO₂-improvement conversion exists but is not modelled yet.',
  limitNote:
    'Allowed non-ZE share of registrations = 1 − ZEV mandate (cars 22%→80% ZEV over 2024–30; vans 10%→70%). The metric is the fleet\'s non-ZE share, so "over the line" = missing ZEV volume.',
  source: 'DfT — Vehicle Emissions Trading Schemes (VETS) Order 2023; April 2025 flexibility package.',
  coverage: {
    tier: 'preview',
    label: 'Sample fleet — three manufacturers, carried to exercise the VETS rule pack',
    detail: 'The ZEV mandate is modelled as the unit mandate it is — % non-ZE metric, £12,000 per missing ZEV, CRTS credit trading — and computes correctly. The bundled fleet is a three-manufacturer sample. The DfT publishes no registration-volume feed comparable to the EEA’s, so real UK coverage needs a licensed dataset.',
  },

  // A vehicle either is a ZEV (counts 0) or is not (counts 100) — the weighted
  // average is then exactly the non-ZE share of effective registrations, in %.
  vehicleMetric: (v: Vehicle) => (v.co2 === 0 ? 0 : 100),
  vehicleUnits: (v: Vehicle) => v.sales,
  isZeroEmission: (v) => v.co2 === 0,
  isPlugInHybrid: (v) => /phev|plug/i.test(v.powertrain),
  limit: (ctx: LimitContext) => {
    const allow = (isVan(ctx.vclass) ? ALLOW_VAN : ALLOW_CAR)[ctx.year] ?? 0.2
    return allow * 100
  },
  forecast: (year) => ({
    limit: (ALLOW_CAR[year] ?? 0.2) * 100,
    note: `${Math.round((1 - (ALLOW_CAR[year] ?? 0.2)) * 100)}% ZEV mandate (cars)`,
  }),
  // No eco-innovation mechanism in a unit mandate: the eco lever is disabled and
  // the optimiser won't propose it. (The CO₂-conversion flexibility is a
  // separate, capped mechanism — modelled in a later pass.)
}
