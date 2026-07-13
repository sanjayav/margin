// ───────────────────────────────────────────────────────────────────────────
// Import pipeline — OEM actuals & purchased vendor data (S&P Global Mobility,
// JATO Dynamics) → the engine's Vehicle shape.
//
//   parse    XLSX (native DecompressionStream, no dependency) · CSV/TSV files ·
//            clipboard paste straight from Excel
//   map      header auto-mapping with vendor vocabularies; every guess is
//            user-overridable in the wizard
//   validate typed per-cell checks (error = blocks import, warn = advisory)
//   emit     Vehicle[] with market defaults filled in
//
// Pure logic only — no React. Node-compatible (regex XML, no DOMParser) so the
// whole pipeline is testable headlessly: see scripts/check-import.ts.
// ───────────────────────────────────────────────────────────────────────────
import type { CountryId, Vehicle } from '../engine/types.js'

// ── target schema ────────────────────────────────────────────────────────────
export type FieldKey =
  | 'parent' | 'brand' | 'model' | 'variant' | 'year' | 'powertrain' | 'fuel'
  | 'co2' | 'mass' | 'sales' | 'vclass' | 'engineCC' | 'battery' | 'footprint'
  | 'segment' | 'bodyStyle' | 'gearbox' | 'driveline' | 'powerKW' | 'pool' | 'cnf' | 'zev'

export interface FieldDef {
  key: FieldKey
  label: string
  kind: 'text' | 'int' | 'float'
  required?: boolean
  hint: string
}

export const FIELDS: FieldDef[] = [
  { key: 'parent', label: 'Manufacturer', kind: 'text', required: true, hint: 'compliance parent / sales group' },
  { key: 'brand', label: 'Brand', kind: 'text', hint: 'marque (defaults to manufacturer)' },
  { key: 'model', label: 'Model', kind: 'text', required: true, hint: 'nameplate' },
  { key: 'variant', label: 'Variant', kind: 'text', hint: 'version / trim / derivative' },
  { key: 'year', label: 'Year', kind: 'int', required: true, hint: 'calendar / fiscal year' },
  { key: 'powertrain', label: 'Powertrain', kind: 'text', required: true, hint: 'BEV · PHEV · HEV · MHEV · ICE' },
  { key: 'fuel', label: 'Fuel', kind: 'text', required: true, hint: 'Petrol · Diesel · Electric · CNG …' },
  { key: 'co2', label: 'CO₂ g/km', kind: 'float', required: true, hint: 'tailpipe, official cycle' },
  { key: 'mass', label: 'Mass kg', kind: 'float', required: true, hint: 'kerb / test mass per market' },
  { key: 'sales', label: 'Units', kind: 'int', required: true, hint: 'registrations / sales volume' },
  { key: 'vclass', label: 'Class', kind: 'text', hint: 'regulatory class (defaults per market)' },
  { key: 'engineCC', label: 'Engine cc', kind: 'float', hint: 'displacement' },
  { key: 'battery', label: 'Battery kWh', kind: 'float', hint: 'usable capacity' },
  { key: 'footprint', label: 'Footprint m²', kind: 'float', hint: 'track × wheelbase' },
  { key: 'segment', label: 'Segment', kind: 'text', hint: 'A–F / vendor segment' },
  { key: 'bodyStyle', label: 'Body style', kind: 'text', hint: 'SUV · Hatchback · Sedan …' },
  { key: 'gearbox', label: 'Gearbox', kind: 'text', hint: 'MT · AT · CVT · DCT …' },
  { key: 'driveline', label: 'Driveline', kind: 'text', hint: 'FWD · RWD · AWD' },
  { key: 'powerKW', label: 'Power kW', kind: 'float', hint: 'rated engine/motor power' },
  { key: 'pool', label: 'Pool', kind: 'text', hint: 'compliance pool (defaults to manufacturer)' },
  { key: 'cnf', label: 'CNF %', kind: 'float', hint: 'carbon-neutral-fuel discount (India)' },
  { key: 'zev', label: 'ZEV flag', kind: 'int', hint: '1 = zero-emission (UK)' },
]
export const REQUIRED: FieldKey[] = FIELDS.filter((f) => f.required).map((f) => f.key)
const FIELD_BY_KEY = new Map(FIELDS.map((f) => [f.key, f]))

// ── header vocabulary — canonical + S&P Global Mobility + JATO Dynamics ──────
const canon = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '')

const SYNONYMS: Record<string, FieldKey> = {}
const syn = (field: FieldKey, ...names: string[]) => { for (const n of names) SYNONYMS[canon(n)] = field }
syn('parent', 'manufacturer', 'mfr', 'oem', 'oemgroup', 'group', 'sales group', 'manufacturer group', 'compliance parent', 'parent', 'maker', 'regulatory name', 'compliance group', 'parent company', 'global sales group')
syn('brand', 'brand', 'make', 'marque')
syn('model', 'model', 'nameplate', 'model name', 'carline', 'model family')
syn('variant', 'variant', 'version', 'trim', 'trim level', 'derivative', 'spec', 'variant name', 'version name', 'model version')
syn('year', 'year', 'my', 'model year', 'calendar year', 'fiscal year', 'sales year', 'cy', 'fy', 'production year', 'reg year', 'registration year')
syn('powertrain', 'powertrain', 'powertrain type', 'propulsion', 'propulsion system', 'propulsion design', 'fuel type group', 'technology', 'electrification', 'engine type', 'xev type')
syn('fuel', 'fuel', 'fuel type', 'energy source', 'primary fuel')
syn('co2', 'co2', 'co2 g/km', 'co2 gkm', 'co2 emissions', 'co2 combined', 'co2 wltp', 'co2 nedc', 'co2 midc', 'emissions value', 'co2 gpkm', 'wltp co2', 'specific co2', 'fuel consumption co2', 'co₂', 'co₂ g/km')
syn('mass', 'mass', 'mass kg', 'kerb weight', 'kerb weight kg', 'curb weight', 'curb weight kg', 'unladen mass', 'kerb mass', 'weight kg', 'mass in running order', 'running order mass', 'miro', 'test mass', 'reference mass', 'average mass')
syn('sales', 'sales', 'units', 'volume', 'registrations', 'sales volume', 'vehicle volume', 'regs', 'units sold', 'sales units', 'new registrations', 'volumes', 'qty', 'quantity')
syn('vclass', 'class', 'vehicle class', 'vehicle classification', 'category', 'reg class', 'regulatory class', 'vehicle category')
syn('engineCC', 'engine cc', 'cc', 'displacement', 'engine capacity', 'engine size', 'capacity cc', 'engine displacement', 'litres', 'engine capacity l')
syn('battery', 'battery', 'battery kwh', 'battery capacity', 'battery capacity kwh', 'battery size')
syn('footprint', 'footprint', 'footprint m2', 'foot print')
syn('segment', 'segment', 'jato segment', 'market segment', 'sales segment', 'vehicle segment')
syn('bodyStyle', 'body style', 'body type', 'body', 'bodystyle', 'body group')
syn('gearbox', 'gearbox', 'transmission', 'transmission type', 'gearbox type', 'gear box')
syn('driveline', 'driveline', 'driven wheels', 'drivetrain', 'drive', 'wheel drive', 'drive type')
syn('powerKW', 'power kw', 'engine power', 'power', 'kw', 'max power', 'engine power kw', 'rated power')
syn('pool', 'pool', 'pool name', 'compliance pool')
syn('cnf', 'cnf', 'cnf %', 'cnf discount', 'carbon neutral fuel')
syn('zev', 'zev', 'zev flag', 'ze flag')

// ── vendor presets (detection only — mapping always goes through SYNONYMS) ───
export interface Vendor { id: 'oem' | 'sp' | 'jato'; name: string; blurb: string; tokens: string[] }
export const VENDORS: Vendor[] = [
  { id: 'oem', name: 'OEM actuals', blurb: 'your own homologation & sales extract (template below)', tokens: ['manufacturer', 'powertrain', 'co2gkm', 'masskg', 'units'] },
  { id: 'sp', name: 'S&P Global Mobility', blurb: 'Polk/IHS new-registration extracts', tokens: ['salesgroup', 'nameplate', 'registrations', 'curbweight', 'propulsionsystem', 'productionyear', 'manufacturergroup'] },
  { id: 'jato', name: 'JATO Dynamics', blurb: 'Carspecs / Volumes exports', tokens: ['version', 'derivative', 'kerbweight', 'bodytype', 'drivenwheels', 'jatosegment', 'trimlevel'] },
]

export function detectVendor(headers: string[]): Vendor | null {
  const set = new Set(headers.map(canon))
  let best: Vendor | null = null
  let bestScore = 1 // require ≥2 token hits to claim a vendor
  for (const v of VENDORS) {
    const score = v.tokens.filter((t) => set.has(t)).length
    if (score > bestScore) { best = v; bestScore = score }
  }
  return best
}

// Fuzzy fallback for compound vendor headers ("CO2 g/km (WLTP)", "Kerb Weight
// (kg) EU", "Sales Volume FY26") — substring cues, tried only when no exact
// synonym matched and the field is still free. Order = match priority.
const FUZZY: [FieldKey, RegExp][] = [
  ['co2', /co2/],
  ['mass', /kerbweight|curbweight|kerbmass|unladenmass|massinrunningorder/],
  ['sales', /registrations|salesvolume|volume|unitssold/],
  ['year', /(model|calendar|fiscal|production|sales|registration)year/],
  ['powertrain', /powertrain|propulsion/],
  ['fuel', /fueltype/],
  ['engineCC', /displacement|enginecapacity/],
  ['battery', /batterycapacity|batterykwh/],
  ['variant', /version|trimlevel|derivative/],
  ['bodyStyle', /bodytype|bodystyle/],
  ['segment', /segment/],
  ['gearbox', /transmission/],
  ['driveline', /drivenwheels|drivetrain/],
]

export interface Mapping { field: FieldKey | null; header: string }
export function autoMap(headers: string[]): Mapping[] {
  const taken = new Set<FieldKey>()
  const out: Mapping[] = headers.map((h) => {
    const f = SYNONYMS[canon(h)] ?? null
    if (f && !taken.has(f)) { taken.add(f); return { field: f, header: h } }
    return { field: null, header: h }
  })
  // second pass: fuzzy-match still-unmapped headers to still-free fields
  out.forEach((m) => {
    if (m.field) return
    const c = canon(m.header)
    for (const [field, re] of FUZZY) {
      if (!taken.has(field) && re.test(c)) { m.field = field; taken.add(field); break }
    }
  })
  return out
}

/** Does row 0 look like a header row (≥2 known column names)? */
export function looksLikeHeader(row: string[]): boolean {
  return row.filter((c) => SYNONYMS[canon(c)] != null).length >= 2
}

// ── value normalisation ──────────────────────────────────────────────────────
const PT_CANON: Record<string, string> = {}
const pt = (out: string, ...names: string[]) => { for (const n of names) PT_CANON[canon(n)] = out }
pt('BEV', 'bev', 'battery electric', 'electric', 'ev', 'full electric', 'pure electric', 'battery electric vehicle')
pt('PHEV', 'phev', 'plug-in hybrid', 'plugin hybrid', 'plug in hybrid', 'plug-in')
pt('HEV', 'hev', 'full hybrid', 'hybrid', 'strong hybrid', 'self charging hybrid')
pt('MHEV', 'mhev', 'mild hybrid', '48v', 'mild hybrid electric', 'micro hybrid', 'bsg')
pt('ICE', 'ice', 'combustion', 'petrol', 'gasoline', 'diesel', 'internal combustion', 'ice ss', 'ice cng', 'conventional')
pt('Range-Extender Hybrid', 'reev', 'range extender', 'range-extender', 'erev')
pt('FCEV', 'fcev', 'fuel cell', 'hydrogen fuel cell')

const FUEL_CANON: Record<string, string> = {}
const fu = (out: string, ...names: string[]) => { for (const n of names) FUEL_CANON[canon(n)] = out }
fu('Petrol', 'petrol', 'gasoline', 'gas', 'unleaded', 'petrol e20-e30', 'e20')
fu('Diesel', 'diesel', 'derv')
fu('Electric', 'electric', 'electricity', 'bev', 'battery')
fu('CNG', 'cng', 'natural gas', 'compressed natural gas')
fu('LPG', 'lpg', 'autogas')
fu('Hydrogen', 'hydrogen', 'h2')
fu('Petrol Hybrid', 'petrol hybrid', 'hybrid petrol', 'petrol electric')

/** Strong-hybrid label differs per market vocabulary (India uses 'Strong Hybrid'). */
export function normalizePowertrain(raw: string, country: CountryId): string {
  const c = PT_CANON[canon(raw)]
  if (!c) return raw.trim()
  if (c === 'HEV' && country === 'IN') return 'Strong Hybrid'
  return c
}
export function normalizeFuel(raw: string): string {
  return FUEL_CANON[canon(raw)] ?? raw.trim()
}

// ── CSV / clipboard parsing ──────────────────────────────────────────────────
/** RFC-4180-ish state machine; sniffs the delimiter (tab beats ; beats ,). */
export function parseDelimited(text: string, delimiter?: string): string[][] {
  const head = text.slice(0, 4000)
  const d = delimiter ?? (head.includes('\t') ? '\t' : (head.split(';').length > head.split(',').length ? ';' : ','))
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQ = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++ } else inQ = false
      } else cell += ch
    } else if (ch === '"') inQ = true
    else if (ch === d) { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell); cell = ''
      rows.push(row); row = []
    } else cell += ch
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  // drop fully-empty trailing rows, trim cells
  const out = rows.map((r) => r.map((c) => c.trim()))
  while (out.length && out[out.length - 1].every((c) => c === '')) out.pop()
  const width = Math.max(...out.map((r) => r.length), 0)
  return out.map((r) => (r.length === width ? r : [...r, ...Array(width - r.length).fill('')]))
}

// ── XLSX parsing — native zip + regex XML, zero dependencies ─────────────────
export interface SheetData { name: string; grid: string[][] }

const U16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8)
const U32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** Minimal ZIP reader: central directory → { path → bytes }. */
async function unzip(buf: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const b = new Uint8Array(buf)
  // End-of-central-directory: scan back for PK\x05\x06 (max comment 64 KB)
  let eocd = -1
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65536); i--) {
    if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 0x05 && b[i + 3] === 0x06) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('Not a valid .xlsx (zip directory not found)')
  const count = U16(b, eocd + 10)
  let off = U32(b, eocd + 16)
  const files = new Map<string, Uint8Array>()
  const dec = new TextDecoder()
  for (let n = 0; n < count; n++) {
    if (U32(b, off) !== 0x02014b50) break
    const method = U16(b, off + 10)
    const compSize = U32(b, off + 20)
    const nameLen = U16(b, off + 28)
    const extraLen = U16(b, off + 30)
    const commentLen = U16(b, off + 32)
    const localOff = U32(b, off + 42)
    const name = dec.decode(b.subarray(off + 46, off + 46 + nameLen))
    // local header: 30 fixed bytes + its own name/extra lengths
    const lNameLen = U16(b, localOff + 26)
    const lExtraLen = U16(b, localOff + 28)
    const dataStart = localOff + 30 + lNameLen + lExtraLen
    const raw = b.subarray(dataStart, dataStart + compSize)
    files.set(name, method === 8 ? await inflateRaw(raw) : raw.slice())
    off += 46 + nameLen + extraLen + commentLen
  }
  return files
}

const XML_ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const unent = (s: string) => s.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (_, e: string) =>
  e[0] === '#' ? String.fromCodePoint(parseInt(e.slice(e[1] === 'x' ? 2 : 1), e[1] === 'x' ? 16 : 10)) : (XML_ENT[e] ?? `&${e};`))

const colIndex = (ref: string) => {
  let n = 0
  for (const ch of ref) {
    if (ch >= 'A' && ch <= 'Z') n = n * 26 + ch.charCodeAt(0) - 64
    else break
  }
  return n - 1
}

/** Parse every worksheet of an .xlsx into string grids (formulas → cached values). */
export async function parseXlsx(buf: ArrayBuffer): Promise<SheetData[]> {
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot unpack .xlsx — export as CSV or paste from Excel instead')
  const files = await unzip(buf)
  const dec = new TextDecoder()
  const text = (p: string) => { const f = files.get(p); return f ? dec.decode(f) : '' }

  // shared strings (may contain plain <t> or rich-text runs)
  const shared: string[] = []
  const ss = text('xl/sharedStrings.xml')
  if (ss) for (const m of ss.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)) {
    let s = ''
    for (const t of m[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) s += unent(t[1])
    shared.push(s)
  }

  // sheet name → target path (workbook order via rels; fall back to sheetN.xml)
  const wb = text('xl/workbook.xml')
  const rels = text('xl/_rels/workbook.xml.rels')
  const relMap = new Map<string, string>()
  for (const m of rels.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) relMap.set(m[1], m[2].replace(/^\/?(xl\/)?/, 'xl/'))
  const sheets: { name: string; path: string }[] = []
  let sheetN = 1
  for (const m of wb.matchAll(/<sheet\s[^>]*?name="([^"]*)"[^>]*?(?:r:id="([^"]+)")?[^>]*\/>/g)) {
    const path = (m[2] && relMap.get(m[2])) || `xl/worksheets/sheet${sheetN}.xml`
    sheets.push({ name: unent(m[1]), path })
    sheetN++
  }
  if (!sheets.length) sheets.push({ name: 'Sheet1', path: 'xl/worksheets/sheet1.xml' })

  const out: SheetData[] = []
  for (const sh of sheets) {
    const xml = text(sh.path)
    if (!xml) continue
    const cells: { r: number; c: number; v: string }[] = []
    let maxC = 0, maxR = -1
    for (const rm of xml.matchAll(/<row\s[^>]*?r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
      const rIdx = parseInt(rm[1]) - 1
      for (const cm of rm[2].matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = cm[1]
        const body = cm[2] ?? ''
        const ref = /r="([A-Z]+)\d+"/.exec(attrs)?.[1]
        if (!ref) continue
        const cIdx = colIndex(ref)
        const type = /t="([^"]+)"/.exec(attrs)?.[1]
        let v = ''
        if (type === 'inlineStr') {
          for (const t of body.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) v += unent(t[1])
        } else {
          const raw = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(body)?.[1]
          if (raw == null) continue
          if (type === 's') v = shared[parseInt(raw)] ?? ''
          else if (type === 'b') v = raw === '1' ? 'TRUE' : 'FALSE'
          else v = unent(raw)
        }
        if (v === '') continue
        cells.push({ r: rIdx, c: cIdx, v })
        if (cIdx > maxC) maxC = cIdx
        if (rIdx > maxR) maxR = rIdx
      }
    }
    if (maxR < 0) { out.push({ name: sh.name, grid: [] }); continue }
    const grid: string[][] = Array.from({ length: maxR + 1 }, () => Array(maxC + 1).fill(''))
    for (const { r, c, v } of cells) grid[r][c] = v.trim()
    // drop fully-empty leading rows so headers surface at row 0
    while (grid.length && grid[0].every((x) => x === '')) grid.shift()
    out.push({ name: sh.name, grid })
  }
  return out
}

/** One entry point for any dropped/picked file. */
export async function parseFile(name: string, buf: ArrayBuffer): Promise<SheetData[]> {
  if (/\.xlsx?$/i.test(name)) return parseXlsx(buf)
  const text = new TextDecoder().decode(buf)
  return [{ name: name.replace(/\.[^.]+$/, ''), grid: parseDelimited(text) }]
}

// ── validation ───────────────────────────────────────────────────────────────
export interface CellIssue { msg: string; severity: 'error' | 'warn' }
/** key = `${rowIdx}:${fieldKey}` */
export type IssueMap = Map<string, CellIssue>

const NUM_RULES: Partial<Record<FieldKey, { min: number; max: number; label: string }>> = {
  year: { min: 2000, max: 2045, label: 'year' },
  co2: { min: 0, max: 600, label: 'CO₂' },
  mass: { min: 350, max: 4000, label: 'mass' },
  sales: { min: 0, max: 5_000_000, label: 'units' },
  engineCC: { min: 0, max: 9000, label: 'engine cc' },
  battery: { min: 0, max: 300, label: 'battery kWh' },
  footprint: { min: 0, max: 20, label: 'footprint' },
  powerKW: { min: 0, max: 1500, label: 'power' },
  cnf: { min: 0, max: 1, label: 'CNF' },
  zev: { min: 0, max: 1, label: 'ZEV flag' },
}

export const parseNum = (s: string): number | null => {
  const t = s.replace(/[,\s ]/g, '').replace(/^\((.*)\)$/, '-$1')
  if (t === '' || t === '-') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export function validateGrid(rows: string[][], fields: FieldKey[], country: CountryId): IssueMap {
  const issues: IssueMap = new Map()
  const fi = new Map(fields.map((f, i) => [f, i]))
  rows.forEach((row, r) => {
    if (row.every((c) => c === '')) return // blank rows are skipped at emit, not errors
    for (const [f, i] of fi) {
      const def = FIELD_BY_KEY.get(f)!
      const v = (row[i] ?? '').trim()
      const key = `${r}:${f}`
      if (v === '') {
        if (def.required) issues.set(key, { msg: `${def.label} is required`, severity: 'error' })
        continue
      }
      if (def.kind !== 'text') {
        const n = parseNum(v)
        if (n == null) { issues.set(key, { msg: `"${v}" is not a number`, severity: 'error' }); continue }
        if (def.kind === 'int' && !Number.isInteger(n)) { issues.set(key, { msg: `${def.label} must be a whole number`, severity: 'error' }); continue }
        const rule = NUM_RULES[f]
        if (rule && (n < rule.min || n > rule.max)) issues.set(key, { msg: `${rule.label} ${n} outside ${rule.min}–${rule.max}`, severity: 'error' })
      }
    }
    // cross-field: a zero-emission powertrain should have 0 tailpipe CO₂
    const ptI = fi.get('powertrain'); const co2I = fi.get('co2')
    if (ptI != null && co2I != null) {
      const norm = normalizePowertrain(row[ptI] ?? '', country)
      const n = parseNum(row[co2I] ?? '')
      if ((norm === 'BEV' || norm === 'FCEV') && n != null && n > 0)
        issues.set(`${r}:co2`, { msg: `${norm} with ${n} g/km — zero-emission rows should be 0`, severity: 'warn' })
      if (norm && !['BEV', 'FCEV', 'PHEV', 'HEV', 'Strong Hybrid', 'MHEV', 'ICE', 'Range-Extender Hybrid'].includes(norm) && !issues.has(`${r}:powertrain`))
        issues.set(`${r}:powertrain`, { msg: `"${row[ptI]}" is not a recognised powertrain — it will import as-is`, severity: 'warn' })
    }
  })
  return issues
}

// ── emit ─────────────────────────────────────────────────────────────────────
export function toVehicles(rows: string[][], fields: FieldKey[], country: CountryId, defaults: { vclass: string }): Vehicle[] {
  const fi = new Map(fields.map((f, i) => [f, i]))
  const get = (row: string[], f: FieldKey) => { const i = fi.get(f); return i == null ? '' : (row[i] ?? '').trim() }
  const num = (row: string[], f: FieldKey) => { const v = get(row, f); return v === '' ? undefined : (parseNum(v) ?? undefined) }
  const out: Vehicle[] = []
  for (const row of rows) {
    if (row.every((c) => c === '')) continue
    const parent = get(row, 'parent')
    const brand = get(row, 'brand') || parent
    const v: Vehicle = {
      parent,
      pool: get(row, 'pool') || parent,
      brand,
      make: brand,
      model: get(row, 'model'),
      year: num(row, 'year') ?? 0,
      powertrain: normalizePowertrain(get(row, 'powertrain'), country),
      fuel: normalizeFuel(get(row, 'fuel')),
      co2: num(row, 'co2') ?? 0,
      mass: num(row, 'mass') ?? 0,
      sales: Math.round(num(row, 'sales') ?? 0),
      vclass: get(row, 'vclass') || defaults.vclass,
      scenario: 'Base',
      market: country,
    }
    const opt = (k: keyof Vehicle, val: string | number | undefined) => { if (val !== undefined && val !== '') (v as any)[k] = val }
    opt('variant', get(row, 'variant') || undefined)
    opt('engineCC', num(row, 'engineCC'))
    opt('battery', num(row, 'battery'))
    opt('footprint', num(row, 'footprint'))
    opt('segment', get(row, 'segment') || undefined)
    opt('bodyStyle', get(row, 'bodyStyle') || undefined)
    opt('gearbox', get(row, 'gearbox') || undefined)
    opt('driveline', get(row, 'driveline') || undefined)
    opt('powerKW', num(row, 'powerKW'))
    opt('cnf', num(row, 'cnf'))
    opt('zev', num(row, 'zev'))
    out.push(v)
  }
  return out
}

/** Merge imported rows into the current dataset: any (manufacturer, year) that
 *  appears in the import replaces that maker-year wholesale; everything else is
 *  kept. This is the natural OEM flow — "here are my actuals for 2026". */
export function mergeFleet(existing: Vehicle[], imported: Vehicle[]): Vehicle[] {
  const replaced = new Set(imported.map((v) => `${v.parent} ${v.year}`))
  return [...existing.filter((v) => !replaced.has(`${v.parent} ${v.year}`)), ...imported]
}

// ── template (the OEM-actuals starting point) ────────────────────────────────
export function templateCsv(country: CountryId): string {
  const headers = ['Manufacturer', 'Brand', 'Model', 'Variant', 'Year', 'Powertrain', 'Fuel', 'CO2 g/km', 'Mass kg', 'Units', 'Class', 'Engine cc', 'Battery kWh']
  const rows = country === 'IN'
    ? [
      ['Maruti Suzuki India Limited', 'Maruti Suzuki', 'Baleno', '1.2 Petrol MT', '2026', 'ICE', 'Petrol', '96.4', '920', '145000', 'Passenger car', '1197', ''],
      ['Tata Motors Passenger Vehicles Limited', 'Tata', 'Nexon.ev', '45 kWh', '2026', 'BEV', 'Electric', '0', '1450', '52000', 'Passenger car', '', '45'],
    ]
    : [
      ['Example Motor Corp', 'Example', 'Model A', '1.5 Auto', '2026', 'ICE', 'Petrol', '124', '1350', '42000', 'Passenger car', '1498', ''],
      ['Example Motor Corp', 'Example', 'Model E', 'Long Range', '2026', 'BEV', 'Electric', '0', '1750', '18000', 'Passenger car', '', '77'],
    ]
  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
}
