import { useMemo, useState, type ReactNode } from 'react'
import { useStore } from '../state/store'
import { getFleet, getMeta, setLiveFleet } from '../data/fleet'
import { getPack } from '../engine/rulepacks'
import type { Vehicle } from '../engine/types'
import { fmtInt, fmtNum, applyScenario } from '../engine/engine'
import Icon from '../components/Icon'
import ImportStudio from '../components/ImportStudio'
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

// ── S&P-style faceted multi-select ──────────────────────────────────────────
function Facet({ label, options, sel, onChange }: { label: string; options: string[]; sel: Set<string>; onChange: (s: Set<string>) => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const shown = q ? options.filter((o) => o.toLowerCase().includes(q.toLowerCase())) : options
  const toggle = (o: string) => { const n = new Set(sel); n.has(o) ? n.delete(o) : n.add(o); onChange(n) }
  return (
    <div className="relative">
      <button onClick={() => { setOpen((v) => !v); setQ('') }}
        className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition ${sel.size ? 'border-brand/35 bg-brand/[0.07] text-brand' : 'border-black/[0.08] bg-white/60 text-ink-400 hover:border-black/20 hover:text-ink-100'}`}>
        {label}
        {sel.size > 0 && <span className="num grid h-4 min-w-[16px] place-items-center rounded-full bg-brand px-1 text-[9px] font-bold text-white">{sel.size}</span>}
        <Icon name="chevron" size={11} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="modal-pop absolute left-0 top-[calc(100%+6px)] z-30 w-60 rounded-xl border border-black/[0.08] bg-[#FFFEFB] p-2 shadow-card"
            onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }}>
            {options.length > 9 && (
              <div className="mb-1.5 flex items-center gap-1.5 rounded-lg border border-black/[0.07] bg-black/[0.02] px-2 py-1.5">
                <Icon name="search" size={12} className="text-ink-500" />
                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Filter ${label.toLowerCase()}…`}
                  className="w-full bg-transparent text-[11px] text-ink-100 outline-none placeholder:text-ink-600" />
              </div>
            )}
            <div className="max-h-56 space-y-0.5 overflow-y-auto">
              {shown.map((o) => (
                <button key={o} onClick={() => toggle(o)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] text-ink-200 transition hover:bg-black/[0.03]">
                  <span className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded border transition ${sel.has(o) ? 'border-brand bg-brand text-white' : 'border-black/20 bg-white'}`}>
                    {sel.has(o) && <Icon name="check" size={9} strokeWidth={3} />}
                  </span>
                  <span className="truncate">{o}</span>
                </button>
              ))}
              {shown.length === 0 && <div className="px-2 py-3 text-center text-[11px] text-ink-500">No match.</div>}
            </div>
            {sel.size > 0 && (
              <button onClick={() => onChange(new Set())} className="mt-1.5 w-full rounded-lg border border-black/[0.07] py-1 text-[10px] font-semibold text-ink-500 transition hover:text-danger">Clear {label.toLowerCase()}</button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// numeric range filter — from/to inputs, blank = unbounded
function Range({ label, unit, lo, hi, setLo, setHi }: { label: string; unit: string; lo: string; hi: string; setLo: (v: string) => void; setHi: (v: string) => void }) {
  const active = lo !== '' || hi !== ''
  return (
    <div className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs transition ${active ? 'border-brand/35 bg-brand/[0.07]' : 'border-black/[0.08] bg-white/60'}`}>
      <span className={`font-semibold ${active ? 'text-brand' : 'text-ink-400'}`}>{label}</span>
      <input value={lo} onChange={(e) => setLo(e.target.value.replace(/[^\d.]/g, ''))} placeholder="min" inputMode="numeric"
        className="num w-11 bg-transparent text-right text-[11px] text-ink-100 outline-none placeholder:text-ink-600" />
      <span className="text-ink-600">–</span>
      <input value={hi} onChange={(e) => setHi(e.target.value.replace(/[^\d.]/g, ''))} placeholder="max" inputMode="numeric"
        className="num w-11 bg-transparent text-[11px] text-ink-100 outline-none placeholder:text-ink-600" />
      <span className="text-[9px] text-ink-500">{unit}</span>
    </div>
  )
}

const GROUPS = [
  { k: 'none', label: 'Detail rows' },
  { k: 'parent', label: 'Manufacturer' },
  { k: 'model', label: 'Model' },
  { k: 'powertrain', label: 'Powertrain' },
  { k: 'vclass', label: 'Class' },
  { k: 'segment', label: 'Segment' },     // shown only when the market data carries it
  { k: 'bodyStyle', label: 'Body style' }, // (India workbook extract; imports may add it anywhere)
  { k: 'year', label: 'Year' },
] as const
type GroupKey = (typeof GROUPS)[number]['k']

interface GroupRow { key: string; rows: number; units: number; wCo2: number; wMetric: number; wMass: number; bevShare: number; share: number }

export default function Data() {
  // Scoped to the active module — only this market's database is visible here.
  const country = useStore((s) => s.country)
  const dataVersion = useStore((s) => s.dataVersion)
  const savedScenarios = useStore((s) => s.savedScenarios)
  const pack = getPack(country)
  const meta = getMeta(country)
  const [q, setQ] = useState('')
  const [sortKey, setSortKey] = useState<ColKey>('sales')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  // 'ACTUAL' shows the official registrations as-is; selecting a saved scenario
  // replays its assumptions through the engine and shows the resulting fleet.
  const [view, setView] = useState<string>('ACTUAL')
  const [importing, setImporting] = useState(false)
  // row-level maintenance of the record (ACTUAL view only — scenario rows are
  // engine output, there is nothing to edit). Every save writes a new dataset
  // version through the same store the imports use, so edits are auditable.
  const [editor, setEditor] = useState<{ row: Partial<Vehicle>; original: Vehicle | null } | null>(null)
  const [armDel, setArmDel] = useState<Vehicle | null>(null)

  // expert filters — facets + numeric ranges + grouping
  const [fMaker, setFMaker] = useState<Set<string>>(new Set())
  const [fPt, setFPt] = useState<Set<string>>(new Set())
  const [fClass, setFClass] = useState<Set<string>>(new Set())
  const [fYear, setFYear] = useState<Set<string>>(new Set())
  const [co2Lo, setCo2Lo] = useState(''); const [co2Hi, setCo2Hi] = useState('')
  const [massLo, setMassLo] = useState(''); const [massHi, setMassHi] = useState('')
  const [groupBy, setGroupBy] = useState<GroupKey>('none')
  const [gSort, setGSort] = useState<keyof GroupRow>('units')
  const [gDir, setGDir] = useState<'asc' | 'desc'>('desc')

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

  // facet options come from the unfiltered base so choices never vanish
  const optMakers = useMemo(() => [...new Set(base.map((r) => r.parent))].sort(), [base])
  const optPts = useMemo(() => [...new Set(base.map((r) => r.powertrain))].sort(), [base])
  const optClasses = useMemo(() => [...new Set(base.map((r) => r.vclass))].sort(), [base])
  const optYears = useMemo(() => [...new Set(base.map((r) => String(r.year)))].sort(), [base])
  // dimension-bearing datasets only: hide Segment/Body style pivots when absent
  const groupOptions = useMemo(() => GROUPS.filter((g) =>
    (g.k !== 'segment' || base.some((r) => r.segment)) && (g.k !== 'bodyStyle' || base.some((r) => r.bodyStyle))), [base])

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

  // The master-file structure: these headings appear as columns the moment the
  // market's data carries them (hidden when empty, never dropped from the schema).
  const OPT_COLS: Col[] = useMemo(() => [
    { k: 'segment' as ColKey, label: 'Segment' },
    { k: 'bodyStyle' as ColKey, label: 'Body style' },
    { k: 'fuelKmpl' as ColKey, label: 'km/l', num: true },
    { k: 'range' as ColKey, label: 'E-Range km', num: true },
    { k: 'otrPrice' as ColKey, label: 'OTR price', num: true },
    { k: 'tax' as ColKey, label: 'Tax', num: true },
  ], [])
  const cols = useMemo(() => {
    const present = OPT_COLS.filter((c) => base.some((r) => (r as any)[c.k] != null && (r as any)[c.k] !== ''))
    // projected horizon rows must be tellable from record rows — in the table
    // AND in any CSV export of it
    if (base.some((r) => r.scenario === 'Baseline projection'))
      present.push({ k: 'scenario' as ColKey, label: 'Basis' })
    const out = COLS.filter((c) => !c.scenarioOnly || scenarioMode)
    // slot the structure columns before Class so the table reads like the master
    const at = out.findIndex((c) => c.k === 'vclass')
    return [...out.slice(0, at), ...present, ...out.slice(at)]
  }, [COLS, OPT_COLS, scenarioMode, base])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let r = base
    if (fMaker.size) r = r.filter((x) => fMaker.has(x.parent))
    if (fPt.size) r = r.filter((x) => fPt.has(x.powertrain))
    if (fClass.size) r = r.filter((x) => fClass.has(x.vclass))
    if (fYear.size) r = r.filter((x) => fYear.has(String(x.year)))
    if (co2Lo !== '') r = r.filter((x) => x.co2 >= parseFloat(co2Lo))
    if (co2Hi !== '') r = r.filter((x) => x.co2 <= parseFloat(co2Hi))
    if (massLo !== '') r = r.filter((x) => x.mass >= parseFloat(massLo))
    if (massHi !== '') r = r.filter((x) => x.mass <= parseFloat(massHi))
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
  }, [base, q, sortKey, sortDir, activeScenario, fMaker, fPt, fClass, fYear, co2Lo, co2Hi, massLo, massHi]) // eslint-disable-line react-hooks/exhaustive-deps

  const totalUnits = rows.reduce((a, r) => a + r.sales, 0)
  const makers = new Set(rows.map((r) => r.parent)).size
  // sales-weighted CO₂ (and after-credits metric in scenario mode) of the view
  const wCo2 = totalUnits ? rows.reduce((a, r) => a + r.co2 * r.sales, 0) / totalUnits : 0
  const wMetric = totalUnits ? rows.reduce((a, r) => a + metricOf(r) * r.sales, 0) / totalUnits : 0

  // ── grouped/pivot view: aggregate the FILTERED rows by one dimension ───────
  const groups = useMemo<GroupRow[] | null>(() => {
    if (groupBy === 'none') return null
    if (!groupOptions.some((g) => g.k === groupBy)) return null // dimension absent in this market
    const m = new Map<string, { rows: number; units: number; co2U: number; metU: number; massU: number; bevU: number }>()
    for (const r of rows) {
      const key = String(r[groupBy] ?? '—')
      const g = m.get(key) ?? { rows: 0, units: 0, co2U: 0, metU: 0, massU: 0, bevU: 0 }
      g.rows += 1; g.units += r.sales
      g.co2U += r.co2 * r.sales; g.metU += metricOf(r) * r.sales; g.massU += r.mass * r.sales
      if (r.powertrain === 'BEV') g.bevU += r.sales
      m.set(key, g)
    }
    const tot = [...m.values()].reduce((a, g) => a + g.units, 0) || 1
    const out: GroupRow[] = [...m.entries()].map(([key, g]) => ({
      key, rows: g.rows, units: g.units,
      wCo2: g.units ? g.co2U / g.units : 0, wMetric: g.units ? g.metU / g.units : 0,
      wMass: g.units ? g.massU / g.units : 0, bevShare: g.units ? g.bevU / g.units : 0, share: g.units / tot,
    }))
    const dir = gDir === 'asc' ? 1 : -1
    return out.sort((a, b) => {
      const av = a[gSort], bv = b[gSort]
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
      return String(av).localeCompare(String(bv)) * dir
    })
  }, [rows, groupBy, gSort, gDir, activeScenario]) // eslint-disable-line react-hooks/exhaustive-deps

  const sort = (k: ColKey) => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir(k === 'co2' || k === 'mass' || k === 'sales' || k === 'year' || k === 'metric' ? 'desc' : 'asc') }
  }
  const gsort = (k: keyof GroupRow) => {
    if (k === gSort) setGDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setGSort(k); setGDir(k === 'key' ? 'asc' : 'desc') }
  }

  const cell = (c: Col, r: Vehicle): string | number => {
    const m = metricOf(r)
    if (c.get) return c.get(r, m)
    const v = r[c.k as keyof Vehicle]
    return (v ?? '') as string | number
  }

  const anyFilter = fMaker.size > 0 || fPt.size > 0 || fClass.size > 0 || fYear.size > 0 || co2Lo !== '' || co2Hi !== '' || massLo !== '' || massHi !== '' || q.trim() !== ''
  const clearAll = () => { setFMaker(new Set()); setFPt(new Set()); setFClass(new Set()); setFYear(new Set()); setCo2Lo(''); setCo2Hi(''); setMassLo(''); setMassHi(''); setQ('') }

  const chip = (label: string, onX: () => void): ReactNode => (
    <span key={label} className="flex items-center gap-1 rounded-full border border-brand/25 bg-brand/[0.07] py-0.5 pl-2.5 pr-1 text-[10.5px] font-semibold text-brand">
      {label}
      <button onClick={onX} className="grid h-4 w-4 place-items-center rounded-full transition hover:bg-brand/15"><Icon name="close" size={9} /></button>
    </span>
  )
  const chips: ReactNode[] = [
    ...[...fMaker].map((v) => chip(v, () => { const n = new Set(fMaker); n.delete(v); setFMaker(n) })),
    ...[...fPt].map((v) => chip(v, () => { const n = new Set(fPt); n.delete(v); setFPt(n) })),
    ...[...fClass].map((v) => chip(v, () => { const n = new Set(fClass); n.delete(v); setFClass(n) })),
    ...[...fYear].map((v) => chip(v, () => { const n = new Set(fYear); n.delete(v); setFYear(n) })),
    ...(co2Lo !== '' || co2Hi !== '' ? [chip(`CO₂ ${co2Lo || '0'}–${co2Hi || '∞'}`, () => { setCo2Lo(''); setCo2Hi('') })] : []),
    ...(massLo !== '' || massHi !== '' ? [chip(`Mass ${massLo || '0'}–${massHi || '∞'} kg`, () => { setMassLo(''); setMassHi('') })] : []),
  ]

  const exportCsv = () => {
    let header: string, body: string, tag: string
    if (groups) {
      const gl = GROUPS.find((g) => g.k === groupBy)!.label
      header = [gl, 'Rows', 'Units', 'Units share %', 'Wtd CO₂ g/km', ...(scenarioMode ? [`Wtd after-credits ${pack.metricUnit}`] : []), 'Wtd mass kg', 'BEV share %'].join(',')
      body = groups.map((g) => [`"${g.key}"`, g.rows, g.units, (g.share * 100).toFixed(1), g.wCo2.toFixed(1), ...(scenarioMode ? [g.wMetric.toFixed(1)] : []), g.wMass.toFixed(0), (g.bevShare * 100).toFixed(1)].join(',')).join('\n')
      tag = `by-${groupBy}`
    } else {
      header = cols.map((c) => c.label).join(',')
      body = rows.map((r) => cols.map((c) => `"${String(cell(c, r))}"`).join(',')).join('\n')
      tag = 'detail'
    }
    const blob = new Blob([`${header}\n${body}`], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `autocred-data-${country.toLowerCase()}-${tag}${scenarioMode ? '-' + activeScenario!.label.replace(/\s+/g, '-').toLowerCase() : ''}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  // Apply a modified fleet: live in-session immediately, durable best-effort —
  // the exact path imports take, so a manual edit and a file import age the
  // dataset the same way (new version, source gains a "manual edits" marker).
  const commitRows = async (next: Vehicle[], action: string) => {
    const baseSrc = meta.source ?? pack.source
    const src = /manual edits/.test(baseSrc) ? baseSrc : `${baseSrc} · manual edits`
    setLiveFleet(country, next, { source: src, lastRefreshed: new Date().toISOString(), datasetVersion: `edit-${Date.now()}`, live: true })
    useStore.setState((s) => {
      const parents = [...new Set(next.map((v) => v.parent))].sort()
      return { dataVersion: s.dataVersion + 1, ...(parents.includes(s.selectedParent) ? {} : { selectedParent: parents[0] }) }
    })
    try {
      const res = await fetch('/api/import', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ market: country, source: src, rows: next }),
      })
      if (!res.ok) throw new Error(`server responded ${res.status}`)
    } catch (e: any) {
      console.warn(`row ${action} persisted for this session only:`, e?.message ?? e)
    }
  }
  const deleteRow = (r: Vehicle) => { setArmDel(null); void commitRows(all.filter((x) => x !== r), 'delete') }
  const saveRow = (built: Vehicle, original: Vehicle | null) => {
    setEditor(null)
    void commitRows(original ? all.map((x) => (x === original ? built : x)) : [...all, built], original ? 'edit' : 'add')
  }

  return (
    <div className="space-y-5">
      {/* KPI band */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat className="rise" label="Rows in view" value={fmtInt(rows.length)} sub={scenarioMode ? `${activeScenario!.scenario.year} only · scenario` : `of ${fmtInt(all.length)} in ${pack.flag}`} accent={scenarioMode ? 'text-brand' : undefined} />
        <Stat className="rise [animation-delay:50ms]" label="Registrations" value={fmtInt(totalUnits)} sub={scenarioMode ? 'scenario units' : 'sum of units'} accent={scenarioMode ? 'text-brand' : undefined} />
        <Stat className="rise [animation-delay:100ms]" label="Sales-wtd CO₂" value={fmtNum(wCo2, 1)} sub={scenarioMode ? `${fmtNum(wMetric, 1)} after credits` : 'g/km · of the current view'} />
        <Stat className="rise [animation-delay:150ms]" label="Manufacturers" value={fmtInt(makers)} sub={`${optPts.length} powertrains`} />
        <Stat className="rise [animation-delay:200ms]" label="View" value={scenarioMode ? 'Scenario' : 'Actuals'} sub={scenarioMode ? activeScenario!.label : meta.live ? 'Live dataset' : 'Bundled extract'} accent={scenarioMode ? 'text-brand' : meta.live ? 'text-safe' : 'text-ink-400'} />
      </div>

      {/* View selector — actuals vs a saved scenario */}
      <div className="rise card flex flex-wrap items-center justify-between gap-3 p-4 [animation-delay:200ms]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="label flex items-center gap-1.5 text-ink-400"><Icon name="layers" size={13} /> Data view</span>
          <button onClick={() => setView('ACTUAL')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${!scenarioMode ? 'bg-ink-100 text-white' : 'bg-black/5 text-ink-500 hover:text-ink-100'}`}>Actuals</button>
          {myScenarios.length === 0
            ? <span className="text-[11px] text-ink-500">— save a scenario in the Scenario module to view scenario-based data here</span>
            : myScenarios.map((s) => (
              <button key={s.id} onClick={() => setView(s.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${view === s.id ? 'bg-brand text-white' : 'bg-black/5 text-ink-500 hover:text-ink-100'}`}>{s.label}</button>
            ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-ink-500">
          {scenarioMode && <span className="chip"><Icon name="sliders" size={12} /> scenario year {activeScenario!.scenario.year}</span>}
          <span className="hidden items-center gap-1.5 sm:flex"><Icon name="database" size={13} className="text-brand" /> {pack.source}</span>
          {meta.lastRefreshed && <span className="chip"><Icon name="clock" size={12} /> {new Date(meta.lastRefreshed).toLocaleDateString()}</span>}
        </div>
      </div>

      {/* Expert toolbar — search · facets · ranges · grouping */}
      <div className="rise card space-y-3 p-4 [animation-delay:240ms]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-black/[0.08] bg-white/60 px-3 py-2 transition focus-within:border-brand/40">
            <Icon name="search" size={15} className="text-ink-500" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${pack.name} — manufacturer, model, variant…`}
              className="w-full bg-transparent text-sm text-ink-100 outline-none placeholder:text-ink-500" />
            {q && <button onClick={() => setQ('')}><Icon name="close" size={14} className="text-ink-500 hover:text-ink-100" /></button>}
          </div>
          <button onClick={() => setImporting(true)} className="btn-primary px-3 py-2 text-xs"><Icon name="upload" size={14} /> Import data</button>
          {!scenarioMode && (
            <button data-testid="add-row" onClick={() => setEditor({ row: { year: Number([...fYear][0]) || pack.years[0], vclass: pack.classes[0], powertrain: 'ICE', parent: fMaker.size === 1 ? [...fMaker][0] : '' }, original: null })}
              className="btn-ghost px-3 py-2 text-xs"><Icon name="plus" size={14} /> Add row</button>
          )}
          <button onClick={exportCsv} className="btn-ghost px-3 py-2 text-xs"><Icon name="section" size={14} /> Export {groups ? 'pivot' : 'CSV'}</button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Facet label="Manufacturer" options={optMakers} sel={fMaker} onChange={setFMaker} />
          <Facet label="Powertrain" options={optPts} sel={fPt} onChange={setFPt} />
          <Facet label="Class" options={optClasses} sel={fClass} onChange={setFClass} />
          <Facet label="Year" options={optYears} sel={fYear} onChange={setFYear} />
          <span className="h-6 w-px bg-black/[0.07]" />
          <Range label="CO₂" unit="g" lo={co2Lo} hi={co2Hi} setLo={setCo2Lo} setHi={setCo2Hi} />
          <Range label="Mass" unit="kg" lo={massLo} hi={massHi} setLo={setMassLo} setHi={setMassHi} />
          {anyFilter && (
            <button onClick={clearAll} className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-ink-500 transition hover:text-danger">
              <Icon name="close" size={11} /> Clear all
            </button>
          )}
        </div>
        {chips.length > 0 && <div className="flex flex-wrap items-center gap-1.5">{chips}</div>}
        <div className="flex flex-wrap items-center gap-1 border-t border-black/[0.05] pt-3">
          <span className="label mr-1 text-ink-400">View as</span>
          {groupOptions.map((g) => (
            <button key={g.k} onClick={() => setGroupBy(g.k)}
              className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition ${groupBy === g.k ? 'bg-ink-100 text-white' : 'bg-black/5 text-ink-500 hover:text-ink-100'}`}>
              {g.k === 'none' ? g.label : `By ${g.label.toLowerCase()}`}
            </button>
          ))}
          {groups && <span className="ml-auto text-[11px] text-ink-500">{groups.length} groups · sales-weighted averages</span>}
        </div>
      </div>

      {/* Table — detail rows or the grouped pivot */}
      <div className="card overflow-hidden p-0">
        <div className="max-h-[62vh] overflow-auto">
          {groups ? (
            <table className="w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 z-10 bg-[#FFFEFB]/95 shadow-[0_1px_0_rgba(0,0,0,0.07),0_4px_10px_-6px_rgba(60,45,20,0.12)] backdrop-blur">
                <tr className="border-b border-black/[0.08]">
                  {([
                    ['key', GROUPS.find((g) => g.k === groupBy)!.label, false],
                    ['rows', 'Rows', true],
                    ['units', 'Units', true],
                    ['share', 'Share', true],
                    ['wCo2', 'Wtd CO₂', true],
                    ...(scenarioMode ? [['wMetric', `Wtd ${pack.metricUnit}`, true] as [keyof GroupRow, string, boolean]] : []),
                    ['wMass', 'Wtd mass', true],
                    ['bevShare', 'BEV share', true],
                  ] as [keyof GroupRow, string, boolean][]).map(([k, label, num]) => (
                    <th key={k} onClick={() => gsort(k)}
                      className={`cursor-pointer select-none whitespace-nowrap px-3 py-2.5 font-semibold uppercase tracking-wide text-ink-500 hover:text-ink-100 ${num ? 'text-right' : 'text-left'}`}>
                      <span className="inline-flex items-center gap-1">{label}{gSort === k && <span className="text-brand">{gDir === 'asc' ? '▲' : '▼'}</span>}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.key} className="border-b border-black/[0.04] transition-colors odd:bg-black/[0.012] hover:bg-brand/[0.04]">
                    <td className="whitespace-nowrap px-3 py-2 font-medium text-ink-100">
                      {groupBy === 'powertrain'
                        ? <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: ptColor(g.key) }} />{g.key}</span>
                        : g.key}
                    </td>
                    <td className="num px-3 py-2 text-right text-ink-400">{fmtInt(g.rows)}</td>
                    <td className="num px-3 py-2 text-right font-semibold text-ink-100">{fmtInt(g.units)}</td>
                    <td className="px-3 py-2">
                      <div className="ml-auto flex w-24 items-center justify-end gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/[0.05]">
                          <div className="h-full rounded-full bg-brand/70" style={{ width: `${Math.max(2, g.share * 100)}%` }} />
                        </div>
                        <span className="num w-9 text-right text-ink-400">{(g.share * 100).toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className={`num px-3 py-2 text-right font-semibold ${g.wCo2 === 0 ? 'text-safe' : 'text-ink-100'}`}>{fmtNum(g.wCo2, 1)}</td>
                    {scenarioMode && <td className="num px-3 py-2 text-right font-semibold text-brand">{fmtNum(g.wMetric, 1)}</td>}
                    <td className="num px-3 py-2 text-right text-ink-200">{fmtInt(g.wMass)}</td>
                    <td className={`num px-3 py-2 text-right font-semibold ${g.bevShare > 0.25 ? 'text-safe' : 'text-ink-300'}`}>{(g.bevShare * 100).toFixed(1)}%</td>
                  </tr>
                ))}
                {groups.length === 0 && (
                  <tr><td colSpan={scenarioMode ? 8 : 7} className="px-3 py-12 text-center text-sm text-ink-500">No rows match the current filters.</td></tr>
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 z-10 bg-[#FFFEFB]/95 shadow-[0_1px_0_rgba(0,0,0,0.07),0_4px_10px_-6px_rgba(60,45,20,0.12)] backdrop-blur">
                <tr className="border-b border-black/[0.08]">
                  {cols.map((c) => (
                    <th key={c.k} onClick={() => sort(c.k)}
                      className={`cursor-pointer select-none whitespace-nowrap px-3 py-2.5 font-semibold uppercase tracking-wide ${c.k === 'metric' ? 'text-brand' : 'text-ink-500'} hover:text-ink-100 ${c.num ? 'text-right' : 'text-left'}`}>
                      <span className="inline-flex items-center gap-1">{c.label}{sortKey === c.k && <span className="text-brand">{sortDir === 'asc' ? '▲' : '▼'}</span>}</span>
                    </th>
                  ))}
                  {!scenarioMode && <th className="w-16 px-2 py-2.5" aria-label="Row actions" />}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const m = metricOf(r)
                  // one cell per header — cols is dynamic (scenario metric, master
                  // structure columns, Basis), so the body must map the same array
                  const td = (c: Col) => {
                    switch (c.k) {
                      case 'parent': return <td key={c.k} className="whitespace-nowrap px-3 py-2 font-medium text-ink-100">{r.parent}</td>
                      case 'model': return <td key={c.k} className="whitespace-nowrap px-3 py-2 text-ink-200">{r.model}</td>
                      case 'variant': return <td key={c.k} className="whitespace-nowrap px-3 py-2 text-ink-400">{variantLabel(r)}</td>
                      case 'powertrain': return <td key={c.k} className="px-3 py-2"><span className="inline-flex items-center gap-1.5 text-ink-200"><i className="h-2 w-2 rounded-full" style={{ background: ptColor(r.powertrain) }} />{r.powertrain}</span></td>
                      case 'year': return <td key={c.k} className="num px-3 py-2 text-right text-ink-300">{r.year}</td>
                      case 'co2': return <td key={c.k} className={`num px-3 py-2 text-right font-semibold ${r.co2 === 0 ? 'text-safe' : 'text-ink-100'}`}>{fmtNum(r.co2, 0)}</td>
                      case 'metric': return <td key={c.k} className={`num px-3 py-2 text-right font-semibold ${m === 0 ? 'text-safe' : 'text-brand'}`}>{fmtNum(m, 1)}</td>
                      case 'mass': return <td key={c.k} className="num px-3 py-2 text-right text-ink-200">{fmtInt(r.mass)}</td>
                      case 'sales': return <td key={c.k} className="num px-3 py-2 text-right font-semibold text-ink-100">{fmtInt(r.sales)}</td>
                      case 'vclass': return <td key={c.k} className="whitespace-nowrap px-3 py-2 text-ink-400">{r.vclass}</td>
                      case 'scenario': return (
                        <td key={c.k} className="whitespace-nowrap px-3 py-2">
                          {r.scenario === 'Baseline projection'
                            ? <span className="rounded-full border border-warn/30 bg-warn/10 px-2 py-0.5 text-[10px] font-semibold text-warn">Baseline projection</span>
                            : <span className="text-[10px] font-semibold text-ink-500">Record</span>}
                        </td>
                      )
                      default: {
                        const v = (r as any)[c.k]
                        if (v == null || v === '') return <td key={c.k} className="px-3 py-2 text-ink-600">—</td>
                        return c.num
                          ? <td key={c.k} className="num px-3 py-2 text-right text-ink-300">{fmtNum(Number(v), Number.isInteger(Number(v)) ? 0 : 1)}</td>
                          : <td key={c.k} className="whitespace-nowrap px-3 py-2 text-ink-300">{String(v)}</td>
                      }
                    }
                  }
                  return (
                    <tr key={i} className="group border-b border-black/[0.04] transition-colors odd:bg-black/[0.012] hover:bg-brand/[0.04]">
                      {cols.map(td)}
                      {!scenarioMode && (
                        <td className="whitespace-nowrap px-2 py-1.5 text-right">
                          <span className="inline-flex items-center gap-0.5 opacity-25 transition-opacity group-hover:opacity-100" onMouseLeave={() => armDel === r && setArmDel(null)}>
                            <button title="Edit row" onClick={() => setEditor({ row: { ...r }, original: r })}
                              className="grid h-6 w-6 place-items-center rounded-md text-ink-500 transition hover:bg-black/[0.06] hover:text-ink-100"><Icon name="pencil" size={12} /></button>
                            {armDel === r
                              ? <button title="Confirm delete" onClick={() => deleteRow(r)} className="rounded-md bg-danger px-1.5 py-1 text-[9px] font-bold text-white">SURE?</button>
                              : <button title="Delete row" onClick={() => setArmDel(r)} className="grid h-6 w-6 place-items-center rounded-md text-ink-500 transition hover:bg-danger/10 hover:text-danger"><Icon name="trash" size={12} /></button>}
                          </span>
                        </td>
                      )}
                    </tr>
                  )
                })}
                {rows.length === 0 && (
                  <tr><td colSpan={cols.length + (scenarioMode ? 0 : 1)} className="px-3 py-12 text-center text-sm text-ink-500">No rows match the current filters.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {importing && <ImportStudio country={country} pack={pack} onClose={() => setImporting(false)} />}
      {editor && (
        <RowEditor initial={editor.row} isNew={!editor.original} pack={pack}
          makers={optMakers} powertrains={optPts} fuels={[...new Set(all.map((r) => r.fuel))].sort()}
          onSave={(v) => saveRow(v, editor.original)} onClose={() => setEditor(null)} />
      )}
    </div>
  )
}

// ── Row editor — add or correct one record of the market database ───────────
// Kept deliberately schema-first: the core engine fields up top, the master
// structure below. Saving writes a NEW dataset version (audit trail), exactly
// like an import — the record is versioned, never silently mutated.
function RowEditor({ initial, isNew, pack, makers, powertrains, fuels, onSave, onClose }: {
  initial: Partial<Vehicle>; isNew: boolean; pack: ReturnType<typeof getPack>
  makers: string[]; powertrains: string[]; fuels: string[]
  onSave: (v: Vehicle) => void; onClose: () => void
}) {
  const [f, setF] = useState<Record<string, string>>(() => {
    const s: Record<string, string> = {}
    const put = (k: string, v: unknown) => { s[k] = v == null ? '' : String(v) }
    put('parent', initial.parent); put('brand', initial.brand); put('model', initial.model); put('variant', initial.variant)
    put('powertrain', initial.powertrain); put('fuel', initial.fuel); put('vclass', initial.vclass ?? pack.classes[0]); put('year', initial.year)
    put('co2', initial.co2); put('mass', initial.mass); put('sales', initial.sales)
    put('segment', initial.segment); put('bodyStyle', initial.bodyStyle)
    put('fuelKmpl', initial.fuelKmpl); put('range', initial.range); put('otrPrice', initial.otrPrice); put('tax', initial.tax)
    return s
  })
  const set = (k: string) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }))
  const num = (k: string) => (f[k].trim() === '' ? null : Number(f[k].replace(/[^\d.-]/g, '')))
  const problems: string[] = []
  if (!f.parent.trim()) problems.push('Manufacturer is required')
  if (!f.model.trim()) problems.push('Model is required')
  if (!f.powertrain.trim()) problems.push('Powertrain is required')
  const yr = num('year'); if (yr == null || yr < 1990 || yr > 2100) problems.push('Year must be 1990–2100')
  const co2 = num('co2'); if (co2 == null || co2 < 0 || co2 > 600) problems.push('CO₂ must be 0–600 g/km')
  const mass = num('mass'); if (mass == null || mass < 300 || mass > 4500) problems.push(`${pack.massLabel} must be 300–4,500 kg`)
  const sales = num('sales'); if (sales == null || sales < 0) problems.push('Units must be ≥ 0')
  const build = (): Vehicle => ({
    ...(initial as Vehicle),
    parent: f.parent.trim(), pool: f.parent.trim(), brand: f.brand.trim() || f.parent.trim(), make: f.brand.trim() || f.parent.trim(),
    model: f.model.trim(), variant: f.variant.trim() || undefined,
    powertrain: f.powertrain.trim(), fuel: f.fuel.trim() || f.powertrain.trim(), vclass: f.vclass,
    year: yr!, co2: co2!, mass: mass!, sales: Math.round(sales!),
    segment: f.segment.trim() || undefined, bodyStyle: f.bodyStyle.trim() || undefined,
    fuelKmpl: num('fuelKmpl') ?? undefined, range: num('range') ?? undefined,
    otrPrice: num('otrPrice') ?? undefined, tax: num('tax') ?? undefined,
  })
  // plain render helper (NOT a component): a nested component type would
  // remount on every parent render and drop input focus per keystroke
  const field = ({ k, label, type = 'text', list, span, unit, options }: { k: string; label: string; type?: string; list?: string; span?: boolean; unit?: string; options?: string[] }) => (
    <label className={`block ${span ? 'col-span-2' : ''}`}>
      <span className="label mb-1 block text-ink-400">{label}</span>
      {options ? (
        <select value={f[k]} onChange={set(k)} className="w-full rounded-lg border border-black/[0.1] bg-white px-2.5 py-2 text-xs text-ink-100 outline-none transition focus:border-brand/50">
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <span className="flex items-center gap-1.5 rounded-lg border border-black/[0.1] bg-white px-2.5 py-2 transition focus-within:border-brand/50">
          <input value={f[k]} onChange={set(k)} list={list} inputMode={type === 'num' ? 'decimal' : undefined}
            className="w-full bg-transparent text-xs text-ink-100 outline-none placeholder:text-ink-600" />
          {unit && <span className="shrink-0 text-[9px] font-semibold text-ink-500">{unit}</span>}
        </span>
      )}
    </label>
  )
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/35 backdrop-blur-[2px]" onClick={onClose} />
      <div data-testid="row-editor" className="modal-pop relative flex max-h-[92vh] w-[min(680px,95vw)] flex-col overflow-hidden rounded-2xl border border-black/10 bg-[#FBF7EF] shadow-2xl">
        <div className="flex items-center justify-between border-b border-black/[0.07] bg-[#FFFEFB] px-5 py-3.5">
          <div>
            <div className="text-sm font-bold text-ink-100">{isNew ? 'Add a record row' : 'Edit record row'}</div>
            <div className="text-[11px] text-ink-500">{pack.name} database · saving writes a new dataset version — the record is versioned, never silently changed</div>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-ink-500 transition hover:bg-black/5 hover:text-ink-100"><Icon name="close" size={16} /></button>
        </div>
        <div className="grid grid-cols-2 gap-3 overflow-y-auto px-5 py-4 sm:grid-cols-4">
          {field({ k: 'parent', label: 'Manufacturer *', list: 're-makers', span: true })}
          {field({ k: 'brand', label: 'Brand', span: true })}
          {field({ k: 'model', label: 'Model *', span: true })}
          {field({ k: 'variant', label: 'Variant', span: true })}
          {field({ k: 'powertrain', label: 'Powertrain *', list: 're-pts' })}
          {field({ k: 'fuel', label: 'Fuel', list: 're-fuels' })}
          {field({ k: 'vclass', label: 'Class', options: pack.classes as unknown as string[] })}
          {field({ k: 'year', label: 'Year *', type: 'num' })}
          {field({ k: 'co2', label: 'CO₂ *', type: 'num', unit: 'g/km' })}
          {field({ k: 'mass', label: `${pack.massLabel} *`, type: 'num', unit: 'kg' })}
          {field({ k: 'sales', label: 'Units *', type: 'num' })}
          {field({ k: 'segment', label: 'Segment' })}
          {field({ k: 'bodyStyle', label: 'Body style' })}
          {pack.id === 'IN' && (<>
            {field({ k: 'fuelKmpl', label: 'Fuel economy', type: 'num', unit: 'km/l' })}
            {field({ k: 'range', label: 'E-Range', type: 'num', unit: 'km' })}
            {field({ k: 'otrPrice', label: 'OTR price', type: 'num', unit: '₹' })}
            {field({ k: 'tax', label: 'Tax', type: 'num', unit: '₹' })}
          </>)}
          <datalist id="re-makers">{makers.map((m) => <option key={m} value={m} />)}</datalist>
          <datalist id="re-pts">{[...new Set([...powertrains, 'ICE', 'BEV', 'PHEV', 'Strong Hybrid', 'MHEV'])].map((p) => <option key={p} value={p} />)}</datalist>
          <datalist id="re-fuels">{[...new Set([...fuels, 'Petrol', 'Diesel', 'Electric', 'CNG'])].map((p) => <option key={p} value={p} />)}</datalist>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-black/[0.07] bg-[#FFFEFB] px-5 py-3">
          <span className="min-h-[14px] text-[10.5px] font-semibold text-danger">{problems[0] ?? ''}</span>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="btn-ghost px-3 py-2 text-xs">Cancel</button>
            <button data-testid="row-save" disabled={problems.length > 0} onClick={() => onSave(build())}
              className="btn-primary px-4 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-40">
              <Icon name="check" size={14} /> {isNew ? 'Add row' : 'Save changes'}
            </button>
          </div>
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
