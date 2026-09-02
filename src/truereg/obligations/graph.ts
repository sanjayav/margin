// ───────────────────────────────────────────────────────────────────────────
// THE OBLIGATION GRAPH — the part that makes this a platform rather than a
// CBAM tool.
//
// Every duty, in any regime, decomposes into the same six things: WHO must act,
// WHERE, under WHAT conditions, on WHAT evidence, by WHEN, and under WHICH
// clause. That decomposition is regulation-agnostic; only the values differ.
// So the graph is authored as DATA (obligations/authored.ts) and evaluated by
// the pure function below, and adding regulation two is an analyst writing rows
// — no code release. `time-to-author` is measured here for exactly that reason:
// the moment it needs an engineer, the thesis has failed and we want to know.
//
// The trigger language is deliberately tiny. It reads facts projected from the
// product record and nothing else. It cannot call out, cannot compute, cannot
// loop. An analyst can learn it in ten minutes and a reviewer can read a rule
// and say whether it matches the clause — which is the only property that
// matters when a verifier asks why a duty was or was not raised.
// ───────────────────────────────────────────────────────────────────────────
import type { RegulationId } from '../corpus/clauses.js'

// ── the fact space ──────────────────────────────────────────────────────────
// Flat, dotted keys projected from the regulation-neutral record. A rule may
// only see these. Adding a fact is the one thing that DOES touch code, so the
// projection is kept broad and neutral (facts.ts) and rules never ask for a
// regulation-shaped fact like "isCbamGood".

export type FactValue = string | number | boolean | null | string[]
export type FactSet = Record<string, FactValue>

export type TriggerExpr =
  | { all: TriggerExpr[] }
  | { any: TriggerExpr[] }
  | { not: TriggerExpr }
  | { fact: string; op: 'eq' | 'ne' | 'in' | 'contains' | 'startsWith' | 'gt' | 'gte' | 'lt' | 'lte' | 'exists' | 'missing'; value?: FactValue }
  /** Always fires. For duties that apply unconditionally once the regime does. */
  | { always: true }

export type ActorRole =
  | 'operator'          // the third-country installation
  | 'declarant'         // the EU importer carrying the liability
  | 'verifier'          // the accredited verifier
  | 'supplier'          // an upstream precursor supplier
  | 'competent-authority'

export interface EvidenceRequirement {
  id: string
  label: string
  labelZh: string
  /** Which record objects satisfy it. Checked mechanically against the bundle. */
  satisfiedBy: EvidenceProbe
  /** A verifier will not accept this on the operator's word alone. */
  needsThirdParty?: boolean
  note?: string
}

/** How to test whether evidence exists, expressed over the neutral record. */
export type EvidenceProbe =
  | { documents: string; minCount?: number }                       // document kind
  | { quantityQuality: string; atLeast: 'measured' | 'calculated' | 'supplier-declared' } // path prefix
  | { fact: string; op: 'exists' | 'eq' | 'gte'; value?: FactValue }

export interface DeadlineSpec {
  /** 'annual' — recurs each period; 'once' — one-off; 'rolling' — n days from a trigger event. */
  kind: 'annual' | 'once' | 'rolling'
  /** For 'annual': month/day the duty falls due, and how many periods after the
   *  reporting year. CBAM's first surrender is 30 Sep of the FOLLOWING year. */
  month?: number
  day?: number
  offsetYears?: number
  /** For 'once': an ISO date. For 'rolling': days from the triggering event. */
  date?: string
  days?: number
  label: string
}

export interface Obligation {
  id: string
  regulation: RegulationId
  actor: ActorRole
  jurisdiction: string
  titleEn: string
  titleZh: string
  /** What actually has to happen, in the customer's language. */
  summaryEn: string
  summaryZh: string
  trigger: TriggerExpr
  evidence: EvidenceRequirement[]
  deadline: DeadlineSpec
  /** Clause ids in the corpus. An obligation with no clause is refused at load. */
  clauseIds: string[]
  /** Duties that must be discharged first. Renders as the critical path. */
  dependsOn?: string[]
  /** What goes wrong if it is missed — the reason a human is escalated to. */
  consequence?: string
}

/** Authoring provenance, tracked as a first-class metric from CBAM onward. */
export interface AuthoringRecord {
  regulation: RegulationId
  authoredBy: string
  authoredOn: string
  /** Analyst-hours from "start reading the act" to "rules pass review". */
  hoursToAuthor: number
  /** The number that must stay zero. If a regime needed engine changes, the
   *  obligation model was not general enough and that is a bug, not a task. */
  codeChangesRequired: number
  reviewedBy?: string
  note?: string
}

// ── evaluation ──────────────────────────────────────────────────────────────

export type ObligationStatus = 'applies' | 'not-applicable' | 'indeterminate'

export interface EvidenceState {
  requirement: EvidenceRequirement
  state: 'present' | 'missing' | 'insufficient'
  detail: string
}

export interface ObligationState {
  obligation: Obligation
  status: ObligationStatus
  /** Which sub-expressions decided it. The audit trail for a duty. */
  because: string[]
  /** Facts the trigger asked for that the record does not have. Non-empty means
   *  the honest answer is "I don't know", and that is what is shown. */
  unknownFacts: string[]
  evidence: EvidenceState[]
  /** true when every evidence requirement is present. */
  ready: boolean
  dueOn: string | null
  daysToDue: number | null
}

function describe(e: TriggerExpr): string {
  if ('always' in e) return 'applies unconditionally'
  if ('all' in e) return e.all.map(describe).join(' and ')
  if ('any' in e) return e.any.map(describe).join(' or ')
  if ('not' in e) return `not (${describe(e.not)})`
  const v = Array.isArray(e.value) ? e.value.join('/') : String(e.value ?? '')
  return `${e.fact} ${e.op}${v ? ` ${v}` : ''}`
}

type Tri = true | false | 'unknown'

function evalExpr(e: TriggerExpr, facts: FactSet, why: string[], unknown: string[]): Tri {
  if ('always' in e) return true
  if ('all' in e) {
    let sawUnknown = false
    for (const s of e.all) {
      const r = evalExpr(s, facts, why, unknown)
      if (r === false) return false          // one definite false settles an AND
      if (r === 'unknown') sawUnknown = true
    }
    return sawUnknown ? 'unknown' : true
  }
  if ('any' in e) {
    let sawUnknown = false
    for (const s of e.any) {
      const r = evalExpr(s, facts, why, unknown)
      if (r === true) return true            // one definite true settles an OR
      if (r === 'unknown') sawUnknown = true
    }
    return sawUnknown ? 'unknown' : false
  }
  if ('not' in e) {
    const r = evalExpr(e.not, facts, why, unknown)
    return r === 'unknown' ? 'unknown' : !r
  }

  const has = Object.prototype.hasOwnProperty.call(facts, e.fact)
  const f = facts[e.fact]

  if (e.op === 'exists') { const r = has && f !== null && f !== undefined; why.push(`${e.fact} ${r ? 'is present' : 'is absent'}`); return r }
  if (e.op === 'missing') { const r = !has || f === null || f === undefined; why.push(`${e.fact} ${r ? 'is absent' : 'is present'}`); return r }

  // Any other operator over an absent fact is genuinely unknown — never false.
  // Silently treating "we have no data" as "the duty does not apply" is the
  // single most expensive bug this system could ship.
  if (!has || f === null || f === undefined) { unknown.push(e.fact); return 'unknown' }

  let r: boolean
  switch (e.op) {
    case 'eq': r = f === e.value; break
    case 'ne': r = f !== e.value; break
    case 'in': r = Array.isArray(e.value) ? (e.value as string[]).includes(String(f)) : false; break
    case 'contains': r = Array.isArray(f) ? f.includes(String(e.value)) : String(f).includes(String(e.value)); break
    case 'startsWith': r = String(f).startsWith(String(e.value)); break
    case 'gt': r = Number(f) > Number(e.value); break
    case 'gte': r = Number(f) >= Number(e.value); break
    case 'lt': r = Number(f) < Number(e.value); break
    case 'lte': r = Number(f) <= Number(e.value); break
    default: r = false
  }
  why.push(`${describe(e)} → ${r}`)
  return r
}

function dueDate(d: DeadlineSpec, periodEnd: string): string | null {
  if (d.kind === 'once') return d.date ?? null
  if (d.kind === 'rolling') {
    if (d.days == null) return null
    const base = new Date(periodEnd)
    base.setUTCDate(base.getUTCDate() + d.days)
    return base.toISOString().slice(0, 10)
  }
  const y = new Date(periodEnd).getUTCFullYear() + (d.offsetYears ?? 0)
  const m = String(d.month ?? 12).padStart(2, '0')
  const day = String(d.day ?? 31).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Test one evidence requirement against a probe result supplied by the caller.
 *  The graph never reaches into the record itself — facts.ts does the reading,
 *  which keeps this file free of any record-shape knowledge. */
export function evaluateEvidence(reqs: EvidenceRequirement[], probe: (p: EvidenceProbe) => { ok: boolean; partial?: boolean; detail: string }): EvidenceState[] {
  return reqs.map((r) => {
    const res = probe(r.satisfiedBy)
    return {
      requirement: r,
      state: res.ok ? 'present' : res.partial ? 'insufficient' : 'missing',
      detail: res.detail,
    }
  })
}

export interface EvaluateOptions {
  facts: FactSet
  periodEnd: string
  today?: string
  probe: (p: EvidenceProbe) => { ok: boolean; partial?: boolean; detail: string }
  /** Restrict to one regime. Omit to evaluate every authored regulation. */
  regulation?: RegulationId
}

export function evaluateObligations(graph: Obligation[], opts: EvaluateOptions): ObligationState[] {
  const today = opts.today ?? new Date().toISOString().slice(0, 10)
  return graph
    .filter((o) => !opts.regulation || o.regulation === opts.regulation)
    .map((o) => {
      const because: string[] = []
      const unknownFacts: string[] = []
      const t = evalExpr(o.trigger, opts.facts, because, unknownFacts)
      const status: ObligationStatus = t === 'unknown' ? 'indeterminate' : t ? 'applies' : 'not-applicable'
      const evidence = status === 'not-applicable' ? [] : evaluateEvidence(o.evidence, opts.probe)
      const dueOn = status === 'not-applicable' ? null : dueDate(o.deadline, opts.periodEnd)
      const daysToDue = dueOn ? Math.round((Date.parse(dueOn) - Date.parse(today)) / 86_400_000) : null
      return {
        obligation: o, status, because, unknownFacts: [...new Set(unknownFacts)],
        evidence, ready: evidence.length > 0 && evidence.every((e) => e.state === 'present'),
        dueOn, daysToDue,
      }
    })
}

/** Load-time integrity: a duty with no clause, or a clause id the corpus does
 *  not hold, is a defect that must fail loudly rather than ship a citation-free
 *  assertion. Called from authored.ts at module load. */
export function assertGraphIntegrity(graph: Obligation[], knownClauseIds: Set<string>): void {
  const problems: string[] = []
  const ids = new Set<string>()
  for (const o of graph) {
    if (ids.has(o.id)) problems.push(`duplicate obligation id "${o.id}"`)
    ids.add(o.id)
    if (!o.clauseIds.length) problems.push(`obligation "${o.id}" cites no clause`)
    for (const c of o.clauseIds) if (!knownClauseIds.has(c)) problems.push(`obligation "${o.id}" cites unknown clause "${c}"`)
    if (!o.evidence.length && o.actor !== 'competent-authority') problems.push(`obligation "${o.id}" requires no evidence — is that really true?`)
  }
  for (const o of graph) for (const d of o.dependsOn ?? []) if (!ids.has(d)) problems.push(`obligation "${o.id}" depends on unknown "${d}"`)
  if (problems.length) throw new Error(`Obligation graph integrity:\n  - ${problems.join('\n  - ')}`)
}

/** The critical path to a goal: the transitive dependencies of one duty, in
 *  discharge order. This is what the orchestrator plans against. */
export function criticalPath(graph: Obligation[], goalId: string): Obligation[] {
  const byId = new Map(graph.map((o) => [o.id, o]))
  const seen = new Set<string>()
  const out: Obligation[] = []
  const walk = (id: string) => {
    if (seen.has(id)) return
    seen.add(id)
    const o = byId.get(id)
    if (!o) return
    for (const d of o.dependsOn ?? []) walk(d)
    out.push(o)
  }
  walk(goalId)
  return out
}
