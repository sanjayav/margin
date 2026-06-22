import type { CountryId, Vehicle } from '../engine/types'
import raw from './fleet_data'

const data = raw as unknown as Record<CountryId, Vehicle[]>

/** Bundled official extract — the offline fallback. */
export const FLEET: Record<CountryId, Vehicle[]> = {
  EU: data.EU,
  IN: data.IN,
  AU: data.AU,
  UK: data.UK,
}

export interface FleetMeta {
  source: string
  lastRefreshed: string | null
  datasetVersion: string
  live: boolean
}

// Live data loaded from the DB at runtime overrides the bundled extract.
const liveFleet: Partial<Record<CountryId, Vehicle[]>> = {}
const liveMeta: Partial<Record<CountryId, FleetMeta>> = {}

export function setLiveFleet(id: CountryId, rows: Vehicle[], meta: FleetMeta) {
  liveFleet[id] = rows
  liveMeta[id] = meta
}

/** The fleet the app should use: live DB data if loaded, else the bundled extract. */
export const getFleet = (id: CountryId): Vehicle[] => liveFleet[id] ?? FLEET[id]

export const getMeta = (id: CountryId): FleetMeta =>
  liveMeta[id] ?? { source: `Bundled extract (offline)`, lastRefreshed: DATA_REFRESHED[id], datasetVersion: 'extract', live: false }

export const parentsFor = (id: CountryId): string[] =>
  [...new Set(getFleet(id).map((v) => v.parent))].sort()

export const DATA_REFRESHED: Record<CountryId, string> = {
  EU: '2026-05-18',
  IN: '2026-04-30',
  AU: '2026-05-02',
  UK: '2026-05-11',
}
