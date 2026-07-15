// ───────────────────────────────────────────────────────────────────────────
// THE MASTER STRUCTURE — one registry for every heading of the India master
// file ("SCENARIO PLANNING TOOL Master data.xlsx", cols A→AT), which is the
// platform's canonical data-exchange structure. The Data module renders its
// optional columns from OPTIONAL_STRUCTURE (presence-aware: a column appears
// the moment any row in view carries a value) and explains the rest through
// the coverage panel built from MASTER_HEADINGS.
//
// Where each heading lives:
//   core      → always a table column (fleet + variant library)
//   k (field) → optional structure column, shown when populated
//   implicit  → carried by the module/view itself, not a per-row column
//   computed  → AO–AT, calculated live by the CAFE ledger (never stored)
// ───────────────────────────────────────────────────────────────────────────
import type { Vehicle } from '../engine/types'

export interface StructureCol { k: keyof Vehicle; label: string; num?: boolean }

/** Optional structure columns, in the master's column order. */
export const OPTIONAL_STRUCTURE: StructureCol[] = [
  { k: 'variantId', label: 'Variant code' },
  { k: 'bodyStyle', label: 'Body style' },
  { k: 'segment', label: 'Segment' },
  { k: 'engineCC', label: 'Engine cc', num: true },
  { k: 'powerKW', label: 'Power kW', num: true },
  { k: 'ftCode', label: 'FT code' },
  { k: 'gearbox', label: 'Gear box' },
  { k: 'driveline', label: 'Driveline' },
  { k: 'battery', label: 'Battery kWh', num: true },
  { k: 'kerbMass', label: 'Kerb weight kg', num: true },
  { k: 'fuelKmpl', label: 'km/l', num: true },
  { k: 'fuelMpg', label: 'mpg', num: true },
  { k: 'fuelL100', label: 'L/100km', num: true },
  { k: 'footprint', label: 'Footprint m²', num: true },
  { k: 'energy', label: 'Energy', num: true },
  { k: 'range', label: 'E-Range km', num: true },
  { k: 'rangeAlt', label: 'E-Range alt km', num: true },
  { k: 'otrPrice', label: 'OTR price', num: true },
  { k: 'refMass', label: 'Reference mass kg', num: true },
  { k: 'testMass', label: 'Test mass kg', num: true },
  { k: 'tax', label: 'Tax', num: true },
  { k: 'driveCycle', label: 'Drive cycle' },
  { k: 'lengthMm', label: 'Length mm', num: true },
  { k: 'widthMm', label: 'Width mm', num: true },
  { k: 'heightMm', label: 'Height mm', num: true },
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

/** Every master heading A→AT, source spellings preserved. */
export const MASTER_HEADINGS: MasterHeading[] = [
  { label: 'Year', core: true },
  { label: 'Sales Market', implicit: 'the module you are in' },
  { label: 'Data Mode', implicit: 'the view — Fleet = Model rows · Variant library = Variant rows' },
  { label: 'Scenario Name', implicit: 'the Basis column (Record vs Baseline projection)' },
  { label: 'Regultory Name', core: true },
  { label: 'Brand', core: true },
  { label: 'Model', core: true },
  { label: 'Variant Name', core: true },
  { label: 'Variant Code', k: 'variantId' },
  { label: 'Body Style', k: 'bodyStyle' },
  { label: 'Segment', k: 'segment' },
  { label: 'Powertrain Type', core: true },
  { label: 'Engine Capacity', k: 'engineCC' },
  { label: 'Fuel Type', core: true },
  { label: 'Engine Power', k: 'powerKW' },
  { label: 'FT Code', k: 'ftCode' },
  { label: 'Gear Box', k: 'gearbox' },
  { label: 'Driveline', k: 'driveline' },
  { label: 'Battery Capacity', k: 'battery' },
  { label: 'Kerb Weight', k: 'kerbMass' },
  { label: 'Vehicle Volume', core: true },
  { label: 'Fuel Consumption CO2', core: true },
  { label: 'Fuel economy (km/l)', k: 'fuelKmpl' },
  { label: 'Fuel economy (mpg)', k: 'fuelMpg' },
  { label: 'Fuel Consumption (L/100km)', k: 'fuelL100' },
  { label: 'Foot Print', k: 'footprint' },
  { label: 'Energy consumption', k: 'energy' },
  { label: 'E-Range', k: 'range' },
  { label: 'E-Range (alt)', k: 'rangeAlt' },
  { label: 'OTR Price', k: 'otrPrice' },
  { label: 'Reference Mass', k: 'refMass' },
  { label: 'Test Mass', k: 'testMass' },
  { label: 'Tax', k: 'tax' },
  { label: 'Vehicle Calssification', core: true },
  { label: 'Drive Cycle', k: 'driveCycle' },
  { label: 'Length', k: 'lengthMm' },
  { label: 'Width', k: 'widthMm' },
  { label: 'Height', k: 'heightMm' },
  { label: 'Avg CO2', core: true },
  { label: 'Avg weighted Mass', core: true },
  { label: 'Annual Corporate Average CO₂ Performance (P)', computed: true },
  { label: 'CAFCS (= P/23.7135)', computed: true },
  { label: "Manufacturer's Annual Corporate Average CO₂ Target (T)", computed: true },
  { label: 'ACAFC (= T/23.7135)', computed: true },
  { label: '+ve Credit / −ve Debit', computed: true },
  { label: 'Compliance (Yes/No)', computed: true },
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
