// The walkthrough's talking points are GENERATED from the engine, not written as
// copy — so they cannot quietly drift from the screen behind them. These tests
// hold that property: the script must name real makers, quote the real exposure,
// and drive the workspace to a scope where its own sentence is true.
import { describe, it, expect } from 'vitest'
import { buildGuideSteps } from '../../components/GuidedPath'
import { buildTree } from '../engine'
import { getPack, PACK_LIST } from '../rulepacks'
import { getFleet } from '../../data/fleet'
import { defaultScenario } from '../../state/store'

const treeFor = (id: 'EU' | 'IN' | 'AU' | 'UK' | 'CN') => {
  const pack = getPack(id)
  const s = defaultScenario(id)
  return { pack, s, tree: buildTree(getFleet(id), pack, s) }
}

describe('guided path', () => {
  it('runs Position → Risk → Fix → Price → Board pack', () => {
    const { pack, s, tree } = treeFor('IN')
    const steps = buildGuideSteps(pack, tree, 'IN', s.year)
    expect(steps.map((x) => x.id)).toEqual(['position', 'risk', 'fix', 'price', 'pack'])
  })

  for (const p of PACK_LIST) {
    it(`${p.name}: every step says something and goes somewhere`, () => {
      const { pack, s, tree } = treeFor(p.id)
      const steps = buildGuideSteps(pack, tree, p.id, s.year)
      for (const st of steps) {
        // A step that renders an empty sentence is a dead beat in a live demo.
        expect(st.say.length, `${p.id}/${st.id} has no talking point`).toBeGreaterThan(40)
        expect(st.say).not.toMatch(/undefined|NaN|\[object/)
        expect(st.action.screen, `${p.id}/${st.id} goes nowhere`).toBeTruthy()
      }
    })
  }

  it('quotes the real market exposure, not a placeholder', () => {
    const { pack, s, tree } = treeFor('IN')
    const makers = (tree.children ?? []).filter((c) => c.rawUnits > 0)
    const marketFine = makers.reduce((a, c) => a + c.fine, 0)
    const position = buildGuideSteps(pack, tree, 'IN', s.year)[0]

    if (marketFine > 0) {
      // The headline number must appear in the sentence the presenter reads out.
      expect(position.say).toContain(pack.currency)
      expect(position.say).toMatch(/\d/)
    }
    expect(position.say).toContain(String(makers.length))
  })

  it('scopes the fix step to a maker that actually exists in the data', () => {
    const { pack, s, tree } = treeFor('IN')
    const fix = buildGuideSteps(pack, tree, 'IN', s.year)[2]
    const names = (tree.children ?? []).map((c) => c.label)
    if (fix.action.parent) expect(names).toContain(fix.action.parent)
  })

  it('sends the fix step to the maker carrying the largest fine', () => {
    const { pack, s, tree } = treeFor('IN')
    const over = (tree.children ?? []).filter((c) => c.status === 'fine')
    const fix = buildGuideSteps(pack, tree, 'IN', s.year)[2]
    if (over.length) {
      const worst = [...over].sort((a, b) => b.fine - a.fine)[0]
      expect(fix.action.parent).toBe(worst.label)
      // …and names it, so the sentence and the screen agree.
      expect(fix.say).toContain(worst.label.split(' ')[0])
    }
  })

  it('describes a clean market as clean rather than asserting a fine', () => {
    // Guards the branch that only fires when nothing is over the line — the
    // demo must not claim exposure that the screen does not show.
    const { pack, s, tree } = treeFor('IN')
    const clean = { ...tree, children: (tree.children ?? []).map((c) => ({ ...c, status: 'compliant' as const, fine: 0 })) }
    const position = buildGuideSteps(pack, clean, 'IN', s.year)[0]
    expect(position.say).toMatch(/clears its|Every one of/)
    expect(position.say).not.toMatch(/over the line/)
  })
})
