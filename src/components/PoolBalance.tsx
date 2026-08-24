// ───────────────────────────────────────────────────────────────────────────
// POOL BALANCE — who carries whom, in one read.
//
// A pool is not a league table, it is a BALANCE: the members with headroom lend
// it to the members who are short, and what is left over is the pool's residual
// liability. So the form is a diverging bar off a single centre axis — lenders
// to the right, takers to the left, ordered by size — with the net drawn as a
// marker on the same scale. You can see in one glance whether the surplus
// actually covers the deficit, and which one member is doing the carrying.
//
// Units are g/km·registrations ("g·units"), which is the quantity that actually
// nets inside a pool: a maker 2 g over on 500k cars needs exactly as much
// headroom as one 10 g over on 100k.
//
// Colour is the reserved status polarity (surplus / deficit), validated as a
// diverging pair against the cream surface: ΔE 9.3 deutan, 29.3 normal, both
// above 3:1 contrast. Marks follow the house spec — ≤24px thick, 4px rounded
// data-end squared at the axis, hairline axis, 2px surface gap between rows.
// ───────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { fmtInt, fmtMoney, fmtNum } from '../engine/engine'
import { STATUS } from '../lib/palette'
import BrandChip from './BrandChip'

export interface BalanceMember {
  parent: string
  /** g·units: > 0 lends headroom, < 0 needs it. */
  balance: number
  gap: number
  units: number
  fine: number
}

const SURPLUS = STATUS.compliant
const DEFICIT = STATUS.fine

export default function PoolBalance({
  members, currency, metricUnit, net, residualFine, compact = false,
}: {
  members: BalanceMember[]
  currency: string
  metricUnit: string
  /** Σ balances — positive means the surplus covers the shortfall. */
  net: number
  residualFine: number
  compact?: boolean
}) {
  const [hover, setHover] = useState<string | null>(null)
  const rows = [...members].sort((a, b) => b.balance - a.balance)
  const max = Math.max(...rows.map((r) => Math.abs(r.balance)), Math.abs(net), 1)
  const pct = (v: number) => (Math.abs(v) / max) * 50
  const covers = net >= 0

  const lenders = rows.filter((r) => r.balance > 0)
  const takers = rows.filter((r) => r.balance < 0)
  const lent = lenders.reduce((a, r) => a + r.balance, 0)
  const needed = -takers.reduce((a, r) => a + r.balance, 0)
  const carrier = lenders[0]

  return (
    <div>
      {/* the sentence first — the chart is the evidence, not the answer */}
      <p className="mb-3 text-[12.5px] leading-relaxed text-ink-400">
        {takers.length === 0 ? (
          <>Every member is under its own line — this pool has <b className="text-ink-100">nothing to carry</b>.</>
        ) : lenders.length === 0 ? (
          <>No member has headroom. Pooling cannot help here — the whole group is short.</>
        ) : covers ? (
          <>
            <b className="text-ink-100">{fmtInt(lent)}</b> g·units of headroom cover the{' '}
            <b className="text-ink-100">{fmtInt(needed)}</b> the short members need
            {carrier && <>, mostly from <b className="text-ink-100">{carrier.parent.split(/\s+/).slice(0, 2).join(' ')}</b></>}.
            The pool clears with <b className="num" style={{ color: SURPLUS }}>{fmtInt(net)}</b> to spare.
          </>
        ) : (
          <>
            Headroom of <b className="text-ink-100">{fmtInt(lent)}</b> falls{' '}
            <b className="num" style={{ color: DEFICIT }}>{fmtInt(Math.abs(net))}</b> g·units short of the{' '}
            <b className="text-ink-100">{fmtInt(needed)}</b> needed — pooling narrows the bill to{' '}
            <b className="num text-ink-100">{fmtMoney(residualFine, currency)}</b> but cannot remove it.
          </>
        )}
      </p>

      {/* legend — identity is never colour-alone */}
      <div className="mb-2 flex items-center gap-4 text-[10.5px] font-medium text-ink-500">
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-[2px]" style={{ background: SURPLUS }} /> lends headroom</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-[2px]" style={{ background: DEFICIT }} /> needs headroom</span>
        <span className="ml-auto tabular-nums">g·units = {metricUnit} over × registrations</span>
      </div>

      <div className="relative">
        {/* hairline centre axis */}
        <div aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-black/15" />

        <div className="space-y-[2px]">
          {rows.map((r) => {
            const pos = r.balance > 0
            const w = pct(r.balance)
            const on = hover === r.parent
            return (
              <div
                key={r.parent}
                onMouseEnter={() => setHover(r.parent)}
                onMouseLeave={() => setHover(null)}
                className="group relative flex h-[22px] items-center rounded-[3px] transition-colors hover:bg-black/[0.025]"
              >
                {/* The bar grows from the centre axis. The track must span the
                    FULL row — anchoring it left-1/2 right-1/2 gives a zero-width
                    parent, and every percentage width then resolves to 0px. */}
                <div className="absolute inset-y-[3px] left-0 right-0">
                  <div
                    className="absolute inset-y-0 transition-all duration-300"
                    style={{
                      [pos ? 'left' : 'right']: '50%',
                      width: `${w}%`,
                      background: pos ? SURPLUS : DEFICIT,
                      opacity: hover && !on ? 0.4 : 1,
                      borderRadius: pos ? '0 4px 4px 0' : '4px 0 0 4px',
                    } as React.CSSProperties}
                  />
                </div>

                {/* name rides the empty side so it never sits on the bar */}
                <span
                  className={`pointer-events-none absolute truncate text-[11px] transition-colors ${on ? 'text-ink-100' : 'text-ink-400'}`}
                  style={pos ? { right: `calc(50% + ${w}% + 8px)`, maxWidth: '42%' } : { left: `calc(50% + ${w}% + 8px)`, maxWidth: '42%' }}
                >
                  {r.parent}
                </span>

                {/* value label only on the extremes and on hover — never every row */}
                {(on || r === rows[0] || r === rows[rows.length - 1]) && (
                  <span
                    className="num pointer-events-none absolute text-[10.5px] font-semibold tabular-nums"
                    style={pos
                      ? { left: `calc(50% + ${w}% + 6px)`, color: SURPLUS }
                      : { right: `calc(50% + ${w}% + 6px)`, color: DEFICIT }}
                  >
                    {r.balance > 0 ? '+' : '−'}{fmtInt(Math.abs(r.balance))}
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {/* the net, on the same scale — the answer the rows add up to */}
        <div className="mt-2 border-t border-black/[0.07] pt-2">
          <div className="relative flex h-[22px] items-center">
            <div className="absolute inset-y-[3px] left-0 right-0">
              <div
                className="absolute inset-y-0"
                style={{
                  [covers ? 'left' : 'right']: '50%',
                  width: `${pct(net)}%`,
                  background: covers ? SURPLUS : DEFICIT,
                  opacity: 0.25,
                  borderRadius: covers ? '0 4px 4px 0' : '4px 0 0 4px',
                } as React.CSSProperties}
              />
              <div
                className="absolute inset-y-[-3px] w-[2px]"
                style={{ [covers ? 'left' : 'right']: `calc(50% + ${pct(net)}%)`, background: covers ? SURPLUS : DEFICIT } as React.CSSProperties}
              />
            </div>
            <span className="pointer-events-none absolute text-[10.5px] font-bold uppercase tracking-wide text-ink-500"
              style={covers ? { right: `calc(50% + ${pct(net)}% + 8px)` } : { left: `calc(50% + ${pct(net)}% + 8px)` }}>
              Net
            </span>
            <span className="num pointer-events-none absolute text-[11px] font-bold tabular-nums"
              style={covers ? { left: `calc(50% + ${pct(net)}% + 6px)`, color: SURPLUS } : { right: `calc(50% + ${pct(net)}% + 6px)`, color: DEFICIT }}>
              {net > 0 ? '+' : net < 0 ? '−' : ''}{fmtInt(Math.abs(net))}
            </span>
          </div>
        </div>
      </div>

      {/* hover detail — the per-row numbers the labels deliberately omit */}
      {!compact && (
        <div className="mt-2 h-[16px] text-[11px] text-ink-500">
          {hover && (() => {
            const r = rows.find((x) => x.parent === hover)!
            return (
              <span className="flex items-center gap-2">
                <BrandChip name={r.parent} size={14} />
                <b className="text-ink-200">{r.parent}</b>
                <span className="num">{r.gap > 0 ? '+' : ''}{fmtNum(r.gap, 1)} {metricUnit}</span>
                <span className="num">· {fmtInt(r.units)} units</span>
                {r.fine > 0 && <span className="num" style={{ color: DEFICIT }}>· {fmtMoney(r.fine, currency)} standalone</span>}
              </span>
            )
          })()}
        </div>
      )}
    </div>
  )
}
