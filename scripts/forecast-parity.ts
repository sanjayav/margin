// Parity harness: proves src/engine/forecast.ts reproduces the exact numbers the
// Forecast screen computed inline before the extraction. Run:
//   esbuild scripts/forecast-parity.ts --bundle --platform=node --format=esm --outfile=node_modules/.cache/fp.mjs && node node_modules/.cache/fp.mjs
import { getPack, PACK_LIST } from '../src/engine/rulepacks/index.js'
import { buildTree, aggregateParent } from '../src/engine/engine.js'
import { buildForecast, MARKET_TARGET } from '../src/engine/forecast.js'
import fleet from '../src/data/fleet_data.js'
import type { Aggregate, CountryId, Scenario } from '../src/engine/types.js'

const data = fleet as Record<CountryId, any>
const MARKET = '__market__'

// The neutral baseline the screen used inline (identical keys).
const neutral = (c: CountryId): Scenario => {
  const p = getPack(c)
  return { year: p.years[0], evSharePct: null, salesMultiplier: 1, massShiftKg: 0, ecoBoostG: 0, poolingEnabled: false, superCreditsEnabled: c === 'IN', mix: null, phevUF: true, creditPrice: null }
}

// ── the OLD inline computation, copied verbatim from pre-refactor Forecast.tsx ──
function oldForecast(country: CountryId, target: string, scenario: Scenario, overrides: Record<string, Partial<Scenario>>) {
  const pack = getPack(country); const raw = data[country]
  const base = neutral(country)
  const isMarket = target === MARKET
  const parent = isMarket ? '' : target
  const marketFine = (t: Aggregate) => (t.children ?? []).reduce((a, c) => a + c.fine, 0)
  const nodeFor = (sc: Scenario, withOverrides: boolean): Aggregate => {
    const ov = withOverrides ? overrides : {}
    if (isMarket) { const t = buildTree(raw, pack, sc, ov); return { ...t, fine: marketFine(t), status: t.rawUnits === 0 ? 'no-sales' : t.gap > 0 ? 'fine' : 'compliant' } }
    return aggregateParent(raw, pack, sc, parent, ov)
  }
  const series = pack.years.map((y) => {
    const b = nodeFor({ ...base, year: y }, false)
    const l = nodeFor({ ...scenario, year: y }, true)
    let req: number | null = null
    for (let s = 0; s <= 95; s += 1) { const a = nodeFor({ ...base, year: y, evSharePct: s }, false); if (a.gap <= 0.0001) { req = s; break } }
    return { year: y, bMetric: b.avgMetric, bLimit: b.limit, bGap: b.gap, bFine: b.fine, bStatus: b.status, bShare: Math.round(b.zlevShare * 100), lMetric: l.avgMetric, lLimit: l.limit, lGap: l.gap, lFine: l.fine, lStatus: l.status, req }
  })
  const cumBase = series.reduce((a, s) => a + s.bFine, 0)
  const cumPlan = series.reduce((a, s) => a + s.lFine, 0)
  const firstBreach = series.find((s) => s.bGap > 0)?.year ?? null
  const peak = Math.max(...series.map((s) => s.bFine))
  const first = series[0], last = series[series.length - 1]
  const limitDropPct = first.bLimit > 0 ? Math.round((1 - last.bLimit / first.bLimit) * 100) : 0
  const reductionNeeded = Math.max(0, last.bMetric - last.bLimit)
  const cliffs = series.map((s, i) => (i > 0 && series[i - 1].bLimit > 0 ? (series[i - 1].bLimit - s.bLimit) / series[i - 1].bLimit : 0))
  const maxDrop = Math.max(...cliffs)
  return { series, cumBase, cumPlan, firstBreach, peak, limitDropPct, reductionNeeded, cliffs, maxDrop }
}

let pass = 0, fail = 0
const mismatches: string[] = []
const eq = (a: unknown, b: unknown) => a === b || (typeof a === 'number' && typeof b === 'number' && a === b)

function compare(tag: string, country: CountryId, target: string, scenario: Scenario, overrides: Record<string, Partial<Scenario>>) {
  const oldR = oldForecast(country, target, scenario, overrides)
  const newR = buildForecast({ raw: data[country], pack: getPack(country), target: target === MARKET ? MARKET_TARGET : target, plan: { base: scenario }, overrides, bandN: 0 })
  const rowFields = ['year', 'bMetric', 'bLimit', 'bGap', 'bFine', 'bStatus', 'bShare', 'lMetric', 'lLimit', 'lGap', 'lFine', 'lStatus', 'req'] as const
  let ok = true
  // per-year rows
  if (oldR.series.length !== newR.years.length) { ok = false; mismatches.push(`${tag}: row count ${oldR.series.length} vs ${newR.years.length}`) }
  for (let i = 0; i < oldR.series.length; i++) {
    for (const f of rowFields) {
      const ov = (oldR.series[i] as any)[f], nv = (newR.years[i] as any)[f]
      if (!eq(ov, nv)) { ok = false; mismatches.push(`${tag}: year[${i}].${f}  old=${ov}  new=${nv}`) }
    }
  }
  // headline KPIs
  const kpis: [string, unknown, unknown][] = [
    ['cumBase', oldR.cumBase, newR.cumBase], ['cumPlan', oldR.cumPlan, newR.cumPlan],
    ['firstBreach', oldR.firstBreach, newR.firstBreach?.year ?? null], ['peak', oldR.peak, newR.peak],
    ['limitDropPct', oldR.limitDropPct, newR.limitDropPct], ['reductionNeeded', oldR.reductionNeeded, newR.reductionNeeded],
    ['maxDrop', oldR.maxDrop, newR.maxDrop],
  ]
  for (const [name, ov, nv] of kpis) if (!eq(ov, nv)) { ok = false; mismatches.push(`${tag}: ${name}  old=${ov}  new=${nv}`) }
  for (let i = 0; i < oldR.cliffs.length; i++) if (!eq(oldR.cliffs[i], newR.cliffs[i])) { ok = false; mismatches.push(`${tag}: cliffs[${i}] old=${oldR.cliffs[i]} new=${newR.cliffs[i]}`) }
  console.log(`${ok ? '✓' : '✗ FAIL'} ${tag}`)
  ok ? pass++ : fail++
}

for (const p of PACK_LIST) {
  const c = p.id
  const makers = [...new Set((data[c] as any[]).map((v) => v.parent))].sort()
  const maker = makers[0]
  // A moved plan that exercises every path: EV lever + mass + sales + a maker override.
  const moved: Scenario = { ...neutral(c), evSharePct: 40, massShiftKg: 50, salesMultiplier: 1.1 }
  const overrides = { [maker]: { evSharePct: 60, massShiftKg: -30 } as Partial<Scenario> }

  compare(`${c} · market · baseline`, c, MARKET, neutral(c), {})
  compare(`${c} · market · moved+override`, c, MARKET, moved, overrides)
  compare(`${c} · ${maker} · baseline`, c, maker, neutral(c), {})
  compare(`${c} · ${maker} · moved+override`, c, maker, moved, overrides)
}

console.log(`\n${pass} passed · ${fail} failed`)
if (fail) { console.log('\nMismatches:\n' + mismatches.slice(0, 40).join('\n')); process.exit(1) }
