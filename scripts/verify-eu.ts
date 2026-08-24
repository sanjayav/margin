// EU end-to-end check — EEA CO₂-monitoring era (2025 provisional, published
// 2026-06-25; loaded by scripts/ingest-eu-eea.mjs).
//
// Three layers, in order of what they'd catch:
//   1. the DATA is the official file        (totals tie to the EEA press release)
//   2. the RULE PACK is the regulation      (93.6 g − 0.0144·(TM−1609.6), €95/g)
//   3. the ENGINE agrees with reality       (who is short, who is long, pooling)
//
//   esbuild scripts/verify-eu.ts --bundle --platform=node --format=esm --outfile=node_modules/.cache/veu.mjs && node node_modules/.cache/veu.mjs
import { getPack } from '../src/engine/rulepacks/index.js'
import { buildTree } from '../src/engine/engine.js'
import { poolGroups, parentPoolMap } from '../src/engine/pooling.js'
import fleet from '../src/data/fleet_data.js'
import type { Scenario, Vehicle } from '../src/engine/types.js'

const EU = (fleet as any).EU as Vehicle[]
const pack = getPack('EU')
const scen = (year: number, over: Partial<Scenario> = {}): Scenario => ({
  year, evSharePct: null, salesMultiplier: 1, massShiftKg: 0, ecoBoostG: 0,
  poolingEnabled: false, superCreditsEnabled: true, mix: null, extraVariants: [],
  phevUF: true, creditPrice: null, targetShiftPct: null, ...over,
})

let pass = 0, fail = 0
const check = (n: string, c: boolean, d = '') => { console.log(`${c ? '✓' : '✗ FAIL'} ${n}${d ? ' — ' + d : ''}`); c ? pass++ : fail++ }
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol
const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 })

const cars = EU.filter((v) => v.vclass === 'Passenger car')
const vans = EU.filter((v) => v.vclass === 'Light commercial vehicle')
const at = (rows: Vehicle[], y: number) => rows.filter((v) => v.year === y)
const wavg = (rows: Vehicle[], f: (v: Vehicle) => number) => {
  const u = rows.reduce((a, v) => a + v.sales, 0)
  return u ? rows.reduce((a, v) => a + f(v) * v.sales, 0) / u : 0
}
console.log(`EU fleet ${EU.length} rows · ${Math.min(...EU.map((v) => v.year))}–${Math.max(...EU.map((v) => v.year))}\n`)

// ── 1. the data is the official EEA file ─────────────────────────────────────
console.log('── data · ties to the EEA release of 25 Jun 2026 ──')
const c25 = at(cars, 2025), v25 = at(vans, 2025)
const carRegs = c25.reduce((a, v) => a + v.sales, 0)
const vanRegs = v25.reduce((a, v) => a + v.sales, 0)
check('car registrations = 10,799,313 (EEA "10.8 million")', carRegs === 10_799_313, fmt(carRegs))
check('van registrations = 1,168,249 (EEA "1.2 million")', vanRegs === 1_168_249, fmt(vanRegs))
// EEA truncates to 1dp: 96.725 → "96.7"
const carCo2 = wavg(c25, (v) => v.co2)
check('car fleet CO₂ truncates to the published 96.7 g/km', Math.trunc(carCo2 * 10) / 10 === 96.7, carCo2.toFixed(3))
const ze = c25.filter((v) => v.co2 === 0).reduce((a, v) => a + v.sales, 0) / carRegs * 100
const phev = c25.filter((v) => v.powertrain === 'PHEV').reduce((a, v) => a + v.sales, 0) / carRegs * 100
check('car BEV share truncates to the published 18.9%', Math.trunc(ze * 10) / 10 === 18.9, ze.toFixed(3) + '%')
check('car PHEV share truncates to the published 9.7%', Math.trunc(phev * 10) / 10 === 9.7, phev.toFixed(3) + '%')
check('eco-innovation is the true per-vehicle credit, not the claimants-only mean',
  near(wavg(c25, (v) => v.ecoBenefit ?? 0), 0.777, 0.01), wavg(c25, (v) => v.ecoBenefit ?? 0).toFixed(3) + ' g/km (claimants-only would read 1.50)')
check('every car row carries eco-innovation within the Art 11 cap', c25.every((v) => (v.ecoBenefit ?? 0) <= pack.ecoCap!(2025)))
check('mass is test mass (EEA 2025 avg ≈ 1721 kg, above the 1609.6 kg TM0)',
  near(wavg(c25, (v) => v.mass), 1721.2, 1), wavg(c25, (v) => v.mass).toFixed(1) + ' kg')
check('119 car makers · 87 van makers', new Set(c25.map((v) => v.parent)).size === 119 && new Set(v25.map((v) => v.parent)).size === 87)
check('the van fleet sits ABOVE the 2163 kg van TM0 — so it is on the steep branch',
  wavg(v25, (v) => v.mass) > 2163, `${wavg(v25, (v) => v.mass).toFixed(0)} kg`)
check('no row has negative or absent volume', EU.every((v) => v.sales > 0))
check('no BEV carries tailpipe CO₂, no ICE carries zero', EU.every((v) => (v.powertrain === 'BEV' || v.powertrain === 'FCEV' ? v.co2 === 0 : true)) && EU.every((v) => (v.powertrain === 'ICE' ? v.co2 > 0 : true)))
check('every year 2025–2030 carries the full fleet', pack.years.every((y) => at(cars, y).reduce((a, v) => a + v.sales, 0) === carRegs))
check('held years are labelled as held, 2025 is not', at(cars, 2025).every((v: any) => !/held/.test(v.source ?? '')) && at(cars, 2030).every((v: any) => /held/.test(v.source ?? '')))

// ── 2. the rule pack is the regulation ──────────────────────────────────────
console.log('\n── rule pack · Reg (EU) 2019/631 as amended ──')
check('2025 car fleet-wide target is 93.6 g/km', near(pack.forecast(2025).limit, 93.6, 0.05), pack.forecast(2025).limit.toFixed(2))
check('2030 car fleet-wide target is 49.5 g/km', near(pack.forecast(2030).limit, 49.5, 0.1), pack.forecast(2030).limit.toFixed(2))
check('car slope is NEGATIVE 0.0144 off TM0 1609.6 — heavier ⇒ tighter (JRC eq 31)', (() => {
  const a = pack.limit({ vclass: 'Passenger car', year: 2025, avgMass: 1609.6, zlevShare: 0 } as any)
  const b = pack.limit({ vclass: 'Passenger car', year: 2025, avgMass: 2609.6, zlevShare: 0 } as any)
  return near(a, 93.6, 0.05) && near(b - a, -14.4, 0.05)
})())
check('car slope shallows to 0.0076 from 2030 (JRC eq 32)', (() => {
  const a = pack.limit({ vclass: 'Passenger car', year: 2030, avgMass: 1609.6, zlevShare: 0 } as any)
  const b = pack.limit({ vclass: 'Passenger car', year: 2030, avgMass: 2609.6, zlevShare: 0 } as any)
  return near(a, 49.5, 0.05) && near(b - a, -7.6, 0.05)
})())
check('van line is 153.9 at TM0 2163.0 and PIECEWISE either side (JRC eq 40, 17/18)', (() => {
  const v = (m: number) => pack.limit({ vclass: 'Light commercial vehicle', year: 2025, avgMass: m, zlevShare: 0 } as any)
  return near(v(2163), 153.9, 0.05)
    && near(v(2000), 153.9 - 0.0848 * 163, 0.05)   // below TM0 → a2025 0.0848
    && near(v(2326), 153.9 + 0.1064 * 163, 0.05)   // above TM0 → a2021 0.1064
})())
check('both classes hit 0 g/km in 2035, with no mass relief',
  pack.limit({ vclass: 'Passenger car', year: 2035, avgMass: 2600, zlevShare: 0 } as any) === 0
  && pack.limit({ vclass: 'Light commercial vehicle', year: 2035, avgMass: 2600, zlevShare: 0 } as any) === 0)
check('fine rate is €95 per g/km per car (Article 8)', pack.fineRate === 95)
check('ZLEV relaxation runs 2025–2029 and is gone from 2030', (() => {
  const ctx = { vclass: 'Passenger car', avgMass: 1609.6, zlevShare: 0.30 } as any
  const lift25 = pack.limit({ ...ctx, year: 2025 }) / pack.limit({ ...ctx, zlevShare: 0, year: 2025 })
  const lift30 = pack.limit({ ...ctx, year: 2030 }) / pack.limit({ ...ctx, zlevShare: 0, year: 2030 })
  return near(lift25, 1.05, 0.001) && near(lift30, 1, 1e-9)  // 30% vs 25% bench = +5%, capped
})())
check('ZLEV relaxation caps at 5%', near(pack.limit({ vclass: 'Passenger car', year: 2025, avgMass: 1609.6, zlevShare: 0.9 } as any) / 93.6, 1.05, 0.001))

// ── 3. the engine agrees with reality ───────────────────────────────────────
console.log('\n── engine · standalone compliance on the real fleet ──')
const t = buildTree(EU.filter((v) => v.vclass === 'Passenger car'), pack, scen(2025))
check('market average matches the file', near(t.rawAvgMetric, carCo2, 0.5), `${t.rawAvgMetric.toFixed(1)} g/km`)
// 93.6 − 0.0144 × (1721.2 − 1609.6) = 91.99 g/km before the ZLEV relaxation.
check('market limit = 93.6 g MINUS the mass adjustment, then the ZLEV relaxation',
  near(t.limit, 91.99 * (1 + Math.min(0.05, 0.2749 - 0.25)), 0.15), `${t.limit.toFixed(2)} g/km (mass-adjusted 91.99 × ZLEV 1.025)`)
check('the ZLEV relaxation is actually engaged (0–50 g share 27.5% beats the 25% bench)', t.limit > 91.99, `${t.limit.toFixed(2)} > 91.99`)
check('after-credit average exceeds tailpipe (the PHEV utility factor bites in 2025)',
  t.avgMetric > t.rawAvgMetric, `${t.rawAvgMetric.toFixed(2)} → ${t.avgMetric.toFixed(2)} g/km`)
// The EU misses 2025 even after the ZLEV relaxation — which is the whole reason
// Article 6 pooling and the Reg (EU) 2025/1214 three-year averaging exist. If the
// mass slope sign is ever flipped back, this check turns into a false pass.
check('the market MISSES 2025 even with the relaxation',
  t.gap > 2 && t.gap < 4, `gap +${t.gap.toFixed(2)} g/km`)
const makers = (t.children ?? []).filter((m) => m.rawUnits >= 50_000)
console.log(`\n  ${'maker'.padEnd(26)} ${'regs'.padStart(10)} ${'avg'.padStart(7)} ${'limit'.padStart(7)} ${'gap'.padStart(7)}  ${'fine €m'.padStart(9)}`)
for (const m of makers.slice(0, 16)) {
  console.log(`  ${m.label.slice(0, 26).padEnd(26)} ${fmt(m.rawUnits).padStart(10)} ${m.avgMetric.toFixed(1).padStart(7)} ${m.limit.toFixed(1).padStart(7)} ${m.gap.toFixed(1).padStart(7)}  ${(m.fine / 1e6).toFixed(0).padStart(9)}`)
}
const byName = new Map((t.children ?? []).map((m) => [m.label, m]))
const long = ['Tesla', 'Volvo', 'BYD Auto', 'Polestar', 'Ampere']
const short = ['Dacia', 'Suzuki Motor Corporation']
check('the ZEV-only makers are long (Tesla · Volvo · BYD · Polestar · Ampere)',
  long.every((n) => (byName.get(n)?.gap ?? 1) < 0), long.map((n) => `${n} ${byName.get(n)?.gap.toFixed(0) ?? 'n/a'}`).join(' · '))
check('the low-ZEV volume makers are short (Dacia · Suzuki)',
  short.every((n) => (byName.get(n)?.gap ?? -1) > 0), short.map((n) => `${n} +${byName.get(n)?.gap.toFixed(0) ?? 'n/a'}`).join(' · '))
check('the heavy premium fleets are short too, on tightened targets',
  ['Mercedes-Benz AG', 'Audi AG'].every((n) => (byName.get(n)?.gap ?? -1) > 8),
  ['Mercedes-Benz AG', 'Audi AG'].map((n) => `${n} +${byName.get(n)?.gap.toFixed(0)}`).join(' · '))
check('a heavier fleet earns a TIGHTER limit (the car slope is negative)',
  (byName.get('Mercedes-Benz AG')?.limit ?? 99) < (byName.get('Dacia')?.limit ?? 0),
  `Mercedes ${byName.get('Mercedes-Benz AG')?.limit.toFixed(1)} @ ${byName.get('Mercedes-Benz AG')?.avgMass.toFixed(0)} kg vs Dacia ${byName.get('Dacia')?.limit.toFixed(1)} @ ${byName.get('Dacia')?.avgMass.toFixed(0)} kg`)
check('no maker is fined while compliant, and none has a negative fine',
  (t.children ?? []).every((m) => (m.gap <= 0 ? m.fine === 0 : true) && m.fine >= 0))
// Art 10 derogation: under 1,000 registrations a maker is exempt, so a positive
// gap with no fine is correct there and ONLY there.
check('a positive gap goes unfined only under the 1,000-unit derogation',
  (t.children ?? []).every((m) => (m.gap > 0 && m.fine === 0 ? m.status === 'exempt' && m.rawUnits < 1000 : true)),
  `${(t.children ?? []).filter((m) => m.status === 'exempt').length} exempt small-volume makers`)
check('a fine equals gap × €95 × registrations', (() => {
  const m = (t.children ?? []).find((x) => x.gap > 0 && x.rawUnits > 100_000)!
  return near(m.fine, m.gap * 95 * m.rawUnits, Math.max(1, m.fine * 0.02))
})())

console.log('\n── engine · Article 6 pooling on the real declared pools ──')
const map = parentPoolMap(EU, 2025)
check('the real 2025 pools are present', ['Tesla', 'BMW', 'Nissan-BYD'].every((p) => Object.values(map).includes(p))
  && Object.entries(map).some(([k, v]) => k === 'Toyota Motor Corporation' && v === 'Tesla'))
const groups = poolGroups(cars, pack, scen(2025, { poolingEnabled: true }))
const teslaPool = groups.find((g) => g.pool === 'Tesla')
check('the Tesla pool has its real 16 members', (teslaPool?.members.length ?? 0) === 16, `${teslaPool?.members.length} members`)
// poolGroups covers every maker (a solo maker is a one-member pool), so these
// two sums are directly comparable.
const soloFine = groups.reduce((a, g) => a + g.standaloneFine, 0)
const pooledFine = groups.reduce((a, g) => a + g.result.fine, 0)
check('every maker is in exactly one pool group', groups.reduce((a, g) => a + g.members.length, 0) === (t.children ?? []).length)
check('pooling is sub-additive — it never costs more than standing alone', pooledFine <= soloFine + 1,
  `standalone €${(soloFine / 1e9).toFixed(2)}bn → pooled €${(pooledFine / 1e9).toFixed(2)}bn, saving €${((soloFine - pooledFine) / 1e9).toFixed(2)}bn`)
check('the Tesla pool wipes out its members\' standalone liability',
  (teslaPool?.result.fine ?? 1) === 0 && (teslaPool?.standaloneFine ?? 0) > 1e9,
  `€${((teslaPool?.standaloneFine ?? 0) / 1e6).toFixed(0)}m standalone → €0 pooled`)
check('the BMW pool clears on Rolls-Royce + i-range headroom',
  (() => { const b = groups.find((g) => g.pool === 'BMW')!; return b.members.length === 3 && b.result.fine === 0 })())
// Volvo and Polestar are deeply long, but Mercedes-Benz is a heavy fleet on a
// tightened target — the pool absorbs most of it without quite clearing.
check('the Mercedes/Volvo/Polestar/Smart pool absorbs most of Mercedes\' liability',
  (() => {
    const m = groups.find((g) => /^Mercedes-Benz, Volvo/.test(g.pool))!
    return m.members.length === 5 && m.result.fine > 0 && m.result.fine < m.standaloneFine * 0.2
  })(),
  (() => { const m = groups.find((g) => /^Mercedes-Benz, Volvo/.test(g.pool))!; return `€${(m.standaloneFine / 1e6).toFixed(0)}m → €${(m.result.fine / 1e6).toFixed(0)}m (${(100 - (m.result.fine / m.standaloneFine) * 100).toFixed(0)}% removed)` })())
check('a pool that is short overall still pays, just less',
  (() => { const h = groups.find((g) => g.pool === 'Hyundai Motor Europe')!; return h.result.fine > 0 && h.result.fine < h.standaloneFine })(),
  (() => { const h = groups.find((g) => g.pool === 'Hyundai Motor Europe')!; return `€${(h.standaloneFine / 1e6).toFixed(0)}m → €${(h.result.fine / 1e6).toFixed(0)}m` })())

console.log('\n── engine · the 2030 step must bite ──')
const t30 = buildTree(cars, pack, scen(2030))
check('the 2030 limit is far below the 2025 limit (−55% vs −15%)', t30.limit < t.limit * 0.65, `${t.limit.toFixed(1)} → ${t30.limit.toFixed(1)} g/km`)
check('holding the 2025 fleet into 2030 is a much bigger miss', t30.gap > t.gap * 3, `gap +${t.gap.toFixed(1)} → +${t30.gap.toFixed(1)} g/km`)

console.log('\n── engine · vans are their own compliance class ──')
const tv = buildTree(EU.filter((v) => v.vclass === 'Light commercial vehicle'), pack, scen(2025))
check('van limit uses the van line, not the car line', near(tv.limit, 153.9 + 0.1064 * (tv.avgMass - 2163), 0.6), `${tv.limit.toFixed(2)} g/km @ ${tv.avgMass.toFixed(0)} kg`)
check('the van fleet is badly short — electrification lags cars', tv.gap > 10, `gap +${tv.gap.toFixed(1)} g/km`)

console.log(`\n${fail === 0 ? '✓ ALL' : '✗'} ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
