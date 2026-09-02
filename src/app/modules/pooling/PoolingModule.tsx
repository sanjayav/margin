/* ───────────────────────────────────────────────────────────────────────────
   POOLING — a workflow, not a screen.
   ---------------------------------------------------------------------------
   Pooling is the one job in this platform that is genuinely SEQUENTIAL: each
   stage is only meaningful once the one before it has an answer, and stage 1
   can end the whole thing. So the module is drawn as the workflow it is, with
   every stage stating its own status:

     1 Eligibility  — does this regime pool at all? If not, everything downstream
                      is void and is shown as void, not as an empty table.
     2 Candidates   — who could be in, and what each is worth standalone.
     3 Partition    — the coalition search, with what it saves.
     4 Settlement   — the Shapley split: who pays whom, and why that is fair.
     5 Terms        — heads of terms, drafted by the agent, never signed by it.

   The Pooling broker runs the same sequence. Its ceiling is `propose` and can
   never be raised: signing a pool is a contract between legal entities, and no
   autonomy setting may let software enter one.
   ─────────────────────────────────────────────────────────────────────────── */
import React, { useMemo, useState } from 'react'
import {
  Badge, Button, Callout, Card, cx, EmptyState, Metric, MetricRow, Panel,
  StatusDot, Table, Td, Th, Tooltip, Tr, Spinner,
} from '../../design/primitives'
import Icon from '../../design/icons'
import { BarChart, DV } from '../../design/charts'
import { ModulePage } from '../../shell/AppShell'
import { AgentLauncher } from '../../agents/ui/AgentConsole'
import { useApp } from '../../state/appStore'
import { usePosition } from '../../state/usePosition'
import { baseScenario } from '../../state/appStore'
import { poolOptimise, standings, type ShapleyMember } from '../../../engine/pooling'
import { poolingAllowed } from '../../../engine/blocks'
import { fmtInt, fmtMoney, fmtNum } from '../../../engine/engine'
import { isRunning } from '../../agents/kernel'

type StageState = 'void' | 'pending' | 'running' | 'done' | 'blocked'

function Stage({ n, title, blurb, state, children, action }: {
  n: number; title: string; blurb: string; state: StageState
  children?: React.ReactNode; action?: React.ReactNode
}) {
  const tone = state === 'done' ? 'pos' : state === 'running' ? 'agent' : state === 'blocked' || state === 'void' ? 'neutral' : 'neutral'
  return (
    <div className="relative pl-9">
      {/* the spine */}
      <span className="absolute left-[13px] top-8 h-[calc(100%-1rem)] w-px bg-[var(--line)]" />
      <span className={cx('absolute left-0 top-1 grid h-[27px] w-[27px] place-items-center rounded-full border text-[11px] font-semibold',
        state === 'done' ? 'border-[var(--pos-line)] bg-[var(--pos-tint)] text-[var(--pos-ink)]'
          : state === 'running' ? 'border-[var(--agent-line)] bg-[var(--agent-tint)] text-[var(--agent)]'
          : state === 'void' ? 'border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink-5)]'
          : 'border-[var(--line)] bg-[var(--surface-1)] text-[var(--ink-4)]')}>
        {state === 'running' ? <Spinner size={12} /> : state === 'done' ? <Icon name="check" size={13} strokeWidth={2.2} /> : n}
      </span>

      <div className={cx('pb-6', state === 'void' && 'opacity-45')}>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="t-title">{title}</h3>
          {state === 'void' && <Badge tone="neutral">not applicable here</Badge>}
          {state === 'blocked' && <Badge tone="warn">blocked</Badge>}
          <span className="ml-auto">{action}</span>
        </div>
        <p className="mb-3 max-w-[76ch] text-[12px] leading-relaxed text-[var(--ink-3)]">{blurb}</p>
        {children}
      </div>
    </div>
  )
}

export default function PoolingModule() {
  const { pack, raw, scenario, country } = usePosition('working')
  const runs = useApp((s) => s.runs)
  const setConsole = useApp((s) => s.setConsole)
  const [computed, setComputed] = useState(false)

  // Pooling is a per-year question here too: India's arrives with CAFE III.
  const enabled = poolingAllowed(pack, scenario.year)
  const broker = runs.find((r) => r.agentId === 'pool.broker')
  const brokerBusy = !!broker && isRunning(broker.status)

  const sc = useMemo(() => ({ ...baseScenario(country), year: scenario.year }), [country, scenario.year])
  const book = useMemo(() => standings(raw, pack, sc).filter((s) => s.units > 0), [raw, pack, sc])

  // The coalition search is the expensive step, so it is explicit rather than
  // automatic — a user should know when they asked for it.
  const result = useMemo(() => (enabled && computed ? poolOptimise(raw, pack, sc) : null), [enabled, computed, raw, pack, sc])

  const eligible = book.filter((s) => s.creditBalance !== 0)
  const longs = book.filter((s) => s.creditBalance > 0)
  const shorts = book.filter((s) => s.creditBalance < 0)

  return (
    <ModulePage wide
      title="Pooling"
      sub={`The full pooling job for ${pack.name}, run as a workflow: eligibility, candidates, the partition, the settlement and the terms.`}
      actions={<AgentLauncher moduleId="pooling" hint="Run the whole pooling workflow end to end" />}>

      {!enabled && (
        <Callout className="mb-5" tone="warn" icon={<Icon name="alert" size={15} />}
          title={pack.pooling.enabled && pack.pooling.fromYear != null
            ? `${pack.name} does not permit pooling in ${scenario.year} — it begins in ${pack.pooling.fromYear}`
            : `${pack.name} does not permit pooling`}>
          {pack.pooling.note} Every stage below is therefore void — shown, rather than hidden, so it is clear the question was asked and answered.
        </Callout>
      )}

      <Card className="!p-5">
        {/* ── 1 ── */}
        <Stage n={1} title="Eligibility" state={enabled ? 'done' : 'void'}
          blurb={`Whether the regime permits members to be assessed on a shared fleet average in ${scenario.year}, and on what terms. Read from the ${pack.name} rule pack, not assumed — and read per year, because a regime can gain pooling partway through the years a pack covers.`}>
          <div className={cx('rounded-[var(--r-md)] border p-3.5',
            enabled ? 'border-[var(--pos-line)] bg-[var(--pos-tint)]' : 'border-[var(--line)] bg-[var(--surface-2)]')}>
            <div className="flex items-start gap-2.5">
              <Icon name={enabled ? 'check' : 'x'} size={15} className={cx('mt-px shrink-0', enabled ? 'text-[var(--pos)]' : 'text-[var(--ink-4)]')} />
              <div>
                <div className={cx('text-[12.5px] font-semibold', enabled ? 'text-[var(--pos-ink)]' : 'text-[var(--ink-2)]')}>
                  {enabled ? 'Pooling is available' : 'Pooling is not available'}
                </div>
                <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--ink-3)]">{pack.pooling.note}</p>
                <p className="mt-1.5 overflow-hidden text-[11px] leading-snug text-[var(--ink-4)] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                  Source: {pack.source}
                </p>
              </div>
            </div>
          </div>
        </Stage>

        {/* ── 2 ── */}
        <Stage n={2} title="Candidates" state={!enabled ? 'void' : eligible.length ? 'done' : 'blocked'}
          blurb="Every compliance entity that brings something to a pool — either a fine to remove or headroom to lend. An entity sitting exactly on its line changes no coalition's value, so it is not a candidate.">
          {enabled && (
            eligible.length ? (
              <>
                <MetricRow className="mb-3">
                  <Metric size="sm" label="Candidates" value={eligible.length} sub={`of ${book.length} entities in the market`} />
                  <Metric size="sm" label={`Bring headroom`} value={longs.length} tone="pos" sub={`${fmtInt(longs.reduce((a, s) => a + s.creditBalance, 0))} ${pack.metricUnit}·units`} />
                  <Metric size="sm" label="Need cover" value={shorts.length} tone="neg" sub={fmtMoney(shorts.reduce((a, s) => a + s.fine, 0), pack.currency)} />
                  <Metric size="sm" label="Standalone exposure" value={fmtMoney(book.reduce((a, s) => a + s.fine, 0), pack.currency)} sub="if nobody pools" />
                </MetricRow>
                <BarChart max={Math.max(...eligible.map((s) => Math.abs(s.creditBalance)))}
                  format={(v) => fmtInt(v)} unit={` ${pack.metricUnit}·u`}
                  data={[...eligible].sort((a, b) => b.creditBalance - a.creditBalance).slice(0, 10)
                    .map((s) => ({ label: s.parent, value: Math.abs(s.creditBalance), tone: s.creditBalance > 0 ? 'var(--pos)' : 'var(--neg)' }))} />
              </>
            ) : (
              <EmptyState compact icon={<Icon name="users" size={17} />} title="No candidates"
                body="Every entity is exactly on its line, so no coalition would change anyone's position." />
            )
          )}
        </Stage>

        {/* ── 3 ── */}
        <Stage n={3} title="Partition" state={!enabled ? 'void' : result ? 'done' : 'pending'}
          blurb="The coalition search: which grouping of candidates removes the most exposure once assessed on one shared average. The roster is bounded, and anything left out is stated."
          action={enabled && !result && (
            <Button size="sm" variant="secondary" icon={<Icon name="play" size={12} />} onClick={() => setComputed(true)}>
              Run the search
            </Button>
          )}>
          {enabled && (result ? (
            <>
              <MetricRow className="mb-3">
                <Metric size="sm" label="Members" value={result.members.length} sub={result.members.slice(0, 3).join(', ') + (result.members.length > 3 ? '…' : '')} />
                <Metric size="sm" label="Standalone total" value={fmtMoney(result.totalStandalone, pack.currency)} sub="each assessed alone" />
                <Metric size="sm" label="Pooled" value={fmtMoney(result.pooledFine, pack.currency)} sub="assessed on one average" />
                <Metric size="sm" label="Saving" value={fmtMoney(result.savings, pack.currency)} tone={result.savings > 0 ? 'pos' : 'neutral'}
                  sub={result.totalStandalone > 0 ? `${((result.savings / result.totalStandalone) * 100).toFixed(0)}% of standalone exposure` : 'nothing to save'} />
              </MetricRow>
              {result.omitted > 0 && (
                <Callout tone="warn" icon={<Icon name="alert" size={14} />}>
                  {result.omitted} relevant {result.omitted === 1 ? 'entity was' : 'entities were'} left out to bound the search.
                  This is the best partition found within the roster cap, not a proof of the global optimum.
                </Callout>
              )}
            </>
          ) : (
            <div className="rounded-[var(--r-md)] border border-dashed border-[var(--line-strong)] bg-[var(--surface-2)] px-4 py-6 text-center">
              <p className="text-[12px] text-[var(--ink-4)]">
                The coalition search is combinatorial, so it runs when you ask rather than on every render.
              </p>
            </div>
          ))}
        </Stage>

        {/* ── 4 ── */}
        <Stage n={4} title="Settlement" state={!enabled ? 'void' : result ? 'done' : 'pending'}
          blurb="How the saving is split. Each member's share is its Shapley value — its average marginal contribution across every order the pool could have formed. That is the split that makes no member better off leaving.">
          {enabled && result && (
            <div className="overflow-hidden rounded-[var(--r-md)] border border-[var(--line)]">
              <Table>
                <thead>
                  <tr>
                    <Th>Member</Th>
                    <Th align="center">Role</Th>
                    <Th align="right">Standalone exposure</Th>
                    <Th align="right">Fair share of saving</Th>
                    <Th align="right">Net settlement</Th>
                  </tr>
                </thead>
                <tbody>
                  {[...result.split].sort((a, b) => a.finalCost - b.finalCost).map((m: ShapleyMember) => (
                    <Tr key={m.parent}>
                      <Td strong>{m.parent}</Td>
                      <Td align="center">
                        <Badge tone={m.role === 'seller' ? 'pos' : m.role === 'buyer' ? 'warn' : 'neutral'}>
                          {m.role === 'seller' ? pack.transfer.supplier : m.role === 'buyer' ? pack.transfer.taker : 'balanced'}
                        </Badge>
                      </Td>
                      <Td align="right">{fmtMoney(m.standaloneFine, pack.currency)}</Td>
                      <Td align="right" className="!text-[var(--pos-ink)]">{fmtMoney(m.shapley, pack.currency)}</Td>
                      <Td align="right" strong>
                        <span className={m.finalCost < 0 ? 'text-[var(--pos-ink)]' : m.finalCost > 0 ? 'text-[var(--neg-ink)]' : ''}>
                          {m.finalCost < 0 ? 'receives ' : m.finalCost > 0 ? 'pays ' : ''}
                          {fmtMoney(Math.abs(m.finalCost), pack.currency)}
                        </span>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </Stage>

        {/* ── 5 ── */}
        <Stage n={5} title="Terms" state={!enabled ? 'void' : brokerBusy ? 'running' : broker?.proposal ? 'done' : 'pending'}
          blurb="Heads of terms for the proposed pool: membership, the compliance year, the settlement basis and the exit conditions. The broker drafts them. It cannot sign them, at any autonomy setting."
          action={enabled && broker && (
            <Button size="sm" variant="ghost" onClick={() => { useApp.getState().setActiveRun(broker.id); setConsole(true) }}>
              Open the run
            </Button>
          )}>
          {enabled && (broker?.proposal ? (
            <div className="rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-1)] p-3.5">
              <div className="text-[12.5px] font-semibold text-[var(--ink-1)]">{broker.proposal.title}</div>
              <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--ink-3)]">{broker.proposal.rationale}</p>
              <div className="mt-2.5">
                <Button size="sm" variant="secondary" icon={<Icon name="file" size={12} />} onClick={() => { useApp.getState().setActiveRun(broker.id); setConsole(true) }}>
                  Review in the console
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-[var(--r-md)] border border-dashed border-[var(--line-strong)] bg-[var(--surface-2)] px-4 py-6 text-center">
              <p className="text-[12px] text-[var(--ink-4)]">
                Run the Pooling broker to draft terms from the partition and settlement above.
              </p>
              <div className="mt-3 flex justify-center"><AgentLauncher moduleId="pooling" /></div>
            </div>
          ))}
        </Stage>
      </Card>

      <Callout className="mt-4" tone="neutral" icon={<Icon name="lock" size={14} />} title="Why this agent can never act alone">
        Every other agent in the platform can be raised to <b>act</b> autonomy for low-risk reversible changes. The Pooling broker cannot:
        its ceiling is <b>propose</b>, declared in the agent registry and enforced in the runner. Entering a pool binds legal entities to
        each other's compliance outcome, and that is not a reversible change.
      </Callout>
    </ModulePage>
  )
}
