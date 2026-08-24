import { useMemo, useRef, useState } from 'react'
import type { RulePack } from '../engine/types'
import { fmtInt, fmtNum } from '../engine/engine'
import { brandLogoUrl, brandInitials, brandColor } from '../lib/brands'
import { ptColor, ptRing } from '../lib/palette'

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

/** A past/future year's statutory line, drawn as a ghost so the tightening
 *  trajectory is visible in the chart itself (the walls close in). */
export interface GhostLimit {
  year: number
  draft?: boolean
  limitAt: (mass: number) => number
}

/** Draft-regime stringency as a draggable line: grab the limit line and pull —
 *  the caller solves which targetShiftPct lands it there and commits the lever.
 *  Omit commit for read-only surfaces (Plan is actuals — the line is law-as-
 *  drafted there, not a lever). */
export interface StringencyDrag {
  value: number
  min: number
  max: number
  lineAt: (pct: number) => (mass: number) => number
  solve: (mass: number, targetLimit: number) => number
  commit: (pct: number) => void
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
  /** Other years' statutory lines, ghosted behind the current one. */
  ghosts?: GhostLimit[]
  /** Draft-uncertainty band (fan-chart treatment): the final rules land
   *  between lo and hi. Rendered only when the governing regime is a draft. */
  corridor?: { lo: (mass: number) => number; hi: (mass: number) => number; note: string }
  /** Draggable draft stringency — Model workbench only. */
  stringency?: StringencyDrag
  /** 'line' = the classic EEA-style mass-indexed chart. 'gap' = deviation view:
   *  y is distance to the line, the line becomes the zero axis, under the line
   *  is literally below the axis and gaps are comparable across masses. */
  view?: 'line' | 'gap'
  /** current regime is a draft — the main line renders dashed (not yet law). */
  draftLine?: boolean
  /** Override the line's pill label. China isn't a pass/fail limit — the line is
   *  the CAFC target (达标值 · the zero-credit boundary), so it's relabelled. */
  limitLabel?: string
  /** Where a point SAT before the user moved it (its position with that scope's
   *  own override removed). Drawn as a hollow origin marker and a dashed arrow
   *  to the current position, so a direct-manipulation edit reads as a MOVE
   *  rather than silently redrawing the bubble somewhere else. Persists for as
   *  long as the override does. */
  moved?: Map<string, { mass: number; metric: number }>
  /** Monthly trajectory per point key, oldest → newest (the connected-scatter
   *  convention). A scatter shows a position; the trail shows a DIRECTION —
   *  down the page is cleaner, right is heavier. Each entry is that month
   *  ALONE, so the path actually moves. */
  trails?: Map<string, TrailPoint[]>
}

export interface TrailPoint { mass: number; metric: number; label: string; units: number }

/**
 * Fully custom SVG chart. The limit line rises with mass; the fleet sits as a
 * marker. Below the line is safe (green), above means a fine (red). Everything
 * re-renders instantly when the scenario changes — no animation gate.
 */
export default function LimitChart({ pack, limitAt, points, onPick, height = 360, colorBy = 'status', unitRef, drag, logos, ghosts, corridor, stringency, view = 'line', draftLine, limitLabel, trails, moved }: Props) {
  const [hover, setHover] = useState<string | null>(null)
  const [logoFailed, setLogoFailed] = useState<Set<string>>(new Set())
  const failLogo = (key: string) => setLogoFailed((prev) => { const n = new Set(prev); n.add(key); return n })
  const svgRef = useRef<SVGSVGElement>(null)
  const [ghost, setGhost] = useState<{ key: string; mass: number; metric: number; lines: string[] } | null>(null)
  const dragRef = useRef<{ key: string; startMass: number; startMetric: number; moved: boolean; lastPreview: number } | null>(null)
  // A `click` fires AFTER `pointerup`, by which time endDrag has already cleared
  // dragRef — so guarding the click on dragRef alone always passed and a drag
  // also drilled into the next hierarchy level. This survives that gap.
  const swallowClickRef = useRef(false)
  // stringency line-drag (draft regimes, Model workbench)
  const [lineDrag, setLineDrag] = useState<{ pct: number } | null>(null)
  const lineDragRef = useRef<boolean>(false)
  const W = 760
  const H = height
  const m = { l: 56, r: 24, t: 20, b: 44 }
  const iw = W - m.l - m.r
  const ih = H - m.t - m.b

  const gap = view === 'gap'
  const { xMin, xMax, yLo, yHi, line } = useMemo(() => {
    const masses = points.map((p) => p.mass).filter((x) => x > 0)
    if (trails) for (const tp of trails.values()) for (const q of tp) if (q.mass > 0) masses.push(q.mass)
    const xMin = Math.min(...masses, 1000) - 120
    const xMax = Math.max(...masses, 2000) + 120
    const samples = 40
    const line = Array.from({ length: samples + 1 }, (_, i) => {
      const mass = xMin + ((xMax - xMin) * i) / samples
      return { mass, limit: limitAt(mass) }
    })
    // deviation transform: in gap view every y is measured from the line
    const T = (mass: number, v: number) => (gap ? v - limitAt(mass) : v)
    const vals: number[] = line.map((s) => T(s.mass, s.limit))
    for (const p of points) if (p.mass > 0) vals.push(T(p.mass, p.metric))
    // trail points stretch the domain too, or a path would run off the plot
    if (trails) for (const tp of trails.values()) for (const q of tp) if (q.mass > 0) vals.push(T(q.mass, q.metric))
    for (const g of ghosts ?? []) vals.push(T(xMin, g.limitAt(xMin)), T(xMax, g.limitAt(xMax)))
    if (corridor) vals.push(T(xMin, corridor.lo(xMin)), T(xMax, corridor.lo(xMax)), T(xMin, corridor.hi(xMin)), T(xMax, corridor.hi(xMax)))
    let yLo = gap ? Math.min(0, ...vals) : 0
    let yHi = Math.max(gap ? 0.1 : 1, ...vals)
    const span = yHi - yLo || 1
    yHi += span * 0.16
    if (gap) yLo -= span * 0.12
    return { xMin, xMax, yLo, yHi, line }
  }, [points, limitAt, ghosts, corridor, gap, trails])

  const T = (mass: number, v: number) => (gap ? v - limitAt(mass) : v)
  const sx = (mass: number) => m.l + ((mass - xMin) / (xMax - xMin)) * iw
  const sy = (v: number) => m.t + ih - ((v - yLo) / (yHi - yLo)) * ih
  const syAt = (mass: number, v: number) => sy(T(mass, v))
  // client → domain (for direct manipulation); returns the ABSOLUTE metric
  const domainFromEvent = (e: { clientX: number; clientY: number }) => {
    const el = svgRef.current!
    const r = el.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    const py = ((e.clientY - r.top) / r.height) * H
    const mass = xMin + (Math.min(Math.max(px, m.l), W - m.r) - m.l) / iw * (xMax - xMin)
    const val = yLo + ((m.t + ih - Math.min(Math.max(py, m.t), m.t + ih)) / ih) * (yHi - yLo)
    return { mass, metric: gap ? val + limitAt(mass) : val }
  }
  const startDrag = (p: ChartPoint) => (e: React.PointerEvent) => {
    // Cleared on EVERY pointerdown, including non-draggable points, so a drag
    // that ended off-canvas can never swallow an unrelated later click.
    swallowClickRef.current = false
    if (!drag || !drag.enabled(p)) return
    e.preventDefault(); e.stopPropagation()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    dragRef.current = { key: p.key, startMass: p.mass, startMetric: p.metric, moved: false, lastPreview: 0 }
  }
  const moveDrag = (e: React.PointerEvent) => {
    if (lineDragRef.current && stringency) {
      const { mass, metric } = domainFromEvent(e)
      const pct = Math.round(Math.min(stringency.max, Math.max(stringency.min, stringency.solve(mass, metric))))
      setLineDrag({ pct })
      return
    }
    const d = dragRef.current
    if (!d || !drag) return
    const { mass, metric } = domainFromEvent(e)
    const gMass = drag.lockX ? d.startMass : mass
    d.moved = d.moved || Math.abs(sx(gMass) - sx(d.startMass)) + Math.abs(syAt(gMass, metric) - syAt(d.startMass, d.startMetric)) > 4
    // throttle the engine-solve preview to ~20/s; positions update every frame
    const now = performance.now()
    const lines = now - d.lastPreview > 50 ? drag.preview(d.key, gMass, metric) : (ghost?.lines ?? [])
    if (now - d.lastPreview > 50) d.lastPreview = now
    setGhost({ key: d.key, mass: gMass, metric, lines })
  }
  const endDrag = () => {
    if (lineDragRef.current) {
      lineDragRef.current = false
      if (lineDrag && stringency) stringency.commit(lineDrag.pct)
      setLineDrag(null)
      return
    }
    const d = dragRef.current
    dragRef.current = null
    if (d?.moved) swallowClickRef.current = true
    if (d && ghost && d.moved) drag?.commit(ghost.key, ghost.mass, ghost.metric)
    setGhost(null)
  }
  const startLineDrag = (e: React.PointerEvent) => {
    if (!stringency) return
    e.preventDefault(); e.stopPropagation()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    lineDragRef.current = true
    setLineDrag({ pct: stringency.value })
  }

  const pathOf = (f: (mass: number) => number) =>
    line.map((s, i) => `${i ? 'L' : 'M'}${sx(s.mass).toFixed(1)},${syAt(s.mass, f(s.mass)).toFixed(1)}`).join(' ')
  const linePath = line.map((p, i) => `${i ? 'L' : 'M'}${sx(p.mass).toFixed(1)},${syAt(p.mass, p.limit).toFixed(1)}`).join(' ')
  // shaded "fine" zone = area above the limit line up to the top
  const abovePath =
    `M${sx(line[0].mass)},${m.t} ` +
    line.map((p) => `L${sx(p.mass).toFixed(1)},${syAt(p.mass, p.limit).toFixed(1)}`).join(' ') +
    ` L${sx(line[line.length - 1].mass)},${m.t} Z`

  const yticks = 5
  const xticks = 5
  const yDecimals = yHi - yLo < 8 ? 1 : 0
  // size bubbles against a stable reference (maker total) when provided, else the
  // biggest in view — so even a single bubble scales with its volume.
  const sizeRef = unitRef && unitRef > 0 ? unitRef : Math.max(...points.filter((p) => !p.isFleet).map((p) => p.units), 1)

  // ghost year labels, decluttered (skip a label within 9px of the previous)
  const ghostLabels = useMemo(() => {
    if (!ghosts?.length) return []
    const endMass = line[line.length - 1].mass
    const ls = ghosts
      .map((g) => ({ year: g.year, draft: g.draft, y: sy(T(endMass, g.limitAt(endMass))) }))
      .sort((a, b) => a.y - b.y)
    const out: typeof ls = []
    for (const l of ls) if (!out.length || Math.abs(l.y - out[out.length - 1].y) >= 9) out.push(l)
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ghosts, line, yLo, yHi, gap])

  const pillLabel = limitLabel ?? (gap ? 'THE LINE' : draftLine ? 'DRAFT LIMIT' : 'THE LIMIT')
  const pillW = pillLabel.length * 6.4 + 16

  return (
    <div className="w-full overflow-hidden">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 'auto', touchAction: drag || stringency ? 'none' : undefined }}
        onPointerMove={moveDrag} onPointerUp={endDrag} onPointerLeave={() => { if (dragRef.current || lineDragRef.current) endDrag() }}>
        <defs>
          <linearGradient id="fineZone" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F04A5A" stopOpacity="0.13" />
            <stop offset="62%" stopColor="#F04A5A" stopOpacity="0.045" />
            <stop offset="100%" stopColor="#F04A5A" stopOpacity="0.008" />
          </linearGradient>
          <linearGradient id="safeZone" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#12B981" stopOpacity="0.012" />
            <stop offset="45%" stopColor="#12B981" stopOpacity="0.05" />
            <stop offset="100%" stopColor="#12B981" stopOpacity="0.12" />
          </linearGradient>
          {/* soft, warm drop shadow so each maker sits as a premium coin */}
          <filter id="lcCoin" x="-70%" y="-70%" width="240%" height="240%">
            <feDropShadow dx="0" dy="2.2" stdDeviation="2.6" floodColor="#4A3418" floodOpacity="0.26" />
          </filter>
          <radialGradient id="lcGloss" cx="50%" cy="32%" r="65%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          {/* fan-chart shading for the draft corridor: densest at the centre line */}
          <linearGradient id="corridorFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#E0A100" stopOpacity="0.05" />
            <stop offset="50%" stopColor="#E0A100" stopOpacity="0.13" />
            <stop offset="100%" stopColor="#E0A100" stopOpacity="0.05" />
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
          const v = yLo + ((yHi - yLo) * i) / yticks
          const y = sy(v)
          return (
            <g key={i}>
              <line x1={m.l} y1={y} x2={W - m.r} y2={y} stroke="#1C1812" strokeOpacity="0.045" strokeDasharray="1 5" strokeLinecap="round" />
              <text x={m.l - 10} y={y + 3.5} textAnchor="end" fontSize="10" fontWeight="500" fill="#A79E8C" className="num" letterSpacing="0.2">{gap && v > 0 ? '+' : ''}{fmtNum(v, yDecimals)}</text>
            </g>
          )
        })}
        {/* x labels */}
        {Array.from({ length: xticks + 1 }, (_, i) => {
          const v = xMin + ((xMax - xMin) * i) / xticks
          const x = sx(v)
          return (
            <text key={i} x={x} y={H - m.b + 16} textAnchor="middle" fontSize="10" fontWeight="500" fill="#A79E8C" className="num" letterSpacing="0.2">{fmtInt(v)}</text>
          )
        })}
        <text x={m.l} y={12} fontSize="10" fill="#8C8273" className="uppercase tracking-wider">
          {gap ? `Gap to the line (${pack.metricUnit})` : `${pack.metricLabel} (${pack.metricUnit})`}
        </text>
        <text x={W - m.r} y={H - 6} textAnchor="end" fontSize="10" fill="#8C8273" className="uppercase tracking-wider">{pack.massLabel} (kg)</text>

        {/* draft corridor — where the final rules can land (fan-chart honesty) */}
        {corridor && (() => {
          const lo = line.map((s) => `L${sx(s.mass).toFixed(1)},${syAt(s.mass, corridor.lo(s.mass)).toFixed(1)}`)
          const hiRev = [...line].reverse().map((s) => `L${sx(s.mass).toFixed(1)},${syAt(s.mass, corridor.hi(s.mass)).toFixed(1)}`)
          const band = `M${lo[0].slice(1)} ${lo.slice(1).join(' ')} ${hiRev.join(' ')} Z`
          const labelY = syAt(line[line.length - 1].mass, corridor.hi(line[line.length - 1].mass))
          return (
            <g data-testid="draft-corridor">
              <title>{corridor.note}</title>
              <path d={band} fill="url(#corridorFill)" />
              <path d={pathOf(corridor.lo)} fill="none" stroke="#E0A100" strokeWidth="1" strokeDasharray="2 4" opacity="0.45" />
              <path d={pathOf(corridor.hi)} fill="none" stroke="#E0A100" strokeWidth="1" strokeDasharray="2 4" opacity="0.45" />
              <text x={W - m.r - 4} y={labelY - 5} textAnchor="end" fontSize="8.5" fill="#D98005" opacity="0.85" fontWeight={700} letterSpacing="0.4">DRAFT CORRIDOR ±10%</text>
            </g>
          )
        })()}

        {/* ghost lines — every other year's statutory line (the walls close in) */}
        {ghosts?.map((g) => (
          <path key={g.year} className="lc-ghost" d={pathOf(g.limitAt)} fill="none"
            stroke={g.draft ? '#D98005' : '#8C8273'} strokeWidth="1"
            strokeDasharray={g.draft ? '3 4' : undefined} opacity={g.draft ? 0.28 : 0.22} />
        ))}
        {ghostLabels.map((l) => (
          <text key={l.year} x={W - m.r + 2} y={l.y + 3} fontSize="8" className="num"
            fill={l.draft ? '#D98005' : '#8C8273'} opacity="0.75">{`'${String(l.year).slice(2)}`}</text>
        ))}

        {/* the limit line — dashed while it is still a draft */}
        <path d={linePath} pathLength={1} className="lc-draw" fill="none" stroke="#E0A100" strokeWidth="2.25"
          strokeDasharray={draftLine ? '7 5' : undefined}
          style={{ transition: 'all .25s', filter: 'drop-shadow(0 2px 6px rgba(224,161,0,0.28))' }} />
        {/* stringency drag handle: a wide invisible grab zone along the line */}
        {stringency && (
          <path d={linePath} className="lc-line-handle" fill="none" stroke="transparent" strokeWidth="16"
            style={{ cursor: 'ns-resize' }} onPointerDown={startLineDrag}>
            <title>Drag the line — sets the Draft stringency lever ({stringency.min}% … +{stringency.max}%)</title>
          </path>
        )}
        {(() => {
          const lx = sx(line[line.length - 1].mass)
          const ly = syAt(line[line.length - 1].mass, line[line.length - 1].limit)
          return (
            <g style={{ transition: 'all .25s' }}>
              <g style={{ filter: 'drop-shadow(0 3px 7px rgba(180,120,0,0.32))' }}>
                <rect x={lx - pillW - 4} y={ly - 25} width={pillW} height="18" rx="9" fill="#E7A400" />
              </g>
              <rect x={lx - pillW - 4} y={ly - 25} width={pillW} height="9" rx="9" fill="#F4BE33" opacity="0.55" />
              <text x={lx - 4 - pillW / 2} y={ly - 12.5} textAnchor="middle" fontSize="9.5" fill="#1a1405" fontWeight="900" letterSpacing="0.7">{pillLabel}</text>
              {stringency && stringency.value !== 0 && !lineDrag && (
                <text x={lx - 4 - pillW / 2} y={ly + 12} textAnchor="middle" fontSize="9" fill="#D98005" fontWeight={700} className="num">stringency {stringency.value > 0 ? '+' : ''}{stringency.value}%</text>
              )}
            </g>
          )
        })()}
        {/* stringency drag preview: the line the draft would become */}
        {lineDrag && stringency && (() => {
          const f = stringency.lineAt(lineDrag.pct)
          const midMass = (xMin + xMax) / 2
          const px = sx(midMass)
          const py = syAt(midMass, f(midMass))
          return (
            <g style={{ pointerEvents: 'none' }}>
              <path d={pathOf(f)} fill="none" stroke="#E8223B" strokeWidth="2" strokeDasharray="6 4" opacity="0.9" />
              <rect x={px - 92} y={py - 30} width="184" height="18" rx="9" fill="#17140F" opacity="0.94" />
              <text x={px} y={py - 17} textAnchor="middle" fontSize="10" fill="#FFD9A8" fontWeight={700} className="num">
                Draft stringency {lineDrag.pct > 0 ? '+' : ''}{lineDrag.pct}% — release to apply
              </text>
            </g>
          )
        })()}

        {/* monthly trajectory — drawn BEHIND the bubbles so the current position
            always reads first. Older months fade, so the eye follows the path
            forward without needing a legend. */}
        {trails && [...trails.entries()].map(([key, tp]) => {
          const pt = points.find((q) => q.key === key)
          if (!pt || tp.length < 2) return null
          const dim = hover && hover !== key
          const on = hover === key
          const statusColor = pt.status === 'fine' ? '#ff5d6c' : pt.status === 'compliant' ? '#3ddc97' : pt.status === 'exempt' ? '#ffb454' : '#8C8273'
          const col = colorBy === 'powertrain' ? ptColor(pt.powertrain ?? '') : statusColor
          const xy = tp.map((q) => ({ x: sx(q.mass), y: syAt(q.mass, q.metric), q }))
          const last = xy.length - 1
          // How far the entity actually travelled, in pixels. A maker whose mix
          // barely moves produces a path a few pixels long — annotating that
          // just collides with its own bubble, so the labelling scales with the
          // journey: short paths stay a quiet cluster until hovered.
          const span = Math.max(
            Math.max(...xy.map((v) => v.x)) - Math.min(...xy.map((v) => v.x)),
            Math.max(...xy.map((v) => v.y)) - Math.min(...xy.map((v) => v.y)),
          )
          const showRing = on || span > 14
          const showStartLabel = on || span > 34
          return (
            <g key={`tr-${key}`} opacity={dim ? 0.1 : 1} style={{ transition: 'opacity .15s' }} className="pointer-events-none">
              {/* segment-by-segment opacity ramp: the path fades in toward the
                  present, so direction of travel reads without an arrowhead */}
              {xy.slice(0, -1).map((v, i) => (
                <line key={i} x1={v.x} y1={v.y} x2={xy[i + 1].x} y2={xy[i + 1].y}
                  stroke={col} strokeWidth={on ? 2.4 : 1.6} strokeLinecap="round"
                  strokeOpacity={(on ? 0.35 : 0.2) + ((on ? 0.6 : 0.42) * (i + 1)) / last} />
              ))}
              {xy.slice(0, -1).map((v, i) => (
                <circle key={`d${i}`} cx={v.x} cy={v.y} r={on ? 3 : 2.1} fill={col}
                  fillOpacity={0.2 + (0.6 * i) / last} stroke="#FBF7EF" strokeWidth="0.9" />
              ))}
              {/* where the year started — a hollow ring, so the eye has an anchor */}
              {showRing && (
                <circle cx={xy[0].x} cy={xy[0].y} r={on ? 4.5 : 3.4} fill="#FBF7EF" stroke={col} strokeWidth={on ? 2 : 1.4} strokeOpacity="0.75" />
              )}
              {showStartLabel && (
                <text x={xy[0].x} y={xy[0].y - (on ? 9 : 7)} textAnchor="middle" fontSize={on ? 9 : 8}
                  fontWeight="700" fill={col} fillOpacity={on ? 1 : 0.7} className="num">{xy[0].q.label}</text>
              )}
              {on && xy.slice(1, -1).map((v, i) => (
                <text key={`l${i}`} x={v.x} y={v.y - 7} textAnchor="middle" fontSize="8.5" fontWeight="600" fill={col} className="num">{v.q.label}</text>
              ))}
            </g>
          )
        })}

        {/* points */}
        {/* MOVE TRACE — where a directly-manipulated point started, and the path
            it took. Drawn under the bubbles so it never competes with them, and
            only for points the user actually moved. */}
        {moved && points.map((p) => {
          const from = moved.get(p.key)
          if (!from || p.mass <= 0) return null
          const x0 = sx(from.mass), y0 = syAt(from.mass, from.metric)
          const x1 = sx(p.mass), y1 = syAt(p.mass, p.metric)
          const dx = x1 - x0, dy = y1 - y0
          const len = Math.hypot(dx, dy)
          if (len < 6) return null
          // stop the arrow just short of the bubble so the head stays visible
          const r = Math.max(7, Math.min(26, Math.sqrt((p.units / (unitRef || Math.max(...points.map((q) => q.units), 1))) * 900)))
          const ux = dx / len, uy = dy / len
          const ex = x1 - ux * (r + 3), ey = y1 - uy * (r + 3)
          const improved = p.metric < from.metric
          const col = improved ? '#3ddc97' : '#ffb454'
          const ah = 5.5
          return (
            <g key={`mv-${p.key}`} className="lc-move" pointerEvents="none">
              <circle cx={x0} cy={y0} r={6} fill="none" stroke={col} strokeWidth="1.4" strokeDasharray="2.5 2.5" opacity="0.75" />
              <line x1={x0} y1={y0} x2={ex} y2={ey} stroke={col} strokeWidth="1.5" strokeDasharray="4 3" opacity="0.7" />
              <path
                d={`M${ex},${ey} L${ex - ux * ah + -uy * ah * 0.62},${ey - uy * ah + ux * ah * 0.62} L${ex - ux * ah + uy * ah * 0.62},${ey - uy * ah - ux * ah * 0.62} Z`}
                fill={col} opacity="0.85" />
            </g>
          )
        })}

        {points.map((p) => {
          if (p.mass <= 0) return null
          const cx = sx(p.mass)
          const cy = syAt(p.mass, p.metric)
          const statusColor = p.status === 'fine' ? '#ff5d6c' : p.status === 'compliant' ? '#3ddc97' : p.status === 'exempt' ? '#ffb454' : '#8C8273'
          const color = p.isFleet ? statusColor : colorBy === 'powertrain' ? ptColor(p.powertrain ?? '') : statusColor
          const r = p.isFleet ? 9 : 5 + Math.sqrt(Math.min(1, Math.max(0, p.units) / sizeRef)) * 18
          const active = hover === p.key
          const target = limitAt(p.mass)
          const pGap = p.metric - target
          return (
            <g key={p.key} style={{ cursor: drag?.enabled(p) ? 'grab' : onPick ? 'pointer' : 'default', transition: 'all .25s', opacity: ghost && ghost.key === p.key ? 0.35 : 1 }}
              onMouseEnter={() => setHover(p.key)} onMouseLeave={() => setHover(null)}
              onPointerDown={startDrag(p)}
              onClick={() => {
                // read-and-clear: a drag consumes exactly one click, a plain
                // click still drills.
                if (swallowClickRef.current) { swallowClickRef.current = false; return }
                onPick?.(p.key)
              }}>
              {/* the line is personal: leader + tick at THIS entity's own target */}
              {(p.isFleet || active) && (
                <g>
                  <line x1={cx} y1={cy} x2={cx} y2={syAt(p.mass, target)} stroke={color} strokeWidth="1.5" strokeDasharray="3 3" opacity="0.55" />
                  <circle className="lc-tick" cx={cx} cy={syAt(p.mass, target)} r="3" fill="#E0A100" stroke="#FBF7EF" strokeWidth="1.25" />
                </g>
              )}
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
                const clipId = `lc-clip-${p.key.replace(/[^a-zA-Z0-9]/g, '')}`
                return (
                  <g className="lc-bubble" style={{ transition: 'r .25s ease' }}>
                    {/* the coin: a soft-shadowed white chip carrying the identity */}
                    <g filter="url(#lcCoin)">
                      <circle cx={cx} cy={cy} r={ir + 1.5} fill={failed ? mono : '#FFFFFF'} />
                    </g>
                    {/* status ring — compliance stays legible as a crisp halo */}
                    <circle cx={cx} cy={cy} r={rr} fill={color} fillOpacity={active ? 0.14 : 0.09} stroke={color} strokeWidth={active ? 2.5 : 2} style={{ transition: 'r .25s ease, fill .25s ease, stroke-width .2s ease' }} />
                    <clipPath id={clipId}><circle cx={cx} cy={cy} r={ir} /></clipPath>
                    {!failed && (
                      <image href={url!} x={cx - ir * 0.72} y={cy - ir * 0.72} width={ir * 1.44} height={ir * 1.44}
                        clipPath={`url(#${clipId})`} preserveAspectRatio="xMidYMid meet"
                        style={{ pointerEvents: 'none' }} onError={() => failLogo(p.key)} />
                    )}
                    {failed && (
                      <text x={cx} y={cy + ir * 0.34} textAnchor="middle" fontSize={Math.max(7, ir * 0.9)} fontWeight={800} fill="#fff" style={{ pointerEvents: 'none' }} className="num">{brandInitials(p.label)}</text>
                    )}
                    {/* hairline edge + a soft top gloss for the premium coin feel */}
                    <circle cx={cx} cy={cy} r={ir} fill="url(#lcGloss)" opacity={0.5} style={{ pointerEvents: 'none' }} />
                    <circle cx={cx} cy={cy} r={ir + 1.5} fill="none" stroke="#1C1812" strokeOpacity="0.07" strokeWidth="0.75" style={{ pointerEvents: 'none' }} />
                  </g>
                )
              })()}
              {p.isFleet && <circle cx={cx} cy={cy} r={r + 6} fill="none" stroke={color} strokeWidth="1" opacity="0.35" />}
              {(active || p.isFleet) && (() => {
                // flip the tooltip to the left near the right edge so it never clips
                const gapLine = `target ${fmtNum(target, 1)} · ${pGap > 0 ? `+${fmtNum(pGap, 1)} over` : `${fmtNum(Math.abs(pGap), 1)} under`}`
                const tw = Math.max(112, p.label.length * 6.7 + 22, gapLine.length * 5.8 + 22)
                const flip = cx + 14 + tw > W - m.r
                const tx = flip ? cx - 14 - tw : cx + 14
                const ty = Math.max(m.t + 2, cy - 36)
                return (
                  <g className="lc-tip">
                    <g style={{ filter: 'drop-shadow(0 8px 20px rgba(40,28,10,0.18))' }}>
                      <rect x={tx} y={ty} width={tw} height={54} rx="10" fill="#FFFFFF" stroke="#1C1812" strokeOpacity="0.06" />
                    </g>
                    <rect x={tx} y={ty + 8} width={3} height={38} rx="1.5" fill={color} />
                    <text x={tx + 13} y={ty + 17} fontSize="11" fill="#1C1812" fontWeight="700">{p.label.length > 30 ? p.label.slice(0, 29) + '…' : p.label}</text>
                    <text x={tx + 13} y={ty + 31} fontSize="10" fill="#8C8273" className="num">{fmtNum(p.metric, 1)} {pack.metricUnit} · {fmtInt(p.units)} units</text>
                    <text x={tx + 13} y={ty + 45} fontSize="10" fill={pGap > 0 ? '#E0484D' : '#0E9F6E'} fontWeight={700} className="num">{gapLine}</text>
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
          const gx = sx(ghost.mass), gy = syAt(ghost.mass, ghost.metric)
          const ox = sx(src.mass), oy = syAt(src.mass, src.metric)
          const over = ghost.metric > limitAt(ghost.mass)
          const tw = Math.max(150, ...ghost.lines.map((l) => l.length * 5.6))
          const flip = gx + 14 + tw > W - m.r
          const tx = flip ? gx - 14 - tw : gx + 14
          const ty = Math.max(m.t + 2, Math.min(gy - 10, H - m.b - ghost.lines.length * 13 - 14))
          return (
            <g style={{ pointerEvents: 'none' }}>
              <line x1={ox} y1={oy} x2={gx} y2={gy} stroke="#E8223B" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.7" />
              <line x1={gx} y1={gy} x2={gx} y2={syAt(ghost.mass, limitAt(ghost.mass))} stroke={over ? '#ff5d6c' : '#3ddc97'} strokeWidth="1" strokeDasharray="2 3" opacity="0.7" />
              <circle cx={gx} cy={gy} r={11} fill="#E8223B" fillOpacity="0.22" stroke="#E8223B" strokeWidth="2" strokeDasharray="5 3" />
              <circle cx={gx} cy={gy} r={2.5} fill="#E8223B" />
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
