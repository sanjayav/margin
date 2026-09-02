/* ───────────────────────────────────────────────────────────────────────────
   Run trace, findings and the proposal card.
   ---------------------------------------------------------------------------
   This is where the product earns trust. An agent's answer is worth what its
   working is worth, so the trace shows every tool the agent opened, in order,
   with timing and provenance — and the proposal is never shown as actionable
   until the engine's re-derivation sits next to it.

   The layout deliberately puts the engine's numbers ABOVE the agent's own
   expectation. What the calculation says is the fact; what the model expected
   is context.
   ─────────────────────────────────────────────────────────────────────────── */
import React, { useState } from 'react'
import {
  Badge, Button, Callout, cx, Divider, EmptyState, Spinner, StatusDot, Tone, Tooltip, relTime,
} from '../../design/primitives'
import Icon from '../../design/icons'
import type { AgentRun, Citation, Finding, RunStep, Validation } from '../kernel'
import { SEVERITY_TONE, STATUS_LABEL, STATUS_TONE, isRunning } from '../kernel'
import { getAgent } from '../registry'

/* ── cost ─────────────────────────────────────────────────────────────────── */

/**
 * Share of this run's prompt that was read from cache rather than paid for at
 * the full input rate. Null when the run predates cache reporting, so an old
 * run shows nothing instead of a misleading 0%.
 */
function cacheHit(u: NonNullable<AgentRun['usage']>): number | null {
  const read = u.cacheReadTokens ?? 0
  const written = u.cacheWriteTokens ?? 0
  if (read + written === 0) return null
  const total = read + written + u.inputTokens
  return total > 0 ? Math.round((read / total) * 100) : null
}

/* ── citations ────────────────────────────────────────────────────────────── */

export function Citations({ items, dense }: { items?: Citation[]; dense?: boolean }) {
  if (!items?.length) return null
  return (
    <ul className={cx('flex flex-wrap gap-1.5', dense ? 'mt-1' : 'mt-2')}>
      {items.map((c, i) => {
        const chip = (
          <span className="inline-flex max-w-[280px] items-center gap-1.5 rounded-[var(--r-xs)] border border-[var(--line)] bg-[var(--surface-2)] px-1.5 py-[3px] text-[10.5px] text-[var(--ink-3)]">
            <Icon name={c.url ? 'external' : 'file'} size={10} className="shrink-0 text-[var(--ink-5)]" />
            <span className="truncate">{c.label}</span>
            {c.asOf && <span className="shrink-0 text-[var(--ink-5)]">· {c.asOf}</span>}
          </span>
        )
        return (
          <li key={i}>
            <Tooltip content={<><b>{c.label}</b><br />{c.ref}{c.asOf ? <><br />as of {c.asOf}</> : null}</>}>
              {c.url
                ? <a href={c.url} target="_blank" rel="noreferrer noopener" className="hover:opacity-80">{chip}</a>
                : chip}
            </Tooltip>
          </li>
        )
      })}
    </ul>
  )
}

/* ── one step ─────────────────────────────────────────────────────────────── */

const STEP_ICON = { plan: 'branch', tool: 'tool', read: 'file', compute: 'activity', draft: 'edit', validate: 'shield', note: 'alert', error: 'x' } as const

function Step({ step, last }: { step: RunStep; last: boolean }) {
  const [open, setOpen] = useState(false)
  const tone: Tone = step.status === 'fail' ? 'neg' : step.status === 'warn' ? 'warn' : step.status === 'running' ? 'agent' : 'pos'
  return (
    <li className="relative flex gap-3 pb-3 last:pb-0">
      {/* the spine */}
      {!last && <span className="absolute left-[11px] top-6 bottom-0 w-px bg-[var(--line)]" />}
      <span className={cx('relative z-[1] grid h-[23px] w-[23px] shrink-0 place-items-center rounded-full border bg-[var(--surface-1)]',
        step.status === 'fail' ? 'border-[var(--neg-line)] text-[var(--neg)]'
          : step.status === 'warn' ? 'border-[var(--warn-line)] text-[var(--warn)]'
          : step.status === 'running' ? 'border-[var(--agent-line)] text-[var(--agent)]'
          : 'border-[var(--line)] text-[var(--ink-4)]')}>
        {step.status === 'running' ? <Spinner size={11} /> : <Icon name={STEP_ICON[step.kind] ?? 'activity'} size={12} />}
      </span>

      <div className="min-w-0 flex-1 pt-[2px]">
        <div className="flex items-baseline gap-2">
          <span className={cx('text-[12.5px] font-medium', step.status === 'fail' ? 'text-[var(--neg-ink)]' : 'text-[var(--ink-1)]')}>{step.label}</span>
          {step.ms != null && <span className="text-[10.5px] tabular-nums text-[var(--ink-5)]">{step.ms < 1000 ? `${step.ms}ms` : `${(step.ms / 1000).toFixed(1)}s`}</span>}
          {step.data != null && (
            <button onClick={() => setOpen((v) => !v)} className="ml-auto shrink-0 text-[10.5px] text-[var(--ink-4)] underline-offset-2 hover:text-[var(--ink-2)] hover:underline">
              {open ? 'hide' : 'inspect'}
            </button>
          )}
        </div>
        {step.detail && <p className="mt-0.5 break-words text-[11.5px] leading-relaxed text-[var(--ink-3)]">{step.detail}</p>}
        <Citations items={step.citations} dense />
        {open && (
          <pre className="t-mono anim-fade mt-2 max-h-52 overflow-auto rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-2)] p-2.5 text-[10.5px] leading-relaxed text-[var(--ink-3)]">
            {JSON.stringify(step.data, null, 2)}
          </pre>
        )}
      </div>
    </li>
  )
}

/* ── findings ─────────────────────────────────────────────────────────────── */

export function FindingCard({ f }: { f: Finding }) {
  return (
    <div className="rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-1)] p-3">
      <div className="flex items-start gap-2.5">
        <Badge tone={SEVERITY_TONE[f.severity]} dot className="mt-px shrink-0 capitalize">{f.severity}</Badge>
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-semibold text-[var(--ink-1)]">{f.title}</div>
          {f.subject && <div className="mt-0.5 text-[11px] text-[var(--ink-4)]">{f.subject}</div>}
          <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--ink-3)]">{f.detail}</p>
          <Citations items={f.citations} dense />
        </div>
      </div>
    </div>
  )
}

/* ── the proposal ─────────────────────────────────────────────────────────── */

function DerivedTable({ v }: { v: Validation }) {
  if (!v.derived.length) return null
  return (
    <div className="overflow-hidden rounded-[var(--r-sm)] border border-[var(--line)]">
      <div className="flex items-center gap-1.5 border-b border-[var(--line)] bg-[var(--surface-2)] px-2.5 py-1.5">
        <Icon name="shield" size={11} className="text-[var(--ink-4)]" />
        <span className="t-label !text-[9.5px]">Computed by the engine</span>
      </div>
      <table className="w-full text-[11.5px]">
        <tbody>
          {v.derived.map((d) => {
            const delta = d.after - d.before
            const good = d.better === 'down' ? delta < 0 : d.better === 'up' ? delta > 0 : null
            return (
              <tr key={d.label} className="border-b border-[var(--line-soft)] last:border-0">
                <td className="px-2.5 py-[7px] text-[var(--ink-3)]">{d.label}</td>
                <td className="px-1 py-[7px] text-right tabular-nums text-[var(--ink-4)]">{fmt(d.before)}</td>
                <td className="w-4 px-0 py-[7px] text-center text-[var(--ink-5)]">→</td>
                <td className="px-1 py-[7px] text-right font-semibold tabular-nums text-[var(--ink-1)]">{fmt(d.after)}</td>
                <td className="px-2.5 py-[7px] text-right">
                  {Math.abs(delta) > 1e-9 && (
                    <span className={cx('text-[11px] font-semibold tabular-nums',
                      good === true ? 'text-[var(--pos-ink)]' : good === false ? 'text-[var(--neg-ink)]' : 'text-[var(--ink-4)]')}>
                      {delta > 0 ? '+' : '−'}{fmt(Math.abs(delta))}{d.unit ? ` ${d.unit}` : ''}
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const fmt = (n: number) => Math.abs(n) >= 1e5
  ? n.toLocaleString(undefined, { maximumFractionDigits: 0 })
  : Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(2)

export function ProposalCard({ run, canApprove, onDecide, onApply }: {
  run: AgentRun; canApprove: boolean
  onDecide: (v: 'approved' | 'rejected') => void
  onApply?: () => void
}) {
  const p = run.proposal
  const v = run.validation
  if (!p) return null
  const blocked = v && !v.ok
  const decided = !!run.decision

  return (
    <div className={cx('overflow-hidden rounded-[var(--r-lg)] border',
      blocked ? 'border-[var(--neg-line)] bg-[var(--neg-tint)]' : 'border-[var(--warn-line)] bg-[var(--warn-tint)]')}>
      <div className="flex items-start gap-2.5 px-3.5 py-3">
        <Icon name={blocked ? 'x' : 'spark'} size={15} className={cx('mt-px shrink-0', blocked ? 'text-[var(--neg)]' : 'text-[var(--warn)]')} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-semibold text-[var(--ink-1)]">{p.title}</span>
            <Badge tone={p.risk === 'high' ? 'neg' : p.risk === 'medium' ? 'warn' : 'pos'}>{p.risk} risk</Badge>
            {p.reversible && <Badge tone="neutral">reversible</Badge>}
          </div>
          <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--ink-2)]">{p.rationale}</p>
        </div>
      </div>

      <div className="space-y-3 bg-[var(--surface-1)] px-3.5 py-3">
        {/* what would change */}
        <div>
          <div className="t-label mb-1.5">Levers this would move</div>
          <ul className="space-y-1">
            {p.changes.map((c, i) => (
              <li key={i} className="flex items-center gap-2 rounded-[var(--r-xs)] bg-[var(--surface-2)] px-2.5 py-1.5 text-[11.5px]">
                <span className="min-w-0 flex-1 truncate text-[var(--ink-2)]">{c.label}</span>
                <code className="t-mono shrink-0 rounded-[3px] bg-[var(--surface-1)] px-1.5 py-px text-[10.5px] text-[var(--ink-1)]">
                  {String(c.to)}{c.unit ?? ''}
                </code>
              </li>
            ))}
          </ul>
        </div>

        {v && <DerivedTable v={v} />}

        {/* the checks */}
        {v && (
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11.5px] text-[var(--ink-3)] hover:text-[var(--ink-1)]">
              <Icon name="chevron" size={11} className="transition-transform group-open:rotate-90" />
              {v.checks.filter((c) => c.status === 'pass').length} of {v.checks.length} validation checks passed
            </summary>
            <ul className="mt-2 space-y-1">
              {v.checks.map((c) => (
                <li key={c.id} className="flex items-start gap-2 text-[11px] leading-relaxed">
                  <StatusDot tone={c.status === 'pass' ? 'pos' : c.status === 'warn' ? 'warn' : 'neg'} size={6} />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-[var(--ink-2)]">{c.label}</span>
                    <span className="ml-1 text-[var(--ink-4)]">— {c.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}

        {blocked && (
          <Callout tone="neg" icon={<Icon name="shield" size={14} />} title="Refused by the engine">
            {v?.reason} Nothing has been applied, and this proposal cannot be approved.
          </Callout>
        )}

        <Citations items={p.citations} />
      </div>

      {!blocked && (
        <div className="flex items-center gap-2 border-t border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-2.5">
          {decided ? (
            <span className="flex items-center gap-1.5 text-[11.5px] text-[var(--ink-3)]">
              <Icon name={run.decision!.verdict === 'approved' ? 'check' : 'x'} size={12}
                className={run.decision!.verdict === 'approved' ? 'text-[var(--pos)]' : 'text-[var(--ink-4)]'} />
              {run.decision!.verdict === 'approved' ? 'Approved' : 'Rejected'} by {run.decision!.by} · {relTime(run.decision!.at)}
            </span>
          ) : canApprove ? (
            <>
              <Button size="sm" variant="primary" icon={<Icon name="check" size={13} />}
                onClick={() => { onDecide('approved'); onApply?.() }}>Approve &amp; apply</Button>
              <Button size="sm" variant="ghost" onClick={() => onDecide('rejected')}>Reject</Button>
              <span className="ml-auto text-[10.5px] text-[var(--ink-4)]">Applying moves your working assumptions only.</span>
            </>
          ) : (
            <span className="flex items-center gap-1.5 text-[11.5px] text-[var(--ink-4)]">
              <Icon name="lock" size={12} />
              Waiting on a compliance lead — your role cannot approve agent output.
            </span>
          )}
        </div>
      )}
    </div>
  )
}

/* ── the whole run ────────────────────────────────────────────────────────── */

export function RunTrace({ run, canApprove, onDecide, onApply }: {
  run: AgentRun; canApprove: boolean
  onDecide: (v: 'approved' | 'rejected') => void
  onApply?: () => void
}) {
  const agent = getAgent(run.agentId)
  const running = isRunning(run.status)
  return (
    <div className="space-y-4">
      <header className="flex items-start gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--r-md)]"
          style={{ background: 'var(--agent-tint)', color: agent?.accent ?? 'var(--agent)' }}>
          <Icon name="agent" size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-[var(--ink-1)]">{agent?.name ?? run.agentId}</span>
            <Badge tone={STATUS_TONE[run.status]} dot={running}>{STATUS_LABEL[run.status]}</Badge>
          </div>
          <div className="mt-0.5 text-[11px] text-[var(--ink-4)]">
            {run.trigger.kind === 'user' ? `Started by ${run.trigger.by}` : `Triggered ${run.trigger.kind}`} · {relTime(run.startedAt)}
            {run.usage && ` · ${(run.usage.ms / 1000).toFixed(1)}s`}
          </div>
        </div>
      </header>

      {run.prompt && (
        <div className="rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-[12px] italic leading-relaxed text-[var(--ink-2)]">
          “{run.prompt}”
        </div>
      )}

      {run.error && <Callout tone="neg" icon={<Icon name="alert" size={14} />} title="The run did not complete">{run.error}</Callout>}

      {run.summary && (
        <div className="rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-1)] p-3.5">
          <div className="t-label mb-1.5">Summary</div>
          <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-[var(--ink-2)]">{run.summary}</p>
        </div>
      )}

      {run.proposal && <ProposalCard run={run} canApprove={canApprove} onDecide={onDecide} onApply={onApply} />}

      {!!run.findings.length && (
        <section>
          <div className="t-label mb-2">Findings · {run.findings.length}</div>
          <div className="space-y-2">{run.findings.map((f) => <FindingCard key={f.id} f={f} />)}</div>
        </section>
      )}

      <section>
        <div className="t-label mb-2.5">Working · {run.steps.length} step{run.steps.length === 1 ? '' : 's'}</div>
        {run.steps.length
          ? <ol className="m-0 list-none p-0">{run.steps.map((s, i) => <Step key={s.id} step={s} last={i === run.steps.length - 1} />)}</ol>
          : <EmptyState compact icon={<Icon name="agent" size={18} />} title="Nothing yet" body="The agent is starting up." />}
      </section>

      {run.usage && (
        <>
          <Divider />
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10.5px] text-[var(--ink-5)]">
            <span>Run {run.id}</span>
            <span>{run.usage.inputTokens.toLocaleString()} in · {run.usage.outputTokens.toLocaleString()} out</span>
            {cacheHit(run.usage) !== null && (
              <span title="Cached tokens bill at a tenth of the input rate, so a high hit rate means the run re-used its context instead of buying it again.">
                {(run.usage.cacheReadTokens ?? 0).toLocaleString()} cached · {cacheHit(run.usage)}% hit
              </span>
            )}
            {run.usage.model && <span>{run.usage.model}</span>}
            <span>Market {run.country}</span>
          </div>
        </>
      )}
    </div>
  )
}
