// ───────────────────────────────────────────────────────────────────────────
// Margin · accuracy validation harness
//
// Three classes of check:
//   • invariant  — a property that MUST hold for any correct engine (hard pass/fail)
//   • anchor     — a golden number traceable to the actual regulation (hard pass/fail)
//   • review     — an assumption that needs primary-source confirmation; we compute
//                  the engine's current value and the reference so the GAP is visible
//
// Run with `npm run validate`. This is the baseline every accuracy fix is measured
// against — change a formula, re-run, watch reds turn green (or new reds appear).
// ───────────────────────────────────────────────────────────────────────────
import type { CountryId, LimitContext, Scenario, Vehicle } from './types.js'
import { getPack } from './rulepacks/index.js'
import { aggregate, applyScenario } from './engine.js'
import { standings, poolResult } from './pooling.js'
import { FLEET } from '../data/fleet.js'

export type CheckStatus = 'pass' | 'fail' | 'review'
export interface Check {
  id: string
  group: string
  desc: string
  status: CheckStatus
  detail: string
  source?: string
}

const scenario = (over: Partial<Scenario> = {}): Scenario => ({
  year: 2025, evSharePct: null, salesMultiplier: 1, massShiftKg: 0, ecoBoostG: 0,
  poolingEnabled: false, superCreditsEnabled: false, mix: null, extraVariants: [], ...over,
})

const ctx = (over: Partial<LimitContext>): LimitContext => ({
  year: 2025, avgMass: 1600, zlevShare: 0, vclass: 'Passenger car', scenario: scenario(), ...over,
})

const approx = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol
const f = (n: number, d = 3) => n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: d })

const veh = (o: Partial<Vehicle>): Vehicle => ({
  parent: 'Test', pool: '', brand: '', make: '', model: 'M', year: 2025, powertrain: 'ICE',
  fuel: 'petrol', co2: 120, mass: 1500, sales: 10000, vclass: 'Passenger car', ...o,
})

// ── checks ──────────────────────────────────────────────────────────────────
export function runValidation(): Check[] {
  const out: Check[] = []
  const add = (c: Check) => out.push(c)
  const inv = (id: string, desc: string, ok: boolean, detail: string) =>
    add({ id, group: 'Invariant', desc, status: ok ? 'pass' : 'fail', detail })
  const anchor = (id: string, desc: string, ok: boolean, detail: string, source: string) =>
    add({ id, group: 'Regulatory anchor', desc, status: ok ? 'pass' : 'fail', detail, source })
  const review = (id: string, desc: string, detail: string, source: string) =>
    add({ id, group: 'Known gap — needs validation', desc, status: 'review', detail, source })

  // ── Invariants (must hold for any correct engine) ──────────────────────────
  for (const id of ['EU', 'IN', 'AU', 'UK'] as CountryId[]) {
    const p = getPack(id)
    const bev = veh({ co2: 0, powertrain: 'BEV', fuel: 'electric', zev: 1 })
    inv(`bev-zero-${id}`, `${id}: a BEV counts as 0 in the fleet metric`, p.vehicleMetric(bev, scenario()) === 0,
      `vehicleMetric(BEV) = ${p.vehicleMetric(bev, scenario())} ${p.metricUnit}`)
  }

  {
    const p = getPack('EU')
    // limit rises with mass (heavier fleet → looser target)
    const lo = p.limit(ctx({ avgMass: 1500 })), hi = p.limit(ctx({ avgMass: 1700 }))
    inv('eu-mass-monotonic', 'EU: limit increases with average mass', hi > lo,
      `limit(1500kg)=${f(lo)} < limit(1700kg)=${f(hi)} g/km`)

    // fine = max(0, gap) × rate × rawUnits, and clears below the line
    const over = aggregate([veh({ co2: 200, mass: 1600, sales: 50000 })], p, scenario(), 'X', 'parent', 'x')
    const expFine = Math.max(0, over.gap) * p.fineRate * over.rawUnits
    inv('eu-fine-formula', 'EU: fine = excess × €95 × units', approx(over.fine, expFine, 1),
      `engine €${f(over.fine, 0)} vs formula €${f(expFine, 0)} (gap ${f(over.gap)} g/km)`)

    // single-vehicle fleet average equals that vehicle's metric
    const one = aggregate([veh({ co2: 130, sales: 1 })], p, scenario(), 'X', 'parent', 'x')
    inv('eu-single-avg', 'EU: 1-car fleet average = that car’s metric', approx(one.avgMetric, p.vehicleMetric(veh({ co2: 130 }), scenario()), 0.01),
      `avg ${f(one.avgMetric)} = metric ${f(p.vehicleMetric(veh({ co2: 130 }), scenario()))}`)

    // small-volume maker is exempt from fines
    const tiny = aggregate([veh({ co2: 250, mass: 1600, sales: 500 })], p, scenario(), 'Tiny', 'parent', 't')
    inv('eu-small-volume', `EU: maker under ${p.smallVolumeThreshold} units is exempt`, tiny.fine === 0 && tiny.status === 'exempt',
      `units 500 → fine €${f(tiny.fine, 0)}, status ${tiny.status}`)

    // ZLEV share is a proper fraction
    const t = standings(FLEET.EU, p, scenario())
    const shareOk = t.every((s) => s.avgMetric >= 0)
    inv('eu-share-bounds', 'EU: fleet metrics are non-negative', shareOk, `${t.length} makers, all avgMetric ≥ 0`)

    // pooling is weakly cheaper than standing alone (sub-additivity)
    const makers = t.map((s) => s.parent)
    const pool = poolResult(FLEET.EU, p, scenario(), makers)
    inv('eu-pool-subadditive', 'EU: pooled fine ≤ sum of standalone fines', pool.fine <= pool.standaloneFine + 1,
      `pool €${f(pool.fine, 0)} ≤ standalone €${f(pool.standaloneFine, 0)} (saves €${f(pool.saved, 0)})`)
  }

  // ── Regulatory anchors (golden numbers tied to the rules) ──────────────────
  {
    const p = getPack('EU')
    anchor('eu-fine-rate', 'EU excess premium is €95 / gCO₂·km / car', p.fineRate === 95,
      `fineRate = €${p.fineRate}`, 'Reg (EU) 2019/631, Article 8(1)')
    // eco-innovation credit capped at 7 g
    const m = p.vehicleMetric(veh({ co2: 120, ecoBenefit: 20 }), scenario({ ecoBoostG: 0 }))
    anchor('eu-eco-cap', 'EU eco-innovation credit capped at 7 g/km', approx(m, 113, 0.01),
      `120 g − min(20, 7) = ${f(m)} g (expected 113)`, 'Reg (EU) 2019/631, Article 11')
    // mass slope a = 0.0333 g per kg (cars)
    const slope = (p.limit(ctx({ avgMass: 2000 })) - p.limit(ctx({ avgMass: 1000 }))) / 1000
    anchor('eu-mass-slope', 'EU car mass-slope a = 0.0333 g/kg', approx(slope, 0.0333, 0.0005),
      `engine slope = ${f(slope, 4)} g/kg`, 'Reg (EU) 2019/631, Annex I Part A')
  }
  {
    const p = getPack('AU')
    const t1 = p.limit(ctx({ year: 2025, avgMass: 1723, vclass: 'Type 1' }))
    anchor('au-t1-2025', 'AU NVES Type 1 (2025) headline = 141 g at reference MIRO', approx(t1, 141, 0.5),
      `limit(2025, 1723kg, Type 1) = ${f(t1)} g (expected 141)`, 'DCCEEW NVES 2024 determination, Type 1')
    const t2 = p.limit(ctx({ year: 2025, avgMass: 2155, vclass: 'Type 2' }))
    anchor('au-t2-2025', 'AU NVES Type 2 (2025) headline = 210 g at reference MIRO', approx(t2, 210, 0.5),
      `limit(2025, 2155kg, Type 2) = ${f(t2)} g (expected 210)`, 'DCCEEW NVES 2024 determination, Type 2')
    anchor('au-penalty', 'AU penalty A$100 per g/km over · per unit', p.fineRate === 100,
      `fineRate = A$${p.fineRate}`, 'NVES Act 2024')
  }
  {
    const p = getPack('IN')
    const d27 = p.limit(ctx({ year: 2027, avgMass: 1170, vclass: 'Passenger car' }))
    anchor('in-d-2027', 'India CAFE III FY2027 constant d = 3.7264 L/100km at reference kerb mass', approx(d27, 3.7264, 0.01),
      `limit(2027, 1170kg) = ${f(d27, 4)} (expected 3.7264)`, 'BEE Draft CAFE III, 25 Sep 2025')
    const slope = (p.limit(ctx({ year: 2027, avgMass: 1270 })) - d27) / 100
    anchor('in-slope', 'India CAFE III mass-slope = 0.002 L/100km per kg', approx(slope, 0.002, 0.0001),
      `engine slope = ${f(slope, 5)}`, 'BEE Draft CAFE III')
  }
  {
    const p = getPack('UK')
    const car25 = p.limit(ctx({ year: 2025, vclass: 'Car' }))
    const zevTarget = 1 - car25 / 150
    anchor('uk-zev-2025', 'UK ZEV mandate 2025 car target = 28% (non-ZE allowance 72%)', approx(zevTarget, 0.28, 0.005),
      `implied ZEV target ${f(zevTarget * 100, 0)}% (expected 28%)`, 'DfT VETS Order 2023, car trajectory')
  }

  // ── Known gaps (compute the delta so it's visible, not hidden) ─────────────
  {
    const p = getPack('EU')
    const engineTarget = p.limit(ctx({ year: 2025, avgMass: 1609, zlevShare: 0 }))
    review('eu-baseline', 'EU target uses a universal 95 g baseline, not manufacturer-specific 2021 WLTP',
      `engine 2025 car target at 1609 kg = ${f(engineTarget)} g (95g NEDC-era curve). Real targets are each maker's 2021 WLTP start × (1−15%); EU-wide reference ≈ 93.6 g WLTP. Per-maker error can be ±10–15 g.`,
      'Reg (EU) 2019/631 Annex I; ICCT 2025 target analysis')

    const relaxed = p.limit(ctx({ year: 2025, avgMass: 1609, zlevShare: 0.5 }))
    const base = p.limit(ctx({ year: 2025, avgMass: 1609, zlevShare: 0 }))
    review('eu-zlev', 'EU ZLEV target relaxation is applied to 2025+; the 2023/851 amendment changed this',
      `a 50%-ZE maker gets target ${f(relaxed)} vs ${f(base)} g (+${f((relaxed / base - 1) * 100, 1)}% easier). Confirm whether the ZLEV factor still applies post-2023/851 — if not, clean makers' fines are understated.`,
      'Reg (EU) 2023/851 (Fit for 55 amendment)')

    review('eu-phev-uf', 'EU PHEV utility-factor 2025 correction is not modelled',
      'PHEV official CO₂ should step up materially from 2025 (WLTP UF revision). Engine uses the static official figure, so PHEV-heavy makers look cleaner than 2025 reality.',
      'Reg (EU) 2023/443 (WLTP utility factors), applies 2025/2027')

    review('eu-3yr-flex', 'EU 2025–2027 three-year averaging flexibility is not modelled',
      'The 2025 amendment lets makers average 2025–2027 compliance. A maker over in 2025 may still comply on the 3-year pool. Not yet in the engine.',
      'Reg (EU) 2025 amendment to 2019/631')
  }
  {
    const p = getPack('UK')
    review('uk-mechanism', 'UK is modelled as a CO₂ proxy line, but it is a ZEV sales mandate',
      `engine shows a CO₂ target (${f(p.limit(ctx({ year: 2025, vclass: 'Car' })))} g) derived from the allowance %. The real mechanism is a unit-share mandate (£15k/car shortfall, CRTS/VRTS credit trading) — should be modelled as a mandate, not a CO₂ average.`,
      'DfT VETS Order 2023')
    review('illustrative-rates', 'India / UK fine & credit prices are illustrative, not statutory',
      'IN ₹1,000/L·car, UK £100/g·car and £50 credit are placeholders. AU A$100/g and €95/g (EU) are real. Label illustrative numbers clearly in the UI / exports.',
      'engine rule packs')
  }

  return out
}

export function formatReport(checks: Check[]): string {
  const icon = { pass: '✓', fail: '✗', review: '⚠' }
  const groups = [...new Set(checks.map((c) => c.group))]
  let s = '\n  Margin · accuracy validation\n  ' + '─'.repeat(64) + '\n'
  for (const g of groups) {
    s += `\n  ${g}\n`
    for (const c of checks.filter((x) => x.group === g)) {
      s += `   ${icon[c.status]} ${c.desc}\n      ${c.detail}\n`
      if (c.source) s += `      └ ${c.source}\n`
    }
  }
  const pass = checks.filter((c) => c.status === 'pass').length
  const fail = checks.filter((c) => c.status === 'fail').length
  const rev = checks.filter((c) => c.status === 'review').length
  s += '\n  ' + '─'.repeat(64) + `\n  ${pass} passed · ${fail} failed · ${rev} need source validation\n`
  return s
}
