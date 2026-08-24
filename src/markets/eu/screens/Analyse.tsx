// ───────────────────────────────────────────────────────────────────────────
// EU · ANALYSE — the evidence surface.
//
// One job: go from "the market is 3.7 over" to the specific rows responsible,
// and be able to defend every step. So the working surface is a drill and
// nothing else, and the Inspector — for the first time in this app, a pane with
// a fixed meaning — always explains whatever is selected.
//
// It absorbs the old Compare and Intelligence screens, because both were asking
// the same question at a different scope: what is inside this number.
// ───────────────────────────────────────────────────────────────────────────
import { useMemo } from 'react'
import { useCompliance } from '../../../lib/useCompliance'
import { useStore } from '../../../state/store'
import { fmtInt, fmtMoney, fmtNum } from '../../../engine/engine'
import type { Aggregate } from '../../../engine/types'
import Shell from '../../../app/Shell'
import { Table, Status, Figure, Provenance, type Column } from '../../../design/primitives'
import Answer from '../../../design/patterns/Answer'
import BrandChip from '../../../components/BrandChip'
import { ptColor } from '../../../lib/palette'
import Icon from '../../../components/Icon'

const nodeAt = (root: Aggregate, path: string[]): Aggregate => {
  let n = root
  for (const seg of path) { const next = n.children?.find((c) => c.label === seg); if (!next) break; n = next }
  return n
}

/** A pool with one member is not a pool — step through it. (Same rule the legacy
 *  drill uses; 85 of the EU's 92 pools are single-maker.) */
const solo = (n?: Aggregate) => !!n && (n.children?.length ?? 0) === 1

export default function EUAnalyse() {
  const { pack, tree, drillTree, meta, scenario } = useCompliance('actuals')
  const drill = useStore((s) => s.drillPath)
  const setDrill = useStore((s) => s.setDrill)
  const setParent = useStore((s) => s.setParent)

  const node = useMemo(() => nodeAt(drillTree, drill), [drillTree, drill])
  const poolSeg = drill.length ? drillTree.children?.find((c) => c.label === drill[0]) : undefined
  const hidePool = solo(poolSeg)
  const crumbs = ['Market', ...(hidePool ? drill.slice(1) : drill)]
  const crumbLen = (i: number) => (hidePool ? (i === 0 ? 0 : i + 1) : i)

  const kids = useMemo(() =>
    (node.children ?? []).filter((c) => c.rawUnits > 0).sort((a, b) => b.fine - a.fine || b.rawUnits - a.rawUnits),
    [node])

  // Exposure is ALWAYS the sum of per-MANUFACTURER liabilities, because that is
  // who receives a bill. Summing the drill's children is only the same thing
  // below the pool tier: at market level the children are pools, so summing them
  // gives the POOLED liability (EUR 7.29bn) rather than the standalone one
  // (EUR 10.77bn). Both are real, they differ by what pooling removes, and
  // showing one where the reader expects the other — two inches from the top
  // bar showing the other — is how a product loses its credibility.
  const exposure = useMemo(() => {
    if (drill.length === 0) return (tree.children ?? []).reduce((a, m) => a + m.fine, 0) // manufacturers
    if (drill.length === 1) return (node.children ?? []).reduce((a, m) => a + m.fine, 0) // pool → its makers
    return node.fine // a manufacturer or below: its own liability
  }, [drill.length, tree, node])
  const exposureBasis = drill.length === 0
    ? `standalone across ${(tree.children ?? []).filter((m) => m.fine > 0).length} manufacturers · before pooling`
    : drill.length === 1
      ? `${(node.children ?? []).length} pool member${(node.children ?? []).length === 1 ? '' : 's'}, standalone`
      : pack.fineRateLabel

  const into = (label: string) => {
    const child = node.children?.find((c) => c.label === label)
    if (!child) return
    let next = [...drill, label]
    if (drill.length === 0 && solo(child)) next = [...next, child.children![0].label]
    if (next.length >= 2) setParent(next[1])
    setDrill(next)
  }

  const level = drill.length
  const childLabel = level === 0 ? 'Pools' : level === 1 ? 'Manufacturers' : level === 2 ? 'Models' : 'Variants'

  const cols: Column<Aggregate>[] = [
    {
      key: 'name', header: childLabel.replace(/s$/, ''), width: '32%',
      cell: (c) => (
        <span className="flex items-center gap-2.5">
          {level <= 1 ? <BrandChip name={c.label} size={20} />
            : <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: ptColor(c.vehicles[0]?.powertrain ?? '') }} />}
          <span className="truncate font-medium text-[#F6F2EB]">{c.label}</span>
        </span>
      ),
    },
    { key: 'units', header: 'Registrations', align: 'right', cell: (c) => fmtInt(c.rawUnits) },
    { key: 'metric', header: `Fleet ${pack.metricUnit}`, align: 'right', cell: (c) => fmtNum(c.avgMetric, 1) },
    { key: 'limit', header: 'Target', align: 'right', cell: (c) => <span className="text-[#7E756A]">{fmtNum(c.limit, 1)}</span> },
    {
      key: 'gap', header: 'Gap', align: 'right', width: '13%',
      cell: (c) => (
        <span className="inline-flex items-center justify-end gap-1.5 font-semibold" style={{ color: c.gap > 0 ? '#E0484D' : '#0E9F6E' }}>
          <span aria-hidden>{c.gap > 0 ? '▲' : '▼'}</span>{c.gap > 0 ? '+' : ''}{fmtNum(c.gap, 1)}
        </span>
      ),
    },
    { key: 'st', header: '', width: '10%', cell: (c) => (c.status === 'fine' || c.status === 'compliant' ? null : <Status status={c.status} />) },
    { key: 'fine', header: 'Exposure', align: 'right', cell: (c) => <span className="font-semibold text-[#F6F2EB]">{c.fine > 0 ? fmtMoney(c.fine, pack.currency) : '—'}</span> },
  ]

  return (
    <Shell inspectorTitle="Evidence" inspector={<Evidence node={node} pack={pack} meta={meta} year={scenario.year} />}>
      <nav aria-label="Drill" className="mb-6 flex flex-wrap items-center gap-1.5 text-[12.5px]">
        {crumbs.map((c, i) => (
          <span key={`${c}-${i}`} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden className="text-[#5A534A]">/</span>}
            <button onClick={() => setDrill(drill.slice(0, crumbLen(i)))}
              className={i === crumbs.length - 1 ? 'font-semibold text-[#F6F2EB]' : 'text-[#7E756A] hover:text-[#B8AEA0]'}>
              {c}
            </button>
          </span>
        ))}
      </nav>

      <h1 className="font-display text-[22px] font-bold tracking-[-0.02em] text-[#F6F2EB]">{node.label}</h1>
      <p className="mt-1.5 text-[13px] text-[#7E756A]">
        {fmtInt(node.rawUnits)} registrations · {kids.length} {childLabel.toLowerCase()}
        {exposure > 0 && <> · <span className="font-semibold text-danger">{fmtMoney(exposure, pack.currency)}</span> exposed</>}
      </p>

      {/* ≤4 measures above the fold — Stripe's discipline. The fifth belongs in
          the Inspector, and it is there. */}
      <div className="mt-7 grid gap-8 sm:grid-cols-4">
        <Figure label={`Fleet ${pack.metricUnit}`} value={fmtNum(node.avgMetric, 1)} basis="registration-weighted, after credits" />
        <Figure label="Target" value={fmtNum(node.limit, 1)} basis="mass-adjusted, ZLEV-relaxed" />
        <Figure label="Gap" value={`${node.gap > 0 ? '+' : ''}${fmtNum(node.gap, 1)}`} basis="fleet minus target" tone={node.gap > 0 ? 'bad' : 'good'} />
        <Figure label="Exposure" value={exposure > 0 ? fmtMoney(exposure, pack.currency) : '—'}
          basis={exposureBasis} tone={exposure > 0 ? 'bad' : 'neutral'} />
      </div>

      <div className="mt-10">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-display text-[15px] font-bold text-[#F6F2EB]">{childLabel}</h2>
          <span className="text-[11.5px] text-[#7E756A]">{level < 3 ? 'Select a row to go deeper' : 'Leaf level'}</span>
        </div>
        <Table columns={cols} rows={kids} rowKey={(c) => c.key}
          onRowClick={level < 3 ? (c) => into(c.label) : undefined}
          empty="No registrations at this scope." />
      </div>
    </Shell>
  )
}

/* ── The Inspector — one job: explain what is selected ─────────────────────── */
function Evidence({ node, pack, meta, year }: { node: Aggregate; pack: any; meta: any; year: number }) {
  const mix = useMemo(() => {
    const by = new Map<string, number>()
    for (const v of node.vehicles) by.set(v.powertrain, (by.get(v.powertrain) ?? 0) + v.sales)
    const total = [...by.values()].reduce((a, b) => a + b, 0) || 1
    return [...by.entries()].map(([pt, u]) => ({ pt, share: u / total })).sort((a, b) => b.share - a.share)
  }, [node])

  return (
    <div className="space-y-7">
      <Answer dense
        value={`${node.gap > 0 ? '+' : ''}${fmtNum(node.gap, 1)}`}
        unit={pack.metricUnit}
        tone={node.gap > 0 ? 'bad' : 'good'}
        sentence={node.gap > 0
          ? <>{node.label} is over its own target, so the penalty applies to every one of its {fmtInt(node.rawUnits)} registrations.</>
          : <>{node.label} is under its target. Its headroom can carry a pool partner.</>}
        evidence={[
          { label: 'Fleet, after credits', value: `${fmtNum(node.avgMetric, 1)}` },
          { label: 'Tailpipe, before credits', value: `${fmtNum(node.rawAvgMetric, 1)}` },
          { label: 'Average test mass', value: `${fmtNum(node.avgMass, 0)} kg` },
          { label: 'Specific target', value: `${fmtNum(node.limit, 1)}` },
          { label: 'Zero-emission share', value: `${(node.zlevShare * 100).toFixed(1)}%` },
        ]}
        sources={[{ name: meta.source, vintage: `${year} · ${pack.coverage.label}` }, { name: 'Target line', authority: pack.limitNote }]}
      />

      <div>
        <div className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.13em] text-[#7E756A]">Powertrain mix</div>
        <div className="flex h-2 overflow-hidden rounded-full">
          {mix.map((m) => <span key={m.pt} style={{ width: `${m.share * 100}%`, background: ptColor(m.pt) }} title={`${m.pt} ${(m.share * 100).toFixed(1)}%`} />)}
        </div>
        <ul className="mt-3 space-y-1.5">
          {mix.slice(0, 5).map((m) => (
            <li key={m.pt} className="flex items-center gap-2 text-[11.5px]">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: ptColor(m.pt) }} />
              <span className="flex-1 text-[#7E756A]">{m.pt}</span>
              <span className="dnum tabular-nums font-semibold text-[#B8AEA0]">{(m.share * 100).toFixed(1)}%</span>
            </li>
          ))}
        </ul>
      </div>

      {/* The Inspector explains; it never decides. No primary action here. */}
      <div className="border-t border-white/[0.07] pt-5">
        <Provenance source={meta.source} vintage={`${year} position`} />
        <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-[#7E756A]">
          <Icon name="shield" size={11} className="mt-[2px] shrink-0" />
          Every figure here is computed by the engine from the registrations above — none of it is estimated.
        </p>
      </div>
    </div>
  )
}
