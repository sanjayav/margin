/* ───────────────────────────────────────────────────────────────────────────
   Agent client — starts a run and folds the server's event stream into state.
   ---------------------------------------------------------------------------
   The transport is a newline-delimited JSON stream rather than a single JSON
   response, because an agent run is something you WATCH. A compliance officer
   deciding whether to trust an output needs to see which sources it opened and
   in what order; a spinner followed by a verdict is exactly the thing this
   product is supposed to replace.
   ─────────────────────────────────────────────────────────────────────────── */
import type { CountryId } from '../../engine/types'
import type { AgentId, AgentRun, Finding, Proposal, RunStatus, RunStep, Validation } from './kernel'
import { newRunId } from './kernel'
import { useApp } from '../state/appStore'
import type { EvidenceItem, ForecastCase } from '../modules/forecast/cases'

export type AgentEvent =
  | { type: 'status'; status: RunStatus }
  | { type: 'step'; step: RunStep }
  | { type: 'step_update'; id: string; patch: Partial<RunStep> }
  | { type: 'finding'; finding: Finding }
  | { type: 'evidence'; item: EvidenceItem }
  | { type: 'case'; case: ForecastCase }
  | { type: 'proposal'; proposal: Proposal }
  | { type: 'validation'; validation: Validation }
  | { type: 'summary'; text: string }
  | {
      type: 'usage'
      inputTokens: number; outputTokens: number
      cacheWriteTokens?: number; cacheReadTokens?: number
      model?: string; ms: number
    }
  | { type: 'error'; message: string }
  | { type: 'done'; status: RunStatus }

export interface RunRequest {
  agentId: AgentId
  country: CountryId
  prompt?: string
  /** Facts the server must not have to guess: the loaded position, the levers
   *  in play, the sources present. Passed explicitly so a run is reproducible
   *  from its own record. */
  context?: Record<string, unknown>
}

/** Start a run. Returns immediately with the run id; the stream updates state.
 *  The returned promise settles when the stream ends, for callers that want to
 *  await a whole run (tests, chained agents). */
export function startRun(req: RunRequest, by = 'you'): { id: string; done: Promise<AgentRun | null> } {
  const id = newRunId()
  const now = new Date().toISOString()
  const store = useApp.getState()

  const run: AgentRun = {
    id, agentId: req.agentId, country: req.country, status: 'queued',
    trigger: { kind: 'user', by, at: now },
    prompt: req.prompt, steps: [], findings: [], startedAt: now,
  }
  store.upsertRun(run)
  store.setConsole(true)

  const done = (async (): Promise<AgentRun | null> => {
    const ctl = new AbortController()
    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ ...req, runId: id, autonomy: store.autonomy }),
        signal: ctl.signal,
      })

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '')
        fail(id, res.status === 401
          ? 'Your session has expired. Sign in again to run agents.'
          : describeFailure(res.status, text))
        return useApp.getState().runs.find((r) => r.id === id) ?? null
      }

      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      for (;;) {
        const { value, done: fin } = await reader.read()
        if (fin) break
        buf += dec.decode(value, { stream: true })
        // Frames are newline-delimited; a partial tail stays in the buffer.
        let nl: number
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim()
          buf = buf.slice(nl + 1)
          if (line) applyEvent(id, JSON.parse(line) as AgentEvent)
        }
      }
      if (buf.trim()) applyEvent(id, JSON.parse(buf.trim()) as AgentEvent)
    } catch (e) {
      fail(id, e instanceof Error ? e.message : 'The run could not be completed.')
    }
    return useApp.getState().runs.find((r) => r.id === id) ?? null
  })()

  return { id, done }
}

function describeFailure(status: number, body: string): string {
  // The one failure worth naming precisely: the deployment has no model key, so
  // the agents cannot run at all. Anything else is reported as it arrived.
  try {
    const j = JSON.parse(body) as { error?: string; code?: string }
    if (j.code === 'no_model_key') return 'No model key is configured for this deployment, so agents cannot run. Set ANTHROPIC_API_KEY and redeploy.'
    if (j.error) return j.error
  } catch { /* body was not JSON */ }
  return `The agent service returned ${status}.`
}

function fail(id: string, message: string) {
  const { patchRun, runs } = useApp.getState()
  const run = runs.find((r) => r.id === id)
  patchRun(id, {
    status: 'failed', error: message, finishedAt: new Date().toISOString(),
    steps: [...(run?.steps ?? []), {
      id: `${id}-err`, kind: 'error', label: 'Run failed', detail: message, status: 'fail',
    }],
  })
}

function applyEvent(id: string, ev: AgentEvent) {
  const { patchRun } = useApp.getState()
  const run = useApp.getState().runs.find((r) => r.id === id)
  if (!run) return

  switch (ev.type) {
    case 'status':
      patchRun(id, { status: ev.status }); break
    case 'step':
      patchRun(id, { steps: [...run.steps, ev.step] }); break
    case 'step_update':
      patchRun(id, { steps: run.steps.map((s) => (s.id === ev.id ? { ...s, ...ev.patch } : s)) }); break
    case 'finding':
      patchRun(id, { findings: [...run.findings, ev.finding] }); break
    case 'case':
      // Zero weight by construction, so an agent can widen the board without
      // moving a single number until someone accepts the odds.
      useApp.getState().upsertCase({ ...ev.case, weight: 0, origin: 'agent' }); break
    case 'evidence':
      // Evidence lives in the workspace, not in the run — an article the
      // analyst found is still true after the run scrolls out of the console.
      useApp.getState().addEvidence([ev.item]); break
    case 'proposal':
      patchRun(id, { proposal: ev.proposal }); break
    case 'validation':
      patchRun(id, { validation: ev.validation }); break
    case 'summary':
      patchRun(id, { summary: ev.text }); break
    case 'usage':
      patchRun(id, {
        usage: {
          inputTokens: ev.inputTokens, outputTokens: ev.outputTokens,
          cacheWriteTokens: ev.cacheWriteTokens ?? 0, cacheReadTokens: ev.cacheReadTokens ?? 0,
          model: ev.model, ms: ev.ms,
        },
      }); break
    case 'error':
      fail(id, ev.message); break
    case 'done':
      patchRun(id, { status: ev.status, finishedAt: new Date().toISOString() }); break
  }
}

/** Record a human decision on a proposal. The decision is the artefact that
 *  makes the whole run auditable, so it is written even when the verdict is
 *  "rejected" — especially then. */
export function decideRun(id: string, verdict: 'approved' | 'rejected', by: string, note?: string) {
  useApp.getState().patchRun(id, {
    decision: { by, at: new Date().toISOString(), verdict, note },
    status: verdict === 'approved' ? 'applied' : 'rejected',
  })
}
