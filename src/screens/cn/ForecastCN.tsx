// ───────────────────────────────────────────────────────────────────────────
// FORECAST · China fork — an AI-agentic DUAL-CREDIT forecast studio.
//
// Keeps the real AI-agent flow (streamForecast → /api/forecast: Claude turns
// prose into grounded scenario LEVERS, never outcomes), but the studio computes
// and charts the TWO-AXIS dual-credit trajectory (CAFC credits + NEV credits +
// the credit bill) year by year through the deterministic engine — so the AI
// narrates a future the engine can prove. All China rules & assumptions apply:
// the NEV ratio schedule (18→58%), Phase 5→6 CAFC tightening, per-vehicle NEV
// credit formulas, offsetting, and a stressable credit price.
// ───────────────────────────────────────────────────────────────────────────
import { useMemo, useRef, useState } from 'react'
import { useCompliance } from '../../lib/useCompliance'
import { useStore } from '../../state/store'
import { fmtInt, fmtNum, fmtMoney, buildTree } from '../../engine/engine'
import { baselineScenario, materializeSpec, scenarioForYear, type ForecastScenarioDef } from '../../engine/forecast'
import { buildDualCreditForecast, buildDualCredit, nevRatioFor, type DualCreditYear } from '../../engine/china/dualcredit'
import { CASES, caseDrivers, adoptionShare, outlookFleetForYear, DRIVER_META, type DriverSet } from '../../engine/outlook'
import type { Vehicle } from '../../engine/types'
import { useDrivers, driverSetFor } from '../../lib/drivers'
import { streamForecast, type AiScenario, type AiBook } from '../../lib/forecast'
import Icon from '../../components/Icon'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import { Separator } from '@/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

const C = { clear: '#0E9F6E', short: '#E0484D', brand: '#E8223B', base: '#3B6FE0' }
const STARTERS = [
  'BYD ramps to 100% NEV by 2028 and the market NEV share hits 70%',
  'The 2027 NEV mandate is pulled forward to 65% but adoption stalls',
  'Credit prices crash to ¥300 on oversupply',
  'A price squeeze pushes credits to ¥3,000 while combustion JVs lag',
]

interface StudioScenario { id: string; name: string; description: string; hex: string; kind: 'baseline' | 'ai' | 'case'; def: ForecastScenarioDef | null; caseId?: string }

export default function ForecastCN() {
  const { pack, raw, country, meta } = useCompliance('live')
  const subscribed = useStore((s) => s.subscribedModules)
  const drvOverrides = useDrivers((s) => s.overrides)
  const setDriver = useDrivers((s) => s.setDriver)
  const drivers = driverSetFor('CN', drvOverrides)

  const [prompt, setPrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const [aiScenarios, setAiScenarios] = useState<StudioScenario[]>([])
  const [brief, setBrief] = useState('')
  const [aiBook, setAiBook] = useState<AiBook | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showCases, setShowCases] = useState(true)
  const [priceOverride, setPriceOverride] = useState<number | null>(null)
  const [metricId, setMetricId] = useState('cafc')

  // Forecast horizon: real data years, extended out to 2030. Years beyond the
  // last year with actual rows are PROJECTED (the file stops at 2027) — see
  // fleetForYear below, which grows the last actual fleet by the driver book.
  const HORIZON_END = 2030
  const years = useMemo(() => {
    const ys = [...pack.years]
    while (ys[ys.length - 1] < HORIZON_END) ys.push(ys[ys.length - 1] + 1)
    return ys
  }, [pack.years])
  const base = useMemo(() => baselineScenario(pack), [pack])
  const price = priceOverride ?? pack.creditPrice ?? pack.fineRate
  const finalYear = years[years.length - 1]

  // The latest year that actually ships rows (2027 for the China file); beyond it
  // the studio projects. For actual years buildTree filters `raw` by year itself;
  // for projected years we grow the last-actual fleet via the shared outlook path.
  const lastActualYear = useMemo(() => {
    const withRows = pack.years.filter((y) => raw.some((v) => v.year === y && v.sales > 0))
    return withRows.length ? Math.max(...withRows) : years[0]
  }, [raw, pack.years, years])
  const projBaseRows = useMemo(() => raw.filter((v) => v.year === lastActualYear), [raw, lastActualYear])
  const fleetForYear = useMemo(() => (year: number): Vehicle[] =>
    year <= lastActualYear ? raw : outlookFleetForYear(projBaseRows, drivers, year - lastActualYear, year),
    [raw, projBaseRows, lastActualYear, drivers])

  // today's NEV (BEV+PHEV) share — anchors the case adoption ramps
  const s0 = useMemo(() => {
    const yr = years.find((y) => raw.some((v) => v.year === y && v.sales > 0)) ?? years[0]
    const rows = raw.filter((v) => v.year === yr)
    const tot = rows.reduce((a, v) => a + v.sales, 0)
    const nev = rows.filter((v) => v.co2 === 0 || /phev|plug|erev|bev|fcev|electric/i.test(v.powertrain + v.fuel)).reduce((a, v) => a + v.sales, 0)
    return tot > 0 ? (nev / tot) * 100 : 45
  }, [raw, years])

  const trajFor = (def: ForecastScenarioDef | null): DualCreditYear[] => {
    const spec = def ? materializeSpec({ ...def, id: 'x', name: '', description: '' }, base, years) : { base }
    const scenarioFor = (y: number) => ({ ...scenarioForYear(spec, y, years.indexOf(y), years), nevCreditPrice: priceOverride ?? undefined })
    return buildDualCreditForecast(raw, pack, years, scenarioFor, price, fleetForYear)
  }

  // baseline + AI scenarios + the three cases (adoption-driven, driver-grounded)
  const caseScenarios: StudioScenario[] = useMemo(() => CASES.map((c) => {
    const d: DriverSet = caseDrivers(drivers, c)
    const n = years.length
    const def: ForecastScenarioDef = {
      id: c.id, name: c.name, description: c.blurb, kind: 'user',
      levers: {
        evSharePct: { from: Math.round(adoptionShare(s0, d.evShareHorizon, 0, n)), to: Math.round(adoptionShare(s0, d.evShareHorizon, n - 1, n)) },
        salesMultiplier: { from: 1, to: +Math.pow(1 + d.marketGrowth / 100, n - 1).toFixed(3) },
      },
    }
    return { id: `case-${c.id}`, name: c.name, description: c.blurb, hex: c.id === 'base' ? C.base : c.id === 'upside' ? C.clear : C.short, kind: 'case', def, caseId: c.id }
  }), [drivers, s0, years])

  const shown: StudioScenario[] = [
    { id: 'baseline', name: 'House view', description: 'Statutory mandate on today’s fleet path', hex: '#8A8174', kind: 'baseline', def: null },
    ...aiScenarios,
    ...(showCases ? caseScenarios : []),
  ]
  const trajById = useMemo(() => new Map(shown.map((s) => [s.id, trajFor(s.def)])), [shown, raw, pack, price, priceOverride, years, fleetForYear])

  const baseTraj = trajById.get('baseline')!
  const summ = (t: DualCreditYear[]) => ({ peak: Math.max(...t.map((y) => y.cost), 0), cum: t.reduce((a, y) => a + y.cost, 0), last: t[t.length - 1] })
  const bs = summ(baseTraj)

  // ── FORECAST INTELLIGENCES — a board of specialised, engine-grounded reads ──
  const intel = useMemo(() => {
    const H = baseTraj[baseTraj.length - 1], Y0 = baseTraj[0], n = baseTraj.length
    const cagr = (a: number, b: number) => (a > 0 && n > 1 ? (Math.pow(b / a, 1 / (n - 1)) - 1) * 100 : 0)
    // risk band: adoption ±15pp around the book horizon
    const band = (shift: number) => buildDualCreditForecast(raw, pack, years, (y) => ({ ...scenarioForYear(materializeSpec({ id: 'b', name: '', description: '', levers: { evSharePct: { from: Math.round(s0), to: Math.min(95, Math.max(s0, drivers.evShareHorizon + shift)) } } }, base, years), y, years.indexOf(y), years), nevCreditPrice: priceOverride ?? undefined }), price, fleetForYear)
    const up = band(15), down = band(-15)
    // per-OEM at horizon (competitive view)
    const hFleet = fleetForYear(finalYear)
    const hSc = { ...base, year: finalYear, nevCreditPrice: priceOverride ?? undefined }
    const hDC = buildDualCredit(buildTree(hFleet, pack, hSc, {}), hSc, price)
    const sellers = hDC.oems.filter((o) => o.nevBalance > 0.5).length
    const buyers = hDC.oems.filter((o) => o.creditsToBuy > 0.5).length
    // electrification break-even: NEV share that zeroes the horizon bill
    let breakEven: number | null = null
    for (let sh = Math.round(s0); sh <= 95; sh += 5) {
      const sc = { ...base, year: finalYear, evSharePct: sh, nevCreditPrice: priceOverride ?? undefined }
      if (buildDualCredit(buildTree(hFleet, pack, sc, {}), sc, price).totals.cost <= 0.5) { breakEven = sh; break }
    }
    // credit-market: price sensitivity of the horizon bill
    const billAt = (pr: number) => { const sc = { ...base, year: finalYear, nevCreditPrice: pr }; return buildDualCredit(buildTree(hFleet, pack, sc, {}), sc, pr).totals.cost }
    return {
      batteryGWhH: H.batteryGWh, batteryCAGR: cagr(Y0.batteryGWh, H.batteryGWh), batterySpark: baseTraj.map((y) => y.batteryGWh),
      cumCost: bs.cum, peakYear: baseTraj.reduce((a, y) => (y.cost > a.cost ? y : a), baseTraj[0]).year, costSpark: baseTraj.map((y) => y.cost), makersOverH: H.makersOver, makers: H.makers,
      nevShareH: H.nevSharePct, shareSpark: baseTraj.map((y) => y.nevSharePct), sellers, buyers,
      gwhLo: down[down.length - 1].batteryGWh, gwhHi: up[up.length - 1].batteryGWh,
      creditsSpark: baseTraj.map((y) => y.creditsToBuy), creditsToBuyH: H.creditsToBuy,
      breakEven, billLo: billAt(400), billHi: billAt(2500),
    }
  }, [baseTraj, raw, pack, price, priceOverride, drivers, s0, years, finalYear, base, fleetForYear])

  // Uncertainty fan around the house view: the ±15pp-adoption trajectories, so the
  // chart can shade the confidence band for whichever lens is on screen.
  const bands = useMemo(() => {
    const run = (shift: number) => buildDualCreditForecast(raw, pack, years, (y) => ({ ...scenarioForYear(materializeSpec({ id: 'b', name: '', description: '', levers: { evSharePct: { from: Math.round(s0), to: Math.min(95, Math.max(s0, drivers.evShareHorizon + shift)) } } }, base, years), y, years.indexOf(y), years), nevCreditPrice: priceOverride ?? undefined }), price, fleetForYear)
    return { up: run(15), down: run(-15) }
  }, [raw, pack, years, s0, drivers, base, priceOverride, price, fleetForYear])

  // The many fundamentals this forecast can chart — dual-credit is only some of them.
  const cur = pack.currency
  const METRICS = [
    { id: 'cafc', label: 'Fleet fuel use', get: (y: DualCreditYear) => y.cafcActual, limit: (y: DualCreditYear) => y.cafcLimit, fmt: (v: number) => fmtNum(v, 1), unit: 'L/100km', signed: false, betterLow: true },
    { id: 'nevshare', label: 'NEV share', get: (y: DualCreditYear) => y.nevSharePct, fmt: (v: number) => `${Math.round(v)}%`, unit: '% of sales', signed: false, betterLow: false },
    { id: 'battery', label: 'Battery demand', get: (y: DualCreditYear) => y.batteryGWh, fmt: (v: number) => `${fmtNum(v, v < 10 ? 1 : 0)} GWh`, unit: 'GWh', signed: false, betterLow: false },
    { id: 'volume', label: 'Registrations', get: (y: DualCreditYear) => y.volume, fmt: (v: number) => fmtInt(v), unit: 'cars', signed: false, betterLow: false },
    { id: 'cafccredit', label: 'Fuel-economy credits', get: (y: DualCreditYear) => y.cafcCredit, fmt: (v: number) => `${v >= 0 ? '+' : '−'}${fmtInt(Math.abs(v))}`, unit: 'CAFC credits', signed: true, betterLow: false },
    { id: 'nevbalance', label: 'EV-volume credits', get: (y: DualCreditYear) => y.nevBalance, fmt: (v: number) => `${v >= 0 ? '+' : '−'}${fmtInt(Math.abs(v))}`, unit: 'NEV credits', signed: true, betterLow: false },
    { id: 'cost', label: 'Credit bill', get: (y: DualCreditYear) => y.cost, fmt: (v: number) => fmtMoney(v, cur), unit: cur, signed: false, betterLow: true },
  ] as const
  const metric = METRICS.find((m) => m.id === metricId) ?? METRICS[0]

  const generate = async (q = prompt) => {
    if (!q.trim() || generating) return
    setGenerating(true); setError(null); setBrief(''); setAiBook(null)
    try {
      await streamForecast(q, { country: 'CN', target: '__market__', ownedModules: subscribed, drivers }, {
        onScenarios: (list: AiScenario[]) => setAiScenarios(list.map((a) => ({
          id: a.id, name: a.name, description: a.description, hex: SCEN_HEX(a.color), kind: 'ai',
          def: { id: a.id, name: a.name, description: a.description, color: a.color, levers: a.levers, events: a.events },
        }))),
        onBook: (b) => setAiBook(b),
        onBriefDelta: (t) => setBrief((p) => p + t),
        onError: (m) => setError(m),
        onDone: () => setGenerating(false),
      })
    } catch (e: any) { setError(e?.message ?? 'Forecast failed') } finally { setGenerating(false) }
  }

  const applyBook = () => { if (aiBook) DRIVER_META.forEach((m) => setDriver('CN', m.key, (aiBook.drivers as any)[m.key])) }

  if (country !== 'CN') return null

  return (
    <div className="mx-auto max-w-[1120px] space-y-5 pb-12">
      {/* ── AI STUDIO · frontier cockpit ─────────────────────────────────── */}
      <div className="rise relative overflow-hidden rounded-[20px] border border-black/[0.06] p-7 xl:p-9" style={{ background: 'linear-gradient(120deg, #1B1714 0%, #211A16 46%, #17130F 100%)' }}>
        <div className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full blur-3xl" style={{ background: 'radial-gradient(circle, rgba(232,34,59,0.36), transparent 62%)' }} />
        <div className="pointer-events-none absolute -bottom-32 right-1/3 h-72 w-72 rounded-full blur-3xl" style={{ background: 'radial-gradient(circle, rgba(246,104,100,0.16), transparent 62%)' }} />
        <div className="pointer-events-none absolute inset-0 opacity-[0.45]" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '24px 24px', maskImage: 'radial-gradient(120% 130% at 88% 0%, #000 28%, transparent 74%)', WebkitMaskImage: 'radial-gradient(120% 130% at 88% 0%, #000 28%, transparent 74%)' }} />
        <div className="relative">
          <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-white/45">
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400/60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-brand-400" /></span>
            Forecast studio · 双积分 · {years[0]}–{finalYear}
          </div>
          <h1 className="font-display mt-4 max-w-[22ch] text-[32px] font-extrabold leading-[1.06] tracking-[-0.03em] text-white xl:text-[36px]">
            Describe a future — the AI forecasts every fundamental.
          </h1>
          <p className="mt-3.5 max-w-[64ch] text-[13.5px] leading-[1.65] text-white/55">
            AiRE turns your prose into grounded scenarios — adoption pace, market growth, combustion tech, the NEV mandate and credit price. The deterministic engine then projects fleet fuel use, EV share, battery demand and the full dual-credit position to {finalYear}. Every number is engine-proven.
          </p>
          <form onSubmit={(e) => { e.preventDefault(); generate() }} className="mt-6 flex gap-2.5">
            <div className="relative flex-1">
              <Icon name="spark" size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-400/80" />
              <input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g. the 2027 mandate is pulled forward but BEV supply is tight…"
                className="w-full rounded-xl border border-white/10 bg-white/[0.05] py-3 pl-10 pr-4 text-[13.5px] text-white outline-none backdrop-blur-sm transition placeholder:text-white/35 focus:border-brand-400/50 focus:bg-white/[0.07] focus:ring-2 focus:ring-brand-400/20" />
            </div>
            <Button type="submit" disabled={generating || !prompt.trim()} className="shrink-0 px-5">
              {generating ? <><span className="mr-1 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> Building…</> : <><Icon name="spark" size={14} /> Generate</>}
            </Button>
          </form>
          <div className="mt-3 flex flex-wrap gap-2">
            {STARTERS.map((s) => (
              <button key={s} onClick={() => { setPrompt(s); generate(s) }} disabled={generating}
                className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/55 transition hover:border-brand-400/40 hover:bg-white/[0.08] hover:text-white disabled:opacity-50">{s}</button>
            ))}
          </div>
          {error && <div className="mt-3 rounded-lg border border-danger/40 bg-danger/[0.12] px-3 py-2 text-[12px] text-[#FF9A93]">{error}</div>}
        </div>
      </div>

      {/* ── AI-PROPOSED ASSUMPTION MODEL ─────────────────────────────────── */}
      {aiBook && (
        <Card className="rise border-l-[3px] border-l-primary">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="min-w-[280px] flex-1">
              <div className="label mb-1">AI-proposed assumption model</div>
              <p className="text-[12.5px] leading-relaxed text-ink-300">{aiBook.narrative}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                {DRIVER_META.map((m) => (
                  <Badge key={m.key} variant="secondary">{m.label} {fmtNum((aiBook.drivers as any)[m.key], 1)}{m.unit === '%' ? '%' : ''}</Badge>
                ))}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={applyBook}><Icon name="check" size={13} /> Apply model</Button>
          </CardContent>
        </Card>
      )}

      {/* ── FORECAST INTELLIGENCE BOARD ──────────────────────────────────── */}
      <div className="rise [animation-delay:50ms]">
        <div className="mb-3 flex items-center gap-2 px-1">
          <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/50" /><span className="relative inline-flex h-2 w-2 rounded-full bg-primary" /></span>
          <h2 className="font-display text-[14px] font-bold tracking-[-0.01em] text-ink-100">Forecast intelligence</h2>
          <span className="text-[11px] text-muted-foreground">— six engine-grounded reads on the {years[0]}–{finalYear} horizon, house view</span>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <IntelCard delay={60} icon="bolt" tone={C.brand} title="Battery demand" value={`${fmtNum(intel.batteryGWhH, intel.batteryGWhH < 10 ? 1 : 0)} GWh`}
            spark={intel.batterySpark} sparkHex={C.brand}
            insight={<>≈{fmtNum(intel.batteryCAGR, 0)}%/yr CAGR — the mandate's cell-demand curve to {finalYear}.</>} />
          <IntelCard delay={90} icon="alert" tone={C.short} title="Regulatory pressure" value={`${intel.makersOverH}/${intel.makers}`} valueSub="makers short"
            spark={intel.costSpark} sparkHex={C.short}
            insight={<>{fmtMoney(intel.cumCost, cur)} cumulative bill · peaks {intel.peakYear}.</>} />
          <IntelCard delay={120} icon="scatter" tone={C.base} title="Competitive shift" value={`${Math.round(intel.nevShareH)}%`} valueSub="NEV share"
            spark={intel.shareSpark} sparkHex={C.base}
            insight={<><b className="text-safe">{intel.sellers}</b> sellers vs <b className="text-danger">{intel.buyers}</b> buyers at {finalYear}.</>} />
          <IntelCard delay={150} icon="activity" tone={C.short} title="Risk & confidence" value={`${fmtNum(intel.gwhLo, 0)}–${fmtNum(intel.gwhHi, 0)}`} valueSub="GWh range"
            spark={intel.batterySpark} sparkHex="#8b7ff0" band
            insight={<>Battery demand under ±15pp adoption at {finalYear}.</>} />
          <IntelCard delay={180} icon="card" tone={C.brand} title="Credit market" value={fmtInt(intel.creditsToBuyH)} valueSub="credits in demand"
            spark={intel.creditsSpark} sparkHex={C.brand}
            insight={<>Bill swings {fmtMoney(intel.billLo, cur)}→{fmtMoney(intel.billHi, cur)} on price (¥400–2.5k).</>} />
          <IntelCard delay={210} icon="target" tone={C.clear} title="Electrification break-even" value={intel.breakEven != null ? `${intel.breakEven}%` : '>95%'} valueSub="NEV share"
            spark={intel.shareSpark} sparkHex={C.clear}
            insight={intel.breakEven != null ? <>NEV share that zeroes the {finalYear} bill{intel.nevShareH >= intel.breakEven ? ' — the house view clears it.' : ' — above the house view.'}</> : <>No share clears the {finalYear} bill alone.</>} />
        </div>
      </div>

      {/* ── MULTI-FUNDAMENTAL TRAJECTORY CHART ───────────────────────────── */}
      <Card className="rise [animation-delay:120ms]">
        <CardContent className="p-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-[16px] font-bold tracking-[-0.02em] text-ink-100">{metric.label} · {years[0]}–{finalYear}</h2>
            <div className="flex flex-wrap items-center gap-3 text-[11px]">
              {shown.map((s) => <span key={s.id} className="inline-flex items-center gap-1.5 text-ink-400"><span className="h-2 w-4 rounded-full" style={{ background: s.hex }} />{s.name}</span>)}
            </div>
          </div>
          {/* the lens selector — the many fundamentals, not just dual-credit */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            {METRICS.map((m) => (
              <button key={m.id} onClick={() => setMetricId(m.id)}
                className={cn('rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition', metric.id === m.id ? 'border-primary/40 bg-primary/[0.08] text-primary' : 'border-input bg-muted/40 text-ink-400 hover:text-ink-100')}>
                {m.label}
              </button>
            ))}
          </div>
          <p className="mb-2 max-w-[70ch] text-[12px] leading-[1.6] text-ink-400">{metricBlurb(metric.id, cur)} Each line is a scenario; the engine recomputes it from the levers the AI set. {metric.id === 'cafc' && 'The gold line is the CAFC target — below it is compliant on fuel economy.'}</p>
          <TrajChart series={shown.map((s) => ({ name: s.name, hex: s.hex, traj: trajById.get(s.id)! }))} metric={metric} band={bands} lastActualYear={lastActualYear} cur={cur} />
        </CardContent>
      </Card>

      {/* ── AI BRIEF ─────────────────────────────────────────────────────── */}
      {(brief || generating) && (
        <Card className="rise [animation-delay:140ms]">
          <CardContent className="p-6">
            <div className="mb-3 flex items-center gap-2"><Icon name="spark" size={15} className="text-primary" /><h2 className="font-display text-[15px] font-bold tracking-[-0.01em] text-ink-100">Analyst brief</h2></div>
            <p className="whitespace-pre-wrap text-[13px] leading-[1.7] text-ink-300">{brief}{generating && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-primary/50 align-middle" />}</p>
          </CardContent>
        </Card>
      )}

      {/* ── SCENARIO / CASE TABLE ────────────────────────────────────────── */}
      <Card className="rise [animation-delay:160ms]">
        <CardContent className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-[16px] font-bold tracking-[-0.02em] text-ink-100">Scenarios & cases at {finalYear}</h2>
            <Button variant="outline" size="sm" onClick={() => setShowCases((v) => !v)}>{showCases ? 'Hide' : 'Show'} base/upside/downside</Button>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Scenario</TableHead>
                  <TableHead className="text-right">NEV ratio {finalYear}</TableHead>
                  <TableHead className="text-right">CAFC credit {finalYear}</TableHead>
                  <TableHead className="text-right">NEV balance {finalYear}</TableHead>
                  <TableHead className="text-right">Peak bill</TableHead>
                  <TableHead className="text-right">Cumulative</TableHead>
                  <TableHead className="text-right">Short {finalYear}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((s) => {
                  const t = trajById.get(s.id)!; const sm = summ(t); const l = sm.last
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-semibold text-ink-100"><span className="mr-2 inline-block h-2 w-2 rounded-full align-middle" style={{ background: s.hex }} />{s.name}<span className="ml-2 text-[11px] font-normal text-muted-foreground">{s.description}</span></TableCell>
                      <TableCell className="num text-right text-ink-300">{Math.round(l.ratio * 100)}%</TableCell>
                      <TableCell className={cn('num text-right font-semibold', l.cafcCredit >= 0 ? 'text-safe' : 'text-danger')}>{l.cafcCredit >= 0 ? '+' : '−'}{fmtInt(Math.abs(l.cafcCredit))}</TableCell>
                      <TableCell className={cn('num text-right font-semibold', l.nevBalance >= 0 ? 'text-safe' : 'text-danger')}>{l.nevBalance >= 0 ? '+' : '−'}{fmtInt(Math.abs(l.nevBalance))}</TableCell>
                      <TableCell className={cn('num text-right', sm.peak > 0 ? 'text-danger' : 'text-safe')}>{sm.peak > 0 ? fmtMoney(sm.peak, pack.currency) : '—'}</TableCell>
                      <TableCell className="num text-right text-ink-200">{fmtMoney(sm.cum, pack.currency)}</TableCell>
                      <TableCell className="num text-right text-ink-400">{l.makersOver}/{l.makers}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          <p className="mt-3 text-[10.5px] leading-relaxed text-muted-foreground">
            Each scenario re-runs the full dual-credit engine on the projected fleet under its levers. The house view follows the statutory NEV ratio ({Math.round(nevRatioFor(years[0], null) * 100)}→{Math.round(nevRatioFor(finalYear, null) * 100)}%); cases apply base/upside/downside adoption from the Assumption Book. Credit price {fmtMoney(price, pack.currency)}/credit.
          </p>
        </CardContent>
      </Card>

      {/* ── ASSUMPTION BOOK (compact) ────────────────────────────────────── */}
      <Card className="rise [animation-delay:200ms]">
        <CardContent className="p-6">
          <div className="mb-5 flex items-center gap-2"><Icon name="sliders" size={15} className="text-primary" /><h2 className="font-display text-[15px] font-bold tracking-[-0.01em] text-ink-100">Assumption book</h2><span className="text-[11px] text-muted-foreground">— the fundamentals every case is built on</span></div>
          <div className="grid gap-7 md:grid-cols-3">
            {DRIVER_META.map((m) => (
              <div key={m.key}>
                <div className="label mb-2.5">{m.label}</div>
                <Slider min={m.min} max={m.max} step={m.step} value={[drivers[m.key]]} onValueChange={([v]) => setDriver('CN', m.key, v)} />
                <div className="mt-2 flex items-center justify-between text-[11px]"><span className="num font-bold text-ink-100">{fmtNum(drivers[m.key], 1)} {m.unit}</span></div>
                <p className="mt-1.5 text-[10.5px] leading-snug text-muted-foreground">{m.rationale}</p>
              </div>
            ))}
            <div>
              <div className="label mb-2.5">Credit price (¥/credit)</div>
              <Slider min={0} max={5000} step={100} value={[price]} onValueChange={([v]) => setPriceOverride(v)} />
              <div className="mt-2 flex items-center justify-between text-[11px]"><span className="num font-bold text-ink-100">{fmtMoney(price, pack.currency)}</span>{priceOverride != null && <button onClick={() => setPriceOverride(null)} className="text-primary hover:underline">reset</button>}</div>
              <p className="mt-1.5 text-[10.5px] leading-snug text-muted-foreground">Volatile — sets the ¥ value of every credit position and the cost to clear a deficit.</p>
            </div>
          </div>
          <Separator className="my-5" />
          <div className="text-[10.5px] text-muted-foreground">Statutory NEV credit ratio: {years.map((y) => `${String(y).slice(2)}·${Math.round(nevRatioFor(y, null) * 100)}%`).join('   ')} — override per scenario via the AI. Source: {meta.source}.</div>
        </CardContent>
      </Card>
    </div>
  )
}

const SCEN_HEX = (c: string) => ({ emerald: '#0E9F6E', amber: '#D98005', violet: '#8b7ff0', sky: '#3B6FE0', rose: '#E0484D', teal: '#12b3a6', orange: '#E8223B' } as Record<string, string>)[c] ?? '#3B6FE0'

function Stat({ label, value, sub, accent }: { label: string; value: string; sub: string; accent: string }) {
  return (
    <div className="px-6 py-[18px]">
      <div className="label">{label}</div>
      <div className={cn('dnum mt-2 text-[23px] font-bold leading-none tracking-[-0.02em]', accent)}>{value}</div>
      <div className="mt-2 text-[10.5px] leading-snug text-muted-foreground">{sub}</div>
    </div>
  )
}

// ── one forecast-intelligence card ───────────────────────────────────────────
function IntelCard({ icon, tone, title, value, valueSub, spark, sparkHex, insight, band, delay }:
  { icon: string; tone: string; title: string; value: string; valueSub?: string; spark: number[]; sparkHex: string; insight: React.ReactNode; band?: boolean; delay: number }) {
  const id = title.replace(/\W/g, '')
  const trend = spark.length > 1 ? spark[spark.length - 1] - spark[0] : 0
  return (
    <Card className="rise card-lift group relative overflow-hidden" style={{ animationDelay: `${delay}ms` }}>
      {/* tonal wash + hover glow + gradient accent */}
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `linear-gradient(180deg, ${tone}0E, transparent 44%)` }} />
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100" style={{ background: `${tone}2B` }} />
      <span aria-hidden className="absolute inset-x-0 top-0 h-[2.5px]" style={{ background: `linear-gradient(90deg, ${tone}, ${tone}00 82%)` }} />
      <CardContent className="relative p-5 pb-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            <span className="grid h-6 w-6 place-items-center rounded-lg" style={{ background: `${tone}1A`, color: tone }}><Icon name={icon as any} size={12} /></span>{title}
          </div>
          <span className="grid h-5 w-5 place-items-center rounded-md opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{ background: `${tone}12`, color: tone }}>
            <Icon name={trend >= 0 ? 'arrow-up' : 'arrow-right'} size={11} />
          </span>
        </div>
        <div className="dnum mt-3.5 text-[27px] font-bold leading-none tracking-[-0.03em] text-ink-100">{value}{valueSub && <span className="ml-1.5 text-[12px] font-semibold text-muted-foreground">{valueSub}</span>}</div>
        <p className="mt-2.5 min-h-[32px] text-[11px] leading-[1.5] text-ink-400">{insight}</p>
      </CardContent>
      {/* full-bleed trend footer */}
      <Spark data={spark} hex={sparkHex} band={band} id={id} />
    </Card>
  )
}

function Spark({ data, hex, band, id }: { data: number[]; hex: string; band?: boolean; id: string }) {
  const W = 320, H = 46
  const lo = Math.min(...data), hi = Math.max(...data), span = hi - lo || 1
  const x = (i: number) => (i / Math.max(1, data.length - 1)) * W
  const y = (v: number) => H - 5 - ((v - lo) / span) * (H - 15)
  const d = data.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  const area = `${d} L ${W} ${H} L 0 ${H} Z`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" className="block" aria-hidden>
      <defs>
        <linearGradient id={`sp${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={hex} stopOpacity={band ? 0.34 : 0.22} /><stop offset="1" stopColor={hex} stopOpacity="0" /></linearGradient>
      </defs>
      <path d={area} fill={`url(#sp${id})`} />
      <path d={d} fill="none" stroke={hex} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function metricBlurb(id: string, cur: string): string {
  return ({
    cafc: 'Sales-weighted fleet fuel consumption against the mass-based CAFC target as the fleet electrifies and Phase 6 tightens.',
    nevshare: 'The NEV (BEV+PHEV) share of sales — the adoption fundamental that drives everything downstream.',
    volume: 'Total passenger-car registrations under each market-growth path.',
    battery: 'GWh of cells the projected NEV volume requires — the mandate translated into battery demand (the supply-side / CATL view).',
    cafccredit: 'The fuel-economy (CAFC) credit balance — positive when the fleet beats its target.',
    nevbalance: 'The EV-volume (NEV) credit balance — credits earned minus the mandate requirement.',
    cost: `Annual ${cur} to clear the market's residual credit deficit — the mandate outrunning electrification.`,
  } as Record<string, string>)[id] ?? ''
}

interface MetricCfg { id: string; label: string; get: (y: DualCreditYear) => number; limit?: (y: DualCreditYear) => number; fmt: (v: number) => string; unit: string; signed: boolean }

// ── multi-fundamental trajectory (SVG) ───────────────────────────────────────
// Advanced: a ±15pp-adoption uncertainty FAN around the house view, an
// actuals→projection boundary, the Phase-6 marker, a gradient-filled house line,
// and an interactive hover crosshair with a per-scenario tooltip.
function TrajChart({ series, metric, band, lastActualYear, cur }:
  { series: { name: string; hex: string; traj: DualCreditYear[] }[]; metric: MetricCfg; band?: { up: DualCreditYear[]; down: DualCreditYear[] }; lastActualYear: number; cur: string }) {
  const W = 900, H = 340, PL = 74, PR = 22, PT = 24, PB = 40
  const ref = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const years = series[0]?.traj.map((y) => y.year) ?? []
  const bandVals = band ? [...band.up, ...band.down].map((y) => metric.get(y)) : []
  const vals = series.flatMap((s) => s.traj.map((y) => metric.get(y)))
  const limitVals = metric.limit ? (series[0]?.traj ?? []).map((y) => metric.limit!(y)) : []
  const all = [...vals, ...bandVals, ...limitVals]
  const rawMin = Math.min(...all), rawMax = Math.max(...all), pad = (rawMax - rawMin) * 0.1 || 1
  const yMin = metric.signed ? rawMin - pad : Math.min(0, rawMin - pad * 0.4)
  const yMax = rawMax + pad
  const span = yMax - yMin || 1
  const x = (i: number) => PL + (i / Math.max(1, years.length - 1)) * (W - PL - PR)
  const y = (v: number) => PT + (1 - (v - yMin) / span) * (H - PT - PB)
  const path = (t: DualCreditYear[], get: (yr: DualCreditYear) => number) => t.map((yr, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(get(yr)).toFixed(1)}`).join(' ')
  const ticks = 4
  const house = series.find((s) => s.name === 'House view') ?? series[0]
  const bIdx = Math.max(0, years.indexOf(lastActualYear))
  const p6Idx = years.indexOf(2026)
  const bandArea = band ? `${band.up.map((yr, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(metric.get(yr)).toFixed(1)}`).join(' ')} ${[...band.down].reverse().map((yr, i) => `L ${x(band.down.length - 1 - i).toFixed(1)} ${y(metric.get(yr)).toFixed(1)}`).join(' ')} Z` : ''
  const houseHex = house?.hex ?? '#E8223B'

  const move = (e: React.MouseEvent) => {
    const r = ref.current?.getBoundingClientRect(); if (!r) return
    const vbX = (e.clientX - r.left) * W / r.width
    const i = Math.round(((vbX - PL) / (W - PL - PR)) * (years.length - 1))
    setHover(Math.max(0, Math.min(years.length - 1, i)))
  }
  // tooltip geometry
  const rows = hover != null ? series.map((s) => ({ name: s.name, hex: s.hex, v: metric.get(s.traj[hover]) })) : []
  const tipW = 150, tipH = 22 + rows.length * 15
  const tipX = hover != null ? (x(hover) > W - PR - tipW - 10 ? x(hover) - tipW - 10 : x(hover) + 10) : 0
  const tipY = Math.max(PT, Math.min(H - PB - tipH, PT + 4))

  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${metric.label} by scenario`} onMouseMove={move} onMouseLeave={() => setHover(null)} className="cursor-crosshair">
      <defs>
        <linearGradient id="houseFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={houseHex} stopOpacity="0.16" /><stop offset="1" stopColor={houseHex} stopOpacity="0" /></linearGradient>
      </defs>
      {/* projection region tint */}
      {bIdx < years.length - 1 && <rect x={x(bIdx)} y={PT} width={W - PR - x(bIdx)} height={H - PT - PB} fill="currentColor" className="text-ink-500/[0.04]" />}
      {/* gridlines + y ticks */}
      {Array.from({ length: ticks + 1 }, (_, k) => {
        const v = yMin + (span / ticks) * k
        return (
          <g key={k}>
            <line x1={PL} y1={y(v)} x2={W - PR} y2={y(v)} stroke="currentColor" className="text-ink-500/[0.1]" strokeWidth={1} />
            <text x={PL - 8} y={y(v) + 3} textAnchor="end" className="fill-current text-muted-foreground text-[9.5px]">{metric.fmt(v)}</text>
          </g>
        )
      })}
      {metric.signed && <line x1={PL} y1={y(0)} x2={W - PR} y2={y(0)} stroke="currentColor" className="text-ink-500/40" strokeWidth={1} />}
      {/* Phase-6 marker */}
      {p6Idx > 0 && (
        <g>
          <line x1={x(p6Idx)} y1={PT} x2={x(p6Idx)} y2={H - PB} stroke="currentColor" className="text-ink-500/25" strokeWidth={1} strokeDasharray="2 3" />
          <text x={x(p6Idx) + 4} y={PT + 10} className="fill-current text-muted-foreground text-[8.5px] font-semibold uppercase tracking-wide">Phase 6</text>
        </g>
      )}
      {/* actuals → projection boundary */}
      {bIdx < years.length - 1 && (
        <g>
          <line x1={x(bIdx)} y1={PT} x2={x(bIdx)} y2={H - PB} stroke={houseHex} strokeWidth={1} strokeDasharray="4 4" opacity={0.5} />
          <text x={x(bIdx) + 4} y={H - PB - 5} className="text-[8.5px] font-semibold uppercase tracking-wide" fill={houseHex} opacity={0.7}>projected →</text>
        </g>
      )}
      {/* uncertainty fan */}
      {band && <path d={bandArea} fill={houseHex} opacity={0.08} />}
      {/* x labels */}
      {years.map((yr, i) => <text key={yr} x={x(i)} y={H - 14} textAnchor="middle" className={cn('fill-current text-[9.5px]', hover === i ? 'text-ink-100 font-bold' : 'text-muted-foreground')}>{`'${String(yr).slice(2)}`}</text>)}
      {/* target line */}
      {metric.limit && series[0] && (
        <>
          <path d={path(series[0].traj, metric.limit)} fill="none" stroke="#E0A100" strokeWidth={2} strokeDasharray="5 4" opacity={0.9} />
          <text x={W - PR - 2} y={y(metric.limit(series[0].traj[series[0].traj.length - 1])) - 6} textAnchor="end" className="text-[9.5px] font-bold" fill="#E0A100">target</text>
        </>
      )}
      {/* house-view area fill */}
      {house && <path d={`${path(house.traj, metric.get)} L ${x(years.length - 1)} ${y(yMin)} L ${x(0)} ${y(yMin)} Z`} fill="url(#houseFill)" />}
      {/* scenario lines */}
      {series.map((s) => {
        const isHouse = s.name === 'House view'
        return (
          <g key={s.name}>
            <path d={path(s.traj, metric.get)} fill="none" stroke={s.hex} strokeWidth={isHouse ? 2.75 : 1.75} strokeLinejoin="round" strokeLinecap="round" opacity={isHouse ? 1 : 0.9} className="lc-draw" />
            <circle cx={x(s.traj.length - 1)} cy={y(metric.get(s.traj[s.traj.length - 1]))} r={isHouse ? 3.2 : 2.4} fill={s.hex} />
          </g>
        )
      })}
      {/* hover crosshair + tooltip */}
      {hover != null && (
        <g pointerEvents="none">
          <line x1={x(hover)} y1={PT} x2={x(hover)} y2={H - PB} stroke="currentColor" className="text-ink-500/35" strokeWidth={1} />
          {series.map((s) => <circle key={s.name} cx={x(hover)} cy={y(metric.get(s.traj[hover]))} r={3.4} fill="#fff" stroke={s.hex} strokeWidth={2} />)}
          <g transform={`translate(${tipX}, ${tipY})`}>
            <rect width={tipW} height={tipH} rx={8} fill="#17130F" opacity={0.96} />
            <text x={10} y={15} className="text-[10px] font-bold" fill="#fff">{years[hover]}{years[hover] > lastActualYear ? ' · projected' : ''}</text>
            {rows.map((r, k) => (
              <g key={r.name} transform={`translate(10, ${24 + k * 15})`}>
                <circle cx={3} cy={3} r={3} fill={r.hex} />
                <text x={11} y={6} className="text-[9.5px]" fill="rgba(255,255,255,0.65)">{r.name.length > 12 ? r.name.slice(0, 11) + '…' : r.name}</text>
                <text x={tipW - 20} y={6} textAnchor="end" className="text-[9.5px] font-semibold" fill="#fff">{metric.fmt(r.v)}</text>
              </g>
            ))}
          </g>
        </g>
      )}
    </svg>
  )
}
