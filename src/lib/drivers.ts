// ───────────────────────────────────────────────────────────────────────────
// The Assumption Book state — per-market driver overrides, governance
// (review status per driver), case weights and the Management-case pick.
// Persisted to localStorage so the book survives reloads; defaults come from
// the engine's sourced registry (engine/outlook.ts), overrides layer on top.
// ───────────────────────────────────────────────────────────────────────────
import { create } from 'zustand'
import type { CountryId } from '../engine/types'
import { DRIVER_DEFAULTS, type DriverKey, type DriverSet } from '../engine/outlook'

export type DriverStatus = 'draft' | 'reviewed' | 'signed-off'
export interface DriverGov { status: DriverStatus; reviewedAt: number | null }
export interface CaseWeights { base: number; upside: number; downside: number; mgmt: number }

interface DriversState {
  overrides: Partial<Record<CountryId, Partial<DriverSet>>>
  governance: Partial<Record<CountryId, Partial<Record<DriverKey, DriverGov>>>>
  weights: Partial<Record<CountryId, CaseWeights>>
  /** Saved-scenario id used as the Management case (per market); null = none. */
  mgmtScenarioId: Partial<Record<CountryId, string | null>>

  setDriver: (c: CountryId, k: DriverKey, v: number) => void
  resetDrivers: (c: CountryId) => void
  setStatus: (c: CountryId, k: DriverKey, s: DriverStatus) => void
  setWeights: (c: CountryId, w: Partial<CaseWeights>) => void
  setMgmtScenario: (c: CountryId, id: string | null) => void
}

const KEY = 'ul_drivers'
type Persisted = Pick<DriversState, 'overrides' | 'governance' | 'weights' | 'mgmtScenarioId'>

function load(): Persisted {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) || '{}')
    return { overrides: r.overrides ?? {}, governance: r.governance ?? {}, weights: r.weights ?? {}, mgmtScenarioId: r.mgmtScenarioId ?? {} }
  } catch { return { overrides: {}, governance: {}, weights: {}, mgmtScenarioId: {} } }
}
function save(s: Persisted) {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* ignore */ }
}

const P0 = load()

export const useDrivers = create<DriversState>((set, get) => ({
  overrides: P0.overrides,
  governance: P0.governance,
  weights: P0.weights,
  mgmtScenarioId: P0.mgmtScenarioId,

  setDriver: (c, k, v) => {
    const overrides = { ...get().overrides, [c]: { ...(get().overrides[c] ?? {}), [k]: v } }
    // editing an assumption demotes it to draft — sign-off is for a VALUE
    const governance = { ...get().governance, [c]: { ...(get().governance[c] ?? {}), [k]: { status: 'draft' as DriverStatus, reviewedAt: null } } }
    set({ overrides, governance })
    save({ ...get(), overrides, governance })
  },
  resetDrivers: (c) => {
    const overrides = { ...get().overrides, [c]: {} }
    set({ overrides })
    save({ ...get(), overrides })
  },
  setStatus: (c, k, st) => {
    const governance = { ...get().governance, [c]: { ...(get().governance[c] ?? {}), [k]: { status: st, reviewedAt: st === 'draft' ? null : Date.now() } } }
    set({ governance })
    save({ ...get(), governance })
  },
  setWeights: (c, w) => {
    const cur = get().weights[c] ?? { base: 0.5, upside: 0.25, downside: 0.25, mgmt: 0 }
    const weights = { ...get().weights, [c]: { ...cur, ...w } }
    set({ weights })
    save({ ...get(), weights })
  },
  setMgmtScenario: (c, id) => {
    const mgmtScenarioId = { ...get().mgmtScenarioId, [c]: id }
    set({ mgmtScenarioId })
    save({ ...get(), mgmtScenarioId })
  },
}))

/** Effective driver set for a market: sourced defaults + the analyst's overrides. */
export function driverSetFor(c: CountryId, overrides: Partial<Record<CountryId, Partial<DriverSet>>>): DriverSet {
  return { ...DRIVER_DEFAULTS[c], ...(overrides[c] ?? {}) }
}

export function weightsFor(c: CountryId, weights: Partial<Record<CountryId, CaseWeights>>, hasMgmt: boolean): CaseWeights {
  const w = weights[c] ?? { base: 0.5, upside: 0.25, downside: 0.25, mgmt: hasMgmt ? 0.2 : 0 }
  const total = w.base + w.upside + w.downside + (hasMgmt ? w.mgmt : 0)
  if (total <= 0) return { base: 1, upside: 0, downside: 0, mgmt: 0 }
  return {
    base: w.base / total,
    upside: w.upside / total,
    downside: w.downside / total,
    mgmt: hasMgmt ? w.mgmt / total : 0,
  }
}
