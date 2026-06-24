import { useMemo, useState } from 'react'
import { useStore } from '../state/store'
import { getFleet, getMeta } from '../data/fleet'
import { getPack } from '../engine/rulepacks'
import type { Vehicle } from '../engine/types'
import { fmtInt } from '../engine/engine'
import Icon from '../components/Icon'
import { Stat } from '../components/ui'

type SortKey = keyof Vehicle
const COLS: { k: SortKey; label: string; num?: boolean }[] = [
  { k: 'parent', label: 'Maker' },
  { k: 'model', label: 'Model' },
  { k: 'powertrain', label: 'Powertrain' },
  { k: 'fuel', label: 'Fuel' },
  { k: 'year', label: 'Year', num: true },
  { k: 'co2', label: 'CO₂ g/km', num: true },
  { k: 'mass', label: 'Mass kg', num: true },
  { k: 'sales', label: 'Units', num: true },
  { k: 'vclass', label: 'Class' },
]

export default function Data() {
  // Scoped to the active module — only this market's database is visible here.
  const country = useStore((s) => s.country)
  const dataVersion = useStore((s) => s.dataVersion)
  const pack = getPack(country)
  const meta = getMeta(country)
  const [q, setQ] = useState('')
  const [pt, setPt] = useState<string>('ALL')
  const [sortKey, setSortKey] = useState<SortKey>('sales')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const all = useMemo<Vehicle[]>(() => getFleet(country), [country, dataVersion])
  const powertrains = useMemo(() => ['ALL', ...[...new Set(all.map((r) => r.powertrain))].sort()], [all])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let r = all
    if (pt !== 'ALL') r = r.filter((x) => x.powertrain === pt)
    if (needle) r = r.filter((x) => `${x.parent} ${x.model} ${x.brand} ${x.make} ${x.fuel} ${x.powertrain}`.toLowerCase().includes(needle))
    const dir = sortDir === 'asc' ? 1 : -1
    return [...r].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey]
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
      return String(av ?? '').localeCompare(String(bv ?? '')) * dir
    })
  }, [all, pt, q, sortKey, sortDir])

  const totalUnits = rows.reduce((a, r) => a + r.sales, 0)
  const makers = new Set(rows.map((r) => r.parent)).size
  const sort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir(k === 'co2' || k === 'mass' || k === 'sales' || k === 'year' ? 'desc' : 'asc') }
  }

  const exportCsv = () => {
    const header = COLS.map((c) => c.label).join(',')
    const body = rows.map((r) => COLS.map((c) => `"${String(r[c.k] ?? '')}"`).join(',')).join('\n')
    const blob = new Blob([`${header}\n${body}`], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `margin-data-${country.toLowerCase()}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      {/* KPI band */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat className="rise" label="Rows in view" value={fmtInt(rows.length)} sub={`of ${fmtInt(all.length)} in ${pack.flag}`} />
        <Stat className="rise [animation-delay:60ms]" label="Registrations" value={fmtInt(totalUnits)} sub="sum of units" />
        <Stat className="rise [animation-delay:120ms]" label="Makers" value={fmtInt(makers)} sub={`${powertrains.length - 1} powertrains`} />
        <Stat className="rise [animation-delay:180ms]" label="Dataset" value={meta.live ? 'Live' : 'Extract'} sub={pack.name} accent={meta.live ? 'text-safe' : 'text-ink-400'} />
      </div>

      {/* Provenance */}
      <div className="rise card flex flex-wrap items-center justify-between gap-3 p-4 [animation-delay:220ms]">
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
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${pack.name} — maker, model, fuel…`}
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
                {COLS.map((c) => (
                  <th key={c.k} onClick={() => sort(c.k)}
                    className={`cursor-pointer select-none whitespace-nowrap px-3 py-2.5 font-semibold uppercase tracking-wide text-ink-500 hover:text-ink-100 ${c.num ? 'text-right' : 'text-left'}`}>
                    <span className="inline-flex items-center gap-1">{c.label}{sortKey === c.k && <span className="text-brand">{sortDir === 'asc' ? '▲' : '▼'}</span>}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-black/[0.04] transition-colors hover:bg-brand/[0.04]">
                  <td className="whitespace-nowrap px-3 py-2 font-medium text-ink-100">{r.parent}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-ink-200">{r.model}</td>
                  <td className="px-3 py-2"><span className="inline-flex items-center gap-1.5 text-ink-200"><i className="h-2 w-2 rounded-full" style={{ background: ptColor(r.powertrain) }} />{r.powertrain}</span></td>
                  <td className="whitespace-nowrap px-3 py-2 text-ink-400">{r.fuel}</td>
                  <td className="num px-3 py-2 text-right text-ink-300">{r.year}</td>
                  <td className={`num px-3 py-2 text-right font-semibold ${r.co2 === 0 ? 'text-safe' : 'text-ink-100'}`}>{r.co2}</td>
                  <td className="num px-3 py-2 text-right text-ink-200">{fmtInt(r.mass)}</td>
                  <td className="num px-3 py-2 text-right font-semibold text-ink-100">{fmtInt(r.sales)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-ink-400">{r.vclass}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={COLS.length} className="px-3 py-12 text-center text-sm text-ink-500">No rows match the current filters.</td></tr>
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
