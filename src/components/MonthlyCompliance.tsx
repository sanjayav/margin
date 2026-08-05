// ───────────────────────────────────────────────────────────────────────────
// MONTH BY MONTH — the compliance year as it files.
//
// Compliance settles on the FULL year, but registrations arrive monthly, so the
// mid-year questions are "where do we stand" and "which month moved us". Three
// readings, kept deliberately distinct:
//
//   • YTD — the running sales-weighted average from month 1. This IS the
//     compliance position, and it lands exactly on the annual figure once the
//     year is fully filed.
//   • the month on its own — how that month's registrations performed. A good
//     month shows here long before it moves the YTD, which is anchored by
//     everything before it.
//   • the month vs ITS OWN target — the limit is mass-based, so each month is
//     set a different one. Raw monthly figures are therefore NOT comparable to
//     each other; distance-to-target is.
//
// The whole 12-month frame is always drawn. A year three months in should look
// three months in — unfiled months are held open rather than the chart quietly
// rescaling to whatever has arrived.
// ───────────────────────────────────────────────────────────────────────────
import { useState, type ReactNode } from 'react'
import type { MonthPoint } from '../engine/engine'
import { fmtInt, fmtMoney, fmtNum } from '../engine/engine'

const AXIS = '#8C8273'
const RULE = '#1C1812'
const OVER = '#E0484D'
const UNDER = '#0E9F6E'
const LIMIT = '#E0A100'
const YTD = '#E8223B'
const PAPER = '#FFFDF9'
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

interface Slot { month: number; label: string; calendarYear: number; p?: MonthPoint }

export default function MonthlyCompliance({ points, unit, currency, fyLabel, unreported, selected, monthsInYear = 12 }: {
  points: MonthPoint[]
  unit: string
  currency: string
  fyLabel: string
  /** registrations with no monthly split at source — surfaced so the monthly
   *  total visibly reconciles with the headline */
  unreported?: number
  /** 1-based month the screen is scoped to, so the panel shows which row the
   *  headline above it is reading */
  selected?: number | null
  monthsInYear?: number
}) {
  const [h, setH] = useState<number | null>(null)
  // 'gap' answers "how did each month do" — every month against its own target,
  // which is the only way months compare. 'position' answers "where do we
  // stand" — the YTD line against the limit.
  const [view, setView] = useState<'gap' | 'position'>('gap')
  if (!points.length) return null

  const startIdx = MO.indexOf(points[0].label)
  const last = points[points.length - 1]
  const filed = points.length
  const full = filed >= monthsInYear

  // the full year frame — unfiled months are held open, not omitted
  const slots: Slot[] = Array.from({ length: monthsInYear }, (_, i) => {
    const p = points[i]
    const cal = startIdx + i
    return {
      month: i + 1,
      label: p?.label ?? MO[((cal % 12) + 12) % 12],
      calendarYear: p?.calendarYear ?? points[0].calendarYear + Math.floor(cal / 12),
      p,
    }
  })

  // ── the story the year tells, stated in words ────────────────────────────
  const over = points.filter((p) => p.gap > 0)
  const best = points.reduce((a, b) => (b.gap < a.gap ? b : a))
  const worst = points.reduce((a, b) => (b.gap > a.gap ? b : a))
  const trend = filed >= 4
    ? points.slice(-3).reduce((a, p) => a + p.gap, 0) / 3 - points.slice(0, 3).reduce((a, p) => a + p.gap, 0) / 3
    : 0

  const W = 940, H = 302
  const m = { l: 52, r: 62, t: 28, b: 46 }
  const iw = W - m.l - m.r, ih = H - m.t - m.b
  const isGap = view === 'gap'

  const vals = isGap
    ? [...points.flatMap((p) => [p.gap, p.ytdGap]), 0]
    : points.flatMap((p) => [p.metric, p.limit, p.ytdMetric, p.ytdLimit])
  const pad = (Math.max(...vals) - Math.min(...vals) || 1) * 0.2
  const lo = isGap ? Math.min(...vals) - pad * 0.6 : Math.min(...vals) * 0.92
  const hi = isGap ? Math.max(...vals) + pad : Math.max(...vals) * 1.05
  // every slot owns a column whether or not it has filed, so the year keeps its
  // true shape as the months arrive
  const cw = iw / monthsInYear
  const x = (i: number) => m.l + cw * (i + 0.5)
  const y = (v: number) => m.t + ih - ((v - lo) / (hi - lo || 1)) * ih
  const bw = Math.min(30, cw * 0.5)
  const maxUnits = Math.max(...points.map((p) => p.units), 1)
  const widest = Math.max(...points.map((q) => Math.abs(q.gap)), 0.01)

  // fiscal quarters — an analyst reads a year in quarters, not twelfths
  const quarters = Array.from({ length: Math.ceil(monthsInYear / 3) }, (_, q) => ({
    q: q + 1, from: q * 3, to: Math.min(q * 3 + 2, monthsInYear - 1),
  }))

  const Stat = ({ label, value, sub, tone }: { label: string; value: ReactNode; sub: ReactNode; tone?: string }) => (
    <div>
      <div className="text-[9.5px] font-semibold uppercase tracking-[0.09em] text-ink-500">{label}</div>
      <div className={`dnum mt-1 text-[27px] font-bold leading-none ${tone ?? 'text-ink-100'}`}>{value}</div>
      <div className="mt-1.5 text-[10.5px] leading-tight text-ink-500">{sub}</div>
    </div>
  )

  return (
    <div>
      {/* ── headline band ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 border-b border-ink-100/[0.08] pb-5 md:grid-cols-3 xl:grid-cols-5">
        <Stat label="Filed so far"
          value={<>{filed}<span className="text-[15px] font-semibold text-ink-400">/{monthsInYear}</span></>}
          sub={<>{fyLabel} · through {last.label} {last.calendarYear}</>} />
        <Stat label="YTD position"
          tone={last.ytdGap > 0 ? 'text-danger' : 'text-safe'}
          value={<>{fmtNum(last.ytdMetric, 2)}<span className="ml-1 text-[13px] font-semibold text-ink-400">/ {fmtNum(last.ytdLimit, 2)}</span></>}
          sub={<span className={`font-semibold ${last.ytdGap > 0 ? 'text-danger' : 'text-safe'}`}>
            {last.ytdGap > 0 ? '+' : ''}{fmtNum(last.ytdGap, 2)} {unit} {last.ytdGap > 0 ? 'over' : 'under'}
          </span>} />
        <Stat label="Registrations" value={fmtInt(last.ytdUnits)}
          sub={<>{fmtNum(last.ytdZlevShare * 100, 1)}% zero-emission</>} />
        <Stat label={full ? 'Fine' : 'Exposure'}
          tone={last.ytdFineIfYearEnded > 0 ? 'text-danger' : 'text-safe'}
          value={fmtMoney(last.ytdFineIfYearEnded, currency)}
          sub={full ? 'the year is fully filed' : 'if the year closed here — not a levied fine'} />
        <div className="col-span-2 md:col-span-3 xl:col-span-1">
          <div className="text-[9.5px] font-semibold uppercase tracking-[0.09em] text-ink-500">Months over target</div>
          <div className="dnum mt-1 text-[27px] font-bold leading-none text-ink-100">
            {over.length}<span className="text-[15px] font-semibold text-ink-400">/{filed}</span>
          </div>
          {/* the whole year at a glance — filed months coloured, the rest held open */}
          <div className="mt-2 flex gap-[3px]">
            {slots.map((s) => (
              <span key={s.month} title={s.p ? `${s.label}: ${s.p.gap > 0 ? '+' : ''}${fmtNum(s.p.gap, 2)}` : `${s.label}: not yet filed`}
                className="h-3.5 flex-1 rounded-[2px]"
                style={{ background: s.p ? (s.p.gap > 0 ? OVER : UNDER) : RULE, opacity: s.p ? 0.78 : 0.08 }} />
            ))}
          </div>
        </div>
      </div>

      {/* ── narrative: what the year actually says ────────────────────────── */}
      <p className="mt-4 max-w-5xl text-[12.5px] leading-relaxed text-ink-300">
        {over.length === filed
          ? <><b className="text-ink-100">Every filed month sat over its target.</b>{' '}</>
          : over.length === 0
            ? <><b className="text-ink-100">Every filed month sat under its target.</b>{' '}</>
            : <><b className="text-ink-100">{over.length} of {filed} filed months</b> finished over target.{' '}</>}
        {best.gap !== worst.gap && (
          <>Closest to the line was <b className="text-ink-100">{best.label}</b> at{' '}
            <b className={best.gap > 0 ? 'text-danger' : 'text-safe'}>{best.gap > 0 ? '+' : ''}{fmtNum(best.gap, 2)}</b>;
            furthest was <b className="text-ink-100">{worst.label}</b> at <b className="text-danger">+{fmtNum(worst.gap, 2)}</b>.{' '}</>
        )}
        {filed >= 4 && Math.abs(trend) > 0.03 && (
          <>The last three months run <b className={trend < 0 ? 'text-safe' : 'text-danger'}>
            {fmtNum(Math.abs(trend), 2)} {trend < 0 ? 'closer to' : 'further from'} the line
          </b> than the opening three.{' '}</>
        )}
        {!full && <span className="text-ink-500">{monthsInYear - filed} months still to file.</span>}
      </p>

      {/* ── chart ─────────────────────────────────────────────────────────── */}
      <div className="mt-5 flex items-end justify-between gap-4">
        <span className="max-w-2xl text-[11px] leading-snug text-ink-500">
          {isGap
            ? 'Each month against its own target. The limit is mass-based, so every month is set a different one — the distance to target is what compares.'
            : 'The running compliance position against the limit, month by month.'}
        </span>
        <span className="flex shrink-0 items-center gap-0.5 rounded-lg bg-ink-100/[0.05] p-0.5">
          {(['gap', 'position'] as const).map((v) => (
            <button key={v} onClick={() => setView(v)}
              className={`rounded-md px-2.5 py-1 text-[10px] font-bold transition ${view === v ? 'bg-white text-ink-100 shadow-sm' : 'text-ink-500 hover:text-ink-100'}`}>
              {v === 'gap' ? 'vs target' : 'Position'}
            </button>
          ))}
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1.5 w-full" onMouseLeave={() => setH(null)}>
        <defs>
          <linearGradient id="mcOver" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={OVER} stopOpacity="0.95" /><stop offset="100%" stopColor={OVER} stopOpacity="0.4" />
          </linearGradient>
          <linearGradient id="mcUnder" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor={UNDER} stopOpacity="0.95" /><stop offset="100%" stopColor={UNDER} stopOpacity="0.4" />
          </linearGradient>
          <linearGradient id="mcBand" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={OVER} stopOpacity="0.16" /><stop offset="100%" stopColor={OVER} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* quarter bands — a year reads in quarters */}
        {quarters.map((q) => (
          <g key={q.q}>
            {q.q % 2 === 0 && (
              <rect x={m.l + cw * q.from} y={m.t - 16} width={cw * (q.to - q.from + 1)} height={ih + 16} fill={RULE} fillOpacity="0.022" />
            )}
            <text x={m.l + cw * q.from + (cw * (q.to - q.from + 1)) / 2} y={m.t - 18} textAnchor="middle"
              fontSize="8.5" fontWeight="700" fill={AXIS} fillOpacity="0.65" letterSpacing="0.12em">Q{q.q}</text>
          </g>
        ))}

        {/* y grid */}
        {[0, 1, 2, 3, 4].map((i) => {
          const v = lo + ((hi - lo) * i) / 4, yy = y(v)
          return (
            <g key={i}>
              <line x1={m.l} y1={yy} x2={W - m.r} y2={yy} stroke={RULE} strokeOpacity="0.05" />
              <text x={m.l - 8} y={yy + 3} textAnchor="end" fontSize="9" fill={AXIS} className="num">{fmtNum(v, isGap ? 2 : 1)}</text>
            </g>
          )
        })}

        {/* the months still to file — held open, so a part-year looks part-year */}
        {slots.filter((s) => !s.p).map((s) => (
          <g key={`e${s.month}`}>
            <rect x={x(s.month - 1) - bw / 2} y={m.t} width={bw} height={ih} fill={RULE} fillOpacity="0.018" rx="3" />
            <line x1={x(s.month - 1) - bw / 2} y1={isGap ? y(0) : m.t + ih} x2={x(s.month - 1) + bw / 2} y2={isGap ? y(0) : m.t + ih}
              stroke={AXIS} strokeOpacity="0.3" strokeWidth="1.5" strokeDasharray="2 2" />
          </g>
        ))}

        {isGap ? (
          <>
            {points.map((p, i) => {
              const y0 = y(0), yg = y(p.gap), isOver = p.gap > 0
              return (
                <rect key={`b${i}`} x={x(i) - bw / 2} y={Math.min(y0, yg)} width={bw}
                  height={Math.max(2, Math.abs(yg - y0))} rx="3"
                  fill={isOver ? 'url(#mcOver)' : 'url(#mcUnder)'}
                  opacity={h === null || h === i ? 1 : 0.4} style={{ transition: 'opacity .15s' }} />
              )
            })}
            <path d={points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.ytdGap).toFixed(1)}`).join(' ')}
              fill="none" stroke={YTD} strokeWidth="2" strokeDasharray="5 3" strokeLinecap="round" />
            {points.map((p, i) => (
              <circle key={`yc${i}`} cx={x(i)} cy={y(p.ytdGap)} r={h === i ? 4.5 : 3} fill={YTD} stroke={PAPER} strokeWidth="1.5" />
            ))}
            <line x1={m.l} y1={y(0)} x2={W - m.r} y2={y(0)} stroke={LIMIT} strokeWidth="2" />
            <text x={W - m.r + 6} y={y(0) + 3.5} fontSize="9" fontWeight="700" fill={LIMIT} className="num">target</text>
          </>
        ) : (
          <>
            <path d={points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.ytdMetric).toFixed(1)}`).join(' ') + ' ' +
              [...points].reverse().map((p, i) => `L${x(points.length - 1 - i).toFixed(1)},${y(p.ytdLimit).toFixed(1)}`).join(' ') + ' Z'}
              fill="url(#mcBand)" />
            {points.map((p, i) => {
              const bh = (p.units / maxUnits) * (ih * 0.26)
              return <rect key={`u${i}`} x={x(i) - bw / 2} y={m.t + ih - bh} width={bw} height={bh} fill={RULE} fillOpacity={h === i ? 0.13 : 0.06} rx="2" />
            })}
            <path d={points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.ytdLimit).toFixed(1)}`).join(' ')}
              fill="none" stroke={LIMIT} strokeWidth="2" strokeDasharray="5 3" />
            <path d={points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.ytdMetric).toFixed(1)}`).join(' ')}
              fill="none" stroke={YTD} strokeWidth="2.5" strokeLinecap="round" />
            {points.map((p, i) => (
              <g key={`pm${i}`}>
                <circle cx={x(i)} cy={y(p.metric)} r={h === i ? 5 : 3.4} fill={PAPER} stroke={p.gap > 0 ? OVER : UNDER} strokeWidth="2" />
                <circle cx={x(i)} cy={y(p.ytdMetric)} r={h === i ? 5.5 : 3.6} fill={YTD} stroke={PAPER} strokeWidth="1.5" />
              </g>
            ))}
          </>
        )}

        {/* month axis + hover columns */}
        {slots.map((s, i) => (
          <g key={`ax${i}`} onMouseEnter={() => s.p && setH(i)}>
            <rect x={m.l + cw * i} y={m.t - 16} width={cw} height={ih + 16}
              fill={selected === s.month ? YTD : 'transparent'} fillOpacity={selected === s.month ? 0.05 : 0} />
            <text x={x(i)} y={H - m.b + 18} textAnchor="middle" fontSize="10"
              fontWeight={h === i || selected === s.month ? 700 : 500}
              fill={h === i || selected === s.month ? '#1C1812' : AXIS} fillOpacity={s.p ? 1 : 0.4} className="num">
              {s.label}
            </text>
            {(i === 0 || s.label === 'Jan') && (
              <text x={x(i)} y={H - m.b + 30} textAnchor="middle" fontSize="8.5" fill={AXIS} fillOpacity="0.6" className="num">
                ’{String(s.calendarYear).slice(2)}
              </text>
            )}
          </g>
        ))}

        {/* values last — the YTD line crosses the bar tops, so anything drawn
            earlier would be struck through by it */}
        {isGap && points.map((p, i) => {
          const y0 = y(0), yg = y(p.gap), isOver = p.gap > 0
          return (
            <text key={`gl${i}`} x={x(i)} y={isOver ? Math.min(y0, yg) - 7 : Math.max(y0, yg) + 13} textAnchor="middle"
              fontSize={h === i ? 10.5 : 9.5} fontWeight="700" fill={isOver ? OVER : UNDER} className="num"
              stroke={PAPER} strokeWidth="3.5" strokeLinejoin="round" paintOrder="stroke"
              opacity={h === null || h === i ? 1 : 0.45}>
              {isOver ? '+' : ''}{fmtNum(p.gap, 2)}
            </text>
          )
        })}

        {/* best / worst, called out on the chart itself */}
        {isGap && filed > 2 && best.gap !== worst.gap && [best, worst].map((p, k) => {
          const i = points.indexOf(p)
          return (
            <text key={`bw${k}`} x={x(i)} y={p.gap > 0 ? y(p.gap) - 21 : y(p.gap) + 26} textAnchor="middle"
              fontSize="7.5" fontWeight="700" letterSpacing="0.1em" fill={AXIS}
              stroke={PAPER} strokeWidth="3" strokeLinejoin="round" paintOrder="stroke">
              {k === 0 ? 'CLOSEST' : 'FURTHEST'}
            </text>
          )
        })}
      </svg>

      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[10.5px] text-ink-500">
        {isGap ? (
          <>
            <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-[2px]" style={{ background: OVER }} />month over its target</span>
            <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-[2px]" style={{ background: UNDER }} />month under its target</span>
            <span className="flex items-center gap-1.5"><i className="h-[2px] w-4" style={{ background: LIMIT }} />the target (zero)</span>
            <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: YTD }} />YTD position</span>
          </>
        ) : (
          <>
            <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: YTD }} />YTD position</span>
            <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full border-2" style={{ borderColor: UNDER }} />the month alone</span>
            <span className="flex items-center gap-1.5"><i className="h-[2px] w-4" style={{ background: LIMIT }} />the limit</span>
            <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-[2px]" style={{ background: RULE, opacity: 0.12 }} />registrations</span>
          </>
        )}
        {!full && <span className="flex items-center gap-1.5"><i className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: AXIS, opacity: 0.5 }} />not yet filed</span>}
      </div>

      {/* ── the ledger: every month of the year, filed or not ─────────────── */}
      <div className="mt-5 -mx-1 overflow-x-auto">
        <table className="w-full min-w-[780px] border-collapse text-[11.5px]">
          <thead>
            <tr className="border-b border-ink-100/20 text-[9.5px] uppercase tracking-[0.07em] text-ink-500">
              <th className="py-2 pl-3 pr-2 text-left font-bold">Month</th>
              <th className="px-2 py-2 text-right font-bold">Registrations</th>
              <th className="px-2 py-2 text-right font-bold">ZE</th>
              <th className="px-2 py-2 text-right font-bold">Month</th>
              <th className="px-2 py-2 text-right font-bold">Its target</th>
              <th className="px-2 py-2 text-right font-bold">vs target</th>
              <th className="w-[132px] px-2 py-2 text-left font-bold" aria-label="deviation" />
              <th className="px-2 py-2 text-right font-bold">YTD</th>
              <th className="py-2 pl-2 pr-3 text-right font-bold">YTD vs target</th>
            </tr>
          </thead>
          <tbody>
            {slots.map((s, i) => {
              const p = s.p
              const isSel = selected === s.month
              const qEnd = s.month % 3 === 0 && s.month !== monthsInYear
              if (!p) {
                return (
                  <tr key={s.month} className={`border-b ${qEnd ? 'border-ink-100/15' : 'border-ink-100/[0.06]'}`}>
                    <td className="whitespace-nowrap py-1.5 pl-3 pr-2 text-ink-500/70">
                      {s.label} <span className="text-ink-500/50">’{String(s.calendarYear).slice(2)}</span>
                    </td>
                    <td colSpan={8} className="px-2 py-1.5 text-[10.5px] italic text-ink-500/50">not yet filed</td>
                  </tr>
                )
              }
              // bullet bar: the month's gap against the widest in the year, so
              // the column scans without reading a single number
              const frac = Math.abs(p.gap) / widest
              return (
                <tr key={s.month} onMouseEnter={() => setH(i)} onMouseLeave={() => setH(null)}
                  className={`border-b transition-colors ${qEnd ? 'border-ink-100/15' : 'border-ink-100/[0.06]'} ${
                    isSel ? 'bg-brand/[0.06]' : h === i ? 'bg-ink-100/[0.035]' : ''}`}>
                  <td className="whitespace-nowrap py-1.5 pl-3 pr-2 font-medium text-ink-200">
                    {s.label} <span className="text-ink-500">’{String(s.calendarYear).slice(2)}</span>
                    {i === filed - 1 && !full && <span className="ml-2 rounded-full border border-warn/30 bg-warn/10 px-1.5 py-0.5 text-[9px] font-bold text-warn">latest</span>}
                    {isSel && <span className="ml-2 rounded-full border border-brand/40 bg-brand/10 px-1.5 py-0.5 text-[9px] font-bold text-brand">on screen</span>}
                  </td>
                  <td className="num px-2 py-1.5 text-right text-ink-200">{fmtInt(p.units)}</td>
                  <td className="num px-2 py-1.5 text-right text-ink-500">{fmtNum(p.zlevShare * 100, 1)}%</td>
                  <td className="num px-2 py-1.5 text-right text-ink-200">{fmtNum(p.metric, 2)}</td>
                  <td className="num px-2 py-1.5 text-right text-ink-500">{fmtNum(p.limit, 2)}</td>
                  <td className={`num px-2 py-1.5 text-right font-bold ${p.gap > 0 ? 'text-danger' : 'text-safe'}`}>
                    {p.gap > 0 ? '+' : ''}{fmtNum(p.gap, 2)}
                  </td>
                  <td className="px-2 py-1.5">
                    <span className="relative block h-[7px] w-full">
                      <i className="absolute inset-y-[-3px] left-1/2 w-px" style={{ background: LIMIT, opacity: 0.5 }} />
                      <i className="absolute top-0 h-[7px] rounded-[2px]"
                        style={{
                          background: p.gap > 0 ? OVER : UNDER,
                          opacity: h === i || isSel ? 0.95 : 0.6,
                          left: p.gap > 0 ? '50%' : `${50 - frac * 50}%`,
                          width: `${Math.max(frac * 50, 1.5)}%`,
                        }} />
                    </span>
                  </td>
                  <td className="num px-2 py-1.5 text-right font-semibold text-ink-100">{fmtNum(p.ytdMetric, 2)}</td>
                  <td className={`num py-1.5 pl-2 pr-3 text-right ${p.ytdGap > 0 ? 'text-danger' : 'text-safe'}`}>
                    {p.ytdGap > 0 ? '+' : ''}{fmtNum(p.ytdGap, 2)}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-ink-100/25 text-[11.5px] font-bold">
              <td className="py-2 pl-3 pr-2 text-left text-ink-100">{full ? 'Full year' : `Filed to ${last.label}`}</td>
              <td className="num px-2 py-2 text-right text-ink-100">{fmtInt(last.ytdUnits)}</td>
              <td className="num px-2 py-2 text-right text-ink-400">{fmtNum(last.ytdZlevShare * 100, 1)}%</td>
              <td className="num px-2 py-2 text-right text-ink-400">—</td>
              <td className="num px-2 py-2 text-right text-ink-400">{fmtNum(last.ytdLimit, 2)}</td>
              <td className="num px-2 py-2 text-right text-ink-400">—</td>
              <td />
              <td className="num px-2 py-2 text-right text-ink-100">{fmtNum(last.ytdMetric, 2)}</td>
              <td className={`num py-2 pl-2 pr-3 text-right ${last.ytdGap > 0 ? 'text-danger' : 'text-safe'}`}>
                {last.ytdGap > 0 ? '+' : ''}{fmtNum(last.ytdGap, 2)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="mt-3 max-w-5xl text-[11px] leading-relaxed text-ink-500">
        Every month is measured against <b>its own</b> target — the limit is mass-based, so a month heavy in
        large vehicles is set a looser one. That is why the raw <em>Month</em> figures are not comparable to
        each other but <em>vs target</em> is. The <b>YTD</b> column is the compliance position: a
        sales-weighted average from the first month, so it lands exactly on the annual figure once the year
        is fully filed.
        {unreported ? ` ${fmtInt(unreported)} registrations in this year carry no monthly split at source and sit outside this view.` : ''}
      </p>
    </div>
  )
}
