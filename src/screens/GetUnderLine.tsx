import { useMemo } from 'react'
import { useCompliance } from '../lib/useCompliance'
import { useStore } from '../state/store'
import { parentsFor } from '../data/fleet'
import { recommend } from '../engine/recommend'
import { fmtInt, fmtMoney, fmtNum } from '../engine/engine'
import { Section, StatusPill, difficultyColor } from '../components/ui'
import Icon, { type IconName } from '../components/Icon'

const LEVER_ICON: Record<string, IconName> = { eco: 'leaf', ev: 'bolt', light: 'feather', pool: 'handshake', trim: 'scissors', credits: 'card' }

export default function GetUnderLine() {
  const { pack, raw, scenario, selectedParent, country } = useCompliance()
  const setParent = useStore((s) => s.setParent)
  const parents = parentsFor(country)

  const plan = useMemo(() => recommend(raw, pack, scenario, selectedParent), [raw, pack, scenario, selectedParent])

  return (
    <div className="space-y-5 animate-slidein">
      <div className="flex flex-wrap items-center gap-2">
        {parents.map((p) => (
          <button key={p} onClick={() => setParent(p)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${selectedParent === p ? 'bg-ink-100 text-white' : 'bg-black/5 text-ink-500 hover:text-ink-100'}`}>{p}</button>
        ))}
      </div>

      {/* Headline outcome */}
      <div className="card overflow-hidden p-0">
        <div className="grid grid-cols-1 md:grid-cols-4">
          <Cell label="Status now" >
            <StatusPill status={plan.before.status} big />
            <div className="mt-1 num text-sm text-ink-500">+{fmtNum(plan.before.gap, 1)} {pack.metricUnit} over</div>
          </Cell>
          <Cell label="Fine if nothing changes">
            <div className="num text-2xl font-black text-danger">{fmtMoney(plan.fineBefore, pack.currency)}</div>
          </Cell>
          <Cell label="Cost of the plan">
            <div className="num text-2xl font-black text-ink-100">{fmtMoney(plan.totalCost, pack.currency)}</div>
            <div className="text-[11px] text-ink-500">{plan.actions.length} changes</div>
          </Cell>
          <Cell label="Outcome" highlight={plan.cleared}>
            {plan.cleared
              ? <><div className="num text-2xl font-black text-safe">Under the line</div><div className="text-[11px] text-ink-500">saves {fmtMoney(plan.fineBefore - plan.fineAfter, pack.currency)}</div></>
              : <><div className="num text-2xl font-black text-warn">{fmtMoney(plan.fineAfter, pack.currency)} left</div><div className="text-[11px] text-ink-500">closest realistic plan</div></>}
          </Cell>
        </div>
      </div>

      {plan.fineBefore <= 0 ? (
        <Section><div className="py-8 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-safe/30 bg-safe/10 text-safe"><Icon name="check" size={24} /></div><div className="mt-3 text-lg font-bold text-safe">{plan.before.status === 'exempt' ? `${selectedParent} is exempt — no fine` : `${selectedParent} is already under the line`}</div><div className="text-sm text-ink-500">{plan.before.status === 'exempt' ? 'Below the small-volume threshold, so no penalty applies for ' : 'No action needed for '}{scenario.year}. Tighten an assumption on the right to stress-test it.</div></div></Section>
      ) : (
        <Section title="The cheapest realistic path under the line" right={<span className="text-[11px] text-ink-500">ranked by € per gram</span>}>
          <ol className="space-y-3">
            {plan.actions.map((a, i) => (
              <li key={a.id} className="flex items-start gap-4 rounded-xl border border-black/[0.06] bg-black/[0.02] p-4">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand/15 text-brand font-bold num">{i + 1}</div>
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
                    <span className="text-ink-500">Fine avoided <b className="num text-accent">{fmtMoney(a.fineAvoided, pack.currency)}</b></span>
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
  <div className={`border-b border-black/[0.06] p-5 md:border-b-0 md:border-r last:border-0 ${highlight ? 'bg-safe/[0.04]' : ''}`}>
    <div className="label mb-2">{label}</div>
    {children}
  </div>
)
