// ───────────────────────────────────────────────────────────────────────────
// VAHAN BENCHMARK — the official registry, used as a control on our volumes.
//
// VAHAN (MoRTH's national vehicle-registration database, analytics.parivahan
// .gov.in) is the authoritative count of what was actually registered in India.
// It is NOT a substitute for the fleet data, for one decisive reason:
//
//     VAHAN records registrations. It carries no CO₂ and no kerb mass.
//
// CAFE compliance is a sales-weighted average of CO₂ over kerb mass, so VAHAN
// alone cannot compute a single number on this screen. What it can do — and
// what it is used for here — is tell us whether our volumes are right.
//
// The public dashboard exposes no API and no export (it is a JSF app that
// populates entirely through interactive form submission), so these figures are
// the published aggregates, cited below, not a scrape. Only numbers that are
// actually published are stated as units; anything inferred from a rounded
// share is marked derived, and derived figures are never used as a hard check.
// ───────────────────────────────────────────────────────────────────────────

export interface VahanEntry {
  parent: string
  /** registrations, where VAHAN publishes an absolute figure */
  units?: number
  /** market share as published (fraction) */
  share?: number
  /** year-on-year growth as published (fraction) */
  growth?: number
  /** true when `units` is inferred from a rounded share, not published directly */
  derived?: boolean
}

export interface VahanYear {
  /** compliance year (FY start): 2025 = FY2025-26, Apr 2025 → Mar 2026 */
  year: number
  total: number
  makers: VahanEntry[]
}

export const VAHAN_SOURCE = {
  name: 'VAHAN · Ministry of Road Transport & Highways',
  dashboard: 'https://analytics.parivahan.gov.in/analytics/publicdashboard/vahan',
  note:
    'Registration counts only — VAHAN carries no CO₂ and no kerb mass, so it benchmarks volume, ' +
    'it cannot compute compliance. The public dashboard exposes no API or export; these are the ' +
    'published aggregates.',
  retrieved: '2026-08-05',
}

export const VAHAN: VahanYear[] = [
  {
    year: 2025, // FY2025-26
    total: 4_705_056,
    makers: [
      { parent: 'Maruti Suzuki India Limited', units: 1_868_000, share: 0.397, growth: 0.116 },
      { parent: 'Mahindra & Mahindra Limited', share: 0.134, growth: 0.222, derived: true },
      { parent: 'Tata Motors Passenger Vehicles Limited', share: 0.121, growth: 0.145, derived: true },
      { parent: 'Hyundai Motor India Limited', share: 0.115, growth: 0.031, derived: true },
      { parent: 'Toyota Kirloskar Motor Pvt. Ltd', growth: 0.204 },
    ],
  },
  { year: 2024, total: 4_163_927, makers: [] }, // FY2024-25, for the growth base
]

/** Units for a maker in a VAHAN year — published where possible, else derived
 *  from the rounded share (flagged, so a caller can refuse to lean on it). */
export function vahanUnits(year: number, parent: string): { units: number; derived: boolean } | null {
  const y = VAHAN.find((v) => v.year === year)
  const m = y?.makers.find((x) => x.parent === parent)
  if (!y || !m) return null
  if (m.units != null) return { units: m.units, derived: false }
  if (m.share != null) return { units: Math.round(m.share * y.total), derived: true }
  return null
}
