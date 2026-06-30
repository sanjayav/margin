import { useEffect } from 'react'
import { useStore, type ScreenId } from './state/store'
import { useCompliance } from './lib/useCompliance'
import { fmtMoney, fmtNum } from './engine/engine'
import { MODULE_META } from './lib/modules'
import { StatusPill } from './components/ui'
import Icon, { type IconName } from './components/Icon'
import { ScenarioRail } from './components/ScenarioRail'
import Assistant from './components/Assistant'
import ProvenanceDrawer from './components/ProvenanceDrawer'
import PlatformShell from './components/PlatformShell'
import { applySharedFromHash } from './lib/share'
import Analyze from './screens/Analyze'
import Analytics from './screens/Analytics'
import Data from './screens/Data'
import Pooling from './screens/Pooling'
import Plan from './screens/Plan'
import Intelligence from './screens/Intelligence'
import Admin from './screens/Admin'
import Login from './screens/Login'

// `addon` items only appear in the workspace nav when the org owns that add-on.
const NAV: { id: ScreenId; label: string; icon: IconName; tier: string; addon?: 'pooling' }[] = [
  { id: 'analyze', label: 'Analyze', icon: 'scatter', tier: 'Core' },
  { id: 'analytics', label: 'Analytics', icon: 'layers', tier: 'Core' },
  { id: 'data', label: 'Data', icon: 'database', tier: 'Core' },
  { id: 'plan', label: 'Scenario', icon: 'target', tier: 'Core' },
  { id: 'pooling', label: 'Pooling', icon: 'handshake', tier: 'Add-on', addon: 'pooling' },
  { id: 'intel', label: 'Intelligence', icon: 'activity', tier: 'Plus' },
  { id: 'admin', label: 'Admin', icon: 'settings', tier: 'Plus' },
]

const PLAN_TABS: { id: 'under' | 'forecast'; label: string; icon: IconName }[] = [
  { id: 'under', label: 'Get under the line', icon: 'target' },
  { id: 'forecast', label: 'Forecast', icon: 'trending' },
]

const CHROME = '#17140F' // warm near-black chrome (sidebar + top bar)

function Sidebar() {
  const screen = useStore((s) => s.screen)
  const planTab = useStore((s) => s.planTab)
  const setScreen = useStore((s) => s.setScreen)
  const country = useStore((s) => s.country)
  const poolingAddon = useStore((s) => s.poolingAddon)
  const exitToPlatform = useStore((s) => s.exitToPlatform)
  const { pack } = useCompliance()
  const m = MODULE_META[country]
  const nav = NAV.filter((n) => !n.addon || (n.addon === 'pooling' && poolingAddon))

  return (
    <nav className="flex w-[248px] shrink-0 flex-col gap-1 border-r border-white/[0.08] p-3.5" style={{ background: CHROME }}>
      <button onClick={() => exitToPlatform('home')} className="mb-3 flex items-center gap-2.5 px-1.5 pt-1 text-left">
        <div className="grid h-9 w-9 place-items-center rounded-xl text-white" style={{ background: 'linear-gradient(160deg,#FF8A4C,#ED4709)' }}>
          <span className="text-[19px] font-black leading-none">A</span>
        </div>
        <div>
          <div className="font-display text-[16px] font-bold leading-none text-gradient">Autocred AI</div>
          <div className="mt-1 text-[10px] tracking-wide text-[#9A9082]">Compliance platform</div>
        </div>
      </button>

      {/* current module + switch */}
      <div className="label px-1.5 pb-1.5 text-[#8A8174]">Module</div>
      <button onClick={() => exitToPlatform('modules')} className="mb-4 flex w-full items-center gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-2.5 py-2 text-left transition hover:border-white/20">
        <span className="grid h-8 w-9 shrink-0 place-items-center rounded-lg text-[11px] font-bold text-white" style={{ background: m.accent }}>{m.flag}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-bold text-white">{pack.name}</div>
          <div className="text-[10px] text-[#8A8174]">Switch module</div>
        </div>
        <Icon name="chevron" size={13} className="shrink-0 text-[#7E766A]" />
      </button>

      <div className="label px-1.5 pb-1.5 text-[#8A8174]">Workspace</div>
      {nav.map((n) => {
        const active = screen === n.id
        return (
          <div key={n.id}>
            <button onClick={() => setScreen(n.id)}
              className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13.5px] transition ${active ? 'bg-white/[0.08] text-white' : 'text-[#A89E8C] hover:bg-white/[0.04] hover:text-white'}`}>
              {active && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand" />}
              <Icon name={n.icon} size={18} className={active ? 'text-brand-400' : 'text-[#7E766A] group-hover:text-[#B8AE9C]'} />
              <span className="flex-1 font-medium">{n.label}</span>
              <span className={`text-[9px] font-semibold uppercase tracking-wider ${n.tier === 'Core' ? 'text-brand-400/70' : n.tier === 'Add-on' ? 'text-accent' : 'text-[#6E665A]'}`}>{n.tier}</span>
            </button>
            {n.id === 'plan' && (
              <div className="mb-1 ml-[26px] mt-0.5 flex flex-col gap-0.5 border-l border-white/[0.08] pl-3">
                {PLAN_TABS.map((t) => {
                  const on = screen === 'plan' && planTab === t.id
                  return (
                    <button key={t.id} onClick={() => setScreen(t.id)}
                      className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition ${on ? 'text-white' : 'text-[#8A8174] hover:text-white'}`}>
                      <Icon name={t.icon} size={13} className={on ? 'text-brand-400' : 'text-[#6E665A]'} /> {t.label}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      <div className="mt-auto px-1 text-[9px] leading-relaxed text-[#6E665A]">Official sources · EEA · BEE · DCCEEW · DfT · illustrative until live data connected.</div>
    </nav>
  )
}

function TopBar() {
  const { pack, tree } = useCompliance()
  const screen = useStore((s) => s.screen)
  const year = useStore((s) => s.scenario.year)
  const item = NAV.find((n) => n.id === screen)
  // Board verdict for the whole market: fines are per-maker, so exposure = Σ.
  const makers = (tree.children ?? []).filter((c) => c.rawUnits > 0)
  const marketFine = makers.reduce((a, c) => a + c.fine, 0)
  const over = makers.filter((c) => c.status === 'fine').length
  const under = tree.gap <= 0
  return (
    <header className="flex items-center justify-between border-b border-white/[0.08] px-7 py-3" style={{ background: CHROME }}>
      <div className="flex items-center gap-3.5">
        <div className="grid h-10 w-10 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.05] text-brand-400">
          <Icon name={item?.icon ?? 'gauge'} size={20} />
        </div>
        <div>
          <div className="flex items-center gap-2 text-[11px] text-[#9A9082]">
            <span className="font-semibold text-[#C9C0B2]">{pack.name}</span>
            <span className="text-[#5E574C]">/</span>
            <span>{tree.label}</span>
          </div>
          <h1 className="font-display text-[21px] font-bold leading-tight tracking-tight text-white">{item?.label}</h1>
        </div>
      </div>
      {/* board verdict */}
      <div className="flex items-center gap-3.5">
        <div className={`flex items-center gap-2.5 rounded-xl border px-3 py-1.5 ${under ? 'border-safe/25 bg-safe/[0.08]' : 'border-danger/25 bg-danger/[0.08]'}`}>
          <span className={`h-2 w-2 rounded-full ${under ? 'bg-safe' : 'bg-danger animate-pulse'}`} />
          <div className="leading-tight">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[#9A9082]">{pack.name} {year} · {under ? 'Under the line' : 'Over the line'}</div>
            <div className="num text-[13px] font-bold text-white">
              {fmtNum(tree.avgMetric, 1)}<span className="font-medium text-[#9A9082]"> / {fmtNum(tree.limit, 1)} {pack.metricUnit}</span>
              <span className={under ? 'text-safe' : 'text-[#FF7A6B]'}> · {tree.gap > 0 ? '+' : ''}{fmtNum(tree.gap, 1)}</span>
            </div>
          </div>
        </div>
        <div className="h-10 w-px bg-white/[0.10]" />
        <div className="text-right">
          <div className="label text-[#8A8174]">€-at-risk</div>
          <div className="dnum mt-0.5 text-[18px] font-bold text-white">{fmtMoney(marketFine, pack.currency)}<span className="ml-1.5 text-[11px] font-medium text-[#9A9082]">{over} of {makers.length} over</span></div>
        </div>
      </div>
    </header>
  )
}

const RAIL_SCREENS = new Set<ScreenId>(['analyze', 'analytics', 'pooling', 'plan'])

function PoolingLocked() {
  const goto = useStore((s) => s.exitToPlatform)
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent/10 text-accent"><Icon name="handshake" size={26} /></span>
      <h2 className="font-display mt-4 text-[18px] font-bold text-ink-100">Pooling & credit market</h2>
      <p className="mt-2 text-sm text-ink-400">The pooling optimiser is a cross-cutting add-on — find the cheapest legal partition, value each settlement, and trade credits across your markets.</p>
      <button onClick={() => goto('subscription')} className="btn-primary mx-auto mt-5"><Icon name="card" size={15} /> Add Pooling</button>
    </div>
  )
}

function ModuleShell() {
  const screen = useStore((s) => s.screen)
  const aiEnabled = useStore((s) => s.aiEnabled)
  const poolingAddon = useStore((s) => s.poolingAddon)
  const Screen = { analyze: Analyze, analytics: Analytics, data: Data, pooling: Pooling, plan: Plan, intel: Intelligence, admin: Admin }[screen]
  const gated = screen === 'pooling' && !poolingAddon
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <div className="flex min-h-0 flex-1">
          <main className="min-w-0 flex-1 overflow-y-auto px-7 py-6">
            {gated ? <PoolingLocked /> : <Screen />}
          </main>
          {RAIL_SCREENS.has(screen) && !gated && <ScenarioRail />}
        </div>
      </div>
      {aiEnabled && <Assistant />}
      <ProvenanceDrawer />
    </div>
  )
}

export default function App() {
  const authed = useStore((s) => s.authed)
  const view = useStore((s) => s.view)
  const loadFleet = useStore((s) => s.loadFleet)
  useEffect(() => { if (authed) loadFleet() }, [loadFleet, authed])
  useEffect(() => { applySharedFromHash() }, []) // hydrate a deep-link if present

  if (!authed) return <Login />
  return view === 'platform' ? <PlatformShell /> : <ModuleShell />
}
