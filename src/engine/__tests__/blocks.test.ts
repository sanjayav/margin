// Multi-year compliance blocks.
//
// The property under test is the one that carries money: a manufacturer over
// the line in a single year does NOT breach when the block as a whole clears,
// and the platform must stop charging it. These tests are built on a synthetic
// fleet so the arithmetic is checkable by hand rather than by whatever the
// bundled dataset happens to contain this month.
import { describe, it, expect } from 'vitest'
import { blockOf, blockPosition, blocksFor, creditPriceFor, lapseWarning } from '../blocks'
import { getPack } from '../rulepacks/index'
import type { ComplianceBlock, RulePack, Scenario, Vehicle } from '../types'

const IN = getPack('IN')

const car = (year: number, co2: number, sales: number, parent = 'Acme'): Vehicle => ({
  parent, pool: parent, brand: parent, make: parent, model: `m${co2}`, year,
  powertrain: 'ICE', fuel: 'Petrol', co2, mass: 1170, sales, vclass: 'Passenger car',
})

const scen = (year: number): Scenario => ({
  year, evSharePct: null, salesMultiplier: 1, massShiftKg: 0, ecoBoostG: 0,
  poolingEnabled: false, superCreditsEnabled: false, mix: null, extraVariants: [],
  cnfEnabled: false,
})

const block = (years: number[], over: Partial<ComplianceBlock> = {}): ComplianceBlock =>
  ({ id: 'b', label: 'b', years, note: '', ...over })

describe('block lookup', () => {
  it('India declares two drafted blocks covering FY2027-28 to FY2031-32', () => {
    expect(IN.complianceBlocks).toHaveLength(2)
    expect(blockOf(IN, 2028)?.years).toContain(2028)
    expect(blockOf(IN, 2031)?.id).toBe('in-b2')
    // CAFE II years sit outside any block — they are annual.
    expect(blockOf(IN, 2026)).toBeNull()
  })

  it('the EU carries the 2025–27 three-year averaging, and it banks nothing', () => {
    const eu = getPack('EU')
    expect(eu.complianceBlocks?.[0].years).toEqual([2025, 2026, 2027])
    expect(eu.complianceBlocks?.[0].creditsLapse).toBeFalsy()
  })

  it('a market with no blocks is annual, and says so by absence', () => {
    expect(getPack('AU').complianceBlocks).toBeUndefined()
    expect(blockOf(getPack('AU'), 2027)).toBeNull()
    expect(blocksFor(getPack('AU'))).toEqual([])
  })

  it('blocksFor filters to the years asked about', () => {
    expect(blocksFor(IN, [2031]).map((b) => b.id)).toEqual(['in-b2'])
    expect(blocksFor(IN, [2026])).toEqual([])
  })
})

describe('the credit price schedule', () => {
  it('reads the published year, not one flat number', () => {
    const y27 = creditPriceFor(IN, 2027)!
    const y31 = creditPriceFor(IN, 2031)!
    expect(y31).toBeGreaterThan(y27)
    // ₹2,500/g → ₹4,500/g is a 1.8× ramp; valuing the back end at the front
    // price understates it by 44%.
    expect(y31 / y27).toBeCloseTo(1.8, 1)
  })

  it('falls back to the flat price for a year the schedule does not name', () => {
    expect(creditPriceFor(IN, 2032)).toBe(IN.creditPrice)
  })

  it('returns null where the regime issues no instrument', () => {
    expect(creditPriceFor(getPack('EU'), 2027)).toBeNull()
  })
})

describe('block position', () => {
  // One year badly over, two years comfortably under, equal volumes.
  const rows = [
    car(2027, 150, 100_000),   // 6.33 L/100km against a 3.73 target — badly over
    car(2028, 40, 100_000),    // 1.69 against 3.57 — well under
    car(2029, 40, 100_000),    // 1.69 against 3.46 — well under
  ]

  it('a year that breaches alone is rescued when the block clears', () => {
    const p = blockPosition(rows, IN, scen(2027), block([2027, 2028, 2029]), 'Acme')
    expect(p.years.map((y) => y.breachesAlone)).toEqual([true, false, false])
    expect(p.status).toBe('compliant')
    expect(p.rescuedYears).toEqual([2027])
    expect(p.fine).toBe(0)
    // …and the annual view would have charged for it. That difference is the
    // entire point of the block.
    expect(p.annualFine).toBeGreaterThan(0)
  })

  it('weights the average by volume, not by year count', () => {
    // Same three years, but the bad year now carries ten times the volume.
    const heavy = [car(2027, 150, 1_000_000), car(2028, 40, 100_000), car(2029, 40, 100_000)]
    const p = blockPosition(heavy, IN, scen(2027), block([2027, 2028, 2029]), 'Acme')
    expect(p.units).toBe(1_200_000)
    // An unweighted mean of the three metrics would sit far below this.
    const unweighted = p.years.reduce((a, y) => a + y.metric, 0) / p.years.length
    expect(p.avgMetric).toBeGreaterThan(unweighted)
    expect(p.status).toBe('fine')
  })

  it('names the years dragged down by a block that still breaches', () => {
    const bad = [car(2027, 200, 100_000), car(2028, 200, 100_000), car(2029, 40, 100_000)]
    const p = blockPosition(bad, IN, scen(2027), block([2027, 2028, 2029]), 'Acme')
    expect(p.status).toBe('fine')
    expect(p.draggedYears).toContain(2029)
    expect(p.rescuedYears).toEqual([])
  })

  it('skips a year the dataset does not cover rather than averaging in a zero', () => {
    const gap = [car(2027, 40, 100_000), car(2029, 40, 100_000)]
    const p = blockPosition(gap, IN, scen(2027), block([2027, 2028, 2029]), 'Acme')
    expect(p.years.map((y) => y.year)).toEqual([2027, 2029])
    expect(p.units).toBe(200_000)
  })

  it('reports no-sales rather than a divide-by-zero when the block is empty', () => {
    const p = blockPosition([], IN, scen(2027), block([2027, 2028]), 'Acme')
    expect(p.status).toBe('no-sales')
    expect(p.units).toBe(0)
    expect(p.gap).toBe(0)
  })

  it('charges the block exceedance through the pack’s own stepped rule', () => {
    const over = [car(2027, 200, 100_000), car(2028, 200, 100_000)]
    const p = blockPosition(over, IN, scen(2027), block([2027, 2028]), 'Acme')
    // India's schedule is ₹25,000/car at ≤0.2 over and ₹50,000/car beyond —
    // never a smooth per-unit rate.
    expect(p.gap).toBeGreaterThan(0.2)
    expect(p.fine).toBeCloseTo(50_000 * p.units, -3)
  })
})

describe('credit lapse', () => {
  const good = [car(2027, 40, 100_000), car(2028, 40, 100_000)]

  it('warns on a surplus that dies with its block, and values it at the final-year price', () => {
    const p = blockPosition(good, IN, scen(2027), block([2027, 2028], { creditsLapse: true }), 'Acme')
    expect(p.status).toBe('compliant')
    const w = lapseWarning(p, IN)!
    expect(w.lapsesAfter).toBe(2028)
    expect(w.units).toBeGreaterThan(0)
    expect(w.value).toBeCloseTo(w.units * creditPriceFor(IN, 2028)!, 0)
  })

  it('says nothing where the block does not lapse credits', () => {
    const p = blockPosition(good, IN, scen(2027), block([2027, 2028]), 'Acme')
    expect(lapseWarning(p, IN)).toBeNull()
  })

  it('says nothing when the block is short — there is no surplus to lose', () => {
    const bad = [car(2027, 200, 100_000)]
    const p = blockPosition(bad, IN, scen(2027), block([2027], { creditsLapse: true }), 'Acme')
    expect(lapseWarning(p, IN)).toBeNull()
  })
})
