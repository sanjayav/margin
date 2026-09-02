// ───────────────────────────────────────────────────────────────────────────
// TrueReg workspace state.
//
// Everything the screens read is DERIVED from the deterministic engines, so
// this store holds only what a person chose: which surface, which language,
// whether to carry unresolved precursors at default, and which clause sheet is
// open. No computed figure is ever stored — that is what keeps the screens and
// the agents from ever disagreeing.
// ───────────────────────────────────────────────────────────────────────────
import { create } from 'zustand'
import { DEMO_BUNDLE, DEMO_CONTRACTS } from '../record/demo'
import { defaultContext, type ToolContext, type StagedAction } from '../agents/tools'
import type { RegulationId } from '../corpus/clauses'
import type { GoalId, Plan, Task } from '../agents/orchestrator'
import type { AgentId } from '../agents/registry'
import type { EngineAnswer } from '../agents/route'
import type { Attachment } from '../agents/attachments'
import { DEFAULT_EFFORT, DEFAULT_MODEL, type Effort, type ModelId } from '../agents/models'

export type Surface = 'console' | 'number' | 'exposure' | 'verify' | 'duties'
/** EU text governs; 'zh' is a reading aid; 'both' is what a bilingual desk uses. */
export type Lang = 'en' | 'zh' | 'both'

export interface RunLog {
  goal: GoalId | null
  plan: Plan | null
  /** Narration streamed back from a live agent, if a key is configured. */
  narration: string
  narrating: boolean
  runtime: 'live' | 'replay' | null
  error: string | null
}

/** One tool call, as the thread shows it. The trace is part of the answer, not
 *  a debug view — an answer whose provenance is hidden is not defensible. */
export interface ToolTrace {
  name: string
  ms: number
  ok: boolean
  provenance?: { corpusVersion: string; defaultsVersion: string; defaultsStatus: string }
  error?: string
}

export type Msg =
  | { id: string; role: 'user'; text: string }
  | {
      id: string; role: 'agent'; agent: AgentId
      /** 'engine' = answered by the deterministic tools alone. 'model' = an agent
       *  wrote the prose around tool results. Always shown; the two are not the
       *  same kind of answer and must never look alike. */
      source: 'engine' | 'model'
      text: string
      answer: EngineAnswer | null
      tools: ToolTrace[]
      staged: StagedAction[]
      streaming: boolean
      error: string | null
      /** Files this turn carried, kept on the message so the thread stays a
       *  complete record of what the agent was actually shown. */
      attachments?: Attachment[]
      /** Which model answered, when one did. */
      model?: ModelId
    }
  | { id: string; role: 'plan'; goal: GoalId; plan: Plan }

interface TrState {
  surface: Surface
  setSurface: (s: Surface) => void
  lang: Lang
  setLang: (l: Lang) => void
  /** Carry unresolved precursors at their default value. A commercial decision
   *  a person takes, so it lives here and is stated on every figure it touches. */
  substituteDefaults: boolean
  setSubstituteDefaults: (b: boolean) => void
  allowed: RegulationId[]
  /** Which model narrates. Never changes a figure — the engine owns those. */
  model: ModelId
  setModel: (m: ModelId) => void
  /** How hard that model thinks before answering. The precision dial. */
  effort: Effort
  setEffort: (e: Effort) => void
  /** Files staged on the composer, not yet sent. */
  pending: Attachment[]
  addPending: (a: Attachment[]) => void
  removePending: (id: string) => void
  clearPending: () => void
  /** Clause ids open in the corpus sheet. Empty = closed. */
  clauseSheet: string[]
  openClauses: (ids: string[]) => void
  closeClauses: () => void
  /** Term open in the term-base sheet. */
  termSheet: string | null
  openTerm: (id: string | null) => void
  /** The conversation. Questions, answers and goal runs share one thread — a
   *  goal is just a question you did not have to phrase. */
  messages: Msg[]
  push: (m: Msg) => void
  patch: (id: string, p: Partial<Extract<Msg, { role: 'agent' }>>) => void
  clearThread: () => void
  run: RunLog
  setRun: (p: Partial<RunLog>) => void
  /** Actions a person has approved. Approval is recorded, never executed —
   *  there is no send in this product. */
  approved: string[]
  approve: (key: string) => void
  /** A fresh tool context. Never memoised across a settings change, because a
   *  stale context would silently answer under the old decision. */
  context: () => ToolContext
}

export const useTr = create<TrState>((set, get) => ({
  surface: 'console',
  setSurface: (surface) => set({ surface }),
  lang: 'en',
  setLang: (lang) => set({ lang }),
  substituteDefaults: true,
  setSubstituteDefaults: (substituteDefaults) => set({ substituteDefaults }),
  allowed: ['cbam-eu', 'cbam-uk'],
  model: DEFAULT_MODEL,
  setModel: (model) => set({ model }),
  effort: DEFAULT_EFFORT,
  setEffort: (effort) => set({ effort }),
  pending: [],
  addPending: (a) => set((s) => ({ pending: [...s.pending, ...a] })),
  removePending: (id) => set((s) => ({ pending: s.pending.filter((x) => x.id !== id) })),
  clearPending: () => set({ pending: [] }),
  clauseSheet: [],
  openClauses: (clauseSheet) => set({ clauseSheet, termSheet: null }),
  closeClauses: () => set({ clauseSheet: [] }),
  termSheet: null,
  openTerm: (termSheet) => set({ termSheet, clauseSheet: [] }),
  messages: [],
  push: (m) => set((s) => ({ messages: [...s.messages, m] })),
  patch: (id, p) => set((s) => ({
    messages: s.messages.map((m) => (m.id === id && m.role === 'agent' ? { ...m, ...p } : m)),
  })),
  clearThread: () => set({ messages: [], run: { goal: null, plan: null, narration: '', narrating: false, runtime: null, error: null } }),
  run: { goal: null, plan: null, narration: '', narrating: false, runtime: null, error: null },
  setRun: (p) => set((s) => ({ run: { ...s.run, ...p } })),
  approved: [],
  approve: (key) => set((s) => (s.approved.includes(key) ? s : { approved: [...s.approved, key] })),
  context: () => {
    const ctx = defaultContext(DEMO_BUNDLE, DEMO_CONTRACTS, get().allowed)
    ctx.substituteDefaults = get().substituteDefaults
    return ctx
  },
}))

export const actionKey = (a: StagedAction, i: number) => `${a.kind}:${i}:${a.summaryEn.slice(0, 40)}`
export type { Task }
