import { useMemo, useState } from 'react'
import { fmtMoney, fmtNum } from '../engine/engine'

export interface WaterfallStep {
  label: string
  grams: number // gap reduction contributed by this step (positive = helps)
  cost: number
  difficulty?: string
}

interface Props {
  startGap: number // g over the line today (positive = over)
  steps: WaterfallStep[]
  endGap: number
  unit: string
  currency: string
  height?: number
}

/**
 * The consulting-style bridge: how each lever walks the fleet from today's gap
 * down across the limit line. X = levers in plan order, Y = gap to the line;
 * the zero line IS the limit, so "under" is literally below the line.
 */
export default function GapWaterfall({ startGap, steps, endGap, unit, currency, height = 320 }: Props) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 760
  const H = height
  const m = { l: 54, r: 18, t: 26, b: 58 }
  const iw = W - m.l - m.r
  const ih = H - m.t - m.b

  const cats = useMemo(() => {
    const out: { label: string; from: number; to: number; kind: 'start' | 'step' | 'end'; cost?: number; difficulty?: string }[] = []
    out.push({ label: 'Gap today', from: 0, to: startGap, kind: 'start' })
    let run = startGap
    for (const s of steps) { out.push({ label: s.label, from: run, to: run - s.grams, kind: 'step', cost: s.cost, difficulty: s.difficulty }); run -= s.grams }
    out.push({ label: 'After the plan', from: 0, to: endGap, kind: 'end' })
    return out
  }, [startGap, steps, endGap])

  const yMax = Math.max(startGap, 0.1) * 1.15
  const yMin = Math.min(endGap, 0) * 1.6 - yMax * 0.05
  const sy = (v: number) => m.t + ((yMax - v) / (yMax - yMin)) * ih
  const n = cats.length
  const slot = iw / n
  const bw = Math.min(72, slot * 0.58)
  const sx = (i: number) => m.l + slot * i + (slot - bw) / 2

  const zeroY = sy(0)
  const ticks = 4

  return (
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 'auto' }}>
        <defs>
          <linearGradient id="wfStep" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F66864" /><stop offset="100%" stopColor="#E8223B" />
          </linearGradient>
          <linearGradient id="wfUnder" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0E9F6E" stopOpacity="0.0" /><stop offset="100%" stopColor="#0E9F6E" stopOpacity="0.10" />
          </linearGradient>
        </defs>

        {/* under-the-line zone */}
        <rect x={m.l} y={zeroY} width={iw} height={m.t + ih - zeroY} fill="url(#wfUnder)" />

        {/* gridlines */}
        {Array.from({ length: ticks + 1 }, (_, i) => {
          const v = yMin + ((yMax - yMin) * i) / ticks
          const y = sy(v)
          return (
            <g key={i}>
              <line x1={m.l} y1={y} x2={W - m.r} y2={y} stroke="#1C1812" strokeOpacity="0.05" />
              <text x={m.l - 8} y={y + 3} textAnchor="end" fontSize="10" fill="#8C8273" className="num">{v > 0 ? '+' : ''}{fmtNum(v, 1)}</text>
            </g>
          )
        })}

        {/* THE LIMIT = zero line */}
        <line x1={m.l} y1={zeroY} x2={W - m.r} y2={zeroY} stroke="#E0A100" strokeWidth="2.25" style={{ filter: 'drop-shadow(0 2px 5px rgba(224,161,0,0.3))' }} />
        <rect x={W - m.r - 74} y={zeroY - 22} width="74" height="17" rx="8.5" fill="#E0A100" />
        <text x={W - m.r - 37} y={zeroY - 10} textAnchor="middle" fontSize="10" fill="#1a1405" fontWeight="800" letterSpacing="0.5">THE LIMIT</text>

        {cats.map((c, i) => {
          const yTop = sy(Math.max(c.from, c.to))
          const yBot = sy(Math.min(c.from, c.to))
          const h = Math.max(2, yBot - yTop)
          const under = c.kind !== 'step' && c.to <= 0
          const fill = c.kind === 'step' ? 'url(#wfStep)' : under ? '#0E9F6E' : '#E0484D'
          const active = hover === i
          const valText = c.kind === 'step' ? `−${fmtNum(c.from - c.to, 1)}` : `${c.to > 0 ? '+' : ''}${fmtNum(c.to, 1)}`
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: 'default' }}>
              {/* connector from previous bar's landing level */}
              {i > 0 && (
                <line x1={sx(i - 1) + bw} y1={sy(cats[i - 1].to)} x2={sx(i)} y2={sy(c.kind === 'end' ? cats[i - 1].to : c.from)}
                  stroke="#8C8273" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
              )}
              <rect x={sx(i)} y={yTop} width={bw} height={h} rx="6" fill={fill} fillOpacity={c.kind === 'step' ? 0.92 : 0.88}
                stroke={active ? '#1C1812' : 'transparent'} strokeWidth="1.25"
                className="rise" style={{ animationDelay: `${i * 90}ms` }} />
              {/* value above the bar (clamped clear of the axis title) */}
              <text x={sx(i) + bw / 2} y={Math.max(yTop - 6, 24)} textAnchor="middle" fontSize="11" fontWeight="700" className="num"
                fill={c.kind === 'step' ? '#C41730' : under ? '#0E9F6E' : '#E0484D'}>{valText}</text>
              {/* category label */}
              <text x={sx(i) + bw / 2} y={H - m.b + 16} textAnchor="middle" fontSize="9.5" fill="#4A4438" fontWeight="600">
                {c.label.length > 16 ? c.label.slice(0, 15) + '…' : c.label}
              </text>
              {/* cost under label for steps */}
              {c.kind === 'step' && (
                <text x={sx(i) + bw / 2} y={H - m.b + 29} textAnchor="middle" fontSize="9" fill="#8C8273" className="num">{fmtMoney(c.cost ?? 0, currency)}</text>
              )}
              {c.kind !== 'step' && (
                <text x={sx(i) + bw / 2} y={H - m.b + 29} textAnchor="middle" fontSize="9" fill={under ? '#0E9F6E' : '#8C8273'} fontWeight="600">
                  {c.kind === 'start' ? `over by ${fmtNum(Math.abs(c.to), 1)} ${unit}` : under ? 'under the line' : `still ${fmtNum(c.to, 1)} over`}
                </text>
              )}
              {/* hover tooltip */}
              {active && c.kind === 'step' && (() => {
                const tw = Math.max(120, c.label.length * 6.5)
                const flip = sx(i) + bw + 10 + tw > W - m.r
                const tx = flip ? sx(i) - tw - 10 : sx(i) + bw + 10
                const ty = Math.max(m.t, yTop - 8)
                return (
                  <g>
                    <rect x={tx} y={ty} width={tw} height={48} rx="7" fill="#FFFDF9" stroke="#DBD2BF" style={{ filter: 'drop-shadow(0 3px 8px rgba(60,45,20,0.14))' }} />
                    <text x={tx + 9} y={ty + 15} fontSize="10.5" fill="#1C1812" fontWeight="700">{c.label}</text>
                    <text x={tx + 9} y={ty + 29} fontSize="9.5" fill="#8C8273" className="num">clears {fmtNum(c.from - c.to, 2)} {unit}</text>
                    <text x={tx + 9} y={ty + 42} fontSize="9.5" fill="#8C8273" className="num">cost {fmtMoney(c.cost ?? 0, currency)}{c.difficulty ? ` · ${c.difficulty.toLowerCase()}` : ''}</text>
                  </g>
                )
              })()}
            </g>
          )
        })}
        <text x={m.l} y={14} fontSize="10" fill="#8C8273" className="uppercase tracking-wider">Gap to the limit ({unit})</text>
      </svg>
    </div>
  )
}
