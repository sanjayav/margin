/* ───────────────────────────────────────────────────────────────────────────
   Cases — a scenario board, not a three-row table.
   ---------------------------------------------------------------------------
   The syndicated houses sell you a base, a high and a low. That is not wrong,
   it is just not decidable: three numbers with no weights and no falsifiers
   cannot be turned into a plan. So a case here carries four things a bare
   high/low does not:

     WEIGHT      — what you think the odds are. Weights renormalise to 100%, and
                   the board reports a probability-weighted expectation, which is
                   the number a board paper should actually quote.
     FALSIFIER   — "what would have to be true". A case you cannot disprove is a
                   mood, not a scenario.
     ORIGIN      — house view, an analyst's edit, or an agent revision carrying a
                   citation. Six months later, "why is adoption 55%?" has an
                   answer.
     EVIDENCE    — the sources that moved it there.

   Cases are expressed as DELTAS on the Assumption Book, never as absolute
   driver sets. That way changing the house view re-bases every case at once,
   which is the behaviour you want and the one people usually have to do by
   hand in a spreadsheet.
   ─────────────────────────────────────────────────────────────────────────── */
import { DRIVER_META, type DriverKey, type DriverSet } from '../../../engine/outlook'
import type { Citation } from '../../agents/kernel'

export type CaseOrigin = 'house' | 'analyst' | 'agent'

export interface ForecastCase {
  id: string
  name: string
  blurb: string
  /** Deltas against the Assumption Book, not absolute values. */
  deltas: Partial<DriverSet>
  /** 0–1, renormalised across the board before use. */
  weight: number
  origin: CaseOrigin
  /** What would have to be true for this case to be the one that happens. */
  falsifier: string
  citations?: Citation[]
  /** Built-in cases cannot be deleted; they can be reweighted and edited. */
  builtin?: boolean
}

/** The three the platform ships with. Deliberately opinionated about WHY each
 *  one is a coherent world rather than a uniform ±10% on everything — a case
 *  where adoption rises and mass also rises is not a case, it is noise. */
export const BUILTIN_CASES: ForecastCase[] = [
  {
    id: 'house', name: 'House view', builtin: true, origin: 'house', weight: 0.5,
    blurb: 'The Assumption Book exactly as signed off.',
    deltas: {},
    falsifier: 'Nothing — this is the baseline every other case is measured against.',
  },
  {
    id: 'accelerate', name: 'Transition accelerates', builtin: true, origin: 'house', weight: 0.25,
    blurb: 'Cheaper batteries and tighter policy pull adoption forward; the combustion mix improves faster and the segment drift stalls.',
    deltas: { evShareHorizon: +10, iceCo2Improve: +0.5, massDrift: -3, marketGrowth: -0.5 },
    falsifier: 'Battery pack prices keep falling and no major market softens its mandate. Watch cell pricing and any mandate review that opens.',
  },
  {
    id: 'stall', name: 'Transition stalls', builtin: true, origin: 'house', weight: 0.25,
    blurb: 'Incentives lapse and charging build-out slips; buyers stay in larger combustion vehicles and the fleet gets heavier.',
    deltas: { evShareHorizon: -10, iceCo2Improve: -0.5, massDrift: +3, marketGrowth: +1 },
    falsifier: 'A major purchase incentive expires without replacement, or charging deployment misses its published trajectory two years running.',
  },
]

/** Apply a case's deltas to the Assumption Book, clamped to each driver's own
 *  bounds. A case can shift the view; it cannot take a driver somewhere the
 *  driver is not allowed to go. */
export function applyCase(book: DriverSet, c: ForecastCase): DriverSet {
  const out = { ...book }
  for (const [k, d] of Object.entries(c.deltas)) {
    const meta = DRIVER_META.find((m) => m.key === (k as DriverKey))
    if (!meta || typeof d !== 'number') continue
    out[k as DriverKey] = Math.min(meta.max, Math.max(meta.min, out[k as DriverKey] + d))
  }
  return out
}

/** Weights are a belief, so they are allowed to be sloppy on input and are
 *  normalised on use. A board that silently ran on weights summing to 0.8 would
 *  understate everything by 20%. */
export function normalisedWeights(cases: ForecastCase[]): Record<string, number> {
  const total = cases.reduce((a, c) => a + Math.max(0, c.weight), 0)
  if (total <= 0) return Object.fromEntries(cases.map((c) => [c.id, 1 / cases.length]))
  return Object.fromEntries(cases.map((c) => [c.id, Math.max(0, c.weight) / total]))
}

/** Probability-weighted expectation of a per-case series. */
export function weighted(cases: ForecastCase[], valueOf: (c: ForecastCase) => number): number {
  const w = normalisedWeights(cases)
  return cases.reduce((a, c) => a + valueOf(c) * w[c.id], 0)
}

/** A one-line description of what a case changes, for the card. */
export function describeDeltas(c: ForecastCase): { label: string; delta: number; unit: string }[] {
  return Object.entries(c.deltas)
    .map(([k, d]) => {
      const m = DRIVER_META.find((x) => x.key === (k as DriverKey))
      return m && typeof d === 'number' ? { label: m.label, delta: d, unit: m.unit } : null
    })
    .filter(Boolean) as { label: string; delta: number; unit: string }[]
}

/* ───────────────────────────────────────────────────────────────────────────
   Evidence — what the Horizon analyst brings back from the live feed.
   ─────────────────────────────────────────────────────────────────────────── */

export interface EvidenceItem {
  id: string
  /** Headline as published. Never rewritten — a paraphrased source is not a source. */
  headline: string
  outlet: string
  publishedAt?: string
  url?: string
  summary: string
  market: string
  /** Which assumption this bears on, and which way it pushes it. */
  driver: DriverKey
  direction: 'raises' | 'lowers' | 'confirms'
  /** The revision the agent would make to that driver, if accepted. */
  suggested?: number
  /** How strongly the item supports the revision. */
  strength: 'strong' | 'moderate' | 'weak'
  status: 'new' | 'accepted' | 'dismissed'
  foundAt: string
}

export const STRENGTH_TONE = { strong: 'neg', moderate: 'warn', weak: 'neutral' } as const
export const DIRECTION_LABEL: Record<EvidenceItem['direction'], string> = {
  raises: 'points higher', lowers: 'points lower', confirms: 'supports the current view',
}
