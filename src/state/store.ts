import { create } from 'zustand'
import type { CountryId, Scenario, Vehicle } from '../engine/types'
import { getPack, PACK_LIST } from '../engine/rulepacks'
import { parentsFor, setLiveFleet } from '../data/fleet'

export type ScreenId = 'analyze' | 'analytics' | 'data' | 'plan' | 'intel' | 'admin'
export type PlanTab = 'under' | 'pool' | 'forecast'
// legacy ids still accepted by setScreen and mapped to the new structure
type AnyScreen = ScreenId | 'cockpit' | 'chart' | 'maker' | PlanTab

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

// Scope key for the current drill level: null (market), "Maker" (brand), or
// "Maker/Model" (model). Variant level (3) still scopes to its model.
export function scopeKey(screen: ScreenId, drillPath: string[]): string | null {
  if (screen !== 'analyze' || drillPath.length === 0) return null
  return drillPath.length >= 2 ? `${drillPath[0]}/${drillPath[1]}` : drillPath[0]
}

// Single demo credential
export const CRED = { user: 'vijay@margin.io', pass: 'marginio' }
const isAuthed = () => { try { return localStorage.getItem('ul_auth') === '1' } catch { return false } }

function defaultScenario(country: CountryId): Scenario {
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

  setCountry: (c) =>
    set({
      country: c,
      scenario: defaultScenario(c),
      selectedParent: parentsFor(c)[0],
      drillPath: [],
      makerOverrides: {},
    }),
  setScreen: (s) => {
    if (s === 'under' || s === 'pool' || s === 'forecast') set({ screen: 'plan', planTab: s })
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
  logout: () => { try { localStorage.removeItem('ul_auth') } catch { /* ignore */ } ; set({ authed: false }) },

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
