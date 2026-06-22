import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useStore } from '../state/store'
import { useCompliance } from '../lib/useCompliance'
import { fmtNum } from '../engine/engine'
import type { Vehicle, Scenario } from '../engine/types'
import Icon from './Icon'

const PT_COLOR: Record<string, string> = {
  BEV: '#3ddc97', PHEV: '#5b8def', HEV: '#8b7ff0', MHEV: '#ffb454', ICE: '#ff5d6c', 'Strong Hybrid': '#8b7ff0',
}
const ptColor = (p: string) => PT_COLOR[p] ?? '#8C8273'

function Slider({ label, value, min, max, step, onChange, fmt, hint }: {
  label: string; value: number; min: number; max: number; step: number
  onChange: (v: number) => void; fmt: (v: number) => string; hint?: string
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="label">{label}</span>
        <span className="num text-sm font-bold text-brand">{fmt(value)}</span>
      </div>
      <input type="range" className="mt-2 w-full" min={min} max={max} step={step} value={value}
        style={{ ['--fill' as string]: `${((value - min) / (max - min)) * 100}%` }}
        onChange={(e) => onChange(parseFloat(e.target.value))} />
      {hint && <div className="mt-1 text-[10px] text-ink-500">{hint}</div>}
    </div>
  )
}

function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (b: boolean) => void; hint?: string }) {
  return (
    <button onClick={() => onChange(!checked)} className="flex w-full items-center justify-between rounded-xl border border-black/10 bg-black/[0.02] px-3 py-2.5 text-left transition hover:border-black/20">
      <div><div className="text-xs font-semibold text-ink-100">{label}</div>{hint && <div className="text-[10px] text-ink-500">{hint}</div>}</div>
      <div className={`relative h-5 w-9 rounded-full transition ${checked ? 'bg-brand' : 'bg-ink-700'}`}>
        <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-ink-950 transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </div>
    </button>
  )
}

export function ScenarioRail({ footer }: { footer?: ReactNode }) {
  const { pack, raw } = useCompliance()
  const scenario = useStore((s) => s.scenario)
  const selectedParent = useStore((s) => s.selectedParent)
  const drillPath = useStore((s) => s.drillPath)
  const screen = useStore((s) => s.screen)
  const makerOverrides = useStore((s) => s.makerOverrides)
  const patch = useStore((s) => s.patchScenario)
  const reset = useStore((s) => s.resetScenario)

  // Scope: at the market level edits apply to the whole market; drilled into a
  // maker, mix/mass/sales/EV edits apply to that maker only (and the EU total updates).
  const scope = screen === 'analyze' && drillPath.length >= 1 ? drillPath[0] : null
  const eff: Scenario = scope ? { ...scenario, ...(makerOverrides[scope] ?? {}) } : scenario

  const drilledParent = drillPath[0] ?? selectedParent
  const drilledModel = drillPath.length >= 2 ? drillPath[1] : ''

  // powertrain shares baseline — scoped to the maker when drilled, else market-wide
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

  const variants = scenario.extraVariants ?? []

  return (
    <aside className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-l border-black/[0.06] bg-ink-900/40 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-bold text-ink-100"><Icon name="sliders" size={16} className="text-brand" /> Assumptions</div>
        <button onClick={reset} className="flex items-center gap-1 text-[11px] font-semibold text-ink-500 transition hover:text-ink-100"><Icon name="reset" size={12} /> Reset</button>
      </div>

      {/* Scope indicator */}
      <div className="-mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="text-ink-500">Editing</span>
        <span className="rounded-md bg-brand/12 px-1.5 py-0.5 text-[10px] font-bold text-brand">{scope ?? 'whole market'}</span>
        {scope && <span className="text-ink-500">· mix · mass · sales</span>}
      </div>

      {/* Year */}
      <div>
        <span className="label">Year <span className="font-normal normal-case text-ink-500">· all makers</span></span>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {pack.years.map((y) => (
            <button key={y} onClick={() => patch({ year: y })}
              className={`num rounded-lg px-2.5 py-1 text-xs font-semibold transition ${scenario.year === y ? 'bg-brand text-white' : 'bg-black/5 text-ink-500 hover:text-ink-100'}`}>{y}</button>
          ))}
        </div>
      </div>

      {/* Powertrain mix */}
      <div>
        <div className="flex items-center justify-between">
          <span className="label">Powertrain mix</span>
          {eff.mix && <button onClick={() => patch({ mix: null })} className="text-[10px] font-semibold text-ink-500 hover:text-ink-100">as-sold</button>}
        </div>
        {/* stacked share bar */}
        <div className="mt-2 flex h-2.5 w-full overflow-hidden rounded-full bg-ink-800">
          {mixInfo.pts.map((p) => (
            <div key={p} style={{ width: `${resultShare(p)}%`, background: ptColor(p) }} title={`${p} ${Math.round(resultShare(p))}%`} />
          ))}
        </div>
        <div className="mt-3 space-y-3">
          {mixInfo.pts.map((p) => (
            <div key={p}>
              <div className="flex items-baseline justify-between">
                <span className="flex items-center gap-1.5 text-xs font-medium text-ink-100"><i className="inline-block h-2 w-2 rounded-full" style={{ background: ptColor(p) }} />{p}</span>
                <span className="num text-xs font-bold" style={{ color: ptColor(p) }}>{Math.round(resultShare(p))}%</span>
              </div>
              <input type="range" className="mt-1.5 w-full" min={0} max={100} step={1} value={Math.round(weights[p] ?? 0)}
                style={{ ['--fill' as string]: `${Math.round(weights[p] ?? 0)}%` }}
                onChange={(e) => setWeight(p, parseFloat(e.target.value))} />
            </div>
          ))}
        </div>
      </div>

      <Slider label={`${pack.massLabel} shift`} value={eff.massShiftKg} min={-150} max={150} step={5}
        onChange={(v) => patch({ massShiftKg: v })} fmt={(v) => `${v > 0 ? '+' : ''}${v} kg`} hint="moves fleet & the limit together" />

      <Slider label="Sales volume" value={eff.salesMultiplier} min={0.5} max={1.6} step={0.05}
        onChange={(v) => patch({ salesMultiplier: v })} fmt={(v) => `${fmtNum(v, 2)}×`} />

      <Slider label="Eco-innovation" value={scenario.ecoBoostG} min={0} max={7} step={0.5}
        onChange={(v) => patch({ ecoBoostG: v })} fmt={(v) => `${fmtNum(v, 1)} g`} hint="capped at 7 g/km · all makers" />

      {/* Add a variant */}
      <AddVariant pack={pack} scenario={scenario} parent={drilledParent} defaultModel={drilledModel} variants={variants} ptColor={ptColor}
        onAdd={(v) => patch({ extraVariants: [...variants, v] })}
        onRemove={(i) => patch({ extraVariants: variants.filter((_, k) => k !== i) })} />

      <div className="flex flex-col gap-2">
        {pack.pooling.enabled && <Toggle label="Pooling" checked={scenario.poolingEnabled} onChange={(b) => patch({ poolingEnabled: b })} />}
        {pack.id === 'IN' && <Toggle label="Super-credits" checked={scenario.superCreditsEnabled} onChange={(b) => patch({ superCreditsEnabled: b })} hint="BEV ×3, PHEV ×2.5" />}
      </div>

      {footer}
    </aside>
  )
}

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

  // when drilled into a model, prefill it so the variant lands in the current view
  useEffect(() => { setModel(defaultModel) }, [defaultModel])

  const isBev = pt === 'BEV'
  const choosePt = (p: string) => { setPt(p); setCo2(String(DEFAULT_CO2[p] ?? 0)) }

  const draft: Vehicle = {
    parent, pool: '', brand: parent, make: parent, model: model || defaultModel || `New ${pt}`,
    year: scenario.year, powertrain: pt, fuel: FUEL_FOR[pt] ?? 'Petrol',
    co2: isBev ? 0 : parseFloat(co2) || 0, mass: parseFloat(mass) || 1500, sales: parseInt(sales) || 0,
    vclass: pack.classes[0],
  }
  // how the engine will actually count it (after credits / fuel conversion)
  const counts = pack.vehicleMetric(draft, scenario)

  const add = () => { onAdd({ ...draft }); setModel(''); setOpen(false) }

  return (
    <div className="rounded-xl border border-black/[0.07] bg-black/[0.015] p-3">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between text-left">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-ink-100"><Icon name="spark" size={13} className="text-brand" /> Add a variant</span>
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
