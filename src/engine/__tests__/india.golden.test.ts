// ───────────────────────────────────────────────────────────────────────────
// GOLDEN VALUES · India (CAFE II → draft CAFE III)
//
// Every expectation here is derived from the statute BY HAND and written as a
// literal, not read back out of the engine. That is the whole point: these tests
// fail when the engine changes its answer, which is exactly the regression that
// would otherwise reach a customer as a confidently wrong ₹ figure.
//
// Sources for the constants:
//   CAFE II  (in force to 31 Mar 2027) — 113 gCO₂/km at 1,145 kg reference,
//            slope 0.002 L/100km per kg. Petrol-equivalent divisor 23.7135.
//   CAFE III (BEE draft, 25 Sep 2025)  — slope 0.002, reference 1,170 kg,
//            constant d: 3.7264 (FY27-28) … 3.0139 (FY31-32), held flat after.
//   Penalty  — Energy Conservation (Amendment) Act 2022: ₹25,000 per vehicle
//            when average exceedance ≤ 0.2 L/100km, ₹50,000 per vehicle beyond.
// ───────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { buildTree } from '../engine'
import { IN } from '../rulepacks/india'
import type { Scenario, Vehicle } from '../types'

// ── fixtures ───────────────────────────────────────────────────────────────

/** A minimal row. Defaults are deliberately boring so each test varies one thing. */
function car(over: Partial<Vehicle> = {}): Vehicle {
  return {
    parent: 'Test Motors', pool: 'Test Motors', brand: 'Test', make: 'Test',
    model: 'Hatch', year: 2027, powertrain: 'ICE', fuel: 'Diesel',
    co2: 118.5675, mass: 1170, sales: 10_000, vclass: 'Passenger car',
    ...over,
  }
}

function scenario(over: Partial<Scenario> = {}): Scenario {
  return {
    year: 2027,
    evSharePct: null, salesMultiplier: 1, massShiftKg: 0, ecoBoostG: 0,
    poolingEnabled: false, superCreditsEnabled: true,
    mix: null, extraVariants: [], phevUF: true, creditPrice: null,
    targetShiftPct: null, cnfEnabled: true,
    ...over,
  }
}

const run = (fleet: Vehicle[], s: Partial<Scenario> = {}) => buildTree(fleet, IN, scenario(s))

// Diesel carries no carbon-neutral-fuel discount, so petrol-equivalent fuel use
// is exactly co2 / 23.7135 — which keeps the arithmetic below hand-checkable.
const PETROL_DIV = 23.7135

// ── the limit line ─────────────────────────────────────────────────────────

describe('India · target line', () => {
  it('CAFE II applies through FY2026-27 — 113 gCO₂/km at the 1,145 kg reference', () => {
    // 0.002 × (1145 − 1145) + 113/23.7135 = 4.76524…
    const t = run([car({ year: 2026, mass: 1145 })], { year: 2026 })
    expect(t.limit).toBeCloseTo(113 / PETROL_DIV, 6)
  })

  it('CAFE II slope is 0.002 L/100km per kg above the reference', () => {
    const t = run([car({ year: 2026, mass: 1345 })], { year: 2026 })
    // 200 kg heavier ⇒ +0.4 L/100km
    expect(t.limit).toBeCloseTo(113 / PETROL_DIV + 0.4, 6)
  })

  it('CAFE III takes over at FY2027-28 with the 1,170 kg reference', () => {
    const t = run([car({ year: 2027, mass: 1170 })], { year: 2027 })
    expect(t.limit).toBeCloseTo(3.7264, 6)
  })

  it('walks the drafted constant down to 3.0139 by FY2031-32', () => {
    const drafted: Record<number, number> = {
      2027: 3.7264, 2028: 3.5737, 2029: 3.4573, 2030: 3.2224, 2031: 3.0139,
    }
    for (const [year, d] of Object.entries(drafted)) {
      const y = Number(year)
      expect(run([car({ year: y, mass: 1170 })], { year: y }).limit).toBeCloseTo(d, 6)
    }
  })

  it('holds the FY2031-32 line flat beyond the end of the drafted schedule', () => {
    // BEE has drafted no constant past FY2031-32 — extrapolating one would be
    // inventing regulation, so 2032 must reuse 2031 rather than continue the slope.
    const t2031 = run([car({ year: 2031, mass: 1170 })], { year: 2031 })
    const t2032 = run([car({ year: 2032, mass: 1170 })], { year: 2032 })
    expect(t2032.limit).toBeCloseTo(t2031.limit, 6)
  })

  it('stringency lever scales the draft constant, not the mass term', () => {
    // −10% on the constant: 0.002 × (1370 − 1170) + 3.7264 × 0.9
    const t = run([car({ mass: 1370 })], { targetShiftPct: -10 })
    expect(t.limit).toBeCloseTo(0.4 + 3.7264 * 0.9, 6)
  })
})

// ── the metric ─────────────────────────────────────────────────────────────

describe('India · fleet fuel use', () => {
  it('converts CO₂ to petrol-equivalent at 23.7135', () => {
    const t = run([car({ co2: 118.5675 })]) // 118.5675 / 23.7135 = 5.0000…
    expect(t.avgMetric).toBeCloseTo(5, 6)
  })

  it('counts a BEV as zero fuel use', () => {
    const t = run([car({ powertrain: 'BEV', fuel: 'Electric', co2: 0 })])
    expect(t.avgMetric).toBe(0)
  })

  it('applies the E20 carbon-neutral-fuel discount to petrol under CAFE III', () => {
    // 8% discount on E20 pump petrol: 5.0 × (1 − 0.08) = 4.6
    const t = run([car({ fuel: 'Petrol', co2: 118.5675 })])
    expect(t.avgMetric).toBeCloseTo(5 * 0.92, 6)
  })

  it('leaves CNF inert under CAFE II — it is a CAFE III mechanism', () => {
    const t = run([car({ year: 2026, fuel: 'Petrol', co2: 118.5675 })], { year: 2026 })
    expect(t.avgMetric).toBeCloseTo(5, 6)
  })

  it('cnfEnabled:false models CNF being struck from the final notification', () => {
    const t = run([car({ fuel: 'Petrol', co2: 118.5675 })], { cnfEnabled: false })
    expect(t.avgMetric).toBeCloseTo(5, 6)
  })

  it('applies the ~18% MIDC→WLTP uplift when the cycle lever is on', () => {
    const t = run([car({ co2: 118.5675 })], { cycleWltp: true })
    expect(t.avgMetric).toBeCloseTo(5 * 1.18, 6)
  })
})

// ── super-credits ──────────────────────────────────────────────────────────

describe('India · super-credits', () => {
  // 9,000 diesel at 5.0 L/100km + 1,000 BEV at 0.
  const mixed = [
    car({ sales: 9_000, co2: 118.5675 }),
    car({ model: 'EV', powertrain: 'BEV', fuel: 'Electric', co2: 0, sales: 1_000 }),
  ]

  it('multiplies BEV volume ×3 in the denominator under draft CAFE III', () => {
    // Σ(metric × units) = 9,000 × 5 = 45,000 · Σunits = 9,000 + 1,000×3 = 12,000
    const t = run(mixed)
    expect(t.avgMetric).toBeCloseTo(45_000 / 12_000, 6)
    expect(t.units).toBe(12_000)
  })

  it('does not apply super-credits under CAFE II', () => {
    const t = run(mixed.map((v) => ({ ...v, year: 2026 })), { year: 2026 })
    expect(t.avgMetric).toBeCloseTo(45_000 / 10_000, 6)
    expect(t.units).toBe(10_000)
  })

  it('leaves actual registrations untouched — only effective units are credited', () => {
    // The fine is charged per REGISTERED vehicle, so rawUnits must never inflate.
    expect(run(mixed).rawUnits).toBe(10_000)
  })
})

// ── the penalty ────────────────────────────────────────────────────────────

describe('India · EC Act 2022 stepped penalty', () => {
  it('charges nothing when the fleet is under the line', () => {
    const t = run([car({ co2: 60, mass: 1170 })])
    expect(t.gap).toBeLessThan(0)
    expect(t.fine).toBe(0)
  })

  it('charges ₹25,000 per vehicle at exactly 0.2 L/100km over', () => {
    // limit at 1,170 kg = 3.7264 ⇒ target metric 3.9264 ⇒ co2 = 3.9264 × 23.7135
    const t = run([car({ co2: 3.9264 * PETROL_DIV, sales: 10_000 })])
    expect(t.gap).toBeCloseTo(0.2, 6)
    expect(t.fine).toBe(25_000 * 10_000)
  })

  it('steps to ₹50,000 per vehicle beyond 0.2 L/100km', () => {
    const t = run([car({ co2: 4.2 * PETROL_DIV, sales: 10_000 })])
    expect(t.gap).toBeGreaterThan(0.2)
    expect(t.fine).toBe(50_000 * 10_000)
  })

  it('is a cliff, not a ramp — a real step over 0.2 doubles the bill', () => {
    const under = run([car({ co2: 3.9264 * PETROL_DIV, sales: 10_000 })])
    const over = run([car({ co2: 3.93 * PETROL_DIV, sales: 10_000 })])
    expect(over.fine).toBe(under.fine * 2)
  })

  it('does not step tiers on floating-point noise at the threshold', () => {
    // Regression. A fleet arithmetically AT 0.2 over reaches the penalty via a
    // CO₂ → L/100km conversion, so it lands a few ulps either side of the
    // statutory step depending on volume — this fixture measured
    // 0.20000000000000018, and the engine charged ₹50,000/vehicle instead of
    // ₹25,000. Doubling a per-vehicle penalty on an ulp is a multi-thousand-crore
    // error on a million-unit fleet, so anything inside the noise band is tier 1.
    for (const sales of [10_000, 250_000, 1_000_000, 1_826_798]) {
      const t = run([car({ co2: 3.9264 * PETROL_DIV, sales })])
      expect(Math.abs(t.gap - 0.2), `gap drifted at ${sales} units`).toBeLessThan(1e-9)
      expect(t.fine, `wrong tier at ${sales} units`).toBe(25_000 * sales)
    }
  })

  it('exempts small-volume manufacturers below the 1,000-unit threshold', () => {
    const t = run([car({ co2: 4.2 * PETROL_DIV, sales: 999 })])
    const maker = t.children?.[0]
    expect(maker?.status).toBe('exempt')
    expect(maker?.fine).toBe(0)
  })
})

// ── market aggregation ─────────────────────────────────────────────────────

describe('India · market totals', () => {
  it('market exposure is the SUM of per-maker fines, not the fine on the average', () => {
    // The invariant the co-pilot's get_position tool depends on: a market whose AVERAGE clears the line
    // still owes money when any single maker is over it.
    const fleet = [
      car({ parent: 'Over Motors', pool: 'Over Motors', co2: 4.5 * PETROL_DIV, sales: 10_000 }),
      car({ parent: 'Under Motors', pool: 'Under Motors', co2: 2.0 * PETROL_DIV, sales: 10_000 }),
    ]
    const t = run(fleet)
    const makers = t.children ?? []
    const summed = makers.reduce((a, m) => a + m.fine, 0)

    expect(t.gap).toBeLessThan(0)          // market average is under the line…
    expect(summed).toBeGreaterThan(0)      // …and the market still owes ₹
    expect(makers.filter((m) => m.status === 'fine')).toHaveLength(1)
  })

  it('assesses each maker standalone under CAFE II, and only pools from draft CAFE III', async () => {
    const { poolingAllowed } = await import('../blocks')
    // The regime has the concept — but not yet.
    expect(IN.pooling.enabled).toBe(true)
    expect(IN.pooling.fromYear).toBe(2027)
    // CAFE II: every manufacturer standalone, no pool to join.
    expect(poolingAllowed(IN, 2025)).toBe(false)
    expect(poolingAllowed(IN, 2026)).toBe(false)
    // Draft CAFE III adds voluntary pooling from FY2027-28.
    expect(poolingAllowed(IN, 2027)).toBe(true)
    expect(poolingAllowed(IN, 2031)).toBe(true)
  })
})

// ── shipped dataset ────────────────────────────────────────────────────────
// Guards the numbers a customer sees on the opening screen. These catch a bad
// re-ingest during demo prep, which is otherwise silent.

describe('India · shipped dataset', () => {
  it('covers the whole PV market at the expected FY2025-26 scale', async () => {
    const { getFleet } = await import('../../data/fleet')
    const rows = getFleet('IN').filter((v) => v.year === 2025)
    const makers = new Set(rows.map((v) => v.parent))
    const units = rows.reduce((a, v) => a + v.sales, 0)

    expect(makers.size).toBe(13)
    // FY2025-26 is a complete 12-month actual — ≈4.80M units, VAHAN-benchmarked.
    expect(units).toBeGreaterThan(4_700_000)
    expect(units).toBeLessThan(4_900_000)
  })

  it('ranks the makers a customer will look for first', async () => {
    const { getFleet } = await import('../../data/fleet')
    const rows = getFleet('IN').filter((v) => v.year === 2025)
    const byMaker = new Map<string, number>()
    for (const v of rows) byMaker.set(v.parent, (byMaker.get(v.parent) ?? 0) + v.sales)
    const ranked = [...byMaker.entries()].sort((a, b) => b[1] - a[1]).map(([m]) => m)

    expect(ranked[0]).toMatch(/Maruti/)
    expect(ranked.slice(0, 5).some((m) => /Hyundai/.test(m))).toBe(true)
    expect(ranked.slice(0, 5).some((m) => /Tata/.test(m))).toBe(true)
  })

  it('declares itself as market-grade coverage', () => {
    expect(IN.coverage.tier).toBe('market')
  })
})
