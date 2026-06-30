import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import { ask, applyActions, type ChatMessage } from '../lib/assistant'
import { useCompliance } from '../lib/useCompliance'

const STARTERS = [
  'Why is my fleet over the line this year?',
  'Show me the cheapest way under the line',
  'What happens to the fine at 60% electric?',
  'Compare all makers in this market',
]

export default function Assistant() {
  const { pack, selectedParent } = useCompliance()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [input, setInput] = useState('')
  const [msgs, setMsgs] = useState<ChatMessage[]>([])
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [msgs, busy])

  async function send(text: string) {
    const q = text.trim()
    if (!q || busy) return
    setInput('')
    setError(null)
    const next = [...msgs, { role: 'user' as const, content: q }]
    setMsgs(next)
    setBusy(true)
    try {
      const { answer, actions } = await ask(q, msgs)
      if (actions?.length) applyActions(actions)
      setMsgs([...next, { role: 'assistant', content: answer || 'Done.' }])
    } catch (e: any) {
      setError(e.message || 'Something went wrong.')
      setMsgs(next)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {/* Launcher */}
      {!open && (
        <button onClick={() => setOpen(true)}
          className="btn-primary fixed bottom-6 right-6 z-40 shadow-glow"
          style={{ boxShadow: '0 1px 0 0 rgba(255,255,255,.35) inset, 0 14px 40px -10px rgba(61,220,151,.55)' }}>
          <Icon name="spark" size={17} /> Ask Autocred AI
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-40 flex h-[600px] max-h-[85vh] w-[440px] max-w-[92vw] flex-col overflow-hidden rounded-2xl border border-black/10 bg-ink-900/95 backdrop-blur-xl shadow-card animate-slidein">
          <header className="flex items-center justify-between border-b border-black/[0.06] px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand/15 text-brand"><Icon name="spark" size={17} /></div>
              <div>
                <div className="text-sm font-bold text-ink-100">Autocred AI analyst</div>
                <div className="text-[10px] text-ink-500">Powered by Marklytics · numbers from the live engine</div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="text-ink-500 hover:text-ink-100"><Icon name="close" size={18} /></button>
          </header>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {msgs.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm leading-relaxed text-ink-400">
                  Ask in plain English about {pack.name} compliance. I read the live data, run the engine, and can move the screen for you.
                </p>
                <div className="space-y-1.5">
                  {STARTERS.map((s) => (
                    <button key={s} onClick={() => send(s)} className="flex w-full items-center gap-2 rounded-lg border border-black/[0.07] bg-black/[0.02] px-3 py-2 text-left text-xs text-ink-300 transition hover:border-black/20 hover:text-ink-100">
                      <Icon name="arrow-right" size={13} className="text-brand" /> {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${m.role === 'user' ? 'bg-brand text-white font-medium' : 'border border-black/[0.07] bg-black/[0.03] text-ink-200'}`}>
                  {m.content}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1.5 rounded-2xl border border-black/[0.07] bg-black/[0.03] px-3.5 py-3">
                  {[0, 1, 2].map((d) => (
                    <span key={d} className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" style={{ animationDelay: `${d * 150}ms` }} />
                  ))}
                </div>
              </div>
            )}
            {error && (
              <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                {error}
                {/^\s*ANTHROPIC_API_KEY/i.test(error) && (
                  <div className="mt-1 text-ink-500">Set <span className="font-mono">ANTHROPIC_API_KEY</span> in the environment (locally: <span className="font-mono">.env</span> + restart; on Vercel: project env vars + redeploy). The sliders and charts work without it.</div>
                )}
              </div>
            )}
          </div>

          <form onSubmit={(e) => { e.preventDefault(); send(input) }} className="border-t border-black/[0.06] p-3">
            <div className="flex items-center gap-2 rounded-xl border border-black/10 bg-ink-850/70 px-3 py-2 focus-within:border-brand/30">
              <input value={input} onChange={(e) => setInput(e.target.value)} disabled={busy}
                placeholder={`Ask about ${selectedParent}…`}
                className="w-full bg-transparent text-sm text-ink-100 outline-none placeholder:text-ink-600" />
              <button type="submit" disabled={busy || !input.trim()} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand text-white transition disabled:opacity-30">
                <Icon name="arrow-up" size={15} />
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
