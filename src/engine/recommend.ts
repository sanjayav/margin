// ───────────────────────────────────────────────────────────────────────────
// "Get me under the line" — the product's opinion.
// A greedy optimiser that, at each step, picks the change with the best
// €-per-gram return, re-runs the real engine, and repeats until the fleet is
// below the limit. Returns a ranked, costed to-do list.
// ───────────────────────────────────────────────────────────────────────────
import type { Aggregate, RulePack, Scenario, Vehicle } from './types.js'
import { aggregate, applyScenario, fmtInt } from './engine.js'

export interface Action {
  id: string
  title: string
  detail: string
  lever: 'eco' | 'ev' | 'light' | 'pool' | 'trim' | 'credits'
  difficulty: 'Easy' | 'Medium' | 'Hard'
  cost: number              // currency
  gramsCleared: number      // reduction in gap (metric units)
  fineAvoided: number
}

export interface Plan {
  parent: string
  before: Aggregate
  after: Aggregate
  actions: Action[]
  totalCost: number
  fineBefore: number
  fineAfter: number
  cleared: boolean
}

// Illustrative incentive cost to convert one buyer to a zero-emission car.
const EV_COST: Record<string, number> = { EU: 1800, IN: 150000, AU: 2000, UK: 1700 }
const ECO_COST_PER_G = 8 // per car per g, eco-innovation engineering
const LIGHT_COST_PER_KG = 14 // per car per kg removed
const TRIM_MARGIN: Record<string, number> = { EU: 2600, IN: 60000, AU: 3000, UK: 2400 }

type State = { scenario: Scenario; vehicles: Vehicle[] }
type Ov = Record<string, Partial<Scenario>>

function evalParent(state: State, pack: RulePack, parent: string, overrides: Ov = {}): Aggregate {
  const v = applyScenario(state.vehicles, state.scenario, pack, overrides).filter((x) => x.parent === parent)
  return aggregate(v, pack, state.scenario, parent, 'parent', parent)
}

const diff = (lvl: string): Action['difficulty'] => (lvl === 'eco' || lvl === 'credits' ? 'Easy' : lvl === 'pool' || lvl === 'ev' ? 'Medium' : 'Hard')

export function recommend(raw: Vehicle[], pack: RulePack, scenario: Scenario, parent: string, overrides: Ov = {}): Plan {
  const before = evalParent({ scenario, vehicles: raw }, pack, parent, overrides)
  const fineBefore = before.fine

  const actions: Action[] = []
  // Working state we keep mutating
  let state: State = { scenario: { ...scenario }, vehicles: raw }
  let cur = before
  const curEvShare = before.zlevShare * 100

  let guard = 0
  while (cur.gap > 0.001 && guard++ < 12) {
    const candidates: { action: Omit<Action, 'fineAvoided'>; next: State }[] = []
    const fineNow = cur.fine
    const rawUnits = cur.rawUnits

    // 1. Eco-innovation / efficiency (cheap, capped at the pack's LEGAL cap for
    //    the year — only proposed where the regime has an eco mechanism).
    const ecoCap = pack.ecoCap?.(state.scenario.year)
    if (ecoCap != null && state.scenario.ecoBoostG < ecoCap) {
      const next: State = { ...state, scenario: { ...state.scenario, ecoBoostG: Math.min(ecoCap, state.scenario.ecoBoostG + 3) } }
      const a = evalParent(next, pack, parent, overrides)
      const grams = cur.gap - a.gap
      if (grams > 0.0001)
        candidates.push({
          action: {
            id: 'eco', lever: 'eco', difficulty: diff('eco'),
            title: 'Certify eco-innovation credits',
            detail: `Apply ${Math.round((next.scenario.ecoBoostG) )} g/km of approved off-cycle credits (A/C, LED, smart alternator).`,
            cost: Math.round((next.scenario.ecoBoostG - state.scenario.ecoBoostG) * ECO_COST_PER_G * rawUnits),
            gramsCleared: grams,
          }, next,
        })
    }

    // 2. Electrify — lift the zero-emission share by 5 points
    {
      const baseShare = state.scenario.evSharePct ?? curEvShare
      const targetShare = Math.min(92, baseShare + 5)
      if (targetShare > baseShare + 0.1) {
        const next: State = { ...state, scenario: { ...state.scenario, evSharePct: targetShare } }
        const a = evalParent(next, pack, parent, overrides)
        const grams = cur.gap - a.gap
        const evNow = (a.rawUnits * targetShare) / 100
        const evBefore = (cur.rawUnits * baseShare) / 100
        const converted = Math.max(0, evNow - evBefore)
        if (grams > 0.0001)
          candidates.push({
            action: {
              id: `ev-${targetShare}`, lever: 'ev', difficulty: diff('ev'),
              title: `Lift zero-emission mix to ${Math.round(targetShare)}%`,
              detail: `Shift ~${fmtInt(converted)} buyers from combustion to BEV via incentives and supply.`,
              cost: Math.round(converted * (EV_COST[pack.id] ?? 1800)),
              gramsCleared: grams,
            }, next,
          })
      }
    }

    // 3. Lightweight the fleet (−25 kg)
    if (state.scenario.massShiftKg > -100) {
      const next: State = { ...state, scenario: { ...state.scenario, massShiftKg: state.scenario.massShiftKg - 25 } }
      const a = evalParent(next, pack, parent, overrides)
      const grams = cur.gap - a.gap
      if (grams > 0.0001)
        candidates.push({
          action: {
            id: `light-${next.scenario.massShiftKg}`, lever: 'light', difficulty: diff('light'),
            title: 'Lightweight the model mix (−25 kg)',
            detail: 'Material substitution and trim rationalisation lower mass and real-world CO₂.',
            cost: Math.round(25 * LIGHT_COST_PER_KG * rawUnits),
            gramsCleared: grams,
          }, next,
        })
    }

    // 4. Pool with a compliant maker (if the country allows it)
    if (pack.pooling.enabled && !state.scenario.poolingEnabled) {
      const all = applyScenario(state.vehicles, state.scenario, pack, overrides)
      const others = [...new Set(all.map((x) => x.parent))].filter((p) => p !== parent)
      const partner = others
        .map((p) => aggregate(all.filter((x) => x.parent === p), pack, state.scenario, p, 'parent', p))
        .filter((a) => a.gap < 0)
        .sort((a, b) => a.gap - b.gap)[0]
      if (partner) {
        const merged = aggregate(all.filter((x) => x.parent === parent || x.parent === partner.label), pack, state.scenario, 'pool', 'parent', 'pool')
        const grams = cur.gap - merged.gap
        if (grams > 0.0001) {
          const next: State = { ...state, scenario: { ...state.scenario, poolingEnabled: true } }
          // record partner inside vehicles by tagging — we approximate by merging at eval time:
          candidates.push({
            action: {
              id: 'pool', lever: 'pool', difficulty: diff('pool'),
              title: `Pool with ${partner.label}`,
              detail: `Share a combined average with a maker that sits ${Math.abs(partner.gap).toFixed(1)} ${pack.metricUnit} under its limit.`,
              cost: Math.round(Math.max(0, merged.gap < 0 ? Math.abs(cur.gap) : 0) * pack.fineRate * rawUnits * 0.35) || Math.round(rawUnits * 4),
              gramsCleared: grams,
            },
            next: { ...next, vehicles: tagPool(state.vehicles, parent, partner.label) },
          })
        }
      }
    }

    // 5. Trim the dirtiest model by 25%
    {
      const all = applyScenario(state.vehicles, state.scenario, pack, overrides).filter((x) => x.parent === parent)
      const worst = [...all].filter((x) => pack.vehicleMetric(x, state.scenario) > cur.limit).sort((a, b) => b.co2 - a.co2)[0]
      if (worst) {
        const next: State = { ...state, vehicles: trimModel(state.vehicles, parent, worst.model, 0.25) }
        const a = evalParent(next, pack, parent)
        const grams = cur.gap - a.gap
        if (grams > 0.0001)
          candidates.push({
            action: {
              id: `trim-${worst.model}`, lever: 'trim', difficulty: diff('trim'),
              title: `Cut ${worst.model} volume 25%`,
              detail: `Reallocate ~${fmtInt(worst.sales * 0.25)} units away from your highest-emitting model.`,
              cost: Math.round(worst.sales * 0.25 * (TRIM_MARGIN[pack.id] ?? 2600)),
              gramsCleared: grams,
            }, next,
          })
      }
    }

    if (candidates.length === 0) break
    // pick the most cost-effective: lowest cost per gram cleared
    candidates.sort((a, b) => a.action.cost / a.action.gramsCleared - b.action.cost / b.action.gramsCleared)
    const pick = candidates[0]
    state = pick.next
    const after = evalParent(state, pack, parent, overrides)
    const fineAvoided = Math.max(0, fineNow - after.fine)
    actions.push({ ...pick.action, fineAvoided })
    cur = after
  }

  const after = cur
  return {
    parent,
    before,
    after,
    actions,
    totalCost: actions.reduce((a, x) => a + x.cost, 0),
    fineBefore,
    fineAfter: after.fine,
    cleared: after.gap <= 0.001,
  }
}

// Merge a partner maker into the parent for pooled evaluation.
function tagPool(vehicles: Vehicle[], parent: string, partner: string): Vehicle[] {
  return vehicles.map((v) => (v.parent === partner ? { ...v, parent } : v))
}
function trimModel(vehicles: Vehicle[], parent: string, model: string, frac: number): Vehicle[] {
  return vehicles.map((v) => (v.parent === parent && v.model === model ? { ...v, sales: v.sales * (1 - frac) } : v))
}
