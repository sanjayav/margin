import { describe, it, expect } from 'vitest'
import { DEMO_BUNDLE, DEMO_CONTRACTS } from '../record/demo'
import { mapBoundaries } from '../cbam/boundaries'
import { calculateAll } from '../cbam/emissions'
import { assessArticle9 } from '../cbam/article9'
import { computeDelta, factorFor } from '../cbam/delta'
import { buildEvidencePack } from '../cbam/verify'
import { OBLIGATIONS, AUTHORING } from '../obligations/authored'
import { evaluateObligations, criticalPath } from '../obligations/graph'
import { projectFacts, makeProbe } from '../obligations/facts'
import { CLAUSES, CORPUS_VERSION } from '../corpus/clauses'
import { TERMS, lintChinese } from '../corpus/terms'

const maps = mapBoundaries(DEMO_BUNDLE)
const withDefaults = calculateAll(DEMO_BUNDLE, { substituteDefaultsForUnknownPrecursors: true })
const strict = calculateAll(DEMO_BUNDLE, {})
const byId = (rs: typeof withDefaults, id: string) => rs.find((r) => r.productId === id)!

describe('boundary mapping', () => {
  it('resolves the units whose names are decisive', () => {
    expect(maps.find((m) => m.processUnitId === 'pu-bf')!.resolved?.id).toBe('bf')
    expect(maps.find((m) => m.processUnitId === 'pu-bof')!.resolved?.id).toBe('bof')
    expect(maps.find((m) => m.processUnitId === 'pu-sinter')!.resolved?.id).toBe('sinter')
    expect(maps.find((m) => m.processUnitId === 'pu-hsm')!.resolved?.id).toBe('products')
  })

  it('escalates rather than guesses when two routes match equally', () => {
    const amb = maps.find((m) => m.processUnitId === 'pu-amb')!
    expect(amb.status).toBe('ambiguous')
    expect(amb.resolved).toBeNull()
    expect(amb.candidates.map((c) => c.route.id).sort()).toEqual(['bof', 'eaf'])
    expect(amb.questionZh).toContain('2#炼钢电炉')
  })

  it('says unrecognised rather than forcing a route', () => {
    const lime = maps.find((m) => m.processUnitId === 'pu-lime')!
    expect(lime.status).toBe('unrecognised')
    expect(lime.candidates).toHaveLength(0)
  })
})

describe('embedded emissions — Annex IV', () => {
  it('chains internally produced precursors in production order', () => {
    const hm = byId(withDefaults, 'pr-hm')
    // Hot metal must carry the sinter it consumed.
    expect(hm.terms.some((t) => t.bucket === 'precursor' && /sintered ore produced on site/.test(t.label))).toBe(true)
    const slab = byId(withDefaults, 'pr-slab')
    expect(slab.terms.some((t) => t.bucket === 'precursor' && /pig iron produced on site/.test(t.label))).toBe(true)
  })

  it('produces a specific embedded emissions figure in a defensible range for BF-BOF steel', () => {
    const slab = byId(withDefaults, 'pr-slab')
    expect(slab.see).not.toBeNull()
    expect(slab.see!).toBeGreaterThan(1.4)
    expect(slab.see!).toBeLessThan(2.6)
    // The quotient identity must hold exactly.
    expect(slab.attributed / slab.activityLevel).toBeCloseTo(slab.see!, 10)
    expect(slab.direct + slab.indirect + slab.precursor).toBeCloseTo(slab.attributed, 6)
  })

  it('is deterministic — the same record gives byte-identical output', () => {
    const a = JSON.stringify(calculateAll(DEMO_BUNDLE, { substituteDefaultsForUnknownPrecursors: true }))
    const b = JSON.stringify(calculateAll(DEMO_BUNDLE, { substituteDefaultsForUnknownPrecursors: true }))
    expect(a).toBe(b)
  })

  it('refuses to state a figure when a precursor is unresolved and defaults are not substituted', () => {
    const slab = byId(strict, 'pr-slab')
    expect(slab.see).toBeNull()
    const gap = slab.unknowns.find((u) => u.id === 'precursor.pig-iron')!
    expect(gap).toBeTruthy()
    expect(gap.blocking).toBe(true)
    expect(gap.materialityTco2e).toBeGreaterThan(0)
  })

  it('carries the indicative status of its inputs all the way out', () => {
    const hrc = byId(withDefaults, 'pr-hrc')
    expect(hrc.publishedInputs).toBe(false)
    expect(hrc.caveats.length).toBeGreaterThan(0)
  })

  it('shows every term with its arithmetic', () => {
    for (const t of byId(withDefaults, 'pr-hm').terms) {
      expect(t.maths).toMatch(/=|reported/)
      expect(t.clauseIds.length).toBeGreaterThan(0)
    }
  })

  it('keeps a route’s precursors inside its own boundary', () => {
    // The rolling mill consumes slab, never the blast furnace's sinter.
    const hrc = byId(withDefaults, 'pr-hrc')
    expect(hrc.terms.some((t) => /sinter/i.test(t.label))).toBe(false)
  })
})

describe('Article 9', () => {
  it('gives no deduction for the China national ETS, and says why', () => {
    const total = withDefaults.reduce((a, e) => a + e.attributed, 0)
    const r = assessArticle9(DEMO_BUNDLE.carbonPricesPaid, total)
    expect(r.deductibleCertificates).toBe(0)
    expect(r.verdictEn).toMatch(/No Article 9 deduction is available/)
    expect(r.lines[0].recognition!.recognised).toBe(false)
    expect(r.lines[0].reasonZh).toContain('不获认可')
  })

  it('does deduct for a recognised scheme, net of free allocation', () => {
    const r = assessArticle9([{
      id: 'x', scheme: 'UK ETS', jurisdiction: 'GB',
      amount: { value: 1, unit: 'GBP', quality: 'measured' }, currency: 'GBP',
      unitsSurrendered: { value: 5000, unit: 'tCO2e', quality: 'measured' },
      freeAllocation: { value: 1000, unit: 'tCO2e', quality: 'measured' }, documentIds: [],
    }], 10_000)
    expect(r.deductibleCertificates).toBe(4000)
  })
})

describe('buyer delta', () => {
  const price = { eur: 78, asOf: '2026-09-01', source: 'assumed', status: 'assumed' as const }
  const d = computeDelta(DEMO_CONTRACTS, withDefaults, { price, defaultsCountry: 'CN' })

  it('shows the actuals beating the Chinese default on every priced contract', () => {
    for (const c of d.contracts.filter((x) => !x.blocked)) {
      expect(c.deltaSeePerTonne!).toBeGreaterThan(0)
      expect(c.buyerSavingEur!).toBeGreaterThan(0)
    }
  })

  it('applies the free-allocation phase-in rather than the full surrender', () => {
    expect(factorFor(2026)).toBeLessThan(0.05)
    expect(factorFor(2034)).toBe(1)
    const c = d.contracts.find((x) => x.contractId === 'ct-nordstahl')!
    expect(c.freeAllocationFactor).toBe(factorFor(2026))
    expect(c.certificatesOnDefault!).toBeCloseTo(c.defaultSee! * c.tonnes * c.freeAllocationFactor, 4)
  })

  it('reports a per-contract number a buyer can act on', () => {
    const c = d.contracts.find((x) => x.contractId === 'ct-nordstahl')!
    expect(c.eori).toBe('DE517402881996314')
    expect(c.savingPerTonneEur!).toBeGreaterThan(0)
    expect(d.headlineEn).toMatch(/save your EU buyers/)
  })

  it('refuses to state a delta it cannot compute, per contract', () => {
    const blockedRun = computeDelta(DEMO_CONTRACTS, strict, { price, defaultsCountry: 'CN' })
    expect(blockedRun.totals.blockedCount).toBeGreaterThan(0)
    expect(blockedRun.contracts.find((c) => c.blocked)!.blocked).toMatch(/not yet determinable|no emissions record/i)
  })
})

describe('verification readiness', () => {
  const pack = buildEvidencePack(DEMO_BUNDLE, withDefaults, maps)

  it('raises the missing meter calibration', () => {
    expect(pack.challenges.some((c) => c.id === 'meters.uncalibrated')).toBe(true)
  })

  it('ranks blocking findings first and materiality within severity', () => {
    const sev = pack.challenges.map((c) => c.severity)
    const firstMaterial = sev.indexOf('material')
    const lastBlocking = sev.lastIndexOf('blocking')
    if (firstMaterial >= 0 && lastBlocking >= 0) expect(lastBlocking).toBeLessThan(firstMaterial)
  })

  it('caps the score when a boundary is unresolved', () => {
    expect(pack.readiness.blocking).toBeGreaterThan(0)
    expect(pack.readiness.score).toBeLessThanOrEqual(40)
    expect(pack.readiness.verdictEn).toMatch(/Not ready/)
  })

  it('does not double-count the precursor chain when sizing a finding', () => {
    // Sinter rolls into hot metal into slab into coil. Summing attributed
    // emissions across products counts the same tonne up to four times, which
    // put 12 Mt at stake on a mill that produces 8.9 Mt.
    const summed = withDefaults.reduce((a, e) => a + e.attributed, 0)
    const largest = Math.max(...withDefaults.map((e) => e.attributed))
    const boundary = pack.challenges.find((c) => c.id.startsWith('boundary.'))!
    expect(boundary.atStakeTco2e).toBe(largest)
    expect(boundary.atStakeTco2e!).toBeLessThan(summed)
  })

  it('asks the right question of an unrecognised unit, not the ambiguous one’s', () => {
    const amb = pack.challenges.find((c) => c.id === 'boundary.pu-amb')!
    const unk = pack.challenges.find((c) => c.id === 'boundary.pu-lime')!
    expect(amb.challengeEn).toMatch(/matches .* equally/)
    expect(unk.challengeEn).toMatch(/No Annex III production route matches/)
    // An unrecognised unit may not be in scope at all — the remedy must say so.
    expect(unk.remedyEn).toMatch(/outside the boundary/)
    expect(amb.remedyEn).not.toMatch(/outside the boundary/)
  })

  it('lists what the verifier will ask for, held or not', () => {
    const meters = pack.manifest.find((m) => m.kind === 'meter-calibration')!
    expect(meters.required).toBe(true)
    expect(meters.held).toBe(0)
  })
})

describe('obligation graph', () => {
  const facts = projectFacts(DEMO_BUNDLE, DEMO_CONTRACTS)
  const states = evaluateObligations(OBLIGATIONS, { facts, periodEnd: DEMO_BUNDLE.period.to, today: '2026-09-01', probe: makeProbe(DEMO_BUNDLE) })

  it('raises the EU duties for EU-bound Chapter 72 goods', () => {
    const declare = states.find((s) => s.obligation.id === 'cbam.eu.declare-and-surrender')!
    expect(declare.status).toBe('applies')
    expect(declare.dueOn).toBe('2027-09-30')
  })

  it('raises the UK duty from the same record with no extra data collection', () => {
    const uk = states.find((s) => s.obligation.id === 'cbam.uk.report-emissions')!
    expect(uk.status).toBe('applies')
  })

  it('says indeterminate rather than not-applicable when a fact is missing', () => {
    const noContracts = projectFacts(DEMO_BUNDLE, [])
    const s = evaluateObligations(OBLIGATIONS, { facts: noContracts, periodEnd: '2026-12-31', probe: makeProbe(DEMO_BUNDLE) })
    const declare = s.find((x) => x.obligation.id === 'cbam.eu.declare-and-surrender')!
    expect(declare.status).toBe('indeterminate')
    expect(declare.unknownFacts).toContain('destination.blocs')
  })

  it('every obligation cites a clause that exists', () => {
    const ids = new Set(CLAUSES.map((c) => c.id))
    for (const o of OBLIGATIONS) {
      expect(o.clauseIds.length).toBeGreaterThan(0)
      for (const c of o.clauseIds) expect(ids.has(c)).toBe(true)
    }
  })

  it('gives a critical path in discharge order', () => {
    const path = criticalPath(OBLIGATIONS, 'cbam.eu.declare-and-surrender').map((o) => o.id)
    expect(path.indexOf('cbam.eu.determine-route')).toBeLessThan(path.indexOf('cbam.eu.calculate-emissions'))
    expect(path.indexOf('cbam.eu.calculate-emissions')).toBeLessThan(path.indexOf('cbam.eu.verify'))
    expect(path[path.length - 1]).toBe('cbam.eu.declare-and-surrender')
  })

  it('adding regulation two required no code changes', () => {
    for (const a of AUTHORING) expect(a.codeChangesRequired).toBe(0)
    const eu = AUTHORING.find((a) => a.regulation === 'cbam-eu')!
    const uk = AUTHORING.find((a) => a.regulation === 'cbam-uk')!
    expect(uk.hoursToAuthor).toBeLessThan(eu.hoursToAuthor / 5)
  })
})

describe('the corpus', () => {
  it('pins a version on every clause', () => {
    for (const c of CLAUSES) { expect(c.version).toBe(CORPUS_VERSION); expect(c.titleZh.length).toBeGreaterThan(0) }
  })

  it('catches a near-miss Chinese rendering that would change the number', () => {
    const hits = lintChinese('本装置的碳足迹为每吨2.1吨二氧化碳当量。')
    expect(hits).toHaveLength(1)
    expect(hits[0].term.id).toBe('embedded-emissions')
    expect(hits[0].wrong).toBe('碳足迹')
  })

  it('passes clean text', () => {
    expect(lintChinese('本装置的单位隐含排放为每吨2.1吨二氧化碳当量，前体已计入。')).toHaveLength(0)
  })

  it('every term carries both languages and a version', () => {
    for (const t of TERMS) { expect(t.zh.length).toBeGreaterThan(0); expect(t.definitionZh.length).toBeGreaterThan(0); expect(t.version).toBeTruthy() }
  })
})

// ── agents ─────────────────────────────────────────────────────────────────
import { AGENTS, agentMayCall } from '../agents/registry'
import { TOOL_SPECS } from '../agents/toolspec'
import { TOOL_REGISTRY, defaultContext, runToolSafe } from '../agents/tools'
import { GOALS, planFor, runPlan, summarise } from '../agents/orchestrator'

describe('the agent workforce', () => {
  it('every spec matches a registered tool, and every tool has a spec', () => {
    expect(TOOL_SPECS.map((s) => s.name).sort()).toEqual([...TOOL_REGISTRY].sort())
  })

  it('every agent’s grant names only real tools', () => {
    for (const a of AGENTS) for (const t of a.tools) expect(TOOL_REGISTRY).toContain(t)
  })

  it('refuses a tool outside an agent’s grant', () => {
    expect(agentMayCall('intake', 'prepare_disclosure')).toBe(false)
    expect(agentMayCall('disclosure', 'prepare_disclosure')).toBe(true)
  })

  it('enforces entitlements in the executor, not the prompt', () => {
    const ctx = defaultContext(DEMO_BUNDLE, DEMO_CONTRACTS, ['cbam-eu'])
    const r = runToolSafe('evaluate_obligations', { regulation: 'cbam-uk' }, ctx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('not_entitled')
  })

  it('never invents a term rendering', () => {
    const ctx = defaultContext(DEMO_BUNDLE, DEMO_CONTRACTS)
    const r = runToolSafe('lookup_term', { term: 'carbon leakage risk index' }, ctx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.message).toMatch(/not in the term base/)
  })

  it('stamps provenance on every tool result', () => {
    const ctx = defaultContext(DEMO_BUNDLE, DEMO_CONTRACTS)
    for (const name of TOOL_REGISTRY) {
      const input = name === 'cite_clause' ? { ids: ['cbam.art9'] } : name === 'lookup_term' ? { term: 'precursor' } : name === 'check_chinese' ? { text: '隐含排放' } : {}
      const r = runToolSafe(name, input, ctx)
      expect(r.ok, `${name} failed`).toBe(true)
      if (r.ok) {
        expect(r.result.provenance.corpusVersion).toBeTruthy()
        expect(r.result.provenance.defaultsStatus).toBeTruthy()
        expect(typeof r.result.ms).toBe('number')
      }
    }
  })
})

describe('the orchestrator', () => {
  it('derives the same plan from the same goal and record', () => {
    const a = planFor('verification-ready', defaultContext(DEMO_BUNDLE, DEMO_CONTRACTS)).tasks.map((t) => t.id)
    const b = planFor('verification-ready', defaultContext(DEMO_BUNDLE, DEMO_CONTRACTS)).tasks.map((t) => t.id)
    expect(a).toEqual(b)
  })

  it('every task explains why it is in the plan', () => {
    for (const g of GOALS) {
      const p = planFor(g.id, defaultContext(DEMO_BUNDLE, DEMO_CONTRACTS))
      for (const t of p.tasks) expect(t.becauseEn.length).toBeGreaterThan(20)
    }
  })

  it('runs a whole goal and escalates rather than deciding', () => {
    const ctx = defaultContext(DEMO_BUNDLE, DEMO_CONTRACTS)
    const plan = runPlan(planFor('first-declaration', ctx), ctx)
    const s = summarise(plan)
    expect(s.blocked).toBe(0)
    expect(s.escalated).toBeGreaterThan(0)
    expect(s.awaitingHuman.length).toBeGreaterThan(0)
    expect(s.submittedAnything).toBe(false)
    // Disclosure ALWAYS waits for a person.
    expect(s.awaitingHuman.some((a) => a.kind === 'disclose-to-buyer')).toBe(true)
    // And the ambiguous furnace is put to a human rather than resolved.
    expect(s.awaitingHuman.some((a) => a.kind === 'ask-human' && a.summaryZh.includes('2#炼钢电炉'))).toBe(true)
  })

  it('runs every goal without a blocked task', () => {
    for (const g of GOALS) {
      const ctx = defaultContext(DEMO_BUNDLE, DEMO_CONTRACTS)
      const plan = runPlan(planFor(g.id, ctx), ctx)
      const bad = plan.tasks.filter((t) => t.state === 'blocked')
      expect(bad.map((t) => `${g.id}/${t.id}: ${t.error?.message}`)).toEqual([])
    }
  })
})
