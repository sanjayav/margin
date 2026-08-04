// India end-to-end check — DEMO DATA_SHARED era (the only India source, 2026-08-05):
// 5 compliance entities, FY2025-26 complete actual + FY2026-27 3-month YTD
// part-year, then the makers' OWN plan for FY2027-28 → FY2032-33 (read as
// given — no horizon replication).
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

const MAKERS = ['Build Your Dreams', 'Honda Cars India Limited', 'MG Motor', 'Skoda Auto Volkswagen India Private Limited', 'Toyota Kirloskar Motor Pvt. Ltd']
const units = (y: number) => IN.filter((v) => v.year === y).reduce((a, v) => a + v.sales, 0)
console.log('IN fleet spans', Math.min(...IN.map((v) => v.year)), '→', Math.max(...IN.map((v) => v.year)), `(${IN.length} rows)\n`)

// ── source of truth: ONLY DEMO DATA_SHARED ───────────────────────────────────
check('year strip covers 2025–2032', JSON.stringify(pack.years) === JSON.stringify([2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032]))
check('workspace opens on CAFE III (2027)', pack.defaultYear === 2027)
const makers = [...new Set(IN.map((v) => v.parent))].sort()
check('exactly the 5 workbook makers — every earlier India source deleted', JSON.stringify(makers) === JSON.stringify(MAKERS), makers.join(' · '))
check('no rows survive from the old 12-OEM extract', !IN.some((v) => /Maruti|Tata|Mahindra|Hyundai|KIA|FCA|Renault|Nissan/i.test(v.parent)))
for (const y of [2025, 2026, 2027, 2031, 2032]) {
  const m = new Set(IN.filter((v) => v.year === y).map((v) => v.parent))
  check(`${y}: all five makers present`, m.size === 5, `${m.size}`)
}

// ── the plan years are REAL data, not a replay of a base year ────────────────
{
  const sig = (y: number) => IN.filter((v) => v.year === y).map((v) => `${v.parent}|${v.model}|${v.sales}|${v.co2}`).sort().join(';')
  check('2028 is not a copy of 2027', sig(2027) !== sig(2028))
  check('2032 is not a copy of 2031', sig(2031) !== sig(2032))
  const yrs = [2027, 2028, 2029, 2030, 2031, 2032]
  check('plan volume rises every year (the makers own growth curve)',
    yrs.every((y, i) => i === 0 || units(y) > units(yrs[i - 1])),
    yrs.map((y) => `${y}:${(units(y) / 1000).toFixed(0)}k`).join(' '))
  check('plan CO₂ falls every year (the makers own decarb curve)', (() => {
    const avg = (y: number) => { const r = IN.filter((v) => v.year === y); return r.reduce((a, v) => a + v.sales * v.co2, 0) / r.reduce((a, v) => a + v.sales, 0) }
    return yrs.every((y, i) => i === 0 || avg(y) < avg(yrs[i - 1]))
  })())
  check("plan years tagged 'Baseline projection' (tellable in Data/exports)", yrs.every((y) => IN.filter((v) => v.year === y).every((v: any) => v.scenario === 'Baseline projection')))
  check('actual years tagged Base', [2025, 2026].every((y) => IN.filter((v) => v.year === y).every((v: any) => v.scenario === 'Base')))
  check('fiscal labels track the year', IN.every((v: any) => v.fyLabel === `FY ${v.year}-${(v.year + 1) % 100}`))
}

// ── the 2026 part-year is carried as recorded AND flagged ───────────────────
{
  const y26 = IN.filter((v) => v.year === 2026)
  check('2026 rows carry monthsRecorded=3 (3-month YTD pull)', y26.every((v: any) => v.monthsRecorded === 3), `${y26.filter((v: any) => v.monthsRecorded === 3).length}/${y26.length}`)
  check('no other year is flagged part-year', IN.filter((v) => v.year !== 2026).every((v: any) => v.monthsRecorded == null))
  check('2026 volume is materially below 2025 (a quarter, not a year)', units(2026) < units(2025) * 0.4, `${units(2026).toLocaleString()} vs ${units(2025).toLocaleString()}`)
  // the point of carrying it verbatim: the weighted average is volume-invariant
  const a25 = aggregateParent(IN, pack, base(2025), 'MG Motor')
  const a26 = aggregateParent(IN, pack, base(2026), 'MG Motor')
  check('part-year still yields a finite, sane metric (average is volume-invariant)', Number.isFinite(a26.avgMetric) && a26.avgMetric >= 0, `2025 ${a25.avgMetric.toFixed(2)} · 2026 ${a26.avgMetric.toFixed(2)} L/100km`)
}

// ── BYD: a brand total with no model split is carried, not dropped ──────────
{
  const byd = IN.filter((v) => v.parent === 'Build Your Dreams')
  const bt = byd.filter((v: any) => v.salesBasis)
  check('BYD 2025/26 brand totals carried as self-describing rows', bt.length === 2, bt.map((v) => `${v.year}:${v.sales}`).join(' '))
  check('…totalling the workbook figures (6,170 + 2,964)', bt.reduce((a, v) => a + v.sales, 0) === 6170 + 2964)
  check('…labelled so no per-model figure is implied', bt.every((v) => /brand total/i.test(v.model)))
  check('BYD is all-BEV in every year (so the split cannot change its metric)', byd.every((v) => v.co2 === 0))
}

// ── month-by-month compliance ───────────────────────────────────────────────
// Registrations file monthly, so Plan answers "where do we stand" before the
// year closes. The YTD reading must be the real compliance position: a running
// sales-weighted average that lands EXACTLY on the annual figure when the year
// is fully filed. Anything else would be a second, disagreeing number.
{
  const { monthlyCompliance, aggregate, applyScenario } = await import('../src/engine/engine.js')
  check('India CAFE year starts in April (fiscal, not calendar)', pack.fiscalYearStartMonth === 4)

  const withM = (y: number) => IN.filter((v) => v.year === y && v.monthly?.length)
  check('2025 files 12 months · 2026 files 3 · plan years file none',
    withM(2025).every((v) => v.monthly!.length === 12) && withM(2025).length > 0 &&
    withM(2026).every((v) => v.monthly!.length === 3) && withM(2026).length > 0 &&
    [2027, 2030, 2032].every((y) => withM(y).length === 0),
    `2025:${withM(2025).length} rows · 2026:${withM(2026).length} rows`)
  check('every monthly split sums back to the annual volume',
    IN.filter((v) => v.monthly?.length).every((v) => v.monthly!.reduce((a, b) => a + b, 0) === v.sales))
  check('a zero inside the reported window is a real zero-sales month, not a gap',
    IN.some((v) => v.monthly?.some((x) => x === 0) && v.monthly!.reduce((a, b) => a + b, 0) === v.sales))

  for (const y of [2025, 2026]) {
    const mc = monthlyCompliance(IN, pack, base(y))
    const rows = withM(y)
    const ann = aggregate(applyScenario(rows, base(y), pack, {}), pack, base(y), 'y', 'fleet', 'y')
    const last = mc[mc.length - 1]
    check(`${y} · ${mc.length} months returned`, mc.length === (y === 2025 ? 12 : 3), `${mc.length}`)
    check(`${y} · final YTD metric IS the annual figure (no second number)`,
      Math.abs(last.ytdMetric - ann.avgMetric) < 1e-9, `${last.ytdMetric.toFixed(4)} vs ${ann.avgMetric.toFixed(4)}`)
    check(`${y} · final YTD limit matches the annual limit`, Math.abs(last.ytdLimit - ann.limit) < 1e-9)
    check(`${y} · final YTD units match the annual volume of those rows`, last.ytdUnits === ann.rawUnits, `${last.ytdUnits.toLocaleString()}`)
    check(`${y} · YTD units are the running sum of the monthly units`,
      mc.every((p, i) => p.ytdUnits === mc.slice(0, i + 1).reduce((a, q) => a + q.units, 0)))
    check(`${y} · months run Apr → ${y === 2025 ? 'Mar' : 'Jun'} (fiscal order)`,
      mc[0].label === 'Apr' && mc[mc.length - 1].label === (y === 2025 ? 'Mar' : 'Jun'),
      mc.map((p) => p.label).join(' '))
    check(`${y} · the fiscal year straddles two calendar years correctly`,
      mc.every((p) => p.calendarYear === (p.month <= 9 ? y : y + 1)),
      `${mc[0].label} ${mc[0].calendarYear} → ${mc[mc.length - 1].label} ${mc[mc.length - 1].calendarYear}`)
    check(`${y} · every month carries its own limit and a finite metric`,
      mc.every((p) => p.limit > 0 && Number.isFinite(p.metric) && p.metric >= 0))
  }

  // the month on its own must be a DIFFERENT reading from the YTD, otherwise
  // the chart is drawing one line twice
  {
    const mc = monthlyCompliance(IN, pack, base(2026))
    check('the month-alone reading differs from the YTD (two real signals)',
      mc.some((p) => Math.abs(p.metric - p.ytdMetric) > 0.01),
      mc.map((p) => `${p.label} ${p.metric.toFixed(2)}/${p.ytdMetric.toFixed(2)}`).join(' · '))
    check('a good month pulls the YTD toward the line', mc[1].metric < mc[0].metric && mc[1].ytdGap < mc[0].ytdGap,
      `May ${mc[1].metric.toFixed(2)} vs Apr ${mc[0].metric.toFixed(2)} → YTD gap ${mc[0].ytdGap.toFixed(2)} → ${mc[1].ytdGap.toFixed(2)}`)
  }

  // scoping: the monthly view is fed node.vehicles, so a maker must work too
  {
    const mg = IN.filter((v) => v.parent === 'MG Motor')
    const mc = monthlyCompliance(mg, pack, base(2025))
    const ann = aggregateParent(IN, pack, base(2025), 'MG Motor')
    const rows = mg.filter((v) => v.year === 2025 && v.monthly?.length)
    const annOfRows = aggregate(applyScenario(rows, base(2025), pack, {}), pack, base(2025), 'y', 'fleet', 'y')
    check('scopes to a single maker', mc.length === 12 && Math.abs(mc[11].ytdMetric - annOfRows.avgMetric) < 1e-9,
      `MG YTD ${mc[11].ytdMetric.toFixed(3)} · maker annual ${ann.avgMetric.toFixed(3)}`)
  }
  check('a year with no monthly filing returns nothing to draw', monthlyCompliance(IN, pack, base(2030)).length === 0)
  check('hypothetical variants never enter the monthly view (they would count 12×)', (() => {
    const ev: Vehicle = { parent: 'MG Motor', pool: '', brand: 'MG', make: 'MG', model: 'Probe', year: 2025, powertrain: 'BEV', fuel: 'Electric', co2: 0, mass: 1500, sales: 500000, vclass: 'Passenger car' }
    const a = monthlyCompliance(IN, pack, base(2025))
    const b = monthlyCompliance(IN, pack, { ...base(2025), extraVariants: [ev] })
    return a[11].ytdUnits === b[11].ytdUnits && Math.abs(a[11].ytdMetric - b[11].ytdMetric) < 1e-9
  })())
}

// ── Plan's month scope ──────────────────────────────────────────────────────
// Picking a month rescopes the WHOLE screen (verdict, stats, chart, scoreboard)
// because they all derive from the same rows. The scoped tree must therefore
// agree exactly with the month-by-month panel beside it, or the screen shows
// two numbers for one thing.
{
  const { scopeToMonth, unscopedVolume, monthsFiled, monthlyCompliance, buildTree } = await import('../src/engine/engine.js')
  check('months filed: 2025 → 12 · 2026 → 3 · plan years → 0',
    monthsFiled(IN, 2025) === 12 && monthsFiled(IN, 2026) === 3 && monthsFiled(IN, 2030) === 0)
  check('no month scope leaves the fleet untouched',
    scopeToMonth(IN, 2026, { through: null, mode: 'ytd' }) === IN)

  for (const y of [2025, 2026] as const) {
    const mc = monthlyCompliance(IN, pack, base(y))
    const filed = monthsFiled(IN, y)
    let agree = true
    for (const mode of ['ytd', 'month'] as const)
      for (let t = 1; t <= filed; t++) {
        const tr = buildTree(scopeToMonth(IN, y, { through: t, mode }), pack, base(y), {})
        const ref = mode === 'ytd' ? mc[t - 1].ytdMetric : mc[t - 1].metric
        const refU = mode === 'ytd' ? mc[t - 1].ytdUnits : mc[t - 1].units
        const refL = mode === 'ytd' ? mc[t - 1].ytdLimit : mc[t - 1].limit
        if (Math.abs(tr.avgMetric - ref) > 1e-9 || tr.rawUnits !== refU || Math.abs(tr.limit - refL) > 1e-9) agree = false
      }
    check(`${y} · every scoped reading agrees with the monthly panel (${filed * 2} combinations)`, agree)
  }

  // a month-scoped screen must never carry annual-only volume into one month
  check('rows with no monthly split are excluded, not held at their annual volume', (() => {
    const sc = scopeToMonth(IN, 2025, { through: 1, mode: 'month' })
    return !sc.some((v) => v.year === 2025 && v.salesBasis)
  })())
  check('…and the excluded volume is reported so it is not silently lost',
    unscopedVolume(IN, 2025, { through: 1, mode: 'ytd' }) === 6170 &&
    unscopedVolume(IN, 2026, { through: 1, mode: 'ytd' }) === 2964,
    `2025 ${unscopedVolume(IN, 2025, { through: 1, mode: 'ytd' })} · 2026 ${unscopedVolume(IN, 2026, { through: 1, mode: 'ytd' })}`)
  check('full-year scope reports nothing excluded', unscopedVolume(IN, 2025, { through: null, mode: 'ytd' }) === 0)

  // YTD through the last filed month == that year's fleet minus the annual-only rows
  {
    const t = buildTree(scopeToMonth(IN, 2026, { through: 3, mode: 'ytd' }), pack, base(2026), {})
    const whole = buildTree(IN, pack, base(2026), {})
    check('YTD through the final filed month + the annual-only rows = the whole year',
      t.rawUnits + unscopedVolume(IN, 2026, { through: 3, mode: 'ytd' }) === whole.rawUnits,
      `${t.rawUnits.toLocaleString()} + 2,964 = ${whole.rawUnits.toLocaleString()}`)
  }
  check('a single month is never larger than the YTD that contains it',
    [1, 2, 3].every((t) => {
      const m = buildTree(scopeToMonth(IN, 2026, { through: t, mode: 'month' }), pack, base(2026), {}).rawUnits
      const c = buildTree(scopeToMonth(IN, 2026, { through: t, mode: 'ytd' }), pack, base(2026), {}).rawUnits
      return m <= c
    }))
  check('scoping a year with no monthly filing yields nothing rather than the whole year',
    scopeToMonth(IN, 2030, { through: 1, mode: 'ytd' }).filter((v) => v.year === 2030).length === 0)
}

// ── parallel powertrain launches ────────────────────────────────────────────
// 5 models are offered by the source as mutually-exclusive launches (each
// powertrain family listed at the FULL model volume). The row must ship as the
// conservative option and the alternatives must be switchable, never blended
// by default — a blend is an average of futures, not an achievable one.
{
  const { applyScenario } = await import('../src/engine/engine.js')
  const opt = IN.filter((v) => v.powertrainOptions?.length)
  const models = new Set(opt.map((v) => v.model))
  check('parallel-launch rows carry their alternatives', opt.length === 25, `${opt.length} rows · ${models.size} models`)
  check('…exactly the 5 models the source leaves undecided', models.size === 5, [...models].join(' · '))
  check('…options sorted richest-CO₂ first', opt.every((v) => v.powertrainOptions!.every((o, i, a) => i === 0 || a[i - 1].co2 >= o.co2)))
  check('…every option is a real family, never a synthetic average', opt.every((v) => v.powertrainOptions!.length >= 2))
  check('shipped row = the conservative (highest-CO₂) option', opt.every((v) => v.co2 === v.powertrainOptions![0].co2 && v.powertrain === v.powertrainOptions![0].powertrain))
  check('no clean-tech credit is booked by default', opt.every((v) => v.powertrain !== 'BEV'))

  const mg = (mode: any) => {
    const rows = applyScenario(IN, { ...base(2030), powertrainOptionMode: mode }, pack, {})
    return rows.find((v) => v.model.startsWith('Astor / ZS EV'))!
  }
  const con = mg('conservative'), ele = mg('electrified'), bl = mg('blended')
  check('lever · conservative = the petrol launch', con.co2 === 152.6 && con.powertrain === 'ICE', `${con.co2} g/km`)
  check('lever · electrified = the BEV launch', ele.co2 === 0 && ele.powertrain === 'BEV', `${ele.co2} g/km ${ele.powertrain}`)
  check('lever · blended sits between the two', bl.co2 > ele.co2 && bl.co2 < con.co2, `${bl.co2.toFixed(1)} g/km`)
  check('lever · switching never changes volume', con.sales === ele.sales && ele.sales === bl.sales, `${con.sales.toLocaleString()}`)
  check('lever · the electrified launch takes its BEV battery', (ele.battery ?? 0) > 0 && !ele.battery === false, `${ele.battery} kWh`)
  check('lever · the combustion launch carries no battery', con.battery == null)

  const m = (mode: any) => aggregateParent(IN, pack, { ...base(2030), powertrainOptionMode: mode }, 'MG Motor').avgMetric
  check('lever moves the compliance metric the right way', m('electrified') < m('blended') && m('blended') < m('conservative'),
    `elec ${m('electrified').toFixed(3)} < blend ${m('blended').toFixed(3)} < cons ${m('conservative').toFixed(3)} L/100km`)
  // Regression: a pinned powertrain mix used to silently invert this lever —
  // switching the models to BEV made the mix reweighting shrink them back to
  // its BEV share, so "electrified" read WORSE than "combustion". An explicit
  // choice is now pinned, the same doctrine hypothetical variants follow.
  {
    const mix = { ICE: 75, MHEV: 20, BEV: 4, 'Strong Hybrid': 1 }
    for (const [label, m] of [['as-sold mix', null], ['pinned custom mix', mix]] as const) {
      const at = (mode: any) => buildTree(IN, pack, { ...base(2030), mix: m, powertrainOptionMode: mode }, {}).avgMetric
      const c = at('conservative'), e = at('electrified'), b = at('blended')
      check(`lever direction holds under a ${label}`, e < c && b < c && b > e,
        `elec ${e.toFixed(3)} < blend ${b.toFixed(3)} < cons ${c.toFixed(3)}`)
    }
  }
  check('rows without options are untouched by the lever', (() => {
    const a = applyScenario(IN, { ...base(2030), powertrainOptionMode: 'electrified' }, pack, {}).filter((v) => !v.powertrainOptions?.length)
    const b = applyScenario(IN, { ...base(2030), powertrainOptionMode: 'conservative' }, pack, {}).filter((v) => !v.powertrainOptions?.length)
    return a.every((v, i) => v.co2 === b[i].co2 && v.powertrain === b[i].powertrain && v.sales === b[i].sales)
  })())
}

// ── CNF discounts ───────────────────────────────────────────────────────────
// KNOWN DEFECT (pre-dates this data swap — reproduced on HEAD 31b66fd, where
// all 721 old India rows carried cnf:0 too). The pack reads
//     let cnf = ... (v.cnf ?? autoCnf(v.fuel))
// so autoCnf() only fires when a row carries NO cnf. Every India ingest writes
// an explicit "cnf": 0, and `0 ?? x` is 0 — so the E20/CNG/flex discounts and
// the cnfEnabled lever have been inert for the whole market.
//   Fix: drop the `"cnf": 0` line from scripts/ingest-india-demo.py and re-run.
//   Not applied here: switching it on lowers every petrol maker's metric ~8%
//   and would change compliance verdicts, which is a product call, not a data
//   swap. These checks pin the CURRENT behaviour so the fix is a visible,
//   deliberate change rather than a silent drift.
{
  const SKODA = 'Skoda Auto Volkswagen India Private Limited'
  const on = aggregateParent(IN, pack, { ...base(2027), cnfEnabled: true }, SKODA)
  const off = aggregateParent(IN, pack, { ...base(2027), cnfEnabled: false }, SKODA)
  const inert = Math.abs(on.avgMetric - off.avgMetric) < 1e-9
  check('CNF lever is currently INERT — known defect, every row carries cnf:0', inert, `${on.avgMetric.toFixed(3)} vs ${off.avgMetric.toFixed(3)} · see the comment above this check`)
  check('every India row carries the explicit cnf:0 that causes it', IN.every((v) => v.cnf === 0))
  const on2 = aggregateParent(IN, pack, { ...base(2026), cnfEnabled: true }, SKODA)
  const off2 = aggregateParent(IN, pack, { ...base(2026), cnfEnabled: false }, SKODA)
  check('CAFE II: CNF inert by design (mechanism starts FY2027-28)', Math.abs(on2.avgMetric - off2.avgMetric) < 1e-9)
}

// ── the regime boundary and the beyond-draft year ───────────────────────────
{
  check('2026 is CAFE II', pack.regimeFor?.(2026)?.name === 'CAFE II')
  check('2027 is CAFE III (draft)', pack.regimeFor?.(2027)?.name === 'CAFE III' && pack.regimeFor?.(2027)?.draft === true)
  check('2032 is flagged as sitting beyond the drafted schedule', /beyond draft/i.test(pack.regimeFor?.(2032)?.name ?? ''), pack.regimeFor?.(2032)?.name)
  const lim = (y: number) => aggregateParent(IN, pack, base(y), 'MG Motor').limit
  // same fleet mass would give the same line; compare the constant instead by
  // holding mass fixed through the forecast hook
  check('2032 holds the FY2031-32 target constant flat', Math.abs((pack.forecast?.(2032)?.limit ?? 0) - (pack.forecast?.(2031)?.limit ?? -1)) < 1e-9,
    `${pack.forecast?.(2031)?.limit.toFixed(4)} → ${pack.forecast?.(2032)?.limit.toFixed(4)}`)
  check('the CAFE III line genuinely tightens 2027→2031', (pack.forecast?.(2027)?.limit ?? 0) > (pack.forecast?.(2031)?.limit ?? 0))
  check('every year yields a positive limit', pack.years.every((y) => lim(y) > 0))
}

// ── compliance computes sensibly across both regimes ─────────────────────────
console.log('\nPer maker-year compliance (engine):')
for (const year of pack.years) {
  for (const p of MAKERS) {
    const a = aggregateParent(IN, pack, base(year), p)
    if (a.rawUnits === 0) continue
    const regime = pack.regimeFor?.(year)?.name
    console.log(`  ${year} ${(regime ?? '').padEnd(24)} ${p.slice(0, 34).padEnd(34)} perf=${a.avgMetric.toFixed(2)} limit=${a.limit.toFixed(2)} gap=${a.gap.toFixed(2)}  ${a.status.padEnd(13)} ${(a.zlevShare * 100).toFixed(0)}% ZE`)
    check(`  ${year} ${p.split(' ')[0]} limit>0 & metric finite`, a.limit > 0 && Number.isFinite(a.avgMetric) && a.avgMetric >= 0)
  }
}

// MG 2025 is EV-heavy (Windsor EV alone is 43,060 of 66,690): the engine must
// count EVs at 0 g/km, so the corporate average lands far below the ICE-only one.
{
  const a = aggregateParent(IN, pack, base(2025), 'MG Motor')
  check('MG 2025 metric reflects EV dominance (< 2 L/100km)', a.avgMetric < 2, `${a.avgMetric.toFixed(2)} L/100km, ${(a.zlevShare * 100).toFixed(0)}% ZE`)
  check('MG 2025 is compliant', a.status === 'compliant')
}

// market roll-up exists for every year (no empty screens anywhere on the strip)
for (const y of pack.years) {
  const t = buildTree(IN, pack, base(y), {})
  check(`market tree ${y} has volume`, t.rawUnits > 0, `${t.rawUnits.toLocaleString()}`)
}

// ── the master structure's computed columns (BC–BH): engine identities ──────
{
  const PETROL_DIV = 23.7135
  const t = buildTree(IN, pack, base(2027), {})
  for (const c of (t.children ?? []).filter((x) => x.rawUnits > 0)) {
    const P = c.avgMetric * PETROL_DIV
    const T = c.limit * PETROL_DIV
    const credit = c.limit - c.avgMetric
    const ok = Math.abs(P / PETROL_DIV - c.avgMetric) < 1e-9 && Math.abs(T / PETROL_DIV - c.limit) < 1e-9
    check(`ledger identity: CAFCS=P/23.7135 & ACAFC=T/23.7135 · ${c.label.split(' ')[0]}`, ok)
    check(`ledger sign convention matches gap · ${c.label.split(' ')[0]}`, (credit >= 0) === (c.gap <= 0), `credit ${credit.toFixed(3)} gap ${c.gap.toFixed(3)}`)
  }
  // the workbook leaves BC..BH blank — the ledger is ours to compute, and must
  // reproduce the P/T identity from the fleet alone
  const mg = aggregateParent(IN, pack, base(2025), 'MG Motor')
  check('MG 2025 ledger P is the EV-inclusive corporate average', mg.avgMetric * PETROL_DIV < 40, (mg.avgMetric * PETROL_DIV).toFixed(1) + ' g/km')
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

// ── the master structure is fully addressable ───────────────────────────────
{
  const { INDIA_CATALOG } = await import('../src/data/india_catalog.js')
  const { OPTIONAL_STRUCTURE, MASTER_HEADINGS, structureCoverage } = await import('../src/lib/masterColumns.js')
  check('fleet rows carry a joined drive cycle where the source records one', IN.filter((v) => v.driveCycle).every((v) => ['MIDC', 'WLTC'].includes(v.driveCycle!)))
  check('registry addresses every optional master heading', MASTER_HEADINGS.filter((h) => h.k).every((h) => OPTIONAL_STRUCTURE.some((c) => c.k === h.k)))
  check('registry has no heading the source dropped (OTR Price, Tax, Length…)', !MASTER_HEADINGS.some((h) => /OTR Price|^Tax$|^Length$|^Width$|^Height$/.test(h.label)))
  const lib = INDIA_CATALOG.map((v: any) => ({ sales: 0, ...v }))
  const cov = structureCoverage(lib as any)
  const populated = cov.items.filter((i: any) => i.state === 'populated').map((i: any) => i.label)
  check('variant library populates the spec headings',
    ['V:Engine Capacity', 'FT Code', 'V:Gear Box', 'V:Driveline', 'V:Kerb Weight', 'V:Drive Cycle', 'V:Reference Mass', 'V:Test Mass', 'V:Energy consumption (kWh/100km)'].every((l) => populated.includes(l)),
    populated.length + ' populated')
  const empty = cov.items.filter((i: any) => i.state === 'empty').map((i: any) => i.label)
  check('the one heading the workbook leaves blank is identified (E-Range in miles)', empty.length === 1 && /E-Range \(miles\)/.test(empty[0]), empty.join(' · ') || 'none')
}

console.log(`\n${pass} passed · ${fail} failed`)
if (fail) process.exit(1)
