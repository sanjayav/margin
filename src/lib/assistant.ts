// Workspace actions — the one place a machine-proposed change is turned into a
// real store mutation. The co-pilot streams these as PROPOSALS (src/lib/copilot);
// nothing here runs until a person approves it, and the guided walkthrough uses
// the same path so there is a single audited way into the workspace.
import { useStore } from '../state/store'
import type { CountryId } from '../engine/types'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface DashboardAction {
  /** One line the co-pilot gives for why it wants this change. */
  why?: string
  country?: CountryId
  screen?: string
  parent?: string
  drillPath?: string[]
  year?: number
  evSharePct?: number
  massShiftKg?: number
  salesMultiplier?: number
  ecoBoostG?: number
  mix?: Record<string, number>
  creditPrice?: number
  phevUF?: boolean
  poolingEnabled?: boolean
  superCreditsEnabled?: boolean
}

/** Apply the model's view changes to the live store, in dependency order. */
export function applyActions(actions: DashboardAction[]) {
  const s = useStore.getState()
  for (const a of actions) {
    // The AI may only move the workspace into a SUBSCRIBED module — route through
    // the gated enterModule (never the raw setCountry), and ignore unowned markets.
    if (a.country && a.country !== s.country) {
      if (!s.subscribedModules.includes(a.country)) continue
      s.enterModule(a.country)
    }
    if (a.parent) s.setParent(a.parent)
    if (a.screen) s.setScreen(a.screen as any)
    if (Array.isArray(a.drillPath)) useStore.getState().setDrill(a.drillPath)
    const patch: Record<string, unknown> = {}
    for (const k of ['year', 'evSharePct', 'massShiftKg', 'salesMultiplier', 'ecoBoostG', 'mix', 'creditPrice', 'phevUF', 'poolingEnabled', 'superCreditsEnabled'] as const) {
      if (a[k] != null) patch[k] = a[k]
    }
    if (Object.keys(patch).length) useStore.getState().patchScenario(patch)
  }
}
