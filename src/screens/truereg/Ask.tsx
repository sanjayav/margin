// ───────────────────────────────────────────────────────────────────────────
// ASK — the front door. You type a question; an agent answers it.
//
// One thread holds both kinds of work: a question you typed, and a goal you
// picked because you did not want to phrase one. A goal run posts its plan into
// the same conversation rather than taking over a separate screen.
//
// Two answer sources, and they never look alike:
//   ENGINE  — the deterministic tools answered on their own. Every number in
//             this product already comes from a tool, so a question that maps
//             onto one needs no model at all.
//   AGENT   — a model wrote the prose around tool results it was forbidden to
//             compute. Worth spending on judgement, not on arithmetic.
// The chip on every answer says which, because they carry different weight.
//
// The trace is part of the answer, not a debug panel: which tool ran, how long
// it took, and the corpus and defaults versions it read. An answer whose
// provenance is hidden is not defensible, so it ships attached.
// ───────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTr, actionKey, type Msg, type ToolTrace } from '../../truereg/ui/state'
import { GOALS, planFor, type GoalId } from '../../truereg/agents/orchestrator'
import { agentMayCall, getAgent } from '../../truereg/agents/registry'
import { runToolSafe } from '../../truereg/agents/tools'
import { answer as engineAnswer, route } from '../../truereg/agents/route'
import type { AnswerRow, EngineAnswer } from '../../truereg/agents/route'
import Icon, { type IconName } from '../../components/Icon'
import { ACCEPT, MAX_TOTAL_BYTES, forWire, readAttachment, summariseIntake, totalBytes, type Attachment } from '../../truereg/agents/attachments'
import { EFFORTS, MODELS, estimateTurnCostUsd, getModel } from '../../truereg/agents/models'
import { calculateAll } from '../../truereg/cbam/emissions'
import { computeDelta } from '../../truereg/cbam/delta'
import { defaultIntensity } from '../../truereg/cbam/defaults'
import { DEMO_BUNDLE, DEMO_CONTRACTS } from '../../truereg/record/demo'
import { Bi, ClauseChip, n0, n2 } from './parts'

const uid = () => Math.random().toString(36).slice(2, 10)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const SUGGESTIONS: { icon: IconName; text: string; tag: string }[] = [
  { icon: 'target', tag: 'Number', text: 'How was the hot-rolled coil figure derived?' },
  { icon: 'scale', tag: 'Buyer', text: 'What is it worth to Nordstahl versus the default?' },
  { icon: 'shield', tag: 'Verifier', text: 'What will the verifier challenge first?' },
  { icon: 'link', tag: 'Precursors', text: 'Which precursors are still missing supplier data?' },
  { icon: 'card', tag: 'Article 9', text: 'Does the carbon price we pay reduce their surrender?' },
  { icon: 'section', tag: '中文', text: '我们的隐含排放是多少？' },
]

export default function Ask() {
  const messages = useTr((s) => s.messages)
  const push = useTr((s) => s.push)
  const patch = useTr((s) => s.patch)
  const clear = useTr((s) => s.clearThread)
  const context = useTr((s) => s.context)
  const substituteDefaults = useTr((s) => s.substituteDefaults)
  const model = useTr((s) => s.model)
  const effort = useTr((s) => s.effort)
  const pending = useTr((s) => s.pending)
  const addPending = useTr((s) => s.addPending)
  const removePending = useTr((s) => s.removePending)
  const clearPending = useTr((s) => s.clearPending)
  const [draft, setDraft] = useState('')
  const [dragging, setDragging] = useState(false)
  const [attachErr, setAttachErr] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const abort = useRef<AbortController | null>(null)

  // scrollIntoView is not universally implemented (jsdom, some embedded
  // webviews). Auto-scrolling is a convenience; losing it must never take the
  // whole surface down with it.
  useEffect(() => {
    // Only follow a live conversation. Running this on the empty state scrolled
    // the opening off the top of its own screen.
    if (!messages.length) return
    try { endRef.current?.scrollIntoView?.({ behavior: reduced() ? 'auto' : 'smooth', block: 'end' }) } catch { /* not scrollable here */ }
  }, [messages])
  useEffect(() => () => abort.current?.abort(), [])

  const grow = (el: HTMLTextAreaElement | null) => { if (el) { el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 168)}px` } }

  const send = useCallback(async (text: string) => {
    const q = text.trim()
    const files = useTr.getState().pending
    if ((!q && !files.length) || busy) return
    setBusy(true); setDraft(''); grow(taRef.current)
    clearPending()
    push({ id: uid(), role: 'user', text: q || `${files.length} file${files.length === 1 ? '' : 's'} to take in` })

    const ctx = context()
    // Files lead: whatever else was typed, an upload is the intake agent's job.
    const r = files.length && !q ? { agent: 'intake' as const, tool: 'intake_queue' as const, input: {}, why: 'Files were attached, so intake structures them before anything else reads them.', score: 9 } : route(q)
    const id = uid()
    push({ id, role: 'agent', agent: r.agent, source: 'engine', text: '', answer: null, tools: [], staged: [], streaming: true, error: null, attachments: files, model })
    if (!reduced()) await sleep(140)

    // The deterministic answer is computed FIRST, always. It is the ground
    // truth; a model, if configured, then writes over it — never instead of it.
    const intake = files.length ? summariseIntake(files) : null
    const ea = q ? engineAnswer(q, ctx) : null
    const trace: ToolTrace[] = [{ name: files.length ? 'structure_intake' : r.tool, ms: ea?.ms ?? 0, ok: !!(ea || intake) }]
    patch(id, {
      answer: intake
        ? { route: r as any, headline: intake.headline, headlineZh: intake.headlineZh, figures: intake.figures as any, rows: intake.rows as any, caveats: intake.openQuestions, clauseIds: [], ms: 0 }
        : ea,
      tools: trace, staged: [...ctx.staged], text: intake?.headline ?? ea?.headline ?? '',
    })

    // Ask a live agent to answer properly, if one is configured.
    abort.current?.abort()
    const ac = new AbortController(); abort.current = ac
    try {
      const res = await fetch('/api/truereg', {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal: ac.signal,
        body: JSON.stringify({
          mode: 'ask', agent: r.agent, substituteDefaults, model, effort,
          question: q || 'Take these files in. Report what is actually in them — sheets, column headings in the plant’s own words, row counts, the period covered — what you can place inside a system boundary, and what you cannot place without a person.',
          attachments: files.map(forWire),
        }),
      })
      if (!res.ok || !res.body) throw new Error(res.status === 401 ? 'Sign in to reach the agents.' : `Agent runtime unavailable (${res.status}).`)
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''; let live = false; let prose = ''
      const tools: ToolTrace[] = []
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const frames = buf.split('\n\n'); buf = frames.pop() ?? ''
        for (const f of frames) {
          const ev = /^event: (.+)$/m.exec(f)?.[1]
          const data = /^data: (.+)$/m.exec(f)?.[1]
          if (!ev || !data) continue
          const d = JSON.parse(data)
          if (ev === 'ready') { live = d.narration === 'live'; if (live) patch(id, { source: 'model', text: '', answer: ea }) }
          else if (ev === 'text' && live) { prose += d.text; patch(id, { text: prose }) }
          else if (ev === 'tool_end') { tools.push({ name: d.name, ms: d.ms ?? 0, ok: d.ok, provenance: d.provenance, error: d.error?.message }); patch(id, { tools: [...tools] }) }
          else if (ev === 'action') patch(id, { staged: [...ctx.staged] })
          else if (ev === 'error') patch(id, { error: d.error })
        }
      }
      if (!live && !ea) patch(id, { error: 'No tool covers that question, and no model is configured to reason about it. Try naming the number, a buyer, verification, precursors, duties, or a term.' })
    } catch (e: any) {
      if (e?.name !== 'AbortError' && !ea) patch(id, { error: String(e?.message ?? e) })
    } finally {
      patch(id, { streaming: false })
      setBusy(false)
    }
  }, [busy, clearPending, context, effort, model, patch, push, substituteDefaults])

  const runGoal = useCallback(async (goalId: GoalId) => {
    if (busy) return
    setBusy(true)
    const g = GOALS.find((x) => x.id === goalId)!
    push({ id: uid(), role: 'user', text: g.titleEn })
    const ctx = context()
    const plan = planFor(goalId, ctx)
    plan.tasks.forEach((t) => { t.state = 'pending' })
    const id = uid()
    push({ id, role: 'plan', goal: goalId, plan })

    const step = reduced() ? 0 : 150
    const done = new Set<string>()
    for (const task of plan.tasks) {
      const unmet = task.dependsOn.filter((d) => !done.has(d))
      if (unmet.length) { task.state = 'blocked'; task.error = { code: 'blocked', message: `Waiting on ${unmet.join(', ')}.` } }
      else if (!agentMayCall(task.agent, task.tool)) { task.state = 'blocked'; task.error = { code: 'not_granted', message: `${getAgent(task.agent).nameEn} does not hold ${task.tool}.` } }
      else {
        task.state = 'running'
        useTr.setState((s) => ({ messages: [...s.messages] }))
        if (step) await sleep(step)
        const before = ctx.staged.length
        const res = runToolSafe(task.tool, task.input ?? {}, ctx)
        if (res.ok) {
          task.result = res.result; task.ms = res.result.ms
          task.escalations = ctx.staged.slice(before)
          task.state = task.escalations.length ? 'escalated' : 'done'
          done.add(task.id)
        } else { task.state = 'blocked'; task.error = res.error }
      }
      useTr.setState((s) => ({ messages: [...s.messages] }))
    }
    setBusy(false)
  }, [busy, context, push])

  const take = useCallback(async (list: FileList | File[] | null) => {
    const files = Array.from(list ?? [])
    if (!files.length) return
    setAttachErr(null)
    const read = await Promise.all(files.map(readAttachment))
    const current = useTr.getState().pending
    if (totalBytes([...current, ...read]) > MAX_TOTAL_BYTES) {
      setAttachErr(`That would put the request over ${MAX_TOTAL_BYTES / 1024 / 1024} MB. Send these first, then attach the rest.`)
      return
    }
    addPending(read)
    const bad = read.filter((r) => r.error)
    if (bad.length) setAttachErr(`${bad.length} file(s) could not be read — they are listed below with the reason.`)
  }, [addPending])

  return (
    <div className="flex h-full flex-col"
      onDragOver={(e) => { e.preventDefault(); if (!dragging) setDragging(true) }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false) }}
      onDrop={(e) => { e.preventDefault(); setDragging(false); void take(e.dataTransfer?.files ?? null) }}>
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-[#FBF7EF]/80 backdrop-blur-sm">
          <div className="rounded-2xl border-2 border-dashed border-brand/40 bg-white/80 px-8 py-6 text-center">
            <Icon name="upload" size={26} className="mx-auto text-brand" />
            <p className="mt-2.5 text-[14px] font-bold text-ink-100">Drop production records, invoices or process logs</p>
            <p className="mt-1 text-[11.5px] text-ink-500">Spreadsheets and CSV are parsed here · PDFs and photos go to the agent</p>
          </div>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[50rem] px-4 pb-8 pt-5 sm:px-6 sm:pt-7">
          {messages.length === 0
            ? <Opening onPick={send} onGoal={runGoal} />
            : <div className="space-y-6">{messages.map((m) => <Message key={m.id} m={m} />)}</div>}
          <div ref={endRef} className="h-px" />
        </div>
      </div>

      {/* Docked, never floating. A composer that overlaps the answer it produced
          is the single most common way a chat surface feels unfinished. */}
      <div className="shrink-0 border-t border-black/[0.06] bg-[#FBF7EF]/85 px-4 pb-[calc(env(safe-area-inset-bottom)+76px)] pt-3 backdrop-blur-xl sm:px-6 lg:pb-4"
        style={{ boxShadow: '0 -12px 28px -24px rgba(120,90,50,0.35)' }}>
        <div className="mx-auto w-full max-w-[50rem]">
          {(pending.length > 0 || attachErr) && (
            <div className="mb-2">
              {pending.length > 0 && (
                <ul className="flex flex-wrap gap-1.5">
                  {pending.map((a) => <li key={a.id}><Chip a={a} onRemove={() => removePending(a.id)} /></li>)}
                </ul>
              )}
              {attachErr && <p className="mt-1.5 px-1 text-[11px] text-warn">{attachErr}</p>}
            </div>
          )}
          <div className="group relative flex items-end gap-2 rounded-[18px] border border-black/[0.08] bg-white p-1.5 transition-all duration-200 focus-within:border-brand/35 focus-within:shadow-[0_0_0_3px_rgba(232,34,59,0.09),0_14px_32px_-20px_rgba(120,90,50,0.4)]"
            style={{ boxShadow: '0 1px 2px rgba(40,30,15,0.04), 0 10px 26px -20px rgba(120,90,50,0.35)' }}>
            <input ref={fileRef} type="file" multiple accept={ACCEPT} className="sr-only"
              onChange={(e) => { void take(e.target.files); e.target.value = '' }} />
            <button onClick={() => fileRef.current?.click()} disabled={busy} aria-label="Attach production records, invoices or process logs"
              title="Attach production records, energy invoices, process logs"
              className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[13px] text-ink-500 transition hover:bg-black/[0.045] hover:text-ink-200 active:scale-95 disabled:opacity-40">
              <Icon name="upload" size={16} />
            </button>
            <textarea
              ref={taRef} rows={1} value={draft} disabled={busy}
              onChange={(e) => { setDraft(e.target.value); grow(e.target) }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(draft) } }}
              onPaste={(e) => { const f = Array.from(e.clipboardData?.files ?? []); if (f.length) { e.preventDefault(); void take(f) } }}
              placeholder={pending.length ? 'Add a question, or send the files on their own…' : 'Ask about the number, a buyer, verification, a duty…'}
              aria-label="Ask the agents"
              className="max-h-[168px] min-h-[40px] w-full min-w-0 flex-1 resize-none bg-transparent px-3 py-2.5 text-[14.5px] leading-relaxed text-ink-100 placeholder:text-ink-500/80 focus:outline-none disabled:opacity-50"
            />
            <button onClick={() => void send(draft)} disabled={busy || (!draft.trim() && !pending.length)} aria-label="Send"
              className={`grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[13px] transition-all duration-200 active:scale-95 ${
                busy || (!draft.trim() && !pending.length)
                  ? 'bg-black/[0.055] text-ink-600'
                  : 'bg-brand text-white shadow-[0_6px_16px_-8px_rgba(232,34,59,0.75)] hover:brightness-105'
              }`}>
              {busy
                ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current/25 border-t-current" />
                : <Icon name="chevron" size={16} className="-rotate-90" />}
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 px-1">
            <ModelPicker />
            <span className="hidden text-[10.5px] text-ink-500 lg:block">
              <kbd className="kbd-light">Enter</kbd> to send · <kbd className="kbd-light">⇧↵</kbd> new line
            </span>
            {messages.length > 0 && (
              <button onClick={clear} className="ml-auto text-[10.5px] font-semibold text-ink-500 transition hover:text-brand">Clear thread</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const KIND_ICON: Record<string, IconName> = { table: 'table', pdf: 'section', image: 'scatter', text: 'section', unsupported: 'alert' }

function Chip({ a, onRemove, readOnly }: { a: Attachment; onRemove: () => void; readOnly?: boolean }) {
  const bad = !!a.error
  const detail = a.error
    ? a.error
    : a.sheets?.length
      ? `${a.sheets.length} sheet${a.sheets.length === 1 ? '' : 's'} · ${a.sheets.reduce((x, s) => x + s.rows, 0).toLocaleString('en-GB')} rows parsed here`
      : a.kind === 'pdf' ? 'goes to the agent to read'
      : a.kind === 'image' ? 'goes to the agent to read'
      : `${(a.bytes / 1024).toFixed(0)} KB`
  return (
    <span title={detail}
      className={`inline-flex max-w-[19rem] items-center gap-2 rounded-full border py-1 pl-1.5 pr-1 text-[11.5px] ${bad ? 'border-danger/25 bg-danger/[0.05] text-danger' : 'border-black/[0.08] bg-white text-ink-300'}`}>
      <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${bad ? 'bg-danger/10' : 'bg-black/[0.05] text-ink-500'}`}>
        <Icon name={bad ? 'alert' : KIND_ICON[a.kind] ?? 'section'} size={10} />
      </span>
      <span className="min-w-0 truncate font-medium">{a.name}</span>
      <span className="hidden shrink-0 text-ink-500 sm:inline">· {detail}</span>
      {readOnly
        ? <span className="w-1" />
        : <button onClick={onRemove} aria-label={`Remove ${a.name}`}
            className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-ink-500 transition hover:bg-black/[0.06] hover:text-ink-100">
            <Icon name="close" size={10} />
          </button>}
    </span>
  )
}

/** Model and effort. Deliberately worded so the two dials are not confused:
 *  the model is which brain reads the record, effort is how long it thinks. The
 *  bar also states the one thing that must never be misread — neither dial can
 *  move a number, because the engine owns every number. */
function ModelPicker() {
  const model = useTr((s) => s.model)
  const setModel = useTr((s) => s.setModel)
  const effort = useTr((s) => s.effort)
  const setEffort = useTr((s) => s.setEffort)
  const [open, setOpen] = useState(false)
  const def = getModel(model)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', away); window.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); window.removeEventListener('keydown', esc) }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu"
        className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-[10.5px] font-semibold text-ink-500 transition hover:bg-black/[0.04] hover:text-ink-200">
        <Icon name="spark" size={11} />
        {def.name}
        {def.supportsEffort && <span className="text-ink-600">· {EFFORTS.find((e) => e.id === effort)?.label.toLowerCase()}</span>}
        <Icon name="chevron" size={9} className={`transition-transform ${open ? '-rotate-90' : 'rotate-90'}`} />
      </button>

      {open && (
        <div role="menu"
          className="absolute bottom-full left-0 z-50 mb-2 w-[min(23rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-black/[0.08] bg-[#FFFEFB] shadow-[0_1px_2px_rgba(40,30,15,0.05),0_20px_44px_-20px_rgba(120,90,50,0.45)]"
          style={{ animation: 'rise .18s cubic-bezier(.2,.7,.2,1)' }}>
          <div className="border-b border-black/[0.06] px-3.5 py-2.5">
            <div className="label">Which model reads the record</div>
            <p className="mt-1 text-[10.5px] leading-relaxed text-ink-500">None of them computes a figure. The engine owns every number; this only changes the quality of the reading around them.</p>
          </div>
          <ul className="max-h-[42vh] overflow-y-auto p-1.5">
            {MODELS.map((m) => {
              const on = m.id === model
              return (
                <li key={m.id}>
                  <button onClick={() => { setModel(m.id); setOpen(false) }} role="menuitemradio" aria-checked={on}
                    className={`w-full rounded-xl px-2.5 py-2 text-left transition ${on ? 'bg-brand/[0.06]' : 'hover:bg-black/[0.03]'}`}>
                    <span className="flex items-center gap-2">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${on ? 'bg-brand' : 'bg-ink-700'}`} />
                      <span className="text-[12.5px] font-bold text-ink-100">{m.name}</span>
                      {m.tier === 'default' && <span className="chip !py-0 !text-[9px]">default</span>}
                      {m.tier === 'frontier' && <span className="chip !border-accentblue/25 !bg-accentblue/[0.07] !py-0 !text-[9px] !text-accentblue">most capable</span>}
                      <span className="dnum ml-auto shrink-0 text-[10px] text-ink-500">${m.inputPerMTok}/${m.outputPerMTok} per Mtok</span>
                    </span>
                    <span className="mt-1 block pl-3.5 text-[11px] leading-relaxed text-ink-500">{m.forEn}</span>
                    <span className="mt-1 block pl-3.5 text-[10px] text-ink-600">
                      {(m.context / 1000).toLocaleString('en-GB')}K context · ~${estimateTurnCostUsd(m.id).toFixed(3)} a turn
                      {!m.supportsEffort && ' · no effort control'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>

          <div className="border-t border-black/[0.06] px-3.5 py-3">
            <div className="label">How hard it thinks</div>
            <p className="mt-1 text-[10.5px] leading-relaxed text-ink-500">
              {def.supportsEffort
                ? 'The precision dial. Lower effort on a newer model often beats high effort on an older one, so raise this before changing model.'
                : `${def.name} has no effort control — it is fixed. Pick another model to tune precision.`}
            </p>
            <div className={`mt-2.5 flex gap-1 ${def.supportsEffort ? '' : 'pointer-events-none opacity-40'}`}>
              {EFFORTS.map((e) => (
                <button key={e.id} onClick={() => setEffort(e.id)} title={e.hint} aria-pressed={effort === e.id}
                  className={`flex-1 rounded-lg px-1 py-1.5 text-[10.5px] font-semibold transition ${effort === e.id ? 'bg-brand text-white' : 'bg-black/[0.04] text-ink-500 hover:bg-black/[0.07] hover:text-ink-200'}`}>
                  {e.label === 'Extra high' ? 'X-high' : e.label}
                </button>
              ))}
            </div>
            {def.supportsEffort && <p className="mt-2 text-[10.5px] leading-relaxed text-ink-500">{EFFORTS.find((e) => e.id === effort)?.hint}</p>}
          </div>
        </div>
      )}
    </div>
  )
}

function Opening({ onPick, onGoal }: { onPick: (q: string) => void; onGoal: (g: GoalId) => void }) {
  // The opening states this installation's actual position rather than
  // describing the product. It is the same engine every answer uses, so the
  // first thing on screen is already the kind of thing you came to find out.
  const position = useMemo(() => {
    const rows = calculateAll(DEMO_BUNDLE, { substituteDefaultsForUnknownPrecursors: true })
    const hrc = rows.find((r) => r.productId === 'pr-hrc')
    const def = hrc?.category ? defaultIntensity(hrc.category, DEMO_BUNDLE.installation.country, true) : null
    const delta = computeDelta(DEMO_CONTRACTS, rows, { price: { eur: 78, asOf: '2026-09-01', source: 'assumed', status: 'assumed' }, defaultsCountry: 'CN' })
    return {
      see: hrc?.see ?? null,
      under: hrc?.see != null && def ? def.total - hrc.see : null,
      saving: delta.totals.buyerSavingEur,
      buyers: delta.contracts.filter((c) => !c.blocked).length,
      open: rows.reduce((a, r) => a + r.unknowns.length, 0),
    }
  }, [])

  return (
    <div className="pb-2">
      <div className="flex items-center gap-2 text-[11px] font-semibold text-ink-500">
        <span className="h-1.5 w-1.5 rounded-full bg-safe" />
        {DEMO_BUNDLE.installation.name}
        <span className="text-ink-600">·</span>
        <span className="tabular-nums">{DEMO_BUNDLE.period.from.slice(0, 4)}</span>
      </div>

      {/* One sentence, every figure live. The number carries the display weight
          because the number is what the whole product is for. */}
      <p className="mt-3 max-w-[26ch] font-display text-[27px] font-bold leading-[1.15] tracking-[-0.035em] text-ink-100 sm:max-w-[34ch] sm:text-[34px]">
        Hot-rolled coil is proving at{' '}
        <span className="dnum whitespace-nowrap text-brand">{position.see == null ? '—' : n2(position.see, 3)}</span>{' '}
        <span className="text-[0.55em] font-semibold tracking-normal text-ink-400">tCO₂e/t</span>
      </p>
      <p className="mt-3.5 max-w-[54ch] text-[13.5px] leading-relaxed text-ink-400">
        {position.under != null && <>That is <strong className="font-semibold text-safe">{n2(position.under, 2)} under</strong> the Chinese default — worth <strong className="font-semibold text-ink-200">€{n0(position.saving)}</strong> to your {position.buyers} EU buyers this period. </>}
        {position.open > 0 && <>{position.open} question{position.open === 1 ? ' still needs' : 's still need'} a person.</>}
      </p>

      <div className="mt-7">
        <div className="label mb-2.5">Ask</div>
        <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 sm:overflow-visible">
          {SUGGESTIONS.map((s, i) => (
            <button key={s.text} onClick={() => onPick(s.text)} style={{ animationDelay: `${i * 45}ms` }}
              className="rise group flex shrink-0 snap-start items-center gap-2 rounded-full border border-black/[0.08] bg-white/70 py-1.5 pl-2 pr-3.5 text-[12.5px] text-ink-300 transition-all duration-200 hover:-translate-y-px hover:border-black/[0.18] hover:bg-white hover:text-ink-100 hover:shadow-[0_6px_16px_-10px_rgba(120,90,50,0.5)] active:translate-y-0 sm:shrink">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-black/[0.045] text-ink-500 transition group-hover:bg-brand/10 group-hover:text-brand">
                <Icon name={s.icon} size={12} />
              </span>
              <span className="whitespace-nowrap sm:whitespace-normal">{s.text}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Goals are a list, not a grid of identical cards. The meta on the right
          is the part that makes one worth picking over another. */}
      <div className="mt-8">
        <div className="label mb-2.5">Or hand the agents a goal</div>
        <ul className="overflow-hidden rounded-2xl border border-black/[0.07] bg-white/50">
          {GOALS.map((g, i) => (
            <li key={g.id} className="border-b border-black/[0.05] last:border-0">
              <button onClick={() => onGoal(g.id)}
                className="group flex w-full items-center gap-3 px-3.5 py-3 text-left transition hover:bg-black/[0.022] active:bg-black/[0.04]">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-black/[0.045] text-ink-500 transition group-hover:bg-brand/10 group-hover:text-brand">
                  <Icon name={g.icon} size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-ink-100"><Bi en={g.titleEn} zh={g.titleZh} zhClass="text-[11px] font-medium" /></span>
                  <span className="mt-0.5 line-clamp-1 block text-[11.5px] leading-relaxed text-ink-500">{g.promptEn}</span>
                </span>
                <span className="dnum hidden shrink-0 text-[10.5px] font-semibold text-ink-500 sm:block">{planFor(g.id, useTr.getState().context()).tasks.length} steps</span>
                <Icon name="chevron" size={13} className="shrink-0 text-ink-600 transition group-hover:translate-x-0.5 group-hover:text-brand" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function Message({ m }: { m: Msg }) {
  if (m.role === 'user') {
    return (
      <div className="flex justify-end" style={{ animation: 'rise .3s cubic-bezier(.2,.7,.2,1)' }}>
        <p className="max-w-[85%] rounded-2xl rounded-br-md border border-brand/20 bg-brand/[0.06] px-4 py-2.5 text-[13.5px] leading-relaxed text-ink-100 sm:max-w-[75%]">{m.text}</p>
      </div>
    )
  }
  if (m.role === 'plan') return <PlanMessage m={m} />
  return <AgentMessage m={m} />
}

function PlanMessage({ m }: { m: Extract<Msg, { role: 'plan' }> }) {
  const g = GOALS.find((x) => x.id === m.goal)!
  const finished = m.plan.tasks.filter((t) => t.state === 'done' || t.state === 'escalated').length
  const staged = m.plan.tasks.flatMap((t) => t.escalations)
  return (
    <div style={{ animation: 'rise .3s cubic-bezier(.2,.7,.2,1)' }}>
      <Header agentName="Orchestrator" accent="#E8223B" icon="layers" source="engine"
        sub={`${finished} of ${m.plan.tasks.length} tasks · derived from the obligation graph, not invented`} />
      <div className="mt-2.5 space-y-1">
        {m.plan.tasks.map((t) => {
          const a = getAgent(t.agent)
          const dot = t.state === 'done' ? 'bg-safe' : t.state === 'escalated' ? 'bg-warn' : t.state === 'running' ? 'bg-accentblue animate-pulse' : t.state === 'blocked' ? 'bg-danger' : 'bg-ink-600'
          return (
            <div key={t.id} className="flex items-center gap-2.5 text-[12px]" title={t.becauseEn}>
              <span className={`h-[7px] w-[7px] shrink-0 rounded-full ${dot}`} />
              <span className="min-w-0 flex-1 truncate text-ink-300">{t.titleEn}</span>
              <span className="shrink-0 text-[10.5px] font-semibold" style={{ color: a.accent }}>{a.nameEn.replace(' agent', '')}</span>
              {t.ms != null && <span className="dnum w-12 shrink-0 text-right text-[10.5px] text-ink-500">{t.ms} ms</span>}
            </div>
          )
        })}
      </div>
      {staged.length > 0 && <Staged actions={staged} />}
    </div>
  )
}

function AgentMessage({ m }: { m: Extract<Msg, { role: 'agent' }> }) {
  const a = getAgent(m.agent)
  return (
    <div style={{ animation: 'rise .3s cubic-bezier(.2,.7,.2,1)' }}>
      <Header agentName={a.nameEn} agentNameZh={a.nameZh} accent={a.accent} icon={a.icon} source={m.source} sub={m.answer?.route.why} model={m.model} />

      {/* What the agent was actually shown. Kept on the turn so the thread
          remains a complete record of the inputs behind the answer. */}
      {!!m.attachments?.length && (
        <ul className="mt-2.5 flex flex-wrap gap-1.5">
          {m.attachments.map((f) => <li key={f.id}><Chip a={f} onRemove={() => {}} readOnly /></li>)}
        </ul>
      )}

      {m.error && !m.answer ? (
        <div className="mt-2.5 rounded-2xl border border-warn/25 bg-warn/[0.05] p-4">
          <p className="text-[12.5px] leading-relaxed text-ink-300">{m.error}</p>
        </div>
      ) : (
        <div className="mt-2.5 space-y-3.5">
          {m.text
            ? <p className="max-w-[70ch] whitespace-pre-wrap text-[15px] font-medium leading-[1.65] tracking-[-0.008em] text-ink-100">
                {m.text}{m.streaming && <span className="ml-0.5 inline-block h-[16px] w-[2px] translate-y-[2px] animate-pulse bg-brand" />}
              </p>
            : m.streaming ? <div className="space-y-2"><div className="skeleton h-3.5 w-[88%]" /><div className="skeleton h-3.5 w-[64%]" /></div> : null}

          {m.answer && <AnswerBody a={m.answer} />}
          {m.staged.length > 0 && <Staged actions={m.staged} />}
          {m.tools.length > 0 && <Trace tools={m.tools} />}
        </div>
      )}
    </div>
  )
}

function Header({ agentName, agentNameZh, accent, icon, source, sub, model }: {
  agentName: string; agentNameZh?: string; accent: string; icon: any; source: 'engine' | 'model'; sub?: string; model?: string
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg" style={{ background: `${accent}18`, color: accent }}><Icon name={icon} size={12} /></span>
      <span className="text-[12.5px] font-bold text-ink-100">{agentName}</span>
      {agentNameZh && <span className="text-[11px] font-semibold text-ink-500" lang="zh-CN">{agentNameZh}</span>}
      <span className={`chip !py-0.5 !text-[10px] ${source === 'model' ? '!border-accentblue/25 !bg-accentblue/[0.07] !text-accentblue' : '!border-safe/25 !bg-safe/[0.07] !text-safe'}`}
        data-tip={source === 'model' ? 'A model wrote the prose. Every figure in it still came from a tool.' : 'Answered by the deterministic tools alone — no model in the path.'}>
        {source === 'model' ? 'Agent' : 'Engine'}
      </span>
      {model && source === 'model' && <span className="text-[10px] font-semibold text-ink-500">{getModel(model).name}</span>}
      {sub && <span className="w-full text-[11px] leading-relaxed text-ink-500/85 sm:w-auto sm:flex-1 sm:truncate" title={sub}>{sub}</span>}
    </div>
  )
}

function AnswerBody({ a }: { a: EngineAnswer }) {
  const [all, setAll] = useState(false)
  const rows = all ? a.rows : a.rows.slice(0, 5)
  return (
    <div className="space-y-3.5">
      {a.figures.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {a.figures.map((f, i) => {
            const c = { ink: 'text-ink-100', safe: 'text-safe', danger: 'text-danger', warn: 'text-warn', blue: 'text-accentblue' }[f.tone ?? 'ink']
            const rail = { ink: '#C9BCA3', safe: '#0E9F6E', danger: '#E0484D', warn: '#D98005', blue: '#3B6FE0' }[f.tone ?? 'ink']
            return (
              <div key={i} className="relative flex flex-col overflow-hidden rounded-[14px] border border-black/[0.06] bg-white/70 p-3.5">
                <span aria-hidden className="absolute inset-x-0 top-0 h-[2px]" style={{ background: `linear-gradient(90deg, ${rail}, ${rail}00 78%)`, opacity: 0.7 }} />
                <div className="min-h-[2.1em] text-[10px] font-semibold uppercase leading-[1.35] tracking-[0.09em] text-ink-500">{f.label}</div>
                <div className={`dnum mt-1.5 text-[19px] font-bold leading-none tracking-[-0.025em] ${c}`}>{f.value}</div>
                {f.sub && <div className="mt-auto pt-2 text-[10px] leading-snug text-ink-500">{f.sub}</div>}
              </div>
            )
          })}
        </div>
      )}

      {rows.length > 0 && (
        <ul className="divide-y divide-black/[0.05] overflow-hidden rounded-[14px] border border-black/[0.06] bg-white/50">
          {rows.map((r, i) => <Row key={i} r={r} />)}
          {a.rows.length > 5 && (
            <li className="p-2 text-center">
              <button onClick={() => setAll(!all)} className="text-[11.5px] font-semibold text-accentblue hover:underline">
                {all ? 'Show less' : `Show all ${a.rows.length}`}
              </button>
            </li>
          )}
        </ul>
      )}

      {a.caveats.length > 0 && (
        <div className="rounded-xl border border-warn/20 bg-warn/[0.05] p-3.5">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold text-warn"><Icon name="alert" size={11} /> Carry this with the figure</div>
          <ul className="space-y-1.5">{a.caveats.map((c, i) => <li key={i} className="text-[11.5px] leading-relaxed text-ink-400">{c}</li>)}</ul>
        </div>
      )}

      {a.clauseIds.length > 0 && <ClauseChip ids={a.clauseIds} />}
    </div>
  )
}

function Row({ r }: { r: AnswerRow }) {
  const c = { ink: 'text-ink-400', safe: 'text-safe', danger: 'text-danger', warn: 'text-warn' }[r.tone ?? 'ink']
  return (
    <li className="flex items-start gap-3 p-3 transition-colors hover:bg-black/[0.018]">
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] font-semibold leading-snug text-ink-200">{r.label}</span>
        {r.sub && <span className="mt-0.5 block text-[11.5px] leading-relaxed text-ink-500">{r.sub}</span>}
      </span>
      {r.value && <span className={`dnum shrink-0 text-[12px] font-bold ${c}`}>{r.value}</span>}
    </li>
  )
}

function Staged({ actions }: { actions: { kind: string; summaryEn: string; summaryZh: string; escalationReason: string }[] }) {
  const approved = useTr((s) => s.approved)
  const approve = useTr((s) => s.approve)
  return (
    <div className="rounded-xl border border-warn/25 bg-warn/[0.035] p-3.5">
      <div className="mb-2.5 flex items-center gap-1.5 text-[11px] font-bold text-warn">
        <Icon name="shield" size={11} /> {actions.length} waiting on you · nothing has been sent
      </div>
      <ul className="space-y-2.5">
        {actions.map((act, i) => {
          const key = actionKey(act as any, i)
          const ok = approved.includes(key)
          return (
            <li key={key} className="border-t border-warn/15 pt-2.5 first:border-0 first:pt-0">
              <p className="text-[12.5px] font-semibold leading-snug text-ink-100"><Bi en={act.summaryEn} zh={act.summaryZh} zhClass="text-[11.5px] font-medium" /></p>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-500">{act.escalationReason}</p>
              {ok
                ? <span className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold text-safe"><Icon name="check" size={12} /> Approved · recorded, not sent</span>
                : <button onClick={() => approve(key)} className="btn-ghost mt-2 !px-2.5 !py-1.5 !text-[11.5px]">Approve</button>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Trace({ tools }: { tools: ToolTrace[] }) {
  const [open, setOpen] = useState(false)
  const total = tools.reduce((a, t) => a + t.ms, 0)
  const p = tools.find((t) => t.provenance)?.provenance
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 text-[10.5px] font-semibold text-ink-500 transition hover:text-ink-300">
        <Icon name="chevron" size={10} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
        {tools.length} tool call{tools.length === 1 ? '' : 's'} · {total} ms
        {p && <span className="font-medium">· corpus {p.corpusVersion} · defaults {p.defaultsVersion}</span>}
      </button>
      {open && (
        <ul className="mt-2 space-y-1 rounded-xl border border-black/[0.06] bg-black/[0.02] p-3" style={{ animation: 'rise .2s cubic-bezier(.2,.7,.2,1)' }}>
          {tools.map((t, i) => (
            <li key={i} className="flex items-center gap-2 text-[11px]">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${t.ok ? 'bg-safe' : 'bg-danger'}`} />
              <span className="mono min-w-0 flex-1 truncate text-ink-300">{t.name}</span>
              {t.error && <span className="truncate text-ink-500">{t.error}</span>}
              <span className="dnum shrink-0 text-ink-500">{t.ms} ms</span>
            </li>
          ))}
          {p && <li className="mt-1.5 border-t border-black/[0.06] pt-2 text-[10.5px] text-ink-500">Pinned to corpus {p.corpusVersion}, defaults {p.defaultsVersion} ({p.defaultsStatus}). Re-runnable against these versions.</li>}
        </ul>
      )}
    </div>
  )
}
