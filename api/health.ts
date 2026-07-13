// GET /api/health — ops probe: which store backend is live, what data each
// market has, and whether the AI analyst is configured. Safe to expose: no
// secrets, only presence booleans and dataset metadata.
import { getCurrent, backend } from './_store.js'
import type { CountryId } from '../src/engine/types.js'

const MARKETS: CountryId[] = ['EU', 'IN', 'AU', 'UK']

export default async function handler(_req: any, res: any) {
  const markets: Record<string, { rows: number; live: boolean; refreshed: string | null } | { error: string }> = {}
  for (const m of MARKETS) {
    try {
      const d = await getCurrent(m)
      markets[m] = d
        ? { rows: d.vehicles.length, live: d.meta.live, refreshed: d.meta.lastRefreshed }
        : { rows: 0, live: false, refreshed: null }
    } catch (e: any) {
      markets[m] = { error: String(e?.message ?? e) }
    }
  }
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({
    ok: true,
    backend,
    ai: !!process.env.ANTHROPIC_API_KEY,
    markets,
    time: new Date().toISOString(),
  })
}
