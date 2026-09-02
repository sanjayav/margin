/* ───────────────────────────────────────────────────────────────────────────
   The credit desk — parts.
   ---------------------------------------------------------------------------
   Built for the person at an OEM who has to CLEAR a position, not for someone
   browsing a market table. The desk answers, in order:

     1. Where is my book, net of what I have already posted?
     2. What are my ways out, and what does each actually cost?
     3. Who is on the other side, and what are they worth to me?
     4. What have I committed to — and what is still only an intention?

   Everything computed comes from the engine; everything recorded comes from
   the blotter; the desk only ever adds them. See desk.ts for why those two
   are never allowed to blur.
   ─────────────────────────────────────────────────────────────────────────── */
import React, { useMemo, useState } from 'react'
import {
  Badge, Button, Callout, Dialog, EmptyState, Field, Input, Metric, MetricRow,
  Panel, Progress, Segmented, Select, StatusDot, Table, Td, Th, Textarea,
  Tooltip, Tr, cx, fmtGap, relTime, useToast,
} from '../../design/primitives'
import Icon from '../../design/icons'
import { Sparkline } from '../../design/charts'
import { useApp, useRole, baseScenario, type CreditTicket } from '../../state/appStore'
import { usePosition, settledThrough } from '../../state/usePosition'
import { can } from '../../auth/rbac'
import { bestForMaker, standings, type Standing } from '../../../engine/pooling'
import { blockOf, blockPosition, creditPriceFor, lapseWarning } from '../../../engine/blocks'
import { fmtInt, fmtMoney, fmtNum } from '../../../engine/engine'
import { BANKING, netPosition, newTicketId, priceCeiling, summariseBlotter } from './desk'
import type { Scenario } from '../../../engine/types'

/* ── shared desk context ──────────────────────────────────────────────────── */

export function useDesk() {
  const { pack, raw, scenario, country } = usePosition('actuals')
  const deskPrice = useApp((s) => s.deskPrice[country])
  const tickets = useApp((s) => s.tickets)

  // The book is a record, so it reads settled years only — a credit computed
  // from a forward plan row is not a credit anyone holds.
  const settled = settledThrough(country)
  const year = Math.min(scenario.year, settled)
  const clamped = scenario.year > settled

  // The published price for THIS year, not one flat number. India's buyout
  // ramps ₹2,500/g → ₹4,500/g across the drafted schedule, so a book valued at
  // the front price understates its back end by nearly half.
  const scheduled = creditPriceFor(pack, year)
  const price = deskPrice ?? scheduled
  const scen = useMemo<Scenario>(
    () => ({ ...baseScenario(country), year, creditPrice: price }),
    [country, year, price],
  )
  const book = useMemo(() => standings(raw, pack, scen).filter((s) => s.units > 0), [raw, pack, scen])
  return { pack, raw, country, year, clamped, price, scheduled, scen, book, tickets }
}

const short2 = (name: string) => {
  const words = name.split(/\s+/)
  const drop = /^(India|Limited|Ltd|Pvt|Private|Motors?|Motor|Company|Co|Inc|Corp|Group|Automobiles?|Cars?|Vehicles?)$/i
  const kept = (words.filter((w) => !drop.test(w.replace(/[.,]/g, ''))) || words)
  const out = (kept.length ? kept : words).join(' ')
  return out.length > 18 ? `${out.slice(0, 17)}…` : out
}

/* ═══════════════════════════════════════════════════════════════════════════
   Price assumption — the number the whole book is valued at
   ═══════════════════════════════════════════════════════════════════════════ */

export function PriceAssumption() {
  const { pack, country, price, scheduled, year } = useDesk()
  const setPrice = useApp((s) => s.setDeskPrice)
  const [draft, setDraft] = useState<string | null>(null)
  const ceiling = priceCeiling(pack.fineRate, country === 'IN')

  const commit = () => {
    if (draft == null) return
    const v = Number(draft)
    setPrice(country, isFinite(v) && v > 0 ? v : null)
    setDraft(null)
  }

  return (
    <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2">
      <span className="t-label !mb-0">Price assumption</span>
      <span className="flex items-center gap-1">
        <span className="text-[12px] text-[var(--ink-4)]">{pack.currency}</span>
        <Input className="!h-[26px] !w-[96px] !px-1.5 !text-[12px] t-num" type="number" min={0}
          value={draft ?? (price != null ? String(price) : '')}
          placeholder="none"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') commit() }} />
        <span className="text-[11px] text-[var(--ink-4)]">per {pack.transfer.unit}</span>
      </span>
      {ceiling != null && (
        <Tooltip content={`Nobody rationally pays more per unit than the charge it avoids. ${pack.fineRateLabel}.`}>
          <span className="text-[11px] tabular-nums text-[var(--ink-4)]">
            ceiling ≈ <b className="text-[var(--ink-2)]">{fmtMoney(ceiling, pack.currency)}</b>
            {price != null && price > ceiling && <Badge tone="neg" className="ml-1.5">above the charge</Badge>}
          </span>
        </Tooltip>
      )}
      {ceiling == null && (
        <Tooltip content="This regime's charge is a stepped per-vehicle penalty, so there is no single per-unit equivalent to anchor a ceiling on.">
          <span className="text-[11px] text-[var(--ink-4)]">stepped charge — no single ceiling</span>
        </Tooltip>
      )}
      {pack.creditPriceByYear && scheduled != null && (
        <Tooltip content={`The pack publishes a price per compliance year. ${year} is ${fmtMoney(scheduled, pack.currency)}.`}>
          <span className="inline-flex items-center gap-1 text-[11px] text-[var(--ink-4)]">
            <Icon name="history" size={11} />
            {year} schedule <b className="text-[var(--ink-2)]">{fmtMoney(scheduled, pack.currency)}</b>
            {price != null && Math.abs(price - scheduled) > 0.5 && (
              <Button size="xs" variant="ghost" onClick={() => setPrice(country, null)}>use it</Button>
            )}
          </span>
        </Tooltip>
      )}
      {pack.illustrativeRates && <Badge tone="warn">illustrative</Badge>}
      {pack.creditPriceLabel && <span className="ml-auto hidden text-[10.5px] text-[var(--ink-5)] lg:inline">{pack.creditPriceLabel}</span>}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Entity picker
   ═══════════════════════════════════════════════════════════════════════════ */

export function EntityPicker() {
  const { pack, country, book } = useDesk()
  const entity = useApp((s) => s.deskEntity[country]) ?? null
  const setEntity = useApp((s) => s.setDeskEntity)
  const ranked = useMemo(() => [...book].sort((a, b) => Math.abs(b.creditBalance) - Math.abs(a.creditBalance)), [book])
  return (
    <Select className="!h-[32px] !w-[268px] !text-[12.5px]" value={entity ?? ''}
      onChange={(e) => setEntity(country, e.target.value || null)}>
      <option value="">Choose your entity…</option>
      {ranked.map((s) => (
        <option key={s.parent} value={s.parent}>
          {s.parent} · {s.creditBalance >= 0 ? 'long' : 'short'} {fmtInt(Math.abs(s.creditBalance))}
        </option>
      ))}
    </Select>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   The desk
   ═══════════════════════════════════════════════════════════════════════════ */

export function Desk({ onDraftTicket }: { onDraftTicket: (prefill: Partial<CreditTicket>) => void }) {
  const { pack, raw, country, year, price, scen, book, tickets } = useDesk()
  const entity = useApp((s) => s.deskEntity[country]) ?? null
  const setEntity = useApp((s) => s.setDeskEntity)
  const me = book.find((s) => s.parent === entity) ?? null

  const blotter = useMemo(
    () => (entity ? summariseBlotter(tickets, country, entity, year) : null),
    [tickets, country, entity, year],
  )
  const net = useMemo(() => (me && blotter ? netPosition(me.creditBalance, blotter) : null), [me, blotter])

  const routes = useMemo(
    () => (entity && me && me.fine > 0 ? bestForMaker(raw, pack, scen, entity) : []),
    [raw, pack, scen, entity, me],
  )

  const counterparties = useMemo(() => {
    if (!me) return []
    const opposite = me.creditBalance < 0
      ? book.filter((s) => s.creditBalance > 0)
      : book.filter((s) => s.creditBalance < 0)
    return [...opposite].sort((a, b) => Math.abs(b.creditBalance) - Math.abs(a.creditBalance)).slice(0, 8)
  }, [book, me])

  /* Balance by settled year — the vintage view, computed per year from the
     same engine, never carried in state. */
  const settledYears = useMemo(
    () => pack.years.filter((y) => y <= settledThrough(country)).slice(-3),
    [pack.years, country],
  )
  const vintages = useMemo(() => {
    if (!entity) return []
    return settledYears.map((y) => {
      const st = standings(raw, pack, { ...baseScenario(country), year: y, creditPrice: price })
      const row = st.find((s) => s.parent === entity)
      return { year: y, balance: row?.creditBalance ?? 0, gap: row?.gap ?? 0, units: row?.units ?? 0 }
    })
  }, [entity, settledYears, raw, pack, country, price])

  const banking = BANKING[country]
  const money = (v: number) => fmtMoney(v, pack.currency)

  if (!entity || !me) {
    return (
      <Panel title="Whose book is this?" icon={<Icon name="user" size={14} />}
        sub="The desk works one compliance entity. Pick yours — everything below becomes its balance, its routes and its blotter.">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {[...book].sort((a, b) => Math.abs(b.creditBalance) - Math.abs(a.creditBalance)).slice(0, 9).map((s) => (
            <button key={s.parent} onClick={() => setEntity(country, s.parent)}
              className="lift flex items-center gap-2.5 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-1)] px-3 py-2.5 text-left hover:border-[var(--line-strong)]">
              <StatusDot size={7} tone={s.creditBalance > 0 ? 'pos' : s.creditBalance < 0 ? 'neg' : 'neutral'} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-medium text-[var(--ink-1)]">{s.parent}</span>
                <span className="block text-[11px] tabular-nums text-[var(--ink-4)]">
                  {s.creditBalance === 0 ? 'square' : `${s.creditBalance > 0 ? 'long' : 'short'} ${fmtInt(Math.abs(s.creditBalance))} units`}
                </span>
              </span>
              <Icon name="arrowRight" size={12} className="shrink-0 text-[var(--ink-5)]" />
            </button>
          ))}
        </div>
      </Panel>
    )
  }

  const long = net!.net > 0
  const square = net!.net === 0

  return (
    <div className="space-y-4">
      {/* ── the book, net ── */}
      <MetricRow>
        <Metric label="Computed position"
          value={`${me.creditBalance >= 0 ? '+' : '−'}${fmtInt(Math.abs(me.creditBalance))}`}
          unit="units" tone={me.creditBalance >= 0 ? 'pos' : 'neg'}
          sub={`engine-derived · ${fmtNum(me.avgMetric, 1)} vs limit ${fmtNum(me.limit, 1)} ${pack.metricUnit}`}
          hint="Gap × registrations, straight from the engine. Nothing recorded can change this line — only the fleet can." />
        <Metric label="Recorded (posted)"
          value={`${blotter!.postedUnits >= 0 ? '+' : '−'}${fmtInt(Math.abs(blotter!.postedUnits))}`}
          unit="units"
          sub={blotter!.posted.length ? `${blotter!.posted.length} posted ticket${blotter!.posted.length === 1 ? '' : 's'} · cash ${money(blotter!.postedCash)}` : 'nothing posted'} />
        <Metric label="Net book"
          value={`${net!.net >= 0 ? '+' : '−'}${fmtInt(Math.abs(net!.net))}`}
          unit="units" tone={long ? 'pos' : square ? undefined : 'neg'}
          sub={square ? 'square' : long ? 'long — cover to sell' : `short — ${fmtInt(net!.shortfall)} units still to cover`}
          hint="Computed + recorded. The one honest equation a credit book has." />
        <Metric label={long ? 'Book value at assumption' : 'Cost to cover at assumption'}
          value={price != null ? money(Math.abs(net!.net) * price) : '—'}
          tone={long ? 'pos' : 'neg'}
          sub={price != null ? `${fmtInt(Math.abs(net!.net))} units × ${money(price)}` : 'set a price assumption above'} />
        <Metric label="Exposure if nothing moves" value={me.fine > 0 ? money(me.fine) : '—'}
          tone={me.fine > 0 ? 'neg' : 'pos'}
          sub={me.fine > 0 ? pack.fineRateLabel : 'no charge at this position'} />
      </MetricRow>

      {blotter!.drafts.length > 0 && (
        <Callout tone="info" icon={<Icon name="edit" size={14} />}
          title={`${blotter!.drafts.length} draft ticket${blotter!.drafts.length === 1 ? '' : 's'} — if executed, the book goes ${net!.ifExecuted >= 0 ? 'long' : 'short'} ${fmtInt(Math.abs(net!.ifExecuted))}`}>
          Drafts never touch the net line. They live on the blotter until someone with posting rights executes them.
        </Callout>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {/* ── ways out / monetisation ── */}
        <Panel
          title={long ? 'Monetising the surplus' : square ? 'Nothing to clear' : 'Ways to clear it'}
          sub={long
            ? 'Who is short, and what your cover is worth to each at the price assumption.'
            : blotter!.postedUnits !== 0
              ? 'Every legal route, priced by the engine against the COMPUTED position — your posted cover then reduces what is left, and the net line above is the authority. Drafts prefill the net shortfall.'
              : 'Every legal route, priced by the engine — including doing nothing. The cheapest is flagged, not chosen: choosing is your job.'}
          icon={<Icon name={long ? 'scale' : 'target'} size={14} />}>
          {!long && !square && (routes.length ? (
            <div className="space-y-2">
              {routes.map((o) => (
                <div key={o.type}
                  className={cx('rounded-[var(--r-md)] border p-3 transition-colors',
                    o.best ? 'border-[var(--pos-line)] bg-[var(--pos-tint)]' : 'border-[var(--line)] bg-[var(--surface-1)]')}>
                  <div className="flex items-start gap-2.5">
                    <Icon name={o.type === 'pool' ? 'pooling' : o.type === 'credits' ? 'creditbook' : 'alert'} size={14}
                      className={cx('mt-0.5 shrink-0', o.best ? 'text-[var(--pos)]' : 'text-[var(--ink-4)]')} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[12.5px] font-semibold text-[var(--ink-1)]">{o.label}</span>
                        {o.best && <Badge tone="pos">cheapest</Badge>}
                        {o.type === 'fine' && <Badge tone="neutral">do nothing</Badge>}
                      </div>
                      <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--ink-3)]">{o.detail}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="t-num text-[14px] font-semibold text-[var(--ink-1)]">{money(o.cost)}</div>
                      {routes[routes.length - 1].cost > 0 && o.cost < routes[routes.length - 1].cost && (
                        <div className="text-[10.5px] tabular-nums text-[var(--pos-ink)]">
                          saves {money(routes[routes.length - 1].cost - o.cost)}
                        </div>
                      )}
                    </div>
                  </div>
                  {o.type === 'credits' && (
                    <div className="mt-2 flex justify-end">
                      <Button size="xs" variant="secondary" icon={<Icon name="plus" size={11} />}
                        onClick={() => onDraftTicket({ side: 'buy', qty: Math.round(net!.shortfall) })}>
                        Draft the buy
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState compact art="clean" title="No routes to price"
              body="The engine found no fine to clear at this position, or no market to clear it in." />
          ))}

          {long && (
            <div className="space-y-2">
              {counterparties.length ? counterparties.map((c) => {
                const need = Math.abs(c.creditBalance)
                const canSell = Math.min(need, net!.net)
                return (
                  <div key={c.parent} className="flex items-center gap-3 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-1)] px-3 py-2.5">
                    <StatusDot size={7} tone="neg" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12.5px] font-medium text-[var(--ink-1)]">{c.parent}</div>
                      <div className="text-[11px] tabular-nums text-[var(--ink-4)]">
                        short {fmtInt(need)} units · you can cover {fmtInt(canSell)}
                      </div>
                    </div>
                    {price != null && (
                      <div className="shrink-0 text-right">
                        <div className="t-num text-[13px] font-semibold text-[var(--pos-ink)]">{money(canSell * price)}</div>
                        <div className="text-[10px] text-[var(--ink-5)]">at assumption</div>
                      </div>
                    )}
                    <Button size="xs" variant="secondary"
                      onClick={() => onDraftTicket({ side: 'sell', qty: Math.round(canSell), counterparty: c.parent })}>
                      Draft sell
                    </Button>
                  </div>
                )
              }) : (
                <EmptyState compact art="clean" title="Nobody is short"
                  body="Every entity in this market is inside its line — a surplus has no buyer today." />
              )}
            </div>
          )}

          {square && <EmptyState compact art="clean" title="The book is square"
            body="Computed and recorded net to zero. A quiet book is the goal, not a gap in the product." />}
        </Panel>

        {/* ── the right rail: counterparties (short book) + vintages + rules ── */}
        <div className="space-y-4">
          {!long && !square && (
            <Panel title="Who has the cover" icon={<Icon name="users" size={14} />}
              sub={`${pack.transfer.supplier[0].toUpperCase()}${pack.transfer.supplier.slice(1)}s ranked by available balance.`}>
              {counterparties.length ? (
                <div className="space-y-1.5">
                  {counterparties.map((c) => {
                    const avail = Math.abs(c.creditBalance)
                    const covers = Math.min(100, (avail / Math.max(net!.shortfall, 1)) * 100)
                    return (
                      <div key={c.parent} className="flex items-center gap-2.5 rounded-[var(--r-sm)] px-1.5 py-1.5 hover:bg-[var(--surface-2)]">
                        <span className="w-[118px] shrink-0 truncate text-[12px] text-[var(--ink-2)]" title={c.parent}>{short2(c.parent)}</span>
                        <span className="min-w-0 flex-1"><Progress value={covers} height={5} tone={covers >= 100 ? 'pos' : 'neutral'} /></span>
                        <span className="w-[76px] shrink-0 text-right text-[11.5px] tabular-nums text-[var(--ink-2)]">{fmtInt(avail)}</span>
                        <Button size="xs" variant="ghost"
                          onClick={() => onDraftTicket({ side: 'buy', qty: Math.round(Math.min(avail, net!.shortfall)), counterparty: c.parent })}>
                          Draft
                        </Button>
                      </div>
                    )
                  })}
                  <p className="pt-1 text-[10.5px] text-[var(--ink-4)]">
                    The bar is how much of your {fmtInt(net!.shortfall)}-unit shortfall each could cover alone.
                  </p>
                </div>
              ) : (
                <EmptyState compact art="search" title="No supply in this market"
                  body="Nobody holds a surplus. The routes on the left are what remains." />
              )}
            </Panel>
          )}

          <Panel title="Balance by year" icon={<Icon name="history" size={14} />}
            sub="Settled years only, each re-derived by the engine.">
            {vintages.length ? (
              <Table>
                <thead>
                  <tr><Th>Year</Th><Th align="right">Gap</Th><Th align="right">Balance</Th>{vintages.length > 2 && <Th align="center">Shape</Th>}</tr>
                </thead>
                <tbody>
                  {vintages.map((v) => (
                    <Tr key={v.year} selected={v.year === year}>
                      <Td strong>{v.year}</Td>
                      <Td align="right">
                        <span className={v.gap > 0 ? 'text-[var(--neg-ink)]' : 'text-[var(--pos-ink)]'}>{fmtGap(v.gap)}</span>
                      </Td>
                      <Td align="right">
                        <span className={cx('font-semibold', v.balance >= 0 ? 'text-[var(--pos-ink)]' : 'text-[var(--neg-ink)]')}>
                          {v.balance >= 0 ? '+' : '−'}{fmtInt(Math.abs(v.balance))}
                        </span>
                      </Td>
                      {vintages.length > 2 && (
                        <Td align="center">
                          <Sparkline points={vintages.map((x) => x.balance)} w={52} refLevel={0}
                            tone={v.balance >= 0 ? 'var(--pos)' : 'var(--neg)'} />
                        </Td>
                      )}
                    </Tr>
                  ))}
                </tbody>
              </Table>
            ) : <EmptyState compact art="data" title="No settled years for this entity" />}
          </Panel>

          <Callout tone={banking.draft ? 'warn' : 'info'} icon={<Icon name="book" size={14} />}
            title={banking.headline}>
            {banking.detail}
            <span className="mt-1.5 block text-[10.5px] text-[var(--ink-4)]">{banking.source}</span>
          </Callout>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   The blotter
   ═══════════════════════════════════════════════════════════════════════════ */

export function Blotter({ onDraftTicket }: { onDraftTicket: (prefill: Partial<CreditTicket>) => void }) {
  const { pack, country, year, tickets } = useDesk()
  const entity = useApp((s) => s.deskEntity[country]) ?? null
  const setStatus = useApp((s) => s.setTicketStatus)
  const remove = useApp((s) => s.removeTicket)
  const session = useApp((s) => s.session)
  const role = useRole()
  const toast = useToast()
  const mayPost = can(role, 'creditbook.post')

  const rows = useMemo(
    () => tickets.filter((t) => t.country === country && (!entity || t.entity === entity)),
    [tickets, country, entity],
  )
  const money = (v: number) => fmtMoney(v, pack.currency)

  return (
    <Panel flush title="Blotter"
      sub={`${entity ? `${entity} · ` : 'All entities · '}drafts are intentions, posted tickets are the record. Posting needs the creditbook.post permission — an intention becoming a fact is exactly the moment this product gates.`}
      icon={<Icon name="list" size={14} />}
      actions={<Button size="xs" variant="secondary" icon={<Icon name="plus" size={12} />} onClick={() => onDraftTicket({})}>New ticket</Button>}>
      {rows.length ? (
        <Table>
          <thead>
            <tr>
              <Th>Ticket</Th><Th>Side</Th><Th align="right">Units</Th><Th align="right">Price</Th>
              <Th align="right">Cash</Th><Th>Counterparty</Th><Th align="center">Status</Th><Th align="right" />
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const cash = (t.side === 'buy' ? -1 : 1) * t.qty * t.price
              return (
                <Tr key={t.id} className={t.status === 'cancelled' ? 'opacity-50' : undefined}>
                  <Td>
                    <span className="block truncate font-medium text-[var(--ink-1)]">{t.entity}</span>
                    <span className="block text-[10.5px] text-[var(--ink-4)]">{t.year} · {t.createdBy} · {relTime(t.createdAt)}</span>
                  </Td>
                  <Td><Badge tone={t.side === 'buy' ? 'info' : 'pos'}>{t.side}</Badge></Td>
                  <Td align="right" strong>{fmtInt(t.qty)}</Td>
                  <Td align="right">{pack.currency}{t.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</Td>
                  <Td align="right">
                    <span className={cash < 0 ? 'text-[var(--neg-ink)]' : 'text-[var(--pos-ink)]'}>
                      {cash < 0 ? '−' : '+'}{money(Math.abs(cash))}
                    </span>
                  </Td>
                  <Td className="!text-[var(--ink-3)]">{t.counterparty ?? '—'}</Td>
                  <Td align="center">
                    <Badge dot tone={t.status === 'posted' ? 'pos' : t.status === 'draft' ? 'warn' : 'neutral'}>
                      {t.status}
                    </Badge>
                  </Td>
                  <Td align="right">
                    {t.status === 'draft' && (
                      <span className="inline-flex items-center gap-1">
                        {mayPost ? (
                          <Button size="xs" variant="secondary"
                            onClick={() => { setStatus(t.id, 'posted', session?.name); toast({ tone: 'pos', title: 'Ticket posted', body: 'It is now part of the recorded book and counts toward the net position.' }) }}>
                            Post
                          </Button>
                        ) : (
                          <Tooltip content="Posting needs the creditbook.post permission — a trader or compliance lead.">
                            <span className="inline-flex items-center gap-1 text-[10.5px] text-[var(--ink-4)]"><Icon name="lock" size={11} /> post</span>
                          </Tooltip>
                        )}
                        <Button size="xs" variant="ghost" onClick={() => remove(t.id)}>Discard</Button>
                      </span>
                    )}
                    {t.status === 'posted' && mayPost && (
                      <Button size="xs" variant="ghost" onClick={() => setStatus(t.id, 'cancelled', session?.name)}>Cancel</Button>
                    )}
                    {t.status === 'posted' && t.postedBy && !mayPost && (
                      <span className="text-[10.5px] text-[var(--ink-4)]">by {t.postedBy}</span>
                    )}
                  </Td>
                </Tr>
              )
            })}
          </tbody>
        </Table>
      ) : (
        <div className="p-4">
          <EmptyState compact art="data" title="Nothing on the blotter"
            body="Draft a ticket from the cover plan, from a counterparty row, or here. It stays an intention until someone with posting rights executes it."
            action={<Button size="sm" variant="secondary" icon={<Icon name="plus" size={12} />} onClick={() => onDraftTicket({})}>New ticket</Button>} />
        </div>
      )}
    </Panel>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Ticket dialog — the arithmetic is shown, never typed
   ═══════════════════════════════════════════════════════════════════════════ */

export function TicketDialog({ open, prefill, onClose }: {
  open: boolean; prefill: Partial<CreditTicket>; onClose: () => void
}) {
  const { pack, country, year, price, book, tickets } = useDesk()
  const entity = useApp((s) => s.deskEntity[country]) ?? null
  const addTicket = useApp((s) => s.addTicket)
  const session = useApp((s) => s.session)
  const toast = useToast()

  const [side, setSide] = useState<'buy' | 'sell'>(prefill.side ?? 'buy')
  const [qty, setQty] = useState(String(prefill.qty ?? ''))
  const [px, setPx] = useState(String(prefill.price ?? price ?? ''))
  const [cpty, setCpty] = useState(prefill.counterparty ?? '')
  const [note, setNote] = useState('')
  const [seen, setSeen] = useState(prefill)
  if (open && seen !== prefill) {
    setSeen(prefill)
    setSide(prefill.side ?? 'buy'); setQty(String(prefill.qty ?? ''))
    setPx(String(prefill.price ?? price ?? '')); setCpty(prefill.counterparty ?? ''); setNote('')
  }

  const me = book.find((s) => s.parent === entity) ?? null
  const blotter = entity ? summariseBlotter(tickets, country, entity, year) : null
  const net = me && blotter ? netPosition(me.creditBalance, blotter) : null

  const q = Number(qty), p = Number(px)
  const valid = !!entity && isFinite(q) && q > 0 && isFinite(p) && p >= 0
  const after = net && valid ? net.net + (side === 'buy' ? q : -q) : null
  const overSell = net != null && side === 'sell' && valid && q > Math.max(0, net.net)
  const money = (v: number) => fmtMoney(v, pack.currency)

  const save = () => {
    if (!valid || !entity) return
    addTicket({
      id: newTicketId(), country, year, entity, side, qty: Math.round(q), price: p,
      counterparty: cpty || undefined, note: note || undefined,
      status: 'draft', createdAt: new Date().toISOString(), createdBy: session?.name ?? 'you',
    })
    toast({ tone: 'info', title: 'Draft on the blotter', body: 'It changes nothing until someone with posting rights executes it.' })
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} width={540}
      title="Draft a ticket"
      sub={entity ? `${entity} · ${pack.name} · ${year}` : 'Pick an entity on the Desk first.'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!valid} onClick={save}>Save as draft</Button>
        </>
      }>
      <div className="space-y-3.5">
        <Segmented block value={side} onChange={setSide}
          options={[
            { id: 'buy', label: `Buy ${pack.transfer.unit}s` },
            { id: 'sell', label: `Sell ${pack.transfer.unit}s` },
          ]} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Units" required hint={net ? (side === 'buy' ? `shortfall is ${fmtInt(net.shortfall)}` : `you are long ${fmtInt(Math.max(0, net.net))}`) : undefined}>
            <Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />
          </Field>
          <Field label={`Price per unit (${pack.currency})`} required
            hint={price != null ? `desk assumption ${money(price)}` : 'no assumption set'}>
            <Input type="number" min={0} step="0.5" value={px} onChange={(e) => setPx(e.target.value)} />
          </Field>
        </div>
        <Field label="Counterparty" hint="Optional — who the other side is.">
          <Select value={cpty} onChange={(e) => setCpty(e.target.value)}>
            <option value="">Not named</option>
            {book.filter((s) => s.parent !== entity && (side === 'buy' ? s.creditBalance > 0 : s.creditBalance < 0))
              .map((s) => <option key={s.parent} value={s.parent}>{s.parent}</option>)}
          </Select>
        </Field>
        <Field label="Note">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why this ticket exists — the future reader is you, in March." />
        </Field>

        {/* the arithmetic — derived, never typed */}
        {net && valid && (
          <div className="rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] p-3 text-[12px]">
            <div className="t-label mb-1.5">What this does to the book</div>
            <div className="flex items-center gap-2 tabular-nums">
              <span className="text-[var(--ink-3)]">net {net.net >= 0 ? '+' : '−'}{fmtInt(Math.abs(net.net))}</span>
              <Icon name="arrowRight" size={11} className="text-[var(--ink-5)]" />
              <span className={cx('font-semibold', (after ?? 0) >= 0 ? 'text-[var(--pos-ink)]' : 'text-[var(--neg-ink)]')}>
                {(after ?? 0) >= 0 ? '+' : '−'}{fmtInt(Math.abs(after ?? 0))} units
              </span>
              <span className="ml-auto text-[var(--ink-3)]">cash {side === 'buy' ? '−' : '+'}{money(q * p)}</span>
            </div>
            {overSell && (
              <p className="mt-1.5 text-[11px] text-[var(--warn-ink)]">
                This sells more than the book is long — it would leave you short. Saved as a draft it is only a plan, but say so in the note.
              </p>
            )}
          </div>
        )}
      </div>
    </Dialog>
  )
}
