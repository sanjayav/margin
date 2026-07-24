import { useStore, type PlatformScreen } from '../state/store'
import Icon, { type IconName } from './Icon'
import { useCmdK, CMDK_HINT } from './CommandK'
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
  const openCmdK = useCmdK((s) => s.setOpen)
  const Screen = { home: Home, modules: Modules, subscription: Subscription }[ps]
  const t = TITLES[ps]

  return (
    <div className="flex h-screen overflow-hidden">
      <nav className="flex w-[248px] shrink-0 flex-col gap-1 border-r border-white/[0.08] p-3.5" style={{ background: CHROME }}>
        <div className="mb-5 flex items-center gap-2.5 px-1.5 pt-1">
          <img src="/brand/aire-mark-white.png" alt="AiRE" className="h-9 w-auto" />
          <div>
            <div className="font-display text-[17px] font-extrabold leading-none tracking-tight text-white">AiRE</div>
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

        <div className="relative mt-4 overflow-hidden rounded-xl border border-brand/20 p-3.5" style={{ background: 'linear-gradient(135deg, rgba(232,34,59,0.13), rgba(246,104,100,0.03) 55%, transparent)' }}>
          <div className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full bg-brand/25 blur-2xl" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand/20 text-brand-400"><Icon name="spark" size={14} /></span>
              <span className="text-[12px] font-bold text-white">AI Analyst</span>
            </div>
            {ai && <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.1em] text-safe"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-safe" /> On</span>}
          </div>
          <div className="relative mt-2 text-[10.5px] leading-snug text-white/50">{ai ? 'Answering across every module — ask anything in plain English.' : 'Ask any compliance question in plain English, answered from the live engine.'}</div>
          {!ai && <button onClick={() => goto('subscription')} className="relative mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand py-1.5 text-[10.5px] font-bold text-white shadow-[0_6px_16px_-8px_rgba(232,34,59,0.7)] transition hover:brightness-110"><Icon name="spark" size={11} /> Add AI Analyst</button>}
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
            <div className="label text-[#8A8174]">AiRE platform</div>
            <h1 className="font-display text-[22px] font-bold leading-tight tracking-tight text-white">{t.title}</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden text-right lg:block">
              <div className="label text-[#8A8174]">{t.sub}</div>
            </div>
            <button onClick={() => openCmdK(true)}
              className="group flex items-center gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[12px] text-[#8A8174] transition hover:border-white/[0.18] hover:text-[#C9C0B2]">
              <Icon name="search" size={14} className="text-[#7E766A] transition group-hover:text-brand-400" />
              <span className="hidden md:inline">Search…</span>
              <span className="kbd">{CMDK_HINT}</span>
            </button>
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto px-8 py-7">
          <div key={ps} className="screen-in">
            <Screen />
          </div>
        </main>
      </div>
    </div>
  )
}
