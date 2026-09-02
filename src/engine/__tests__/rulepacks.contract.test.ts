// Cross-pack contract tests. Adding a market is meant to be one file in
// rulepacks/ with no screen changes — these assert the parts of that contract a
// new pack can silently get wrong, and that no pack overstates its data.
import { describe, it, expect } from 'vitest'
import { PACK_LIST, getPack, hasCreditBook } from '../rulepacks'
import { buildTree } from '../engine'
import { getFleet } from '../../data/fleet'
import { defaultScenario } from '../../state/store'

describe('rule packs · contract', () => {
  it('ships the five markets the platform sells', () => {
    expect(PACK_LIST.map((p) => p.id).sort()).toEqual(['AU', 'CN', 'EU', 'IN', 'UK'])
  })

  for (const pack of PACK_LIST) {
    describe(pack.name, () => {
      it('declares its data coverage and names its source', () => {
        // Coverage drives the provenance line in the shell and the preview gate
        // on the module card — a pack without it would silently claim market data.
        expect(['market', 'partial', 'preview']).toContain(pack.coverage.tier)
        expect(pack.coverage.label.length).toBeGreaterThan(20)
        expect(pack.source.length).toBeGreaterThan(20)
      })

      it('explains itself to a customer where the answer is not obvious', () => {
        // Anything short of whole-market coverage has to say what is missing.
        if (pack.coverage.tier !== 'market') {
          expect(pack.coverage.detail, `${pack.id} needs a coverage detail`).toBeTruthy()
        }
        expect(pack.limitNote.length).toBeGreaterThan(20)
        expect(pack.fineRateLabel.length).toBeGreaterThan(5)
      })

      it('computes a finite position over its own bundled fleet', () => {
        const s = defaultScenario(pack.id)
        const t = buildTree(getFleet(pack.id), pack, s)
        for (const k of ['avgMetric', 'limit', 'gap', 'fine', 'avgMass'] as const) {
          expect(Number.isFinite(t[k]), `${pack.id}.${k} is not finite`).toBe(true)
        }
        expect(t.rawUnits).toBeGreaterThan(0)
        expect(t.children?.length ?? 0).toBeGreaterThan(0)
      })

      it('never charges a fine to a compliant fleet', () => {
        const s = defaultScenario(pack.id)
        const t = buildTree(getFleet(pack.id), pack, s)
        for (const maker of t.children ?? []) {
          expect(maker.fine).toBeGreaterThanOrEqual(0)
          if (pack.classSeparateCompliance) {
            // Each vehicle class is its own obligation, so the blended gap is a
            // display figure and cannot govern the bill: a maker can be long on
            // cars and short on vans (SEAT is). The real invariant is that a
            // charge exists only when SOME class is actually over its own line.
            const short = (maker.classes ?? []).some((c) => c.gap > 0)
            if (!short) expect(maker.fine, `${pack.id}/${maker.label}`).toBe(0)
            if (maker.fine > 0) expect(short, `${pack.id}/${maker.label}`).toBe(true)
          } else if (maker.gap <= 0) {
            expect(maker.fine, `${pack.id}/${maker.label}`).toBe(0)
          }
        }
      })

      it('sums the per-class premiums where classes are separate obligations', () => {
        if (!pack.classSeparateCompliance) return
        const s = defaultScenario(pack.id)
        const t = buildTree(getFleet(pack.id), pack, s)
        for (const maker of t.children ?? []) {
          const sum = (maker.classes ?? []).reduce((a, c) => a + c.fine, 0)
          expect(maker.fine, `${pack.id}/${maker.label}`).toBeCloseTo(sum, 2)
        }
      })

      it('opens on a year it actually models', () => {
        const s = defaultScenario(pack.id)
        expect(pack.years).toContain(s.year)
      })
    })
  }

  it('India and the EU are the markets that claim whole-market coverage', () => {
    // Deliberately assertive: if a third market earns `market` tier, this test
    // should be updated in the same change that loads the data — not before.
    // EU joined when the full EEA CO₂-monitoring file replaced the old
    // three-manufacturer sample (scripts/ingest-eu-eea.mjs).
    const market = PACK_LIST.filter((p) => p.coverage.tier === 'market').map((p) => p.id)
    expect(market).toEqual(['EU', 'IN'])
  })

  it('keeps a Credit book only where an instrument actually moves', () => {
    // The EU issues no compliance credit — Article 6 pooling shares ONE fleet
    // average and nothing is banked, priced or traded. The Credit book module is
    // hidden there (sidebar, ⌘K, module card, co-pilot navigation); every other
    // market trades and keeps its ledger.
    expect(hasCreditBook('EU')).toBe(false)
    for (const p of PACK_LIST) {
      expect(hasCreditBook(p.id), `${p.id} credit book should follow its transfer kind`).toBe(p.transfer.kind === 'trade')
    }
  })

  it('routes every country id to its own pack', () => {
    for (const p of PACK_LIST) expect(getPack(p.id).id).toBe(p.id)
  })

  it('the data store names a source for every market the platform ships', async () => {
    // Regression: SOURCES was missing CN while the seeder looped over all five
    // markets, so `SOURCES['CN'].name` threw and aborted the seed for EVERY
    // market — /api/fleet returned an error everywhere and the app fell back to
    // the bundled extract silently. A market with no source entry is now a
    // failing test rather than a dead data layer.
    const { SOURCES } = await import('../../../api/_store')
    for (const p of PACK_LIST) {
      expect(SOURCES[p.id], `no data source registered for ${p.id}`).toBeTruthy()
      expect(SOURCES[p.id].url).toMatch(/^https?:\/\//)
    }
  })
})
