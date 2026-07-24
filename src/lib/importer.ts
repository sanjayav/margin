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
  | 'parent' | 'brand' | 'model' | 'variant' | 'variantId' | 'year' | 'powertrain' | 'fuel'
  | 'co2' | 'mass' | 'sales' | 'vclass' | 'engineCC' | 'battery' | 'footprint'
  | 'segment' | 'bodyStyle' | 'gearbox' | 'driveline' | 'powerKW' | 'pool' | 'cnf' | 'zev'
  | 'ftCode' | 'fuelKmpl' | 'fuelMpg' | 'fuelL100' | 'energy' | 'range' | 'otrPrice' | 'tax'
  | 'refMass' | 'testMass' | 'driveCycle' | 'lengthMm' | 'widthMm' | 'heightMm' | 'scenario'

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
  // ── the India master-file structure (Sanjay's headings — full round-trip) ──
  { key: 'variantId', label: 'Variant code', kind: 'text', hint: 'stable spec id (ICE_G_82_MT_FWD_0)' },
  { key: 'ftCode', label: 'FT code', kind: 'text', hint: 'fuel-type code (G/D/C/E/H/L)' },
  { key: 'fuelKmpl', label: 'Fuel economy km/l', kind: 'float', hint: 'as homologated' },
  { key: 'fuelMpg', label: 'Fuel economy mpg', kind: 'float', hint: 'as homologated' },
  { key: 'fuelL100', label: 'Fuel cons. L/100km', kind: 'float', hint: 'petrol-equivalent' },
  { key: 'energy', label: 'Energy consumption', kind: 'float', hint: 'kWh/100km (EVs)' },
  { key: 'range', label: 'E-Range km', kind: 'float', hint: 'electric range' },
  { key: 'otrPrice', label: 'OTR price', kind: 'float', hint: 'on-the-road price' },
  { key: 'tax', label: 'Tax', kind: 'float', hint: 'rate/amount as recorded' },
  { key: 'refMass', label: 'Reference mass kg', kind: 'float', hint: 'homologation reference' },
  { key: 'testMass', label: 'Test mass kg', kind: 'float', hint: 'EU limit basis' },
  { key: 'driveCycle', label: 'Drive cycle', kind: 'text', hint: 'MIDC / WLTC / NEDC' },
  { key: 'lengthMm', label: 'Length mm', kind: 'float', hint: '' },
  { key: 'widthMm', label: 'Width mm', kind: 'float', hint: '' },
  { key: 'heightMm', label: 'Height mm', kind: 'float', hint: '' },
  { key: 'scenario', label: 'Scenario name', kind: 'text', hint: 'Base / what-if tag' },
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
syn('mass', 'mass', 'mass kg', 'kerb weight', 'kerb weight kg', 'curb weight', 'curb weight kg', 'unladen mass', 'kerb mass', 'weight kg', 'mass in running order', 'running order mass', 'miro', 'average mass')
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
// the India master-file headings (verbatim, incl. source spellings)
syn('parent', 'regultory name')
syn('variant', 'variant name')
syn('variantId', 'variant code')
syn('sales', 'vehicle volume')
syn('co2', 'fuel consumption', 'fuel consumption co2')
syn('ftCode', 'ft code')
syn('fuelKmpl', 'fuel economy kmpl', 'kmpl', 'km/l', 'fuel economy km l')
syn('fuelMpg', 'fuel economy mpg', 'mpg')
syn('fuelL100', 'fuel consumption l 100', 'fuel consumption l/100', 'l/100', 'l 100km', 'fuel consumption l 100km')
syn('energy', 'energy consumption')
syn('range', 'e-range', 'e range', 'electric range', 'range km')
syn('otrPrice', 'otr price', 'price', 'on the road price', 'showroom price')
syn('tax', 'tax', 'tax %')
syn('refMass', 'reference mass')
syn('testMass', 'test mass')
syn('driveCycle', 'drive cycle', 'cycle')
syn('vclass', 'vehicle calssification')
syn('lengthMm', 'length', 'length mm')
syn('widthMm', 'width', 'width mm')
syn('heightMm', 'height', 'height mm')
syn('scenario', 'scenario name')

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
// (kg) EU", "V : WLTP Electric Consumption (China)") — substring cues, tried
// when no exact synonym matched. Order = match priority.
const FUZZY: [FieldKey, RegExp][] = [
  ['co2', /co2/],
  ['mass', /kerbweight|curbweight|kerbmass|unladenmass|massinrunningorder|runningordermass|testmass|referencemass/],
  ['sales', /registrations|salesvolume|volume|unitssold/],
  ['year', /(model|calendar|fiscal|production|sales|registration)year/],
  ['powertrain', /powertrain|propulsion/],
  ['fuel', /fueltype/],
  ['engineCC', /displacement|enginecapacity/],
  ['battery', /batterycapacity|batterykwh/],
  ['range', /erange|electricrange/],
  ['energy', /electricconsumption|energyconsumption|kwh100/],
  ['powerKW', /enginepower|maxpower|ratedpower|powerkw/],
  ['fuelL100', /fuelcons.*l100|fuelconsumptionl100/],
  ['ftCode', /ftcode/],
  ['gearbox', /gearbox|transmission/],
  ['driveline', /driveline|drivenwheels|drivetrain/],
  ['variant', /version|trimlevel|derivative/],
  ['bodyStyle', /bodytype|bodystyle/],
  ['segment', /segment/],
]

// A "R :" / "M :" prefixed column is a REGULATORY or sales-weighted aggregate
// (an output), not a raw vehicle spec — never let it win a vehicle field.
const isAggregate = (h: string) => /^\s*[RM]\s*:/i.test(h)

export interface Mapping { field: FieldKey | null; header: string }
/** Map source headers to target fields. `preferCycle` breaks ties between
 *  duplicated cycle columns (NEDC vs WLTP vs MIDC) so the market's own basis
 *  wins — e.g. China/EU want WLTP/WLTC, India wants MIDC. */
export function autoMap(headers: string[], preferCycle: 'WLTP' | 'MIDC' = 'WLTP'): Mapping[] {
  const taken = new Set<FieldKey>()
  const out: Mapping[] = headers.map((h) => ({ field: null as FieldKey | null, header: h }))
  // pass 1: exact synonyms — skip aggregate columns so a raw V: spec wins the field
  out.forEach((m) => {
    if (isAggregate(m.header)) return
    const f = SYNONYMS[canon(m.header)]
    if (f && !taken.has(f)) { m.field = f; taken.add(f) }
  })
  // pass 2: score-based fuzzy — the BEST candidate per still-free field, not the
  // first. Cycle preference + aggregate penalty decide between duplicate columns.
  const cyc = preferCycle === 'MIDC' ? { pref: /midc/, avoid: /wltp|wltc|nedc/ } : { pref: /wltp|wltc/, avoid: /nedc|midc/ }
  for (const [field, re] of FUZZY) {
    if (taken.has(field)) continue
    let best: Mapping | null = null, bestScore = 0
    out.forEach((m, i) => {
      if (m.field) return
      const c = canon(m.header)
      if (!re.test(c)) return
      let score = 10
      if (cyc.pref.test(c)) score += 6
      if (cyc.avoid.test(c)) score -= 5
      if (isAggregate(m.header)) score -= 20
      score -= i * 0.001 // stable tiebreak: earlier column wins
      if (score > bestScore) { bestScore = score; best = m }
    })
    if (best) { (best as Mapping).field = field; taken.add(field) }
  }
  // repair pass: a file whose ONLY mass column is Test/Reference Mass (EU
  // extracts) must still satisfy the required 'mass' — that column donates.
  if (!taken.has('mass')) {
    const donor = out.find((m) => m.field === 'testMass') ?? out.find((m) => m.field === 'refMass')
    if (donor) { donor.field = 'mass'; taken.add('mass') }
  }
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
  fuelKmpl: { min: 0, max: 60, label: 'km/l' },
  fuelMpg: { min: 0, max: 150, label: 'mpg' },
  fuelL100: { min: 0, max: 30, label: 'L/100km' },
  range: { min: 0, max: 1500, label: 'E-Range' },
  refMass: { min: 300, max: 4500, label: 'reference mass' },
  testMass: { min: 300, max: 4500, label: 'test mass' },
  lengthMm: { min: 2000, max: 7000, label: 'length' },
  widthMm: { min: 1200, max: 2400, label: 'width' },
  heightMm: { min: 1100, max: 2500, label: 'height' },
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
    opt('variantId', get(row, 'variantId') || undefined)
    // the master file records Engine Capacity in LITRES (1.498) — coerce to cc
    const cc = num(row, 'engineCC')
    opt('engineCC', cc != null && cc > 0 && cc < 20 ? Math.round(cc * 1000) : cc)
    opt('battery', num(row, 'battery'))
    opt('footprint', num(row, 'footprint'))
    opt('segment', get(row, 'segment') || undefined)
    opt('bodyStyle', get(row, 'bodyStyle') || undefined)
    opt('gearbox', get(row, 'gearbox') || undefined)
    opt('driveline', get(row, 'driveline') || undefined)
    opt('powerKW', num(row, 'powerKW'))
    opt('cnf', num(row, 'cnf'))
    opt('zev', num(row, 'zev'))
    opt('ftCode', get(row, 'ftCode') || undefined)
    opt('fuelKmpl', num(row, 'fuelKmpl'))
    opt('fuelMpg', num(row, 'fuelMpg'))
    opt('fuelL100', num(row, 'fuelL100'))
    opt('energy', num(row, 'energy'))
    opt('range', num(row, 'range'))
    opt('otrPrice', num(row, 'otrPrice'))
    opt('tax', num(row, 'tax'))
    opt('refMass', num(row, 'refMass'))
    opt('testMass', num(row, 'testMass'))
    opt('driveCycle', get(row, 'driveCycle') || undefined)
    opt('lengthMm', num(row, 'lengthMm'))
    opt('widthMm', num(row, 'widthMm'))
    opt('heightMm', num(row, 'heightMm'))
    if (get(row, 'scenario')) v.scenario = get(row, 'scenario')
    out.push(v)
  }
  return out
}

/** The India master file mixes roll-up levels in one sheet (col "Data Mode":
 *  Variant / Model / Brand / Group / Regulatory). Importing it raw would mix
 *  zero-volume spec rows with sales rows and totals. This transform keeps ONE
 *  level: 'Model' keeps the sales rows and substitutes their roll-up figures
 *  (Avg CO2 → CO₂, Avg weighted Mass → kerb) into the mapped columns;
 *  'Variant' keeps the spec rows and zero-fills the empty volume. */
export function applyMasterDataMode(grid: string[][], hasHeader: boolean, mode: 'Model' | 'Variant'): string[][] {
  if (!grid.length) return grid
  const headers = hasHeader ? grid[0] : []
  const idx = (name: string) => headers.findIndex((h) => canon(h) === canon(name))
  const dm = idx('Data Mode')
  if (dm < 0) return grid
  const co2Col = idx('Fuel Consumption')          // the variant-level CO₂ column
  const massCol = idx('Kerb Weight')
  const avgCo2 = idx('Avg CO2')
  const avgMass = idx('Avg weighted Mass')
  const volCol = idx('Vehicle Volume')
  const body = (hasHeader ? grid.slice(1) : grid).filter((r) => (r[dm] ?? '').trim() === mode)
  const out = body.map((r) => {
    const row = r.slice()
    if (mode === 'Model') {
      if (co2Col >= 0 && avgCo2 >= 0 && row[avgCo2] !== '') row[co2Col] = row[avgCo2]
      if (massCol >= 0 && avgMass >= 0 && row[avgMass] !== '') row[massCol] = row[avgMass]
    } else if (volCol >= 0 && (row[volCol] ?? '') === '') {
      row[volCol] = '0' // specs only — no volume at variant level in the master
    }
    return row
  })
  return hasHeader ? [grid[0], ...out] : out
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
  if (country === 'IN') {
    // Sanjay's master-file structure, verbatim (duplicated headings carry their
    // unit so the auto-mapper lands each column deterministically).
    const headers = ['Year', 'Sales Market', 'Data Mode', 'Scenario Name', 'Regultory Name', 'Brand', 'Model', 'Variant Name', 'Variant Code', 'Body Style', 'Segment', 'Powertrain Type', 'Engine Capacity', 'Fuel Type', 'Engine Power', 'FT Code', 'Gear Box', 'Driveline', 'Battery Capacity', 'Kerb Weight', 'Vehicle Volume', 'Fuel Consumption CO2', 'Fuel economy kmpl', 'Fuel economy mpg', 'Fuel Consumption l/100', 'Foot Print', 'Energy consumption', 'E-Range', 'OTR Price', 'Reference Mass', 'Test Mass', 'Tax', 'Vehicle Calssification', 'Drive Cycle', 'Length', 'Width', 'Height']
    const rows = [
      ['2025', 'IN', 'Variant', 'Base', 'MG Motor', 'MG', 'Astor', '1.5 VTi-TECH MT', 'ICE_G_82_MT_FWD_0', 'SUV', 'C', 'ICE', '1.498', 'Gasoline', '82', 'G', 'MT', 'FWD', '0', '1245', '1611', '150.4', '15.43', '43.6', '6.48', '7.82', '', '', '', '1345', '', '', 'M1', 'MIDC', '4323', '1809', '1650'],
      ['2025', 'IN', 'Variant', 'Base', 'MG Motor', 'MG', 'Windsor EV', '38 kWh', 'BEV_E_100_EVT_FWD_38', 'MPV', 'C', 'BEV', '', 'Electricity', '100', 'E', 'EVT', 'FWD', '38', '1495', '42713', '0', '', '', '0', '7.95', '', '332', '', '1595', '', '', 'M1', 'MIDC', '4295', '1850', '1677'],
    ]
    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
  }
  const headers = ['Manufacturer', 'Brand', 'Model', 'Variant', 'Year', 'Powertrain', 'Fuel', 'CO2 g/km', 'Mass kg', 'Units', 'Class', 'Engine cc', 'Battery kWh']
  const rows = [
    ['Example Motor Corp', 'Example', 'Model A', '1.5 Auto', '2026', 'ICE', 'Petrol', '124', '1350', '42000', 'Passenger car', '1498', ''],
    ['Example Motor Corp', 'Example', 'Model E', 'Long Range', '2026', 'BEV', 'Electric', '0', '1750', '18000', 'Passenger car', '', '77'],
  ]
  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
}
