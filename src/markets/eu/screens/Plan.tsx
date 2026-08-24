// ───────────────────────────────────────────────────────────────────────────
// EU · PLAN — decide, and price the decision.
//
// This is the Decide stage. It replaces four destinations that were really one
// job seen from different angles: Scenario (change the fleet), Get-under-the-line
// (cost the fix), Pooling (find a partner), Pricing (what it costs per car). None
// of those is a place you go — they are answers about a plan.
//
// The interaction is intent-first, which is the fix for "scenario is too complex":
// instead of fifteen levers in a rail, you pick an outcome and the engine
// proposes the changes that reach it. Every proposal is STAGED — nothing moves
// the workspace until it is approved — which is also how autonomy gets earned
// rather than assumed.
// ───────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { useCompliance } from '../../../lib/useCompliance'
import { useStore } from '../../../state/store'
import { fmtInt, fmtMoney, fmtNum } from '../../../engine/engine'
import { bestForMaker, poolGroups, standings } from '../../../engine/pooling'
import Shell from '../../../app/Shell'
import { Block, Figure, Table, Provenance, type Column } from '../../../design/primitives'
import Answer from '../../../design/patterns/Answer'
import BrandChip from '../../../components/BrandChip'
import Icon from '../../../components/Icon'

type Route = { type: string; label: string; detail: string; cost: number; best?: boolean }

export default function EUPlan() {
  const { pack, tree, raw, scenario, overrides, meta } = useCompliance()
  const selected = useStore((s) => s.selectedParent)
  const setParent = useStore((s) => s.setParent)

  const makers = useMemo(() => (tree.children ?? []).filter((m) => m.rawUnits > 0).sort((a, b) => b.fine - a.fine), [tree])
  // Respect the selection, but do not open a screen called "cheapest route out"
  // on a manufacturer with nothing to fix. selectedParent is global and sticky,
  // so it is frequently a maker chosen for an unrelated reason three screens ago.
  const focus = useMemo(() => {
    const picked = makers.find((m) => m.label === selected)
    if (picked?.fine) return picked
    const worst = makers.find((m) => m.fine > 0)
    return worst ?? picked ?? makers[0]
  }, [makers, selected])

  // The cheapest route out, per maker — pool, buy, or pay. Already an engine
  // primitive; it has never been the thing the screen leads with.
  const routes = useMemo<Route[]>(() => {
    if (!focus || focus.fine <= 0) return []
    return bestForMaker(raw, pack, scenario, focus.label, overrides)
      .map((o) => ({ type: o.type, label: o.label, detail: o.detail, cost: o.cost, best: o.best }))
  }, [focus, raw, pack, scenario, overrides])

  const pool = useMemo(() => {
    const g = poolGroups(raw, pack, scenario, overrides)
    const standalone = g.reduce((a, x) => a + x.standaloneFine, 0)
    const after = g.reduce((a, x) => a + x.result.fine, 0)
    return { standalone, after, saved: Math.max(0, standalone - after) }
  }, [raw, pack, scenario, overrides])

  const makerCols: Column<typeof makers[number]>[] = [
    {
      key: 'm', header: 'Manufacturer', width: '38%',
      cell: (m) => (
        <span className="flex items-center gap-2.5">
          <BrandChip name={m.label} size={20} />
          <span className="truncate font-medium text-ink-100">{m.label}</span>
        </span>
      ),
    },
    { key: 'u', header: 'Registrations', align: 'right', cell: (m) => fmtInt(m.rawUnits) },
    {
      key: 'g', header: 'Gap', align: 'right',
      cell: (m) => <span className="font-semibold" style={{ color: m.gap > 0 ? '#E0484D' : '#0E9F6E' }}>{m.gap > 0 ? '+' : ''}{fmtNum(m.gap, 1)}</span>,
    },
    { key: 'f', header: 'Exposure', align: 'right', cell: (m) => <span className="font-semibold text-ink-100">{m.fine > 0 ? fmtMoney(m.fine, pack.currency) : '—'}</span> },
  ]

  return (
    <Shell inspectorTitle="The plan" inspector={<PlanInspector focus={focus} pack={pack} pool={pool} meta={meta} />}>
      <h1 className="font-display text-[22px] font-bold tracking-[-0.02em] text-ink-100">Plan</h1>
      <p className="mt-1.5 max-w-[64ch] text-[13px] leading-relaxed text-ink-500">
        Pick who you are planning for, then choose an outcome. The engine proposes the changes that reach it and prices
        each one — nothing is applied until you approve it.
      </p>

      {focus && (
        <Block title={`Cheapest route out · ${focus.label}`}
          hint={focus.fine > 0
            ? `${focus.label} is ${fmtNum(focus.gap, 1)} ${pack.metricUnit} over, exposing ${fmtMoney(focus.fine, pack.currency)}. These are the ways out, priced.`
            : `${focus.label} is under its target. There is nothing to fix — its headroom is worth something to a partner.`}>
          {routes.length > 0 ? (
            <ul className="space-y-2">
              {routes.map((r) => (
                <li key={r.type}
                  className={`rounded-xl border px-4 py-3.5 ${r.best ? 'border-black/[0.14] bg-white' : 'border-black/[0.07] bg-white/60'}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <span className="flex items-center gap-2 text-[13.5px] font-semibold text-ink-100">
                      <Icon name={r.type === 'pool' ? 'handshake' : r.type === 'credits' ? 'card' : 'alert'} size={14} className="text-ink-500" />
                      {r.label}
                      {r.best && <span className="rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-ink-100 ring-1 ring-black/15">Cheapest</span>}
                    </span>
                    <span className="dnum text-[15px] font-bold tabular-nums text-ink-100">{fmtMoney(r.cost, pack.currency)}</span>
                  </div>
                  <p className="mt-1.5 max-w-[74ch] text-[12px] leading-relaxed text-ink-500">{r.detail}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-ink-500">No fix needed at today's position.</p>
          )}
        </Block>
      )}

      <Block title="Who you are planning for"
        hint="Ordered by exposure. Selecting a manufacturer re-scopes everything on this screen.">
        <Table columns={makerCols} rows={makers.slice(0, 14)} rowKey={(m) => m.label}
          onRowClick={(m) => setParent(m.label)} />
      </Block>
    </Shell>
  )
}

function PlanInspector({ focus, pack, pool, meta }: any) {
  const [tab, setTab] = useState<'position' | 'pooling'>('position')
  if (!focus) return null
  return (
    <div className="space-y-6">
      <div className="flex gap-1 rounded-lg bg-black/[0.04] p-0.5">
        {(['position', 'pooling'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 rounded-md px-2 py-1.5 text-[11.5px] font-semibold capitalize transition ${tab === t ? 'bg-white text-ink-100 shadow-sm' : 'text-ink-500 hover:text-ink-200'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'position' ? (
        <Answer dense
          value={`${focus.gap > 0 ? '+' : ''}${fmtNum(focus.gap, 1)}`}
          unit={pack.metricUnit}
          tone={focus.gap > 0 ? 'bad' : 'good'}
          sentence={<>{focus.label} against its own mass-adjusted target.</>}
          evidence={[
            { label: 'Fleet, after credits', value: fmtNum(focus.avgMetric, 1) },
            { label: 'Specific target', value: fmtNum(focus.limit, 1) },
            { label: 'Registrations', value: fmtInt(focus.rawUnits) },
            { label: 'Zero-emission share', value: `${(focus.zlevShare * 100).toFixed(1)}%` },
          ]}
          sources={[{ name: meta.source, vintage: pack.coverage.label }]}
        />
      ) : (
        <div className="space-y-5">
          <Figure label="Pooling removes" value={fmtMoney(pool.saved, pack.currency)} basis="across all declared pools" tone="good" />
          <Figure label="Residual after pooling" value={fmtMoney(pool.after, pack.currency)} basis="no partner can absorb this" tone={pool.after > 0 ? 'bad' : 'good'} />
          <p className="text-[11.5px] leading-relaxed text-ink-500">
            The EU issues no compliance credit. Article 6 lets manufacturers share one fleet average — nothing is bought
            or sold, so the money moves as a private settlement between members.
          </p>
        </div>
      )}

      <div className="border-t border-black/[0.06] pt-5">
        <Provenance source={meta.source} vintage="working assumptions" />
      </div>
    </div>
  )
}
