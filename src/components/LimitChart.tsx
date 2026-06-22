import { useMemo, useState } from 'react'
import type { RulePack } from '../engine/types'
import { fmtInt, fmtNum } from '../engine/engine'

export interface ChartPoint {
  key: string
  label: string
  mass: number
  metric: number
  units: number
  status: 'compliant' | 'fine' | 'no-sales' | 'exempt'
  isFleet?: boolean
  powertrain?: string
}

const PT_COLORS: Record<string, string> = {
  BEV: '#3ddc97', PHEV: '#5b8def', HEV: '#8b7ff0', MHEV: '#ffb454', ICE: '#ff5d6c', 'Strong Hybrid': '#8b7ff0',
}

interface Props {
  pack: RulePack
  /** limit as a function of mass (uses the fleet's year, class and ZLEV share). */
  limitAt: (mass: number) => number
  points: ChartPoint[]
  onPick?: (key: string) => void
  height?: number
  colorBy?: 'status' | 'powertrain'
  /** stable denominator for bubble size (e.g. maker total) so a lone bubble still scales with volume */
  unitRef?: number
}

/**
 * Fully custom SVG chart. The limit line rises with mass; the fleet sits as a
 * marker. Below the line is safe (green), above means a fine (red). Everything
 * re-renders instantly when the scenario changes — no animation gate.
 */
export default function LimitChart({ pack, limitAt, points, onPick, height = 360, colorBy = 'status', unitRef }: Props) {
  const [hover, setHover] = useState<string | null>(null)
  const W = 760
  const H = height
  const m = { l: 56, r: 24, t: 20, b: 44 }
  const iw = W - m.l - m.r
  const ih = H - m.t - m.b

  const { xMin, xMax, yMax, line } = useMemo(() => {
    const masses = points.map((p) => p.mass).filter((x) => x > 0)
    const xMin = Math.min(...masses, 1000) - 120
    const xMax = Math.max(...masses, 2000) + 120
    const samples = 40
    const line = Array.from({ length: samples + 1 }, (_, i) => {
      const mass = xMin + ((xMax - xMin) * i) / samples
      return { mass, limit: limitAt(mass) }
    })
    const lineMax = Math.max(...line.map((l) => l.limit))
    const yMax = Math.max(lineMax, ...points.map((p) => p.metric), 1) * 1.18
    return { xMin, xMax, yMax, line }
  }, [points, limitAt])

  const sx = (mass: number) => m.l + ((mass - xMin) / (xMax - xMin)) * iw
  const sy = (v: number) => m.t + ih - (v / yMax) * ih

  const linePath = line.map((p, i) => `${i ? 'L' : 'M'}${sx(p.mass).toFixed(1)},${sy(p.limit).toFixed(1)}`).join(' ')
  // shaded "fine" zone = area above the limit line up to the top
  const abovePath =
    `M${sx(line[0].mass)},${m.t} ` +
    line.map((p) => `L${sx(p.mass).toFixed(1)},${sy(p.limit).toFixed(1)}`).join(' ') +
    ` L${sx(line[line.length - 1].mass)},${m.t} Z`

  const yticks = 5
  const xticks = 5
  // size bubbles against a stable reference (maker total) when provided, else the
  // biggest in view — so even a single bubble scales with its volume.
  const sizeRef = unitRef && unitRef > 0 ? unitRef : Math.max(...points.filter((p) => !p.isFleet).map((p) => p.units), 1)

  return (
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 'auto' }}>
        <defs>
          <linearGradient id="fineZone" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ff5d6c" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#ff5d6c" stopOpacity="0.015" />
          </linearGradient>
          <linearGradient id="safeZone" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3ddc97" stopOpacity="0.02" />
            <stop offset="100%" stopColor="#3ddc97" stopOpacity="0.13" />
          </linearGradient>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3.2" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* safe zone background */}
        <rect x={m.l} y={m.t} width={iw} height={ih} fill="url(#safeZone)" rx="6" />
        <path d={abovePath} fill="url(#fineZone)" />

        {/* gridlines + y labels */}
        {Array.from({ length: yticks + 1 }, (_, i) => {
          const v = (yMax * i) / yticks
          const y = sy(v)
          return (
            <g key={i}>
              <line x1={m.l} y1={y} x2={W - m.r} y2={y} stroke="#1C1812" strokeOpacity="0.05" />
              <text x={m.l - 8} y={y + 3} textAnchor="end" fontSize="10" fill="#8C8273" className="num">{fmtNum(v, 0)}</text>
            </g>
          )
        })}
        {/* x labels */}
        {Array.from({ length: xticks + 1 }, (_, i) => {
          const v = xMin + ((xMax - xMin) * i) / xticks
          const x = sx(v)
          return (
            <text key={i} x={x} y={H - m.b + 16} textAnchor="middle" fontSize="10" fill="#8C8273" className="num">{fmtInt(v)}</text>
          )
        })}
        <text x={m.l} y={12} fontSize="10" fill="#8C8273" className="uppercase tracking-wider">{pack.metricLabel} ({pack.metricUnit})</text>
        <text x={W - m.r} y={H - 6} textAnchor="end" fontSize="10" fill="#8C8273" className="uppercase tracking-wider">{pack.massLabel} (kg)</text>

        {/* the limit line */}
        <path d={linePath} pathLength={1} className="lc-draw" fill="none" stroke="#E0A100" strokeWidth="2.25" style={{ transition: 'all .25s', filter: 'drop-shadow(0 2px 6px rgba(224,161,0,0.28))' }} />
        {(() => {
          const lx = sx(line[line.length - 1].mass)
          const ly = sy(line[line.length - 1].limit)
          return (
            <g style={{ transition: 'all .25s' }}>
              <rect x={lx - 78} y={ly - 24} width="74" height="17" rx="8.5" fill="#E0A100" />
              <text x={lx - 41} y={ly - 12} textAnchor="middle" fontSize="10" fill="#1a1405" fontWeight="800" letterSpacing="0.5">THE LIMIT</text>
            </g>
          )
        })()}

        {/* points */}
        {points.map((p) => {
          if (p.mass <= 0) return null
          const cx = sx(p.mass)
          const cy = sy(p.metric)
          const statusColor = p.status === 'fine' ? '#ff5d6c' : p.status === 'compliant' ? '#3ddc97' : p.status === 'exempt' ? '#ffb454' : '#8C8273'
          const color = p.isFleet ? statusColor : colorBy === 'powertrain' ? (PT_COLORS[p.powertrain ?? ''] ?? '#8C8273') : statusColor
          const r = p.isFleet ? 9 : 5 + Math.sqrt(Math.min(1, Math.max(0, p.units) / sizeRef)) * 18
          const active = hover === p.key
          return (
            <g key={p.key} style={{ cursor: onPick ? 'pointer' : 'default', transition: 'all .25s' }}
              onMouseEnter={() => setHover(p.key)} onMouseLeave={() => setHover(null)} onClick={() => onPick?.(p.key)}>
              {p.isFleet && <line x1={cx} y1={cy} x2={cx} y2={sy(limitAt(p.mass))} stroke={color} strokeWidth="1.5" strokeDasharray="3 3" opacity="0.55" />}
              <circle cx={cx} cy={cy} r={r + (active ? 3 : 0)} fill={color} fillOpacity={p.isFleet ? 0.95 : 0.5} stroke={p.isFleet ? '#FBF7EF' : color} strokeWidth={p.isFleet ? 2.5 : 1.5} className={p.isFleet ? 'animate-flip' : 'lc-bubble'} style={p.isFleet ? { filter: 'url(#glow)' } : { transition: 'r .25s ease, cx .25s ease, cy .25s ease, fill .25s ease' }} />
              {p.isFleet && <circle cx={cx} cy={cy} r={r + 6} fill="none" stroke={color} strokeWidth="1" opacity="0.35" />}
              {(active || p.isFleet) && (
                <g>
                  <rect x={cx + 12} y={cy - 26} width={Math.max(96, p.label.length * 6.5)} height={36} rx="6" fill="#FFFDF9" stroke="#DBD2BF" />
                  <text x={cx + 20} y={cy - 12} fontSize="11" fill="#1C1812" fontWeight="600">{p.label}</text>
                  <text x={cx + 20} y={cy + 2} fontSize="10" fill="#8C8273" className="num">{fmtNum(p.metric, 1)} {pack.metricUnit} · {fmtInt(p.units)} u</text>
                </g>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
