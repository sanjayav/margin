/* ───────────────────────────────────────────────────────────────────────────
   Icons — one stroke weight, one grid, no dependency.
   24×24 grid, 1.6 stroke, round caps. Drawn rather than imported so the set
   stays exactly as large as the product needs and never ships 900 unused paths.
   ─────────────────────────────────────────────────────────────────────────── */
import React from 'react'

const P: Record<string, string> = {
  // navigation & modules
  plan:       'M3 20h18M6 16V9M11 16V5M16 16v-4M21 16v-8',
  forecast:   'M3 17l5-6 4 3 5-7 4 4M17 7h4v4',
  scenario:   'M12 3v18M5 8l7-5 7 5M5 8v8l7 5 7-5V8',
  creditbook: 'M4 5h11a3 3 0 0 1 3 3v11H7a3 3 0 0 1-3-3zM4 5v11M8 9h6M8 13h4',
  pooling:    'M9 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM9 9v3a3 3 0 0 0 3 3h4M9 12v3',
  data:       'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  regai:      'M12 3l7.5 3.5v5c0 4.4-3.1 8.3-7.5 9.5-4.4-1.2-7.5-5.1-7.5-9.5v-5zM9.5 12l1.8 1.8 3.5-3.6',
  pricing:    'M3 8h18M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM7 14h3',
  // agents
  agent:      'M12 3v3M8 6h8a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3zM9.5 11.5v1M14.5 11.5v1M10 15h4',
  spark:      'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z',
  branch:     'M7 4v9a3 3 0 0 0 3 3h4M7 4a2 2 0 1 0 0-.1M17 16a2 2 0 1 0 0 .1M17 8a2 2 0 1 0 0-.1M17 10v4M17 8h-3a3 3 0 0 0-3 3',
  tool:       'M14.5 5.5a4 4 0 0 0 5 5L21 9l-6.5 6.5L9 21l-3-3 5.5-5.5L18 6z',
  // state
  check:      'M4.5 12.5l5 5 10-11',
  x:          'M5 5l14 14M19 5L5 19',
  alert:      'M12 8v5M12 16.5v.5M10.3 3.9 2.6 17.4A2 2 0 0 0 4.3 20.4h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  clock:      'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3.2 2',
  shield:     'M12 3l7.5 3.5v5c0 4.4-3.1 8.3-7.5 9.5-4.4-1.2-7.5-5.1-7.5-9.5v-5z',
  lock:       'M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3',
  // actions
  search:     'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM16.2 16.2 21 21',
  plus:       'M12 5v14M5 12h14',
  minus:      'M5 12h14',
  chevron:    'M9.5 6l6 6-6 6',
  chevronDown:'M6 9.5l6 6 6-6',
  arrowRight: 'M4 12h15M13 6l6 6-6 6',
  arrowUp:    'M12 20V5M6 11l6-6 6 6',
  external:   'M14 5h5v5M19 5l-8 8M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4',
  download:   'M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19h14',
  upload:     'M12 15V4M7.5 8.5 12 4l4.5 4.5M5 19h14',
  refresh:    'M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5',
  filter:     'M4 6h16l-6 7v6l-4-2v-4z',
  copy:       'M9 9h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
  trash:      'M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13h10l1-13M10 11v6M14 11v6',
  play:       'M7 4.5 19 12 7 19.5z',
  pause:      'M8 5v14M16 5v14',
  edit:       'M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17z',
  // objects
  users:      'M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20M9 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM22 20v-1.5a4 4 0 0 0-3-3.9M16 3.6a4 4 0 0 1 0 7.7',
  user:       'M19 20v-1.5a5 5 0 0 0-5-5h-4a5 5 0 0 0-5 5V20M12 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  settings:   'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 14a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.3 6l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V2a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 17 3.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.7 1z',
  bell:       'M18 9a6 6 0 1 0-12 0c0 6-2.5 7-2.5 7h17S18 15 18 9zM10.3 20a2 2 0 0 0 3.4 0',
  file:       'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4',
  globe:      'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3.2 9h17.6M3.2 15h17.6M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z',
  book:       'M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5zM4 17.5A2.5 2.5 0 0 1 6.5 15H20',
  link:       'M10 13a5 5 0 0 0 7.5.5l3-3A5 5 0 0 0 13.5 3.4l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3A5 5 0 0 0 10.5 20.6l1.7-1.7',
  grid:       'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  list:       'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  layers:     'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5',
  target:     'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM12 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  gauge:      'M12 15.5V11M4.5 18a9 9 0 1 1 15 0M8 15l4-4',
  scale:      'M12 4v16M7 20h10M6 8h12M6 8 3 15h6zM18 8l-3 7h6z',
  activity:   'M3 12h4l3 8 4-16 3 8h4',
  logout:     'M15 17l5-5-5-5M20 12H9M12 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6',
  menu:       'M3 6h18M3 12h18M3 18h18',
  panel:      'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM15 5v14',
  sun:        'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon:       'M20 14.2A8.5 8.5 0 0 1 9.8 4 8.5 8.5 0 1 0 20 14.2z',
  history:    'M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3.5 5v4.5H8M12 7.5V12l3 1.8',
}

export type IconName = keyof typeof P

export default function Icon({ name, size = 16, className, strokeWidth = 1.6, style }: {
  name: IconName; size?: number; className?: string; strokeWidth?: number; style?: React.CSSProperties
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={style}
      stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden focusable="false">
      <path d={P[name]} />
    </svg>
  )
}

/* ───────────────────────────────────────────────────────────────────────────
   Brand
   ---------------------------------------------------------------------------
   The mark is the real asset, not a redrawing of it. An impossible-triangle
   with a three-stop gradient is not something to approximate in inline SVG —
   an approximation that is 95% right is a logo that is 100% wrong. So the
   artwork is served from /brand, and the MOTION is what this file adds:

     · arrival — scale-and-rotate in, once, on mount
     · idle    — a slow float, so a static page still feels alive
     · sheen   — a light sweep across the mark, on the sign-in hero only

   The mark reads on light and dark alike (it is a red gradient on transparency),
   so there is one file rather than a theme pair.
   ─────────────────────────────────────────────────────────────────────────── */

export function Logo({ size = 22, className, animated, idle = true }: {
  size?: number; className?: string; animated?: boolean; idle?: boolean
}) {
  return (
    <span className={cxx('relative inline-flex shrink-0', animated && 'brand-mark', className)}
      style={{ width: size, height: size }}>
      <img src="/brand/aire-mark-black.png" alt="AiRE" width={size} height={size}
        className={cxx('h-full w-full object-contain', idle && animated && 'brand-mark-idle')}
        draggable={false} />
    </span>
  )
}

/** The full lockup — mark plus wordmark. Two files because the wordmark is
 *  solid ink and has to invert; the mark does not. */
export function Lockup({ height = 26, tone = 'auto', className }: {
  height?: number; tone?: 'light' | 'dark' | 'auto'; className?: string
}) {
  const src = tone === 'dark' ? '/brand/aire-lockup-white.png' : '/brand/aire-lockup-black.png'
  return (
    <img src={src} alt="AiRE" style={{ height }} draggable={false}
      className={cxx('w-auto object-contain', tone === 'auto' && 'dark:hidden', className)} />
  )
}

/** The mark with a light sweep across it. Used once, on the sign-in hero —
 *  a sheen that appears on every screen stops being an accent. */
export function LogoHero({ size = 96, className }: { size?: number; className?: string }) {
  return (
    <span className={cxx('relative inline-flex shrink-0 overflow-hidden', className)} style={{ width: size, height: size }}>
      <span className="brand-mark brand-mark-idle absolute inset-0">
        <img src="/brand/aire-mark-black.png" alt="AiRE" className="h-full w-full object-contain" draggable={false} />
      </span>
      {/* The sweep is MASKED BY THE MARK ITSELF. Without the mask it paints a
          lit rectangle over the logo — the artefact that gives away a cheap
          shine effect. */}
      <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden"
        style={{
          WebkitMaskImage: 'url(/brand/aire-mark-black.png)', maskImage: 'url(/brand/aire-mark-black.png)',
          WebkitMaskSize: 'contain', maskSize: 'contain',
          WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
          WebkitMaskPosition: 'center', maskPosition: 'center',
        }}>
        <span className="absolute inset-y-[-40%] w-1/2"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,.75), transparent)',
            animation: 'aire-sheen 5s var(--ease) infinite 1.4s',
          }} />
      </span>
    </span>
  )
}

const cxx = (...p: (string | false | undefined)[]) => p.filter(Boolean).join(' ')
