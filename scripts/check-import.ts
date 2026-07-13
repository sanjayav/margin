// Headless test of the import pipeline (scripts/check-import.ts):
// real JATO-style .xlsx (multi-sheet) and S&P-style .csv fixtures → parse →
// vendor detect → auto-map → validate → Vehicle[] → merge semantics.
//   esbuild scripts/check-import.ts --bundle --platform=node --format=esm --outfile=node_modules/.cache/ci.mjs && node node_modules/.cache/ci.mjs <fixtureDir>
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  parseFile, parseDelimited, autoMap, detectVendor, looksLikeHeader,
  validateGrid, toVehicles, mergeFleet, templateCsv, applyMasterDataMode, REQUIRED, type FieldKey,
} from '../src/lib/importer.js'
import type { Vehicle } from '../src/engine/types.js'

const dir = process.argv[2]
if (!dir) { console.error('usage: node ci.mjs <fixtureDir>'); process.exit(2) }

let pass = 0, fail = 0
const check = (n: string, c: boolean, d = '') => { console.log(`${c ? '✓' : '✗ FAIL'} ${n}${d ? ' — ' + d : ''}`); c ? pass++ : fail++ }

// helper: run map→grid→vehicles exactly like the wizard does
function run(grid: string[][], country: 'IN') {
  const hasHeader = looksLikeHeader(grid[0])
  const headers = hasHeader ? grid[0] : grid[0].map((_, i) => `Column ${i + 1}`)
  const mapping = autoMap(headers)
  const mapped = mapping.filter((m) => m.field).map((m) => m.field!) as FieldKey[]
  const ordered = mapping.map((m, i) => ({ f: m.field, i })).filter((x): x is { f: FieldKey; i: number } => !!x.f)
  const fields = ordered.map((o) => o.f)
  const rows = (hasHeader ? grid.slice(1) : grid).filter((r) => r.some((c) => c !== '')).map((r) => ordered.map((o) => r[o.i] ?? ''))
  const issues = validateGrid(rows, fields, country)
  const vehicles = toVehicles(rows, fields, country, { vclass: 'Passenger car' })
  return { hasHeader, mapping, mapped, fields, rows, issues, vehicles }
}

// ── 1 · JATO-style .xlsx (two sheets; data on "Volumes") ─────────────────────
{
  const buf = readFileSync(join(dir, 'jato_demo.xlsx'))
  const sheets = await parseFile('jato_demo.xlsx', buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer)
  check('xlsx: both sheets parsed', sheets.length === 2, sheets.map((s) => `${s.name}(${s.grid.length})`).join(', '))
  const vol = sheets.find((s) => s.name === 'Volumes')!
  check('xlsx: Volumes sheet has 6 rows (hdr+5)', vol.grid.length === 6)
  const vendor = detectVendor(vol.grid[0])
  check('xlsx: vendor detected = JATO Dynamics', vendor?.id === 'jato', vendor?.name ?? 'none')
  const r = run(vol.grid, 'IN')
  check('xlsx: header row recognised', r.hasHeader)
  check('xlsx: all required fields auto-mapped', REQUIRED.every((f) => r.mapped.includes(f)),
    'missing: ' + REQUIRED.filter((f) => !r.mapped.includes(f)).join(',') || 'none')
  check('xlsx: JATO "Manufacturer Group" → parent', r.mapped.includes('parent'))
  check('xlsx: JATO "Version" → variant', r.mapped.includes('variant'))
  check('xlsx: zero validation errors', [...r.issues.values()].filter((i) => i.severity === 'error').length === 0)
  const nexonEv = r.vehicles.find((v) => v.model === 'Nexon.ev')!
  check('xlsx: "Battery Electric" normalised → BEV', nexonEv.powertrain === 'BEV', nexonEv.powertrain)
  check('xlsx: BEV CO₂ = 0, mass numeric', nexonEv.co2 === 0 && nexonEv.mass === 1450)
  check('xlsx: parent from sales group', nexonEv.parent === 'Tata Motors Passenger Vehicles Limited')
  check('xlsx: units sum correct', r.vehicles.reduce((a, v) => a + v.sales, 0) === 48000 + 21500 + 63200 + 39800 + 14200)
}

// ── 2 · S&P-style .csv (quoted thousands separators) ─────────────────────────
{
  const text = readFileSync(join(dir, 'sp_demo.csv'), 'utf8')
  const grid = parseDelimited(text)
  const vendor = detectVendor(grid[0])
  check('csv: vendor detected = S&P Global Mobility', vendor?.id === 'sp', vendor?.name ?? 'none')
  const r = run(grid, 'IN')
  check('csv: all required fields auto-mapped', REQUIRED.every((f) => r.mapped.includes(f)))
  check('csv: zero validation errors', [...r.issues.values()].filter((i) => i.severity === 'error').length === 0)
  const creta = r.vehicles.find((v) => v.model === 'Creta')!
  check('csv: quoted "1,350" curb weight → 1350', creta.mass === 1350, String(creta.mass))
  check('csv: Gasoline normalised → Petrol', creta.fuel === 'Petrol', creta.fuel)
  const carens = r.vehicles.find((v) => v.model === 'Carens')!
  check('csv: "Mild Hybrid" → MHEV', carens.powertrain === 'MHEV', carens.powertrain)
  check('csv: "Sales Group" → parent', creta.parent === 'Hyundai Motor India Limited')

  // merge semantics: importing Hyundai/Kia 2026 must not disturb other makers
  const existing: Vehicle[] = [
    { parent: 'Hyundai Motor India Limited', pool: 'x', brand: 'Hyundai', make: 'Hyundai', model: 'OLD ROW', year: 2026, powertrain: 'ICE', fuel: 'Petrol', co2: 150, mass: 1200, sales: 999, vclass: 'Passenger car' },
    { parent: 'Maruti Suzuki India Limited', pool: 'x', brand: 'Maruti', make: 'Maruti', model: 'Alto', year: 2026, powertrain: 'ICE', fuel: 'Petrol', co2: 91, mass: 760, sales: 120000, vclass: 'Passenger car' },
    { parent: 'Hyundai Motor India Limited', pool: 'x', brand: 'Hyundai', make: 'Hyundai', model: 'Venue', year: 2027, powertrain: 'ICE', fuel: 'Petrol', co2: 130, mass: 1100, sales: 50000, vclass: 'Passenger car' },
  ]
  const merged = mergeFleet(existing, r.vehicles)
  check('merge: replaced Hyundai 2026 row dropped', !merged.some((v) => v.model === 'OLD ROW'))
  check('merge: other maker (Maruti 2026) kept', merged.some((v) => v.model === 'Alto'))
  check('merge: other year (Hyundai 2027) kept', merged.some((v) => v.model === 'Venue'))
  check('merge: imported rows present', merged.filter((v) => ['Creta', 'Creta Electric', 'Sonet', 'Carens'].includes(v.model)).length === 4)
}

// ── 3 · Excel clipboard paste (TSV) + validation catches bad cells ───────────
{
  const clip = 'Manufacturer\tModel\tYear\tPowertrain\tFuel\tCO2 g/km\tMass kg\tUnits\n' +
    'Honda Cars India\tCity\t2026\tHEV\tPetrol Hybrid\t89.5\t1280\t22000\n' +
    'Honda Cars India\tElevate\tbad-year\tICE\tPetrol\t128\t1310\t31000\n' +
    'Honda Cars India\tAmaze\t2026\tICE\tPetrol\t\t950\t28000\n'
  const grid = parseDelimited(clip)
  check('paste: tab delimiter sniffed, 4 rows', grid.length === 4 && grid[0].length === 8)
  const r = run(grid, 'IN')
  const errs = [...r.issues.entries()].filter(([, v]) => v.severity === 'error')
  check('paste: exactly 2 errors caught', errs.length === 2, errs.map(([k, v]) => `${k}:${v.msg}`).join(' | '))
  check('paste: bad year flagged', errs.some(([k]) => k === '1:year'))
  check('paste: missing CO₂ flagged', errs.some(([k]) => k === '2:co2'))
  check('paste: HEV → Strong Hybrid for India', r.vehicles[0].powertrain === 'Strong Hybrid', r.vehicles[0].powertrain)
}

// ── 3b · the India MASTER structure round-trips (Sanjay's headings, verbatim) ─
{
  const tpl = templateCsv('IN')
  const grid = parseDelimited(tpl)
  check('IN template: header row is the master structure', grid[0][0] === 'Year' && grid[0].includes('Regultory Name') && grid[0].includes('Vehicle Calssification') && grid[0].includes('FT Code'))
  const r = run(grid, 'IN')
  check('master headings: all required fields auto-map', REQUIRED.every((f) => r.mapped.includes(f)),
    'missing: ' + REQUIRED.filter((f) => !r.mapped.includes(f)).join(','))
  for (const f of ['variantId', 'ftCode', 'fuelKmpl', 'fuelMpg', 'fuelL100', 'range', 'otrPrice', 'refMass', 'testMass', 'tax', 'driveCycle', 'lengthMm', 'widthMm', 'heightMm', 'segment', 'bodyStyle', 'scenario'] as const)
    check(`master heading maps: ${f}`, r.mapped.includes(f))
  check("'Regultory Name' (source spelling) → parent", r.vehicles[0].parent === 'MG Motor')
  check("'Vehicle Calssification' (source spelling) → class", r.vehicles[0].vclass === 'M1')
  check('Engine Capacity in litres coerced to cc', r.vehicles[0].engineCC === 1498, String(r.vehicles[0].engineCC))
  check('structure fields land on the Vehicle', (r.vehicles[0] as any).ftCode === 'G' && (r.vehicles[0] as any).fuelKmpl === 15.43 && (r.vehicles[0] as any).lengthMm === 4323)
  check('BEV row carries E-Range + battery', (r.vehicles[1] as any).range === 332 && r.vehicles[1].battery === 38)
  check('zero validation errors on the master template', [...r.issues.values()].filter((i) => i.severity === 'error').length === 0)
}

// ── 3c · a test-mass-only file still auto-maps the required mass (fallback) ──
{
  const clip = 'Manufacturer\tModel\tYear\tPowertrain\tFuel\tCO2\tTest Mass\tUnits\nX AG\tM1\t2026\tICE\tPetrol\t120\t1500\t1000\n'
  const r = run(parseDelimited(clip), 'EU' as any)
  check('test-mass-only file: required mass auto-maps via fallback', r.mapped.includes('mass') && r.vehicles[0].mass === 1500)
}

// ── 3d · master Data-Mode transform: one roll-up level at a time ─────────────
{
  const g = parseDelimited([
    'Data Mode\tRegultory Name\tModel\tYear\tPowertrain Type\tFuel Type\tFuel Consumption\tKerb Weight\tVehicle Volume\tAvg CO2\tAvg weighted Mass',
    'Variant\tMG Motor\tAstor\t2025\tICE\tGasoline\t150.4\t1245\t\t\t',
    'Variant\tMG Motor\tAstor\t2025\tICE\tGasoline\t156.5\t1270\t\t\t',
    'Model\tMG Motor\tAstor\t2025\tICE\tGasoline\t\t\t1611\t153.45\t1257.5',
    'Brand\tMG Motor\t\t2025\t\t\t\t\t66624\t\t',
  ].join('\n'))
  const model = applyMasterDataMode(g, true, 'Model')
  check('master Model mode: keeps only Model rows (Brand/Variant dropped)', model.length === 2)
  check('master Model mode: Avg CO2 → CO₂ column, Avg mass → kerb', model[1][6] === '153.45' && model[1][7] === '1257.5')
  const variant = applyMasterDataMode(g, true, 'Variant')
  check('master Variant mode: keeps spec rows with volume zero-filled', variant.length === 3 && variant[1][8] === '0' && variant[2][8] === '0')
  const rM = run(model, 'IN')
  check('master Model rows import clean (roll-up figures land)', rM.vehicles.length === 1 && rM.vehicles[0].co2 === 153.45 && rM.vehicles[0].mass === 1257.5 && rM.vehicles[0].sales === 1611)
}

// ── 4 · real-world file: the Ram scenario workbook DATA sheet parses ─────────
{
  const p = join(dir, '..', 'SCENARIO PLANNING TOOL UPDATE Ram.xlsx')
  try {
    const buf = readFileSync(p)
    const sheets = await parseFile('ram.xlsx', buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer)
    const data = sheets.find((s) => s.name === 'DATA')
    check('ram.xlsx: 5 sheets parsed', sheets.length === 5, sheets.map((s) => s.name).join(','))
    check('ram.xlsx: DATA grid ≥ 649 rows', (data?.grid.length ?? 0) >= 649, String(data?.grid.length))
    check('ram.xlsx: shared strings resolved', data?.grid.some((r) => r.includes('Maruti Suzuki')) === true)
  } catch (e: any) {
    check('ram.xlsx: readable', false, String(e?.message ?? e))
  }
}

console.log(`\n${pass} passed · ${fail} failed`)
if (fail) process.exit(1)
