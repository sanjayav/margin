// ───────────────────────────────────────────────────────────────────────────
// AiRE CO-PILOT — the platform's AI control room.
//
// Three panes, because a compliance answer is three things at once:
//
//   BRIEFING (left)   what the engine already found, before anyone asked —
//                     scanned deterministically on every market, severity first.
//   CONVERSATION      the answer, streamed, with the reasoning and the tool
//                     trace visible as it is built.
//   EVIDENCE (right)  every tool the answer stands on: inputs, timing, dataset
//                     version, coverage tier. Exportable. This is what turns an
//                     answer into something a compliance lead can file behind.
//
// Nothing on this screen is a number the model produced. The co-pilot narrates;
// the engine computes; the evidence panel proves which is which.
// ───────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from 'react'
import { useCompliance } from '../lib/useCompliance'
import { useStore } from '../state/store'
import { useCopilot, streamCopilotTake, type ToolCall, type Turn, type StagedAction } from '../lib/copilot'
import { runCoPilot, findingForLLM, type Finding, type Severity } from '../engine/copilot'
import { clientContext } from '../engine/tools'
import { toolLabel, SPEC_BY_NAME } from '../engine/toolspec'
import { fmtMoney, fmtNum, fmtInt } from '../engine/engine'
import Icon, { type IconName } from '../components/Icon'
import { GuidedPathLauncher } from '../components/GuidedPath'

const SEV: Record<Severity, { hex: string; label: string }> = {
  critical: { hex: '#E0484D', label: 'Critical' },
  high: { hex: '#D98005', label: 'High' },
  watch: { hex: '#3B6FE0', label: 'Watch' },
  clear: { hex: '#0E9F6E', label: 'Clear' },
}

const SCREEN_LABEL: Record<string, string> = {
  analyse: 'Plan', forecast: 'Forecast', scenario: 'Scenario', model: 'Scenario', under: 'Action plan',
  compare: 'Compare', creditbook: 'Credit book', pricing: 'Pricing', pooling: 'Pooling', data: 'Data', intel: 'Intelligence',
}

const GROUP_ICON: Record<string, IconName> = {
  position: 'gauge', action: 'target', risk: 'activity', market: 'scale',
  governance: 'shield', workspace: 'sliders',
}

const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening' }

export default function CoPilot() {
  const { pack, country } = useCompliance('actuals')
  const subscribed = useStore((s) => s.subscribedModules)
  const poolingAddon = useStore((s) => s.poolingAddon)

  const turns = useCopilot((s) => s.turns)
  const busy = useCopilot((s) => s.busy)
  const activity = useCopilot((s) => s.activity)
  const inspect = useCopilot((s) => s.inspect)
  const send = useCopilot((s) => s.send)
  const reset = useCopilot((s) => s.reset)
  const setInspect = useCopilot((s) => s.setInspect)

  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  // ── the briefing: fast scan on mount, deepened when the browser is idle ────
  const ctx = useMemo(() => clientContext(subscribed, poolingAddon), [subscribed, poolingAddon])
  const [findings, setFindings] = useState<Finding[]>([])
  const [deepened, setDeepened] = useState(false)
  useEffect(() => {
    setDeepened(false)
    try { setFindings(runCoPilot(ctx, country)) } catch { setFindings([]) }
    const idle = (cb: () => void) =>
      typeof (window as any).requestIdleCallback === 'function'
        ? (window as any).requestIdleCallback(cb, { timeout: 2500 })
        : window.setTimeout(cb, 400)
    let cancelled = false
    const h = idle(() => {
      if (cancelled) return
      try { setFindings(runCoPilot(ctx, country, { deep: true })); setDeepened(true) } catch { /* keep the fast scan */ }
    })
    return () => { cancelled = true; try { (window as any).cancelIdleCallback?.(h) } catch { /* ignore */ } }
  }, [ctx, country])

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }, [turns.length, busy])

  const started = turns.length > 0
  const inspected = turns.find((t) => t.id === inspect) ?? [...turns].reverse().find((t) => t.role === 'assistant')
  const market = findings.find((f) => f.category === 'Market')

  const submit = (text?: string) => {
    const q = (text ?? input).trim()
    if (!q || busy) return
    setInput('')
    void send(q)
  }

  return (
    <div className="grid h-[calc(100vh-8.5rem)] gap-4 xl:grid-cols-[290px_minmax(0,1fr)_370px] lg:grid-cols-[270px_minmax(0,1fr)]">
      {/* ── BRIEFING RAIL ─────────────────────────────────────────────────── */}
      <aside data-density="detail" className="hidden min-h-0 flex-col gap-3 overflow-y-auto pr-0.5 lg:flex">
        <BriefingHeader pack={pack} deepened={deepened} count={findings.length} />
        <div className="flex-1 space-y-2">
          {findings.map((f) => <FindingCard key={f.id} f={f} onAsk={() => submit(f.ask)} busy={busy} />)}
          {!findings.length && (
            <div className="rounded-2xl border border-black/[0.06] bg-white px-4 py-6 text-center text-[12px] text-ink-500">
              Scanning {pack.name}…
            </div>
          )}
        </div>
        <Capabilities />
      </aside>

      {/* ── CONVERSATION ──────────────────────────────────────────────────── */}
      <section className="flex min-h-0 flex-col">
        {!started ? (
          <Landing pack={pack} market={market} findings={findings} onAsk={submit}
            input={input} setInput={setInput} busy={busy} />
        ) : (
          <>
            <div ref={scrollRef} className="min-h-0 flex-1 space-y-5 overflow-y-auto py-1 pr-1">
              {turns.map((t) => t.role === 'user'
                ? <UserTurn key={t.id} turn={t} />
                : <AssistantTurn key={t.id} turn={t} pack={pack} activity={activity}
                    selected={inspected?.id === t.id} onInspect={() => setInspect(t.id)} />)}
            </div>
            <div className="shrink-0 pb-1 pt-3">
              <PromptBar value={input} onChange={setInput} onSend={() => submit()} busy={busy}
                placeholder={`Ask a follow-up about ${pack.name}…`} />
              <div className="mt-2 flex items-center justify-between px-1 text-[10px] text-ink-500">
                <span>Every figure computed by the engine · the model never does arithmetic</span>
                <button onClick={reset} className="inline-flex items-center gap-1 font-semibold text-ink-400 transition hover:text-brand">
                  <Icon name="reset" size={11} /> New thread
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {/* ── EVIDENCE & AUDIT ──────────────────────────────────────────────── */}
      <aside data-density="detail" className="hidden min-h-0 xl:block">
        <EvidencePanel turn={inspected} pack={pack} />
      </aside>
    </div>
  )
}

// ── briefing rail ───────────────────────────────────────────────────────────

function BriefingHeader({ pack, deepened, count }: { pack: any; deepened: boolean; count: number }) {
  const tier = pack.coverage.tier as 'market' | 'partial' | 'preview'
  const tone = tier === 'market' ? '#0E9F6E' : tier === 'partial' ? '#D98005' : '#8C8273'
  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white px-3.5 py-3 shadow-[0_1px_2px_rgba(40,30,15,0.03)]">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-500">Standing briefing</span>
        <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
          style={{ background: `${tone}14`, color: tone }}>
          {tier === 'market' ? 'Market data' : tier === 'partial' ? 'Covered scope' : 'Preview'}
        </span>
      </div>
      <div className="font-display mt-1 text-[15px] font-bold leading-tight text-ink-100">{pack.name}</div>
      <div className="mt-1.5 flex items-center gap-1.5 text-[10.5px] text-ink-500">
        <span className={`h-1.5 w-1.5 rounded-full ${deepened ? 'bg-safe' : 'animate-pulse bg-brand-400'}`} />
        {count} finding{count === 1 ? '' : 's'} · {deepened ? 'full scan' : 'scanning deeper…'}
      </div>
    </div>
  )
}

function FindingCard({ f, onAsk, busy }: { f: Finding; onAsk: () => void; busy: boolean }) {
  const sev = SEV[f.severity]
  const [open, setOpen] = useState(false)
  // The analyst framing is opt-in and on-demand: the engine's half of the
  // finding is complete without it, and a model call per card on every load
  // would be spend nobody asked for.
  const [take, setTake] = useState<string | null>(null)
  const [taking, setTaking] = useState(false)

  const askTake = () => {
    if (taking || take != null) return
    setTaking(true); setTake('')
    void streamCopilotTake(findingForLLM(f), {
      onDelta: (t) => setTake((v) => (v ?? '') + t),
      onError: (m) => { setTake(m); setTaking(false) },
      onDone: () => setTaking(false),
    })
  }

  return (
    <div className={`rounded-2xl border bg-white shadow-[0_1px_2px_rgba(40,30,15,0.03)] transition ${open ? 'border-brand/25' : 'border-black/[0.06] hover:border-brand/20'}`}>
      <button onClick={() => setOpen((v) => !v)} className="block w-full px-3.5 py-3 text-left">
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: sev.hex }} />
          <span className="flex-1 text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: sev.hex }}>{f.category}</span>
          <Icon name="chevron" size={11} className={`shrink-0 text-ink-500 transition-transform ${open ? 'rotate-90' : ''}`} />
        </div>
        <div className="mt-1.5 text-[12.5px] font-semibold leading-snug text-ink-100">{f.headline}</div>
        {!open && <div className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-ink-400">{f.situation}</div>}
      </button>

      <div className="px-3.5 pb-3">
        {open && (
          <div className="mb-2.5 space-y-2">
            <p className="text-[11px] leading-relaxed text-ink-300">{f.situation}</p>
            <p className="text-[11px] leading-relaxed text-ink-500">{f.why}</p>
            <div className="space-y-1">
              {f.metrics.map((m) => (
                <div key={m.label} className="flex items-baseline justify-between gap-2 border-t border-black/[0.05] pt-1">
                  <span className="text-[10px] text-ink-500">{m.label}</span>
                  <span className="num text-[11px] font-bold text-ink-100">{m.value}</span>
                </div>
              ))}
            </div>
            <div className="rounded-lg bg-black/[0.025] px-2.5 py-2 text-[10.5px] leading-relaxed text-ink-300">
              <b className="text-ink-200">Recommendation.</b> {f.recommendation}
            </div>
            {take == null ? (
              <button onClick={askTake} className="inline-flex items-center gap-1 text-[10px] font-bold text-brand hover:underline">
                <Icon name="spark" size={10} /> AiRE’s take
              </button>
            ) : (
              <div className="rounded-lg border border-brand/20 bg-brand/[0.04] px-2.5 py-2 text-[10.5px] italic leading-relaxed text-ink-300">
                {take || 'Framing the finding…'}{taking && <span className="not-italic text-brand">▍</span>}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-1.5">
          {!open && (
            <div className="flex min-w-0 flex-1 flex-wrap gap-1">
              {f.metrics.slice(0, 2).map((m) => (
                <span key={m.label} className="num rounded-md bg-black/[0.03] px-1.5 py-0.5 text-[9.5px] font-semibold text-ink-400">
                  {m.label} <b className="text-ink-200">{m.value}</b>
                </span>
              ))}
            </div>
          )}
          <button onClick={onAsk} disabled={busy}
            className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-lg bg-brand/[0.08] px-2 py-1 text-[10px] font-bold text-brand transition hover:bg-brand/[0.14] disabled:opacity-50">
            Ask AiRE <Icon name="arrow-right" size={10} />
          </button>
        </div>
      </div>
    </div>
  )
}

function Capabilities() {
  const groups = useMemo(() => {
    const by = new Map<string, string[]>()
    for (const s of Object.values(SPEC_BY_NAME)) {
      if (s.group === 'workspace') continue
      by.set(s.group, [...(by.get(s.group) ?? []), s.label])
    }
    return [...by.entries()]
  }, [])
  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white/70 px-3.5 py-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-500">Grounded in</div>
      <div className="mt-2 space-y-1.5">
        {groups.map(([g, labels]) => (
          <div key={g} className="flex items-start gap-2 text-[10.5px] text-ink-400">
            <Icon name={GROUP_ICON[g] ?? 'dot'} size={12} className="mt-px shrink-0 text-brand/60" />
            <span className="capitalize"><b className="text-ink-300">{g}</b> · {labels.length} tool{labels.length === 1 ? '' : 's'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── landing ─────────────────────────────────────────────────────────────────

function Landing({ pack, market, findings, onAsk, input, setInput, busy }: {
  pack: any; market?: Finding; findings: Finding[]; onAsk: (t?: string) => void
  input: string; setInput: (v: string) => void; busy: boolean
}) {
  const suggestions: { icon: IconName; text: string }[] = useMemo(() => {
    const breach = findings.find((f) => f.category === 'Breach')
    const first = breach?.maker?.split(' ')[0]
    return [
      { icon: 'target', text: first ? `Cheapest way to get ${first} under the line` : `Who is closest to breaching in ${pack.name}?` },
      { icon: 'activity', text: `How likely is a fine in ${pack.name}, and what should we provision?` },
      { icon: 'trending', text: `Forecast ${pack.name} to ${pack.years[pack.years.length - 1]}` },
      { icon: 'scale', text: `Where is our headroom, and what is it worth?` },
    ]
  }, [findings, pack])

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto py-6 animate-slidein">
      <Orb />
      <div className="mt-6 text-center">
        <div className="text-[13px] font-semibold text-ink-400">{greeting()}.</div>
        <h1 className="font-display mt-1 text-[30px] font-extrabold leading-[1.08] tracking-[-0.03em] text-ink-100 sm:text-[34px]">
          Your <span className="text-brand">{pack.name}</span> co-pilot.
        </h1>
        <p className="mx-auto mt-3 max-w-[54ch] text-[13.5px] leading-relaxed text-ink-500">
          Ask anything about the market. Every figure comes back from the live engine with its working attached — and I can take you to the answer, or propose the change that gets you there.
        </p>
      </div>

      {market && (
        <button onClick={() => onAsk(market.ask)} disabled={busy}
          className="group mt-7 flex w-full max-w-[580px] items-center gap-3 rounded-2xl border border-black/[0.06] bg-white px-4 py-3 text-left shadow-[0_1px_2px_rgba(40,30,15,0.03)] transition hover:border-brand/30 hover:shadow-card">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400/60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-400" />
          </span>
          <span className="min-w-0 flex-1 text-[12.5px] text-ink-300">{market.headline}</span>
          <span className="shrink-0 text-[11px] font-semibold text-brand opacity-0 transition group-hover:opacity-100">Brief me →</span>
        </button>
      )}

      <GuidedPathLauncher />

      <PromptBar value={input} onChange={setInput} onSend={() => onAsk()} busy={busy}
        placeholder={`Ask AiRE about ${pack.name}…`} className="mt-5 w-full max-w-[620px]" />

      <div className="mt-6 grid w-full max-w-[620px] grid-cols-1 gap-2 sm:grid-cols-2">
        {suggestions.map((s) => (
          <button key={s.text} onClick={() => onAsk(s.text)} disabled={busy}
            className="group flex items-center gap-2.5 rounded-xl border border-black/[0.06] bg-white/70 px-3 py-2.5 text-left text-[12.5px] text-ink-300 transition hover:border-brand/30 hover:bg-white hover:text-ink-100">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-black/[0.03] text-ink-400 transition group-hover:bg-brand/10 group-hover:text-brand">
              <Icon name={s.icon} size={13} />
            </span>
            {s.text}
          </button>
        ))}
      </div>

      <div className="mt-7 text-[10px] text-ink-500/70">Claude Opus 5 · engine-grounded · every answer auditable</div>
    </div>
  )
}

function Orb() {
  return (
    <div className="relative h-[70px] w-[70px]">
      <div aria-hidden className="absolute -inset-5 rounded-full blur-2xl" style={{ background: 'radial-gradient(circle at 50% 42%, rgba(232,34,59,0.5), transparent 68%)' }} />
      <div className="relative h-[70px] w-[70px] rounded-full" style={{ background: 'radial-gradient(circle at 34% 28%, #FF7B81 0%, #E8223B 52%, #7A0E1C 100%)', boxShadow: 'inset -6px -8px 18px rgba(0,0,0,0.38), inset 5px 5px 12px rgba(255,255,255,0.28)' }} />
      <div aria-hidden className="absolute left-[28%] top-[20%] h-4 w-5 rounded-full bg-white/70 blur-[3px]" />
      <div aria-hidden className="absolute inset-0 rounded-full ring-1 ring-inset ring-white/10" />
    </div>
  )
}

// ── conversation ────────────────────────────────────────────────────────────

function UserTurn({ turn }: { turn: Turn }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[74%] rounded-2xl rounded-br-md bg-ink-100 px-4 py-2.5 text-[13.5px] font-medium leading-relaxed text-white shadow-[0_6px_18px_-10px_rgba(40,30,15,0.4)]">
        {turn.content}
      </div>
    </div>
  )
}

function AssistantTurn({ turn, pack, activity, selected, onInspect }: {
  turn: Turn; pack: any; activity: string | null; selected: boolean; onInspect: () => void
}) {
  const approve = useCopilot((s) => s.approve)
  const approveAll = useCopilot((s) => s.approveAll)
  const dismiss = useCopilot((s) => s.dismiss)
  const [showThinking, setShowThinking] = useState(false)

  const position = useMemo(() => {
    const call = [...turn.tools].reverse().find((t) => t.ok && t.name === 'get_position' && t.value)
    return call?.value as any | undefined
  }, [turn.tools])
  const staged = turn.actions.filter((a) => a.state === 'staged')

  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl text-white"
        style={{ background: 'radial-gradient(circle at 34% 28%, #FF7B81, #E8223B 72%)', boxShadow: 'inset -2px -3px 6px rgba(0,0,0,0.32), 0 4px 12px -4px rgba(232,34,59,0.4)' }}>
        <Icon name="spark" size={15} />
      </span>

      <div className={`min-w-0 flex-1 rounded-2xl rounded-tl-md border bg-white px-[18px] py-3.5 transition ${selected ? 'border-brand/25 shadow-[0_1px_2px_rgba(40,30,15,0.03),0_18px_44px_-30px_rgba(232,34,59,0.35)]' : 'border-black/[0.06] shadow-[0_1px_2px_rgba(40,30,15,0.03),0_18px_44px_-30px_rgba(120,90,50,0.28)]'}`}>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-500">AiRE</span>
          {turn.thinking.trim() && (
            <button onClick={() => setShowThinking((v) => !v)}
              className="inline-flex items-center gap-1 text-[10px] font-semibold text-ink-500 transition hover:text-brand">
              <Icon name="chevron" size={10} className={`transition-transform ${showThinking ? 'rotate-90' : ''}`} />
              Reasoning
            </button>
          )}
        </div>

        {showThinking && turn.thinking.trim() && (
          <div className="mb-3 rounded-xl border border-black/[0.05] bg-black/[0.015] px-3 py-2 text-[11.5px] italic leading-relaxed text-ink-400">
            {turn.thinking}
          </div>
        )}

        {turn.tools.length > 0 && <ToolTrace tools={turn.tools} />}

        {turn.content.trim()
          ? <RichText text={turn.content} />
          : turn.status === 'streaming' && (
            <div className="flex items-center gap-2 py-0.5">
              <span className="inline-flex gap-1">
                {[0, 1, 2].map((d) => <span key={d} className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand/50" style={{ animationDelay: `${d * 150}ms` }} />)}
              </span>
              <span className="text-[11.5px] text-ink-500">{activity ? toolLabel(activity) : 'Reading the engine'}…</span>
            </div>
          )}

        {position && <PositionEvidence v={position} />}

        {staged.length > 0 && (
          <div className="mt-3.5 rounded-xl border border-accentblue/25 bg-accentblue/[0.05] p-2.5">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-accentblue">
                <Icon name="sliders" size={11} /> {staged.length} change{staged.length === 1 ? '' : 's'} proposed
              </span>
              {staged.length > 1 && (
                <button onClick={() => approveAll(turn.id)} className="text-[10.5px] font-bold text-accentblue hover:underline">Apply all</button>
              )}
            </div>
            <div className="space-y-1.5">
              {turn.actions.map((a, i) => a.state === 'staged' && (
                <ActionChip key={i} staged={a} onApprove={() => approve(turn.id, i)} onDismiss={() => dismiss(turn.id, i)} />
              ))}
            </div>
          </div>
        )}
        {turn.actions.some((a) => a.state === 'applied') && (
          <div className="mt-2 inline-flex items-center gap-1.5 text-[10.5px] font-semibold text-safe">
            <Icon name="check" size={11} /> {turn.actions.filter((a) => a.state === 'applied').length} change{turn.actions.filter((a) => a.state === 'applied').length === 1 ? '' : 's'} applied to the workspace
          </div>
        )}

        {turn.status === 'error' && (
          <div className="mt-2 rounded-lg border border-danger/40 bg-danger/[0.08] px-3 py-2 text-[11.5px] text-danger">
            {turn.error}
            {/ANTHROPIC_API_KEY/i.test(turn.error ?? '') && <span className="text-ink-500"> · set the key on the server; the workspace, the engine and every chart keep working without it.</span>}
          </div>
        )}

        {turn.status !== 'streaming' && turn.tools.length > 0 && (
          <div className="mt-3 flex items-center justify-between border-t border-black/[0.05] pt-2 text-[10px] text-ink-500">
            <span>{turn.tools.length} engine call{turn.tools.length === 1 ? '' : 's'} · {turn.model ?? 'Claude Opus 5'}</span>
            <button onClick={onInspect} className="inline-flex items-center gap-1 font-semibold text-ink-400 transition hover:text-brand">
              <Icon name="shield" size={11} /> Evidence
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function ToolTrace({ tools }: { tools: ToolCall[] }) {
  return (
    <div className="mb-2.5 flex flex-wrap gap-1.5">
      {tools.map((t) => (
        <span key={t.id}
          className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
            t.running ? 'border-brand/25 bg-brand/[0.06] text-brand'
              : t.ok ? 'border-black/[0.07] bg-black/[0.025] text-ink-400'
                : 'border-danger/30 bg-danger/[0.07] text-danger'}`}>
          {t.running
            ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />
            : <Icon name={t.ok ? 'check' : 'alert'} size={10} />}
          {toolLabel(t.name)}
          {!t.running && t.ms != null && <span className="num font-normal opacity-60">{t.ms}ms</span>}
        </span>
      ))}
    </div>
  )
}

function ActionChip({ staged, onApprove, onDismiss }: { staged: StagedAction; onApprove: () => void; onDismiss: () => void }) {
  const a = staged.action
  const parts: string[] = []
  if (a.country) parts.push(a.country)
  if (a.screen) parts.push(`open ${SCREEN_LABEL[a.screen] ?? a.screen}`)
  if (a.parent) parts.push(a.parent.split(' ').slice(0, 2).join(' '))
  if (a.year != null) parts.push(String(a.year))
  if (a.evSharePct != null) parts.push(`ZE ${a.evSharePct}%`)
  if (a.massShiftKg != null) parts.push(`mass ${a.massShiftKg > 0 ? '+' : ''}${a.massShiftKg}kg`)
  if (a.salesMultiplier != null) parts.push(`volume ×${a.salesMultiplier}`)
  if (a.ecoBoostG != null) parts.push(`eco ${a.ecoBoostG}`)
  if (a.creditPrice != null) parts.push(`credit ${a.creditPrice}`)
  return (
    <div className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-1.5">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11.5px] font-semibold text-ink-100">{parts.join(' · ') || 'Update the workspace'}</div>
        {a.why && <div className="truncate text-[10px] text-ink-500">{a.why}</div>}
      </div>
      <button onClick={onApprove} className="shrink-0 rounded-md bg-accentblue px-2 py-1 text-[10.5px] font-bold text-white transition hover:brightness-110">Apply</button>
      <button onClick={onDismiss} aria-label="Dismiss" className="shrink-0 text-ink-500 transition hover:text-danger"><Icon name="close" size={13} /></button>
    </div>
  )
}

function PromptBar({ value, onChange, onSend, busy, placeholder, className = '' }: {
  value: string; onChange: (v: string) => void; onSend: () => void; busy: boolean; placeholder: string; className?: string
}) {
  const stop = useCopilot((s) => s.stop)
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSend() }} className={`relative ${className}`}>
      <Icon name="spark" size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-brand/80" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full rounded-2xl border border-black/[0.08] bg-white py-4 pl-12 pr-16 text-[14px] text-ink-100 shadow-[0_8px_30px_-14px_rgba(60,45,20,0.22)] outline-none transition placeholder:text-ink-500 focus:border-brand/40 focus:shadow-[0_10px_40px_-14px_rgba(232,34,59,0.28)]" />
      {busy ? (
        <button type="button" onClick={stop} aria-label="Stop"
          className="absolute right-2.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-xl border border-black/10 bg-white text-ink-300 transition hover:text-danger">
          <span className="h-2.5 w-2.5 rounded-[2px] bg-current" />
        </button>
      ) : (
        <button type="submit" disabled={!value.trim()} aria-label="Ask AiRE"
          className="absolute right-2.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-xl bg-brand text-white transition hover:bg-brand/90 disabled:opacity-40">
          <Icon name="arrow-up" size={16} />
        </button>
      )}
    </form>
  )
}

// ── evidence & audit ────────────────────────────────────────────────────────

function EvidencePanel({ turn, pack }: { turn?: Turn; pack: any }) {
  const [open, setOpen] = useState<string | null>(null)
  const calls = (turn?.tools ?? []).filter((t) => !t.running)
  const prov = calls.find((c) => c.provenance)?.provenance

  const exportTrail = () => {
    if (!turn) return
    const all = useCopilot.getState().turns
    const question = all[all.findIndex((t) => t.id === turn.id) - 1]?.content
    const blob = new Blob([JSON.stringify({
      market: pack.name, question, answer: turn.content,
      model: turn.model, at: new Date(turn.at).toISOString(),
      usage: turn.usage,
      evidence: calls.map((c) => ({ tool: c.name, ok: c.ok, inputs: c.inputs, ms: c.ms, provenance: c.provenance, result: c.value, error: c.error })),
      actionsProposed: turn.actions.map((a) => ({ ...a.action, state: a.state })),
    }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `aire-evidence-${new Date(turn.at).toISOString().slice(0, 19).replace(/[:T]/g, '')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-[0_1px_2px_rgba(40,30,15,0.03)]">
      <header className="flex items-center justify-between border-b border-black/[0.06] px-4 py-3">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-500">
          <Icon name="shield" size={12} className="text-brand" /> Evidence
        </span>
        {calls.length > 0 && (
          <button onClick={exportTrail} className="inline-flex items-center gap-1 text-[10px] font-semibold text-ink-400 transition hover:text-brand">
            <Icon name="upload" size={11} /> Export
          </button>
        )}
      </header>

      {!calls.length ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-black/[0.03] text-ink-500"><Icon name="shield" size={20} /></span>
          <p className="mt-3 text-[12px] font-semibold text-ink-300">The working, not just the answer</p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-ink-500">
            Every tool AiRE calls appears here with its inputs, its timing and the dataset it read — so any figure in the answer can be re-run and defended.
          </p>
        </div>
      ) : (
        <>
          {prov && (
            <div className="border-b border-black/[0.05] bg-[#FBF8F2] px-4 py-2.5">
              <div className="grid grid-cols-2 gap-y-1.5">
                <Fact label="Rule pack" value={pack.name} />
                <Fact label="Basis" value={prov.basis} />
                <Fact label="Dataset" value={prov.dataVersion} />
                <Fact label="Coverage" value={prov.coverage} tone={prov.coverage === 'preview' ? '#D98005' : undefined} />
              </div>
              {prov.refreshed && <div className="mt-1.5 text-[9.5px] text-ink-500">Refreshed {prov.refreshed} · {prov.source}</div>}
            </div>
          )}
          <div className="min-h-0 flex-1 divide-y divide-black/[0.05] overflow-y-auto">
            {calls.map((c) => (
              <div key={c.id}>
                <button onClick={() => setOpen(open === c.id ? null : c.id)}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition hover:bg-black/[0.015]">
                  <Icon name={c.ok ? 'check' : 'alert'} size={12} className={c.ok ? 'shrink-0 text-safe' : 'shrink-0 text-danger'} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11.5px] font-semibold text-ink-200">{toolLabel(c.name)}</span>
                    <span className="num block truncate text-[10px] text-ink-500">{summarise(c)}</span>
                  </span>
                  {c.ms != null && <span className="num shrink-0 text-[9.5px] text-ink-500">{c.ms}ms</span>}
                  <Icon name="chevron" size={11} className={`shrink-0 text-ink-500 transition-transform ${open === c.id ? 'rotate-90' : ''}`} />
                </button>
                {open === c.id && (
                  <div className="space-y-2 bg-black/[0.015] px-4 pb-3 pt-1">
                    <Block label={`${c.name} · inputs`} json={c.inputs} />
                    <Block label={c.ok ? 'engine result' : 'error'} json={c.ok ? c.value : c.error} />
                  </div>
                )}
              </div>
            ))}
          </div>
          {turn?.usage && (
            <footer className="border-t border-black/[0.05] px-4 py-2 text-[9.5px] text-ink-500">
              {calls.length} engine call{calls.length === 1 ? '' : 's'} · {fmtInt(turn.usage.input)} in / {fmtInt(turn.usage.output)} out tokens
              {turn.usage.cacheRead > 0 && <> · {fmtInt(turn.usage.cacheRead)} cached</>}
            </footer>
          )}
        </>
      )}
    </div>
  )
}

function Fact({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className="text-[8.5px] font-bold uppercase tracking-wide text-ink-500">{label}</div>
      <div className="truncate text-[11px] font-semibold capitalize" style={{ color: tone ?? '#2E2A22' }}>{value}</div>
    </div>
  )
}

function Block({ label, json }: { label: string; json: unknown }) {
  return (
    <div>
      <div className="mb-1 text-[9px] font-bold uppercase tracking-wide text-ink-500">{label}</div>
      <pre className="max-h-52 overflow-auto rounded-lg border border-black/[0.06] bg-white px-2.5 py-2 font-mono text-[10px] leading-relaxed text-ink-300">
        {JSON.stringify(json, null, 2)}
      </pre>
    </div>
  )
}

/** One line naming what a call actually asked for — the audit trail's index. */
function summarise(c: ToolCall): string {
  if (!c.ok) return c.error?.message?.slice(0, 90) ?? 'failed'
  const i = (c.inputs ?? {}) as Record<string, unknown>
  const bits = [i.country, i.maker ?? i.target, i.year].filter(Boolean).map(String)
  return bits.join(' · ') || c.name
}

// ── engine-grounded position card ───────────────────────────────────────────

function PositionEvidence({ v }: { v: any }) {
  if (!v || v.avgMetric == null || v.limit == null) return null
  const over = (v.gap ?? 0) > 0
  const hex = over ? '#E0484D' : '#0E9F6E'
  const scaleMax = Math.max(v.avgMetric, v.limit, 1) * 1.14
  const fleetPct = Math.min(100, (v.avgMetric / scaleMax) * 100)
  const limitPct = Math.min(100, (v.limit / scaleMax) * 100)
  const exposure = v.fine ?? v.marketFine ?? 0
  return (
    <div className="mt-3.5 overflow-hidden rounded-2xl border border-black/[0.06] bg-[#FBF8F2]">
      <div className="flex items-center justify-between border-b border-black/[0.05] px-4 py-2.5">
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-500">
          <Icon name="gauge" size={12} className="shrink-0 text-brand" />
          <span className="truncate">{String(v.entity ?? '').split(' ').slice(0, 3).join(' ')} · {v.year}</span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${hex}14`, color: hex }}>
          <Icon name={over ? 'alert' : 'check'} size={10} /> {over ? 'Over' : 'Under'}
        </span>
      </div>
      <div className="grid gap-4 p-4 sm:grid-cols-[1.5fr_1fr]">
        <div>
          <div className="relative h-2.5 rounded-full bg-black/[0.06]">
            <div className="absolute inset-y-0 left-0 rounded-full transition-all" style={{ width: `${fleetPct}%`, background: hex }} />
            <div className="absolute w-[2px] rounded" style={{ left: `${limitPct}%`, background: '#1C1812', height: '18px', top: '-4px' }} title="the line" />
          </div>
          <div className="mt-2.5 flex items-center justify-between text-[11px]">
            <span className="num text-ink-400">fleet <b className="text-ink-100">{fmtNum(v.avgMetric, 1)}</b> {v.unit}</span>
            <span className="num text-ink-400">line {fmtNum(v.limit, 1)}</span>
          </div>
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-[10px] text-ink-500">
              <span>Zero-emission share</span><span className="num font-bold text-ink-300">{v.zeroEmissionSharePct}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-black/[0.06]">
              <div className="h-full rounded-full bg-safe" style={{ width: `${Math.min(100, v.zeroEmissionSharePct ?? 0)}%` }} />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-1 sm:border-l sm:border-black/[0.06] sm:pl-4">
          <Cell label="Gap" value={`${v.gap > 0 ? '+' : ''}${fmtNum(v.gap, 1)} ${v.unit}`} tone={hex} />
          <Cell label={v.makers ? 'Market exposure' : 'Exposure'} value={exposure > 0 ? fmtMoney(exposure, v.currency) : '—'} tone={exposure > 0 ? hex : undefined} />
          <Cell label={v.makers ? 'Makers over' : 'Registrations'} value={v.makers ? `${v.makersOver} of ${v.makers}` : fmtInt(v.registrations)} />
        </div>
      </div>
    </div>
  )
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className="text-[9px] font-semibold uppercase tracking-wide text-ink-500">{label}</div>
      <div className="dnum mt-0.5 text-[13.5px] font-bold" style={{ color: tone ?? '#1C1812' }}>{value}</div>
    </div>
  )
}

// ── answer typography — light markdown (bold · code · bullets · headings) ────

function inline(t: string): (JSX.Element | string)[] {
  return t.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={i} className="font-bold text-ink-100">{p.slice(2, -2)}</strong>
    if (p.startsWith('`') && p.endsWith('`')) return <code key={i} className="num rounded-md bg-brand/[0.08] px-1.5 py-0.5 text-[12.5px] font-bold text-brand">{p.slice(1, -1)}</code>
    return <span key={i}>{p}</span>
  })
}

function RichText({ text }: { text: string }) {
  const blocks: JSX.Element[] = []
  let list: string[] = []
  const flush = (k: string) => {
    if (!list.length) return
    const items = list
    blocks.push(
      <ul key={k} className="my-1 space-y-1.5">
        {items.map((li, i) => (
          <li key={i} className="flex gap-2.5 text-[13.5px] leading-[1.6] text-ink-200">
            <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand/60" />{inline(li)}
          </li>
        ))}
      </ul>,
    )
    list = []
  }
  text.split('\n').forEach((ln, i) => {
    const t = ln.trim()
    if (/^([-*•]|\d+[.)])\s+/.test(t)) { list.push(t.replace(/^([-*•]|\d+[.)])\s+/, '')); return }
    flush('u' + i)
    if (!t) return
    if (/^#{1,3}\s+/.test(t)) {
      blocks.push(<div key={i} className="mt-2 font-display text-[14px] font-bold text-ink-100">{inline(t.replace(/^#{1,3}\s+/, ''))}</div>)
      return
    }
    blocks.push(<p key={i} className="text-[13.5px] leading-[1.65] text-ink-200">{inline(t)}</p>)
  })
  flush('uend')
  return <div className="space-y-2">{blocks}</div>
}
