import { useEffect, useMemo, useState } from 'react'
import type { ComponentType } from 'react'
import { getMarket } from './markets'
import { useStore, type ScreenId } from './state/store'
import { useCompliance } from './lib/useCompliance'
import { buildTree, fmtMoney, fmtNum, scopeToMonth } from './engine/engine'
import type { MonthScope } from './engine/engine'
import { MODULE_META } from './lib/modules'
import { StatusPill } from './components/ui'
import Icon, { type IconName } from './components/Icon'
import Flag from './components/Flag'
import { buildDualCredit } from './engine/china/dualcredit'
import { fmtInt } from './engine/engine'
import { getPack } from './engine/rulepacks'
import { ScenarioRail } from './components/ScenarioRail'
import FactsRail from './components/FactsRail'
import Assistant from './components/Assistant'
import ProvenanceDrawer from './components/ProvenanceDrawer'
import PlatformShell from './components/PlatformShell'
import ErrorBoundary from './components/ErrorBoundary'
import GuidedPath from './components/GuidedPath'
import CommandK, { useCmdK, CMDK_HINT } from './components/CommandK'
import { applySharedFromHash } from './lib/share'
import Analyze from './screens/Analyze'

// Analyse = the drill workspace pinned to the actuals basis (book of record).
// China gets a restyled fork (AnalyzeCN) with identical drill behaviour.
const AnalyseActuals = () => <Analyze mode="actuals" />
const AnalyseActualsCN = () => <AnalyzeCN mode="actuals" />
import Data from './screens/Data'
import Pooling from './screens/Pooling'
import ScenarioScreen from './screens/Scenario'
import Forecast from './screens/Forecast'
import CreditBook from './screens/CreditBook'
import Pricing from './screens/Pricing'
import Intelligence from './screens/Intelligence'
import Admin from './screens/Admin'
import DualCredit from './screens/DualCredit'
import AnalyzeCN from './screens/cn/AnalyzeCN'
import ForecastCN from './screens/cn/ForecastCN'
import IntelligenceIN from './screens/in/IntelligenceIN'
import CoPilot from './screens/CoPilot'
import Login from './screens/Login'
import type { CountryId } from './engine/types'

// The five workspace modules — Analyse is the ACTUALS monitoring surface (the
// book of record; levers live in Scenario); Pooling is the add-on (only some
// regimes allow pooled averages). `addon` items appear only when owned.
const NAV: { id: ScreenId; label: string; icon: IconName; tier: string; addon?: 'pooling'; country?: CountryId }[] = [
  { id: 'brief', label: 'Brief', icon: 'gauge', tier: 'CORE' },
  { id: 'copilot', label: 'Co-pilot', icon: 'spark', tier: 'Core' },
  { id: 'analyse', label: 'Plan', icon: 'scatter', tier: 'Core' },
  { id: 'forecast', label: 'Forecast', icon: 'trending', tier: 'Core' },
  { id: 'scenario', label: 'Scenario', icon: 'target', tier: 'Core' },
  // Credit book — for China this IS the dual-credit ledger (both axes), routed
  // via CN_FORKS below; other markets get the generic credit book.
  { id: 'creditbook', label: 'Credit book', icon: 'scale', tier: 'Core' },
  { id: 'pricing', label: 'Pricing', icon: 'card', tier: 'Core' },
  { id: 'pooling', label: 'Pooling', icon: 'handshake', tier: 'Add-on', addon: 'pooling' },
]

// Hubs group the workspace modules so the sidebar shows a few clear buckets
// instead of a flat wall of seven. Co-pilot stays standalone (the front door).
const SCENARIO_SCREENS: ScreenId[] = ['scenario'] // tabs resolve to screen:'scenario'
const HUBS: { label: string; icon: IconName; hint: string; items: ScreenId[] }[] = [
  { label: 'Compliance', icon: 'gauge', hint: 'position · fix · forecast', items: ['brief', 'analyse', 'scenario', 'forecast'] },
  { label: 'Credits', icon: 'scale', hint: 'ledger · pool · price', items: ['creditbook', 'pooling', 'pricing'] },
]

// Workspace utilities — always reachable, but not "modules".
const UTIL: { id: ScreenId; label: string; icon: IconName }[] = [
  { id: 'data', label: 'Data & imports', icon: 'database' },
  { id: 'intel', label: 'Intelligence', icon: 'activity' },
  { id: 'admin', label: 'Admin', icon: 'settings' },
]

const SCENARIO_TABS: { id: 'model' | 'under' | 'compare'; label: string; icon: IconName }[] = [
  { id: 'model', label: 'Model', icon: 'sliders' },
  { id: 'under', label: 'Action plan', icon: 'target' },
  { id: 'compare', label: 'Compare scenarios', icon: 'layers' },
]

const CHROME = '#17140F' // warm near-black chrome (sidebar + top bar)

function Sidebar() {
  const screen = useStore((s) => s.screen)
  const scenarioTab = useStore((s) => s.scenarioTab)
  const setScreen = useStore((s) => s.setScreen)
  const country = useStore((s) => s.country)
  const poolingAddon = useStore((s) => s.poolingAddon)
  const exitToPlatform = useStore((s) => s.exitToPlatform)
  const { pack } = useCompliance()
  const m = MODULE_META[country]
  const nav = NAV
    .filter((n) => !n.addon || (n.addon === 'pooling' && poolingAddon))
    .filter((n) => !n.country || n.country === country) // CN-only bespoke screens
  const byId = Object.fromEntries(nav.map((n) => [n.id, n]))
  const copilot = byId['copilot']
  const [openHubs, setOpenHubs] = useState<Set<string>>(new Set())
  const toggleHub = (l: string) => setOpenHubs((s) => { const n = new Set(s); n.has(l) ? n.delete(l) : n.add(l); return n })
  const isLeafActive = (id: ScreenId) => screen === id || (id === 'scenario' && SCENARIO_SCREENS.includes(screen))

  return (
    <nav className="flex w-[248px] shrink-0 flex-col gap-1 border-r border-white/[0.08] p-3.5" style={{ background: CHROME }}>
      <button onClick={() => exitToPlatform('home')} className="mb-3 flex items-center gap-2.5 px-1.5 pt-1 text-left">
        <img src="/brand/aire-mark-white.png" alt="AiRE" className="h-9 w-auto" />
        <div>
          <div className="font-display text-[17px] font-extrabold leading-none tracking-tight text-white">AiRE</div>
          <div className="mt-1 text-[10px] tracking-wide text-[#9A9082]">Compliance platform</div>
        </div>
      </button>

      {/* current module + switch */}
      <div className="label px-1.5 pb-1.5 text-[#8A8174]">Module</div>
      <button onClick={() => exitToPlatform('modules')} className="mb-4 flex w-full items-center gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-2.5 py-2 text-left transition hover:border-white/20">
        <Flag id={m.id} className="h-8 w-9 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-bold text-white">{pack.name}</div>
          <div className="text-[10px] text-[#8A8174]">Switch module</div>
        </div>
        <Icon name="chevron" size={13} className="shrink-0 text-[#7E766A]" />
      </button>

      <div className="label px-1.5 pb-1.5 text-[#8A8174]">Workspace</div>

      {/* Co-pilot — the guided front door, always first */}
      {copilot && (() => {
        const active = screen === 'copilot'
        return (
          <button onClick={() => setScreen('copilot')}
            className={`group relative mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13.5px] transition ${active ? 'bg-white/[0.08] text-white' : 'text-[#A89E8C] hover:bg-white/[0.04] hover:text-white'}`}>
            {active && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand" />}
            <Icon name="spark" size={18} className={active ? 'text-brand-400' : 'text-[#7E766A] group-hover:text-[#B8AE9C]'} />
            <span className="flex-1 font-medium">Co-pilot</span>
            <span className="text-[9px] font-semibold uppercase tracking-wider text-brand-400/70">Start here</span>
          </button>
        )
      })()}

      {/* Hubs — expand to reveal the tools */}
      {HUBS.map((hub) => {
        const items = hub.items.map((id) => byId[id]).filter(Boolean)
        if (!items.length) return null
        const containsActive = items.some((n) => isLeafActive(n.id))
        const open = containsActive || openHubs.has(hub.label)
        return (
          <div key={hub.label} className="mb-0.5">
            <button onClick={() => toggleHub(hub.label)}
              className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13.5px] transition ${containsActive ? 'text-white' : 'text-[#A89E8C] hover:bg-white/[0.04] hover:text-white'}`}>
              <Icon name={hub.icon} size={18} className={containsActive ? 'text-brand-400' : 'text-[#7E766A] group-hover:text-[#B8AE9C]'} />
              <span className="flex-1 font-semibold">{hub.label}</span>
              <Icon name="chevron" size={13} className={`text-[#7E766A] transition-transform ${open ? 'rotate-90' : ''}`} />
            </button>
            {open && (
              <div className="mb-1 ml-[22px] mt-0.5 flex flex-col gap-0.5 border-l border-white/[0.08] pl-2.5">
                {items.map((n) => {
                  const active = isLeafActive(n.id)
                  return (
                    <div key={n.id}>
                      <button onClick={() => setScreen(n.id)}
                        className={`group relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition ${active ? 'bg-white/[0.07] text-white' : 'text-[#9A9082] hover:bg-white/[0.04] hover:text-white'}`}>
                        {active && <span className="absolute left-[-10px] top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-brand" />}
                        <Icon name={n.icon} size={15} className={active ? 'text-brand-400' : 'text-[#6E665A] group-hover:text-[#B8AE9C]'} />
                        <span className="flex-1">{n.label}</span>
                        {n.tier === 'Add-on' && <span className="text-[8.5px] font-semibold uppercase tracking-wider text-accentblue">Add-on</span>}
                      </button>
                      {n.id === 'scenario' && active && (
                        <div className="ml-[22px] mt-0.5 flex flex-col gap-0.5 border-l border-white/[0.08] pl-2.5">
                          {SCENARIO_TABS.map((t) => {
                            const on = screen === 'scenario' && scenarioTab === t.id
                            return (
                              <button key={t.id} onClick={() => setScreen(t.id)}
                                className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11.5px] transition ${on ? 'text-white' : 'text-[#8A8174] hover:text-white'}`}>
                                <Icon name={t.icon} size={12} className={on ? 'text-brand-400' : 'text-[#6E665A]'} /> {t.id === 'under' && country === 'CN' ? 'Clear the credits' : t.label}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      <div className="label mt-5 px-1.5 pb-1.5 text-[#8A8174]">Utilities</div>
      {UTIL.map((n) => {
        const active = screen === n.id
        return (
          <button key={n.id} onClick={() => setScreen(n.id)}
            className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[12.5px] transition ${active ? 'bg-white/[0.08] text-white' : 'text-[#8A8174] hover:bg-white/[0.04] hover:text-white'}`}>
            {active && <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-brand" />}
            <Icon name={n.icon} size={15} className={active ? 'text-brand-400' : 'text-[#6E665A] group-hover:text-[#B8AE9C]'} />
            <span className="flex-1">{n.label}</span>
          </button>
        )
      })}

      {/* Provenance for the module you are actually in — the dataset's scope and
          source, from its own rule pack. A blanket disclaimer here used to
          undercut markets carrying a full registrations file. */}
      <div className="mt-auto px-1 pt-3 text-[9px] leading-relaxed text-[#6E665A]">
        <span className={`mr-1 font-semibold ${pack.coverage.tier === 'market' ? 'text-safe/80' : pack.coverage.tier === 'partial' ? 'text-warn/80' : 'text-[#8A8174]'}`}>
          {pack.coverage.tier === 'market' ? 'Market data' : pack.coverage.tier === 'partial' ? 'Covered scope' : 'Preview data'} ·
        </span>
        {pack.coverage.label}
      </div>
    </nav>
  )
}

/** Reading depth. Board collapses the analyst detail to the verdict, one chart
 *  and the next action; Analyst is the full workspace. It is a display mode over
 *  the same engine output — no number changes, only how much of it is shown. */
function ViewModeToggle() {
  const mode = useStore((s) => s.viewMode)
  const setMode = useStore((s) => s.setViewMode)
  const OPTS: { id: 'board' | 'analyst'; label: string; icon: IconName; hint: string }[] = [
    { id: 'board', label: 'Board', icon: 'gauge', hint: 'Verdict, one chart, next action' },
    { id: 'analyst', label: 'Analyst', icon: 'sliders', hint: 'The full workspace' },
  ]
  return (
    <div className="flex items-center gap-0.5 rounded-xl border border-white/[0.08] bg-white/[0.03] p-0.5" role="group" aria-label="Reading depth">
      {OPTS.map((o) => {
        const on = mode === o.id
        return (
          <button key={o.id} onClick={() => setMode(o.id)} title={o.hint} aria-pressed={on}
            className={`flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-[11.5px] font-semibold transition ${on ? 'bg-white/[0.10] text-white' : 'text-[#8A8174] hover:text-[#C9C0B2]'}`}>
            <Icon name={o.icon} size={13} className={on ? 'text-brand-400' : ''} />
            <span className="hidden lg:inline">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function TopBar() {
  const screen = useStore((s) => s.screen)
  // The header verdict states the basis of the screen below it: the book of
  // record on Analyse/Credit book, the working assumptions everywhere else.
  const c = useCompliance(screen === 'analyse' || screen === 'creditbook' ? 'actuals' : 'live')
  const { pack, scenario } = c
  const year = useStore((s) => s.scenario.year)
  const tbCountry = useStore((s) => s.country)
  // …and Plan can read the year at a point in its monthly filing, so the header
  // follows it there. Anywhere else the scope is not applied, so the verdict
  // stays the whole period.
  const planScope = useStore((s) => s.planScope)
  const headScope: MonthScope = screen === 'analyse' ? planScope : { through: null, mode: 'ytd' }
  const tree = useMemo(
    () => (headScope.through == null ? c.tree : buildTree(scopeToMonth(c.raw, scenario.year, headScope), pack, scenario, {})),
    [headScope, c.tree, c.raw, pack, scenario],
  )
  const periodTag = useMemo(() => {
    if (headScope.through == null) return String(year)
    const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const m = MO[((pack.fiscalYearStartMonth ?? 1) - 1 + headScope.through - 1) % 12]
    return headScope.mode === 'month' ? `${m} ${year}` : `${year} to ${m}`
  }, [headScope, year, pack])
  const openCmdK = useCmdK((s) => s.setOpen)
  // A registered market names its own modules — the legacy NAV table still calls
  // `analyse` "Plan", which is not what this market calls it.
  const registered = getMarket(tbCountry)?.modules[screen]
  const item = registered
    ? { id: screen, label: registered.label, icon: registered.icon }
    : NAV.find((n) => n.id === screen) ?? UTIL.find((n) => n.id === screen)
  // Board verdict for the whole market: fines are per-maker, so exposure = Σ.
  const makers = (tree.children ?? []).filter((c) => c.rawUnits > 0)
  const marketFine = makers.reduce((a, c) => a + c.fine, 0)
  const over = makers.filter((c) => c.status === 'fine').length
  // China verdict is a CREDIT balance (积分), never "over/under a line".
  const isCN = pack.id === 'CN'
  const dc = isCN ? buildDualCredit(tree, scenario, pack.creditPrice ?? pack.fineRate) : null
  const under = isCN ? dc!.totals.creditsToBuy <= 0.5 : tree.gap <= 0
  const cr = (n: number) => `${n >= 0 ? '+' : '−'}${fmtInt(Math.abs(n))}`
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
        <ViewModeToggle />
        <button onClick={() => openCmdK(true)}
          className="group flex items-center gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[12px] text-[#8A8174] transition hover:border-white/[0.18] hover:text-[#C9C0B2]">
          <Icon name="search" size={14} className="text-[#7E766A] transition group-hover:text-brand-400" />
          <span className="hidden md:inline">Search…</span>
          <span className="kbd">{CMDK_HINT}</span>
        </button>
        <div className="h-10 w-px bg-white/[0.10]" />
        <div className={`flex items-center gap-2.5 rounded-xl border px-3 py-1.5 ${under ? 'border-safe/25 bg-safe/[0.08]' : 'border-danger/25 bg-danger/[0.08]'}`}>
          {/* The pulse was an alarm that never stopped ringing. A steady dot
              states the position; it does not demand attention every second. */}
          <span className={`h-2 w-2 rounded-full ${under ? 'bg-safe' : 'bg-danger'}`} />
          <div className="leading-tight">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[#9A9082]">{pack.name} {periodTag} · {isCN ? `${dc!.totals.makers - dc!.totals.makersOver} of ${dc!.totals.makers} credit-clear` : under ? 'Under the line' : 'Over the line'}</div>
            <div className="num text-[13px] font-bold text-white">
              {isCN ? (
                <>CAFC <span className={dc!.totals.cafcCredit >= 0 ? 'text-safe' : 'text-[#FF7A6B]'}>{cr(dc!.totals.cafcCredit)}</span><span className="font-medium text-[#9A9082]"> · NEV </span><span className={dc!.totals.nevBalance >= 0 ? 'text-safe' : 'text-[#FF7A6B]'}>{cr(dc!.totals.nevBalance)}</span></>
              ) : (
                <>{fmtNum(tree.avgMetric, 1)}<span className="font-medium text-[#9A9082]"> / {fmtNum(tree.limit, 1)} {pack.metricUnit}</span>
                  <span className={under ? 'text-safe' : 'text-[#FF7A6B]'}> · {tree.gap > 0 ? '+' : ''}{fmtNum(tree.gap, 1)}</span></>
              )}
            </div>
          </div>
        </div>
        {/* Deliberately absent on the Brief. Opening a market with a penalty
            makes the tool read as an accusation before the reader knows what to
            do about it — the whole reason the Brief exists. The figure is one
            line down on that screen, and permanent everywhere else. */}
        {screen !== 'brief' && (
          <>
            <div className="h-10 w-px bg-white/[0.10]" />
            <div className="text-right">
              <div className="label text-[#8A8174]">{pack.currency}-at-risk</div>
              <div className="dnum mt-0.5 text-[18px] font-bold text-white">{fmtMoney(marketFine, pack.currency)}<span className="ml-1.5 text-[11px] font-medium text-[#9A9082]">{over} of {makers.length} over</span></div>
            </div>
          </>
        )}
      </div>
    </header>
  )
}

// The assumptions rail appears only where assumptions exist: the Scenario
// module and the Pooling optimiser. Analyse gets the FactsRail (actuals);
// Forecast owns its own studio; Credit book & Pricing declare a basis instead.
const RAIL_SCREENS = new Set<ScreenId>(['scenario', 'pooling'])

function PoolingLocked() {
  const goto = useStore((s) => s.exitToPlatform)
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accentblue/10 text-accentblue"><Icon name="handshake" size={26} /></span>
      <h2 className="font-display mt-4 text-[18px] font-bold text-ink-100">Pooling & credit market</h2>
      <p className="mt-2 text-sm text-ink-400">The pooling optimiser is a cross-cutting add-on — find the cheapest legal partition, value each settlement, and trade credits across your markets.</p>
      <button onClick={() => goto('subscription')} className="btn-primary mx-auto mt-5"><Icon name="card" size={15} /> Add Pooling</button>
    </div>
  )
}

/** Preview markets carry a rule pack we trust and a fleet we don't. Say so at the
 *  top of every screen, so a number here is never mistaken for a market position. */
function PreviewBanner({ country }: { country: CountryId }) {
  const cov = getPack(country).coverage
  if (cov.tier !== 'preview') return null
  return (
    <div className="mb-5 flex items-start gap-3 rounded-xl border border-warn/25 bg-warn/[0.07] px-4 py-3">
      <Icon name="alert" size={16} className="mt-0.5 shrink-0 text-warn" />
      <div className="min-w-0">
        <div className="text-[12.5px] font-bold text-warn">Preview module — sample fleet, not market data</div>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-400">{cov.detail}</p>
      </div>
    </div>
  )
}

function ModuleShell() {
  const screenRaw = useStore((s) => s.screen)
  const country = useStore((s) => s.country)
  const viewMode = useStore((s) => s.viewMode)
  const aiEnabled = useStore((s) => s.aiEnabled)
  const poolingAddon = useStore((s) => s.poolingAddon)
  // A country-specific screen (China's Dual-credit) falls back to Plan when the
  // active module doesn't own it — e.g. after switching away from China.
  const navItem = NAV.find((n) => n.id === screenRaw)
  const screen = navItem?.country && navItem.country !== country ? 'analyse' : screenRaw
  // China-only restyled forks — identical functionality, elevated presentation.
  const CN_FORKS: Partial<Record<ScreenId, () => JSX.Element | null>> = country === 'CN' ? { analyse: AnalyseActualsCN, forecast: ForecastCN, creditbook: DualCredit } : {}
  // India-only intelligence cockpit — replaces the generic event feed for IN.
  const IN_FORKS: Partial<Record<ScreenId, () => JSX.Element | null>> = country === 'IN' ? { intel: IntelligenceIN } : {}
  // A registered market owns its own screens (src/markets/<id>). CN_FORKS and
  // IN_FORKS are the ad-hoc predecessor of that idea and stay as the fallback
  // for markets not yet migrated; the shared map below is the last resort.
  // A registered market owns its own screens (src/markets/<id>). CN_FORKS and
  // IN_FORKS are the ad-hoc predecessor of that idea and stay as the fallback
  // for markets not yet migrated; the shared map below is the last resort. A
  // screen a market has not registered and the shared map does not know falls
  // back to that market's home rather than rendering nothing.
  const market = getMarket(country)
  const SHARED: Partial<Record<ScreenId, ComponentType>> = {
    copilot: CoPilot, analyse: AnalyseActuals, forecast: Forecast, scenario: ScenarioScreen, creditbook: CreditBook,
    pricing: Pricing, pooling: Pooling, dualcredit: DualCredit, data: Data, intel: Intelligence, admin: Admin,
  }
  const Screen: ComponentType =
    market?.modules[screen]?.component
    ?? (CN_FORKS[screen] as ComponentType | undefined)
    ?? (IN_FORKS[screen] as ComponentType | undefined)
    ?? SHARED[screen]
    ?? (market ? market.modules[market.home].component : AnalyseActuals)
  const gated = screen === 'pooling' && !poolingAddon

  // A rebuilt module brings its own shell (nav + working surface + Inspector).
  // Rendering it inside the legacy chrome produced two navigations and two
  // inspectors side by side, so the legacy frame steps aside for it entirely.
  if (market?.modules[screen]?.ownsChrome && !gated) {
    return (
      <div className="flex h-screen overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <ErrorBoundary screenKey={screen}>
            <div key={screen} className="screen-in flex min-h-0 flex-1">
              <Screen />
            </div>
          </ErrorBoundary>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <div className={`flex min-h-0 flex-1 ${viewMode === 'board' ? 'board-mode' : ''}`}>
          <main className={`min-w-0 flex-1 overflow-y-auto px-7 py-6 ${screen === 'scenario' || screen === 'analyse' ? 'scn-dark' : ''}`}>
            <PreviewBanner country={country} />
            <div key={gated ? 'locked' : screen} className="screen-in">
              <ErrorBoundary screenKey={screen}>
                {gated ? <PoolingLocked /> : <Screen />}
              </ErrorBoundary>
            </div>
          </main>
          {screen === 'analyse' && <FactsRail />}
          {/* The assumptions rail is a modelling surface — only where it applies.
              On Pooling it belongs to regimes that actually pool (EU/AU/UK); India
              assesses every maker standalone, so there's nothing to model here. */}
          {RAIL_SCREENS.has(screen) && !gated && (screen !== 'pooling' || getPack(country).pooling.enabled) && <ScenarioRail />}
        </div>
      </div>
      {aiEnabled && <Assistant />}
      <ProvenanceDrawer />
      {/* Sits above every screen — the walkthrough navigates between them. */}
      <GuidedPath />
    </div>
  )
}

/** The half-second before the server answers /api/session. Deliberately almost
 *  nothing: a login form that appears and then vanishes reads as a bug. */
function AuthGate() {
  return (
    <div className="grid h-screen place-items-center bg-[#FBF7EF]">
      <img src="/brand/aire-black.png" alt="AiRE" className="h-8 w-auto animate-pulse opacity-40" />
    </div>
  )
}

export default function App() {
  const session = useStore((s) => s.session)
  const authChecked = useStore((s) => s.authChecked)
  const checkSession = useStore((s) => s.checkSession)
  const view = useStore((s) => s.view)
  const loadFleet = useStore((s) => s.loadFleet)
  // Ask the server who we are before deciding what to render — a valid cookie
  // must not flash the login screen on reload.
  useEffect(() => { void checkSession() }, [checkSession])
  useEffect(() => { if (session) loadFleet() }, [loadFleet, session])
  useEffect(() => { applySharedFromHash() }, []) // hydrate a deep-link if present

  if (!authChecked) return <AuthGate />
  if (!session) return <Login />
  return (
    <>
      {view === 'platform' ? <PlatformShell /> : <ModuleShell />}
      <CommandK />
    </>
  )
}
