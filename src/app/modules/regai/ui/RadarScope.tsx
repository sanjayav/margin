/* ───────────────────────────────────────────────────────────────────────────
   The radar scope — Reg AI's signature asset.
   ---------------------------------------------------------------------------
   Not decoration: every blip is a tracked regulation, and its position means
   something.
     · SECTOR   the market (one fifth of the dial each, flag at the rim)
     · DISTANCE time to its next key date — the closer to the centre, the
                sooner it bites. Nothing scheduled sits on the outer ring.
     · COLOUR   its stage — in force, notified, draft, consultation.
   The sweep is the only motion that loops, and it stops under reduced motion.
   ─────────────────────────────────────────────────────────────────────────── */
import React, { useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import type { CountryId } from '../../../../engine/types'
import { STAGE_META } from '../catalogue'
import { MARKET_ORDER, REG_BY_ID, regStage, type Regulation } from '../regulations'
import { Flag } from './assets'
import { EASE } from './motion'

const SIZE = 320
const C = SIZE / 2
const R = 132
const RINGS = [0.25, 0.5, 0.75, 1]
const HORIZON_MONTHS = 36

const toneColor = (tone: string) =>
  tone === 'pos' ? 'var(--pos)' : tone === 'warn' ? 'var(--warn)' : tone === 'info' ? 'var(--info)' : 'var(--ink-4)'

function polar(angleDeg: number, r: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180
  return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) }
}

interface Blip { reg: Regulation; x: number; y: number; color: string; months: number | null; label: string }

export function RadarScope({ tracked, now, onSelect }: {
  tracked: string[]; now: number; onSelect?: (r: Regulation) => void
}) {
  const reduce = useReducedMotion()
  const [hover, setHover] = useState<Blip | null>(null)

  const blips = useMemo<Blip[]>(() => {
    const out: Blip[] = []
    MARKET_ORDER.forEach((m, mi) => {
      const regs = tracked.map((id) => REG_BY_ID[id]).filter((r): r is Regulation => !!r && r.market === m)
      const sector = 360 / MARKET_ORDER.length
      regs.forEach((reg, i) => {
        const next = reg.milestones.map((x) => Date.parse(x.date)).filter((t) => t >= now).sort((a, b) => a - b)[0]
        const months = next ? (next - now) / (30.44 * 86_400_000) : null
        // Square-root scale: near-term dates are the ones that matter, so the
        // first year gets the most room instead of piling up on the centre.
        const frac = months == null ? 1 : Math.min(1, 0.2 + 0.8 * Math.sqrt(Math.max(0, months) / HORIZON_MONTHS))
        // Spread within the sector so two regulations in one market never overlap.
        const angle = mi * sector + sector * ((i + 1) / (regs.length + 1))
        const p = polar(angle, frac * R)
        out.push({
          reg, ...p, months,
          color: toneColor(STAGE_META[regStage(reg.id)].tone),
          label: months == null ? 'No dated step ahead' : months < 1 ? 'This month' : `${Math.round(months)} months to next step`,
        })
      })
    })
    return out
  }, [tracked, now])

  return (
    <div className="relative mx-auto" style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img"
        aria-label={`Radar of ${blips.length} tracked regulations by market and time to next key date`}>
        <defs>
          <radialGradient id="rg-face" cx="50%" cy="50%" r="50%">
            <stop offset="0%" style={{ stopColor: 'var(--surface-1)' }} />
            <stop offset="100%" style={{ stopColor: 'var(--surface-2)' }} />
          </radialGradient>
        </defs>

        {/* face */}
        <circle cx={C} cy={C} r={R + 10} fill="url(#rg-face)" style={{ stroke: 'var(--line)' }} />

        {/* rings — time bands */}
        {RINGS.map((f, i) => (
          <motion.circle key={f} cx={C} cy={C} r={f * R} fill="none"
            style={{ stroke: 'var(--line-strong)' }} strokeWidth={0.75} strokeDasharray={i === RINGS.length - 1 ? undefined : '2 4'}
            initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.9, delay: 0.08 * i, ease: EASE }} />
        ))}
        {[6, 12, 24].map((mo) => {
          const p = polar(4, (0.2 + 0.8 * Math.sqrt(mo / HORIZON_MONTHS)) * R)
          return <text key={mo} x={p.x + 3} y={p.y - 2} fontSize={8.5} style={{ fill: 'var(--ink-5)' }} className="tabular-nums">{mo}m</text>
        })}

        {/* sector dividers */}
        {MARKET_ORDER.map((_, i) => {
          const p = polar((360 / MARKET_ORDER.length) * i, R)
          return <line key={i} x1={C} y1={C} x2={p.x} y2={p.y} style={{ stroke: 'var(--line)' }} strokeWidth={0.75} />
        })}

        {/* centre — you */}
        <circle cx={C} cy={C} r={4} style={{ fill: 'var(--ink-1)' }} />
        <circle cx={C} cy={C} r={9} fill="none" style={{ stroke: 'var(--ink-1)' }} strokeOpacity={0.2} />

        {/* blips */}
        {blips.map((b, i) => (
          <g key={b.reg.id} style={{ cursor: onSelect ? 'pointer' : 'default' }}
            onMouseEnter={() => setHover(b)} onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(b)} onBlur={() => setHover(null)}
            onClick={() => onSelect?.(b.reg)} tabIndex={onSelect ? 0 : -1} role={onSelect ? 'button' : undefined}
            aria-label={`${b.reg.name}, ${b.reg.market}: ${b.label}`}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(b.reg) } }}>
            {!reduce && (
              <motion.circle cx={b.x} cy={b.y} r={5} fill="none"
                style={{ stroke: b.color }}
                initial={{ scale: 1, opacity: 0.6 }} animate={{ scale: 2.6, opacity: 0 }}
                transition={{ repeat: Infinity, duration: 2.4, delay: (i % 6) * 0.4, ease: 'easeOut' }} />
            )}
            <motion.circle cx={b.x} cy={b.y} r={hover?.reg.id === b.reg.id ? 6.5 : 5}
              style={{ fill: b.color, stroke: 'var(--surface-1)' }} strokeWidth={2}
              initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5 + i * 0.05, type: 'spring', stiffness: 400, damping: 20 }} />
          </g>
        ))}
      </svg>

      {/* the sweep — an HTML layer rotated about its own centre (the dial's
          centre), which is reliable where SVG transform origins are not. */}
      <motion.div aria-hidden className="pointer-events-none absolute inset-0"
        animate={reduce ? undefined : { rotate: 360 }}
        transition={{ repeat: Infinity, ease: 'linear', duration: 7 }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          {Array.from({ length: 14 }, (_, i) => {
            const a0 = i * 3, a1 = a0 + 3.4
            const p0 = polar(a0, R), p1 = polar(a1, R)
            return (
              <path key={i} d={`M${C},${C} L${p0.x},${p0.y} A${R},${R} 0 0 1 ${p1.x},${p1.y} Z`}
                style={{ fill: 'var(--brand)' }} opacity={0.01 + (i / 14) * 0.11} />
            )
          })}
          <line x1={C} y1={C} x2={polar(42, R).x} y2={polar(42, R).y} style={{ stroke: 'var(--brand)' }} strokeWidth={1.2} opacity={0.5} />
        </svg>
      </motion.div>

      {/* flags at the rim */}
      {MARKET_ORDER.map((m: CountryId, i) => {
        const p = polar((360 / MARKET_ORDER.length) * (i + 0.5), R + 26)
        return (
          <span key={m} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: p.x, top: p.y }}>
            <Flag market={m} size={18} />
          </span>
        )
      })}

      {/* hover card */}
      {hover && (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }}
          className="pointer-events-none absolute z-10 w-[200px] rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-1)] px-2.5 py-2 shadow-[var(--sh-3)]"
          style={{ left: Math.min(SIZE - 200, Math.max(0, hover.x - 100)), top: hover.y + 12 }}>
          <div className="flex items-center gap-1.5">
            <Flag market={hover.reg.market} size={14} />
            <span className="truncate text-[12px] font-semibold text-[var(--ink-1)]">{hover.reg.name}</span>
          </div>
          <div className="mt-0.5 text-[11px] text-[var(--ink-3)]">{hover.label}</div>
        </motion.div>
      )}
    </div>
  )
}
