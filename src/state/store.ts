import { create } from 'zustand'
import type { CountryId, Scenario, Vehicle } from '../engine/types'
import type { MonthScope } from '../engine/engine'
import { getPack, PACK_LIST } from '../engine/rulepacks'
import { getMeta, parentsFor, setLiveFleet } from '../data/fleet'

// Workspace modules: Analyse (the ACTUALS monitoring surface — book of record,
// no levers can reach it), Forecast (multi-year studio), Scenario (the
// modelling home: Model workbench + get-under-the-line + compare), Credit book
// (positions ledger, actuals by default), Pricing (price/tax economics).
// Pooling is the add-on; data/intel/admin are workspace utilities, not modules.
export type ScreenId = 'copilot' | 'analyse' | 'forecast' | 'scenario' | 'creditbook' | 'pricing' | 'pooling' | 'dualcredit' | 'data' | 'intel' | 'admin'
export type ScenarioTab = 'model' | 'under' | 'compare'
/** @deprecated legacy alias kept for old deep-links */
export type PlanTab = ScenarioTab | 'forecast'
// The two-level shell: 'platform' = global launcher (home/modules/subscription);
// 'module' = a single country workspace (the plan/forecast/… sidebar).
export type AppView = 'platform' | 'module'
export type PlatformScreen = 'home' | 'modules' | 'subscription'
// How much of a screen to show. The workspace carries an analyst's density by
// design; a board reader wants the verdict, one chart and the next action. Same
// engine output either way — this only decides how much of it is on screen.
export type ViewMode = 'board' | 'analyst'
// legacy ids still accepted by setScreen and mapped to the new structure
// ('analyze'/'plan' became Analyse; the old Scenario-group tabs became modules/tabs)
type AnyScreen = ScreenId | 'analyze' | 'plan' | 'cockpit' | 'chart' | 'maker' | 'pool' | 'analytics' | 'model' | 'under' | 'compare'

interface UIState {
  country: CountryId
  screen: ScreenId
  scenario: Scenario
  selectedParent: string
  drillPath: string[] // chart explorer drill (parent/model/powertrain keys)
  dataVersion: number // bumps when live data loads, to recompute views
  scenarioTab: ScenarioTab
  /** How far through the compliance year Plan reads the book of record.
   *  through=null is the whole year. PLAN ONLY — the Scenario module uses the
   *  actuals basis as its comparison baseline, so scoping that globally would
   *  compare a part-year against a full-year model and the deltas would lie. */
  planScope: MonthScope
  setPlanScope: (s: MonthScope) => void
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
  /** Reading depth for every module. Persisted, because it is a property of who
   *  is at the keyboard, not of where they navigated. */
  viewMode: ViewMode
  setViewMode: (m: ViewMode) => void

  /** Guided path: a scripted route through the workspace that anyone can drive
   *  without knowing the app. −1 = not running. Deliberately NOT persisted — a
   *  reload should never drop someone back into a walkthrough. */
  guideStep: number
  startGuide: () => void
  setGuideStep: (i: number) => void
  endGuide: () => void
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
  /** Merge levers into a NAMED override scope (maker / pool:NAME) — the
   *  drag-to-model path. null deletes the scope's overrides. */
  patchOverride: (scope: string, patch: Partial<Scenario> | null) => void
  resetScenario: () => void
  setDrill: (path: string[]) => void
  loadFleet: () => Promise<void>

  /** null = not signed in. Set only from the server's answer to /api/session —
   *  the client no longer decides who is authenticated. */
  session: SessionInfo | null
  /** Have we asked the server yet? Guards a flash of the login screen on reload
   *  for someone who already holds a valid cookie. */
  authChecked: boolean
  login: (email: string, password: string) => Promise<string | null>
  logout: () => Promise<void>
  checkSession: () => Promise<void>
}

// Entitlement persistence (mock; replaced by server-issued claims once billing lands).
const ENT_KEY = 'ul_entitlement'
const VALID_MODULES: CountryId[] = ['EU', 'IN', 'AU', 'UK', 'CN']
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

// Reading depth persists on its own key — it survives entitlement changes and a
// reload, so a board user never lands back in the analyst view mid-meeting.
const VIEW_KEY = 'ul_viewmode'
function loadViewMode(): ViewMode {
  try { return localStorage.getItem(VIEW_KEY) === 'board' ? 'board' : 'analyst' } catch { return 'analyst' }
}

// Named, durable scenarios (persisted) — promotes the ephemeral A/B snapshot.
export interface SavedScenario { id: string; label: string; country: CountryId; scenario: Scenario; overrides: Record<string, Partial<Scenario>>; createdAt: number; datasetVersion?: string }
export interface SharedState { country?: CountryId; screen?: string; planTab?: string; drillPath?: string[]; scenario?: Scenario; overrides?: Record<string, Partial<Scenario>> }
const SCEN_KEY = 'ul_scenarios'
function loadScenarios(): SavedScenario[] { try { const r = JSON.parse(localStorage.getItem(SCEN_KEY) || '[]'); return Array.isArray(r) ? r : [] } catch { return [] } }
function saveScenarios(list: SavedScenario[]) {
  try { localStorage.setItem(SCEN_KEY, JSON.stringify(list)) } catch { /* ignore */ }
  mirrorToServer()
}

// Mirror the FULL local state (scenarios + assumptions) to the durable server
// store in one PUT. Sending both keys every time avoids a lost-update race where
// a scenarios-only and an assumptions-only PUT each read-modify-write a stale
// blob. Fire-and-forget — localStorage is the source of truth for the live UI.
function mirrorToServer() {
  try {
    const scenarios = JSON.parse(localStorage.getItem(SCEN_KEY) || '[]')
    const assumptions = JSON.parse(localStorage.getItem(ASSUMP_KEY) || '{}')
    void fetch('/api/scenarios', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scenarios, assumptions }) })
  } catch { /* ignore */ }
}

// ── Live assumptions persistence ────────────────────────────────────────────
// The active scenario + per-maker overrides are kept per country in localStorage
// so navigating out to the platform (or a full reload) never loses your edits —
// the exact complaint that motivated a durable store. saveAssumptions also
// mirrors to the server store so the working set survives across devices.
const ASSUMP_KEY = 'ul_assumptions'
type Assumptions = { scenario: Scenario; makerOverrides: Record<string, Partial<Scenario>> }
type AssumpMap = Partial<Record<CountryId, Assumptions>>
function loadAssumptionMap(): AssumpMap {
  try { const r = JSON.parse(localStorage.getItem(ASSUMP_KEY) || '{}'); return r && typeof r === 'object' ? r : {} } catch { return {} }
}
function persistAssumptions(country: CountryId, scenario: Scenario, makerOverrides: Record<string, Partial<Scenario>>) {
  const map = loadAssumptionMap()
  map[country] = { scenario, makerOverrides }
  try { localStorage.setItem(ASSUMP_KEY, JSON.stringify(map)) } catch { /* ignore */ }
  mirrorToServer()
}
/** Restore the saved working assumptions for a country, falling back to defaults. */
function assumptionsFor(country: CountryId): Assumptions {
  const saved = loadAssumptionMap()[country]
  return saved?.scenario
    ? { scenario: { ...defaultScenario(country), ...saved.scenario }, makerOverrides: saved.makerOverrides ?? {} }
    : { scenario: defaultScenario(country), makerOverrides: {} }
}

// Override scope key for the current drill node. The drill path is
// [pool, manufacturer, model, variantKey]; keys mirror the engine's scopes:
//   market → null · pool → "pool:NAME" · manufacturer → "MAKER" ·
//   model → "MAKER/MODEL" · variant → "MAKER/MODEL/VARIANTKEY"
// Lever scoping exists only where levers exist: the Scenario module's Model
// workbench. Analyse is actuals-only — nothing to scope there.
export function scopeKey(screen: ScreenId, drillPath: string[], scenarioTab?: ScenarioTab): string | null {
  if (screen !== 'scenario' || scenarioTab !== 'model' || drillPath.length === 0) return null
  const [pool, parent, model, variant] = drillPath
  switch (drillPath.length) {
    case 1: return `pool:${pool}`
    case 2: return parent
    case 3: return `${parent}/${model}`
    default: return `${parent}/${model}/${variant}`
  }
}

/** Who the server says you are. The workspace is the tenant boundary — every
 *  API read and write is scoped to it server-side. */
export interface SessionInfo { email: string; name: string; workspace: string }

export function defaultScenario(country: CountryId): Scenario {
  const pack = getPack(country)
  return {
    year: pack.defaultYear ?? pack.years[0],
    evSharePct: null,
    salesMultiplier: 1,
    massShiftKg: 0,
    ecoBoostG: 0,
    poolingEnabled: false,
    superCreditsEnabled: country === 'IN' || country === 'CN', // IN: draft CAFE III super-credits · CN: statutory NEV count multipliers
    mix: null,
    extraVariants: [],
    // Explicit so every persisted/shared scenario has the same shape (the engine
    // then never sees a "missing" key vs an explicit false/null).
    phevUF: true,
    creditPrice: null,
    targetShiftPct: null,
    cnfEnabled: true,
    // China dual-credit: null = statutory NEV ratio & pack credit price.
    nevRatioTarget: null,
    nevCreditPrice: null,
    affiliateTransfer: false,
  }
}

const BOOT = assumptionsFor('EU')

export const useStore = create<UIState>((set, get) => ({
  country: 'EU',
  screen: 'analyse',
  scenario: BOOT.scenario,
  selectedParent: parentsFor('EU')[0],
  drillPath: [],
  dataVersion: 0,
  scenarioTab: 'under',
  planScope: { through: null, mode: 'ytd' },
  makerOverrides: BOOT.makerOverrides,

  view: 'platform',
  platformScreen: 'home',
  subscribedModules: ENT0.modules,
  aiEnabled: ENT0.ai,
  poolingAddon: ENT0.pooling,
  viewMode: loadViewMode(),
  guideStep: -1,

  enterModule: (c) => {
    if (!get().subscribedModules.includes(c)) { set({ view: 'platform', platformScreen: 'subscription' }); return }
    const a = assumptionsFor(c) // restore the durable working assumptions for this module
    set({
      country: c,
      scenario: a.scenario,
      selectedParent: parentsFor(c)[0],
      drillPath: [],
      makerOverrides: a.makerOverrides,
      view: 'module',
      screen: 'analyse',
      scenarioTab: 'model',
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
  setViewMode: (m) => { try { localStorage.setItem(VIEW_KEY, m) } catch { /* ignore */ } ; set({ viewMode: m }) },
  startGuide: () => set({ guideStep: 0 }),
  setGuideStep: (i) => set({ guideStep: i }),
  endGuide: () => set({ guideStep: -1 }),

  savedScenarios: loadScenarios(),
  saveScenario: (label) => {
    const { scenario, makerOverrides, country, savedScenarios } = get()
    // Pin the actuals vintage this scenario was seeded from — after a new
    // import/refresh the UI can flag it as built on an older dataset.
    const item: SavedScenario = { id: `${Date.now()}-${Math.round(Math.random() * 1e6)}`, label: label.trim() || `Scenario ${savedScenarios.length + 1}`, country, scenario, overrides: makerOverrides, createdAt: Date.now(), datasetVersion: getMeta(country).datasetVersion }
    const next = [item, ...savedScenarios].slice(0, 60)
    saveScenarios(next); set({ savedScenarios: next })
  },
  loadScenario: (id) => {
    const it = get().savedScenarios.find((x) => x.id === id)
    if (!it || it.country !== get().country) return // scenarios load within their own module
    // Normalize against the current default so an older saved scenario (created
    // before some fields existed) still has the full shape the engine expects.
    const scenario = { ...defaultScenario(it.country), ...it.scenario }
    set({ scenario, makerOverrides: it.overrides ?? {}, drillPath: [] })
    persistAssumptions(it.country, scenario, it.overrides ?? {})
  },
  deleteScenario: (id) => { const next = get().savedScenarios.filter((x) => x.id !== id); saveScenarios(next); set({ savedScenarios: next }) },
  applyShared: (sh) => {
    const c = sh.country
    if (c && !get().subscribedModules.includes(c)) { set({ view: 'platform', platformScreen: 'modules' }); return }
    const country = c ?? get().country
    // Normalize the shared scenario to the current default shape.
    const scenario = sh.scenario ? { ...defaultScenario(country), ...sh.scenario } : get().scenario
    const makerOverrides = sh.overrides ?? {}
    // Drill path is [pool, manufacturer, model, variant]; keep it as-is (nodeAt
    // degrades gracefully on any stale segment) and sync selectedParent from the
    // manufacturer slot (index 1) when it still exists in this fleet vintage.
    const makers = parentsFor(country)
    const dp = Array.isArray(sh.drillPath) ? sh.drillPath : []
    const sharedParent = dp[1]
    // Old deep-links carry retired screen ids — normalise to the new modules.
    // 'analyze' (and its ancestors) → Analyse. Legacy 'plan' was two things:
    // the old Scenario GROUP (route by tab: forecast → Forecast, compare →
    // Scenario·compare) and briefly the workspace — default it to Analyse.
    const raw = sh.screen as string | undefined
    let screen: ScreenId = 'analyse'
    let scenarioTab: ScenarioTab = 'model'
    if (raw === 'model' || raw === 'under' || raw === 'compare' || raw === 'forecast') {
      if (raw === 'forecast') screen = 'forecast'
      else { screen = 'scenario'; scenarioTab = raw }
    } else if (raw === 'plan') {
      if (sh.planTab === 'forecast') screen = 'forecast'
      else if (sh.planTab === 'compare') { screen = 'scenario'; scenarioTab = 'compare' }
      // plan+under is ambiguous between eras — land on the monitoring surface
    } else if (raw === 'scenario') {
      screen = 'scenario'
      scenarioTab = sh.planTab === 'compare' ? 'compare' : sh.planTab === 'under' ? 'under' : 'model'
    } else if (raw && ['analyse', 'creditbook', 'pricing', 'pooling', 'dualcredit', 'data', 'intel', 'admin'].includes(raw)) {
      screen = raw as ScreenId
    } // 'analyze' / 'analytics' / unknown → 'analyse'
    set({
      country,
      scenario,
      makerOverrides,
      drillPath: dp,
      selectedParent: sharedParent && makers.includes(sharedParent) ? sharedParent : makers[0],
      screen,
      scenarioTab,
      view: 'module',
    })
    persistAssumptions(country, scenario, makerOverrides)
  },

  setCountry: (c) => {
    const a = assumptionsFor(c)
    set({
      country: c,
      scenario: a.scenario,
      selectedParent: parentsFor(c)[0],
      drillPath: [],
      makerOverrides: a.makerOverrides,
    })
  },
  setScreen: (s) => {
    if (s === 'pool') set({ screen: 'pooling' })
    else if (s === 'model' || s === 'under' || s === 'compare') set({ screen: 'scenario', scenarioTab: s })
    else if (s === 'analyze' || s === 'plan' || s === 'cockpit' || s === 'chart' || s === 'maker' || s === 'analytics') set({ screen: 'analyse' })
    else set({ screen: s })
  },
  setParent: (p) => set({ selectedParent: p }),
  patchOverride: (scope, patch) => {
    const { makerOverrides, scenario, country } = get()
    const next = { ...makerOverrides }
    if (patch === null) delete next[scope]
    else next[scope] = { ...(next[scope] ?? {}), ...patch }
    set({ makerOverrides: next })
    persistAssumptions(country, scenario, next)
  },
  setPlanScope: (planScope) => set({ planScope }),
  patchScenario: (p) => {
    const { drillPath, screen, scenarioTab, scenario, makerOverrides, country } = get()
    // a month index is only meaningful within one year's filing depth
    if (p.year !== undefined && p.year !== scenario.year) set({ planScope: { through: null, mode: 'ytd' } })
    const scope = scopeKey(screen, drillPath, scenarioTab)
    if (!scope) {
      const next = { ...scenario, ...p }
      set({ scenario: next }); persistAssumptions(country, next, makerOverrides); return
    }
    // Drilled in, mix/mass/sales/EV/eco edits scope to the current node (brand
    // at "Maker", model at "Maker/Model") — eco-innovation certificates belong
    // to the manufacturer, so the eco lever scopes too. The rest (year, pooling,
    // super-credits, variants, PHEV UF, credit price) are regulator-side and
    // stay global.
    const SCOPED = new Set(['mix', 'massShiftKg', 'salesMultiplier', 'evSharePct', 'ecoBoostG'])
    const globalPart: any = {}, scopedPart: any = {}
    for (const k of Object.keys(p)) (SCOPED.has(k) ? scopedPart : globalPart)[k] = (p as any)[k]
    const nextScenario = { ...scenario, ...globalPart }
    const nextOverrides = Object.keys(scopedPart).length
      ? { ...makerOverrides, [scope]: { ...(makerOverrides[scope] ?? {}), ...scopedPart } }
      : makerOverrides
    set({ scenario: nextScenario, makerOverrides: nextOverrides })
    persistAssumptions(country, nextScenario, nextOverrides)
  },
  resetScenario: () => {
    const { drillPath, screen, scenarioTab, makerOverrides, scenario, country } = get()
    const scope = scopeKey(screen, drillPath, scenarioTab)
    if (scope) {
      const next = { ...makerOverrides }; delete next[scope]
      set({ makerOverrides: next }); persistAssumptions(country, scenario, next); return
    }
    const def = defaultScenario(country)
    set({ scenario: def, makerOverrides: {} }); persistAssumptions(country, def, {})
  },
  setDrill: (path) => set({ drillPath: path }),

  session: null,
  authChecked: false,

  /** Resolves to an error message, or null on success. */
  login: async (email, password) => {
    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) return body?.error || 'Sign-in failed.'
      set({ session: body as SessionInfo, authChecked: true })
      return null
    } catch {
      return 'Could not reach the server.'
    }
  },

  logout: async () => {
    try { await fetch('/api/session', { method: 'DELETE' }) } catch { /* clear locally anyway */ }
    // Drop this workspace's cached work so the next sign-in on this machine
    // never inherits it — the demo-to-demo leak this whole change is about.
    for (const k of [SCEN_KEY, ASSUMP_KEY]) { try { localStorage.removeItem(k) } catch { /* ignore */ } }
    set({ session: null, authChecked: true, savedScenarios: [], view: 'platform', platformScreen: 'home' })
  },

  checkSession: async () => {
    try {
      const res = await fetch('/api/session')
      if (res.ok) set({ session: (await res.json()) as SessionInfo, authChecked: true })
      else set({ session: null, authChecked: true })
    } catch {
      set({ session: null, authChecked: true })
    }
  },

  loadFleet: async () => {
    let loaded = false
    // Snapshot, before any await, whether the active country already has local
    // working assumptions — so the async server-hydrate below never clobbers live
    // edits made during the fetch (it only fills a genuinely-empty country).
    const bootCountry = get().country
    const bootHadLocal = !!loadAssumptionMap()[bootCountry]
    await Promise.all(
      PACK_LIST.map(async (pack) => {
        try {
          // no-store: the response carries CDN cache headers (s-maxage) that some
          // browsers also honour heuristically — after a user import, a reload
          // must show the imported dataset, not the boot-time cached one.
          const res = await fetch(`/api/fleet?country=${pack.id}`, { cache: 'no-store' })
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
    // Hydrate saved scenarios + working assumptions from the durable server store.
    // localStorage stays the live source of truth; the server only fills gaps so a
    // fresh device/browser recovers what was saved elsewhere — nothing is clobbered.
    try {
      const res = await fetch('/api/scenarios')
      if (res.ok) {
        const blob = await res.json()
        if (Array.isArray(blob?.scenarios) && blob.scenarios.length && get().savedScenarios.length === 0) {
          saveScenarios(blob.scenarios as SavedScenario[]) // mirrors back, harmless
          set({ savedScenarios: blob.scenarios as SavedScenario[] })
        }
        if (blob?.assumptions && typeof blob.assumptions === 'object') {
          const local = loadAssumptionMap()
          let filled = false
          for (const k of Object.keys(blob.assumptions)) {
            if (!local[k as CountryId]) { local[k as CountryId] = blob.assumptions[k] as Assumptions; filled = true }
          }
          if (filled) try { localStorage.setItem(ASSUMP_KEY, JSON.stringify(local)) } catch { /* ignore */ }
          // Only adopt into the LIVE store if the active country had no local set
          // at boot AND the server just supplied one — never overwrite the user's
          // in-session edits or a deep-link that ran while this fetch was pending.
          if (!bootHadLocal && get().country === bootCountry && local[bootCountry]) {
            const a = assumptionsFor(bootCountry)
            set({ scenario: a.scenario, makerOverrides: a.makerOverrides })
          }
        }
      }
    } catch { /* server optional — localStorage already covers the live UI */ }
  },
}))
