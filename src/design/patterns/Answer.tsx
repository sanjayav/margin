// ───────────────────────────────────────────────────────────────────────────
// ANSWER — the product's atomic unit, at three depths.
//
// Every figure in AiRE is the same object: an answer, the evidence behind it,
// and the provenance behind that. Most readers stop at the first line; the
// analyst opens the evidence; the auditor opens the provenance. All three are
// served by one component, so a number can never appear anywhere in the product
// without a path to its own working.
//
// This is the design idea, not a decoration. In most AI products the model
// produces the number, so trust is the hard problem. Here a deterministic engine
// produces it and the model only narrates — which means tool-use disclosure and
// "the defensible number" are the same feature. Expanding an answer shows the
// engine calls that computed it, their inputs, what they returned, and how long
// they took.
//
// Collapsed by default, always. The whole point is that depth is available, not
// present.
// ───────────────────────────────────────────────────────────────────────────
import { useState, type ReactNode } from 'react'
import Icon, { type IconName } from '../../components/Icon'
import { STATUS } from '../../lib/palette'

export interface EvidenceRow {
  /** What was computed — "Fleet CO₂", "Specific target", "Excess × rate × units". */
  label: string
  value: string
  /** How it was arrived at, in one line. Optional but strongly encouraged. */
  note?: string
}

export interface AnswerSource {
  /** Engine tool or dataset that produced this. */
  name: string
  /** Dataset vintage / publication. */
  vintage?: string
  /** Wall-clock, where it was a live computation. */
  ms?: number
  /** The statutory clause or file this rests on. */
  authority?: string
}

export type AnswerTone = 'good' | 'bad' | 'warn' | 'neutral'

const TONE: Record<AnswerTone, string> = {
  good: STATUS.compliant,
  bad: STATUS.fine,
  warn: '#D98005',
  neutral: '#1C1812',
}

export default function Answer({
  question, value, unit, sentence, tone = 'neutral', evidence, sources, action, dense = false,
}: {
  /** The question this answers, in the reader's words. */
  question?: string
  value: string
  unit?: string
  sentence: ReactNode
  tone?: AnswerTone
  /** Layer 2 — the computation, in the order it happened. */
  evidence?: EvidenceRow[]
  /** Layer 3 — where it came from and what it rests on. */
  sources?: AnswerSource[]
  action?: { label: string; icon?: IconName; onClick: () => void }
  dense?: boolean
}) {
  const [open, setOpen] = useState<null | 'evidence' | 'provenance'>(null)
  const hasEvidence = !!evidence?.length
  const hasSources = !!sources?.length
  const color = TONE[tone]

  return (
    <div className="rounded-xl border border-black/[0.07] bg-white/70">
      {/* Layer 1 — the answer */}
      <div className={dense ? 'px-5 py-4' : 'px-6 py-5'}>
        {question && (
          <div className="mb-2.5 text-[10.5px] font-semibold uppercase tracking-[0.13em] text-ink-500">{question}</div>
        )}
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className={`dnum font-display font-extrabold tabular-nums leading-none tracking-[-0.03em] ${dense ? 'text-[26px]' : 'text-[34px]'}`} style={{ color }}>
                {value}
              </span>
              {unit && <span className="text-[12px] text-ink-500">{unit}</span>}
            </div>
            <p className="mt-2.5 max-w-[68ch] text-[13px] leading-[1.6] text-ink-300">{sentence}</p>
          </div>
          {action && (
            <button onClick={action.onClick}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-ink-100 px-3.5 py-2 text-[12.5px] font-semibold text-white transition hover:bg-ink-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
              {action.icon && <Icon name={action.icon} size={14} />}{action.label}
            </button>
          )}
        </div>

        {(hasEvidence || hasSources) && (
          <div className="mt-4 flex items-center gap-4">
            {hasEvidence && (
              <Disclose on={open === 'evidence'} onClick={() => setOpen(open === 'evidence' ? null : 'evidence')}
                icon="scatter" label={`How this was computed`} count={evidence!.length} />
            )}
            {hasSources && (
              <Disclose on={open === 'provenance'} onClick={() => setOpen(open === 'provenance' ? null : 'provenance')}
                icon="shield" label="Where it came from" count={sources!.length} />
            )}
          </div>
        )}
      </div>

      {/* Layer 2 — the computation, in the order it happened */}
      {open === 'evidence' && hasEvidence && (
        <div className="border-t border-black/[0.06] px-6 py-4">
          <ol className="space-y-2.5">
            {evidence!.map((e, i) => (
              <li key={e.label} className="flex items-baseline gap-3">
                <span className="dnum w-4 shrink-0 text-[10.5px] tabular-nums text-ink-600">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="text-[12.5px] text-ink-300">{e.label}</span>
                  {e.note && <span className="block text-[11.5px] leading-snug text-ink-500">{e.note}</span>}
                </span>
                <span className="dnum shrink-0 text-[12.5px] font-semibold tabular-nums text-ink-100">{e.value}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Layer 3 — provenance */}
      {open === 'provenance' && hasSources && (
        <div className="border-t border-black/[0.06] px-6 py-4">
          <ul className="space-y-2.5">
            {sources!.map((s) => (
              <li key={s.name} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11.5px]">
                <Icon name="shield" size={11} className="text-ink-500" />
                <span className="font-semibold text-ink-200">{s.name}</span>
                {s.vintage && <><span className="text-ink-600" aria-hidden>·</span><span className="text-ink-500">{s.vintage}</span></>}
                {s.ms != null && <><span className="text-ink-600" aria-hidden>·</span><span className="dnum tabular-nums text-ink-500">{s.ms} ms</span></>}
                {s.authority && <span className="w-full pl-4 text-ink-500">{s.authority}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function Disclose({ on, onClick, icon, label, count }: { on: boolean; onClick: () => void; icon: IconName; label: string; count: number }) {
  return (
    <button onClick={onClick} aria-expanded={on}
      className={`inline-flex items-center gap-1.5 text-[11.5px] font-semibold transition-colors ${on ? 'text-ink-100' : 'text-ink-500 hover:text-ink-200'}`}>
      <Icon name={icon} size={12} />
      {label}
      <span className="dnum tabular-nums text-ink-600">({count})</span>
      <span aria-hidden className={`transition-transform ${on ? 'rotate-90' : ''}`}>›</span>
    </button>
  )
}
