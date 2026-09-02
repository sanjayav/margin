/* ───────────────────────────────────────────────────────────────────────────
   The lever contract.
   ---------------------------------------------------------------------------
   One table, imported by BOTH the Scenario workbench and the server-side
   validation gate in /api/agents. That is the point of the file: a bound the
   UI enforces and a bound the server enforces must be the same bound, or the
   UI is lying about what will be accepted.

   `applies` decides whether a lever exists in a given regime at all. A lever
   that has no meaning here is not disabled — it is absent, because showing a
   control that cannot legally do anything is worse than not showing it.
   ─────────────────────────────────────────────────────────────────────────── */
import type { RulePack } from '../../../engine/types'
import { poolingAllowed } from '../../../engine/blocks'

export interface LeverSpec {
  key: string
  label: string
  blurb: string
  unit?: string
  min?: number
  max?: number
  step?: number
  bool?: true
  /** Which function owns this decision in a real organisation. */
  owner: 'Product' | 'Powertrain' | 'Commercial' | 'Regulatory'
  /** Whether this lever exists at all in this regime, in this year. The year
   *  matters: India has no pooling under CAFE II and voluntary pooling from
   *  draft CAFE III, so a lever list built from the pack alone is wrong for
   *  half the years the pack covers. */
  applies: (p: RulePack, year: number) => boolean
}

const always = () => true

export const LEVERS: LeverSpec[] = [
  {
    key: 'evSharePct', label: 'Zero-emission share', unit: '%', min: 0, max: 95, step: 1, owner: 'Product',
    blurb: 'Force the share of registrations that are zero-emission, reallocating volume from the combustion mix.',
    applies: always,
  },
  {
    key: 'salesMultiplier', label: 'Volume', unit: '×', min: 0.5, max: 2, step: 0.05, owner: 'Commercial',
    blurb: 'Scale total registrations. A sales-weighted average is volume-invariant, so this moves exposure, not the fleet number.',
    applies: always,
  },
  {
    key: 'massShiftKg', label: 'Average mass', unit: 'kg', min: -300, max: 300, step: 5, owner: 'Product',
    blurb: 'Shift average vehicle mass. Where the limit is mass-based this moves the TARGET as well as the fleet — often in the same direction.',
    applies: (p) => /mass|kerb|MIRO/i.test(p.limitNote) || p.massLabel.length > 0,
  },
  {
    key: 'ecoBoostG', label: 'Eco-innovation credit', unit: 'g/km', min: 0, max: 7, step: 0.5, owner: 'Powertrain',
    blurb: 'Additional certified off-cycle credit, capped by the regime.',
    applies: (p) => p.id === 'EU' || p.id === 'UK',
  },
  {
    key: 'targetShiftPct', label: 'Target stringency stress', unit: '%', min: -30, max: 30, step: 1, owner: 'Regulatory',
    blurb: 'Stress the statutory target itself — for regimes whose norms are drafted but not notified. Negative means the final rules land tighter.',
    applies: (p) => p.id === 'IN',
  },
  {
    key: 'cnfBoostPct', label: 'Fuel pathway', unit: 'pts', min: 0, max: 25, step: 1, owner: 'Powertrain',
    blurb: 'Extra carbon-neutral-fuel discount points on top of the per-vehicle default — a richer blend or CNG pathway.',
    applies: (p) => p.id === 'IN',
  },
  {
    key: 'cycleWltp', label: 'MIDC → WLTP conversion', bool: true, owner: 'Regulatory',
    blurb: 'Apply the homologation cycle change to fuel use while the limit stays on the old basis — the transition cliff.',
    applies: (p) => p.id === 'IN',
  },
  {
    key: 'phevUF', label: 'PHEV utility factor', bool: true, owner: 'Regulatory',
    blurb: 'Apply the 2025+ utility-factor correction to plug-in hybrids.',
    applies: (p) => p.id === 'EU',
  },
  {
    key: 'poolingEnabled', label: 'Pooling', bool: true, owner: 'Commercial',
    blurb: 'Assess this fleet as part of a pool rather than standalone.',
    applies: (p, year) => poolingAllowed(p, year),
  },
  {
    key: 'superCreditsEnabled', label: 'Super-credits', bool: true, owner: 'Regulatory',
    blurb: 'Count low-emission registrations at their multiplied weight, where the regime grants one.',
    applies: (p) => /super/i.test(p.credits),
  },
]

export const leversFor = (pack: RulePack, year: number) => LEVERS.filter((l) => l.applies(pack, year))
export const LEVER_BY_KEY = Object.fromEntries(LEVERS.map((l) => [l.key, l])) as Record<string, LeverSpec>

/** Bounds only — the shape the server gate consumes. Kept as a derived value
 *  so it can never fall out of step with the workbench. */
export const LEVER_BOUNDS: Record<string, { min?: number; max?: number; bool?: true; label: string; unit?: string }> =
  Object.fromEntries(LEVERS.map((l) => [l.key, { min: l.min, max: l.max, bool: l.bool, label: l.label, unit: l.unit }]))

export interface PreflightIssue { key: string; message: string; severity: 'error' | 'warn' }

/** The checks the workbench can run without a round trip. Deliberately a
 *  SUBSET of the server gate — it exists to stop a user wasting a run, never to
 *  substitute for the authoritative check. */
export function preflight(values: Record<string, unknown>, pack: RulePack, year: number): PreflightIssue[] {
  const out: PreflightIssue[] = []
  for (const [key, v] of Object.entries(values)) {
    const spec = LEVER_BY_KEY[key]
    if (!spec) continue
    if (!spec.applies(pack, year)) {
      out.push({
        key,
        message: spec.key === 'poolingEnabled' && pack.pooling.fromYear != null
          ? `Pooling does not exist in ${pack.name} in ${year} — it begins in ${pack.pooling.fromYear}.`
          : `${spec.label} has no meaning in ${pack.name} and would be refused.`,
        severity: 'error',
      })
      continue
    }
    if (spec.bool) continue
    const n = Number(v)
    if (v == null || !isFinite(n)) continue
    if ((spec.min != null && n < spec.min) || (spec.max != null && n > spec.max)) {
      out.push({ key, message: `${spec.label} must be between ${spec.min} and ${spec.max}${spec.unit ?? ''}.`, severity: 'error' })
    }
  }
  return out
}
