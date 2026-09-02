// Which years Plan is allowed to read.
//
// This is the test that would have caught the bug it was written for: Plan was
// opening on India 2027 — a row from the source's own PLAN file — and
// presenting it as "the position you would file today". Nothing in the shape of
// a row says whether it is history or a projection, so the rule has to be
// explicit and it has to be tested.
import { describe, it, expect } from 'vitest'
import { actualsYears, settledThrough } from '../usePosition'
import { PACK_LIST, getPack } from '../../../engine/rulepacks'
import { DATA_REFRESHED, getFleet } from '../../../data/fleet'
import type { CountryId } from '../../../engine/types'

const ALL = PACK_LIST.map((p) => p.id)

describe('settled years', () => {
  it('never claims a settled year the rule pack cannot compute', () => {
    for (const c of ALL) {
      const pack = getPack(c)
      expect(pack.years).toContain(settledThrough(c))
    }
  })

  it('never claims a settled year later than the data refresh', () => {
    for (const c of ALL) {
      const pack = getPack(c)
      // A pack that declares its own settled year is authoritative; otherwise
      // the refresh date is the ceiling.
      if (pack.actualsThroughYear != null) {
        expect(settledThrough(c)).toBe(pack.actualsThroughYear)
      } else {
        expect(settledThrough(c)).toBeLessThanOrEqual(new Date(DATA_REFRESHED[c]).getFullYear())
      }
    }
  })

  it('honours China’s explicit declaration — 2026/27 are its Phase-6 planning rows', () => {
    expect(getPack('CN').actualsThroughYear).toBe(2025)
    expect(settledThrough('CN')).toBe(2025)
  })

  it('keeps India off its plan file: 2027+ are forward rows, not filings', () => {
    const { current, previous } = actualsYears('IN')
    expect(current).toBe(2026)
    expect(previous).toBe(2025)
    // The trap: the pack OPENS on 2027, which is exactly the year Plan must not read.
    expect(getPack('IN').defaultYear).toBe(2027)
    expect(current).toBeLessThan(getPack('IN').defaultYear!)
  })

  it('gives every market a current year, and a previous one where the pack has it', () => {
    for (const c of ALL) {
      const { current, previous } = actualsYears(c)
      expect(Number.isFinite(current)).toBe(true)
      if (previous != null) expect(previous).toBeLessThan(current)
    }
  })

  it('settled years always carry registrations', () => {
    for (const c of ALL) {
      const rows = getFleet(c as CountryId)
      const units = rows.filter((v) => v.year === settledThrough(c)).reduce((a, v) => a + v.sales, 0)
      expect(units).toBeGreaterThan(0)
    }
  })
})

describe('whether a previous year is real', () => {
  // Several datasets hold ONE year of registrations and let the engine project
  // it forward. Reporting a year-on-year change there is not "no change" — it is
  // comparing the file with itself, and Plan disables the control instead.
  const distinct = (c: CountryId) => {
    const { current, previous } = actualsYears(c)
    if (previous == null) return false
    const rows = getFleet(c)
    const stat = (y: number) => {
      const r = rows.filter((v) => v.year === y)
      const units = r.reduce((a, v) => a + v.sales, 0)
      return { units, n: r.length, metric: units ? r.reduce((a, v) => a + v.co2 * v.sales, 0) / units : 0 }
    }
    const a = stat(current), b = stat(previous)
    if (!b.units) return false
    return !(Math.abs(a.units - b.units) < 1 && Math.abs(a.metric - b.metric) < 1e-6 && a.n === b.n)
  }

  it('sees India’s two years as genuinely different data', () => {
    expect(distinct('IN')).toBe(true)
  })

  it('sees the EU as carrying a single year of registrations', () => {
    // The EEA extract is one monitoring year; the pack projects it across the
    // trajectory. A year-on-year delta here would be fabricated.
    expect(distinct('EU')).toBe(false)
  })
})
