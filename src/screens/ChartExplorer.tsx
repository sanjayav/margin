import { useMemo } from 'react'
import { useCompliance } from '../lib/useCompliance'
import { useStore } from '../state/store'
import type { Aggregate } from '../engine/types'
import { fmtInt, fmtMoney, fmtNum } from '../engine/engine'
import LimitChart from '../components/LimitChart'
import { Section, StatusPill } from '../components/ui'
import Icon from '../components/Icon'
import { makeLimitAt, pointsFromChildren, fleetPoint } from '../lib/chart'

function nodeAt(root: Aggregate, path: string[]): Aggregate {
  let node = root
  for (const seg of path) {
    const next = node.children?.find((c) => c.label === seg)
    if (!next) break
    node = next
  }
  return node
}

export default function ChartExplorer() {
  const { pack, tree, scenario } = useCompliance()
  const drill = useStore((s) => s.drillPath)
  const setDrill = useStore((s) => s.setDrill)

  const node = useMemo(() => nodeAt(tree, drill), [tree, drill])
  const limitAt = useMemo(() => makeLimitAt(pack, scenario, node), [pack, scenario, node])
  const hasChildren = (node.children?.length ?? 0) > 0

  const points = useMemo(
    () => (hasChildren ? pointsFromChildren(node.children!) : [fleetPoint(node)]),
    [node, hasChildren],
  )

  const crumbs = ['Whole market', ...drill]
  const levelName = ['makers', 'models', 'engine types', 'detail'][drill.length] ?? 'detail'

  return (
    <div className="space-y-5 animate-slidein">
      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center gap-1.5 text-sm">
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1.5">
            <button onClick={() => setDrill(drill.slice(0, i))}
              className={`rounded-lg px-2 py-1 font-medium transition ${i === crumbs.length - 1 ? 'text-ink-100' : 'text-ink-500 hover:text-ink-100'}`}>{c}</button>
            {i < crumbs.length - 1 && <span className="text-ink-600">/</span>}
          </span>
        ))}
        {drill.length > 0 && <button onClick={() => setDrill(drill.slice(0, -1))} className="ml-2 flex items-center gap-1 rounded-lg border border-black/[0.08] px-2 py-1 text-[11px] text-ink-400 transition hover:text-ink-100 hover:border-black/20"><Icon name="reset" size={12} /> Up one level</button>}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="card p-4">
          <div className="label">{node.label}</div>
          <div className={`mt-1 num text-2xl font-bold ${node.gap > 0 ? 'text-danger' : 'text-safe'}`}>{fmtNum(node.avgMetric, 1)} <span className="text-sm text-ink-500">{pack.metricUnit}</span></div>
          <div className="mt-1 text-xs text-ink-500">limit {fmtNum(node.limit, 1)} · gap {node.gap > 0 ? '+' : ''}{fmtNum(node.gap, 1)}</div>
          <div className="mt-2"><StatusPill status={node.status} /></div>
        </div>
        <div className="card p-4">
          <div className="label">Registrations</div>
          <div className="mt-1 num text-2xl font-bold text-ink-100">{fmtInt(node.rawUnits)}</div>
          <div className="text-xs text-ink-500">{Math.round(node.zlevShare * 100)}% zero-emission · avg {pack.massLabel.toLowerCase()} {fmtInt(node.avgMass)} kg</div>
        </div>
        <div className="card p-4">
          <div className="label">Fine at this level</div>
          <div className={`mt-1 num text-2xl font-bold ${node.fine > 0 ? 'text-danger' : 'text-safe'}`}>{fmtMoney(node.fine, pack.currency)}</div>
          <div className="text-xs text-ink-500">{node.fineMath.expression}</div>
        </div>
      </div>

      <Section title={hasChildren ? `Drill down — click a point or row to open one of ${node.children!.length} ${levelName}` : 'Leaf level — engine type detail'}>
        <LimitChart pack={pack} limitAt={limitAt} points={points} height={380}
          onPick={(k) => { const c = node.children?.find((x) => x.key === k); if (c?.children?.length) setDrill([...drill, c.label]) }} />
      </Section>

      {hasChildren && (
        <Section title="Breakdown">
          <div className="overflow-hidden rounded-xl border border-black/[0.06]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-black/[0.03] text-left text-[11px] uppercase tracking-wider text-ink-500">
                  <th className="px-4 py-2.5 font-semibold">{levelName}</th>
                  <th className="px-4 py-2.5 text-right font-semibold">{pack.metricLabel}</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Limit</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Gap</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Units</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Fine</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {node.children!.map((c) => (
                  <tr key={c.key} onClick={() => c.children?.length && setDrill([...drill, c.label])}
                    className={`border-t border-black/[0.04] transition ${c.children?.length ? 'cursor-pointer hover:bg-black/[0.03]' : ''}`}>
                    <td className="px-4 py-2.5 font-medium text-ink-100">{c.label}</td>
                    <td className="px-4 py-2.5 text-right num">{fmtNum(c.avgMetric, 1)}</td>
                    <td className="px-4 py-2.5 text-right num text-ink-500">{fmtNum(c.limit, 1)}</td>
                    <td className={`px-4 py-2.5 text-right num font-semibold ${c.gap > 0 ? 'text-danger' : 'text-safe'}`}>{c.gap > 0 ? '+' : ''}{fmtNum(c.gap, 1)}</td>
                    <td className="px-4 py-2.5 text-right num text-ink-500">{fmtInt(c.rawUnits)}</td>
                    <td className={`px-4 py-2.5 text-right num ${c.fine > 0 ? 'text-danger' : 'text-ink-500'}`}>{fmtMoney(c.fine, pack.currency)}</td>
                    <td className="px-4 py-2.5 text-right"><StatusPill status={c.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  )
}
