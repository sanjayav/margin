import { useMemo, useState } from 'react'
import { useCompliance } from '../lib/useCompliance'
import { useStore } from '../state/store'
import { getMeta } from '../data/fleet'
import type { Aggregate } from '../engine/types'
import { fmtInt, fmtMoney, fmtNum, threeYearAverage } from '../engine/engine'
import LimitChart, { type ChartPoint } from '../components/LimitChart'
import PowertrainBreakdown from '../components/PowertrainBreakdown'
import { Section, Stat, Bar } from '../components/ui'
import Icon from '../components/Icon'
import { makeLimitAt } from '../lib/chart'
import { useCountUp } from '../lib/useCountUp'
import { useProvenance } from '../lib/provenance'
import { recommend } from '../engine/recommend'
import { buildMakerReport, openPrintReport } from '../lib/report'
import { buildShareUrl } from '../lib/share'

function nodeAt(root: Aggregate, path: string[]): Aggregate {
  let n = root
  for (const seg of path) { const nx = n.children?.find((c) => c.label === seg); if (!nx) break; n = nx }
  return n
}

// Drill hierarchy: Market → Pool → Manufacturer → Model → Variant. Names below
// label the CHILDREN shown at each level (level = drill depth).
const LEVEL_NAME = ['Pools', 'Manufacturers', 'Models', 'Variants']
const SCOPE_NAME = ['Market', 'Pool', 'Manufacturer', 'Model', 'Variant']

export default function Analyze() {
  const { pack, raw, tree, drillTree, scenario, country } = useCompliance()
  const drill = useStore((s) => s.drillPath)
  const overrides = useStore((s) => s.makerOverrides)
  const setDrill = useStore((s) => s.setDrill)
  const setParent = useStore((s) => s.setParent)
  const setScreen = useStore((s) => s.setScreen)
  const showProv = useProvenance((s) => s.show)
  const meta = getMeta(country)

  const level = drill.length // 0 market · 1 pool · 2 manufacturer · 3 model · 4 variant
  const node = useMemo(() => nodeAt(drillTree, drill), [drillTree, drill])
  // At the variant leaf, chart the sibling variants (the parent model) with the
  // selected one highlighted, so a variant is always seen in context.
  const chartNode = useMemo(() => (level === 4 ? nodeAt(drillTree, drill.slice(0, 3)) : node), [level, drillTree, drill, node])
  const selectedVariant = level === 4 ? drill[3] : null
  const limitAt = useMemo(() => makeLimitAt(pack, scenario, chartNode), [pack, scenario, chartNode])
  const colorBy = level >= 3 ? 'powertrain' : 'status'

  // stable bubble-size denominator: manufacturer total when drilled into a maker,
  // pool total at pool level — so a lone variant still scales with volume.
  const unitRef = useMemo(() => {
    if (drill.length >= 2) return nodeAt(drillTree, drill.slice(0, 2)).rawUnits
    if (drill.length === 1) return nodeAt(drillTree, drill.slice(0, 1)).rawUnits
    return undefined
  }, [drillTree, drill])

  const items = useMemo(() => {
    return (chartNode.children ?? []).filter((c) => c.rawUnits > 0 && c.avgMass > 0).map((c) => ({
      key: c.label,
      label: c.label,
      sub: c.level === 'variant' || c.level === 'model' ? (c.vehicles[0]?.powertrain ?? '') : '',
      mass: c.avgMass, metric: c.avgMetric, units: c.rawUnits, gap: c.gap,
      powertrain: c.level === 'variant' ? c.vehicles[0]?.powertrain : undefined,
      status: c.status,
      drillable: level < 4,
      selected: c.label === selectedVariant,
    }))
  }, [chartNode, level, selectedVariant])

  const points: ChartPoint[] = items.map((it) => ({
    key: it.key, label: it.label, mass: it.mass, metric: it.metric, units: it.units,
    status: it.status, powertrain: it.powertrain, isFleet: it.selected,
  }))

  const drillInto = (key: string) => {
    if (level === 4) { if (key !== drill[3]) setDrill([...drill.slice(0, 3), key]); return } // switch sibling variant
    const child = node.children?.find((c) => c.label === key)
    if (!child) return
    const next = [...drill, key]
    setDrill(next)
    if (next.length === 2) setParent(key) // manufacturer level → keep selectedParent in sync
  }

  const over = node.gap > 0
  const maxGap = Math.max(...items.map((it) => Math.abs(it.gap)), 1)

  // Market exposure = Σ per-MANUFACTURER fines (standalone). Use the manufacturer-
  // rooted tree for that sum; pools/models/variants aren't separate liabilities.
  const marketFine = useMemo(() => (tree.children ?? []).reduce((a, c) => a + c.fine, 0), [tree])
  const makerNode = useMemo(() => (drill.length >= 2 ? nodeAt(drillTree, drill.slice(0, 2)) : null), [drillTree, drill])
  const fineValue = level === 0 ? marketFine
    : level === 1 ? (node.children ?? []).reduce((a, c) => a + c.fine, 0) // pool: Σ member makers
    : (makerNode ? makerNode.fine : node.fine)
  const fineSub = level === 0 ? `Σ across ${(tree.children ?? []).length} manufacturers`
    : level === 1 ? `Σ ${(node.children ?? []).length} pool member${(node.children ?? []).length > 1 ? 's' : ''}`
    : `${(drill[1] ?? node.label).split(' ')[0]} total`

  // EU 2025–2027 three-year averaging flexibility (Reg 2025/1214), per manufacturer.
  const threeYr = useMemo(
    () => (country === 'EU' && drill.length >= 2 ? threeYearAverage(raw, pack, scenario, drill[1], [2025, 2026, 2027], overrides) : null),
    [country, drill, raw, pack, scenario, overrides],
  )

  const gapA = useCountUp(node.gap), avgA = useCountUp(node.avgMetric), fineA = useCountUp(fineValue)
  const regA = useCountUp(node.rawUnits), unitsA = useCountUp(node.units), massA = useCountUp(node.avgMass)
  const crumbs = [drillTree.label, ...drill]
  const reportParent = drill[1] ?? tree.children?.[0]?.label ?? node.label
  const exportReport = () => openPrintReport(`Autocred AI · ${node.label}`, buildMakerReport(node, pack, scenario, meta, recommend(raw, pack, scenario, reportParent, overrides), new Date().toISOString().slice(0, 10)))
  const [copied, setCopied] = useState(false)
  const copyLink = async () => { const url = buildShareUrl(); try { await navigator.clipboard.writeText(url) } catch { /* ignore */ } setCopied(true); setTimeout(() => setCopied(false), 1500) }

  const sectionLabel = LEVEL_NAME[Math.min(level, 3)]
  const hint = level < 2 ? 'click a bubble to drill in' : level === 2 ? 'click a model to open it' : level === 3 ? 'click a variant to inspect' : 'size = sales · colour = powertrain'

  return (
    <div className="space-y-5">
      {/* Breadcrumb + actions */}
      <div className="flex flex-wrap items-center gap-1.5">
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1.5">
            <button onClick={() => setDrill(drill.slice(0, i))}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm font-semibold transition ${i === crumbs.length - 1 ? 'bg-ink-100 text-white' : 'text-ink-400 hover:text-ink-100'}`}>
              <span className="text-[9px] font-bold uppercase tracking-wider opacity-50">{SCOPE_NAME[i]}</span>
              <span className="max-w-[12rem] truncate">{c}</span>
            </button>
            {i < crumbs.length - 1 && <Icon name="chevron" size={13} className="text-ink-600" />}
          </span>
        ))}
        {drill.length > 0 && <button onClick={() => setDrill(drill.slice(0, -1))} className="ml-1 flex items-center gap-1 rounded-lg border border-black/[0.08] px-2 py-1 text-[11px] text-ink-400 hover:text-ink-100"><Icon name="reset" size={12} /> Up</button>}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={copyLink} className="btn-ghost px-3 py-1.5 text-xs"><Icon name={copied ? 'check' : 'link'} size={14} /> {copied ? 'Copied' : 'Copy link'}</button>
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
      <Section className="rise [animation-delay:300ms]" title={`${sectionLabel} vs the limit`} right={
        <span className="flex items-center gap-2 text-[11px] text-ink-500"><Icon name="scatter" size={12} /> {hint}</span>
      }>
        <LimitChart pack={pack} limitAt={limitAt} points={points} colorBy={colorBy} height={360} onPick={drillInto} unitRef={unitRef} />
      </Section>

      {/* Breakdown + children list */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Section className="rise [animation-delay:360ms]" title="How the average is built" right={<span className="text-[11px] text-ink-500">sums to {fmtNum(node.avgMetric, 1)} {pack.metricUnit}</span>}>
          <PowertrainBreakdown agg={node} pack={pack} scenario={scenario} />
        </Section>
        <Section className="rise [animation-delay:420ms]" title={sectionLabel} right={<span className="text-[11px] text-ink-500">gap to limit{level < 4 ? ' · click to drill' : ''}</span>}>
          <div className="space-y-2">
            {items.map((it) => (
              <div key={it.key} onClick={() => it.drillable && drillInto(it.key)}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${it.selected ? 'border-brand/40 bg-brand/[0.06]' : 'border-black/[0.04] bg-black/[0.02]'} ${it.drillable ? 'cursor-pointer hover:border-black/15' : ''}`}>
                <span className="w-28 shrink-0 truncate text-sm text-ink-100">{it.label}</span>
                {it.sub && <span className="w-16 shrink-0 truncate text-[11px] text-ink-500" title={it.sub}>{it.sub}</span>}
                <div className="flex-1"><Bar value={it.gap > 0 ? it.gap : 0} max={maxGap} color={it.gap > 0 ? 'bg-danger' : 'bg-safe'} /></div>
                <span className={`num w-16 shrink-0 text-right text-sm font-semibold ${it.gap > 0 ? 'text-danger' : 'text-safe'}`}>{it.gap > 0 ? '+' : ''}{fmtNum(it.gap, 1)}</span>
                <span className="num w-16 shrink-0 text-right text-[11px] text-ink-500">{fmtInt(it.units)}u</span>
                {it.drillable && <Icon name="chevron" size={13} className="text-ink-600" />}
              </div>
            ))}
            {items.length === 0 && <div className="py-6 text-center text-sm text-ink-500">No further breakdown at this level.</div>}
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
              const o = py.metric > py.limit
              return (
                <div key={py.year} className="rounded-lg border border-black/[0.05] bg-black/[0.015] p-3">
                  <div className="flex items-baseline justify-between">
                    <span className="num text-xs font-bold text-ink-300">{py.year}</span>
                    <span className={`num text-xs font-bold ${o ? 'text-danger' : 'text-safe'}`}>{o ? '+' : ''}{fmtNum(py.metric - py.limit, 1)}</span>
                  </div>
                  <div className="num mt-1 text-[11px] text-ink-500">fleet {fmtNum(py.metric, 1)} vs limit {fmtNum(py.limit, 1)}</div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-black/[0.06]">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, (py.metric / Math.max(py.limit, 1)) * 100)}%`, background: o ? '#E0484D' : '#0E9F6E' }} />
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
