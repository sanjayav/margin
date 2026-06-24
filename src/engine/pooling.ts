// ───────────────────────────────────────────────────────────────────────────
// Pooling & credit trading — the market mechanisms that let makers share or buy
// compliance. A surplus maker (under its limit) carries headroom a short maker
// can use, via a pool (combined average) or a credit trade. Pooling is always
// weakly cheaper for the market in total (the pooled excess is ≤ the sum of
// standalone excesses), so the real question is who partners with whom and how
// the value is split.
// ───────────────────────────────────────────────────────────────────────────
import type { Aggregate, RulePack, Scenario, Vehicle } from './types'
import { aggregate, applyScenario, buildTree } from './engine'

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
