import { useMemo } from 'react'
import { useCompliance } from '../lib/useCompliance'
import { useStore } from '../state/store'
import { fmtMoney, fmtNum, fmtInt } from '../engine/engine'
import { yearSeries, mixSeries, makerYearGap, makerRows, makerMekko } from '../lib/analytics'
import { TrendChart, MixArea, GapHeatmap, FineRanking, Mekko, Legend } from '../components/Charts'
import { Section, Stat } from '../components/ui'
import { useCountUp } from '../lib/useCountUp'

export default function Analytics() {
  const { pack, raw, tree, scenario, country } = useCompliance()
  const ov = useStore((s) => s.makerOverrides)
  const dv = useStore((s) => s.dataVersion)
  const setDrill = useStore((s) => s.setDrill)
  const setParent = useStore((s) => s.setParent)
  const setScreen = useStore((s) => s.setScreen)

  const trend = useMemo(() => yearSeries(raw, pack, scenario, ov), [raw, pack, scenario, ov, dv])
  const mix = useMemo(() => mixSeries(raw, pack, scenario, ov), [raw, pack, scenario, ov, dv])
  const heat = useMemo(() => makerYearGap(raw, pack, scenario, ov), [raw, pack, scenario, ov, dv])
  const rows = useMemo(() => makerRows(raw, pack, scenario, ov), [raw, pack, scenario, ov, dv])
  const mekko = useMemo(() => makerMekko(raw, pack, scenario, ov), [raw, pack, scenario, ov, dv])

  const openMaker = (m: string) => { setParent(m); setDrill([m]); setScreen('analyze') }

  const marketFine = rows.reduce((a, r) => a + r.fine, 0)
  const totalUnits = rows.reduce((a, r) => a + r.units, 0)
  const zeShare = tree.zlevShare
  const fineA = useCountUp(marketFine)
  const avgA = useCountUp(tree.avgMetric)
  const overCount = rows.filter((r) => r.status === 'fine').length

  return (
    <div className="space-y-5">
      {/* KPI band */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat className="rise" label={`Fleet ${pack.metricUnit}`} value={fmtNum(avgA, 1)} sub={`limit ${fmtNum(tree.limit, 1)}`} accent={tree.gap > 0 ? 'text-danger' : 'text-safe'} />
        <Stat className="rise [animation-delay:60ms]" label="Market exposure" value={fmtMoney(fineA, pack.currency)} sub={`${overCount} of ${rows.length} over`} accent={marketFine > 0 ? 'text-danger' : 'text-safe'} />
        <Stat className="rise [animation-delay:120ms]" label="Registrations" value={fmtInt(totalUnits)} sub={`${rows.length} makers`} />
        <Stat className="rise [animation-delay:180ms]" label="Zero-emission" value={`${Math.round(zeShare * 100)}%`} accent="text-accent" />
        <Stat className="rise [animation-delay:240ms]" label="Years" value={`${pack.years[0]}–${pack.years[pack.years.length - 1]}`} sub="compliance horizon" />
      </div>

      {/* Trend hero */}
      <Section className="rise [animation-delay:300ms]" title="Fleet vs limit · trajectory"
        right={<span className="flex items-center gap-3 text-[10px] text-ink-500"><span className="flex items-center gap-1"><i className="inline-block h-2 w-3 rounded bg-brand" />fleet</span><span className="flex items-center gap-1"><i className="inline-block h-2 w-3 rounded bg-[#E0A100]" />limit</span></span>}>
        <TrendChart series={trend} unit={pack.metricUnit} currency={pack.currency} />
      </Section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Section className="rise [animation-delay:360ms]" title="Powertrain mix · over time" right={<Legend pts={mix.pts} />}>
          <MixArea pts={mix.pts} series={mix.series} />
        </Section>
        <Section className="rise [animation-delay:420ms]" title="Gap to limit · maker × year" right={<span className="text-[10px] text-ink-500">click → drill</span>}>
          <GapHeatmap data={heat} unit={pack.metricUnit} onPick={openMaker} />
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Section className="rise [animation-delay:480ms]" title="Exposure ranking" right={<span className="text-[10px] text-ink-500">click → drill</span>}>
          <FineRanking rows={rows} currency={pack.currency} unit={pack.metricUnit} onPick={openMaker} />
        </Section>
        <Section className="rise [animation-delay:540ms]" title="Volume × mix" right={<span className="text-[10px] text-ink-500">width = units</span>}>
          <Mekko cols={mekko} onPick={openMaker} />
        </Section>
      </div>
    </div>
  )
}
