/* ───────────────────────────────────────────────────────────────────────────
   FORECAST — the next five years, built from evidence.
   ---------------------------------------------------------------------------
   A forecast is not a trend line. It is a small set of NAMED ASSUMPTIONS, each
   with an owner, a source and a number you can argue with, plus everything that
   follows from them. So the Assumption Book is the primary object here and the
   charts are downstream of it — change a driver and everything re-derives.

   What the syndicated houses cannot give you, and this does:

     · your own fleet through the actual rule pack, per manufacturer
     · a board of weighted cases with stated falsifiers, not a high/low pair
     · a distribution produced by sampling the assumptions and re-running the
       real engine, not a confidence interval bolted onto a point estimate
     · a live evidence feed where every revision carries the article that caused
       it, dated, into the Assumption Book
   ─────────────────────────────────────────────────────────────────────────── */
import React, { useMemo, useState } from 'react'
import {
  Badge, Button, Callout, CountUp, cx, EmptyState, Metric, MetricRow, Panel,
  Segmented, Tooltip,
} from '../../design/primitives'
import Icon from '../../design/icons'
import { DV, LineChart, Waterfall } from '../../design/charts'
import { ModulePage } from '../../shell/AppShell'
import { AgentLauncher } from '../../agents/ui/AgentConsole'
import { useApp, useDriverBook } from '../../state/appStore'
import { MenuItem, Popover } from '../../design/primitives'
import { usePosition } from '../../state/usePosition'
import { buildTree, fmtMoney, fmtNum } from '../../../engine/engine'
import { bridgeYear, outlookRun } from '../../../engine/outlook'
import { ManufacturerOutlook, MixAndTechnology, Sensitivity } from './analysis'
import { ComplianceBlocks } from './blocks'
import { blocksFor } from '../../../engine/blocks'
import { AssumptionBook, CaseBoard, Distribution, EvidenceFeed } from './board'
import { applyCase, normalisedWeights } from './cases'

type Tab = 'outlook' | 'board' | 'blocks' | 'makers' | 'mix' | 'sensitivity' | 'evidence'

export default function ForecastModule() {
  const { pack, raw, scenario, country, makers } = usePosition('working')
  const target = useApp((s) => s.forecastTarget[country]) ?? null
  const setTarget = useApp((s) => s.setForecastTarget)
  const book = useDriverBook(country, target)

  // Scoping is a row filter, so the maker's own limit and its own charge are
  // still what the engine computes. A "share of a market forecast" would be a
  // different and much less useful number.
  const scopedRows = useMemo(() => (target ? raw.filter((v) => v.parent === target) : raw), [raw, target])
  const cases = useApp((s) => s.cases)
  const evidence = useApp((s) => s.evidence)
  const storedTab = useApp((s) => s.moduleTab.forecast)
  const setStoredTab = useApp((s) => s.setModuleTab)
  const tab = (storedTab as Tab) ?? 'outlook'
  const setTab = (t: Tab) => setStoredTab('forecast', t)
  const [view, setView] = useState<'line' | 'exposure'>('line')

  const horizon = useMemo(
    () => pack.years.filter((y) => y >= scenario.year).slice(0, 6),
    [pack.years, scenario.year],
  )

  /** One case, projected across the horizon. Every figure comes from the same
   *  engine the Plan screen uses — the assumptions only change its inputs. */
  const project = useMemo(() => (drivers: typeof book) => {
    const run = outlookRun({ raw: scopedRows, pack, drivers, vintageYear: scenario.year })
    return horizon.map((y) => {
      const t = buildTree(run.fleetForYear(y), pack, run.scenarioFor(y))
      return {
        year: y, metric: t.avgMetric, limit: t.limit, gap: t.gap,
        fine: (t.children ?? []).reduce((a, c) => a + c.fine, 0),
        units: t.rawUnits, ze: run.shareFor(y),
      }
    })
  }, [scopedRows, pack, scenario.year, horizon])

  const base = useMemo(() => project(book), [project, book])
  const byCase = useMemo(() => cases.map((c) => ({ c, series: project(applyCase(book, c)) })), [cases, book, project])
  const w = normalisedWeights(cases)

  const last = base[base.length - 1]
  const first = base[0]
  const cumulative = base.reduce((a, y) => a + y.fine, 0)
  const breachYear = base.find((y) => y.gap > 0)?.year ?? null

  // The band on the outlook chart is the board's own envelope — the best and
  // worst case anyone on this workspace actually put a weight against, rather
  // than a decorative ±10%.
  const envelope = useMemo(() => ({
    lower: horizon.map((_, i) => Math.min(...byCase.map((b) => b.series[i].metric))),
    upper: horizon.map((_, i) => Math.max(...byCase.map((b) => b.series[i].metric))),
    label: 'Case envelope',
  }), [byCase, horizon])

  const expected = byCase.reduce((a, b) => a + b.series.reduce((x, y) => x + y.fine, 0) * w[b.c.id], 0)

  const bridge = useMemo(() => {
    const candidates = horizon.slice(1)
    const y = (breachYear && breachYear !== horizon[0] ? breachYear : null) ?? candidates[Math.min(1, candidates.length - 1)]
    return y ? bridgeYear({ raw: scopedRows, pack, drivers: book, vintageYear: scenario.year }, y) : null
  }, [breachYear, horizon, scopedRows, pack, book, scenario.year])

  const pendingEvidence = evidence.filter((e) => e.market === country && e.status === 'new').length
  // Only offer the tab where the regime actually has blocks — an empty tab that
  // says "not applicable" is a tab that trains people to skip it.
  const hasBlocks = blocksFor(pack).length > 0
  const money = (v: number) => fmtMoney(v, pack.currency)

  return (
    <ModulePage wide
      title="Forecast"
      sub={target
        ? `Where ${target} lands over the next ${horizon.length} years in ${pack.name} — its own fleet, its own mass-adjusted limit, its own charge. Not a share of a market number.`
        : `Where ${pack.name} takes you over the next ${horizon.length} years, from assumptions you can name, source and argue with.`}
      actions={
        <>
          <Popover align="end" width={286}
            trigger={({ toggle }) => (
              <button onClick={toggle}
                className="flex items-center gap-2 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-1)] px-2.5 py-[7px] transition-colors hover:border-[var(--line-strong)]">
                <Icon name={target ? 'user' : 'globe'} size={13} className="text-[var(--ink-4)]" />
                <span className="max-w-[210px] truncate text-[12.5px] font-medium text-[var(--ink-1)]">
                  {target ?? `${pack.name} — whole market`}
                </span>
                <Icon name="chevronDown" size={12} className="text-[var(--ink-5)]" />
              </button>
            )}>
            {({ close }) => (
              <>
                <div className="t-label px-2.5 py-1.5">Forecast scope</div>
                <MenuItem icon={<Icon name="globe" size={13} />} onClick={() => { setTarget(country, null); close() }}
                  sub={`All ${makers.length} compliance entities on one line`}>
                  {pack.name} — whole market
                </MenuItem>
                <div className="my-1 h-px bg-[var(--line-soft)]" />
                <div className="max-h-[280px] overflow-y-auto">
                  {makers.map((m) => (
                    <MenuItem key={m.key} icon={<Icon name={target === m.label ? 'check' : 'user'} size={13} />}
                      sub={`${fmtNum(m.avgMetric, 1)} / ${fmtNum(m.limit, 1)} ${pack.metricUnit} today`}
                      onClick={() => { setTarget(country, m.label); close() }}>
                      {m.label}
                    </MenuItem>
                  ))}
                </div>
              </>
            )}
          </Popover>
          <AgentLauncher moduleId="forecast" hint="Search the live feed and propose sourced revisions" />
        </>
      }>

      <Segmented className="mb-4" value={tab} onChange={setTab}
        options={[
          { id: 'outlook', label: 'Outlook', icon: <Icon name="forecast" size={13} />, hint: 'The line, and what moves it' },
          { id: 'board', label: 'Scenario board', icon: <Icon name="layers" size={13} />, hint: 'Weighted cases and the distribution' },
          ...(hasBlocks ? [{ id: 'blocks' as const, label: 'Blocks', icon: <Icon name="shield" size={13} />, hint: 'Multi-year compliance — the years the block rescues' }] : []),
          { id: 'makers', label: 'Manufacturers', icon: <Icon name="users" size={13} />, hint: 'Every entity against its own limit' },
          { id: 'mix', label: 'Mix & technology', icon: <Icon name="grid" size={13} />, hint: 'The trajectory, and the share you actually need' },
          { id: 'sensitivity', label: 'Sensitivity', icon: <Icon name="activity" size={13} />, hint: 'Which assumption moves the answer' },
          { id: 'evidence', label: pendingEvidence ? `Evidence · ${pendingEvidence}` : 'Evidence', icon: <Icon name="globe" size={13} />, hint: 'The live feed the analyst maintains' },
        ]} />

      {target && (
        <Callout className="mb-4" tone="info" icon={<Icon name="user" size={14} />}
          title={`Scoped to ${target}`}
          actions={<Button size="xs" variant="secondary" onClick={() => setTarget(country, null)}>Back to the market</Button>}>
          Every figure below is this manufacturer’s own: its fleet, its mass-adjusted limit, its charge. The Assumption Book still
          shows the {pack.name} market view unless you fork one for {target}.
        </Callout>
      )}

      <div key={`${tab}:${target ?? 'market'}`} className="anim-in">
        {tab === 'blocks' && <ComplianceBlocks target={target} />}
        {tab === 'makers' && <ManufacturerOutlook drivers={book} years={horizon} />}
        {tab === 'mix' && <MixAndTechnology drivers={book} years={horizon} target={target} />}
        {tab === 'sensitivity' && <Sensitivity drivers={book} years={horizon} target={target} />}
        {tab === 'evidence' && (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
            <EvidenceFeed target={target} />
            <AssumptionBook target={target} />
          </div>
        )}

        {tab === 'board' && (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
            <div className="space-y-4">
              <CaseBoard years={horizon} target={target} />
              <Distribution years={horizon} target={target} />
            </div>
            <div className="space-y-4">
              <AssumptionBook target={target} />
              <EvidenceFeed compact target={target} />
            </div>
          </div>
        )}

        {tab === 'outlook' && (
          <>
            <MetricRow className="mb-4">
              <Metric label={`${last?.year} fleet`} value={<CountUp value={last?.metric ?? 0} format={(v) => fmtNum(v, 1)} />}
                unit={pack.metricUnit} sub={`from ${fmtNum(first?.metric ?? 0, 1)} in ${first?.year}`} />
              <Metric label={`${last?.year} limit`} value={<CountUp value={last?.limit ?? 0} format={(v) => fmtNum(v, 1)} />}
                unit={pack.metricUnit} sub="tightens on the notified trajectory" />
              <Metric label="First breach" value={breachYear ?? 'None'} tone={breachYear ? 'neg' : 'pos'}
                sub={breachYear ? 'on the house view' : 'compliant across the horizon'} />
              <Metric label="House-view exposure" value={<CountUp value={cumulative} format={money} />}
                tone={cumulative > 0 ? 'neg' : undefined} sub={`${horizon.length} years, before weighting`} />
              <Metric label="Weighted exposure" value={<CountUp value={expected} format={money} />}
                tone={expected > cumulative ? 'neg' : expected < cumulative ? 'pos' : undefined}
                sub={`across ${cases.length} weighted cases`}
                hint="The expectation across the scenario board. This is the figure a board paper should quote." />
            </MetricRow>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
              <div className="space-y-4">
                <Panel
                  title="Projection"
                  sub={view === 'line'
                    ? 'The house view against the limit. The band is the envelope of every case on the scenario board — the range someone has actually put a weight against.'
                    : 'Exposure per year, house view against the weighted expectation.'}
                  icon={<Icon name="forecast" size={14} />}
                  actions={
                    <>
                      <Segmented size="sm" value={view} onChange={setView}
                        options={[{ id: 'line', label: 'Position' }, { id: 'exposure', label: 'Exposure' }]} />
                      <Button size="xs" variant="ghost" onClick={() => setTab('board')} iconRight={<Icon name="arrowRight" size={11} />}>
                        Board
                      </Button>
                    </>
                  }>
                  {view === 'line' ? (
                    <LineChart
                      x={horizon} unit={pack.metricUnit} height={278}
                      series={[{ name: 'House view', points: base.map((b) => b.metric), color: DV[0] }]}
                      band={envelope}
                      refLine={base.map((b) => b.limit)}
                      refLabel="Regulatory limit" />
                  ) : (
                    <LineChart
                      x={horizon} unit={pack.currency} height={278} yZero format={money}
                      series={[
                        { name: 'House view', points: base.map((b) => b.fine), color: DV[0], area: true },
                        { name: 'Weighted expectation', points: horizon.map((_, i) => byCase.reduce((a, b) => a + b.series[i].fine * w[b.c.id], 0)), color: 'var(--ink-1)', dashed: true },
                      ]} />
                  )}
                </Panel>

                {bridge && (
                  <Panel title={`What moves exposure into ${bridge.year}`}
                    sub="Sequential attribution, in the order the effects are applied: regulation first, then volume, technology and mix."
                    icon={<Icon name="activity" size={14} />}>
                    <Waterfall
                      height={230} format={money}
                      steps={[
                        { label: `${bridge.year - 1}`, value: bridge.from, kind: 'start' },
                        ...bridge.effects.map((e) => ({ label: e.label, value: e.delta })),
                        { label: `${bridge.year}`, value: bridge.to, kind: 'end' },
                      ]} />
                    {Math.abs(bridge.residual) > 1 && (
                      <p className="mt-2 text-[11px] text-[var(--ink-4)]">
                        Unattributed residual {money(bridge.residual)} — the effects are sequential, so interaction terms land here.
                      </p>
                    )}
                  </Panel>
                )}
              </div>

              <div className="space-y-4">
                <AssumptionBook target={target} />
                <EvidenceFeed compact target={target} />
                <Callout tone="info" icon={<Icon name="shield" size={14} />} title="What this forecast is not">
                  It is the consequence of four stated assumptions, not a prediction. Publishing it to the planning basis needs the
                  <b> forecast.publish</b> permission, and the Assumption Book travels with it — so a plan can always be re-litigated
                  on its inputs rather than its output.
                </Callout>
              </div>
            </div>
          </>
        )}
      </div>
    </ModulePage>
  )
}
