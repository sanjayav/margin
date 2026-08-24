// The co-pilot's guarantees, asserted. These are the claims the product makes
// to a compliance team — that entitlements hold, that every figure is traceable,
// and that the regime doctrine cannot silently drift — so they are tested, not
// left to a prompt.
import { describe, expect, it } from 'vitest'
import { runTool, runToolSafe, clientContext, TOOL_REGISTRY, type ToolContext } from '../tools'
import { TOOL_SPECS, SPEC_BY_NAME } from '../toolspec'
import { runCoPilot } from '../copilot'
import { PACK_LIST, getPack } from '../rulepacks'
import type { CountryId } from '../types'

const ALL: CountryId[] = ['EU', 'IN', 'AU', 'UK', 'CN']
const full = (): ToolContext => clientContext(ALL, true)
const euOnly = (): ToolContext => clientContext(['EU'], false)
const yearOf = (c: CountryId) => getPack(c).defaultYear ?? getPack(c).years[0]

describe('tool catalogue', () => {
  it('the spec the model reads and the executor that runs it name the same tools', () => {
    expect(TOOL_SPECS.map((t) => t.name).sort()).toEqual([...TOOL_REGISTRY].sort())
  })

  it('every tool tells the model WHEN to call it, not just what it does', () => {
    for (const t of TOOL_SPECS) {
      expect(t.description.length, `${t.name} description is too thin`).toBeGreaterThan(120)
      expect(t.description, `${t.name} never says when to call it`).toMatch(/call this|use this|required for|before /i)
    }
  })

  it('every schema declares its market as an enum of real rule packs', () => {
    for (const t of TOOL_SPECS) {
      const c = t.input_schema.properties.country as any
      if (!c) { expect(t.name).toBe('portfolio'); continue }
      expect(c.enum).toEqual(ALL)
    }
  })
})

describe('entitlements are enforced in the executor, not the prompt', () => {
  it('refuses a market the workspace has not subscribed to', () => {
    const r = runToolSafe('get_position', { country: 'IN', year: 2027 }, euOnly())
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.code).toBe('not_entitled')
      expect(r.error.message).toMatch(/has not subscribed/i)
    }
  })

  it('still serves a market that is subscribed', () => {
    const r = runToolSafe('get_position', { country: 'EU', year: yearOf('EU') }, euOnly())
    expect(r.ok).toBe(true)
  })

  it('gates the pool optimiser on the add-on, regardless of the regime', () => {
    const r = runToolSafe('optimise_pool', { country: 'EU', year: yearOf('EU') }, euOnly())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('not_entitled')
  })

  it('refuses to open a gated screen even when asked directly', () => {
    const r = runToolSafe('update_workspace', { screen: 'pooling' }, euOnly())
    expect(r.ok).toBe(false)
  })

  it('portfolio only ever rolls up subscribed markets', () => {
    const ctx = clientContext(['EU', 'UK'], true)
    const r = runTool('portfolio', {}, ctx) as any
    expect(r.value.markets.map((m: any) => m.country).sort()).toEqual(['EU', 'UK'])
  })
})

describe('every number is traceable', () => {
  const ctx = full()
  const calls: [string, Record<string, unknown>][] = [
    ['list_makers', { country: 'EU' }],
    ['get_position', { country: 'EU' }],
    ['credit_ledger', { country: 'EU' }],
    ['pricing_impact', { country: 'EU' }],
    ['data_quality', { country: 'EU' }],
    ['regulation_brief', { country: 'EU' }],
    ['monthly_trace', { country: 'EU' }],
    ['portfolio', {}],
    ['dual_credit', { country: 'CN' }],
  ]

  it.each(calls)('%s carries provenance back with its value', (name, input) => {
    const r = runToolSafe(name, input, ctx)
    expect(r.ok, `${name} failed`).toBe(true)
    if (!r.ok) return
    const p = r.result.provenance
    expect(p.rulePack).toBeTruthy()
    expect(p.dataVersion).toBeTruthy()
    expect(['market', 'partial', 'preview']).toContain(p.coverage)
    expect(r.result.inputs).toBeTruthy()
    expect(typeof r.result.ms).toBe('number')
  })
})

describe('market exposure is the sum of per-maker fines', () => {
  it.each(ALL)('%s — never the fine of the market average', (c) => {
    const r = runTool('get_position', { country: c, year: yearOf(c) }, full()) as any
    const v = r.value
    const summed = v.perMaker.reduce((a: number, m: any) => a + m.fine, 0)
    expect(v.marketFine).toBe(summed)
    expect(v.makersOver).toBe(v.perMaker.filter((m: any) => m.over).length)
    expect(v.note).toMatch(/SUM of per-maker fines/)
  })
})

describe('regime doctrine cannot drift', () => {
  it('the EU credit book refuses to describe a market that does not exist', () => {
    const r = runTool('credit_ledger', { country: 'EU', year: yearOf('EU') }, full()) as any
    expect(r.value.instrument).toBe('pool')
    expect(r.value.note).toMatch(/NO transfer instrument/i)
    expect(r.value.note).toMatch(/never say "sell credits"/i)
  })

  it('dual-credit is refused outside China, with the right redirect', () => {
    const r = runToolSafe('dual_credit', { country: 'EU', year: yearOf('EU') }, full())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.message).toMatch(/China only/)
  })

  it('a year outside the regime horizon is refused, not silently clamped', () => {
    const r = runToolSafe('get_position', { country: 'EU', year: 1999 }, full())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('bad_year')
  })
})

describe('maker resolution', () => {
  const ctx = full()
  const firstMaker = (c: CountryId) => (runTool('list_makers', { country: c }, ctx) as any).value.makers[0].maker

  it('resolves an exact name, and a partial one that is unambiguous', () => {
    const name = firstMaker('EU')
    expect((runTool('get_position', { country: 'EU', maker: name }, ctx) as any).value.entity).toBe(name)

    const names: string[] = (runTool('list_makers', { country: 'EU' }, ctx) as any).value.makers.map((m: any) => m.maker)
    const unique = names.find((n) => {
      const head = n.split(' ')[0].toLowerCase()
      return names.filter((o) => o.toLowerCase().startsWith(head)).length === 1
    })!
    expect(unique, 'expected at least one maker with a unique first word').toBeTruthy()
    expect((runTool('get_position', { country: 'EU', maker: unique.split(' ')[0] }, ctx) as any).value.entity).toBe(unique)
  })

  it('refuses an ambiguous prefix and names the candidates rather than picking one', () => {
    const names: string[] = (runTool('list_makers', { country: 'EU' }, ctx) as any).value.makers.map((m: any) => m.maker)
    const head = names.map((n) => n.split(' ')[0])
      .find((h, _i, arr) => arr.filter((x) => x === h).length > 1)
    if (!head) return // this dataset vintage has no shared first word
    const r = runToolSafe('get_position', { country: 'EU', maker: head }, ctx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.message).toMatch(/No single maker matches/)
  })

  it('names the candidates instead of guessing when nothing matches', () => {
    const r = runToolSafe('get_position', { country: 'EU', maker: 'Definitely Not A Carmaker' }, ctx)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.code).toBe('maker_not_found')
      expect(r.error.message).toMatch(/list_makers/)
    }
  })
})

describe('the deterministic monitor', () => {
  it.each(ALL)('%s produces findings whose every metric names a real tool', (c) => {
    const findings = runCoPilot(full(), c)
    expect(findings.length).toBeGreaterThan(0)
    expect(findings[0].category).toBeTruthy()
    for (const f of findings) {
      expect(f.headline.length).toBeGreaterThan(8)
      expect(f.ask.length).toBeGreaterThan(8)
      expect(f.provenance.rulePack).toBe(c)
      for (const m of f.metrics) {
        expect(TOOL_REGISTRY as readonly string[]).toContain(m.tool)
        expect(m.value).toBeTruthy()
      }
      for (const o of f.options) expect(o.title).toBeTruthy()
    }
  })

  it('orders the rail by severity so the worst thing is read first', () => {
    const rank = { critical: 0, high: 1, watch: 2, clear: 3 } as const
    for (const c of ALL) {
      const sev = runCoPilot(full(), c).map((f) => rank[f.severity])
      expect(sev).toEqual([...sev].sort((a, b) => a - b))
    }
  })

  it('the deep scan widens the breach list without ever costing a frozen tab', () => {
    for (const c of ALL) {
      const fast = runCoPilot(full(), c).filter((f) => f.category === 'Breach')
      if (fast.length < 3) continue
      const t0 = Date.now()
      const deep = runCoPilot(full(), c, { deep: true }).filter((f) => f.category === 'Breach')
      expect(deep.length).toBeGreaterThanOrEqual(fast.length)
      expect(deep.length).toBeLessThanOrEqual(6)
      // The rail runs this in an idle callback; a multi-second block would jank.
      expect(Date.now() - t0).toBeLessThan(4000)
      return
    }
  })

  it('only reads markets the workspace owns', () => {
    // A single-market workspace can still scan its own market…
    expect(runCoPilot(euOnly(), 'EU').length).toBeGreaterThan(0)
    // …and cannot scan one it does not own.
    expect(() => runCoPilot(euOnly(), 'IN')).toThrow(/has not subscribed/i)
  })
})

describe('workspace changes are proposed, never applied', () => {
  it('stages the action and says so', () => {
    const ctx = full()
    const r = runTool('update_workspace', { country: 'EU', screen: 'analyse', year: yearOf('EU'), why: 'show the book of record' }, ctx) as any
    expect(ctx.actions).toHaveLength(1)
    expect(ctx.actions[0].why).toBe('show the book of record')
    expect(r.value.staged).toBe(true)
    expect(r.value.note).toMatch(/has not moved yet/)
  })
})

describe('rule pack coverage', () => {
  it('every shipped market is reachable through the tool layer', () => {
    for (const p of PACK_LIST) {
      const r = runToolSafe('regulation_brief', { country: p.id }, full())
      expect(r.ok, `${p.id} unreachable`).toBe(true)
      if (r.ok) {
        const v = r.result.value as any
        expect(v.limitByYear.length).toBe(p.years.length)
        expect(v.fineRate).toBeTruthy()
        expect(SPEC_BY_NAME.regulation_brief).toBeTruthy()
      }
    }
  })
})
