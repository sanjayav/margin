import { useMemo } from 'react'
import { useStore, defaultScenario } from '../state/store'
import { getPack } from '../engine/rulepacks'
import { getFleet, getMeta, type FleetMeta } from '../data/fleet'
import { buildTree, buildDrillTree, aggregateParent } from '../engine/engine'
import type { Scenario } from '../engine/types'

/** Data basis for every computed number on a screen.
 *  'live'    — the working assumptions (levers, overrides): the modelling basis.
 *  'actuals' — the as-sold book of record: pristine defaults + the shared
 *              reporting year. Structurally unreachable by levers, so a screen
 *              on this basis can never show yesterday's slider positions. */
export type Basis = 'live' | 'actuals'

const NO_OVERRIDES: Record<string, Partial<Scenario>> = {}

/** Everything live: rebuilds whenever country, year, any scenario control, or the
 *  loaded dataset changes. Uses live DB data if loaded, else the bundled extract.
 *  Pass basis='actuals' for monitoring surfaces (Analyse, Credit book): levers
 *  and per-maker overrides are ignored; only the reporting year follows. */
export function useCompliance(basis: Basis = 'live') {
  const country = useStore((s) => s.country)
  const liveScenario = useStore((s) => s.scenario)
  const selectedParent = useStore((s) => s.selectedParent)
  const dataVersion = useStore((s) => s.dataVersion)
  const liveOverrides = useStore((s) => s.makerOverrides)

  const pack = getPack(country)
  const raw = useMemo(() => getFleet(country), [country, dataVersion])
  const meta: FleetMeta = useMemo(() => getMeta(country), [country, dataVersion]) // eslint-disable-line react-hooks/exhaustive-deps

  const scenario = useMemo<Scenario>(
    () => (basis === 'actuals' ? { ...defaultScenario(country), year: liveScenario.year } : liveScenario),
    [basis, country, liveScenario],
  )
  const overrides = basis === 'actuals' ? NO_OVERRIDES : liveOverrides

  const tree = useMemo(() => buildTree(raw, pack, scenario, overrides), [raw, pack, scenario, overrides])
  // 5-level drill tree (Market → Pool → Manufacturer → Model → Variant) for the
  // bubble explorer and the assumptions scope.
  const drillTree = useMemo(() => buildDrillTree(raw, pack, scenario, overrides), [raw, pack, scenario, overrides])
  const parent = useMemo(
    () => aggregateParent(raw, pack, scenario, selectedParent, overrides),
    [raw, pack, scenario, selectedParent, overrides],
  )

  return { pack, raw, tree, drillTree, parent, scenario, overrides, selectedParent, country, basis, meta }
}
