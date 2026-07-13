// ───────────────────────────────────────────────────────────────────────────
// MOTION THEATRE — the decade, animated. A Gapminder-class motion chart of the
// scenario engine: every manufacturer is a bubble (x = mass, y = fleet metric,
// size = volume) drifting year-to-year along the OUTLOOK's synthetic fleets
// while the statutory limit line tightens beneath it. Makers flip red→green
// live; the market fine and ZE share tick with the interpolation.
//
// Honesty first: every keyframe is an engine aggregate (buildTree on the
// outlook fleet for that year) — the animation interpolates BETWEEN computed
// truths, it never invents a number. Respects prefers-reduced-motion (snaps
// between years instead of tweening).
//
// Controls: ▶︎/⏸ (Space) · scrub · ←/→ step years · speed ×0.5/1/2.
// ───────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CountryId, RulePack, Scenario, Vehicle } from '../engine/types'
import { buildTree, fmtInt, fmtMoney, fmtNum } from '../engine/engine'
import { baselineScenario } from '../engine/forecast'
import { CASES, caseDrivers, outlookRun, type DriverSet, type OutlookConfig } from '../engine/outlook'
import Icon from './Icon'

interface MakerFrame { mass: number; metric: number; units: number; limit: number; fine: number }
interface YearFrame { year: number; makers: Map<string, MakerFrame>; marketFine: number; zeShare: number; avgMetric: number; avgLimit: number }

type TheatreCase = 'hold' | 'base' | 'upside' | 'downside'
const CASE_META: { id: TheatreCase; name: string; hex: string }[] = [
  { id: 'hold', name: "Hold today's mix", hex: '#5b8def' },
  { id: 'base', name: 'Base case', hex: '#0E9F6E' },
  { id: 'upside', name: 'Upside', hex: '#12b3a6' },
  { id: 'downside', name: 'Downside', hex: '#E0484D' },
]

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export default function MotionTheatre({ raw, pack, country, drivers, vintageYear }: {
  raw: Vehicle[]; pack: RulePack; country: CountryId; drivers: DriverSet; vintageYear: number
}) {
  const years = pack.years
  const [caseSel, setCaseSel] = useState<TheatreCase>('base')
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  // continuous position along the horizon: 0 … years.length-1
  const [pos, setPos] = useState(0)
  const posRef = useRef(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const trailsRef = useRef<Map<string, { x: number; y: number }[]>>(new Map())
  const reduced = useMemo(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches, [])

  // ── keyframes: one ENGINE aggregate per case-year ──────────────────────────
  const frames = useMemo<YearFrame[]>(() => {
    const base = baselineScenario(pack)
    let fleetFor: (y: number) => Vehicle[]
    let scFor: (y: number) => Scenario
    if (caseSel === 'hold') {
      fleetFor = () => raw
      scFor = (y) => ({ ...base, year: y })
    } else {
      const d = caseSel === 'base' ? drivers : caseDrivers(drivers, CASES.find((c) => c.id === caseSel)!)
      const cfg: OutlookConfig = { raw, pack, drivers: d, vintageYear }
      const run = outlookRun(cfg)
      fleetFor = run.fleetForYear
      scFor = run.scenarioFor
    }
    return years.map((y) => {
      const t = buildTree(fleetFor(y), pack, scFor(y), {})
      const makers = new Map<string, MakerFrame>()
      for (const c of t.children ?? []) {
        if (c.rawUnits <= 0 || c.avgMass <= 0) continue
        makers.set(c.label, { mass: c.avgMass, metric: c.avgMetric, units: c.rawUnits, limit: c.limit, fine: c.fine })
      }
      const marketFine = (t.children ?? []).reduce((a, c) => a + c.fine, 0)
      return { year: y, makers, marketFine, zeShare: t.zlevShare * 100, avgMetric: t.avgMetric, avgLimit: t.limit }
    })
  }, [raw, pack, drivers, vintageYear, caseSel, years])

  // stable scales across the WHOLE run so motion is comparable year to year
  const scales = useMemo(() => {
    const ms: number[] = [], vs: number[] = []
    for (const f of frames) for (const m of f.makers.values()) { ms.push(m.mass); vs.push(m.metric, m.limit) }
    const mLo = Math.min(...ms), mHi = Math.max(...ms)
    const vLo = Math.min(...vs, 0), vHi = Math.max(...vs)
    const uMax = Math.max(...frames.flatMap((f) => [...f.makers.values()].map((m) => m.units)), 1)
    return { mLo: mLo - (mHi - mLo) * 0.08, mHi: mHi + (mHi - mLo) * 0.08, vLo, vHi: vHi + (vHi - vLo) * 0.1, uMax }
  }, [frames])

  // the frame (or interpolated blend) at a continuous position
  const frameAt = (p: number) => {
    const i = Math.max(0, Math.min(years.length - 1, p))
    const k = Math.floor(i)
    const f = Math.min(1, i - k)
    const a = frames[k]
    const b = frames[Math.min(k + 1, frames.length - 1)]
    return { a, b, f: easeInOut(f), rawF: f }
  }

  // ── the render loop ─────────────────────────────────────────────────────────
  useEffect(() => {
    const cv = canvasRef.current
    const wrap = wrapRef.current
    if (!cv || !wrap) return
    const ctx = cv.getContext('2d')!
    let raf = 0
    let last = performance.now()
    const dpr = Math.min(2, window.devicePixelRatio || 1)

    const draw = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      // advance the clock while playing (1 year ≈ 1.6s at ×1)
      if (playing) {
        const next = posRef.current + (dt / 1.6) * speed
        if (next >= years.length - 1) { posRef.current = years.length - 1; setPlaying(false) }
        else posRef.current = next
        setPos(posRef.current)
      }
      const W = wrap.clientWidth, H = 430
      if (cv.width !== W * dpr || cv.height !== H * dpr) { cv.width = W * dpr; cv.height = H * dpr; cv.style.height = `${H}px` }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, W, H)

      const L = 56, R = 20, T = 26, B = 40
      const x = (mass: number) => L + ((mass - scales.mLo) / (scales.mHi - scales.mLo)) * (W - L - R)
      const y = (v: number) => T + (1 - (v - scales.vLo) / (scales.vHi - scales.vLo)) * (H - T - B)
      const { a, b, f } = frameAt(posRef.current)

      // grid
      ctx.strokeStyle = 'rgba(0,0,0,0.05)'; ctx.lineWidth = 1
      ctx.font = '10px ui-sans-serif'; ctx.fillStyle = '#9C9284'
      for (let g = 0; g <= 4; g++) {
        const v = scales.vLo + ((scales.vHi - scales.vLo) * g) / 4
        ctx.beginPath(); ctx.moveTo(L, y(v)); ctx.lineTo(W - R, y(v)); ctx.stroke()
        ctx.fillText(fmtNum(v, 0), 8, y(v) + 3)
      }
      for (let g = 0; g <= 4; g++) {
        const m = scales.mLo + ((scales.mHi - scales.mLo) * g) / 4
        ctx.fillText(`${fmtInt(m)} kg`, x(m) - 16, H - 12)
      }

      // the tightening statutory line (interpolated between the two year curves)
      const baseSc = baselineScenario(pack)
      const limAt = (mass: number) => {
        const la = pack.limit({ year: a.year, avgMass: mass, zlevShare: 0, vclass: pack.classes[0], scenario: { ...baseSc, year: a.year } })
        const lb = pack.limit({ year: b.year, avgMass: mass, zlevShare: 0, vclass: pack.classes[0], scenario: { ...baseSc, year: b.year } })
        return lerp(la, lb, f)
      }
      // danger wash above the line
      ctx.beginPath()
      const steps = 48
      for (let s2 = 0; s2 <= steps; s2++) {
        const m = scales.mLo + ((scales.mHi - scales.mLo) * s2) / steps
        const yy = y(limAt(m))
        s2 === 0 ? ctx.moveTo(x(m), yy) : ctx.lineTo(x(m), yy)
      }
      ctx.lineTo(W - R, T); ctx.lineTo(L, T); ctx.closePath()
      ctx.fillStyle = 'rgba(224,72,77,0.05)'; ctx.fill()
      // the line itself
      ctx.beginPath()
      for (let s2 = 0; s2 <= steps; s2++) {
        const m = scales.mLo + ((scales.mHi - scales.mLo) * s2) / steps
        const yy = y(limAt(m))
        s2 === 0 ? ctx.moveTo(x(m), yy) : ctx.lineTo(x(m), yy)
      }
      ctx.strokeStyle = '#E0A100'; ctx.lineWidth = 2; ctx.setLineDash([7, 5]); ctx.stroke(); ctx.setLineDash([])
      ctx.fillStyle = '#B78400'; ctx.font = '700 10px ui-sans-serif'
      ctx.fillText('THE LIMIT', W - R - 62, y(limAt(scales.mHi - (scales.mHi - scales.mLo) * 0.05)) - 8)

      // ghost year watermark
      const yearNow = Math.round(lerp(a.year, b.year, f))
      ctx.font = '800 92px ui-sans-serif'
      ctx.fillStyle = 'rgba(23,20,15,0.055)'
      ctx.fillText(String(yearNow), W / 2 - 110, H / 2 + 30)

      // bubbles with motion trails
      const names = new Set<string>([...a.makers.keys(), ...b.makers.keys()])
      const ranked = [...names].map((n) => ({ n, u: (a.makers.get(n)?.units ?? b.makers.get(n)?.units ?? 0) })).sort((p, q) => q.u - p.u)
      for (const { n } of ranked) {
        const ma = a.makers.get(n) ?? b.makers.get(n)!
        const mb = b.makers.get(n) ?? a.makers.get(n)!
        const mass = lerp(ma.mass, mb.mass, f)
        const metric = lerp(ma.metric, mb.metric, f)
        const units = lerp(ma.units, mb.units, f)
        const limit = lerp(ma.limit, mb.limit, f)
        const over = metric > limit
        const cx = x(mass), cy = y(metric)
        const r = 5 + Math.sqrt(units / scales.uMax) * 30

        if (!reduced) {
          const tr = trailsRef.current.get(n) ?? []
          const lastP = tr[tr.length - 1]
          if (!lastP || Math.hypot(lastP.x - cx, lastP.y - cy) > 1.5) { tr.push({ x: cx, y: cy }); if (tr.length > 26) tr.shift(); trailsRef.current.set(n, tr) }
          if (tr.length > 1) {
            ctx.beginPath(); ctx.moveTo(tr[0].x, tr[0].y)
            for (const p of tr) ctx.lineTo(p.x, p.y)
            ctx.strokeStyle = over ? 'rgba(224,72,77,0.18)' : 'rgba(14,159,110,0.18)'
            ctx.lineWidth = 1.5; ctx.stroke()
          }
        }

        const grad = ctx.createRadialGradient(cx - r / 3, cy - r / 3, r / 6, cx, cy, r)
        grad.addColorStop(0, over ? 'rgba(240,110,112,0.95)' : 'rgba(52,190,138,0.95)')
        grad.addColorStop(1, over ? 'rgba(206,44,52,0.85)' : 'rgba(11,128,88,0.85)')
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.fillStyle = grad; ctx.fill()
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.5; ctx.stroke()
      }
      // labels for the top 6 (drawn after all bubbles so they stay legible)
      ctx.font = '600 10px ui-sans-serif'
      for (const { n } of ranked.slice(0, 6)) {
        const ma = a.makers.get(n) ?? b.makers.get(n)!
        const mb = b.makers.get(n) ?? a.makers.get(n)!
        const cx = x(lerp(ma.mass, mb.mass, f))
        const cy = y(lerp(ma.metric, mb.metric, f))
        const r = 5 + Math.sqrt(lerp(ma.units, mb.units, f) / scales.uMax) * 30
        const short = n.split(/\s+/).slice(0, 2).join(' ')
        ctx.fillStyle = 'rgba(23,20,15,0.72)'
        ctx.fillText(short, cx - ctx.measureText(short).width / 2, cy - r - 5)
      }

      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [frames, scales, playing, speed, pack, years, reduced]) // eslint-disable-line react-hooks/exhaustive-deps

  // keyboard: Space play/pause · ←/→ step a year
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!wrapRef.current || !wrapRef.current.closest('body')) return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.code === 'Space') { e.preventDefault(); setPlaying((p) => !p) }
      else if (e.key === 'ArrowRight') { e.preventDefault(); jumpTo(Math.min(years.length - 1, Math.round(posRef.current) + 1)) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); jumpTo(Math.max(0, Math.round(posRef.current) - 1)) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [years.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const jumpTo = (p: number) => { posRef.current = p; setPos(p); trailsRef.current.clear() }
  const restart = () => { jumpTo(0); setPlaying(true) }
  useEffect(() => { jumpTo(0); setPlaying(false) }, [caseSel, country]) // eslint-disable-line react-hooks/exhaustive-deps

  const { a, b, f } = frameAt(pos)
  const yearNow = Math.round(lerp(a.year, b.year, f))
  const fineNow = lerp(a.marketFine, b.marketFine, f)
  const zeNow = lerp(a.zeShare, b.zeShare, f)
  const gapNow = lerp(a.avgMetric - a.avgLimit, b.avgMetric - b.avgLimit, f)

  return (
    <div ref={wrapRef} className="relative">
      {/* controls */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button data-testid="theatre-play" onClick={() => (pos >= years.length - 1 ? restart() : setPlaying((p) => !p))}
          className="btn-primary flex items-center gap-1.5 px-4 py-2 text-xs">
          {playing ? <><span className="flex gap-[3px]"><i className="h-3 w-[3px] rounded-sm bg-white" /><i className="h-3 w-[3px] rounded-sm bg-white" /></span> Pause</> : <><span className="ml-0.5 inline-block h-0 w-0 border-y-[5px] border-l-[8px] border-y-transparent border-l-white" /> {pos >= years.length - 1 ? 'Replay the decade' : 'Play the decade'}</>}
        </button>
        <input type="range" min={0} max={years.length - 1} step={0.01} value={pos}
          onChange={(e) => { setPlaying(false); jumpTo(parseFloat(e.target.value)) }}
          onKeyDown={(e) => {
            // keyboard on the scrubber steps whole YEARS, not 0.01 (the smooth
            // step is for the pointer; a keyboard year-step is the useful unit)
            if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); setPlaying(false); jumpTo(Math.min(years.length - 1, Math.round(posRef.current) + 1)) }
            else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); setPlaying(false); jumpTo(Math.max(0, Math.round(posRef.current) - 1)) }
          }}
          className="min-w-[180px] flex-1" style={{ ['--fill' as string]: `${(pos / (years.length - 1)) * 100}%` }} aria-label="Scrub the horizon" />
        <span className="flex items-center gap-0.5 rounded-lg bg-black/[0.04] p-0.5">
          {[0.5, 1, 2].map((sp) => (
            <button key={sp} onClick={() => setSpeed(sp)} className={`num rounded-md px-2 py-0.5 text-[10px] font-bold transition ${speed === sp ? 'bg-white text-ink-100 shadow-sm' : 'text-ink-500 hover:text-ink-100'}`}>×{sp}</button>
          ))}
        </span>
        <span className="flex items-center gap-0.5 rounded-lg bg-black/[0.04] p-0.5">
          {CASE_META.map((c) => (
            <button key={c.id} data-testid={`theatre-case-${c.id}`} onClick={() => setCaseSel(c.id)}
              className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[10.5px] font-semibold transition ${caseSel === c.id ? 'bg-white text-ink-100 shadow-sm' : 'text-ink-500 hover:text-ink-100'}`}>
              <i className="h-2 w-2 rounded-full" style={{ background: c.hex }} />{c.name}
            </button>
          ))}
        </span>
        <span className="hidden text-[10px] text-ink-500 lg:inline">Space ▶︎/⏸ · ← → step</span>
      </div>

      {/* live tickers */}
      <div className="pointer-events-none absolute right-3 top-[74px] z-10 rounded-xl border border-black/[0.07] bg-white/85 px-3.5 py-2.5 text-right shadow-card backdrop-blur">
        <div data-testid="theatre-year" className="dnum text-[30px] font-black leading-none text-ink-100">{yearNow}</div>
        <div className={`num mt-1 text-[13px] font-bold ${fineNow > 0 ? 'text-danger' : 'text-safe'}`}>{fmtMoney(fineNow, pack.currency)} <span className="text-[9px] font-semibold text-ink-500">market fine</span></div>
        <div className="num text-[11px] text-ink-400">{zeNow.toFixed(0)}% ZE · {gapNow > 0 ? '+' : ''}{fmtNum(gapNow, 1)} {pack.metricUnit} to the line</div>
      </div>

      <canvas ref={canvasRef} className="w-full rounded-xl border border-black/[0.06] bg-[#FFFEFB]" style={{ height: 430 }} aria-label="Animated scenario motion chart" />
      <p className="mt-2 text-[10.5px] leading-relaxed text-ink-500">
        Every year is an engine-computed keyframe of the {CASE_META.find((c) => c.id === caseSel)?.name.toLowerCase()} fleet — the animation interpolates between computed truths, never invents them. Bubble = manufacturer (size = volume) · gold dashes = the statutory line for the interpolated year · trails show each maker's decade path.{reduced ? ' Reduced-motion: snapping between years.' : ''}
      </p>
    </div>
  )
}
