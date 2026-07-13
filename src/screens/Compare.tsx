import { useMemo } from 'react'
import { useCompliance } from '../lib/useCompliance'
import { useStore, defaultScenario } from '../state/store'
import type { Scenario } from '../engine/types'
import { buildTree, fmtInt, fmtMoney, fmtNum } from '../engine/engine'
import { Section, StatusPill } from '../components/ui'
import Icon from '../components/Icon'

interface ColInput { id: string; label: string; live?: boolean; scenario: Scenario; overrides: Record<string, Partial<Scenario>> }

/**
 * Side-by-side scenario compare: named scenarios are first-class objects, every
 * column re-runs the real engine, and each carries a headline verdict plus its
 * delta against the live assumptions (the FP&A "branch and compare" pattern).
 */
export default function Compare() {
  const { pack, raw, country, scenario } = useCompliance()
  const overrides = useStore((s) => s.makerOverrides)
  const saved = useStore((s) => s.savedScenarios)
  const loadScenario = useStore((s) => s.loadScenario)
  const deleteScenario = useStore((s) => s.deleteScenario)
  const setScreen = useStore((s) => s.setScreen)
  const mine = useMemo(() => saved.filter((s) => s.country === country), [saved, country])

  const cols = useMemo(() => {
    const inputs: ColInput[] = [
      { id: 'live', label: 'Live now', live: true, scenario, overrides },
      ...mine.slice(0, 5).map((s) => ({
        id: s.id, label: s.label,
        scenario: { ...defaultScenario(country), ...s.scenario },
        overrides: s.overrides ?? {},
      })),
    ]
    return inputs.map((c) => {
      const tree = buildTree(raw, pack, c.scenario, c.overrides)
      const makers = (tree.children ?? []).filter((m) => m.rawUnits > 0)
      return {
        ...c, tree,
        fine: makers.reduce((a, m) => a + m.fine, 0),
        over: makers.filter((m) => m.status === 'fine').length,
        makerCount: makers.length,
      }
    })
  }, [raw, pack, scenario, overrides, mine, country])

  const base = cols[0]

  const delta = (v: number, b: number, money = false) => {
    const d = v - b
    if (Math.abs(d) < (money ? 1 : 0.05)) return <span className="text-[10px] text-ink-500">— same</span>
    const better = d < 0
    return (
      <span className={`num text-[10px] font-bold ${better ? 'text-safe' : 'text-danger'}`}>
        {d < 0 ? '▼' : '▲'} {money ? fmtMoney(Math.abs(d), pack.currency) : fmtNum(Math.abs(d), 1)}
      </span>
    )
  }

  if (mine.length === 0) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand/10 text-brand"><Icon name="layers" size={26} /></span>
        <h2 className="font-display mt-4 text-[18px] font-bold text-ink-100">Nothing to compare yet</h2>
        <p className="mt-2 text-sm text-ink-400">
          Save a scenario from the Assumptions rail (Snapshots &amp; saved → &ldquo;+ Save current&rdquo;) and it appears here as a
          column — every number re-run through the engine, with deltas against your live assumptions.
        </p>
        <button onClick={() => setScreen('plan')} className="btn-primary mx-auto mt-5"><Icon name="sliders" size={15} /> Build a scenario in Plan</button>
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-slidein">
      <Section title={`Scenario comparison · ${pack.name}`}
        right={<span className="text-[11px] text-ink-500">market level · Σ per-maker fines · deltas vs “Live now”</span>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-black/[0.08]">
                <th className="w-44 px-3 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-wide text-ink-500">Scenario</th>
                {cols.map((c) => (
                  <th key={c.id} className={`px-3 py-2.5 text-right align-bottom ${c.live ? 'rounded-t-lg bg-brand/[0.05]' : ''}`}>
                    <div className={`truncate text-[13px] font-bold ${c.live ? 'text-brand' : 'text-ink-100'}`}>{c.label}</div>
                    <div className="num text-[10px] font-medium text-ink-500">{c.scenario.year}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <Row label={`Fleet ${pack.metricUnit}`}>{cols.map((c) => (
                <td key={c.id} className={`num px-3 py-2.5 text-right ${c.live ? 'bg-brand/[0.05]' : ''}`}>
                  <div className="font-bold text-ink-100">{fmtNum(c.tree.avgMetric, 1)}</div>
                  <div className="text-[10px] text-ink-500">limit {fmtNum(c.tree.limit, 1)}</div>
                </td>
              ))}</Row>
              <Row label="Gap to the line">{cols.map((c) => (
                <td key={c.id} className={`num px-3 py-2.5 text-right ${c.live ? 'bg-brand/[0.05]' : ''}`}>
                  <div className={`font-bold ${c.tree.gap > 0 ? 'text-danger' : 'text-safe'}`}>{c.tree.gap > 0 ? '+' : ''}{fmtNum(c.tree.gap, 1)}</div>
                  {!c.live && delta(c.tree.gap, base.tree.gap)}
                </td>
              ))}</Row>
              <Row label="€-at-risk (Σ makers)">{cols.map((c) => (
                <td key={c.id} className={`num px-3 py-2.5 text-right ${c.live ? 'bg-brand/[0.05]' : ''}`}>
                  <div className={`font-bold ${c.fine > 0 ? 'text-danger' : 'text-safe'}`}>{fmtMoney(c.fine, pack.currency)}</div>
                  {!c.live && delta(c.fine, base.fine, true)}
                </td>
              ))}</Row>
              <Row label="Makers over the line">{cols.map((c) => (
                <td key={c.id} className={`num px-3 py-2.5 text-right ${c.live ? 'bg-brand/[0.05]' : ''}`}>
                  <span className={`font-semibold ${c.over > 0 ? 'text-warn' : 'text-safe'}`}>{c.over}</span>
                  <span className="text-[11px] text-ink-500"> / {c.makerCount}</span>
                </td>
              ))}</Row>
              <Row label="Zero-emission share">{cols.map((c) => (
                <td key={c.id} className={`num px-3 py-2.5 text-right font-semibold text-accent ${c.live ? 'bg-brand/[0.05]' : ''}`}>{Math.round(c.tree.zlevShare * 100)}%</td>
              ))}</Row>
              <Row label="Registrations">{cols.map((c) => (
                <td key={c.id} className={`num px-3 py-2.5 text-right text-ink-300 ${c.live ? 'bg-brand/[0.05]' : ''}`}>{fmtInt(c.tree.rawUnits)}</td>
              ))}</Row>
              <Row label="Verdict">{cols.map((c) => (
                <td key={c.id} className={`px-3 py-2.5 text-right ${c.live ? 'bg-brand/[0.05]' : ''}`}>
                  <span className="inline-block"><StatusPill status={c.tree.gap > 0 ? 'fine' : 'compliant'} /></span>
                </td>
              ))}</Row>
              <tr>
                <td className="px-3 py-2.5" />
                {cols.map((c) => (
                  <td key={c.id} className={`px-3 py-2.5 text-right ${c.live ? 'rounded-b-lg bg-brand/[0.05]' : ''}`}>
                    {!c.live && (
                      <span className="inline-flex items-center gap-1.5">
                        <button onClick={() => loadScenario(c.id)} className="btn-ghost px-2.5 py-1 text-[11px]"><Icon name="reset" size={11} className="rotate-180" /> Load</button>
                        <button onClick={() => deleteScenario(c.id)} title="Delete scenario" className="grid h-6 w-6 place-items-center rounded-lg text-ink-500 transition hover:bg-danger/10 hover:text-danger"><Icon name="close" size={12} /></button>
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        {mine.length > 5 && <p className="mt-3 text-[11px] text-ink-500">Showing the 5 most recent of {mine.length} saved scenarios.</p>}
      </Section>
    </div>
  )
}

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <tr className="border-b border-black/[0.05]">
    <td className="px-3 py-2.5 text-[12px] font-medium text-ink-400">{label}</td>
    {children}
  </tr>
)
