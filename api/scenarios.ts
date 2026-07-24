// /api/scenarios — durable home for saved scenarios + the active per-country
// assumption set. GET returns the workspace blob; PUT merge-patches it. Backed by
// Neon when DATABASE_URL is set, else the local file store (zero-config dev).
// The client treats localStorage as the live source of truth and mirrors here, so
// the app degrades gracefully if the backend is unavailable.
import { getScenarioBlob, putScenarioBlob } from './_store.js'

// Hard caps so a buggy or hostile client can't grow the blob unboundedly: the
// store keeps at most 60 scenarios client-side, so mirror that here, and bound
// the raw payload well above any legitimate workspace size.
const MAX_BODY_BYTES = 512 * 1024
const MAX_SCENARIOS = 60
const VALID_COUNTRIES = new Set(['EU', 'IN', 'AU', 'UK', 'CN'])

/** Minimal shape check — a saved scenario the engine can actually replay. */
function validScenario(s: any): boolean {
  return !!s && typeof s === 'object'
    && typeof s.id === 'string' && s.id.length <= 64
    && typeof s.label === 'string' && s.label.length <= 120
    && VALID_COUNTRIES.has(s.country)
    && !!s.scenario && typeof s.scenario === 'object'
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store')
      const blob = await getScenarioBlob()
      res.status(200).json(blob)
      return
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      const body = req.body ?? {}
      if (typeof body !== 'object' || Array.isArray(body)) { res.status(400).json({ error: 'body must be a JSON object' }); return }
      if (JSON.stringify(body).length > MAX_BODY_BYTES) { res.status(413).json({ error: `payload exceeds ${MAX_BODY_BYTES / 1024}KB` }); return }

      const patch: { scenarios?: unknown[]; assumptions?: Record<string, unknown> } = {}
      if (Array.isArray(body.scenarios)) {
        const good = body.scenarios.filter(validScenario).slice(0, MAX_SCENARIOS)
        if (good.length < body.scenarios.length) {
          // don't silently drop everything on a malformed mirror — reject so the
          // client keeps its localStorage copy authoritative
          if (good.length === 0 && body.scenarios.length > 0) { res.status(400).json({ error: 'no valid scenarios in payload' }); return }
        }
        patch.scenarios = good
      }
      if (body.assumptions && typeof body.assumptions === 'object' && !Array.isArray(body.assumptions)) {
        const keys = Object.keys(body.assumptions)
        if (keys.some((k) => !VALID_COUNTRIES.has(k))) { res.status(400).json({ error: 'assumptions keys must be market ids' }); return }
        patch.assumptions = body.assumptions
      }
      if (!patch.scenarios && !patch.assumptions) { res.status(400).json({ error: 'nothing to store — expected scenarios[] and/or assumptions{}' }); return }

      const next = await putScenarioBlob(patch)
      res.status(200).json(next)
      return
    }
    res.setHeader('Allow', 'GET, PUT, POST')
    res.status(405).json({ error: 'method not allowed' })
  } catch (e: any) {
    // storage unavailable is not a client error, but don't mask it as success
    res.status(503).json({ error: String(e?.message ?? e) })
  }
}
