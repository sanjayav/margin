import { useStore } from '../state/store'
import type { CountryId } from '../engine/types'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface DashboardAction {
  country?: CountryId
  screen?: string
  parent?: string
  year?: number
  evSharePct?: number
  massShiftKg?: number
  salesMultiplier?: number
  ecoBoostG?: number
  poolingEnabled?: boolean
  superCreditsEnabled?: boolean
}

/** Apply the model's view changes to the live store, in dependency order. */
export function applyActions(actions: DashboardAction[]) {
  const s = useStore.getState()
  for (const a of actions) {
    if (a.country && a.country !== s.country) s.setCountry(a.country)
    if (a.parent) s.setParent(a.parent)
    if (a.screen) s.setScreen(a.screen as any)
    const patch: Record<string, unknown> = {}
    for (const k of ['year', 'evSharePct', 'massShiftKg', 'salesMultiplier', 'ecoBoostG', 'poolingEnabled', 'superCreditsEnabled'] as const) {
      if (a[k] != null) patch[k] = a[k]
    }
    if (Object.keys(patch).length) useStore.getState().patchScenario(patch)
  }
}

export async function ask(message: string, history: ChatMessage[]): Promise<{ answer: string; actions: DashboardAction[] }> {
  const s = useStore.getState()
  const res = await fetch('/api/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      history,
      context: { country: s.country, parent: s.selectedParent, screen: s.screen, scenario: s.scenario },
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Request failed (${res.status})`)
  }
  return res.json()
}
