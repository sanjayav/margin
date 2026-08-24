// GET /api/health — ops probe: which store backend is live, what data each
// market has, and whether the AI analyst is configured. Deliberately the one
// unauthenticated route, because an uptime check that needs a session is not an
// uptime check. It reports on the SHARED baseline only — never a workspace's
// own data — and reports failures as a boolean rather than echoing internals.
import { getCurrent, backend } from './_store.js'
import type { CountryId } from '../src/engine/types.js'

const MARKETS: CountryId[] = ['EU', 'IN', 'AU', 'UK', 'CN']

export default async function handler(_req: any, res: any) {
  const markets: Record<string, { rows: number; live: boolean; refreshed: string | null } | { error: string }> = {}
  for (const m of MARKETS) {
    try {
      const d = await getCurrent(m)
      markets[m] = d
        ? { rows: d.vehicles.length, live: d.meta.live, refreshed: d.meta.lastRefreshed }
        : { rows: 0, live: false, refreshed: null }
    } catch (e: any) {
      // Log the detail server-side; return only that it failed. A raw error
      // string on a public endpoint is free reconnaissance.
      console.error(`[health] ${m}:`, e?.message ?? e)
      markets[m] = { error: 'unavailable' }
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
