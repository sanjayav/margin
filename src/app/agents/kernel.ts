/* ───────────────────────────────────────────────────────────────────────────
   Agent kernel — the shared contract for every agent in the platform.
   ---------------------------------------------------------------------------
   The product's premise is that no screen is static: behind each module sits an
   agent that watches its inputs, does the work, and hands back something a
   person decides on. For that to be trustworthy rather than decorative, every
   agent — regardless of what it does — moves through the same five stages and
   produces the same artefacts:

        PLAN → GATHER (tools) → REASON → DRAFT (proposal) → VALIDATE

   Two invariants hold for all of them, and they are the reason this file
   exists rather than each module rolling its own:

   1. NO AGENT NUMBER IS TRUSTED. A proposal carries the INPUTS it wants to
      change, never the outputs it expects. The deterministic engine re-derives
      every consequence server-side (`Validation`), and a proposal that fails
      re-derivation is rejected before a human ever sees it. The model proposes;
      the engine decides.
   2. EVERY CLAIM IS CITED. A step that read something records where from. A
      finding with no citation is a defect, not a finding — regulatory work that
      cannot be traced to a source is worthless in an audit.
   ─────────────────────────────────────────────────────────────────────────── */

import type { CountryId } from '../../engine/types.js'
import type { Autonomy, Permission } from '../auth/rbac.js'

export type ModuleId = 'plan' | 'forecast' | 'scenario' | 'creditbook' | 'pooling' | 'data' | 'regai'

export type AgentId =
  | 'plan.monitor'        // freshness + position + hierarchy exceptions
  | 'forecast.horizon'    // external sources → 5-year outlook
  | 'scenario.architect'  // goal → validated scenario
  | 'book.keeper'         // ledger reconciliation
  | 'data.steward'        // import mapping + quality
  | 'pool.broker'         // multi-step pooling workflow
  | 'reg.watch'           // regulatory intelligence per country

/* ── definition ───────────────────────────────────────────────────────────── */

export interface ToolSpec {
  id: string
  label: string
  /** Plain-language description of what the tool reads or computes. Shown in
   *  the trace, so it has to make sense to a compliance officer, not a dev. */
  blurb: string
  /** Tools that leave the workspace are marked, because "the agent went to the
   *  internet" is materially different from "the agent read your fleet file"
   *  and a reader must be able to tell at a glance. */
  external?: boolean
}

export interface AgentDef {
  id: AgentId
  name: string
  module: ModuleId
  /** One sentence, in the user's language, on what this agent is FOR. */
  purpose: string
  /** What it does on each run, in order — shown before a run so nobody is
   *  surprised by what it touched. */
  method: string[]
  tools: ToolSpec[]
  /** Permission the caller needs before the run is even offered. */
  requires: Permission
  /** Permission needed to APPLY this agent's proposals. */
  applyRequires: Permission
  /** How often it runs unattended, when autonomy allows it. */
  cadence: 'on-demand' | 'hourly' | 'daily' | 'weekly' | 'on-change'
  /** Ceiling on what this agent may ever do, regardless of workspace policy.
   *  `pool.broker` can never be 'act': signing a pool is a contract. */
  maxAutonomy: Autonomy
  accent: string
}

/* ── a run ────────────────────────────────────────────────────────────────── */

export type RunStatus =
  | 'queued' | 'planning' | 'gathering' | 'reasoning' | 'drafting'
  | 'validating' | 'awaiting_approval' | 'applied' | 'rejected' | 'failed' | 'done'

export const RUN_STAGE_ORDER: RunStatus[] = ['planning', 'gathering', 'reasoning', 'drafting', 'validating']

export type StepKind = 'plan' | 'tool' | 'read' | 'compute' | 'draft' | 'validate' | 'note' | 'error'

export interface Citation {
  label: string
  /** Where it came from: a dataset row range, a rule-pack clause, a URL. */
  ref: string
  url?: string
  /** When the source itself was last updated — a citation to a stale source is
   *  a different claim from a citation to a fresh one. */
  asOf?: string
}

export interface RunStep {
  id: string
  kind: StepKind
  label: string
  detail?: string
  status: 'running' | 'ok' | 'warn' | 'fail'
  ms?: number
  citations?: Citation[]
  /** Raw tool payload, collapsed by default — the audit view expands it. */
  data?: unknown
}

export interface Finding {
  id: string
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  title: string
  detail: string
  /** What in the workspace this is about — a maker, a source, a year. */
  subject?: string
  citations: Citation[]
}

/** A change an agent wants to make. Deliberately expressed as INPUT deltas:
 *  `path` addresses a scenario lever, an import mapping or a ledger entry —
 *  never a computed figure. That is what makes re-derivation possible. */
export interface ProposedChange {
  path: string
  label: string
  from: unknown
  to: unknown
  unit?: string
}

export interface Proposal {
  id: string
  title: string
  rationale: string
  changes: ProposedChange[]
  /** The agent's EXPECTATION of the effect. Shown side by side with what the
   *  engine actually computed — a divergence between the two is the single
   *  loudest signal that the model has gone off. */
  expected?: { label: string; value: number; unit?: string }[]
  risk: 'low' | 'medium' | 'high'
  reversible: boolean
  citations: Citation[]
}

/** The engine's verdict on a proposal. Produced server-side by re-running the
 *  deterministic calculation with the proposed inputs applied. */
export interface Validation {
  ok: boolean
  checks: {
    id: string
    label: string
    status: 'pass' | 'fail' | 'warn'
    /** What the engine computed, so a reader can see the actual consequence. */
    detail: string
  }[]
  /** Engine-derived effects — the numbers a user is allowed to act on. */
  derived: { label: string; before: number; after: number; unit?: string; better?: 'up' | 'down' }[]
  /** Present when ok === false: why the proposal was refused. */
  reason?: string
}

export interface AgentRun {
  id: string
  agentId: AgentId
  country: CountryId
  status: RunStatus
  /** Who or what started it. */
  trigger: { kind: 'user' | 'schedule' | 'change' | 'agent'; by: string; at: string }
  prompt?: string
  steps: RunStep[]
  findings: Finding[]
  proposal?: Proposal
  validation?: Validation
  summary?: string
  error?: string
  startedAt: string
  finishedAt?: string
  /** Decision record — the audit trail's whole reason for existing. */
  decision?: { by: string; at: string; verdict: 'approved' | 'rejected'; note?: string }
  usage?: { inputTokens: number; outputTokens: number; ms: number }
}

/* ── helpers ──────────────────────────────────────────────────────────────── */

export const newRunId = () => `run_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`

export const STATUS_TONE: Record<RunStatus, 'neutral' | 'agent' | 'pos' | 'warn' | 'neg' | 'info'> = {
  queued: 'neutral', planning: 'agent', gathering: 'agent', reasoning: 'agent',
  drafting: 'agent', validating: 'info', awaiting_approval: 'warn',
  applied: 'pos', done: 'pos', rejected: 'neutral', failed: 'neg',
}

export const STATUS_LABEL: Record<RunStatus, string> = {
  queued: 'Queued', planning: 'Planning', gathering: 'Gathering', reasoning: 'Reasoning',
  drafting: 'Drafting', validating: 'Validating', awaiting_approval: 'Needs approval',
  applied: 'Applied', done: 'Complete', rejected: 'Rejected', failed: 'Failed',
}

export const isRunning = (s: RunStatus) =>
  s === 'queued' || RUN_STAGE_ORDER.includes(s)

export const SEVERITY_TONE = {
  critical: 'neg', high: 'neg', medium: 'warn', low: 'info', info: 'neutral',
} as const

/** A proposal may bypass approval only when the workspace is in 'act' mode AND
 *  the change is low-risk, reversible and outside the book of record. Written
 *  once, here, so no caller can talk itself into a shortcut. */
export function needsApproval(p: Proposal, autonomy: Autonomy, applyPerm: Permission): boolean {
  const LEDGER: Permission[] = ['creditbook.post', 'scenario.publish', 'forecast.publish', 'pooling.execute']
  if (LEDGER.includes(applyPerm)) return true
  if (autonomy !== 'act') return true
  return !(p.risk === 'low' && p.reversible)
}
