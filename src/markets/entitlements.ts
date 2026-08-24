// ───────────────────────────────────────────────────────────────────────────
// ENTITLEMENTS — what this customer has bought, resolved per market.
//
// The model this replaces used global booleans: buying "Pooling" once unlocked it
// in every market. That under-charges (EU pooling is worth far more than
// Australian pooling) and it is also wrong — China has no pooled average in law,
// so the capability should not be lockable there, it should be absent.
//
// Three states, and the difference matters commercially:
//   owned        the customer bought it
//   sellable     they have not, but they could — show what it is worth
//   unavailable  the regime does not permit it — never offer, never upsell
// ───────────────────────────────────────────────────────────────────────────
import type { CountryId } from '../engine/types'
import type { AddonId, MarketDefinition, MarketModule } from './types'
import { PLATFORM_ADDONS } from './types'

export interface Entitlements {
  /** Markets on the account. */
  markets: CountryId[]
  /** Platform-wide add-ons (ai, portfolio). */
  platform: AddonId[]
  /** Per-market add-ons: { EU: ['pooling'] }. */
  perMarket: Partial<Record<CountryId, AddonId[]>>
}

export type Access = 'owned' | 'sellable' | 'unavailable'

export function moduleAccess(market: MarketDefinition, module: MarketModule, ent: Entitlements): Access {
  if (!module.addon) return 'owned' // base feature of the market
  const addon = module.addon
  // Platform add-ons are bought once and apply everywhere they are offered.
  if (PLATFORM_ADDONS.includes(addon)) return ent.platform.includes(addon) ? 'owned' : 'sellable'
  // A market that cannot legally offer the capability never lists it.
  if (market.sellableAddons && !market.sellableAddons.includes(addon)) return 'unavailable'
  return (ent.perMarket[market.id] ?? []).includes(addon) ? 'owned' : 'sellable'
}

/** Nav should show owned and sellable modules (sellable ones sell themselves),
 *  and never show what the regime does not permit. */
export function visibleModules(market: MarketDefinition, ent: Entitlements): { module: MarketModule; access: Access }[] {
  return market.nav
    .flatMap((g) => g.modules)
    .map((id) => market.modules[id])
    .filter((m): m is MarketModule => !!m && !m.hidden)
    .map((module) => ({ module, access: moduleAccess(market, module, ent) }))
    .filter((x) => x.access !== 'unavailable')
}

/** Reads the legacy store shape while billing is still a demo. One place to
 *  change when entitlements become server-authoritative — which they must, since
 *  today they live in localStorage and are trivially editable by the customer. */
export function entitlementsFrom(subscribedModules: CountryId[], aiEnabled: boolean, poolingAddon: boolean): Entitlements {
  return {
    markets: subscribedModules,
    platform: aiEnabled ? ['ai'] : [],
    perMarket: poolingAddon
      ? Object.fromEntries(subscribedModules.map((c) => [c, ['pooling'] as AddonId[]]))
      : {},
  }
}
