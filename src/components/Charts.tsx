import { useState } from 'react'
import { fmtInt, fmtMoney, fmtNum } from '../engine/engine'
import { ptColor } from '../lib/chart'
import type { YearPoint, MixPoint, Heat, MakerRow, MekkoCol } from '../lib/analytics'

const AXIS = '#8C8273'
const GRID = '#1C1812'
const short = (s: string) => s.split(' ')[0]

// ── Trend: fleet vs limit across years, shaded gap ──────────────────────────
export function TrendChart({ series, unit, currency }: { series: YearPoint[]; unit: string; currency: string }) {
  const [h, setH] = useState<number | null>(null)
  const W = 720, H = 280, m = { l: 44, r: 16, t: 16, b: 30 }
  const iw = W - m.l - m.r, ih = H - m.t - m.b
  const yMax = Math.max(...series.flatMap((s) => [s.fleet, s.limit]), 1) * 1.15
  const x = (i: number) => m.l + (series.length === 1 ? iw / 2 : (iw * i) / (series.length - 1))
  const y = (v: number) => m.t + ih - (v / yMax) * ih
  const line = (k: 'fleet' | 'limit') => series.map((s, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(s[k]).toFixed(1)}`).join(' ')
  const overArea = `M${x(0)},${y(series[0].limit)} ` + series.map((s, i) => `L${x(i).toFixed(1)},${y(Math.max(s.fleet, s.limit)).toFixed(1)}`).join(' ') + ' ' + series.map((_, i) => i).reverse().map((i) => `L${x(i).toFixed(1)},${y(series[i].limit).toFixed(1)}`).join(' ') + ' Z'
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <defs><linearGradient id="trgap" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#E0484D" stopOpacity="0.22" /><stop offset="100%" stopColor="#E0484D" stopOpacity="0.03" /></linearGradient></defs>
      {[0, 1, 2, 3].map((i) => { const v = (yMax * i) / 3, yy = y(v); return <g key={i}><line x1={m.l} y1={yy} x2={W - m.r} y2={yy} stroke={GRID} strokeOpacity="0.06" /><text x={m.l - 6} y={yy + 3} textAnchor="end" fontSize="9" fill={AXIS} className="num">{fmtNum(v, 0)}</text></g> })}
      <path d={overArea} fill="url(#trgap)" />
      <path className="lc-draw" pathLength={1} d={line('limit')} fill="none" stroke="#E0A100" strokeWidth="2.5" />
      <path className="lc-draw" pathLength={1} d={line('fleet')} fill="none" stroke="#F2510E" strokeWidth="2.5" />
      {series.map((s, i) => (
        <g key={i} onMouseEnter={() => setH(i)} onMouseLeave={() => setH(null)}>
          <rect x={x(i) - 14} y={m.t} width="28" height={ih} fill="transparent" />
          <circle cx={x(i)} cy={y(s.limit)} r="2.5" fill="#E0A100" />
          <circle cx={x(i)} cy={y(s.fleet)} r={h === i ? 5.5 : 4} fill={s.gap > 0 ? '#E0484D' : '#F2510E'} stroke="#FBF7EF" strokeWidth="1.5" />
          <text x={x(i)} y={H - 14} textAnchor="middle" fontSize="9" fill={AXIS} className="num">{s.year}</text>
          {h === i && (
            <g>
              <rect x={Math.min(x(i) + 8, W - 116)} y={m.t + 4} width="108" height="46" rx="6" fill="#FFFDF9" stroke="#DBD2BF" />
              <text x={Math.min(x(i) + 16, W - 108)} y={m.t + 18} fontSize="9.5" fill="#1C1812" className="num">fleet {fmtNum(s.fleet, 1)} {unit}</text>
              <text x={Math.min(x(i) + 16, W - 108)} y={m.t + 30} fontSize="9.5" fill={AXIS} className="num">limit {fmtNum(s.limit, 1)}</text>
              <text x={Math.min(x(i) + 16, W - 108)} y={m.t + 42} fontSize="9.5" fill={s.fine > 0 ? '#E0484D' : '#0E9F6E'} className="num">{fmtMoney(s.fine, currency)}</text>
            </g>
          )}
        </g>
      ))}
    </svg>
  )
}

// ── Mix: 100% stacked area of powertrain share across years ─────────────────
export function MixArea({ pts, series }: { pts: string[]; series: MixPoint[] }) {
  const [h, setH] = useState<number | null>(null)
  const W = 360, H = 230, m = { l: 8, r: 8, t: 10, b: 24 }
  const iw = W - m.l - m.r, ih = H - m.t - m.b
  const x = (i: number) => m.l + (series.length === 1 ? iw / 2 : (iw * i) / (series.length - 1))
  // cumulative bottoms per year
  const cum = series.map((s) => { let c = 0; const o: Record<string, [number, number]> = {}; for (const p of pts) { const v = s.shares[p] ?? 0; o[p] = [c, c + v]; c += v } return o })
  const y = (v: number) => m.t + ih - v * ih
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" onMouseLeave={() => setH(null)}>
      {pts.map((p) => {
        const top = series.map((_, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(cum[i][p][1]).toFixed(1)}`).join(' ')
        const bottom = series.map((_, i) => i).reverse().map((i) => `L${x(i).toFixed(1)},${y(cum[i][p][0]).toFixed(1)}`).join(' ')
        return <path key={p} d={`${top} ${bottom} Z`} fill={ptColor(p)} fillOpacity="0.85" />
      })}
      {series.map((s, i) => (
        <g key={i} onMouseEnter={() => setH(i)}>
          <rect x={x(i) - 12} y={m.t} width="24" height={ih} fill="transparent" />
          <text x={x(i)} y={H - 10} textAnchor="middle" fontSize="9" fill={AXIS} className="num">{s.year}</text>
        </g>
      ))}
      {h != null && (
        <g>
          <line x1={x(h)} y1={m.t} x2={x(h)} y2={m.t + ih} stroke={GRID} strokeOpacity="0.25" />
          {pts.map((p, k) => (series[h].shares[p] ? <text key={p} x={x(h) < W / 2 ? x(h) + 6 : x(h) - 6} textAnchor={x(h) < W / 2 ? 'start' : 'end'} y={m.t + 12 + k * 12} fontSize="9.5" fill={ptColor(p)} fontWeight="700" className="num">{p} {Math.round((series[h].shares[p] ?? 0) * 100)}%</text> : null))}
        </g>
      )}
    </svg>
  )
}

// ── Heatmap: maker × year gap ───────────────────────────────────────────────
export function GapHeatmap({ data, unit, onPick }: { data: Heat; unit: string; onPick?: (m: string) => void }) {
  const [h, setH] = useState<[number, number] | null>(null)
  const W = 360, H = 230, m = { l: 64, r: 8, t: 8, b: 22 }
  const cw = (W - m.l - m.r) / data.years.length, chh = (H - m.t - m.b) / data.makers.length
  const maxAbs = Math.max(...data.cells.flat().map(Math.abs), 1)
  const fill = (g: number) => { const a = Math.min(0.92, 0.12 + (Math.abs(g) / maxAbs) * 0.8); return g > 0 ? `rgba(224,72,77,${a})` : `rgba(14,159,110,${a})` }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" onMouseLeave={() => setH(null)}>
      {data.makers.map((mk, r) => (
        <g key={mk}>
          <text x={m.l - 6} y={m.t + r * chh + chh / 2 + 3} textAnchor="end" fontSize="9" fill={AXIS}>{short(mk)}</text>
          {data.years.map((yr, c) => {
            const g = data.cells[r][c]
            const active = h && h[0] === r && h[1] === c
            return (
              <g key={yr} onMouseEnter={() => setH([r, c])} onClick={() => onPick?.(mk)} style={{ cursor: onPick ? 'pointer' : 'default' }}>
                <rect x={m.l + c * cw + 1} y={m.t + r * chh + 1} width={cw - 2} height={chh - 2} rx="3" fill={fill(g)} stroke={active ? '#1C1812' : 'transparent'} strokeWidth="1.5" />
                <text x={m.l + c * cw + cw / 2} y={m.t + r * chh + chh / 2 + 3} textAnchor="middle" fontSize="8.5" fill={Math.abs(g) / maxAbs > 0.5 ? '#fff' : '#1C1812'} className="num">{g > 0 ? '+' : ''}{fmtNum(g, 0)}</text>
              </g>
            )
          })}
        </g>
      ))}
      {data.years.map((yr, c) => <text key={yr} x={m.l + c * cw + cw / 2} y={H - 8} textAnchor="middle" fontSize="8.5" fill={AXIS} className="num">{`'`}{String(yr).slice(2)}</text>)}
    </svg>
  )
}

// ── Ranking: makers by fine (fallback to |gap|) ─────────────────────────────
export function FineRanking({ rows, currency, unit, onPick }: { rows: MakerRow[]; currency: string; unit: string; onPick?: (m: string) => void }) {
  const useFine = rows.some((r) => r.fine > 0)
  const ranked = [...rows].sort((a, b) => (useFine ? b.fine - a.fine : b.gap - a.gap))
  const max = Math.max(...ranked.map((r) => (useFine ? r.fine : Math.abs(r.gap))), 1)
  return (
    <div className="space-y-2">
      {ranked.map((r) => {
        const val = useFine ? r.fine : r.gap
        const over = useFine ? r.fine > 0 : r.gap > 0
        return (
          <button key={r.maker} onClick={() => onPick?.(r.maker)} className="flex w-full items-center gap-3 text-left">
            <span className="w-24 shrink-0 truncate text-xs font-medium text-ink-200">{short(r.maker)}</span>
            <div className="h-6 flex-1 overflow-hidden rounded-md bg-black/[0.04]">
              <div className="h-full rounded-md transition-all duration-500" style={{ width: `${(Math.abs(val) / max) * 100}%`, background: over ? '#E0484D' : '#0E9F6E' }} />
            </div>
            <span className={`num w-24 shrink-0 text-right text-xs font-bold ${over ? 'text-danger' : 'text-safe'}`}>{useFine ? fmtMoney(r.fine, currency) : `${r.gap > 0 ? '+' : ''}${fmtNum(r.gap, 1)} ${unit}`}</span>
          </button>
        )
      })}
    </div>
  )
}

// ── Mekko: maker columns (width ∝ units) split by powertrain ─────────────────
export function Mekko({ cols, onPick }: { cols: MekkoCol[]; onPick?: (m: string) => void }) {
  const [h, setH] = useState<string | null>(null)
  const total = cols.reduce((a, c) => a + c.units, 0) || 1
  const gap = 0.6
  return (
    <div className="w-full">
      <div className="flex h-[200px] w-full items-stretch gap-1">
        {cols.map((c) => {
          const wpct = (c.units / total) * 100
          return (
            <div key={c.maker} style={{ width: `${wpct}%` }} className="flex min-w-[28px] flex-col" onMouseEnter={() => setH(c.maker)} onMouseLeave={() => setH(null)} onClick={() => onPick?.(c.maker)} role="button">
              <div className="flex flex-1 flex-col overflow-hidden rounded-md ring-1 ring-black/[0.04]" style={{ outline: h === c.maker ? '2px solid #1C1812' : 'none' }}>
                {c.segs.map((sg) => (
                  <div key={sg.pt} style={{ height: `${(sg.u / c.units) * 100}%`, background: ptColor(sg.pt) }} title={`${sg.pt} ${Math.round((sg.u / c.units) * 100)}%`} />
                ))}
              </div>
              <div className="mt-1 truncate text-center text-[9px] text-ink-500">{short(c.maker)}</div>
              <div className="num text-center text-[9px] font-semibold text-ink-300">{fmtInt(c.units)}</div>
            </div>
          )
        })}
      </div>
      <div style={{ height: gap }} />
    </div>
  )
}

export function Legend({ pts }: { pts: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {pts.map((p) => <span key={p} className="flex items-center gap-1 text-[10px] text-ink-500"><i className="inline-block h-2 w-2 rounded-full" style={{ background: ptColor(p) }} />{p}</span>)}
    </div>
  )
}
