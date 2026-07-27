// ───────────────────────────────────────────────────────────────────────────
// COMPLIANCE CO-PILOT — the regulatory truth engine (add-on).
//
// A chat-first surface: drop in a product catalogue (paste or attach) and the
// deterministic engine checks it against EVERY regime at once — fleet fuel-use /
// CO₂ vs each statutory line, the gap, the fine exposure, the zero-emission
// share and what would clear it — then generates a cross-border report. The AI
// framing is a doorway; the numbers are all engine-computed, never invented.
// ───────────────────────────────────────────────────────────────────────────
import { useMemo, useRef, useState } from 'react'
import { useCompliance } from '../lib/useCompliance'
import { useStore } from '../state/store'
import { crossBorderCheck, crossBorderReportHtml, type CrossBorderResult, type RegimeVerdict } from '../engine/crossborder'
import { parseCatalogue, SAMPLE_CATALOGUE, SAMPLE_NAME } from '../lib/catalogue'
import { runCoPilot } from '../engine/copilot'
import { fmtMoney, fmtNum } from '../engine/engine'
import { openPrintReport } from '../lib/report'
import Icon, { type IconName } from '../components/Icon'

const OK = '#0E9F6E', BAD = '#E0484D', DRAFT = '#D98005'
const greeting = (): string => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening' }

const EXAMPLES: { icon: IconName; title: string; sub: string; report?: boolean }[] = [
  { icon: 'leaf', title: 'Check my EV lineup across every market', sub: 'EU · India · UK · Australia · China at once' },
  { icon: 'scale', title: 'Is this range road-legal in the EU and India?', sub: 'fleet vs each statutory line' },
  { icon: 'trending', title: 'Where is my fine exposure worst?', sub: 'rank the markets by risk' },
  { icon: 'section', title: 'Generate a cross-border compliance report', sub: 'board-ready, every figure sourced', report: true },
]

export default function CoPilot() {
  const { pack, raw, country } = useCompliance('actuals')
  const setScreen = useStore((s) => s.setScreen)
  const setParent = useStore((s) => s.setParent)

  const [text, setText] = useState('')
  const [crossBorder, setCrossBorder] = useState(true)
  const [result, setResult] = useState<CrossBorderResult | null>(null)
  const [catName, setCatName] = useState('')
  const [sel, setSel] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const findings = useMemo(() => runCoPilot(country).slice(0, 3), [country]) // eslint-disable-line react-hooks/exhaustive-deps

  const run = (srcText?: string, name?: string, andReport = false) => {
    const src = (srcText ?? text).trim()
    const parsed = parseCatalogue(src, { defaultBrand: 'Catalogue' })
    let vehicles = parsed.vehicles
    let label = name ?? (src ? 'Pasted catalogue' : '')
    if (!vehicles.length) {
      // No catalogue detected → fall back to the loaded market fleet, transparently.
      vehicles = raw
      label = `${pack.name} fleet · loaded`
      setNote(`No catalogue detected — checked your loaded ${pack.name} fleet (${raw.length} models).`)
    } else {
      setNote(parsed.note)
    }
    const res = crossBorderCheck(vehicles, crossBorder ? undefined : [country])
    setCatName(label)
    setResult(res)
    setSel(res.worst?.country ?? res.verdicts[0]?.country ?? null)
    if (andReport) setTimeout(() => report(res, label), 60)
  }

  const onFile = (f: File) => {
    const rd = new FileReader()
    rd.onload = () => { const t = String(rd.result ?? ''); setText(t); run(t, f.name.replace(/\.[^.]+$/, '')) }
    rd.readAsText(f)
  }

  const report = (res: CrossBorderResult, name: string) =>
    openPrintReport('AiRE · Cross-border compliance report', crossBorderReportHtml(res, name || 'Catalogue', new Date().toISOString().slice(0, 10)))

  const loadSample = (andReport = false) => { setText(SAMPLE_CATALOGUE); run(SAMPLE_CATALOGUE, SAMPLE_NAME, andReport) }
  const reset = () => { setResult(null); setText(''); setNote('') }

  return (
    <div className="mx-auto max-w-[1160px] pb-16 animate-slidein">
      <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />

      {!result ? (
        // ── CHAT LANDING ────────────────────────────────────────────────────
        <div className="flex flex-col items-center pt-8 sm:pt-14">
          <Orb />
          <div className="mt-6 text-center">
            <div className="text-[13px] font-semibold text-ink-400">{greeting()}.</div>
            <h1 className="font-display mt-1 text-[30px] font-extrabold leading-[1.1] tracking-[-0.03em] text-ink-100 sm:text-[36px]">
              What are we <span className="text-brand">clearing</span> today?
            </h1>
            <p className="mx-auto mt-3 max-w-[52ch] text-[13.5px] leading-relaxed text-ink-500">
              Drop in a product catalogue — AiRE checks it against every market's rules at once and shows exactly where it clears, where it doesn't, and what it would take. Every number is engine-proven.
            </p>
          </div>

          <PromptBox text={text} setText={setText} crossBorder={crossBorder} setCrossBorder={setCrossBorder}
            onAttach={() => fileRef.current?.click()} onSend={() => run()} onSample={() => loadSample()} className="mt-8 w-full max-w-[760px]" />

          <div className="mt-9 w-full max-w-[860px]">
            <div className="mb-3 text-[10.5px] font-bold uppercase tracking-[0.14em] text-ink-500">Get started with an example</div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {EXAMPLES.map((e) => (
                <button key={e.title} onClick={() => loadSample(e.report)}
                  className="group flex h-full flex-col rounded-2xl border border-black/[0.06] bg-white p-4 text-left shadow-[0_1px_2px_rgba(40,30,15,0.03)] transition hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-card">
                  <div className="text-[13px] font-semibold leading-snug text-ink-100">{e.title}</div>
                  <div className="mt-1 text-[11px] text-ink-500">{e.sub}</div>
                  <span className="mt-auto grid h-8 w-8 place-items-center rounded-lg bg-black/[0.03] text-ink-400 transition group-hover:bg-brand/10 group-hover:text-brand" style={{ marginTop: '16px' }}><Icon name={e.icon} size={15} /></span>
                </button>
              ))}
            </div>
          </div>

          {findings.length > 0 && (
            <div className="mt-9 w-full max-w-[860px]">
              <div className="mb-2 flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.14em] text-ink-500">
                <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400/60" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand-400" /></span>
                Live in {pack.name}
              </div>
              <div className="divide-y divide-black/[0.05] overflow-hidden rounded-2xl border border-black/[0.06] bg-white">
                {findings.map((f) => {
                  const hex = f.severity === 'critical' ? BAD : f.severity === 'high' ? DRAFT : '#3B6FE0'
                  return (
                    <button key={f.id} onClick={() => { if (f.maker) setParent(f.maker); setScreen(country === 'IN' ? 'intel' : 'forecast') }}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-black/[0.015]">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: hex }} />
                      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink-200">{f.headline}</span>
                      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide" style={{ color: hex }}>{f.category}</span>
                      <Icon name="chevron" size={13} className="shrink-0 text-ink-500" />
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        // ── RESULT ──────────────────────────────────────────────────────────
        <div className="space-y-5 pt-2">
          {/* compact chat bar with the answer context */}
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-black/[0.06] bg-white px-4 py-3 shadow-[0_1px_2px_rgba(40,30,15,0.03)]">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand"><Icon name="database" size={15} /></span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-bold text-ink-100">{catName}</div>
              <div className="truncate text-[11px] text-ink-500">{note} · {crossBorder ? 'all markets' : pack.name}</div>
            </div>
            <button onClick={() => report(result, catName)} className="btn-primary shrink-0 px-3.5 py-2 text-xs"><Icon name="section" size={14} /> Generate report</button>
            <button onClick={reset} className="shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-black/10 bg-white px-3.5 py-2 text-xs font-semibold text-ink-300 transition hover:border-black/20"><Icon name="reset" size={14} /> New check</button>
          </div>

          <VerdictBanner result={result} />

          {/* regime matrix */}
          <div>
            <div className="mb-2.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-500"><Icon name="scale" size={13} className="text-brand" /> Cross-border verdict · {result.verdicts.length} markets</div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {result.verdicts.map((v) => <RegimeCard key={v.country} v={v} active={v.country === sel} onClick={() => setSel(v.country)} />)}
            </div>
          </div>

          {sel && <RegimeDetail v={result.verdicts.find((x) => x.country === sel)!} />}
        </div>
      )}
    </div>
  )
}

// ── the AiRE orb ──────────────────────────────────────────────────────────────
function Orb() {
  return (
    <div className="relative h-[76px] w-[76px]">
      <div aria-hidden className="absolute -inset-6 rounded-full blur-2xl" style={{ background: 'radial-gradient(circle at 50% 42%, rgba(232,34,59,0.5), transparent 68%)' }} />
      <div className="relative h-[76px] w-[76px] rounded-full" style={{ background: 'radial-gradient(circle at 34% 28%, #FF7B81 0%, #E8223B 52%, #7A0E1C 100%)', boxShadow: 'inset -7px -9px 18px rgba(0,0,0,0.38), inset 5px 5px 12px rgba(255,255,255,0.28)' }} />
      <div aria-hidden className="absolute left-[28%] top-[20%] h-4 w-5 rounded-full bg-white/70 blur-[3px]" />
      <div aria-hidden className="absolute inset-0 rounded-full ring-1 ring-inset ring-white/10" />
    </div>
  )
}

// ── the prompt box (chat input) ─────────────────────────────────────────────
function PromptBox({ text, setText, crossBorder, setCrossBorder, onAttach, onSend, onSample, className = '' }: {
  text: string; setText: (v: string) => void; crossBorder: boolean; setCrossBorder: (b: boolean) => void
  onAttach: () => void; onSend: () => void; onSample: () => void; className?: string
}) {
  return (
    <div className={`rounded-[20px] border border-black/[0.08] bg-white p-2.5 shadow-[0_8px_30px_-14px_rgba(60,45,20,0.22)] transition focus-within:border-brand/40 focus-within:shadow-[0_10px_40px_-14px_rgba(232,34,59,0.28)] ${className}`}>
      <div className="flex items-start gap-2.5 px-2 pt-2">
        <Icon name="spark" size={16} className="mt-1 shrink-0 text-brand/80" />
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onSend() } }}
          placeholder="Paste a product catalogue — model, CO₂, mass, units — or ask a compliance question…"
          className="max-h-56 min-h-[64px] w-full resize-none bg-transparent text-[13.5px] leading-relaxed text-ink-100 outline-none placeholder:text-ink-500" />
      </div>
      <div className="mt-1 flex items-center gap-2 px-1">
        <button onClick={onAttach} className="inline-flex items-center gap-1.5 rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-ink-300 transition hover:border-black/20 hover:text-ink-100"><Icon name="upload" size={14} /> Attach</button>
        <button onClick={onSample} className="inline-flex items-center gap-1.5 rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-ink-300 transition hover:border-black/20 hover:text-ink-100"><Icon name="table" size={14} /> Sample</button>
        <button onClick={() => setCrossBorder(!crossBorder)} title="Check every market at once"
          className="ml-auto inline-flex items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-semibold text-ink-400 transition hover:text-ink-100">
          <span className={`relative h-4 w-7 rounded-full transition ${crossBorder ? 'bg-brand' : 'bg-ink-700'}`}><span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${crossBorder ? 'left-[14px]' : 'left-0.5'}`} /></span>
          Cross-border
        </button>
        <button onClick={onSend} aria-label="Run compliance check" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand text-white transition hover:bg-brand/90"><Icon name="arrow-up" size={16} /></button>
      </div>
    </div>
  )
}

// ── verdict banner ──────────────────────────────────────────────────────────
function VerdictBanner({ result }: { result: CrossBorderResult }) {
  const allClear = result.failCount === 0
  return (
    <div className="relative overflow-hidden rounded-[22px] border border-black/[0.06] px-7 py-7" style={{ background: 'linear-gradient(120deg, #1B1714 0%, #211A16 48%, #17130F 100%)' }}>
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full blur-3xl" style={{ background: `radial-gradient(circle, ${allClear ? 'rgba(14,159,110,0.28)' : 'rgba(232,34,59,0.3)'}, transparent 62%)` }} />
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.4]" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '26px 26px', maskImage: 'radial-gradient(120% 130% at 92% 0%, #000 30%, transparent 74%)', WebkitMaskImage: 'radial-gradient(120% 130% at 92% 0%, #000 30%, transparent 74%)' }} />
      <div className="relative flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45"><Icon name="shield" size={13} className="text-brand-400" /> Cross-border verdict</div>
          <h1 className="font-display mt-3 text-[34px] font-extrabold leading-[1.05] tracking-[-0.03em] text-white">
            <span style={{ color: allClear ? '#7FD8AC' : '#FF8A83' }}>{result.passCount}/{result.verdicts.length}</span> markets clear
          </h1>
          <p className="mt-2 text-[13.5px] font-medium text-white/55">
            {result.productN} products · {result.totalUnits ? `${new Intl.NumberFormat().format(result.totalUnits)} units · ` : ''}
            {allClear ? 'road-legal in every market checked' : <><span className="text-[#FF8A83]">{result.failCount} over the line</span>{result.worst ? ` · worst in ${result.worst.packName}` : ''}</>}
          </p>
        </div>
        <div className="flex gap-6">
          <Stat label="Markets over the line" value={`${result.failCount}/${result.verdicts.length}`} tone={result.failCount ? '#FF8A83' : '#7FD8AC'} sub={result.failCount ? 'each carries a fine' : 'no fine anywhere'} />
          {result.worst && <Stat label={`Worst · ${result.worst.packName}`} value={`${fmtMoney(result.worst.fine, result.worst.currency)}`} tone="#FF8A83" sub={`+${fmtNum(result.worst.gap, 1)} ${result.worst.metricUnit} over the line`} />}
          {result.best && <Stat label={`Cleanest · ${result.best.packName}`} value={`${fmtNum(result.best.headroom, 1)} ${result.best.metricUnit}`} tone="#7FD8AC" sub="headroom to spare" />}
        </div>
      </div>
    </div>
  )
}
function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: string }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-white/40">{label}</div>
      <div className="dnum mt-1.5 text-[22px] font-black leading-none tracking-[-0.02em]" style={{ color: tone }}>{value}</div>
      <div className="mt-1 text-[10.5px] text-white/40">{sub}</div>
    </div>
  )
}

// ── regime card ───────────────────────────────────────────────────────────────
function RegimeCard({ v, active, onClick }: { v: RegimeVerdict; active: boolean; onClick: () => void }) {
  const hex = v.compliant ? OK : BAD
  const scaleMax = Math.max(v.avgMetric, v.limit, 1) * 1.14
  const fleetPct = (v.avgMetric / scaleMax) * 100
  const limitPct = (v.limit / scaleMax) * 100
  return (
    <button onClick={onClick}
      className={`relative overflow-hidden rounded-2xl border p-4 text-left transition ${active ? 'border-transparent shadow-card ring-2' : 'border-black/[0.06] bg-white hover:border-black/[0.12]'}`}
      style={active ? { background: '#FFFDF9', boxShadow: `0 0 0 2px ${hex}` } : undefined}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="dnum rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide" style={{ background: `${hex}16`, color: hex }}>{v.flag}</span>
            <span className="truncate text-[13.5px] font-bold text-ink-100">{v.packName}</span>
          </div>
          <div className="mt-0.5 text-[10.5px] text-ink-500">{v.regimeName}{v.draft ? ' · draft' : ''} · {v.cycle} · FY{v.year}</div>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${hex}14`, color: hex }}>
          <Icon name={v.compliant ? 'check' : 'alert'} size={10} /> {v.compliant ? 'Clears' : 'Over'}
        </span>
      </div>

      {/* fleet vs line bar */}
      <div className="mt-3.5">
        <div className="relative h-2 rounded-full bg-black/[0.05]">
          <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, fleetPct)}%`, background: hex }} />
          <div className="absolute -top-1 h-4 w-[2px] rounded" style={{ left: `${Math.min(100, limitPct)}%`, background: '#1C1812' }} title="the line" />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[10.5px]">
          <span className="num text-ink-400">fleet <span className="font-bold text-ink-100">{fmtNum(v.avgMetric, 1)}</span></span>
          <span className="num text-ink-400">line {fmtNum(v.limit, 1)} {v.metricUnit}</span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-black/[0.05] pt-3 text-center">
        <Cell label="Gap" value={`${v.gap > 0 ? '+' : ''}${fmtNum(v.gap, 1)}`} tone={v.gap > 0 ? BAD : OK} />
        <Cell label="ZE now" value={`${Math.round(v.zeShare * 100)}%`} />
        <Cell label="Fine" value={v.fine > 0 ? fmtMoney(v.fine, v.currency) : '—'} tone={v.fine > 0 ? BAD : undefined} />
      </div>
    </button>
  )
}
function Cell({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className="text-[9px] font-semibold uppercase tracking-wide text-ink-500">{label}</div>
      <div className="dnum mt-0.5 text-[12.5px] font-bold" style={{ color: tone ?? '#211C16' }}>{value}</div>
    </div>
  )
}

// ── regime detail ───────────────────────────────────────────────────────────
function RegimeDetail({ v }: { v: RegimeVerdict }) {
  const hex = v.compliant ? OK : BAD
  return (
    <div className="rounded-[22px] border border-black/[0.06] bg-[#FFFDF9] p-6 shadow-[0_1px_2px_rgba(40,30,15,0.03),0_24px_48px_-32px_rgba(120,90,50,0.2)] screen-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: `${hex}16`, color: hex }}><Icon name={v.compliant ? 'check' : 'alert'} size={15} /></span>
          <div>
            <h2 className="font-display text-[18px] font-bold text-ink-100">{v.packName} · {v.regimeName}{v.draft ? ' (draft)' : ''}</h2>
            <div className="text-[11px] text-ink-500">{v.cycle} · compliance year FY{v.year} · {new Intl.NumberFormat().format(v.units)} units</div>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-bold" style={{ background: `${hex}14`, color: hex }}>
          {v.compliant ? `Clears with ${fmtNum(v.headroom, 1)} ${v.metricUnit} to spare` : `Over by ${fmtNum(v.gap, 1)} ${v.metricUnit}`}
        </span>
      </div>

      {/* what-it-would-take */}
      {!v.compliant && (
        <div className="mt-5 flex items-start gap-3 rounded-xl border border-brand/20 bg-brand/[0.04] px-4 py-3.5">
          <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand"><Icon name="bolt" size={13} /></span>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-brand">To clear the line</div>
            <p className="mt-1 text-[13px] font-medium leading-relaxed text-ink-200">
              {v.reqZe != null
                ? <>Lift the zero-emission share from <strong>{Math.round(v.zeShare * 100)}%</strong> to <strong>{v.reqZe}%</strong> — or offset with lighter models, credits or pooling. Exposure today: <strong>{fmtMoney(v.fine, v.currency)}</strong>.</>
                : <>Electrification alone can't clear this line at up to 95% ZE — it needs lighter models, eco/credit measures or pooling. Exposure today: <strong>{fmtMoney(v.fine, v.currency)}</strong>.</>}
            </p>
          </div>
        </div>
      )}

      {/* offenders */}
      {v.offenders.length > 0 ? (
        <div className="mt-5">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink-500">What's driving the exceedance</div>
          <div className="overflow-hidden rounded-xl border border-black/[0.06]">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[10px] uppercase tracking-wide text-ink-500" style={{ background: '#211C16' }}>
                <th className="px-4 py-2.5 text-white/45">Product</th><th className="px-4 py-2.5 text-white/45">Powertrain</th>
                <th className="px-4 py-2.5 text-right text-white/45">{v.metricLabel}</th><th className="px-4 py-2.5 text-right text-white/45">Line</th><th className="px-4 py-2.5 text-right text-white/45">Over</th>
              </tr></thead>
              <tbody>
                {v.offenders.map((o, i) => (
                  <tr key={i} className="border-t border-black/[0.04] odd:bg-black/[0.015]">
                    <td className="px-4 py-2.5 font-semibold text-ink-100">{o.model}</td>
                    <td className="px-4 py-2.5 text-ink-400">{o.powertrain}</td>
                    <td className="num px-4 py-2.5 text-right text-ink-200">{fmtNum(o.metric, 1)}</td>
                    <td className="num px-4 py-2.5 text-right text-ink-400">{fmtNum(o.limit, 1)}</td>
                    <td className="num px-4 py-2.5 text-right font-bold" style={{ color: BAD }}>+{fmtNum(o.over, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : v.compliant ? (
        <p className="mt-5 flex items-center gap-2 text-[13px] text-safe"><Icon name="check" size={15} /> Every product in the catalogue sits under the {v.packName} line.</p>
      ) : null}

      {/* fine math + provenance */}
      <div className="mt-5 rounded-xl bg-black/[0.02] px-4 py-3 font-mono text-[11px] leading-relaxed text-ink-500">{v.fineExpression}</div>
      <div className="mt-3 border-t border-black/[0.05] pt-3 font-mono text-[10px] leading-relaxed text-ink-500/70">
        computed · {v.packName} rule pack · measured on {v.cycle} · declared test figures, no cross-cycle conversion applied{v.draft ? ' · draft regime, subject to change' : ''} · re-runnable
      </div>
    </div>
  )
}
