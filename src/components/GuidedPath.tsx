// ───────────────────────────────────────────────────────────────────────────
// GUIDED PATH — the seven-minute route through the workspace.
//
// A live demo fails in two ways that have nothing to do with the product:
// hunting for the right screen, and explaining the interface instead of the
// insight. This removes both. Five steps — Position → Risk → Fix → Price →
// Board pack — each one driving the workspace to exactly the right scope and
// stating, in the presenter's own words, what the number on screen means.
//
// The talking points are generated FROM the engine, not written as copy, so
// they cannot drift from what the screen behind them shows. If the dataset
// changes, the script changes with it.
//
// It doubles as onboarding: the same route, run on the customer's own data.
// ───────────────────────────────────────────────────────────────────────────
import { useMemo } from 'react'
import { useStore } from '../state/store'
import { useCompliance } from '../lib/useCompliance'
import { applyActions, type DashboardAction } from '../lib/assistant'
import { fmtMoney, fmtInt } from '../engine/engine'
import type { Aggregate, CountryId, RulePack } from '../engine/types'
import Icon, { type IconName } from './Icon'

export interface Step {
  id: string
  label: string
  icon: IconName
  /** What the presenter says while this screen loads. */
  say: string
  /** Where the workspace has to be for that sentence to be true. */
  action: DashboardAction
}

/** Pure: the script, derived from the engine's own output. Kept out of the hook
 *  so it can be tested without React — a demo script that has drifted from the
 *  data is worse than no script, so this is worth asserting on. */
export function buildGuideSteps(pack: RulePack, tree: Aggregate, country: CountryId, year: number): Step[] {
  {
    const makers = (tree.children ?? []).filter((c) => c.rawUnits > 0)
    const over = makers.filter((c) => c.status === 'fine')
    const marketFine = makers.reduce((a, c) => a + c.fine, 0)
    const worst = [...over].sort((a, b) => b.fine - a.fine)[0] ?? makers[0]
    const worstName = worst?.label ?? ''
    const worstShort = worstName.split(' ').slice(0, 2).join(' ')
    const cur = pack.currency
    const lastYear = pack.years[pack.years.length - 1]
    const period = country === 'IN' ? `FY${String(year).slice(2)}-${String(year + 1).slice(2)}` : String(year)
    const horizon = country === 'IN' ? `FY${String(lastYear).slice(2)}-${String(lastYear + 1).slice(2)}` : String(lastYear)

    return [
      {
        id: 'position', label: 'Position', icon: 'scatter',
        say: over.length === 0
          ? `Every one of the ${makers.length} compliance entities in ${pack.name} clears its ${period} limit. This is the book of record — ${fmtInt(makers.reduce((a, c) => a + c.rawUnits, 0))} registrations, not a model.`
          : `${over.length} of ${makers.length} entities are over the line in ${period}. That is ${fmtMoney(marketFine, cur)} of statutory exposure on today's book — and ${worstShort} carries the largest share.`,
        action: { screen: 'analyse', year, drillPath: [] },
      },
      {
        id: 'risk', label: 'Risk', icon: 'trending',
        say: `The line tightens every year to ${horizon}. This projects the latest actuals forward on sourced drivers — volumes, ZE adoption, mass drift — and weights four cases into one expected number, so you are looking at a distribution, not a guess.`,
        action: { screen: 'forecast' },
      },
      {
        id: 'fix', label: 'Fix', icon: 'target',
        say: worstName
          ? `Here is the cheapest legal route back under the line for ${worstShort}, ranked by cost per gram. Every step re-runs the engine, so the plan is costed rather than asserted.`
          : `The same optimiser ranks the cheapest way to hold position as the line tightens.`,
        action: { screen: 'under', parent: worstName || undefined },
      },
      {
        id: 'price', label: 'Price', icon: 'card',
        say: `Compliance is a cost per car before it is a fine. This is what it adds to each vehicle, which nameplates carry the burden, and which ones earn credit value back.`,
        action: { screen: 'pricing', parent: worstName || undefined },
      },
      {
        id: 'pack', label: 'Board pack', icon: 'section',
        say: `Everything you have just seen exports as a board pack, pinned to the dataset vintage it was computed from — so the number in the deck can always be traced back to this screen.`,
        action: { screen: 'forecast' },
      },
    ]
  }
}

/** React binding — the same script, bound to the live workspace. */
export function useGuideSteps(): Step[] {
  const { pack, tree, country, scenario } = useCompliance('actuals')
  return useMemo(() => buildGuideSteps(pack, tree, country, scenario.year), [pack, tree, country, scenario.year])
}

export default function GuidedPath() {
  const step = useStore((s) => s.guideStep)
  const setStep = useStore((s) => s.setGuideStep)
  const end = useStore((s) => s.endGuide)
  const steps = useGuideSteps()
  const { pack } = useCompliance('actuals')

  if (step < 0 || step >= steps.length) return null
  const s = steps[step]
  const go = (i: number) => {
    if (i < 0 || i >= steps.length) return
    setStep(i)
    applyActions([steps[i].action])
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-5 pb-5">
      <div className="pointer-events-auto w-full max-w-[840px] overflow-hidden rounded-2xl border border-white/[0.10] shadow-[0_24px_60px_-24px_rgba(0,0,0,0.7)]"
        style={{ background: 'linear-gradient(180deg, #221D18, #17130F)' }}>

        {/* progress rail — the whole route is visible, so nobody wonders how long this takes */}
        <div className="flex items-center gap-1 border-b border-white/[0.07] px-3 py-2">
          {steps.map((st, i) => {
            const done = i < step, on = i === step
            return (
              <button key={st.id} onClick={() => go(i)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition ${
                  on ? 'bg-white/[0.10] text-white' : done ? 'text-white/55 hover:text-white/80' : 'text-white/30 hover:text-white/55'}`}>
                <Icon name={st.icon} size={12} className={on ? 'text-brand-400' : done ? 'text-safe/70' : ''} />
                <span className="hidden sm:inline">{st.label}</span>
              </button>
            )
          })}
        </div>

        <div className="flex items-start gap-4 px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white/40">
              Step {step + 1} of {steps.length} · {pack.name}
            </div>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-white/85">{s.say}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button onClick={() => go(step - 1)} disabled={step === 0}
              className="rounded-lg border border-white/10 px-2.5 py-2 text-[11.5px] font-semibold text-white/55 transition enabled:hover:text-white disabled:opacity-30">
              Back
            </button>
            {step < steps.length - 1 ? (
              <button onClick={() => go(step + 1)} className="btn-primary px-3.5 py-2 text-[12.5px]">
                Next <Icon name="arrow-right" size={14} />
              </button>
            ) : (
              <button onClick={end} className="btn-primary px-3.5 py-2 text-[12.5px]">
                Finish <Icon name="check" size={14} />
              </button>
            )}
            <button onClick={end} title="Exit the walkthrough"
              className="rounded-lg px-2 py-2 text-[11.5px] font-semibold text-white/35 transition hover:text-white/70">
              Exit
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** The entry point, shown on the Co-pilot landing — the screen already promising
 *  "Start here". Renders nothing once the walkthrough is running. */
export function GuidedPathLauncher() {
  const step = useStore((s) => s.guideStep)
  const start = useStore((s) => s.startGuide)
  const steps = useGuideSteps()
  const { pack, tree } = useCompliance('actuals')
  if (step >= 0) return null

  const makers = (tree.children ?? []).filter((c) => c.rawUnits > 0)
  const marketFine = makers.reduce((a, c) => a + c.fine, 0)

  return (
    <button
      onClick={() => { start(); applyActions([steps[0].action]) }}
      className="group mt-3 flex w-full max-w-[560px] items-center gap-3 rounded-2xl border border-brand/25 bg-brand/[0.05] px-4 py-3 text-left transition hover:border-brand/50 hover:bg-brand/[0.08]">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand/15 text-brand"><Icon name="layers" size={17} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] font-bold text-ink-100">Walk me through {pack.name}</span>
        <span className="block text-[11.5px] text-ink-500">
          {steps.map((s) => s.label).join(' → ')} · {marketFine > 0 ? `${fmtMoney(marketFine, pack.currency)} at stake` : 'seven minutes'}
        </span>
      </span>
      <Icon name="arrow-right" size={15} className="shrink-0 text-brand opacity-0 transition group-hover:opacity-100" />
    </button>
  )
}
