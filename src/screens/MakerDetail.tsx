import { useMemo, useState } from 'react'
import { useCompliance } from '../lib/useCompliance'
import { useStore } from '../state/store'
import { parentsFor } from '../data/fleet'
import { fmtInt, fmtMoney, fmtNum } from '../engine/engine'
import LimitChart from '../components/LimitChart'
import { Section, StatusPill, Bar } from '../components/ui'
import Icon from '../components/Icon'
import { makeLimitAt, dominantClass, bubblePoints, ptColor } from '../lib/chart'
import { getMeta } from '../data/fleet'
import { useProvenance } from '../lib/provenance'
import { recommend } from '../engine/recommend'
import { buildMakerReport, openPrintReport } from '../lib/report'

export default function MakerDetail() {
  const { pack, raw, parent, scenario, country } = useCompliance()
  const setParent = useStore((s) => s.setParent)
  const parents = parentsFor(country)
  const showProv = useProvenance((s) => s.show)
  const meta = getMeta(country)

  const openWorking = () => showProv({ agg: parent, pack, scenario, meta })
  const exportReport = () => {
    const plan = recommend(raw, pack, scenario, parent.label)
    const today = new Date().toISOString().slice(0, 10)
    openPrintReport(`Margin · ${parent.label}`, buildMakerReport(parent, pack, scenario, meta, plan, today))
  }

  const limitAt = useMemo(() => makeLimitAt(pack, scenario, parent), [pack, scenario, parent])
  const vclass = dominantClass(parent)

  // model·powertrain bubbles (size = sales, colour = powertrain)
  const allBubbles = useMemo(() => bubblePoints(parent.vehicles, pack, scenario), [parent, pack, scenario])
  const powertrains = useMemo(() => [...new Set(allBubbles.map((b) => b.powertrain!))], [allBubbles])
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const bubbles = allBubbles.filter((b) => !hidden.has(b.powertrain!))
  const toggle = (p: string) => setHidden((h) => { const n = new Set(h); n.has(p) ? n.delete(p) : n.add(p); return n })

  const maxFine = Math.max(...(parent.children ?? []).map((c) => Math.abs(c.gap)), 1)

  return (
    <div className="space-y-5 animate-slidein">
      <div className="flex flex-wrap items-center gap-2">
        {parents.map((p) => (
          <button key={p} onClick={() => setParent(p)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${parent.label === p ? 'bg-ink-100 text-white' : 'bg-black/5 text-ink-500 hover:text-ink-100'}`}>{p}</button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={openWorking} className="btn-ghost px-3 py-1.5 text-xs"><Icon name="shield" size={14} /> Show the working</button>
          <button onClick={exportReport} className="btn-ghost px-3 py-1.5 text-xs"><Icon name="section" size={14} /> Export report</button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* How the limit is built */}
        <Section title="How your limit is calculated" className="lg:col-span-3">
          <p className="mb-4 text-xs leading-relaxed text-ink-500">{pack.limitNote}</p>
          <div className="space-y-2.5">
            <Row k={`${pack.massLabel} (sales-weighted avg)`} v={`${fmtInt(parent.avgMass)} kg`} />
            <Row k="Vehicle class" v={vclass} />
            <Row k="Compliance year" v={String(scenario.year)} />
            <Row k="Zero-emission share" v={`${Math.round(parent.zlevShare * 100)}%`} />
            <div className="my-2 border-t border-black/[0.06]" />
            <Row k="Your limit" v={`${fmtNum(parent.limit, 1)} ${pack.metricUnit}`} accent="text-ink-100" big />
          </div>
          <div className="mt-4 rounded-xl border border-black/[0.06] bg-black/[0.02] p-3">
            <div className="label mb-2">The limit rises with mass</div>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[-150, 0, 150].map((d) => (
                <div key={d} className={`rounded-lg p-2 ${d === 0 ? 'bg-brand/10 ring-1 ring-brand/30' : 'bg-black/[0.02]'}`}>
                  <div className="text-[10px] text-ink-500">{d > 0 ? '+' : ''}{d} kg</div>
                  <div className="num text-sm font-bold text-ink-100">{fmtNum(limitAt(parent.avgMass + d), 1)}</div>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* Position + fine */}
        <Section title="Where you sit" className="lg:col-span-2">
          <div className={`mb-3 num text-4xl font-black ${parent.gap > 0 ? 'text-danger' : 'text-safe'}`}>{parent.gap > 0 ? '+' : ''}{fmtNum(parent.gap, 1)}</div>
          <div className="mb-3 text-xs text-ink-500">{pack.metricUnit} vs limit · fleet {fmtNum(parent.avgMetric, 1)} / limit {fmtNum(parent.limit, 1)}</div>
          <StatusPill status={parent.status} big />
          <div className="mt-4 rounded-xl bg-ink-950/60 p-3">
            <div className="label">Projected fine</div>
            <div className={`num text-2xl font-black ${parent.fine > 0 ? 'text-danger' : 'text-safe'}`}>{fmtMoney(parent.fine, pack.currency)}</div>
            <div className="mt-1 font-mono text-[11px] text-ink-500">{parent.fineMath.expression}</div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-center">
            <Mini k="Registrations" v={fmtInt(parent.rawUnits)} />
            <Mini k="Effective units" v={fmtInt(parent.units)} />
          </div>
        </Section>
      </div>

      <Section title="Model bubbles" right={
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[10px] text-ink-500">size = sales · filter:</span>
          {powertrains.map((p) => (
            <button key={p} onClick={() => toggle(p)}
              className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold transition ${hidden.has(p) ? 'bg-black/5 text-ink-600 line-through' : 'text-ink-100'}`}
              style={hidden.has(p) ? {} : { background: `${ptColor(p)}22`, color: ptColor(p) }}>
              <i className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: ptColor(p) }} />{p}
            </button>
          ))}
        </div>
      }>
        <LimitChart pack={pack} limitAt={limitAt} points={bubbles} colorBy="powertrain" height={360} />
      </Section>

      <Section title="Models">
        <div className="space-y-2">
          {(parent.children ?? []).map((c) => (
            <div key={c.key} className="flex items-center gap-4 rounded-xl border border-black/[0.04] bg-black/[0.02] px-4 py-2.5">
              <div className="w-40 shrink-0 truncate font-medium text-ink-100">{c.label}</div>
              <div className="w-28 shrink-0 text-xs text-ink-500">{c.vehicles[0]?.powertrain}</div>
              <div className="flex-1"><Bar value={c.gap > 0 ? c.gap : 0} max={maxFine} color={c.gap > 0 ? 'bg-danger' : 'bg-safe'} /></div>
              <div className={`w-20 shrink-0 text-right num text-sm font-semibold ${c.gap > 0 ? 'text-danger' : 'text-safe'}`}>{c.gap > 0 ? '+' : ''}{fmtNum(c.gap, 1)}</div>
              <div className="w-20 shrink-0 text-right num text-xs text-ink-500">{fmtInt(c.rawUnits)} u</div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}

const Row = ({ k, v, accent, big }: { k: string; v: string; accent?: string; big?: boolean }) => (
  <div className="flex items-center justify-between">
    <span className="text-sm text-ink-500">{k}</span>
    <span className={`num font-semibold ${accent ?? 'text-ink-200'} ${big ? 'text-lg' : 'text-sm'}`}>{v}</span>
  </div>
)
const Mini = ({ k, v }: { k: string; v: string }) => (
  <div className="rounded-lg bg-black/[0.03] p-2"><div className="text-[10px] text-ink-500">{k}</div><div className="num text-sm font-bold text-ink-100">{v}</div></div>
)
