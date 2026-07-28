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
import AnalyzeCN from './cn/AnalyzeCN'
import GetUnderLine from './GetUnderLine'
import Compare from './Compare'

const TABS: { id: ScenarioTab; label: string; icon: IconName }[] = [
  { id: 'model', label: 'Model', icon: 'sliders' },
  { id: 'under', label: 'Action plan', icon: 'target' },
  { id: 'compare', label: 'Compare scenarios', icon: 'layers' },
]

// The dark HERO of the Model workbench — the highlighted focus band (dark) over a
// light workbench. Its story is the FP&A one: a scenario's first readout is its
// VARIANCE against the book of record, not an absolute number.
function DeltaTile({ label, value, unit, tone }: { label: string; value: string; unit: string; tone: string }) {
  return (
    <div>
      <div className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-white/40">{label}</div>
      <div className="dnum mt-1 text-[22px] font-black leading-none tracking-[-0.02em]" style={{ color: tone }}>{value}</div>
      <div className="mt-0.5 text-[10px] text-white/35">{unit}</div>
    </div>
  )
}
function ScenarioHero() {
  const live = useCompliance('live')
  const act = useCompliance('actuals')
  const pack = live.pack
  const dMetric = live.tree.avgMetric - act.tree.avgMetric
  const liveFine = (live.tree.children ?? []).reduce((a, c) => a + c.fine, 0)
  const actFine = (act.tree.children ?? []).reduce((a, c) => a + c.fine, 0)
  const dFine = liveFine - actFine
  const dZE = (live.tree.zlevShare - act.tree.zlevShare) * 100
  const touched = Math.abs(dMetric) > 0.005 || Math.abs(dFine) > 1 || Math.abs(dZE) > 0.05
  const dstr = (v: number, dec = 1) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${fmtNum(Math.abs(v), dec)}`
  const OK = '#34D399', BAD = '#FF8A83', MUT = 'rgba(255,255,255,0.5)'
  return (
    <div className="rise relative overflow-hidden rounded-[20px] border border-black/[0.06] px-6 py-5" style={{ background: 'linear-gradient(120deg, #1B1714 0%, #211A16 48%, #17130F 100%)' }}>
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-14 h-56 w-56 rounded-full blur-3xl" style={{ background: 'radial-gradient(circle, rgba(232,34,59,0.24), transparent 62%)' }} />
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.4]" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '24px 24px', maskImage: 'radial-gradient(120% 130% at 90% 0%, #000 30%, transparent 74%)', WebkitMaskImage: 'radial-gradient(120% 130% at 90% 0%, #000 30%, transparent 74%)' }} />
      <div className="relative flex flex-wrap items-center justify-between gap-x-8 gap-y-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-white/45">
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400/60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-brand-400" /></span>
            Model workbench · {pack.name}
          </div>
          <h1 className="font-display mt-2.5 max-w-[24ch] text-[23px] font-extrabold leading-[1.12] tracking-[-0.03em] text-white">
            {touched ? 'Your assumptions vs. the book of record.' : 'This workbench matches the actuals book.'}
          </h1>
          <p className="mt-1.5 max-w-[54ch] text-[12.5px] leading-relaxed text-white/50">
            {touched
              ? <>Every number here is modelled — the fleet has moved from the Plan actuals. The record of fact stays in <b className="font-semibold text-white/75">Plan</b>.</>
              : <>Move a lever on the right to model a change. Nothing is applied yet.</>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-7 sm:gap-9">
          <DeltaTile label="Δ Fleet" value={dstr(dMetric)} unit={pack.metricUnit} tone={Math.abs(dMetric) < 0.005 ? MUT : dMetric > 0 ? BAD : OK} />
          <DeltaTile label="Δ Fine" value={touched ? `${dFine >= 0 ? '+' : '−'}${fmtMoney(Math.abs(dFine), pack.currency)}` : '±0'} unit="vs actuals" tone={Math.abs(dFine) < 1 ? MUT : dFine > 0 ? BAD : OK} />
          <DeltaTile label="Δ ZE share" value={dstr(dZE)} unit="pp" tone={Math.abs(dZE) < 0.05 ? MUT : dZE >= 0 ? OK : BAD} />
        </div>
      </div>
    </div>
  )
}

export default function ScenarioScreen() {
  const tab = useStore((s) => s.scenarioTab)
  const setScreen = useStore((s) => s.setScreen)
  const country = useStore((s) => s.country)

  return (
    <div className="space-y-5">
      <div className="inline-flex flex-wrap gap-1 rounded-xl border border-black/[0.06] bg-black/[0.045] p-1">
        {TABS.map((t) => {
          const on = tab === t.id
          return (
            <button key={t.id} onClick={() => setScreen(t.id)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-200 ${on ? 'border border-black/[0.05] bg-white text-ink-100 shadow-[0_1px_3px_rgba(60,45,20,0.12)]' : 'border border-transparent text-ink-500 hover:text-ink-100'}`}>
              <Icon name={t.icon} size={15} className={on ? 'text-brand' : ''} /> {t.id === 'under' && country === 'CN' ? 'Clear the credits' : t.label}
            </button>
          )
        })}
      </div>
      <div key={tab} className="screen-in space-y-5">
        {tab === 'model' && (
          <>
            <ScenarioHero />
            {country === 'CN' ? <AnalyzeCN mode="model" /> : <Analyze mode="model" />}
          </>
        )}
        {tab === 'under' && <GetUnderLine />}
        {tab === 'compare' && <Compare />}
      </div>
    </div>
  )
}
