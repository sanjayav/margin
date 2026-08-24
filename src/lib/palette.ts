// ───────────────────────────────────────────────────────────────────────────
// PALETTE — the single source of truth for data colour.
//
// Before this file the powertrain mapping existed FOUR times (lib/chart.ts,
// LimitChart, ScenarioRail, and a private helper in Data), and two of them had
// drifted: a BEV was #3ddc97 on every chart and #0E9F6E on the Data screen. The
// same vehicle wore different colours depending on which screen you were on.
//
// The old chart set also failed accessibility outright. Measured against the
// app's cream surface (#FBF7EF):
//   PHEV #5b8def ↔ HEV #8b7ff0 → ΔE 0.6 under deuteranopia, ΔE 6.5 with normal
//   colour vision. Indistinguishable to a colourblind reader and hard for
//   everyone else. BEV and MHEV also sat at 1.65:1 contrast against cream.
//
// The set below is derived from the Okabe–Ito colourblind-safe qualitative
// palette and validated against that surface. Result:
//   lightness band  PASS      chroma floor    PASS
//   CVD separation  PASS (worst adjacent ΔE 9.6 protan / 8.5 tritan)
//   normal vision   PASS (worst adjacent ΔE 18.7)
//   contrast        WARN on HEV/MHEV/FCEV — carried by the required relief:
//                   every surface using these also direct-labels the mark
//                   (bubble labels, legend, pill text) AND draws RING as a
//                   stroke, which gives the mark a visible edge on cream.
//
// Slots are assigned in CARBON ORDER (BEV → ICE) and are never cycled: a new
// powertrain gets an explicit slot or falls back to OTHER, never a generated hue.
// ───────────────────────────────────────────────────────────────────────────

/** Fill colour per powertrain — the identity colour. */
export const PT_COLORS: Record<string, string> = {
  BEV: '#009E73',
  FCEV: '#56B4E9',
  PHEV: '#0072B2',
  HEV: '#CC79A7',
  MHEV: '#E69F00',
  ICE: '#B4331F',
}

/** A darker step of the same hue, for mark strokes and text on tinted chips.
 *  This is what carries the contrast relief the validator asks for. */
export const PT_RING: Record<string, string> = {
  BEV: '#00714F',
  FCEV: '#2E7FAE',
  PHEV: '#00537F',
  HEV: '#9C5480',
  MHEV: '#A87400',
  ICE: '#872516',
}

/** Powertrain names that are the same THING as a canonical slot. Kept explicit
 *  so a market-specific label can never silently fall through to grey. */
const ALIAS: Record<string, string> = {
  'Strong Hybrid': 'HEV',
  'Mild Hybrid': 'MHEV',
  'Range-Extender Hybrid': 'PHEV',
  'Flex Fuel Ethanol': 'ICE',
  'Fuel Cell': 'FCEV',
  Hydrogen: 'FCEV',
  Electric: 'BEV',
  Petrol: 'ICE',
  Diesel: 'ICE',
}

/** Anything genuinely uncategorised. Deliberately low-chroma so it never reads
 *  as one of the identity slots. */
const OTHER = '#8C8273'
const OTHER_RING = '#6C6454'

const slot = (p: string) => ALIAS[p] ?? p

export const ptColor = (p: string) => PT_COLORS[slot(p)] ?? OTHER
export const ptRing = (p: string) => PT_RING[slot(p)] ?? OTHER_RING
/** Tint for a chip/pill background — the fill at low alpha. */
export const ptSoft = (p: string, alpha = 0.14) => `${ptColor(p)}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`

/** Canonical display order: cleanest first. Used for legends and stacked mixes
 *  so a mix bar always reads the same direction. */
export const PT_ORDER = ['BEV', 'FCEV', 'PHEV', 'HEV', 'MHEV', 'ICE']
export const ptRank = (p: string) => {
  const i = PT_ORDER.indexOf(slot(p))
  return i === -1 ? PT_ORDER.length : i
}

// ── Status — RESERVED. Never reused as a categorical series colour, so "over
//    the line" can never be confused with "this one happens to be series 4".
export const STATUS = {
  compliant: '#0E9F6E',
  fine: '#C0392B',
  exempt: '#8C8273',
  'no-sales': '#B3A892',
} as const
export const statusColor = (s: string) => (STATUS as Record<string, string>)[s] ?? OTHER
