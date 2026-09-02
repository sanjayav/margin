/* ───────────────────────────────────────────────────────────────────────────
   Empty-state art.
   ---------------------------------------------------------------------------
   A greyed-out icon in a circle is what an interface uses when nobody decided
   what the empty state should say. These are drawn from the product's own
   geometry — the AiRE triangle, the compliance line, the grid the data sits on
   — so an empty screen still looks like this product rather than like a gap.

   Constraints they all keep to:
     · One accent, everything else in ink tokens. An empty state is not the
       moment to introduce a colour.
     · Theme-aware by construction: every fill is a token, so there is no second
       set of dark-mode artwork to maintain.
     · Quiet motion, once. The art settles; it does not loop in your peripheral
       vision while you read the sentence next to it.
   ─────────────────────────────────────────────────────────────────────────── */
import React from 'react'
import { prefersReducedMotion } from './motion'

export type ArtName = 'data' | 'search' | 'agent' | 'chart' | 'locked' | 'clean'

const GRID = (
  <g opacity=".5">
    {[0, 1, 2, 3, 4].map((r) =>
      [0, 1, 2, 3, 4, 5, 6].map((c) => (
        <circle key={`${r}-${c}`} cx={12 + c * 16} cy={14 + r * 16} r="1" fill="var(--line-strong)" />
      )))}
  </g>
)

/** The real mark, not an approximation of it. A hand-drawn triangle at this
 *  size reads as a warning sign, which is precisely the wrong thing for an
 *  empty state to say. */
const Mark = ({ x, y, size, o = 1 }: { x: number; y: number; size: number; o?: number }) => (
  <image href="/brand/aire-mark-black.png" x={x} y={y} width={size} height={size}
    opacity={o} preserveAspectRatio="xMidYMid meet" />
)

export function EmptyArt({ name, size = 116 }: { name: ArtName; size?: number }) {
  const still = prefersReducedMotion()
  const anim = (delay: number) =>
    still ? undefined : { animation: `aire-fade-up 620ms var(--ease-out) both ${delay}ms` }

  return (
    <svg width={size} height={size * 0.72} viewBox="0 0 120 86" fill="none" aria-hidden
      style={still ? undefined : { animation: 'aire-fade 400ms var(--ease) both' }}>
      {GRID}

      {name === 'data' && (
        <g>
          {/* an empty table: header rule, then rows that fade out */}
          <rect x="18" y="20" width="84" height="46" rx="7" fill="var(--surface-1)" stroke="var(--line)" />
          <path d="M18 32 H102" stroke="var(--line)" />
          {[38, 47, 56].map((y, i) => (
            <g key={y} style={anim(120 + i * 90)}>
              <rect x="26" y={y} width={34 - i * 6} height="4" rx="2" fill="var(--line-strong)" opacity={0.9 - i * 0.25} />
              <rect x="72" y={y} width={22 - i * 5} height="4" rx="2" fill="var(--line-strong)" opacity={0.7 - i * 0.2} />
            </g>
          ))}
          <rect x="26" y="24" width="18" height="4" rx="2" fill="var(--brand)" opacity=".5" />
        </g>
      )}

      {name === 'search' && (
        <g>
          <rect x="16" y="24" width="70" height="38" rx="7" fill="var(--surface-1)" stroke="var(--line)" />
          {[34, 44, 54].map((y, i) => (
            <rect key={y} x="26" y={y} width={44 - i * 12} height="4" rx="2" fill="var(--line-strong)" opacity={0.55 - i * 0.15} />
          ))}
          <g style={anim(160)}>
            <circle cx="80" cy="52" r="17" fill="var(--surface-1)" stroke="var(--brand)" strokeWidth="3" />
            <path d="M92 64 L102 74" stroke="var(--brand)" strokeWidth="4" strokeLinecap="round" />
          </g>
        </g>
      )}

      {name === 'agent' && (
        <g>
          {/* the sources it would read, and the orbit saying it is watching */}
          {[[10, 22], [10, 52], [96, 22], [96, 52]].map(([x, y], i) => (
            <g key={`${x}-${y}`} style={anim(220 + i * 80)}>
              <rect x={x} y={y} width="15" height="12" rx="3" fill="var(--surface-1)" stroke="var(--line)" />
              <path d={`M${x + 3.5} ${y + 4.5} H${x + 11.5} M${x + 3.5} ${y + 7.5} H${x + 9}`}
                stroke="var(--line-strong)" strokeWidth="1.2" strokeLinecap="round" />
            </g>
          ))}
          <ellipse cx="60" cy="43" rx="34" ry="21" fill="none" stroke="var(--agent)" strokeWidth="1.25"
            strokeDasharray="3 5" opacity=".5" />
          <g style={anim(0)}><Mark x={44} y={27} size={32} /></g>
          <circle cx="94" cy="43" r="3.5" fill="var(--agent)" style={anim(340)} />
          <circle cx="26" cy="43" r="2.5" fill="var(--agent)" opacity=".45" style={anim(460)} />
        </g>
      )}

      {name === 'chart' && (
        <g>
          <path d="M20 66 H100" stroke="var(--line-strong)" />
          <path d="M20 20 V66" stroke="var(--line-strong)" />
          {/* the compliance line, and nothing plotted against it yet */}
          <path d="M22 46 H98" stroke="var(--ink-3)" strokeWidth="1.75" strokeDasharray="5 4" />
          {[[36, 38], [56, 52], [76, 34]].map(([cx, cy], i) => (
            <circle key={cx} cx={cx} cy={cy} r="6" fill={cy < 46 ? 'var(--neg)' : 'var(--pos)'}
              fillOpacity=".18" stroke={cy < 46 ? 'var(--neg)' : 'var(--pos)'} strokeWidth="1.75"
              style={anim(140 + i * 110)} />
          ))}
        </g>
      )}

      {name === 'locked' && (
        <g>
          <rect x="34" y="38" width="52" height="34" rx="8" fill="var(--surface-1)" stroke="var(--line)" />
          <path d="M48 38 V30 a12 12 0 0 1 24 0 V38" fill="none" stroke="var(--ink-4)" strokeWidth="4" strokeLinecap="round"
            style={anim(120)} />
          <circle cx="60" cy="54" r="4.5" fill="var(--ink-4)" />
          <path d="M60 58 V63" stroke="var(--ink-4)" strokeWidth="3.5" strokeLinecap="round" />
        </g>
      )}

      {name === 'clean' && (
        <g>
          <circle cx="60" cy="43" r="24" fill="var(--pos-tint)" stroke="var(--pos-line)" />
          <path d="M49 43 l8 8 15 -17" fill="none" stroke="var(--pos)" strokeWidth="4.5"
            strokeLinecap="round" strokeLinejoin="round"
            style={still ? undefined : { strokeDasharray: 40, strokeDashoffset: 40, animation: 'aire-draw 620ms var(--ease-out) 180ms forwards' }} />
        </g>
      )}
    </svg>
  )
}
