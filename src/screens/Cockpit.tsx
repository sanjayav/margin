import { useMemo, useState } from 'react'
import { useCompliance } from '../lib/useCompliance'
import { useStore } from '../state/store'
import { parentsFor } from '../data/fleet'
import { fmtInt, fmtMoney, fmtNum } from '../engine/engine'
import LimitChart from '../components/LimitChart'
import { Section, Stat, StatusPill } from '../components/ui'
import Icon from '../components/Icon'
import PowertrainBreakdown from '../components/PowertrainBreakdown'
import { makeLimitAt, fleetPoint, pointsFromChildren } from '../lib/chart'
import { useProvenance } from '../lib/provenance'
import { getMeta } from '../data/fleet'

export default function Cockpit() {
  const { pack, tree, parent, scenario, country } = useCompliance()
  const setParent = useStore((s) => s.setParent)
  const patch = useStore((s) => s.patchScenario)
  const setScreen = useStore((s) => s.setScreen)
  const parents = parentsFor(country)
  const showProv = useProvenance((s) => s.show)
  const meta = getMeta(country)

  const limitAt = useMemo(() => makeLimitAt(pack, scenario, parent), [pack, scenario, parent])
  const points = useMemo(() => {
    const others = pointsFromChildren(tree.children ?? []).filter((p) => p.key !== parent.key).map((p) => ({ ...p, units: p.units * 0.25 }))
    return [...others, fleetPoint(parent)]
  }, [tree, parent])

  const over = parent.gap > 0
  const phevCount = parent.vehicles.filter((v) => pack.isPlugInHybrid(v)).reduce((a, v) => a + v.sales, 0)

  return (
    <div className="space-y-5 animate-slidein">
      {/* Plain-question search */}
      <PlainSearch />

      {/* Maker selector */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="label">Maker</span>
        {parents.map((p) => (
          <button key={p} onClick={() => setParent(p)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${parent.label === p ? 'bg-ink-100 text-white' : 'bg-black/5 text-ink-500 hover:text-ink-100'}`}>{p}</button>
        ))}
      </div>

      {/* Headline position */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className={`card relative overflow-hidden p-5 ${over ? 'border-danger/30' : 'border-safe/30'}`}>
          <div className="label">Gap to the line</div>
          <div className={`mt-1 num text-4xl font-black ${over ? 'text-danger' : 'text-safe'} animate-flip`} key={parent.gap.toFixed(2)}>
            {over ? '+' : ''}{fmtNum(parent.gap, 1)}
          </div>
          <div className="text-xs text-ink-500">{pack.metricUnit} {over ? 'over the limit' : 'under the limit'}</div>
          <div className="mt-3"><StatusPill status={parent.status} big /></div>
          <div className={`pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full blur-2xl ${over ? 'bg-danger/20' : 'bg-safe/20'}`} />
        </div>

        <Stat label={`Fleet ${pack.metricLabel.toLowerCase()}`} value={`${fmtNum(parent.avgMetric, 1)}`} sub={`${pack.metricUnit} · limit ${fmtNum(parent.limit, 1)}`} accent={over ? 'text-danger' : 'text-safe'} />

        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div className="label">Projected fine</div>
            <button onClick={() => showProv({ agg: parent, pack, scenario, meta })} className="flex items-center gap-1 text-[10px] font-semibold text-ink-500 transition hover:text-brand"><Icon name="shield" size={11} /> show the working</button>
          </div>
          <div className={`mt-1 num text-3xl font-black ${parent.fine > 0 ? 'text-danger' : 'text-safe'}`} key={Math.round(parent.fine)}>
            {fmtMoney(parent.fine, pack.currency)}
          </div>
          <div className="mt-2 rounded-lg bg-ink-950/60 p-2 font-mono text-[11px] leading-relaxed text-ink-500">
            {parent.fineMath.expression}
          </div>
        </div>
      </div>

      {/* The line */}
      <Section title="See the line" right={<div className="flex items-center gap-3 text-[11px] text-ink-500"><span className="flex items-center gap-1"><i className="inline-block h-2 w-4 rounded bg-[#E0A100]" />limit</span><span className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-full bg-safe" />you</span></div>}>
        <LimitChart pack={pack} limitAt={limitAt} points={points} onPick={(k) => { const m = (tree.children ?? []).find((c) => c.key === k); if (m) setParent(m.label) }} />
      </Section>

      {/* Dense metric strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Registrations" value={fmtInt(parent.rawUnits)} />
        <Stat label="Effective units" value={fmtInt(parent.units)} sub="after credits" />
        <Stat label="Zero-emission" value={`${Math.round(parent.zlevShare * 100)}%`} accent="text-accent" />
        <Stat label={pack.massLabel} value={`${fmtInt(parent.avgMass)}`} sub="kg avg" />
        <Stat label="Plug-in hybrids" value={fmtInt(phevCount)} sub="own special case" accent="text-warn" />
      </div>

      {/* Powertrain breakdown — how the fleet average is built */}
      <Section title="How the fleet average is built" right={<span className="text-[11px] text-ink-500">contributions sum to {fmtNum(parent.avgMetric, 1)} {pack.metricUnit} · moves live with the mix</span>}>
        <PowertrainBreakdown agg={parent} pack={pack} scenario={scenario} />
      </Section>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" onClick={() => setScreen('under')}><Icon name="target" size={16} /> Get me under the line</button>
        <button className="btn-ghost" onClick={() => setScreen('chart')}>Explore the chart <Icon name="arrow-right" size={15} /></button>
      </div>
    </div>
  )
}

// Structured "ask a plain question" search that reconfigures the view.
function PlainSearch() {
  const { pack, country } = useCompliance()
  const setParent = useStore((s) => s.setParent)
  const patch = useStore((s) => s.patchScenario)
  const setScreen = useStore((s) => s.setScreen)
  const [q, setQ] = useState('')
  const parents = parentsFor(country)

  const suggestions = useMemo(() => {
    const out: { label: string; run: () => void }[] = []
    const ql = q.toLowerCase().trim()
    if (!ql) return out
    parents.forEach((p) => { if (p.toLowerCase().includes(ql)) out.push({ label: `Open maker · ${p}`, run: () => setParent(p) }) })
    pack.years.forEach((y) => { if (String(y).includes(ql)) out.push({ label: `Jump to ${y}`, run: () => patch({ year: y }) }) })
    if ('fine'.includes(ql) || 'cost'.includes(ql)) out.push({ label: 'Show how to get under the line', run: () => setScreen('under') })
    if ('electric'.includes(ql) || 'ev'.includes(ql) || 'zero'.includes(ql)) out.push({ label: 'Force 60% zero-emission share', run: () => patch({ evSharePct: 60 }) })
    if ('forecast'.includes(ql) || 'future'.includes(ql) || 'tighten'.includes(ql)) out.push({ label: 'Open the forecast view', run: () => setScreen('forecast') })
    return out.slice(0, 5)
  }, [q, parents, pack])

  return (
    <div className="relative">
      <div className="flex items-center gap-2.5 rounded-xl border border-black/[0.08] bg-ink-850/60 px-4 py-3 focus-within:border-brand/30 transition">
        <Icon name="search" size={17} className="text-ink-500" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask a question — “Suzuki 2027”, “electric”, “fine”, “forecast”…"
          className="w-full bg-transparent text-sm text-ink-100 outline-none placeholder:text-ink-600" />
        {q && <button onClick={() => setQ('')} className="text-ink-500 hover:text-ink-100"><Icon name="close" size={15} /></button>}
      </div>
      {suggestions.length > 0 && (
        <div className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-xl border border-black/10 bg-ink-850 shadow-card">
          {suggestions.map((s, i) => (
            <button key={i} onClick={() => { s.run(); setQ('') }} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-ink-400 transition hover:bg-black/5 hover:text-ink-100">
              <Icon name="arrow-right" size={15} className="text-brand" />{s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
