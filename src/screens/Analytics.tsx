import { useMemo, useState } from 'react'
import { useCompliance } from '../lib/useCompliance'
import { useStore } from '../state/store'
import { fmtMoney, fmtNum, fmtInt, aggregateParent } from '../engine/engine'
import { yearSeries, mixSeries, makerYearGap, makerRows, makerMekko } from '../lib/analytics'
import { parentPoolMap } from '../engine/pooling'
import { TrendChart, MixArea, GapHeatmap, FineRanking, Mekko, Legend } from '../components/Charts'
import { Section, Stat } from '../components/ui'
import { useCountUp } from '../lib/useCountUp'
import { parentsFor } from '../data/fleet'
import Icon from '../components/Icon'

export default function Analytics() {
  const { pack, raw, tree, scenario, country } = useCompliance()
  const ov = useStore((s) => s.makerOverrides)
  const dv = useStore((s) => s.dataVersion)
  const setDrill = useStore((s) => s.setDrill)
  const setParent = useStore((s) => s.setParent)
  const setScreen = useStore((s) => s.setScreen)

  // OEM focus — 'ALL' = whole market, else zoom every panel into one manufacturer.
  const [focus, setFocus] = useState<string>('ALL')
  const oems = useMemo(() => parentsFor(country), [country, dv])
  const focused = focus !== 'ALL' && oems.includes(focus)
  const foc = focused ? focus : null

  const trend = useMemo(() => yearSeries(raw, pack, scenario, ov, foc), [raw, pack, scenario, ov, dv, foc])
  const mix = useMemo(() => mixSeries(raw, pack, scenario, ov, foc), [raw, pack, scenario, ov, dv, foc])
  const heat = useMemo(() => makerYearGap(raw, pack, scenario, ov, foc), [raw, pack, scenario, ov, dv, foc])
  const rows = useMemo(() => makerRows(raw, pack, scenario, ov, foc), [raw, pack, scenario, ov, dv, foc])
  const mekko = useMemo(() => makerMekko(raw, pack, scenario, ov, foc), [raw, pack, scenario, ov, dv, foc])

  // The OEM's own aggregate (for the KPI band + headline when focused).
  const oemNode = useMemo(() => (focused ? aggregateParent(raw, pack, scenario, focus, ov) : null), [focused, raw, pack, scenario, focus, ov, dv])

  // Clicking a cell/row drills into Analyze through the full hierarchy
  // (Market → Pool → Manufacturer → Model): a manufacturer at market level, or a
  // model within the focused OEM. The pool is resolved from the registered pools.
  const pmap = useMemo(() => parentPoolMap(raw, scenario.year), [raw, scenario.year])
  const openItem = (m: string) => {
    if (focused) { setParent(focus); setDrill([pmap[focus] ?? focus, focus, m]) } // m = model
    else { setParent(m); setDrill([pmap[m] ?? m, m]) } // m = manufacturer
    setScreen('analyze')
  }

  const headFine = focused ? (oemNode?.fine ?? 0) : rows.reduce((a, r) => a + r.fine, 0)
  const headAvg = focused ? (oemNode?.avgMetric ?? 0) : tree.avgMetric
  const headLimit = focused ? (oemNode?.limit ?? 0) : tree.limit
  const headGap = focused ? (oemNode?.gap ?? 0) : tree.gap
  const headUnits = focused ? (oemNode?.rawUnits ?? 0) : rows.reduce((a, r) => a + r.units, 0)
  const headZe = focused ? (oemNode?.zlevShare ?? 0) : tree.zlevShare
  const overCount = focused ? ((oemNode?.gap ?? 0) > 0 ? 1 : 0) : rows.filter((r) => r.status === 'fine').length
  const overOf = focused ? 1 : rows.length
  const breakdownLabel = focused ? 'models' : 'makers'

  const fineA = useCountUp(headFine)
  const avgA = useCountUp(headAvg)

  return (
    <div className="space-y-5">
      {/* OEM focus selector */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="label flex items-center gap-1.5 text-ink-400"><Icon name="layers" size={13} /> View</span>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setFocus('ALL')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${!focused ? 'bg-ink-100 text-white' : 'bg-black/5 text-ink-500 hover:text-ink-100'}`}>All OEMs</button>
          {oems.map((m) => (
            <button key={m} onClick={() => setFocus(m)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${focus === m ? 'bg-ink-100 text-white' : 'bg-black/5 text-ink-500 hover:text-ink-100'}`}>{m}</button>
          ))}
        </div>
        {focused && <span className="ml-auto chip"><Icon name="target" size={12} /> {focus} · {oemNode?.status === 'fine' ? 'over the line' : 'under the line'}</span>}
      </div>

      {/* KPI band */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat className="rise" label={`${focused ? focus.split(' ')[0] + ' ' : 'Fleet '}${pack.metricUnit}`} value={fmtNum(avgA, 1)} sub={`limit ${fmtNum(headLimit, 1)}`} accent={headGap > 0 ? 'text-danger' : 'text-safe'} />
        <Stat className="rise [animation-delay:60ms]" label={focused ? 'Exposure' : 'Market exposure'} value={fmtMoney(fineA, pack.currency)} sub={`${overCount} of ${overOf} over`} accent={headFine > 0 ? 'text-danger' : 'text-safe'} />
        <Stat className="rise [animation-delay:120ms]" label="Registrations" value={fmtInt(headUnits)} sub={focused ? `${rows.length} models` : `${rows.length} makers`} />
        <Stat className="rise [animation-delay:180ms]" label="Zero-emission" value={`${Math.round(headZe * 100)}%`} accent="text-accent" />
        <Stat className="rise [animation-delay:240ms]" label="Years" value={`${pack.years[0]}–${pack.years[pack.years.length - 1]}`} sub="compliance horizon" />
      </div>

      {/* Trend hero */}
      <Section className="rise [animation-delay:300ms]" title={`${focused ? focus + ' fleet' : 'Fleet'} vs limit · trajectory`}
        right={<span className="flex items-center gap-3 text-[10px] text-ink-500"><span className="flex items-center gap-1"><i className="inline-block h-2 w-3 rounded bg-brand" />fleet</span><span className="flex items-center gap-1"><i className="inline-block h-2 w-3 rounded bg-[#E0A100]" />limit</span></span>}>
        <TrendChart series={trend} unit={pack.metricUnit} currency={pack.currency} />
      </Section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Section className="rise [animation-delay:360ms]" title="Powertrain mix · over time" right={<Legend pts={mix.pts} />}>
          <MixArea pts={mix.pts} series={mix.series} />
        </Section>
        <Section className="rise [animation-delay:420ms]" title={`Gap to limit · ${breakdownLabel} × year`} right={<span className="text-[10px] text-ink-500">click → drill</span>}>
          <GapHeatmap data={heat} unit={pack.metricUnit} onPick={openItem} />
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Section className="rise [animation-delay:480ms]" title={focused ? 'Exposure by model' : 'Exposure ranking'} right={<span className="text-[10px] text-ink-500">click → drill</span>}>
          <FineRanking rows={rows} currency={pack.currency} unit={pack.metricUnit} onPick={openItem} />
        </Section>
        <Section className="rise [animation-delay:540ms]" title="Volume × mix" right={<span className="text-[10px] text-ink-500">width = units</span>}>
          <Mekko cols={mekko} onPick={openItem} />
        </Section>
      </div>
    </div>
  )
}
