// ───────────────────────────────────────────────────────────────────────────
// EU · OVERVIEW — "are we over the line, what does it cost, who is driving it"
//
// The screen this replaces opened with a hero, five stat cards, a verdict strip,
// a chart and an eight-section rail: everything at once, so nothing led. Here one
// number leads, one sentence explains it, and everything below is evidence for
// that sentence in the order a reader actually needs it — the shortfall, who is
// causing it, what pooling already absorbs, and where the numbers came from.
// ───────────────────────────────────────────────────────────────────────────
import { useMemo } from 'react'
import { useCompliance } from '../../../lib/useCompliance'
import { useStore } from '../../../state/store'
import { fmtInt, fmtMoney, fmtNum } from '../../../engine/engine'
import { poolGroups } from '../../../engine/pooling'
import { MetricBand, Block, Figure, Status, Table, Provenance, type Column } from '../../../design/primitives'
import Answer from '../../../design/patterns/Answer'
import BrandChip from '../../../components/BrandChip'

interface MakerRow {
  parent: string
  units: number
  metric: number
  limit: number
  gap: number
  fine: number
  status: string
}

export default function EUOverview() {
  const { pack, tree, raw, scenario, meta } = useCompliance('actuals')
  const setScreen = useStore((s) => s.setScreen)
  const setParent = useStore((s) => s.setParent)

  const makers = useMemo<MakerRow[]>(() => (tree.children ?? [])
    .filter((m) => m.rawUnits > 0)
    .map((m) => ({ parent: m.label, units: m.rawUnits, metric: m.avgMetric, limit: m.limit, gap: m.gap, fine: m.fine, status: m.status }))
    .sort((a, b) => b.fine - a.fine || b.gap - a.gap), [tree])

  const exposure = makers.reduce((a, m) => a + m.fine, 0)
  const over = makers.filter((m) => m.fine > 0)
  const worst = over[0]

  // What pooling already removes — the EU's only transfer mechanism, so it is
  // the first thing a reader should know about the headline number.
  const pooled = useMemo(() => {
    const g = poolGroups(raw, pack, scenario)
    const standalone = g.reduce((a, x) => a + x.standaloneFine, 0)
    const after = g.reduce((a, x) => a + x.result.fine, 0)
    return { standalone, after, saved: Math.max(0, standalone - after), groups: g.filter((x) => x.members.length > 1).length }
  }, [raw, pack, scenario])

  const cols: Column<MakerRow>[] = [
    {
      key: 'maker', header: 'Manufacturer', width: '34%',
      cell: (r) => (
        <span className="flex items-center gap-2.5">
          <BrandChip name={r.parent} size={20} />
          <span className="truncate font-medium text-[#F6F2EB]">{r.parent}</span>
        </span>
      ),
    },
    { key: 'units', header: 'Registrations', align: 'right', cell: (r) => fmtInt(r.units) },
    { key: 'fleet', header: `Fleet ${pack.metricUnit}`, align: 'right', cell: (r) => fmtNum(r.metric, 1) },
    { key: 'limit', header: 'Target', align: 'right', cell: (r) => <span className="text-[#7E756A]">{fmtNum(r.limit, 1)}</span> },
    {
      // The gap carries the state on three channels at once: the SIGN, the
      // colour and the arrow. A separate Status column repeating "Over the line"
      // on 60 consecutive rows adds no information and a lot of noise — so the
      // words appear only where the state is NOT obvious from the number
      // (exempt makers owe nothing despite a positive gap; no-sales have none).
      key: 'gap', header: 'Gap', align: 'right', width: '13%',
      cell: (r) => (
        <span className="inline-flex items-center justify-end gap-1.5 font-semibold"
          style={{ color: r.gap > 0 ? '#E0484D' : '#0E9F6E' }}>
          <span aria-hidden>{r.gap > 0 ? '▲' : '▼'}</span>
          {r.gap > 0 ? '+' : ''}{fmtNum(r.gap, 1)}
        </span>
      ),
    },
    {
      key: 'status', header: '', width: '11%',
      cell: (r) => (r.status === 'fine' || r.status === 'compliant' ? null : <Status status={r.status} />),
    },
    {
      key: 'fine', header: 'Exposure', align: 'right',
      cell: (r) => <span className="font-semibold text-[#F6F2EB]">{r.fine > 0 ? fmtMoney(r.fine, pack.currency) : '—'}</span>,
    },
  ]

  return (
    <div className="mx-auto max-w-[1200px]">
      <MetricBand
        eyebrow={`${pack.name} · ${scenario.year} · book of record`}
        value={fmtMoney(exposure, pack.currency)}
        unit="exposed at today's registrations"
        tone={exposure > 0 ? 'bad' : 'good'}
        sentence={over.length === 0
          ? <>Every manufacturer is under its target. There is no penalty at today's mix.</>
          : <><b className="text-[#F6F2EB]">{over.length} of {makers.length}</b> manufacturers are over their target for {scenario.year}
              {worst && <>, led by <b className="text-[#F6F2EB]">{worst.parent}</b> at {fmtMoney(worst.fine, pack.currency)}</>}.
              {pooled.saved > 0 && <> Article 6 pooling already absorbs {fmtMoney(pooled.saved, pack.currency)} of it.</>}</>}
        secondary={[
          { label: 'Fleet', value: `${fmtNum(tree.avgMetric, 1)} ${pack.metricUnit}` },
          { label: 'Target', value: fmtNum(tree.limit, 1) },
          { label: 'Gap', value: `${tree.gap > 0 ? '+' : ''}${fmtNum(tree.gap, 1)}`, tone: tree.gap > 0 ? 'bad' : 'good' },
        ]}
        action={over.length ? { label: 'Model a way under the line', icon: 'target', onClick: () => setScreen('under') } : undefined}
      />

      <Block title="How the market number is built"
        hint="Open it. Every figure in AiRE expands into the computation that produced it and the source it rests on.">
        <Answer
          question={`Why is ${pack.name} ${tree.gap > 0 ? 'over' : 'under'} the line in ${scenario.year}?`}
          value={`${tree.gap > 0 ? '+' : ''}${fmtNum(tree.gap, 1)}`}
          unit={`${pack.metricUnit} against the market's own target`}
          tone={tree.gap > 0 ? 'bad' : 'good'}
          sentence={<>The registration-weighted fleet is <b>{fmtNum(tree.avgMetric, 1)} {pack.metricUnit}</b> against a
            mass-adjusted target of <b>{fmtNum(tree.limit, 1)}</b>. The penalty is charged per manufacturer, not on this
            average — which is why {over.length} makers owe {fmtMoney(exposure, pack.currency)} while the market sits
            {Math.abs(tree.gap) < 1 ? ' barely ' : ' '}{tree.gap > 0 ? 'above' : 'below'} its own line.</>}
          evidence={[
            { label: 'Fleet CO₂, registration-weighted', value: `${fmtNum(tree.avgMetric, 1)} ${pack.metricUnit}`, note: `across ${fmtInt(tree.rawUnits)} registrations, after eco-innovation and the PHEV utility factor` },
            { label: 'Average test mass', value: `${fmtNum(tree.avgMass, 0)} kg`, note: 'the basis the post-2024 target formula uses' },
            { label: 'Specific target', value: `${fmtNum(tree.limit, 1)} ${pack.metricUnit}`, note: 'EU fleet target, mass-adjusted, then relaxed by the ZLEV factor' },
            { label: 'Gap', value: `${tree.gap > 0 ? '+' : ''}${fmtNum(tree.gap, 1)}`, note: 'fleet minus target' },
            { label: 'Exposure, summed per manufacturer', value: fmtMoney(exposure, pack.currency), note: `${pack.fineRateLabel}` },
          ]}
          sources={[
            { name: meta.source, vintage: pack.coverage.label },
            { name: 'Target line', authority: pack.limitNote },
            { name: 'Penalty', authority: pack.fineRateLabel },
          ]}
        />
      </Block>

      <Block title="Where the exposure sits"
        hint="Every manufacturer assessed standalone against its own mass-adjusted target."
        action={<button onClick={() => setScreen('analyse')} className="text-[12.5px] font-semibold text-brand hover:underline">Open the drill →</button>}>
        <div className="mb-7 grid gap-8 sm:grid-cols-3">
          <Figure label="Manufacturers over" value={`${over.length}`} unit={`of ${makers.length}`}
            basis="assessed standalone, before any pool" tone={over.length ? 'bad' : 'good'} size="lg" />
          <Figure label="Pooling removes" value={fmtMoney(pooled.saved, pack.currency)}
            basis={`${pooled.groups} declared multi-member pools`} tone="good" size="lg" />
          <Figure label="After pooling" value={fmtMoney(pooled.after, pack.currency)}
            basis="residual that no partner can absorb" tone={pooled.after > 0 ? 'bad' : 'good'} size="lg" />
        </div>
        <Table columns={cols} rows={makers.slice(0, 12)} rowKey={(r) => r.parent}
          onRowClick={(r) => { setParent(r.parent); setScreen('analyse') }} />
        {makers.length > 12 && (
          <button onClick={() => setScreen('analyse')} className="mt-4 text-[12.5px] font-semibold text-brand hover:underline">
            All {makers.length} manufacturers →
          </button>
        )}
      </Block>

      <Block title="Where these numbers come from">
        <Provenance source={meta.source} vintage={meta.lastRefreshed ? `refreshed ${new Date(meta.lastRefreshed).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'bundled extract'}
          detail={pack.coverage.label} />
        <p className="mt-3 max-w-[76ch] text-[12.5px] leading-relaxed text-[#7E756A]">{pack.limitNote}</p>
      </Block>
    </div>
  )
}
