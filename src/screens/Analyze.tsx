import { useMemo, useState } from 'react'
import { useCompliance } from '../lib/useCompliance'
import { useStore } from '../state/store'
import type { Aggregate, Scenario, Vehicle } from '../engine/types'
import { aggregate, applyScenario, variantKey, fmtInt, fmtMoney, fmtNum, threeYearAverage } from '../engine/engine'
import LimitChart, { type ChartPoint, type DragConfig } from '../components/LimitChart'
import PowertrainBreakdown from '../components/PowertrainBreakdown'
import { GapHeatmap, Mekko } from '../components/Charts'
import { makerYearGap, makerMekko } from '../lib/analytics'
import { parentPoolMap } from '../engine/pooling'
import { Section, Stat, Bar } from '../components/ui'
import CafeLedger from '../components/CafeLedger'
import { INDIA_CATALOG } from '../data/india_catalog'
import Icon from '../components/Icon'
import { makeLimitAt, makeLimitAtWith } from '../lib/chart'
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

/** One drill workspace, two bases.
 *  mode='actuals' → the Analyse module: the as-sold book of record. Levers and
 *  per-maker overrides are structurally out of reach (useCompliance basis).
 *  mode='model'   → the Scenario module's Model workbench: the same workspace
 *  under the working assumptions, with the rail alongside. */
export default function Analyze({ mode = 'model' }: { mode?: 'actuals' | 'model' }) {
  const actuals = mode === 'actuals'
  const { pack, raw, tree, drillTree, scenario, overrides, country, meta } = useCompliance(actuals ? 'actuals' : 'live')
  const drill = useStore((s) => s.drillPath)
  const setDrill = useStore((s) => s.setDrill)
  const setParent = useStore((s) => s.setParent)
  const setScreen = useStore((s) => s.setScreen)
  const patchScenario = useStore((s) => s.patchScenario)
  const showProv = useProvenance((s) => s.show)

  const level = drill.length // 0 market · 1 pool · 2 manufacturer · 3 model · 4 variant
  const node = useMemo(() => nodeAt(drillTree, drill), [drillTree, drill])
  // At the variant leaf, chart the sibling variants (the parent model) with the
  // selected one highlighted, so a variant is always seen in context.
  const chartNode = useMemo(() => (level === 4 ? nodeAt(drillTree, drill.slice(0, 3)) : node), [level, drillTree, drill, node])
  const selectedVariant = level === 4 ? drill[3] : null
  const limitAt = useMemo(() => makeLimitAt(pack, scenario, chartNode), [pack, scenario, chartNode])
  const colorBy = level >= 3 ? 'powertrain' : 'status'

  // ── the line, made honest ──────────────────────────────────────────────────
  // L1 ghosts: every other year's statutory line behind the current one (the
  // walls close in). L2 corridor: while the regime is a DRAFT, the line is not
  // law — show the band the final rules can land in (±10% stringency, the same
  // range as the rail lever) with fan-chart shading, and on the Model workbench
  // let the analyst DRAG the line itself to set that lever. L3: Line/Gap view.
  const [chartView, setChartView] = useState<'line' | 'gap'>('line')
  const draftLine = !!pack.regimeFor?.(scenario.year)?.draft
  const ghostLines = useMemo(
    () => pack.years.filter((y) => y !== scenario.year).map((y) => ({
      year: y, draft: !!pack.regimeFor?.(y)?.draft,
      limitAt: makeLimitAtWith(pack, scenario, chartNode, { year: y }),
    })),
    [pack, scenario, chartNode],
  )
  const corridor = useMemo(() => (draftLine ? {
    lo: makeLimitAtWith(pack, scenario, chartNode, { targetShiftPct: -10 }),
    hi: makeLimitAtWith(pack, scenario, chartNode, { targetShiftPct: 10 }),
    note: `${pack.regimeFor!(scenario.year).name} is a draft — the final notification can land anywhere in this corridor (stringency −10% … +10%). The centre line is the draft as published${(scenario.targetShiftPct ?? 0) !== 0 ? `, currently stressed ${scenario.targetShiftPct! > 0 ? '+' : ''}${scenario.targetShiftPct}%` : ''}.`,
  } : undefined), [draftLine, pack, scenario, chartNode])
  // dragging the line is a LEVER (regulator-side) — Model workbench only;
  // Plan is the book of record, where the line is the draft as published.
  const stringency = useMemo(() => (draftLine && mode === 'model' ? {
    value: scenario.targetShiftPct ?? 0, min: -10, max: 10,
    lineAt: (pct: number) => makeLimitAtWith(pack, scenario, chartNode, { targetShiftPct: pct === 0 ? null : pct }),
    solve: (mass: number, targetLimit: number) => {
      let lo = -10, hi = 10
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2
        if (makeLimitAtWith(pack, scenario, chartNode, { targetShiftPct: mid })(mass) < targetLimit) lo = mid
        else hi = mid
      }
      return (lo + hi) / 2
    },
    commit: (pct: number) => patchScenario({ targetShiftPct: pct === 0 ? null : pct }),
  } : undefined), [draftLine, mode, pack, scenario, chartNode, patchScenario])

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
      mass: c.avgMass, metric: c.avgMetric, units: c.rawUnits, gap: c.gap, fine: c.fine,
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

  // ── the analysis layer: verdict inputs computed from the same engine ───────
  // Re-aggregate the CURRENT drill node under any probe scenario (other years,
  // forced ZE shares) by re-applying the scenario and re-filtering the path.
  const matchPath = (x: Vehicle) => {
    if (drill.length >= 1 && (x.pool || x.parent) !== drill[0]) return false
    if (drill.length >= 2 && x.parent !== drill[1]) return false
    if (drill.length >= 3 && x.model !== drill[2]) return false
    if (drill.length >= 4 && variantKey(x) !== drill[3]) return false
    return true
  }
  const aggFor = (sc: Scenario) => aggregate(applyScenario(raw, sc, pack, overrides).filter(matchPath), pack, sc, node.label, node.level, 'probe')

  // ── DIRECT MANIPULATION (Model workbench only): drag a bubble, the engine
  // solves the levers that reach the target. Vertical = electrification solve
  // (bisection on the scoped ZE share); horizontal = the mass lever (which
  // moves that scope's limit too). Analyse never gets this — actuals are law.
  const patchOverride = useStore((s) => s.patchOverride)
  const [lastDrag, setLastDrag] = useState<{ scope: string; label: string; desc: string; prev: Partial<Scenario> | null } | null>(null)
  const scopeOf = (key: string) => (level === 0 ? `pool:${key}` : key)
  const aggScope = (key: string, ovPatch: Partial<Scenario>) => {
    const scope = scopeOf(key)
    const ovAll = { ...overrides, [scope]: { ...(overrides[scope] ?? {}), ...ovPatch } }
    const rows = applyScenario(raw, scenario, pack, ovAll).filter((v) => (level === 0 ? (v.pool || v.parent) === key : v.parent === key))
    return aggregate(rows, pack, scenario, key, level === 0 ? 'pool' : 'parent', 'drag-probe')
  }
  const solveDrag = (key: string, targetMass: number, targetMetric: number) => {
    const cur = items.find((i) => i.key === key)
    if (!cur) return null
    const scope = scopeOf(key)
    const existing = overrides[scope] ?? {}
    const effShift = existing.massShiftKg ?? scenario.massShiftKg
    const massShiftKg = pack.massBasedLimit === false ? (existing.massShiftKg ?? 0)
      : Math.max(-250, Math.min(250, Math.round(effShift + (targetMass - cur.mass))))
    // bisection: forced ZE share that lands the scope on the target metric
    const metricAt = (share: number) => aggScope(key, { massShiftKg, evSharePct: share }).avgMetric
    let lo = 0, hi = 95
    if (metricAt(95) > targetMetric) { lo = hi = 95 }        // even full ZE can't get there
    else if (metricAt(0) < targetMetric) { lo = hi = 0 }     // target is above the 0%-forced fleet
    else for (let it = 0; it < 16; it++) { const mid = (lo + hi) / 2; if (metricAt(mid) > targetMetric) lo = mid; else hi = mid }
    const share = Math.round(hi * 10) / 10
    const after = aggScope(key, { massShiftKg, evSharePct: share })
    return { scope, share, massShiftKg, after, cur }
  }
  const dragCfg: DragConfig | undefined = mode === 'model' && level <= 1 ? {
    lockX: pack.massBasedLimit === false,
    enabled: (p) => !p.isFleet && p.units > 0 && p.status !== 'exempt',
    preview: (key, mass, metric) => {
      const sol = solveDrag(key, mass, metric)
      if (!sol) return []
      const massTxt = pack.massBasedLimit === false ? '' : ` · mass ${sol.massShiftKg >= 0 ? '+' : ''}${sol.massShiftKg} kg`
      return [
        `${key.split(/\s+/).slice(0, 2).join(' ')} → ${fmtNum(metric, 1)} ${pack.metricUnit}`,
        `solve: force ${sol.share}% ZE${massTxt}`,
        `fine ${fmtMoney(sol.cur.fine, pack.currency)} → ${fmtMoney(sol.after.fine, pack.currency)}`,
        sol.after.gap > 0 ? `still ${fmtNum(sol.after.gap, 1)} over` : 'clears the line',
      ]
    },
    commit: (key, mass, metric) => {
      const sol = solveDrag(key, mass, metric)
      if (!sol) return
      setLastDrag({
        scope: sol.scope, label: key,
        desc: `${sol.share}% ZE${pack.massBasedLimit === false ? '' : ` · mass ${sol.massShiftKg >= 0 ? '+' : ''}${sol.massShiftKg} kg`}`,
        prev: overrides[sol.scope] ? { ...overrides[sol.scope] } : null,
      })
      patchOverride(sol.scope, { evSharePct: sol.share, massShiftKg: sol.massShiftKg })
    },
  } : undefined
  const undoDrag = () => { if (lastDrag) { patchOverride(lastDrag.scope, null); if (lastDrag.prev) patchOverride(lastDrag.scope, lastDrag.prev); setLastDrag(null) } }

  // Trajectory: this node's gap across every compliance year (the ICCT framing —
  // "are we on track", not just "where are we this year").
  const glide = useMemo(
    () => pack.years.map((y) => { const a = aggFor({ ...scenario, year: y }); return { year: y, gap: a.gap, units: a.rawUnits } }),
    [raw, pack, scenario, overrides, drill], // eslint-disable-line react-hooks/exhaustive-deps
  )

  // The most actionable number when over: the zero-emission mix that just clears
  // the line (coarse 5pp sweep, then 1pp refine). Manufacturer level ONLY — at
  // market/pool level a uniform forced share is a redistribution assumption, not
  // an answer, and inside a model/variant the lever has no meaning.
  const requiredZE = useMemo(() => {
    if (node.gap <= 0 || level !== 2) return null
    const start = Math.max(1, Math.ceil(node.zlevShare * 100))
    for (let t = start; t <= 95; t += 5) {
      if (aggFor({ ...scenario, evSharePct: t }).gap <= 0) {
        for (let u = Math.max(start, t - 4); u <= t; u++) if (aggFor({ ...scenario, evSharePct: u }).gap <= 0) return u
        return t
      }
    }
    return null
  }, [raw, pack, scenario, overrides, drill, node, level]) // eslint-disable-line react-hooks/exhaustive-deps

  // Biggest drag: the child costing the most weighted distance to the line.
  const worstChild = useMemo(
    () => items.filter((i) => i.gap > 0).sort((a, b) => b.gap * b.units - a.gap * a.units)[0] ?? null,
    [items],
  )

  // Explore views (heat × year, volume × mix) follow the drill: market shows
  // makers, a drilled maker shows its models.
  const exploreFocus = drill.length >= 2 ? drill[1] : null
  const heat = useMemo(() => makerYearGap(raw, pack, scenario, overrides, exploreFocus), [raw, pack, scenario, overrides, exploreFocus])
  const mekko = useMemo(() => makerMekko(raw, pack, scenario, overrides, exploreFocus), [raw, pack, scenario, overrides, exploreFocus])
  const pmap = useMemo(() => parentPoolMap(raw, scenario.year), [raw, scenario.year])
  const openExplore = (m: string) => {
    if (exploreFocus) setDrill([drill[0], exploreFocus, m])
    else { setParent(m); setDrill([pmap[m] ?? m, m]) }
  }

  // Chart measure control (S&P cube convention: the analyst picks the encoding).
  const [colorMode, setColorMode] = useState<'auto' | 'status' | 'powertrain'>('auto')
  const colorByEff = colorMode === 'auto' ? colorBy : colorMode
  // Scoreboard sort. The fine column only exists while the rows are legal
  // entities (pools/manufacturers) — a model's standalone "fine" is a what-if.
  const [sortBy, setSortBy] = useState<'gap' | 'units' | 'fine'>('gap')
  const showFineCol = level <= 1
  const sortByEff = sortBy === 'fine' && !showFineCol ? 'gap' : sortBy

  const gapA = useCountUp(node.gap), avgA = useCountUp(node.avgMetric), fineA = useCountUp(fineValue)
  const regA = useCountUp(node.rawUnits), unitsA = useCountUp(node.units), massA = useCountUp(node.avgMass)
  const crumbs = [drillTree.label, ...drill]
  const reportParent = drill[1] ?? tree.children?.[0]?.label ?? node.label
  const exportReport = () => openPrintReport(`Autocred AI · ${node.label}`, buildMakerReport(node, pack, scenario, meta, recommend(raw, pack, scenario, reportParent, overrides), new Date().toISOString().slice(0, 10)))
  const [copied, setCopied] = useState(false)
  const copyLink = async () => { const url = buildShareUrl(); try { await navigator.clipboard.writeText(url) } catch { /* ignore */ } setCopied(true); setTimeout(() => setCopied(false), 1500) }

  const sectionLabel = LEVEL_NAME[Math.min(level, 3)]
  const hint = mode === 'model' && level <= 1
    ? 'drag a bubble to set a target — the engine solves the levers · click to drill'
    : level < 2 ? 'click a bubble to drill in' : level === 2 ? 'click a model to open it' : level === 3 ? 'click a variant to inspect' : 'size = sales · colour = powertrain'

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
          {pack.coverageNote && (
            <span className="flex items-center gap-1.5 rounded-full border border-warn/30 bg-warn/10 px-2.5 py-1 text-[11px] font-semibold text-warn" title={pack.coverageNote}>
              <Icon name="alert" size={12} /> Covered market · {(tree.children ?? []).filter((c) => c.rawUnits > 0).length} makers
            </span>
          )}
          {pack.regimeFor && (() => {
            const r = pack.regimeFor(scenario.year)
            return (
              <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${r.draft ? 'border-warn/30 bg-warn/10 text-warn' : 'border-safe/30 bg-safe/10 text-safe'}`}
                title={`${r.draft ? `${r.name} is a draft — final notification pending; stress it with the Draft stringency lever` : `${r.name} is in force`}${r.cycleNote ? ` · ${r.cycleNote}` : ''}`}>
                <Icon name="scale" size={12} /> {r.name}{r.draft ? ' · draft' : ''}{r.cycle ? ` · ${r.cycle}` : ''}
              </span>
            )
          })()}
          <button onClick={copyLink} className="btn-ghost px-3 py-1.5 text-xs"><Icon name={copied ? 'check' : 'link'} size={14} /> {copied ? 'Copied' : 'Copy link'}</button>
          <button onClick={() => showProv({ agg: node, pack, scenario, meta })} className="btn-ghost px-3 py-1.5 text-xs"><Icon name="shield" size={14} /> Show the working</button>
          <button onClick={exportReport} className="btn-ghost px-3 py-1.5 text-xs"><Icon name="section" size={14} /> Export</button>
        </div>
      </div>

      {/* THE VERDICT — the answer in words, plus where this scope is heading */}
      <div className="rise card relative flex flex-wrap items-start justify-between gap-x-8 gap-y-4 overflow-hidden p-5">
        <span className="absolute inset-y-0 left-0 w-1" style={{ background: node.status === 'exempt' ? '#D98005' : over ? '#E0484D' : '#0E9F6E' }} />
        <div className="min-w-[280px] flex-1">
          <div className="label">The verdict · {scenario.year}</div>
          <p className="mt-1.5 max-w-xl text-[15px] leading-relaxed text-ink-300">
            <b className="text-ink-100">{node.label}</b>{' '}
            {node.status === 'exempt' ? (
              <>is <b className="text-warn">out of scope</b> at {fmtInt(node.rawUnits)} units (threshold {fmtInt(pack.smallVolumeThreshold)}) — no penalty applies.</>
            ) : over ? (
              <>is <b className="text-danger">{fmtNum(node.gap, 1)} {pack.metricUnit} over</b> its {fmtNum(node.limit, 1)} target —{' '}
                <b className="num text-danger">{fmtMoney(fineValue, pack.currency)}</b> at risk across {fmtInt(node.rawUnits)} units.</>
            ) : (
              <>is <b className="text-safe">{fmtNum(Math.abs(node.gap), 1)} {pack.metricUnit} under</b> its {fmtNum(node.limit, 1)} target
                {pack.creditPrice != null && node.rawUnits > 0 && (
                  <> — headroom worth ≈ <b className="num text-safe">{fmtMoney(Math.abs(node.gap) * pack.creditPrice * node.rawUnits, pack.currency)}</b> at current credit prices</>
                )}.</>
            )}
          </p>
          {(over || worstChild) && node.status !== 'exempt' && (
            <p className="mt-1.5 text-[12.5px] text-ink-400">
              {over && requiredZE != null && (
                <>Clearing it needs ≈ <b className="num text-ink-100">{requiredZE}%</b> zero-emission mix (now {Math.round(node.zlevShare * 100)}%).{' '}</>
              )}
              {worstChild && (
                <>Biggest drag: <button onClick={() => worstChild.drillable && drillInto(worstChild.key)} className="font-semibold text-ink-100 underline decoration-dotted underline-offset-2 hover:text-brand">{worstChild.label}</button> (+{fmtNum(worstChild.gap, 1)} · {fmtInt(worstChild.units)}u).{' '}</>
              )}
              {over && <button onClick={() => setScreen('under')} className="font-semibold text-brand hover:underline">Cheapest path out →</button>}
            </p>
          )}
        </div>
        {/* trajectory — click a year to move the whole workspace there */}
        <div className="shrink-0">
          <div className="label mb-1.5">Trajectory · gap by year</div>
          {/* regime era bands — which rulebook and test cycle governs each year,
              exactly (India: CAFE II·MIDC/NEDC through FY26-27, CAFE III·WLTP
              transition from FY27-28). Only drawn when the market transitions. */}
          {pack.regimeFor && (() => {
            const eras: { name: string; draft?: boolean; cycle?: string; cycleNote?: string; n: number }[] = []
            for (const y of pack.years) {
              const r = pack.regimeFor(y)
              const last = eras[eras.length - 1]
              if (last && last.name === r.name) last.n += 1
              else eras.push({ ...r, n: 1 })
            }
            return eras.length > 1 ? (
              <div className="mb-1 flex gap-1" data-testid="regime-eras">
                {eras.map((e) => (
                  <div key={e.name} style={{ flex: e.n }} title={e.cycleNote ?? e.name}
                    className={`whitespace-nowrap rounded-t-md border-x border-t px-1 pt-0.5 text-center text-[8.5px] font-bold uppercase tracking-wide ${e.draft ? 'border-warn/25 bg-warn/[0.07] text-warn' : 'border-safe/25 bg-safe/[0.07] text-safe'}`}>
                    {e.name}{e.draft ? ' draft' : ''}{e.cycle ? ` · ${e.cycle}` : ''}
                  </div>
                ))}
              </div>
            ) : null
          })()}
          <div className="flex gap-1">
            {glide.map((g) => {
              const active = g.year === scenario.year
              const tone = g.units === 0 ? 'text-ink-500 bg-black/[0.04]' : g.gap > 0 ? 'text-danger bg-danger/10' : 'text-safe bg-safe/10'
              return (
                <button key={g.year} onClick={() => patchScenario({ year: g.year })} title={`${g.year}: ${g.gap > 0 ? '+' : ''}${fmtNum(g.gap, 1)} ${pack.metricUnit}`}
                  className={`flex min-w-[46px] flex-col items-center rounded-lg px-1.5 py-1.5 transition ${tone} ${active ? 'ring-2 ring-ink-100/70' : 'hover:ring-1 hover:ring-black/20'}`}>
                  <span className="num text-[9.5px] font-semibold opacity-70">{`'${String(g.year).slice(2)}`}</span>
                  <span className="num text-[11.5px] font-bold leading-tight">{g.units === 0 ? '—' : `${g.gap > 0 ? '+' : ''}${fmtNum(g.gap, 1)}`}</span>
                </button>
              )
            })}
          </div>
          {level === 0 && (() => {
            const counts = pack.years.map((y) => new Set(raw.filter((v) => v.year === y && v.sales > 0).map((v) => v.parent)).size)
            const lo = Math.min(...counts), hi = Math.max(...counts)
            return lo !== hi ? (
              <p className="mt-1.5 max-w-[340px] text-[10px] leading-snug text-warn">
                <Icon name="alert" size={10} className="mr-0.5 inline" /> Maker coverage varies by year ({lo}→{hi}) — year-over-year market moves include composition, not just fleet change.
              </p>
            ) : null
          })()}
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
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-500">
            {fineSub}
            {pack.illustrativeRates && <span className="rounded-full border border-warn/30 bg-warn/10 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-warn" title={`${pack.fineRateLabel} — rate pending primary-source confirmation`}>illustrative rate</span>}
          </div>
        </div>
        <Stat className="rise [animation-delay:180ms]" label="Registrations" value={fmtInt(regA)} sub={`${fmtInt(unitsA)} effective`} />
        <Stat className="rise [animation-delay:240ms]" label={pack.massLabel} value={`${fmtInt(massA)}`} sub="kg average" />
      </div>

      {/* Bubble chart with drill */}
      <Section className="rise [animation-delay:300ms]" title={chartView === 'gap' ? `${sectionLabel} · gap to the line` : `${sectionLabel} vs the limit`} right={
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-0.5 rounded-lg bg-black/[0.04] p-0.5" title="Line = the classic mass-indexed chart. Gap = distance to the line as the axis — under the line is literally below zero, and gaps compare across masses.">
            {(['line', 'gap'] as const).map((v) => (
              <button key={v} data-testid={`chart-view-${v}`} onClick={() => setChartView(v)}
                className={`rounded-md px-2 py-0.5 text-[10px] font-semibold capitalize transition ${chartView === v ? 'bg-white text-ink-100 shadow-sm' : 'text-ink-500 hover:text-ink-100'}`}>
                {v === 'line' ? 'Line' : 'Gap'}
              </button>
            ))}
          </span>
          <span className="flex items-center gap-0.5 rounded-lg bg-black/[0.04] p-0.5">
            {(['auto', 'status', 'powertrain'] as const).map((m) => (
              <button key={m} onClick={() => setColorMode(m)}
                className={`rounded-md px-2 py-0.5 text-[10px] font-semibold capitalize transition ${colorMode === m ? 'bg-white text-ink-100 shadow-sm' : 'text-ink-500 hover:text-ink-100'}`}>
                {m === 'auto' ? 'Auto' : m}
              </button>
            ))}
          </span>
          <span className="hidden items-center gap-2 text-[11px] text-ink-500 md:flex"><Icon name="scatter" size={12} /> {hint}</span>
        </span>
      }>
        {lastDrag && (
          <div className="mb-2 flex items-center gap-2 rounded-xl border border-brand/25 bg-brand/[0.06] px-3 py-1.5 text-[11.5px]">
            <Icon name="sliders" size={13} className="text-brand" />
            <span className="text-ink-200">Applied to <b>{lastDrag.label.split(' ')[0]}</b>: <span className="num font-semibold">{lastDrag.desc}</span> — scoped levers, visible in the rail.</span>
            <button data-testid="drag-undo" onClick={undoDrag} className="ml-auto font-bold text-brand hover:underline">Undo</button>
          </div>
        )}
        <div className="relative">
          <LimitChart pack={pack} limitAt={limitAt} points={points} colorBy={colorByEff} height={360} onPick={drillInto} unitRef={unitRef} drag={dragCfg} logos={level <= 1}
            ghosts={ghostLines} corridor={corridor} stringency={stringency} view={chartView} draftLine={draftLine} />
          {/* which year the chart is showing — always in the chart itself, with
              the governing regime + test cycle when the pack knows them */}
          <div data-testid="chart-year-badge" className="pointer-events-none absolute right-3 top-1.5 select-none text-right">
            <div className="dnum text-[26px] font-bold leading-none text-ink-100/85">
              {pack.id === 'IN' ? `FY ${scenario.year}-${(scenario.year + 1) % 100}` : scenario.year}
            </div>
            {pack.regimeFor && (() => {
              const r = pack.regimeFor(scenario.year)
              return (
                <div className={`mt-0.5 text-[9.5px] font-bold uppercase tracking-wide ${r.draft ? 'text-warn' : 'text-safe'}`}>
                  {r.name}{r.draft ? ' · draft' : ''}{r.cycle ? ` · ${r.cycle}` : ''}
                </div>
              )
            })()}
          </div>
        </div>
      </Section>

      {/* Breakdown + children list */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Section className="rise [animation-delay:360ms]" title="How the average is built" right={<span className="text-[11px] text-ink-500">sums to {fmtNum(node.avgMetric, 1)} {pack.metricUnit}</span>}>
          <PowertrainBreakdown agg={node} pack={pack} scenario={scenario} />
        </Section>
        <Section className="rise [animation-delay:420ms]" title={`${sectionLabel} · scoreboard`} right={
          <span className="flex items-center gap-0.5 rounded-lg bg-black/[0.04] p-0.5">
            {(showFineCol ? (['gap', 'units', 'fine'] as const) : (['gap', 'units'] as const)).map((k) => (
              <button key={k} onClick={() => setSortBy(k)}
                className={`rounded-md px-2 py-0.5 text-[10px] font-semibold capitalize transition ${sortByEff === k ? 'bg-white text-ink-100 shadow-sm' : 'text-ink-500 hover:text-ink-100'}`}>
                {k === 'gap' ? 'By gap' : k === 'units' ? 'By volume' : 'By fine'}
              </button>
            ))}
          </span>
        }>
          <div className="space-y-2">
            {[...items].sort((a, b) => (sortByEff === 'gap' ? b.gap - a.gap : sortByEff === 'units' ? b.units - a.units : b.fine - a.fine)).map((it) => (
              <div key={it.key} onClick={() => it.drillable && drillInto(it.key)}
                className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 transition-colors ${it.selected ? 'border-brand/40 bg-brand/[0.06]' : 'border-black/[0.04] bg-black/[0.02]'} ${it.drillable ? 'cursor-pointer hover:border-black/15 hover:bg-black/[0.035]' : ''}`}>
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${it.status === 'fine' ? 'bg-danger' : it.status === 'exempt' ? 'bg-warn' : it.status === 'no-sales' ? 'bg-ink-600' : 'bg-safe'}`} />
                <span className="w-24 shrink-0 truncate text-sm text-ink-100" title={it.label}>{it.label}</span>
                {it.sub && <span className="hidden w-14 shrink-0 truncate text-[11px] text-ink-500 lg:block" title={it.sub}>{it.sub}</span>}
                <div className="flex-1"><Bar value={it.gap > 0 ? it.gap : 0} max={maxGap} color={it.gap > 0 ? 'bg-danger' : 'bg-safe'} /></div>
                <span className={`num w-14 shrink-0 text-right text-sm font-semibold ${it.gap > 0 ? 'text-danger' : 'text-safe'}`}>{it.gap > 0 ? '+' : ''}{fmtNum(it.gap, 1)}</span>
                <span className="num w-14 shrink-0 text-right text-[11px] text-ink-500">{fmtInt(it.units)}u</span>
                {showFineCol && <span className={`num w-16 shrink-0 text-right text-[11px] font-semibold ${it.fine > 0 ? 'text-danger' : 'text-ink-500'}`}>{it.fine > 0 ? fmtMoney(it.fine, pack.currency) : '—'}</span>}
                {it.drillable && <Icon name="chevron" size={13} className="shrink-0 text-ink-600" />}
              </div>
            ))}
            {items.length === 0 && <div className="py-6 text-center text-sm text-ink-500">No further breakdown at this level.</div>}
          </div>
        </Section>
      </div>

      {/* Explore — the heat and mix views, scoped to the current drill */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Section className="rise [animation-delay:480ms]" title={`Gap heatmap · ${exploreFocus ? 'models' : 'makers'} × year`} right={<span className="text-[11px] text-ink-500">click → drill</span>}>
          <GapHeatmap data={heat} unit={pack.metricUnit} onPick={openExplore} />
        </Section>
        <Section className="rise [animation-delay:540ms]" title="Volume × mix" right={<span className="text-[11px] text-ink-500">width = units · colour = powertrain</span>}>
          <Mekko cols={mekko} onPick={openExplore} />
        </Section>
      </div>

      {/* catalog variants for the drilled model — specs from the master file
          (volumes live at model level until the master fills variant volume) */}
      {country === 'IN' && level >= 3 && (() => {
        const specs = INDIA_CATALOG.filter((c) => c.parent === drill[1] && c.model === drill[2])
        if (!specs.length) return null
        return (
          <Section className="rise" title={`Catalog variants · ${drill[2]}`} right={<span className="text-[11px] text-ink-500">master-file specs — sales are recorded at model level</span>}>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs" data-testid="catalog-variants">
                <thead><tr className="border-b border-black/[0.08] text-[10px] font-semibold uppercase tracking-wide text-ink-500">
                  <th className="py-2 pr-3">Variant</th><th className="py-2 pr-3">Powertrain</th><th className="py-2 pr-3 text-right">CO₂ g/km</th><th className="py-2 pr-3 text-right">km/l</th><th className="py-2 pr-3 text-right">Kerb kg</th><th className="py-2 pr-3 text-right">kWh / km</th><th className="py-2 text-right">Year</th>
                </tr></thead>
                <tbody>
                  {specs.map((c, i) => (
                    <tr key={i} className="border-b border-black/[0.04] odd:bg-black/[0.012]">
                      <td className="py-1.5 pr-3 font-medium text-ink-100">{c.variant}</td>
                      <td className="py-1.5 pr-3 text-ink-300">{c.powertrain}</td>
                      <td className="num py-1.5 pr-3 text-right text-ink-200">{c.co2 != null ? fmtNum(c.co2, 1) : '—'}</td>
                      <td className="num py-1.5 pr-3 text-right text-ink-300">{(c as any).fuelKmpl != null ? fmtNum((c as any).fuelKmpl, 1) : '—'}</td>
                      <td className="num py-1.5 pr-3 text-right text-ink-300">{c.kerbMass != null ? fmtInt(c.kerbMass) : '—'}</td>
                      <td className="num py-1.5 pr-3 text-right text-ink-300">{c.battery != null ? `${c.battery} kWh${c.range ? ` · ${c.range} km` : ''}` : '—'}</td>
                      <td className="num py-1.5 text-right text-ink-500">{c.year}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )
      })()}

      {/* the master structure's computed columns (AO–AT) — India CAFE ledger */}
      {country === 'IN' && <CafeLedger basis={actuals ? 'actuals' : 'live'} />}

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
        {actuals ? (
          <button className="btn-primary" onClick={() => setScreen('model')}><Icon name="sliders" size={16} /> Model this scope</button>
        ) : (
          <button className="btn-primary" onClick={() => setScreen('under')}><Icon name="target" size={16} /> Get me under the line</button>
        )}
        <button className="btn-ghost" onClick={() => setScreen('pool')}><Icon name="handshake" size={15} /> Pooling & trading</button>
        <button className="btn-ghost" onClick={() => setScreen('forecast')}><Icon name="trending" size={15} /> Forecast</button>
      </div>
    </div>
  )
}
