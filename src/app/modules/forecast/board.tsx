/* ───────────────────────────────────────────────────────────────────────────
   The scenario board, the distribution, and the evidence feed.
   ---------------------------------------------------------------------------
   Three things a syndicated forecast does not give you, and the reason to run
   your own:

     BOARD        Cases with WEIGHTS and FALSIFIERS, and a probability-weighted
                  expectation. A high/low pair is not decidable; a weighted
                  expectation with a stated falsifier is.
     DISTRIBUTION A Monte-Carlo over the Assumption Book itself. Not "±10% on the
                  answer" but the actual spread produced by sampling the four
                  assumptions and re-running the real engine for each draw. P10,
                  P50, P90 and — the number people actually want — the
                  probability of being over the line in each year.
     EVIDENCE     A live feed the Horizon analyst maintains: what was published,
                  which assumption it bears on, which way it pushes it, and a
                  one-click revision that carries the citation into the
                  Assumption Book.
   ─────────────────────────────────────────────────────────────────────────── */
import React, { useMemo, useRef, useState } from 'react'
import {
  Badge, Button, Callout, Card, CountUp, cx, Dialog, Divider, EmptyState, Field,
  Input, Metric, MetricRow, Panel, Progress, Segmented, Select, Slider, StatusDot,
  Table, Td, Textarea, Th, Tooltip, Tr, relTime, useToast,
} from '../../design/primitives'
import Icon from '../../design/icons'
import { DV, LineChart, Sparkline } from '../../design/charts'
import { useApp, useDriverBook, useInheritsBook, driverScope } from '../../state/appStore'
import { usePosition } from '../../state/usePosition'
import { buildTree, fmtInt, fmtMoney, fmtNum } from '../../../engine/engine'
import {
  DRIVER_META, outlookRun, type DriverKey, type DriverSet,
} from '../../../engine/outlook'
import {
  DIRECTION_LABEL, STRENGTH_TONE, applyCase, describeDeltas, normalisedWeights,
  type EvidenceItem, type ForecastCase,
} from './cases'

/* ═══════════════════════════════════════════════════════════════════════════
   Shared projection helper
   ═══════════════════════════════════════════════════════════════════════════ */

interface YearPoint { year: number; metric: number; limit: number; gap: number; exposure: number; ze: number }

/** Projects a scope — the whole market, or one manufacturer within it.
 *
 *  Scoping to a maker is a row filter, not a different calculation: the same
 *  engine runs over that maker's rows, so its limit is still built from its own
 *  mass and its exposure is still its own charge. That is the difference between
 *  "this maker's forecast" and "this maker's share of a market forecast", and
 *  only the first one is worth anything to the maker. */
function useProjector(years: number[], target?: string | null) {
  const { pack, raw, scenario } = usePosition('working')
  const rows = useMemo(
    () => (target ? raw.filter((v) => v.parent === target) : raw),
    [raw, target],
  )
  return useMemo(() => (drivers: DriverSet): YearPoint[] => {
    const run = outlookRun({ raw: rows, pack, drivers, vintageYear: scenario.year })
    return years.map((y) => {
      const t = buildTree(run.fleetForYear(y), pack, run.scenarioFor(y))
      return {
        year: y, metric: t.avgMetric, limit: t.limit, gap: t.gap,
        exposure: (t.children ?? []).reduce((a, c) => a + c.fine, 0),
        ze: run.shareFor(y),
      }
    })
  }, [rows, pack, scenario.year, years])
}

/* ═══════════════════════════════════════════════════════════════════════════
   1 · THE SCENARIO BOARD
   ═══════════════════════════════════════════════════════════════════════════ */

const BLANK_CASE = (): ForecastCase => ({
  id: `case_${Date.now().toString(36)}`, name: '', blurb: '', deltas: {},
  weight: 0.1, origin: 'analyst', falsifier: '',
})

export function CaseBoard({ years, target }: { years: number[]; target?: string | null }) {
  const { pack, country } = usePosition('working')
  const book = useDriverBook(country, target)
  const cases = useApp((s) => s.cases)
  const setWeight = useApp((s) => s.setCaseWeight)
  const upsert = useApp((s) => s.upsertCase)
  const remove = useApp((s) => s.removeCase)
  const resetCases = useApp((s) => s.resetCases)
  const project = useProjector(years, target)
  const toast = useToast()

  const [editing, setEditing] = useState<ForecastCase | null>(null)
  const [view, setView] = useState<'position' | 'exposure'>('exposure')

  const runs = useMemo(
    () => cases.map((c) => ({ c, series: project(applyCase(book, c)) })),
    [cases, book, project],
  )
  const w = normalisedWeights(cases)

  const summary = useMemo(() => runs.map(({ c, series }) => {
    const cum = series.reduce((a, y) => a + y.exposure, 0)
    const breach = series.find((y) => y.gap > 0)?.year ?? null
    const end = series[series.length - 1]
    return { c, series, cum, breach, end, weight: w[c.id] }
  }), [runs, w])

  // The number a board paper should quote: the expectation across the board,
  // not the midpoint of a range nobody assigned odds to.
  const expected = summary.reduce((a, s) => a + s.cum * s.weight, 0)
  const expectedEnd = summary.reduce((a, s) => a + s.end.metric * s.weight, 0)
  const probBreach = summary.filter((s) => s.breach).reduce((a, s) => a + s.weight, 0)
  const earliest = summary.filter((s) => s.breach).sort((a, b) => (a.breach! - b.breach!))[0]?.breach ?? null

  // The weighted expectation, drawn as its own line so it can be read against
  // the cases rather than inferred from them.
  const expectedSeries = years.map((_, i) => summary.reduce(
    (a, s) => a + (view === 'exposure' ? s.series[i].exposure : s.series[i].metric) * s.weight, 0))

  const money = (v: number) => fmtMoney(v, pack.currency)

  return (
    <>
      <MetricRow className="mb-4">
        <Metric label="Weighted exposure"
          value={<CountUp value={expected} format={money} />}
          tone={expected > 0 ? 'neg' : undefined}
          sub={`${target ?? 'whole market'} · ${cases.length} cases over ${years.length} years`}
          hint="Each case's cumulative exposure multiplied by its weight. This is the number to quote, not the midpoint of a range." />
        <Metric label={`Weighted ${years[years.length - 1]} fleet`}
          value={<CountUp value={expectedEnd} format={(v) => fmtNum(v, 1)} />} unit={pack.metricUnit}
          sub="expectation across the board" />
        <Metric label="Probability of a breach" value={`${Math.round(probBreach * 100)}%`}
          tone={probBreach > 0.5 ? 'neg' : probBreach > 0 ? 'warn' : 'pos'}
          sub={earliest ? `earliest in ${earliest}` : 'no case breaches'} />
        <Metric label="Spread" value={money(Math.max(...summary.map((s) => s.cum)) - Math.min(...summary.map((s) => s.cum)))}
          sub="worst case less best case" />
      </MetricRow>

      <Panel className="mb-4"
        title="The board"
        sub="Every case projected, with the probability-weighted expectation drawn through them. Weights renormalise, so they never have to be typed to exactly 100."
        icon={<Icon name="layers" size={14} />}
        actions={
          <Segmented size="sm" value={view} onChange={setView}
            options={[{ id: 'exposure', label: 'Exposure' }, { id: 'position', label: 'Position' }]} />
        }>
        <LineChart
          x={years} height={280}
          unit={view === 'exposure' ? pack.currency : pack.metricUnit}
          format={view === 'exposure' ? money : (v) => fmtNum(v, 1)}
          yZero={view === 'exposure'}
          series={[
            ...summary.map((s, i) => ({
              name: s.c.name,
              points: s.series.map((y) => (view === 'exposure' ? y.exposure : y.metric)),
              color: s.c.id === 'house' ? DV[0] : DV[(i + 1) % DV.length],
              dashed: s.c.id !== 'house',
            })),
            { name: 'Weighted expectation', points: expectedSeries, color: 'var(--ink-1)', area: view === 'exposure' },
          ]}
          refLine={view === 'position' ? years.map((_, i) => summary[0]?.series[i].limit ?? null) : undefined}
          refLabel="Regulatory limit" />
      </Panel>

      <div className="mb-2 flex items-center gap-2">
        <span className="t-label !mb-0">Cases</span>
        <span className="text-[11px] text-[var(--ink-4)]">Weights renormalise to 100% · drag to reweight</span>
        <span className="ml-auto flex items-center gap-1.5">
          <Button size="xs" variant="ghost" onClick={() => { resetCases(); toast({ tone: 'neutral', title: 'Board reset to the three built-in cases' }) }}>Reset</Button>
          <Button size="xs" variant="secondary" icon={<Icon name="plus" size={12} />} onClick={() => setEditing(BLANK_CASE())}>Add a case</Button>
        </span>
      </div>

      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {summary.map(({ c, series, cum, breach, weight }) => {
          const deltas = describeDeltas(c)
          return (
            <Card key={c.id} className="!p-0 flex flex-col overflow-hidden">
              <div className="flex items-start gap-2.5 border-b border-[var(--line-soft)] px-3.5 py-3">
                <span className="mt-px h-[9px] w-[9px] shrink-0 rounded-full"
                  style={{ background: c.id === 'house' ? DV[0] : DV[(cases.indexOf(c) + 1) % DV.length] }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[13px] font-semibold text-[var(--ink-1)]">{c.name}</span>
                    {c.origin === 'agent' && <Badge tone="agent">agent</Badge>}
                    {c.origin === 'analyst' && <Badge tone="info">yours</Badge>}
                  </div>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--ink-3)]">{c.blurb}</p>
                </div>
                <span className="flex shrink-0 items-center gap-0.5">
                  <button onClick={() => setEditing({ ...c })} aria-label={`Edit ${c.name}`}
                    className="grid h-6 w-6 place-items-center rounded-[var(--r-xs)] text-[var(--ink-5)] hover:bg-[var(--surface-2)] hover:text-[var(--ink-2)]">
                    <Icon name="edit" size={12} />
                  </button>
                  {!c.builtin && (
                    <button onClick={() => remove(c.id)} aria-label={`Delete ${c.name}`}
                      className="grid h-6 w-6 place-items-center rounded-[var(--r-xs)] text-[var(--ink-5)] hover:bg-[var(--neg-tint)] hover:text-[var(--neg)]">
                      <Icon name="trash" size={12} />
                    </button>
                  )}
                </span>
              </div>

              <div className="flex flex-1 flex-col px-3.5 py-3">
                {deltas.length ? (
                  <div className="mb-3 flex flex-wrap gap-1">
                    {deltas.map((d) => (
                      <span key={d.label}
                        className={cx('inline-flex items-center gap-1 rounded-[var(--r-xs)] border px-1.5 py-[2px] text-[10.5px]',
                          d.delta > 0 ? 'border-[var(--pos-line)] bg-[var(--pos-tint)] text-[var(--pos-ink)]'
                                      : 'border-[var(--neg-line)] bg-[var(--neg-tint)] text-[var(--neg-ink)]')}>
                        {d.label} {d.delta > 0 ? '+' : '−'}{Math.abs(d.delta)}{d.unit}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="mb-3 text-[10.5px] text-[var(--ink-5)]">No deltas — this is the Assumption Book as it stands.</div>
                )}

                <div className="mb-3 flex items-end gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="t-label">Cumulative exposure</div>
                    <div className="mt-0.5 text-[16px] font-semibold tabular-nums text-[var(--ink-1)]">{money(cum)}</div>
                  </div>
                  <div>
                    <div className="t-label">First breach</div>
                    <div className="mt-0.5">
                      {breach ? <Badge tone="neg">{breach}</Badge> : <Badge tone="pos">clear</Badge>}
                    </div>
                  </div>
                  <Tooltip content={series.map((y) => `${y.year}: ${fmtNum(y.metric, 1)}`).join(' · ')}>
                    <span className="shrink-0"><Sparkline points={series.map((y) => y.metric)} w={62}
                      refLevel={series[series.length - 1].limit}
                      tone={breach ? 'var(--neg)' : 'var(--pos)'} /></span>
                  </Tooltip>
                </div>

                <Slider label="Weight" value={Math.round(weight * 100)} min={0} max={100} step={1}
                  format={(v) => `${v}%`}
                  onChange={(v) => setWeight(c.id, v / 100)} />

                {c.falsifier && (
                  <div className="mt-3 flex items-start gap-1.5 rounded-[var(--r-xs)] bg-[var(--surface-2)] px-2 py-1.5 [margin-top:auto] [margin-block-start:0.75rem]">
                    <Icon name="search" size={11} className="mt-px shrink-0 text-[var(--ink-4)]" />
                    <span className="text-[11px] leading-relaxed text-[var(--ink-3)]">
                      <b className="font-semibold text-[var(--ink-2)]">Would have to be true: </b>{c.falsifier}
                    </span>
                  </div>
                )}
              </div>
            </Card>
          )
        })}
      </div>

      <CaseEditor value={editing} onClose={() => setEditing(null)}
        onSave={(c) => { upsert(c); setEditing(null); toast({ tone: 'pos', title: `“${c.name}” saved to the board` }) }} />
    </>
  )
}

function CaseEditor({ value, onClose, onSave }: {
  value: ForecastCase | null; onClose: () => void; onSave: (c: ForecastCase) => void
}) {
  const [draft, setDraft] = useState<ForecastCase | null>(value)
  const seen = useRef<string | null>(null)
  if (value && seen.current !== value.id) { seen.current = value.id; if (draft?.id !== value.id) setDraft({ ...value }) }
  if (!value || !draft) return null

  const setDelta = (k: DriverKey, v: number) =>
    setDraft({ ...draft, deltas: { ...draft.deltas, [k]: v === 0 ? undefined : v } })

  return (
    <Dialog open onClose={onClose} width={580}
      title={value.name ? `Edit “${value.name}”` : 'Add a case'}
      sub="A case is a coherent world, expressed as deltas on the Assumption Book — not a uniform nudge on every driver."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!draft.name.trim()} onClick={() => onSave(draft)}>Save to the board</Button>
        </>
      }>
      <div className="space-y-3.5">
        <Field label="Name" required>
          <Input autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="e.g. Incentives lapse in two of five markets" />
        </Field>
        <Field label="What happens in this world" hint="One or two sentences. Written so someone else can argue with it.">
          <Textarea rows={2} value={draft.blurb} onChange={(e) => setDraft({ ...draft, blurb: e.target.value })} />
        </Field>

        <div>
          <div className="t-label mb-2">Deltas on the Assumption Book</div>
          <div className="space-y-4">
            {DRIVER_META.map((m) => {
              const span = Math.round((m.max - m.min) * 0.35)
              return (
                <Slider key={m.key}
                  label={m.label}
                  value={draft.deltas[m.key] ?? 0}
                  min={-span} max={span} step={m.step}
                  format={(v) => (v === 0 ? 'no change' : `${v > 0 ? '+' : '−'}${Math.abs(v)}${m.unit}`)}
                  onChange={(v) => setDelta(m.key, v)} />
              )
            })}
          </div>
        </div>

        <Field label="What would have to be true" required
          hint="The falsifier. A case you cannot disprove is a mood, not a scenario — and this line is what the Horizon analyst goes looking for.">
          <Textarea rows={2} value={draft.falsifier} onChange={(e) => setDraft({ ...draft, falsifier: e.target.value })}
            placeholder="e.g. A major purchase incentive expires without replacement, or charging deployment misses its published trajectory two years running." />
        </Field>
      </div>
    </Dialog>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   2 · THE DISTRIBUTION
   ═══════════════════════════════════════════════════════════════════════════ */

/** 1σ on each assumption. Not guesses — each is roughly the year-on-year
 *  dispersion the driver's own source has historically shown, which is the only
 *  defensible basis for a band. */
const SIGMA: Record<DriverKey, number> = {
  marketGrowth: 1.2, evShareHorizon: 8, iceCo2Improve: 0.4, massDrift: 3,
}

const gauss = () => {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

interface DistResult {
  years: number[]
  p10: number[]; p50: number[]; p90: number[]
  probOver: number[]
  cumP10: number; cumP50: number; cumP90: number
  breachYearOdds: { year: number; p: number }[]
  n: number
}

export function Distribution({ years, target }: { years: number[]; target?: string | null }) {
  const { pack, raw, scenario, country } = usePosition('working')
  const book = useDriverBook(country, target)
  const project = useProjector(years, target)
  const [n, setN] = useState(80)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<DistResult | null>(null)
  const cancel = useRef(false)

  /** Chunked across animation frames. A 200-draw sweep is thousands of engine
   *  passes; doing it in one synchronous loop freezes the tab, and a frozen tab
   *  is how people learn not to trust a feature. */
  const run = async () => {
    setRunning(true); setProgress(0); cancel.current = false
    const exposures: number[][] = years.map(() => [])
    const overs = years.map(() => 0)
    const cums: number[] = []
    const breachYear: number[] = []

    for (let i = 0; i < n; i++) {
      if (cancel.current) break
      const d: DriverSet = { ...book }
      for (const m of DRIVER_META) {
        d[m.key] = Math.min(m.max, Math.max(m.min, book[m.key] + gauss() * SIGMA[m.key]))
      }
      const series = project(d)
      let cum = 0, first = -1
      series.forEach((y, k) => {
        exposures[k].push(y.exposure)
        if (y.gap > 0) { overs[k]++; if (first < 0) first = k }
        cum += y.exposure
      })
      cums.push(cum)
      breachYear.push(first)
      if (i % 4 === 3) {
        setProgress((i + 1) / n)
        await new Promise((r) => requestAnimationFrame(() => r(null)))
      }
    }

    const q = (arr: number[], p: number) => {
      const s = [...arr].sort((a, b) => a - b)
      return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * s.length)))] ?? 0
    }
    const done = cums.length
    setResult({
      years,
      p10: exposures.map((e) => q(e, 0.1)),
      p50: exposures.map((e) => q(e, 0.5)),
      p90: exposures.map((e) => q(e, 0.9)),
      probOver: overs.map((o) => o / Math.max(done, 1)),
      cumP10: q(cums, 0.1), cumP50: q(cums, 0.5), cumP90: q(cums, 0.9),
      breachYearOdds: years.map((y, k) => ({ year: y, p: breachYear.filter((b) => b === k).length / Math.max(done, 1) })),
      n: done,
    })
    setRunning(false); setProgress(1)
  }

  const money = (v: number) => fmtMoney(v, pack.currency)

  return (
    <Panel
      title="Distribution"
      sub={`Sampling the Assumption Book — not the answer — and re-running the real engine for every draw${target ? ` over ${target}` : ''}. The band is what the four assumptions actually produce, at ±1σ each.`}
      icon={<Icon name="activity" size={14} />}
      actions={
        <>
          <Select className="!h-[28px] !w-[104px] !text-[12px]" value={String(n)} disabled={running}
            onChange={(e) => { setN(Number(e.target.value)); setResult(null) }}>
            <option value="40">40 draws</option>
            <option value="80">80 draws</option>
            <option value="200">200 draws</option>
          </Select>
          {running
            ? <Button size="sm" variant="ghost" onClick={() => { cancel.current = true }}>Stop</Button>
            : <Button size="sm" variant="secondary" icon={<Icon name="play" size={12} />} onClick={run}>
                {result ? 'Re-run' : 'Run'}
              </Button>}
        </>
      }>
      {running && (
        <div className="mb-4">
          <Progress value={progress * 100} label={`Sampling · ${Math.round(progress * n)} of ${n} draws`} />
        </div>
      )}

      {result ? (
        <>
          <MetricRow className="mb-4">
            <Metric size="sm" label="P10 — good outcome" value={money(result.cumP10)} tone="pos"
              sub="1 in 10 chance it is better than this" />
            <Metric size="sm" label="P50 — central" value={money(result.cumP50)}
              sub="as likely to be above as below" />
            <Metric size="sm" label="P90 — bad outcome" value={money(result.cumP90)} tone="neg"
              sub="1 in 10 chance it is worse than this" />
            <Metric size="sm" label="Downside spread" value={money(result.cumP90 - result.cumP50)}
              sub="P90 less P50 — what to hold reserve against" />
          </MetricRow>

          <LineChart
            x={result.years} height={250} yZero
            unit={pack.currency} format={money}
            series={[{ name: `Median of ${result.n} draws`, points: result.p50, color: DV[0] }]}
            band={{ lower: result.p10, upper: result.p90, label: 'P10–P90' }} />

          <Divider />

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <div className="t-label mb-2">Probability of being over the line</div>
              <div className="space-y-1.5">
                {result.years.map((y, i) => (
                  <div key={y} className="flex items-center gap-2.5">
                    <span className="w-[42px] shrink-0 text-[12px] tabular-nums text-[var(--ink-3)]">{y}</span>
                    <span className="flex-1">
                      <Progress value={result.probOver[i] * 100} height={7}
                        tone={result.probOver[i] > 0.6 ? 'neg' : result.probOver[i] > 0.25 ? 'warn' : 'pos'} />
                    </span>
                    <span className="w-[38px] shrink-0 text-right text-[12px] font-semibold tabular-nums text-[var(--ink-1)]">
                      {Math.round(result.probOver[i] * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="t-label mb-2">When the first breach lands</div>
              <div className="space-y-1.5">
                {result.breachYearOdds.map((b) => (
                  <div key={b.year} className="flex items-center gap-2.5">
                    <span className="w-[42px] shrink-0 text-[12px] tabular-nums text-[var(--ink-3)]">{b.year}</span>
                    <span className="flex-1"><Progress value={b.p * 100} height={7} tone="warn" /></span>
                    <span className="w-[38px] shrink-0 text-right text-[12px] font-semibold tabular-nums text-[var(--ink-1)]">
                      {Math.round(b.p * 100)}%
                    </span>
                  </div>
                ))}
                <div className="flex items-center gap-2.5 pt-1">
                  <span className="w-[42px] shrink-0 text-[12px] text-[var(--ink-3)]">never</span>
                  <span className="flex-1">
                    <Progress value={(1 - result.breachYearOdds.reduce((a, b) => a + b.p, 0)) * 100} height={7} tone="pos" />
                  </span>
                  <span className="w-[38px] shrink-0 text-right text-[12px] font-semibold tabular-nums text-[var(--ink-1)]">
                    {Math.round((1 - result.breachYearOdds.reduce((a, b) => a + b.p, 0)) * 100)}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          <Callout className="mt-4" tone="neutral" icon={<Icon name="shield" size={13} />}>
            Every draw ran through the same engine the filing uses — this is a distribution of real computed positions, not a
            confidence interval bolted onto a point estimate. The 1σ used for each assumption is stated in the code and can be argued with.
          </Callout>
        </>
      ) : !running && (
        <div className="rounded-[var(--r-md)] border border-dashed border-[var(--line-strong)] bg-[var(--surface-2)] px-4 py-10 text-center">
          <Icon name="activity" size={24} className="mx-auto mb-2 text-[var(--ink-4)]" />
          <div className="text-[12.5px] font-semibold text-[var(--ink-1)]">Sample the Assumption Book</div>
          <p className="mx-auto mt-1 max-w-[54ch] text-[11.5px] leading-relaxed text-[var(--ink-3)]">
            {n} draws over the four assumptions at ±1σ, each one a full projection through the real engine. Returns P10/P50/P90
            exposure, the probability of being over the line each year, and when the first breach is most likely to land.
          </p>
          <Button className="mt-3" size="sm" variant="secondary" icon={<Icon name="play" size={12} />} onClick={run}>Run the distribution</Button>
        </div>
      )}
    </Panel>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   3 · THE EVIDENCE FEED
   ═══════════════════════════════════════════════════════════════════════════ */

export function EvidenceFeed({ compact, target }: { compact?: boolean; target?: string | null }) {
  const { country, pack } = usePosition('working')
  const book = useDriverBook(country, target)
  const evidence = useApp((s) => s.evidence)
  const setStatus = useApp((s) => s.setEvidenceStatus)
  const setDriver = useApp((s) => s.setDriver)
  const session = useApp((s) => s.session)
  const runs = useApp((s) => s.runs)
  const setConsole = useApp((s) => s.setConsole)
  const toast = useToast()
  const [filter, setFilter] = useState<'new' | 'all'>('new')

  const run = runs.find((r) => r.agentId === 'forecast.horizon')
  const items = useMemo(
    () => evidence
      .filter((e) => e.market === country || e.market === 'ALL')
      .filter((e) => filter === 'all' || e.status === 'new'),
    [evidence, country, filter],
  )
  const pending = evidence.filter((e) => e.market === country && e.status === 'new').length

  const accept = (e: EvidenceItem) => {
    const meta = DRIVER_META.find((m) => m.key === e.driver)
    if (!meta || e.suggested == null) { setStatus(e.id, 'accepted'); return }
    const v = Math.min(meta.max, Math.max(meta.min, e.suggested))
    setDriver(driverScope(country, target), e.driver, v, {
      origin: 'agent', by: session?.name,
      citation: { label: e.outlet, ref: e.headline, url: e.url, asOf: e.publishedAt },
    })
    setStatus(e.id, 'accepted')
    toast({
      tone: 'pos', title: `${meta.label} revised to ${v}${meta.unit}`,
      body: 'The citation travels with it into the Assumption Book, so the change can be traced back to this source.',
    })
  }

  return (
    <Panel
      title="Live evidence"
      sub="What the Horizon analyst has found in the current news and source feed, classified by the assumption it bears on."
      icon={<Icon name="globe" size={14} />}
      actions={
        <>
          <Segmented size="sm" value={filter} onChange={setFilter}
            options={[{ id: 'new', label: pending ? `New · ${pending}` : 'New' }, { id: 'all', label: 'All' }]} />
          {run && (
            <Button size="xs" variant="ghost" onClick={() => { useApp.getState().setActiveRun(run.id); setConsole(true) }}>
              Trace
            </Button>
          )}
        </>
      }>
      {items.length ? (
        <ul className="space-y-2.5">
          {items.map((e) => {
            const meta = DRIVER_META.find((m) => m.key === e.driver)
            const delta = e.suggested != null && meta ? e.suggested - book[e.driver] : null
            return (
              <li key={e.id}
                className={cx('rounded-[var(--r-md)] border p-3 transition-colors',
                  e.status === 'accepted' ? 'border-[var(--pos-line)] bg-[var(--pos-tint)]'
                    : e.status === 'dismissed' ? 'border-[var(--line)] opacity-55'
                    : 'border-[var(--line)] bg-[var(--surface-1)]')}>
                <div className="flex items-start gap-2.5">
                  <StatusDot size={7} tone={STRENGTH_TONE[e.strength]} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      {e.url
                        ? <a href={e.url} target="_blank" rel="noreferrer noopener"
                            className="text-[12.5px] font-semibold text-[var(--ink-1)] underline-offset-2 hover:underline">{e.headline}</a>
                        : <span className="text-[12.5px] font-semibold text-[var(--ink-1)]">{e.headline}</span>}
                      <span className="text-[11px] text-[var(--ink-4)]">{e.outlet}</span>
                      {e.publishedAt && <span className="text-[11px] text-[var(--ink-5)]">· {e.publishedAt}</span>}
                    </div>
                    <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--ink-3)]">{e.summary}</p>

                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Badge tone="info">{meta?.label ?? e.driver}</Badge>
                      <span className="text-[11px] text-[var(--ink-4)]">{DIRECTION_LABEL[e.direction]}</span>
                      {delta != null && Math.abs(delta) > 0.001 && (
                        <span className={cx('text-[11px] font-semibold tabular-nums',
                          delta > 0 ? 'text-[var(--pos-ink)]' : 'text-[var(--neg-ink)]')}>
                          {book[e.driver]}{meta?.unit} → {e.suggested}{meta?.unit}
                        </span>
                      )}
                      <Badge tone={STRENGTH_TONE[e.strength]}>{e.strength}</Badge>
                    </div>

                    {e.status === 'new' && (
                      <div className="mt-2.5 flex items-center gap-2">
                        <Button size="xs" variant="secondary" icon={<Icon name="check" size={11} />} onClick={() => accept(e)}>
                          {e.suggested != null ? 'Apply the revision' : 'Mark as read'}
                        </Button>
                        <Button size="xs" variant="ghost" onClick={() => setStatus(e.id, 'dismissed')}>Dismiss</Button>
                        <span className="ml-auto text-[10.5px] text-[var(--ink-5)]">found {relTime(e.foundAt)}</span>
                      </div>
                    )}
                    {e.status === 'accepted' && (
                      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-[var(--pos-ink)]">
                        <Icon name="check" size={11} /> Applied to the Assumption Book with this citation
                      </div>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <EmptyState art="agent" compact={compact} icon={<Icon name="globe" size={18} />}
          title={filter === 'new' && evidence.length ? 'Nothing new' : 'No evidence gathered yet'}
          body={filter === 'new' && evidence.length
            ? 'Everything the analyst found has been applied or dismissed. Switch to All to see the history.'
            : `Run the Horizon analyst. It searches the live news and source feed for ${pack.name}, classifies what it finds against the four assumptions, and proposes a revision with the citation attached.`} />
      )}
    </Panel>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   4 · THE ASSUMPTION BOOK, WITH PROVENANCE
   ═══════════════════════════════════════════════════════════════════════════ */

const OWNER_TONE: Record<string, string> = {
  'Market intelligence': 'var(--dv-1)', 'Powertrain engineering': 'var(--dv-3)', 'Regulatory affairs': 'var(--dv-4)',
}

export function AssumptionBook({ target }: { target?: string | null }) {
  const { country } = usePosition('working')
  const book = useDriverBook(country, target)
  const inherits = useInheritsBook(country, target)
  const prov = useApp((s) => s.driverProvenance)
  const setDriver = useApp((s) => s.setDriver)
  const reset = useApp((s) => s.resetDrivers)
  const fork = useApp((s) => s.forkDriverBook)
  const session = useApp((s) => s.session)

  const scope = driverScope(country, target)
  const revised = DRIVER_META.filter((m) => prov[`${scope}:${m.key}`]).length

  return (
    <Panel title="Assumption book" icon={<Icon name="book" size={14} />}
      sub={target
        ? inherits ? 'Reading the market view' : `A book of its own for ${target}`
        : 'Four drivers, each owned by a function, each sourced.'}
      actions={
        <>
          {revised > 0 && <Badge tone="info">{revised} revised</Badge>}
          {target && inherits && (
            <Button size="xs" variant="secondary" icon={<Icon name="branch" size={11} />}
              onClick={() => fork(scope, book)}>Fork</Button>
          )}
          <Button size="xs" variant="ghost" onClick={() => reset(scope)}>Reset</Button>
        </>
      }>
      {target && inherits && (
        <Callout className="mb-4" tone="neutral" icon={<Icon name="link" size={13} />}>
          Inheriting the {country} market book. Editing any driver here forks a copy for {target} automatically —
          the market view is left alone.
        </Callout>
      )}
      <div className="space-y-5">
        {DRIVER_META.map((m) => {
          const p = prov[`${scope}:${m.key}`]
          return (
            <div key={m.key}>
              <Slider
                label={
                  <span className="flex items-center gap-1.5">
                    <span className="h-[7px] w-[7px] rounded-[2px]" style={{ background: OWNER_TONE[m.owner] }} />
                    {m.label}
                    <Tooltip content={<><b>{m.rationale}</b><br /><br />Source: {m.source}<br />Owner: {m.owner}</>}>
                      <span className="grid h-[13px] w-[13px] cursor-help place-items-center rounded-full border border-[var(--line-strong)] text-[8px] font-bold text-[var(--ink-4)]">i</span>
                    </Tooltip>
                    {p?.origin === 'agent' && <Badge tone="agent">agent</Badge>}
                  </span>
                }
                value={book[m.key]} min={m.min} max={m.max} step={m.step}
                format={(v) => `${v}${m.unit}`}
                onChange={(v) => setDriver(scope, m.key, v, { origin: 'analyst', by: session?.name })} />

              {p ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] text-[var(--ink-4)]">
                  <span className="tabular-nums">
                    {p.from != null && <>was {p.from}{m.unit} · </>}
                    {p.origin === 'agent' ? 'revised by the Horizon analyst' : `set by ${p.by ?? 'an analyst'}`} {relTime(p.at)}
                  </span>
                  {p.citation && (
                    <Tooltip content={<>{p.citation.ref}{p.citation.asOf ? <><br />{p.citation.asOf}</> : null}</>}>
                      {p.citation.url
                        ? <a href={p.citation.url} target="_blank" rel="noreferrer noopener"
                            className="inline-flex items-center gap-1 rounded-[var(--r-xs)] border border-[var(--line)] bg-[var(--surface-2)] px-1.5 py-px text-[var(--ink-3)] hover:border-[var(--line-strong)]">
                            <Icon name="external" size={9} />{p.citation.label}
                          </a>
                        : <span className="inline-flex items-center gap-1 rounded-[var(--r-xs)] border border-[var(--line)] bg-[var(--surface-2)] px-1.5 py-px text-[var(--ink-3)]">
                            <Icon name="file" size={9} />{p.citation.label}
                          </span>}
                    </Tooltip>
                  )}
                </div>
              ) : (
                <p className="mt-1.5 text-[10.5px] leading-relaxed text-[var(--ink-4)]">{m.source}</p>
              )}
            </div>
          )
        })}
      </div>
    </Panel>
  )
}
