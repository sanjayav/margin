// ───────────────────────────────────────────────────────────────────────────
// THE MASTER STRUCTURE — one registry for every heading of the India master
// file ("DEMO DATA_SHARED.xlsx", sheet 'Plan', cols A→BH), which is the
// platform's canonical data-exchange structure. The Data module renders its
// optional columns from OPTIONAL_STRUCTURE (presence-aware: a column appears
// the moment any row in view carries a value) and explains the rest through
// the coverage panel built from MASTER_HEADINGS.
//
// Where each heading lives:
//   core      → always a table column (fleet + variant library)
//   k (field) → optional structure column, shown when populated
//   implicit  → carried by the module/view itself, not a per-row column
//   computed  → BC–BH, calculated live by the CAFE ledger (never stored)
//
// The heading set moved with the Aug-2026 workbook: the monthly split
// (M1–M12), the brand fuel-mix percentages and the R: ledger block are new;
// OTR Price, Tax and the length/width/height block are gone from the source
// and so are gone from here — a heading the file no longer has cannot be
// honestly reported as "empty at source".
// ───────────────────────────────────────────────────────────────────────────
import type { Vehicle } from '../engine/types'

export interface StructureCol { k: keyof Vehicle; label: string; num?: boolean }

/** Optional structure columns, in the master's column order (I→AF). */
export const OPTIONAL_STRUCTURE: StructureCol[] = [
  { k: 'variantId', label: 'Variant code' },
  { k: 'ftCode', label: 'FT code' },
  { k: 'powerKW', label: 'Power kW', num: true },
  { k: 'gearbox', label: 'Gear box' },
  { k: 'driveline', label: 'Driveline' },
  { k: 'battery', label: 'Battery kWh', num: true },
  { k: 'engineCC', label: 'Engine cc', num: true },
  { k: 'bodyStyle', label: 'Body style' },
  { k: 'segment', label: 'Segment' },
  { k: 'kerbMass', label: 'Kerb weight kg', num: true },
  { k: 'footprint', label: 'Footprint m²', num: true },
  { k: 'refMass', label: 'Reference mass kg', num: true },
  { k: 'testMass', label: 'Test mass kg', num: true },
  { k: 'fuelKmpl', label: 'km/l', num: true },
  { k: 'fuelMpg', label: 'mpg', num: true },
  { k: 'fuelL100', label: 'L/100km', num: true },
  { k: 'energy', label: 'Energy', num: true },
  { k: 'range', label: 'E-Range km', num: true },
  { k: 'rangeAlt', label: 'E-Range mi', num: true },
  { k: 'driveCycle', label: 'Drive cycle' },
]

export interface MasterHeading {
  /** the heading exactly as the master file spells it */
  label: string
  /** Vehicle field, when the heading is a per-row structure column */
  k?: keyof Vehicle
  /** always a core table column (never hidden) */
  core?: boolean
  /** carried by the module/view, not a per-row column */
  implicit?: string
  /** AO–AT: calculated live by the CAFE ledger */
  computed?: boolean
}

/** Every master heading A→BH, source spellings preserved. */
export const MASTER_HEADINGS: MasterHeading[] = [
  { label: 'Year', core: true },
  { label: 'Sales Market', implicit: 'the module you are in' },
  { label: 'Data Mode', implicit: 'the view — Fleet = Model rows · Variant library = Variant rows' },
  { label: 'Scenario Name', implicit: 'the Basis column (Record · part-year record · Baseline projection)' },
  { label: 'Regultory Name', core: true },
  { label: 'Brand', core: true },
  { label: 'Model', core: true },
  { label: 'Variant Name', core: true },
  { label: 'Variant Code', k: 'variantId' },
  { label: 'FT Code', k: 'ftCode' },
  { label: 'V:Powertrain Type', core: true },
  { label: 'V:Engine Power', k: 'powerKW' },
  { label: 'V:Gear Box', k: 'gearbox' },
  { label: 'V:Driveline', k: 'driveline' },
  { label: 'V:Battery Capacity', k: 'battery' },
  { label: 'V:Engine Capacity', k: 'engineCC' },
  { label: 'V:Fuel Type', core: true },
  { label: 'V:Body Style', k: 'bodyStyle' },
  { label: 'V:Segment', k: 'segment' },
  { label: 'V:Kerb Weight', k: 'kerbMass' },
  { label: 'V:Foot Print', k: 'footprint' },
  { label: 'V:Reference Mass', k: 'refMass' },
  { label: 'V:Test Mass', k: 'testMass' },
  { label: 'V:Vehicle Calssification', core: true },
  { label: 'V:Fuel Consumption (CO₂ g/km)', core: true },
  { label: 'V:Fuel economy (km/l, km/kg)', k: 'fuelKmpl' },
  { label: 'V:Fuel economy (mpg)', k: 'fuelMpg' },
  { label: 'V:Fuel Consumption (L/100km)', k: 'fuelL100' },
  { label: 'V:Energy consumption (kWh/100km)', k: 'energy' },
  { label: 'V:E-Range (km)', k: 'range' },
  { label: 'V:E-Range (miles)', k: 'rangeAlt' },
  { label: 'V:Drive Cycle', k: 'driveCycle' },
  { label: 'M:Avg CO2', core: true },
  { label: 'M:Avg weighted Mass', core: true },
  { label: 'M:M1 – M12 (monthly split)', implicit: 'the Basis column — a year with fewer than 12 months recorded is badged as a part-year record' },
  { label: 'V:Sales Volume', implicit: 'the variant library is a spec catalog; its planning volumes are not compliance sales' },
  { label: 'M:Sales Volume', core: true },
  { label: 'B:Sales Volume', implicit: 'the brand roll-up in Plan / Analyse' },
  { label: 'B: Petrol % · Diesel % · CNG % · BEV % · SHEV %', implicit: 'the powertrain-mix breakdown, computed live from the fleet' },
  { label: 'R:Annual Corporate Average CO₂ Performance (P)', computed: true },
  { label: 'R:CAFCS (= P/23.7135)', computed: true },
  { label: "R:Manufacturer's Annual Corporate Average CO₂ Target (T)", computed: true },
  { label: 'R:ACAFC (= T/23.7135)', computed: true },
  { label: 'R: +ve Credit / −ve Debit', computed: true },
  { label: "R: Manufacturer's Corporate Average CO₂ Compliance", computed: true },
]

/** Coverage of the master structure over a set of rows: which headings carry
 *  data, which are empty at source, which are implicit/computed. */
export function structureCoverage(rows: Vehicle[]) {
  const populated = (k: keyof Vehicle) => rows.some((r) => r[k] != null && r[k] !== '')
  const items = MASTER_HEADINGS.map((h) => ({
    ...h,
    state: h.core ? ('core' as const)
      : h.computed ? ('computed' as const)
      : h.implicit ? ('implicit' as const)
      : populated(h.k!) ? ('populated' as const)
      : ('empty' as const),
  }))
  const carrying = items.filter((i) => i.state === 'core' || i.state === 'populated').length
  const total = items.filter((i) => i.state !== 'implicit' && i.state !== 'computed').length
  return { items, carrying, total }
}
