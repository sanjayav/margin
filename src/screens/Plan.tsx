import { useStore, type PlanTab } from '../state/store'
import Icon, { type IconName } from '../components/Icon'
import GetUnderLine from './GetUnderLine'
import Forecast from './Forecast'

const TABS: { id: PlanTab; label: string; icon: IconName }[] = [
  { id: 'under', label: 'Get under the line', icon: 'target' },
  { id: 'forecast', label: 'Forecast', icon: 'trending' },
]

export default function Plan() {
  const planTab = useStore((s) => s.planTab)
  const setScreen = useStore((s) => s.setScreen)
  const View = { under: GetUnderLine, forecast: Forecast }[planTab]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1.5 rounded-xl border border-black/[0.06] bg-ink-900/40 p-1">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setScreen(t.id)}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition ${planTab === t.id ? 'bg-black/[0.07] text-ink-100' : 'text-ink-500 hover:text-ink-100'}`}>
            <Icon name={t.icon} size={15} className={planTab === t.id ? 'text-brand' : ''} /> {t.label}
          </button>
        ))}
      </div>
      <View />
    </div>
  )
}
