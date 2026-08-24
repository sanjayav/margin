// Entitlements decide what a customer is shown, offered and charged for, so the
// rules are worth pinning. The one that matters most is legal rather than
// commercial: a capability a regime does not permit must never be offered.
import { describe, it, expect } from 'vitest'
import { defineMarket } from '../types'
import { moduleAccess, visibleModules, entitlementsFrom, type Entitlements } from '../entitlements'

const Dummy = () => null
const mk = (over: Partial<Parameters<typeof defineMarket>[0]> = {}) => defineMarket({
  id: 'EU', name: 'Test', regulation: 'x', home: 'overview',
  nav: [{ group: 'g', modules: ['overview', 'pooling', 'forecast'] }],
  modules: {
    overview: { id: 'overview', label: 'Overview', icon: 'gauge', purpose: '', component: Dummy },
    pooling: { id: 'pooling', label: 'Pooling', icon: 'handshake', purpose: '', component: Dummy, addon: 'pooling' },
    forecast: { id: 'forecast', label: 'Forecast', icon: 'trending', purpose: '', component: Dummy, addon: 'planning' },
  },
  ...over,
} as any)

const ent = (over: Partial<Entitlements> = {}): Entitlements =>
  ({ markets: ['EU'], platform: [], perMarket: {}, ...over })

describe('entitlements', () => {
  it('base modules are always owned', () => {
    expect(moduleAccess(mk(), mk().modules.overview, ent())).toBe('owned')
  })

  it('an unbought add-on is SELLABLE, not hidden — it has to sell itself', () => {
    expect(moduleAccess(mk(), mk().modules.pooling, ent())).toBe('sellable')
  })

  it('a bought per-market add-on is owned only in the market it was bought for', () => {
    const e = ent({ perMarket: { EU: ['pooling'] } })
    expect(moduleAccess(mk(), mk().modules.pooling, e)).toBe('owned')
    // the same add-on on a different market is a separate purchase
    const au = mk({ id: 'AU' })
    expect(moduleAccess(au, au.modules.pooling, e)).toBe('sellable')
  })

  it('NEVER offers a capability the regime forbids', () => {
    // China has no pooled average in law. Pooling is not locked there — it does
    // not exist, and offering it would be a credibility failure, not an upsell.
    const cn = mk({ id: 'CN', sellableAddons: ['planning'] })
    expect(moduleAccess(cn, cn.modules.pooling, ent({ markets: ['CN'] }))).toBe('unavailable')
    // and it stays unavailable even if the customer somehow holds the add-on
    expect(moduleAccess(cn, cn.modules.pooling, ent({ markets: ['CN'], perMarket: { CN: ['pooling'] } }))).toBe('unavailable')
  })

  it('hides unavailable modules from nav but keeps sellable ones', () => {
    const cn = mk({ id: 'CN', sellableAddons: ['planning'] })
    const ids = visibleModules(cn, ent({ markets: ['CN'] })).map((x) => x.module.id)
    expect(ids).toContain('overview')
    expect(ids).toContain('forecast')   // sellable — sells itself
    expect(ids).not.toContain('pooling') // unavailable in law
  })

  it('platform add-ons apply across every market once bought', () => {
    const withAi = mk({ sellableAddons: ['pooling', 'planning'], modules: {
      ...mk().modules,
      ask: { id: 'ask', label: 'Ask', icon: 'spark', purpose: '', component: Dummy, addon: 'ai' },
    }, nav: [{ group: 'g', modules: ['overview', 'ask'] }] })
    expect(moduleAccess(withAi, withAi.modules.ask, ent())).toBe('sellable')
    expect(moduleAccess(withAi, withAi.modules.ask, ent({ platform: ['ai'] }))).toBe('owned')
  })

  it('maps the legacy store shape without changing who owns what', () => {
    const e = entitlementsFrom(['EU', 'UK'], true, true)
    expect(e.markets).toEqual(['EU', 'UK'])
    expect(e.platform).toContain('ai')
    expect(e.perMarket.EU).toContain('pooling')
    expect(e.perMarket.UK).toContain('pooling')
  })
})
