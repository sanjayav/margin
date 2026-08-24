// The grammar is shared by the palette, the UI and the agent, so its parse is
// load-bearing: a change here changes what the agent understands.
import { describe, it, expect } from 'vitest'
import { parse, VERBS } from '../grammar'

describe('grammar', () => {
  it('keeps exactly five verbs — a sixth is a design smell', () => {
    expect(VERBS.map((v) => v.id)).toEqual(['show', 'why', 'what-if', 'compare', 'prove'])
  })

  it('parses each verb and returns the noun', () => {
    expect(parse('show Mercedes-Benz')).toMatchObject({ verb: 'show', rest: 'Mercedes-Benz' })
    expect(parse('why is the target 100.7')).toMatchObject({ verb: 'why', rest: 'is the target 100.7' })
    expect(parse('what if BEV share reaches 30%')).toMatchObject({ verb: 'what-if', rest: 'BEV share reaches 30%' })
    expect(parse('compare Renault and Dacia')).toMatchObject({ verb: 'compare', rest: 'Renault and Dacia' })
    expect(parse('prove the 2025 position')).toMatchObject({ verb: 'prove', rest: 'the 2025 position' })
  })

  it('is case-insensitive', () => {
    expect(parse('SHOW Dacia').verb).toBe('show')
    expect(parse('What If mass falls 40kg').verb).toBe('what-if')
  })

  it('treats a bare search as `show` — that is what typing a name means', () => {
    expect(parse('Dacia')).toMatchObject({ verb: 'show', rest: 'Dacia' })
  })

  it('flags a partial verb so the palette can teach the vocabulary', () => {
    expect(parse('wh')).toMatchObject({ verb: null, partialVerb: true })
    expect(parse('comp')).toMatchObject({ verb: null, partialVerb: true })
    expect(parse('show').partialVerb).toBe(false)
  })

  it('returns nothing for empty input', () => {
    expect(parse('   ')).toMatchObject({ verb: null, rest: '' })
  })
})
