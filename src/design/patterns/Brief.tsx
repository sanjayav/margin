// ───────────────────────────────────────────────────────────────────────────
// BRIEF — what needs you, not what happened.
//
// The screen this replaces opened with the fine: a large red number, before the
// reader had any idea what to do about it. That is a scoreboard, and a scoreboard
// is the least useful thing you can show someone who has just sat down.
//
// The benchmark for this is not a BI dashboard, it is AuditBoard: compliance work
// is ISSUES → REMEDIATION → EVIDENCE, with an audit trail of who approved what.
// So the home is a ranked list of issues the engine found, each carrying its own
// recommendation, its own traceable figures, and a way to act on it — and the
// exposure is a consequence you can reach, not the headline you are greeted with.
//
// Everything here comes from runCoPilot, which already produces exactly this and
// has never been visible.
// ───────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import type { Finding, Severity } from '../../engine/copilot'
import Icon, { type IconName } from '../../components/Icon'
import { STATUS } from '../../lib/palette'

const SEV: Record<Severity, { label: string; color: string; icon: IconName }> = {
  critical: { label: 'Act now', color: STATUS.fine, icon: 'alert' },
  high: { label: 'This week', color: '#D98005', icon: 'clock' },
  watch: { label: 'Watch', color: '#3B6FE0', icon: 'activity' },
  clear: { label: 'Opportunity', color: STATUS.compliant, icon: 'spark' },
}

export default function Brief({ findings, onAsk, onAct }: {
  findings: Finding[]
  onAsk: (f: Finding) => void
  onAct: (f: Finding, optionIndex: number) => void
}) {
  const [open, setOpen] = useState<string | null>(findings[0]?.id ?? null)
  return (
    <ol className="space-y-px">
      {findings.map((f) => {
        const s = SEV[f.severity]
        const on = open === f.id
        return (
          <li key={f.id} className="group relative">
            {/* the severity rule — colour is a stripe, never a filled card, so a
                list of five issues does not read as five alarms */}
            <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] rounded-full transition-opacity"
              style={{ background: s.color, opacity: on ? 1 : 0.55 }} />
            <div className="pl-6">
              <button onClick={() => setOpen(on ? null : f.id)} aria-expanded={on}
                className="flex w-full items-start gap-4 py-4 text-left">
                <span className="mt-[3px] flex shrink-0 items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.1em]" style={{ color: s.color }}>
                  <Icon name={s.icon} size={12} /> {s.label}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14.5px] font-semibold leading-snug text-ink-100">{f.headline}</span>
                  {!on && <span className="mt-1 block truncate text-[12.5px] text-ink-500">{f.situation}</span>}
                </span>
                <span aria-hidden className={`mt-1 shrink-0 text-ink-500 transition-transform ${on ? 'rotate-90' : ''}`}>›</span>
              </button>

              {on && (
                <div className="pb-6 pr-2">
                  <p className="max-w-[74ch] text-[13px] leading-[1.65] text-ink-300">{f.situation}</p>
                  <p className="mt-2.5 max-w-[74ch] text-[12.5px] leading-[1.6] text-ink-500">{f.why}</p>

                  {!!f.metrics.length && (
                    <dl className="mt-4 flex flex-wrap gap-x-9 gap-y-3">
                      {f.metrics.map((m) => (
                        <div key={m.label}>
                          <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-500">{m.label}</dt>
                          <dd className="dnum mt-1 text-[15px] font-bold tabular-nums text-ink-100">{m.value}</dd>
                          {/* the figure names the engine call that produced it —
                              the same disclosure the Answer pattern uses */}
                          <dd className="mt-0.5 text-[10.5px] text-ink-600">via {m.tool}</dd>
                        </div>
                      ))}
                    </dl>
                  )}

                  {f.recommendation && (
                    <p className="mt-4 max-w-[74ch] border-l-2 border-black/10 pl-3 text-[12.5px] leading-relaxed text-ink-300">
                      <span className="font-semibold text-ink-100">Recommendation. </span>{f.recommendation}
                    </p>
                  )}

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {f.options.slice(0, 2).map((o, i) => (
                      <button key={o.title} onClick={() => onAct(f, i)}
                        className="rounded-lg border border-black/[0.1] bg-white px-3 py-1.5 text-[12px] font-semibold text-ink-200 transition hover:border-black/25 hover:text-ink-100">
                        {o.title}
                      </button>
                    ))}
                    <button onClick={() => onAsk(f)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-ink-100 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-ink-200">
                      <Icon name="spark" size={12} /> Ask AiRE
                    </button>
                    <span className="ml-auto text-[11px] text-ink-500">{f.category} · {f.year}</span>
                  </div>
                </div>
              )}
            </div>
            <span aria-hidden className="ml-6 block h-px bg-black/[0.06] group-last:hidden" />
          </li>
        )
      })}
    </ol>
  )
}
