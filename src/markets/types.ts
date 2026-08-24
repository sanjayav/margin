// ───────────────────────────────────────────────────────────────────────────
// MARKET MODULES — a market owns its own screens, navigation and language.
//
// The problem this replaces: shared screens carried 41 `country === '...'`
// branches across 18 files, and the split was half-done — China had its own
// Analyze and Forecast, India its own Intelligence, everyone else shared. Every
// new market divergence made the shared screens worse, and there was no way to
// give one market a module another market does not have.
//
// So a market REGISTERS itself. It declares which modules it has, what they are
// called in that regime's own language, and which component renders each one.
// Nothing shared needs to know a market exists:
//
//   · China simply does not register `pooling` (the law forbids a pooled
//     average) — instead of a shared Pooling screen apologising for China.
//   · The UK can call its metric surface "ZEV mandate" rather than "Fleet CO2",
//     because a unit mandate is not a CO2 line.
//   · India can register an extra module nobody else has.
//
// Shared code owns: the engine, the design primitives, the app shell. It never
// owns a market's opinion.
// ───────────────────────────────────────────────────────────────────────────
import type { ComponentType } from 'react'
import type { CountryId } from '../engine/types'
import type { IconName } from '../components/Icon'

/** The four core destinations every market has. A market may register a subset,
 *  and may add its own `extra` modules beyond them. */
export type CoreModuleId = 'overview' | 'analyse' | 'plan' | 'data'

/** Commercial packaging. Markets are the primary SKU; capabilities are sold on
 *  top of them, and the split matters:
 *
 *   · PER-MARKET add-ons carry market-specific value. Pooling is worth a lot in
 *     the EU and is not legally possible in China — so it is not merely locked
 *     there, it is not sellable there, and saying so is a credibility signal.
 *   · PLATFORM add-ons cut across markets. `portfolio` is the natural upsell:
 *     it is worth nothing at one market and compounds at three.
 *
 *  The base/plan split also maps to the two buyers. Compliance buys the base
 *  (position, drill, data, provenance, filing). Planning buys the forward
 *  capability (forecast, scenario, cheapest path, assumptions). Two budgets, one
 *  platform, and a natural land-and-expand. */
export type AddonId = 'pooling' | 'planning' | 'radar' | 'ai' | 'portfolio'
export const PLATFORM_ADDONS: AddonId[] = ['ai', 'portfolio']

export interface MarketModule {
  id: string
  /** What this market calls it. "Pooling" in the EU, "Credit clearing" in China. */
  label: string
  icon: IconName
  /** One line under the title — what question this module answers, in this regime. */
  purpose: string
  component: ComponentType
  /** Undefined = included in the market's base price. */
  addon?: AddonId
  /** What unlocking is worth, computed from the customer's OWN data. A paywall
   *  listing features is a wall; "pooling would remove EUR 3.50B of your
   *  exposure" is an argument. Returns null when there is nothing to claim. */
  value?: () => { headline: string; detail: string } | null
  /** Hidden from nav but still routable (deep links, AI navigation). */
  hidden?: boolean
}

export interface MarketDefinition {
  id: CountryId
  /** Add-ons this market can sell at all. Omitting one means the capability does
   *  not exist here in law — China cannot pool — so it is never offered, never
   *  upsold, and never rendered as "locked". */
  sellableAddons?: AddonId[]
  /** The regime in the market's own words, for the shell header. */
  name: string
  regulation: string
  /** Ordered nav. Groups are cosmetic; the ids are what routes. */
  nav: { group: string; modules: string[] }[]
  modules: Record<string, MarketModule>
  /** Where a market opens. */
  home: string
}

export function defineMarket(def: MarketDefinition): MarketDefinition {
  // A nav entry that points at a module the market never registered is a
  // dead link that only shows up at runtime, in that market, for that user.
  for (const g of def.nav) {
    for (const id of g.modules) {
      if (!def.modules[id]) throw new Error(`[market ${def.id}] nav references unknown module "${id}"`)
    }
  }
  if (!def.modules[def.home]) throw new Error(`[market ${def.id}] home "${def.home}" is not a registered module`)
  return def
}
