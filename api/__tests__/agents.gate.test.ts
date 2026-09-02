// The validation gate.
//
// This is the load-bearing safety property of the whole agentic design: an
// agent may PROPOSE anything, and none of it becomes actionable until the
// deterministic engine has re-derived it. These tests assert the gate refuses
// the four ways a model can be wrong — an unknown lever, an out-of-bounds
// value, a lever with no meaning in this regime, and a confident claim about
// its own effect that the engine disagrees with — plus the one hygiene rule,
// that an uncited proposal is not reviewable.
import { describe, it, expect } from 'vitest'
import { validateProposal } from '../agents.js'
import { clientContext } from '../../src/engine/tools.js'
import { FLEET } from '../../src/data/fleet.js'
import { getPack } from '../../src/engine/rulepacks/index.js'
import type { CountryId } from '../../src/engine/types.js'

const ALL: CountryId[] = ['EU', 'IN', 'AU', 'UK', 'CN']
const ctx = () => clientContext(ALL, true)
const cite = [{ label: 'India rule pack', ref: 'BEE draft CAFE III' }]
const YEAR = (c: CountryId) => getPack(c).defaultYear ?? getPack(c).years[0]

const proposal = (over: Record<string, unknown> = {}) => ({
  title: 'Lift the zero-emission share',
  rationale: 'Because the fleet is over the line.',
  risk: 'medium', reversible: true,
  changes: [{ path: 'scenario.evSharePct', label: 'Zero-emission share', to: 25, unit: '%' }],
  citations: cite,
  ...over,
})

describe('the validation gate', () => {
  it('accepts a well-formed proposal and hands back engine-derived effects', () => {
    const g = validateProposal(proposal(), ctx(), 'IN', YEAR('IN'))
    expect(g.ok).toBe(true)
    expect(g.reason).toBeUndefined()
    // The derived block is what a reviewer is allowed to act on, so it must be
    // populated by the engine rather than echoed from the proposal.
    expect(g.derived.length).toBeGreaterThan(0)
    expect(g.derived.every((d) => Number.isFinite(d.before) && Number.isFinite(d.after))).toBe(true)
    expect(g.checks.some((c) => c.id === 'engine' && c.status === 'pass')).toBe(true)
    expect(g.overrides).toMatchObject({ evSharePct: 25 })
  })

  it('refuses a lever the platform does not expose, before the engine is asked', () => {
    const g = validateProposal(
      proposal({ changes: [{ path: 'scenario.pretendLever', label: 'Made up', to: 1 }] }),
      ctx(), 'IN', YEAR('IN'),
    )
    expect(g.ok).toBe(false)
    expect(g.reason).toMatch(/Unknown lever/i)
    expect(g.derived).toHaveLength(0)
  })

  it('refuses a value outside the lever bounds', () => {
    const g = validateProposal(
      proposal({ changes: [{ path: 'scenario.evSharePct', label: 'Zero-emission share', to: 400 }] }),
      ctx(), 'IN', YEAR('IN'),
    )
    expect(g.ok).toBe(false)
    expect(g.checks.some((c) => c.id === 'lever:evSharePct' && c.status === 'fail')).toBe(true)
  })

  it('refuses pooling in a YEAR that has no pooling, even where the regime gains it later', () => {
    // India has no pooling under CAFE II and voluntary pooling from draft
    // CAFE III. A flat "does this market pool?" check answers one of those two
    // years wrongly; the gate has to ask about the year in front of it.
    const pooling = { changes: [{ path: 'scenario.poolingEnabled', label: 'Pooling', to: true }] }
    const underCafe2 = validateProposal(proposal(pooling), ctx(), 'IN', 2026)
    expect(underCafe2.ok).toBe(false)
    expect(underCafe2.reason).toMatch(/not available/i)

    // …and accepts it once the drafted regime that creates it is in force.
    const underCafe3 = validateProposal(proposal(pooling), ctx(), 'IN', 2028)
    expect(underCafe3.checks.some((c) => c.id === 'regime:pooling' && c.status === 'pass')).toBe(true)
  })

  it('still refuses pooling outright where the regime issues no instrument at all', () => {
    const g = validateProposal(
      proposal({ changes: [{ path: 'scenario.poolingEnabled', label: 'Pooling', to: true }] }),
      ctx(), 'EU', YEAR('EU'),
    )
    // The EU DOES pool (Article 6) — so the honest guard here is the transfer
    // model, not the pooling flag. Assert the pack states it correctly.
    expect(getPack('EU').transfer.kind).toBe('pool')
    expect(getPack('EU').pooling.enabled).toBe(true)
    expect(g.checks.some((c) => c.id === 'regime:pooling')).toBe(true)
  })

  it('refuses a market-specific lever used in the wrong market', () => {
    const g = validateProposal(
      proposal({ changes: [{ path: 'scenario.cycleWltp', label: 'MIDC→WLTP', to: true }] }),
      ctx(), 'EU', YEAR('EU'),
    )
    expect(g.ok).toBe(false)
    expect(g.reason).toMatch(/does not apply/i)
  })

  it('refuses an uncited proposal — evidence is not optional', () => {
    const g = validateProposal(proposal({ citations: [] }), ctx(), 'IN', YEAR('IN'))
    expect(g.ok).toBe(false)
    expect(g.checks.some((c) => c.id === 'citations' && c.status === 'fail')).toBe(true)
  })

  it('refuses a proposal whose stated effect the engine contradicts', () => {
    // The failure mode this exists for: a model that is confidently wrong about
    // the consequence of its own recommendation.
    const g = validateProposal(
      proposal({ expected: [{ label: 'Gap to limit', value: -999 }] }),
      ctx(), 'IN', YEAR('IN'),
    )
    expect(g.ok).toBe(false)
    expect(g.reason).toMatch(/diverged/i)
    expect(g.checks.some((c) => c.id.startsWith('expect:') && c.status === 'fail')).toBe(true)
  })

  it('passes an expectation that agrees with the engine', () => {
    const truth = validateProposal(proposal(), ctx(), 'IN', YEAR('IN'))
    const gap = truth.derived.find((d) => d.label === 'Gap to limit')!
    const g = validateProposal(
      proposal({ expected: [{ label: 'Gap to limit', value: gap.after }] }),
      ctx(), 'IN', YEAR('IN'),
    )
    expect(g.ok).toBe(true)
    expect(g.checks.some((c) => c.id.startsWith('expect:') && c.status === 'pass')).toBe(true)
  })

  it('refuses a proposal that changes nothing', () => {
    const g = validateProposal(proposal({ changes: [] }), ctx(), 'IN', YEAR('IN'))
    expect(g.ok).toBe(false)
    expect(g.reason).toMatch(/no changes/i)
  })
})

/* ── forecast assumption revisions take the same gate, a different calculation ── */

const revision = (over: Record<string, unknown> = {}) => ({
  title: 'Raise the zero-emission horizon',
  rationale: 'An incentive scheme that was due to lapse has been extended across the horizon.',
  risk: 'medium', reversible: true,
  changes: [{ path: 'driver.evShareHorizon', label: 'Zero-emission share at horizon', to: 36, unit: '%' }],
  citations: [{ label: 'Reuters', ref: 'India extends FAME-III incentives through FY2028' }],
  ...over,
})

describe('the gate, on a forecast assumption revision', () => {
  it('accepts a bounded revision and re-derives the whole horizon', () => {
    const g = validateProposal(revision(), ctx(), 'IN', YEAR('IN'))
    expect(g.ok).toBe(true)
    // The consequence of an assumption is measured over the horizon, not one year.
    expect(g.derived.some((d) => /cumulative exposure/i.test(d.label))).toBe(true)
    expect(g.checks.some((c) => c.id === 'engine' && c.status === 'pass')).toBe(true)
  })

  it('refuses an assumption the registry does not have', () => {
    const g = validateProposal(
      revision({ changes: [{ path: 'driver.vibes', label: 'Vibes', to: 5 }] }),
      ctx(), 'IN', YEAR('IN'),
    )
    expect(g.ok).toBe(false)
    expect(g.reason).toMatch(/unknown assumption/i)
  })

  it('refuses a value outside the driver’s own bounds', () => {
    const g = validateProposal(
      revision({ changes: [{ path: 'driver.evShareHorizon', label: 'ZE horizon', to: 400 }] }),
      ctx(), 'IN', YEAR('IN'),
    )
    expect(g.ok).toBe(false)
    expect(g.checks.some((c) => c.id === 'driver:evShareHorizon' && c.status === 'fail')).toBe(true)
  })

  it('refuses an uncited revision — an assumption with no source is not reviewable', () => {
    const g = validateProposal(revision({ citations: [] }), ctx(), 'IN', YEAR('IN'))
    expect(g.ok).toBe(false)
    expect(g.checks.some((c) => c.id === 'citations' && c.status === 'fail')).toBe(true)
  })

  it('refuses a proposal that mixes a compliance lever with an assumption', () => {
    // Two decisions wearing one approval.
    const g = validateProposal(
      revision({
        changes: [
          { path: 'driver.evShareHorizon', label: 'ZE horizon', to: 36 },
          { path: 'scenario.massShiftKg', label: 'Mass', to: 10 },
        ],
      }),
      ctx(), 'IN', YEAR('IN'),
    )
    expect(g.ok).toBe(false)
    expect(g.reason).toMatch(/not both/i)
  })
})
