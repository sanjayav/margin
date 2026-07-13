// Verifies the deterministic half of /api/forecast: the AI's structured output
// (a ForecastScenarioDef) → materializeSpec → buildForecast → summariseForecast.
// Uses hand-authored defs that stand in for what Claude's Pass A emits, so the
// engine/wire round-trip is proven without needing an API key. Run:
//   esbuild scripts/forecast-api-check.ts --bundle --platform=node --format=esm --outfile=node_modules/.cache/fac.mjs && node node_modules/.cache/fac.mjs
import { getPack } from '../src/engine/rulepacks/index.js'
import {
  buildForecast, materializeSpec, summariseForecast, scenarioForYear, baselineScenario, MARKET_TARGET,
  type ForecastScenarioDef,
} from '../src/engine/forecast.js'
import fleet from '../src/data/fleet_data.js'
import type { CountryId } from '../src/engine/types.js'

const data = fleet as Record<CountryId, any>
let pass = 0, fail = 0
const check = (name: string, cond: boolean, detail = '') => { console.log(`${cond ? '✓' : '✗ FAIL'} ${name}${detail ? ' — ' + detail : ''}`); cond ? pass++ : fail++ }
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps

const country: CountryId = 'EU'
const pack = getPack(country)
const raw = data[country]
const base = baselineScenario(pack)
const years = pack.years
const maker = [...new Set((raw as any[]).map((v) => v.parent))].sort()[0]

const def = (over: Partial<ForecastScenarioDef['levers']>, id = 'x'): ForecastScenarioDef => ({
  id, name: id, description: '',
  levers: { evSharePct: null, salesMultiplier: null, massShiftKg: null, ecoBoostG: null, targetShiftPct: null, poolingEnabled: null, superCreditsEnabled: null, phevUF: null, creditPrice: null, ...over },
})

// 1. Ramp interpolation: evSharePct {from:20,to:60} hits the endpoints and a sane midpoint.
{
  const spec = materializeSpec(def({ evSharePct: { from: 20, to: 60 } }), base, years)
  const first = spec.perYear![years[0]].evSharePct
  const last = spec.perYear![years[years.length - 1]].evSharePct
  const mid = spec.perYear![years[Math.floor(years.length / 2)]].evSharePct as number
  check('ramp start = 20', first === 20, `${first}`)
  check('ramp end = 60', last === 60, `${last}`)
  check('ramp midpoint between 20 and 60', mid > 20 && mid < 60, `${mid}`)
}

// 2. Null levers fall through to the baseline (all-null def ⇒ plan == baseline).
{
  const spec = materializeSpec(def({}), base, years)
  const fc = buildForecast({ raw, pack, target: maker, baseline: base, plan: spec, overrides: {}, bandN: 0 })
  const allEqual = fc.years.every((y) => near(y.lMetric, y.bMetric) && near(y.lFine, y.bFine) && near(y.lLimit, y.bLimit))
  check('all-null scenario reproduces the baseline exactly', allEqual)
}

// 3. A lever set to null must NOT be written into perYear (so the engine sees as-sold).
{
  const spec = materializeSpec(def({ massShiftKg: 40 }), base, years)
  const p = spec.perYear![years[0]]
  check('null evSharePct is omitted (stays as-sold)', !('evSharePct' in p))
  check('non-null massShiftKg is applied', p.massShiftKg === 40, `${p.massShiftKg}`)
}

// 4. The EV lever actually bites end-to-end: aggressive EV ⇒ lower final metric than modest.
{
  const aggressive = buildForecast({ raw, pack, target: maker, baseline: base, plan: materializeSpec(def({ evSharePct: { from: 40, to: 75 } }), base, years), overrides: {}, bandN: 0 })
  const modest = buildForecast({ raw, pack, target: maker, baseline: base, plan: materializeSpec(def({ evSharePct: { from: 20, to: 30 } }), base, years), overrides: {}, bandN: 0 })
  check('aggressive EV lowers the final-year fleet metric vs modest', aggressive.last.lMetric < modest.last.lMetric - 0.5,
    `${aggressive.last.lMetric.toFixed(1)} < ${modest.last.lMetric.toFixed(1)}`)
  check('aggressive EV cumulative fine ≤ modest', aggressive.cumPlan <= modest.cumPlan)
}

// 5. summariseForecast fields are internally consistent with the trajectory.
{
  const spec = materializeSpec(def({ evSharePct: { from: 15, to: 25 } }), base, years) // deliberately low → likely breaches
  const fc = buildForecast({ raw, pack, target: maker, baseline: base, plan: spec, overrides: {}, bandN: 0 })
  const s = summariseForecast(fc)
  const firstOver = fc.years.find((y) => y.lGap > 0)?.year ?? null
  check('summary.firstBreachYear matches first lGap>0', s.firstBreachYear === firstOver, `${s.firstBreachYear} vs ${firstOver}`)
  check('summary.cumExposure = Σ plan fines', near(s.cumExposure, fc.years.reduce((a, y) => a + y.lFine, 0), 1e-3))
  check('summary.finalGap = last-year plan gap', near(s.finalGap, fc.last.lGap))
  check('summary.peakFine = max plan fine', near(s.peakFine, Math.max(...fc.years.map((y) => y.lFine))))
}

// 6. Market target works (Σ per-maker fines) and per-year ramp is honoured there too.
{
  const spec = materializeSpec(def({ evSharePct: { from: 25, to: 55 }, salesMultiplier: { from: 1, to: 1.1 } }), base, years)
  const fc = buildForecast({ raw, pack, target: MARKET_TARGET, baseline: base, plan: spec, overrides: {}, bandN: 0 })
  check('market forecast produces a full horizon', fc.years.length === years.length)
  check('market cumulative exposure is finite & ≥ 0', Number.isFinite(fc.cumPlan) && fc.cumPlan >= 0, `${Math.round(fc.cumPlan)}`)
}

// 7. scenarioForYear precedence: perYear wins over ramp wins over base, year pinned.
{
  const spec = { base, ramp: () => ({ evSharePct: 30 }), perYear: { [years[1]]: { evSharePct: 99 } } }
  const y0 = scenarioForYear(spec, years[0], 0, years)
  const y1 = scenarioForYear(spec, years[1], 1, years)
  check('ramp applies where no perYear override', y0.evSharePct === 30, `${y0.evSharePct}`)
  check('perYear overrides the ramp', y1.evSharePct === 99, `${y1.evSharePct}`)
  check('year is always pinned to the projected year', y1.year === years[1])
}

console.log(`\n${pass} passed · ${fail} failed`)
if (fail) process.exit(1)
