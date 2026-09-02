// ───────────────────────────────────────────────────────────────────────────
// DEFAULT VALUES — a versioned dataset, honest about its own status.
//
// The Commission sets default values by implementing act and revises them. This
// file therefore behaves like a price feed, not like a constant: every row
// carries a status, a source and a version, and the engine PROPAGATES that
// status into every figure derived from it.
//
// The rows shipped here are marked 'indicative'. They are the right order of
// magnitude and the right SHAPE — a blast-furnace route carrying several times
// the footprint of a scrap-fed arc furnace, and a mark-up over the country
// average — but they are not the published implementing-act figures and the
// system says so, every time, wherever a number derived from them is displayed.
// `publishDefaults()` replaces them with the real table; nothing else changes.
//
// This is the discipline the whole product rests on: it is better to hand a
// customer a number stamped "indicative — not the published table" than a
// confident number they cannot defend to a verifier.
// ───────────────────────────────────────────────────────────────────────────
import type { GoodsCategory } from './boundaries.js'

export type DefaultStatus = 'published' | 'indicative'

export interface DefaultValue {
  category: GoodsCategory
  /** Country the default applies to; '*' is the fallback used where no
   *  country-specific value has been set. */
  country: string
  /** Direct specific embedded emissions, tCO₂e per tonne. */
  direct: number
  /** Indirect (electricity) specific embedded emissions, tCO₂e per tonne. */
  indirect: number
  status: DefaultStatus
  source: string
  clauseIds: string[]
}

export interface DefaultsTable {
  version: string
  status: DefaultStatus
  /** Shown verbatim next to any figure derived from this table. */
  caveat: string
  rows: DefaultValue[]
}

const IND = 'indicative' as const
const SRC = 'Analyst estimate pending the Commission implementing act on default values'
const CL = ['cbam.default-values', 'cbam.art7']

export const DEFAULTS: DefaultsTable = {
  version: '2026.09-indicative',
  status: IND,
  caveat: 'Indicative defaults — not the published Commission implementing-act table. Correct in order of magnitude and in the relative standing of production routes; not to be used as the surrendered figure. Replace via publishDefaults() when the implementing act is loaded.',
  rows: [
    { category: 'sintered-ore', country: 'CN', direct: 0.30, indirect: 0.04, status: IND, source: SRC, clauseIds: CL },
    { category: 'sintered-ore', country: '*', direct: 0.27, indirect: 0.03, status: IND, source: SRC, clauseIds: CL },
    { category: 'pig-iron', country: 'CN', direct: 1.95, indirect: 0.08, status: IND, source: SRC, clauseIds: CL },
    { category: 'pig-iron', country: '*', direct: 1.72, indirect: 0.07, status: IND, source: SRC, clauseIds: CL },
    { category: 'dri', country: 'CN', direct: 1.05, indirect: 0.09, status: IND, source: SRC, clauseIds: CL },
    { category: 'dri', country: '*', direct: 0.98, indirect: 0.08, status: IND, source: SRC, clauseIds: CL },
    // Crude steel: the number the Chinese blast-furnace mill is judged against,
    // and the reason this product exists. The country row sits well above the
    // world fallback because the default carries a mark-up over the exporting
    // country's average, and China's average is BF-BOF-weighted.
    { category: 'crude-steel', country: 'CN', direct: 2.34, indirect: 0.22, status: IND, source: SRC, clauseIds: CL },
    { category: 'crude-steel', country: '*', direct: 1.86, indirect: 0.18, status: IND, source: SRC, clauseIds: CL },
    { category: 'iron-steel-products', country: 'CN', direct: 2.48, indirect: 0.31, status: IND, source: SRC, clauseIds: CL },
    { category: 'iron-steel-products', country: '*', direct: 1.99, indirect: 0.25, status: IND, source: SRC, clauseIds: CL },
    { category: 'ferro-alloys', country: '*', direct: 2.10, indirect: 0.90, status: IND, source: SRC, clauseIds: CL },
  ],
}

let TABLE: DefaultsTable = DEFAULTS

/** Swap in the published implementing-act table. The only supported way to make
 *  the engine emit 'published'-status figures. */
export function publishDefaults(t: DefaultsTable) { TABLE = t }
export function currentDefaults(): DefaultsTable { return TABLE }

export interface DefaultLookup {
  value: DefaultValue
  /** true when the country-specific row was missing and the '*' fallback was
   *  used — a materially weaker basis that must be surfaced. */
  fellBack: boolean
  tableVersion: string
  status: DefaultStatus
  caveat: string
}

export function lookupDefault(category: GoodsCategory, country: string): DefaultLookup | null {
  const exact = TABLE.rows.find((r) => r.category === category && r.country === country)
  const star = TABLE.rows.find((r) => r.category === category && r.country === '*')
  const value = exact ?? star
  if (!value) return null
  return { value, fellBack: !exact, tableVersion: TABLE.version, status: TABLE.status, caveat: TABLE.caveat }
}

/** Total default intensity for a category, honouring whether the good takes an
 *  indirect component at all. */
export function defaultIntensity(category: GoodsCategory, country: string, includeIndirect: boolean): DefaultLookup & { total: number } | null {
  const d = lookupDefault(category, country)
  if (!d) return null
  return { ...d, total: d.value.direct + (includeIndirect ? d.value.indirect : 0) }
}
