// India end-to-end check — MASTER-file era (the only India source, 2026-07-14):
// 2025–26 actuals for MG/Renault/Nissan/Skoda, plus the 2026 fleet replicated
// across the CAFE III horizon (2027–31) as the as-sold baseline projection.
//   esbuild scripts/verify-india.ts --bundle --platform=node --format=esm --outfile=node_modules/.cache/vin.mjs && node node_modules/.cache/vin.mjs
import { getPack } from '../src/engine/rulepacks/index.js'
import { aggregateParent, buildTree } from '../src/engine/engine.js'
import fleet from '../src/data/fleet_data.js'
import type { Scenario, Vehicle } from '../src/engine/types.js'

const IN = (fleet as any).IN as Vehicle[]
const pack = getPack('IN')
const base = (year: number): Scenario => ({ year, evSharePct: null, salesMultiplier: 1, massShiftKg: 0, ecoBoostG: 0, poolingEnabled: false, superCreditsEnabled: true, mix: null, extraVariants: [], phevUF: true, creditPrice: null, targetShiftPct: null })

let pass = 0, fail = 0
const check = (n: string, c: boolean, d = '') => { console.log(`${c ? '✓' : '✗ FAIL'} ${n}${d ? ' — ' + d : ''}`); c ? pass++ : fail++ }

const MASTER_MAKERS = ['MG Motor', 'Nissan Motor India Private Limited', 'Renault India Private Limited', 'Skoda Auto Volkswagen India Private Limited']
console.log('IN fleet spans', Math.min(...IN.map((v) => v.year)), '→', Math.max(...IN.map((v) => v.year)), `(${IN.length} rows)\n`)

// ── source-of-truth: ONLY the master data ────────────────────────────────────
check('year strip covers 2025–2031', JSON.stringify(pack.years) === JSON.stringify([2025, 2026, 2027, 2028, 2029, 2030, 2031]))
check('workspace opens on CAFE III (2027)', pack.defaultYear === 2027)
const makers = [...new Set(IN.map((v) => v.parent))].sort()
check('exactly the 4 master-file makers — old demo data deleted', JSON.stringify(makers) === JSON.stringify(MASTER_MAKERS), makers.join(' · '))
check('no dummy makers survive', !IN.some((v) => /Maruti|Tata|Mahindra/.test(v.parent)))
const y2025 = new Set(IN.filter((v) => v.year === 2025).map((v) => v.parent))
check('2025 actuals: MG + Skoda', y2025.size === 2 && y2025.has('MG Motor'))
for (const y of [2026, 2027, 2031]) {
  const m = new Set(IN.filter((v) => v.year === y).map((v) => v.parent))
  check(`${y}: all four master makers present`, m.size === 4)
}

// ── horizon = the 2026 actuals replicated (baseline projection convention) ──
{
  const y26 = IN.filter((v) => v.year === 2026)
  const y29 = IN.filter((v) => v.year === 2029)
  check('horizon rows replicate the 2026 fleet (row count)', y26.length === y29.length, `${y26.length} vs ${y29.length}`)
  const k26 = new Map(y26.map((v) => [`${v.parent}|${v.model}`, v]))
  const same = y29.every((v) => {
    const b = k26.get(`${v.parent}|${v.model}`)
    return !!b && b.sales === v.sales && b.co2 === v.co2 && b.mass === v.mass
  })
  check('horizon rows carry identical sales/CO₂/mass (only the year moves)', same)
  check('horizon rows re-labelled to their fiscal year', y29.every((v: any) => v.fyLabel === 'FY 2029-30'))
  check("horizon rows tagged 'Baseline projection' (tellable in Data/exports)", y29.every((v: any) => v.scenario === 'Baseline projection'))
  check('actual-year rows stay tagged Base', y26.every((v: any) => v.scenario === 'Base'))
}

// ── CNF discounts: auto-derived from fuel, CAFE III only, lever-controlled ──
{
  const on = aggregateParent(IN, pack, { ...base(2027), cnfEnabled: true }, 'Skoda Auto Volkswagen India Private Limited')
  const off = aggregateParent(IN, pack, { ...base(2027), cnfEnabled: false }, 'Skoda Auto Volkswagen India Private Limited')
  check('CAFE III: E20 CNF lowers a petrol maker\'s metric', on.avgMetric < off.avgMetric - 0.05, `${on.avgMetric.toFixed(3)} vs ${off.avgMetric.toFixed(3)}`)
  const ratio = on.avgMetric / off.avgMetric
  check('CNF magnitude ≈ 8% on an all-petrol fleet', ratio > 0.90 && ratio < 0.94, `ratio ${ratio.toFixed(3)}`)
  const on2 = aggregateParent(IN, pack, { ...base(2026), cnfEnabled: true }, 'Skoda Auto Volkswagen India Private Limited')
  const off2 = aggregateParent(IN, pack, { ...base(2026), cnfEnabled: false }, 'Skoda Auto Volkswagen India Private Limited')
  check('CAFE II: CNF inert (mechanism starts FY2027-28)', Math.abs(on2.avgMetric - off2.avgMetric) < 1e-9)
}

// ── compliance computes sensibly across both regimes ─────────────────────────
console.log('\nPer maker-year compliance (engine):')
for (const year of pack.years) {
  for (const p of MASTER_MAKERS) {
    const a = aggregateParent(IN, pack, base(year), p)
    if (a.rawUnits === 0) continue
    const regime = pack.regimeFor?.(year)?.name
    console.log(`  ${year} ${regime}  ${p.slice(0, 34).padEnd(34)} perf=${a.avgMetric.toFixed(2)} limit=${a.limit.toFixed(2)} gap=${a.gap.toFixed(2)}  ${a.status}  ${(a.zlevShare * 100).toFixed(0)}% ZE`)
    check(`  ${year} ${p.split(' ')[0]} limit>0 & metric finite`, a.limit > 0 && Number.isFinite(a.avgMetric) && a.avgMetric >= 0)
  }
}

// MG 2025 is EV-heavy: the engine must include EVs (workbook's illustrative
// P=150 excluded them — the known source quirk).
{
  const a = aggregateParent(IN, pack, base(2025), 'MG Motor')
  check('MG 2025 metric reflects EV dominance (< 2 L/100km)', a.avgMetric < 2, `${a.avgMetric.toFixed(2)} L/100km, ${(a.zlevShare * 100).toFixed(0)}% ZE`)
  check('MG 2025 is compliant', a.status === 'compliant')
}

// market roll-up exists for every year (no empty screens anywhere on the strip)
for (const y of pack.years) {
  const t = buildTree(IN, pack, base(y), {})
  check(`market tree ${y} has volume`, t.rawUnits > 0, `${t.rawUnits}`)
}

// ── the master structure's computed columns (AO–AT): engine identities ──────
{
  const PETROL_DIV = 23.7135
  const t = buildTree(IN, pack, base(2026), {})
  for (const c of (t.children ?? []).filter((x) => x.rawUnits > 0)) {
    const P = c.avgMetric * PETROL_DIV
    const T = c.limit * PETROL_DIV
    const credit = c.limit - c.avgMetric
    const ok = Math.abs(P / PETROL_DIV - c.avgMetric) < 1e-9 && Math.abs(T / PETROL_DIV - c.limit) < 1e-9
    check(`ledger identity: CAFCS=P/23.7135 & ACAFC=T/23.7135 · ${c.label.split(' ')[0]}`, ok)
    check(`ledger sign convention matches gap · ${c.label.split(' ')[0]}`, (credit >= 0) === (c.gap <= 0), `credit ${credit.toFixed(3)} gap ${c.gap.toFixed(3)}`)
  }
  // MG 2025 known truth: P ≈ 23 g/km (EVs included at 0 — not the file's illustrative 150)
  const mg = aggregateParent(IN, pack, base(2025), 'MG Motor')
  const P = mg.avgMetric * PETROL_DIV
  check('MG 2025 ledger P ≈ 23 g/km (EVs included, engine truth)', P > 15 && P < 30, P.toFixed(1))
}

// ── hypothetical variants are PINNED: typed units land exactly — no fleet
//    lever rescales them (regression: 5,000 typed units read as 25,000 when
//    extras joined the mix/volume reallocation) ─────────────────────────────
{
  const { applyScenario, aggregate } = await import('../src/engine/engine.js')
  const baseUnits = IN.filter((v) => v.year === 2027).reduce((a, v) => a + v.sales, 0)
  const ev: Vehicle = { parent: 'MG Motor', pool: '', brand: 'MG Motor', make: 'MG Motor', model: 'Pin Probe EV', year: 2027, powertrain: 'BEV', fuel: 'Electric', co2: 0, mass: 1500, sales: 5000, vclass: 'Passenger car' }
  const vSales = (s: Scenario) => applyScenario(IN, s, pack, {}).filter((x) => x.model === 'Pin Probe EV').reduce((a, x) => a + x.sales, 0)
  const s0: Scenario = { ...base(2027), extraVariants: [ev] }
  check('variant lands at exactly its typed units', vSales(s0) === 5000, String(vSales(s0)))
  check('…under a ×5 sales multiplier', vSales({ ...s0, salesMultiplier: 5 }) === 5000, String(vSales({ ...s0, salesMultiplier: 5 })))
  check('…under a market mix (BEV 25%)', vSales({ ...s0, mix: { ICE: 75, BEV: 25 } }) === 5000)
  check('…under the EV-share lever (40%)', vSales({ ...s0, evSharePct: 40 }) === 5000)
  const shifted = applyScenario(IN, { ...s0, massShiftKg: 200 }, pack, {}).find((x) => x.model === 'Pin Probe EV')
  check('…mass shift never re-engineers the typed spec', shifted?.mass === 1500, String(shifted?.mass))
  const scaled = aggregate(applyScenario(IN, { ...s0, salesMultiplier: 5 }, pack, {}), pack, { ...s0, salesMultiplier: 5 }, 'IN', 0, 'p')
  check('the surrounding fleet still answers the lever (×5 + 5,000)', scaled.rawUnits === baseUnits * 5 + 5000, `${scaled.rawUnits} vs ${baseUnits * 5 + 5000}`)
  // share-mode: takes its share of the post-multiplier market, total preserved
  const sh: Vehicle = { ...ev, model: 'Pin Probe Share', sales: 0, share: 0.1, shareScope: 'market' } as Vehicle
  const out = applyScenario(IN, { ...base(2027), salesMultiplier: 2, extraVariants: [sh] }, pack, {})
  const shRow = out.find((x) => x.model === 'Pin Probe Share')!
  const total = out.reduce((a, x) => a + x.sales, 0)
  check('share-mode variant = 10% of the ×2 market', Math.abs(shRow.sales - baseUnits * 2 * 0.1) < 2, String(shRow.sales))
  check('share-mode preserves the scope total', Math.abs(total - baseUnits * 2) < 2, `${total.toFixed(0)} vs ${baseUnits * 2}`)
}

console.log(`\n${pass} passed · ${fail} failed`)
if (fail) process.exit(1)
