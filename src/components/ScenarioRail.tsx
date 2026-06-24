import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useStore } from '../state/store'
import { useCompliance } from '../lib/useCompliance'
import { fmtNum, fmtMoney, fmtInt, buildTree, aggregateParent, threeYearAverage } from '../engine/engine'
import type { Vehicle, Scenario } from '../engine/types'
import Icon, { type IconName } from './Icon'

const PT_COLOR: Record<string, string> = {
  BEV: '#3ddc97', PHEV: '#5b8def', HEV: '#8b7ff0', MHEV: '#ffb454', ICE: '#ff5d6c', 'Strong Hybrid': '#8b7ff0',
}
const ptColor = (p: string) => PT_COLOR[p] ?? '#8C8273'
const ecoCapFor = (year: number) => (year <= 2024 ? 7 : year <= 2029 ? 6 : 4)

interface Outcome { metric: number; limit: number; gap: number; fine: number; units: number }

// ── small UI atoms ──────────────────────────────────────────────────────────
function Group({ title, icon, children, defaultOpen = true, modified }: { title: string; icon: IconName; children: ReactNode; defaultOpen?: boolean; modified?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-xl border border-black/[0.06] bg-black/[0.015]">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-3 py-2.5">
        <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-ink-300">
          <Icon name={icon} size={13} className="text-brand" />{title}
          {modified && <i className="h-1.5 w-1.5 rounded-full bg-brand" />}
        </span>
        <Icon name="chevron" size={13} className={`text-ink-500 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && <div className="space-y-4 px-3 pb-3.5">{children}</div>}
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
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="label flex items-center gap-1.5">{label}{modified && <i className="h-1.5 w-1.5 rounded-full bg-brand" title="modified" />}</span>
        <div className="flex items-center gap-1">
          <input type="number" value={shown} min={min} max={max} step={step}
            onChange={(e) => { const v = parseFloat(e.target.value); if (!Number.isNaN(v)) onChange(Math.max(min, Math.min(max, v))) }}
            className="num w-14 rounded-md border border-black/10 bg-black/[0.03] px-1.5 py-0.5 text-right text-xs font-bold text-brand outline-none focus:border-brand/40" />
          {unit && <span className="text-[10px] text-ink-500">{unit}</span>}
          {modified && <button onClick={() => onChange(baseline!)} title="reset"><Icon name="reset" size={11} className="text-ink-500 hover:text-ink-100" /></button>}
        </div>
      </div>
      <input type="range" className="mt-2 w-full" min={min} max={max} step={step} value={value}
        style={{ ['--fill' as string]: `${((value - min) / (max - min)) * 100}%` }}
        onChange={(e) => onChange(parseFloat(e.target.value))} />
      {hint && <div className="mt-1 text-[10px] text-ink-500">{hint}</div>}
    </div>
  )
}

function Toggle({ label, checked, onChange, hint, right }: { label: string; checked: boolean; onChange: (b: boolean) => void; hint?: string; right?: ReactNode }) {
  return (
    <button onClick={() => onChange(!checked)} className="flex w-full items-center justify-between rounded-xl border border-black/10 bg-black/[0.02] px-3 py-2.5 text-left transition hover:border-black/20">
      <div className="min-w-0"><div className="flex items-center gap-1.5 text-xs font-semibold text-ink-100">{label}{right}</div>{hint && <div className="text-[10px] text-ink-500">{hint}</div>}</div>
      <div className={`relative h-5 w-9 shrink-0 rounded-full transition ${checked ? 'bg-brand' : 'bg-ink-700'}`}>
        <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </div>
    </button>
  )
}

function Delta({ from, to, lowerBetter = true, money, currency = '' }: { from: number; to: number; lowerBetter?: boolean; money?: boolean; currency?: string }) {
  const d = to - from
  const eps = money ? 1 : 0.05
  if (Math.abs(d) < eps) return <span className="text-[10px] text-ink-500">— no change</span>
  const better = lowerBetter ? d < 0 : d > 0
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
    <div className="relative mt-2.5 h-2 w-full rounded-full bg-black/[0.06]">
      <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-300" style={{ width: `${fw}%`, background: over ? '#E0484D' : '#0E9F6E' }} />
      <div className="absolute -inset-y-[3px] w-[2px] rounded bg-[#C9A227]" style={{ left: `${lw}%` }} title={`limit ${limit.toFixed(1)}`} />
    </div>
  )
}

// ── the panel ─────────────────────────────────────────────────────────────--
export function ScenarioRail({ footer }: { footer?: ReactNode }) {
  const { pack, raw, country } = useCompliance()
  const scenario = useStore((s) => s.scenario)
  const selectedParent = useStore((s) => s.selectedParent)
  const drillPath = useStore((s) => s.drillPath)
  const screen = useStore((s) => s.screen)
  const makerOverrides = useStore((s) => s.makerOverrides)
  const patch = useStore((s) => s.patchScenario)
  const reset = useStore((s) => s.resetScenario)

  const scope = screen === 'analyze' && drillPath.length >= 1 ? drillPath[0] : null
  const eff: Scenario = scope ? { ...scenario, ...(makerOverrides[scope] ?? {}) } : scenario
  const drilledParent = drillPath[0] ?? selectedParent
  const drilledModel = drillPath.length >= 2 ? drillPath[1] : ''

  const [show3yr, setShow3yr] = useState(false)
  const [snapA, setSnapA] = useState<{ scenario: Scenario; overrides: Record<string, Partial<Scenario>>; label: string } | null>(null)

  // outcome for the current scope under any (scenario, overrides)
  const outcomeOf = (sc: Scenario, ov: Record<string, Partial<Scenario>>): Outcome => {
    if (scope) {
      const n = aggregateParent(raw, pack, sc, scope, ov)
      return { metric: n.avgMetric, limit: n.limit, gap: n.gap, fine: n.fine, units: n.rawUnits }
    }
    const t = buildTree(raw, pack, sc, ov)
    return { metric: t.avgMetric, limit: t.limit, gap: t.gap, fine: (t.children ?? []).reduce((a, c) => a + c.fine, 0), units: t.rawUnits }
  }

  const baseScenario: Scenario = { ...scenario, mix: null, massShiftKg: 0, salesMultiplier: 1, ecoBoostG: 0, evSharePct: null, phevUF: true, creditPrice: null }
  const cur = useMemo(() => outcomeOf(scenario, makerOverrides), [raw, pack, scenario, makerOverrides, scope])
  const base = useMemo(() => outcomeOf(baseScenario, {}), [raw, pack, scenario.year, scope])
  const aOut = useMemo(() => (snapA ? outcomeOf(snapA.scenario, snapA.overrides) : null), [snapA, raw, pack, scope])
  const three = useMemo(
    () => (country === 'EU' && scope ? threeYearAverage(raw, pack, scenario, scope, [2025, 2026, 2027], makerOverrides) : null),
    [country, scope, raw, pack, scenario, makerOverrides],
  )
  const headlineFine = show3yr && three ? three.fine : cur.fine

  // powertrain mix baseline scoped to the maker (or market)
  const mixInfo = useMemo(() => {
    const yr = raw.filter((v) => v.year === scenario.year && (!scope || v.parent === scope))
    const by: Record<string, number> = {}
    let total = 0
    for (const v of yr) { by[v.powertrain] = (by[v.powertrain] ?? 0) + v.sales; total += v.sales }
    const pts = Object.keys(by).sort((a, b) => by[b] - by[a])
    const shares: Record<string, number> = {}
    pts.forEach((p) => (shares[p] = total ? (by[p] / total) * 100 : 0))
    return { pts, shares }
  }, [raw, scenario.year, scope])

  const weights = eff.mix ?? mixInfo.shares
  const wsum = mixInfo.pts.reduce((a, p) => a + (weights[p] ?? 0), 0) || 1
  const resultShare = (p: string) => ((weights[p] ?? 0) / wsum) * 100
  const setWeight = (p: string, v: number) => patch({ mix: { ...(eff.mix ?? mixInfo.shares), [p]: v } })

  // presets (operate on the current scope)
  const presetBEV = (delta: number) => {
    const bev = mixInfo.shares['BEV'] ?? 0
    if (!mixInfo.pts.includes('BEV')) return
    const newBev = Math.max(0, Math.min(100, bev + delta))
    const scale = 100 - bev > 0 ? (100 - newBev) / (100 - bev) : 0
    const mix: Record<string, number> = {}
    for (const p of mixInfo.pts) mix[p] = p === 'BEV' ? newBev : (mixInfo.shares[p] ?? 0) * scale
    patch({ mix })
  }
  const mixModified = !!eff.mix
  const fleetModified = mixModified || eff.massShiftKg !== 0 || eff.salesMultiplier !== 1
  const policyModified = scenario.ecoBoostG !== 0 || scenario.phevUF === false || scenario.poolingEnabled || scenario.superCreditsEnabled || scenario.creditPrice != null
  const variants = scenario.extraVariants ?? []

  // live PHEV utility-factor multiplier for the current year (probe the engine)
  const ufNow = country === 'EU'
    ? pack.vehicleMetric({ co2: 100, powertrain: 'PHEV', fuel: 'petrol', mass: 1500, sales: 1, parent: '', pool: '', brand: '', make: '', model: '', year: scenario.year, vclass: pack.classes[0] }, { ...scenario, ecoBoostG: 0 }) / 100
    : 1

  return (
    <aside className="flex w-[19rem] shrink-0 flex-col gap-3 overflow-y-auto border-l border-black/[0.06] bg-ink-900/40 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-bold text-ink-100"><Icon name="sliders" size={16} className="text-brand" /> Assumptions</div>
        <button onClick={reset} className="flex items-center gap-1 text-[11px] font-semibold text-ink-500 transition hover:text-ink-100"><Icon name="reset" size={12} /> Reset</button>
      </div>

      {/* scope */}
      <div className="-mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="text-ink-500">Editing</span>
        <span className="rounded-md bg-brand/12 px-1.5 py-0.5 text-[10px] font-bold text-brand">{scope ?? 'whole market'}</span>
        {scope && <span className="text-ink-500">· mix · mass · sales</span>}
      </div>

      {/* live outcome */}
      <div className="rounded-2xl border border-black/[0.07] bg-gradient-to-b from-black/[0.045] to-transparent p-3.5 shadow-[0_1px_2px_rgba(40,30,15,0.04)]">
        <div className="flex items-center justify-between">
          <span className="label">Outcome · {(scope ?? 'market').split(' ')[0]}</span>
          <div className="flex items-center gap-1.5">
            {three && (
              <button onClick={() => setShow3yr((v) => !v)} className={`num rounded-md px-1.5 py-0.5 text-[9px] font-bold transition ${show3yr ? 'bg-brand text-white' : 'bg-black/5 text-ink-500 hover:text-ink-100'}`}>{show3yr ? '3-yr' : '1-yr'}</button>
            )}
            <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${cur.gap > 0 ? 'bg-danger/12 text-danger' : 'bg-safe/12 text-safe'}`}>
              <i className={`h-1.5 w-1.5 rounded-full ${cur.gap > 0 ? 'bg-danger' : 'bg-safe'}`} />{cur.gap > 0 ? 'Over' : 'Under'}
            </span>
          </div>
        </div>
        <div className="mt-2.5 flex items-end justify-between">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-wide text-ink-500">fleet {pack.metricUnit}</div>
            <div className="flex items-baseline gap-1"><span className="dnum text-[30px] font-bold leading-none text-ink-100">{fmtNum(cur.metric, 1)}</span></div>
            <div className="mt-1 text-[10px] text-ink-500">limit {fmtNum(cur.limit, 1)}</div>
          </div>
          <div className="text-right">
            <div className="text-[9px] font-semibold uppercase tracking-wide text-ink-500">gap</div>
            <div className={`dnum text-[20px] font-bold leading-none ${cur.gap > 0 ? 'text-danger' : 'text-safe'}`}>{cur.gap > 0 ? '+' : ''}{fmtNum(cur.gap, 1)}</div>
            <div className="mt-1"><Delta from={base.gap} to={cur.gap} /></div>
          </div>
        </div>
        <PositionBar fleet={cur.metric} limit={cur.limit} />
        <div className="mt-3 flex items-center justify-between border-t border-black/[0.06] pt-2.5">
          <span className="text-[11px] font-medium text-ink-400">{show3yr && three ? '€-at-risk · 3-yr avg' : '€-at-risk'}</span>
          <div className="flex items-center gap-2">
            <span className={`dnum text-[15px] font-bold ${headlineFine > 0 ? 'text-danger' : 'text-safe'}`}>{fmtMoney(headlineFine, pack.currency)}</span>
            <Delta from={base.fine} to={cur.fine} money currency={pack.currency} />
          </div>
        </div>
      </div>

      {/* presets + A/B */}
      <div className="space-y-2">
        <span className="label">Quick scenarios</span>
        <div className="flex flex-wrap gap-1.5">
          {([['As-sold', reset], ...(mixInfo.pts.includes('BEV') ? [['BEV +20pp', () => presetBEV(20)], ['Slow transition', () => presetBEV(-10)]] as [string, () => void][] : []), ['Heavier +100kg', () => patch({ massShiftKg: 100 })]] as [string, () => void][]).map(([label, fn]) => (
            <button key={label} onClick={fn} className="rounded-lg border border-black/[0.07] bg-white/50 px-2.5 py-1 text-[10px] font-semibold text-ink-300 transition hover:-translate-y-px hover:border-brand/40 hover:text-brand">{label}</button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 pt-0.5">
          <button onClick={() => setSnapA({ scenario: { ...scenario }, overrides: { ...makerOverrides }, label: `${scope ?? 'market'} · ${scenario.year}` })}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-black/10 bg-black/[0.02] px-2 py-1.5 text-[10px] font-semibold text-ink-300 transition hover:border-black/20 hover:text-ink-100"><Icon name="layers" size={11} /> {snapA ? 'Re-save A' : 'Save current as A'}</button>
          {snapA && <button onClick={() => setSnapA(null)} className="rounded-lg border border-black/10 px-2 py-1.5 text-[10px] text-ink-500 hover:text-danger">clear</button>}
        </div>
        {snapA && aOut && (
          <div className="overflow-hidden rounded-xl border border-black/[0.06] bg-black/[0.02] text-[10px]">
            <div className="flex justify-between border-b border-black/[0.05] bg-black/[0.02] px-2.5 py-1 font-semibold uppercase tracking-wide text-ink-500"><span>A ⇄ B</span><span>gap · €-at-risk</span></div>
            <div className="px-2.5 py-1.5"><Row label={`A · ${snapA.label}`} o={aOut} cur={pack.currency} dim /><Row label="B · live now" o={{ ...cur, fine: headlineFine }} cur={pack.currency} /></div>
          </div>
        )}
      </div>

      {/* FLEET */}
      <Group title="Fleet" icon="scatter" modified={fleetModified}>
        <div>
          <span className="label">Year <span className="font-normal normal-case text-ink-500">· all makers</span></span>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {pack.years.map((y) => (
              <button key={y} onClick={() => patch({ year: y })}
                className={`num rounded-lg px-2.5 py-1 text-xs font-semibold transition ${scenario.year === y ? 'bg-brand text-white' : 'bg-black/5 text-ink-500 hover:text-ink-100'}`}>{y}</button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <span className="label flex items-center gap-1.5">Powertrain mix{mixModified && <i className="h-1.5 w-1.5 rounded-full bg-brand" />}</span>
            {eff.mix && <button onClick={() => patch({ mix: null })} className="text-[10px] font-semibold text-ink-500 hover:text-ink-100">as-sold</button>}
          </div>
          <div className="mt-2 flex h-2.5 w-full overflow-hidden rounded-full bg-ink-800 ring-1 ring-black/[0.04]">
            {mixInfo.pts.map((p) => <div key={p} className="transition-all duration-300" style={{ width: `${resultShare(p)}%`, background: ptColor(p) }} title={`${p} ${Math.round(resultShare(p))}%`} />)}
          </div>
          <div className="mt-3 space-y-2.5">
            {mixInfo.pts.map((p) => (
              <div key={p} className="flex items-center gap-2.5">
                <span className="flex w-[52px] shrink-0 items-center gap-1.5 text-[11px] font-medium text-ink-100"><i className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: ptColor(p) }} />{p}</span>
                <input type="range" className="w-full flex-1" min={0} max={100} step={1} value={Math.round(weights[p] ?? 0)}
                  style={{ ['--fill' as string]: `${Math.round(weights[p] ?? 0)}%` }}
                  onChange={(e) => setWeight(p, parseFloat(e.target.value))} />
                <span className="num w-7 shrink-0 text-right text-[11px] font-bold" style={{ color: ptColor(p) }}>{Math.round(resultShare(p))}%</span>
              </div>
            ))}
          </div>
        </div>

        <NumSlider label={`${pack.massLabel} shift`} value={eff.massShiftKg} min={-150} max={150} step={5} unit="kg" baseline={0}
          onChange={(v) => patch({ massShiftKg: v })} hint="moves fleet & the limit together" />
        <NumSlider label="Sales volume" value={eff.salesMultiplier} min={0.5} max={1.6} step={0.05} unit="×" baseline={1}
          onChange={(v) => patch({ salesMultiplier: v })} />
      </Group>

      {/* POLICY & CREDITS */}
      <Group title="Policy & credits" icon="scale" modified={policyModified}>
        <NumSlider label="Eco-innovation" value={scenario.ecoBoostG} min={0} max={ecoCapFor(scenario.year)} step={0.5} unit="g" baseline={0}
          onChange={(v) => patch({ ecoBoostG: v })} hint={`capped at ${ecoCapFor(scenario.year)} g/km · all makers`} />

        {country === 'EU' && (
          <Toggle label="PHEV utility factor" checked={scenario.phevUF !== false} onChange={(b) => patch({ phevUF: b })}
            hint={`2025+ WLTP correction · ×${fmtNum(scenario.phevUF === false ? 1 : ufNow, 2)} on PHEV CO₂ this year`}
            right={<span className="num rounded bg-black/10 px-1 text-[9px] font-bold text-ink-400">×{fmtNum(ufNow, 2)}</span>} />
        )}

        {pack.pooling.enabled && <Toggle label="Pooling" checked={scenario.poolingEnabled} onChange={(b) => patch({ poolingEnabled: b })} hint="combine makers, share one average" />}
        {pack.id === 'IN' && <Toggle label="Super-credits" checked={scenario.superCreditsEnabled} onChange={(b) => patch({ superCreditsEnabled: b })} hint="BEV ×3, PHEV ×2.5" />}

        {pack.creditPrice != null && (
          <NumSlider label="Credit price" value={scenario.creditPrice ?? pack.creditPrice} min={0} max={Math.max(150, pack.creditPrice * 2)} step={5} unit={`${pack.currency}/u`} baseline={pack.creditPrice}
            onChange={(v) => patch({ creditPrice: v })} hint="assumed trading price · drives pooling value" />
        )}
      </Group>

      {/* BUILD */}
      <Group title="Build a variant" icon="spark" defaultOpen={variants.length > 0} modified={variants.length > 0}>
        <AddVariant pack={pack} scenario={scenario} parent={drilledParent} defaultModel={drilledModel} variants={variants} ptColor={ptColor}
          onAdd={(v) => patch({ extraVariants: [...variants, v] })}
          onRemove={(i) => patch({ extraVariants: variants.filter((_, k) => k !== i) })} />
      </Group>

      {footer}
    </aside>
  )
}

const Row = ({ label, o, cur, dim }: { label: string; o: Outcome; cur: string; dim?: boolean }) => (
  <div className={`flex items-center justify-between py-0.5 ${dim ? 'text-ink-400' : 'text-ink-100'}`}>
    <span className="truncate pr-2">{label}</span>
    <span className="num shrink-0 font-semibold"><span className={o.gap > 0 ? 'text-danger' : 'text-safe'}>{o.gap > 0 ? '+' : ''}{fmtNum(o.gap, 1)}</span> · {fmtMoney(o.fine, cur)}</span>
  </div>
)

// Representative tailpipe CO₂ (g/km) per powertrain — the variant's emissions
// follow the powertrain, not a free-typed number. BEV is always zero-emission.
const DEFAULT_CO2: Record<string, number> = { BEV: 0, PHEV: 35, HEV: 95, MHEV: 120, ICE: 140, 'Strong Hybrid': 90 }
const FUEL_FOR: Record<string, string> = { BEV: 'Electric', PHEV: 'Petrol/Electric', HEV: 'Petrol Hybrid', MHEV: 'Petrol', ICE: 'Petrol', 'Strong Hybrid': 'Petrol Hybrid' }

function AddVariant({ pack, scenario, parent, defaultModel, variants, onAdd, onRemove, ptColor }: {
  pack: any; scenario: Scenario; parent: string; defaultModel: string; variants: Vehicle[]
  onAdd: (v: Vehicle) => void; onRemove: (i: number) => void; ptColor: (p: string) => string
}) {
  const [open, setOpen] = useState(false)
  const [model, setModel] = useState('')
  const [pt, setPt] = useState('BEV')
  const [co2, setCo2] = useState('0')
  const [mass, setMass] = useState('1500')
  const [sales, setSales] = useState('5000')

  useEffect(() => { setModel(defaultModel) }, [defaultModel])
  const isBev = pt === 'BEV'
  const choosePt = (p: string) => { setPt(p); setCo2(String(DEFAULT_CO2[p] ?? 0)) }

  const draft: Vehicle = {
    parent, pool: '', brand: parent, make: parent, model: model || defaultModel || `New ${pt}`,
    year: scenario.year, powertrain: pt, fuel: FUEL_FOR[pt] ?? 'Petrol',
    co2: isBev ? 0 : parseFloat(co2) || 0, mass: parseFloat(mass) || 1500, sales: parseInt(sales) || 0,
    vclass: pack.classes[0],
  }
  const counts = pack.vehicleMetric(draft, scenario)
  const add = () => { onAdd({ ...draft }); setModel(''); setOpen(false) }

  return (
    <div>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between text-left">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-ink-100">{open ? 'Close' : 'New hypothetical variant'}</span>
        <Icon name={open ? 'close' : 'arrow-right'} size={13} className="text-ink-500" />
      </button>
      {variants.length > 0 && (
        <div className="mt-2 space-y-1">
          {variants.map((v, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg bg-black/[0.03] px-2 py-1 text-[11px]">
              <i className="inline-block h-2 w-2 rounded-full" style={{ background: ptColor(v.powertrain) }} />
              <span className="flex-1 truncate text-ink-100">{v.model}</span>
              <span className="num text-ink-500">{v.co2}g · {v.sales.toLocaleString()}u</span>
              <button onClick={() => onRemove(i)} className="text-ink-500 hover:text-danger"><Icon name="close" size={11} /></button>
            </div>
          ))}
        </div>
      )}
      {open && (
        <div className="mt-2 space-y-2">
          <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Model name" className="w-full rounded-lg border border-black/10 bg-ink-850 px-2 py-1.5 text-xs text-ink-100 outline-none placeholder:text-ink-600" />
          <div className="flex flex-wrap gap-1">
            {['BEV', 'PHEV', 'HEV', 'MHEV', 'ICE'].map((p) => (
              <button key={p} onClick={() => choosePt(p)} className={`rounded-md px-2 py-1 text-[10px] font-semibold ${pt === p ? 'bg-ink-100 text-white' : 'bg-black/5 text-ink-400'}`}>{p}</button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <Field label="CO₂ g/km" value={isBev ? '0' : co2} onChange={setCo2} disabled={isBev} />
            <Field label="kg" value={mass} onChange={setMass} />
            <Field label="units" value={sales} onChange={setSales} />
          </div>
          <div className="rounded-lg bg-ink-950/50 px-2 py-1.5 text-[10px] text-ink-500">
            Counts as <span className="num font-bold text-brand">{fmtNum(counts, 1)} {pack.metricUnit}</span>{isBev ? ' · zero-emission' : pack.metricUnit !== 'g/km' ? ` (converted from ${co2} g/km)` : ''}
            <div className="mt-0.5">Appears under <span className="text-ink-300">{defaultModel || parent.split(' ')[0]}</span></div>
          </div>
          <button onClick={add} className="btn-primary w-full py-1.5 text-xs">Add variant</button>
        </div>
      )}
    </div>
  )
}

const Field = ({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) => (
  <label className="block">
    <span className="text-[9px] uppercase tracking-wide text-ink-500">{label}</span>
    <input value={value} onChange={(e) => onChange(e.target.value)} inputMode="numeric" disabled={disabled}
      className={`num w-full rounded-md border border-black/10 bg-ink-850 px-1.5 py-1 text-xs text-ink-100 outline-none ${disabled ? 'opacity-40' : ''}`} />
  </label>
)
