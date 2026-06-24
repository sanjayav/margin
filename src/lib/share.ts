// Shareable deep-links: serialise the workspace state into the URL hash so any
// analysis is reproducible and forwardable. Copy-on-demand (no continuous sync,
// so no feedback loops); the recipient lands on the identical computed verdict.
import { useStore } from '../state/store'

export function buildShareUrl(): string {
  const s = useStore.getState()
  const payload = { country: s.country, screen: s.screen, planTab: s.planTab, drillPath: s.drillPath, scenario: s.scenario, overrides: s.makerOverrides }
  const enc = btoa(encodeURIComponent(JSON.stringify(payload)))
  const url = `${location.origin}${location.pathname}#s=${enc}`
  try { history.replaceState(null, '', url) } catch { /* ignore */ }
  return url
}

/** On load, hydrate the store from a #s=… deep-link if present. */
export function applySharedFromHash(): void {
  try {
    const m = location.hash.match(/#s=(.+)$/)
    if (!m) return
    const payload = JSON.parse(decodeURIComponent(atob(m[1])))
    useStore.getState().applyShared(payload)
  } catch { /* malformed link — ignore */ }
}
