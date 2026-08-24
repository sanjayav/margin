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

export interface MarketModule {
  id: string
  /** What this market calls it. "Pooling" in the EU, "Credit clearing" in China. */
  label: string
  icon: IconName
  /** One line under the title — what question this module answers, in this regime. */
  purpose: string
  component: ComponentType
  /** Gated behind a paid add-on. */
  addon?: boolean
  /** Hidden from nav but still routable (deep links, AI navigation). */
  hidden?: boolean
}

export interface MarketDefinition {
  id: CountryId
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
