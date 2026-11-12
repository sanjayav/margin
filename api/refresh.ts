// POST/GET /api/refresh?market=EU — reload a market's dataset and make it live.
// Seeds from the bundled official extract (fast, always works). For the full
// EEA load use `npm run ingest:eu`. Cron-gated via CRON_SECRET (Vercel sends it
// as a Bearer token); open in local dev when no secret is set.
import { timingSafeEqual } from 'node:crypto'
import { putDataset, SOURCES, backend } from './_store.js'
import fleet from '../src/data/fleet_data.js'
import type { CountryId, Vehicle } from '../src/engine/types.js'

function authed(req: any): boolean {
  const secret = process.env.CRON_SECRET
  // This route rewrites the SHARED baseline every workspace falls back to, so an
  // unauthenticated caller could replace the data under every customer. Open
  // without a secret in local dev only; in production, no secret means no.
  if (!secret) return process.env.VERCEL_ENV !== 'production'
  const hdr = String(req.headers?.authorization || req.headers?.Authorization || '')
  return safeEq(hdr, `Bearer ${secret}`) || safeEq(String(req.headers?.['x-cron-secret'] || ''), secret)
}

/** Constant-time compare, so response timing does not leak the secret. */
function safeEq(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
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
