// GET /api/fleet?country=EU — live normalized fleet + provenance from the store
// (Neon in prod, local file store in dev). Falls back to the bundled extract on
// the client only if this returns { fallback: true }.
//
// Requires a session: this serves whichever dataset the caller's workspace has
// live, which for a customer that has imported its own book is that book.
import { getCurrent } from './_store.js'
import { requireSession } from './_auth.js'
import type { CountryId } from '../src/engine/types.js'

const MARKETS = new Set(['EU', 'IN', 'AU', 'UK', 'CN'])

export default async function handler(req: any, res: any) {
  const session = requireSession(req, res)
  if (!session) return
  const country = String(req.query?.country ?? 'EU').toUpperCase() as CountryId
  if (!MARKETS.has(country)) { res.status(400).json({ error: `unknown market "${country}" — expected one of ${[...MARKETS].join(', ')}` }); return }
  try {
    const data = await getCurrent(country, session.workspace)
    if (!data) { res.status(200).json({ fallback: true, reason: 'no dataset loaded' }); return }
    // Per-workspace payload — private only, or a CDN would serve one tenant's
    // dataset to another.
    res.setHeader('Cache-Control', 'private, no-store')
    res.status(200).json({ vehicles: data.vehicles, meta: data.meta })
  } catch (e: any) {
    res.status(200).json({ fallback: true, reason: String(e?.message ?? e) })
  }
}
