import { useMemo, useState } from 'react'
import { useStore } from '../state/store'
import { getFleet, getMeta } from '../data/fleet'
import { getPack } from '../engine/rulepacks'
import type { Vehicle } from '../engine/types'
import { fmtInt, fmtNum, applyScenario } from '../engine/engine'
import Icon from '../components/Icon'
import { Stat } from '../components/ui'

/** A human variant/spec descriptor — the finest sellable configuration of a
 *  model. Uses the explicit field from the source when present, else composes
 *  one from the spec columns we do have. */
export function variantLabel(r: Vehicle): string {
  if (r.variant) return r.variant
  const bits: string[] = []
  if (r.driveline) bits.push(r.driveline)
  if (r.engineCC) bits.push(`${(r.engineCC / 1000).toFixed(1)}L`)
  if (r.battery) bits.push(`${r.battery} kWh`)
  if (bits.length === 0 && r.fuel) bits.push(r.fuel)
  return bits.length ? bits.join(' · ') : r.powertrain
}

type ColKey = keyof Vehicle | 'variant' | 'metric'
interface Col { k: ColKey; label: string; num?: boolean; scenarioOnly?: boolean; get?: (r: Vehicle, metric: number) => string | number }

export default function Data() {
  // Scoped to the active module — only this market's database is visible here.
  const country = useStore((s) => s.country)
  const dataVersion = useStore((s) => s.dataVersion)
  const savedScenarios = useStore((s) => s.savedScenarios)
  const pack = getPack(country)
  const meta = getMeta(country)
  const [q, setQ] = useState('')
  const [pt, setPt] = useState<string>('ALL')
  const [sortKey, setSortKey] = useState<ColKey>('sales')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  // 'ACTUAL' shows the official registrations as-is; selecting a saved scenario
  // replays its assumptions through the engine and shows the resulting fleet.
  const [view, setView] = useState<string>('ACTUAL')

  const myScenarios = useMemo(() => savedScenarios.filter((s) => s.country === country), [savedScenarios, country])
  const activeScenario = view !== 'ACTUAL' ? myScenarios.find((s) => s.id === view) : undefined
  const scenarioMode = !!activeScenario

  const all = useMemo<Vehicle[]>(() => getFleet(country), [country, dataVersion])

  // In scenario mode the rows are the engine's output for that scenario's year
  // (levers, mix, added variants and all). In actuals mode it's the raw fleet.
  const base = useMemo<Vehicle[]>(() => {
    if (!activeScenario) return all
    return applyScenario(all, activeScenario.scenario, pack, activeScenario.overrides)
  }, [all, activeScenario, pack])

  const metricOf = (r: Vehicle) => (activeScenario ? pack.vehicleMetric(r, activeScenario.scenario) : r.co2)

  const powertrains = useMemo(() => ['ALL', ...[...new Set(base.map((r) => r.powertrain))].sort()], [base])

  const COLS = useMemo<Col[]>(() => [
    { k: 'parent', label: 'Manufacturer' },
    { k: 'model', label: 'Model' },
    { k: 'variant', label: 'Variant', get: (r) => variantLabel(r) },
    { k: 'powertrain', label: 'Powertrain' },
    { k: 'year', label: 'Year', num: true },
    { k: 'co2', label: 'CO₂ g/km', num: true },
    { k: 'metric', label: `After credits ${pack.metricUnit}`, num: true, scenarioOnly: true, get: (r, m) => m },
    { k: 'mass', label: `${pack.massLabel} kg`, num: true },
    { k: 'sales', label: 'Units', num: true },
    { k: 'vclass', label: 'Class' },
  ], [pack])

  const cols = useMemo(() => COLS.filter((c) => !c.scenarioOnly || scenarioMode), [COLS, scenarioMode])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let r = base
    if (pt !== 'ALL') r = r.filter((x) => x.powertrain === pt)
    if (needle) r = r.filter((x) => `${x.parent} ${x.model} ${variantLabel(x)} ${x.brand} ${x.make} ${x.fuel} ${x.powertrain}`.toLowerCase().includes(needle))
    const dir = sortDir === 'asc' ? 1 : -1
    const valOf = (x: Vehicle): string | number => {
      if (sortKey === 'variant') return variantLabel(x)
      if (sortKey === 'metric') return metricOf(x)
      return x[sortKey as keyof Vehicle] as string | number
    }
    return [...r].sort((a, b) => {
      const av = valOf(a), bv = valOf(b)
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
      return String(av ?? '').localeCompare(String(bv ?? '')) * dir
    })
  }, [base, pt, q, sortKey, sortDir, activeScenario]) // eslint-disable-line react-hooks/exhaustive-deps

  const totalUnits = rows.reduce((a, r) => a + r.sales, 0)
  const makers = new Set(rows.map((r) => r.parent)).size
  const sort = (k: ColKey) => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir(k === 'co2' || k === 'mass' || k === 'sales' || k === 'year' || k === 'metric' ? 'desc' : 'asc') }
  }

  const cell = (c: Col, r: Vehicle): string | number => {
    const m = metricOf(r)
    if (c.get) return c.get(r, m)
    const v = r[c.k as keyof Vehicle]
    return (v ?? '') as string | number
  }

  const exportCsv = () => {
    const header = cols.map((c) => c.label).join(',')
    const body = rows.map((r) => cols.map((c) => `"${String(cell(c, r))}"`).join(',')).join('\n')
    const blob = new Blob([`${header}\n${body}`], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `autocred-data-${country.toLowerCase()}${scenarioMode ? '-' + activeScenario!.label.replace(/\s+/g, '-').toLowerCase() : ''}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      {/* KPI band */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat className="rise" label="Rows in view" value={fmtInt(rows.length)} sub={scenarioMode ? `${activeScenario!.scenario.year} only · scenario` : `of ${fmtInt(all.length)} in ${pack.flag}`} accent={scenarioMode ? 'text-brand' : undefined} />
        <Stat className="rise [animation-delay:60ms]" label="Registrations" value={fmtInt(totalUnits)} sub={scenarioMode ? 'scenario units' : 'sum of units'} accent={scenarioMode ? 'text-brand' : undefined} />
        <Stat className="rise [animation-delay:120ms]" label="Manufacturers" value={fmtInt(makers)} sub={`${powertrains.length - 1} powertrains`} />
        <Stat className="rise [animation-delay:180ms]" label="View" value={scenarioMode ? 'Scenario' : 'Actuals'} sub={scenarioMode ? activeScenario!.label : meta.live ? 'Live dataset' : 'Bundled extract'} accent={scenarioMode ? 'text-brand' : meta.live ? 'text-safe' : 'text-ink-400'} />
      </div>

      {/* View selector — actuals vs a saved scenario */}
      <div className="rise card flex flex-wrap items-center justify-between gap-3 p-4 [animation-delay:200ms]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="label flex items-center gap-1.5 text-ink-400"><Icon name="layers" size={13} /> Data view</span>
          <button onClick={() => setView('ACTUAL')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${!scenarioMode ? 'bg-ink-100 text-white' : 'bg-black/5 text-ink-500 hover:text-ink-100'}`}>Actuals</button>
          {myScenarios.length === 0
            ? <span className="text-[11px] text-ink-500">— save a scenario in Analyze to view scenario-based data here</span>
            : myScenarios.map((s) => (
              <button key={s.id} onClick={() => setView(s.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${view === s.id ? 'bg-brand text-white' : 'bg-black/5 text-ink-500 hover:text-ink-100'}`}>{s.label}</button>
            ))}
        </div>
        {scenarioMode && (
          <span className="chip"><Icon name="sliders" size={12} /> scenario year {activeScenario!.scenario.year} · other years hidden</span>
        )}
      </div>

      {/* Provenance */}
      <div className="rise card flex flex-wrap items-center justify-between gap-3 p-4 [animation-delay:240ms]">
        <div className="flex items-center gap-2 text-xs text-ink-500">
          <Icon name="database" size={15} className="text-brand" />
          <span className="font-semibold text-ink-200">{pack.name} · source</span>
          <span>{pack.source}</span>
        </div>
        {meta.lastRefreshed && <span className="chip"><Icon name="clock" size={12} /> refreshed {new Date(meta.lastRefreshed).toLocaleDateString()}</span>}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-[200px] flex-1 items-center gap-2 rounded-xl border border-black/[0.08] bg-white/60 px-3 py-2 focus-within:border-brand/40">
          <Icon name="search" size={15} className="text-ink-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${pack.name} — manufacturer, model, variant…`}
            className="w-full bg-transparent text-sm text-ink-100 outline-none placeholder:text-ink-500" />
          {q && <button onClick={() => setQ('')}><Icon name="close" size={14} className="text-ink-500 hover:text-ink-100" /></button>}
        </div>
        <select value={pt} onChange={(e) => setPt(e.target.value)}
          className="rounded-xl border border-black/[0.08] bg-white/60 px-3 py-2 text-xs font-semibold text-ink-200 outline-none">
          {powertrains.map((p) => <option key={p} value={p}>{p === 'ALL' ? 'All powertrains' : p}</option>)}
        </select>
        <button onClick={exportCsv} className="btn-ghost px-3 py-2 text-xs"><Icon name="section" size={14} /> Export CSV</button>
      </div>

      {/* Table */}
      <div className="card overflow-hidden p-0">
        <div className="max-h-[62vh] overflow-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-[#FFFEFB]/95 backdrop-blur">
              <tr className="border-b border-black/[0.08]">
                {cols.map((c) => (
                  <th key={c.k} onClick={() => sort(c.k)}
                    className={`cursor-pointer select-none whitespace-nowrap px-3 py-2.5 font-semibold uppercase tracking-wide ${c.k === 'metric' ? 'text-brand' : 'text-ink-500'} hover:text-ink-100 ${c.num ? 'text-right' : 'text-left'}`}>
                    <span className="inline-flex items-center gap-1">{c.label}{sortKey === c.k && <span className="text-brand">{sortDir === 'asc' ? '▲' : '▼'}</span>}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const m = metricOf(r)
                return (
                  <tr key={i} className="border-b border-black/[0.04] transition-colors hover:bg-brand/[0.04]">
                    <td className="whitespace-nowrap px-3 py-2 font-medium text-ink-100">{r.parent}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-ink-200">{r.model}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-ink-400">{variantLabel(r)}</td>
                    <td className="px-3 py-2"><span className="inline-flex items-center gap-1.5 text-ink-200"><i className="h-2 w-2 rounded-full" style={{ background: ptColor(r.powertrain) }} />{r.powertrain}</span></td>
                    <td className="num px-3 py-2 text-right text-ink-300">{r.year}</td>
                    <td className={`num px-3 py-2 text-right font-semibold ${r.co2 === 0 ? 'text-safe' : 'text-ink-100'}`}>{fmtNum(r.co2, 0)}</td>
                    {scenarioMode && <td className={`num px-3 py-2 text-right font-semibold ${m === 0 ? 'text-safe' : 'text-brand'}`}>{fmtNum(m, 1)}</td>}
                    <td className="num px-3 py-2 text-right text-ink-200">{fmtInt(r.mass)}</td>
                    <td className="num px-3 py-2 text-right font-semibold text-ink-100">{fmtInt(r.sales)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-ink-400">{r.vclass}</td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr><td colSpan={cols.length} className="px-3 py-12 text-center text-sm text-ink-500">No rows match the current filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// local copy to avoid a cross-import cycle through chart.ts
function ptColor(pt: string) {
  const m: Record<string, string> = {
    BEV: '#0E9F6E', PHEV: '#3B82F6', HEV: '#8B5CF6', MHEV: '#F59E0B', ICE: '#EF4444',
    'Strong Hybrid': '#8B5CF6', 'Range-Extender Hybrid': '#6366F1', 'Flex Fuel Ethanol': '#F59E0B',
  }
  return m[pt] ?? '#9CA3AF'
}
