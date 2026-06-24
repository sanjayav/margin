// Country-module catalogue: the marketing/identity metadata + a live one-glance
// summary per module, used by the platform shell (Home / Modules / Subscription).
import type { CountryId } from '../engine/types'
import { getPack } from '../engine/rulepacks'
import { getFleet } from '../data/fleet'
import { buildTree } from '../engine/engine'
import { defaultScenario } from '../state/store'

export interface ModuleMeta {
  id: CountryId
  name: string
  flag: string
  tagline: string
  regulation: string
  accent: string
  priceGBP: number // mock monthly list price until billing lands
}

export const MODULE_META: Record<CountryId, ModuleMeta> = {
  EU: { id: 'EU', name: 'European Union', flag: 'EU', tagline: 'CO₂ fleet-average compliance', regulation: 'Reg (EU) 2019/631 · 2023/851 · 2025/1214', accent: '#3b82f6', priceGBP: 900 },
  IN: { id: 'IN', name: 'India', flag: 'IND', tagline: 'CAFE III fuel-economy norms', regulation: 'BEE Draft CAFE III (FY2027–32)', accent: '#f59e0b', priceGBP: 500 },
  AU: { id: 'AU', name: 'Australia', flag: 'AUS', tagline: 'New Vehicle Efficiency Standard', regulation: 'NVES Act 2024', accent: '#10b981', priceGBP: 500 },
  UK: { id: 'UK', name: 'United Kingdom', flag: 'UK', tagline: 'ZEV mandate (VETS)', regulation: 'DfT VETS Order 2023', accent: '#8b5cf6', priceGBP: 600 },
}

export const AI_PRICE_GBP = 400
export const POOLING_PRICE_GBP = 350
export const ALL_MODULES: CountryId[] = ['EU', 'IN', 'AU', 'UK']

export interface ModuleSummary {
  fleet: number
  limit: number
  fine: number
  currency: string
  metricUnit: string
  makers: number
  units: number
  over: number // makers over the line
}

/** Live one-glance figures for a module at its default scenario. */
export function moduleSummary(c: CountryId): ModuleSummary {
  const pack = getPack(c)
  const t = buildTree(getFleet(c), pack, defaultScenario(c))
  const children = t.children ?? []
  return {
    fleet: t.avgMetric,
    limit: t.limit,
    fine: children.reduce((a, x) => a + x.fine, 0),
    currency: pack.currency,
    metricUnit: pack.metricUnit,
    makers: children.length,
    units: t.rawUnits,
    over: children.filter((x) => x.status === 'fine').length,
  }
}
