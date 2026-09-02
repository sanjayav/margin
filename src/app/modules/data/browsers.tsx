/* ───────────────────────────────────────────────────────────────────────────
   The two data browsers.
   ---------------------------------------------------------------------------
   Every other screen shows a CONCLUSION. These two show the evidence:

     Fundamental — the actual rows the engine reads. One row per variant, with
                   the fields the source actually carried. If a number anywhere
                   in the product looks wrong, this is where you find out why.
     Forecast    — the rows the engine PRODUCES for the forward years, at market
                   and manufacturer level. A forecast that cannot be inspected
                   row by row is an opinion; one that can is a dataset.

   Both export. A compliance team lives in spreadsheets, and refusing to give
   them one does not make them stop.
   ─────────────────────────────────────────────────────────────────────────── */
import React, { useMemo, useState } from 'react'
import {
  Badge, Button, cx, EmptyState, Input, Metric, MetricRow, Panel, Segmented,
  Select, StatusDot, Table, Td, Th, Tooltip, Tr, useToast,
} from '../../design/primitives'
import Icon from '../../design/icons'
import { Sparkline } from '../../design/charts'
import { useApp } from '../../state/appStore'
import { actualsYears, settledThrough, usePosition } from '../../state/usePosition'
import { baseScenario } from '../../state/appStore'
import { buildTree, fmtInt, fmtMoney, fmtNum } from '../../../engine/engine'
import { DRIVER_DEFAULTS, outlookRun, type DriverSet } from '../../../engine/outlook'
import type { Vehicle } from '../../../engine/types'

/* ── export ───────────────────────────────────────────────────────────────── */

function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [columns.join(','), ...rows.map((r) => columns.map((c) => esc(r[c])).join(','))].join('\n')
}

function download(name: string, csv: string) {
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url; a.download = name; a.click()
  // Revoked on the next tick so the click has already been handled.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/* ═══════════════════════════════════════════════════════════════════════════
   Fundamental data
   ═══════════════════════════════════════════════════════════════════════════ */

/** Column groups, so a 40-field row is browsable. Identity is always on; the
 *  rest are opt-in, because nobody reads forty columns at once. */
const GROUPS = {
  compliance: { label: 'Compliance', fields: ['co2', 'mass', 'sales', 'vclass'] as const },
  spec: { label: 'Specification', fields: ['variant', 'battery', 'range', 'energy', 'powerKW', 'gearbox', 'driveline'] as const },
  market: { label: 'Market', fields: ['segment', 'bodyStyle', 'otrPrice', 'market'] as const },
  economy: { label: 'Fuel economy', fields: ['fuelKmpl', 'fuelL100', 'ftCode', 'cnf', 'ecoBenefit'] as const },
  dims: { label: 'Dimensions', fields: ['kerbMass', 'testMass', 'refMass', 'footprint', 'lengthMm', 'widthMm', 'heightMm'] as const },
  prov: { label: 'Provenance', fields: ['source', 'driveCycle', 'co2Estimated', 'salesBasis', 'monthsRecorded'] as const },
}
type GroupId = keyof typeof GROUPS

const HEAD: Record<string, string> = {
  co2: 'CO₂ g/km', mass: 'Mass kg', sales: 'Volume', vclass: 'Class', variant: 'Variant',
  battery: 'Battery kWh', range: 'Range km', energy: 'Energy', powerKW: 'Power kW',
  gearbox: 'Gearbox', driveline: 'Driveline', segment: 'Segment', bodyStyle: 'Body',
  otrPrice: 'OTR price', market: 'Sub-market', fuelKmpl: 'km/l', fuelL100: 'L/100km',
  ftCode: 'Fuel code', cnf: 'CNF', ecoBenefit: 'Eco g', kerbMass: 'Kerb kg', testMass: 'Test kg',
  refMass: 'Ref kg', footprint: 'Footprint m²', lengthMm: 'Length', widthMm: 'Width', heightMm: 'Height',
  source: 'Source', driveCycle: 'Cycle', co2Estimated: 'Estimated', salesBasis: 'Volume basis',
  monthsRecorded: 'Months',
}

/* Fundamental data is the RECORD: what has actually been registered. Several of
   these datasets carry the source's own forward rows in the same file, and a
   projection sitting in a table headed "the exact rows the engine reads" is how
   a plan gets quoted as a fact.

   They are not hidden — hiding them would be its own dishonesty, and Data is the
   module that exists to show where every number comes from. They are SEPARATED
   and LABELLED, and the browser opens on the record. */
type YearFilter = number | 'historical' | 'forward'

export function FundamentalData() {
  const { pack, raw, scenario, country } = usePosition('actuals')
  const toast = useToast()
  const settled = useMemo(() => settledThrough(country), [country])
  const [q, setQ] = useState('')
  const [maker, setMaker] = useState('')
  const [year, setYear] = useState<YearFilter>('historical')

  // Reset the filter when the market changes — an India year means nothing in
  // the EU, and a stale filter silently shows an empty table.
  const [seenCountry, setSeenCountry] = useState(country)
  if (seenCountry !== country) { setSeenCountry(country); setYear('historical'); setMaker('') }
  const [groups, setGroups] = useState<Set<GroupId>>(() => new Set<GroupId>(['compliance']))
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'sales', dir: 'desc' })
  const [limit, setLimit] = useState(200)

  const makers = useMemo(() => [...new Set(raw.map((v) => v.parent))].sort(), [raw])
  const allYears = useMemo(() => [...new Set(raw.map((v) => v.year))].sort((a, b) => b - a), [raw])
  const historicalYears = useMemo(() => allYears.filter((y) => y <= settled), [allYears, settled])
  const forwardYears = useMemo(() => allYears.filter((y) => y > settled), [allYears, settled])
  const forwardRows = useMemo(() => raw.filter((v) => v.year > settled).length, [raw, settled])
  const showingForward = year === 'forward' || (typeof year === 'number' && year > settled)

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const inScope = (y: number) =>
      year === 'historical' ? y <= settled
        : year === 'forward' ? y > settled
        : y === year
    let out = raw.filter((v) =>
      inScope(v.year) &&
      (!maker || v.parent === maker) &&
      (!needle || `${v.parent} ${v.brand} ${v.model} ${v.variant ?? ''} ${v.powertrain} ${v.fuel}`.toLowerCase().includes(needle)))
    const { key, dir } = sort
    out = [...out].sort((a, b) => {
      const av = (a as never as Record<string, unknown>)[key], bv = (b as never as Record<string, unknown>)[key]
      if (typeof av === 'number' && typeof bv === 'number') return dir === 'asc' ? av - bv : bv - av
      return dir === 'asc' ? String(av ?? '').localeCompare(String(bv ?? '')) : String(bv ?? '').localeCompare(String(av ?? ''))
    })
    return out
  }, [raw, q, maker, year, sort, settled])

  const cols = useMemo(
    () => [...new Set((['compliance', 'spec', 'market', 'economy', 'dims', 'prov'] as GroupId[])
      .filter((g) => groups.has(g)).flatMap((g) => GROUPS[g].fields as readonly string[]))],
    [groups],
  )

  const totals = useMemo(() => ({
    units: rows.reduce((a, v) => a + v.sales, 0),
    models: new Set(rows.map((v) => `${v.parent}|${v.model}`)).size,
    makers: new Set(rows.map((v) => v.parent)).size,
  }), [rows])

  const toggle = (g: GroupId) => setGroups((s) => {
    const n = new Set(s)
    n.has(g) ? n.delete(g) : n.add(g)
    if (!n.size) n.add('compliance') // there is always something to look at
    return n
  })

  const sortBy = (key: string) => setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }))

  const exportCsv = () => {
    const base = ['year', 'parent', 'brand', 'model', 'powertrain', 'fuel']
    download(`aire-${pack.id}-${showingForward ? 'forward-rows' : 'fundamental'}-${year}.csv`, toCsv(rows as never, [...base, ...cols]))
    toast({ tone: 'pos', title: 'Exported', body: `${rows.length.toLocaleString()} rows with ${base.length + cols.length} columns.` })
  }

  return (
    <>
      <MetricRow className="mb-4">
        <Metric size="sm" label="Rows in view" value={fmtInt(rows.length)} sub={`of ${fmtInt(raw.length)} in the dataset`} />
        <Metric size="sm" label="Registrations" value={fmtInt(totals.units)}
          sub={year === 'historical' ? `historical through ${settled}` : year === 'forward' ? 'forward rows — not registrations' : `${year}`} />
        <Metric size="sm" label="Models" value={fmtInt(totals.models)} sub={`${totals.makers} manufacturers`} />
        <Metric size="sm" label="Columns shown" value={cols.length + 6} sub="six identity columns are always on" />
        <Metric size="sm" label="Forward rows in file" value={fmtInt(forwardRows)}
          tone={forwardRows ? 'warn' : undefined}
          sub={forwardRows ? `${forwardYears[forwardYears.length - 1]}–${forwardYears[0]} · the source's plan` : 'this source is history only'}
          hint="Rows past the settled year. They are the manufacturer's own projection and are never read by Plan or the Credit book." />
      </MetricRow>

      <Panel flush
        title="Fundamental data"
        sub={showingForward
          ? `The source's own FORWARD rows for ${pack.name} — its plan, not its record. Shown so you can inspect them; they are never read by Plan or the Credit book.`
          : `The exact rows the engine reads, through ${settled}. Nothing here is derived — this is the source, after import mapping.`}
        icon={<Icon name="data" size={14} />}
        actions={
          <>
            {showingForward && <Badge tone="warn" dot>projection</Badge>}
            <Button size="xs" variant="secondary" icon={<Icon name="download" size={12} />} onClick={exportCsv}>Export CSV</Button>
          </>
        }>

        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line-soft)] px-3 py-2.5">
          <span className="relative">
            <Icon name="search" size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-4)]" />
            <Input className="!w-[228px] !pl-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search maker, model, variant…" />
          </span>
          <Select className="!w-[172px]" value={maker} onChange={(e) => setMaker(e.target.value)}>
            <option value="">All manufacturers</option>
            {makers.map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
          <Select className="!w-[214px]" value={String(year)}
            onChange={(e) => {
              const v = e.target.value
              setYear(v === 'historical' || v === 'forward' ? v : Number(v))
            }}>
            <optgroup label="The record">
              <option value="historical">All historical{historicalYears.length ? ` · ${historicalYears[historicalYears.length - 1]}–${settled}` : ''}</option>
              {historicalYears.map((y) => (
                <option key={y} value={y}>{y}{y === settled ? ' · current' : ''}</option>
              ))}
            </optgroup>
            {forwardYears.length > 0 && (
              <optgroup label="The source’s plan — not the record">
                <option value="forward">All forward rows · {forwardYears[forwardYears.length - 1]}–{forwardYears[0]}</option>
                {forwardYears.map((y) => <option key={y} value={y}>{y} · projected</option>)}
              </optgroup>
            )}
          </Select>
          <span className="ml-auto flex flex-wrap items-center gap-1">
            {(Object.keys(GROUPS) as GroupId[]).map((g) => (
              <button key={g} onClick={() => toggle(g)}
                className={cx('rounded-[var(--r-xs)] border px-2 py-[3px] text-[11px] transition-colors',
                  groups.has(g)
                    ? 'border-[var(--ink-2)] bg-[var(--surface-inv)] text-[var(--canvas)]'
                    : 'border-[var(--line)] bg-[var(--surface-1)] text-[var(--ink-3)] hover:border-[var(--line-strong)]')}>
                {GROUPS[g].label}
              </button>
            ))}
          </span>
        </div>

        {showingForward && (
          <div className="border-b border-[var(--warn-line)] bg-[var(--warn-tint)] px-3 py-2 text-[11.5px] leading-relaxed text-[var(--warn-ink)]">
            These are the manufacturer's own forward rows carried in the same file as the history. Nothing in the shape of a row says
            which is which, so the platform draws the line at {settled}: Plan and the Credit book read only what is above it, and these
            years are modelled in Forecast.
          </div>
        )}
        {rows.length ? (
          <>
            <div className="max-h-[600px] overflow-auto">
              <Table>
                <thead>
                  <tr>
                    <Th sortable sorted={sort.key === 'parent' && sort.dir} onSort={() => sortBy('parent')}>Manufacturer</Th>
                    <Th sortable sorted={sort.key === 'model' && sort.dir} onSort={() => sortBy('model')}>Model</Th>
                    <Th sortable sorted={sort.key === 'powertrain' && sort.dir} onSort={() => sortBy('powertrain')}>Powertrain</Th>
                    {typeof year !== 'number' && <Th align="right" sortable sorted={sort.key === 'year' && sort.dir} onSort={() => sortBy('year')}>Year</Th>}
                    {cols.map((c) => (
                      <Th key={c} align={typeof (rows[0] as never as Record<string, unknown>)[c] === 'number' ? 'right' : 'left'}
                        sortable sorted={sort.key === c && sort.dir} onSort={() => sortBy(c)}>
                        {HEAD[c] ?? c}
                      </Th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, limit).map((v, i) => (
                    <Tr key={`${v.parent}-${v.model}-${v.variant ?? ''}-${v.year}-${i}`}>
                      <Td strong className="max-w-[190px]"><span className="block truncate">{v.parent}</span></Td>
                      <Td className="max-w-[200px]">
                        <span className="block truncate">{v.model}</span>
                        {v.variant && <span className="block truncate text-[10.5px] text-[var(--ink-4)]">{v.variant}</span>}
                      </Td>
                      <Td><Badge tone={/BEV|Electric/i.test(v.powertrain) ? 'pos' : /PHEV|HEV|Hybrid/i.test(v.powertrain) ? 'info' : 'neutral'}>{v.powertrain}</Badge></Td>
                      {typeof year !== 'number' && (
                        <Td align="right">
                          <span className={v.year > settled ? 'text-[var(--warn-ink)]' : undefined}>{v.year}</span>
                        </Td>
                      )}
                      {cols.map((c) => {
                        const raw = (v as never as Record<string, unknown>)[c]
                        const num = typeof raw === 'number'
                        return (
                          <Td key={c} align={num ? 'right' : 'left'} className={cx(!num && 'max-w-[220px]')}>
                            {raw == null || raw === ''
                              ? <span className="text-[var(--ink-5)]">—</span>
                              : typeof raw === 'boolean' ? (raw ? 'yes' : 'no')
                              : num ? fmtNum(raw, Math.abs(raw) >= 100 ? 0 : 2)
                              : <span className="block truncate" title={String(raw)}>{String(raw)}</span>}
                          </Td>
                        )
                      })}
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </div>
            {rows.length > limit && (
              <div className="border-t border-[var(--line-soft)] px-3 py-2.5 text-center">
                <Button size="sm" variant="ghost" onClick={() => setLimit((l) => l + 400)}>
                  Show more — {fmtInt(rows.length - limit)} rows hidden
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="p-4">
            <EmptyState art="search" icon={<Icon name="search" size={20} />} title="Nothing matches these filters"
              body="Widen the search, clear the manufacturer, or switch the year."
              action={<Button variant="secondary" onClick={() => { setQ(''); setMaker(''); setYear('historical') }}>Clear filters</Button>} />
          </div>
        )}
      </Panel>
    </>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Forecast data
   ═══════════════════════════════════════════════════════════════════════════ */

export function ForecastData() {
  const { pack, raw, scenario, country } = usePosition('working')
  const toast = useToast()
  const [level, setLevel] = useState<'market' | 'maker'>('market')
  const drivers: DriverSet = DRIVER_DEFAULTS[country]

  const years = useMemo(() => pack.years.filter((y) => y >= scenario.year).slice(0, 8), [pack.years, scenario.year])

  const run = useMemo(() => outlookRun({ raw, pack, drivers, vintageYear: scenario.year }), [raw, pack, drivers, scenario.year])

  const market = useMemo(() => years.map((y) => {
    const t = buildTree(run.fleetForYear(y), pack, run.scenarioFor(y))
    return {
      year: y,
      zeSharePct: run.shareFor(y),
      registrations: t.rawUnits,
      fleetMetric: t.avgMetric,
      limit: t.limit,
      gap: t.gap,
      exposure: (t.children ?? []).reduce((a, c) => a + c.fine, 0),
      makersOver: (t.children ?? []).filter((c) => c.rawUnits > 0 && c.gap > 0).length,
    }
  }), [years, run, pack])

  const byMaker = useMemo(() => {
    if (level !== 'maker') return []
    const names = new Set<string>()
    const rowsFor: Record<string, Record<number, { gap: number; fine: number; metric: number; limit: number; units: number }>> = {}
    for (const y of years) {
      const t = buildTree(run.fleetForYear(y), pack, run.scenarioFor(y))
      for (const c of t.children ?? []) {
        if (c.rawUnits <= 0) continue
        names.add(c.label)
        ;(rowsFor[c.label] ??= {})[y] = { gap: c.gap, fine: c.fine, metric: c.avgMetric, limit: c.limit, units: c.rawUnits }
      }
    }
    return [...names].map((n) => {
      const per = rowsFor[n]
      const cum = years.reduce((a, y) => a + (per[y]?.fine ?? 0), 0)
      const breach = years.find((y) => (per[y]?.gap ?? -1) > 0) ?? null
      return { name: n, per, cum, breach, trend: years.map((y) => per[y]?.metric ?? 0) }
    }).sort((a, b) => b.cum - a.cum)
  }, [level, years, run, pack])

  const exportCsv = () => {
    if (level === 'market') {
      download(`aire-${pack.id}-forecast-market.csv`, toCsv(market as never,
        ['year', 'zeSharePct', 'registrations', 'fleetMetric', 'limit', 'gap', 'exposure', 'makersOver']))
    } else {
      const flat = byMaker.flatMap((m) => years.map((y) => ({
        manufacturer: m.name, year: y,
        fleetMetric: m.per[y]?.metric ?? '', limit: m.per[y]?.limit ?? '',
        gap: m.per[y]?.gap ?? '', exposure: m.per[y]?.fine ?? '', registrations: m.per[y]?.units ?? '',
      })))
      download(`aire-${pack.id}-forecast-manufacturer.csv`, toCsv(flat as never,
        ['manufacturer', 'year', 'fleetMetric', 'limit', 'gap', 'exposure', 'registrations']))
    }
    toast({ tone: 'pos', title: 'Forecast exported', body: 'The assumption set travels in the file header comment row.' })
  }

  return (
    <Panel flush
      title="Forecast data"
      sub={`Engine output for ${years[0]}–${years[years.length - 1]} under the current driver set. Every row is recomputed on this render, so it can never be stale.`}
      icon={<Icon name="forecast" size={14} />}
      actions={
        <>
          <Segmented size="sm" value={level} onChange={setLevel}
            options={[{ id: 'market', label: 'Market' }, { id: 'maker', label: 'Manufacturer' }]} />
          <Button size="xs" variant="secondary" icon={<Icon name="download" size={12} />} onClick={exportCsv}>Export CSV</Button>
        </>
      }>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-[var(--line-soft)] px-3 py-2 text-[11px] text-[var(--ink-4)]">
        <span className="t-label !mb-0">Assumptions</span>
        <span>market growth <b className="tabular-nums text-[var(--ink-2)]">{drivers.marketGrowth}%/yr</b></span>
        <span>ZE at horizon <b className="tabular-nums text-[var(--ink-2)]">{drivers.evShareHorizon}%</b></span>
        <span>combustion CO₂ <b className="tabular-nums text-[var(--ink-2)]">−{drivers.iceCo2Improve}%/yr</b></span>
        <span>mass drift <b className="tabular-nums text-[var(--ink-2)]">{drivers.massDrift}kg/yr</b></span>
        <span className="ml-auto">base year {run.baseYear}</span>
      </div>

      <div className="max-h-[520px] overflow-auto">
        {level === 'market' ? (
          <Table>
            <thead>
              <tr>
                <Th>Year</Th>
                <Th align="right">ZE share</Th>
                <Th align="right">Registrations</Th>
                <Th align="right">Fleet {pack.metricUnit}</Th>
                <Th align="right">Limit</Th>
                <Th align="right">Gap</Th>
                <Th align="right">Exposure</Th>
                <Th align="right">Over</Th>
              </tr>
            </thead>
            <tbody>
              {market.map((r) => (
                <Tr key={r.year}>
                  <Td strong>{r.year}</Td>
                  <Td align="right">{r.zeSharePct.toFixed(1)}%</Td>
                  <Td align="right">{fmtInt(r.registrations)}</Td>
                  <Td align="right" strong>{fmtNum(r.fleetMetric, 1)}</Td>
                  <Td align="right" className="!text-[var(--ink-4)]">{fmtNum(r.limit, 1)}</Td>
                  <Td align="right">
                    <span className={cx('font-semibold', r.gap > 0 ? 'text-[var(--neg-ink)]' : 'text-[var(--pos-ink)]')}>
                      {r.gap > 0 ? '+' : ''}{fmtNum(r.gap, 1)}
                    </span>
                  </Td>
                  <Td align="right">{r.exposure > 0 ? fmtMoney(r.exposure, pack.currency) : <span className="text-[var(--ink-5)]">—</span>}</Td>
                  <Td align="right" className="!text-[var(--ink-3)]">{r.makersOver}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Manufacturer</Th>
                <Th align="center">Trajectory</Th>
                <Th align="right">First breach</Th>
                {years.slice(0, 5).map((y) => <Th key={y} align="right">{y} gap</Th>)}
                <Th align="right">Cumulative exposure</Th>
              </tr>
            </thead>
            <tbody>
              {byMaker.map((m) => (
                <Tr key={m.name}>
                  <Td strong className="max-w-[220px]"><span className="block truncate">{m.name}</span></Td>
                  <Td align="center">
                    <Sparkline points={m.trend} w={64} tone={m.breach ? 'var(--neg)' : 'var(--pos)'} />
                  </Td>
                  <Td align="right">
                    {m.breach
                      ? <Badge tone="neg">{m.breach}</Badge>
                      : <Badge tone="pos">none</Badge>}
                  </Td>
                  {years.slice(0, 5).map((y) => {
                    const g = m.per[y]?.gap
                    return (
                      <Td key={y} align="right">
                        {g == null ? <span className="text-[var(--ink-5)]">—</span>
                          : <span className={g > 0 ? 'font-semibold text-[var(--neg-ink)]' : 'text-[var(--pos-ink)]'}>
                              {g > 0 ? '+' : ''}{fmtNum(g, 1)}
                            </span>}
                      </Td>
                    )
                  })}
                  <Td align="right" strong>
                    {m.cum > 0 ? fmtMoney(m.cum, pack.currency) : <span className="font-normal text-[var(--ink-5)]">—</span>}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </Panel>
  )
}
