import { useMemo } from 'react'
import { useCompliance } from '../lib/useCompliance'
import { useStore } from '../state/store'
import { parentsFor } from '../data/fleet'
import { recommend } from '../engine/recommend'
import type { Scenario } from '../engine/types'
import { aggregateParent, buildTree, fmtInt, fmtMoney, fmtNum } from '../engine/engine'
import { buildDualCredit } from '../engine/china/dualcredit'
import { Section, StatusPill, difficultyColor } from '../components/ui'
import GapWaterfall from '../components/GapWaterfall'
import MaccChart from '../components/MaccChart'
import TornadoChart, { type TornadoDriver } from '../components/TornadoChart'
import Icon, { type IconName } from '../components/Icon'

const LEVER_ICON: Record<string, IconName> = { eco: 'leaf', ev: 'bolt', light: 'feather', pool: 'handshake', trim: 'scissors', credits: 'card' }

export default function GetUnderLine() {
  const { pack, raw, scenario, selectedParent, country } = useCompliance()
  const setParent = useStore((s) => s.setParent)
  const overrides = useStore((s) => s.makerOverrides)
  const parents = parentsFor(country)

  const plan = useMemo(() => recommend(raw, pack, scenario, selectedParent, overrides), [raw, pack, scenario, selectedParent, overrides])

  // MACC input: each fleet-changing lever's cost per metric-unit per vehicle.
  // Purchased credits are the benchmark line, not an abatement bar.
  const maccSteps = useMemo(
    () => plan.actions
      .filter((a) => a.lever !== 'credits' && a.gramsCleared > 0.0001)
      .map((a) => ({ label: a.title, grams: a.gramsCleared, unitCost: a.cost / (a.gramsCleared * Math.max(1, plan.before.rawUnits)), difficulty: a.difficulty })),
    [plan],
  )

  // Tornado: €-at-risk at plausible extremes of each driver, holding the rest
  // at the live scenario. Drivers that don't move the number are dropped.
  const tornado = useMemo(() => {
    if (plan.fineBefore <= 0) return null
    const fineOf = (p: Partial<Scenario>) => aggregateParent(raw, pack, { ...scenario, ...p }, selectedParent, overrides).fine
    const base = plan.fineBefore
    const curEv = Math.round(plan.before.zlevShare * 100)
    const ds: TornadoDriver[] = []
    const add = (label: string, a: { value: number; note: string }, b: { value: number; note: string }) => {
      if (Math.abs(a.value - base) > base * 0.005 || Math.abs(b.value - base) > base * 0.005) ds.push({ label, a, b })
    }
    add('Zero-emission mix ±5pp',
      { value: fineOf({ evSharePct: Math.min(95, curEv + 5) }), note: `ZE ${Math.min(95, curEv + 5)}%` },
      { value: fineOf({ evSharePct: Math.max(0, curEv - 5) }), note: `ZE ${Math.max(0, curEv - 5)}%` })
    add('Sales volume ±10%',
      { value: fineOf({ salesMultiplier: scenario.salesMultiplier * 1.1 }), note: 'sales +10%' },
      { value: fineOf({ salesMultiplier: scenario.salesMultiplier * 0.9 }), note: 'sales −10%' })
    add('Average mass ±50 kg',
      { value: fineOf({ massShiftKg: scenario.massShiftKg + 50 }), note: '+50 kg' },
      { value: fineOf({ massShiftKg: scenario.massShiftKg - 50 }), note: '−50 kg' })
    const cap = pack.ecoCap?.(scenario.year)
    if (cap) add('Eco-innovation 0 → cap',
      { value: fineOf({ ecoBoostG: cap }), note: `eco ${cap} g` },
      { value: fineOf({ ecoBoostG: 0 }), note: 'eco 0 g' })
    if (country === 'EU') add('PHEV utility factor',
      { value: fineOf({ phevUF: true }), note: 'UF applied' },
      { value: fineOf({ phevUF: false }), note: 'UF off' })
    // Draft regimes: the target line itself is uncertain until notified.
    if (pack.regimeFor?.(scenario.year)?.draft) add('Final norms vs draft ±5%',
      { value: fineOf({ targetShiftPct: -5 }), note: 'final 5% tighter' },
      { value: fineOf({ targetShiftPct: 5 }), note: 'final 5% looser' })
    if (!ds.length) return null
    const top = [...ds].sort((x, y) => Math.abs(y.a.value - y.b.value) - Math.abs(x.a.value - x.b.value))[0]
    return { base, ds, top }
  }, [raw, pack, scenario, selectedParent, overrides, plan, country])

  // China clears a two-axis CREDIT balance, not a single line — the "cheapest
  // path under the line" MACC does not apply. Show the credit-clearing action.
  if (country === 'CN') return <ClearCreditsCN raw={raw} pack={pack} scenario={scenario} />

  return (
    <div className="space-y-5 animate-slidein">
      <div className="flex flex-wrap items-center gap-2">
        {parents.map((p) => (
          <button key={p} onClick={() => setParent(p)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${selectedParent === p ? 'bg-ink-100 text-white' : 'bg-black/5 text-ink-500 hover:text-ink-100'}`}>{p}</button>
        ))}
      </div>

      {/* India: the payoff curve is a staircase — say so before ranking steps */}
      {country === 'IN' && plan.fineBefore > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-warn/35 bg-warn/[0.07] px-3.5 py-2 text-[11.5px] text-ink-300" data-testid="stepped-note">
          <Icon name="alert" size={14} className="shrink-0 text-warn" />
          <span><b>Stepped penalty (EC Act 2022):</b> the fine only changes at tier boundaries — below a 0.2 L/100km gap it drops to <b className="num">{fmtMoney(25_000 * plan.before.rawUnits, pack.currency)}</b> (₹25k/car), and to zero only on clearing. Steps that don't cross a boundary buy compliance progress, not fine relief.</span>
        </div>
      )}

      {/* Headline outcome */}
      <div className="card overflow-hidden p-0">
        <div className="grid grid-cols-1 md:grid-cols-4">
          <Cell label="Status now" >
            <StatusPill status={plan.before.status} big />
            <div className="mt-1 num text-sm text-ink-500">
              {plan.before.gap > 0
                ? `+${fmtNum(plan.before.gap, 1)} ${pack.metricUnit} over`
                : `${fmtNum(Math.abs(plan.before.gap), 1)} ${pack.metricUnit} headroom`}
            </div>
          </Cell>
          <Cell label="Fine if nothing changes">
            <div className="num text-2xl font-black text-danger">{fmtMoney(plan.fineBefore, pack.currency)}</div>
          </Cell>
          <Cell label="Cost of the plan">
            <div className="num text-2xl font-black text-ink-100">{fmtMoney(plan.totalCost, pack.currency)}</div>
            <div className="text-[11px] text-ink-500">{plan.actions.length} changes</div>
          </Cell>
          <Cell label="Outcome" highlight={plan.cleared || plan.fineAfter <= 0}>
            {plan.cleared
              ? <><div className="num text-2xl font-black text-safe">Under the line</div><div className="text-[11px] text-ink-500">saves {fmtMoney(plan.fineBefore - plan.fineAfter, pack.currency)}</div></>
              : plan.fineAfter <= 0 && plan.creditsCovered > 0
              ? <><div className="num text-2xl font-black text-safe">Compliant via credits</div><div className="text-[11px] text-ink-500">buys {fmtNum(plan.creditsCovered, 1)} {pack.metricUnit} of allowances</div></>
              : <><div className="num text-2xl font-black text-warn">{fmtMoney(plan.fineAfter, pack.currency)} left</div><div className="text-[11px] text-ink-500">closest realistic plan</div></>}
          </Cell>
        </div>
      </div>

      {/* the bridge — how each lever walks the fleet across the limit line */}
      {plan.fineBefore > 0 && plan.actions.length > 0 && (
        <Section title="The bridge · how the plan closes the gap"
          right={
            <span className="flex items-center gap-3 text-[11px] text-ink-500">
              <span>net benefit <b className={`num ${plan.fineBefore - plan.fineAfter - plan.totalCost > 0 ? 'text-safe' : 'text-warn'}`}>{fmtMoney(plan.fineBefore - plan.fineAfter - plan.totalCost, pack.currency)}</b></span>
              <span className="hidden sm:inline">fine avoided − plan cost</span>
            </span>
          }>
          <GapWaterfall
            startGap={plan.before.gap}
            steps={plan.actions.map((a) => ({ label: a.title, grams: a.gramsCleared, cost: a.cost, difficulty: a.difficulty }))}
            endGap={plan.after.gap - plan.creditsCovered}
            unit={pack.metricUnit}
            currency={pack.currency}
          />
        </Section>
      )}

      {/* MACC — which levers first, and when to buy instead of build */}
      {plan.fineBefore > 0 && maccSteps.length > 0 && (
        <Section title="Marginal abatement cost · build vs buy"
          right={<span className="text-[11px] text-ink-500">cheapest levers first · benchmarked against the penalty{pack.creditPrice != null ? ' and the credit price' : ''}</span>}>
          <MaccChart steps={maccSteps} fineRate={pack.fineRate} creditPrice={pack.creditPrice}
            gapToClose={plan.before.gap} unit={pack.metricUnit} currency={pack.currency} />
        </Section>
      )}

      {/* Tornado — what moves the exposure most */}
      {tornado && (
        <Section title="Sensitivity · what could change the fine"
          right={<span className="text-[11px] text-ink-500">one driver moved at a time · others held at the live scenario</span>}>
          <p className="mb-2 text-[13px] text-ink-400">
            {selectedParent.split(' ')[0]}&rsquo;s exposure swings most with <b className="text-ink-100">{tornado.top.label.toLowerCase()}</b> — from{' '}
            <b className="num text-safe">{fmtMoney(Math.min(tornado.top.a.value, tornado.top.b.value), pack.currency)}</b> to{' '}
            <b className="num text-danger">{fmtMoney(Math.max(tornado.top.a.value, tornado.top.b.value), pack.currency)}</b> across plausible settings.
          </p>
          <TornadoChart base={tornado.base} drivers={tornado.ds} currency={pack.currency} />
        </Section>
      )}

      {plan.fineBefore <= 0 ? (
        <Section><div className="py-8 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-safe/30 bg-safe/10 text-safe"><Icon name="check" size={24} /></div><div className="mt-3 text-lg font-bold text-safe">{plan.before.status === 'exempt' ? `${selectedParent} is exempt — no fine` : `${selectedParent} is already under the line`}</div><div className="text-sm text-ink-500">{plan.before.status === 'exempt' ? 'Below the small-volume threshold, so no penalty applies for ' : 'No action needed for '}{scenario.year}. Tighten an assumption on the right to stress-test it.</div></div></Section>
      ) : (
        <Section title="The cheapest realistic path under the line" right={<span className="text-[11px] text-ink-500">ranked by € per gram</span>}>
          <ol className="relative space-y-3 before:absolute before:bottom-8 before:left-[34px] before:top-8 before:w-px before:bg-gradient-to-b before:from-brand/30 before:via-brand/15 before:to-transparent">
            {plan.actions.map((a, i) => (
              <li key={a.id} style={{ animationDelay: `${i * 70}ms` }}
                className="rise relative flex items-start gap-4 rounded-xl border border-black/[0.06] bg-black/[0.02] p-4 transition-colors hover:border-brand/25 hover:bg-brand/[0.025]">
                <div className="z-10 grid h-9 w-9 shrink-0 place-items-center rounded-full border border-brand/25 bg-[#FDF3EA] font-bold text-brand num shadow-[0_2px_6px_-2px_rgba(232,34,59,0.4)]">{i + 1}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="grid h-7 w-7 place-items-center rounded-lg border border-black/[0.08] bg-black/[0.03] text-brand"><Icon name={LEVER_ICON[a.lever]} size={15} /></span>
                    <span className="font-semibold text-ink-100">{a.title}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${difficultyColor(a.difficulty)}`}>{a.difficulty}</span>
                  </div>
                  <p className="mt-1 text-sm text-ink-500">{a.detail}</p>
                  <div className="mt-2 flex flex-wrap gap-4 text-xs">
                    <span className="text-ink-500">Clears <b className="num text-safe">{fmtNum(a.gramsCleared, 2)} {pack.metricUnit}</b></span>
                    <span className="text-ink-500">Cost <b className="num text-ink-100">{fmtMoney(a.cost, pack.currency)}</b></span>
                    <span className="text-ink-500">Fine avoided <b className="num text-accentblue">{fmtMoney(a.fineAvoided, pack.currency)}</b></span>
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-4 flex items-center justify-between rounded-xl bg-ink-950/60 p-4">
            <div>
              <div className="label">After the plan</div>
              <div className="num text-sm text-ink-500">Fleet {fmtNum(plan.after.avgMetric, 1)} {pack.metricUnit} vs limit {fmtNum(plan.after.limit, 1)} · gap {plan.after.gap > 0 ? '+' : ''}{fmtNum(plan.after.gap, 1)}</div>
            </div>
            <StatusPill status={plan.after.status} big />
          </div>
        </Section>
      )}
    </div>
  )
}

const Cell = ({ label, children, highlight }: { label: string; children: React.ReactNode; highlight?: boolean }) => (
  <div className={`border-b border-black/[0.06] p-5 md:border-b-0 md:border-r last:border-0 ${highlight ? 'bg-gradient-to-br from-safe/[0.08] to-safe/[0.02]' : ''}`}>
    <div className="label mb-2">{label}</div>
    {children}
  </div>
)

// ── China · Clear the credits ────────────────────────────────────────────────
// China isn't judged on a line — it's a two-axis credit balance. Clearing a
// deficit is a dual-credit operation (own surplus → affiliate → buy NEV credits,
// or electrify to EARN credits), not a fleet-CO₂ MACC. This is that action view.
const CREDITS_PER_BEV = 2.0 // a marginal BEV earns ≈ 2 NEV credits (see dualcredit.ts)
function ClearCreditsCN({ raw, pack, scenario }: { raw: any[]; pack: any; scenario: Scenario }) {
  const setScreen = useStore((s) => s.setScreen)
  const price = scenario.creditPrice ?? pack.creditPrice ?? pack.fineRate
  const dc = useMemo(() => buildDualCredit(buildTree(raw, pack, scenario, {}), scenario, price), [raw, pack, scenario, price])
  const shorts = dc.oems.filter((o) => o.creditsToBuy > 0.5).sort((a, b) => b.creditsToBuy - a.creditsToBuy)
  const clear = dc.totals.makers - dc.totals.makersOver
  const evsToBuild = Math.ceil(dc.totals.creditsToBuy / CREDITS_PER_BEV)
  const f = (n: number) => (n >= 0 ? '+' : '−') + fmtInt(Math.abs(n))

  return (
    <div className="space-y-5 animate-slidein">
      {/* verdict */}
      <div className="rise card relative overflow-hidden p-5 pl-6">
        <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: shorts.length ? 'linear-gradient(180deg,#E0484D,#E0484D55)' : 'linear-gradient(180deg,#0E9F6E,#0E9F6E55)' }} />
        <div className="label text-ink-500">Clear the credits · 积分 · {scenario.year}</div>
        <p className="mt-1.5 max-w-3xl text-[15px] leading-relaxed text-ink-300">
          {shorts.length === 0 ? (
            <>All <b className="text-ink-100">{dc.totals.makers}</b> compliance entities clear <b className="text-safe">both</b> axes — no credits to buy. Surplus can be banked or sold on the NEV-credit market.</>
          ) : (
            <><b className="text-ink-100">{clear} of {dc.totals.makers}</b> entities clear both axes. The rest are short after self-offset and must source{' '}
              <b className="num text-danger">{fmtInt(dc.totals.creditsToBuy)}</b> NEV credits — <b className="num text-danger">{fmtMoney(dc.totals.cost, pack.currency)}</b> to buy clear, or ≈ <b className="num text-brand">{fmtInt(evsToBuild)}</b> more BEVs to earn them.</>
          )}
        </p>
      </div>

      {/* clearing order + buy-vs-build */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {[
          { icon: 'reset', t: '1 · Own surplus', d: 'A prior-year CAFC surplus (banked, ≤5-yr) offsets a current CAFC deficit — automatic, free.' },
          { icon: 'handshake', t: '2 · Affiliate transfer', d: 'CAFC surplus can move from an affiliate (≥25% common equity). NEV deficits never qualify.' },
          { icon: 'card', t: '3 · Buy NEV credits', d: `Any residual CAFC deficit and every NEV deficit clear on the market at ${pack.creditPriceLabel ?? '≈¥1,000/credit'}.` },
        ].map((s) => (
          <div key={s.t} className="card p-4">
            <div className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-lg bg-brand/10 text-brand"><Icon name={s.icon as IconName} size={14} /></span><span className="text-[13px] font-bold text-ink-100">{s.t}</span></div>
            <p className="mt-2 text-[11.5px] leading-relaxed text-ink-500">{s.d}</p>
          </div>
        ))}
      </div>

      {/* per short-maker action table */}
      {shorts.length > 0 ? (
        <Section title="Who must act, and the cheapest way clear" right={<span className="text-[11px] text-ink-500">buy credits vs electrify</span>}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-black/[0.03] text-left text-[11px] uppercase tracking-wider text-ink-500">
                  <th className="px-4 py-2.5">Compliance entity</th>
                  <th className="px-4 py-2.5 text-right">CAFC 积分</th>
                  <th className="px-4 py-2.5 text-right">NEV 积分</th>
                  <th className="px-4 py-2.5 text-right">Credits to buy</th>
                  <th className="px-4 py-2.5 text-right">Cost to clear</th>
                  <th className="px-4 py-2.5 text-right">or build ≈</th>
                </tr>
              </thead>
              <tbody>
                {shorts.map((o) => (
                  <tr key={o.parent} className="border-t border-black/[0.04]">
                    <td className="px-4 py-2.5 font-medium text-ink-100">{o.parent}</td>
                    <td className={`num px-4 py-2.5 text-right ${o.cafcCredit < 0 ? 'text-danger' : 'text-safe'}`}>{f(o.cafcCredit)}</td>
                    <td className={`num px-4 py-2.5 text-right ${o.nevBalance < 0 ? 'text-danger' : 'text-safe'}`}>{f(o.nevBalance)}</td>
                    <td className="num px-4 py-2.5 text-right font-semibold text-danger">{fmtInt(o.creditsToBuy)}</td>
                    <td className="num px-4 py-2.5 text-right font-bold text-danger">{fmtMoney(o.cost, pack.currency)}</td>
                    <td className="num px-4 py-2.5 text-right text-brand">{fmtInt(Math.ceil(o.creditsToBuy / CREDITS_PER_BEV))} BEVs</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-ink-500">A negative balance on either axis is a deficit. A CAFC deficit can be offset by the maker’s own spare NEV credits first; only the residual, plus any NEV-axis deficit, must be bought. Electrifying earns NEV credits instead of buying them — the last column is the rough BEV count that closes the gap at ≈{CREDITS_PER_BEV} credits/BEV.</p>
        </Section>
      ) : (
        <Section><div className="py-8 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-safe/30 bg-safe/10 text-safe"><Icon name="check" size={24} /></div><div className="mt-3 text-lg font-bold text-safe">Every entity clears both axes in {scenario.year}</div><div className="text-sm text-ink-500">No credits to buy. Move a lever on the right to stress-test the position.</div></div></Section>
      )}

      <button onClick={() => setScreen('creditbook')} className="btn-ghost"><Icon name="scale" size={15} /> Open the Credit book — full two-axis ledger & offset waterfall</button>
    </div>
  )
}
