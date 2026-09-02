/* ───────────────────────────────────────────────────────────────────────────
   CREDIT BOOK — an OEM's desk, not a market summary.
   ---------------------------------------------------------------------------
   The old screen ranked the whole market and stopped. Useful for a browser;
   useless for the person at a manufacturer who has to CLEAR a position by
   year end. This one works one entity's book:

     DESK    — computed + recorded = net, the priced ways out (including doing
               nothing), who holds the cover, balance by settled year, and the
               regime's actual banking rules with the instrument named.
     MARKET  — everyone's position, because a desk still needs the room it
               trades in: supply, demand, who is long, who is desperate.
     BLOTTER — drafts and posted tickets. A draft is an intention; posting is
               the moment an intention becomes a fact, and it is permission-
               gated for exactly that reason.

   In a regime with no instrument (the EU) there is no desk to run and this
   module says so instead of pretending — headroom there moves by pooling,
   and the Pooling module is where that work lives.
   ─────────────────────────────────────────────────────────────────────────── */
import React, { useMemo, useState } from 'react'
import {
  Badge, Button, Callout, EmptyState, Metric, MetricRow, Panel, Segmented,
  StatusDot, Table, Td, Th, Tooltip, Tr, cx, fmtGap,
} from '../../design/primitives'
import Icon from '../../design/icons'
import { ShareBar } from '../../design/charts'
import { ModulePage } from '../../shell/AppShell'
import { AgentLauncher } from '../../agents/ui/AgentConsole'
import { FindingCard } from '../../agents/ui/RunTrace'
import { useApp, type CreditTicket } from '../../state/appStore'
import { usePosition } from '../../state/usePosition'
import { fmtInt, fmtMoney, fmtNum } from '../../../engine/engine'
import { Blotter, Desk, EntityPicker, PriceAssumption, TicketDialog, useDesk } from './parts'
import { BANKING } from './desk'

type Tab = 'desk' | 'market' | 'blotter'

export default function CreditBookModule() {
  const { pack, country } = usePosition('actuals')
  const storedTab = useApp((s) => s.moduleTab.creditbook)
  const setStoredTab = useApp((s) => s.setModuleTab)
  const tab = (storedTab as Tab) ?? 'desk'
  const setTab = (t: Tab) => setStoredTab('creditbook', t)

  const [ticketOpen, setTicketOpen] = useState(false)
  const [prefill, setPrefill] = useState<Partial<CreditTicket>>({})
  const draftTicket = (p: Partial<CreditTicket>) => { setPrefill({ ...p, _t: Date.now() } as never); setTicketOpen(true) }

  const trades = pack.transfer.kind === 'trade'

  if (!trades) {
    return (
      <ModulePage wide title="Position book"
        sub={`Who holds headroom and who is short in ${pack.name}. There is no transferable instrument here — headroom moves by pooling, and only by pooling.`}
        actions={<AgentLauncher moduleId="creditbook" hint="Reconcile every position against the computed book" />}>
        <Callout className="mb-4" tone="warn" icon={<Icon name="pooling" size={14} />}
          title={BANKING[country].headline}>
          {BANKING[country].detail}
          <span className="mt-1.5 block text-[10.5px] text-[var(--ink-4)]">{BANKING[country].source}</span>
          <Button className="mt-2" size="xs" variant="secondary"
            onClick={() => useApp.getState().setModule('pooling')}>Work it in Pooling</Button>
        </Callout>
        <ClampNote />
        <MarketBook />
      </ModulePage>
    )
  }

  return (
    <ModulePage wide
      title="Credit book"
      sub={`One ${pack.transfer.unit} ${pack.transfer.verb}s between compliance entities in ${pack.name}. Computed positions from the engine, recorded tickets from the blotter — the book is the sum, and it always shows the working.`}
      actions={
        <>
          <EntityPicker />
          <AgentLauncher moduleId="creditbook" hint="Reconcile every entry against the computed position" />
        </>
      }
      toolbar={<PriceAssumption />}>

      <ClampNote />

      <Segmented className="mb-4" value={tab} onChange={setTab}
        options={[
          { id: 'desk', label: 'Desk', icon: <Icon name="creditbook" size={13} />, hint: 'Your book: net position, routes, counterparties' },
          { id: 'market', label: 'Market', icon: <Icon name="globe" size={13} />, hint: 'Everyone’s position — the room you trade in' },
          { id: 'blotter', label: 'Blotter', icon: <Icon name="list" size={13} />, hint: 'Drafts and posted tickets' },
        ]} />

      <div key={tab} className="anim-in">
        {tab === 'desk' && <Desk onDraftTicket={draftTicket} />}
        {tab === 'market' && <MarketBook onDraftTicket={draftTicket} />}
        {tab === 'blotter' && <Blotter onDraftTicket={draftTicket} />}
      </div>

      <TicketDialog open={ticketOpen} prefill={prefill} onClose={() => setTicketOpen(false)} />
    </ModulePage>
  )
}

/** The book reads settled years only; say so when the header year is beyond. */
function ClampNote() {
  const { clamped, year } = useDesk()
  if (!clamped) return null
  return (
    <Callout className="mb-4" tone="warn" icon={<Icon name="alert" size={14} />}
      title={`Reading ${year} — the latest settled year`}>
      A credit computed from a forward plan row is not a credit anyone holds. Forward years are modelled in Forecast.
    </Callout>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   The market — the room the desk trades in
   ═══════════════════════════════════════════════════════════════════════════ */

function MarketBook({ onDraftTicket }: { onDraftTicket?: (p: Partial<CreditTicket>) => void }) {
  const { pack, country, book, price } = useDesk()
  const entity = useApp((s) => s.deskEntity[country]) ?? null
  const setEntity = useApp((s) => s.setDeskEntity)
  const runs = useApp((s) => s.runs)
  const setConsole = useApp((s) => s.setConsole)
  const [sort, setSort] = useState<'balance' | 'units'>('balance')

  const longs = book.filter((s) => s.creditBalance > 0)
  const shorts = book.filter((s) => s.creditBalance < 0)
  const supply = longs.reduce((a, s) => a + s.creditBalance, 0)
  const demand = shorts.reduce((a, s) => a - s.creditBalance, 0)
  const coverage = demand > 0 ? Math.min(100, (supply / demand) * 100) : 100
  const exposure = book.reduce((a, s) => a + s.fine, 0)
  const trades = pack.transfer.kind === 'trade'
  const money = (v: number) => fmtMoney(v, pack.currency)

  const sorted = useMemo(() => [...book].sort((a, b) =>
    sort === 'units' ? b.units - a.units : b.creditBalance - a.creditBalance), [book, sort])

  const keeper = runs.find((r) => r.agentId === 'book.keeper' && r.findings.length > 0)

  if (!book.length) {
    return <EmptyState art="data" title="No positions in this year"
      body={`The loaded ${pack.name} dataset has no registrations for this year, so there are no positions to keep.`} />
  }

  return (
    <div className="space-y-4">
      <MetricRow>
        <Metric label="Supply" value={fmtInt(supply)} unit="units" tone="pos"
          sub={`${longs.length} ${longs.length === 1 ? 'entity' : 'entities'} long${trades && price != null ? ` · worth ${money(supply * price)} at assumption` : ''}`} />
        <Metric label="Demand" value={fmtInt(demand)} unit="units" tone="neg"
          sub={`${shorts.length} ${shorts.length === 1 ? 'entity' : 'entities'} short`} />
        <Metric label="Market coverage" value={`${coverage.toFixed(0)}%`}
          tone={coverage >= 100 ? 'pos' : coverage >= 50 ? 'warn' : 'neg'}
          sub={coverage >= 100 ? 'the market can cover itself' : 'demand exceeds every surplus combined'}
          hint="How much of total demand the total supply could satisfy, if every unit moved." />
        <Metric label="Unsettled exposure" value={money(exposure)} tone={exposure > 0 ? 'neg' : undefined}
          sub="if every entity settles standalone" />
      </MetricRow>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Panel flush title="Every position" icon={<Icon name="list" size={14} />}
          sub="Balance is −gap × units: positive is cover to sell, negative is a shortfall to clear."
          actions={<Segmented size="sm" value={sort} onChange={setSort}
            options={[{ id: 'balance', label: 'Balance' }, { id: 'units', label: 'Volume' }]} />}>
          <div className="max-h-[520px] overflow-auto">
            <Table>
              <thead>
                <tr>
                  <Th>Entity</Th>
                  <Th align="right">Gap</Th>
                  <Th align="right">Balance</Th>
                  {trades && <Th align="right">Value</Th>}
                  <Th align="center">Role</Th>
                  {onDraftTicket && <Th align="right" />}
                </tr>
              </thead>
              <tbody>
                {sorted.map((s) => {
                  const isLong = s.creditBalance > 0
                  const mine = s.parent === entity
                  return (
                    <Tr key={s.parent} interactive selected={mine} onClick={() => setEntity(country, s.parent)}>
                      <Td>
                        <span className="flex min-w-0 items-center gap-1.5"
                          title={`${fmtInt(s.units)} registrations · fleet ${fmtNum(s.avgMetric, 1)} vs limit ${fmtNum(s.limit, 1)} ${pack.metricUnit}`}>
                          <StatusDot size={6} tone={isLong ? 'pos' : s.creditBalance < 0 ? 'neg' : 'neutral'} />
                          <span className="truncate font-medium text-[var(--ink-1)]">{s.parent}</span>
                          {mine && <Badge tone="brand">yours</Badge>}
                        </span>
                      </Td>
                      <Td align="right">
                        <span className={s.gap > 0 ? 'font-semibold text-[var(--neg-ink)]' : 'text-[var(--pos-ink)]'}>{fmtGap(s.gap)}</span>
                      </Td>
                      <Td align="right">
                        <span className={cx('font-semibold', isLong ? 'text-[var(--pos-ink)]' : s.creditBalance < 0 ? 'text-[var(--neg-ink)]' : 'text-[var(--ink-5)]')}>
                          {s.creditBalance === 0 ? '—' : `${isLong ? '+' : '−'}${fmtInt(Math.abs(s.creditBalance))}`}
                        </span>
                      </Td>
                      {trades && (
                        <Td align="right">
                          {price != null && s.creditBalance !== 0
                            ? <span className="text-[var(--ink-2)]">{money(Math.abs(s.creditBalance) * price)}</span>
                            : <span className="text-[var(--ink-5)]">—</span>}
                        </Td>
                      )}
                      <Td align="center">
                        <Badge tone={isLong ? 'pos' : s.creditBalance < 0 ? 'warn' : 'neutral'}>
                          {s.creditBalance === 0 ? 'square' : isLong ? pack.transfer.supplier : pack.transfer.taker}
                        </Badge>
                      </Td>
                      {onDraftTicket && (
                        <Td align="right">
                          {entity && s.parent !== entity && s.creditBalance !== 0 && (
                            <Button size="xs" variant="ghost"
                              onClick={(e) => { e.stopPropagation(); onDraftTicket({ side: isLong ? 'buy' : 'sell', counterparty: s.parent, qty: Math.round(Math.abs(s.creditBalance)) }) }}>
                              {isLong ? 'Buy from' : 'Sell to'}
                            </Button>
                          )}
                        </Td>
                      )}
                    </Tr>
                  )
                })}
              </tbody>
            </Table>
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel title="Where the volume sits" icon={<Icon name="grid" size={14} />} sub="Registrations by book position.">
            <ShareBar height={13}
              parts={[
                { name: 'Long', value: longs.reduce((a, s) => a + s.units, 0), color: 'var(--pos)' },
                { name: 'Square', value: book.filter((s) => s.creditBalance === 0).reduce((a, s) => a + s.units, 0), color: 'var(--dv-other)' },
                { name: 'Short', value: shorts.reduce((a, s) => a + s.units, 0), color: 'var(--neg)' },
              ]} />
          </Panel>

          {keeper && (
            <Panel title="Ledger keeper" icon={<Icon name="agent" size={14} />}
              sub={`${keeper.findings.length} reconciliation ${keeper.findings.length === 1 ? 'issue' : 'issues'}`}
              actions={<Button size="xs" variant="ghost" onClick={() => { useApp.getState().setActiveRun(keeper.id); setConsole(true) }}>Trace</Button>}>
              <div className="space-y-2">{keeper.findings.slice(0, 3).map((f) => <FindingCard key={f.id} f={f} />)}</div>
            </Panel>
          )}

          <Callout tone="neutral" icon={<Icon name="lock" size={14} />} title="Nothing here posts itself">
            The Ledger keeper reconciles and drafts; it cannot post. Writing to the recorded book takes <b>creditbook.post</b>,
            and at any autonomy setting an agent proposal that touches it needs a named human approval first.
          </Callout>
        </div>
      </div>
    </div>
  )
}
