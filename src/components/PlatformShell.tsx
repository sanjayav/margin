import { useStore, type PlatformScreen } from '../state/store'
import Icon, { type IconName } from './Icon'
import Home from '../screens/Home'
import Modules from '../screens/Modules'
import Subscription from '../screens/Subscription'

const CHROME = '#17140F'
const NAV: { id: PlatformScreen; label: string; icon: IconName }[] = [
  { id: 'home', label: 'Home', icon: 'gauge' },
  { id: 'modules', label: 'Modules', icon: 'layers' },
  { id: 'subscription', label: 'Subscription', icon: 'card' },
]
const TITLES: Record<PlatformScreen, { title: string; sub: string }> = {
  home: { title: 'Home', sub: 'Your compliance control room' },
  modules: { title: 'Modules', sub: 'Markets you can analyse — open or add one' },
  subscription: { title: 'Subscription', sub: 'Manage country modules & the AI add-on' },
}

export default function PlatformShell() {
  const ps = useStore((s) => s.platformScreen)
  const goto = useStore((s) => s.setPlatformScreen)
  const logout = useStore((s) => s.logout)
  const ai = useStore((s) => s.aiEnabled)
  const owned = useStore((s) => s.subscribedModules)
  const Screen = { home: Home, modules: Modules, subscription: Subscription }[ps]
  const t = TITLES[ps]

  return (
    <div className="flex h-screen overflow-hidden">
      <nav className="flex w-[248px] shrink-0 flex-col gap-1 border-r border-white/[0.08] p-3.5" style={{ background: CHROME }}>
        <div className="mb-5 flex items-center gap-2.5 px-1.5 pt-1">
          <div className="grid h-9 w-9 place-items-center rounded-xl text-white" style={{ background: 'linear-gradient(160deg,#FF8A4C,#ED4709)' }}>
            <span className="text-[19px] font-black leading-none">M</span>
          </div>
          <div>
            <div className="font-display text-[16px] font-bold leading-none text-gradient">Margin</div>
            <div className="mt-1 text-[10px] tracking-wide text-[#9A9082]">Compliance platform</div>
          </div>
        </div>

        <div className="label px-1.5 pb-1.5 text-[#8A8174]">Platform</div>
        {NAV.map((n) => {
          const active = ps === n.id
          return (
            <button key={n.id} onClick={() => goto(n.id)}
              className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13.5px] transition ${active ? 'bg-white/[0.08] text-white' : 'text-[#A89E8C] hover:bg-white/[0.04] hover:text-white'}`}>
              {active && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand" />}
              <Icon name={n.icon} size={18} className={active ? 'text-brand-400' : 'text-[#7E766A] group-hover:text-[#B8AE9C]'} />
              <span className="flex-1 font-medium">{n.label}</span>
              {n.id === 'modules' && <span className="num rounded-md bg-white/[0.06] px-1.5 text-[10px] font-bold text-[#B8AE9C]">{owned.length}</span>}
            </button>
          )
        })}

        <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-[#E8E0D2]"><Icon name="spark" size={13} className="text-brand-400" /> AI Analyst</div>
          <div className="mt-1 text-[10px] text-[#8A8174]">{ai ? 'Active across all your modules.' : 'Add-on — answer in plain English.'}</div>
          {!ai && <button onClick={() => goto('subscription')} className="mt-2 w-full rounded-lg bg-brand/20 py-1 text-[10px] font-bold text-brand-400 transition hover:bg-brand/30">Add AI</button>}
        </div>

        <div className="mt-auto flex items-center gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.02] p-2.5">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand/20 text-[11px] font-bold text-brand-400">VJ</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold text-[#F5F0E6]">Vijay</div>
            <div className="truncate text-[10px] text-[#8A8174]">vijay@margin.io</div>
          </div>
          <button onClick={logout} title="Sign out" className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[#8A8174] transition hover:bg-white/[0.06] hover:text-white">
            <Icon name="reset" size={14} />
          </button>
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-white/[0.08] px-8 py-4" style={{ background: CHROME }}>
          <div>
            <div className="label text-[#8A8174]">Margin platform</div>
            <h1 className="font-display text-[22px] font-bold leading-tight tracking-tight text-white">{t.title}</h1>
          </div>
          <div className="hidden text-right sm:block">
            <div className="label text-[#8A8174]">{t.sub}</div>
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto px-8 py-7">
          <Screen />
        </main>
      </div>
    </div>
  )
}
