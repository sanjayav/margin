/* ───────────────────────────────────────────────────────────────────────────
   Charts — SVG primitives for the compliance workspace.
   ---------------------------------------------------------------------------
   Rules baked in here so no caller can break them:
     · ONE y-axis. There is no dual-axis prop and there never will be — two
       measures of different scale are two charts.
     · Series colour comes from the fixed --dv-* order and is keyed to the
       series NAME, not its index in the current filter. Hiding a series must
       not repaint the survivors.
     · ≥2 series always get a legend; ≤4 also get direct end-labels, so identity
       is never carried by colour alone.
     · Grid and axes are recessive; the data is the only thing with contrast.
     · Every plot ships a hover layer. A chart you cannot interrogate is a
       picture of data, not a reading of it.
   ─────────────────────────────────────────────────────────────────────────── */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cx, fmtCompact } from './primitives'
import { prefersReducedMotion, useDragField, useReveal } from './motion'

export const DV = ['var(--dv-1)', 'var(--dv-2)', 'var(--dv-3)', 'var(--dv-4)', 'var(--dv-5)', 'var(--dv-6)'] as const

/** Colour for a series, keyed by its name. Stable under filtering: the same
 *  manufacturer keeps the same hue whether five or fifty are on screen. */
export function seriesColor(name: string, order: string[]): string {
  const i = order.indexOf(name)
  return i < 0 || i >= DV.length ? 'var(--dv-other)' : DV[i]
}

/* ── responsive frame ─────────────────────────────────────────────────────── */

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
    ro.observe(el)
    setW(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

const niceTicks = (min: number, max: number, count = 4): number[] => {
  if (!isFinite(min) || !isFinite(max) || min === max) return [min]
  const raw = (max - min) / count
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag
  const out: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-6; v += step) out.push(+v.toFixed(10))
  return out
}

/* ── shared tooltip ───────────────────────────────────────────────────────── */

function ChartTip({ x, y, w, children }: { x: number; y: number; w: number; children: React.ReactNode }) {
  // Flip to the left when the pointer is in the right third, so the tip never
  // leaves the plot and never covers the point it describes.
  const flip = x > w * 0.62
  return (
    <div className="pointer-events-none absolute z-10 min-w-[132px] rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-1)] px-2.5 py-2 shadow-[var(--sh-3)]"
      style={{ left: x, top: y, transform: `translate(${flip ? 'calc(-100% - 12px)' : '12px'}, -50%)` }}>
      {children}
    </div>
  )
}

const TipRow = ({ color, label, value }: { color?: string; label: React.ReactNode; value: React.ReactNode }) => (
  <div className="flex items-center gap-2 text-[11.5px] leading-[1.7]">
    {color && <span className="h-[7px] w-[7px] shrink-0 rounded-[2px]" style={{ background: color }} />}
    <span className="min-w-0 flex-1 truncate text-[var(--ink-3)]">{label}</span>
    <span className="font-semibold tabular-nums text-[var(--ink-1)]">{value}</span>
  </div>
)

export function Legend({ items, className }: {
  items: { name: string; color: string; muted?: boolean; dashed?: boolean }[]; className?: string
}) {
  if (items.length < 2) return null // one series is named by the title
  return (
    <div className={cx('flex flex-wrap items-center gap-x-3.5 gap-y-1', className)}>
      {items.map((s) => (
        <span key={s.name} className={cx('inline-flex items-center gap-1.5 text-[11.5px]', s.muted ? 'text-[var(--ink-5)]' : 'text-[var(--ink-3)]')}>
          {s.dashed
            ? <svg width="13" height="3" aria-hidden><line x1="0" y1="1.5" x2="13" y2="1.5" stroke={s.color} strokeWidth="2" strokeDasharray="3 2.5" /></svg>
            : <span className="h-[3px] w-[11px] rounded-full" style={{ background: s.color, opacity: s.muted ? 0.4 : 1 }} />}
          {s.name}
        </span>
      ))}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   LineChart — the workhorse: fleet metric vs the regulatory limit over time.
   `band` draws the compliant region, which is the whole point of the chart:
   the reader should see "inside / outside" before they read a single number.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface Series { name: string; points: (number | null)[]; color?: string; dashed?: boolean; area?: boolean }

export function LineChart({
  x, series, height = 220, unit = '', band, refLine, refLabel, format, className, yZero,
}: {
  x: (string | number)[]
  series: Series[]
  height?: number
  unit?: string
  /** Compliant region — [lower, upper] per x-position, or a single limit line. */
  band?: { lower: (number | null)[]; upper: (number | null)[]; label?: string }
  refLine?: (number | null)[]
  refLabel?: string
  format?: (v: number) => string
  className?: string
  yZero?: boolean
}) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const fmt = format ?? ((v: number) => (Math.abs(v) >= 1000 ? v.toLocaleString(undefined, { maximumFractionDigits: 0 }) : v.toFixed(1)))
  // Redraw when the data identity changes, not on every render: a chart that
  // re-animates while you drag a slider is noise, but one that animates when
  // the market or the year changes is telling you it is new.
  const reveal = useReveal(`${x.join()}|${series.map((s) => s.name).join()}`)

  // Direct end-labels are only drawn when there is more than one line to tell
  // apart; a lone series is named by the title above it.
  // Direct end-labels earn their place at two or three lines. At four they
  // stack into a pile wherever the series converge — which on an exposure chart
  // is exactly where they all end up — and the legend above already names them.
  const labelled = series.length <= 3 && series.length > 1
  const shortName = (n: string) => (n.length > 13 ? `${n.slice(0, 12)}…` : n)
  const gutterR = labelled
    ? Math.min(96, 22 + Math.max(...series.map((s) => shortName(s.name).length)) * 5.4)
    : 18
  const pad = { t: 12, r: gutterR, b: 22, l: 50 }
  const iw = Math.max(10, w - pad.l - pad.r)
  const ih = height - pad.t - pad.b

  const all = [
    ...series.flatMap((s) => s.points),
    ...(band?.lower ?? []), ...(band?.upper ?? []), ...(refLine ?? []),
  ].filter((v): v is number => v != null && isFinite(v))
  let lo = Math.min(...all), hi = Math.max(...all)
  if (!isFinite(lo)) { lo = 0; hi = 1 }
  const padY = (hi - lo) * 0.12 || Math.abs(hi) * 0.12 || 1
  // A zero-based axis still needs air below zero: a series that falls to zero
  // otherwise lies exactly on the axis rule and vanishes.
  lo = yZero ? Math.min(0, lo) - Math.abs(hi) * 0.05 : lo - padY
  hi = hi + padY
  const ticks = niceTicks(lo, hi, 4)

  const X = (i: number) => pad.l + (x.length < 2 ? iw / 2 : (i / (x.length - 1)) * iw)
  const Y = (v: number) => pad.t + ih - ((v - lo) / (hi - lo)) * ih

  const path = (pts: (number | null)[]) => {
    let d = '', pen = false
    pts.forEach((v, i) => {
      if (v == null || !isFinite(v)) { pen = false; return }
      d += `${pen ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`
      pen = true
    })
    return d
  }

  const bandPath = useMemo(() => {
    if (!band) return ''
    const up = band.upper.map((v, i) => (v == null ? null : [X(i), Y(v)] as const)).filter(Boolean) as (readonly [number, number])[]
    const dn = band.lower.map((v, i) => (v == null ? null : [X(i), Y(v)] as const)).filter(Boolean) as (readonly [number, number])[]
    if (!up.length || !dn.length) return ''
    return `M${up.map(([a, b]) => `${a.toFixed(1)} ${b.toFixed(1)}`).join('L')}L${dn.reverse().map(([a, b]) => `${a.toFixed(1)} ${b.toFixed(1)}`).join('L')}Z`
  }, [band, w, height, lo, hi]) // eslint-disable-line react-hooks/exhaustive-deps

  const onMove = useCallback((e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const px = e.clientX - r.left
    const i = Math.round(((px - pad.l) / (iw || 1)) * (x.length - 1))
    setHover(i >= 0 && i < x.length ? i : null)
  }, [iw, x.length]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={className}>
      <Legend className="mb-2" items={[
        ...series.map((s, i) => ({ name: s.name, color: s.color ?? DV[i % DV.length], dashed: s.dashed })),
        ...(refLine ? [{ name: refLabel ?? 'Limit', color: 'var(--dv-ref)', dashed: true }] : []),
        ...(band ? [{ name: band.label ?? 'Range', color: 'var(--dv-1)', muted: true }] : []),
      ]} />
      <div ref={ref} className="relative" style={{ height }} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {w > 0 && (
          <svg width={w} height={height} role="img" aria-label={`Line chart${unit ? ` in ${unit}` : ''}`}>
            {/* recessive grid */}
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.l} x2={w - pad.r} y1={Y(t)} y2={Y(t)} stroke="var(--dv-grid)" strokeWidth="1" />
                <text x={pad.l - 8} y={Y(t)} dy="3.5" textAnchor="end" fill="var(--dv-axis)" fontSize="10" className="tabular-nums">{fmt(t)}</text>
              </g>
            ))}
            {bandPath && <path d={bandPath} fill="var(--dv-band)" opacity={reveal} />}
            {refLine && <path d={path(refLine)} fill="none" stroke="var(--dv-ref)" strokeWidth="1.5" strokeDasharray="4 4" opacity={reveal} />}

            {series.map((s, si) => {
              const c = s.color ?? DV[si % DV.length]
              return (
                <g key={s.name}>
                  {s.area && (
                    <path d={`${path(s.points)}L${X(s.points.length - 1)} ${pad.t + ih}L${X(0)} ${pad.t + ih}Z`} fill={c} opacity={0.07 * reveal} />
                  )}
                  <path d={path(s.points)} fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    pathLength={s.dashed ? undefined : 1}
                    strokeDasharray={s.dashed ? '5 4' : 1}
                    strokeDashoffset={s.dashed ? undefined : 1 - reveal} />
                </g>
              )
            })}

            {/* Direct end-labels, de-collided. Identity without a legend lookup,
                even where the lines converge — which is exactly where a reader
                most wants to know which is which. */}
            {labelled && (() => {
              const raw = series
                .map((s, si) => {
                  const li = s.points.reduce<number>((acc, v, i) => (v != null ? i : acc), -1)
                  const lv = li >= 0 ? s.points[li] : null
                  if (lv == null || li !== s.points.length - 1) return null
                  return { name: shortName(s.name), y: Y(lv), x: X(li) + 5, color: s.color ?? DV[si % DV.length] }
                })
                .filter(Boolean) as { name: string; y: number; x: number; color: string }[]
              raw.sort((a, b) => a.y - b.y)
              const GAP = 11.5
              for (let i = 1; i < raw.length; i++) {
                if (raw[i].y - raw[i - 1].y < GAP) raw[i].y = raw[i - 1].y + GAP
              }
              // Keep the whole stack inside the plot.
              const overflow = raw.length ? raw[raw.length - 1].y - (pad.t + ih) : 0
              if (overflow > 0) for (const r of raw) r.y -= overflow
              return raw.map((r) => (
                <text key={r.name} x={r.x} y={r.y} dy="3.5" fill={r.color} fontSize="10" fontWeight="600" opacity={reveal}>{r.name}</text>
              ))
            })()}

            {/* hover layer */}
            {hover != null && (
              <>
                <line x1={X(hover)} x2={X(hover)} y1={pad.t} y2={pad.t + ih} stroke="var(--line-strong)" strokeWidth="1" />
                {series.map((s, si) => {
                  const v = s.points[hover]
                  if (v == null) return null
                  return <circle key={s.name} cx={X(hover)} cy={Y(v)} r="4" fill={s.color ?? DV[si % DV.length]} stroke="var(--surface-1)" strokeWidth="2" />
                })}
              </>
            )}

            {x.map((lbl, i) => (
              (x.length <= 9 || i % Math.ceil(x.length / 8) === 0) &&
              <text key={i} x={X(i)} y={height - 5} textAnchor="middle" fill="var(--dv-axis)" fontSize="10">{lbl}</text>
            ))}
          </svg>
        )}
        {hover != null && (
          <ChartTip x={X(hover)} y={height / 2} w={w}>
            <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[.05em] text-[var(--ink-4)]">{x[hover]}</div>
            {series.map((s, si) => s.points[hover] == null ? null : (
              <TipRow key={s.name} color={s.color ?? DV[si % DV.length]} label={s.name} value={`${fmt(s.points[hover] as number)}${unit ? ` ${unit}` : ''}`} />
            ))}
            {refLine?.[hover] != null && <TipRow label={refLabel ?? 'Limit'} value={`${fmt(refLine[hover] as number)}${unit ? ` ${unit}` : ''}`} />}
          </ChartTip>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   BarChart — magnitude by category. Horizontal by default: category labels
   read left-to-right without a 45° tilt, and the list can be long.
   ═══════════════════════════════════════════════════════════════════════════ */

export function BarChart({ data, height, format, unit, className, max, onSelect, selected }: {
  data: { label: string; value: number; tone?: string; sub?: string }[]
  height?: number; format?: (v: number) => string; unit?: string; className?: string; max?: number
  onSelect?: (label: string) => void; selected?: string
}) {
  const fmt = format ?? ((v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 1 }))
  const hi = max ?? Math.max(...data.map((d) => Math.abs(d.value)), 1)
  return (
    <div className={cx('flex flex-col gap-[7px]', className)} style={height ? { height, overflowY: 'auto' } : undefined}>
      {data.map((d) => {
        const pct = (Math.abs(d.value) / hi) * 100
        const on = selected === d.label
        return (
          <button key={d.label} onClick={onSelect ? () => onSelect(d.label) : undefined}
            className={cx('group grid w-full grid-cols-[132px_1fr_auto] items-center gap-3 rounded-[var(--r-xs)] px-1 py-0.5 text-left transition-colors',
              onSelect && 'cursor-pointer hover:bg-[var(--surface-2)]', on && 'bg-[var(--brand-tint)]')}>
            <span className="truncate text-[12px] text-[var(--ink-2)]" title={d.label}>{d.label}</span>
            <span className="relative h-[9px] rounded-[3px] bg-[var(--surface-3)]">
              <span className="absolute inset-y-0 left-0 rounded-[3px] transition-[width] duration-slow ease-decel"
                style={{ width: `${pct}%`, background: d.tone ?? 'var(--dv-1)' }} />
            </span>
            <span className="min-w-[62px] text-right text-[12px] font-semibold tabular-nums text-[var(--ink-1)]">
              {fmt(d.value)}{unit && <span className="ml-0.5 font-normal text-[var(--ink-4)]">{unit}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Waterfall — how a gap is built. The one chart that explains a compliance
   position better than any table: start, each contribution, end.
   ═══════════════════════════════════════════════════════════════════════════ */

export function Waterfall({ steps, height = 210, unit, format, className }: {
  steps: { label: string; value: number; kind?: 'start' | 'delta' | 'end' }[]
  height?: number; unit?: string; format?: (v: number) => string; className?: string
}) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const fmt = format ?? ((v: number) => v.toFixed(1))

  // Running totals: a 'delta' moves the level, a 'start'/'end' pins it.
  const bars = useMemo(() => {
    let run = 0
    return steps.map((s) => {
      const kind = s.kind ?? 'delta'
      if (kind === 'start') { run = s.value; return { ...s, kind, from: 0, to: s.value } }
      if (kind === 'end') { const b = { ...s, kind, from: 0, to: s.value }; run = s.value; return b }
      const from = run; run += s.value
      return { ...s, kind, from, to: run }
    })
  }, [steps])

  const vals = bars.flatMap((b) => [b.from, b.to])
  const lo = Math.min(0, ...vals), hi = Math.max(...vals)
  const span = hi - lo || 1
  // Size the left gutter to the widest label this chart will actually draw,
  // rather than to a constant that happens to work for small numbers.
  const gutter = Math.min(96, 16 + Math.max(...niceTicks(lo, hi, 3).map((t) => fmt(t).length)) * 6.6)
  const pad = { t: 10, r: 10, b: 34, l: gutter }
  const ih = height - pad.t - pad.b
  const iw = Math.max(10, w - pad.l - pad.r)
  const bw = Math.min(46, (iw / bars.length) * 0.62)
  const X = (i: number) => pad.l + (i + 0.5) * (iw / bars.length)
  const Y = (v: number) => pad.t + ih - ((v - lo) / span) * ih
  const ticks = niceTicks(lo, hi, 3)

  return (
    <div className={className}>
      <div ref={ref} className="relative" style={{ height }} onMouseLeave={() => setHover(null)}>
        {w > 0 && (
          <svg width={w} height={height} role="img" aria-label="Waterfall of contributions">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.l} x2={w - pad.r} y1={Y(t)} y2={Y(t)} stroke="var(--dv-grid)" />
                <text x={pad.l - 8} y={Y(t)} dy="3.5" textAnchor="end" fill="var(--dv-axis)" fontSize="10" className="tabular-nums">{fmt(t)}</text>
              </g>
            ))}
            {bars.map((b, i) => {
              const y = Y(Math.max(b.from, b.to))
              const h = Math.max(2, Math.abs(Y(b.from) - Y(b.to)))
              const fill = b.kind !== 'delta' ? 'var(--ink-3)' : b.value >= 0 ? 'var(--neg)' : 'var(--pos)'
              return (
                <g key={i} onMouseEnter={() => setHover(i)}>
                  {i > 0 && bars[i - 1].kind === 'delta' && b.kind === 'delta' && (
                    <line x1={X(i - 1) + bw / 2} x2={X(i) - bw / 2} y1={Y(b.from)} y2={Y(b.from)} stroke="var(--line-strong)" strokeDasharray="3 3" />
                  )}
                  <rect x={X(i) - bw / 2} y={y} width={bw} height={h} rx="3" fill={fill} opacity={hover == null || hover === i ? 1 : 0.45} />
                  {/* invisible, generous hit target */}
                  <rect x={X(i) - (iw / bars.length) / 2} y={pad.t} width={iw / bars.length} height={ih} fill="transparent" />
                  <text x={X(i)} y={height - 20} textAnchor="middle" fill="var(--dv-axis)" fontSize="10">
                    {b.label.length > 11 ? `${b.label.slice(0, 10)}…` : b.label}
                  </text>
                  <text x={X(i)} y={height - 7} textAnchor="middle" fontSize="10" fontWeight="600"
                    fill={b.kind !== 'delta' ? 'var(--ink-2)' : b.value >= 0 ? 'var(--neg-ink)' : 'var(--pos-ink)'} className="tabular-nums">
                    {b.kind === 'delta' ? `${b.value > 0 ? '+' : ''}${fmt(b.value)}` : fmt(b.to)}
                  </text>
                </g>
              )
            })}
          </svg>
        )}
        {hover != null && (
          <ChartTip x={X(hover)} y={height / 2} w={w}>
            <div className="mb-1 text-[11.5px] font-semibold text-[var(--ink-1)]">{bars[hover].label}</div>
            <TipRow label={bars[hover].kind === 'delta' ? 'Contribution' : 'Level'} value={`${fmt(bars[hover].kind === 'delta' ? bars[hover].value : bars[hover].to)}${unit ? ` ${unit}` : ''}`} />
            <TipRow label="Running" value={`${fmt(bars[hover].to)}${unit ? ` ${unit}` : ''}`} />
          </ChartTip>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   ShareBar — composition as one 100% bar. Deliberately NOT a donut: angle is
   the hardest encoding to compare, and these shares are always compared.
   ═══════════════════════════════════════════════════════════════════════════ */

export function ShareBar({ parts, height = 12, className, showLegend = true }: {
  parts: { name: string; value: number; color?: string }[]; height?: number; className?: string; showLegend?: boolean
}) {
  const shown = parts.filter((p) => p.value > 0)
  const total = shown.reduce((a, p) => a + p.value, 0) || 1
  return (
    <div className={className}>
      {/* 2px surface gaps between segments — the spacer that stops two adjacent
          fills reading as one block. */}
      <div className="flex overflow-hidden rounded-full" style={{ height, gap: 2 }}>
        {shown.map((p, i) => (
          <div key={p.name} title={`${p.name} · ${((p.value / total) * 100).toFixed(1)}%`}
            className="transition-[flex-grow] duration-slow ease-decel first:rounded-l-full last:rounded-r-full"
            style={{ flexGrow: Math.max(p.value, 0), flexBasis: 0, background: p.color ?? DV[i % DV.length] }} />
        ))}
      </div>
      {showLegend && (
        <div className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1">
          {shown.map((p, i) => (
            <span key={p.name} className="inline-flex items-center gap-1.5 text-[11.5px] text-[var(--ink-3)]">
              <span className="h-[7px] w-[7px] rounded-[2px]" style={{ background: p.color ?? DV[i % DV.length] }} />
              {p.name}
              <span className="font-semibold tabular-nums text-[var(--ink-1)]">{((p.value / total) * 100).toFixed(0)}%</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Scatter — the fleet explorer: mass vs CO₂, area = volume, line = the limit.
   ═══════════════════════════════════════════════════════════════════════════ */

export function Scatter({ points, xLabel, yLabel, limitFn, height = 300, className, onSelect, format }: {
  points: { x: number; y: number; size: number; label: string; tone?: string; sub?: string }[]
  xLabel: string; yLabel: string
  /** The regulatory limit as a function of x — drawn as the decision line. */
  limitFn?: (x: number) => number
  height?: number; className?: string; onSelect?: (label: string) => void; format?: (v: number) => string
}) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const fmt = format ?? ((v: number) => v.toFixed(1))
  const reveal = useReveal(points.map((p) => p.label).join())
  const pad = { t: 14, r: 16, b: 32, l: 46 }
  const iw = Math.max(10, w - pad.l - pad.r), ih = height - pad.t - pad.b

  const xs = points.map((p) => p.x), ys = points.map((p) => p.y)
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
  const xp = (x1 - x0) * 0.08 || 1, yp = (y1 - y0) * 0.12 || 1
  const XL = x0 - xp, XH = x1 + xp, YL = y0 - yp, YH = y1 + yp
  const X = (v: number) => pad.l + ((v - XL) / (XH - XL)) * iw
  const Y = (v: number) => pad.t + ih - ((v - YL) / (YH - YL)) * ih
  const maxSize = Math.max(...points.map((p) => p.size), 1)
  const R = (s: number) => 4 + Math.sqrt(s / maxSize) * 17   // area-proportional, ≥8px diameter

  return (
    <div className={className}>
      <div ref={ref} className="relative" style={{ height }} onMouseLeave={() => setHover(null)}>
        {w > 0 && (
          <svg width={w} height={height} role="img" aria-label={`${yLabel} against ${xLabel}`}>
            {niceTicks(YL, YH, 4).map((t) => (
              <g key={`y${t}`}>
                <line x1={pad.l} x2={w - pad.r} y1={Y(t)} y2={Y(t)} stroke="var(--dv-grid)" />
                <text x={pad.l - 8} y={Y(t)} dy="3.5" textAnchor="end" fill="var(--dv-axis)" fontSize="10" className="tabular-nums">{fmt(t)}</text>
              </g>
            ))}
            {niceTicks(XL, XH, 4).map((t) => (
              <text key={`x${t}`} x={X(t)} y={height - 16} textAnchor="middle" fill="var(--dv-axis)" fontSize="10" className="tabular-nums">{Math.round(t)}</text>
            ))}
            {limitFn && (
              <>
                <path d={`M${X(XL)} ${Y(limitFn(XL))}L${X(XH)} ${Y(limitFn(XH))}`} stroke="var(--dv-ref)" strokeWidth="1.5" strokeDasharray="5 4" fill="none" />
                <text x={w - pad.r} y={Y(limitFn(XH)) - 6} textAnchor="end" fill="var(--dv-axis)" fontSize="10" fontWeight="600">Limit</text>
              </>
            )}
            {points.map((p, i) => (
              // Staggered by index so the field fills in rather than flashing.
              <circle key={p.label} cx={X(p.x)} cy={Y(p.y)}
                r={R(p.size) * Math.min(1, Math.max(0, (reveal - (i / Math.max(points.length, 1)) * 0.35) / 0.65))}
                fill={p.tone ?? 'var(--dv-1)'} fillOpacity={hover === i ? 0.42 : 0.24}
                stroke={p.tone ?? 'var(--dv-1)'} strokeWidth={hover === i ? 2.5 : 1.5}
                className={onSelect ? 'cursor-pointer' : undefined}
                onMouseEnter={() => setHover(i)} onClick={() => onSelect?.(p.label)} />
            ))}
            <text x={w / 2} y={height - 2} textAnchor="middle" fill="var(--dv-axis)" fontSize="10">{xLabel}</text>
            <text x={11} y={pad.t + ih / 2} textAnchor="middle" fill="var(--dv-axis)" fontSize="10" transform={`rotate(-90 11 ${pad.t + ih / 2})`}>{yLabel}</text>
          </svg>
        )}
        {hover != null && (
          <ChartTip x={X(points[hover].x)} y={Y(points[hover].y)} w={w}>
            <div className="mb-1 text-[11.5px] font-semibold text-[var(--ink-1)]">{points[hover].label}</div>
            <TipRow label={yLabel} value={fmt(points[hover].y)} />
            <TipRow label={xLabel} value={Math.round(points[hover].x).toLocaleString()} />
            <TipRow label="Volume" value={points[hover].size.toLocaleString()} />
            {points[hover].sub && <div className="mt-1 border-t border-[var(--line-soft)] pt-1 text-[11px] text-[var(--ink-4)]">{points[hover].sub}</div>}
          </ChartTip>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Sparkline — a trend glyph for a table cell. No axes, no legend, no tooltip:
   it is a shape, and the number it belongs to is already in the row.
   ═══════════════════════════════════════════════════════════════════════════ */

export function Sparkline({ points, w = 68, h = 20, tone = 'var(--dv-1)', refLevel }: {
  points: number[]; w?: number; h?: number; tone?: string; refLevel?: number
}) {
  if (points.length < 2) return <span className="inline-block" style={{ width: w, height: h }} />
  const lo = Math.min(...points, ...(refLevel != null ? [refLevel] : []))
  const hi = Math.max(...points, ...(refLevel != null ? [refLevel] : []))
  const span = hi - lo || 1
  const X = (i: number) => (i / (points.length - 1)) * (w - 3) + 1.5
  const Y = (v: number) => h - 2 - ((v - lo) / span) * (h - 4)
  const last = points[points.length - 1]
  return (
    <svg width={w} height={h} className="overflow-visible" aria-hidden>
      {refLevel != null && <line x1="0" x2={w} y1={Y(refLevel)} y2={Y(refLevel)} stroke="var(--dv-ref)" strokeWidth="1" strokeDasharray="2 2" />}
      <path d={points.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join('')}
        fill="none" stroke={tone} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={X(points.length - 1)} cy={Y(last)} r="2" fill={tone} />
    </svg>
  )
}

/** A single value against its limit, as a bar. Used in every table that lists
 *  manufacturers: position is legible before the number is read. */
export function GaugeBar({ value, limit, width = 92, tone }: { value: number; limit: number; width?: number; tone?: string }) {
  const span = Math.max(value, limit) * 1.18 || 1
  const v = (value / span) * width, l = (limit / span) * width
  const over = value > limit
  return (
    <span className="relative inline-block align-middle" style={{ width, height: 9 }}>
      <span className="absolute inset-0 rounded-[3px] bg-[var(--surface-3)]" />
      <span className="absolute inset-y-0 left-0 rounded-[3px]" style={{ width: v, background: tone ?? (over ? 'var(--neg)' : 'var(--pos)') }} />
      <span className="absolute -top-[2px] h-[13px] w-[1.5px] rounded-full bg-[var(--ink-3)]" style={{ left: l }} title="Limit" />
    </span>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   ── SECOND WAVE ──
   Richer forms, and motion that means something. Everything below draws itself
   in when it is computed, because a chart appearing is the signal that the
   number behind it just changed.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Dumbbell — one row per entity, a line from its LIMIT to its ACTUAL.
 *  The best form for "who is over, and by how much", because the gap is drawn
 *  as a physical distance rather than inferred from two columns of digits. */
export function Dumbbell({ rows, unit, height, format, onSelect, selected, animateKey }: {
  rows: { label: string; limit: number; actual: number; volume?: number }[]
  unit?: string; height?: number; format?: (v: number) => string
  onSelect?: (label: string) => void; selected?: string; animateKey?: unknown
}) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<string | null>(null)
  const p = useReveal(animateKey ?? rows.length)
  const fmt = format ?? ((v: number) => v.toFixed(1))

  const all = rows.flatMap((r) => [r.limit, r.actual])
  const lo = Math.min(...all), hi = Math.max(...all)
  const padX = (hi - lo) * 0.1 || 1
  const L = 148, R = 76
  const iw = Math.max(10, w - L - R)
  const X = (v: number) => L + ((v - (lo - padX)) / ((hi + padX) - (lo - padX))) * iw

  return (
    <div ref={ref} style={height ? { maxHeight: height, overflowY: 'auto' } : undefined}>
      {w > 0 && rows.map((r, i) => {
        const over = r.actual > r.limit
        const on = selected === r.label || hover === r.label
        // Each row animates from its limit toward its actual, so the eye sees
        // the gap open up rather than being handed it.
        const a = r.limit + (r.actual - r.limit) * p
        return (
          <button key={r.label} onClick={onSelect ? () => onSelect(r.label) : undefined}
            onMouseEnter={() => setHover(r.label)} onMouseLeave={() => setHover(null)}
            className={cx('flex w-full items-center rounded-[var(--r-xs)] py-[3px] text-left transition-colors',
              onSelect && 'cursor-pointer', on && 'bg-[var(--surface-2)]')}>
            <span className="w-[144px] shrink-0 truncate pl-1 pr-2 text-[12px] text-[var(--ink-2)]" title={r.label}>{r.label}</span>
            <svg width={Math.max(10, w - L)} height="20" className="shrink-0 overflow-visible" style={{ marginLeft: -0 }}>
              <line x1={X(r.limit) - L} x2={X(a) - L} y1="10" y2="10"
                stroke={over ? 'var(--neg)' : 'var(--pos)'} strokeWidth={on ? 3.5 : 2.5} strokeLinecap="round" opacity=".9" />
              {/* the limit: a hollow anchor, because it is the rule, not a result */}
              <circle cx={X(r.limit) - L} cy="10" r="4" fill="var(--surface-1)" stroke="var(--ink-3)" strokeWidth="1.6" />
              {/* the actual: solid, coloured by which side of the line it is on */}
              <circle cx={X(a) - L} cy="10" r={on ? 5.5 : 4.5} fill={over ? 'var(--neg)' : 'var(--pos)'}
                stroke="var(--surface-1)" strokeWidth="1.5" />
            </svg>
            <span className={cx('w-[72px] shrink-0 pl-2 text-right text-[12px] font-semibold tabular-nums',
              over ? 'text-[var(--neg-ink)]' : 'text-[var(--pos-ink)]')}>
              {over ? '+' : ''}{fmt((r.actual - r.limit) * p)}{unit ? <span className="ml-0.5 font-normal text-[var(--ink-4)]">{unit}</span> : null}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** Stacked area — composition over time. Used for the powertrain mix
 *  trajectory, where the reader needs both the shape of each band and the shape
 *  of the whole. 2px surface gaps keep adjacent bands from reading as one. */
export function StackedArea({ x, series, height = 240, unit, format, className, animateKey }: {
  x: (string | number)[]
  series: { name: string; points: number[]; color?: string }[]
  height?: number; unit?: string; format?: (v: number) => string; className?: string; animateKey?: unknown
}) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const p = useReveal(animateKey ?? x.length)
  const fmt = format ?? ((v: number) => `${v.toFixed(0)}%`)
  const pad = { t: 10, r: 14, b: 22, l: 42 }
  const iw = Math.max(10, w - pad.l - pad.r), ih = height - pad.t - pad.b

  const totals = x.map((_, i) => series.reduce((a, s) => a + (s.points[i] ?? 0), 0) || 1)
  const X = (i: number) => pad.l + (x.length < 2 ? iw / 2 : (i / (x.length - 1)) * iw)
  const Y = (frac: number) => pad.t + ih - frac * ih * p

  // Cumulative fractions, bottom band first.
  const stacked = series.map((s, si) => x.map((_, i) => {
    const below = series.slice(0, si).reduce((a, o) => a + (o.points[i] ?? 0), 0)
    return { lo: below / totals[i], hi: (below + (s.points[i] ?? 0)) / totals[i] }
  }))

  return (
    <div className={className}>
      <Legend className="mb-2" items={series.map((s, i) => ({ name: s.name, color: s.color ?? DV[i % DV.length] }))} />
      <div ref={ref} className="relative" style={{ height }}
        onMouseMove={(e) => {
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
          const i = Math.round((((e.clientX - r.left) - pad.l) / (iw || 1)) * (x.length - 1))
          setHover(i >= 0 && i < x.length ? i : null)
        }}
        onMouseLeave={() => setHover(null)}>
        {w > 0 && (
          <svg width={w} height={height} role="img" aria-label="Composition over time">
            {[0, 0.25, 0.5, 0.75, 1].map((f) => (
              <g key={f}>
                <line x1={pad.l} x2={w - pad.r} y1={pad.t + ih - f * ih} y2={pad.t + ih - f * ih} stroke="var(--dv-grid)" />
                <text x={pad.l - 7} y={pad.t + ih - f * ih} dy="3.5" textAnchor="end" fill="var(--dv-axis)" fontSize="10">{Math.round(f * 100)}%</text>
              </g>
            ))}
            {stacked.map((band, si) => {
              const top = band.map((b, i) => `${X(i).toFixed(1)} ${Y(b.hi).toFixed(1)}`).join('L')
              const bot = [...band].map((b, i) => ({ b, i })).reverse().map(({ b, i }) => `${X(i).toFixed(1)} ${Y(b.lo).toFixed(1)}`).join('L')
              const c = series[si].color ?? DV[si % DV.length]
              return (
                <path key={series[si].name} d={`M${top}L${bot}Z`} fill={c} fillOpacity={hover == null ? 0.82 : 0.5}
                  stroke="var(--surface-1)" strokeWidth="2" />
              )
            })}
            {hover != null && <line x1={X(hover)} x2={X(hover)} y1={pad.t} y2={pad.t + ih} stroke="var(--ink-2)" strokeWidth="1" />}
            {x.map((lbl, i) => (
              (x.length <= 9 || i % Math.ceil(x.length / 8) === 0) &&
              <text key={i} x={X(i)} y={height - 5} textAnchor="middle" fill="var(--dv-axis)" fontSize="10">{lbl}</text>
            ))}
          </svg>
        )}
        {hover != null && (
          <ChartTip x={X(hover)} y={height / 2} w={w}>
            <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[.05em] text-[var(--ink-4)]">{x[hover]}</div>
            {[...series].reverse().map((s) => {
              const i = series.indexOf(s)
              const v = (s.points[hover] ?? 0) / totals[hover] * 100
              return <TipRow key={s.name} color={s.color ?? DV[i % DV.length]} label={s.name} value={`${v.toFixed(1)}%`} />
            })}
          </ChartTip>
        )}
      </div>
    </div>
  )
}

/** Tornado — which assumption moves the answer most. Sorted by span, because
 *  the whole question this chart answers is "what should I argue about first". */
export function Tornado({ rows, baseline, format, unit, className, animateKey }: {
  rows: { label: string; low: number; high: number; lowNote?: string; highNote?: string }[]
  baseline: number; format?: (v: number) => string; unit?: string; className?: string; animateKey?: unknown
}) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const p = useReveal(animateKey ?? rows.length)
  const fmt = format ?? ((v: number) => v.toFixed(1))
  const sorted = [...rows].sort((a, b) => Math.abs(b.high - b.low) - Math.abs(a.high - a.low))
  const all = [...sorted.flatMap((r) => [r.low, r.high]), baseline]
  const lo = Math.min(...all), hi = Math.max(...all)
  const span = (hi - lo) || 1
  const L = 176, R = 92
  const iw = Math.max(10, w - L - R)
  const X = (v: number) => L + ((v - lo) / span) * iw
  const zero = X(baseline)

  return (
    <div ref={ref} className={className}>
      {w > 0 && (
        <>
          <div className="mb-1.5 flex items-center gap-1.5 text-[10.5px] text-[var(--ink-4)]" style={{ paddingLeft: L }}>
            <span className="h-[9px] w-px bg-[var(--ink-3)]" />
            baseline {fmt(baseline)}{unit ? ` ${unit}` : ''}
          </div>
          {sorted.map((r, i) => {
            const a = Math.min(r.low, r.high), b = Math.max(r.low, r.high)
            // Bars grow outward from the baseline, so the reader watches each
            // assumption push the answer away from the house view.
            const aa = baseline + (a - baseline) * p, bb = baseline + (b - baseline) * p
            const on = hover === i
            return (
              <div key={r.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
                className={cx('flex items-center rounded-[var(--r-xs)] py-[3px] transition-colors', on && 'bg-[var(--surface-2)]')}>
                <span className="w-[172px] shrink-0 truncate pr-2 text-[12px] text-[var(--ink-2)]" title={r.label}>{r.label}</span>
                <svg width={Math.max(10, w - L)} height="22" className="shrink-0">
                  <line x1={zero - L} x2={zero - L} y1="1" y2="21" stroke="var(--ink-3)" strokeWidth="1" strokeDasharray="2 2" />
                  <rect x={X(aa) - L} y="5" width={Math.max(1.5, X(bb) - X(aa))} height="12" rx="3"
                    fill={on ? 'var(--dv-1)' : 'var(--dv-1)'} opacity={on ? 0.95 : 0.7} />
                </svg>
                <span className="w-[88px] shrink-0 pl-2 text-right text-[11.5px] font-semibold tabular-nums text-[var(--ink-1)]">
                  ±{fmt(Math.abs(b - a) / 2)}
                </span>
              </div>
            )
          })}
          {hover != null && (
            <div className="mt-2 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-2)] px-2.5 py-2 text-[11px] leading-relaxed text-[var(--ink-3)]">
              <b className="text-[var(--ink-1)]">{sorted[hover].label}</b> — low {fmt(sorted[hover].low)}{unit ? ` ${unit}` : ''}
              {sorted[hover].lowNote ? ` (${sorted[hover].lowNote})` : ''} · high {fmt(sorted[hover].high)}{unit ? ` ${unit}` : ''}
              {sorted[hover].highNote ? ` (${sorted[hover].highNote})` : ''}
            </div>
          )}
        </>
      )}
    </div>
  )
}

/** FieldPad — a draggable two-lever position field.
 *
 *  The background is a grid of ENGINE-COMPUTED gaps: for each combination of the
 *  two levers, what the fleet's distance from its limit would be. The contour is
 *  where that distance crosses zero — the compliance frontier. Dragging the puck
 *  sets both levers at once and the whole workspace re-derives live.
 *
 *  This exists because two-lever trade-offs are the thing sliders are worst at:
 *  a user moving one slider at a time cannot see that the two interact, and in a
 *  mass-based regime they interact strongly — a heavier fleet gets a looser
 *  target, so mass moves the line as well as the position. */
export function FieldPad({
  grid, xRange, yRange, xLabel, yLabel, xUnit, yUnit, value, onChange, height = 300, format, marker,
}: {
  /** grid[row][col] — row 0 is the TOP of the field (yRange[1]). */
  grid: number[][]
  xRange: [number, number]; yRange: [number, number]
  xLabel: string; yLabel: string; xUnit?: string; yUnit?: string
  value: { x: number; y: number }
  onChange: (x: number, y: number) => void
  height?: number
  format?: (v: number) => string
  /** Where the book of record sits, for comparison. */
  marker?: { x: number; y: number; label: string }
}) {
  const [box, w] = useWidth<HTMLDivElement>()
  const fmt = format ?? ((v: number) => v.toFixed(1))
  const rows = grid.length, cols = grid[0]?.length ?? 0

  const { ref: dragRef, dragging, handlers } = useDragField((fx, fy) => {
    onChange(
      xRange[0] + fx * (xRange[1] - xRange[0]),
      yRange[1] - fy * (yRange[1] - yRange[0]),
    )
  })

  const pad = { t: 8, r: 8, b: 30, l: 46 }
  const iw = Math.max(10, w - pad.l - pad.r), ih = height - pad.t - pad.b
  const fx = (value.x - xRange[0]) / (xRange[1] - xRange[0] || 1)
  const fy = (yRange[1] - value.y) / (yRange[1] - yRange[0] || 1)

  // Gap at the puck, bilinear over the grid — good enough for a live readout;
  // the authoritative number is the one the engine returns for the exact levers.
  const gapAt = (gx: number, gy: number) => {
    if (!rows || !cols) return 0
    const c = Math.min(cols - 1, Math.max(0, gx * (cols - 1)))
    const r = Math.min(rows - 1, Math.max(0, gy * (rows - 1)))
    const c0 = Math.floor(c), r0 = Math.floor(r), c1 = Math.min(cols - 1, c0 + 1), r1 = Math.min(rows - 1, r0 + 1)
    const tc = c - c0, tr = r - r0
    return (grid[r0][c0] * (1 - tc) + grid[r0][c1] * tc) * (1 - tr)
         + (grid[r1][c0] * (1 - tc) + grid[r1][c1] * tc) * tr
  }
  const here = gapAt(fx, fy)

  const worst = Math.max(...grid.flat().map(Math.abs), 0.001)
  const cellW = iw / (cols || 1), cellH = ih / (rows || 1)

  return (
    <div>
      <div ref={box} className="relative select-none" style={{ height }}>
        {w > 0 && (
          <>
            <svg width={w} height={height} className="absolute inset-0" aria-hidden>
              {/* the field: compliant is cool, breach is warm, and the strength
                  of each is how far from the line it is */}
              {grid.map((row, r) => row.map((g, c) => (
                <rect key={`${r}-${c}`} x={pad.l + c * cellW} y={pad.t + r * cellH} width={cellW + 0.6} height={cellH + 0.6}
                  fill={g > 0 ? 'var(--neg)' : 'var(--pos)'} opacity={0.05 + (Math.abs(g) / worst) * 0.3} />
              )))}
              {/* the compliance frontier: the cell edges where the sign flips */}
              {grid.map((row, r) => row.map((g, c) => {
                const right = c < cols - 1 ? row[c + 1] : g
                const down = r < rows - 1 ? grid[r + 1][c] : g
                const x = pad.l + (c + 1) * cellW, y = pad.t + (r + 1) * cellH
                return (
                  <g key={`f${r}-${c}`}>
                    {g > 0 !== right > 0 && <line x1={x} x2={x} y1={pad.t + r * cellH} y2={y} stroke="var(--ink-1)" strokeWidth="1.5" />}
                    {g > 0 !== down > 0 && <line x1={pad.l + c * cellW} x2={x} y1={y} y2={y} stroke="var(--ink-1)" strokeWidth="1.5" />}
                  </g>
                )
              }))}
              {/* axes */}
              {[0, 0.25, 0.5, 0.75, 1].map((f) => (
                <text key={`y${f}`} x={pad.l - 7} y={pad.t + (1 - f) * ih} dy="3.5" textAnchor="end" fill="var(--dv-axis)" fontSize="10">
                  {Math.round(yRange[0] + f * (yRange[1] - yRange[0]))}
                </text>
              ))}
              {[0, 0.5, 1].map((f) => (
                <text key={`x${f}`} x={pad.l + f * iw} y={height - 14} textAnchor={f === 0 ? 'start' : f === 1 ? 'end' : 'middle'} fill="var(--dv-axis)" fontSize="10">
                  {Math.round(xRange[0] + f * (xRange[1] - xRange[0]))}{xUnit}
                </text>
              ))}
              <text x={pad.l + iw / 2} y={height - 1} textAnchor="middle" fill="var(--dv-axis)" fontSize="10">{xLabel}</text>
              <text x={10} y={pad.t + ih / 2} textAnchor="middle" fill="var(--dv-axis)" fontSize="10"
                transform={`rotate(-90 10 ${pad.t + ih / 2})`}>{yLabel}{yUnit ? ` (${yUnit})` : ''}</text>

              {marker && (
                <g>
                  <circle cx={pad.l + ((marker.x - xRange[0]) / (xRange[1] - xRange[0])) * iw}
                    cy={pad.t + ((yRange[1] - marker.y) / (yRange[1] - yRange[0])) * ih}
                    r="5" fill="none" stroke="var(--ink-3)" strokeWidth="1.5" strokeDasharray="2.5 2" />
                  <text x={pad.l + ((marker.x - xRange[0]) / (xRange[1] - xRange[0])) * iw + 9}
                    y={pad.t + ((yRange[1] - marker.y) / (yRange[1] - yRange[0])) * ih + 3.5}
                    fill="var(--ink-4)" fontSize="10">{marker.label}</text>
                </g>
              )}
            </svg>

            {/* the drag surface sits over the plot area only */}
            <div ref={dragRef} {...handlers}
              className={cx('absolute touch-none', dragging ? 'cursor-grabbing' : 'cursor-grab')}
              style={{ left: pad.l, top: pad.t, width: iw, height: ih }}>
              <span className={cx('absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-[3px] border-[var(--surface-1)] shadow-[var(--sh-3)] transition-[width,height]',
                dragging ? 'h-[26px] w-[26px]' : 'h-[20px] w-[20px]')}
                style={{ left: `${fx * 100}%`, top: `${fy * 100}%`, background: here > 0 ? 'var(--neg)' : 'var(--pos)' }}>
                <span className="h-[5px] w-[5px] rounded-full bg-white/90" />
              </span>
              {/* crosshair guides, so the puck's coordinates are readable */}
              <span className="pointer-events-none absolute inset-y-0 w-px bg-[var(--ink-1)] opacity-20" style={{ left: `${fx * 100}%` }} />
              <span className="pointer-events-none absolute inset-x-0 h-px bg-[var(--ink-1)] opacity-20" style={{ top: `${fy * 100}%` }} />
            </div>
          </>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px]">
        <span className="inline-flex items-center gap-1.5 text-[var(--ink-3)]">
          <span className="h-[3px] w-[11px] rounded-full bg-[var(--ink-1)]" /> compliance frontier
        </span>
        <span className="inline-flex items-center gap-1.5 text-[var(--ink-3)]">
          <span className="h-[9px] w-[9px] rounded-[2px] bg-[var(--pos)] opacity-40" /> inside the line
        </span>
        <span className="inline-flex items-center gap-1.5 text-[var(--ink-3)]">
          <span className="h-[9px] w-[9px] rounded-[2px] bg-[var(--neg)] opacity-40" /> over the line
        </span>
        <span className="ml-auto tabular-nums text-[var(--ink-2)]">
          {xLabel} <b>{value.x.toFixed(0)}{xUnit}</b> · {yLabel} <b>{value.y.toFixed(0)}{yUnit}</b>
        </span>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   PositionMap — the drillable compliance map.
   ---------------------------------------------------------------------------
   WHY TWO VIEWS, AND WHY 'RISK' IS THE DEFAULT.

   The mass view (fleet metric against mass, with the limit as a sloped line)
   shows the MECHANISM: in a mass-based regime the limit is a function of your
   own fleet's mass, so a maker can be high on CO₂ and still compliant. That is
   the thing most people get wrong, and no other chart shows it.

   But it shows the DECISION badly. The quantity that matters is the gap, and in
   the mass view the gap is a vertical distance to a DIAGONAL — the single
   hardest comparison to make by eye. Judging "who is furthest over" from that
   chart is guesswork.

   So the default is the risk view: gap on the vertical, volume on the
   horizontal, and the compliance line drawn FLAT. Distance from the line is now
   a vertical distance to a horizontal rule, which is the most accurate
   comparison the eye can make. And because a fine is charged per gram AND per
   car, exposure is roughly gap × volume — so the money is literally the
   top-right of the plot. The chart becomes a worklist: start top-right.

   Both views drill. Clicking a manufacturer re-plots its models; clicking a
   model re-plots its variants. Nothing is thrown away — the mechanism view is
   one click away whenever the question is "why is its limit there".
   ═══════════════════════════════════════════════════════════════════════════ */

/** A name short enough for a chip, without cutting a two-word brand in half.
 *  "Build Your Dreams" must not become "Build". */
const shortEntity = (name: string) => {
  const words = name.split(/\s+/)
  const drop = /^(India|Limited|Ltd|Pvt|Private|Motors?|Motor|Company|Co|Inc|Corporation|Corp|Group|Automobiles?|Cars?|Vehicles?)$/i
  const kept = words.filter((w) => !drop.test(w.replace(/[.,]/g, '')))
  const out = (kept.length ? kept : words).join(' ')
  return out.length > 18 ? `${out.slice(0, 17)}…` : out
}

export interface MapPoint {
  key: string
  label: string
  /** Volume — the horizontal in the risk view, the bubble area in the mass view. */
  units: number
  /** Fleet metric — the vertical in the mass view. */
  metric: number
  /** The limit this entity is actually held to. */
  limit: number
  gap: number
  exposure: number
  mass: number
  /** Whether drilling into it would show anything. */
  drillable?: boolean
  /** Explicit fill, when the caller is encoding something other than position. */
  tone?: string
  /** What the bubble area represents. Defaults to `units`. */
  weight?: number
}

export function PositionMap({
  points, variant, unit, height = 360, selected, hovered,
  onSelect, onHover, onDrill, format, fullRange, onFullRange, colourBy = 'position',
}: {
  points: MapPoint[]
  variant: 'risk' | 'mass'
  unit: string
  height?: number
  selected?: string | null
  hovered?: string | null
  onSelect?: (key: string | null) => void
  onHover?: (key: string | null) => void
  onDrill?: (p: MapPoint) => void
  format?: (v: number) => string
  /** Only affects the legend contract — the fills come from `point.tone`. */
  colourBy?: 'position' | 'ze' | 'exposure'
  /** Show the true extent rather than the robust one. See the domain note. */
  fullRange?: boolean
  onFullRange?: (v: boolean) => void
}) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [localHover, setLocalHover] = useState<string | null>(null)
  const still = prefersReducedMotion()
  const reveal = useReveal(`${variant}:${points.map((p) => p.key).join()}`)
  const fmt = format ?? ((v: number) => v.toFixed(1))
  const hot = hovered ?? localHover

  const pad = { t: 18, r: 22, b: 44, l: 56 }
  const iw = Math.max(10, w - pad.l - pad.r)
  const ih = height - pad.t - pad.b

  // ── scales ───────────────────────────────────────────────────────────────
  // Volume spans three orders of magnitude in a real market, so the risk view's
  // horizontal is logarithmic. A linear axis there would stack every maker but
  // the largest two into the left margin.
  const vols = points.map((p) => Math.max(1, p.units))
  const lgMin = Math.log10(Math.min(...vols)), lgMax = Math.log10(Math.max(...vols))
  const lgPad = (lgMax - lgMin) * 0.12 || 0.3

  const xs = variant === 'risk' ? vols.map((v) => Math.log10(v)) : points.map((p) => p.mass)
  const ys = variant === 'risk' ? points.map((p) => p.gap) : points.map((p) => p.metric)
  const x0 = variant === 'risk' ? lgMin - lgPad : Math.min(...xs) - (Math.max(...xs) - Math.min(...xs)) * 0.1 - 1
  const x1 = variant === 'risk' ? lgMax + lgPad : Math.max(...xs) + (Math.max(...xs) - Math.min(...xs)) * 0.1 + 1
  /* ── the vertical domain ──────────────────────────────────────────────────
     One battery-electric maker sits at zero fuel use, which in a market where
     everyone else is between −1 and +2 puts a single point five units away and
     flattens the other twelve into a band a few pixels tall. Using the true
     extent makes the chart honest and useless at the same time.

     So the default domain is ROBUST — the 5th to 95th percentile, padded — and
     anything outside it is PINNED to the edge with an off-scale marker rather
     than dropped. The point is still there, still hoverable, still counted; the
     reader is told it is off the scale and can switch to the true extent in one
     click. Silently clipping a point would be the dishonest version of this. */
  const sortedY = [...ys].sort((a, b) => a - b)
  const q = (p: number) => sortedY[Math.min(sortedY.length - 1, Math.max(0, Math.round(p * (sortedY.length - 1))))] ?? 0
  const trueLo = Math.min(...ys, variant === 'risk' ? 0 : Infinity)
  const trueHi = Math.max(...ys, variant === 'risk' ? 0 : -Infinity)
  // Tukey's fences — the standard outlier rule, so the decision to clip is not
  // a threshold somebody tuned until the chart looked nice.
  const q1 = q(0.25), q3 = q(0.75)
  const iqr = q3 - q1
  const fenceLo = q1 - 1.5 * iqr
  const fenceHi = q3 + 1.5 * iqr
  const outliers = points.filter((p) => {
    const v = variant === 'risk' ? p.gap : p.metric
    return v < fenceLo || v > fenceHi
  })
  const tailHeavy = iqr > 0 && outliers.length > 0 && points.length > 4
  const robustLo = Math.min(Math.max(trueLo, fenceLo), variant === 'risk' ? 0 : Infinity)
  const robustHi = Math.max(Math.min(trueHi, fenceHi), variant === 'risk' ? 0 : -Infinity)
  const useRobust = tailHeavy && !fullRange
  const lo = useRobust ? robustLo : trueLo
  const hi = useRobust ? robustHi : trueHi
  const ySpan = hi - lo || 1
  const y0 = lo - ySpan * 0.16
  const y1 = hi + ySpan * 0.16
  const offScale = useRobust ? points.filter((p) => (variant === 'risk' ? p.gap : p.metric) < y0 || (variant === 'risk' ? p.gap : p.metric) > y1) : []

  const X = (v: number) => pad.l + ((v - x0) / (x1 - x0 || 1)) * iw
  const Y = (v: number) => pad.t + ih - ((v - y0) / (y1 - y0 || 1)) * ih
  const px = (p: MapPoint) => X(variant === 'risk' ? Math.log10(Math.max(1, p.units)) : p.mass)
  const raw = (p: MapPoint) => (variant === 'risk' ? p.gap : p.metric)
  const isOff = (p: MapPoint) => raw(p) < y0 || raw(p) > y1
  // Pinned to the edge, not dropped.
  const py = (p: MapPoint) => Y(Math.min(y1, Math.max(y0, raw(p))))

  const weightOf = (p: MapPoint) => Math.max(1, p.weight ?? p.units)
  const maxWeight = Math.max(...points.map(weightOf), 1)
  const R = (p: MapPoint) => {
    // Area-proportional, floored so a small entity is still a target you can
    // actually hit with a mouse.
    return 5 + Math.sqrt(weightOf(p) / maxWeight) * (variant === 'risk' ? 13 : 17)
  }

  const zeroY = Y(0)
  // The mass view's limit line is fitted from the limits the engine already
  // computed, so the line drawn is the one the engine actually applied.
  const limitFit = useMemo(() => {
    if (variant !== 'mass') return null
    const pts = points.filter((p) => isFinite(p.mass) && isFinite(p.limit))
    if (pts.length < 2) return null
    const n = pts.length
    const mx = pts.reduce((a, p) => a + p.mass, 0) / n
    const my = pts.reduce((a, p) => a + p.limit, 0) / n
    const den = pts.reduce((a, p) => a + (p.mass - mx) ** 2, 0)
    if (!den) return null
    const slope = pts.reduce((a, p) => a + (p.mass - mx) * (p.limit - my), 0) / den
    return (x: number) => my + slope * (x - mx)
  }, [points, variant])

  /* Direct labels for the few that carry the story — plus whatever is selected
     or hovered. Three, not five: a scatter labelled exhaustively is a scatter
     you cannot read, and the tooltip covers the rest. */
  const labelled = useMemo(() => {
    const byRisk = [...points].sort((a, b) => (b.exposure - a.exposure) || (b.units - a.units)).slice(0, 3)
    const keys = new Set(byRisk.map((p) => p.key))
    if (selected) keys.add(selected)
    if (hot) keys.add(hot)
    return keys
  }, [points, selected, hot])

  /* Labels in a cluster land on top of each other. Lay them out with a minimum
     vertical gap, nudged off their own point rather than centred on it. */
  const labelPos = useMemo(() => {
    const items = points.filter((p) => labelled.has(p.key))
      .map((p) => ({ key: p.key, label: p.label, x: px(p), y: py(p) - R(p) - 7 }))
      .sort((a, b) => a.y - b.y)
    const GAP = 12.5
    for (let i = 1; i < items.length; i++) {
      if (Math.abs(items[i].x - items[i - 1].x) < 96 && items[i].y - items[i - 1].y < GAP) {
        items[i].y = items[i - 1].y + GAP
      }
    }
    return items
  }, [points, labelled, w, height, y0, y1, x0, x1]) // eslint-disable-line react-hooks/exhaustive-deps

  const ticksY = niceTicks(y0, y1, 4)

  return (
    <div>
      <div ref={ref} className="relative" style={{ height }} onMouseLeave={() => { setLocalHover(null); onHover?.(null) }}>
        {w > 0 && (
          <svg width={w} height={height} role="img"
            aria-label={variant === 'risk' ? 'Gap to limit against registrations' : 'Fleet metric against mass'}>
            {/* the compliant / breaching regions — the fastest read on the chart */}
            {variant === 'risk' && (
              <>
                <rect x={pad.l} y={pad.t} width={iw} height={Math.max(0, zeroY - pad.t)} fill="var(--neg)" opacity={0.045} />
                <rect x={pad.l} y={zeroY} width={iw} height={Math.max(0, pad.t + ih - zeroY)} fill="var(--pos)" opacity={0.045} />
              </>
            )}

            {ticksY.map((t) => (
              <g key={t}>
                <line x1={pad.l} x2={w - pad.r} y1={Y(t)} y2={Y(t)} stroke="var(--dv-grid)" />
                <text x={pad.l - 8} y={Y(t)} dy="3.5" textAnchor="end" fill="var(--dv-axis)" fontSize="10" className="tabular-nums">
                  {variant === 'risk' ? `${t > 0 ? '+' : ''}${fmt(t)}` : fmt(t)}
                </text>
              </g>
            ))}

            {/* the line itself */}
            {variant === 'risk' ? (
              <>
                <line x1={pad.l} x2={w - pad.r} y1={zeroY} y2={zeroY} stroke="var(--ink-2)" strokeWidth="1.75" />
                <text x={w - pad.r} y={zeroY - 7} textAnchor="end" fill="var(--ink-3)" fontSize="10" fontWeight="600">the limit</text>
              </>
            ) : limitFit && (
              <>
                <path d={`M${X(x0)} ${Y(limitFit(x0))}L${X(x1)} ${Y(limitFit(x1))}`}
                  stroke="var(--dv-ref)" strokeWidth="1.75" strokeDasharray="5 4" fill="none" opacity={reveal} />
                <text x={w - pad.r} y={Y(limitFit(x1)) - 7} textAnchor="end" fill="var(--ink-3)" fontSize="10" fontWeight="600">the limit</text>
              </>
            )}

            {/* x ticks */}
            {variant === 'risk'
              ? Array.from({ length: Math.max(2, Math.ceil(x1) - Math.floor(x0) + 1) }, (_, i) => Math.floor(x0) + i)
                  .filter((e) => e >= x0 && e <= x1 && e >= 0)
                  .map((e) => (
                    <text key={e} x={X(e)} y={height - 26} textAnchor="middle" fill="var(--dv-axis)" fontSize="10">
                      {e >= 6 ? `${10 ** (e - 6)}M` : e >= 3 ? `${10 ** (e - 3)}k` : String(10 ** e)}
                    </text>
                  ))
              : niceTicks(x0, x1, 4).map((t) => (
                  <text key={t} x={X(t)} y={height - 26} textAnchor="middle" fill="var(--dv-axis)" fontSize="10" className="tabular-nums">
                    {Math.round(t)}
                  </text>
                ))}

            <text x={pad.l + iw / 2} y={height - 8} textAnchor="middle" fill="var(--dv-axis)" fontSize="10">
              {variant === 'risk' ? 'Registrations (log scale)' : 'Average mass (kg)'}
            </text>
            <text x={13} y={pad.t + ih / 2} textAnchor="middle" fill="var(--dv-axis)" fontSize="10"
              transform={`rotate(-90 13 ${pad.t + ih / 2})`}>
              {variant === 'risk' ? `Gap to limit (${unit})` : `Fleet ${unit}`}
            </text>

            {/* the entities */}
            {points.map((p, i) => {
              const on = selected === p.key
              const warm = hot === p.key
              const over = p.gap > 0
              const r = R(p) * (still ? 1 : Math.min(1, Math.max(0, (reveal - (i / Math.max(points.length, 1)) * 0.3) / 0.7)))
              return (
                <g key={p.key}
                  transform={`translate(${px(p).toFixed(1)},${py(p).toFixed(1)})`}
                  style={{ transition: still ? undefined : 'transform 480ms var(--ease-out)' }}
                  className={onSelect || onDrill ? 'cursor-pointer' : undefined}
                  onMouseEnter={() => { setLocalHover(p.key); onHover?.(p.key) }}
                  onClick={() => onSelect?.(on ? null : p.key)}
                  onDoubleClick={() => p.drillable && onDrill?.(p)}>
                  {/* a halo on the selected entity, so it survives a crowded cluster */}
                  {(on || warm) && (
                    <circle r={r + 6} fill="none" stroke={p.tone ?? (over ? 'var(--neg)' : 'var(--pos)')} strokeWidth="1" opacity={on ? 0.5 : 0.28} />
                  )}
                  <circle r={r}
                    fill={p.tone ?? (over ? 'var(--neg)' : 'var(--pos)')}
                    fillOpacity={p.tone ? (on ? 1 : warm ? 0.95 : 0.88) : on ? 0.4 : warm ? 0.32 : 0.2}
                    stroke={p.tone ? 'var(--ink-3)' : over ? 'var(--neg)' : 'var(--pos)'}
                    strokeWidth={on ? 2.5 : warm ? 2 : p.tone ? 0.75 : 1.5} />
                  {/* a generous invisible hit target — the visible dot can be 5px */}
                  <circle r={Math.max(r, 13)} fill="transparent" />
                  {isOff(p) && (
                    <path d={raw(p) > y1 ? 'M-4 3 L0 -2 L4 3' : 'M-4 -3 L0 2 L4 -3'} fill="none"
                      stroke={over ? 'var(--neg)' : 'var(--pos)'} strokeWidth="1.8" strokeLinecap="round" />
                    
                  )}
                </g>
              )
            })}
            {/* labels last, so they sit above every mark */}
            {labelPos.map((l) => {
              const on = selected === l.key || hot === l.key
              return (
                <text key={l.key} x={l.x} y={l.y} textAnchor="middle" fontSize="10" fontWeight="600"
                  fill={on ? 'var(--ink-1)' : 'var(--ink-3)'} opacity={reveal}
                  style={{ paintOrder: 'stroke', stroke: 'var(--surface-1)', strokeWidth: 3, strokeLinejoin: 'round' }}>
                  {l.label.length > 20 ? `${l.label.slice(0, 19)}…` : l.label}
                </text>
              )
            })}
          </svg>
        )}

        {hot && (() => {
          const p = points.find((x) => x.key === hot)
          if (!p) return null
          return (
            <ChartTip x={px(p)} y={py(p)} w={w}>
              <div className="mb-1 text-[11.5px] font-semibold text-[var(--ink-1)]">{p.label}</div>
              <TipRow color={p.gap > 0 ? 'var(--neg)' : 'var(--pos)'} label="Gap to limit"
                value={`${p.gap > 0 ? '+' : ''}${fmt(p.gap)} ${unit}`} />
              <TipRow label="Fleet" value={`${fmt(p.metric)} ${unit}`} />
              <TipRow label="Its limit" value={`${fmt(p.limit)} ${unit}`} />
              <TipRow label="Registrations" value={p.units.toLocaleString()} />
              {p.exposure > 0 && <TipRow label="Exposure" value={fmtCompact(p.exposure)} />}
              {isOff(p) && (
                <div className="mt-1.5 text-[10.5px] text-[var(--warn-ink)]">Off the current scale — pinned to the edge</div>
              )}
              {p.drillable && (
                <div className="mt-1.5 border-t border-[var(--line-soft)] pt-1.5 text-[10.5px] text-[var(--ink-4)]">
                  Click to select · double-click to drill in
                </div>
              )}
            </ChartTip>
          )
        })()}
      </div>

      {(offScale.length > 0 || fullRange) && (
        <button onClick={() => onFullRange?.(!fullRange)}
          className="mt-1 inline-flex items-center gap-1.5 rounded-[var(--r-xs)] border border-[var(--warn-line)] bg-[var(--warn-tint)] px-2 py-[3px] text-[11px] text-[var(--warn-ink)] transition-colors hover:border-[var(--warn)]">
          {fullRange
            ? 'Showing the true extent — one outlier is compressing the rest. Back to the readable scale'
            : `${offScale.length} off the scale (${offScale.map((p) => p.label.split(' ')[0]).join(', ')}) — show the true extent`}
        </button>
      )}
    </div>
  )
}
