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
import { aggregate, applyScenario, threeYearAverage, buildTree } from './engine.js'
import { standings, poolResult, poolOptimise } from './pooling.js'
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
  for (const id of ['EU', 'IN', 'AU', 'UK', 'CN'] as CountryId[]) {
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

    // 2025-2027 three-year averaging is weakly cheaper than paying each single year
    const tys = makers.map((m) => threeYearAverage(FLEET.EU, p, scenario(), m))
    const sub = tys.every((ty) => ty.fine <= ty.singleYearFine + 1)
    const best = tys.reduce((a, b) => (b.saved > a.saved ? b : a), tys[0])
    inv('eu-3yr-subadditive', 'EU: 3-year (2025-27) averaging premium ≤ sum of single-year premiums', sub,
      `holds for all ${tys.length} makers; best saving €${f(best?.saved ?? 0, 0)} (Reg 2025/1214)`)

    // hierarchical scoping: a model-scoped mix preserves total market volume
    const mk = FLEET.EU[0].parent, md = FLEET.EU[0].model
    const baseU = buildTree(FLEET.EU, p, scenario()).rawUnits
    const ovU = buildTree(FLEET.EU, p, scenario(), { [`${mk}/${md}`]: { mix: { BEV: 80, ICE: 20 } } }).rawUnits
    inv('eu-scope-volume', 'EU: model-scoped edits preserve total market volume', approx(baseU, ovU, 1),
      `market units ${f(baseU, 0)} = ${f(ovU, 0)} with a model mix override`)

    // Shapley value-split is efficient: shares sum to the pool's savings, and
    // fair final costs sum to the pool's residual fine (conservation).
    const opt = poolOptimise(FLEET.EU, p, scenario())
    const shapSum = opt.split.reduce((a, m) => a + m.shapley, 0)
    const costSum = opt.split.reduce((a, m) => a + m.finalCost, 0)
    inv('eu-shapley-efficient', 'EU: Shapley shares sum to savings; final costs sum to the pooled fine',
      approx(shapSum, opt.savings, 1) && approx(costSum, opt.pooledFine, 1),
      `Σshapley €${f(shapSum, 0)} = savings €${f(opt.savings, 0)}; Σcost €${f(costSum, 0)} = pooled €${f(opt.pooledFine, 0)}`)
  }

  // ── Regulatory anchors (golden numbers tied to the rules) ──────────────────
  {
    const p = getPack('EU')
    anchor('eu-fine-rate', 'EU excess premium is €95 / gCO₂·km / car', p.fineRate === 95,
      `fineRate = €${p.fineRate}`, 'Reg (EU) 2019/631, Article 8(1)')
    // eco-innovation cap stepped DOWN to 6 g/km for 2025-2029 (was 7 g/km ≤2024)
    const m = p.vehicleMetric(veh({ co2: 120, ecoBenefit: 20 }), scenario({ year: 2025, ecoBoostG: 0 }))
    anchor('eu-eco-cap-2025', 'EU eco-innovation cap is 6 g/km for 2025-2029 (was 7)', approx(m, 114, 0.01),
      `engine credits ${f(120 - m, 1)} g (cap ${f(120 - m, 0)}); correct 2025 cap is 6 g → 114 g`, 'Reg (EU) 2023/851 (amends Art 11)')
    // 2025+ uses a TEST-MASS basis with slope a ~ 0.0144 (0.0333 was the 2020-2024 value)
    const slope = (p.limit(ctx({ year: 2025, avgMass: 2000 })) - p.limit(ctx({ year: 2025, avgMass: 1000 }))) / 1000
    anchor('eu-mass-slope-2025', 'EU 2025 car mass-slope a = 0.0144 g/kg (test-mass basis)', approx(slope, 0.0144, 0.0008),
      `engine slope = ${f(slope, 4)} g/kg; 2025 value is 0.0144 (0.0333 was 2020-2024, MIRO basis)`, 'Commission Impl. Decision (EU) 2023/1623; JRC133502')
    // ZLEV relaxation should trigger only ABOVE a 25% share (cars), not 15%
    const at20 = p.limit(ctx({ year: 2025, avgMass: 1600, zlevShare: 0.20 }))
    const noZ = p.limit(ctx({ year: 2025, avgMass: 1600, zlevShare: 0 }))
    anchor('eu-zlev-benchmark', 'EU ZLEV benchmark is 25% (cars) for 2025-2029, not 15%', approx(at20, noZ, 0.01),
      `a 20%-ZE maker (below the 25% benchmark) relaxed +${f((at20 / noZ - 1) * 100, 1)}% (expected 0%)`, 'Reg (EU) 2023/851; EC Cars & Vans')
    // EU 2025 fleet-wide car target ≈ 93.6 g/km WLTP at the reference test mass
    const target25 = p.limit(ctx({ year: 2025, avgMass: 1609.6, zlevShare: 0, vclass: 'Passenger car' }))
    anchor('eu-fleet-target-2025', 'EU 2025 car fleet target = 93.6 g/km at reference test mass', approx(target25, 93.6, 0.3),
      `limit(2025, 1609.6kg, 0% ZLEV) = ${f(target25)} g (expected 93.6)`, 'EC Cars & Vans; ICCT 2025 targets (Oct 2024)')
    // ZLEV band is 0–50 g/km, not just 0 g
    const zlevOk = p.isZLEV != null && p.isZLEV(veh({ co2: 45 })) === true && p.isZeroEmission(veh({ co2: 45 })) === false
    anchor('eu-zlev-band', 'EU ZLEV share counts 0–50 g/km (not only 0 g)', zlevOk,
      `isZLEV(45g)=${p.isZLEV?.(veh({ co2: 45 }))}, isZeroEmission(45g)=${p.isZeroEmission(veh({ co2: 45 }))}`, 'Reg (EU) 2023/851 — ZLEV 0–50 g/km')
    // PHEV official CO₂ roughly doubles under the 2025/26 utility-factor revision
    const phev = veh({ co2: 45, powertrain: 'PHEV', fuel: 'petrol' })
    const m24 = p.vehicleMetric(phev, scenario({ year: 2024 }))
    const m26 = p.vehicleMetric(phev, scenario({ year: 2026 }))
    anchor('eu-phev-uf', 'EU PHEV official CO₂ ~doubles under Euro 6e-bis (2026)', approx(m26, m24 * 2, 2),
      `PHEV 45 g → ${f(m24)} (2024) → ${f(m26)} (2026), ×${f(m26 / m24, 2)}`, 'Comm. Reg (EU) 2023/443; ICCT real-world UF')
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
    // Transition: pre-FY2027 years fall back to CAFE II as in force (113 g/km at 1,145 kg).
    const c2 = p.limit(ctx({ year: 2026, avgMass: 1145, vclass: 'Passenger car' }))
    anchor('in-cafe2', 'India pre-FY2027 = CAFE II: 4.765 L/100km (113 gCO₂/km) at 1,145 kg reference', approx(c2, 113 / 23.7135, 0.01),
      `limit(2026, 1145kg) = ${f(c2, 3)} (expected ${f(113 / 23.7135, 3)})`, 'BEE CAFE II (in force to FY2026-27)')
    // Statutory stepped penalty — EC (Amendment) Act 2022, replaces the old placeholder.
    // cnf: 0 pins the exceedance exactly — this anchor tests the PENALTY
    // schedule, not the (auto-derived) E20 CNF discount.
    const under02 = aggregate([veh({ co2: (p.limit(ctx({ year: 2027, avgMass: 1500 })) + 0.1) * 23.7135, mass: 1500, sales: 10000, vclass: 'Passenger car', fuel: 'petrol', cnf: 0 })], p, scenario({ year: 2027 }), 'X', 'parent', 'x')
    const over02 = aggregate([veh({ co2: (p.limit(ctx({ year: 2027, avgMass: 1500 })) + 0.5) * 23.7135, mass: 1500, sales: 10000, vclass: 'Passenger car', fuel: 'petrol', cnf: 0 })], p, scenario({ year: 2027 }), 'X', 'parent', 'x')
    anchor('in-fine-step', 'India fine: ₹25,000/car ≤0.2 L/100km over · ₹50,000/car beyond (EC Act 2022)',
      approx(under02.fine, 25000 * 10000, 1) && approx(over02.fine, 50000 * 10000, 1),
      `0.1 over → ₹${f(under02.fine, 0)} (₹25k×10k) · 0.5 over → ₹${f(over02.fine, 0)} (₹50k×10k)`, 'Energy Conservation (Amendment) Act 2022')
    // Draft-stringency lever moves the CAFE III target line, not CAFE II.
    const tighter = p.limit({ ...ctx({ year: 2029, avgMass: 1170 }), scenario: scenario({ year: 2029, targetShiftPct: -5 }) })
    anchor('in-stringency', 'India draft-stringency −5% tightens the CAFE III constant by 5%', approx(tighter, 3.4573 * 0.95, 0.01),
      `limit(2029, −5%) = ${f(tighter, 4)} (expected ${f(3.4573 * 0.95, 4)})`, 'scenario stress on BEE draft')
  }
  {
    const p = getPack('UK')
    // The pack now models the true unit mandate: limit = allowed non-ZE share %.
    const car25 = p.limit(ctx({ year: 2025, vclass: 'Car' }))
    anchor('uk-zev-2025', 'UK ZEV mandate 2025 car target = 28% (allowed non-ZE share 72%)', approx(car25, 72, 0.5),
      `limit(2025, Car) = ${f(car25, 1)}% non-ZE (expected 72%)`, 'DfT VETS Order 2023, car trajectory')
    const van25 = p.limit(ctx({ year: 2025, vclass: 'Van' }))
    anchor('uk-van-2025', 'UK van mandate 2025 = 16% ZEV (allowed non-ZE 84%)', approx(van25, 84, 0.5),
      `limit(2025, Van) = ${f(van25, 1)}% non-ZE (expected 84%)`, 'DfT VETS Order 2023, van trajectory')
    // Fine maps exactly to £12,000 per missing ZEV: an all-ICE 10,000-car fleet
    // in 2025 misses 2,800 ZEVs → £33.6M.
    const allIce = aggregate([veh({ co2: 120, mass: 1400, sales: 10000, vclass: 'Car' })], p, scenario({ year: 2025 }), 'X', 'parent', 'x')
    const missingZev = (allIce.gap / 100) * allIce.rawUnits
    anchor('uk-fine-per-zev', 'UK fine = £12,000 × missing ZEVs (Apr 2025 statutory rate)', approx(allIce.fine, missingZev * 12000, 1),
      `gap ${f(allIce.gap, 1)}pp × 10,000 cars → ${f(missingZev, 0)} missing ZEVs → £${f(allIce.fine, 0)}`, 'DfT, April 2025 flexibility package')
    // Out-of-scope threshold: <2,500 registrations/yr are exempt from VETS.
    const tinyUk = aggregate([veh({ co2: 250, mass: 1600, sales: 1500, vclass: 'Car' })], p, scenario({ year: 2025 }), 'Tiny', 'parent', 't')
    anchor('uk-small-volume', 'UK: maker under 2,500 registrations is out of VETS scope', tinyUk.fine === 0 && tinyUk.status === 'exempt',
      `1,500 units → fine £${f(tinyUk.fine, 0)}, status ${tinyUk.status}`, 'DfT VETS Order 2023 (registration threshold)')
  }

  // ── Known gaps (compute the delta so it's visible, not hidden) ─────────────
  {
    const p = getPack('EU')
  }
  {
    review('uk-flexibilities', 'UK: vans at car fine rate; banking/borrowing & CO₂-conversion not yet modelled',
      'Vans carry a £15,000 rate vs cars\' £12,000 — the engine applies the car rate to both (van volume is small in the extract). Allowance banking (≤3 yrs), borrowing (2024–29 scheme years, 3.5% compounding interest, repay by 2030) and the non-ZE CO₂-conversion flexibility are not modelled; the ≈£4k credit price is an observed market level, not statutory.',
      'DfT VETS Order 2023 · SI 2025/1101 · DfT "VETS: How to Comply" (Jun 2026)')
    review('in-cafe2-supercredits', 'India CAFE II super-credit treatment unverified',
      'The pack grants super-credits and CNF discounts only from FY2027-28 (CAFE III draft). If the in-force CAFE II notification grants EV/hybrid derogation factors, FY2025-26 corporate averages for EV-heavy makers (MG) are overstated here. Confirm against the BEE CAFE II notification before quoting FY25-26 P values externally.',
      'BEE CAFE II notification — primary-source check pending')
    review('draft-regime-rates', 'India CAFE III constants & credit price are DRAFT until BEE notifies',
      'The fine is now statutory (EC Act 2022: ₹25k/₹50k per car, stepped at 0.2 L/100km) but the CAFE III targets (d constants) and the ~₹2,500/g credit price come from the 25 Sep 2025 draft. The pack badges CAFE III years "draft" and exposes a ±10% stringency stress; re-anchor when the final notification lands.',
      'BEE Draft CAFE III · EC (Amendment) Act 2022')
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
