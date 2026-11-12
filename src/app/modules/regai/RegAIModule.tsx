/* ───────────────────────────────────────────────────────────────────────────
   REG AI — the regulatory intelligence module.
   ---------------------------------------------------------------------------
   Every other module answers "given the rules, where are we?". This one owns
   the prior question — which rules, how settled, and what is about to move —
   across every market and every kind of regulation a workspace chooses to
   track: vehicle CO₂ and CAFE, CBAM, emissions trading, type-approval.

     WATCHTOWER  The front page: what you track, what bites next, what the
                 watch found.
     LIBRARY     Every regulation Reg AI knows, by market — and the switch
                 that tracks it. The tracked set is the lens for every tab.
     RADAR       Tracked instruments on one timeline, in stage lanes.
     READER      Clause-level reading, with the live rule-pack value each
                 clause drives where the engine prices it.
     RECONCILE   What the loaded rule pack holds against the current text.
     IMPACT      A change, priced against your own fleet.
     AGENT       Tune the Regulatory watch — scope, cadence, sensitivity,
                 depth, voice — with the guardrails shown and locked.
   ─────────────────────────────────────────────────────────────────────────── */
import React, { useMemo, useState } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import {
  Badge, Button, Callout, Card, CountUp, cx, Divider, EmptyState, Metric, MetricRow,
  Panel, Progress, Segmented, Slider, StatusDot, Table, Td, Th, Tooltip, Tr, relTime,
} from '../../design/primitives'
import Icon, { type IconName } from '../../design/icons'
import { ModulePage } from '../../shell/AppShell'
import { AgentLauncher } from '../../agents/ui/AgentConsole'
import { useApp } from '../../state/appStore'
import { usePosition } from '../../state/usePosition'
import { buildTree, fmtMoney, fmtNum } from '../../../engine/engine'
import { getPack, PACK_LIST } from '../../../engine/rulepacks'
import { baseScenario } from '../../state/appStore'
import {
  DRIVES_LABEL, INSTRUMENTS, STAGE_META, STAGE_ORDER, instrumentsFor,
  type Drives, type Instrument, type Stage,
} from './catalogue'
import type { CountryId } from '../../../engine/types'
import { RECONCILIATIONS, VERDICT_META, reconSummary, reconciliationFor } from './reconcile'
import { MARKET_NAME, MARKET_ORDER, REG_BY_ID, instrumentsOf, type Regulation } from './regulations'
import { Watchtower } from './Watchtower'
import { Library } from './Library'
import { AgentStudio } from './AgentStudio'
import { RegDrawer } from './ui/RegDrawer'
import { Flag } from './ui/assets'
import { page } from './ui/motion'

/* ═══════════════════════════════════════════════════════════════════════════
   1 · RADAR
   ═══════════════════════════════════════════════════════════════════════════ */

function Radar({ onOpen, goLibrary }: { onOpen: (i: Instrument) => void; goLibrary: () => void }) {
  const tracked = useApp((s) => s.regTracked)
  const country = useApp((s) => s.country)
  const setCountry = useApp((s) => s.setCountry)
  const [scope, setScope] = useState<'all' | 'this'>('all')

  const items = useMemo(
    () => INSTRUMENTS.filter((i) => tracked.includes(i.regulation) && (scope === 'all' || i.market === country)),
    [tracked, scope, country],
  )

  const span = useMemo(() => {
    const from = Math.min(...items.map((i) => i.from), 2020)
    const to = Math.max(...items.map((i) => i.to ?? i.from + 8), 2035)
    return { from, to }
  }, [items])
  const years = span.to - span.from

  // Most-settled lane first: a reader's first question is "what do I file
  // against", not "what might change one day".
  const lanes = [...STAGE_ORDER].reverse().filter((s) => items.some((i) => i.stage === s))
  const thisYear = new Date().getFullYear()

  if (!items.length) {
    return (
      <EmptyState art="search" title={scope === 'all' ? 'Nothing tracked yet' : `Nothing tracked in ${getPack(country).name}`}
        body="The radar shows the instruments behind the regulations you track. Choose some in the Library."
        action={<Button variant="primary" icon={<Icon name="list" size={13} />} onClick={goLibrary}>Open the Library</Button>} />
    )
  }

  return (
    <>
      <MetricRow className="mb-4">
        <Metric size="sm" label="Instruments tracked" value={items.length}
          sub={`across ${new Set(items.map((i) => i.market)).size} markets`} />
        <Metric size="sm" label="In force" value={items.filter((i) => i.stage === 'in force').length} tone="pos"
          sub="what you file against today" />
        <Metric size="sm" label="Notified, not yet operative" value={items.filter((i) => i.stage === 'notified').length}
          tone="info" sub="what you plan to" />
        <Metric size="sm" label="Draft or in consultation" value={items.filter((i) => i.stage === 'draft' || i.stage === 'consultation').length}
          tone="warn" sub="what you stress-test" />
      </MetricRow>

      <Panel
        title="Regulatory radar"
        sub="Every instrument behind the regulations you track, positioned over the years it governs and grouped by how settled it is."
        icon={<Icon name="regai" size={14} />}
        actions={
          <Segmented size="sm" value={scope} onChange={setScope}
            options={[{ id: 'all', label: 'All markets' }, { id: 'this', label: getPack(country).name }]} />
        }>
        {/* year ruler */}
        <div className="relative mb-2 ml-[150px] h-5 border-b border-[var(--line)]">
          {Array.from({ length: years + 1 }, (_, i) => span.from + i)
            .filter((y) => y % 2 === 0)
            .map((y) => (
              <span key={y} className="absolute top-0 -translate-x-1/2 text-[10px] tabular-nums text-[var(--ink-4)]"
                style={{ left: `${((y - span.from) / years) * 100}%` }}>{y}</span>
            ))}
          <span className="absolute bottom-0 top-0 w-px bg-[var(--brand)] opacity-70"
            style={{ left: `${((thisYear - span.from) / years) * 100}%` }} />
        </div>

        <div className="space-y-4">
          {lanes.map((stage) => {
            const lane = items.filter((i) => i.stage === stage)
            const m = STAGE_META[stage]
            return (
              <div key={stage}>
                <div className="mb-1.5 flex items-center gap-2">
                  <StatusDot tone={m.tone} size={7} />
                  <span className="t-label !mb-0">{m.label}</span>
                  <span className="text-[11px] text-[var(--ink-4)]">{m.blurb}</span>
                </div>
                <div className="space-y-1">
                  {lane.map((i) => {
                    const from = ((i.from - span.from) / years) * 100
                    const to = (((i.to ?? span.to) - span.from) / years) * 100
                    return (
                      <div key={i.id} className="flex items-center gap-2">
                        <button onClick={() => { setCountry(i.market); onOpen(i) }}
                          className="w-[142px] shrink-0 truncate text-left text-[11.5px] text-[var(--ink-2)] hover:text-[var(--ink-1)] hover:underline"
                          title={i.title}>
                          <Flag market={i.market} size={13} className="mr-1.5 align-[-1px]" />
                          {i.shortTitle}
                        </button>
                        <span className="relative h-[22px] flex-1 rounded-[var(--r-xs)] bg-[var(--surface-2)]">
                          <Tooltip content={<><b>{i.title}</b><br />{i.citation}<br />{i.from}–{i.to ?? 'open'}</>}>
                            <button onClick={() => { setCountry(i.market); onOpen(i) }}
                              className="absolute inset-y-0 flex items-center rounded-[var(--r-xs)] px-2 text-[10.5px] font-semibold text-white transition-transform hover:scale-y-110"
                              style={{
                                left: `${from}%`, width: `${Math.max(6, to - from)}%`,
                                background: m.tone === 'pos' ? 'var(--pos)' : m.tone === 'warn' ? 'var(--warn)'
                                  : m.tone === 'info' ? 'var(--info)' : 'var(--ink-4)',
                              }}>
                              <span className="truncate">{i.citation}</span>
                            </button>
                          </Tooltip>
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        <Callout className="mt-4" tone="neutral" icon={<Icon name="alert" size={13} />}>
          This is the platform’s structured reading of each instrument, not the instrument itself. Every entry names its primary source,
          and every number on the Instruments tab is read live from the loaded rule pack — so this radar can never quietly disagree with
          the engine.
        </Callout>
      </Panel>

      <MarketSummary />
    </>
  )
}

/** One card per market: the regime operating this year, how settled it is, and
 *  where the next step change in the target actually falls. The step is what
 *  breaks a plan — a fleet that clears every year except one has not cleared. */
function MarketSummary() {
  const markets = useApp((s) => s.markets)
  const year = useApp((s) => s.scenario.year)
  const setCountry = useApp((s) => s.setCountry)
  const country = useApp((s) => s.country)

  const cards = useMemo(() => PACK_LIST.filter((p) => markets.includes(p.id)).map((p) => {
    const y = p.years.includes(year) ? year : (p.defaultYear ?? p.years[0])
    const regime = p.regimeFor?.(y)
    const curve = p.years.map((yy) => ({ year: yy, limit: p.forecast(yy).limit }))
    const here = curve.find((c) => c.year === y)?.limit ?? 0
    // The next year whose target moves by more than a rounding error.
    const step = curve.find((c) => c.year > y && Math.abs(c.limit - here) > Math.max(0.05, here * 0.005))
    const inst = INSTRUMENTS.filter((i) => i.market === p.id)
    const unsettled = inst.filter((i) => i.stage === 'draft' || i.stage === 'consultation').length
    return { p, y, regime, here, step, count: inst.length, unsettled }
  }), [markets, year])

  return (
    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {cards.map(({ p, y, regime, here, step, count, unsettled }) => (
        <Card key={p.id} interactive onClick={() => setCountry(p.id)}
          className={cx(country === p.id && '!border-[var(--ink-2)]')}>
          <div className="flex items-start gap-2.5">
            <span className="text-[17px] leading-none">{p.flag}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-[13px] font-semibold text-[var(--ink-1)]">{p.name}</span>
                {regime?.draft
                  ? <Badge tone="warn" dot>draft</Badge>
                  : <Badge tone="pos" dot>in force</Badge>}
              </div>
              <div className="mt-0.5 truncate text-[11.5px] text-[var(--ink-4)]">{regime?.name ?? 'single regime'} · {y}</div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <div className="t-label">Target this year</div>
              <div className="mt-0.5 text-[15px] font-semibold tabular-nums text-[var(--ink-1)]">
                {fmtNum(here, 1)}<span className="ml-1 text-[10.5px] font-normal text-[var(--ink-4)]">{p.metricUnit}</span>
              </div>
            </div>
            <div>
              <div className="t-label">Next step change</div>
              <div className="mt-0.5 text-[15px] font-semibold tabular-nums text-[var(--ink-1)]">
                {step ? step.year : <span className="text-[12px] font-normal text-[var(--ink-4)]">none scheduled</span>}
                {step && (
                  <span className={cx('ml-1.5 text-[10.5px] font-semibold', step.limit < here ? 'text-[var(--neg-ink)]' : 'text-[var(--pos-ink)]')}>
                    {step.limit < here ? '↓' : '↑'}{fmtNum(Math.abs(step.limit - here), 1)}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2 border-t border-[var(--line-soft)] pt-2.5 text-[11px] text-[var(--ink-4)]">
            <Icon name="book" size={11} />{count} instrument{count === 1 ? '' : 's'}
            {unsettled > 0 && <Badge tone="warn">{unsettled} unsettled</Badge>}
            <span className="ml-auto">{p.transfer.kind === 'trade' ? p.transfer.unit : 'no instrument'}</span>
          </div>
        </Card>
      ))}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   2 · INSTRUMENTS — the three-pane reader
   ═══════════════════════════════════════════════════════════════════════════ */

const DRIVES_ICON: Record<Drives, IconName> = {
  limit: 'target', fine: 'creditbook', pooling: 'pooling', transfer: 'scale',
  credits: 'layers', eco: 'spark', cycle: 'activity', coverage: 'data', scope: 'globe', none: 'file',
}

/** What the loaded rule pack currently says for the parameter a clause drives.
 *  Read at render time, so the reader is always looking at the live value. */
function packValue(drives: Drives, country: CountryId, year: number, limit: number): { value: string; note: string } | null {
  const p = getPack(country)
  switch (drives) {
    case 'limit': return { value: `${fmtNum(limit, 1)} ${p.metricUnit}`, note: p.limitNote }
    case 'fine': return { value: p.fineRateLabel, note: p.illustrativeRates ? 'Illustrative — pending primary-source confirmation.' : 'As loaded from the primary source.' }
    case 'pooling': return { value: p.pooling.enabled ? 'Permitted' : 'Not permitted', note: p.pooling.note }
    case 'transfer': return { value: p.transfer.kind === 'trade' ? `Tradable — ${p.transfer.unit}` : 'No instrument', note: p.transfer.note }
    case 'credits': return { value: 'See flexibilities', note: p.credits }
    case 'eco': return { value: p.ecoCap ? `Capped at ${p.ecoCap(year)} ${p.metricUnit}` : 'Not available', note: p.ecoCap ? 'Cap applied by the engine for this year.' : 'This regime grants no off-cycle credit.' }
    case 'cycle': return { value: p.regimeFor?.(year)?.cycle ?? 'As recorded', note: p.regimeFor?.(year)?.cycleNote ?? 'The homologation cycle as carried by the source.' }
    case 'coverage': return { value: p.coverage.tier, note: p.coverage.label }
    default: return null
  }
}

function InstrumentReader({ open, setOpen, goLibrary }: { open: Instrument | null; setOpen: (i: Instrument | null) => void; goLibrary: () => void }) {
  const country = useApp((s) => s.country)
  const setCountry = useApp((s) => s.setCountry)
  const tracked = useApp((s) => s.regTracked)
  const { pack, tree, scenario } = usePosition('actuals')
  const list = useMemo(() => instrumentsFor(country).filter((i) => tracked.includes(i.regulation)), [country, tracked])
  const perMarket = useMemo(() => Object.fromEntries(MARKET_ORDER.map((m) => [m, instrumentsFor(m).filter((i) => tracked.includes(i.regulation)).length])), [tracked])
  const active = open && open.market === country ? open : list[0]
  const [clauseRef, setClauseRef] = useState<string | null>(null)
  const clause = active?.clauses.find((c) => c.ref === clauseRef) ?? active?.clauses[0] ?? null
  const live = clause ? packValue(clause.drives, country, scenario.year, tree.limit) : null

  const marketBar = (
    <div className="mb-4 flex flex-wrap items-center gap-1.5">
      {MARKET_ORDER.map((m) => (
        <button key={m} onClick={() => { setCountry(m); setClauseRef(null) }} aria-pressed={country === m}
          className={cx('inline-flex h-[32px] items-center gap-2 rounded-[var(--r-full)] border px-3 text-[12px] font-medium transition-colors',
            country === m ? 'border-[var(--ink-2)] bg-[var(--surface-1)] text-[var(--ink-1)] shadow-[var(--sh-1)]' : 'border-transparent text-[var(--ink-3)] hover:bg-[var(--surface-1)] hover:text-[var(--ink-1)]')}>
          <Flag market={m} size={16} />{MARKET_NAME[m]}
          <span className="tabular-nums text-[10.5px] text-[var(--ink-4)]">{perMarket[m]}</span>
        </button>
      ))}
    </div>
  )

  if (!list.length) {
    return (
      <>
        {marketBar}
        <EmptyState art="search" title={`Nothing tracked in ${pack.name}`}
          body="The reader shows the instruments behind the regulations you track. Track one for this market in the Library."
          action={<Button variant="primary" icon={<Icon name="list" size={13} />} onClick={goLibrary}>Open the Library</Button>} />
      </>
    )
  }

  return (
    <>
    {marketBar}
    <div className="grid gap-4 xl:grid-cols-[258px_minmax(0,1fr)_308px]">
      {/* ── pane 1 · instruments ── */}
      <Panel flush title={`${pack.name} instruments`} icon={<Icon name="book" size={14} />} bodyClass="!p-1.5">
        <div className="space-y-0.5">
          {list.map((i) => {
            const on = active?.id === i.id
            const m = STAGE_META[i.stage]
            return (
              <button key={i.id} onClick={() => { setOpen(i); setClauseRef(null) }}
                className={cx('w-full rounded-[var(--r-sm)] px-2.5 py-2 text-left transition-colors',
                  on ? 'bg-[var(--surface-3)]' : 'hover:bg-[var(--surface-2)]')}>
                <span className="flex items-center gap-1.5">
                  <StatusDot tone={m.tone} size={6} />
                  <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[var(--ink-1)]">{i.shortTitle}</span>
                </span>
                <span className="mt-0.5 block truncate text-[10.5px] text-[var(--ink-4)]">{i.citation}</span>
                <span className="mt-1 flex items-center gap-1.5">
                  <Badge tone={m.tone}>{m.label}</Badge>
                  <span className="text-[10px] tabular-nums text-[var(--ink-5)]">{i.from}–{i.to ?? 'open'}</span>
                </span>
              </button>
            )
          })}
        </div>
      </Panel>

      {/* ── pane 2 · the reader ── */}
      {active && (
        <Panel
          title={active.shortTitle}
          sub={active.title}
          icon={<Icon name="file" size={14} />}
          actions={active.url && (
            <Button size="xs" variant="ghost" iconRight={<Icon name="external" size={11} />}
              onClick={() => window.open(active.url, '_blank', 'noopener')}>Primary source</Button>
          )}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge tone={STAGE_META[active.stage].tone} dot>{STAGE_META[active.stage].label}</Badge>
            <span className="text-[11.5px] text-[var(--ink-4)]">{active.authority}</span>
            <span className="text-[11.5px] text-[var(--ink-5)]">·</span>
            <span className="text-[11.5px] tabular-nums text-[var(--ink-4)]">governs {active.from}–{active.to ?? 'open'}</span>
          </div>

          <p className="mb-4 text-[12.5px] leading-relaxed text-[var(--ink-2)]">{active.summary}</p>
          <Divider />

          <div className="t-label mb-2">Operative clauses</div>
          <div className="space-y-1.5">
            {active.clauses.map((c) => {
              const on = clause?.ref === c.ref
              return (
                <button key={c.ref} onClick={() => setClauseRef(c.ref)}
                  className={cx('w-full rounded-[var(--r-md)] border p-3 text-left transition-all',
                    on ? 'border-[var(--ink-2)] bg-[var(--surface-2)]' : 'border-[var(--line)] hover:border-[var(--line-strong)]')}>
                  <span className="flex items-center gap-2">
                    <span className="t-mono shrink-0 rounded-[3px] bg-[var(--surface-3)] px-1.5 py-px text-[10.5px] text-[var(--ink-2)]">{c.ref}</span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-[var(--ink-1)]">{c.heading}</span>
                    <Tooltip content={`Drives: ${DRIVES_LABEL[c.drives]}`}>
                      <span className={cx('inline-flex shrink-0 items-center gap-1 rounded-[var(--r-xs)] px-1.5 py-[2px] text-[10px] font-semibold',
                        c.drives === 'none' ? 'bg-[var(--surface-3)] text-[var(--ink-4)]' : 'bg-[var(--info-tint)] text-[var(--info-ink)]')}>
                        <Icon name={DRIVES_ICON[c.drives]} size={10} />{DRIVES_LABEL[c.drives]}
                      </span>
                    </Tooltip>
                  </span>
                  <span className="mt-1.5 block text-[12px] leading-relaxed text-[var(--ink-3)]">{c.text}</span>
                  {c.soWhat && (
                    <span className="mt-2 flex items-start gap-1.5 rounded-[var(--r-xs)] bg-[var(--brand-tint)] px-2 py-1.5">
                      <Icon name="spark" size={11} className="mt-px shrink-0 text-[var(--brand)]" />
                      <span className="text-[11.5px] leading-relaxed text-[var(--ink-2)]">{c.soWhat}</span>
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </Panel>
      )}

      {/* ── pane 3 · what it drives, live ── */}
      <div className="space-y-4">
        <Panel title="What this clause drives" icon={<Icon name="link" size={14} />}
          sub="Read from the rule pack the engine is using right now — not from the catalogue.">
          {clause && live ? (
            <>
              <div className="mb-1 flex items-center gap-1.5">
                <Icon name={DRIVES_ICON[clause.drives]} size={13} className="text-[var(--info)]" />
                <span className="t-label !mb-0">{DRIVES_LABEL[clause.drives]}</span>
              </div>
              <div className="text-[17px] font-semibold tracking-[-.02em] text-[var(--ink-1)]">{live.value}</div>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-[var(--ink-3)]">{live.note}</p>
              <Divider />
              <div className="t-label mb-1.5">Your position under it</div>
              <div className="space-y-1.5 text-[12px]">
                <div className="flex justify-between"><span className="text-[var(--ink-3)]">Fleet</span><b className="tabular-nums text-[var(--ink-1)]">{fmtNum(tree.avgMetric, 1)} {pack.metricUnit}</b></div>
                <div className="flex justify-between"><span className="text-[var(--ink-3)]">Limit</span><b className="tabular-nums text-[var(--ink-1)]">{fmtNum(tree.limit, 1)} {pack.metricUnit}</b></div>
                <div className="flex justify-between">
                  <span className="text-[var(--ink-3)]">Gap</span>
                  <b className={cx('tabular-nums', tree.gap > 0 ? 'text-[var(--neg-ink)]' : 'text-[var(--pos-ink)]')}>
                    {tree.gap > 0 ? '+' : ''}{fmtNum(tree.gap, 1)}
                  </b>
                </div>
              </div>
            </>
          ) : (
            <EmptyState compact icon={<Icon name="file" size={17} />} title="Nothing computed"
              body="This clause is context. It does not drive a parameter the engine reads." />
          )}
        </Panel>

        <Panel title="Provenance" icon={<Icon name="shield" size={14} />}>
          <dl className="space-y-2.5 text-[11.5px]">
            <div><dt className="text-[var(--ink-4)]">Instrument</dt><dd className="m-0 mt-0.5 text-[var(--ink-2)]">{active?.citation}</dd></div>
            <div><dt className="text-[var(--ink-4)]">Authority</dt><dd className="m-0 mt-0.5 text-[var(--ink-2)]">{active?.authority}</dd></div>
            <div><dt className="text-[var(--ink-4)]">Rule pack source</dt><dd className="m-0 mt-0.5 leading-relaxed text-[var(--ink-2)]">{pack.source}</dd></div>
            <div><dt className="text-[var(--ink-4)]">Dataset coverage</dt><dd className="m-0 mt-0.5 leading-relaxed text-[var(--ink-2)]">{pack.coverage.label}</dd></div>
          </dl>
        </Panel>
      </div>
    </div>
    </>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   2b · RECONCILE — what we hold against what the instrument says
   ═══════════════════════════════════════════════════════════════════════════ */

function Reconcile() {
  const { pack, country } = usePosition('actuals')
  const setModule = useApp((s) => s.setModule)
  const recon = reconciliationFor(country)
  const [filter, setFilter] = useState<'open' | 'all'>('open')

  if (!recon) {
    return (
      <EmptyState art="search" title={`No reconciliation written for ${pack.name} yet`}
        body="The rule pack is loaded and the engine uses it; the line-by-line comparison against the current instrument has not been written for this market." />
    )
  }

  const sum = reconSummary(recon)
  const lines = filter === 'all' ? recon.lines : recon.lines.filter((l) => l.verdict !== 'aligned' && !l.closed)

  return (
    <div className="space-y-4">
      <MetricRow>
        <Metric label="Lines compared" value={sum.total} sub={`against ${recon.against.split('—')[0].trim()}`} />
        <Metric label="Aligned" value={sum.aligned} tone={sum.aligned ? 'pos' : undefined}
          sub="the pack matches the instrument" />
        <Metric label="Gaps closed" value={sum.closed} tone={sum.closed ? 'pos' : undefined}
          sub="mechanisms since built into the platform" />
        <Metric label="Still open" value={sum.open} tone={sum.open ? 'warn' : 'pos'}
          sub={sum.structuralOpen ? `${sum.structuralOpen} of them structural` : 'nothing structural outstanding'}
          hint="A structural gap changes answers, not just figures — it is the kind that produces a confidently wrong number." />
      </MetricRow>

      <Callout tone="info" icon={<Icon name="shield" size={14} />} title="Why this page exists">
        Every compliance platform has the same silent failure: the rules move and the software does not, and nobody finds out until a
        regulator or a customer does. So the platform states the gap itself — what the loaded pack holds, what the current instrument
        says, and what it means for a number on screen. Nothing here is adopted automatically: a figure from an open consultation is
        shown and dated, never quietly written into the engine.
      </Callout>

      <Panel flush
        title={`${pack.name} · rule pack against the instrument`}
        sub={`Pack basis: ${recon.packBasis}. Compared against: ${recon.against}.`}
        icon={<Icon name="scale" size={14} />}
        actions={
          <Segmented size="sm" value={filter} onChange={setFilter}
            options={[{ id: 'open', label: `Needs attention · ${sum.open}` }, { id: 'all', label: `All · ${sum.total}` }]} />
        }>
        {lines.length ? (
          <div className="divide-y divide-[var(--line-soft)]">
            {lines.map((l) => {
              const v = VERDICT_META[l.verdict]
              return (
                <div key={l.id} className="p-4">
                  <div className="mb-2.5 flex flex-wrap items-center gap-2">
                    <span className="t-title-sm">{l.topic}</span>
                    <Tooltip content={v.blurb}><span><Badge tone={v.tone} dot>{v.label}</Badge></span></Tooltip>
                    {l.closed && <Badge tone="pos">closed in the platform</Badge>}
                    <span className="ml-auto text-[10.5px] tabular-nums text-[var(--ink-5)]">{l.dated}</span>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-2)] p-2.5">
                      <div className="t-label mb-1">The loaded pack</div>
                      <p className="text-[12px] leading-relaxed text-[var(--ink-2)]">{l.pack}</p>
                    </div>
                    <div className={cx('rounded-[var(--r-sm)] border p-2.5',
                      l.verdict === 'aligned' ? 'border-[var(--line)] bg-[var(--surface-2)]' : 'border-[var(--warn-line)] bg-[var(--warn-tint)]')}>
                      <div className="t-label mb-1">The current instrument</div>
                      <p className="text-[12px] leading-relaxed text-[var(--ink-2)]">{l.current}</p>
                    </div>
                  </div>

                  <div className="mt-2 flex items-start gap-1.5 rounded-[var(--r-sm)] bg-[var(--brand-tint)] px-2.5 py-2">
                    <Icon name="spark" size={11} className="mt-0.5 shrink-0 text-[var(--brand)]" />
                    <p className="text-[11.5px] leading-relaxed text-[var(--ink-2)]">{l.soWhat}</p>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[10.5px] text-[var(--ink-4)]">
                    <Icon name="file" size={10} />{l.source}
                    {l.id === 'in-blocks' && (
                      <Button size="xs" variant="ghost" className="ml-auto" onClick={() => setModule('forecast')}>See Blocks</Button>
                    )}
                    {(l.id === 'in-price' || l.id === 'in-lapse') && (
                      <Button size="xs" variant="ghost" className="ml-auto" onClick={() => setModule('creditbook')}>Open the desk</Button>
                    )}
                    {l.id === 'in-pooling' && (
                      <Button size="xs" variant="ghost" className="ml-auto" onClick={() => setModule('pooling')}>Open Pooling</Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="p-4">
            <EmptyState compact art="clean" title="Nothing outstanding"
              body="Every line either matches the current instrument or has already been closed in the platform. Switch to All to see the full comparison." />
          </div>
        )}
      </Panel>

      <Panel title="Across every market" icon={<Icon name="globe" size={14} />}
        sub="The same comparison for the other markets this workspace has switched on.">
        <Table>
          <thead>
            <tr><Th>Market</Th><Th align="right">Lines</Th><Th align="right">Aligned</Th><Th align="right">Closed</Th><Th align="right">Open</Th><Th>Pack basis</Th></tr>
          </thead>
          <tbody>
            {RECONCILIATIONS.map((r) => {
              const s = reconSummary(r)
              return (
                <Tr key={r.market} selected={r.market === country} interactive
                  onClick={() => useApp.getState().setCountry(r.market)}>
                  <Td strong>{getPack(r.market).name}</Td>
                  <Td align="right">{s.total}</Td>
                  <Td align="right" className="!text-[var(--pos-ink)]">{s.aligned}</Td>
                  <Td align="right" className="!text-[var(--pos-ink)]">{s.closed}</Td>
                  <Td align="right">
                    <span className={s.open ? 'font-semibold text-[var(--warn-ink)]' : 'text-[var(--ink-5)]'}>{s.open || '—'}</span>
                  </Td>
                  <Td className="!text-[var(--ink-3)]">{r.packBasis}</Td>
                </Tr>
              )
            })}
          </tbody>
        </Table>
      </Panel>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   3 · IMPACT — a rule change, priced against your fleet
   ═══════════════════════════════════════════════════════════════════════════ */

function ImpactSimulator() {
  const { pack, raw, tree, scenario, country, makers } = usePosition('actuals')
  const [shift, setShift] = useState(0)
  const [cnf, setCnf] = useState(true)
  const [cycle, setCycle] = useState(false)

  const under = useMemo(() => {
    const s = {
      ...baseScenario(country), year: scenario.year,
      targetShiftPct: shift || null,
      ...(country === 'IN' ? { cnfEnabled: cnf, cycleWltp: cycle } : {}),
    }
    return buildTree(raw, pack, s)
  }, [raw, pack, country, scenario.year, shift, cnf, cycle])

  const exposureNow = makers.reduce((a, m) => a + m.fine, 0)
  const exposureThen = (under.children ?? []).filter((c) => c.rawUnits > 0).reduce((a, c) => a + c.fine, 0)
  const overNow = makers.filter((m) => m.gap > 0).length
  const overThen = (under.children ?? []).filter((c) => c.rawUnits > 0 && c.gap > 0).length
  const dirty = shift !== 0 || !cnf || cycle

  const flips = useMemo(() => {
    const byName = new Map((under.children ?? []).map((c) => [c.label, c]))
    return makers
      .map((m) => ({ name: m.label, was: m.gap, now: byName.get(m.label)?.gap ?? m.gap }))
      .filter((r) => (r.was > 0) !== (r.now > 0))
  }, [makers, under])

  return (
    <div className="grid gap-4 xl:grid-cols-[352px_minmax(0,1fr)]">
      <Panel title="Express the change" icon={<Icon name="edit" size={14} />}
        sub="A pending instrument, stated as a delta against the loaded rule pack. Everything on the right is the engine re-deriving your position under it.">
        <div className="space-y-5">
          <div>
            <Slider label="Target stringency" value={shift} min={-30} max={30} step={1}
              format={(v) => (v === 0 ? 'as drafted' : `${v > 0 ? '+' : ''}${v}%`)}
              onChange={setShift} marks={[-20, -10, 0, 10, 20]} />
            <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--ink-4)]">
              Negative means the final rules land <b>tighter</b> than what the platform currently holds. This is the single most
              valuable question to ask about a draft.
            </p>
          </div>

          {country === 'IN' && (
            <>
              <Divider />
              <label className="flex cursor-pointer items-start gap-3">
                <input type="checkbox" checked={!cnf} onChange={(e) => setCnf(!e.target.checked)} className="mt-1" />
                <span>
                  <span className="block text-[12.5px] font-medium text-[var(--ink-1)]">Carbon-neutral-fuel discount is struck</span>
                  <span className="mt-0.5 block text-[11.5px] leading-relaxed text-[var(--ink-4)]">
                    Model the final norms dropping CNF treatment entirely.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3">
                <input type="checkbox" checked={cycle} onChange={(e) => setCycle(e.target.checked)} className="mt-1" />
                <span>
                  <span className="block text-[12.5px] font-medium text-[var(--ink-1)]">WLTP conversion applies, target unchanged</span>
                  <span className="mt-0.5 block text-[11.5px] leading-relaxed text-[var(--ink-4)]">
                    The transition cliff: measured consumption moves to the new cycle while the limit stays on the old basis.
                  </span>
                </span>
              </label>
            </>
          )}

          {dirty && (
            <Button size="sm" variant="ghost" icon={<Icon name="refresh" size={12} />}
              onClick={() => { setShift(0); setCnf(true); setCycle(false) }}>Back to as loaded</Button>
          )}
        </div>
      </Panel>

      <div className="space-y-4">
        <MetricRow>
          <Metric label="Fleet" value={<CountUp value={under.avgMetric} format={(v) => fmtNum(v, 1)} />} unit={pack.metricUnit}
            sub={`unchanged by a rule change${under.avgMetric !== tree.avgMetric ? ' — except where the change moves the metric itself' : ''}`} />
          <Metric label="Limit under the change" value={<CountUp value={under.limit} format={(v) => fmtNum(v, 1)} />} unit={pack.metricUnit}
            delta={Math.abs(under.limit - tree.limit) > 0.01 ? `${under.limit > tree.limit ? '+' : '−'}${fmtNum(Math.abs(under.limit - tree.limit), 1)}` : undefined}
            deltaTone={under.limit >= tree.limit ? 'pos' : 'neg'}
            sub={`as loaded: ${fmtNum(tree.limit, 1)}`} />
          <Metric label="Gap" value={<CountUp value={under.gap} format={(v) => `${v > 0 ? '+' : ''}${fmtNum(v, 1)}`} />} unit={pack.metricUnit}
            tone={under.gap > 0 ? 'neg' : 'pos'} sub={`as loaded: ${fmtNum(tree.gap, 1)}`} />
          <Metric label="Market exposure" value={<CountUp value={exposureThen} format={(v) => fmtMoney(v, pack.currency)} />}
            tone={exposureThen > exposureNow ? 'neg' : exposureThen < exposureNow ? 'pos' : undefined}
            delta={Math.abs(exposureThen - exposureNow) > 1
              ? `${exposureThen > exposureNow ? '+' : '−'}${fmtMoney(Math.abs(exposureThen - exposureNow), pack.currency)}`
              : undefined}
            deltaTone={exposureThen > exposureNow ? 'neg' : 'pos'}
            sub={`${overThen} of ${makers.length} over — was ${overNow}`} />
        </MetricRow>

        <Panel title="Who changes side" icon={<Icon name="users" size={14} />}
          sub="The manufacturers this change would move across the line, in either direction. These are the names that make a consultation response worth writing.">
          {flips.length ? (
            <Table>
              <thead><tr><Th>Manufacturer</Th><Th align="right">Gap as loaded</Th><Th align="right">Gap under the change</Th><Th>Effect</Th></tr></thead>
              <tbody>
                {flips.map((f) => (
                  <Tr key={f.name}>
                    <Td strong>{f.name}</Td>
                    <Td align="right"><span className={f.was > 0 ? 'text-[var(--neg-ink)]' : 'text-[var(--pos-ink)]'}>{f.was > 0 ? '+' : ''}{fmtNum(f.was, 1)}</span></Td>
                    <Td align="right"><span className={f.now > 0 ? 'text-[var(--neg-ink)]' : 'text-[var(--pos-ink)]'}>{f.now > 0 ? '+' : ''}{fmtNum(f.now, 1)}</span></Td>
                    <Td>
                      <Badge tone={f.now > 0 ? 'neg' : 'pos'} dot>
                        {f.now > 0 ? 'falls out of compliance' : 'comes into compliance'}
                      </Badge>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState compact icon={<Icon name="check" size={17} />}
              title={dirty ? 'Nobody changes side' : 'No change expressed yet'}
              body={dirty
                ? 'Every manufacturer stays on the side of the line it was already on. The change moves exposure, but not who is exposed.'
                : 'Move the stringency, or switch a provision off, and the manufacturers it would move appear here.'} />
          )}
        </Panel>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   The module
   ═══════════════════════════════════════════════════════════════════════════ */

type RTab = 'watchtower' | 'library' | 'radar' | 'instruments' | 'reconcile' | 'impact' | 'agent'
const TABS: RTab[] = ['watchtower', 'library', 'radar', 'instruments', 'reconcile', 'impact', 'agent']

export default function RegAIModule() {
  const { pack, scenario, country } = usePosition('actuals')
  const tracked = useApp((s) => s.regTracked)
  const cfg = useApp((s) => s.regWatch)
  const setCountry = useApp((s) => s.setCountry)
  const storedTab = useApp((s) => s.moduleTab.regai)
  const setStoredTab = useApp((s) => s.setModuleTab)
  // A tab id persisted by an older build (e.g. 'briefing') falls back to the front page.
  const tab: RTab = TABS.includes(storedTab as RTab) ? (storedTab as RTab) : 'watchtower'
  const setTab = (t: RTab) => setStoredTab('regai', t)
  const recon = reconciliationFor(country)
  const openGaps = recon ? reconSummary(recon).open : 0
  const [open, setOpen] = useState<Instrument | null>(null)
  const [reg, setReg] = useState<Regulation | null>(null)
  const regime = pack.regimeFor?.(scenario.year)

  const readReg = (r: Regulation) => {
    const first = instrumentsOf(r.id)[0]
    setReg(null)
    setCountry(r.market)
    if (first) setOpen(first)
    setTab('instruments')
  }

  return (
    <MotionConfig reducedMotion="user">
      <ModulePage wide
        title="Reg AI"
        sub="Every regulation that shapes your position — vehicle CO₂ and CAFE, CBAM, emissions trading, type-approval — tracked by market, read clause by clause, and watched by an agent you tune."
        actions={<AgentLauncher moduleId="regai" hint={`Run ${cfg.name} over the ${tracked.length} regulations you track`} />}
        toolbar={
          <Segmented value={tab} onChange={setTab}
            options={[
              { id: 'watchtower', label: 'Watchtower', icon: <Icon name="regai" size={13} />, hint: 'What you track, what bites next, what the watch found' },
              { id: 'library', label: <span>Library <span className="ml-0.5 tabular-nums text-[var(--ink-4)]">{tracked.length}</span></span>, icon: <Icon name="list" size={13} />, hint: 'Choose the regulations you track, by market' },
              { id: 'radar', label: 'Radar', icon: <Icon name="activity" size={13} />, hint: 'Tracked instruments on one timeline, by stage' },
              { id: 'instruments', label: 'Reader', icon: <Icon name="book" size={13} />, hint: 'The clause-level reader' },
              { id: 'reconcile', label: openGaps ? `Reconcile · ${openGaps}` : 'Reconcile', icon: <Icon name="shield" size={13} />, hint: 'What the loaded rule pack holds against what the current instrument says' },
              { id: 'impact', label: 'Impact', icon: <Icon name="target" size={13} />, hint: 'A change, priced against your own fleet' },
              { id: 'agent', label: 'Agent', icon: <Icon name="agent" size={13} />, hint: 'Tune the Regulatory watch' },
            ]} />
        }>

        {regime?.draft && (tab === 'radar' || tab === 'instruments' || tab === 'impact') && (
          <Callout className="mb-4" tone="warn" icon={<Icon name="alert" size={15} />}
            title={`${regime.name} is drafted, not notified`}>
            The limits the platform holds for {scenario.year} are the draft trajectory. Until the norms are notified they can move — which is
            exactly what the Impact tab is for.
            {tab !== 'impact' && <Button className="ml-2" size="xs" variant="secondary" onClick={() => setTab('impact')}>Price the risk</Button>}
          </Callout>
        )}

        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={tab} variants={page} initial="hidden" animate="show" exit="exit">
            {tab === 'watchtower' && <Watchtower onOpen={setReg} goTo={setTab} />}
            {tab === 'library' && <Library onOpen={setReg} />}
            {tab === 'radar' && <Radar onOpen={(i) => { setOpen(i); setTab('instruments') }} goLibrary={() => setTab('library')} />}
            {tab === 'instruments' && <InstrumentReader open={open} setOpen={setOpen} goLibrary={() => setTab('library')} />}
            {tab === 'reconcile' && <Reconcile />}
            {tab === 'impact' && <ImpactSimulator />}
            {tab === 'agent' && <AgentStudio goTo={setTab} />}
          </motion.div>
        </AnimatePresence>

        <RegDrawer reg={reg} onClose={() => setReg(null)} onRead={readReg} />
      </ModulePage>
    </MotionConfig>
  )
}
