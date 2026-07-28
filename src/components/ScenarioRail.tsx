import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useStore, scopeKey, defaultScenario } from '../state/store'
import type { Aggregate } from '../engine/types'
import { useCompliance } from '../lib/useCompliance'
import { fmtNum, fmtMoney, buildDrillTree, threeYearAverage, variantKey, fleetFineFast } from '../engine/engine'
import { simulateRisk, type RiskResult } from '../engine/montecarlo'
import type { Vehicle, Scenario, ShareScope } from '../engine/types'
import { INDIA_CATALOG_BY_MODEL, INDIA_MODELS } from '../data/india_catalog'
import { nevRatioFor } from '../engine/china/dualcredit'
import Icon, { type IconName } from './Icon'

const PT_COLOR: Record<string, string> = {
  BEV: '#3ddc97', PHEV: '#5b8def', HEV: '#8b7ff0', MHEV: '#ffb454', ICE: '#ff5d6c', 'Strong Hybrid': '#8b7ff0',
}
const ptColor = (p: string) => PT_COLOR[p] ?? '#8C8273'
const SCOPE_NAME = ['Market', 'Pool', 'Manufacturer', 'Model', 'Variant']

interface Outcome { metric: number; limit: number; gap: number; fine: number; units: number; zlevShare?: number; marketFine: number; poolFine: number; makerFine: number }

// ── small UI atoms ──────────────────────────────────────────────────────────
function Group({ title, icon, owner, children, defaultOpen = true, modified, subtitle, onReset }: {
  title: string; icon: IconName; owner?: string; children: ReactNode
  defaultOpen?: boolean; modified?: boolean; subtitle?: string; onReset?: () => void
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={`rounded-xl border bg-white/[0.035] transition-colors ${modified ? 'border-brand/20' : 'border-white/[0.08]'}`}>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-3 py-2.5">
        <span className="flex min-w-0 items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-white/70">
          <Icon name={icon} size={13} className="text-brand" />
          <span className="truncate">{title}</span>
          {modified && <i className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          {subtitle && !open && <span className="text-[10px] normal-case text-white/45">{subtitle}</span>}
          <Icon name="chevron" size={13} className={`text-white/45 transition-transform ${open ? 'rotate-90' : ''}`} />
        </div>
      </button>
      {open && (
        <div className="space-y-3.5 px-3 pb-3.5">
          {/* who owns these decisions — the hierarchy made visible */}
          {(owner || (modified && onReset)) && (
            <div className="-mt-1 flex items-center justify-between gap-2 border-b border-white/[0.07] pb-2">
              <span className="text-[9.5px] leading-snug text-white/45">{owner}</span>
              {modified && onReset && (
                <button onClick={onReset} className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[9.5px] font-semibold text-white/45 transition hover:bg-danger/10 hover:text-danger">
                  <Icon name="reset" size={10} /> Reset group
                </button>
              )}
            </div>
          )}
          {children}
        </div>
      )}
    </div>
  )
}

function NumSlider({ label, value, min, max, step, onChange, unit, hint, baseline }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void
  unit?: string; hint?: string; baseline?: number
}) {
  const modified = baseline != null && Math.abs(value - baseline) > step / 2
  const round = (n: number) => Math.round(n / step) * step
  const shown = step < 1 ? round(value) : Math.round(value)
  const pct = (v: number) => ((v - min) / (max - min)) * 100
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="label flex items-center gap-1.5">{label}{modified && <i className="h-1.5 w-1.5 rounded-full bg-brand" title="modified" />}</span>
        <div className="flex items-center gap-1">
          <input type="number" value={shown} min={min} max={max} step={step}
            onChange={(e) => { const v = parseFloat(e.target.value); if (!Number.isNaN(v)) onChange(Math.max(min, Math.min(max, v))) }}
            className={`num w-14 rounded-md border px-1.5 py-0.5 text-right text-xs font-bold outline-none focus:border-brand/40 ${modified ? 'border-brand/30 bg-brand/[0.06] text-brand' : 'border-white/12 bg-white/[0.05] text-white/70'}`} />
          {unit && <span className="text-[10px] text-white/45">{unit}</span>}
          {modified && <button onClick={() => onChange(baseline!)} title={`back to ${baseline}`}><Icon name="reset" size={11} className="text-white/45 hover:text-white" /></button>}
        </div>
      </div>
      <div className="relative mt-2">
        <input type="range" className="w-full" min={min} max={max} step={step} value={value}
          style={{ ['--fill' as string]: `${pct(value)}%` }}
          onChange={(e) => onChange(parseFloat(e.target.value))} />
        {/* the as-sold baseline, always visible on the track */}
        {baseline != null && baseline >= min && baseline <= max && (
          <span className="pointer-events-none absolute top-1/2 h-[11px] w-[2px] -translate-y-[54%] rounded-full bg-white/25"
            style={{ left: `calc(${pct(baseline)}% )` }} title={`as-sold ${baseline}`} />
        )}
      </div>
      {hint && <div className="mt-1 text-[10px] text-white/45">{hint}</div>}
    </div>
  )
}

function Toggle({ label, checked, onChange, hint, right }: { label: string; checked: boolean; onChange: (b: boolean) => void; hint?: string; right?: ReactNode }) {
  return (
    <button onClick={() => onChange(!checked)} className="flex w-full items-center justify-between rounded-lg border border-white/12 bg-white/[0.03] px-3 py-2 text-left transition hover:border-white/20">
      <div className="min-w-0"><div className="flex items-center gap-1.5 text-xs font-semibold text-white">{label}{right}</div>{hint && <div className="text-[10px] text-white/45">{hint}</div>}</div>
      <div className={`relative h-5 w-9 shrink-0 rounded-full transition ${checked ? 'bg-brand' : 'bg-white/15'}`}>
        <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </div>
    </button>
  )
}

function Delta({ from, to, money, currency = '' }: { from: number; to: number; money?: boolean; currency?: string }) {
  const d = to - from
  const eps = money ? 1 : 0.05
  if (Math.abs(d) < eps) return <span className="text-[10px] text-white/45">— no change</span>
  const better = d < 0
  return (
    <span className={`num text-[10px] font-bold ${better ? 'text-safe' : 'text-danger'}`}>
      {d < 0 ? '▼' : '▲'} {money ? fmtMoney(Math.abs(d), currency) : fmtNum(Math.abs(d), 1)}
    </span>
  )
}

function PositionBar({ fleet, limit }: { fleet: number; limit: number }) {
  const scale = Math.max(limit * 1.5, fleet * 1.08, 1)
  const fw = Math.min(100, (fleet / scale) * 100)
  const lw = Math.min(100, (limit / scale) * 100)
  const over = fleet > limit
  return (
    <div className="relative mt-2.5 h-2 w-full rounded-full bg-white/[0.08]">
      <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-300" style={{ width: `${fw}%`, background: over ? '#E0484D' : '#0E9F6E' }} />
      <div className="absolute -inset-y-[3px] w-[2px] rounded bg-[#C9A227]" style={{ left: `${lw}%` }} title={`limit ${limit.toFixed(1)}`} />
    </div>
  )
}

function Histogram({ buckets, currency }: { buckets: RiskResult['buckets']; currency: string }) {
  const max = Math.max(...buckets.map((b) => b.count), 1)
  return (
    <div className="mt-2 flex h-7 items-end gap-px">
      {buckets.map((b, i) => (
        <div key={i} title={`${fmtMoney(b.x0, currency)} – ${fmtMoney(b.x1, currency)} · ${b.count}`}
          className="flex-1 rounded-t-sm transition-all" style={{ height: `${(b.count / max) * 100}%`, minHeight: b.count ? '2px' : '0', background: b.x1 <= 1 ? '#0E9F6E' : '#E0484D', opacity: 0.35 + (b.count / max) * 0.45 }} />
      ))}
    </div>
  )
}

// ── the panel ─────────────────────────────────────────────────────────────--
export function ScenarioRail({ footer }: { footer?: ReactNode }) {
  const { pack, raw, country, drillTree, meta } = useCompliance()
  const scenario = useStore((s) => s.scenario)
  const selectedParent = useStore((s) => s.selectedParent)
  const drillPath = useStore((s) => s.drillPath)
  const screen = useStore((s) => s.screen)
  const makerOverrides = useStore((s) => s.makerOverrides)
  const patch = useStore((s) => s.patchScenario)
  const reset = useStore((s) => s.resetScenario)
  const setScreen = useStore((s) => s.setScreen)
  const savedScenarios = useStore((s) => s.savedScenarios)
  const saveScenario = useStore((s) => s.saveScenario)
  const loadScenario = useStore((s) => s.loadScenario)
  const deleteScenario = useStore((s) => s.deleteScenario)
  const myScenarios = savedScenarios.filter((s) => s.country === country)

  // Drill path: [pool, manufacturer, model, variantKey] — lever scoping is a
  // Model-workbench concept (Analyse is actuals-only and has no rail at all).
  const scenarioTab = useStore((st) => st.scenarioTab)
  const level = screen === 'scenario' && scenarioTab === 'model' ? drillPath.length : 0
  const pool = drillPath[0] ?? ''
  const maker = drillPath[1] ?? ''
  const model = drillPath[2] ?? ''
  const variant = drillPath[3] ?? ''
  const scope = scopeKey(screen, drillPath, scenarioTab)
  const ownOv: Partial<Scenario> = scope ? (makerOverrides[scope] ?? {}) : {}
  const drilledParent = maker || selectedParent
  const scopeName = SCOPE_NAME[level] ?? 'Scope'
  const outcomeName = level === 0 ? 'market' : (drillPath[level - 1] ?? scopeName).split(' ')[0]
  const levelHint = level === 0 ? 'Editing the whole market — every manufacturer moves together.'
    : level === 1 ? `Editing the ${pool.split(' ')[0]} pool — its members move together.`
    : level === 2 ? `Editing ${maker.split(' ')[0]} only — the market total updates.`
    : level === 3 ? `Shaping ${model} within ${maker.split(' ')[0]}.`
    : `Tuning the ${variant} variant of ${model}.`

  const [show3yr, setShow3yr] = useState(false)
  const [naming, setNaming] = useState(false)
  const [scenarioName, setScenarioName] = useState('')
  const commitSave = () => { if (scenarioName.trim()) { saveScenario(scenarioName.trim()); setScenarioName(''); setNaming(false) } }

  const nodeAt = (root: Aggregate, path: string[]): Aggregate => {
    let n = root
    for (const seg of path) { const nx = n.children?.find((c) => c.label === seg); if (!nx) break; n = nx }
    return n
  }
  // Read an outcome off an already-built drill tree (no rebuild).
  const outcomeFromTree = (t: Aggregate): Outcome => {
    const node = nodeAt(t, drillPath)
    const allMakers = (t.children ?? []).flatMap((p) => p.children ?? [])
    const marketFine = allMakers.reduce((a, c) => a + c.fine, 0)
    const poolFine = level >= 1 ? (nodeAt(t, drillPath.slice(0, 1)).children ?? []).reduce((a, c) => a + c.fine, 0) : marketFine
    const makerFine = level >= 2 ? nodeAt(t, drillPath.slice(0, 2)).fine : marketFine
    return { metric: node.avgMetric, limit: node.limit, gap: node.gap, units: node.rawUnits, zlevShare: node.zlevShare, fine: node.fine, marketFine, poolFine, makerFine }
  }
  const outcomeOf = (sc: Scenario, ov: Record<string, Partial<Scenario>>): Outcome => outcomeFromTree(buildDrillTree(raw, pack, sc, ov))
  // €-at-risk that's meaningful for the level: market Σ · pool Σ members · else the maker.
  const scopeFine = (o: Outcome) => (level === 0 ? o.marketFine : level === 1 ? o.poolFine : o.makerFine)
  // Cheap scope-fine for the risk hot loop — no full tree.
  const fastFine = (sc: Scenario, ov: Record<string, Partial<Scenario>>) =>
    fleetFineFast(raw, pack, sc, ov, level >= 2 ? { maker } : level === 1 ? { pool } : {})

  const baseScenario: Scenario = { ...scenario, mix: null, massShiftKg: 0, salesMultiplier: 1, ecoBoostG: 0, evSharePct: null, phevUF: true, creditPrice: null, targetShiftPct: null }
  const path = drillPath.join('/')
  // Reuse the live drill tree that useCompliance already built — don't rebuild it.
  const cur = useMemo(() => outcomeFromTree(drillTree), [drillTree, path]) // eslint-disable-line react-hooks/exhaustive-deps
  const base = useMemo(() => outcomeOf(baseScenario, {}), [raw, pack, scenario.year, path]) // eslint-disable-line react-hooks/exhaustive-deps
  const three = useMemo(
    () => (country === 'EU' && level >= 2 ? threeYearAverage(raw, pack, scenario, maker, [2025, 2026, 2027], makerOverrides) : null),
    [country, level, maker, raw, pack, scenario, makerOverrides],
  )
  const riskFine = show3yr && three ? three.fine : scopeFine(cur)
  const riskLabel = level === 0 ? '€-at-risk · market' : level === 1 ? `${pool.split(' ')[0]} pool at risk` : `${maker.split(' ')[0]} at risk`

  // powertrain mix baseline scoped to the current level
  const inScope = (v: Vehicle) =>
    level === 0 ? true :
    level === 1 ? (v.pool || v.parent) === pool :
    level === 2 ? v.parent === maker :
    level === 3 ? (v.parent === maker && v.model === model) :
    (v.parent === maker && v.model === model && variantKey(v) === variant)
  const mixInfo = useMemo(() => {
    const yr = raw.filter((v) => v.year === scenario.year && inScope(v))
    const by: Record<string, number> = {}
    let total = 0
    for (const v of yr) { by[v.powertrain] = (by[v.powertrain] ?? 0) + v.sales; total += v.sales }
    const pts = Object.keys(by).sort((a, b) => by[b] - by[a])
    const shares: Record<string, number> = {}
    pts.forEach((p) => (shares[p] = total ? (by[p] / total) * 100 : 0))
    return { pts, shares, total }
  }, [raw, scenario.year, level, pool, maker, model, variant]) // eslint-disable-line react-hooks/exhaustive-deps

  // The RESULTING powertrain mix in scope, read off the already-applied drill
  // tree — so hypothetical variants AND the mix / EV-share levers are all
  // reflected (mixInfo above is the as-sold, reweightable baseline only).
  const appliedMix = useMemo(() => {
    const node = nodeAt(drillTree, drillPath)
    const by: Record<string, number> = {}
    let total = 0
    for (const v of node.vehicles ?? []) { by[v.powertrain] = (by[v.powertrain] ?? 0) + v.sales; total += v.sales }
    const pts = Object.keys(by).sort((a, b) => by[b] - by[a])
    const shares: Record<string, number> = {}
    pts.forEach((p) => (shares[p] = total ? (by[p] / total) * 100 : 0))
    return { pts, shares, total }
  }, [drillTree, path]) // eslint-disable-line react-hooks/exhaustive-deps

  // Monte-Carlo €-at-risk for the current scope — deferred so dragging stays smooth.
  const defScenario = useDeferredValue(scenario)
  const defOv = useDeferredValue(makerOverrides)
  const riskGroups = useMemo(() => {
    if (scope) return [{ key: scope, shares: mixInfo.shares }]
    const by: Record<string, Record<string, number>> = {}, tot: Record<string, number> = {}
    for (const v of raw) if (v.year === scenario.year) { (by[v.parent] ??= {})[v.powertrain] = (by[v.parent]?.[v.powertrain] ?? 0) + v.sales; tot[v.parent] = (tot[v.parent] ?? 0) + v.sales }
    return Object.entries(by).map(([mk, b]) => { const shares: Record<string, number> = {}; for (const p in b) shares[p] = tot[mk] ? (b[p] / tot[mk]) * 100 : 0; return { key: mk, shares } })
  }, [raw, scenario.year, scope, mixInfo])
  const risk = useMemo(() => simulateRisk({
    base: defScenario, groups: riskGroups, currentOverrides: defOv,
    fineOf: fastFine,
    n: 150,
  }), [raw, pack, defScenario, defOv, path, riskGroups, level]) // eslint-disable-line react-hooks/exhaustive-deps

  const ownMix = scope ? (ownOv.mix ?? null) : (scenario.mix ?? null)
  const weights = ownMix ?? mixInfo.shares
  const wsum = mixInfo.pts.reduce((a, p) => a + (weights[p] ?? 0), 0) || 1
  const resultShare = (p: string) => ((weights[p] ?? 0) / wsum) * 100
  const setWeight = (p: string, v: number) => patch({ mix: { ...(ownMix ?? mixInfo.shares), [p]: v } })
  const massVal = scope ? (ownOv.massShiftKg ?? 0) : scenario.massShiftKg
  const salesVal = scope ? (ownOv.salesMultiplier ?? 1) : scenario.salesMultiplier
  // Eco-innovation certificates are per-OEM (Art 11), so the lever scopes with
  // the drill: the scoped value replaces the market value for that scope.
  const ecoVal = scope ? (ownOv.ecoBoostG ?? scenario.ecoBoostG) : scenario.ecoBoostG
  const ecoModified = scope ? ownOv.ecoBoostG != null && ownOv.ecoBoostG !== scenario.ecoBoostG : scenario.ecoBoostG !== 0

  const mixFromBEV = (bev: number) => {
    const c0 = mixInfo.shares['BEV'] ?? 0
    const nb = Math.max(0, Math.min(100, bev))
    const scale = 100 - c0 > 0 ? (100 - nb) / (100 - c0) : 0
    const mix: Record<string, number> = {}
    for (const p of mixInfo.pts) mix[p] = p === 'BEV' ? nb : (mixInfo.shares[p] ?? 0) * scale
    return mix
  }
  const presetBEV = (delta: number) => { if (mixInfo.pts.includes('BEV')) patch({ mix: mixFromBEV((mixInfo.shares['BEV'] ?? 0) + delta) }) }
  const solveToLine = () => {
    if (!scope || !mixInfo.pts.includes('BEV')) return
    for (let bev = Math.ceil(mixInfo.shares['BEV'] ?? 0); bev <= 100; bev += 2) {
      const o = outcomeOf(scenario, { ...makerOverrides, [scope]: { ...ownOv, mix: mixFromBEV(bev) } })
      if (o.gap <= 0) { patch({ mix: mixFromBEV(bev) }); return }
    }
    patch({ mix: mixFromBEV(100) })
  }

  const mixModified = !!ownMix
  const fleetModified = mixModified || massVal !== 0 || salesVal !== 1 || ecoModified
  const policyModified = scenario.phevUF === false || scenario.poolingEnabled || scenario.superCreditsEnabled || scenario.creditPrice != null || (scenario.targetShiftPct ?? 0) !== 0
  const variants = scenario.extraVariants ?? []

  // ── Every active assumption, in plain English, individually revertible ─────
  // This is the "what exactly am I assuming?" ledger: anything that differs from
  // the as-sold default becomes a chip. patch() routes scoped keys (mix/mass/
  // sales/EV) to the current drill scope and the rest globally, so revert is
  // always symmetric with how the value was set.
  const def = defaultScenario(country)
  const evVal = scope ? (ownOv.evSharePct ?? null) : scenario.evSharePct
  const assumptions: { label: string; revert?: () => void; title?: string }[] = []
  if (mixModified) assumptions.push({ label: 'Custom powertrain mix', revert: () => patch({ mix: null }), title: 'Mix sliders moved — click × to return to as-sold shares' })
  if (evVal != null) assumptions.push({ label: `EV share ${Math.round(evVal)}%`, revert: () => patch({ evSharePct: null }) })
  if (massVal !== 0) assumptions.push({ label: `Mass ${massVal > 0 ? '+' : ''}${massVal} kg`, revert: () => patch({ massShiftKg: 0 }) })
  if (salesVal !== 1) assumptions.push({ label: `Sales ×${fmtNum(salesVal, 2)}`, revert: () => patch({ salesMultiplier: 1 }) })
  if (ecoModified) assumptions.push({ label: `Eco-innovation ${fmtNum(ecoVal, 1)} g${scope ? ' · this scope' : ''}`, revert: () => patch({ ecoBoostG: scope ? scenario.ecoBoostG : 0 }) })
  if ((scenario.targetShiftPct ?? 0) !== 0) assumptions.push({ label: `Draft target ${scenario.targetShiftPct! > 0 ? '+' : ''}${scenario.targetShiftPct}%`, revert: () => patch({ targetShiftPct: null }), title: 'Stress on the draft regime\'s target line' })
  if (scenario.phevUF === false) assumptions.push({ label: 'PHEV utility factor off', revert: () => patch({ phevUF: true }) })
  if (scenario.poolingEnabled) assumptions.push({ label: 'Pooling on', revert: () => patch({ poolingEnabled: false }) })
  if (scenario.superCreditsEnabled !== def.superCreditsEnabled) assumptions.push({ label: scenario.superCreditsEnabled ? 'Super-credits on' : 'Super-credits off', revert: () => patch({ superCreditsEnabled: def.superCreditsEnabled }) })
  if (scenario.creditPrice != null) assumptions.push({ label: `Credit price ${fmtMoney(scenario.creditPrice, pack.currency)}/u`, revert: () => patch({ creditPrice: null }) })
  if (variants.length > 0) assumptions.push({ label: `${variants.length} hypothetical variant${variants.length > 1 ? 's' : ''}`, revert: () => patch({ extraVariants: [] }) })
  const otherScopes = Object.entries(makerOverrides).filter(([k, v]) => k !== scope && v && Object.keys(v).length > 0)
  if (otherScopes.length > 0) assumptions.push({ label: `+${otherScopes.length} other scope${otherScopes.length > 1 ? 's' : ''} touched`, title: otherScopes.map(([k]) => k).join(' · ') })

  // No-pool markets (India) hide the redundant 1:1 pool tier from the breadcrumb.
  const skipPool = !pack.pooling.enabled
  const scopeChips = skipPool
    ? [{ name: 'Market', val: 'Market' }, ...drillPath.slice(1).map((seg, j) => ({ name: ['Manufacturer', 'Model', 'Variant'][j] ?? 'Scope', val: seg }))]
    : SCOPE_NAME.slice(0, level + 1).map((seg, i) => ({ name: seg, val: i === 0 ? 'Market' : (drillPath[i - 1] ?? seg) }))
  const isVariantLevel = level >= 4
  // Show the mix whenever the RESULTING fleet has more than one powertrain — so a
  // hypothetical variant that introduces a new powertrain surfaces the control.
  const showMix = !isVariantLevel && Math.max(mixInfo.pts.length, appliedMix.pts.length) > 1
  // Powertrains present only because a hypothetical variant added them (no as-sold
  // volume to reweight) — shown read-only under the sliders.
  const extraPts = appliedMix.pts.filter((p) => !mixInfo.pts.includes(p))
  // scope for the variant builder follows the drill depth
  const addScope: ShareScope = level >= 3 ? 'model' : level === 2 ? 'manufacturer' : 'market'

  const ufNow = country === 'EU'
    ? pack.vehicleMetric({ co2: 100, powertrain: 'PHEV', fuel: 'petrol', mass: 1500, sales: 1, parent: '', pool: '', brand: '', make: '', model: '', year: scenario.year, vclass: pack.classes[0] }, { ...scenario, ecoBoostG: 0 }) / 100
    : 1

  return (
    <aside className="rail-dark relative flex w-[19.5rem] shrink-0 flex-col gap-3 overflow-y-auto border-l border-white/[0.06] p-4" style={{ background: 'linear-gradient(178deg, #221B17 0%, #1B1714 42%, #17130F 100%)' }}>
      <div aria-hidden className="pointer-events-none absolute -right-14 -top-8 h-52 w-52 rounded-full blur-3xl" style={{ background: 'radial-gradient(circle, rgba(232,34,59,0.15), transparent 64%)' }} />
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-bold text-white"><Icon name="sliders" size={16} className="text-brand-400" /> Assumptions</div>
        {(fleetModified || policyModified || variants.length > 0) && (
          <button onClick={reset} className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-white/45 transition hover:bg-white/[0.06] hover:text-white"><Icon name="reset" size={12} /> Reset</button>
        )}
      </div>

      {/* scope chips */}
      <div className="flex flex-wrap items-center gap-0.5">
        {scopeChips.map((chip, i) => (
          <span key={i} className="flex items-center gap-0.5">
            {i > 0 && <Icon name="chevron" size={10} className="text-white/30" />}
            <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${i === scopeChips.length - 1 ? 'bg-brand/12 text-brand' : 'text-white/45'}`}>{chip.val.split(' ')[0]}</span>
          </span>
        ))}
      </div>
      <div className="-mt-1.5 text-[10px] leading-relaxed text-white/45">{levelHint}</div>

      {/* the assumption ledger — what exactly is being assumed right now */}
      {assumptions.length > 0 ? (
        <div className="rounded-xl border border-brand/[0.18] bg-brand/[0.04] p-2.5">
          <div className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-brand/80">Active assumptions · {assumptions.length}</div>
          <div className="flex flex-wrap gap-1.5">
            {assumptions.map((a) => (
              <span key={a.label} title={a.title}
                className="flex items-center gap-1 rounded-full border border-brand/25 bg-white/[0.08] py-0.5 pl-2 pr-1 text-[10px] font-semibold text-white/85">
                {a.label}
                {a.revert
                  ? <button onClick={a.revert} title="Revert this assumption" className="grid h-3.5 w-3.5 place-items-center rounded-full text-white/45 transition hover:bg-danger/10 hover:text-danger"><Icon name="close" size={8} /></button>
                  : <Icon name="dot" size={8} className="mr-1 text-white/45" />}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-2.5 py-2 text-[10px] leading-relaxed text-white/45">
          <span className="font-semibold text-safe">As sold.</span> No assumptions applied — every number is the official registration data.
        </div>
      )}

      {/* compliance year — context for everything below, visible at every drill level */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="label">Compliance year</span>
          {pack.regimeFor?.(scenario.year)?.draft && <span className="rounded-full border border-warn/30 bg-warn/10 px-1.5 py-px text-[8.5px] font-bold uppercase tracking-wide text-warn">{pack.regimeFor(scenario.year).name} · draft</span>}
        </div>
        <div className="flex flex-wrap gap-1">
          {pack.years.map((y) => {
            const draft = pack.regimeFor?.(y)?.draft
            return (
              <button key={y} onClick={() => patch({ year: y })}
                className={`num relative rounded-lg px-2 py-1 text-xs font-semibold transition ${scenario.year === y ? 'bg-brand text-white' : 'bg-white/[0.06] text-white/45 hover:text-white'}`}>
                {y}
                {draft && <i className={`absolute right-0.5 top-0.5 h-1 w-1 rounded-full ${scenario.year === y ? 'bg-white/80' : 'bg-warn'}`} title="draft regime" />}
              </button>
            )
          })}
        </div>
      </div>

      {/* live outcome — pinned while the levers scroll */}
      <div className="sticky top-0 z-10 rounded-2xl border border-white/10 bg-white/[0.055] p-3.5 shadow-[0_16px_30px_-18px_rgba(0,0,0,0.6)] backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <span className="label">Outcome · {outcomeName}</span>
          <div className="flex items-center gap-1.5">
            {three && (
              <button onClick={() => setShow3yr((v) => !v)} className={`num rounded-md px-1.5 py-0.5 text-[9px] font-bold transition ${show3yr ? 'bg-brand text-white' : 'bg-white/[0.06] text-white/45 hover:text-white'}`}>{show3yr ? '3-yr' : '1-yr'}</button>
            )}
            <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${cur.gap > 0 ? 'bg-danger/12 text-danger' : 'bg-safe/12 text-safe'}`}>
              <i className={`h-1.5 w-1.5 rounded-full ${cur.gap > 0 ? 'bg-danger' : 'bg-safe'}`} />{cur.gap > 0 ? 'Over' : 'Under'}
            </span>
          </div>
        </div>
        <div className="mt-2 flex items-end justify-between">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-wide text-white/45">fleet {pack.metricUnit}</div>
            <div className="dnum text-[30px] font-bold leading-none text-white">{fmtNum(cur.metric, 1)}</div>
            <div className="mt-1 text-[10px] text-white/45">limit {fmtNum(cur.limit, 1)}</div>
          </div>
          <div className="text-right">
            <div className="text-[9px] font-semibold uppercase tracking-wide text-white/45">gap</div>
            <div className={`dnum text-[20px] font-bold leading-none ${cur.gap > 0 ? 'text-danger' : 'text-safe'}`}>{cur.gap > 0 ? '+' : ''}{fmtNum(cur.gap, 1)}</div>
            <div className="mt-1"><Delta from={base.gap} to={cur.gap} /></div>
          </div>
        </div>
        <PositionBar fleet={cur.metric} limit={cur.limit} />
        <div className="mt-3 border-t border-white/[0.08] pt-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-white/55">{riskLabel} <span className="text-white/45">· P50</span></span>
            <div className="flex items-center gap-2">
              <span className={`dnum text-[15px] font-bold ${risk.p50 > 0 ? 'text-danger' : 'text-safe'}`}>{fmtMoney(riskFine, pack.currency)}</span>
              <span className={`num rounded-full px-1.5 py-0.5 text-[9px] font-bold ${risk.probOver > 0.05 ? 'bg-danger/12 text-danger' : 'bg-safe/12 text-safe'}`}>{Math.round(risk.probOver * 100)}% over</span>
            </div>
          </div>
          <div className="mt-1 flex items-center justify-between text-[10px] text-white/45">
            <span>P10–P90</span>
            <span className="num">{fmtMoney(risk.p10, pack.currency)} – {fmtMoney(risk.p90, pack.currency)}</span>
          </div>
          <Histogram buckets={risk.buckets} currency={pack.currency} />
        </div>
      </div>

      {/* quick presets */}
      <div>
        <div className="label mb-1.5 text-white/55">Quick scenarios</div>
        <div className="flex flex-wrap gap-1.5">
          {([
            ['As-sold', reset],
            ...(showMix && mixInfo.pts.includes('BEV') ? [['BEV +20pp', () => presetBEV(20)], ['Slow EV', () => presetBEV(-10)]] as [string, () => void][] : []),
            ...(scope && showMix && mixInfo.pts.includes('BEV') && cur.gap > 0 ? [['⚡ To the line', solveToLine]] as [string, () => void][] : []),
            ...(pack.massBasedLimit !== false ? [['Heavier +100kg', () => patch({ massShiftKg: 100 })]] as [string, () => void][] : []),
          ] as [string, () => void][]).map(([label, fn]) => (
            <button key={label} onClick={fn} className={`rounded-lg border px-2.5 py-1 text-[10px] font-semibold transition hover:-translate-y-px ${label.startsWith('⚡') ? 'border-brand/40 bg-brand/10 text-brand' : 'border-white/[0.08] bg-white/[0.06] text-white/55 hover:border-brand/40 hover:text-brand'}`}>{label}</button>
          ))}
        </div>
      </div>

      {/* FLEET STRATEGY — decisions the current scope actually owns */}
      <Group title={`${scopeName} strategy`} icon="scatter" modified={fleetModified}
        owner={level === 0 ? 'Fleet-side decisions, applied to every maker in the market'
          : level === 1 ? `Members of the ${pool.split(' ')[0]} pool move together — engineering stays per maker`
          : level === 2 ? `${maker.split(' ')[0]}'s product decisions: mix, volumes, mass, certified credits`
          : level === 3 ? `${model} decisions within ${maker.split(' ')[0]}`
          : `Spec-level tuning of the ${variant} variant`}
        onReset={() => { if (scope) reset(); else patch({ mix: null, massShiftKg: 0, salesMultiplier: 1, evSharePct: null, ecoBoostG: 0 }) }}>
        {showMix ? (
          <div>
            <div className="flex items-center justify-between">
              <span className="label flex items-center gap-1.5">Powertrain mix{mixModified && <i className="h-1.5 w-1.5 rounded-full bg-brand" />}</span>
              {ownMix && <button onClick={() => patch({ mix: null })} className="text-[10px] font-semibold text-white/45 hover:text-white">as-sold</button>}
            </div>
            <div className="mt-2 flex h-2.5 w-full overflow-hidden rounded-full bg-white/10 ring-1 ring-white/[0.06]">
              {appliedMix.pts.map((p) => <div key={p} className="transition-all duration-300" style={{ width: `${appliedMix.shares[p] ?? 0}%`, background: ptColor(p) }} title={`${p} ${Math.round(appliedMix.shares[p] ?? 0)}%`} />)}
            </div>
            <div className="mt-3 space-y-2.5">
              {mixInfo.pts.map((p) => (
                <div key={p} className="flex items-center gap-2.5">
                  <span className="flex w-[52px] shrink-0 items-center gap-1.5 text-[11px] font-medium text-white"><i className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: ptColor(p) }} />{p}</span>
                  <input type="range" className="w-full flex-1" min={0} max={100} step={1} value={Math.round(weights[p] ?? 0)}
                    style={{ ['--fill' as string]: `${Math.round(weights[p] ?? 0)}%` }}
                    onChange={(e) => setWeight(p, parseFloat(e.target.value))} />
                  <span className="num w-7 shrink-0 text-right text-[11px] font-bold" style={{ color: ptColor(p) }}>{Math.round(appliedMix.shares[p] ?? 0)}%</span>
                </div>
              ))}
              {extraPts.map((p) => (
                <div key={p} className="flex items-center gap-2.5" title="Added by a hypothetical variant — adjust it in Build a variant below">
                  <span className="flex w-[52px] shrink-0 items-center gap-1.5 text-[11px] font-medium text-white"><i className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: ptColor(p) }} />{p}</span>
                  <span className="flex-1 text-[10px] text-white/45">added variant</span>
                  <span className="num w-7 shrink-0 text-right text-[11px] font-bold" style={{ color: ptColor(p) }}>{Math.round(appliedMix.shares[p] ?? 0)}%</span>
                </div>
              ))}
            </div>
          </div>
        ) : isVariantLevel ? (
          <div className="rounded-lg bg-white/[0.03] px-2.5 py-2 text-[10px] text-white/45">Single variant — adjust its volume and mass below; switch powertrain mix at the model level.</div>
        ) : null}

        {/* Eco-innovation certificates belong to the manufacturer (Art 11) — the
            lever scopes with the drill, and is hidden at pool level (pools don't
            certify) and variant level. */}
        {pack.ecoCap && level !== 1 && !isVariantLevel && (
          <NumSlider label="Eco-innovation" value={ecoVal} min={0} max={pack.ecoCap(scenario.year)} step={0.5} unit="g"
            baseline={scope ? scenario.ecoBoostG : 0}
            onChange={(v) => patch({ ecoBoostG: v })}
            hint={level === 0
              ? `certified off-cycle credits · capped ${pack.ecoCap(scenario.year)} g/km · every maker`
              : level === 2
              ? 'this manufacturer\'s certified credits (certificates are per-OEM)'
              : 'credits fitted on this model'} />
        )}
        <NumSlider label={isVariantLevel ? 'Variant volume' : 'Sales volume'} value={salesVal} min={0.5} max={1.6} step={0.05} unit="×" baseline={1}
          onChange={(v) => patch({ salesMultiplier: v })} hint={isVariantLevel ? 'scales this variant only' : undefined} />
        {/* Mass only moves compliance where the limit is mass-indexed (EU/IN/AU);
            for unit mandates (UK ZEV) it's engineering with no compliance effect.
            Pools don't do engineering, so it's hidden there too. */}
        {pack.massBasedLimit !== false && level !== 1 && (
          <NumSlider label={`${pack.massLabel} shift`} value={massVal} min={-150} max={150} step={5} unit="kg" baseline={0}
            onChange={(v) => patch({ massShiftKg: v })} hint="moves fleet & the limit together" />
        )}
      </Group>

      {/* REGULATOR SETTINGS — one dial for the whole market, never per maker */}
      <Group title="Regulator settings" icon="scale" defaultOpen={false} modified={policyModified} subtitle="market-wide"
        owner="Regulator-side: pooling regime, credit mechanics, test-procedure corrections — one setting for the whole market"
        onReset={() => patch({ poolingEnabled: false, superCreditsEnabled: country === 'IN' || country === 'CN', phevUF: true, creditPrice: null, targetShiftPct: null, nevRatioTarget: null, nevCreditPrice: null })}>
        {pack.regimeFor?.(scenario.year)?.draft && (
          <NumSlider label="Draft stringency" value={scenario.targetShiftPct ?? 0} min={-10} max={10} step={1} unit="%" baseline={0}
            onChange={(v) => patch({ targetShiftPct: v === 0 ? null : v })}
            hint={`${pack.regimeFor(scenario.year).name} is a draft — stress the target line: − = final rules land tighter, + = looser`} />
        )}
        {country === 'EU' && (
          <Toggle label="PHEV utility factor" checked={scenario.phevUF !== false} onChange={(b) => patch({ phevUF: b })}
            hint={`2025+ WLTP correction · ×${fmtNum(scenario.phevUF === false ? 1 : ufNow, 2)} on PHEV CO₂`}
            right={<span className="num rounded bg-white/10 px-1 text-[9px] font-bold text-white/55">×{fmtNum(ufNow, 2)}</span>} />
        )}
        {pack.pooling.enabled && <Toggle label="Pooling" checked={scenario.poolingEnabled} onChange={(b) => patch({ poolingEnabled: b })} hint="combine makers, share one average" />}
        {pack.id === 'IN' && <Toggle label="Super-credits" checked={scenario.superCreditsEnabled} onChange={(b) => patch({ superCreditsEnabled: b })} hint="BEV ×3, PHEV ×2.5" />}
        {pack.id === 'IN' && <Toggle label="CNF discounts" checked={scenario.cnfEnabled !== false} onChange={(b) => patch({ cnfEnabled: b })} hint="E20 petrol −8% · CNG −5% (CAFE III draft) — off = struck from final rules" />}
        {pack.id === 'CN' && <Toggle label="NEV count multiplier" checked={scenario.superCreditsEnabled} onChange={(b) => patch({ superCreditsEnabled: b })} hint="NEVs count as >1 vehicle in the CAFC average (Phase 6 ×1.4→×1.0)" />}
        {pack.id === 'CN' && (
          <NumSlider label="NEV credit ratio" value={scenario.nevRatioTarget ?? Math.round(nevRatioFor(scenario.year, null) * 100)} min={0} max={80} step={1} unit="%" baseline={Math.round(nevRatioFor(scenario.year, null) * 100)}
            onChange={(v) => patch({ nevRatioTarget: v === Math.round(nevRatioFor(scenario.year, null) * 100) ? null : v })}
            hint="statutory 18→58% (2023–27) — the NEV credits a maker must earn vs its conventional volume" />
        )}
        {pack.creditPrice != null && (
          <NumSlider label="Credit price" value={scenario.creditPrice ?? pack.creditPrice} min={0} max={Math.max(150, pack.creditPrice * 2)} step={5} unit={`${pack.currency}/u`} baseline={pack.creditPrice}
            onChange={(v) => patch({ creditPrice: v })} hint="assumed trading price · drives pooling value" />
        )}
      </Group>

      {/* BUILD A VARIANT */}
      {(
        <Group title="Build a variant" icon="spark" defaultOpen={variants.length > 0} modified={variants.length > 0} subtitle={variants.length ? `${variants.length} added` : undefined}>
          <AddVariant pack={pack} scenario={scenario} parent={drilledParent} defaultModel={model} addScope={addScope} scopeTotal={mixInfo.total} variants={variants} ptColor={ptColor}
            onAdd={(v) => patch({ extraVariants: [...variants, v] })}
            onRemove={(i) => patch({ extraVariants: variants.filter((_, k) => k !== i) })} />
        </Group>
      )}

      {/* SAVED SCENARIOS — named, durable; comparison lives in Scenario → Compare */}
      <Group title="Saved scenarios" icon="layers" defaultOpen={false} subtitle={myScenarios.length ? `${myScenarios.length} saved` : undefined}
        owner="A saved scenario captures every assumption above — reload it anytime, or compare scenarios side-by-side">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-white/45">Capture the current assumptions</span>
          {!naming && <button onClick={() => setNaming(true)} className="text-[10px] font-semibold text-brand transition hover:underline">+ Save current</button>}
        </div>
        {naming && (
          <div className="flex items-center gap-1.5">
            <input autoFocus value={scenarioName} onChange={(e) => setScenarioName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') commitSave(); else if (e.key === 'Escape') { setNaming(false); setScenarioName('') } }}
              placeholder="Name this scenario…"
              className="w-full min-w-0 flex-1 rounded-lg border border-white/12 bg-white/[0.06] px-2 py-1.5 text-[11px] text-white outline-none placeholder:text-white/30 focus:border-brand/40" />
            <button onClick={commitSave} disabled={!scenarioName.trim()} className="shrink-0 rounded-lg bg-brand px-2.5 py-1.5 text-[10px] font-bold text-white transition hover:brightness-105 disabled:opacity-40">Save</button>
            <button onClick={() => { setNaming(false); setScenarioName('') }} className="shrink-0 text-white/45 transition hover:text-white"><Icon name="close" size={12} /></button>
          </div>
        )}
        {myScenarios.length === 0
          ? <div className="text-[10px] text-white/45">None yet — capture the current assumptions to reuse or compare.</div>
          : (
            <div className="space-y-1">
              {myScenarios.slice(0, 6).map((s) => {
                const stale = s.datasetVersion != null && s.datasetVersion !== meta.datasetVersion
                return (
                  <div key={s.id} className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 py-1">
                    <button onClick={() => loadScenario(s.id)} title="Load" className="flex flex-1 items-center gap-1.5 truncate text-left text-[11px] font-medium text-white/85 transition hover:text-brand"><Icon name="reset" size={10} className="shrink-0 rotate-180" /> {s.label}</button>
                    {stale && <span title={`Seeded from dataset v${String(s.datasetVersion).slice(-6)} — the ${country} dataset has since changed (now v${String(meta.datasetVersion).slice(-6)}). Numbers will re-run on the new data when loaded.`}
                      className="shrink-0 rounded-full border border-warn/40 bg-warn/10 px-1.5 py-px text-[8.5px] font-black uppercase tracking-wide text-warn">stale</span>}
                    <button onClick={() => deleteScenario(s.id)} title="Delete" className="shrink-0 text-white/45 transition hover:text-danger"><Icon name="close" size={11} /></button>
                  </div>
                )
              })}
            </div>
          )}
        {myScenarios.length > 0 && (
          <button onClick={() => setScreen('compare')} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-brand/25 bg-brand/[0.06] py-1.5 text-[10.5px] font-semibold text-brand transition hover:bg-brand/10">
            <Icon name="layers" size={12} /> Compare side-by-side <Icon name="chevron" size={11} />
          </button>
        )}
      </Group>

      {footer}
    </aside>
  )
}

// Representative tailpipe CO₂ (g/km) per powertrain — the variant's emissions
// follow the powertrain, not a free-typed number. BEV is always zero-emission.
const DEFAULT_CO2: Record<string, number> = { BEV: 0, PHEV: 35, HEV: 95, MHEV: 120, ICE: 140, 'Strong Hybrid': 90 }
const FUEL_FOR: Record<string, string> = { BEV: 'Electric', PHEV: 'Petrol/Electric', HEV: 'Petrol Hybrid', MHEV: 'Petrol', ICE: 'Petrol', 'Strong Hybrid': 'Petrol Hybrid' }
const SCOPE_LABEL: Record<ShareScope, string> = { market: 'the market', manufacturer: 'this manufacturer', model: 'this model' }

function AddVariant({ pack, scenario, parent, defaultModel, addScope, scopeTotal, variants, onAdd, onRemove, ptColor }: {
  pack: any; scenario: Scenario; parent: string; defaultModel: string; addScope: ShareScope; scopeTotal: number; variants: Vehicle[]
  onAdd: (v: Vehicle) => void; onRemove: (i: number) => void; ptColor: (p: string) => string
}) {
  const [open, setOpen] = useState(false)
  const [model, setModel] = useState('')
  const [pt, setPt] = useState('BEV')
  const [co2, setCo2] = useState('0')
  const [mass, setMass] = useState('1500')
  const [volMode, setVolMode] = useState<'units' | 'share'>('share')
  const [units, setUnits] = useState('5000')
  const [share, setShare] = useState('10')

  useEffect(() => { setModel('') }, [defaultModel, addScope])
  const isBev = pt === 'BEV'
  // At model scope the input names a VARIANT of the drilled model; higher up it
  // names a NEW model. Either way the added row gets a distinct `variant`
  // descriptor so it nests as its own node instead of merging into a powertrain.
  const isVarScope = addScope === 'model'
  const choosePt = (p: string) => { setPt(p); setCo2(String(DEFAULT_CO2[p] ?? 0)) }

  // India: typing (or picking) a real model prefills its powertrain, CO₂ and mass
  // from the workbook catalog, so a scenario variant starts from a real spec.
  const inCatalog = pack.id === 'IN'
  const applyModel = (name: string) => {
    setModel(name)
    if (!inCatalog) return
    const spec = INDIA_CATALOG_BY_MODEL[name.trim().toLowerCase()]
    if (!spec) return
    const p = spec.powertrain === 'Strong Hybrid' ? 'HEV' : (spec.powertrain ?? pt)
    setPt(p)
    setCo2(String(p === 'BEV' ? 0 : (spec.co2 ?? DEFAULT_CO2[p] ?? 0)))
    if (spec.kerbMass) setMass(String(spec.kerbMass))
  }

  const sharePct = Math.max(0, Math.min(95, parseFloat(share) || 0))
  const projectedUnits = volMode === 'share' ? Math.round(scopeTotal * (sharePct / 100)) : (parseInt(units) || 0)

  const typed = (model || '').trim()
  const auto = `New ${pt}${variants.length ? ` ${variants.length + 1}` : ''}` // unique fallback → own drill node
  const finalModel = isVarScope ? (defaultModel || typed || auto) : (typed || auto)
  const finalVariant = typed || auto
  const draft: Vehicle = {
    parent, pool: '', brand: parent, make: parent, model: finalModel, variant: finalVariant,
    year: scenario.year, powertrain: pt, fuel: FUEL_FOR[pt] ?? 'Petrol',
    co2: isBev ? 0 : parseFloat(co2) || 0, mass: parseFloat(mass) || 1500,
    sales: volMode === 'units' ? (parseInt(units) || 0) : 0,
    vclass: pack.classes[0],
    ...(volMode === 'share' ? { share: sharePct / 100, shareScope: addScope } : {}),
  }
  const counts = pack.vehicleMetric(draft, scenario)
  const add = () => { onAdd({ ...draft }); setModel(''); setOpen(false) }

  return (
    <div>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between text-left">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-white">{open ? 'Close' : isVarScope ? 'New variant' : 'New model'}</span>
        <Icon name={open ? 'close' : 'arrow-right'} size={13} className="text-white/45" />
      </button>
      {open && (
        <div className="mt-2 text-[10px] leading-snug text-white/45">
          {isVarScope
            ? <>Adds a variant under <b className="text-white/70">{defaultModel || 'the model'}</b> in {parent.split(' ')[0]}.</>
            : <>Adds a new model under <b className="text-white/70">{parent.split(' ')[0]}</b>{addScope === 'market' ? ' — drill into a maker or model to scope it tighter' : ''}.</>}
        </div>
      )}
      {variants.length > 0 && (
        <div className="mt-2 space-y-1">
          {variants.map((v, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg bg-white/[0.05] px-2 py-1 text-[11px]">
              <i className="inline-block h-2 w-2 rounded-full" style={{ background: ptColor(v.powertrain) }} />
              <span className="flex-1 truncate text-white">{v.model}</span>
              <span className="num text-white/45">{v.co2}g · {v.share != null ? `${Math.round(v.share * 100)}%` : `${v.sales.toLocaleString()}u`}</span>
              <button onClick={() => onRemove(i)} className="text-white/45 hover:text-danger"><Icon name="close" size={11} /></button>
            </div>
          ))}
        </div>
      )}
      {open && (
        <div className="mt-2 space-y-2">
          <input value={model} onChange={(e) => applyModel(e.target.value)} list={inCatalog && !isVarScope ? 'india-catalog-models' : undefined}
            placeholder={isVarScope ? 'Variant name (e.g. Long Range)' : inCatalog ? 'Model name — pick a real India model to prefill' : 'New model name'}
            className="w-full rounded-lg border border-white/12 bg-white/[0.06] px-2 py-1.5 text-xs text-white outline-none placeholder:text-white/30" />
          {inCatalog && <datalist id="india-catalog-models">{INDIA_MODELS.map((m) => <option key={m} value={m} />)}</datalist>}
          <div className="flex flex-wrap gap-1">
            {['BEV', 'PHEV', 'HEV', 'MHEV', 'ICE'].map((p) => (
              <button key={p} onClick={() => choosePt(p)} className={`rounded-md px-2 py-1 text-[10px] font-semibold ${pt === p ? 'bg-white text-[#1B1714]' : 'bg-white/[0.06] text-white/55'}`}>{p}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <Field label="CO₂ g/km" value={isBev ? '0' : co2} onChange={setCo2} disabled={isBev} />
            <Field label="kg" value={mass} onChange={setMass} />
          </div>

          {/* volume: proportional %-share or absolute units */}
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-2">
            <div className="mb-1.5 flex items-center gap-1 rounded-md bg-white/[0.06] p-0.5">
              <button onClick={() => setVolMode('share')} className={`flex-1 rounded px-2 py-1 text-[10px] font-semibold transition ${volMode === 'share' ? 'bg-white text-[#1B1714] shadow-sm' : 'text-white/45'}`}>% share</button>
              <button onClick={() => setVolMode('units')} className={`flex-1 rounded px-2 py-1 text-[10px] font-semibold transition ${volMode === 'units' ? 'bg-white text-[#1B1714] shadow-sm' : 'text-white/45'}`}>Units</button>
            </div>
            {volMode === 'share' ? (
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-white/45">share of {SCOPE_LABEL[addScope]}</span>
                  <span className="num text-xs font-bold text-brand">{sharePct}%</span>
                </div>
                <input type="range" className="mt-1.5 w-full" min={0} max={60} step={1} value={sharePct} style={{ ['--fill' as string]: `${(sharePct / 60) * 100}%` }} onChange={(e) => setShare(e.target.value)} />
                <div className="mt-1 text-[10px] text-white/45">≈ <span className="num text-white/70">{projectedUnits.toLocaleString()}</span> units, taken proportionally from existing volume (total held constant).</div>
              </div>
            ) : (
              <div>
                <Field label="units (added on top)" value={units} onChange={setUnits} />
                <div className="mt-1 text-[10px] text-white/45">adds <span className="num text-white/70">{(parseInt(units) || 0).toLocaleString()}</span> units on top of the fleet.</div>
              </div>
            )}
          </div>

          <div className="rounded-lg bg-black/30 px-2 py-1.5 text-[10px] text-white/45">
            Counts as <span className="num font-bold text-brand">{fmtNum(counts, 1)} {pack.metricUnit}</span>{isBev ? ' · zero-emission' : ''}
            <div className="mt-0.5">Appears as <span className="text-white/70">{finalVariant}</span> under <span className="text-white/70">{finalModel}</span> · {parent.split(' ')[0]}</div>
          </div>
          <button onClick={add} className="btn-primary w-full py-1.5 text-xs">Add variant</button>
        </div>
      )}
    </div>
  )
}

const Field = ({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) => (
  <label className="block">
    <span className="text-[9px] uppercase tracking-wide text-white/45">{label}</span>
    <input value={value} onChange={(e) => onChange(e.target.value)} inputMode="numeric" disabled={disabled}
      className={`num w-full rounded-md border border-white/12 bg-white/[0.06] px-1.5 py-1 text-xs text-white outline-none ${disabled ? 'opacity-40' : ''}`} />
  </label>
)
