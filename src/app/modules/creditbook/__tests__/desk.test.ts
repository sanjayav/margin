// The desk's one honest equation: computed + recorded = net — and the rule that
// a draft is an intention, never a fact on the same line.
import { describe, it, expect } from 'vitest'
import { netPosition, summariseBlotter, ticketEffect } from '../desk'
import type { CreditTicket } from '../../../state/appStore'

const tkt = (over: Partial<CreditTicket>): CreditTicket => ({
  id: 'x', country: 'IN', year: 2026, entity: 'Tata', side: 'buy', qty: 100, price: 5,
  status: 'draft', createdAt: '2026-09-02', createdBy: 'test', ...over,
})

describe('the blotter', () => {
  it('a buy raises the balance, a sell lowers it, a cancelled ticket is inert', () => {
    expect(ticketEffect(tkt({ side: 'buy', qty: 50 }))).toBe(50)
    expect(ticketEffect(tkt({ side: 'sell', qty: 50 }))).toBe(-50)
    expect(ticketEffect(tkt({ status: 'cancelled', qty: 50 }))).toBe(0)
  })

  it('keeps posted and draft strictly apart — an intention never lands on the fact line', () => {
    const b = summariseBlotter([
      tkt({ id: 'a', status: 'posted', side: 'buy', qty: 200, price: 4 }),
      tkt({ id: 'b', status: 'draft', side: 'buy', qty: 300, price: 4 }),
      tkt({ id: 'c', status: 'posted', side: 'sell', qty: 50, price: 6 }),
    ], 'IN', 'Tata', 2026)
    expect(b.postedUnits).toBe(150)
    expect(b.draftUnits).toBe(300)
    expect(b.postedCash).toBe(-200 * 4 + 50 * 6)
    expect(b.draftCash).toBe(-300 * 4)
  })

  it('scopes to the entity, market and year it was asked about', () => {
    const b = summariseBlotter([
      tkt({ id: 'a', status: 'posted', entity: 'Tata' }),
      tkt({ id: 'b', status: 'posted', entity: 'Hyundai' }),
      tkt({ id: 'c', status: 'posted', country: 'AU' }),
      tkt({ id: 'd', status: 'posted', year: 2025 }),
    ], 'IN', 'Tata', 2026)
    expect(b.posted).toHaveLength(1)
  })

  it('computed + recorded = net, and the shortfall never goes negative', () => {
    const b = summariseBlotter([tkt({ id: 'a', status: 'posted', side: 'buy', qty: 400 })], 'IN', 'Tata', 2026)
    const n = netPosition(-1000, b)
    expect(n.net).toBe(-600)
    expect(n.shortfall).toBe(600)
    const long = netPosition(500, summariseBlotter([], 'IN', 'Tata', 2026))
    expect(long.shortfall).toBe(0)
  })

  it('"if executed" includes drafts without ever changing the net', () => {
    const b = summariseBlotter([
      tkt({ id: 'a', status: 'posted', side: 'buy', qty: 400 }),
      tkt({ id: 'b', status: 'draft', side: 'buy', qty: 700 }),
    ], 'IN', 'Tata', 2026)
    const n = netPosition(-1000, b)
    expect(n.net).toBe(-600)
    expect(n.ifExecuted).toBe(100)
    expect(n.shortfallIfExecuted).toBe(0)
  })
})
