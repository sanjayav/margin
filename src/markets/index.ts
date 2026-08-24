// The market registry. Adding a market is adding a file here — no shared screen,
// nav or conditional changes to support it.
import type { CountryId } from '../engine/types'
import type { MarketDefinition } from './types'
import EU from './eu'

export const MARKETS: Partial<Record<CountryId, MarketDefinition>> = { EU }

export const getMarket = (id: CountryId): MarketDefinition | null => MARKETS[id] ?? null
export * from './types'
