// POST /api/import — persist a user-imported dataset (OEM actuals / S&P Global
// Mobility / JATO) as the market's live dataset, via the same store the EEA
// refresh uses (Neon in prod, local JSON file in dev). The client has already
// made the data live in-session; this makes it durable.
import { putDataset, SOURCES, backend } from './_store.js'
import type { CountryId, Vehicle } from '../src/engine/types.js'

const MARKETS = new Set(['EU', 'IN', 'AU', 'UK'])
const MAX_ROWS = 100_000

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return }
  const { market, source, rows } = (req.body ?? {}) as { market?: string; source?: string; rows?: Vehicle[] }
  const m = String(market ?? '').toUpperCase() as CountryId
  if (!MARKETS.has(m)) { res.status(400).json({ error: `unknown market "${market}"` }); return }
  if (!Array.isArray(rows) || rows.length === 0) { res.status(400).json({ error: 'rows must be a non-empty array' }); return }
  if (rows.length > MAX_ROWS) { res.status(400).json({ error: `too many rows (${rows.length} > ${MAX_ROWS})` }); return }
  // minimal shape check — full validation already happened client-side
  const bad = rows.findIndex((r) => !r || typeof r.parent !== 'string' || !r.parent || typeof r.model !== 'string' || typeof r.year !== 'number' || typeof r.sales !== 'number')
  if (bad >= 0) { res.status(400).json({ error: `row ${bad + 1} is missing parent/model/year/sales` }); return }
  try {
    const version = await putDataset(m, source || `User import`, SOURCES[m].url, rows)
    res.status(200).json({ market: m, datasetVersion: version, rows: rows.length, backend })
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message ?? e) })
  }
}
