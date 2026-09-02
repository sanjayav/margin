// The scenario board's arithmetic.
//
// These are the properties a board paper rests on: that weights normalise
// however sloppily they were typed, that a case can never push an assumption
// outside its own bounds, and that the weighted expectation is actually a
// weighted expectation rather than a midpoint.
import { describe, it, expect } from 'vitest'
import { BUILTIN_CASES, applyCase, describeDeltas, normalisedWeights, weighted, type ForecastCase } from '../cases'
import { DRIVER_DEFAULTS, DRIVER_META } from '../../../../engine/outlook'

const book = DRIVER_DEFAULTS.IN
const mk = (id: string, weight: number, deltas: ForecastCase['deltas'] = {}): ForecastCase =>
  ({ id, name: id, blurb: '', deltas, weight, origin: 'analyst', falsifier: '' })

describe('case weights', () => {
  it('normalise however sloppily they were typed', () => {
    const w = normalisedWeights([mk('a', 0.5), mk('b', 0.2), mk('c', 0.1)])
    expect(Object.values(w).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10)
    expect(w.a).toBeCloseTo(0.625, 6)
  })

  it('fall back to an even split rather than dividing by zero', () => {
    const w = normalisedWeights([mk('a', 0), mk('b', 0)])
    expect(w.a).toBeCloseTo(0.5, 10)
    expect(w.b).toBeCloseTo(0.5, 10)
  })

  it('ignore a negative weight instead of letting it subtract', () => {
    const w = normalisedWeights([mk('a', 1), mk('b', -5)])
    expect(w.a).toBeCloseTo(1, 10)
    expect(w.b).toBe(0)
  })

  it('produce a genuine expectation, not a midpoint', () => {
    const cases = [mk('a', 0.9), mk('b', 0.1)]
    expect(weighted(cases, (c) => (c.id === 'a' ? 100 : 0))).toBeCloseTo(90, 6) // a midpoint would be 50
  })
})

describe('applying a case', () => {
  it('shifts the book by the deltas and leaves the rest alone', () => {
    const out = applyCase(book, mk('x', 1, { evShareHorizon: +10 }))
    expect(out.evShareHorizon).toBe(book.evShareHorizon + 10)
    expect(out.marketGrowth).toBe(book.marketGrowth)
  })

  it('cannot take a driver outside its own bounds, however large the delta', () => {
    const meta = DRIVER_META.find((m) => m.key === 'evShareHorizon')!
    expect(applyCase(book, mk('x', 1, { evShareHorizon: +999 })).evShareHorizon).toBe(meta.max)
    expect(applyCase(book, mk('y', 1, { evShareHorizon: -999 })).evShareHorizon).toBe(meta.min)
  })

  it('never mutates the book it was given', () => {
    const before = { ...book }
    applyCase(book, mk('x', 1, { massDrift: +5 }))
    expect(book).toEqual(before)
  })

  it('ignores a delta naming a driver that does not exist', () => {
    expect(applyCase(book, mk('x', 1, { nonsense: 5 } as never))).toEqual(book)
  })
})

describe('the built-in board', () => {
  it('ships three cases whose weights already sum to one', () => {
    expect(BUILTIN_CASES).toHaveLength(3)
    expect(BUILTIN_CASES.reduce((a, c) => a + c.weight, 0)).toBeCloseTo(1, 6)
  })

  it('gives every case a falsifier — a case you cannot disprove is a mood', () => {
    for (const c of BUILTIN_CASES) expect(c.falsifier.length).toBeGreaterThan(20)
  })

  it('describes its deltas in the driver registry’s own labels and units', () => {
    const d = describeDeltas(BUILTIN_CASES.find((c) => c.id === 'accelerate')!)
    expect(d.length).toBeGreaterThan(0)
    for (const x of d) expect(DRIVER_META.some((m) => m.label === x.label && m.unit === x.unit)).toBe(true)
  })

  it('makes the two stress cases move the fleet in opposite directions', () => {
    const up = applyCase(book, BUILTIN_CASES.find((c) => c.id === 'accelerate')!)
    const down = applyCase(book, BUILTIN_CASES.find((c) => c.id === 'stall')!)
    expect(up.evShareHorizon).toBeGreaterThan(down.evShareHorizon)
    expect(up.massDrift).toBeLessThan(down.massDrift)
  })
})
