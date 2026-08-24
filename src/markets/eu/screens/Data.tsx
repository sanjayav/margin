// ───────────────────────────────────────────────────────────────────────────
// EU · DATA — the evidence, and how new evidence gets in.
//
// The screen this replaces had five KPI cards (one of which was a control), three
// stacked banded panels in three different styles, and sixteen controls before
// any data. It also shipped three real defects that made the dataset look broken:
//
//   · Registrations read 71,805,372 — six times the truth — because it summed the
//     same fleet across six held years.
//   · Every row appeared six times, identical, for the same reason.
//   · TEST MASS KG was rendered as two separate columns.
//
// All three come from one mistake: showing every year at once. The EU carries one
// measured year (2025) held forward across the compliance horizon, so the default
// view is ONE year — the compliance year — and the horizon is a filter, not a
// multiplier.
//
// The second job here is getting new data in, and that is the "intelligent like
// Claude" part: you describe or drop a file, the agent reads it and comes back
// with what it matched and what it needs you to decide. Conflicts are questions,
// not errors.
// ───────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { useCompliance } from '../../../lib/useCompliance'
import { useStore } from '../../../state/store'
import { fmtInt, fmtNum } from '../../../engine/engine'
import type { Vehicle } from '../../../engine/types'
import Shell from '../../../app/Shell'
import { Block, Figure, Table, Provenance, type Column } from '../../../design/primitives'
import { ptColor, ptRing } from '../../../lib/palette'
import Icon from '../../../components/Icon'

const PAGE = 100

export default function EUData() {
  const { pack, raw, meta, scenario } = useCompliance('actuals')
  const setScreen = useStore((s) => s.setScreen)

  const years = useMemo(() => [...new Set(raw.map((v) => v.year))].sort(), [raw])
  const [year, setYear] = useState<number>(scenario.year)
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)

  // ONE year at a time. The EU ships a single measured year held forward, so
  // showing the horizon at once multiplies every total by six and repeats every
  // row — which is what made the dataset look broken rather than held.
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return raw
      .filter((v) => v.year === year)
      .filter((v) => !needle || `${v.parent} ${v.model} ${v.powertrain} ${v.fuel}`.toLowerCase().includes(needle))
      .sort((a, b) => b.sales - a.sales)
  }, [raw, year, q])

  const units = useMemo(() => rows.reduce((a, v) => a + v.sales, 0), [rows])
  const makers = useMemo(() => new Set(rows.map((v) => v.parent)).size, [rows])
  const wCo2 = useMemo(() => (units ? rows.reduce((a, v) => a + v.co2 * v.sales, 0) / units : 0), [rows, units])
  const held = year !== Math.min(...years)

  const pages = Math.max(1, Math.ceil(rows.length / PAGE))
  const safe = Math.min(page, pages - 1)
  const view = rows.slice(safe * PAGE, safe * PAGE + PAGE)

  const cols: Column<Vehicle>[] = [
    { key: 'maker', header: 'Manufacturer', width: '20%', cell: (v) => <span className="truncate font-medium text-[#F6F2EB]">{v.parent}</span> },
    { key: 'model', header: 'Model', width: '18%', cell: (v) => <span className="truncate text-[#B8AEA0]">{v.model}</span> },
    {
      key: 'pt', header: 'Powertrain', width: '12%',
      cell: (v) => (
        <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
          style={{ background: `${ptColor(v.powertrain)}14`, color: ptRing(v.powertrain) }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: ptColor(v.powertrain) }} />{v.powertrain}
        </span>
      ),
    },
    { key: 'fuel', header: 'Fuel', cell: (v) => <span className="text-[#7E756A]">{v.fuel}</span> },
    { key: 'co2', header: `CO₂ ${pack.metricUnit}`, align: 'right', cell: (v) => fmtNum(v.co2, 1) },
    { key: 'mass', header: 'Test mass kg', align: 'right', cell: (v) => fmtInt(v.mass) },
    { key: 'eco', header: 'Eco g', align: 'right', cell: (v) => <span className="text-[#7E756A]">{v.ecoBenefit ? fmtNum(v.ecoBenefit, 2) : '—'}</span> },
    { key: 'sales', header: 'Registrations', align: 'right', cell: (v) => <span className="font-semibold text-[#F6F2EB]">{fmtInt(v.sales)}</span> },
  ]

  return (
    <Shell inspectorTitle="Bring data in" inspector={<Ingest onOpenCopilot={() => setScreen('copilot')} />}>
      <h1 className="font-display text-[22px] font-bold tracking-[-0.02em] text-[#F6F2EB]">Data</h1>
      <p className="mt-1.5 max-w-[66ch] text-[13px] leading-relaxed text-[#7E756A]">
        Every registration behind the numbers, exactly as the source filed it.
      </p>

      <div className="mt-7 grid gap-8 sm:grid-cols-4">
        <Figure label="Registrations" value={fmtInt(units)} basis={`${year}${held ? ' · held from ' + Math.min(...years) : ' · measured'}`} />
        <Figure label="Rows" value={fmtInt(rows.length)} basis={q ? 'matching your search' : 'model × powertrain'} />
        <Figure label="Manufacturers" value={fmtInt(makers)} basis="compliance entities" />
        <Figure label={`Fleet ${pack.metricUnit}`} value={fmtNum(wCo2, 1)} basis="registration-weighted, tailpipe" />
      </div>

      {held && (
        <p className="mt-6 flex items-start gap-2 rounded-lg bg-white/[0.03] px-3.5 py-2.5 text-[12px] leading-relaxed text-[#7E756A]">
          <Icon name="clock" size={13} className="mt-[2px] shrink-0 text-[#7E756A]" />
          <span>
            <b className="text-[#B8AEA0]">{year} is held, not measured.</b> The EU publishes one year at a time; this is the{' '}
            {Math.min(...years)} fleet carried forward so the tightening target can be tested against it. Only{' '}
            {Math.min(...years)} is a filing.
          </span>
        </p>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-2.5">
        <label className="relative flex-1 min-w-[240px]">
          <Icon name="search" size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#7E756A]" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0) }}
            placeholder="Manufacturer, model, powertrain…"
            className="w-full rounded-lg border border-white/[0.07] bg-[#1E1A16] py-2 pl-9 pr-3 text-[13px] text-[#F6F2EB] outline-none transition placeholder:text-[#7E756A] focus:border-white/25" />
        </label>
        <div className="flex items-center gap-1 rounded-lg bg-white/[0.05] p-0.5">
          {years.map((y) => (
            <button key={y} onClick={() => { setYear(y); setPage(0) }}
              className={`rounded-md px-2.5 py-1.5 text-[12px] font-semibold tabular-nums transition ${y === year ? 'bg-[#1E1A16] text-[#F6F2EB] shadow-sm' : 'text-[#7E756A] hover:text-[#B8AEA0]'}`}>
              {y}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <Table columns={cols} rows={view} rowKey={(v) => `${v.parent}|${v.model}|${v.powertrain}|${v.fuel}|${v.year}`}
          empty={q ? `Nothing matches “${q}”.` : 'No rows for this year.'} />
        {rows.length > PAGE && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[11.5px] text-[#7E756A]">
            <span>Showing <b className="tabular-nums text-[#B8AEA0]">{fmtInt(safe * PAGE + 1)}–{fmtInt(Math.min(rows.length, (safe + 1) * PAGE))}</b> of <b className="tabular-nums text-[#B8AEA0]">{fmtInt(rows.length)}</b></span>
            <span className="flex items-center gap-1">
              <button disabled={safe === 0} onClick={() => setPage(safe - 1)} className="rounded px-2 py-1 disabled:opacity-30 hover:bg-white/[0.05]">‹ Prev</button>
              <span className="px-2 tabular-nums">{safe + 1} / {pages}</span>
              <button disabled={safe >= pages - 1} onClick={() => setPage(safe + 1)} className="rounded px-2 py-1 disabled:opacity-30 hover:bg-white/[0.05]">Next ›</button>
            </span>
          </div>
        )}
      </div>

      <Block title="Where this came from">
        <Provenance source={meta.source}
          vintage={meta.lastRefreshed ? `refreshed ${new Date(meta.lastRefreshed).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'bundled extract'}
          detail={pack.coverage.label} />
      </Block>
    </Shell>
  )
}

/* ── The Inspector — bringing data in, conversationally ────────────────────── */
function Ingest({ onOpenCopilot }: { onOpenCopilot: () => void }) {
  return (
    <div className="space-y-6">
      <p className="text-[12.5px] leading-relaxed text-[#7E756A]">
        Drop an OEM plan, an S&amp;P extract or a JATO file. AiRE reads it, matches what it can, and asks about
        anything it cannot decide for you.
      </p>

      <label className="block cursor-pointer rounded-xl border border-dashed border-white/[0.12] px-4 py-7 text-center transition hover:border-white/30 hover:bg-white/[0.03]">
        <input type="file" className="sr-only" onChange={onOpenCopilot} accept=".xlsx,.xls,.csv" />
        <Icon name="upload" size={18} className="mx-auto text-[#7E756A]" />
        <span className="mt-2.5 block text-[12.5px] font-semibold text-[#B8AEA0]">Drop a file</span>
        <span className="mt-1 block text-[11px] text-[#7E756A]">xlsx · csv</span>
      </label>

      <div>
        <div className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.13em] text-[#7E756A]">What it does</div>
        <ol className="space-y-2.5">
          {[
            ['Reads it', 'Works out what the file is — a plan, a registrations extract, a spec catalogue — and which year it covers.'],
            ['Matches columns', 'Maps its headings onto the engine’s fields, and tells you the confidence for each.'],
            ['Asks, not errors', 'Where a column is ambiguous it asks a question you can answer, instead of failing the import.'],
            ['Stages the load', 'Nothing enters the dataset until you approve it, and the load is versioned so it can be undone.'],
          ].map(([t, d], i) => (
            <li key={t} className="flex gap-3">
              <span className="dnum mt-[1px] w-4 shrink-0 text-[10.5px] tabular-nums text-[#5A534A]">{i + 1}</span>
              <span>
                <span className="block text-[12.5px] font-semibold text-[#B8AEA0]">{t}</span>
                <span className="block text-[11.5px] leading-snug text-[#7E756A]">{d}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>

      <button onClick={onOpenCopilot}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#F6F2EB] px-4 py-2.5 text-[12.5px] font-semibold text-[#100E0C] transition hover:bg-white">
        <Icon name="spark" size={14} /> Describe what you have
      </button>
    </div>
  )
}
