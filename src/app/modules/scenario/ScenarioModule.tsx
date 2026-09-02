/* ───────────────────────────────────────────────────────────────────────────
   SCENARIO — the agentic builder, with the gate visible.
   ---------------------------------------------------------------------------
   Two ways in, one output:

     · State a goal in plain language and let the Scenario architect search the
       lever space for you.
     · Move the levers yourself.

   Either way the result lands in the same place, and it lands VALIDATED. The
   verification panel on the right is not decoration: it runs the same bounds
   table (levers.ts) that the server gate runs, then re-derives the position
   from the engine. A scenario that fails here would fail on the server, so the
   user finds out before they spend a run — and a scenario that passes here is
   still re-checked server-side before anything can be published.

   Only levers this regime actually has are rendered. A control that cannot
   legally do anything is absent rather than disabled.
   ─────────────────────────────────────────────────────────────────────────── */
import React, { useMemo, useState } from 'react'
import {
  Badge, Button, Callout, Card, cx, Divider, EmptyState, Field, Input, Metric,
  Panel, Segmented, Slider, StatusDot, Switch, Table, Td, Th, Textarea, Tooltip, Tr, useToast,
} from '../../design/primitives'
import Icon from '../../design/icons'
import { ModulePage } from '../../shell/AppShell'
import { AgentLauncher } from '../../agents/ui/AgentConsole'
import { AgentPrompt } from '../../agents/ui/AgentPrompt'
import { getAgent } from '../../agents/registry'
import { useApp, useRole } from '../../state/appStore'
import { usePosition } from '../../state/usePosition'
import { baseScenario } from '../../state/appStore'
import { can } from '../../auth/rbac'
import { startRun } from '../../agents/client'
import { isRunning } from '../../agents/kernel'
import { LEVERS, leversFor, preflight } from './levers'
import { poolingAllowed } from '../../../engine/blocks'
import { ComplianceField, PowertrainMix, VariantBuilder } from './parts'
import { buildTree, fmtInt, fmtMoney, fmtNum } from '../../../engine/engine'
import { getFleet } from '../../../data/fleet'
import type { Scenario } from '../../../engine/types'

const OWNER_TONE: Record<string, string> = {
  Product: 'var(--dv-1)', Powertrain: 'var(--dv-3)', Commercial: 'var(--dv-2)', Regulatory: 'var(--dv-4)',
}

interface Saved { id: string; name: string; scenario: Scenario; at: string }

export default function ScenarioModule() {
  const { pack, raw, scenario, country, makers } = usePosition('working')
  const patch = useApp((s) => s.patchScenario)
  const reset = useApp((s) => s.resetScenario)
  const runs = useApp((s) => s.runs)
  const setConsole = useApp((s) => s.setConsole)
  const session = useApp((s) => s.session)
  const role = useRole()
  const toast = useToast()

  const [goal, setGoal] = useState('')
  const [saved, setSaved] = useState<Saved[]>([])
  type ScnTab = 'levers' | 'mix' | 'variants' | 'field' | 'compare'
  const storedTab = useApp((s) => s.moduleTab.scenario)
  const setStoredTab = useApp((s) => s.setModuleTab)
  const tab = (storedTab as ScnTab) ?? 'levers'
  const setTab = (t: ScnTab) => setStoredTab('scenario', t)

  const levers = useMemo(() => leversFor(pack, scenario.year), [pack, scenario.year])

  /** The two positions this screen exists to compare. Both computed here, from
   *  the same engine call the rest of the product uses. */
  const baseline = useMemo(() => buildTree(raw, pack, { ...baseScenario(country), year: scenario.year }), [raw, pack, country, scenario.year])
  const proposed = useMemo(() => buildTree(raw, pack, scenario), [raw, pack, scenario])

  const values = useMemo(() => Object.fromEntries(levers.map((l) => [l.key, (scenario as never as Record<string, unknown>)[l.key]])), [levers, scenario])
  const issues = useMemo(() => preflight(values, pack, scenario.year), [values, pack, scenario.year])

  const touched = levers.filter((l) => {
    const v = (scenario as never as Record<string, unknown>)[l.key]
    const b = (baseScenario(country) as never as Record<string, unknown>)[l.key]
    return v != null && v !== b
  })

  // Suggestions are generated from the live position, so they are questions
  // this workspace can actually answer today rather than placeholder copy.
  const byYear = Math.min(scenario.year + 3, pack.years[pack.years.length - 1])
  const worst = [...makers].sort((a, b) => b.gap - a.gap)[0]
  const suggestions = useMemo(() => {
    const out: { label: string; prompt: string }[] = []
    if (proposed.gap > 0) {
      out.push({
        label: 'Clear the line, cheapest way',
        prompt: `Get ${pack.name} under the line by ${byYear} at the lowest total cost. Tell me which levers you moved and what each one is worth.`,
      })
    }
    if (worst && worst.gap > 0) {
      out.push({
        label: `Fix ${worst.label.split(' ')[0]}`,
        prompt: `${worst.label} is ${fmtNum(worst.gap, 1)} ${pack.metricUnit} over its limit in ${scenario.year}. What is the least disruptive way to bring it inside the line?`,
      })
    }
    out.push({
      label: 'Cheapest path, no volume cut',
      prompt: `Find the cheapest route to compliance in ${pack.name} by ${byYear} without reducing volume. Treat the zero-emission share and the fleet mass as the levers of first resort.`,
    })
    if (pack.id === 'IN') {
      out.push({
        label: 'If the draft lands tighter',
        prompt: 'Assume the final CAFE III norms land 10% tighter than the draft. What would we have to do differently, and starting when?',
      })
    }
    if (poolingAllowed(pack, scenario.year)) {
      out.push({ label: 'Is pooling worth it?', prompt: `Compare clearing the line standalone against joining a pool in ${pack.name} in ${scenario.year}. Which is cheaper, and what does the pool cost us in flexibility?` })
    }
    return out.slice(0, 4)
  }, [pack, byYear, worst, proposed.gap, scenario.year])

  const architect = runs.find((r) => r.agentId === 'scenario.architect')
  const busy = !!architect && isRunning(architect.status)
  const allowed = can(role, 'scenario.view') && can(role, 'agent.run')

  const ask = () => {
    if (!goal.trim() || !allowed) return
    startRun({
      agentId: 'scenario.architect', country, prompt: goal.trim(),
      context: { year: scenario.year, currentGap: proposed.gap, currentExposure: proposed.fine, leversAvailable: levers.map((l) => l.key) },
    }, session?.name ?? 'you')
    setConsole(true)
  }

  const save = () => {
    const name = touched.length ? touched.map((l) => l.label).join(' + ') : 'Baseline'
    setSaved((s) => [{ id: `sc${Date.now()}`, name, scenario: { ...scenario }, at: new Date().toISOString() }, ...s].slice(0, 8))
    toast({ tone: 'pos', title: 'Scenario saved', body: 'Compare it against the others in the Compare tab.' })
  }

  const gapDelta = proposed.gap - baseline.gap
  const fineDelta = proposed.fine - baseline.fine

  return (
    <ModulePage wide
      title="Scenario"
      sub={`What you could do about the ${pack.name} position, and what the engine says each choice is worth.`}
      actions={
        <>
          <Button size="sm" variant="ghost" onClick={reset} icon={<Icon name="refresh" size={13} />}>Reset levers</Button>
          <Button size="sm" variant="secondary" onClick={save} icon={<Icon name="plus" size={13} />}>Save scenario</Button>
          <AgentLauncher moduleId="scenario" hint="Search the lever space for the cheapest way to your goal" />
        </>
      }>

      {/* ── the goal bar ── */}
      <div className="mb-4">
        <AgentPrompt
          agent={getAgent('scenario.architect')}
          value={goal} onChange={setGoal} onRun={ask}
          busy={busy} disabled={!allowed}
          hint={`e.g. “Get ${pack.name} under the line by ${byYear} at the lowest cost, without going past 40% zero-emission share.”`}
          suggestions={suggestions}
          footnote="It restates your goal as constraints, searches the levers this regime allows, and hands the result to the engine before proposing it." />
      </div>

      <Segmented className="mb-4" value={tab} onChange={setTab}
        options={[
          { id: 'levers', label: 'Levers', icon: <Icon name="scenario" size={13} />, hint: 'The regime’s own controls' },
          { id: 'mix', label: 'Powertrain mix', icon: <Icon name="grid" size={13} />, hint: 'Reweight the fleet between powertrains' },
          { id: 'variants', label: `Variants${(scenario.extraVariants?.length ?? 0) ? ` · ${scenario.extraVariants!.length}` : ''}`, icon: <Icon name="plus" size={13} />, hint: 'Add a car that does not exist yet' },
          { id: 'field', label: 'Trade-off', icon: <Icon name="target" size={13} />, hint: 'Drag through the compliance field' },
          { id: 'compare', label: `Compare · ${saved.length}`, icon: <Icon name="layers" size={13} /> },
        ]} />

      {tab !== 'compare' ? (
        <div className="grid gap-4 xl:grid-cols-[1fr_400px]">
          {/* ── the workbench — one pane, four editors ── */}
          {tab === 'mix' && (
            <Panel title="Powertrain mix" icon={<Icon name="grid" size={14} />}
              sub="Reweight the fleet between the powertrains it actually has. Shares always sum to 100%, because a mix that does not is not a fleet.">
              <PowertrainMix />
            </Panel>
          )}

          {tab === 'variants' && (
            <Panel title="Hypothetical variants" icon={<Icon name="plus" size={14} />}
              sub="Cars that are not in the fleet yet. Each one is pinned, so fleet-level levers cannot quietly rescale a volume you typed.">
              <VariantBuilder />
            </Panel>
          )}

          {tab === 'field' && (
            <Panel title="The compliance field" icon={<Icon name="target" size={14} />}
              sub="Zero-emission share against average mass, with the frontier where this fleet crosses its line. Drag the puck; everything re-derives live.">
              <ComplianceField />
            </Panel>
          )}

          {tab === 'levers' && (
          <Panel title="Levers" icon={<Icon name="scenario" size={14} />}
            sub={`${levers.length} levers exist in ${pack.name}. Levers this regime does not have are not shown at all.`}>
            <div className="space-y-6">
              {(['Product', 'Powertrain', 'Commercial', 'Regulatory'] as const).map((owner) => {
                const group = levers.filter((l) => l.owner === owner)
                if (!group.length) return null
                return (
                  <section key={owner}>
                    <div className="mb-3 flex items-center gap-2">
                      <span className="h-[7px] w-[7px] rounded-[2px]" style={{ background: OWNER_TONE[owner] }} />
                      <span className="t-label">{owner}</span>
                      <span className="h-px flex-1 bg-[var(--line-soft)]" />
                    </div>
                    <div className="space-y-4">
                      {group.map((l) => {
                        const v = (scenario as never as Record<string, unknown>)[l.key]
                        const bad = issues.find((i) => i.key === l.key)
                        if (l.bool) {
                          return (
                            <Switch key={l.key} checked={v === true} label={l.label} sub={l.blurb}
                              onChange={(b) => patch({ [l.key]: b } as never)} />
                          )
                        }
                        // Unset means neutral: zero where the range spans it,
                        // the as-sold share for EV mix, otherwise the minimum.
                        const neutral = l.key === 'evSharePct'
                          ? Math.round(baseline.zlevShare * 100)
                          : (l.min ?? 0) <= 0 && (l.max ?? 0) >= 0 ? 0 : (l.min ?? 0)
                        const num = typeof v === 'number' ? v : neutral
                        return (
                          <div key={l.key}>
                            <Slider
                              label={
                                <span className="flex items-center gap-1.5">
                                  {l.label}
                                  <Tooltip content={l.blurb}>
                                    <span className="grid h-[13px] w-[13px] cursor-help place-items-center rounded-full border border-[var(--line-strong)] text-[8px] font-bold text-[var(--ink-4)]">i</span>
                                  </Tooltip>
                                  {l.key === 'evSharePct' && scenario.evSharePct == null && <Badge tone="neutral">as sold</Badge>}
                                </span>
                              }
                              value={num} min={l.min ?? 0} max={l.max ?? 100} step={l.step ?? 1}
                              format={(x) => `${x}${l.unit ?? ''}`}
                              onChange={(x) => patch({ [l.key]: x } as never)} />
                            {bad && <p className="mt-1 text-[11px] text-[var(--neg-ink)]">{bad.message}</p>}
                          </div>
                        )
                      })}
                    </div>
                  </section>
                )
              })}
            </div>
          </Panel>
          )}

          {/* ── verification ── */}
          <div className="space-y-4">
            <Panel title="What the engine says" icon={<Icon name="shield" size={14} />}
              sub="Re-derived from your levers on every change — the same calculation the filing uses.">
              <div className="space-y-3">
                <EffectRow label={pack.metricLabel} before={baseline.avgMetric} after={proposed.avgMetric} unit={pack.metricUnit} better="down" />
                <EffectRow label="Limit" before={baseline.limit} after={proposed.limit} unit={pack.metricUnit} />
                <EffectRow label="Gap to limit" before={baseline.gap} after={proposed.gap} unit={pack.metricUnit} better="down" />
                <EffectRow label="Exposure" before={baseline.fine} after={proposed.fine} currency={pack.currency} better="down" />
                <EffectRow label="Registrations" before={baseline.rawUnits} after={proposed.rawUnits} integer />
              </div>

              <Divider />

              <div className={cx('flex items-start gap-2.5 rounded-[var(--r-md)] p-3',
                proposed.gap <= 0 ? 'bg-[var(--pos-tint)]' : 'bg-[var(--neg-tint)]')}>
                <Icon name={proposed.gap <= 0 ? 'check' : 'alert'} size={15}
                  className={cx('mt-px shrink-0', proposed.gap <= 0 ? 'text-[var(--pos)]' : 'text-[var(--neg)]')} />
                <div>
                  <div className={cx('text-[12.5px] font-semibold', proposed.gap <= 0 ? 'text-[var(--pos-ink)]' : 'text-[var(--neg-ink)]')}>
                    {proposed.gap <= 0 ? 'This scenario clears the line' : `Still ${fmtNum(proposed.gap, 1)} ${pack.metricUnit} over`}
                  </div>
                  <p className="mt-0.5 text-[11.5px] leading-relaxed text-[var(--ink-3)]">
                    {fineDelta < 0
                      ? `Exposure falls by ${fmtMoney(Math.abs(fineDelta), pack.currency)} against the as-sold book of record.`
                      : fineDelta > 0
                        ? `Exposure rises by ${fmtMoney(fineDelta, pack.currency)} against the as-sold book of record.`
                        : 'No change against the as-sold book of record.'}
                  </p>
                </div>
              </div>
            </Panel>

            <Panel title="Pre-flight" icon={<Icon name="check" size={14} />}
              sub="The same bounds the server gate applies. Failing here means the server would refuse it too.">
              <ul className="space-y-2">
                <Check ok={issues.length === 0}
                  label="Every lever within its permitted bounds"
                  detail={issues.length ? issues.map((i) => i.message).join(' ') : `${levers.length} levers checked against the shared bounds table.`} />
                <Check ok={touched.length > 0}
                  warn={touched.length === 0}
                  label="Something has actually changed"
                  detail={touched.length ? `${touched.length} lever${touched.length === 1 ? '' : 's'} moved: ${touched.map((l) => l.label).join(', ')}.` : 'No levers moved — this scenario is identical to the book of record.'} />
                <Check ok={!scenario.poolingEnabled || poolingAllowed(pack, scenario.year)}
                  label={poolingAllowed(pack, scenario.year)
                    ? `Pooling is available in ${pack.name} in ${scenario.year}`
                    : `Pooling does not exist in ${pack.name} in ${scenario.year}`}
                  detail={poolingAllowed(pack, scenario.year)
                    ? pack.pooling.note
                    : pack.pooling.fromYear != null
                      ? `It begins in ${pack.pooling.fromYear}. Until then every manufacturer is assessed standalone.`
                      : `Not enabled — which is the only valid setting here. ${pack.pooling.note}`} />
                <Check ok={proposed.rawUnits > 0}
                  label="The scenario has volume to assess"
                  detail={`${fmtInt(proposed.rawUnits)} registrations in ${scenario.year}.`} />
              </ul>
            </Panel>

            <Callout tone="neutral" icon={<Icon name="lock" size={14} />} title="Publishing is a separate act">
              Moving levers here changes your working assumptions and nothing else. Making this the planning basis requires the
              <b> scenario.publish</b> permission and is recorded with your name against it.
            </Callout>
          </div>
        </div>
      ) : (
        <Panel flush title="Saved scenarios" icon={<Icon name="layers" size={14} />}
          sub="Every saved scenario re-derived side by side against the same book of record.">
          {saved.length ? (
            <Table>
              <thead>
                <tr>
                  <Th>Scenario</Th>
                  <Th align="right">Fleet</Th>
                  <Th align="right">Limit</Th>
                  <Th align="right">Gap</Th>
                  <Th align="right">Exposure</Th>
                  <Th align="right">vs book of record</Th>
                  <Th align="center">Status</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                <Tr>
                  <Td strong>Book of record</Td>
                  <Td align="right" strong>{fmtNum(baseline.avgMetric, 1)}</Td>
                  <Td align="right">{fmtNum(baseline.limit, 1)}</Td>
                  <Td align="right">{fmtNum(baseline.gap, 1)}</Td>
                  <Td align="right">{fmtMoney(baseline.fine, pack.currency)}</Td>
                  <Td align="right" className="!text-[var(--ink-5)]">—</Td>
                  <Td align="center"><Badge tone={baseline.gap > 0 ? 'neg' : 'pos'} dot>{baseline.gap > 0 ? 'Over' : 'Under'}</Badge></Td>
                  <Td />
                </Tr>
                {saved.map((s) => {
                  const t = buildTree(getFleet(country), pack, s.scenario)
                  const d = t.fine - baseline.fine
                  return (
                    <Tr key={s.id}>
                      <Td strong>
                        <span className="block truncate">{s.name}</span>
                        <span className="block text-[11px] font-normal text-[var(--ink-4)]">{new Date(s.at).toLocaleString()}</span>
                      </Td>
                      <Td align="right" strong>{fmtNum(t.avgMetric, 1)}</Td>
                      <Td align="right">{fmtNum(t.limit, 1)}</Td>
                      <Td align="right">
                        <span className={cx('font-semibold', t.gap > 0 ? 'text-[var(--neg-ink)]' : 'text-[var(--pos-ink)]')}>
                          {t.gap > 0 ? '+' : ''}{fmtNum(t.gap, 1)}
                        </span>
                      </Td>
                      <Td align="right">{fmtMoney(t.fine, pack.currency)}</Td>
                      <Td align="right">
                        <span className={cx('font-semibold', d < 0 ? 'text-[var(--pos-ink)]' : d > 0 ? 'text-[var(--neg-ink)]' : 'text-[var(--ink-5)]')}>
                          {d === 0 ? '—' : `${d < 0 ? '−' : '+'}${fmtMoney(Math.abs(d), pack.currency)}`}
                        </span>
                      </Td>
                      <Td align="center"><Badge tone={t.gap > 0 ? 'neg' : 'pos'} dot>{t.gap > 0 ? 'Over' : 'Under'}</Badge></Td>
                      <Td align="right">
                        <Button size="xs" variant="ghost" onClick={() => { patch(s.scenario); setTab('levers') }}>Load</Button>
                      </Td>
                    </Tr>
                  )
                })}
              </tbody>
            </Table>
          ) : (
            <div className="p-4">
              <EmptyState art="data" icon={<Icon name="layers" size={20} />} title="Nothing saved yet"
                body="Build a scenario, then save it. Saved scenarios are re-derived every time this table renders, so a data refresh can never leave a stale comparison behind."
                action={<Button variant="secondary" onClick={() => setTab('levers')}>Back to the workbench</Button>} />
            </div>
          )}
        </Panel>
      )}
    </ModulePage>
  )
}

/* ── small parts ──────────────────────────────────────────────────────────── */

function EffectRow({ label, before, after, unit, currency, better, integer }: {
  label: string; before: number; after: number; unit?: string; currency?: string
  better?: 'up' | 'down'; integer?: boolean
}) {
  const d = after - before
  const good = better === 'down' ? d < 0 : better === 'up' ? d > 0 : null
  const f = (n: number) => currency ? fmtMoney(n, currency) : integer ? fmtInt(n) : fmtNum(n, 1)
  return (
    <div className="flex items-baseline gap-2">
      <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--ink-3)]">{label}</span>
      <span className="text-[12px] tabular-nums text-[var(--ink-4)]">{f(before)}</span>
      <Icon name="arrowRight" size={11} className="shrink-0 text-[var(--ink-5)]" />
      <span className="text-[13px] font-semibold tabular-nums text-[var(--ink-1)]">{f(after)}{unit && <span className="ml-0.5 text-[10.5px] font-normal text-[var(--ink-4)]">{unit}</span>}</span>
      <span className={cx('w-[86px] shrink-0 text-right text-[11.5px] font-semibold tabular-nums',
        good === true ? 'text-[var(--pos-ink)]' : good === false ? 'text-[var(--neg-ink)]' : 'text-[var(--ink-4)]')}>
        {Math.abs(d) < 1e-9 ? '—' : `${d > 0 ? '+' : '−'}${f(Math.abs(d))}`}
      </span>
    </div>
  )
}

function Check({ ok, warn, label, detail }: { ok: boolean; warn?: boolean; label: string; detail: string }) {
  return (
    <li className="flex items-start gap-2.5">
      <StatusDot tone={ok ? 'pos' : warn ? 'warn' : 'neg'} size={7} />
      <div className="min-w-0">
        <div className="text-[12px] font-medium text-[var(--ink-1)]">{label}</div>
        <div className="mt-0.5 text-[11px] leading-relaxed text-[var(--ink-4)]">{detail}</div>
      </div>
    </li>
  )
}
