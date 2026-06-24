import { useMemo, useState } from 'react'
import { useCompliance } from '../lib/useCompliance'
import { useStore } from '../state/store'
import { parentsFor } from '../data/fleet'
import { aggregateParent, fmtMoney, fmtNum } from '../engine/engine'
import { simulateForecastMaker } from '../engine/montecarlo'
import type { Scenario } from '../engine/types'
import { Section, StatusPill } from '../components/ui'
import Icon from '../components/Icon'

export default function Forecast() {
  const { pack, raw, scenario, selectedParent, country } = useCompliance()
  const setParent = useStore((s) => s.setParent)
  const parents = parentsFor(country)
  const [showPlan, setShowPlan] = useState(true)

  const base: Scenario = useMemo(
    () => ({ year: pack.years[0], evSharePct: null, salesMultiplier: 1, massShiftKg: 0, ecoBoostG: 0, poolingEnabled: false, superCreditsEnabled: country === 'IN' }),
    [pack, country],
  )

  const planDiffers = useMemo(
    () => scenario.evSharePct != null || scenario.massShiftKg !== 0 || scenario.salesMultiplier !== 1 || scenario.ecoBoostG !== 0 || scenario.poolingEnabled,
    [scenario],
  )

  const series = useMemo(() => {
    return pack.years.map((y) => {
      const b = aggregateParent(raw, pack, { ...base, year: y }, selectedParent)
      const l = aggregateParent(raw, pack, { ...scenario, year: y }, selectedParent)
      // required zero-emission share to just clear the limit (EV lever only)
      let req: number | null = null
      for (let s = 0; s <= 95; s += 1) {
        const a = aggregateParent(raw, pack, { ...base, year: y, evSharePct: s }, selectedParent)
        if (a.gap <= 0.0001) { req = s; break }
      }
      return {
        year: y, note: pack.forecast(y).note,
        bMetric: b.avgMetric, bLimit: b.limit, bGap: b.gap, bFine: b.fine, bStatus: b.status, bShare: Math.round(b.zlevShare * 100),
        lMetric: l.avgMetric, lLimit: l.limit, lGap: l.gap, lFine: l.fine, lStatus: l.status,
        req,
      }
    })
  }, [raw, pack, scenario, base, selectedParent])

  // Monte-Carlo confidence ribbon (per maker) — P10/P50/P90 + P(over the line)
  const bands = useMemo(() => simulateForecastMaker(raw, pack, base, selectedParent, pack.years), [raw, pack, base, selectedParent])
  const overlay = showPlan && planDiffers
  const cumBase = series.reduce((a, s) => a + s.bFine, 0)
  const cumPlan = series.reduce((a, s) => a + s.lFine, 0)
  const firstBreach = series.find((s) => s.bGap > 0)
  const peak = Math.max(...series.map((s) => s.bFine))
  const first = series[0], last = series[series.length - 1]
  const limitDropPct = first.bLimit > 0 ? Math.round((1 - last.bLimit / first.bLimit) * 100) : 0
  const reductionNeeded = Math.max(0, last.bMetric - last.bLimit)

  // cliffs: years where the limit drops sharply vs the prior year
  const cliffs = series.map((s, i) => (i > 0 && series[i - 1].bLimit > 0 ? (series[i - 1].bLimit - s.bLimit) / series[i - 1].bLimit : 0))
  const maxDrop = Math.max(...cliffs)

  return (
    <div className="space-y-5 animate-slidein">
      <div className="flex flex-wrap items-center gap-2">
        {parents.map((p) => (
          <button key={p} onClick={() => setParent(p)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${selectedParent === p ? 'bg-ink-100 text-white' : 'bg-black/5 text-ink-500 hover:text-ink-100'}`}>{p}</button>
        ))}
        {planDiffers && (
          <button onClick={() => setShowPlan((v) => !v)}
            className={`ml-auto flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${overlay ? 'border-accent/40 bg-accent/10 text-accent' : 'border-black/10 text-ink-500 hover:text-ink-100'}`}>
            <Icon name="sliders" size={13} /> {overlay ? 'Showing your live plan' : 'Compare your live plan'}
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="card p-4">
          <div className="label">Exposure {pack.years[0]}–{last.year}</div>
          <div className="num mt-1 text-2xl font-black text-danger">{fmtMoney(cumBase, pack.currency)}</div>
          {overlay && <div className="text-xs text-safe">→ {fmtMoney(cumPlan, pack.currency)} with your plan</div>}
          {!overlay && <div className="text-xs text-ink-500">if today's mix holds</div>}
        </div>
        <div className="card p-4">
          <div className="label">First year over the line</div>
          <div className="num mt-1 text-2xl font-black text-warn">{firstBreach ? firstBreach.year : '—'}</div>
          <div className="text-xs text-ink-500">{firstBreach ? `+${fmtNum(firstBreach.bGap, 1)} ${pack.metricUnit}` : 'compliant throughout'}</div>
        </div>
        <div className="card p-4">
          <div className="label">Peak annual fine</div>
          <div className="num mt-1 text-2xl font-black text-ink-100">{fmtMoney(peak, pack.currency)}</div>
          <div className="text-xs text-ink-500">worst single year</div>
        </div>
        <div className="card p-4">
          <div className="label">The limit tightens</div>
          <div className="num mt-1 text-2xl font-black text-accent">−{limitDropPct}%</div>
          <div className="text-xs text-ink-500">{fmtNum(first.bLimit, 1)} → {fmtNum(last.bLimit, 1)} {pack.metricUnit}</div>
        </div>
      </div>

      {/* Hero: emissions vs limit over time */}
      <Section title="The line, year by year"
        right={<Legend overlay={overlay} pack={pack} />}>
        <TrajectoryChart series={series} bands={bands} overlay={overlay} pack={pack} cliffs={cliffs} maxDrop={maxDrop} />
      </Section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {/* Projected fine timeline */}
        <Section title="Projected fine each year">
          <FineBars series={series} overlay={overlay} pack={pack} />
        </Section>

        {/* Compliance glide path */}
        <Section title="Compliance glide path"
          right={<span className="text-[11px] text-ink-500">zero-emission share needed to clear the limit</span>}>
          <GlidePath series={series} />
        </Section>
      </div>

      {/* Year by year */}
      <Section title="Year by year">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-black/[0.03] text-left text-[11px] uppercase tracking-wider text-ink-500">
                <th className="px-4 py-2.5">Year</th>
                <th className="px-4 py-2.5">Phase</th>
                <th className="px-4 py-2.5 text-right">Limit</th>
                <th className="px-4 py-2.5 text-right">Fleet</th>
                {overlay && <th className="px-4 py-2.5 text-right text-accent">Your plan</th>}
                <th className="px-4 py-2.5 text-right">Gap</th>
                <th className="px-4 py-2.5 text-right">P(over)</th>
                <th className="px-4 py-2.5 text-right">ZE now → need</th>
                <th className="px-4 py-2.5 text-right">Fine</th>
                <th className="px-4 py-2.5 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {series.map((s, i) => (
                <tr key={s.year} className={`border-t border-black/[0.04] ${cliffs[i] === maxDrop && maxDrop > 0.08 ? 'bg-warn/[0.04]' : ''}`}>
                  <td className="px-4 py-2.5 num font-semibold text-ink-100">{s.year}</td>
                  <td className="px-4 py-2.5 text-xs text-ink-500">{s.note}{cliffs[i] === maxDrop && maxDrop > 0.08 ? ' · step' : ''}</td>
                  <td className="px-4 py-2.5 text-right num text-ink-300">{fmtNum(s.bLimit, 1)}</td>
                  <td className="px-4 py-2.5 text-right num">{fmtNum(s.bMetric, 1)}</td>
                  {overlay && <td className="px-4 py-2.5 text-right num text-accent">{fmtNum(s.lMetric, 1)}</td>}
                  <td className={`px-4 py-2.5 text-right num font-semibold ${s.bGap > 0 ? 'text-danger' : 'text-safe'}`}>{s.bGap > 0 ? '+' : ''}{fmtNum(s.bGap, 1)}</td>
                  <td className={`px-4 py-2.5 text-right num ${(bands[i]?.probOver ?? 0) > 0.5 ? 'text-danger' : (bands[i]?.probOver ?? 0) > 0.1 ? 'text-warn' : 'text-safe'}`}>{Math.round((bands[i]?.probOver ?? 0) * 100)}%</td>
                  <td className={`px-4 py-2.5 text-right num ${s.bFine > 0 ? 'text-danger' : 'text-ink-500'}`}>{fmtMoney(s.bFine, pack.currency)}</td>
                  <td className="px-4 py-2.5 text-right"><StatusPill status={s.bStatus} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {series.some((s) => s.req == null && s.bGap > 0) && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-warn"><Icon name="alert" size={13} /> In the dashed years, electrification alone can't clear the limit — you'll also need lighter models, eco-innovation credits or pooling.</p>
        )}
      </Section>
    </div>
  )
}

function Legend({ overlay, pack }: { overlay: boolean; pack: any }) {
  return (
    <div className="flex items-center gap-3 text-[11px] text-ink-500">
      <span className="flex items-center gap-1"><i className="inline-block h-2 w-4 rounded bg-[#E0A100]" />limit</span>
      <span className="flex items-center gap-1"><i className="inline-block h-2 w-4 rounded bg-[#5b8def]" />hold today's mix</span>
      <span className="flex items-center gap-1"><i className="inline-block h-2 w-4 rounded bg-[#5b8def]/20" />P10–P90</span>
      {overlay && <span className="flex items-center gap-1"><i className="inline-block h-2 w-4 rounded bg-[#3ddc97]" />your plan</span>}
    </div>
  )
}

function TrajectoryChart({ series, bands, overlay, pack, cliffs, maxDrop }: any) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 760, H = 320, m = { l: 50, r: 20, t: 18, b: 38 }
  const iw = W - m.l - m.r, ih = H - m.t - m.b
  const vals = series.flatMap((s: any) => [s.bMetric, s.bLimit, ...(overlay ? [s.lMetric] : [])]).concat((bands ?? []).map((b: any) => b.p90))
  const yMax = Math.max(...vals, 1) * 1.15
  const sx = (i: number) => m.l + (series.length === 1 ? iw / 2 : (iw * i) / (series.length - 1))
  const sy = (v: number) => m.t + ih - (v / yMax) * ih
  const line = (k: string) => series.map((s: any, i: number) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(s[k]).toFixed(1)}`).join(' ')
  // P10–P90 confidence ribbon
  const ribbon = bands && bands.length
    ? `M${sx(0)},${sy(bands[0].p90).toFixed(1)} ` + bands.map((b: any, i: number) => `L${sx(i).toFixed(1)},${sy(b.p90).toFixed(1)}`).join(' ')
      + ' ' + [...bands].map((_: any, i: number) => bands.length - 1 - i).map((i: number) => `L${sx(i).toFixed(1)},${sy(bands[i].p10).toFixed(1)}`).join(' ') + ' Z'
    : ''
  // gap area between baseline fleet and limit, clipped to over-limit
  const overArea =
    `M${sx(0)},${sy(series[0].bLimit)} ` +
    series.map((s: any, i: number) => `L${sx(i).toFixed(1)},${sy(Math.max(s.bMetric, s.bLimit)).toFixed(1)}`).join(' ') +
    ' ' + [...series].map((_: any, i: number) => i).reverse().map((i: number) => `L${sx(i).toFixed(1)},${sy(series[i].bLimit).toFixed(1)}`).join(' ') + ' Z'

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <defs>
        <linearGradient id="gapfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ff5d6c" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#ff5d6c" stopOpacity="0.04" />
        </linearGradient>
      </defs>
      {Array.from({ length: 5 }, (_, i) => { const v = (yMax * i) / 4; const y = sy(v); return (<g key={i}><line x1={m.l} y1={y} x2={W - m.r} y2={y} stroke="#1C1812" strokeOpacity="0.05" /><text x={m.l - 6} y={y + 3} textAnchor="end" fontSize="10" fill="#8C8273" className="num">{fmtNum(v, 0)}</text></g>) })}

      {/* regulatory cliff markers */}
      {series.map((s: any, i: number) => (cliffs[i] > 0.08 ? (
        <g key={`c${i}`}>
          <line x1={sx(i)} y1={m.t} x2={sx(i)} y2={m.t + ih} stroke="#ffb454" strokeOpacity="0.35" strokeDasharray="3 3" />
          {cliffs[i] === maxDrop && <text x={sx(i)} y={m.t + 10} textAnchor="middle" fontSize="9" fill="#ffb454" fontWeight="700">tighter rules</text>}
        </g>
      ) : null))}

      {ribbon && <path d={ribbon} fill="#5b8def" fillOpacity="0.12" />}
      <path d={overArea} fill="url(#gapfill)" />
      <path d={line('bLimit')} fill="none" stroke="#E0A100" strokeWidth="2.5" style={{ filter: 'drop-shadow(0 2px 5px rgba(255,209,102,.2))' }} />
      <path d={line('bMetric')} fill="none" stroke="#5b8def" strokeWidth="2.5" />
      {overlay && <path d={line('lMetric')} fill="none" stroke="#3ddc97" strokeWidth="2.5" strokeDasharray="5 3" />}

      {series.map((s: any, i: number) => (
        <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: 'pointer' }}>
          <rect x={sx(i) - 12} y={m.t} width="24" height={ih} fill="transparent" />
          <circle cx={sx(i)} cy={sy(s.bLimit)} r="3" fill="#E0A100" />
          <circle cx={sx(i)} cy={sy(s.bMetric)} r={hover === i ? 6 : 4.5} fill={s.bGap > 0 ? '#ff5d6c' : '#5b8def'} stroke="#FBF7EF" strokeWidth="2" />
          {overlay && <circle cx={sx(i)} cy={sy(s.lMetric)} r={hover === i ? 6 : 4.5} fill={s.lGap > 0 ? '#ff5d6c' : '#3ddc97'} stroke="#FBF7EF" strokeWidth="2" />}
          <text x={sx(i)} y={H - 16} textAnchor="middle" fontSize="10" fill="#8C8273" className="num">{s.year}</text>
          {hover === i && (
            <g>
              <rect x={Math.min(sx(i) + 10, W - 150)} y={m.t + 6} width="142" height={overlay ? 60 : 46} rx="7" fill="#FFFDF9" stroke="#DBD2BF" />
              <text x={Math.min(sx(i) + 20, W - 140)} y={m.t + 22} fontSize="10" fill="#8C8273">limit {fmtNum(s.bLimit, 1)} {pack.metricUnit}</text>
              <text x={Math.min(sx(i) + 20, W - 140)} y={m.t + 36} fontSize="10" fill="#5b8def">fleet {fmtNum(s.bMetric, 1)} · fine {fmtMoney(s.bFine, pack.currency)}</text>
              {overlay && <text x={Math.min(sx(i) + 20, W - 140)} y={m.t + 50} fontSize="10" fill="#3ddc97">plan {fmtNum(s.lMetric, 1)} · {fmtMoney(s.lFine, pack.currency)}</text>}
            </g>
          )}
        </g>
      ))}
      <text x={m.l} y={12} fontSize="10" fill="#8C8273" className="uppercase tracking-wider">{pack.metricLabel} ({pack.metricUnit})</text>
    </svg>
  )
}

function FineBars({ series, overlay, pack }: any) {
  const max = Math.max(...series.flatMap((s: any) => [s.bFine, overlay ? s.lFine : 0]), 1)
  return (
    <div className="space-y-2.5">
      {series.map((s: any) => (
        <div key={s.year} className="flex items-center gap-3">
          <div className="w-10 shrink-0 num text-xs text-ink-400">{s.year}</div>
          <div className="relative flex-1">
            <div className="h-5 w-full overflow-hidden rounded bg-black/[0.03]">
              <div className="h-full rounded bg-gradient-to-r from-danger/70 to-danger transition-all duration-300" style={{ width: `${(s.bFine / max) * 100}%` }} />
            </div>
            {overlay && (
              <div className="absolute inset-y-0 left-0 h-5">
                <div className="h-full rounded bg-safe/70 ring-1 ring-safe transition-all duration-300" style={{ width: `${(s.lFine / max) * 100}%` }} />
              </div>
            )}
          </div>
          <div className={`w-20 shrink-0 text-right num text-xs ${s.bFine > 0 ? 'text-danger' : 'text-ink-500'}`}>{fmtMoney(s.bFine, pack.currency)}</div>
        </div>
      ))}
    </div>
  )
}

function GlidePath({ series }: any) {
  return (
    <div className="space-y-2.5">
      {series.map((s: any) => {
        const req = s.req
        const infeasible = req == null && s.bGap > 0
        const reqW = req == null ? 100 : req
        const closed = req != null && s.bShare >= req
        return (
          <div key={s.year} className="flex items-center gap-3">
            <div className="w-10 shrink-0 num text-xs text-ink-400">{s.year}</div>
            <div className="relative h-5 flex-1 overflow-hidden rounded bg-black/[0.03]">
              {/* required share */}
              <div className={`h-full rounded transition-all duration-300 ${infeasible ? 'bg-warn/40' : closed ? 'bg-safe/30' : 'bg-accent/30'}`} style={{ width: `${reqW}%` }} />
              {/* current share marker */}
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
