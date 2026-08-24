// ───────────────────────────────────────────────────────────────────────────
// EU · BRIEF — the home. What needs you, not what happened.
//
// This replaces a screen that greeted the reader with the fine: a large red
// number, before they had any idea what to do about it. A scoreboard is the least
// useful thing to show someone who has just sat down, and leading with a penalty
// makes a tool feel like an accusation.
//
// The exposure has not gone anywhere — it is one line down, and one click into
// its own working. What leads is the set of things the engine noticed.
// ───────────────────────────────────────────────────────────────────────────
import { useMemo } from 'react'
import { useCompliance } from '../../../lib/useCompliance'
import { useStore } from '../../../state/store'
import { runCoPilot, type Finding } from '../../../engine/copilot'
import { clientFleetSource, type ToolContext } from '../../../engine/tools'
import { fmtInt, fmtMoney } from '../../../engine/engine'
import Brief from '../../../design/patterns/Brief'
import Shell from '../../../app/Shell'
import { Block, Provenance } from '../../../design/primitives'
import Icon from '../../../components/Icon'

const WHEN = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

export default function EUBrief() {
  const { pack, tree, meta, scenario } = useCompliance('actuals')
  const country = useStore((s) => s.country)
  const dataVersion = useStore((s) => s.dataVersion)
  const setScreen = useStore((s) => s.setScreen)
  const setParent = useStore((s) => s.setParent)

  const findings = useMemo<Finding[]>(() => {
    const ctx: ToolContext = { fleet: clientFleetSource, allowed: [country], pooling: true, actions: [] }
    try { return runCoPilot(ctx, country) } catch { return [] }
  }, [country, dataVersion])

  // The market summary is one of the findings, not the headline — so drop it
  // from the list and let the specific, actionable ones lead.
  const items = findings.filter((f) => f.category !== 'Market')
  const needsYou = items.filter((f) => f.severity === 'critical' || f.severity === 'high')
  const exposure = (tree.children ?? []).reduce((a, m) => a + m.fine, 0)

  const ask = (f: Finding) => {
    if (f.maker) setParent(f.maker)
    setScreen('copilot')
  }
  const act = (f: Finding, i: number) => {
    const a = f.options[i]?.action
    if (f.maker) setParent(f.maker)
    setScreen(a?.kind === 'creditbook' ? 'creditbook' : a?.kind === 'forecast' ? 'forecast' : a?.kind === 'data' ? 'data' : 'scenario')
  }

  return (
    <Shell>
      <header className="mb-9">
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-[12.5px] text-[#7E756A]">{pack.name} · {WHEN.format(new Date())}</p>
          <p className="text-[12px] text-[#7E756A]">
            {fmtInt(tree.rawUnits)} registrations · {scenario.year}
          </p>
        </div>
        <h1 className="font-display mt-3 text-[26px] font-bold leading-[1.15] tracking-[-0.025em] text-[#F6F2EB]">
          {needsYou.length === 0
            ? 'Nothing needs you today.'
            : `${needsYou.length === 1 ? 'One thing needs' : `${needsYou.length} things need`} you today.`}
        </h1>
        <p className="mt-2 max-w-[62ch] text-[13.5px] leading-relaxed text-[#7E756A]">
          {needsYou.length === 0
            ? 'No manufacturer is over its target and nothing in the data or the regulation has moved. The position below is unchanged.'
            : 'Ranked by what it costs to leave alone. Each one opens into the figures behind it and a way to act.'}
        </p>
      </header>

      {items.length > 0 && <Brief findings={items} onAsk={ask} onAct={act} />}

      {/* The exposure is a consequence you can reach — not the greeting. */}
      <Block title="The position behind all of this"
        action={<button onClick={() => setScreen('analyse')} className="text-[12.5px] font-semibold text-brand hover:underline">Open the drill →</button>}>
        <div className="flex flex-wrap items-end gap-x-12 gap-y-5">
          <Measure label="Exposure" value={fmtMoney(exposure, pack.currency)} sub={`across ${(tree.children ?? []).filter((m) => m.fine > 0).length} manufacturers`} />
          <Measure label="Fleet" value={`${tree.avgMetric.toFixed(1)}`} sub={`${pack.metricUnit} · target ${tree.limit.toFixed(1)}`} />
          <Measure label="Registrations" value={fmtInt(tree.rawUnits)} sub={`${(tree.children ?? []).length} manufacturers`} />
        </div>
        <div className="mt-6">
          <Provenance source={meta.source}
            vintage={meta.lastRefreshed ? `refreshed ${new Date(meta.lastRefreshed).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : 'bundled extract'}
            detail={pack.coverage.label} />
        </div>
      </Block>

      <p className="mt-10 flex items-center gap-2 text-[12px] text-[#7E756A]">
        <Icon name="spark" size={13} className="text-brand" />
        Ask anything about this market — <button onClick={() => setScreen('copilot')} className="font-semibold text-[#B8AEA0] underline-offset-2 hover:underline">open AiRE</button>
      </p>
    </Shell>
  )
}

function Measure({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#7E756A]">{label}</div>
      <div className="dnum mt-1.5 text-[24px] font-bold tabular-nums leading-none tracking-[-0.02em] text-[#F6F2EB]">{value}</div>
      <div className="mt-1.5 text-[11.5px] text-[#7E756A]">{sub}</div>
    </div>
  )
}
