// ───────────────────────────────────────────────────────────────────────────
// CO-PILOT · CLIENT
//
// The streaming transport plus the console's state. Everything the server
// streams is kept — not just the prose, but the reasoning summary, every tool
// call with its inputs and provenance, and every workspace change the co-pilot
// proposed. That record IS the product: an answer you cannot audit is an
// opinion, and a compliance team cannot file an opinion.
//
// Proposed changes are STAGED. The co-pilot never moves the workspace on its
// own; the user approves, and the approval is recorded on the turn.
// ───────────────────────────────────────────────────────────────────────────
import { create } from 'zustand'
import { useStore } from '../state/store'
import { applyActions, type DashboardAction } from './assistant'
import type { Provenance } from '../engine/tools'

// ── stream events ───────────────────────────────────────────────────────────

export interface ToolCall {
  id: string
  name: string
  ok: boolean
  inputs?: Record<string, unknown>
  ms?: number
  provenance?: Provenance
  value?: unknown
  error?: { code: string; message: string }
  /** True while the model is still writing the call's arguments. */
  running?: boolean
}

export interface StagedAction {
  action: DashboardAction & { why?: string }
  state: 'staged' | 'applied' | 'dismissed'
}

export interface Turn {
  id: string
  role: 'user' | 'assistant'
  content: string
  /** Summarised reasoning, streamed while the model works. */
  thinking: string
  tools: ToolCall[]
  actions: StagedAction[]
  status: 'streaming' | 'done' | 'error'
  error?: string
  usage?: { input: number; output: number; cacheRead: number }
  model?: string
  at: number
}

interface Handlers {
  onReady?: (d: { model: string; tools: string[]; markets: string[] }) => void
  onText: (t: string) => void
  onThinking?: (t: string) => void
  onToolStart?: (d: { id: string; name: string }) => void
  onToolEnd?: (c: ToolCall) => void
  onAction?: (a: DashboardAction & { why?: string }) => void
  onDone?: (d: { stopReason?: string; usage?: Turn['usage']; toolCalls?: number }) => void
  onError: (message: string) => void
}

/** Read an SSE body frame by frame. Tolerant of split chunks and blank frames. */
async function readSSE(res: Response, dispatch: (event: string, data: any) => void): Promise<void> {
  const reader = res.body!.getReader()
  const dec = new TextDecoder()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let sep: number
    while ((sep = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, sep)
      buf = buf.slice(sep + 2)
      let event = 'message'
      const lines: string[] = []
      for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) lines.push(line.slice(5).trim())
      }
      if (!lines.length) continue
      try { dispatch(event, JSON.parse(lines.join('\n'))) } catch { /* skip a malformed frame */ }
    }
  }
}

async function openStream(body: unknown, h: Handlers, signal?: AbortSignal): Promise<void> {
  let res: Response
  try {
    res = await fetch('/api/copilot', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal,
    })
  } catch (e: any) {
    if (e?.name === 'AbortError') return
    h.onError(e?.message || 'Could not reach the server.')
    return
  }

  const ct = res.headers.get('content-type') || ''
  if (!res.ok || !ct.includes('text/event-stream') || !res.body) {
    let msg = res.status === 429
      ? 'Too many requests on this workspace — give it a moment.'
      : 'AiRE needs the model API. The workspace, the engine and every chart keep working without it.'
    try { const j = await res.json(); if (j?.error) msg = j.error } catch { /* keep */ }
    h.onError(msg)
    return
  }

  try {
    await readSSE(res, (event, d) => {
      switch (event) {
        case 'ready': h.onReady?.(d); break
        case 'text': h.onText(d.text); break
        case 'thinking': h.onThinking?.(d.text); break
        case 'tool_start': h.onToolStart?.(d); break
        case 'tool_end': h.onToolEnd?.(d as ToolCall); break
        case 'action': h.onAction?.(d.action); break
        case 'delta': h.onText(d.text); break // 'take' mode
        case 'done': h.onDone?.(d); break
        case 'error': h.onError(d.error || 'Something went wrong.'); break
      }
    })
  } catch (e: any) {
    if (e?.name !== 'AbortError') h.onError(e?.message || 'The stream was interrupted.')
  }
}

/** Stream an analyst "take" on a finding the engine already computed. */
export async function streamCopilotTake(
  finding: unknown,
  h: { onDelta: (t: string) => void; onError: (m: string) => void; onDone: () => void },
): Promise<void> {
  await openStream({ mode: 'take', finding }, {
    onText: h.onDelta,
    onError: h.onError,
    onDone: () => h.onDone(),
  })
}

/** Collapse the stream into a single answer. The compact surfaces (the floating
 *  assistant, the guided walkthrough) use this so they run on the SAME brain,
 *  the same tools and the same entitlement enforcement as the console — there is
 *  no second, quietly diverging analyst anywhere in the platform. */
export async function ask(
  message: string,
  history: { role: 'user' | 'assistant'; content: string }[] = [],
): Promise<{ answer: string; actions: (DashboardAction & { why?: string })[]; tools: ToolCall[] }> {
  const w = useStore.getState()
  let answer = ''
  const actions: (DashboardAction & { why?: string })[] = []
  const tools: ToolCall[] = []
  let failure: string | null = null

  await openStream(
    {
      mode: 'chat', message, history: history.slice(-10),
      context: {
        country: w.country, parent: w.selectedParent, screen: w.screen, scenario: w.scenario,
        viewMode: w.viewMode, ownedModules: w.subscribedModules, pooling: w.poolingAddon,
      },
    },
    {
      onText: (t) => { answer += t },
      onToolEnd: (c) => tools.push(c),
      onAction: (a) => actions.push(a),
      onError: (m) => { failure = m },
    },
  )

  if (failure && !answer.trim()) throw new Error(failure)
  return { answer: answer.trim(), actions, tools }
}

// ── the console's state ─────────────────────────────────────────────────────

let seq = 0
const uid = () => `t${Date.now().toString(36)}${(seq++).toString(36)}`

interface CopilotState {
  turns: Turn[]
  busy: boolean
  /** Turn whose evidence is open in the audit panel. */
  inspect: string | null
  /** Live tool labels for the working indicator. */
  activity: string | null
  send: (text: string) => Promise<void>
  stop: () => void
  reset: () => void
  setInspect: (id: string | null) => void
  approve: (turnId: string, index: number) => void
  approveAll: (turnId: string) => void
  dismiss: (turnId: string, index: number) => void
}

let controller: AbortController | null = null

const patch = (set: any, id: string, fn: (t: Turn) => Turn) =>
  set((s: CopilotState) => ({ turns: s.turns.map((t) => (t.id === id ? fn(t) : t)) }))

export const useCopilot = create<CopilotState>((set, get) => ({
  turns: [],
  busy: false,
  inspect: null,
  activity: null,

  setInspect: (id) => set({ inspect: id }),
  reset: () => { controller?.abort(); controller = null; set({ turns: [], busy: false, inspect: null, activity: null }) },
  stop: () => { controller?.abort(); controller = null; set({ busy: false, activity: null }) },

  approve: (turnId, index) => {
    const turn = get().turns.find((t) => t.id === turnId)
    const staged = turn?.actions[index]
    if (!staged || staged.state !== 'staged') return
    applyActions([staged.action])
    patch(set, turnId, (t) => ({ ...t, actions: t.actions.map((a, i) => (i === index ? { ...a, state: 'applied' } : a)) }))
  },
  approveAll: (turnId) => {
    const turn = get().turns.find((t) => t.id === turnId)
    if (!turn) return
    const pending = turn.actions.filter((a) => a.state === 'staged')
    if (!pending.length) return
    applyActions(pending.map((a) => a.action))
    patch(set, turnId, (t) => ({ ...t, actions: t.actions.map((a) => (a.state === 'staged' ? { ...a, state: 'applied' } : a)) }))
  },
  dismiss: (turnId, index) =>
    patch(set, turnId, (t) => ({ ...t, actions: t.actions.map((a, i) => (i === index ? { ...a, state: 'dismissed' } : a)) })),

  send: async (text) => {
    const q = text.trim()
    if (!q || get().busy) return

    const history = get().turns
      .filter((t) => t.status !== 'error' && t.content.trim())
      .slice(-10)
      .map((t) => ({ role: t.role, content: t.content }))

    const userTurn: Turn = { id: uid(), role: 'user', content: q, thinking: '', tools: [], actions: [], status: 'done', at: Date.now() }
    const id = uid()
    const aiTurn: Turn = { id, role: 'assistant', content: '', thinking: '', tools: [], actions: [], status: 'streaming', at: Date.now() }
    set((s) => ({ turns: [...s.turns, userTurn, aiTurn], busy: true, inspect: id, activity: 'Reading the engine' }))

    const w = useStore.getState()
    controller = new AbortController()

    await openStream(
      {
        mode: 'chat', message: q, history,
        context: {
          country: w.country, parent: w.selectedParent, screen: w.screen, scenario: w.scenario,
          viewMode: w.viewMode, ownedModules: w.subscribedModules, pooling: w.poolingAddon,
        },
      },
      {
        onReady: (d) => patch(set, id, (t) => ({ ...t, model: d.model })),
        onText: (txt) => patch(set, id, (t) => ({ ...t, content: t.content + txt })),
        onThinking: (txt) => patch(set, id, (t) => ({ ...t, thinking: t.thinking + txt })),
        onToolStart: (d) => {
          set({ activity: d.name })
          patch(set, id, (t) => ({ ...t, tools: [...t.tools, { id: d.id, name: d.name, ok: true, running: true }] }))
        },
        onToolEnd: (c) => patch(set, id, (t) => ({
          ...t,
          tools: t.tools.some((x) => x.id === c.id)
            ? t.tools.map((x) => (x.id === c.id ? { ...c, running: false } : x))
            : [...t.tools, { ...c, running: false }],
        })),
        onAction: (a) => patch(set, id, (t) => ({ ...t, actions: [...t.actions, { action: a, state: 'staged' }] })),
        onDone: (d) => {
          patch(set, id, (t) => ({
            ...t,
            status: t.status === 'error' ? 'error' : 'done',
            usage: d.usage ?? t.usage,
            content: t.content.trim() || (t.status === 'error' ? t.content : 'Done.'),
          }))
          set({ busy: false, activity: null })
        },
        onError: (m) => {
          patch(set, id, (t) => ({ ...t, status: 'error', error: m, tools: t.tools.map((x) => ({ ...x, running: false })) }))
          set({ busy: false, activity: null })
        },
      },
      controller.signal,
    )

    controller = null
    set({ busy: false, activity: null })
  },
}))
