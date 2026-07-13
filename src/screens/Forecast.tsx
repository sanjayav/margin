import { useDeferredValue, useMemo, useState } from 'react'
import { useCompliance } from '../lib/useCompliance'
import { useStore } from '../state/store'
import { parentsFor } from '../data/fleet'
import { fmtMoney, fmtNum } from '../engine/engine'
import {
  buildForecast, baselineScenario, materializeSpec, summariseForecast, MARKET_TARGET,
  type ForecastResult, type ForecastScenarioDef, type Ramp,
} from '../engine/forecast'
import type { Scenario } from '../engine/types'
import { streamForecast, colorHex, BASELINE_HEX, LIMIT_HEX, SCEN_COLORS, type AiBook } from '../lib/forecast'
import { CASES, caseDrivers, outlookRun, bridgeYear, breakEvenAdoption, mandateFloor, DRIVER_META, type CaseId, type OutlookConfig } from '../engine/outlook'
import { useDrivers, driverSetFor, weightsFor } from '../lib/drivers'
import OutlookPanel from '../components/OutlookPanel'
import MotionTheatre from '../components/MotionTheatre'
import { buildForecastPack, openPrintReport } from '../lib/report'
import { svgFanChart, svgWaterfall, svgSCurve } from '../lib/packcharts'
import { Section, StatusPill } from '../components/ui'
import TornadoChart, { type TornadoDriver } from '../components/TornadoChart'
import Icon, { type IconName } from '../components/Icon'

type ScenKind = 'baseline' | 'ai' | 'user' | 'live' | 'case'
type Levers = ForecastScenarioDef['levers']

interface StudioScenario {
  id: string
  name: string
  description?: string
  hex: string
  kind: ScenKind
  def: ForecastScenarioDef
  events?: { year: number; label: string }[]
  pinned: boolean
  /** For kind='case': which case of the matrix this line is. */
  caseId?: CaseId | 'mgmt'
}

const EMPTY_LEVERS: Levers = {
  evSharePct: null, salesMultiplier: null, massShiftKg: null, ecoBoostG: null,
  targetShiftPct: null, poolingEnabled: null, superCreditsEnabled: null, phevUF: null, creditPrice: null,
}
const USER_COLORS = [SCEN_COLORS.violet, SCEN_COLORS.teal, SCEN_COLORS.rose, SCEN_COLORS.amber, SCEN_COLORS.emerald]

const baselineStudio = (): StudioScenario => ({
  id: 'baseline', name: "Hold today's mix", description: 'The as-sold fleet against the tightening limit.',
  hex: BASELINE_HEX, kind: 'baseline', def: { id: 'baseline', name: 'baseline', description: '', levers: EMPTY_LEVERS }, pinned: true,
})

const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`

const CASE_HEX: Record<CaseId | 'mgmt', string> = { base: SCEN_COLORS.emerald, upside: SCEN_COLORS.teal, downside: SCEN_COLORS.rose, mgmt: SCEN_COLORS.violet }

export default function Forecast() {
  const { pack, raw, scenario: liveScenario, selectedParent, country, meta } = useCompliance()
  const setParent = useStore((s) => s.setParent)
  const subscribedModules = useStore((s) => s.subscribedModules)
  const liveOverrides = useStore((s) => s.makerOverrides)
  const savedScenarios = useStore((s) => s.savedScenarios)
  const parents = parentsFor(country)

  // ── the Assumption Book state (drivers, weights, management pick) ──
  const drvOverrides = useDrivers((s) => s.overrides)
  const drvWeights = useDrivers((s) => s.weights)
  const mgmtIds = useDrivers((s) => s.mgmtScenarioId)
  const setWeights = useDrivers((s) => s.setWeights)
  const setMgmtScenario = useDrivers((s) => s.setMgmtScenario)
  const driverSet = useMemo(() => driverSetFor(country, drvOverrides), [country, drvOverrides])
  const vintageYear = meta.lastRefreshed ? new Date(meta.lastRefreshed).getFullYear() : new Date().getFullYear()
  const mgmtScenario = savedScenarios.find((x) => x.id === (mgmtIds[country] ?? '') && x.country === country) ?? null
  const weights = weightsFor(country, drvWeights, !!mgmtScenario)

  const [targetSel, setTargetSel] = useState<string>(selectedParent)
  const isMarket = targetSel === MARKET_TARGET
  const parent = isMarket ? '' : (parents.includes(targetSel) ? targetSel : selectedParent)
  const target = isMarket ? MARKET_TARGET : parent

  const base = useMemo(() => baselineScenario(pack), [pack])

  // ── the case matrix as chart lines (Base / Upside / Downside / Management) ──
  const [casePinned, setCasePinned] = useState<Record<string, boolean>>({ 'case-base': true, 'case-upside': true, 'case-downside': true, 'case-mgmt': true })
  const caseScenarios = useMemo<StudioScenario[]>(() => {
    const mk = (id: CaseId | 'mgmt', name: string, blurb: string): StudioScenario => ({
      id: `case-${id}`, name, description: blurb, hex: CASE_HEX[id], kind: 'case', caseId: id,
      def: { id: `case-${id}`, name, description: '', levers: EMPTY_LEVERS }, pinned: casePinned[`case-${id}`] !== false,
    })
    const out = CASES.map((c) => mk(c.id, c.name, c.blurb))
    if (mgmtScenario) out.push(mk('mgmt', `Management · ${mgmtScenario.label}`, 'their plan on the house fundamentals'))
    return out
  }, [casePinned, mgmtScenario])

  // ── studio state ──
  const [scenarios, setScenarios] = useState<StudioScenario[]>([baselineStudio()])
  const [focusId, setFocusId] = useState('baseline')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const [brief, setBrief] = useState('')
  const [aiBook, setAiBook] = useState<AiBook | null>(null)
  const [bookApplied, setBookApplied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── planLive differs from as-sold? (offers the "add my live plan" chip) ──
  const liveDiffers = useMemo(() => {
    const s = liveScenario
    const moved = s.evSharePct != null || s.massShiftKg !== 0 || s.salesMultiplier !== 1 || s.ecoBoostG !== 0
      || s.poolingEnabled || !!s.mix || (s.extraVariants?.length ?? 0) > 0 || s.phevUF === false
      || s.creditPrice != null || (country === 'IN' ? s.superCreditsEnabled !== true : s.superCreditsEnabled)
    return moved || Object.values(liveOverrides).some((o) => o && Object.keys(o).length > 0)
  }, [liveScenario, liveOverrides, country])

  // ── compute every shown scenario through the shared engine (deferred for smoothness) ──
  const allScenarios = useMemo(() => [scenarios[0], ...caseScenarios, ...scenarios.slice(1)], [scenarios, caseScenarios])
  const defScenarios = useDeferredValue(allScenarios)
  const defFocus = useDeferredValue(focusId)
  const defLive = useDeferredValue(liveScenario)
  const defLiveOv = useDeferredValue(liveOverrides)
  const defDrivers = useDeferredValue(driverSet)
  const fcById = useMemo(() => {
    const m = new Map<string, ForecastResult>()
    for (const s of defScenarios) {
      if (!s.pinned && s.id !== defFocus) continue
      const glide = s.id === defFocus
      if (s.kind === 'case') {
        // outlook fundamentals: driver-built fleet per year + the adoption path.
        const cd = s.caseId === 'mgmt' ? defDrivers : caseDrivers(defDrivers, CASES.find((c) => c.id === s.caseId)!)
        const cfg: OutlookConfig = { raw, pack, drivers: cd, vintageYear }
        const run = outlookRun(cfg)
        const perYear: Record<number, Partial<Scenario>> = {}
        for (const y of pack.years) perYear[y] = { evSharePct: run.shareFor(y) }
        const planBase = s.caseId === 'mgmt' && mgmtScenario ? { ...base, ...mgmtScenario.scenario } : base
        if (s.caseId === 'mgmt' && mgmtScenario?.scenario.evSharePct != null) {
          for (const y of pack.years) perYear[y] = { evSharePct: mgmtScenario.scenario.evSharePct }
        }
        const overrides = s.caseId === 'mgmt' && mgmtScenario ? mgmtScenario.overrides : {}
        m.set(s.id, buildForecast({ raw, pack, target, baseline: base, plan: { base: planBase, perYear }, overrides, glide, bandN: 0, fleetForYear: run.fleetForYear }))
        continue
      }
      const bandN = s.id === defFocus && !isMarket ? 140 : 0
      const plan = s.kind === 'live' ? { base: defLive } : s.kind === 'baseline' ? base : materializeSpec(s.def, base, pack.years)
      const overrides = s.kind === 'live' ? defLiveOv : {}
      m.set(s.id, buildForecast({ raw, pack, target, baseline: base, plan, overrides, glide, bandN }))
    }
    return m
  }, [defScenarios, defFocus, isMarket, raw, pack, target, base, defLive, defLiveOv, defDrivers, vintageYear, mgmtScenario])

  const baseFc = fcById.get('baseline')!
  const focusScen = allScenarios.find((s) => s.id === focusId) ?? allScenarios[0]
  const focusFc = fcById.get(focusId) ?? baseFc
  const overlay = focusId !== 'baseline'
  const shown = allScenarios.filter((s) => (s.pinned || s.id === focusId) && fcById.has(s.id))

  // ── sensitivity: how much each lever swings the focused scenario's exposure ──
  // (the classic tornado — every value is engine-computed, one buildForecast per extreme)
  const sensitivity = useMemo<TornadoDriver[]>(() => {
    const years = pack.years
    const fy = years[years.length - 1]
    const isLive = focusScen.kind === 'live'
    const planBase = isLive ? liveScenario : base
    const seed = isLive || focusScen.kind === 'baseline' ? null : materializeSpec(focusScen.def, base, years).perYear
    type NumLever = 'evSharePct' | 'salesMultiplier' | 'massShiftKg' | 'ecoBoostG'
    const exposure = (key: NumLever, val: number) => {
      const perYear: Record<number, Partial<typeof liveScenario>> = {}
      for (const y of years) perYear[y] = { ...(seed?.[y] ?? {}), [key]: val }
      return buildForecast({ raw, pack, target, baseline: base, plan: { base: planBase, perYear }, overrides: isLive ? liveOverrides : {}, glide: false, bandN: 0 }).cumPlan
    }
    const d: TornadoDriver[] = [
      { label: 'Zero-emission share', a: { value: exposure('evSharePct', 20), note: '20% ZE' }, b: { value: exposure('evSharePct', 70), note: '70% ZE' } },
      { label: 'Sales volume', a: { value: exposure('salesMultiplier', 0.9), note: '−10% sales' }, b: { value: exposure('salesMultiplier', 1.15), note: '+15% sales' } },
    ]
    if (pack.massBasedLimit !== false) d.push({ label: `${pack.massLabel} shift`, a: { value: exposure('massShiftKg', -40), note: '−40 kg' }, b: { value: exposure('massShiftKg', 60), note: '+60 kg' } })
    if (pack.ecoCap) d.push({ label: 'Eco-innovation', a: { value: exposure('ecoBoostG', pack.ecoCap(fy)), note: 'full credits' }, b: { value: exposure('ecoBoostG', 0), note: 'no credits' } })
    return d
  }, [focusScen, raw, pack, target, base, liveScenario, liveOverrides])

  // ── actions ──
  const hasLive = scenarios.some((s) => s.kind === 'live')
  const focusAndPin = (id: string) => {
    setFocusId(id)
    if (id.startsWith('case-')) setCasePinned((p) => ({ ...p, [id]: true }))
    else setScenarios((p) => p.map((s) => (s.id === id ? { ...s, pinned: true } : s)))
  }
  const togglePin = (id: string) => {
    if (id.startsWith('case-')) setCasePinned((p) => ({ ...p, [id]: p[id] === false }))
    else setScenarios((p) => p.map((s) => (s.id === id ? { ...s, pinned: !s.pinned } : s)))
  }
  const remove = (id: string) => {
    setScenarios((p) => p.filter((s) => s.id !== id))
    if (focusId === id) setFocusId('baseline')
    if (editingId === id) setEditingId(null)
  }
  const addUser = () => {
    const n = scenarios.filter((s) => s.kind === 'user').length
    const id = uid('user')
    const s: StudioScenario = { id, name: `What-if ${n + 1}`, hex: USER_COLORS[n % USER_COLORS.length], kind: 'user', pinned: true, def: { id, name: `What-if ${n + 1}`, description: '', levers: { ...EMPTY_LEVERS, evSharePct: { from: 25, to: 50 } } } }
    setScenarios((p) => [...p, s]); setFocusId(id); setEditingId(id)
  }
  const addLive = () => {
    if (hasLive) { focusAndPin('live'); return }
    const s: StudioScenario = { id: 'live', name: 'My live plan', description: 'Your current assumptions from the workspace.', hex: SCEN_COLORS.orange, kind: 'live', pinned: true, def: { id: 'live', name: 'live', description: '', levers: EMPTY_LEVERS } }
    setScenarios((p) => [...p, s]); setFocusId('live')
  }
  const setLevers = (id: string, patch: Partial<Levers>) =>
    setScenarios((p) => p.map((s) => (s.id === id ? { ...s, def: { ...s.def, levers: { ...s.def.levers, ...patch } } } : s)))
  const rename = (id: string, name: string) =>
    setScenarios((p) => p.map((s) => (s.id === id ? { ...s, name, def: { ...s.def, name } } : s)))

  async function generate() {
    const q = prompt.trim()
    if (!q || generating) return
    setError(null); setBrief(''); setGenerating(true); setAiBook(null); setBookApplied(false)
    await streamForecast(q, { country, target, ownedModules: subscribedModules, drivers: driverSet }, {
      onBook: (b) => setAiBook(b),
      onScenarios: (list) => {
        const studio: StudioScenario[] = list.map((a, i) => ({
          id: a.id || uid('ai'), name: a.name, description: a.description, hex: colorHex(a.color), kind: 'ai',
          def: { id: a.id, name: a.name, description: a.description, levers: a.levers, events: a.events }, events: a.events, pinned: true,
        }))
        setScenarios((prev) => [...prev.filter((s) => s.kind !== 'ai'), ...studio])
        if (studio[0]) setFocusId(studio[0].id)
      },
      onBriefDelta: (t) => setBrief((b) => b + t),
      onError: (m) => setError(m),
      onDone: () => setGenerating(false),
    })
    setGenerating(false)
  }

  const STARTERS = isMarket
    ? ['Diesel banned by 2027 vs. an aggressive electrification push', 'A demand slump: sales fall 15% and BEV supply stays tight', 'What if the limit lands 10% tighter than drafted?']
    : [`Get ${parent.split(' ')[0]} under the line by 2030`, `${parent.split(' ')[0]} with a slow EV ramp vs. a fast one`, 'Heavier SUV-led mix vs. a lightweighting drive']

  // ── the board pack: every table in the deliverable is the one on screen ──
  const exportPack = () => {
    const cases = caseScenarios.map((s) => {
      const fc = fcById.get(s.id)
      const wKey = (s.caseId === 'mgmt' ? 'mgmt' : s.caseId) as 'base' | 'upside' | 'downside' | 'mgmt'
      return fc ? { name: s.name, blurb: s.description ?? '', weight: weights[wKey], cum: fc.cumPlan, breachYear: fc.years.find((y) => y.lGap > 0)?.year ?? null, lastGap: fc.last.lGap } : null
    }).filter((x): x is NonNullable<typeof x> => x != null)
    const expected = cases.reduce((a, c) => a + c.cum * c.weight, 0)
    const cfg = { raw, pack, drivers: driverSet, vintageYear }
    const run = outlookRun(cfg)
    const gov = useDrivers.getState().governance[country] ?? {}
    const finalYear = pack.years[pack.years.length - 1]
    const by = pack.years[Math.min(1, pack.years.length - 1)]
    // the deck's graphics — same engine numbers as the screen
    const packBridge = bridgeYear(cfg, by)
    const fanSeries = caseScenarios.map((s) => {
      const fc = fcById.get(s.id)
      return fc ? { name: s.name, hex: s.hex, values: fc.years.map((y) => y.lMetric) } : null
    }).filter((x): x is NonNullable<typeof x> => x != null)
    const baseFcPack = fcById.get('baseline')
    const charts = {
      fan: baseFcPack ? svgFanChart(pack.years, fanSeries, baseFcPack.years.map((y) => y.bLimit), pack.metricUnit, `Cases vs the statutory line · ${isMarket ? 'market' : parent.split(' ')[0]}`) : undefined,
      waterfall: packBridge ? svgWaterfall([
        { label: `${packBridge.year - 1} fine`, value: packBridge.from, kind: 'total' },
        ...packBridge.effects.map((e) => ({ label: e.label, value: e.delta, kind: 'delta' as const })),
        { label: `${packBridge.year} fine`, value: packBridge.to, kind: 'total' },
      ], pack.currency, `Fine bridge ${packBridge.year - 1} → ${packBridge.year} (base case, market)`) : undefined,
      sCurve: svgSCurve(pack.years, pack.years.map((y) => run.shareFor(y)), pack.years.map((y) => mandateFloor(pack, y)), `Zero-emission adoption path · seeded from ${run.baseYear} actuals`),
    }
    openPrintReport(`Autocred AI · Forecast board pack · ${pack.name}`, buildForecastPack({
      pack, meta, dateISO: new Date().toISOString().slice(0, 10),
      targetLabel: isMarket ? 'Whole market' : parent,
      horizon: [pack.years[0], finalYear], baseYear: run.baseYear,
      cases, expected,
      drivers: DRIVER_META.map((m) => ({ label: m.label, value: driverSet[m.key], unit: m.unit, status: gov[m.key]?.status ?? 'draft', rationale: m.rationale, source: m.source, owner: m.owner })),
      bridge: packBridge, breakEven: breakEvenAdoption(cfg, finalYear), finalYear, charts,
    }))
  }

  const applyAiBook = () => {
    if (!aiBook) return
    const setDriver = useDrivers.getState().setDriver
    for (const m of DRIVER_META) setDriver(country, m.key, aiBook.drivers[m.key])
    setWeights(country, aiBook.weights)
    setBookApplied(true)
  }

  return (
    <div className="space-y-5 animate-slidein">
      {/* target + prompt */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setTargetSel(MARKET_TARGET)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${isMarket ? 'bg-ink-100 text-white' : 'bg-black/5 text-ink-500 hover:text-ink-100'}`}>Whole market</button>
        {parents.map((p) => (
          <button key={p} onClick={() => { setTargetSel(p); setParent(p) }} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${!isMarket && parent === p ? 'bg-ink-100 text-white' : 'bg-black/5 text-ink-500 hover:text-ink-100'}`}>{p}</button>
        ))}
        <button onClick={exportPack} className="btn-ghost ml-auto px-3 py-1.5 text-xs"><Icon name="section" size={14} /> Board pack</button>
      </div>

      <Section
        title={<span className="flex items-center gap-2"><Icon name="spark" size={16} className="text-brand" /> Forecast studio</span>}
        right={<span className="text-[11px] text-ink-500">describe a future — the AI builds the scenarios, the engine computes them</span>}
      >
        <form onSubmit={(e) => { e.preventDefault(); generate() }} className="flex items-center gap-2 rounded-xl border border-black/10 bg-ink-850 px-3 py-2 focus-within:border-brand/40">
          <Icon name="spark" size={16} className="shrink-0 text-brand" />
          <input value={prompt} onChange={(e) => setPrompt(e.target.value)} disabled={generating}
            placeholder={`Forecast ${isMarket ? 'the market' : parent.split(' ')[0]} if…`}
            className="w-full bg-transparent text-sm text-ink-100 outline-none placeholder:text-ink-600" />
          <button type="submit" disabled={generating || !prompt.trim()}
            className="btn-primary shrink-0 px-3 py-1.5 text-xs disabled:opacity-40">
            {generating ? <><span className="inline-flex gap-0.5">{[0, 1, 2].map((d) => <span key={d} className="h-1 w-1 animate-pulse rounded-full bg-white" style={{ animationDelay: `${d * 150}ms` }} />)}</span> Building</> : <><Icon name="arrow-up" size={14} /> Generate</>}
          </button>
        </form>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {STARTERS.map((s) => (
            <button key={s} onClick={() => { setPrompt(s); }} disabled={generating}
              className="rounded-lg border border-black/[0.07] bg-white/50 px-2.5 py-1 text-[10.5px] font-medium text-ink-400 transition hover:border-brand/40 hover:text-brand disabled:opacity-40">{s}</button>
          ))}
        </div>
        {error && (
          <div className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
            {/ANTHROPIC_API_KEY/i.test(error) && <div className="mt-1 text-ink-500">Set <span className="font-mono">ANTHROPIC_API_KEY</span> on the server (locally: <span className="font-mono">.env</span> + restart). The scenario builder and charts still work — add scenarios by hand with ＋ New.</div>}
          </div>
        )}
      </Section>

      {/* the AI's recommended forecast MODEL — apply to the Assumption Book */}
      {aiBook && (
        <Section
          title={<span className="flex items-center gap-2"><Icon name="spark" size={15} className="text-brand" /> AI forecast model</span>}
          right={bookApplied
            ? <span className="flex items-center gap-1.5 rounded-full border border-safe/40 bg-safe/10 px-2.5 py-1 text-[10.5px] font-bold text-safe"><Icon name="check" size={11} /> Applied to the Assumption Book</span>
            : <button onClick={applyAiBook} className="btn-primary px-3 py-1.5 text-xs"><Icon name="check" size={13} /> Apply model</button>}>
          <p className="-mt-1 mb-3 text-[12px] leading-relaxed text-ink-300">{aiBook.narrative}</p>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {DRIVER_META.map((m) => {
              const cur = driverSet[m.key]
              const prop = aiBook.drivers[m.key]
              const changed = Math.abs(prop - cur) > m.step / 2
              return (
                <div key={m.key} className={`rounded-xl border p-2.5 ${changed ? 'border-brand/30 bg-brand/[0.04]' : 'border-black/[0.06] bg-black/[0.015]'}`}>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">{m.label}</div>
                  <div className="num mt-1 text-[15px] font-bold text-ink-100">{fmtNum(prop, 2)} <span className="text-[10px] font-medium text-ink-500">{m.unit}</span></div>
                  <div className={`num text-[10px] ${changed ? 'text-brand' : 'text-ink-500'}`}>{changed ? `book: ${fmtNum(cur, 2)} → proposed` : 'unchanged'}</div>
                </div>
              )
            })}
            <div className="rounded-xl border border-black/[0.06] bg-black/[0.015] p-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Case weights</div>
              <div className="num mt-1 text-[13px] font-bold text-ink-100">{Math.round(aiBook.weights.base * 100)} / {Math.round(aiBook.weights.upside * 100)} / {Math.round(aiBook.weights.downside * 100)}</div>
              <div className="text-[10px] text-ink-500">base / upside / downside</div>
            </div>
          </div>
        </Section>
      )}

      {/* scenario rail */}
      <div className="flex flex-wrap items-center gap-2">
        {allScenarios.map((s) => (
          <ScenarioChip key={s.id} s={s} focused={s.id === focusId} summary={fcById.has(s.id) ? summariseForecast(fcById.get(s.id)!) : null} currency={pack.currency}
            onFocus={() => focusAndPin(s.id)} onPin={() => togglePin(s.id)} onEdit={() => setEditingId(editingId === s.id ? null : s.id)} onRemove={() => remove(s.id)} />
        ))}
        <button onClick={addUser} className="flex items-center gap-1.5 rounded-lg border border-dashed border-black/20 px-3 py-2 text-xs font-semibold text-ink-500 transition hover:border-brand/40 hover:text-brand">
          <Icon name="sliders" size={13} /> New what-if
        </button>
        {liveDiffers && !hasLive && (
          <button onClick={addLive} className="flex items-center gap-1.5 rounded-lg border border-dashed border-brand/30 px-3 py-2 text-xs font-semibold text-brand transition hover:bg-brand/[0.06]">
            <Icon name="link" size={13} /> Add my live plan
          </button>
        )}
      </div>

      {/* lever editor for the focused, editable scenario */}
      {editingId && focusScen.id === editingId && (focusScen.kind === 'ai' || focusScen.kind === 'user') && (
        <LeverEditor s={focusScen} pack={pack} onName={(n) => rename(focusScen.id, n)} onLevers={(patch) => setLevers(focusScen.id, patch)} onClose={() => setEditingId(null)} />
      )}

      {/* impact header — the board-grade verdict for the focused scenario */}
      <ImpactHeader scen={focusScen} fc={focusFc} baseFc={baseFc} overlay={overlay} pack={pack} />

      {/* THE DECADE, ANIMATED — engine keyframes, interpolated */}
      <Section
        title={<span className="flex items-center gap-2"><Icon name="activity" size={16} className="text-brand" /> The decade, animated</span>}
        right={<span className="hidden text-[11px] text-ink-500 md:inline">a motion chart of the scenario engine — every keyframe computed, nothing invented</span>}>
        <MotionTheatre raw={raw} pack={pack} country={country} drivers={driverSet} vintageYear={vintageYear} />
      </Section>

      {/* hero: all pinned scenarios vs the tightening limit */}
      <Section title="Every scenario against the line" right={<StudioLegend shown={shown} focusId={focusId} />}>
        <StudioChart years={pack.years} baseFc={baseFc} shown={shown} fcById={fcById} focusFc={focusFc} pack={pack} />
      </Section>

      {/* compare matrix */}
      {shown.length > 1 && (
        <Section title="Compare">
          <CompareMatrix shown={shown} fcById={fcById} baseFc={baseFc} pack={pack} focusId={focusId} onFocus={focusAndPin} />
        </Section>
      )}

      {/* ── THE CASE MATRIX — Base / Upside / Downside / Management, weighted ── */}
      <Section
        title={<span className="flex items-center gap-2"><Icon name="scale" size={15} className="text-brand" /> Case matrix · {isMarket ? 'whole market' : parent.split(' ')[0]}</span>}
        right={
          <span className="flex items-center gap-2 text-[11px] text-ink-500">
            Management case:
            <select value={mgmtScenario?.id ?? ''} onChange={(e) => setMgmtScenario(country, e.target.value || null)}
              className="rounded-lg border border-black/10 bg-white px-2 py-1 text-[11px] font-semibold text-ink-100 outline-none">
              <option value="">— none —</option>
              {savedScenarios.filter((x) => x.country === country).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
          </span>
        }>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-black/[0.08] text-[10px] font-semibold uppercase tracking-wide text-ink-500">
                <th className="py-2 pr-3">Case</th>
                <th className="py-2 pr-3">Weight</th>
                <th className="py-2 pr-3 text-right">Cumulative fine</th>
                <th className="py-2 pr-3 text-right">First breach</th>
                <th className="py-2 pr-3 text-right">Final-year gap</th>
                <th className="py-2 text-right">Final ZE share</th>
              </tr>
            </thead>
            <tbody>
              {caseScenarios.map((s) => {
                const fc = fcById.get(s.id)
                if (!fc) return null
                const wKey = (s.caseId === 'mgmt' ? 'mgmt' : s.caseId) as 'base' | 'upside' | 'downside' | 'mgmt'
                const wRaw = drvWeights[country]?.[wKey] ?? (wKey === 'mgmt' ? 0.2 : CASES.find((c) => c.id === wKey)?.defaultWeight ?? 0.25)
                const breach = fc.years.find((y) => y.lGap > 0)
                const last = fc.last
                return (
                  <tr key={s.id} onClick={() => focusAndPin(s.id)} className={`cursor-pointer border-b border-black/[0.04] transition-colors ${focusId === s.id ? 'bg-brand/[0.05]' : 'hover:bg-black/[0.02]'}`}>
                    <td className="whitespace-nowrap py-2.5 pr-3"><span className="flex items-center gap-2 font-semibold text-ink-100"><i className="h-2.5 w-2.5 rounded-full" style={{ background: s.hex }} />{s.name}</span><span className="block pl-[18px] text-[10px] text-ink-500">{s.description}</span></td>
                    <td className="py-2.5 pr-3" onClick={(e) => e.stopPropagation()}>
                      <span className="flex items-center gap-1">
                        <input type="number" min={0} max={1} step={0.05} value={wRaw}
                          onChange={(e) => { const v = parseFloat(e.target.value); if (!Number.isNaN(v)) setWeights(country, { [wKey]: Math.max(0, Math.min(1, v)) }) }}
                          className="num w-14 rounded-md border border-black/10 bg-white px-1.5 py-0.5 text-right text-[11px] font-bold text-ink-100 outline-none" />
                        <span className="num text-[10px] text-ink-500">→ {(weights[wKey] * 100).toFixed(0)}%</span>
                      </span>
                    </td>
                    <td className={`num py-2.5 pr-3 text-right font-bold ${fc.cumPlan > 0 ? 'text-danger' : 'text-safe'}`}>{fmtMoney(fc.cumPlan, pack.currency)}</td>
                    <td className={`num py-2.5 pr-3 text-right font-semibold ${breach ? 'text-danger' : 'text-safe'}`}>{breach ? breach.year : 'clears'}</td>
                    <td className={`num py-2.5 pr-3 text-right ${last.lGap > 0 ? 'text-danger' : 'text-safe'}`}>{last.lGap > 0 ? '+' : ''}{fmtNum(last.lGap, 1)} {pack.metricUnit}</td>
                    <td className="num py-2.5 text-right text-ink-300">{s.caseId === 'mgmt' ? '—' : `${Math.round(caseDrivers(driverSet, CASES.find((c) => c.id === s.caseId)!).evShareHorizon)}%`}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-black/10">
                <td className="py-2.5 pr-3 font-bold text-ink-100">Probability-weighted expected</td>
                <td className="num py-2.5 pr-3 text-[10px] text-ink-500">Σ w = 100%</td>
                <td className="num py-2.5 pr-3 text-right text-[13px] font-black text-ink-100">
                  {fmtMoney(caseScenarios.reduce((a, s) => {
                    const fc = fcById.get(s.id); if (!fc) return a
                    const wKey = (s.caseId === 'mgmt' ? 'mgmt' : s.caseId) as 'base' | 'upside' | 'downside' | 'mgmt'
                    return a + fc.cumPlan * weights[wKey]
                  }, 0), pack.currency)}
                </td>
                <td colSpan={3} className="py-2.5 text-[10.5px] text-ink-500">expected cumulative exposure over {pack.years[0]}–{pack.years[pack.years.length - 1]}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Section>

      {/* ── THE ASSUMPTION BOOK + BRIDGE + SENSITIVITIES (market-level) ── */}
      <OutlookPanel raw={raw} pack={pack} country={country} vintageYear={vintageYear} />

      {/* sensitivity — what moves the exposure most */}
      <Section title="What moves the exposure"
        right={<span className="text-[11px] text-ink-500">{focusScen.name} · exposure at each lever's plausible extremes</span>}>
        <TornadoChart base={focusFc.cumPlan} drivers={sensitivity} currency={pack.currency} />
      </Section>

      {/* AI brief */}
      {(brief || generating) && (
        <Section title={<span className="flex items-center gap-2"><Icon name="feather" size={15} className="text-brand" /> Analyst brief</span>}
          right={<span className="text-[11px] text-ink-500">every figure engine-computed</span>}>
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-ink-200">
            {brief}
            {generating && <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-brand align-text-bottom" />}
            {!brief && generating && <span className="text-ink-500">Reading the computed trajectories…</span>}
          </div>
        </Section>
      )}

      {/* focused-scenario detail */}
      <div className="flex items-center gap-2 pt-1">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: focusScen.hex }} />
        <h2 className="font-display text-sm font-bold text-ink-100">{focusScen.name}</h2>
        <span className="text-xs text-ink-500">· detail</span>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Section title="Projected fine each year"><FineBars series={focusFc.years} overlay={overlay} pack={pack} /></Section>
        <Section title="Compliance glide path" right={<span className="text-[11px] text-ink-500">zero-emission share needed to clear the limit</span>}>
          <GlidePath series={focusFc.years} />
        </Section>
      </div>

      <Section title="Year by year">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-black/[0.03] text-left text-[11px] uppercase tracking-wider text-ink-500">
                <th className="px-4 py-2.5">Year</th>
                <th className="px-4 py-2.5">Phase</th>
                <th className="px-4 py-2.5 text-right">Limit</th>
                <th className="px-4 py-2.5 text-right">Baseline</th>
                {overlay && <th className="px-4 py-2.5 text-right" style={{ color: focusScen.hex }}>{focusScen.name}</th>}
                <th className="px-4 py-2.5 text-right">Gap</th>
                <th className="px-4 py-2.5 text-right">P(over)</th>
                <th className="px-4 py-2.5 text-right">ZE now → need</th>
                <th className="px-4 py-2.5 text-right">Fine</th>
                <th className="px-4 py-2.5 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {focusFc.years.map((s, i) => {
                const gap = overlay ? s.lGap : s.bGap
                const fine = overlay ? s.lFine : s.bFine
                const status = overlay ? s.lStatus : s.bStatus
                return (
                  <tr key={s.year} className={`border-t border-black/[0.04] ${focusFc.cliffs[i] === focusFc.maxDrop && focusFc.maxDrop > 0.08 ? 'bg-warn/[0.04]' : ''}`}>
                    <td className="px-4 py-2.5 num font-semibold text-ink-100">{s.year}</td>
                    <td className="px-4 py-2.5 text-xs text-ink-500">{s.note}{focusFc.cliffs[i] === focusFc.maxDrop && focusFc.maxDrop > 0.08 ? ' · step' : ''}</td>
                    <td className="px-4 py-2.5 text-right num text-ink-300">{fmtNum(s.bLimit, 1)}</td>
                    <td className="px-4 py-2.5 text-right num">{fmtNum(s.bMetric, 1)}</td>
                    {overlay && <td className="px-4 py-2.5 text-right num" style={{ color: focusScen.hex }}>{fmtNum(s.lMetric, 1)}</td>}
                    <td className={`px-4 py-2.5 text-right num font-semibold ${gap > 0 ? 'text-danger' : 'text-safe'}`}>{gap > 0 ? '+' : ''}{fmtNum(gap, 1)}</td>
                    <td className={`px-4 py-2.5 text-right num ${(focusFc.bands[i]?.probOver ?? 0) > 0.5 ? 'text-danger' : (focusFc.bands[i]?.probOver ?? 0) > 0.1 ? 'text-warn' : 'text-safe'}`}>{focusFc.bands.length ? `${Math.round((focusFc.bands[i]?.probOver ?? 0) * 100)}%` : '—'}</td>
                    <td className="px-4 py-2.5 text-right num text-ink-400">{s.bShare}%{s.req != null ? ` → ${s.req}%` : ''}</td>
                    <td className={`px-4 py-2.5 text-right num ${fine > 0 ? 'text-danger' : 'text-ink-500'}`}>{fmtMoney(fine, pack.currency)}</td>
                    <td className="px-4 py-2.5 text-right"><StatusPill status={status} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {focusFc.years.some((s) => s.req == null && s.bGap > 0) && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-warn"><Icon name="alert" size={13} /> In the dashed years, electrification alone can't clear the limit — you'll also need lighter models, eco-innovation credits or pooling.</p>
        )}
      </Section>
    </div>
  )
}

// ── scenario chip ─────────────────────────────────────────────────────────────
function ScenarioChip({ s, focused, summary, currency, onFocus, onPin, onEdit, onRemove }: {
  s: StudioScenario; focused: boolean; summary: ReturnType<typeof summariseForecast> | null; currency: string
  onFocus: () => void; onPin: () => void; onEdit: () => void; onRemove: () => void
}) {
  const editable = s.kind === 'ai' || s.kind === 'user'
  const removable = s.kind !== 'baseline' && s.kind !== 'case' // cases live in the matrix; unpin to hide
  const breach = summary?.firstBreachYear
  return (
    <div className={`group flex items-center gap-2 rounded-xl border px-2.5 py-1.5 transition ${focused ? 'border-black/20 bg-white shadow-card' : s.pinned ? 'border-black/[0.08] bg-white/60' : 'border-dashed border-black/15 bg-transparent opacity-70'}`}>
      <button onClick={onPin} title={s.pinned ? 'Unpin from chart' : 'Pin to chart'} className="shrink-0" disabled={s.kind === 'baseline'}>
        <span className="block h-3 w-3 rounded-full" style={{ background: s.pinned ? s.hex : 'transparent', border: `2px solid ${s.hex}` }} />
      </button>
      <button onClick={onFocus} className="min-w-0 text-left">
        <div className={`truncate text-xs font-bold ${focused ? 'text-ink-100' : 'text-ink-300'}`}>{s.name}</div>
        <div className="num text-[10px] text-ink-500">{summary ? (breach ? <span className="text-danger">breaches {breach}</span> : <span className="text-safe">clears</span>) : '—'}{summary && summary.cumExposure > 0 ? ` · ${fmtMoney(summary.cumExposure, currency)}` : ''}</div>
      </button>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
        {editable && <button onClick={onEdit} title="Edit levers" className="grid h-5 w-5 place-items-center rounded text-ink-500 hover:bg-black/5 hover:text-ink-100"><Icon name="sliders" size={12} /></button>}
        {removable && <button onClick={onRemove} title="Remove" className="grid h-5 w-5 place-items-center rounded text-ink-500 hover:bg-danger/10 hover:text-danger"><Icon name="close" size={12} /></button>}
      </div>
    </div>
  )
}

// ── lever editor (hand editing) ───────────────────────────────────────────────
function LeverEditor({ s, pack, onName, onLevers, onClose }: {
  s: StudioScenario; pack: any; onName: (n: string) => void; onLevers: (p: Partial<Levers>) => void; onClose: () => void
}) {
  const L = s.def.levers
  return (
    <Section title={<span className="flex items-center gap-2"><Icon name="sliders" size={15} className="text-brand" /> Edit levers</span>}
      right={<button onClick={onClose} className="text-ink-500 hover:text-ink-100"><Icon name="close" size={16} /></button>}>
      <div className="mb-4">
        <span className="label">Scenario name</span>
        <input value={s.name} onChange={(e) => onName(e.target.value)} className="mt-1 w-full max-w-xs rounded-lg border border-black/10 bg-ink-850 px-2.5 py-1.5 text-sm font-semibold text-ink-100 outline-none focus:border-brand/40" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <RampControl label="Zero-emission share" unit="%" min={0} max={95} step={1} defaultRamp={{ from: 25, to: 60 }} value={L.evSharePct as Ramp | null} onChange={(v) => onLevers({ evSharePct: v })} hint="force the ZE sales share; ramp it across the horizon" />
        <RampControl label="Sales volume" unit="×" min={0.5} max={1.6} step={0.05} defaultRamp={{ from: 1, to: 1.1 }} value={L.salesMultiplier as Ramp | null} onChange={(v) => onLevers({ salesMultiplier: v })} hint="scale registrations · 1 = as-sold" />
        {pack.massBasedLimit !== false && (
          <RampControl label={`${pack.massLabel} shift`} unit="kg" min={-150} max={150} step={5} defaultRamp={{ from: 0, to: 60 }} value={L.massShiftKg as Ramp | null} onChange={(v) => onLevers({ massShiftKg: v })} hint="moves fleet & the limit together" />
        )}
        {pack.ecoCap && (
          <RampControl label="Eco-innovation" unit="g" min={0} max={pack.ecoCap(pack.years[0])} step={0.5} defaultRamp={{ from: 2, to: 4 }} value={L.ecoBoostG as Ramp | null} onChange={(v) => onLevers({ ecoBoostG: v })} hint="certified off-cycle credits" />
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {pack.pooling.enabled && <MiniToggle label="Pooling" on={!!L.poolingEnabled} onChange={(b) => onLevers({ poolingEnabled: b })} />}
        {pack.id === 'IN' && <MiniToggle label="Super-credits" on={L.superCreditsEnabled !== false} onChange={(b) => onLevers({ superCreditsEnabled: b })} />}
        {pack.id === 'EU' && <MiniToggle label="PHEV utility factor" on={L.phevUF !== false} onChange={(b) => onLevers({ phevUF: b })} />}
      </div>
    </Section>
  )
}

function RampControl({ label, unit, min, max, step, defaultRamp, value, onChange, hint }: {
  label: string; unit: string; min: number; max: number; step: number; defaultRamp: { from: number; to: number }
  value: Ramp | null; onChange: (v: Ramp | null) => void; hint?: string
}) {
  const on = value != null
  const from = value == null ? defaultRamp.from : typeof value === 'number' ? value : value.from
  const to = value == null ? defaultRamp.to : typeof value === 'number' ? value : value.to
  const ramping = typeof value === 'object'
  const set = (f: number, t: number) => onChange(f === t ? f : { from: f, to: t })
  return (
    <div className={`rounded-xl border p-3 transition ${on ? 'border-brand/25 bg-brand/[0.03]' : 'border-black/[0.07] bg-white/40'}`}>
      <div className="flex items-center justify-between">
        <span className="label">{label}</span>
        <button onClick={() => onChange(on ? null : defaultRamp)} className={`rounded-md px-2 py-0.5 text-[10px] font-bold transition ${on ? 'bg-brand text-white' : 'bg-black/5 text-ink-500 hover:text-ink-100'}`}>{on ? 'On' : 'Off'}</button>
      </div>
      {on && (
        <div className="mt-2.5 space-y-2">
          <SliderRow label={ramping ? 'start' : 'value'} value={from} min={min} max={max} step={step} unit={unit} onChange={(v) => set(v, ramping ? to : v)} />
          {ramping && <SliderRow label="end" value={to} min={min} max={max} step={step} unit={unit} onChange={(v) => set(from, v)} />}
          <button onClick={() => (ramping ? onChange(from) : onChange({ from, to: Math.min(max, from + step * 4) }))} className="text-[10px] font-semibold text-brand hover:underline">{ramping ? 'make flat' : 'ramp over time'}</button>
        </div>
      )}
      {hint && !on && <div className="mt-1 text-[10px] text-ink-500">{hint}</div>}
    </div>
  )
}

function SliderRow({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void }) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className="flex items-center gap-2">
      <span className="w-9 shrink-0 text-[10px] text-ink-500">{label}</span>
      <input type="range" className="w-full flex-1" min={min} max={max} step={step} value={value} style={{ ['--fill' as string]: `${pct}%` }} onChange={(e) => onChange(parseFloat(e.target.value))} />
      <span className="num w-12 shrink-0 text-right text-xs font-bold text-ink-200">{step < 1 ? value.toFixed(2) : Math.round(value)}{unit}</span>
    </div>
  )
}

function MiniToggle({ label, on, onChange }: { label: string; on: boolean; onChange: (b: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)} className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${on ? 'border-brand/30 bg-brand/[0.06] text-brand' : 'border-black/10 bg-white/50 text-ink-400'}`}>
      <span className={`relative h-4 w-7 rounded-full transition ${on ? 'bg-brand' : 'bg-ink-700'}`}><span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${on ? 'left-[14px]' : 'left-0.5'}`} /></span>
      {label}
    </button>
  )
}

// ── studio chart (multi-series) ───────────────────────────────────────────────
function StudioLegend({ shown, focusId }: { shown: StudioScenario[]; focusId: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px] text-ink-500">
      <span className="flex items-center gap-1"><i className="inline-block h-2 w-4 rounded" style={{ background: LIMIT_HEX }} />limit</span>
      {shown.map((s) => (
        <span key={s.id} className={`flex items-center gap-1 ${s.id === focusId ? 'font-semibold text-ink-300' : ''}`}><i className="inline-block h-2 w-4 rounded" style={{ background: s.hex }} />{s.name}</span>
      ))}
    </div>
  )
}

function StudioChart({ years, baseFc, shown, fcById, focusFc, pack }: {
  years: number[]; baseFc: ForecastResult; shown: StudioScenario[]; fcById: Map<string, ForecastResult>; focusFc: ForecastResult; pack: any
}) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 880, H = 380, m = { l: 52, r: 132, t: 26, b: 40 }
  const iw = W - m.l - m.r, ih = H - m.t - m.b
  const n = years.length
  const limit = baseFc.years.map((y) => y.bLimit)
  const lines = shown.map((s) => ({ s, fc: fcById.get(s.id)!, values: fcById.get(s.id)!.years.map((y) => y.lMetric) }))
  const bands = focusFc.bands
  const vals = [...limit, ...lines.flatMap((l) => l.values), ...bands.map((b) => b.p90)]
  const yMax = Math.max(...vals, 1) * 1.15
  const sx = (i: number) => m.l + (n === 1 ? iw / 2 : (iw * i) / (n - 1))
  const sy = (v: number) => m.t + ih - (v / yMax) * ih
  const path = (arr: number[]) => arr.map((v, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join(' ')
  const cliffs = baseFc.cliffs
  const focusHex = shown.find((s) => fcById.get(s.id) === focusFc)?.hex ?? BASELINE_HEX
  const focusVals = focusFc.years.map((y) => y.lMetric)
  const breachIdx = focusFc.years.findIndex((y) => y.lGap > 0)

  // over-the-line wash for the FOCUSED scenario (the impact area)
  const overArea = `M${sx(0)},${sy(limit[0])} ` + years.map((_, i) => `L${sx(i).toFixed(1)},${sy(Math.max(focusVals[i], limit[i])).toFixed(1)}`).join(' ')
    + ' ' + years.map((_, i) => n - 1 - i).map((i) => `L${sx(i).toFixed(1)},${sy(limit[i]).toFixed(1)}`).join(' ') + ' Z'

  const ribbon = bands.length
    ? `M${sx(0)},${sy(bands[0].p90).toFixed(1)} ` + bands.map((b, i) => `L${sx(i).toFixed(1)},${sy(b.p90).toFixed(1)}`).join(' ')
      + ' ' + bands.map((_, i) => bands.length - 1 - i).map((i) => `L${sx(i).toFixed(1)},${sy(bands[i].p10).toFixed(1)}`).join(' ') + ' Z'
    : ''

  // direct end-labels with a simple vertical declutter (leader lines when nudged)
  const ends = lines.map((l) => ({ hex: l.s.hex, focus: l.fc === focusFc, val: l.values[n - 1], y0: sy(l.values[n - 1]), y: sy(l.values[n - 1]) }))
    .sort((a, b) => a.y0 - b.y0)
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 15) ends[i].y = ends[i - 1].y + 15

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" onMouseLeave={() => setHover(null)}>
      <defs>
        <linearGradient id="fc-over" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ff5d6c" stopOpacity="0.26" /><stop offset="100%" stopColor="#ff5d6c" stopOpacity="0.03" />
        </linearGradient>
      </defs>
      {Array.from({ length: 5 }, (_, i) => { const v = (yMax * i) / 4; const y = sy(v); return (<g key={i}><line x1={m.l} y1={y} x2={W - m.r} y2={y} stroke="#1C1812" strokeOpacity="0.05" /><text x={m.l - 6} y={y + 3} textAnchor="end" fontSize="10" fill="#8C8273" className="num">{fmtNum(v, 0)}</text></g>) })}

      {/* regulatory cliffs */}
      {years.map((_, i) => (cliffs[i] > 0.08 ? (
        <g key={`c${i}`}>
          <line x1={sx(i)} y1={m.t} x2={sx(i)} y2={m.t + ih} stroke="#ffb454" strokeOpacity="0.4" strokeDasharray="3 3" />
          {cliffs[i] === baseFc.maxDrop && (
            <g>
              <rect x={sx(i) - 34} y={m.t - 2} width="68" height="15" rx="7" fill="#fff3e0" />
              <text x={sx(i)} y={m.t + 8.5} textAnchor="middle" fontSize="9" fill="#c96a12" fontWeight="700">−{Math.round(cliffs[i] * 100)}% limit</text>
            </g>
          )}
        </g>
      ) : null))}

      {focusVals.some((v, i) => v > limit[i]) && <path d={overArea} fill="url(#fc-over)" />}
      {ribbon && <path d={ribbon} fill={focusHex} fillOpacity="0.1" />}

      {/* limit */}
      <path d={path(limit)} fill="none" stroke={LIMIT_HEX} strokeWidth="2.5" style={{ filter: 'drop-shadow(0 2px 5px rgba(224,161,0,.2))' }} />
      <text x={sx(0) + 4} y={sy(limit[0]) - 6} fontSize="9.5" fontWeight="700" fill="#b07d00">the line</text>

      {/* scenario lines */}
      {lines.map(({ s, fc, values }) => {
        const focus = fc === focusFc
        return <path key={s.id} d={path(values)} fill="none" stroke={s.hex} strokeWidth={focus ? 3 : 2} strokeOpacity={focus ? 1 : 0.65} strokeDasharray={s.kind === 'baseline' ? '' : focus ? '' : '5 3'} strokeLinecap="round" strokeLinejoin="round" />
      })}

      {/* first-breach callout on the focused line */}
      {breachIdx >= 0 && (
        <g>
          <circle cx={sx(breachIdx)} cy={sy(focusVals[breachIdx])} r="5" fill="#ff5d6c" stroke="#FBF7EF" strokeWidth="2" />
          <rect x={Math.min(sx(breachIdx) - 30, W - m.r - 66)} y={sy(focusVals[breachIdx]) - 26} width="62" height="16" rx="8" fill="#E0484D" />
          <text x={Math.min(sx(breachIdx) + 1, W - m.r - 35)} y={sy(focusVals[breachIdx]) - 15} textAnchor="middle" fontSize="9" fontWeight="700" fill="#fff">breach {years[breachIdx]}</text>
        </g>
      )}

      {/* direct end-labels (value at the end, identity via colour dot) */}
      {ends.map((e, k) => (
        <g key={k}>
          {Math.abs(e.y - e.y0) > 1 && <line x1={sx(n - 1)} y1={e.y0} x2={W - m.r + 6} y2={e.y} stroke={e.hex} strokeWidth="1" strokeOpacity="0.5" />}
          <circle cx={W - m.r + 8} cy={e.y} r="3" fill={e.hex} />
          <text x={W - m.r + 15} y={e.y + 3.5} fontSize={e.focus ? 11 : 10} fontWeight={e.focus ? 800 : 600} fill="#4A4438" className="num">{fmtNum(e.val, 1)}</text>
        </g>
      ))}

      {/* hover crosshair */}
      {years.map((yr, i) => (
        <g key={i} onMouseEnter={() => setHover(i)} style={{ cursor: 'pointer' }}>
          <rect x={sx(i) - 12} y={m.t} width="24" height={ih} fill="transparent" />
          {hover === i && <line x1={sx(i)} y1={m.t} x2={sx(i)} y2={m.t + ih} stroke="#1C1812" strokeOpacity="0.12" />}
          <circle cx={sx(i)} cy={sy(limit[i])} r="2.5" fill={LIMIT_HEX} />
          {lines.map(({ s, fc, values }) => {
            const focus = fc === focusFc
            if (!focus && hover !== i) return null
            return <circle key={s.id} cx={sx(i)} cy={sy(values[i])} r={hover === i && focus ? 6 : 4} fill={fc.years[i].lGap > 0 && focus ? '#ff5d6c' : s.hex} stroke="#FBF7EF" strokeWidth="2" />
          })}
          <text x={sx(i)} y={H - 16} textAnchor="middle" fontSize="10" fill="#8C8273" className="num">{yr}</text>
          {hover === i && (
            <g>
              <rect x={Math.min(sx(i) + 10, W - 200)} y={m.t + 6} width="188" height={22 + lines.length * 14} rx="7" fill="#FFFDF9" stroke="#DBD2BF" />
              <text x={Math.min(sx(i) + 20, W - 190)} y={m.t + 22} fontSize="10" fill="#8C8273">limit {fmtNum(limit[i], 1)} {pack.metricUnit}</text>
              {lines.map(({ s, fc, values }, k) => (
                <text key={s.id} x={Math.min(sx(i) + 20, W - 190)} y={m.t + 36 + k * 14} fontSize="10" fill={s.hex}>{s.name.slice(0, 16)} {fmtNum(values[i], 1)} · {fmtMoney(fc.years[i].lFine, pack.currency)}</text>
              ))}
            </g>
          )}
        </g>
      ))}
      <text x={m.l} y={13} fontSize="10" fill="#8C8273" className="uppercase tracking-wider">{pack.metricLabel} ({pack.metricUnit})</text>
    </svg>
  )
}

// ── compare matrix ────────────────────────────────────────────────────────────
function CompareMatrix({ shown, fcById, baseFc, pack, focusId, onFocus }: {
  shown: StudioScenario[]; fcById: Map<string, ForecastResult>; baseFc: ForecastResult; pack: any; focusId: string; onFocus: (id: string) => void
}) {
  const cols = shown.map((s) => ({ s, sum: summariseForecast(fcById.get(s.id)!) }))
  const cell = (key: string, v: string, cls = '') => <td key={key} className={`px-3 py-2.5 text-right num ${cls}`}>{v}</td>
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-ink-500">
            <th className="px-3 py-2">Metric</th>
            {cols.map(({ s }) => (
              <th key={s.id} className="px-3 py-2 text-right">
                <button onClick={() => onFocus(s.id)} className={`inline-flex items-center gap-1.5 ${s.id === focusId ? 'text-ink-100' : 'text-ink-400'} hover:text-ink-100`}>
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.hex }} /><span className="normal-case">{s.name}</span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-black/[0.05]">
            <td className="px-3 py-2.5 text-xs font-medium text-ink-400">First over the line</td>
            {cols.map(({ s, sum }) => cell(s.id, sum.firstBreachYear ? String(sum.firstBreachYear) : 'clears', sum.firstBreachYear ? 'text-danger font-semibold' : 'text-safe'))}
          </tr>
          <tr className="border-t border-black/[0.05]">
            <td className="px-3 py-2.5 text-xs font-medium text-ink-400">Cumulative exposure</td>
            {cols.map(({ s, sum }) => cell(s.id, fmtMoney(sum.cumExposure, pack.currency), sum.cumExposure > baseFc.cumBase + 1 ? 'text-danger' : sum.cumExposure < baseFc.cumBase - 1 ? 'text-safe' : ''))}
          </tr>
          <tr className="border-t border-black/[0.05]">
            <td className="px-3 py-2.5 text-xs font-medium text-ink-400">Peak annual fine</td>
            {cols.map(({ s, sum }) => cell(s.id, fmtMoney(sum.peakFine, pack.currency), sum.peakFine > 0 ? 'text-ink-200' : 'text-ink-500'))}
          </tr>
          <tr className="border-t border-black/[0.05]">
            <td className="px-3 py-2.5 text-xs font-medium text-ink-400">Final-year gap</td>
            {cols.map(({ s, sum }) => cell(s.id, `${sum.finalGap > 0 ? '+' : ''}${fmtNum(sum.finalGap, 1)}`, sum.finalGap > 0 ? 'text-danger font-semibold' : 'text-safe'))}
          </tr>
          <tr className="border-t border-black/[0.05]">
            <td className="px-3 py-2.5 text-xs font-medium text-ink-400">Final-year fleet</td>
            {cols.map(({ s, sum }) => cell(s.id, `${fmtNum(sum.finalMetric, 1)} ${pack.metricUnit}`))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// ── impact header (the board-grade verdict) ───────────────────────────────────
const TONE: Record<'safe' | 'warn' | 'danger', { text: string; bg: string; dot: string }> = {
  safe: { text: 'text-safe', bg: 'bg-safe/10 border-safe/30', dot: 'bg-safe' },
  warn: { text: 'text-warn', bg: 'bg-warn/10 border-warn/30', dot: 'bg-warn' },
  danger: { text: 'text-danger', bg: 'bg-danger/10 border-danger/30', dot: 'bg-danger' },
}
function verdictOf(fc: ForecastResult): { label: string; tone: 'safe' | 'warn' | 'danger' } {
  const r = fc.last.lLimit > 0 ? fc.last.lGap / fc.last.lLimit : 0
  if (fc.cumPlan <= 0 && r <= 0) return { label: 'On track', tone: 'safe' }
  if (r <= 0.05) return { label: 'Watch', tone: 'warn' }
  if (r <= 0.15) return { label: 'At risk', tone: 'danger' }
  return { label: 'Severe', tone: 'danger' }
}

function Sparkline({ values, hex, w = 128, h = 34 }: { values: number[]; hex: string; w?: number; h?: number }) {
  const max = Math.max(...values, 1)
  const n = values.length
  const x = (i: number) => (n <= 1 ? w / 2 : (w * i) / (n - 1))
  const y = (v: number) => h - 3 - (v / max) * (h - 6)
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const area = `M${x(0)},${h} ` + values.map((v, i) => `L${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ') + ` L${x(n - 1)},${h} Z`
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="shrink-0">
      <path d={area} fill={hex} fillOpacity="0.12" />
      <path d={line} fill="none" stroke={hex} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(n - 1)} cy={y(values[n - 1])} r="3" fill={hex} />
    </svg>
  )
}

function ImpactChip({ icon, label, value, sub, tone }: { icon: IconName; label: string; value: string; sub: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-black/[0.06] bg-white/55 p-3.5">
      <div className="label flex items-center gap-1.5"><Icon name={icon} size={12} className="text-brand" /> {label}</div>
      <div className={`dnum mt-1.5 text-[26px] font-black leading-none ${tone ?? 'text-ink-100'}`}>{value}</div>
      <div className="mt-1 text-[11px] leading-snug text-ink-500">{sub}</div>
    </div>
  )
}

function ImpactHeader({ scen, fc, baseFc, overlay, pack }: { scen: StudioScenario; fc: ForecastResult; baseFc: ForecastResult; overlay: boolean; pack: any }) {
  const v = verdictOf(fc)
  const tone = TONE[v.tone]
  const firstBreach = fc.years.find((y) => y.lGap > 0)
  const peakYear = fc.years.reduce((a, y) => (y.lFine > a.lFine ? y : a), fc.years[0])
  const req = fc.last.req
  const delta = fc.cumPlan - baseFc.cumBase
  return (
    <div className="card p-5">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="flex flex-col justify-between gap-3 lg:col-span-2">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: scen.hex }} />
            <span className="truncate text-xs font-semibold text-ink-400">{scen.name}</span>
            <span className={`ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${tone.bg} ${tone.text}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${tone.dot} ${v.tone === 'danger' ? 'animate-pulse' : ''}`} /> {v.label}
            </span>
          </div>
          <div>
            <div className="label">Cumulative exposure · {fc.first.year}–{fc.last.year}</div>
            <div className={`dnum mt-1 text-[44px] font-black leading-none ${fc.cumPlan > 0 ? 'text-ink-100' : 'text-safe'}`}>{fmtMoney(fc.cumPlan, pack.currency)}</div>
            <div className="mt-2 text-xs">
              {overlay
                ? Math.abs(delta) < 1
                  ? <span className="text-ink-500">same as baseline</span>
                  : delta < 0
                    ? <span className="font-semibold text-safe">▼ {fmtMoney(-delta, pack.currency)} vs. hold-today's-mix</span>
                    : <span className="font-semibold text-danger">▲ {fmtMoney(delta, pack.currency)} vs. hold-today's-mix</span>
                : <span className="text-ink-500">if today's mix holds through {fc.last.year}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 border-t border-black/[0.05] pt-3">
            <Sparkline values={fc.years.map((y) => y.lFine)} hex={scen.hex} />
            <span className="text-[10px] leading-tight text-ink-500">projected fine<br />by year</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:col-span-3">
          <ImpactChip icon="alert" label="First over the line" value={firstBreach ? String(firstBreach.year) : 'Clears'} sub={firstBreach ? `+${fmtNum(firstBreach.lGap, 1)} ${pack.metricUnit} that year` : 'compliant every year'} tone={firstBreach ? 'text-warn' : 'text-safe'} />
          <ImpactChip icon="trending" label="Peak annual fine" value={peakYear.lFine > 0 ? fmtMoney(peakYear.lFine, pack.currency) : '—'} sub={peakYear.lFine > 0 ? `worst single year · ${peakYear.year}` : 'no fine in any year'} tone={peakYear.lFine > 0 ? 'text-ink-100' : 'text-ink-400'} />
          <ImpactChip icon="bolt" label="Clear the line" value={req != null ? `${req}% ZE` : firstBreach ? 'EV alone can’t' : 'On track'} sub={req != null ? `zero-emission share needed by ${fc.last.year}` : firstBreach ? `needs mass, credits or pooling by ${fc.last.year}` : `compliant through ${fc.last.year}`} tone={req != null ? 'text-accent' : firstBreach ? 'text-warn' : 'text-safe'} />
          <ImpactChip icon="scale" label="The limit tightens" value={`−${baseFc.limitDropPct}%`} sub={`${fmtNum(baseFc.first.bLimit, 1)} → ${fmtNum(baseFc.last.bLimit, 1)} ${pack.metricUnit} by ${fc.last.year}`} tone="text-accent" />
        </div>
      </div>
    </div>
  )
}

// ── fine timeline (per focused scenario) ──────────────────────────────────────
function FineBars({ series, overlay, pack }: { series: ForecastResult['years']; overlay: boolean; pack: any }) {
  const max = Math.max(...series.flatMap((s) => [s.bFine, overlay ? s.lFine : 0]), 1)
  return (
    <div className="space-y-2.5">
      {series.map((s) => (
        <div key={s.year} className="flex items-center gap-3">
          <div className="w-10 shrink-0 num text-xs text-ink-400">{s.year}</div>
          <div className="relative flex-1">
            <div className="h-5 w-full overflow-hidden rounded bg-black/[0.03]"><div className="h-full rounded bg-gradient-to-r from-danger/70 to-danger transition-all duration-300" style={{ width: `${(s.bFine / max) * 100}%` }} /></div>
            {overlay && <div className="absolute inset-y-0 left-0 h-5"><div className="h-full rounded bg-safe/70 ring-1 ring-safe transition-all duration-300" style={{ width: `${(s.lFine / max) * 100}%` }} /></div>}
          </div>
          <div className={`w-20 shrink-0 text-right num text-xs ${(overlay ? s.lFine : s.bFine) > 0 ? 'text-danger' : 'text-ink-500'}`}>{fmtMoney(overlay ? s.lFine : s.bFine, pack.currency)}</div>
        </div>
      ))}
    </div>
  )
}

function GlidePath({ series }: { series: ForecastResult['years'] }) {
  return (
    <div className="space-y-2.5">
      {series.map((s) => {
        const req = s.req
        const infeasible = req == null && s.bGap > 0
        const reqW = req == null ? 100 : req
        const closed = req != null && s.bShare >= req
        return (
          <div key={s.year} className="flex items-center gap-3">
            <div className="w-10 shrink-0 num text-xs text-ink-400">{s.year}</div>
            <div className="relative h-5 flex-1 overflow-hidden rounded bg-black/[0.03]">
              <div className={`h-full rounded transition-all duration-300 ${infeasible ? 'bg-warn/40' : closed ? 'bg-safe/30' : 'bg-accent/30'}`} style={{ width: `${reqW}%` }} />
              <div className="absolute top-0 h-5 w-[2px] bg-white" style={{ left: `${s.bShare}%` }} title={`now ${s.bShare}%`} />
            </div>
            <div className="w-24 shrink-0 text-right text-xs num">
              {infeasible ? <span className="text-warn">EV not enough</span> : closed ? <span className="text-safe">{s.bShare}% ≥ {req}%</span> : <span className="text-accent">need {req}%</span>}
            </div>
          </div>
        )
      })}
      <div className="flex items-center gap-3 pt-1 text-[10px] text-ink-500">
        <span className="flex items-center gap-1"><i className="inline-block h-2 w-3 rounded bg-accent/40" />required share</span>
        <span className="flex items-center gap-1"><i className="inline-block h-3 w-[2px] bg-white" />where you are now</span>
      </div>
    </div>
  )
}
