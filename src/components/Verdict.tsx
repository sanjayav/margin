// ───────────────────────────────────────────────────────────────────────────
// VERDICT — the answer-first header every module opens with.
//
// The workspace is dense by design, and density is the right default for the
// analyst who lives in it. But a screen that opens at full density makes an
// executive reader hunt for the answer, and in a demo that hunt reads as the
// product being complicated. So each module now states its conclusion in one
// sentence and one number BEFORE any chart: what the position is, what it costs,
// and the single most useful thing to do next.
//
// Nothing here computes anything. Every figure is passed in from the same engine
// output the charts below use, so the headline can never disagree with the page.
// ───────────────────────────────────────────────────────────────────────────
import type { ReactNode } from 'react'
import Icon, { type IconName } from './Icon'

export type Tone = 'good' | 'warn' | 'bad' | 'neutral'

const TONE: Record<Tone, { text: string; dot: string; ring: string; wash: string }> = {
  good:    { text: 'text-safe',    dot: 'bg-safe',    ring: 'border-safe/25',    wash: 'bg-safe/[0.05]' },
  warn:    { text: 'text-warn',    dot: 'bg-warn',    ring: 'border-warn/25',    wash: 'bg-warn/[0.05]' },
  bad:     { text: 'text-danger',  dot: 'bg-danger',  ring: 'border-danger/25',  wash: 'bg-danger/[0.05]' },
  neutral: { text: 'text-ink-200', dot: 'bg-ink-400', ring: 'border-black/[0.07]', wash: 'bg-black/[0.015]' },
}

/** One supporting figure. Three at most — past that it stops being a headline. */
export interface VerdictStat {
  label: string
  value: string
  sub?: string
  tone?: Tone
  /** Opens the provenance drawer for this figure. Present ⇒ the value is clickable. */
  onTrace?: () => void
}

export interface VerdictProps {
  /** Eyebrow: what question this screen answers. Not the screen's name. */
  question: string
  /** The answer, as a sentence a person would say out loud. */
  headline: ReactNode
  /** The number that sentence turns on. */
  figure: string
  figureUnit?: string
  tone?: Tone
  stats?: VerdictStat[]
  /** The one thing to do next. Rendered as the only primary button on screen. */
  action?: { label: string; icon?: IconName; onClick: () => void }
  /** Where the figure came from — dataset vintage, scope, basis. */
  footnote?: ReactNode
}

export default function Verdict({
  question, headline, figure, figureUnit, tone = 'neutral', stats = [], action, footnote,
}: VerdictProps) {
  const t = TONE[tone]
  return (
    <section className={`card rise mb-5 overflow-hidden border ${t.ring} p-0`} data-testid="verdict">
      <div className={`flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:gap-8 ${t.wash}`}>
        {/* the answer */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${t.dot}`} />
            <span className="label text-ink-500">{question}</span>
          </div>
          <h2 className="font-display mt-2 text-[19px] font-bold leading-[1.28] tracking-[-0.02em] text-ink-100 lg:text-[21px]">
            {headline}
          </h2>
          {footnote && <p className="mt-2 text-[11px] leading-relaxed text-ink-500">{footnote}</p>}
        </div>

        {/* the number it turns on */}
        <div className="flex shrink-0 items-end gap-2 lg:flex-col lg:items-end lg:gap-1">
          <div className={`dnum text-[38px] font-bold leading-none tracking-[-0.02em] lg:text-[44px] ${t.text}`}>{figure}</div>
          {figureUnit && <div className="mb-1.5 text-[11.5px] font-semibold text-ink-500 lg:mb-0">{figureUnit}</div>}
        </div>

        {action && (
          <button onClick={action.onClick} className="btn-primary shrink-0 px-4 py-2.5 text-[13px]">
            {action.icon && <Icon name={action.icon} size={15} />} {action.label}
          </button>
        )}
      </div>

      {stats.length > 0 && (
        <div className="grid grid-cols-1 divide-y divide-black/[0.06] border-t border-black/[0.06] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {stats.slice(0, 3).map((s) => {
            const st = TONE[s.tone ?? 'neutral']
            return (
              <div key={s.label} className="px-5 py-3.5">
                <div className="flex items-center gap-1.5">
                  <div className="label text-ink-500">{s.label}</div>
                  {s.onTrace && (
                    <button onClick={s.onTrace} title="Where this number comes from"
                      className="text-[10px] font-semibold text-ink-500 underline decoration-dotted underline-offset-2 transition hover:text-brand">
                      trace
                    </button>
                  )}
                </div>
                <div className={`dnum mt-1 text-[19px] font-bold leading-none ${st.text}`}>{s.value}</div>
                {s.sub && <div className="mt-1 text-[11px] text-ink-500">{s.sub}</div>}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
