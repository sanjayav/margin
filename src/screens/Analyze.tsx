import { useMemo, useState } from 'react'
import { useCompliance } from '../lib/useCompliance'
import { useStore } from '../state/store'
import { getMeta } from '../data/fleet'
import type { Aggregate } from '../engine/types'
import { fmtInt, fmtMoney, fmtNum, threeYearAverage } from '../engine/engine'
import LimitChart, { type ChartPoint } from '../components/LimitChart'
import PowertrainBreakdown from '../components/PowertrainBreakdown'
import { Section, Stat, StatusPill, Bar } from '../components/ui'
import Icon from '../components/Icon'
import { makeLimitAt } from '../lib/chart'
import { useCountUp } from '../lib/useCountUp'
import { useProvenance } from '../lib/provenance'
import { recommend } from '../engine/recommend'
import { buildMakerReport, openPrintReport } from '../lib/report'

function nodeAt(root: Aggregate, path: string[]): Aggregate {
  let n = root
  for (const seg of path) { const nx = n.children?.find((c) => c.label === seg); if (!nx) break; n = nx }
  return n
}

const LEVEL_NAME = ['Makers', 'Models', 'Variants']

export default function Analyze() {
  const { pack, raw, tree, scenario, country } = useCompliance()
  const drill = useStore((s) => s.drillPath)
  const setDrill = useStore((s) => s.setDrill)
  const setParent = useStore((s) => s.setParent)
  const setScreen = useStore((s) => s.setScreen)
  const showProv = useProvenance((s) => s.show)
  const meta = getMeta(country)

  const node = useMemo(() => nodeAt(tree, drill), [tree, drill])
  const limitAt = useMemo(() => makeLimitAt(pack, scenario, node), [pack, scenario, node])
  const level = drill.length // 0 makers · 1 models · 2 variants
  const colorBy = level >= 2 ? 'powertrain' : 'status'
  // stable bubble-size denominator once drilled into a maker, so a lone variant still scales with volume
  const unitRef = useMemo(() => (drill.length >= 1 ? nodeAt(tree, [drill[0]]).rawUnits : undefined), [tree, drill])

  // At the leaf (variant) level, show one item per real vehicle row so an added
  // variant is always its own bubble; above that, one item per maker/model.
  const items = useMemo(() => {
    if (level >= 2) {
      return node.vehicles.filter((v) => v.sales > 0 && v.mass > 0).map((v, i) => {
        const metric = pack.vehicleMetric(v, scenario)
        const lim = limitAt(v.mass)
        return { key: `v${i}-${v.model}-${v.powertrain}`, label: v.model, sub: v.powertrain, mass: v.mass, metric, units: v.sales, gap: metric - lim, powertrain: v.powertrain as string | undefined, status: (metric > lim ? 'fine' : 'compliant') as ChartPoint['status'], drillable: false }
      })
    }
    return (node.children ?? []).filter((c) => c.rawUnits > 0 && c.avgMass > 0).map((c) => ({
      key: c.label, label: c.label, sub: c.vehicles[0]?.powertrain ?? '', mass: c.avgMass, metric: c.avgMetric, units: c.rawUnits, gap: c.gap,
      powertrain: undefined as string | undefined, status: c.status, drillable: (c.children?.length ?? 0) > 0,
    }))
  }, [node, level, pack, scenario, limitAt])

  const points: ChartPoint[] = items.map((it) => ({ key: it.key, label: it.label, mass: it.mass, metric: it.metric, units: it.units, status: it.status, powertrain: it.powertrain }))

  const drillInto = (key: string) => {
    if (level >= 2) return // variants are the leaf
    const child = node.children?.find((c) => c.label === key)
    if (!child?.children?.length) return
    const next = [...drill, key]
    setDrill(next)
    if (next.length === 1) setParent(key)
  }

  const over = node.gap > 0
  const maxGap = Math.max(...items.map((it) => Math.abs(it.gap)), 1)
  // Fines are assessed per maker. At market level the exposure is the SUM of
  // maker fines (a clean maker can't cancel a dirty one); when drilled in, it's
  // the maker's own fine (models/variants aren't separate compliance entities).
  // EU 2025-2027 three-year averaging flexibility (Reg 2025/1214), per maker.
  const threeYr = useMemo(
    () => (country === 'EU' && drill.length >= 1 ? threeYearAverage(raw, pack, scenario, drill[0]) : null),
    [country, drill, raw, pack, scenario],
  )
  const makerNode = useMemo(() => (drill.length >= 1 ? nodeAt(tree, [drill[0]]) : null), [tree, drill])
  const fineValue = makerNode ? makerNode.fine : (tree.children ?? []).reduce((a, c) => a + c.fine, 0)
  const fineSub = makerNode ? `${drill[0].split(' ')[0]} total` : `Σ across ${(tree.children ?? []).length} makers`
  // animated KPI values
  const gapA = useCountUp(node.gap), avgA = useCountUp(node.avgMetric), fineA = useCountUp(fineValue)
  const regA = useCountUp(node.rawUnits), unitsA = useCountUp(node.units), massA = useCountUp(node.avgMass)
  const crumbs = [tree.label, ...drill]
  const reportParent = drill[0] ?? node.label
  const exportReport = () => openPrintReport(`Margin · ${node.label}`, buildMakerReport(node, pack, scenario, meta, recommend(raw, pack, scenario, reportParent), new Date().toISOString().slice(0, 10)))

  return (
    <div className="space-y-5">
      {/* Breadcrumb + actions */}
      <div className="flex flex-wrap items-center gap-1.5">
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1.5">
            <button onClick={() => setDrill(drill.slice(0, i))}
              className={`rounded-lg px-2.5 py-1 text-sm font-semibold transition ${i === crumbs.length - 1 ? 'bg-ink-100 text-white' : 'text-ink-400 hover:text-ink-100'}`}>{c}</button>
            {i < crumbs.length - 1 && <Icon name="chevron" size={13} className="text-ink-600" />}
          </span>
        ))}
        {drill.length > 0 && <button onClick={() => setDrill(drill.slice(0, -1))} className="ml-1 flex items-center gap-1 rounded-lg border border-black/[0.08] px-2 py-1 text-[11px] text-ink-400 hover:text-ink-100"><Icon name="reset" size={12} /> Up</button>}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => showProv({ agg: node, pack, scenario, meta })} className="btn-ghost px-3 py-1.5 text-xs"><Icon name="shield" size={14} /> Show the working</button>
          <button onClick={exportReport} className="btn-ghost px-3 py-1.5 text-xs"><Icon name="section" size={14} /> Export</button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className={`card rise relative overflow-hidden p-4 ${over ? 'border-danger/25' : 'border-safe/25'}`}>
          <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: over ? '#E0484D' : '#0E9F6E' }} />
          <div className="label">Gap to the line</div>
          <div className={`dnum mt-2 text-[27px] font-bold leading-none ${over ? 'text-danger' : 'text-safe'}`}>{over ? '+' : ''}{fmtNum(gapA, 1)}<span className="ml-1 text-xs font-semibold text-ink-500">{pack.metricUnit}</span></div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold">
            <span className={`h-1.5 w-1.5 rounded-full ${node.status === 'fine' ? 'bg-danger animate-pulse' : node.status === 'exempt' ? 'bg-warn' : 'bg-safe'}`} />
            <span className={node.status === 'fine' ? 'text-danger' : node.status === 'exempt' ? 'text-warn' : 'text-safe'}>{node.status === 'fine' ? 'Fine due' : node.status === 'exempt' ? 'Exempt' : 'Under the line'}</span>
          </div>
        </div>
        <Stat className="rise [animation-delay:60ms]" label={pack.metricLabel} value={fmtNum(avgA, 1)} sub={`limit ${fmtNum(node.limit, 1)} ${pack.metricUnit}`} accent={over ? 'text-danger' : 'text-safe'} />
        <div className="card rise p-4 [animation-delay:120ms]">
          <div className="flex items-center justify-between"><div className="label">Fine</div><button onClick={() => showProv({ agg: node, pack, scenario, meta })} className="text-[10px] font-semibold text-ink-500 transition hover:text-brand">working</button></div>
          <div className={`dnum mt-2 text-[27px] font-bold leading-none ${fineValue > 0 ? 'text-danger' : 'text-safe'}`}>{fmtMoney(fineA, pack.currency)}</div>
          <div className="mt-2 text-[11px] text-ink-500">{fineSub}</div>
        </div>
        <Stat className="rise [animation-delay:180ms]" label="Registrations" value={fmtInt(regA)} sub={`${fmtInt(unitsA)} effective`} />
        <Stat className="rise [animation-delay:240ms]" label={pack.massLabel} value={`${fmtInt(massA)}`} sub="kg average" />
      </div>

      {/* Bubble chart with drill */}
      <Section className="rise [animation-delay:300ms]" title={`${LEVEL_NAME[level] ?? 'Detail'} vs the limit`} right={
        <span className="flex items-center gap-2 text-[11px] text-ink-500">
          {level < 2 ? <><Icon name="scatter" size={12} /> click a bubble to drill in</> : <>size = sales · colour = powertrain</>}
        </span>
      }>
        <LimitChart pack={pack} limitAt={limitAt} points={points} colorBy={colorBy} height={360} onPick={drillInto} unitRef={unitRef} />
      </Section>

      {/* Breakdown + children list */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Section className="rise [animation-delay:360ms]" title="How the average is built" right={<span className="text-[11px] text-ink-500">sums to {fmtNum(node.avgMetric, 1)} {pack.metricUnit}</span>}>
          <PowertrainBreakdown agg={node} pack={pack} scenario={scenario} />
        </Section>
        <Section className="rise [animation-delay:420ms]" title={LEVEL_NAME[level] ?? 'Detail'} right={<span className="text-[11px] text-ink-500">gap to limit{level < 2 ? ' · click to drill' : ''}</span>}>
          <div className="space-y-2">
            {items.map((it) => (
              <div key={it.key} onClick={() => it.drillable && drillInto(it.key)}
                className={`flex items-center gap-3 rounded-lg border border-black/[0.04] bg-black/[0.02] px-3 py-2 ${it.drillable ? 'cursor-pointer hover:border-black/15' : ''}`}>
                <span className="w-32 shrink-0 truncate text-sm text-ink-100">{it.label}</span>
                {it.sub && <span className="w-12 shrink-0 text-[11px] text-ink-500">{it.sub}</span>}
                <div className="flex-1"><Bar value={it.gap > 0 ? it.gap : 0} max={maxGap} color={it.gap > 0 ? 'bg-danger' : 'bg-safe'} /></div>
                <span className={`num w-16 shrink-0 text-right text-sm font-semibold ${it.gap > 0 ? 'text-danger' : 'text-safe'}`}>{it.gap > 0 ? '+' : ''}{fmtNum(it.gap, 1)}</span>
                <span className="num w-16 shrink-0 text-right text-[11px] text-ink-500">{fmtInt(it.units)}u</span>
                {it.drillable && <Icon name="chevron" size={13} className="text-ink-600" />}
              </div>
            ))}
          </div>
        </Section>
      </div>

      {threeYr && (
        <Section className="rise" title="EU three-year averaging · 2025–2027"
          right={<span className="chip"><Icon name="scale" size={12} /> Reg (EU) 2025/1214</span>}>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div>
              <div className="label">Pay each year</div>
              <div className="dnum mt-1.5 text-[22px] font-bold leading-none text-ink-100">{fmtMoney(threeYr.singleYearFine, pack.currency)}</div>
              <div className="mt-1.5 text-[11px] text-ink-500">sum of 2025–27 premiums</div>
            </div>
            <div>
              <div className="label">3-year averaged</div>
              <div className={`dnum mt-1.5 text-[22px] font-bold leading-none ${threeYr.fine > 0 ? 'text-danger' : 'text-safe'}`}>{fmtMoney(threeYr.fine, pack.currency)}</div>
              <div className="mt-1.5 text-[11px] text-ink-500">on {fmtNum(threeYr.avgMetric, 1)} vs {fmtNum(threeYr.avgLimit, 1)} g/km avg</div>
            </div>
            <div>
              <div className="label">Saved by averaging</div>
              <div className="dnum mt-1.5 text-[22px] font-bold leading-none text-brand">{fmtMoney(threeYr.saved, pack.currency)}</div>
              <div className="mt-1.5 text-[11px] text-ink-500">{threeYr.exempt ? 'small-volume · exempt' : threeYr.saved > 0 ? 'vs paying annually' : 'no benefit this profile'}</div>
            </div>
            <div>
              <div className="label">3-year gap</div>
              <div className={`dnum mt-1.5 text-[22px] font-bold leading-none ${threeYr.gap > 0 ? 'text-danger' : 'text-safe'}`}>{threeYr.gap > 0 ? '+' : ''}{fmtNum(threeYr.gap, 1)}<span className="ml-1 text-xs font-semibold text-ink-500">g/km</span></div>
              <div className="mt-1.5 text-[11px] text-ink-500">{fmtInt(threeYr.units)} units over 3 yrs</div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {threeYr.perYear.map((py) => {
              const over = py.metric > py.limit
              return (
                <div key={py.year} className="rounded-lg border border-black/[0.05] bg-black/[0.015] p-3">
                  <div className="flex items-baseline justify-between">
                    <span className="num text-xs font-bold text-ink-300">{py.year}</span>
                    <span className={`num text-xs font-bold ${over ? 'text-danger' : 'text-safe'}`}>{over ? '+' : ''}{fmtNum(py.metric - py.limit, 1)}</span>
                  </div>
                  <div className="num mt-1 text-[11px] text-ink-500">fleet {fmtNum(py.metric, 1)} vs limit {fmtNum(py.limit, 1)}</div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-black/[0.06]">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, (py.metric / Math.max(py.limit, 1)) * 100)}%`, background: over ? '#E0484D' : '#0E9F6E' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </Section>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" onClick={() => setScreen('under')}><Icon name="target" size={16} /> Get me under the line</button>
        <button className="btn-ghost" onClick={() => setScreen('pool')}><Icon name="handshake" size={15} /> Pooling & trading</button>
        <button className="btn-ghost" onClick={() => setScreen('forecast')}><Icon name="trending" size={15} /> Forecast</button>
      </div>
    </div>
  )
}
