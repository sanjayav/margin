import { useStore, type ScenarioTab } from '../state/store'
import Icon, { type IconName } from '../components/Icon'
import GetUnderLine from './GetUnderLine'
import Compare from './Compare'

const TABS: { id: ScenarioTab; label: string; icon: IconName }[] = [
  { id: 'under', label: 'Get under the line', icon: 'target' },
  { id: 'compare', label: 'Compare scenarios', icon: 'layers' },
]

export default function ScenarioScreen() {
  const tab = useStore((s) => s.scenarioTab)
  const setScreen = useStore((s) => s.setScreen)
  const View = { under: GetUnderLine, compare: Compare }[tab]

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
      <div key={tab} className="screen-in">
        <View />
      </div>
    </div>
  )
}
