import { useMemo } from 'react'
import { useStore } from '../state/store'
import { getPack } from '../engine/rulepacks'
import { getFleet } from '../data/fleet'
import { buildTree, aggregateParent } from '../engine/engine'

/** Everything live: rebuilds whenever country, year, any scenario control, or the
 *  loaded dataset changes. Uses live DB data if loaded, else the bundled extract. */
export function useCompliance() {
  const country = useStore((s) => s.country)
  const scenario = useStore((s) => s.scenario)
  const selectedParent = useStore((s) => s.selectedParent)
  const dataVersion = useStore((s) => s.dataVersion)
  const overrides = useStore((s) => s.makerOverrides)

  const pack = getPack(country)
  const raw = useMemo(() => getFleet(country), [country, dataVersion])

  const tree = useMemo(() => buildTree(raw, pack, scenario, overrides), [raw, pack, scenario, overrides])
  const parent = useMemo(
    () => aggregateParent(raw, pack, scenario, selectedParent, overrides),
    [raw, pack, scenario, selectedParent, overrides],
  )

  return { pack, raw, tree, parent, scenario, selectedParent, country }
}
