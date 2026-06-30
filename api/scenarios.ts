// /api/scenarios — durable home for saved scenarios + the active per-country
// assumption set. GET returns the workspace blob; PUT merge-patches it. Backed by
// Neon when DATABASE_URL is set, else the local file store (zero-config dev).
// The client treats localStorage as the live source of truth and mirrors here, so
// the app degrades gracefully if the backend is unavailable.
import { getScenarioBlob, putScenarioBlob } from './_store.js'

export default async function handler(req: any, res: any) {
  try {
    if (req.method === 'GET') {
      const blob = await getScenarioBlob()
      res.status(200).json(blob)
      return
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      const body = req.body ?? {}
      const patch = {
        ...(Array.isArray(body.scenarios) ? { scenarios: body.scenarios } : {}),
        ...(body.assumptions && typeof body.assumptions === 'object' ? { assumptions: body.assumptions } : {}),
      }
      const next = await putScenarioBlob(patch)
      res.status(200).json(next)
      return
    }
    res.status(405).json({ error: 'method not allowed' })
  } catch (e: any) {
    res.status(200).json({ ok: false, reason: String(e?.message ?? e) })
  }
}
