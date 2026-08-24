// ───────────────────────────────────────────────────────────────────────────
// GOLDEN VALUES · European Union (Reg (EU) 2019/631, amended 2023/851 & 2025/1214)
//
// Two halves, and the split matters:
//
//   TARGET LINE — every constant is derived from the statute BY HAND and written
//   as a literal, never read back out of the engine, so these fail when the
//   engine changes its answer.
//     · 2025-2029 car fleet target 93.6 g/km = 2021 WLTP reference − 15%
//     · 2030-2034 49.5 g/km (−55%); 2035 0 g/km. Vans: 153.9 / 90.6 / 0.
//     · cars: mass term a·(TM − TM0) with a NEGATIVE a = −0.0144 (2025-29) /
//       −0.0076 (2030-34), TM0 = 1609.6 kg. A heavier car fleet gets a TIGHTER
//       target — the 2021 CO₂-vs-mass regression slopes down because the heavy
//       2021 vehicles were the electric ones.
//     · vans: PIECEWISE. +0.0848 (2025-29) / +0.0499 (2030-34) at or below
//       TM0 = 2163.0 kg, and +0.1064 (the 2021 regression slope) above it.
//       (all from the Commission's JRC133502, eq (27)–(41))
//     · Article 8 penalty €95 per g/km over, per registration
//     · ZLEV relaxation 2025-2029 only: +1% per pp of 0-50 g share above the
//       25% car benchmark, capped at +5%
//
//   SHIPPED DATASET — the EU fleet is the EEA CO₂-monitoring file for 2025
//   (provisional, published 25 Jun 2026), loaded by scripts/ingest-eu-eea.mjs.
//   These assertions are the EEA's OWN PUBLISHED HEADLINE, so they fail if the
//   ingest ever drifts off the official source. Note the EEA truncates to one
//   decimal (96.725 → "96.7"), so the comparison truncates too.
// ───────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { buildTree } from '../engine'
import { EU } from '../rulepacks/eu'
import { getFleet } from '../../data/fleet'
import type { Scenario, Vehicle } from '../types'

function car(over: Partial<Vehicle> = {}): Vehicle {
  return {
    parent: 'Test Motors', pool: 'Test Motors', brand: 'Test', make: 'Test',
    model: 'Hatch', year: 2025, powertrain: 'ICE', fuel: 'Petrol',
    co2: 120, mass: 1609.6, sales: 100_000, vclass: 'Passenger car', ...over,
  }
}
const scen = (over: Partial<Scenario> = {}): Scenario => ({
  year: 2025, evSharePct: null, salesMultiplier: 1, massShiftKg: 0, ecoBoostG: 0,
  poolingEnabled: false, superCreditsEnabled: true, mix: null, extraVariants: [],
  phevUF: true, creditPrice: null, targetShiftPct: null, ...over,
})
const limitOf = (rows: Vehicle[], s: Scenario) => buildTree(rows, EU, s).limit

describe('EU · target line', () => {
  it('is 93.6 g/km at the 1609.6 kg reference mass in 2025', () => {
    expect(limitOf([car()], scen())).toBeCloseTo(93.6, 1)
  })

  it('holds 93.6 g/km flat across 2025-2029', () => {
    for (const year of [2025, 2026, 2027, 2028, 2029]) {
      expect(limitOf([car({ year })], scen({ year }))).toBeCloseTo(93.6, 1)
    }
  })

  it('steps to 49.55 g/km in 2030 (−55% vs the 2021 reference)', () => {
    // 110.118 × 0.45 = 49.553. The Commission's "49.5 g/km" headline is that
    // figure rounded to one decimal; the target line uses the reference itself.
    expect(limitOf([car({ year: 2030 })], scen({ year: 2030 }))).toBeCloseTo(49.55, 1)
  })

  it('TIGHTENS the car target as the fleet gets heavier — the slope is negative', () => {
    // This is the one that looks like a bug and is not. a2025 = −0.0144.
    const base = limitOf([car()], scen())
    const heavy = limitOf([car({ mass: 2609.6 })], scen())
    expect(heavy - base).toBeCloseTo(-14.4, 1) // 1000 kg × −0.0144
    expect(heavy).toBeLessThan(base)
  })

  it('LOOSENS the car target for a lighter-than-reference fleet', () => {
    expect(limitOf([car({ mass: 1109.6 })], scen())).toBeCloseTo(93.6 + 7.2, 1)
  })

  it('uses the shallower −0.0076 car slope from 2030', () => {
    const base = limitOf([car({ year: 2030 })], scen({ year: 2030 }))
    const heavy = limitOf([car({ year: 2030, mass: 2609.6 })], scen({ year: 2030 }))
    expect(heavy - base).toBeCloseTo(-7.6, 1) // 1000 kg × −0.0076
  })

  it('gives vans their own line — 153.9 g/km at the 2163.0 kg van reference', () => {
    const v = car({ vclass: 'Light commercial vehicle', mass: 2163 })
    expect(limitOf([v], scen())).toBeCloseTo(153.9, 1)
  })

  it('drops vans to 90.6 g/km in 2030 (−50%, a shallower step than cars)', () => {
    const v = car({ vclass: 'Light commercial vehicle', mass: 2163, year: 2030 })
    expect(limitOf([v], scen({ year: 2030 }))).toBeCloseTo(90.6, 1)
  })

  it('switches the van slope either side of TM0 — piecewise, per Annex I Part B', () => {
    const van = (mass: number, year = 2025) => limitOf([car({ vclass: 'Light commercial vehicle', mass, year })], scen({ year }))
    // 163 kg BELOW the 2163.0 kg reference → shallow a2025 = 0.0848
    expect(van(2000)).toBeCloseTo(153.9 - 0.0848 * 163, 1)
    // 163 kg ABOVE → steep a2021 = 0.1064
    expect(van(2326)).toBeCloseTo(153.9 + 0.1064 * 163, 1)
    // the steep branch must be steeper than the shallow one
    expect(van(2326) - 153.9).toBeGreaterThan(153.9 - van(2000))
  })

  it('goes to 0 g/km in 2035 for both classes, with no mass relief', () => {
    for (const mass of [1200, 1609.6, 2600]) {
      expect(limitOf([car({ mass, year: 2035 })], scen({ year: 2035 }))).toBe(0)
      expect(limitOf([car({ vclass: 'Light commercial vehicle', mass, year: 2035 })], scen({ year: 2035 }))).toBe(0)
    }
  })
})

describe('EU · ZLEV target relaxation', () => {
  const fleetAt = (zlevShare: number, year = 2025) => {
    // 0-50 g band counts as ZLEV; split the volume to hit the wanted share.
    const ze = Math.round(100_000 * zlevShare)
    return [car({ year, co2: 0, powertrain: 'BEV', sales: ze }), car({ year, co2: 150, sales: 100_000 - ze })]
  }

  it('does nothing at the 25% benchmark', () => {
    expect(limitOf(fleetAt(0.25), scen())).toBeCloseTo(93.6, 1)
  })

  it('lifts the limit 1% per point of ZLEV share above the benchmark', () => {
    expect(limitOf(fleetAt(0.28), scen())).toBeCloseTo(93.6 * 1.03, 1)
  })

  it('caps the relaxation at 5%', () => {
    expect(limitOf(fleetAt(0.90), scen())).toBeCloseTo(93.6 * 1.05, 1)
  })

  it('never tightens the limit when ZLEV share is below the benchmark', () => {
    expect(limitOf(fleetAt(0.05), scen())).toBeCloseTo(93.6, 1)
  })

  it('is gone from 2030 — the mechanism expires in 2029', () => {
    expect(limitOf(fleetAt(0.40, 2029), scen({ year: 2029 }))).toBeCloseTo(93.6 * 1.05, 1)
    expect(limitOf(fleetAt(0.40, 2030), scen({ year: 2030 }))).toBeCloseTo(49.55, 1)
  })
})

describe('EU · cars and vans are SEPARATE obligations', () => {
  // Reg (EU) 2019/631 gives a manufacturer two specific emission targets (M1 and
  // N1) and Article 8 charges each independently. Netting them lets van headroom
  // pay down a car deficit, which is not a thing the law allows — and it reports
  // a maker as compliant when it owes a premium.
  const mixed = (carGap: number, vanGap: number) => [
    car({ co2: 93.6 + carGap, mass: 1609.6, sales: 100_000 }),
    car({ vclass: 'Light commercial vehicle', co2: 153.9 + vanGap, mass: 2163, sales: 100_000 }),
  ]

  it('charges the van premium even when the car fleet is long', () => {
    const t = buildTree(mixed(-10, +10), EU, scen())
    const maker = t.children![0]
    expect(maker.classes).toHaveLength(2)
    const van = maker.classes!.find((c) => /commercial/i.test(c.vclass))!
    expect(van.gap).toBeCloseTo(10, 1)
    expect(maker.fine).toBeCloseTo(10 * 95 * 100_000, -4) // vans only
  })

  it('does not let van headroom cancel a car deficit', () => {
    const t = buildTree(mixed(+10, -40), EU, scen())
    const maker = t.children![0]
    expect(maker.fine).toBeCloseTo(10 * 95 * 100_000, -4) // cars only, van surplus wasted
  })

  it('sums both premiums when both classes are short', () => {
    const t = buildTree(mixed(+5, +8), EU, scen())
    const maker = t.children![0]
    expect(maker.fine).toBeCloseTo((5 + 8) * 95 * 100_000, -4)
    expect(maker.fine).toBeCloseTo(maker.classes!.reduce((a, c) => a + c.fine, 0), 2)
  })

  it('charges nothing when both classes clear', () => {
    const t = buildTree(mixed(-5, -5), EU, scen())
    expect(t.children![0].fine).toBe(0)
  })

  it('measures each class ZLEV benchmark on its own fleet', () => {
    // An all-BEV van fleet must not lend its ZLEV share to the car target.
    const rows = [
      car({ co2: 120, mass: 1609.6, sales: 100_000 }),
      car({ vclass: 'Light commercial vehicle', co2: 0, powertrain: 'BEV', mass: 2163, sales: 100_000 }),
    ]
    const maker = buildTree(rows, EU, scen()).children![0]
    const cars = maker.classes!.find((c) => !/commercial/i.test(c.vclass))!
    expect(cars.limit).toBeCloseTo(93.6, 1) // no relaxation borrowed from the vans
  })

  it('finds real makers in the shipped fleet that clear blended but owe per class', () => {
    const t = buildTree(getFleet('EU'), EU, scen())
    const hidden = (t.children ?? []).filter((m) => m.gap <= 0 && m.fine > 0)
    expect(hidden.length).toBeGreaterThan(0)
    for (const m of hidden) expect((m.classes ?? []).some((c) => c.gap > 0)).toBe(true)
  })
})

describe('EU · Article 8 penalty', () => {
  it('charges nothing when the fleet is under the line', () => {
    const t = buildTree([car({ co2: 80 })], EU, scen())
    expect(t.fine).toBe(0)
    expect(t.status).toBe('compliant')
  })

  it('charges €95 per g/km over, per registration', () => {
    // 103.6 g on a 1609.6 kg fleet = 10 g over 93.6, on 100,000 cars.
    const t = buildTree([car({ co2: 103.6 })], EU, scen())
    expect(t.gap).toBeCloseTo(10, 1)
    expect(t.fine).toBeCloseTo(10 * 95 * 100_000, -4)
  })

  it('is linear — no step, unlike India', () => {
    const one = buildTree([car({ co2: 94.6 })], EU, scen()).fine
    const ten = buildTree([car({ co2: 103.6 })], EU, scen()).fine
    expect(ten / one).toBeCloseTo(10, 0)
  })

  it('exempts manufacturers below the 1,000-unit threshold', () => {
    const t = buildTree([car({ co2: 200, sales: 900 })], EU, scen())
    expect(t.children?.[0].status).toBe('exempt')
    expect(t.children?.[0].fine).toBe(0)
  })
})

describe('EU · credits and the PHEV utility factor', () => {
  it('caps eco-innovation at 6 g/km for 2025-2029 and 4 g/km from 2030', () => {
    expect(EU.ecoCap!(2024)).toBe(7)
    expect(EU.ecoCap!(2025)).toBe(6)
    expect(EU.ecoCap!(2029)).toBe(6)
    expect(EU.ecoCap!(2030)).toBe(4)
  })

  it('subtracts the eco-innovation credit from the fleet average', () => {
    const t = buildTree([car({ co2: 120, ecoBenefit: 2 })], EU, scen())
    expect(t.avgMetric).toBeCloseTo(118, 1)
  })

  it('never credits more than the cap, however large the claim', () => {
    const t = buildTree([car({ co2: 120, ecoBenefit: 50 })], EU, scen())
    expect(t.avgMetric).toBeCloseTo(114, 1) // 120 − 6
  })

  it('raises PHEV CO₂ by the revised utility factor from 2025', () => {
    const phev = (year: number) => buildTree([car({ year, co2: 30, powertrain: 'PHEV' })], EU, scen({ year })).avgMetric
    expect(phev(2024)).toBeCloseTo(30, 1)   // ×1.0
    expect(phev(2025)).toBeCloseTo(40.5, 1) // ×1.35
    expect(phev(2026)).toBeCloseTo(60, 1)   // ×2.0
  })

  it('leaves the UF out when the analyst freezes it', () => {
    const t = buildTree([car({ co2: 30, powertrain: 'PHEV' })], EU, scen({ phevUF: false }))
    expect(t.avgMetric).toBeCloseTo(30, 1)
  })

  it('counts one car as one unit — EU super-credits expired in 2022', () => {
    const t = buildTree([car({ co2: 0, powertrain: 'BEV', sales: 1000 })], EU, scen())
    expect(t.units).toBe(1000)
    expect(t.rawUnits).toBe(1000)
  })
})

describe('EU · shipped dataset (EEA 2025 provisional, published 25 Jun 2026)', () => {
  const fleet = getFleet('EU')
  const at = (y: number, vclass: string) => fleet.filter((v) => v.year === y && v.vclass === vclass)
  const cars = at(2025, 'Passenger car')
  const vans = at(2025, 'Light commercial vehicle')
  const regs = (rows: Vehicle[]) => rows.reduce((a, v) => a + v.sales, 0)
  const wavg = (rows: Vehicle[], f: (v: Vehicle) => number) => rows.reduce((a, v) => a + f(v) * v.sales, 0) / regs(rows)
  const trunc1 = (x: number) => Math.trunc(x * 10) / 10

  it('carries every new car registered in the EU, Norway and Iceland in 2025', () => {
    expect(regs(cars)).toBe(10_799_313) // EEA: "10.8 million"
    expect(new Set(cars.map((v) => v.parent)).size).toBe(119)
  })

  it('carries the van fleet too', () => {
    expect(regs(vans)).toBe(1_168_249) // EEA: "1.2 million"
    expect(new Set(vans.map((v) => v.parent)).size).toBe(87)
  })

  it("reproduces the EEA's published 96.7 g/km car fleet average", () => {
    expect(trunc1(wavg(cars, (v) => v.co2))).toBe(96.7)
  })

  it("reproduces the EEA's published 18.9% BEV and 9.7% PHEV shares", () => {
    const share = (pred: (v: Vehicle) => boolean) => (regs(cars.filter(pred)) / regs(cars)) * 100
    expect(trunc1(share((v) => v.co2 === 0))).toBe(18.9)
    expect(trunc1(share((v) => v.powertrain === 'PHEV'))).toBe(9.7)
  })

  it('carries the true per-vehicle eco-innovation credit, not the claimants-only mean', () => {
    // Regression: AVG(Erwltp) over non-NULL rows only reads 1.50 g/km and would
    // understate the whole market's CO₂ — and so its fines.
    expect(wavg(cars, (v) => v.ecoBenefit ?? 0)).toBeCloseTo(0.777, 2)
  })

  it('uses test mass, which sits above the 1609.6 kg reference', () => {
    expect(wavg(cars, (v) => v.mass)).toBeCloseTo(1721.2, 0)
  })

  it('records the real 2025 Article 6 pools, not standalone placeholders', () => {
    const poolOf = (parent: string) => cars.find((v) => v.parent === parent)?.pool
    expect(poolOf('Toyota Motor Corporation')).toBe('Tesla')
    expect(poolOf('Ford Werke GmbH')).toBe('Tesla')
    expect(poolOf('Volvo')).toBe('Mercedes-Benz, Volvo Cars, Polestar and Smart')
    expect(poolOf('BYD Auto')).toBe('Nissan-BYD')
    // VW-group companies each hold their own target in 2025 — no declared pool.
    // A maker with no pool stands alone UNDER ITS OWN NAME (the same convention
    // parentPoolMap uses), so the drill can step through the 1:1 tier instead of
    // showing "Skoda (standalone) › Skoda".
    expect(poolOf('Skoda')).toBe('Skoda')
  })

  it('leaves only genuine multi-member pools as pools', () => {
    const members = new Map<string, Set<string>>()
    for (const v of cars) {
      if (!members.has(v.pool)) members.set(v.pool, new Set())
      members.get(v.pool)!.add(v.parent)
    }
    const real = [...members.entries()].filter(([, m]) => m.size > 1).map(([p]) => p).sort()
    expect(real).toEqual([
      'BMW',
      'Hyundai Motor Europe',
      'KG Mobility Xpeng',
      'Mazda',
      'Mercedes-Benz, Volvo Cars, Polestar and Smart',
      'Nissan-BYD',
      'Tesla',
    ])
    // every other "pool" is exactly its own manufacturer
    for (const [pool, m] of members) if (m.size === 1) expect([...m][0]).toBe(pool)
  })

  it('separates plug-in from non-plug hybrids — Fm, not Ft', () => {
    // Reading the fuel string alone cannot tell a NOVC hybrid from a plug-in and
    // would file 3.3M petrol hybrids as plain ICE.
    expect(cars.some((v) => v.powertrain === 'HEV')).toBe(true)
    expect(cars.some((v) => v.powertrain === 'PHEV')).toBe(true)
    expect(cars.filter((v) => v.powertrain === 'PHEV').every((v) => v.co2 > 0)).toBe(true)
    expect(cars.filter((v) => v.powertrain === 'BEV').every((v) => v.co2 === 0)).toBe(true)
  })

  it('holds the 2025 fleet across the compliance horizon, and says so', () => {
    for (const y of [2026, 2027, 2028, 2029, 2030]) {
      expect(regs(at(y, 'Passenger car'))).toBe(10_799_313)
      expect(at(y, 'Passenger car').every((v) => /held/.test((v as any).source ?? ''))).toBe(true)
    }
    expect(cars.every((v) => !/held/.test((v as any).source ?? ''))).toBe(true)
  })

  it('the market MISSES 2025 even after the ZLEV relaxation', () => {
    // 93.6 − 0.0144 × (1721.2 − 1609.6) = 91.99, × 1.025 ZLEV = 94.29 against a
    // 97.03 after-credit average. Getting the slope sign wrong flips this to a
    // false pass, which is exactly why the sign is pinned by a test.
    const t = buildTree(cars, EU, scen())
    expect(t.limit).toBeCloseTo(94.29, 0)
    expect(t.gap).toBeGreaterThan(2)
    const fines = (t.children ?? []).reduce((a, m) => a + m.fine, 0)
    expect(fines).toBeGreaterThan(8e9)     // ≈ €9.4bn standalone across makers
  })

  it('charges the heavy premium fleets hardest — they get the tightest targets', () => {
    const t = buildTree(cars, EU, scen())
    const by = new Map((t.children ?? []).map((m) => [m.label, m]))
    const merc = by.get('Mercedes-Benz AG')!, dacia = by.get('Dacia')!
    expect(merc.avgMass).toBeGreaterThan(dacia.avgMass)
    expect(merc.limit).toBeLessThan(dacia.limit)   // heavier ⇒ tighter
    expect(merc.gap).toBeGreaterThan(15)
  })
})
