import { create } from 'zustand'
import type { CountryId, Scenario, Vehicle } from '../engine/types'
import { getPack, PACK_LIST } from '../engine/rulepacks'
import { parentsFor, setLiveFleet } from '../data/fleet'

export type ScreenId = 'analyze' | 'analytics' | 'data' | 'pooling' | 'plan' | 'intel' | 'admin'
export type PlanTab = 'under' | 'forecast'
// The two-level shell: 'platform' = global launcher (home/modules/subscription);
// 'module' = a single country workspace (the analyze/analytics/… sidebar).
export type AppView = 'platform' | 'module'
export type PlatformScreen = 'home' | 'modules' | 'subscription'
// legacy ids still accepted by setScreen and mapped to the new structure
type AnyScreen = ScreenId | 'cockpit' | 'chart' | 'maker' | 'pool' | PlanTab

interface UIState {
  country: CountryId
  screen: ScreenId
  scenario: Scenario
  selectedParent: string
  drillPath: string[] // chart explorer drill (parent/model/powertrain keys)
  dataVersion: number // bumps when live data loads, to recompute views
  planTab: PlanTab
  /** Per-maker scenario overrides (mix/mass/sales/EV) layered on the global scenario when drilled into a maker. */
  makerOverrides: Record<string, Partial<Scenario>>

  // ── shell + entitlements ──
  view: AppView
  platformScreen: PlatformScreen
  /** Country modules the org has subscribed to (mock until Stripe — see docs/PACKAGING.md). */
  subscribedModules: CountryId[]
  /** AI Analyst add-on — cross-cutting, usable inside every owned module. */
  aiEnabled: boolean
  /** Pooling & credit-market add-on — cross-cutting optimiser, where the regime allows it. */
  poolingAddon: boolean
  enterModule: (c: CountryId) => void
  exitToPlatform: (to?: PlatformScreen) => void
  setPlatformScreen: (p: PlatformScreen) => void
  subscribe: (c: CountryId) => void
  unsubscribe: (c: CountryId) => void
  setAi: (b: boolean) => void
  setPooling: (b: boolean) => void

  savedScenarios: SavedScenario[]
  saveScenario: (label: string) => void
  loadScenario: (id: string) => void
  deleteScenario: (id: string) => void
  /** Hydrate the workspace from a shared deep-link (gated to owned modules). */
  applyShared: (s: SharedState) => void

  setCountry: (c: CountryId) => void
  setScreen: (s: AnyScreen) => void
  setParent: (p: string) => void
  patchScenario: (p: Partial<Scenario>) => void
  resetScenario: () => void
  setDrill: (path: string[]) => void
  loadFleet: () => Promise<void>

  authed: boolean
  login: (user: string, pass: string) => boolean
  logout: () => void
}

// Entitlement persistence (mock; replaced by server-issued claims once billing lands).
const ENT_KEY = 'ul_entitlement'
const VALID_MODULES: CountryId[] = ['EU', 'IN', 'AU', 'UK']
function loadEnt(): { modules: CountryId[]; ai: boolean; pooling: boolean } {
  try {
    const r = JSON.parse(localStorage.getItem(ENT_KEY) || '')
    if (r && Array.isArray(r.modules)) {
      const modules = r.modules.filter((m: unknown): m is CountryId => VALID_MODULES.includes(m as CountryId))
      return { modules, ai: !!r.ai, pooling: r.pooling !== false }
    }
  } catch { /* fall through */ }
  return { modules: ['EU', 'UK'], ai: true, pooling: true } // demo default: two modules + AI + Pooling
}
function saveEnt(modules: CountryId[], ai: boolean, pooling: boolean) { try { localStorage.setItem(ENT_KEY, JSON.stringify({ modules, ai, pooling })) } catch { /* ignore */ } }
const ENT0 = loadEnt()

// Named, durable scenarios (persisted) — promotes the ephemeral A/B snapshot.
export interface SavedScenario { id: string; label: string; country: CountryId; scenario: Scenario; overrides: Record<string, Partial<Scenario>>; createdAt: number }
export interface SharedState { country?: CountryId; screen?: ScreenId; planTab?: PlanTab; drillPath?: string[]; scenario?: Scenario; overrides?: Record<string, Partial<Scenario>> }
const SCEN_KEY = 'ul_scenarios'
function loadScenarios(): SavedScenario[] { try { const r = JSON.parse(localStorage.getItem(SCEN_KEY) || '[]'); return Array.isArray(r) ? r : [] } catch { return [] } }
function saveScenarios(list: SavedScenario[]) { try { localStorage.setItem(SCEN_KEY, JSON.stringify(list)) } catch { /* ignore */ } }

// Scope key for the current drill level: null (market), "Maker" (brand), or
// "Maker/Model" (model). Variant level (3) still scopes to its model.
export function scopeKey(screen: ScreenId, drillPath: string[]): string | null {
  if (screen !== 'analyze' || drillPath.length === 0) return null
  return drillPath.length >= 2 ? `${drillPath[0]}/${drillPath[1]}` : drillPath[0]
}

// Single demo credential
export const CRED = { user: 'vijay@margin.io', pass: 'marginio' }
const isAuthed = () => { try { return localStorage.getItem('ul_auth') === '1' } catch { return false } }

export function defaultScenario(country: CountryId): Scenario {
  const pack = getPack(country)
  return {
    year: pack.years[0],
    evSharePct: null,
    salesMultiplier: 1,
    massShiftKg: 0,
    ecoBoostG: 0,
    poolingEnabled: false,
    superCreditsEnabled: country === 'IN',
    mix: null,
    extraVariants: [],
  }
}

export const useStore = create<UIState>((set, get) => ({
  country: 'EU',
  screen: 'analyze',
  scenario: defaultScenario('EU'),
  selectedParent: parentsFor('EU')[0],
  drillPath: [],
  dataVersion: 0,
  planTab: 'under',
  makerOverrides: {},

  view: 'platform',
  platformScreen: 'home',
  subscribedModules: ENT0.modules,
  aiEnabled: ENT0.ai,
  poolingAddon: ENT0.pooling,

  enterModule: (c) => {
    if (!get().subscribedModules.includes(c)) { set({ view: 'platform', platformScreen: 'subscription' }); return }
    set({
      country: c,
      scenario: defaultScenario(c),
      selectedParent: parentsFor(c)[0],
      drillPath: [],
      makerOverrides: {},
      view: 'module',
      screen: 'analyze',
      planTab: 'under',
    })
  },
  exitToPlatform: (to) => set({ view: 'platform', ...(to ? { platformScreen: to } : {}) }),
  setPlatformScreen: (p) => set({ platformScreen: p }),
  subscribe: (c) => { const m = [...new Set([...get().subscribedModules, c])]; saveEnt(m, get().aiEnabled, get().poolingAddon); set({ subscribedModules: m }) },
  unsubscribe: (c) => {
    const m = get().subscribedModules.filter((x) => x !== c)
    saveEnt(m, get().aiEnabled, get().poolingAddon)
    // if you're currently inside the module you just dropped, bounce to the platform
    const leaving = get().view === 'module' && get().country === c
    set({ subscribedModules: m, ...(leaving ? { view: 'platform' as const, platformScreen: 'subscription' as const } : {}) })
  },
  setAi: (b) => { saveEnt(get().subscribedModules, b, get().poolingAddon); set({ aiEnabled: b }) },
  setPooling: (b) => { saveEnt(get().subscribedModules, get().aiEnabled, b); set({ poolingAddon: b }) },

  savedScenarios: loadScenarios(),
  saveScenario: (label) => {
    const { scenario, makerOverrides, country, savedScenarios } = get()
    const item: SavedScenario = { id: `${Date.now()}-${Math.round(Math.random() * 1e6)}`, label: label.trim() || `Scenario ${savedScenarios.length + 1}`, country, scenario, overrides: makerOverrides, createdAt: Date.now() }
    const next = [item, ...savedScenarios].slice(0, 60)
    saveScenarios(next); set({ savedScenarios: next })
  },
  loadScenario: (id) => {
    const it = get().savedScenarios.find((x) => x.id === id)
    if (!it || it.country !== get().country) return // scenarios load within their own module
    set({ scenario: it.scenario, makerOverrides: it.overrides, drillPath: [] })
  },
  deleteScenario: (id) => { const next = get().savedScenarios.filter((x) => x.id !== id); saveScenarios(next); set({ savedScenarios: next }) },
  applyShared: (sh) => {
    const c = sh.country
    if (c && !get().subscribedModules.includes(c)) { set({ view: 'platform', platformScreen: 'modules' }); return }
    set({
      country: c ?? get().country,
      scenario: sh.scenario ?? get().scenario,
      makerOverrides: sh.overrides ?? {},
      drillPath: Array.isArray(sh.drillPath) ? sh.drillPath : [],
      selectedParent: sh.drillPath?.[0] ?? get().selectedParent,
      screen: sh.screen ?? 'analyze',
      planTab: sh.planTab ?? 'under',
      view: 'module',
    })
  },

  setCountry: (c) =>
    set({
      country: c,
      scenario: defaultScenario(c),
      selectedParent: parentsFor(c)[0],
      drillPath: [],
      makerOverrides: {},
    }),
  setScreen: (s) => {
    if (s === 'pool') set({ screen: 'pooling' })
    else if (s === 'under' || s === 'forecast') set({ screen: 'plan', planTab: s })
    else if (s === 'cockpit' || s === 'chart' || s === 'maker') set({ screen: 'analyze' })
    else set({ screen: s })
  },
  setParent: (p) => set({ selectedParent: p }),
  patchScenario: (p) => {
    const { drillPath, screen, scenario, makerOverrides } = get()
    const scope = scopeKey(screen, drillPath)
    if (!scope) { set({ scenario: { ...scenario, ...p } }); return }
    // Drilled in, mix/mass/sales/EV edits scope to the current node (brand at
    // "Maker", model at "Maker/Model"); the rest (year, eco, pooling, super-
    // credits, variants, PHEV UF, credit price) stay global.
    const SCOPED = new Set(['mix', 'massShiftKg', 'salesMultiplier', 'evSharePct'])
    const globalPart: any = {}, scopedPart: any = {}
    for (const k of Object.keys(p)) (SCOPED.has(k) ? scopedPart : globalPart)[k] = (p as any)[k]
    set({
      scenario: { ...scenario, ...globalPart },
      makerOverrides: Object.keys(scopedPart).length
        ? { ...makerOverrides, [scope]: { ...(makerOverrides[scope] ?? {}), ...scopedPart } }
        : makerOverrides,
    })
  },
  resetScenario: () => {
    const { drillPath, screen, makerOverrides } = get()
    const scope = scopeKey(screen, drillPath)
    if (scope) { const next = { ...makerOverrides }; delete next[scope]; set({ makerOverrides: next }); return }
    set({ scenario: defaultScenario(get().country), makerOverrides: {} })
  },
  setDrill: (path) => set({ drillPath: path }),

  authed: isAuthed(),
  login: (user, pass) => {
    const ok = user.trim().toLowerCase() === CRED.user && pass === CRED.pass
    if (ok) { try { localStorage.setItem('ul_auth', '1') } catch { /* ignore */ } ; set({ authed: true }) }
    return ok
  },
  logout: () => { try { localStorage.removeItem('ul_auth') } catch { /* ignore */ } ; set({ authed: false, view: 'platform', platformScreen: 'home' }) },

  loadFleet: async () => {
    let loaded = false
    await Promise.all(
      PACK_LIST.map(async (pack) => {
        try {
          const res = await fetch(`/api/fleet?country=${pack.id}`)
          if (!res.ok) return
          const data = await res.json()
          if (data?.fallback || !Array.isArray(data?.vehicles) || data.vehicles.length === 0) return
          setLiveFleet(pack.id, data.vehicles as Vehicle[], data.meta)
          loaded = true
        } catch {
          /* keep bundled fallback */
        }
      }),
    )
    if (loaded) {
      // ensure the selected maker still exists in the live data
      const parents = parentsFor(get().country)
      const patch: Partial<UIState> = { dataVersion: get().dataVersion + 1 }
      if (!parents.includes(get().selectedParent)) patch.selectedParent = parents[0]
      set(patch)
    }
  },
}))
