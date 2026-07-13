import { useState } from 'react'
import { fmtMoney } from '../engine/engine'

export interface TornadoDriver {
  label: string
  a: { value: number; note: string } // one plausible extreme
  b: { value: number; note: string } // the other extreme
}

interface Props {
  base: number // base-case exposure (currency)
  drivers: TornadoDriver[]
  currency: string
}

/**
 * Tornado sensitivity: one bar per driver, spanning the exposure at its two
 * plausible extremes, centred on the base case. Sorted by swing so the eye
 * lands on what matters. Green side = reduces exposure, red side = increases.
 */
export default function TornadoChart({ base, drivers, currency }: Props) {
  const [hover, setHover] = useState<number | null>(null)
  const rows = [...drivers].sort((x, y) => Math.abs(y.a.value - y.b.value) - Math.abs(x.a.value - x.b.value))
  const W = 760
  const rowH = 40
  const m = { l: 210, r: 96, t: 26, b: 30 }
  const H = m.t + rows.length * rowH + m.b

  const values = rows.flatMap((d) => [d.a.value, d.b.value, base])
  const vMin = Math.min(...values)
  const vMax = Math.max(...values)
  const pad = Math.max((vMax - vMin) * 0.08, 1)
  const x = (v: number) => m.l + ((v - (vMin - pad)) / (vMax - vMin + 2 * pad)) * (W - m.l - m.r)

  return (
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 'auto' }}>
        {/* base line */}
        <line x1={x(base)} y1={m.t - 6} x2={x(base)} y2={H - m.b + 4} stroke="#1C1812" strokeWidth="1.25" strokeDasharray="5 4" opacity="0.5" />
        <text x={x(base)} y={m.t - 10} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#1C1812">base {fmtMoney(base, currency)}</text>

        {rows.map((d, i) => {
          const y = m.t + i * rowH + rowH / 2
          const lo = Math.min(d.a.value, d.b.value)
          const hi = Math.max(d.a.value, d.b.value)
          const loEnd = d.a.value <= d.b.value ? d.a : d.b
          const hiEnd = d.a.value > d.b.value ? d.a : d.b
          const active = hover === i
          return (
            <g key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              {/* row hairline */}
              <line x1={m.l} y1={y} x2={W - m.r} y2={y} stroke="#1C1812" strokeOpacity="0.04" />
              {/* driver label */}
              <text x={m.l - 12} y={y + 3.5} textAnchor="end" fontSize="11" fontWeight="600" fill="#4A4438">
                {d.label.length > 30 ? d.label.slice(0, 29) + '…' : d.label}
              </text>
              {/* favourable side (below base) */}
              {lo < base && <rect x={x(lo)} y={y - 9} width={Math.max(1.5, x(Math.min(base, hi)) - x(lo))} height={18} rx="5" fill="#0E9F6E" fillOpacity={active ? 0.85 : 0.6} className="rise" style={{ animationDelay: `${i * 60}ms` }} />}
              {/* adverse side (above base) */}
              {hi > base && <rect x={x(Math.max(base, lo))} y={y - 9} width={Math.max(1.5, x(hi) - x(Math.max(base, lo)))} height={18} rx="5" fill="#E0484D" fillOpacity={active ? 0.85 : 0.6} className="rise" style={{ animationDelay: `${i * 60}ms` }} />}
              {/* end deltas */}
              <text x={x(lo) - 6} y={y + 3.5} textAnchor="end" fontSize="9.5" fontWeight="700" className="num" fill={lo < base ? '#0E8A60' : '#8C8273'}>
                {lo - base < 0 ? '−' : '+'}{fmtMoney(Math.abs(lo - base), currency)}
              </text>
              <text x={x(hi) + 6} y={y + 3.5} textAnchor="start" fontSize="9.5" fontWeight="700" className="num" fill={hi > base ? '#C93A3F' : '#8C8273'}>
                {hi - base < 0 ? '−' : '+'}{fmtMoney(Math.abs(hi - base), currency)}
              </text>
              {/* hover: which setting produced each end */}
              {active && (
                <text x={m.l} y={y + 21} fontSize="9" fill="#8C8273">
                  {loEnd.note} → {fmtMoney(loEnd.value, currency)} · {hiEnd.note} → {fmtMoney(hiEnd.value, currency)}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
