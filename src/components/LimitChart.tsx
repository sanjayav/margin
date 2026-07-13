import { useMemo, useRef, useState } from 'react'
import type { RulePack } from '../engine/types'
import { fmtInt, fmtNum } from '../engine/engine'
import { brandLogoUrl, brandInitials, brandColor } from '../lib/brands'

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

/** Direct manipulation: drag a bubble to a target position and the caller
 *  SOLVES the levers that get it there (the chart never invents physics —
 *  preview/commit run the engine). lockX pins mass where it isn't a lever. */
export interface DragConfig {
  enabled: (p: ChartPoint) => boolean
  /** live solver preview at a candidate position — lines for the ghost tooltip */
  preview: (key: string, mass: number, metric: number) => string[]
  commit: (key: string, mass: number, metric: number) => void
  lockX?: boolean
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
  drag?: DragConfig
  /** Render each bubble with its company logo (pool/manufacturer levels);
   *  status/powertrain colour moves to the ring. Unresolved or unloadable
   *  logos fall back to a deterministic monogram chip — never a broken image. */
  logos?: boolean
}

/**
 * Fully custom SVG chart. The limit line rises with mass; the fleet sits as a
 * marker. Below the line is safe (green), above means a fine (red). Everything
 * re-renders instantly when the scenario changes — no animation gate.
 */
export default function LimitChart({ pack, limitAt, points, onPick, height = 360, colorBy = 'status', unitRef, drag, logos }: Props) {
  const [hover, setHover] = useState<string | null>(null)
  const [logoFailed, setLogoFailed] = useState<Set<string>>(new Set())
  const failLogo = (key: string) => setLogoFailed((prev) => { const n = new Set(prev); n.add(key); return n })
  const svgRef = useRef<SVGSVGElement>(null)
  const [ghost, setGhost] = useState<{ key: string; mass: number; metric: number; lines: string[] } | null>(null)
  const dragRef = useRef<{ key: string; startMass: number; startMetric: number; moved: boolean; lastPreview: number } | null>(null)
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
  // client → domain (for direct manipulation)
  const domainFromEvent = (e: { clientX: number; clientY: number }) => {
    const el = svgRef.current!
    const r = el.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    const py = ((e.clientY - r.top) / r.height) * H
    const mass = xMin + (Math.min(Math.max(px, m.l), W - m.r) - m.l) / iw * (xMax - xMin)
    const metric = ((m.t + ih - Math.min(Math.max(py, m.t), m.t + ih)) / ih) * yMax
    return { mass, metric }
  }
  const startDrag = (p: ChartPoint) => (e: React.PointerEvent) => {
    if (!drag || !drag.enabled(p)) return
    e.preventDefault(); e.stopPropagation()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    dragRef.current = { key: p.key, startMass: p.mass, startMetric: p.metric, moved: false, lastPreview: 0 }
  }
  const moveDrag = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d || !drag) return
    const { mass, metric } = domainFromEvent(e)
    const gMass = drag.lockX ? d.startMass : mass
    d.moved = d.moved || Math.abs(sx(gMass) - sx(d.startMass)) + Math.abs(sy(metric) - sy(d.startMetric)) > 4
    // throttle the engine-solve preview to ~20/s; positions update every frame
    const now = performance.now()
    const lines = now - d.lastPreview > 50 ? drag.preview(d.key, gMass, metric) : (ghost?.lines ?? [])
    if (now - d.lastPreview > 50) d.lastPreview = now
    setGhost({ key: d.key, mass: gMass, metric, lines })
  }
  const endDrag = () => {
    const d = dragRef.current
    dragRef.current = null
    if (d && ghost && d.moved) drag?.commit(ghost.key, ghost.mass, ghost.metric)
    setGhost(null)
  }

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
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 'auto', touchAction: drag ? 'none' : undefined }}
        onPointerMove={moveDrag} onPointerUp={endDrag} onPointerLeave={() => { if (dragRef.current) endDrag() }}>
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
            <g key={p.key} style={{ cursor: drag?.enabled(p) ? 'grab' : onPick ? 'pointer' : 'default', transition: 'all .25s', opacity: ghost && ghost.key === p.key ? 0.35 : 1 }}
              onMouseEnter={() => setHover(p.key)} onMouseLeave={() => setHover(null)}
              onPointerDown={startDrag(p)}
              onClick={() => { if (!dragRef.current?.moved) onPick?.(p.key) }}>
              {p.isFleet && <line x1={cx} y1={cy} x2={cx} y2={sy(limitAt(p.mass))} stroke={color} strokeWidth="1.5" strokeDasharray="3 3" opacity="0.55" />}
              {(() => {
                const url = logos && !p.isFleet ? brandLogoUrl(p.label) : null
                const showLogo = logos && !p.isFleet
                if (!showLogo) return (
                  <circle cx={cx} cy={cy} r={r + (active ? 3 : 0)} fill={color} fillOpacity={p.isFleet ? 0.95 : 0.5} stroke={p.isFleet ? '#FBF7EF' : color} strokeWidth={p.isFleet ? 2.5 : 1.5} className={p.isFleet ? 'animate-flip' : 'lc-bubble'} style={p.isFleet ? { filter: 'url(#glow)' } : { transition: 'r .25s ease, cx .25s ease, cy .25s ease, fill .25s ease' }} />
                )
                const rr = r + (active ? 3 : 0)
                const ir = Math.max(3, rr - 2.5) // inner disc/logo radius
                const failed = !url || logoFailed.has(p.key)
                const mono = brandColor(p.label)
                return (
                  <g>
                    {/* compliance stays legible: the STATUS ring around the identity */}
                    <circle cx={cx} cy={cy} r={rr} fill={color} fillOpacity={0.16} stroke={color} strokeWidth={2.25} className="lc-bubble" style={{ transition: 'r .25s ease, fill .25s ease, stroke .25s ease' }} />
                    <clipPath id={`lc-clip-${p.key.replace(/[^a-zA-Z0-9]/g, '')}`}><circle cx={cx} cy={cy} r={ir} /></clipPath>
                    <circle cx={cx} cy={cy} r={ir} fill={failed ? mono : '#FFFDF9'} opacity={failed ? 0.92 : 0.96} />
                    {!failed && (
                      <image href={url!} x={cx - ir * 0.72} y={cy - ir * 0.72} width={ir * 1.44} height={ir * 1.44}
                        clipPath={`url(#lc-clip-${p.key.replace(/[^a-zA-Z0-9]/g, '')})`} preserveAspectRatio="xMidYMid meet"
                        style={{ pointerEvents: 'none' }} onError={() => failLogo(p.key)} />
                    )}
                    {failed && (
                      <text x={cx} y={cy + ir * 0.34} textAnchor="middle" fontSize={Math.max(7, ir * 0.9)} fontWeight={800} fill="#fff" style={{ pointerEvents: 'none' }} className="num">{brandInitials(p.label)}</text>
                    )}
                  </g>
                )
              })()}
              {p.isFleet && <circle cx={cx} cy={cy} r={r + 6} fill="none" stroke={color} strokeWidth="1" opacity="0.35" />}
              {(active || p.isFleet) && (() => {
                // flip the tooltip to the left near the right edge so it never clips
                const tw = Math.max(96, p.label.length * 6.5)
                const flip = cx + 12 + tw > W - m.r
                const tx = flip ? cx - 12 - tw : cx + 12
                const ty = Math.max(m.t + 2, cy - 26)
                return (
                  <g>
                    <rect x={tx} y={ty} width={tw} height={36} rx="6" fill="#FFFDF9" stroke="#DBD2BF" style={{ filter: 'drop-shadow(0 3px 8px rgba(60,45,20,0.14))' }} />
                    <text x={tx + 8} y={ty + 14} fontSize="11" fill="#1C1812" fontWeight="600">{p.label}</text>
                    <text x={tx + 8} y={ty + 28} fontSize="10" fill="#8C8273" className="num">{fmtNum(p.metric, 1)} {pack.metricUnit} · {fmtInt(p.units)} u</text>
                  </g>
                )
              })()}
            </g>
          )
        })}
        {/* drag ghost: the target the solver is chasing */}
        {ghost && (() => {
          const src = points.find((p) => p.key === ghost.key)
          if (!src) return null
          const gx = sx(ghost.mass), gy = sy(ghost.metric)
          const ox = sx(src.mass), oy = sy(src.metric)
          const over = ghost.metric > limitAt(ghost.mass)
          const tw = Math.max(150, ...ghost.lines.map((l) => l.length * 5.6))
          const flip = gx + 14 + tw > W - m.r
          const tx = flip ? gx - 14 - tw : gx + 14
          const ty = Math.max(m.t + 2, Math.min(gy - 10, H - m.b - ghost.lines.length * 13 - 14))
          return (
            <g style={{ pointerEvents: 'none' }}>
              <line x1={ox} y1={oy} x2={gx} y2={gy} stroke="#F2510E" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.7" />
              <line x1={gx} y1={gy} x2={gx} y2={sy(limitAt(ghost.mass))} stroke={over ? '#ff5d6c' : '#3ddc97'} strokeWidth="1" strokeDasharray="2 3" opacity="0.7" />
              <circle cx={gx} cy={gy} r={11} fill="#F2510E" fillOpacity="0.22" stroke="#F2510E" strokeWidth="2" strokeDasharray="5 3" />
              <circle cx={gx} cy={gy} r={2.5} fill="#F2510E" />
              <rect x={tx} y={ty} width={tw} height={ghost.lines.length * 13 + 12} rx="7" fill="#17140F" opacity="0.94" />
              {ghost.lines.map((l, i) => (
                <text key={i} x={tx + 9} y={ty + 15 + i * 13} fontSize="10" fill={i === 0 ? '#FFD9A8' : '#EDE6D8'} fontWeight={i === 0 ? 700 : 500} className="num">{l}</text>
              ))}
            </g>
          )
        })()}
      </svg>
    </div>
  )
}
