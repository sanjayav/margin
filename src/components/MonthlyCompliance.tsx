// ───────────────────────────────────────────────────────────────────────────
// MONTH BY MONTH — the compliance year as it files.
//
// Compliance is settled on the full year, but registrations arrive monthly, so
// the mid-year question is "where do we stand, and which month moved us". Two
// readings, and the distinction matters:
//
//   • YTD (the bold line) is the running sales-weighted average from month 1.
//     It IS the compliance position so far, and it lands exactly on the annual
//     figure once the year is fully filed.
//   • the month on its own (the dots) is how that month's registrations
//     performed — a good month shows up here long before it moves the YTD,
//     because the YTD is anchored by everything before it.
//
// The limit moves too (it is mass-based), so a month heavy in large vehicles
// raises its own target. Both readings carry their own limit.
// ───────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import type { MonthPoint } from '../engine/engine'
import { fmtInt, fmtMoney, fmtNum } from '../engine/engine'

const AXIS = '#8C8273'
const GRID = '#1C1812'
const OVER = '#E0484D'
const UNDER = '#0E9F6E'
const LIMIT = '#E0A100'
const YTD = '#E8223B'

export default function MonthlyCompliance({ points, unit, currency, fyLabel, unreported }: {
  points: MonthPoint[]
  unit: string
  currency: string
  fyLabel: string
  /** registrations in the year that carry no monthly split — shown so the
   *  monthly total visibly reconciles with the annual one */
  unreported?: number
}) {
  const [h, setH] = useState<number | null>(null)
  if (!points.length) return null

  const last = points[points.length - 1]
  const full = points.length >= 12
  const W = 760, H = 300, m = { l: 46, r: 54, t: 18, b: 34 }
  const iw = W - m.l - m.r, ih = H - m.t - m.b

  const vals = points.flatMap((p) => [p.metric, p.limit, p.ytdMetric, p.ytdLimit])
  const lo = Math.min(...vals) * 0.9
  const hi = Math.max(...vals) * 1.06
  const x = (i: number) => m.l + (points.length === 1 ? iw / 2 : (iw * i) / (points.length - 1))
  const y = (v: number) => m.t + ih - ((v - lo) / (hi - lo || 1)) * ih
  const maxUnits = Math.max(...points.map((p) => p.units), 1)
  const bw = Math.min(26, (iw / points.length) * 0.5)

  const path = (k: 'ytdMetric' | 'ytdLimit') =>
    points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(' ')
  // shaded band between the YTD position and its limit — the compliance gap
  const band =
    points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.ytdMetric).toFixed(1)}`).join(' ') +
    ' ' + points.map((_, i) => points.length - 1 - i)
      .map((i) => `L${x(i).toFixed(1)},${y(points[i].ytdLimit).toFixed(1)}`).join(' ') + ' Z'

  return (
    <div>
      {/* headline: where the year stands */}
      <div className="mb-4 flex flex-wrap items-end gap-x-8 gap-y-3">
        <div>
          <div className="label">Filed so far</div>
          <div className="num text-[26px] font-bold leading-none text-ink-100">
            {points.length}<span className="text-[15px] text-ink-400">/12</span>
            <span className="ml-2 text-[13px] font-semibold text-ink-400">{full ? 'complete year' : 'months'}</span>
          </div>
          <div className="mt-1 text-[11px] text-ink-500">{fyLabel} · through {last.label} {last.calendarYear}</div>
        </div>
        <div>
          <div className="label">YTD position</div>
          <div className={`num text-[26px] font-bold leading-none ${last.ytdGap > 0 ? 'text-danger' : 'text-safe'}`}>
            {fmtNum(last.ytdMetric, 2)}
            <span className="ml-1.5 text-[13px] font-semibold text-ink-400">/ {fmtNum(last.ytdLimit, 2)} {unit}</span>
          </div>
          <div className={`mt-1 text-[11px] font-semibold ${last.ytdGap > 0 ? 'text-danger' : 'text-safe'}`}>
            {last.ytdGap > 0 ? `+${fmtNum(last.ytdGap, 2)} over the line` : `${fmtNum(last.ytdGap, 2)} under the line`}
          </div>
        </div>
        <div>
          <div className="label">YTD registrations</div>
          <div className="num text-[26px] font-bold leading-none text-ink-100">{fmtInt(last.ytdUnits)}</div>
          <div className="mt-1 text-[11px] text-ink-500">{fmtNum(last.ytdZlevShare * 100, 1)}% zero-emission</div>
        </div>
        <div>
          <div className="label">{full ? 'Fine' : 'Exposure if the year closed here'}</div>
          <div className={`num text-[26px] font-bold leading-none ${last.ytdFineIfYearEnded > 0 ? 'text-danger' : 'text-safe'}`}>
            {fmtMoney(last.ytdFineIfYearEnded, currency)}
          </div>
          <div className="mt-1 text-[11px] text-ink-500">
            {full ? 'the year is fully filed' : 'not a levied fine — CAFE settles on the full year'}
          </div>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        <defs>
          <linearGradient id="mcband" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={OVER} stopOpacity="0.20" />
            <stop offset="100%" stopColor={OVER} stopOpacity="0.04" />
          </linearGradient>
        </defs>

        {/* y grid */}
        {[0, 1, 2, 3].map((i) => {
          const v = lo + ((hi - lo) * i) / 3, yy = y(v)
          return (
            <g key={i}>
              <line x1={m.l} y1={yy} x2={W - m.r} y2={yy} stroke={GRID} strokeOpacity="0.06" />
              <text x={m.l - 6} y={yy + 3} textAnchor="end" fontSize="9" fill={AXIS} className="num">{fmtNum(v, 1)}</text>
            </g>
          )
        })}

        {/* monthly registrations, as a quiet backdrop — volume is context here,
            not the subject: a big month is not automatically a good month */}
        {points.map((p, i) => {
          const bh = (p.units / maxUnits) * (ih * 0.3)
          return <rect key={`b${i}`} x={x(i) - bw / 2} y={m.t + ih - bh} width={bw} height={bh}
            fill={GRID} fillOpacity={h === i ? 0.16 : 0.09} rx="2" />
        })}

        <path d={band} fill="url(#mcband)" />
        <path d={path('ytdLimit')} fill="none" stroke={LIMIT} strokeWidth="2.5" strokeDasharray="5 3" />
        <path d={path('ytdMetric')} fill="none" stroke={YTD} strokeWidth="2.75" />

        {points.map((p, i) => (
          <g key={i} onMouseEnter={() => setH(i)} onMouseLeave={() => setH(null)}>
            <rect x={x(i) - iw / points.length / 2} y={m.t} width={iw / points.length} height={ih} fill="transparent" />
            {/* the month on its own — hollow, so it never reads as the position */}
            <circle cx={x(i)} cy={y(p.metric)} r={h === i ? 5 : 3.6}
              fill="#FBF7EF" stroke={p.gap > 0 ? OVER : UNDER} strokeWidth="2" />
            {/* the YTD position — solid */}
            <circle cx={x(i)} cy={y(p.ytdMetric)} r={h === i ? 5.5 : 3.8}
              fill={YTD} stroke="#FBF7EF" strokeWidth="1.5" />
            <text x={x(i)} y={H - 16} textAnchor="middle" fontSize="9" fill={AXIS} className="num">{p.label}</text>
            {i === 0 || p.label === 'Jan' ? (
              <text x={x(i)} y={H - 5} textAnchor="middle" fontSize="8" fill={AXIS} fillOpacity="0.7" className="num">
                {String(p.calendarYear).slice(2)}
              </text>
            ) : null}
            {h === i && (
              <g>
                <rect x={Math.min(Math.max(x(i) - 66, 2), W - 136)} y={m.t + 2} width="134" height="76" rx="6" fill="#FFFDF9" stroke="#DBD2BF" />
                <text x={Math.min(Math.max(x(i) - 58, 10), W - 128)} y={m.t + 16} fontSize="9.5" fontWeight="700" fill="#1C1812">
                  {p.label} {p.calendarYear} · {fmtInt(p.units)} units
                </text>
                <text x={Math.min(Math.max(x(i) - 58, 10), W - 128)} y={m.t + 30} fontSize="9.5" fill={p.gap > 0 ? OVER : UNDER} className="num">
                  month {fmtNum(p.metric, 2)} ({p.gap > 0 ? '+' : ''}{fmtNum(p.gap, 2)})
                </text>
                <text x={Math.min(Math.max(x(i) - 58, 10), W - 128)} y={m.t + 44} fontSize="9.5" fill="#1C1812" className="num">
                  YTD {fmtNum(p.ytdMetric, 2)} {unit}
                </text>
                <text x={Math.min(Math.max(x(i) - 58, 10), W - 128)} y={m.t + 58} fontSize="9.5" fill={AXIS} className="num">
                  limit {fmtNum(p.ytdLimit, 2)}
                </text>
                <text x={Math.min(Math.max(x(i) - 58, 10), W - 128)} y={m.t + 71} fontSize="9.5" fontWeight="700" fill={p.ytdGap > 0 ? OVER : UNDER} className="num">
                  YTD {p.ytdGap > 0 ? '+' : ''}{fmtNum(p.ytdGap, 2)} {p.ytdGap > 0 ? 'over' : 'under'}
                </text>
              </g>
            )}
          </g>
        ))}
      </svg>

      <div className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[10.5px] text-ink-500">
        <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: YTD }} />YTD position — the compliance figure so far</span>
        <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full border-2 border-safe bg-transparent" />the month on its own</span>
        <span className="flex items-center gap-1.5"><i className="h-0.5 w-4" style={{ background: LIMIT }} />the limit</span>
        <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-sm" style={{ background: GRID, opacity: 0.14 }} />registrations</span>
      </div>

      {/* the ledger — one row a month, the way the filing arrives */}
      <div className="mt-4 -mx-1 overflow-x-auto">
        <table className="w-full min-w-[620px] text-[11.5px]">
          <thead>
            <tr className="border-b border-line text-[10px] uppercase tracking-wide text-ink-500">
              <th className="px-3 py-2 text-left font-semibold">Month</th>
              <th className="px-3 py-2 text-right font-semibold">Registrations</th>
              <th className="px-3 py-2 text-right font-semibold">Month</th>
              <th className="px-3 py-2 text-right font-semibold">YTD</th>
              <th className="px-3 py-2 text-right font-semibold">Limit</th>
              <th className="px-3 py-2 text-right font-semibold">YTD gap</th>
              <th className="px-3 py-2 text-right font-semibold">ZE</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p, i) => (
              <tr key={i} onMouseEnter={() => setH(i)} onMouseLeave={() => setH(null)}
                className={`border-b border-line/50 transition ${h === i ? 'bg-ink-100/[0.04]' : ''} ${i === points.length - 1 ? 'font-semibold' : ''}`}>
                <td className="whitespace-nowrap px-3 py-1.5 text-ink-200">
                  {p.label} <span className="text-ink-500">{String(p.calendarYear).slice(2)}</span>
                  {i === points.length - 1 && !full && <span className="ml-2 rounded-full border border-warn/30 bg-warn/10 px-1.5 py-0.5 text-[9px] font-bold text-warn">latest</span>}
                </td>
                <td className="num px-3 py-1.5 text-right text-ink-200">{fmtInt(p.units)}</td>
                <td className={`num px-3 py-1.5 text-right ${p.gap > 0 ? 'text-danger' : 'text-safe'}`}>{fmtNum(p.metric, 2)}</td>
                <td className="num px-3 py-1.5 text-right font-semibold text-ink-100">{fmtNum(p.ytdMetric, 2)}</td>
                <td className="num px-3 py-1.5 text-right text-ink-400">{fmtNum(p.ytdLimit, 2)}</td>
                <td className={`num px-3 py-1.5 text-right font-semibold ${p.ytdGap > 0 ? 'text-danger' : 'text-safe'}`}>
                  {p.ytdGap > 0 ? '+' : ''}{fmtNum(p.ytdGap, 2)}
                </td>
                <td className="num px-3 py-1.5 text-right text-ink-400">{fmtNum(p.zlevShare * 100, 1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-ink-500">
        The YTD column is the compliance position — a sales-weighted average from the first month, so it
        lands on the annual figure once the year is fully filed. The <em>Month</em> column is that month
        alone, which is what tells a good month from a bad one before the YTD moves.
        {unreported ? ` ${fmtInt(unreported)} registrations in this year carry no monthly split at source and sit outside this view.` : ''}
      </p>
    </div>
  )
}
