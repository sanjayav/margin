// POST/GET /api/refresh?market=EU — reload a market's dataset and make it live.
// Seeds from the bundled official extract (fast, always works). For the full
// EEA load use `npm run ingest:eu`. Cron-gated via CRON_SECRET (Vercel sends it
// as a Bearer token); open in local dev when no secret is set.
import { putDataset, SOURCES, backend } from './_store'
import fleet from '../src/data/fleet_data.json'
import type { CountryId, Vehicle } from '../src/engine/types'

function authed(req: any): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  const hdr = req.headers?.authorization || req.headers?.Authorization
  return hdr === `Bearer ${secret}` || (req.headers?.['x-cron-secret'] || '') === secret
}

export default async function handler(req: any, res: any) {
  if (!authed(req)) { res.status(401).json({ error: 'unauthorized' }); return }
  const market = String(req.query?.market ?? 'EU').toUpperCase() as CountryId
  const rows = (fleet as any)[market] as Vehicle[] | undefined
  const src = SOURCES[market]
  if (!rows || !src) { res.status(400).json({ error: `unknown market ${market}` }); return }
  try {
    const version = await putDataset(market, `${src.name} (extract)`, src.url, rows)
    res.status(200).json({ market, datasetVersion: version, rows: rows.length, source: src.name, backend })
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message ?? e) })
  }
}
