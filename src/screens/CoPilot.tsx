// ───────────────────────────────────────────────────────────────────────────
// COMPLIANCE CO-PILOT — the platform's AI command center.
//
// A grounded, conversational front door: ask anything about the active market
// and AiRE answers with numbers the deterministic engine computes (via tool use
// in /api/ask, Claude Opus 4.8) — and it can DRIVE the workspace: set the maker,
// open Plan / Scenario / Forecast / Credit book, apply levers. It opens on a
// live briefing of the market (engine-scanned findings), so you start from what
// actually needs attention. The model never invents a figure.
// ───────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from 'react'
import { useCompliance } from '../lib/useCompliance'
import { useStore } from '../state/store'
import { ask, applyActions, type ChatMessage, type DashboardAction } from '../lib/assistant'
import { runCoPilot, type Severity } from '../engine/copilot'
import { fmtMoney } from '../engine/engine'
import Icon, { type IconName } from '../components/Icon'

type Msg = ChatMessage & { nav?: DashboardAction | null }

const greeting = (): string => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening' }
const SCREEN_LABEL: Record<string, string> = { analyse: 'Plan', forecast: 'Forecast', scenario: 'Scenario', model: 'Scenario', under: 'Action plan', compare: 'Compare', creditbook: 'Credit book', pricing: 'Pricing', pooling: 'Pooling', data: 'Data', intel: 'Intelligence' }
const SEV: Record<Severity, string> = { critical: '#E0484D', high: '#D98005', watch: '#3B6FE0', clear: '#0E9F6E' }

export default function CoPilot() {
  const { pack, country, tree } = useCompliance('actuals')
  const findings = useMemo(() => runCoPilot(country), [country]) // eslint-disable-line react-hooks/exhaustive-deps
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }, [msgs, busy])

  // ── engine-grounded market briefing ──────────────────────────────────────
  const makers = (tree.children ?? []).filter((c) => c.rawUnits > 0)
  const over = makers.filter((c) => c.status === 'fine')
  const marketFine = makers.reduce((a, c) => a + c.fine, 0)
  const worst = [...over].sort((a, b) => b.fine - a.fine)[0]
  const worstName = worst?.label
  const first = worstName ? worstName.split(' ')[0] : (makers[0]?.label.split(' ')[0] ?? 'the market')

  const suggestions = useMemo(() => [
    { icon: 'alert' as IconName, text: worstName ? `Why is ${first} over the line?` : `Where is ${pack.name} exposed?` },
    { icon: 'target' as IconName, text: worstName ? `Cheapest way to get ${first} under the line` : `Who's closest to breaching?` },
    { icon: 'trending' as IconName, text: `Forecast ${pack.name} to 2030` },
    { icon: 'scale' as IconName, text: worstName ? `How many credits does ${first} generate at 50% EV?` : `What clears the market fastest?` },
  ], [worstName, first, pack.name])

  const send = async (text?: string) => {
    const q = (text ?? input).trim()
    if (!q || busy) return
    setInput(''); setError(null)
    const next: Msg[] = [...msgs, { role: 'user', content: q }]
    setMsgs(next); setBusy(true)
    try {
      const { answer, actions } = await ask(q, msgs)
      // Apply scope/lever changes immediately; hold any NAVIGATION as a button so
      // the conversation isn't yanked away mid-thought.
      const dataActions = (actions ?? []).filter((a) => !a.screen)
      if (dataActions.length) applyActions(dataActions)
      setMsgs([...next, { role: 'assistant', content: answer || 'Done.', nav: actions?.find((a) => a.screen) ?? null }])
    } catch (e: any) {
      setError(e?.message || 'Something went wrong.')
      setMsgs(next)
    }
    setBusy(false)
  }

  const started = msgs.length > 0

  return (
    <div className="mx-auto flex h-[calc(100vh-7.5rem)] max-w-[860px] flex-col">
      {!started ? (
        // ── LANDING ────────────────────────────────────────────────────────
        <div className="flex flex-1 flex-col items-center justify-center pb-6 animate-slidein">
          <Orb />
          <div className="mt-6 text-center">
            <div className="text-[13px] font-semibold text-ink-400">{greeting()}.</div>
            <h1 className="font-display mt-1 text-[30px] font-extrabold leading-[1.08] tracking-[-0.03em] text-ink-100 sm:text-[35px]">
              Your <span className="text-brand">{pack.name}</span> co-pilot.
            </h1>
            <p className="mx-auto mt-3 max-w-[50ch] text-[13.5px] leading-relaxed text-ink-500">
              Ask anything about the market. Every number comes from the live engine — and I can take you to the answer: set a maker, open Plan, model a scenario, or forecast it.
            </p>
          </div>

          {/* live briefing */}
          {makers.length > 0 && (
            <button onClick={() => send(worstName ? `Brief me on ${pack.name}: who's over the line and what's the exposure?` : `Give me a compliance briefing for ${pack.name}.`)}
              className="group mt-7 flex w-full max-w-[560px] items-center gap-3 rounded-2xl border border-black/[0.06] bg-white px-4 py-3 text-left shadow-[0_1px_2px_rgba(40,30,15,0.03)] transition hover:border-brand/30 hover:shadow-card">
              <span className="relative flex h-2 w-2 shrink-0"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400/60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-brand-400" /></span>
              <span className="min-w-0 flex-1 text-[12.5px] text-ink-300">
                {over.length > 0
                  ? <><b className="text-ink-100">{over.length} of {makers.length}</b> makers over the line in {pack.name} · <b className="text-danger">{fmtMoney(marketFine, pack.currency)}</b> at risk</>
                  : <>Every maker is under the line in {pack.name} — <b className="text-safe">no fine</b> this year</>}
              </span>
              <span className="shrink-0 text-[11px] font-semibold text-brand opacity-0 transition group-hover:opacity-100">Brief me →</span>
            </button>
          )}

          <PromptBar value={input} onChange={setInput} onSend={() => send()} busy={busy} placeholder={`Ask AiRE about ${pack.name}…`} className="mt-5 w-full max-w-[620px]" />

          <div className="mt-6 grid w-full max-w-[620px] grid-cols-1 gap-2 sm:grid-cols-2">
            {suggestions.map((s) => (
              <button key={s.text} onClick={() => send(s.text)}
                className="group flex items-center gap-2.5 rounded-xl border border-black/[0.06] bg-white/70 px-3 py-2.5 text-left text-[12.5px] text-ink-300 transition hover:border-brand/30 hover:bg-white hover:text-ink-100">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-black/[0.03] text-ink-400 transition group-hover:bg-brand/10 group-hover:text-brand"><Icon name={s.icon} size={13} /></span>
                {s.text}
              </button>
            ))}
          </div>

          {findings.length > 0 && (
            <div className="mt-7 w-full max-w-[620px]">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-500">Needs attention in {pack.name}</div>
              <div className="divide-y divide-black/[0.05] overflow-hidden rounded-2xl border border-black/[0.06] bg-white">
                {findings.slice(0, 3).map((f) => (
                  <button key={f.id} onClick={() => send(`Tell me about: ${f.headline}. What should I do?`)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-black/[0.015]">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: SEV[f.severity] }} />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink-200">{f.headline}</span>
                    <Icon name="arrow-right" size={13} className="shrink-0 text-ink-500" />
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="mt-6 text-[10px] text-ink-500/70">Powered by Claude Opus 4.8 · every figure computed by the engine</div>
        </div>
      ) : (
        // ── CONVERSATION ───────────────────────────────────────────────────
        <>
          <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto py-4 pr-1">
            {msgs.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex items-start gap-3'}>
                {m.role === 'assistant' && <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand"><Icon name="spark" size={14} /></span>}
                <div className={m.role === 'user'
                  ? 'max-w-[75%] rounded-2xl rounded-br-md bg-ink-100 px-4 py-2.5 text-[13.5px] leading-relaxed text-white'
                  : 'max-w-[82%]'}>
                  <div className={m.role === 'assistant' ? 'whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink-200' : 'whitespace-pre-wrap'}>{m.content}</div>
                  {m.role === 'assistant' && m.nav?.screen && (
                    <button onClick={() => applyActions([m.nav!])} className="btn-primary mt-3 px-3.5 py-2 text-xs">
                      <Icon name="arrow-right" size={14} /> Open {SCREEN_LABEL[m.nav.screen] ?? m.nav.screen}
                    </button>
                  )}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex items-start gap-3">
                <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand"><Icon name="spark" size={14} /></span>
                <div className="flex items-center gap-1 pt-2"><span className="inline-flex gap-1">{[0, 1, 2].map((d) => <span key={d} className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink-400" style={{ animationDelay: `${d * 150}ms` }} />)}</span></div>
              </div>
            )}
            {error && <div className="rounded-lg border border-danger/40 bg-danger/[0.08] px-3 py-2 text-xs text-danger">{error}{/ANTHROPIC_API_KEY/i.test(error) && <span className="text-ink-500"> · set the key on the server; the workspace still works.</span>}</div>}
          </div>
          <div className="shrink-0 pb-4 pt-1">
            <PromptBar value={input} onChange={setInput} onSend={() => send()} busy={busy} placeholder={`Ask a follow-up about ${pack.name}…`} />
          </div>
        </>
      )}
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

function PromptBar({ value, onChange, onSend, busy, placeholder, className = '' }: {
  value: string; onChange: (v: string) => void; onSend: () => void; busy: boolean; placeholder: string; className?: string
}) {
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSend() }} className={`relative ${className}`}>
      <Icon name="spark" size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-brand/80" />
      <input value={value} onChange={(e) => onChange(e.target.value)} disabled={busy} placeholder={placeholder}
        className="w-full rounded-2xl border border-black/[0.08] bg-white py-4 pl-12 pr-16 text-[14px] text-ink-100 shadow-[0_8px_30px_-14px_rgba(60,45,20,0.22)] outline-none transition placeholder:text-ink-500 focus:border-brand/40 focus:shadow-[0_10px_40px_-14px_rgba(232,34,59,0.28)]" />
      <button type="submit" disabled={busy || !value.trim()} aria-label="Ask AiRE"
        className="absolute right-2.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-xl bg-brand text-white transition hover:bg-brand/90 disabled:opacity-40">
        {busy ? <span className="inline-flex gap-0.5">{[0, 1, 2].map((d) => <span key={d} className="h-1 w-1 animate-pulse rounded-full bg-white" style={{ animationDelay: `${d * 150}ms` }} />)}</span> : <Icon name="arrow-up" size={16} />}
      </button>
    </form>
  )
}
