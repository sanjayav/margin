// India end-to-end check: does the merged 2025–31 IN fleet flow through the
// engine and produce sensible CAFE II / CAFE III compliance per maker-year?
//   esbuild scripts/verify-india.ts --bundle --platform=node --format=esm --outfile=node_modules/.cache/vin.mjs && node node_modules/.cache/vin.mjs
import { getPack } from '../src/engine/rulepacks/index.js'
import { aggregateParent } from '../src/engine/engine.js'
import fleet from '../src/data/fleet_data.js'
import type { Scenario } from '../src/engine/types.js'

const IN = (fleet as any).IN as any[]
const pack = getPack('IN')
const base = (year: number): Scenario => ({ year, evSharePct: null, salesMultiplier: 1, massShiftKg: 0, ecoBoostG: 0, poolingEnabled: false, superCreditsEnabled: true, mix: null, extraVariants: [], phevUF: true, creditPrice: null, targetShiftPct: null })

let pass = 0, fail = 0
const check = (n: string, c: boolean, d = '') => { console.log(`${c ? '✓' : '✗ FAIL'} ${n}${d ? ' — ' + d : ''}`); c ? pass++ : fail++ }

console.log('IN fleet spans', Math.min(...IN.map((v) => v.year)), '→', Math.max(...IN.map((v) => v.year)), `(${IN.length} rows)\n`)

check('year strip covers 2025–2031', JSON.stringify(pack.years) === JSON.stringify([2025, 2026, 2027, 2028, 2029, 2030, 2031]))
check('workspace opens on CAFE III (2027)', pack.defaultYear === 2027)
check('2026 is a CAFE II year', pack.regimeFor?.(2026)?.name === 'CAFE II')
check('2027 is CAFE III (draft)', pack.regimeFor?.(2027)?.name === 'CAFE III' && pack.regimeFor?.(2027)?.draft === true)

console.log('\nPer maker-year compliance (engine):')
const seen = new Set<string>()
for (const year of pack.years) {
  const parents = [...new Set(IN.filter((v) => v.year === year).map((v) => v.parent))]
  for (const p of parents) {
    const a = aggregateParent(IN, pack, base(year), p)
    if (a.rawUnits === 0) continue
    seen.add(`${year}:${p}`)
    const regime = pack.regimeFor?.(year)?.name
    console.log(`  ${year} ${regime}  ${p.slice(0, 34).padEnd(34)} perf=${a.avgMetric.toFixed(2)} limit=${a.limit.toFixed(2)} L/100km  gap=${a.gap.toFixed(2)}  ${a.status}  ${(a.zlevShare * 100).toFixed(0)}% ZE`)
    check(`  ${year} ${p.split(' ')[0]} has a positive limit`, a.limit > 0)
    check(`  ${year} ${p.split(' ')[0]} metric is finite & ≥0`, Number.isFinite(a.avgMetric) && a.avgMetric >= 0)
  }
}

// MG 2025: EV-heavy maker → very low fleet metric (the workbook's illustrative
// P=150 excluded EVs; the engine must NOT).
{
  const a = aggregateParent(IN, pack, base(2025), 'MG Motor')
  check('MG 2025 fleet metric reflects EV dominance (< 2 L/100km)', a.avgMetric < 2, `${a.avgMetric.toFixed(2)} L/100km, ${(a.zlevShare * 100).toFixed(0)}% ZE`)
  check('MG 2025 is compliant', a.status === 'compliant')
}

console.log(`\n${pass} passed · ${fail} failed`)
if (fail) process.exit(1)
