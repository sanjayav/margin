// One-off behavioural check for the logic fixes. Run:
//   esbuild scripts/logic-check.ts --bundle --platform=node --format=esm --outfile=node_modules/.cache/lc.mjs && node node_modules/.cache/lc.mjs
import { getPack } from '../src/engine/rulepacks/index.js'
import { buildTree, aggregateParent } from '../src/engine/engine.js'
import { bestForMaker } from '../src/engine/pooling.js'
import fleet from '../src/data/fleet_data.js'
import type { CountryId, Scenario } from '../src/engine/types.js'

const data = fleet as any
const base = (c: CountryId): Scenario => {
  const p = getPack(c)
  return { year: p.years[0], evSharePct: null, salesMultiplier: 1, massShiftKg: 0, ecoBoostG: 0, poolingEnabled: false, superCreditsEnabled: c === 'IN', mix: null, extraVariants: [], phevUF: true, creditPrice: null }
}

let pass = 0, fail = 0
const check = (name: string, cond: boolean, detail = '') => { console.log(`${cond ? '✓' : '✗ FAIL'} ${name}${detail ? ' — ' + detail : ''}`); cond ? pass++ : fail++ }

// 1. EV-share lever now moves an ALL-COMBUSTION maker (McLaren, EU)
{
  const eu = getPack('EU'); const raw = data.EU as any
  const before = aggregateParent(raw, eu, base('EU'), 'McLaren Automotive')
  const after = aggregateParent(raw, eu, { ...base('EU'), evSharePct: 50 }, 'McLaren Automotive')
  check('EV-share moves all-combustion McLaren', after.avgMetric < before.avgMetric - 1,
    `metric ${before.avgMetric.toFixed(1)} → ${after.avgMetric.toFixed(1)}; ZE share ${(after.zlevShare * 100).toFixed(0)}%`)
  check('Forced 50% EV ⇒ ~50% ZE share', Math.abs(after.zlevShare - 0.5) < 0.02, `${(after.zlevShare * 100).toFixed(1)}%`)
}

// 2. India metric is NOT moved by the eco-innovation lever (unit bug fixed)
{
  const ind = getPack('IN'); const raw = data.IN as any
  const m0 = aggregateParent(raw, ind, base('IN'), 'Maruti Suzuki India Limited').avgMetric
  const m5 = aggregateParent(raw, ind, { ...base('IN'), ecoBoostG: 5 }, 'Maruti Suzuki India Limited').avgMetric
  check('India ecoBoostG no longer changes the metric', Math.abs(m0 - m5) < 1e-9, `${m0.toFixed(4)} vs ${m5.toFixed(4)}`)
}

// 3. India eco mechanism is absent; EU/UK present (ecoCap contract)
check('IN has no ecoCap', getPack('IN').ecoCap === undefined)
check('AU has no ecoCap', getPack('AU').ecoCap === undefined)
check('EU ecoCap 2030 = 4 g', getPack('EU').ecoCap?.(2030) === 4)
check('UK ecoCap = 7 g', getPack('UK').ecoCap?.(2025) === 7)

// 4. AU Type classification: Type 1 stays Type 1 even with a stray "2" in the label
{
  const au = getPack('AU')
  const ctx = (vclass: string) => ({ year: 2025, avgMass: 1723, zlevShare: 0, vclass, scenario: base('AU') })
  const t1 = au.limit(ctx('Type 1'))                  // at Type 1 ref MIRO 1723
  const t1w = au.limit(ctx('Type 1 (2WD)'))           // stray "2" must NOT flip to Type 2
  const t2ref = au.limit({ year: 2025, avgMass: 2155, zlevShare: 0, vclass: 'Type 2', scenario: base('AU') })
  check('AU "Type 1" headline = 141 at ref MIRO', Math.round(t1) === 141, `${t1.toFixed(0)}`)
  check('AU "Type 1 (2WD)" classified as Type 1 (not 210)', Math.round(t1w) === Math.round(t1), `${t1w.toFixed(0)} vs ${t1.toFixed(0)}`)
  check('AU "Type 2" headline = 210 at its ref MIRO', Math.round(t2ref) === 210, `${t2ref.toFixed(0)}`)
}

// 5. bestForMaker pool option no longer charges the full pool residual
{
  // Force a market where pooling leaves a residual: shrink everyone's ZE hard.
  const eu = getPack('EU'); const raw = data.EU as any
  const s = { ...base('EU'), evSharePct: 0 } // kill ZE → big fines, pool won't fully clear
  const tree = buildTree(raw, eu, s)
  const shortMaker = (tree.children ?? []).find((c) => c.fine > 0)?.label
  if (shortMaker) {
    const opts = bestForMaker(raw, eu, s, shortMaker)
    const pool = opts.find((o) => o.type === 'pool')
    const fineRow = (tree.children ?? []).find((c) => c.label === shortMaker)!
    check('bestForMaker pool cost ≤ standalone fine (no whole-pool residual)',
      !pool || pool.cost <= fineRow.fine + 1, pool ? `pool cost ${Math.round(pool.cost)} vs standalone ${Math.round(fineRow.fine)}` : 'no pool option')
  } else {
    check('bestForMaker residual scenario produced a short maker', false, 'no short maker found')
  }
}

console.log(`\n${pass} passed · ${fail} failed`)
if (fail) process.exit(1)
