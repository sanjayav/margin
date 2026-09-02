/* ───────────────────────────────────────────────────────────────────────────
   PLAN — the book of record.
   ---------------------------------------------------------------------------
   This module answers three questions and refuses to answer any others:

     1. WHERE ARE WE?    The current year and the one before it, as sold. No
                         levers reach this screen — the basis is pinned to
                         'actuals' in code, not by a toggle someone can forget.
     2. HOW FRESH IS IT? A compliance position is only as true as its last
                         refresh. The freshness strip is the first thing on the
                         page because a stale position is a wrong position, and
                         the usual failure is not a bad number — it is a good
                         number from six weeks ago.
     3. WHO IS EXPOSED?  The hierarchy, from the pool level down. A regime that
                         assesses pools assesses them first; drilling to a
                         manufacturer, a model and a variant is how you find the
                         handful of rows that move the average.

   The Position monitor agent works this screen: it watches the sources,
   re-derives the hierarchy and raises what changed.
   ─────────────────────────────────────────────────────────────────────────── */
import React, { useEffect, useMemo, useState } from 'react'
import {
  Badge, Button, Callout, Card, CountUp, cx, EmptyState, Metric, MetricRow, Panel,
  Segmented, StatusDot, Table, Td, Th, Tooltip, Tr, fmtCompact, fmtGap, relTime,
} from '../../design/primitives'
import Icon from '../../design/icons'
import { GaugeBar, Sparkline } from '../../design/charts'
import { PositionWorkbench } from './workbench'
import { ModulePage } from '../../shell/AppShell'
import { AgentLauncher } from '../../agents/ui/AgentConsole'
import { FindingCard } from '../../agents/ui/RunTrace'
import { useApp } from '../../state/appStore'
import { actualsYears, entityExposure, settledThrough, usePosition, useSeries } from '../../state/usePosition'
import { fmtInt, fmtMoney, fmtNum, monthlyCompliance, monthsFiled } from '../../../engine/engine'
import type { Aggregate } from '../../../engine/types'

/* ── freshness ────────────────────────────────────────────────────────────── */

/** Expected refresh cadence per market, in days. A source that has not moved
 *  within its own window is the finding, whatever the number says. */
const CADENCE_DAYS: Record<string, number> = { EU: 90, IN: 30, UK: 90, AU: 90, CN: 30 }

function freshness(lastRefreshed: string | null, country: string) {
  const window = CADENCE_DAYS[country] ?? 30
  if (!lastRefreshed) return { tone: 'warn' as const, label: 'Never refreshed', days: null, window }
  const days = Math.floor((Date.now() - new Date(lastRefreshed).getTime()) / 86400000)
  if (days <= window * 0.7) return { tone: 'pos' as const, label: 'Current', days, window }
  if (days <= window) return { tone: 'warn' as const, label: 'Due soon', days, window }
  return { tone: 'neg' as const, label: 'Overdue', days, window }
}

function FreshnessStrip() {
  const { pack, meta, country, raw, scenario } = usePosition('actuals')
  const f = freshness(meta.lastRefreshed, country)
  const filed = monthsFiled(raw, scenario.year)
  const total = 12
  return (
    <Card flush className="mb-4 overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <StatusDot tone={f.tone} pulse={f.tone === 'neg'} size={8} />
          <div>
            <div className="t-label">Data freshness</div>
            <div className="mt-0.5 text-[12.5px] font-semibold text-[var(--ink-1)]">
              {f.label}
              <span className="ml-1.5 font-normal text-[var(--ink-4)]">
                {f.days == null ? 'bundled extract' : `${f.days}d since refresh · ${f.window}d window`}
              </span>
            </div>
          </div>
        </div>

        <span className="h-8 w-px bg-[var(--line)]" />

        <div>
          <div className="t-label">Filing progress</div>
          <div className="mt-1 flex items-center gap-2">
            <span className="flex gap-[2px]">
              {Array.from({ length: total }, (_, i) => (
                <Tooltip key={i} content={`Month ${i + 1} · ${i < filed ? 'filed' : 'not yet filed'}`}>
                  <span className={cx('h-[13px] w-[7px] rounded-[2px]', i < filed ? 'bg-[var(--pos)]' : 'bg-[var(--surface-3)]')} />
                </Tooltip>
              ))}
            </span>
            <span className="text-[12px] font-semibold tabular-nums text-[var(--ink-1)]">{filed}/{total}</span>
          </div>
        </div>

        <span className="h-8 w-px bg-[var(--line)]" />

        <div className="min-w-0 flex-1">
          <div className="t-label">Source</div>
          <div className="mt-0.5 truncate text-[12px] text-[var(--ink-2)]" title={pack.source}>
            {meta.source || pack.source}
            <span className="ml-1.5 text-[var(--ink-4)]">· version {meta.datasetVersion || 'bundled'}</span>
          </div>
        </div>

        <Badge tone={pack.coverage.tier === 'market' ? 'pos' : pack.coverage.tier === 'partial' ? 'warn' : 'neutral'}>
          {pack.coverage.tier === 'market' ? 'Market data' : pack.coverage.tier === 'partial' ? 'Covered scope' : 'Preview data'}
        </Badge>
      </div>
      {f.tone === 'neg' && (
        <div className="border-t border-[var(--line-soft)] bg-[var(--warn-tint)] px-4 py-2 text-[11.5px] text-[var(--warn-ink)]">
          This position is computed from data past its refresh window. Treat it as indicative until the source is updated.
        </div>
      )}
    </Card>
  )
}

/* ── hierarchy ────────────────────────────────────────────────────────────── */

const LEVEL_LABEL: Record<string, string> = {
  fleet: 'Market', pool: 'Pool', parent: 'Manufacturer', model: 'Model', variant: 'Variant', powertrain: 'Powertrain',
}

function HierarchyRow({ node, depth, expanded, onToggle, unit, currency, selected, hovered, onSelect, onHover }: {
  node: Aggregate; depth: number; expanded: Set<string>; onToggle: (k: string) => void; unit: string; currency: string
  selected: string | null; hovered: string | null
  onSelect: (k: string | null) => void; onHover: (k: string | null) => void
}) {
  const open = expanded.has(node.key)
  const kids = node.children ?? []
  const over = node.gap > 0
  // Fines are per compliance entity, so a market or pool row shows the SUM of
  // its manufacturers' fines — not the fine it would owe as a single entity.
  const exposure = entityExposure(node)
  return (
    <>
      <Tr
        data-node={node.key}
        interactive
        selected={selected === node.key}
        className={hovered === node.key && selected !== node.key ? 'bg-[var(--surface-2)]' : undefined}
        onMouseEnter={() => onHover(node.key)}
        onMouseLeave={() => onHover(null)}
        onClick={() => { onSelect(selected === node.key ? null : node.key); if (kids.length) onToggle(node.key) }}>
        <Td>
          <span className="flex items-center gap-1.5" style={{ paddingLeft: depth * 15 }}>
            {kids.length
              ? <Icon name="chevron" size={11} className={cx('shrink-0 text-[var(--ink-5)] transition-transform', open && 'rotate-90')} />
              : <span className="w-[11px] shrink-0" />}
            <Tooltip content={`${fmtInt(node.rawUnits)} registrations · ${LEVEL_LABEL[node.level]}`}>
              <span className={cx('truncate', depth === 0 ? 'font-semibold text-[var(--ink-1)]' : 'text-[var(--ink-2)]')}>{node.label}</span>
            </Tooltip>
            {depth <= 1 && <span className="shrink-0 text-[10px] uppercase tracking-[.05em] text-[var(--ink-5)]">{LEVEL_LABEL[node.level]}</span>}
          </span>
        </Td>
        <Td align="right" strong>{fmtNum(node.avgMetric, 1)}</Td>
        <Td align="right">{fmtNum(node.limit, 1)}</Td>
        <Td align="right">
          <span className={cx('font-semibold', over ? 'text-[var(--neg-ink)]' : 'text-[var(--pos-ink)]')}>{fmtGap(node.gap)}</span>
        </Td>
        <Td align="right">
          {exposure > 0
            ? <span className="font-semibold text-[var(--neg-ink)]">{fmtMoney(exposure, currency)}</span>
            : <span className="text-[var(--ink-5)]">—</span>}
        </Td>
        <Td align="center">
          <Tooltip content={node.status === 'fine' ? 'Over the line' : node.status === 'compliant' ? 'Inside the line' : node.status}>
            <span className="inline-flex"><StatusDot size={7} tone={node.status === 'fine' ? 'neg' : node.status === 'compliant' ? 'pos' : 'neutral'} /></span>
          </Tooltip>
        </Td>
      </Tr>
      {open && kids.map((k) => (
        <HierarchyRow key={k.key} node={k} depth={depth + 1} expanded={expanded} onToggle={onToggle}
          unit={unit} currency={currency}
          selected={selected} hovered={hovered} onSelect={onSelect} onHover={onHover} />
      ))}
    </>
  )
}

function Hierarchy({ path, selected, hovered, setSelected, setHovered }: {
  path: string[]; selected: string | null; hovered: string | null
  setSelected: (k: string | null) => void; setHovered: (k: string | null) => void
}) {
  const { drill, pack } = usePosition('actuals')
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([drill.key]))
  const toggle = (k: string) => setExpanded((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })

  // Drilling the map opens the same branch here, so the two panels are always
  // describing the same thing. Selecting a bubble scrolls its row into view.
  useEffect(() => {
    if (!path.length) return
    setExpanded((s) => new Set([...s, drill.key, ...path]))
  }, [path, drill.key])
  useEffect(() => {
    if (!selected) return
    const el = document.querySelector(`[data-node="${CSS.escape(selected)}"]`)
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selected])

  const expandAll = () => {
    const keys = new Set<string>()
    const walk = (n: Aggregate, d: number) => { if (d < 2) { keys.add(n.key); (n.children ?? []).forEach((c) => walk(c, d + 1)) } }
    walk(drill, 0)
    setExpanded(keys)
  }

  return (
    <Panel flush
      title="Compliance hierarchy"
      sub={`From the pool level down. Volume is on the entity name. ${pack.classSeparateCompliance ? 'Each vehicle class is its own obligation here — class positions do not net.' : 'One blended fleet obligation.'}`}
      icon={<Icon name="layers" size={14} />}
      bodyClass="!p-0"
      actions={
        <>
          <Button size="xs" variant="ghost" onClick={expandAll}>Expand</Button>
          <Button size="xs" variant="ghost" onClick={() => setExpanded(new Set([drill.key]))}>Collapse</Button>
        </>
      }>
      <div className="max-h-[520px] overflow-auto">
        <Table>
          <thead>
            <tr>
              <Th>Entity</Th>
              <Th align="right">Fleet {pack.metricUnit}</Th>
              <Th align="right">Limit</Th>
              <Th align="right">Gap</Th>
              <Th align="right">Exposure</Th>
              <Th align="center" className="!w-9" />
            </tr>
          </thead>
          <tbody>
            <HierarchyRow node={drill} depth={0} expanded={expanded} onToggle={toggle}
              unit={pack.metricUnit} currency={pack.currency}
              selected={selected} hovered={hovered} onSelect={setSelected} onHover={setHovered} />
          </tbody>
        </Table>
      </div>
    </Panel>
  )
}

/* ── the reporting period ─────────────────────────────────────────────────── */

/** Is the previous year a genuinely different year of data, or the same
 *  registrations carried forward?
 *
 *  Several of these datasets hold ONE year of registrations and let the engine
 *  project it across the rule pack's years. Where that is the case a
 *  year-on-year comparison is not "no change" — it is not a comparison at all,
 *  and reporting it as 0.0% would be a fabricated finding. */
function useDistinctPrevious(current: number, previous: number | null) {
  const { raw } = usePosition('actuals')
  return useMemo(() => {
    if (previous == null) return false
    const stat = (y: number) => {
      const rows = raw.filter((v) => v.year === y)
      const units = rows.reduce((a, v) => a + v.sales, 0)
      const metric = units ? rows.reduce((a, v) => a + v.co2 * v.sales, 0) / units : 0
      return { units, metric, n: rows.length }
    }
    const a = stat(current), b = stat(previous)
    if (!b.units) return false
    const same = Math.abs(a.units - b.units) < 1 && Math.abs(a.metric - b.metric) < 1e-6 && a.n === b.n
    return !same
  }, [raw, current, previous])
}

/** Plan reads the book of record, so it may only offer years that have actually
 *  been filed. The rule pack's `years` are the years it can COMPUTE — most of
 *  these datasets carry forward rows in the same file as the history, and
 *  reading one of those as "the position you would file today" is the single
 *  worst mistake this product could make. */
function PeriodBar() {
  const { pack, country, scenario, raw } = usePosition('actuals')
  const patch = useApp((s) => s.patchScenario)
  const { current, previous } = useMemo(() => actualsYears(country), [country])
  const distinct = useDistinctPrevious(current, previous)
  const projected = scenario.year > current

  // A year past the settled line is not a filing, so Plan refuses to show one.
  useEffect(() => {
    if (scenario.year > current) patch({ year: current })
  }, [scenario.year, current]) // eslint-disable-line react-hooks/exhaustive-deps

  const filed = monthsFiled(raw, current)
  const partYear = filed > 0 && filed < 12
  const forward = pack.years.filter((y) => y > current)

  const options: { id: string; label: React.ReactNode; hint?: string; disabled?: boolean }[] = [
    { id: String(current), label: <>Current year <b className="ml-1 tabular-nums">{current}</b></>, hint: partYear ? `${filed} of 12 months filed` : 'the latest settled year' },
  ]
  if (previous != null) {
    options.push({
      id: String(previous),
      label: <>Previous year <b className="ml-1 tabular-nums">{previous}</b></>,
      hint: distinct ? 'the last complete year' : 'this source carries one year of registrations — not a separate year of data',
      disabled: !distinct,
    })
  }

  return (
    <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-2">
      <span className="t-label !mb-0">Reporting period</span>
      <Segmented value={String(Math.min(scenario.year, current))} onChange={(v) => patch({ year: Number(v) })} options={options as never} />
      {partYear && <Badge tone="warn" dot>part-year · {filed}/12 filed</Badge>}
      {!distinct && previous != null && (
        <Tooltip content="This market's source holds a single year of registrations. A year-on-year comparison would be comparing the file with itself.">
          <span className="inline-flex"><Badge tone="neutral">no prior year in this source</Badge></span>
        </Tooltip>
      )}
      {forward.length > 0 && (
        <span className="ml-auto text-[11px] text-[var(--ink-4)]">
          {forward[0]}–{forward[forward.length - 1]} are forward rows —{' '}
          <button onClick={() => useApp.getState().setModule('forecast')} className="underline underline-offset-2 hover:text-[var(--ink-2)]">
            they live in Forecast
          </button>
        </span>
      )}
      {projected && (
        <Callout className="w-full" tone="warn" icon={<Icon name="alert" size={14} />}
          title={`${scenario.year} is a projected year, not a filed one`}>
          Plan is the book of record, so it has moved to {current} — the latest year with settled actuals. The forward years in this
          dataset are the source's own plan rows, and they belong in Forecast.
        </Callout>
      )}
    </div>
  )
}

/* ── year on year ─────────────────────────────────────────────────────────── */

function YearOnYear() {
  const { pack, scenario, country } = usePosition('actuals')
  const year = Math.min(scenario.year, settledThrough(country))
  const prevYear = pack.years.filter((y) => y < year).slice(-1)[0] ?? null
  const distinct = useDistinctPrevious(year, prevYear)
  const prev = distinct ? prevYear : null
  const years = useMemo(() => (prev ? [prev, year] : [year]), [prev, year])
  const rows = useSeries(years, 'actuals')
  const now = rows[rows.length - 1]
  const was = rows.length > 1 ? rows[0] : null

  const delta = (a: number, b: number) => (b === 0 ? 0 : ((a - b) / Math.abs(b)) * 100)

  return (
    <MetricRow className="mb-4">
      <Metric label={pack.metricLabel} value={<CountUp value={now.metric} format={(v) => fmtNum(v, 1)} />} unit={pack.metricUnit}
        delta={was ? `${delta(now.metric, was.metric) >= 0 ? '+' : '−'}${Math.abs(delta(now.metric, was.metric)).toFixed(1)}%` : undefined}
        deltaTone={was ? (now.metric <= was.metric ? 'pos' : 'neg') : undefined}
        sub={was ? `${prev}: ${fmtNum(was.metric, 1)}` : 'no prior year of registrations in this source'} />
      <Metric label="Regulatory limit" value={<CountUp value={now.limit} format={(v) => fmtNum(v, 1)} />} unit={pack.metricUnit}
        sub={pack.limitNote.length > 46 ? `${pack.limitNote.slice(0, 46)}…` : pack.limitNote}
        hint={pack.limitNote} />
      <Metric label="Gap to limit" value={<CountUp value={now.gap} format={(v) => fmtGap(v)} />} unit={pack.metricUnit}
        tone={now.gap > 0 ? 'neg' : 'pos'}
        sub={Math.abs(now.gap) < 0.05
          ? (now.gap > 0 ? 'over the line, but only just' : 'inside the line, but only just')
          : now.gap > 0 ? 'over the line' : 'headroom'} />
      <Metric label="Exposure" value={<CountUp value={now.fine} format={(v) => fmtMoney(v, pack.currency)} />}
        tone={now.fine > 0 ? 'neg' : undefined}
        sub={pack.fineRateLabel} />
      <Metric label="Registrations" value={<CountUp value={now.units} format={(v) => fmtInt(v)} />}
        delta={was ? `${delta(now.units, was.units) >= 0 ? '+' : '−'}${Math.abs(delta(now.units, was.units)).toFixed(0)}%` : undefined}
        deltaTone="neutral"
        sub={`zero-emission ${(now.zev * 100).toFixed(1)}%`} />
    </MetricRow>
  )
}

/* ── the position, drawn ──────────────────────────────────────────────────── */

/** A four-year shape for one manufacturer, drawn against its own limit line. */
function MakerSpark({ maker, years }: { maker: string; years: number[] }) {
  const rows = useSeries(years, 'actuals')
  const { raw, pack } = usePosition('actuals')
  const pts = useMemo(() => years.map((y) => {
    const rowsY = raw.filter((v) => v.year === y && v.parent === maker)
    if (!rowsY.length) return null
    const units = rowsY.reduce((a, v) => a + v.sales, 0)
    if (!units) return null
    return rowsY.reduce((a, v) => a + v.co2 * v.sales, 0) / units
  }), [raw, maker, years])
  const clean = pts.filter((p): p is number => p != null)
  if (clean.length < 2) return <span className="text-[var(--ink-5)]">—</span>
  return <Sparkline points={clean} refLevel={rows[rows.length - 1]?.limit} tone={clean[clean.length - 1] > (rows[rows.length - 1]?.limit ?? 0) ? 'var(--neg)' : 'var(--pos)'} />
}

/* ── the module ───────────────────────────────────────────────────────────── */

export default function PlanModule() {
  const runs = useApp((s) => s.runs)
  const setConsole = useApp((s) => s.setConsole)
  const { pack, scenario, country } = usePosition('actuals')

  // Shared between the map and the hierarchy so the two panels are always
  // describing the same entity. Reset when the market or the year changes —
  // a drill path from India means nothing in the EU.
  const [path, setPath] = useState<string[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  useEffect(() => { setPath([]); setSelected(null) }, [country, scenario.year])

  // The last completed monitor run supplies this screen's exception list.
  const lastRun = runs.find((r) => r.agentId === 'plan.monitor' && r.findings.length > 0)

  return (
    <ModulePage wide
      title="Plan"
      sub={`The book of record for ${pack.name}. Settled actuals only — the current year and the one before it, as sold, with no assumptions and no levers. This is the position you would file today.`}
      actions={<AgentLauncher moduleId="plan" hint="Re-check freshness and re-derive the hierarchy" />}
      toolbar={<PeriodBar />}>

      <FreshnessStrip />
      <YearOnYear />

      {lastRun && (
        <section className="mb-4">
          <div className="mb-2 flex items-center gap-2">
            <Icon name="agent" size={13} className="text-[var(--agent)]" />
            <span className="t-label !text-[var(--agent-ink)]">Position monitor · {lastRun.findings.length} exception{lastRun.findings.length === 1 ? '' : 's'}</span>
            <button onClick={() => { useApp.getState().setActiveRun(lastRun.id); setConsole(true) }}
              className="text-[11px] text-[var(--ink-4)] underline-offset-2 hover:text-[var(--ink-2)] hover:underline">
              see the working
            </button>
            <span className="ml-auto text-[11px] text-[var(--ink-5)]">{relTime(lastRun.startedAt)}</span>
          </div>
          <div className="grid gap-2 lg:grid-cols-2">
            {lastRun.findings.slice(0, 4).map((f) => <FindingCard key={f.id} f={f} />)}
          </div>
        </section>
      )}

      <div className="mb-4">
        <PositionWorkbench path={path} setPath={setPath} selected={selected} setSelected={setSelected}
          hovered={hovered} setHovered={setHovered} />
      </div>

      <Hierarchy path={path} selected={selected} hovered={hovered} setSelected={setSelected} setHovered={setHovered} />

      <Callout tone="neutral" className="mt-4" icon={<Icon name="lock" size={14} />} title="Why nothing here is adjustable, and why the years stop where they do">
        Plan is pinned to the actuals basis in code: levers, overrides and agent proposals cannot reach it. It is also pinned to the
        <b> settled years</b> — the latest filed year and the one before it. Most of these datasets carry the source's own forward rows in
        the same file as the history, and nothing in the shape of a row says which is which; reading one of those here would present a
        plan as a filing. Those years live in Forecast, where they are labelled as what they are.
      </Callout>
    </ModulePage>
  )
}
