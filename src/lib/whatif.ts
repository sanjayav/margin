// ───────────────────────────────────────────────────────────────────────────
// WHAT-IF · natural-language → scenario levers.
//
// Turns a plain instruction ("increase EV share by 2%", "add 50 kg", "flex-fuel
// pathway", "on WLTP") into a Partial<Scenario> the engine applies — so the Data
// module can forecast a what-if fleet from a sentence. Deterministic and offline
// (no LLM needed for the common levers); complex prose can fall through to the
// AI forecast studio.
// ───────────────────────────────────────────────────────────────────────────
import type { Scenario, CountryId } from '../engine/types'

export interface WhatIf { scenario: Partial<Scenario>; applied: string[] }

const firstNum = (s: string): number | null => { const m = s.match(/(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : null }

/** Parse an instruction into scenario levers. `currentZePct` anchors relative
 *  EV-share changes ("by 2%"). Unmatched instructions return no levers. */
export function parseWhatIf(prompt: string, country: CountryId, currentZePct: number): WhatIf {
  const p = ` ${prompt.toLowerCase().trim()} `
  const sc: Partial<Scenario> = {}
  const applied: string[] = []
  const n = firstNum(p)
  const isReduce = /\b(reduce|cut|lower|remove|drop|fall|less|down|lighter|-)\b/.test(p)

  // ── EV / electric / zero-emission share ────────────────────────────────────
  if (/\b(ev|electric|zero.?emission|ze|bev)\b/.test(p) && n != null) {
    const setTo = /\bto\s+\d/.test(p) // "to 30%" = absolute; else relative
    const target = setTo ? n : Math.max(0, currentZePct + (isReduce ? -n : n))
    sc.evSharePct = Math.max(0, Math.min(95, Math.round(target)))
    applied.push(setTo ? `Set zero-emission share to ${sc.evSharePct}%` : `${isReduce ? 'Cut' : 'Raised'} zero-emission share by ${n}pp → ${sc.evSharePct}%`)
  }

  // ── average kerb mass ───────────────────────────────────────────────────────
  if (/\b(mass|weight|kerb|heav|light)\b/.test(p) && /kg|kilo/.test(p) && n != null) {
    const kg = isReduce ? -n : n
    sc.massShiftKg = kg
    applied.push(`${kg >= 0 ? 'Added' : 'Removed'} ${Math.abs(kg)} kg average kerb mass`)
  }

  // ── sales / volume ─────────────────────────────────────────────────────────
  if (/\b(sales|volume|units|demand|market growth)\b/.test(p) && /%|percent/.test(p) && n != null) {
    sc.salesMultiplier = 1 + (isReduce ? -n : n) / 100
    applied.push(`${isReduce ? 'Cut' : 'Grew'} volume ${n}%`)
  }

  // ── regulatory target stringency ────────────────────────────────────────────
  if (/\b(target|limit|line|norm|stringen|tighten|loosen|relax)\b/.test(p) && /%|percent/.test(p) && n != null) {
    const looser = /\b(loosen|relax|weaker|ease|looser)\b/.test(p)
    sc.targetShiftPct = looser ? n : -n
    applied.push(`Stressed the target ${looser ? 'looser' : 'tighter'} by ${n}%`)
  }

  // ── India CAFE III levers ───────────────────────────────────────────────────
  if (country === 'IN') {
    if (/\bwltp\b/.test(p) || /cycle change/.test(p)) { sc.cycleWltp = true; applied.push('Applied the MIDC→WLTP conversion') }
    if (/\bflex|e85\b/.test(p)) { sc.cnfBoostPct = 14; applied.push('Fuel pathway → flex-fuel (E85)') }
    else if (/\be27\b/.test(p)) { sc.cnfBoostPct = 3; applied.push('Fuel pathway → E27') }
    else if (/\bcng\b/.test(p)) { sc.cnfBoostPct = 8; applied.push('Fuel pathway → CNG-forward') }
  }

  // ── China NEV ratio ─────────────────────────────────────────────────────────
  if (country === 'CN' && /\bnev\b/.test(p) && /ratio|mandate/.test(p) && n != null) {
    sc.nevRatioTarget = Math.round(n)
    applied.push(`NEV credit ratio → ${Math.round(n)}%`)
  }

  return { scenario: sc, applied }
}

// ── natural-language FILTER (JATO/S&P-style "ask the data") ──────────────────
export interface QueryFilters {
  makers: string[]; powertrains: string[]; fuels: string[]; segments: string[]; bodies: string[]
  co2?: [number | null, number | null]; mass?: [number | null, number | null]
  applied: string[]
  matched: boolean
}
/** Turn "Maruti SUVs over 150 g/km" into concrete facet + range selections,
 *  matched against the dataset's own option lists so only real values apply. */
export function parseDataQuery(prompt: string, opts: { makers: string[]; powertrains: string[]; fuels: string[]; segments: string[]; bodies: string[] }): QueryFilters {
  const p = ` ${prompt.toLowerCase()} `
  const f: QueryFilters = { makers: [], powertrains: [], fuels: [], segments: [], bodies: [], applied: [], matched: false }
  const has = (re: RegExp) => re.test(p)

  // makers — strip corporate words, match on a distinctive token
  const STOP = /(india|motors?|limited|ltd\.?|pvt\.?|private|kirloskar|passenger|vehicles?|automobiles?|auto|company|cars?|&|group|corporation|inc)/g
  for (const m of opts.makers) {
    const toks = m.toLowerCase().replace(STOP, ' ').split(/\s+/).filter((t) => t.length >= 3)
    if (toks.some((t) => p.includes(` ${t}`) || p.includes(`${t} `))) f.makers.push(m)
  }
  // powertrains
  const pt = (v: string) => { if (opts.powertrains.includes(v) && !f.powertrains.includes(v)) f.powertrains.push(v) }
  if (has(/\b(bev|battery electric|full electric|electric car|electric vehicle)\b/)) pt('BEV')
  if (has(/\bphev|plug.?in\b/)) pt('PHEV')
  if (has(/\bstrong hybrid|shev\b/)) pt('Strong Hybrid')
  if (has(/\bmhev|mild hybrid\b/)) pt('MHEV')
  if (has(/\bhybrids?\b/) && !f.powertrains.length) { pt('Strong Hybrid'); pt('MHEV'); pt('HEV') }
  // fuels
  const fu = (v: string) => { if (opts.fuels.includes(v) && !f.fuels.includes(v)) f.fuels.push(v) }
  if (has(/\bdiesel\b/)) fu('Diesel')
  if (has(/\bpetrol|gasoline\b/)) fu('Petrol')
  if (has(/\bcng\b/)) fu('CNG')
  if (has(/\belectric\b/)) fu('Electric')
  // bodies
  const bodyMap: [string, RegExp][] = [['SUV', /\bsuvs?\b/], ['Hatchback', /\bhatch(back)?e?s?\b/], ['Sedan', /\bsedans?|saloons?\b/], ['MPV', /\bmpvs?\b/], ['Coupe', /\bcoupe?s?\b/], ['Van', /\bvans?\b/], ['Pickup', /\bpick.?ups?|trucks?\b/], ['CUV', /\bcuvs?|crossovers?\b/]]
  for (const [b, re] of bodyMap) if (re.test(p)) { const m = opts.bodies.find((x) => x.toLowerCase() === b.toLowerCase()); if (m && !f.bodies.includes(m)) f.bodies.push(m) }
  // segment
  const seg = p.match(/\bsegment\s+([a-f])\b|\b([a-f])[- ]segment\b/)
  if (seg) { const s = (seg[1] || seg[2]).toUpperCase(); if (opts.segments.includes(s)) f.segments.push(s) }
  // ranges — number + explicit unit disambiguates CO₂ (g/km) from mass (kg)
  const bound = (dir: 'lo' | 'hi', unit: RegExp): number | null => {
    const words = dir === 'lo' ? 'over|above|more than|greater than|higher than|>|heavier than|≥' : 'under|below|less than|lower than|lighter than|<|≤'
    const m = p.match(new RegExp(`(?:${words})\\s*(\\d+(?:\\.\\d+)?)\\s*(?:${unit.source})`))
    return m ? parseFloat(m[1]) : null
  }
  const co2Lo = bound('lo', /g\s*\/?\s*km|g\b|co2|co₂/), co2Hi = bound('hi', /g\s*\/?\s*km|g\b|co2|co₂/)
  if (co2Lo != null || co2Hi != null) f.co2 = [co2Lo, co2Hi]
  const mLo = bound('lo', /kg|kilo/), mHi = bound('hi', /kg|kilo/)
  if (mLo != null || mHi != null) f.mass = [mLo, mHi]

  if (f.makers.length) f.applied.push(f.makers.map((m) => m.split(' ')[0]).join(', '))
  if (f.powertrains.length) f.applied.push(f.powertrains.join('/'))
  if (f.fuels.length && !f.powertrains.length) f.applied.push(f.fuels.join('/'))
  if (f.bodies.length) f.applied.push(f.bodies.join('/'))
  if (f.segments.length) f.applied.push(`segment ${f.segments.join('/')}`)
  if (f.co2) f.applied.push(`CO₂ ${f.co2[0] ?? '0'}–${f.co2[1] ?? '∞'}`)
  if (f.mass) f.applied.push(`mass ${f.mass[0] ?? '0'}–${f.mass[1] ?? '∞'} kg`)
  f.matched = f.applied.length > 0
  return f
}

/** Example commands surfaced as chips — a mix of filter queries and what-ifs. */
export function whatIfStarters(country: CountryId): string[] {
  if (country === 'IN') return ['SUVs over 150 g/km', 'Maruti hatchbacks', 'BEVs under 1500 kg', 'Increase EV share by 2%', 'Show it on WLTP']
  if (country === 'CN') return ['BEVs from Tesla', 'SUVs over 1800 kg', 'Increase EV share by 5%', 'NEV ratio to 48%']
  return ['SUVs over 120 g/km', 'Diesel sedans', 'BEVs under 1600 kg', 'Increase EV share by 2%']
}
