// ───────────────────────────────────────────────────────────────────────────
// SCENARIO — the modelling home. Three tabs:
//   Model               the drill workspace under the working assumptions
//                       (the same component Analyse uses, on the live basis),
//                       led by a variance strip: Δ vs the actuals book.
//   Get under the line  ranked, costed path to compliance
//   Compare scenarios   saved scenarios side-by-side
// The assumptions rail lives on this module (and only here + Pooling).
// ───────────────────────────────────────────────────────────────────────────
import { useStore, type ScenarioTab } from '../state/store'
import { useCompliance } from '../lib/useCompliance'
import { fmtMoney, fmtNum } from '../engine/engine'
import { BasisChip } from '../components/ui'
import Icon, { type IconName } from '../components/Icon'
import Analyze from './Analyze'
import GetUnderLine from './GetUnderLine'
import Compare from './Compare'

const TABS: { id: ScenarioTab; label: string; icon: IconName }[] = [
  { id: 'model', label: 'Model', icon: 'sliders' },
  { id: 'under', label: 'Get under the line', icon: 'target' },
  { id: 'compare', label: 'Compare scenarios', icon: 'layers' },
]

/** Δ vs actuals — the FP&A convention: a scenario's first readout is its
 *  variance against the book of record, not an absolute number. */
function VarianceStrip() {
  const live = useCompliance('live')
  const act = useCompliance('actuals')
  const dMetric = live.tree.avgMetric - act.tree.avgMetric
  const liveFine = (live.tree.children ?? []).reduce((a, c) => a + c.fine, 0)
  const actFine = (act.tree.children ?? []).reduce((a, c) => a + c.fine, 0)
  const dFine = liveFine - actFine
  const dZE = (live.tree.zlevShare - act.tree.zlevShare) * 100
  const touched = Math.abs(dMetric) > 0.005 || Math.abs(dFine) > 1 || Math.abs(dZE) > 0.05
  const d = (v: number, dec = 1) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${fmtNum(Math.abs(v), dec)}`
  return (
    <div className="card flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5">
      <BasisChip basis="live" />
      {touched ? (
        <>
          <span className="text-[11.5px] text-ink-400">vs actuals:</span>
          <span className={`num text-[12px] font-bold ${dMetric > 0 ? 'text-danger' : 'text-safe'}`}>{d(dMetric)} {live.pack.metricUnit}</span>
          <span className={`num text-[12px] font-bold ${dFine > 0 ? 'text-danger' : 'text-safe'}`}>{dFine >= 0 ? '+' : '−'}{fmtMoney(Math.abs(dFine), live.pack.currency)} fine</span>
          <span className={`num text-[12px] font-bold ${dZE >= 0 ? 'text-safe' : 'text-danger'}`}>{d(dZE)} pp ZE</span>
        </>
      ) : (
        <span className="text-[11.5px] text-ink-500">No assumptions applied yet — this workbench currently matches the actuals book. Move a lever on the right.</span>
      )}
      <span className="ml-auto hidden text-[10.5px] text-ink-500 md:inline">every number here is modelled · the book of record lives in Plan</span>
    </div>
  )
}

export default function ScenarioScreen() {
  const tab = useStore((s) => s.scenarioTab)
  const setScreen = useStore((s) => s.setScreen)

  return (
    <div className="space-y-5">
      <div className="inline-flex flex-wrap gap-1 rounded-xl border border-black/[0.06] bg-black/[0.045] p-1">
        {TABS.map((t) => {
          const on = tab === t.id
          return (
            <button key={t.id} onClick={() => setScreen(t.id)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-200 ${on ? 'border border-black/[0.05] bg-white text-ink-100 shadow-[0_1px_3px_rgba(60,45,20,0.12)]' : 'border border-transparent text-ink-500 hover:text-ink-100'}`}>
              <Icon name={t.icon} size={15} className={on ? 'text-brand' : ''} /> {t.label}
            </button>
          )
        })}
      </div>
      <div key={tab} className="screen-in space-y-5">
        {tab === 'model' && (
          <>
            <VarianceStrip />
            <Analyze mode="model" />
          </>
        )}
        {tab === 'under' && <GetUnderLine />}
        {tab === 'compare' && <Compare />}
      </div>
    </div>
  )
}
