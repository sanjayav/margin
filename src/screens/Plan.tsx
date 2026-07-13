import { useStore, type PlanTab } from '../state/store'
import Icon, { type IconName } from '../components/Icon'
import GetUnderLine from './GetUnderLine'
import Forecast from './Forecast'
import Compare from './Compare'

const TABS: { id: PlanTab; label: string; icon: IconName }[] = [
  { id: 'under', label: 'Get under the line', icon: 'target' },
  { id: 'forecast', label: 'Forecast', icon: 'trending' },
  { id: 'compare', label: 'Compare scenarios', icon: 'layers' },
]

export default function Plan() {
  const planTab = useStore((s) => s.planTab)
  const setScreen = useStore((s) => s.setScreen)
  const View = { under: GetUnderLine, forecast: Forecast, compare: Compare }[planTab]

  return (
    <div className="space-y-5">
      <div className="inline-flex flex-wrap gap-1 rounded-xl border border-black/[0.06] bg-black/[0.045] p-1">
        {TABS.map((t) => {
          const on = planTab === t.id
          return (
            <button key={t.id} onClick={() => setScreen(t.id)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-200 ${on ? 'border border-black/[0.05] bg-white text-ink-100 shadow-[0_1px_3px_rgba(60,45,20,0.12)]' : 'border border-transparent text-ink-500 hover:text-ink-100'}`}>
              <Icon name={t.icon} size={15} className={on ? 'text-brand' : ''} /> {t.label}
            </button>
          )
        })}
      </div>
      <div key={planTab} className="screen-in">
        <View />
      </div>
    </div>
  )
}
