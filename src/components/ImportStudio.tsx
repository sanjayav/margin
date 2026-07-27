// ───────────────────────────────────────────────────────────────────────────
// Import Studio — bring OEM actuals or purchased vendor data (S&P Global
// Mobility, JATO Dynamics) into the market database.
//
//   1 · Source   drop an .xlsx/.csv, or paste straight from Excel
//   2 · Map      auto-mapped columns (vendor vocabularies), user-overridable
//   3 · Review   Excel-style grid: edit cells, keyboard nav, per-cell errors
//
// Commit merges (replace matching maker-years) or replaces the market dataset,
// updates the app immediately, and persists via POST /api/import.
// ───────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent } from 'react'
import type { CountryId, RulePack, Vehicle } from '../engine/types'
import {
  FIELDS, REQUIRED, type FieldKey, type Mapping, type SheetData, type IssueMap,
  parseFile, parseDelimited, autoMap, detectVendor, looksLikeHeader,
  validateGrid, toVehicles, mergeFleet, templateCsv, applyMasterDataMode, type Vendor,
} from '../lib/importer'
import { getFleet, setLiveFleet } from '../data/fleet'
import { useStore } from '../state/store'
import { fmtInt } from '../engine/engine'
import { scanAnomalies, type Anomaly } from '../engine/anomaly'
import Icon from './Icon'

type Step = 'source' | 'map' | 'grid'
const FIELD_ORDER = new Map(FIELDS.map((f, i) => [f.key, i]))
const colLetter = (i: number) => (i < 26 ? '' : String.fromCharCode(64 + Math.floor(i / 26))) + String.fromCharCode(65 + (i % 26))

export default function ImportStudio({ country, pack, onClose }: { country: CountryId; pack: RulePack; onClose: (imported: boolean) => void }) {
  // India's homologation basis is MIDC; every other market here runs WLTP/WLTC.
  // The importer uses this to pick the right column when a file carries several.
  const preferCycle: 'WLTP' | 'MIDC' = country === 'IN' ? 'MIDC' : 'WLTP'
  const [step, setStep] = useState<Step>('source')
  const [fileName, setFileName] = useState<string | null>(null)
  const [sheets, setSheets] = useState<SheetData[]>([])
  const [sheetIdx, setSheetIdx] = useState(0)
  const [hasHeader, setHasHeader] = useState(true)
  const [mapping, setMapping] = useState<Mapping[]>([])
  const [vendor, setVendor] = useState<Vendor | null>(null)
  const [parseErr, setParseErr] = useState<string | null>(null)
  const [drag, setDrag] = useState(false)
  const [masterMode, setMasterMode] = useState<'Model' | 'Variant'>('Model')

  const grid = sheets[sheetIdx]?.grid ?? []
  const isMasterFile = useMemo(() => hasHeader && (grid[0] ?? []).some((h) => h.toLowerCase().replace(/[^a-z0-9]/g, '') === 'datamode'), [grid, hasHeader])
  // default to the level that actually carries rows (a specs-only extract has
  // no Model rows; the full master has both — Model = the sales level)
  useEffect(() => {
    if (!isMasterFile) return
    const dm = grid[0].findIndex((h) => h.toLowerCase().replace(/[^a-z0-9]/g, '') === 'datamode')
    const hasModel = grid.slice(1).some((r) => (r[dm] ?? '').trim() === 'Model')
    setMasterMode(hasModel ? 'Model' : 'Variant')
  }, [isMasterFile, grid])
  const headers = useMemo(() => {
    if (!grid.length) return []
    return hasHeader ? grid[0].map((h, i) => h || `Column ${i + 1}`) : grid[0].map((_, i) => `Column ${i + 1}`)
  }, [grid, hasHeader])

  // ── step 1 → 2: land a grid, auto-map ──────────────────────────────────────
  const landSheets = (sh: SheetData[], name: string | null) => {
    const withRows = sh.filter((s) => s.grid.length > 0)
    if (!withRows.length) { setParseErr('No rows found — is the file empty?'); return }
    setParseErr(null)
    setFileName(name)
    setSheets(withRows)
    // pick the sheet whose header row maps best
    let best = 0, bestScore = -1
    withRows.forEach((s, i) => {
      const score = autoMap(s.grid[0] ?? [], preferCycle).filter((m) => m.field).length
      if (score > bestScore) { best = i; bestScore = score }
    })
    selectSheet(withRows, best)
    setStep('map')
  }
  const selectSheet = (sh: SheetData[], idx: number) => {
    setSheetIdx(idx)
    const g = sh[idx].grid
    const header = looksLikeHeader(g[0] ?? [])
    setHasHeader(header)
    const hdrs = header ? g[0] : (g[0] ?? []).map((_, i) => `Column ${i + 1}`)
    setMapping(autoMap(hdrs, preferCycle))
    setVendor(header ? detectVendor(g[0]) : null)
  }

  const onFile = async (f: File) => {
    try { landSheets(await parseFile(f.name, await f.arrayBuffer()), f.name) }
    catch (e: any) { setParseErr(String(e?.message ?? e)) }
  }
  const onPaste = (e: ClipboardEvent) => {
    if (step !== 'source') return
    const text = e.clipboardData.getData('text/plain')
    if (!text.trim()) return
    e.preventDefault()
    landSheets([{ name: 'Pasted data', grid: parseDelimited(text) }], null)
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault(); setDrag(false)
    const f = e.dataTransfer.files?.[0]
    if (f) void onFile(f)
  }
  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([templateCsv(country)], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url; a.download = `underline-import-template-${country.toLowerCase()}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  // ── step 2 → 3: build working rows in target-field space ──────────────────
  const [fields, setFields] = useState<FieldKey[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const mappedFields = useMemo(() => mapping.filter((m) => m.field).map((m) => m.field!), [mapping])
  const missingRequired = REQUIRED.filter((f) => !mappedFields.includes(f))

  const setMap = (i: number, f: FieldKey | '') => {
    setMapping((m) => m.map((e, k) => {
      if (k === i) return { ...e, field: f === '' ? null : f }
      if (f !== '' && e.field === f) return { ...e, field: null } // a field maps once
      return e
    }))
  }
  const toGrid = () => {
    // the India master file: keep exactly one roll-up level
    const effGrid = isMasterFile ? applyMasterDataMode(grid, hasHeader, masterMode) : grid
    const src = hasHeader ? effGrid.slice(1) : effGrid
    const ordered = mapping
      .map((m, i) => ({ field: m.field, i }))
      .filter((m): m is { field: FieldKey; i: number } => m.field != null)
      .sort((a, b) => (FIELD_ORDER.get(a.field) ?? 99) - (FIELD_ORDER.get(b.field) ?? 99))
    setFields(ordered.map((m) => m.field))
    setRows(src.filter((r) => r.some((c) => c !== '')).map((r) => ordered.map((m) => r[m.i] ?? '')))
    setStep('grid')
  }

  // ── step 3: grid state ─────────────────────────────────────────────────────
  const issues = useMemo<IssueMap>(() => validateGrid(rows, fields, country), [rows, fields, country])
  const errRows = useMemo(() => {
    const s = new Set<number>()
    for (const [k, v] of issues) if (v.severity === 'error') s.add(parseInt(k))
    return s
  }, [issues])
  const errorCount = useMemo(() => [...issues.values()].filter((i) => i.severity === 'error').length, [issues])
  const [skipInvalid, setSkipInvalid] = useState(false)
  const [mode, setMode] = useState<'merge' | 'replace'>('merge')
  const [committing, setCommitting] = useState(false)
  const [commitErr, setCommitErr] = useState<string | null>(null)

  const keptRows = skipInvalid ? rows.filter((_, r) => !errRows.has(r)) : rows
  const preview = useMemo(() => {
    const vs = toVehicles(keptRows, fields, country, { vclass: pack.classes[0] })
    return {
      rows: vs.length,
      units: vs.reduce((a, v) => a + v.sales, 0),
      makers: new Set(vs.map((v) => v.parent).filter(Boolean)).size,
      years: [...new Set(vs.map((v) => v.year).filter((y) => y > 0))].sort(),
    }
  }, [keptRows, fields, country, pack])
  // anomaly scan on the rows about to be imported — surfaced before commit so
  // impossible/contradictory values are caught, not silently merged.
  const importAnoms = useMemo<Anomaly[]>(() => scanAnomalies(toVehicles(keptRows, fields, country, { vclass: pack.classes[0] })), [keptRows, fields, country, pack])

  const commit = async () => {
    setCommitting(true); setCommitErr(null)
    try {
      const imported = toVehicles(keptRows, fields, country, { vclass: pack.classes[0] })
      const final = mode === 'replace' ? imported : mergeFleet(getFleet(country), imported)
      const sourceLabel = `${vendor?.name ?? 'OEM actuals'} import${fileName ? ` — ${fileName}` : ' — pasted from Excel'}`
      setLiveFleet(country, final, { source: sourceLabel, lastRefreshed: new Date().toISOString(), datasetVersion: `import-${Date.now()}`, live: true })
      // keep the workspace coherent: recompute views, repair the selected maker
      useStore.setState((s) => {
        const parents = [...new Set(final.map((v) => v.parent))].sort()
        return { dataVersion: s.dataVersion + 1, ...(parents.includes(s.selectedParent) ? {} : { selectedParent: parents[0] }) }
      })
      // durable persistence — best effort; the session dataset is already live
      try {
        const res = await fetch('/api/import', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ market: country, source: sourceLabel, rows: final }),
        })
        if (!res.ok) throw new Error(`server responded ${res.status}`)
      } catch (e: any) {
        console.warn('import persisted for this session only:', e?.message ?? e)
      }
      onClose(true)
    } catch (e: any) {
      setCommitErr(String(e?.message ?? e))
      setCommitting(false)
    }
  }

  const stepIdx = step === 'source' ? 0 : step === 'map' ? 1 : 2
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" onPaste={onPaste}>
      <div className="absolute inset-0 bg-black/35 backdrop-blur-[2px]" onClick={() => !committing && onClose(false)} />
      <div className="modal-pop relative flex h-[min(860px,94vh)] w-[min(1180px,97vw)] flex-col overflow-hidden rounded-2xl border border-black/10 bg-[#FBF7EF] shadow-2xl">
        {/* header */}
        <div className="flex items-center justify-between border-b border-black/[0.07] bg-[#FFFEFB] px-5 py-3.5">
          <div className="flex items-center gap-3">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand/10 text-brand"><Icon name="upload" size={16} /></span>
            <div>
              <div className="text-sm font-bold text-ink-100">Import data · {pack.name}</div>
              <div className="text-[11px] text-ink-500">OEM actuals, S&P Global Mobility, JATO Dynamics — or any spreadsheet</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden items-center gap-1 sm:flex">
              {(['Source', 'Map columns', 'Review & import'] as const).map((label, i) => (
                <div key={label} className="flex items-center gap-1">
                  {i > 0 && <span className="mx-1 h-px w-6 bg-black/15" />}
                  <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${i === stepIdx ? 'bg-ink-100 text-white' : i < stepIdx ? 'text-safe' : 'text-ink-500'}`}>
                    {i < stepIdx ? <Icon name="check" size={10} strokeWidth={3} /> : <span className="num">{i + 1}</span>} {label}
                  </span>
                </div>
              ))}
            </div>
            <button onClick={() => onClose(false)} disabled={committing} className="grid h-7 w-7 place-items-center rounded-lg text-ink-500 transition hover:bg-black/5 hover:text-ink-100"><Icon name="close" size={15} /></button>
          </div>
        </div>

        {/* body */}
        {step === 'source' && (
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6">
            <div
              onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)} onDrop={onDrop}
              className={`relative grid flex-1 place-items-center rounded-2xl border-2 border-dashed transition ${drag ? 'border-brand bg-brand/[0.06]' : 'border-black/15 bg-white/50'}`}>
              <div className="pointer-events-none flex flex-col items-center gap-2 py-10 text-center">
                <span className={`grid h-14 w-14 place-items-center rounded-2xl transition ${drag ? 'bg-brand text-white' : 'bg-black/[0.05] text-ink-400'}`}><Icon name="upload" size={26} /></span>
                <div className="text-sm font-bold text-ink-100">Drop your file here</div>
                <div className="text-xs text-ink-500">.xlsx · .csv · .tsv — or <span className="font-semibold text-brand">paste straight from Excel</span> (⌘V / Ctrl+V anywhere on this window)</div>
              </div>
              <label className="absolute bottom-4 cursor-pointer">
                <input type="file" accept=".xlsx,.xls,.csv,.tsv,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f) }} />
                <span className="btn-ghost px-4 py-2 text-xs"><Icon name="section" size={13} /> Browse files…</span>
              </label>
            </div>
            {parseErr && <div className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/[0.06] px-3 py-2 text-xs font-semibold text-danger"><Icon name="alert" size={14} /> {parseErr}</div>}
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { icon: 'building' as const, name: 'OEM actuals', blurb: 'Your homologation & sales extract. Start from the template if you like — but any column layout maps in the next step.' },
                { icon: 'database' as const, name: 'S&P Global Mobility', blurb: 'Polk/IHS registration extracts land as-is — sales groups, nameplates, curb weights are recognised automatically.' },
                { icon: 'table' as const, name: 'JATO Dynamics', blurb: 'Carspecs and Volumes exports are recognised — versions, kerb weights, body types, driven wheels.' },
              ].map((v) => (
                <div key={v.name} className="card flex items-start gap-2.5 p-3.5">
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-black/[0.05] text-ink-300"><Icon name={v.icon} size={14} /></span>
                  <div>
                    <div className="text-xs font-bold text-ink-100">{v.name}</div>
                    <div className="mt-0.5 text-[11px] leading-relaxed text-ink-500">{v.blurb}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between text-[11px] text-ink-500">
              <span>Everything stays in your workspace — imported data feeds this market's engine, scenarios and pooling.</span>
              <button onClick={downloadTemplate} className="flex items-center gap-1 font-semibold text-brand hover:underline"><Icon name="section" size={12} /> Download {pack.name} template (.csv)</button>
            </div>
          </div>
        )}

        {step === 'map' && (
          <div className="flex min-h-0 flex-1 flex-col gap-3 p-6">
            <div className="flex flex-wrap items-center gap-2">
              {vendor && <span className="chip border-safe/30 bg-safe/[0.08] text-safe"><Icon name="check" size={12} /> Detected: {vendor.name}</span>}
              <span className="chip"><Icon name="table" size={12} /> {fileName ?? 'Pasted data'} · {fmtInt((hasHeader ? grid.length - 1 : grid.length))} rows</span>
              {isMasterFile && (
                <span className="flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/[0.06] py-1 pl-2.5 pr-1 text-[11px] font-semibold text-brand" data-testid="master-mode">
                  Master file — import
                  <span className="flex items-center gap-0.5 rounded-lg bg-white/70 p-0.5">
                    {(['Model', 'Variant'] as const).map((m) => (
                      <button key={m} onClick={() => setMasterMode(m)}
                        className={`rounded-md px-2 py-0.5 text-[10px] font-bold transition ${masterMode === m ? 'bg-ink-100 text-white' : 'text-ink-500 hover:text-ink-100'}`}>
                        {m === 'Model' ? 'Model rows (sales)' : 'Variant rows (specs)'}
                      </button>
                    ))}
                  </span>
                </span>
              )}
              {sheets.length > 1 && (
                <span className="flex items-center gap-1 text-[11px] text-ink-500">Sheet
                  <select value={sheetIdx} onChange={(e) => selectSheet(sheets, parseInt(e.target.value))}
                    className="rounded-lg border border-black/10 bg-white px-2 py-1 text-[11px] font-semibold text-ink-100 outline-none">
                    {sheets.map((s, i) => <option key={i} value={i}>{s.name} ({s.grid.length})</option>)}
                  </select>
                </span>
              )}
              <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-ink-400">
                <input type="checkbox" checked={hasHeader} onChange={(e) => { setHasHeader(e.target.checked); setMapping(autoMap(e.target.checked ? grid[0] : (grid[0] ?? []).map((_, i) => `Column ${i + 1}`), preferCycle)) }} className="accent-[#E8223B]" />
                First row is headers
              </label>
            </div>

            {missingRequired.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-warn/40 bg-warn/[0.07] px-3 py-2 text-[11px]">
                <Icon name="alert" size={13} className="text-warn" />
                <span className="font-semibold text-ink-200">Still needed:</span>
                {missingRequired.map((f) => <span key={f} className="rounded-full bg-black/[0.06] px-2 py-0.5 font-semibold text-ink-300">{FIELDS.find((d) => d.key === f)!.label}</span>)}
                <span className="text-ink-500">— map them below to continue</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 rounded-xl border border-safe/30 bg-safe/[0.06] px-3 py-2 text-[11px] font-semibold text-safe"><Icon name="check" size={13} /> All required fields mapped — {mappedFields.length} of {mapping.length} columns will import</div>
            )}

            <div className="card min-h-0 flex-1 overflow-auto p-0">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 z-10 bg-[#FFFEFB]/95 shadow-[0_1px_0_rgba(0,0,0,0.07)] backdrop-blur">
                  <tr className="border-b border-black/[0.08] text-[10px] font-semibold uppercase tracking-wide text-ink-500">
                    <th className="px-3 py-2">Source column</th>
                    <th className="px-3 py-2">Sample values</th>
                    <th className="w-56 px-3 py-2">Imports as</th>
                  </tr>
                </thead>
                <tbody>
                  {mapping.map((m, i) => {
                    const samples = (hasHeader ? grid.slice(1) : grid).map((r) => r[i]).filter((v) => v !== '').slice(0, 3)
                    const def = m.field ? FIELDS.find((d) => d.key === m.field) : null
                    return (
                      <tr key={i} className={`border-b border-black/[0.04] ${m.field ? '' : 'opacity-60'}`}>
                        <td className="whitespace-nowrap px-3 py-1.5">
                          <span className="num mr-2 text-[9px] text-ink-600">{colLetter(i)}</span>
                          <span className="font-semibold text-ink-100">{headers[i]}</span>
                        </td>
                        <td className="max-w-[360px] truncate px-3 py-1.5 text-ink-400">{samples.join(' · ') || <span className="text-ink-600">empty</span>}</td>
                        <td className="px-3 py-1.5">
                          <div className="flex items-center gap-1.5">
                            <select value={m.field ?? ''} onChange={(e) => setMap(i, e.target.value as FieldKey | '')}
                              className={`w-44 rounded-lg border px-2 py-1 text-[11px] font-semibold outline-none transition ${m.field ? 'border-brand/30 bg-brand/[0.05] text-ink-100' : 'border-black/10 bg-white text-ink-500'}`}>
                              <option value="">— skip —</option>
                              {FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}{f.required ? ' *' : ''}</option>)}
                            </select>
                            {def && <span className="hidden text-[10px] text-ink-500 xl:inline">{def.hint}</span>}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between">
              <button onClick={() => { setStep('source'); setSheets([]); setParseErr(null) }} className="btn-ghost px-4 py-2 text-xs">Back</button>
              <button onClick={toGrid} disabled={missingRequired.length > 0}
                className="btn-primary px-5 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-40">
                Review {fmtInt(hasHeader ? grid.length - 1 : grid.length)} rows <Icon name="arrow-right" size={13} />
              </button>
            </div>
          </div>
        )}

        {step === 'grid' && (
          <GridStep
            fields={fields} rows={rows} setRows={setRows} issues={issues} errorCount={errorCount} errRows={errRows}
            skipInvalid={skipInvalid} setSkipInvalid={setSkipInvalid} mode={mode} setMode={setMode}
            preview={preview} anomalies={importAnoms} committing={committing} commitErr={commitErr}
            onBack={() => setStep('map')} onCommit={() => void commit()} pack={pack}
          />
        )}
      </div>
    </div>
  )
}

// ── step 3 — the Excel-style grid ────────────────────────────────────────────
const ROW_H = 30
function GridStep({ fields, rows, setRows, issues, errorCount, errRows, skipInvalid, setSkipInvalid, mode, setMode, preview, anomalies, committing, commitErr, onBack, onCommit, pack }: {
  fields: FieldKey[]; rows: string[][]; setRows: (r: string[][]) => void
  issues: IssueMap; errorCount: number; errRows: Set<number>
  skipInvalid: boolean; setSkipInvalid: (b: boolean) => void
  mode: 'merge' | 'replace'; setMode: (m: 'merge' | 'replace') => void
  preview: { rows: number; units: number; makers: number; years: number[] }
  anomalies: Anomaly[]
  committing: boolean; commitErr: string | null
  onBack: () => void; onCommit: () => void; pack: RulePack
}) {
  const anomWarn = anomalies.filter((a) => a.severity === 'warn').length
  const [anomOpen, setAnomOpen] = useState(false)
  const defs = fields.map((f) => FIELDS.find((d) => d.key === f)!)
  const [sel, setSel] = useState<{ r: number; c: number }>({ r: 0, c: 0 })
  const [edit, setEdit] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewH, setViewH] = useState(480)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setViewH(el.clientHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useEffect(() => { if (edit != null) inputRef.current?.select() }, [edit != null]) // eslint-disable-line react-hooks/exhaustive-deps

  const setCell = (r: number, c: number, v: string) => {
    const next = rows.slice()
    next[r] = next[r].slice()
    next[r][c] = v
    setRows(next)
  }
  const commitEdit = (move: 'down' | 'right' | 'stay') => {
    if (edit != null) setCell(sel.r, sel.c, edit)
    setEdit(null)
    if (move === 'down' && sel.r < rows.length - 1) select(sel.r + 1, sel.c)
    if (move === 'right' && sel.c < fields.length - 1) select(sel.r, sel.c + 1)
  }
  const select = (r: number, c: number) => {
    setSel({ r, c })
    const el = scrollRef.current
    if (!el) return
    const top = r * ROW_H, bottom = top + ROW_H
    if (top < el.scrollTop) el.scrollTop = top
    else if (bottom > el.scrollTop + el.clientHeight - ROW_H) el.scrollTop = bottom - el.clientHeight + ROW_H
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (edit != null) {
      if (e.key === 'Enter') { e.preventDefault(); commitEdit('down') }
      else if (e.key === 'Tab') { e.preventDefault(); commitEdit('right') }
      else if (e.key === 'Escape') setEdit(null)
      return
    }
    const { r, c } = sel
    if (e.key === 'ArrowDown') { e.preventDefault(); select(Math.min(rows.length - 1, r + 1), c) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); select(Math.max(0, r - 1), c) }
    else if (e.key === 'ArrowRight' || e.key === 'Tab') { e.preventDefault(); select(r, Math.min(fields.length - 1, c + 1)) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); select(r, Math.max(0, c - 1)) }
    else if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); setEdit(rows[r]?.[c] ?? '') }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); setCell(r, c, '') }
    else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) { setEdit(e.key) } // type-to-edit, Excel style
  }
  const onPaste = (e: ClipboardEvent) => {
    const text = e.clipboardData.getData('text/plain')
    if (!text.trim() || edit != null) return
    e.preventDefault()
    const block = parseDelimited(text)
    const next = rows.slice()
    block.forEach((brow, dr) => {
      const r = sel.r + dr
      if (r >= next.length) next.push(Array(fields.length).fill(''))
      next[r] = next[r].slice()
      brow.forEach((v, dc) => { const c = sel.c + dc; if (c < fields.length) next[r][c] = v })
    })
    setRows(next)
  }
  const addRow = () => { setRows([...rows, Array(fields.length).fill('')]); select(rows.length, 0) }
  const deleteRow = () => { if (rows.length > 1) { setRows(rows.filter((_, i) => i !== sel.r)); select(Math.min(sel.r, rows.length - 2), sel.c) } }
  const nextError = () => {
    scrollRef.current?.focus() // keyboard lands on the grid — typing edits the cell straight away
    const keys = [...issues.entries()].filter(([, v]) => v.severity === 'error').map(([k]) => k)
    if (!keys.length) return
    const cur = sel.r * fields.length + sel.c
    const pos = keys
      .map((k) => { const [r, f] = k.split(':'); return { r: parseInt(r), c: fields.indexOf(f as FieldKey) } })
      .filter((p) => p.c >= 0)
      .sort((a, b) => (a.r * fields.length + a.c) - (b.r * fields.length + b.c))
    const nxt = pos.find((p) => p.r * fields.length + p.c > cur) ?? pos[0]
    select(nxt.r, nxt.c)
  }

  // virtual window
  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - 4)
  const end = Math.min(rows.length, start + Math.ceil(viewH / ROW_H) + 8)
  const canImport = preview.rows > 0 && (errorCount === 0 || skipInvalid)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-6">
      {/* grid toolbar */}
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="chip"><Icon name="table" size={12} /> {fmtInt(rows.length)} rows · {fields.length} columns</span>
        {errorCount > 0 ? (
          <button onClick={nextError} className="chip border-danger/35 bg-danger/[0.07] font-semibold text-danger transition hover:bg-danger/[0.14]">
            <Icon name="alert" size={12} /> {fmtInt(errorCount)} error{errorCount > 1 ? 's' : ''} — jump to next
          </button>
        ) : (
          <span className="chip border-safe/30 bg-safe/[0.07] font-semibold text-safe"><Icon name="check" size={12} /> All rows valid</span>
        )}
        {anomWarn > 0 && (
          <button onClick={() => setAnomOpen((v) => !v)} className="chip border-warn/35 bg-warn/[0.07] font-semibold text-warn transition hover:bg-warn/[0.14]">
            <Icon name="activity" size={12} /> {anomWarn} anomal{anomWarn === 1 ? 'y' : 'ies'} — {anomOpen ? 'hide' : 'review'}
          </button>
        )}
        <span className="text-ink-500">Double-click or just type to edit · ⌘V pastes a block at the selection</span>
        <span className="ml-auto flex items-center gap-1.5">
          <button onClick={addRow} className="btn-ghost px-2.5 py-1 text-[11px]">+ Row</button>
          <button onClick={deleteRow} className="btn-ghost px-2.5 py-1 text-[11px]">Delete row {sel.r + 1}</button>
        </span>
      </div>
      {anomOpen && anomWarn > 0 && (
        <div className="max-h-40 shrink-0 overflow-y-auto rounded-xl border border-warn/25 bg-warn/[0.04] p-1">
          {anomalies.filter((a) => a.severity === 'warn').slice(0, 100).map((a, i) => (
            <div key={i} className="flex items-start gap-2 px-2.5 py-1.5 text-[11px]">
              <Icon name="activity" size={11} className="mt-0.5 shrink-0 text-warn" />
              <span className="font-semibold text-ink-200">{a.label}</span>
              <span className="text-ink-500">{a.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* the sheet */}
      <div ref={scrollRef} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)} onKeyDown={onKey} onPaste={onPaste} tabIndex={0}
        className="min-h-0 flex-1 select-none overflow-auto rounded-xl border border-black/10 bg-white outline-none focus:ring-2 focus:ring-brand/30">
        <div style={{ minWidth: 56 + fields.length * 128 }}>
          {/* header: column letters + field labels */}
          <div className="sticky top-0 z-20 flex border-b border-black/15 bg-[#F4EFE4] text-[10px] font-bold text-ink-400">
            <div className="sticky left-0 z-10 w-14 shrink-0 border-r border-black/10 bg-[#F4EFE4]" />
            {defs.map((d, c) => (
              <div key={d.key} className="w-32 shrink-0 border-r border-black/[0.07] px-2 py-1">
                <span className="num text-[9px] text-ink-600">{colLetter(c)}</span>
                <div className="truncate text-[10.5px] text-ink-200">{d.label}{d.required && <span className="text-brand"> *</span>}</div>
              </div>
            ))}
          </div>
          {/* virtual rows */}
          <div style={{ height: rows.length * ROW_H, position: 'relative' }}>
            {rows.slice(start, end).map((row, i) => {
              const r = start + i
              const rowBad = errRows.has(r)
              return (
                <div key={r} className="absolute left-0 flex w-full" style={{ top: r * ROW_H, height: ROW_H }}>
                  <div className={`num sticky left-0 z-10 grid w-14 shrink-0 place-items-center border-b border-r border-black/[0.07] text-[10px] ${rowBad ? 'bg-danger/10 font-bold text-danger' : 'bg-[#FAF6EC] text-ink-500'}`}>{r + 1}</div>
                  {row.map((v, c) => {
                    const issue = issues.get(`${r}:${fields[c]}`)
                    const active = sel.r === r && sel.c === c
                    return (
                      <div key={c} title={issue?.msg}
                        onMouseDown={(e) => { e.preventDefault(); scrollRef.current?.focus(); if (edit != null) commitEdit('stay'); select(r, c) }}
                        onDoubleClick={() => setEdit(v)}
                        className={`num w-32 shrink-0 cursor-cell truncate border-b border-r border-black/[0.06] px-2 py-1 text-[11.5px] leading-[22px]
                          ${issue?.severity === 'error' ? 'bg-danger/[0.09] text-danger' : issue?.severity === 'warn' ? 'bg-warn/[0.12]' : r % 2 ? 'bg-black/[0.012]' : 'bg-white'}
                          ${active ? 'relative z-10 ring-2 ring-inset ring-brand' : ''} text-ink-100`}>
                        {active && edit != null ? (
                          <input ref={inputRef} value={edit} onChange={(e) => setEdit(e.target.value)} onBlur={() => commitEdit('stay')}
                            className="num -mx-2 -my-1 h-[28px] w-[calc(100%+16px)] border-0 bg-white px-2 text-[11.5px] text-ink-100 outline-none" autoFocus />
                        ) : (v || <span className="text-ink-600">·</span>)}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* commit bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-xl border border-black/[0.08] bg-white/70 p-1 text-[11px] font-semibold">
          <button onClick={() => setMode('merge')} className={`rounded-lg px-2.5 py-1.5 transition ${mode === 'merge' ? 'bg-ink-100 text-white' : 'text-ink-500 hover:text-ink-100'}`}>Merge into dataset</button>
          <button onClick={() => setMode('replace')} className={`rounded-lg px-2.5 py-1.5 transition ${mode === 'replace' ? 'bg-ink-100 text-white' : 'text-ink-500 hover:text-ink-100'}`}>Replace {pack.name} dataset</button>
        </div>
        <span className="max-w-[300px] text-[10.5px] leading-tight text-ink-500">
          {mode === 'merge'
            ? 'Replaces the maker-years you import; every other row is kept.'
            : `The entire ${pack.name} database becomes exactly these rows.`}
        </span>
        {errorCount > 0 && (
          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-ink-300">
            <input type="checkbox" checked={skipInvalid} onChange={(e) => setSkipInvalid(e.target.checked)} className="accent-[#E8223B]" />
            Skip {fmtInt(errRows.size)} invalid row{errRows.size > 1 ? 's' : ''}
          </label>
        )}
        <div className="ml-auto flex items-center gap-3">
          {commitErr && <span className="text-[11px] font-semibold text-danger">{commitErr}</span>}
          <span className="num text-[11px] text-ink-500">{fmtInt(preview.rows)} rows · {fmtInt(preview.units)} units · {preview.makers} maker{preview.makers === 1 ? '' : 's'}{preview.years.length ? ` · ${preview.years.join(', ')}` : ''}</span>
          <button onClick={onBack} disabled={committing} className="btn-ghost px-4 py-2 text-xs">Back</button>
          <button onClick={onCommit} disabled={!canImport || committing} className="btn-primary px-5 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-40">
            {committing ? 'Importing…' : <>Import {fmtInt(preview.rows)} rows <Icon name="check" size={13} /></>}
          </button>
        </div>
      </div>
    </div>
  )
}
