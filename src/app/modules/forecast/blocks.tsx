/* ───────────────────────────────────────────────────────────────────────────
   Compliance blocks.
   ---------------------------------------------------------------------------
   The most consequential thing this platform got wrong until now: it judged
   every year on its own. Two of the five regimes have stopped doing that.

     India, draft CAFE III — FY2027-28 → FY2029-30, then FY2030-31 → FY2031-32,
       with credits lapsing at each block close.
     EU, Reg (EU) 2025/1214 — 2025 to 2027 may be met on a three-year average.

   A manufacturer over the line in one year and comfortably under it either side
   does NOT breach under a block. Reported annually, that is a fine on screen
   that the regulator will never charge — and worse, it is a fine a team might
   spend real money to avoid. This view shows both readings side by side and
   names exactly which years the block rescues.

   The second thing it shows is the part people miss: credits LAPSE. A surplus
   is a wasting asset with a date on it, and the year you spend it in is a
   decision, not an afterthought.
   ─────────────────────────────────────────────────────────────────────────── */
import React, { useMemo, useState } from 'react'
import {
  Badge, Button, Callout, EmptyState, Metric, MetricRow, Panel, Progress,
  Segmented, StatusDot, Table, Td, Th, Tooltip, Tr, cx, fmtGap,
} from '../../design/primitives'
import Icon from '../../design/icons'
import { LineChart, DV } from '../../design/charts'
import { useApp, baseScenario } from '../../state/appStore'
import { usePosition } from '../../state/usePosition'
import { blockPosition, blocksFor, creditPriceFor, lapseWarning } from '../../../engine/blocks'
import { fmtInt, fmtMoney, fmtNum } from '../../../engine/engine'

export function ComplianceBlocks({ target }: { target?: string | null }) {
  const { pack, raw, scenario, country, makers } = usePosition('working')
  const setModule = useApp((s) => s.setModule)
  const [scope, setScope] = useState<'market' | 'maker'>(target ? 'maker' : 'market')

  const blocks = useMemo(() => blocksFor(pack), [pack])
  const who = scope === 'maker' ? target ?? null : null

  const scen = useMemo(() => ({ ...baseScenario(country), year: scenario.year }), [country, scenario.year])

  const positions = useMemo(
    () => blocks.map((b) => blockPosition(raw, pack, scen, b, who)),
    [blocks, raw, pack, scen, who],
  )

  const money = (v: number) => fmtMoney(v, pack.currency)

  if (!blocks.length) {
    return (
      <Panel title="Compliance blocks" icon={<Icon name="layers" size={14} />}
        sub={`${pack.name} assesses every compliance year on its own.`}>
        <EmptyState art="clean" title="This regime is annual"
          body={`Nothing in the ${pack.name} rule pack declares a multi-year compliance period, so each year stands alone and every other surface already reads correctly. India's draft CAFE III and the EU's 2025–27 averaging are the two that do not.`} />
      </Panel>
    )
  }

  const rescuedTotal = positions.reduce((a, p) => a + p.rescuedYears.length, 0)
  const savedTotal = positions.reduce((a, p) => a + Math.max(0, p.annualFine - p.fine), 0)
  const lapses = positions.map((p) => lapseWarning(p, pack)).filter(Boolean)

  return (
    <div className="space-y-4">
      <MetricRow>
        <Metric label="Blocks in this regime" value={blocks.length}
          sub={blocks.map((b) => b.years.length).join(' + ') + ' years'} />
        <Metric label="Years the block rescues" value={rescuedTotal}
          tone={rescuedTotal ? 'pos' : undefined}
          sub={rescuedTotal ? 'over the line alone, compliant across the block' : 'no year is carried by its block'}
          hint="A year that breaches standalone but is covered by the block average. Reported annually these would each show a fine that will never be charged." />
        <Metric label="Charge avoided by blocks" value={savedTotal > 0 ? money(savedTotal) : '—'}
          tone={savedTotal > 0 ? 'pos' : undefined}
          sub="annual reading less block reading" />
        <Metric label="Credits that lapse" value={lapses.length}
          tone={lapses.length ? 'warn' : undefined}
          sub={lapses.length ? `${fmtInt(lapses.reduce((a, l) => a + l!.units, 0))} units expire at block close` : 'nothing expiring'} />
      </MetricRow>

      {blocks[0]?.draft && (
        <Callout tone="warn" icon={<Icon name="alert" size={14} />} title="These blocks are drafted, not notified">
          Everything on this page depends on a consultation that is still open. Model it, stress it, do not file against it —
          and see Reg AI for how the loaded pack compares with the current draft.
          <Button className="ml-2" size="xs" variant="secondary" onClick={() => setModule('regai')}>Open Reg AI</Button>
        </Callout>
      )}

      <div className="flex items-center gap-2">
        <span className="t-label !mb-0">Assessed for</span>
        <Segmented size="sm" value={scope} onChange={setScope}
          options={[
            { id: 'market', label: `${pack.name} — whole market` },
            { id: 'maker', label: target ?? 'a manufacturer', disabled: !target, hint: target ? undefined : 'Scope the module to a manufacturer first' },
          ]} />
      </div>

      {positions.map((p) => {
        const rescued = p.rescuedYears.length > 0
        const lapse = lapseWarning(p, pack)
        return (
          <Panel key={p.block.id} flush
            title={p.block.label}
            sub={p.block.note}
            icon={<Icon name="layers" size={14} />}
            actions={
              <Badge dot tone={p.status === 'compliant' ? 'pos' : p.status === 'fine' ? 'neg' : 'neutral'}>
                {p.status === 'no-sales' ? 'no volume' : p.status === 'compliant' ? 'block clears' : 'block breaches'}
              </Badge>
            }>
            {p.status === 'no-sales' ? (
              <div className="p-4">
                <EmptyState compact art="data" title="No volume in these years"
                  body="The loaded dataset has no registrations across this block, so there is nothing to assess." />
              </div>
            ) : (
              <>
                <div className="grid gap-px bg-[var(--line)] sm:grid-cols-4">
                  {[
                    { k: 'Block average', v: `${fmtNum(p.avgMetric, 2)} ${pack.metricUnit}`, s: 'volume-weighted across the block' },
                    { k: 'Block target', v: `${fmtNum(p.avgLimit, 2)} ${pack.metricUnit}`, s: 'volume-weighted target' },
                    { k: 'Block gap', v: fmtGap(p.gap, 2), s: p.gap > 0 ? 'over the line' : 'inside the line', tone: p.gap > 0 ? 'neg' : 'pos' },
                    {
                      k: 'Charge',
                      v: p.fine > 0 ? money(p.fine) : '—',
                      s: Math.abs(p.annualFine - p.fine) > 1
                        ? `annual reading: ${money(p.annualFine)}`
                        : p.fine > 0 ? 'on the block-average exceedance' : 'no charge on the block',
                      tone: p.fine > 0 ? 'neg' : undefined,
                    },
                  ].map((c) => (
                    <div key={c.k} className="bg-[var(--surface-1)] px-4 py-3">
                      <div className="t-label">{c.k}</div>
                      <div className={cx('t-num mt-1 text-[17px] font-semibold',
                        c.tone === 'neg' ? 'text-[var(--neg-ink)]' : c.tone === 'pos' ? 'text-[var(--pos-ink)]' : 'text-[var(--ink-1)]')}>
                        {c.v}
                      </div>
                      <div className="t-cap mt-0.5">{c.s}</div>
                    </div>
                  ))}
                </div>

                <Table>
                  <thead>
                    <tr>
                      <Th>Year</Th>
                      <Th align="right">Fleet</Th>
                      <Th align="right">Target</Th>
                      <Th align="right">Gap alone</Th>
                      <Th align="right">Volume</Th>
                      <Th align="right">Weight in block</Th>
                      <Th>Annual reading</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.years.map((y) => {
                      const weight = (y.units / p.units) * 100
                      const isRescued = p.rescuedYears.includes(y.year)
                      const isDragged = p.draggedYears.includes(y.year)
                      return (
                        <Tr key={y.year}>
                          <Td strong>{y.year}</Td>
                          <Td align="right" strong>{fmtNum(y.metric, 2)}</Td>
                          <Td align="right" className="!text-[var(--ink-4)]">{fmtNum(y.limit, 2)}</Td>
                          <Td align="right">
                            <span className={y.gap > 0 ? 'font-semibold text-[var(--neg-ink)]' : 'text-[var(--pos-ink)]'}>{fmtGap(y.gap, 2)}</span>
                          </Td>
                          <Td align="right" className="!text-[var(--ink-3)]">{fmtInt(y.units)}</Td>
                          <Td align="right">
                            <span className="inline-flex items-center gap-1.5">
                              <span className="w-[42px]"><Progress value={weight} height={4} /></span>
                              <span className="w-[34px] text-right text-[11px] tabular-nums text-[var(--ink-4)]">{weight.toFixed(0)}%</span>
                            </span>
                          </Td>
                          <Td>
                            {isRescued ? (
                              <Tooltip content="Over the line on its own, but carried by the block. Reported annually this would show a charge the regulator will never levy.">
                                <span><Badge tone="pos" dot>rescued by the block</Badge></span>
                              </Tooltip>
                            ) : isDragged ? (
                              <Tooltip content="Compliant on its own, but the block as a whole still breaches — this year does not save you.">
                                <span><Badge tone="warn" dot>clear alone, block breaches</Badge></span>
                              </Tooltip>
                            ) : y.gap > 0 ? (
                              <Badge tone="neg" dot>over, and the block is too</Badge>
                            ) : (
                              <Badge tone="neutral">agrees with the block</Badge>
                            )}
                          </Td>
                        </Tr>
                      )
                    })}
                  </tbody>
                </Table>

                {(rescued || lapse) && (
                  <div className="space-y-2 border-t border-[var(--line-soft)] bg-[var(--surface-2)] p-4">
                    {rescued && (
                      <Callout tone="pos" icon={<Icon name="shield" size={14} />}
                        title={`${p.rescuedYears.join(', ')} ${p.rescuedYears.length === 1 ? 'breaches' : 'breach'} alone — the block clears`}>
                        Judged year by year this would show {money(p.annualFine)} of charge. Assessed as the regulation actually
                        assesses it, the charge is {p.fine > 0 ? money(p.fine) : 'nothing'}. Do not buy cover for a breach that
                        the block already absorbs.
                      </Callout>
                    )}
                    {lapse && (
                      <Callout tone="warn" icon={<Icon name="clock" size={14} />}
                        title={`${fmtInt(lapse.units)} credit units lapse after ${lapse.lapsesAfter}`}>
                        The surplus this block earns does not carry into the next one — anything unused when it closes is gone.
                        {lapse.value != null && <> At the published price for {lapse.lapsesAfter} that is <b>{money(lapse.value)}</b> of value with an expiry date on it.</>}
                        {' '}Selling or pooling it inside the block is a decision, not an afterthought.
                        <Button className="ml-2" size="xs" variant="secondary" onClick={() => setModule('creditbook')}>Open the desk</Button>
                      </Callout>
                    )}
                  </div>
                )}
              </>
            )}
          </Panel>
        )
      })}

      <Panel title="Block against annual, drawn" icon={<Icon name="forecast" size={14} />}
        sub="The flat step is the block average and its target; the line is each year on its own. Where the line crosses above the target but the step does not, the block is doing the work.">
        <LineChart
          x={positions.flatMap((p) => p.years.map((y) => y.year))}
          unit={pack.metricUnit}
          height={250}
          format={(v) => fmtNum(v, 2)}
          series={[
            {
              name: 'Year on its own',
              points: positions.flatMap((p) => p.years.map((y) => y.metric)),
              color: DV[0],
            },
            {
              name: 'Block average',
              points: positions.flatMap((p) => p.years.map(() => p.avgMetric)),
              color: 'var(--ink-1)', dashed: true,
            },
          ]}
          refLine={positions.flatMap((p) => p.years.map((y) => y.limit))}
          refLabel="Target" />
      </Panel>
    </div>
  )
}
