import { useMemo, useState } from 'react'
import { fmtMoney, fmtNum } from '../engine/engine'

export interface MaccStep {
  label: string
  grams: number // metric units abated
  unitCost: number // currency per metric-unit per vehicle
  difficulty?: string
}

interface Props {
  steps: MaccStep[]
  fineRate: number // currency per metric-unit per vehicle — "cost of doing nothing"
  creditPrice?: number | null // currency per metric-unit per vehicle — "buy instead"
  gapToClose: number // metric units needed to reach the line
  unit: string
  currency: string
  height?: number
}

/**
 * Marginal abatement cost curve: bar width = how much a lever abates, height =
 * what it costs per unit-gap per vehicle. The two horizontal benchmarks make
 * the build-vs-buy decision visual: anything above the credit line is cheaper
 * to cover with credits; anything above the penalty line is cheaper to just pay.
 */
export default function MaccChart({ steps, fineRate, creditPrice, gapToClose, unit, currency, height = 300 }: Props) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 760
  const H = height
  const m = { l: 62, r: 18, t: 26, b: 46 }
  const iw = W - m.l - m.r
  const ih = H - m.t - m.b

  const bars = useMemo(() => [...steps].sort((a, b) => a.unitCost - b.unitCost), [steps])
  const totalG = Math.max(bars.reduce((a, b) => a + b.grams, 0), gapToClose, 0.001)
  const yMax = Math.max(...bars.map((b) => b.unitCost), fineRate, creditPrice ?? 0) * 1.18

  const sx = (g: number) => m.l + (g / totalG) * iw
  const sy = (c: number) => m.t + ih - (c / yMax) * ih

  let cum = 0
  const placed = bars.map((b) => { const x0 = cum; cum += b.grams; return { ...b, x0, x1: cum } })

  return (
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 'auto' }}>
        {/* gridlines */}
        {Array.from({ length: 5 }, (_, i) => {
          const v = (yMax * i) / 4
          return (
            <g key={i}>
              <line x1={m.l} y1={sy(v)} x2={W - m.r} y2={sy(v)} stroke="#1C1812" strokeOpacity="0.05" />
              <text x={m.l - 8} y={sy(v) + 3} textAnchor="end" fontSize="10" fill="#8C8273" className="num">{fmtMoney(v, currency)}</text>
            </g>
          )
        })}

        {/* bars */}
        {placed.map((b, i) => {
          const buy = creditPrice != null && b.unitCost > creditPrice
          const pay = b.unitCost > fineRate
          const fill = pay ? '#C9C0B2' : buy ? '#E0A100' : '#F2510E'
          const active = hover === i
          return (
            <g key={b.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={sx(b.x0) + 1} y={sy(b.unitCost)} width={Math.max(2, sx(b.x1) - sx(b.x0) - 2)} height={m.t + ih - sy(b.unitCost)}
                rx="4" fill={fill} fillOpacity={active ? 1 : 0.85} stroke={active ? '#1C1812' : 'transparent'} strokeWidth="1.25"
                className="rise" style={{ animationDelay: `${i * 80}ms` }} />
              {sx(b.x1) - sx(b.x0) > 56 && (
                <text x={(sx(b.x0) + sx(b.x1)) / 2} y={sy(b.unitCost) - 6} textAnchor="middle" fontSize="9.5" fontWeight="600" fill="#4A4438">
                  {b.label.length > 20 ? b.label.slice(0, 19) + '…' : b.label}
                </text>
              )}
              {active && (() => {
                const tw = Math.max(150, b.label.length * 6.2)
                const cxm = (sx(b.x0) + sx(b.x1)) / 2
                const tx = Math.min(Math.max(cxm - tw / 2, m.l), W - m.r - tw)
                const ty = Math.max(m.t, sy(b.unitCost) - 56)
                return (
                  <g>
                    <rect x={tx} y={ty} width={tw} height={46} rx="7" fill="#FFFDF9" stroke="#DBD2BF" style={{ filter: 'drop-shadow(0 3px 8px rgba(60,45,20,0.14))' }} />
                    <text x={tx + 9} y={ty + 15} fontSize="10.5" fill="#1C1812" fontWeight="700">{b.label}</text>
                    <text x={tx + 9} y={ty + 29} fontSize="9.5" fill="#8C8273" className="num">{fmtMoney(b.unitCost, currency)}/{unit}·car · abates {fmtNum(b.grams, 2)} {unit}</text>
                    <text x={tx + 9} y={ty + 41} fontSize="9.5" fill={pay ? '#E0484D' : buy ? '#B26A04' : '#0E9F6E'} fontWeight="600">
                      {pay ? 'costlier than the penalty — never do this' : buy ? 'costlier than credits — buy instead' : 'cheaper than credits — build it'}
                    </text>
                  </g>
                )
              })()}
            </g>
          )
        })}

        {/* gap-to-close marker */}
        {gapToClose > 0 && gapToClose <= totalG && (
          <g>
            <line x1={sx(gapToClose)} y1={m.t + 8} x2={sx(gapToClose)} y2={m.t + ih} stroke="#1C1812" strokeWidth="1.25" strokeDasharray="5 4" opacity="0.55" />
            <text x={sx(gapToClose) + 6} y={m.t + 16} textAnchor="start" fontSize="9.5" fontWeight="700" fill="#1C1812">gap to close · {fmtNum(gapToClose, 1)} {unit}</text>
          </g>
        )}

        {/* benchmarks: penalty + credit price */}
        <line x1={m.l} y1={sy(fineRate)} x2={W - m.r} y2={sy(fineRate)} stroke="#E0484D" strokeWidth="1.75" strokeDasharray="7 4" />
        <text x={W - m.r} y={sy(fineRate) - 5} textAnchor="end" fontSize="9.5" fontWeight="700" fill="#E0484D">penalty {fmtMoney(fineRate, currency)}/{unit}·car — cost of doing nothing</text>
        {creditPrice != null && (
          <>
            <line x1={m.l} y1={sy(creditPrice)} x2={W - m.r} y2={sy(creditPrice)} stroke="#E0A100" strokeWidth="1.75" strokeDasharray="2 4" />
            <text x={W - m.r} y={sy(creditPrice) - 5} textAnchor="end" fontSize="9.5" fontWeight="700" fill="#B26A04">credits {fmtMoney(creditPrice, currency)}/{unit}·car — buy instead</text>
          </>
        )}

        <text x={m.l} y={14} fontSize="10" fill="#8C8273" className="uppercase tracking-wider">Cost per {unit} per car</text>
        <text x={W - m.r} y={H - 8} textAnchor="end" fontSize="10" fill="#8C8273" className="uppercase tracking-wider">{unit} abated (bar width = lever size)</text>
      </svg>
    </div>
  )
}
