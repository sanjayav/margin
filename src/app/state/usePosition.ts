/* ───────────────────────────────────────────────────────────────────────────
   usePosition — the single read path from the engine into the new workspace.
   ---------------------------------------------------------------------------
   Two bases, and the distinction is load-bearing:

     'actuals' — the book of record. Pristine defaults plus the reporting year.
                 Structurally unreachable by levers, so a monitoring screen can
                 never show yesterday's slider positions as this year's filing.
     'working' — the live assumptions. What the modelling surfaces read.

   Nothing computed is stored. Every figure on screen is derived here, on this
   render, from the loaded fleet — which is why a data refresh cannot leave a
   stale number behind on some other screen.
   ─────────────────────────────────────────────────────────────────────────── */
import { useMemo } from 'react'
import { getPack } from '../../engine/rulepacks'
import { DATA_REFRESHED, getFleet, getMeta } from '../../data/fleet'
import { aggregateParent, buildDrillTree, buildTree } from '../../engine/engine'
import type { Aggregate, CountryId, Scenario } from '../../engine/types'
import { baseScenario, useApp } from './appStore'

export type Basis = 'actuals' | 'working'

/* ───────────────────────────────────────────────────────────────────────────
   Settled years.
   ---------------------------------------------------------------------------
   A rule pack's `years` are the years it can COMPUTE, which is not the same as
   the years that have actually been FILED. Most datasets carry forward rows —
   a manufacturer's own plan, or a projection — sitting in the same file as the
   history, and nothing in the shape of a row says which it is.

   `actualsThroughYear` is the pack's declaration of where the settled data
   stops. Only China sets it today; the type's own contract is that it defaults
   to the data-refresh year, so that is what this derives. Anything after it is
   a projection, and Plan must not read it — presenting a plan row as the book
   of record is the single worst thing this product could do.
   ─────────────────────────────────────────────────────────────────────────── */

/** The latest compliance year with settled actuals for a market. */
export function settledThrough(country: CountryId): number {
  const pack = getPack(country)
  if (pack.actualsThroughYear != null) return pack.actualsThroughYear
  const refreshed = new Date(DATA_REFRESHED[country]).getFullYear()
  // Never claim a settled year the pack cannot compute.
  const within = pack.years.filter((y) => y <= refreshed)
  return within.length ? within[within.length - 1] : pack.years[0]
}

/** The two years Plan is allowed to show: the current settled year and the one
 *  before it. Returns one entry where a market has no prior year loaded. */
export function actualsYears(country: CountryId): { current: number; previous: number | null } {
  const pack = getPack(country)
  const current = settledThrough(country)
  const previous = pack.years.filter((y) => y < current).slice(-1)[0] ?? null
  return { current, previous }
}

/** Exposure beneath a node = Σ of the fines of the compliance ENTITIES under it.
 *
 *  This is not the same as `node.fine`, and the difference matters. A fine is
 *  levied per manufacturer, so a market's exposure is the sum of what each
 *  manufacturer owes — never the fine a hypothetical single entity would owe on
 *  the blended market average. Netting a long maker against a short one to get
 *  a market number would understate the real liability, which is exactly the
 *  mistake this helper exists to prevent. */
export function entityExposure(node: Aggregate): number {
  if (node.level === 'parent') return node.fine
  if (!node.children?.length) return node.fine
  return node.children.reduce((a, c) => a + entityExposure(c), 0)
}

export function usePosition(basis: Basis = 'working', parent?: string) {
  const country = useApp((s) => s.country)
  const working = useApp((s) => s.scenario)

  const pack = getPack(country)
  const raw = useMemo(() => getFleet(country), [country])
  const meta = useMemo(() => getMeta(country), [country])

  const scenario = useMemo<Scenario>(
    () => (basis === 'actuals' ? { ...baseScenario(country), year: working.year } : working),
    [basis, country, working],
  )

  const tree = useMemo(() => buildTree(raw, pack, scenario), [raw, pack, scenario])
  const drill = useMemo(() => buildDrillTree(raw, pack, scenario), [raw, pack, scenario])
  const maker = useMemo(
    () => (parent ? aggregateParent(raw, pack, scenario, parent) : null),
    [raw, pack, scenario, parent],
  )

  /** Manufacturers with actual volume, worst position first — the order every
   *  table in the product wants, computed once. */
  const makers = useMemo<Aggregate[]>(
    () => (tree.children ?? []).filter((c) => c.rawUnits > 0).sort((a, b) => b.gap - a.gap),
    [tree],
  )

  const totals = useMemo(() => {
    // Σ per-entity fines — see entityExposure above for why this is not tree.fine.
    const exposure = makers.reduce((a, m) => a + m.fine, 0)
    const over = makers.filter((m) => m.status === 'fine').length
    return { exposure, over, count: makers.length, units: makers.reduce((a, m) => a + m.rawUnits, 0) }
  }, [makers])

  return { pack, raw, meta, scenario, tree, drill, maker, makers, totals, country, basis }
}

/** The same position across several years — the input to every trend chart. */
export function useSeries(years: number[], basis: Basis = 'working') {
  const country = useApp((s) => s.country)
  const working = useApp((s) => s.scenario)
  const pack = getPack(country)
  const raw = useMemo(() => getFleet(country), [country])

  return useMemo(() => years.map((y) => {
    const s: Scenario = basis === 'actuals'
      ? { ...baseScenario(country), year: y }
      : { ...working, year: y }
    const t = buildTree(raw, pack, s)
    return { year: y, metric: t.avgMetric, limit: t.limit, gap: t.gap, fine: entityExposure(t), units: t.rawUnits, zev: t.zlevShare }
  }), [years, raw, pack, country, working, basis])
}
