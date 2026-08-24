// ───────────────────────────────────────────────────────────────────────────
// TOKENS — dark-first, warm.
//
// The product's identity is a warm near-black, not the blue-black every dev tool
// uses. Everything here is built on that: the greys carry a little of the brand's
// warmth so a card never reads as "default dark mode".
//
// The rule that does the most work: a surface is separated by LIGHT, not by a
// border. Elevation is an inset highlight along the top edge (as if light falls
// from above) plus a hairline. No drop shadows — a shadow on near-black is mud.
// ───────────────────────────────────────────────────────────────────────────

export const SURFACE = {
  /** The room. Everything sits on this. */
  base: '#100E0C',
  /** A panel resting on the room. */
  raised: '#17140F',
  /** A panel resting on a panel — used sparingly; two levels is the limit. */
  high: '#1E1A16',
  /** The one true black, for the metric band and full-bleed media. */
  ink: '#0A0908',
} as const

export const LINE = {
  /** Hairline between regions. Barely there by design. */
  hair: 'rgba(255,255,255,0.07)',
  /** A line that has to be seen — a selected row, an active tab. */
  strong: 'rgba(255,255,255,0.14)',
} as const

export const TEXT = {
  /** Headlines and figures. */
  primary: '#F6F2EB',
  /** Body. */
  secondary: '#B8AEA0',
  /** Labels, captions, units. */
  muted: '#7E756A',
  /** Disabled, or a value that is deliberately quiet. */
  faint: '#5A534A',
} as const

export const BRAND = {
  base: '#E8223B',
  hover: '#F2384F',
  /** A wash for a selected nav item — never a fill. */
  wash: 'rgba(232,34,59,0.10)',
} as const

/** Elevation: an inset top highlight plus a hairline. Light falls from above, so
 *  a raised surface catches it on its top edge. Cheap, and it reads as material
 *  rather than as a box. */
export const bezel = (level: 1 | 2 = 1) =>
  level === 1
    ? { background: SURFACE.raised, boxShadow: `inset 0 1px 0 rgba(255,255,255,0.055), 0 0 0 1px ${LINE.hair}` }
    : { background: SURFACE.high, boxShadow: `inset 0 1px 0 rgba(255,255,255,0.07), 0 0 0 1px ${LINE.hair}` }

/** Motion. Mass and settle — never `linear`, never `ease-in-out`. */
export const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)'
export const DUR = { state: 150, enter: 260, settle: 420 } as const
