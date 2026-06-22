// GET /api/fleet?country=EU — live normalized fleet + provenance from the store
// (Neon in prod, local file store in dev). Falls back to the bundled extract on
// the client only if this returns { fallback: true }.
import { getCurrent } from './_store.js'
import type { CountryId } from '../src/engine/types.js'

export default async function handler(req: any, res: any) {
  const country = String(req.query?.country ?? 'EU').toUpperCase() as CountryId
  try {
    const data = await getCurrent(country)
    if (!data) { res.status(200).json({ fallback: true, reason: 'no dataset loaded' }); return }
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=86400')
    res.status(200).json({ vehicles: data.vehicles, meta: data.meta })
  } catch (e: any) {
    res.status(200).json({ fallback: true, reason: String(e?.message ?? e) })
  }
}
