// ───────────────────────────────────────────────────────────────────────────
// Pooling & credit trading — the market mechanisms that let makers share or buy
// compliance. A surplus maker (under its limit) carries headroom a short maker
// can use, via a pool (combined average) or a credit trade. Pooling is always
// weakly cheaper for the market in total (the pooled excess is ≤ the sum of
// standalone excesses), so the real question is who partners with whom and how
// the value is split.
// ───────────────────────────────────────────────────────────────────────────
import type { Aggregate, RulePack, Scenario, Vehicle } from './types.js'
import { aggregate, applyScenario, buildTree } from './engine.js'

export interface Standing {
  parent: string
  units: number
  avgMetric: number
  limit: number
  gap: number
  fine: number
  status: Aggregate['status']
  headroom: number       // limit − fleet (positive = surplus g/km)
  creditBalance: number  // −gap × units (g·units): >0 surplus to sell, <0 deficit to cover
}

export function standings(raw: Vehicle[], pack: RulePack, s: Scenario): Standing[] {
  const tree = buildTree(raw, pack, s)
  return (tree.children ?? [])
    .filter((c) => c.rawUnits > 0)
    .map((c) => ({
      parent: c.label, units: c.rawUnits, avgMetric: c.avgMetric, limit: c.limit,
      gap: c.gap, fine: c.fine, status: c.status,
      headroom: -c.gap, creditBalance: -c.gap * c.rawUnits,
    }))
    .sort((a, b) => a.gap - b.gap)
}

export function poolAggregate(raw: Vehicle[], pack: RulePack, s: Scenario, members: string[]): Aggregate {
  const v = applyScenario(raw, s, pack).filter((x) => members.includes(x.parent))
  return aggregate(v, pack, s, members.length > 1 ? `Pool of ${members.length}` : members[0] ?? 'Pool', 'parent', 'pool:' + members.join('+'))
}

export interface PoolResult {
  members: string[]
  units: number
  avgMetric: number
  limit: number
  gap: number
  fine: number
  status: Aggregate['status']
  standaloneFine: number
  saved: number
}

export function poolResult(raw: Vehicle[], pack: RulePack, s: Scenario, members: string[]): PoolResult {
  const agg = poolAggregate(raw, pack, s, members)
  const st = standings(raw, pack, s)
  const standaloneFine = st.filter((x) => members.includes(x.parent)).reduce((a, x) => a + x.fine, 0)
  return {
    members, units: agg.rawUnits, avgMetric: agg.avgMetric, limit: agg.limit, gap: agg.gap,
    fine: agg.fine, status: agg.status, standaloneFine, saved: Math.max(0, standaloneFine - agg.fine),
  }
}

// ── Optimiser: the value-maximising pool + a Shapley fair value-split ─────────
// Pooling is sub-additive (a bigger pool never raises the total fine), so the
// pool that removes the most fine is everyone together. The hard question is the
// SETTLEMENT: a surplus seller won't lend headroom for free. We value the savings
// v(S) = Σ standalone fines in S − pooled fine of S, then split v(N) by Shapley
// value (each member's average marginal contribution over all join orders). A
// member's FAIR final cost = its standalone fine − its Shapley share; these sum
// to the pool's residual fine, so sellers (fine 0, positive share) get paid and
// buyers pay less than their standalone fine.
export interface ShapleyMember {
  parent: string
  role: 'seller' | 'buyer' | 'balanced'
  standaloneFine: number
  shapley: number // fair share of the savings (€)
  finalCost: number // standalone − shapley: <0 means receives, >0 means pays
}
export interface OptimiseResult {
  members: string[]
  totalStandalone: number
  pooledFine: number
  savings: number
  split: ShapleyMember[]
}

const popcount = (x: number) => { let c = 0; while (x) { c += x & 1; x >>= 1 } return c }

export function poolOptimise(raw: Vehicle[], pack: RulePack, s: Scenario, members?: string[]): OptimiseResult {
  const st = standings(raw, pack, s)
  const roster = (members ?? st.map((x) => x.parent)).filter((p) => st.some((x) => x.parent === p))
  const n = roster.length
  const standalone: Record<string, number> = {}
  const roleOf: Record<string, ShapleyMember['role']> = {}
  for (const x of st) { standalone[x.parent] = x.fine; roleOf[x.parent] = x.creditBalance > 0 ? 'seller' : x.gap > 0 ? 'buyer' : 'balanced' }

  // value of a coalition (savings vs everyone standalone), cached by bitmask
  const vCache = new Map<number, number>()
  const vMask = (mask: number): number => {
    const hit = vCache.get(mask); if (hit !== undefined) return hit
    const subset = roster.filter((_, i) => mask & (1 << i))
    let val = 0
    if (subset.length >= 2) val = subset.reduce((a, p) => a + (standalone[p] ?? 0), 0) - poolResult(raw, pack, s, subset).fine
    vCache.set(mask, val); return val
  }

  const fact = (k: number) => { let r = 1; for (let i = 2; i <= k; i++) r *= i; return r }
  const shap = new Array(n).fill(0)
  const full = (1 << n) - 1

  if (n <= 12) {
    // exact Shapley over all 2^n coalitions
    for (let i = 0; i < n; i++) {
      for (let mask = 0; mask <= full; mask++) {
        if (mask & (1 << i)) continue
        const k = popcount(mask)
        shap[i] += (fact(k) * fact(n - k - 1) / fact(n)) * (vMask(mask | (1 << i)) - vMask(mask))
      }
    }
  } else {
    // Monte-Carlo Shapley for large rosters (random join orders)
    const SAMPLES = 2000
    for (let t = 0; t < SAMPLES; t++) {
      const order = [...Array(n).keys()].sort(() => Math.random() - 0.5)
      let mask = 0, prev = 0
      for (const i of order) { const nm = mask | (1 << i); const v = vMask(nm); shap[i] += v - prev; prev = v; mask = nm }
    }
    for (let i = 0; i < n; i++) shap[i] /= SAMPLES
  }

  const pooledFine = poolResult(raw, pack, s, roster).fine
  const totalStandalone = roster.reduce((a, p) => a + (standalone[p] ?? 0), 0)
  const split: ShapleyMember[] = roster.map((p, i) => ({
    parent: p, role: roleOf[p] ?? 'balanced', standaloneFine: standalone[p] ?? 0,
    shapley: shap[i], finalCost: (standalone[p] ?? 0) - shap[i],
  })).sort((a, b) => b.shapley - a.shapley)

  return { members: roster, totalStandalone, pooledFine, savings: Math.max(0, totalStandalone - pooledFine), split }
}

export interface MarketOption {
  type: 'pool' | 'credits' | 'fine'
  label: string
  detail: string
  cost: number
  best?: boolean
}

/** Ranked ways for one short maker to deal with its fine: pool, buy credits, or pay. */
export function bestForMaker(raw: Vehicle[], pack: RulePack, s: Scenario, parent: string): MarketOption[] {
  const st = standings(raw, pack, s)
  const me = st.find((x) => x.parent === parent)
  if (!me || me.fine <= 0) return []
  const F = me.fine
  const deficitGU = Math.max(0, me.gap) * me.units
  const surplus = st.filter((x) => x.creditBalance > 0 && x.parent !== parent)
  const surplusGU = surplus.reduce((a, x) => a + x.creditBalance, 0)
  const covered = Math.min(deficitGU, surplusGU)
  const cur = pack.currency
  const creditPrice = s.creditPrice ?? pack.creditPrice // scenario override wins
  const opts: MarketOption[] = []

  if (pack.pooling.enabled && surplus.length > 0) {
    const members = [parent, ...surplus.map((x) => x.parent)]
    const res = poolResult(raw, pack, s, members)
    const floor = (creditPrice ?? pack.fineRate * 0.4) * covered
    const ceiling = F
    const payment = Math.min(Math.max((floor + ceiling) / 2, floor), ceiling)
    opts.push({
      type: 'pool',
      label: `Pool with ${surplus.map((x) => x.parent.split(' ')[0]).join(' & ')}`,
      detail: `Combined fleet ${res.avgMetric.toFixed(1)} vs limit ${res.limit.toFixed(1)} ${pack.metricUnit} — ${res.status === 'fine' ? 'cuts the gap' : 'clears the limit'}. Settle ~${cur}${Math.round(payment).toLocaleString()} with the surplus maker(s).`,
      cost: payment + res.fine,
    })
  }

  if (creditPrice != null && surplusGU > 0) {
    const cost = covered * creditPrice + (deficitGU - covered) * pack.fineRate
    opts.push({
      type: 'credits',
      label: 'Buy credits',
      detail: `Cover ${Math.round(covered).toLocaleString()} g·units at ${cur}${creditPrice}/unit${covered < deficitGU ? '; the rest is still fined' : ' — fully covered'}.`,
      cost,
    })
  }

  opts.push({ type: 'fine', label: 'Pay the fine', detail: me.fine > 0 ? `${(me.gap).toFixed(1)} ${pack.metricUnit} over × ${cur}${pack.fineRate} × ${me.units.toLocaleString()} units` : '', cost: F })

  opts.sort((a, b) => a.cost - b.cost)
  if (opts.length) opts[0].best = true
  return opts
}
