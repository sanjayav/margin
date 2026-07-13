// Outlook engine verification — the invariants a Big-4 reviewer would test:
//   · adoption S-curve: endpoints, monotonicity, statutory floor (UK VETS)
//   · bridge: the four effects SUM to the YoY total (residual ≈ 0), every year
//   · outlook beats hold-flat: adoption+tech reduce the final-year market fine
//   · break-even: the returned share actually zeroes the fine; monotonic
//   · two-way grid: fine falls monotonically along both axes
//   · IN backtest: outlook seeded from 2025 actuals lands near 2026 actuals
//   esbuild scripts/check-outlook.ts --bundle --platform=node --format=esm --outfile=node_modules/.cache/co.mjs && node node_modules/.cache/co.mjs
import { getPack } from '../src/engine/rulepacks/index.js'
import { buildTree } from '../src/engine/engine.js'
import { baselineScenario, buildForecast, MARKET_TARGET } from '../src/engine/forecast.js'
import {
  DRIVER_DEFAULTS, adoptionShare, mandateFloor, outlookRun, bridgeYear,
  twoWay, breakEvenAdoption, outlookBaseYear, type OutlookConfig,
} from '../src/engine/outlook.js'
import fleet from '../src/data/fleet_data.js'
import type { CountryId, Vehicle } from '../src/engine/types.js'

const data = fleet as unknown as Record<CountryId, Vehicle[]>
let pass = 0, fail = 0
const check = (n: string, c: boolean, d = '') => { console.log(`${c ? '✓' : '✗ FAIL'} ${n}${d ? ' — ' + d : ''}`); c ? pass++ : fail++ }
const VINTAGE = 2026

const marketFine = (rows: Vehicle[], pack: ReturnType<typeof getPack>, sc: ReturnType<typeof baselineScenario>) => {
  const t = buildTree(rows, pack, sc, {})
  return (t.children ?? []).reduce((a, c) => a + c.fine, 0)
}

// ── 1 · adoption curve fundamentals ─────────────────────────────────────────
{
  const shares = Array.from({ length: 6 }, (_, i) => adoptionShare(20, 60, i, 6))
  check('S-curve starts at today\'s share', Math.abs(shares[0] - 20) < 1e-9, shares[0].toFixed(2))
  check('S-curve ends at the horizon share', Math.abs(shares[5] - 60) < 1e-9, shares[5].toFixed(2))
  check('S-curve is monotonic', shares.every((v, i) => i === 0 || v >= shares[i - 1]))
  check('adoption never runs backwards (horizon below today)', adoptionShare(40, 20, 3, 6) >= 40)
  const uk = getPack('UK')
  const floors = uk.years.map((y) => mandateFloor(uk, y)!)
  check('UK mandate floor rises with the ZEV trajectory', floors.every((f, i) => i === 0 || f >= floors[i - 1]), floors.map((f) => f.toFixed(0)).join('→'))
  const s0 = 15
  const curveOk = uk.years.every((y, i) => adoptionShare(s0, DRIVER_DEFAULTS.UK.evShareHorizon, i, uk.years.length, mandateFloor(uk, y)) >= floors[i] - 1e-9)
  check('UK outlook adoption respects the statutory floor every year', curveOk)
  check('EU/IN/AU have no mandate floor (CO₂/FC-line regimes)', mandateFloor(getPack('EU'), 2027) == null && mandateFloor(getPack('IN'), 2028) == null && mandateFloor(getPack('AU'), 2027) == null)
}

// ── 2 · bridge invariant: effects sum to the YoY total, every market/year ───
for (const id of ['EU', 'IN', 'AU', 'UK'] as CountryId[]) {
  const pack = getPack(id)
  const cfg: OutlookConfig = { raw: data[id], pack, drivers: DRIVER_DEFAULTS[id], vintageYear: VINTAGE }
  let worst = 0
  for (const y of pack.years.slice(1)) {
    const b = bridgeYear(cfg, y)!
    const tol = Math.max(1, Math.abs(b.to) * 1e-6, Math.abs(b.from) * 1e-6)
    worst = Math.max(worst, Math.abs(b.residual) / Math.max(tol, 1))
    if (Math.abs(b.residual) > tol) { check(`${id} bridge ${y} residual ≈ 0`, false, `${b.residual}`); }
  }
  check(`${id}: bridge effects sum to the total across all years`, worst <= 1, `worst residual ratio ${worst.toFixed(3)}`)
}

// ── 3 · the outlook is a real forecast: beats hold-flat where fines exist ───
for (const id of ['EU', 'IN'] as CountryId[]) {
  const pack = getPack(id)
  const run = outlookRun({ raw: data[id], pack, drivers: DRIVER_DEFAULTS[id], vintageYear: VINTAGE })
  const finalYear = pack.years[pack.years.length - 1]
  const holdFlat = marketFine(data[id], pack, { ...baselineScenario(pack), year: finalYear })
  const outlook = marketFine(run.fleetForYear(finalYear), pack, run.scenarioFor(finalYear))
  check(`${id}: outlook ${finalYear} fine ≤ hold-flat (adoption+tech work)`, outlook <= holdFlat + 1, `${Math.round(outlook)} vs ${Math.round(holdFlat)}`)
}

// ── 4 · break-even actually breaks even, and the grid is monotonic ──────────
{
  const pack = getPack('EU')
  const cfg: OutlookConfig = { raw: data.EU, pack, drivers: DRIVER_DEFAULTS.EU, vintageYear: VINTAGE }
  const fy = pack.years[pack.years.length - 1]
  const be = breakEvenAdoption(cfg, fy)
  if (be != null && be > 0) {
    const run = outlookRun({ ...cfg, drivers: { ...cfg.drivers, evShareHorizon: be } })
    const fineAtBe = marketFine(run.fleetForYear(fy), pack, run.scenarioFor(fy))
    const runBelow = outlookRun({ ...cfg, drivers: { ...cfg.drivers, evShareHorizon: Math.max(0, be - 5) } })
    const fineBelow = marketFine(runBelow.fleetForYear(fy), pack, runBelow.scenarioFor(fy))
    check('EU break-even share zeroes the final-year fine', fineAtBe <= 1, `${fineAtBe.toFixed(2)} at ${be}%`)
    check('5pp below break-even still fines', fineBelow > 1, `${Math.round(fineBelow)}`)
  } else {
    check('EU break-even resolves', be != null, String(be))
  }
  const grid = twoWay(cfg, 'evShareHorizon', 'iceCo2Improve', [35, 45, 55, 65, 75], [0.5, 1, 1.5, 2, 2.5], fy)
  const rowsMono = grid.every((row) => row.every((c, i) => i === 0 || c.fine <= row[i - 1].fine + 1))
  const colsMono = grid[0].every((_, ci) => grid.every((row, ri) => ri === 0 || row[ci].fine <= grid[ri - 1][ci].fine + 1))
  check('two-way grid: fine falls with tech improvement (rows)', rowsMono)
  check('two-way grid: fine falls with adoption (cols)', colsMono)
}

// ── 5 · outlook plugs into buildForecast (fleetForYear hook) ─────────────────
{
  const pack = getPack('EU')
  const run = outlookRun({ raw: data.EU, pack, drivers: DRIVER_DEFAULTS.EU, vintageYear: VINTAGE })
  const perYear: Record<number, { evSharePct: number }> = {}
  for (const y of pack.years) perYear[y] = { evSharePct: run.shareFor(y) }
  const fc = buildForecast({ raw: data.EU, pack, target: MARKET_TARGET, plan: { base: baselineScenario(pack), perYear }, glide: false, bandN: 0, fleetForYear: run.fleetForYear })
  check('buildForecast runs the outlook fleet (plan ≠ baseline)', fc.years.some((y) => Math.abs(y.lMetric - y.bMetric) > 0.1))
  check('outlook cumulative ≤ hold-flat cumulative', fc.cumPlan <= fc.cumBase + 1, `${Math.round(fc.cumPlan)} vs ${Math.round(fc.cumBase)}`)
}

// ── 6 · IN backtest: 2025-seeded outlook vs the 2026 actuals ─────────────────
{
  const pack = getPack('IN')
  const rows = data.IN
  const both = ['MG Motor', 'Skoda Auto Volkswagen India Private Limited'] // makers with real rows in BOTH years
  const sub = (y: number) => rows.filter((v) => v.year === y && both.includes(v.parent))
  const wavg = (vs: Vehicle[]) => vs.reduce((a, v) => a + v.co2 * v.sales, 0) / Math.max(1, vs.reduce((a, v) => a + v.sales, 0))
  // seed from 2025 only (vintage 2025), step one year with default drivers
  const seed = sub(2025)
  const run = outlookRun({ raw: seed, pack, drivers: DRIVER_DEFAULTS.IN, vintageYear: 2025 })
  const predicted = run.fleetForYear(2026)
  const predCo2 = wavg(predicted)
  const actualCo2 = wavg(sub(2026))
  const errPct = Math.abs(predCo2 - actualCo2) / actualCo2 * 100
  check('IN backtest: 2025-seeded 2026 fleet CO₂ within 15% of actual', errPct <= 15, `predicted ${predCo2.toFixed(1)} vs actual ${actualCo2.toFixed(1)} g/km (${errPct.toFixed(1)}% err)`)
  check('IN backtest: base year picked = 2025', outlookBaseYear(seed, pack, 2025) === 2025)
}

console.log(`\n${pass} passed · ${fail} failed`)
if (fail) process.exit(1)
