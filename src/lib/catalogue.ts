// ───────────────────────────────────────────────────────────────────────────
// CATALOGUE PARSER — a pasted/attached product list → engine Vehicles.
//
// Forgiving CSV/TSV reader for the Compliance Co-pilot: it takes whatever a user
// drops in (a spreadsheet copy, a supplier catalogue, an export) and maps the
// columns it recognises — model, CO₂, mass, units, fuel, powertrain, brand —
// onto the fields the engine needs. Everything it can't place is ignored; a row
// only counts once it has at least a name and a CO₂ (or is flagged electric).
// Deterministic, no deps.
// ───────────────────────────────────────────────────────────────────────────
import type { Vehicle } from '../engine/types'

export interface ParsedCatalogue {
  vehicles: Vehicle[]
  columns: { field: string; header: string }[]
  skipped: number
  note: string
}

const HEADER_MAP: { field: keyof Vehicle | 'brand'; re: RegExp }[] = [
  { field: 'model', re: /\b(model|name|vehicle|variant|trim|description|product)\b/i },
  { field: 'co2', re: /\b(co2|co₂|emission|g\/?km|gco2|tailpipe)\b/i },
  { field: 'mass', re: /\b(mass|kerb|curb|weight|kg)\b/i },
  { field: 'sales', re: /\b(sales|units|volume|registrations?|qty|quantity|forecast|plan)\b/i },
  { field: 'fuel', re: /\b(fuel|energy source)\b/i },
  { field: 'powertrain', re: /\b(powertrain|drivetrain|tech|type|propulsion)\b/i },
  { field: 'brand', re: /\b(brand|make|manufacturer|oem|marque)\b/i },
]

const num = (s: string): number | null => {
  if (s == null) return null
  const m = String(s).replace(/[, ]/g, '').match(/-?\d+(?:\.\d+)?/)
  return m ? parseFloat(m[0]) : null
}

const splitCells = (line: string): string[] => {
  const parts = line.includes('\t') ? line.split('\t') : line.split(',')
  return parts.map((c) => c.trim().replace(/^"|"$/g, ''))
}

/** Infer a powertrain when the catalogue only gives CO₂/fuel. */
function inferPowertrain(fuel: string, co2: number, given: string): string {
  if (given) {
    const g = given.toLowerCase()
    if (/bev|battery|full electric|^ev$/.test(g)) return 'BEV'
    if (/phev|plug/.test(g)) return 'PHEV'
    if (/strong hybrid|hev|self.?charg/.test(g)) return 'Strong Hybrid'
    if (/mhev|mild/.test(g)) return 'MHEV'
    if (/ice|petrol|diesel|combustion|gasoline/.test(g)) return 'ICE'
    if (given.trim()) return given.trim()
  }
  if (co2 === 0 || /electric|bev/i.test(fuel)) return 'BEV'
  if (/phev|plug/i.test(fuel)) return 'PHEV'
  if (/hybrid/i.test(fuel)) return 'Strong Hybrid'
  return 'ICE'
}

export function parseCatalogue(text: string, opts: { defaultBrand?: string; year?: number } = {}): ParsedCatalogue {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (!lines.length) return { vehicles: [], columns: [], skipped: 0, note: 'Nothing to read.' }

  // Header detection: a first row with recognisable, mostly-non-numeric labels.
  const first = splitCells(lines[0])
  const firstNumeric = first.filter((c) => num(c) != null).length
  const hasHeader = firstNumeric <= first.length / 2 && HEADER_MAP.some(({ re }) => first.some((c) => re.test(c)))

  // Column → field assignment.
  const idx: Partial<Record<string, number>> = {}
  const columns: { field: string; header: string }[] = []
  if (hasHeader) {
    first.forEach((h, i) => {
      for (const { field, re } of HEADER_MAP) {
        if (idx[field] == null && re.test(h)) { idx[field] = i; columns.push({ field, header: h }); break }
      }
    })
  } else {
    // Positional fallback: model, co2, mass, units.
    ;['model', 'co2', 'mass', 'sales'].forEach((f, i) => { if (i < first.length) { idx[f] = i; columns.push({ field: f, header: `col ${i + 1}` }) } })
  }
  // If no model column was found, use the first text column.
  if (idx.model == null) { const t = first.findIndex((c) => num(c) == null); idx.model = t >= 0 ? t : 0 }

  const body = hasHeader ? lines.slice(1) : lines
  const vehicles: Vehicle[] = []
  let skipped = 0
  body.forEach((line) => {
    const cells = splitCells(line)
    const at = (f: string) => (idx[f] != null ? cells[idx[f]!] ?? '' : '')
    const model = (at('model') || '').trim()
    const fuelRaw = (at('fuel') || '').trim()
    const ptRaw = (at('powertrain') || '').trim()
    let co2 = num(at('co2'))
    const mass = num(at('mass'))
    const sales = num(at('sales'))
    const powertrain = inferPowertrain(fuelRaw, co2 ?? -1, ptRaw)
    if (powertrain === 'BEV') co2 = 0
    // A usable row needs a name and either a CO₂ or an electric flag.
    if (!model || (co2 == null && powertrain !== 'BEV')) { skipped++; return }
    const brand = (at('brand') || opts.defaultBrand || 'Catalogue').trim()
    const fuel = fuelRaw || (powertrain === 'BEV' ? 'Electric' : /diesel/i.test(model) ? 'Diesel' : 'Petrol')
    vehicles.push({
      parent: brand, pool: brand, brand, make: brand, model,
      year: opts.year ?? 2025,
      powertrain, fuel,
      co2: Math.max(0, co2 ?? 0),
      mass: mass && mass > 0 ? mass : 1400,
      sales: sales != null && sales >= 0 ? sales : 1,
      vclass: 'Passenger car',
      variant: model,
    })
  })

  const note = hasHeader
    ? `Mapped ${columns.length} column${columns.length === 1 ? '' : 's'} · ${vehicles.length} products${skipped ? ` · ${skipped} row${skipped === 1 ? '' : 's'} skipped` : ''}`
    : `No header row detected — read columns as model · CO₂ · mass · units · ${vehicles.length} products${skipped ? ` · ${skipped} skipped` : ''}`
  return { vehicles, columns, skipped, note }
}

/** A realistic mixed lineup for the "try it" cards — messy, believable figures. */
export const SAMPLE_CATALOGUE = `Model,Powertrain,Fuel,CO2 (g/km),Mass (kg),Units
Aster EV 61,BEV,Electric,0,1584,41200
Aster Hybrid,Strong Hybrid,Petrol,103,1492,67800
Aster 1.5T,ICE,Petrol,141,1468,88400
Vanta SUV 2.0,ICE,Petrol,167,1724,74900
Vanta d180,ICE,Diesel,158,1812,29600
Nimbus PHEV,PHEV,Petrol,37,1896,17300
Orbit MHEV,MHEV,Petrol,128,1553,52100
Cargo Van 1.9d,ICE,Diesel,184,1990,12400`

export const SAMPLE_NAME = 'Sample lineup · 8 products'
