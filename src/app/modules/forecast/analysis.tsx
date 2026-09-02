/* ───────────────────────────────────────────────────────────────────────────
   Forecast — the analytical depth.
   ---------------------------------------------------------------------------
   A market-level line is table stakes; the syndicated forecast houses have had
   one for thirty years. What they cannot give you is a forecast that is
   COMPLIANCE-NATIVE and INSPECTABLE: your own fleet, run through the actual
   rule pack, with every assumption named and every figure re-derivable.

   So this file adds the four readings that make the difference:

     Manufacturers   — the whole competitive set, ranked by exposure, with each
                       maker's own breach year. Not "the market decarbonises";
                       "you breach in 2029 and two of your four closest peers
                       do not".
     Mix & technology — the powertrain trajectory the forecast implies, and the
                       zero-emission share you would need each year to clear the
                       line. The second number is the one a product plan is
                       actually built from.
     Sensitivity     — which assumption moves the answer most, so the argument
                       happens over the assumption that matters.
     Peer benchmark  — where you sit in the distribution, not just in absolute
                       terms.
   ─────────────────────────────────────────────────────────────────────────── */
import React, { useMemo, useState } from 'react'
import {
  Badge, Button, Callout, cx, EmptyState, Metric, MetricRow, Panel, Progress,
  Segmented, Select, StatusDot, Table, Td, Th, Tooltip, Tr,
} from '../../design/primitives'
import Icon from '../../design/icons'
import { DV, LineChart, Sparkline, StackedArea, Tornado } from '../../design/charts'
import { usePosition } from '../../state/usePosition'
import { useApp, useDriverBook } from '../../state/appStore'
import { buildTree, fmtInt, fmtMoney, fmtNum } from '../../../engine/engine'
import {
  DRIVER_META, breakEvenAdoption, outlookRun,
  type DriverKey, type DriverSet,
} from '../../../engine/outlook'
import type { RulePack, Vehicle } from '../../../engine/types'

/* ═══════════════════════════════════════════════════════════════════════════
   Manufacturers
   ═══════════════════════════════════════════════════════════════════════════ */

export function ManufacturerOutlook({ drivers, years }: { drivers: DriverSet; years: number[] }) {
  const { pack, raw, scenario, country } = usePosition('working')
  const setTarget = useApp((s) => s.setForecastTarget)
  const setModuleTab = useApp((s) => s.setModuleTab)
  const [focus, setFocus] = useState('')
  const [sort, setSort] = useState<'exposure' | 'breach' | 'volume'>('exposure')

  const run = useMemo(() => outlookRun({ raw, pack, drivers, vintageYear: scenario.year }), [raw, pack, drivers, scenario.year])

  const makers = useMemo(() => {
    const acc: Record<string, { metric: number[]; gap: number[]; fine: number[]; units: number[] }> = {}
    years.forEach((y, i) => {
      const t = buildTree(run.fleetForYear(y), pack, run.scenarioFor(y))
      for (const c of t.children ?? []) {
        if (c.rawUnits <= 0) continue
        const a = (acc[c.label] ??= { metric: [], gap: [], fine: [], units: [] })
        a.metric[i] = c.avgMetric; a.gap[i] = c.gap; a.fine[i] = c.fine; a.units[i] = c.rawUnits
      }
    })
    const rows = Object.entries(acc).map(([name, a]) => ({
      name,
      metric: a.metric, gap: a.gap,
      cum: a.fine.reduce((x, y) => x + (y || 0), 0),
      breach: years.find((_, i) => (a.gap[i] ?? -1) > 0) ?? null,
      units: a.units[0] ?? 0,
      endGap: a.gap[a.gap.length - 1] ?? 0,
    }))
    const total = rows.reduce((x, r) => x + r.cum, 0) || 1
    return rows.map((r) => ({ ...r, shareOfExposure: (r.cum / total) * 100 }))
  }, [run, pack, years])

  const sorted = useMemo(() => [...makers].sort((a, b) =>
    sort === 'volume' ? b.units - a.units
      : sort === 'breach' ? ((a.breach ?? 9999) - (b.breach ?? 9999)) || b.cum - a.cum
      : b.cum - a.cum), [makers, sort])

  const clean = makers.filter((m) => !m.breach).length
  const worstYear = years.find((y, i) => makers.some((m) => (m.gap[i] ?? -1) > 0)) ?? null

  if (!makers.length) {
    return <EmptyState art="chart" icon={<Icon name="users" size={20} />} title="No manufacturers to project"
      body="The loaded dataset has no volume in the base year for this market." />
  }

  return (
    <>
      <MetricRow className="mb-4">
        <Metric size="sm" label="Compliance entities" value={makers.length} sub={`projected across ${years.length} years`} />
        <Metric size="sm" label="Clear the whole horizon" value={clean} tone={clean ? 'pos' : undefined}
          sub={`${makers.length - clean} breach at some point`} />
        <Metric size="sm" label="First breach in the market" value={worstYear ?? 'none'}
          tone={worstYear ? 'neg' : 'pos'} sub={worstYear ? 'the year someone first crosses' : 'nobody crosses'} />
        <Metric size="sm" label="Concentration" value={`${sorted.slice(0, 3).reduce((a, m) => a + m.shareOfExposure, 0).toFixed(0)}%`}
          sub="of horizon exposure sits with the top 3" />
      </MetricRow>

      <Panel flush title="Every manufacturer, projected"
        sub="Each maker run through its own limit — not a share of a market average. Pick one to scope the whole module to it."
        icon={<Icon name="users" size={14} />}
        actions={<Segmented size="sm" value={sort} onChange={setSort}
          options={[{ id: 'exposure', label: 'Exposure' }, { id: 'breach', label: 'Breach year' }, { id: 'volume', label: 'Volume' }]} />}>
        <div className="max-h-[560px] overflow-auto">
          <Table>
            <thead>
              <tr>
                <Th>#</Th>
                <Th>Manufacturer</Th>
                <Th align="center">Trajectory</Th>
                <Th align="right">{years[0]} gap</Th>
                <Th align="right">{years[years.length - 1]} gap</Th>
                <Th align="right">First breach</Th>
                <Th align="right">Horizon exposure</Th>
                <Th align="right">Share</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {sorted.map((m, i) => (
                <Tr key={m.name} interactive selected={focus === m.name} onClick={() => setFocus(focus === m.name ? '' : m.name)}>
                  <Td className="!text-[var(--ink-5)]">{i + 1}</Td>
                  <Td strong className="max-w-[230px]">
                    <span className="flex items-center gap-2">
                      <StatusDot size={6} tone={m.breach ? 'neg' : 'pos'} />
                      <span className="truncate">{m.name}</span>
                    </span>
                  </Td>
                  <Td align="center">
                    <Tooltip content={years.map((y, n) => `${y}: ${fmtNum(m.metric[n] ?? 0, 1)}`).join(' · ')}>
                      <span><Sparkline points={m.metric.filter((v) => v != null)} w={72} tone={m.breach ? 'var(--neg)' : 'var(--pos)'} /></span>
                    </Tooltip>
                  </Td>
                  <Td align="right">
                    <span className={(m.gap[0] ?? 0) > 0 ? 'font-semibold text-[var(--neg-ink)]' : 'text-[var(--pos-ink)]'}>
                      {(m.gap[0] ?? 0) > 0 ? '+' : ''}{fmtNum(m.gap[0] ?? 0, 1)}
                    </span>
                  </Td>
                  <Td align="right">
                    <span className={m.endGap > 0 ? 'font-semibold text-[var(--neg-ink)]' : 'text-[var(--pos-ink)]'}>
                      {m.endGap > 0 ? '+' : ''}{fmtNum(m.endGap, 1)}
                    </span>
                  </Td>
                  <Td align="right">{m.breach ? <Badge tone="neg">{m.breach}</Badge> : <Badge tone="pos">clear</Badge>}</Td>
                  <Td align="right" strong>{m.cum > 0 ? fmtMoney(m.cum, pack.currency) : <span className="font-normal text-[var(--ink-5)]">—</span>}</Td>
                  <Td align="right">
                    <span className="inline-flex w-[72px] items-center gap-1.5">
                      <span className="flex-1"><Progress value={m.shareOfExposure} height={4} tone={m.shareOfExposure > 20 ? 'neg' : 'neutral'} /></span>
                      <span className="w-[30px] text-right text-[11px] tabular-nums text-[var(--ink-4)]">{m.shareOfExposure.toFixed(0)}%</span>
                    </span>
                  </Td>
                  <Td align="right">
                    <Tooltip content={`Scope the whole module to ${m.name} — its own board, distribution, mix and sensitivity`}>
                      <Button size="xs" variant="ghost" iconRight={<Icon name="arrowRight" size={11} />}
                        onClick={(e) => { e.stopPropagation(); setTarget(country, m.name); setModuleTab('forecast', 'outlook') }}>
                        Forecast
                      </Button>
                    </Tooltip>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      </Panel>

      {focus && (() => {
        const m = makers.find((x) => x.name === focus)!
        return (
          <Panel className="mt-4 anim-in" title={focus} sub="This manufacturer against the market it competes in."
            icon={<Icon name="user" size={14} />}
            actions={<Button size="xs" variant="ghost" onClick={() => setFocus('')}>Close</Button>}>
            <LineChart
              x={years} unit={pack.metricUnit} height={230}
              series={[
                { name: focus, points: m.metric.map((v) => v ?? null), color: DV[0], area: true },
                { name: 'Market average', points: years.map((_, i) => {
                  const vals = makers.map((x) => x.metric[i]).filter((v): v is number => v != null)
                  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
                }), color: DV[2], dashed: true },
              ]} />
          </Panel>
        )
      })()}
    </>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Mix & technology
   ═══════════════════════════════════════════════════════════════════════════ */

/** Powertrain families, collapsed to the five a planner argues about. The raw
 *  data carries a dozen spellings of the same thing across five markets. */
function family(pt: string): string {
  if (/BEV|Battery|^EV$|Electric/i.test(pt)) return 'Battery electric'
  if (/FCEV|Fuel ?cell|Hydrogen/i.test(pt)) return 'Fuel cell'
  if (/PHEV|Plug/i.test(pt)) return 'Plug-in hybrid'
  if (/MHEV|Mild/i.test(pt)) return 'Mild hybrid'
  if (/HEV|Hybrid|Strong/i.test(pt)) return 'Full hybrid'
  return 'Combustion'
}
const FAMILY_ORDER = ['Battery electric', 'Fuel cell', 'Plug-in hybrid', 'Full hybrid', 'Mild hybrid', 'Combustion']
const FAMILY_TONE: Record<string, string> = {
  'Battery electric': 'var(--dv-3)', 'Fuel cell': 'var(--dv-5)', 'Plug-in hybrid': 'var(--dv-1)',
  'Full hybrid': 'var(--dv-4)', 'Mild hybrid': 'var(--dv-2)', Combustion: 'var(--dv-other)',
}

export function MixAndTechnology({ drivers, years, target }: { drivers: DriverSet; years: number[]; target?: string | null }) {
  const { pack, raw, scenario } = usePosition('working')
  const rows = useMemo(() => (target ? raw.filter((v) => v.parent === target) : raw), [raw, target])
  const run = useMemo(() => outlookRun({ raw: rows, pack, drivers, vintageYear: scenario.year }), [rows, pack, drivers, scenario.year])

  const mix = useMemo(() => {
    const present = new Set<string>()
    const byYear = years.map((y) => {
      const rows = run.fleetForYear(y)
      const sc = run.scenarioFor(y)
      // The outlook's ZE share is applied as a scenario lever rather than being
      // baked into the rows, so it has to be layered on here or the trajectory
      // would show the base-year mix flat across the horizon.
      const zeTarget = sc.evSharePct ?? 0
      const total = rows.reduce((a, v) => a + v.sales, 0) || 1
      const acc: Record<string, number> = {}
      for (const v of rows) {
        const f = family(v.powertrain)
        acc[f] = (acc[f] ?? 0) + v.sales / total * 100
        present.add(f)
      }
      const ze = (acc['Battery electric'] ?? 0) + (acc['Fuel cell'] ?? 0)
      if (zeTarget > ze) {
        // Reallocate proportionally out of the non-zero-emission families.
        const need = zeTarget - ze
        const pool = Object.entries(acc).filter(([k]) => k !== 'Battery electric' && k !== 'Fuel cell')
        const poolSum = pool.reduce((a, [, n]) => a + n, 0) || 1
        for (const [k, n] of pool) acc[k] = n - (n / poolSum) * need
        acc['Battery electric'] = (acc['Battery electric'] ?? 0) + need
        present.add('Battery electric')
      }
      return acc
    })
    const fams = FAMILY_ORDER.filter((f) => present.has(f))
    return { fams, byYear }
  }, [run, years])

  // The number a product plan is actually built from: the zero-emission share
  // that would put this fleet exactly on its line, each year.
  const breakEven = useMemo(
    () => years.map((y) => breakEvenAdoption({ raw: rows, pack, drivers, vintageYear: scenario.year }, y)),
    [years, rows, pack, drivers, scenario.year],
  )
  const planned = years.map((y) => run.shareFor(y))

  const firstShortfall = years.findIndex((_, i) => breakEven[i] != null && planned[i] < (breakEven[i] as number))

  return (
    <div className="space-y-4">
      <Panel title="Powertrain mix trajectory"
        sub={`What the driver set implies for the shape of ${target ?? 'the market'} — the composition behind the single line on the Outlook tab.`}
        icon={<Icon name="layers" size={14} />}>
        <StackedArea
          x={years} height={260} animateKey={years.join()}
          series={mix.fams.map((f) => ({
            name: f, color: FAMILY_TONE[f],
            points: mix.byYear.map((y) => Math.max(0, y[f] ?? 0)),
          }))} />
      </Panel>

      <Panel title="The share you need, against the share you plan"
        sub="Break-even is the zero-emission share that would put this fleet exactly on its limit that year. Where the planned line sits below it, the plan does not clear."
        icon={<Icon name="target" size={14} />}>
        <LineChart
          x={years} unit="%" height={250} yZero
          format={(v) => `${v.toFixed(0)}%`}
          series={[
            { name: 'Planned (S-curve)', points: planned, color: DV[0], area: true },
            { name: 'Break-even needed', points: breakEven.map((v) => (v == null ? null : v)), color: DV[5], dashed: true },
          ]} />

        <div className="mt-3 overflow-hidden rounded-[var(--r-sm)] border border-[var(--line)]">
          <Table>
            <thead><tr><Th>Year</Th><Th align="right">Planned</Th><Th align="right">Break-even</Th><Th align="right">Shortfall</Th><Th>Verdict</Th></tr></thead>
            <tbody>
              {years.map((y, i) => {
                const be = breakEven[i]
                const short = be == null ? null : planned[i] - be
                return (
                  <Tr key={y}>
                    <Td strong>{y}</Td>
                    <Td align="right">{planned[i].toFixed(1)}%</Td>
                    <Td align="right">{be == null ? <span className="text-[var(--ink-5)]">n/a</span> : `${be.toFixed(1)}%`}</Td>
                    <Td align="right">
                      {short == null ? <span className="text-[var(--ink-5)]">—</span>
                        : <span className={short >= 0 ? 'font-semibold text-[var(--pos-ink)]' : 'font-semibold text-[var(--neg-ink)]'}>
                            {short >= 0 ? '+' : '−'}{Math.abs(short).toFixed(1)}pp
                          </span>}
                    </Td>
                    <Td className="!text-[var(--ink-3)]">
                      {be == null ? 'No zero-emission share clears this year on its own'
                        : short! >= 0 ? 'The planned S-curve clears the line'
                        : `Needs ${Math.abs(short!).toFixed(1)}pp more zero-emission share`}
                    </Td>
                  </Tr>
                )
              })}
            </tbody>
          </Table>
        </div>

        {firstShortfall >= 0 && (
          <Callout className="mt-3" tone="warn" icon={<Icon name="alert" size={14} />}
            title={`The plan first falls short in ${years[firstShortfall]}`}>
            The planned adoption curve is {Math.abs(planned[firstShortfall] - (breakEven[firstShortfall] as number)).toFixed(1)} percentage points
            below what that year needs. Every other lever — mass, technology, pooling where it exists — has to close that gap instead.
          </Callout>
        )}
      </Panel>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Sensitivity
   ═══════════════════════════════════════════════════════════════════════════ */

/** Plausible stress per driver — a tornado built on a driver's full slider
 *  range would be dominated by values nobody would defend. These are the ranges
 *  a planning committee would actually argue over. */
const STRESS: Record<DriverKey, number> = {
  marketGrowth: 2, evShareHorizon: 15, iceCo2Improve: 0.75, massDrift: 5,
}

export function Sensitivity({ drivers, years, target }: { drivers: DriverSet; years: number[]; target?: string | null }) {
  const { pack, raw, scenario } = usePosition('working')
  const rows = useMemo(() => (target ? raw.filter((v) => v.parent === target) : raw), [raw, target])
  const [armed, setArmed] = useState(false)
  const [toYear, setToYear] = useState<number>(years[Math.min(2, years.length - 1)])

  const exposureFor = (d: DriverSet) => {
    const run = outlookRun({ raw: rows, pack, drivers: d, vintageYear: scenario.year })
    return years.filter((y) => y <= toYear).reduce((a, y) => {
      const t = buildTree(run.fleetForYear(y), pack, run.scenarioFor(y))
      return a + (t.children ?? []).reduce((x, c) => x + c.fine, 0)
    }, 0)
  }

  const result = useMemo(() => {
    if (!armed) return null
    const baseline = exposureFor(drivers)
    const rows = DRIVER_META.map((m) => {
      const s = STRESS[m.key]
      const lowD: DriverSet = { ...drivers, [m.key]: Math.max(m.min, drivers[m.key] - s) }
      const highD: DriverSet = { ...drivers, [m.key]: Math.min(m.max, drivers[m.key] + s) }
      return {
        label: m.label,
        low: exposureFor(lowD), high: exposureFor(highD),
        lowNote: `${(drivers[m.key] - s).toFixed(2)}${m.unit}`,
        highNote: `${(drivers[m.key] + s).toFixed(2)}${m.unit}`,
      }
    })
    return { baseline, rows }
  }, [armed, drivers, toYear, rows, pack, scenario.year]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Panel title="Which assumption moves the answer"
      sub={`Cumulative exposure${target ? ` for ${target}` : ''} to ${toYear}, with each driver stressed on its own and everything else held at the house view.`}
      icon={<Icon name="activity" size={14} />}
      actions={
        <Select className="!w-[112px] !h-[28px] !text-[12px]" value={String(toYear)} onChange={(e) => { setToYear(Number(e.target.value)); setArmed(false) }}>
          {years.map((y) => <option key={y} value={y}>to {y}</option>)}
        </Select>
      }>
      {result ? (
        <>
          <Tornado
            rows={result.rows} baseline={result.baseline}
            unit={pack.currency} animateKey={toYear}
            format={(v) => fmtMoney(v, pack.currency)} />
          <Callout className="mt-4" tone="info" icon={<Icon name="spark" size={14} />} title="Where to spend the argument">
            <b>{[...result.rows].sort((a, b) => Math.abs(b.high - b.low) - Math.abs(a.high - a.low))[0].label}</b> moves cumulative exposure
            more than any other assumption over this horizon. Nail that one down before debating the rest — and it is the assumption the
            Horizon analyst should be sent to find evidence for first.
          </Callout>
        </>
      ) : (
        <div className="rounded-[var(--r-md)] border border-dashed border-[var(--line-strong)] bg-[var(--surface-2)] px-4 py-8 text-center">
          <Icon name="activity" size={22} className="mx-auto mb-2 text-[var(--ink-4)]" />
          <div className="text-[12.5px] font-semibold text-[var(--ink-1)]">Stress every driver</div>
          <p className="mx-auto mt-1 max-w-[52ch] text-[11.5px] leading-relaxed text-[var(--ink-3)]">
            Nine full projections — the house view plus each of the four drivers pushed high and low over a range a planning committee
            would actually argue about.
          </p>
          <Button className="mt-3" size="sm" variant="secondary" icon={<Icon name="play" size={12} />} onClick={() => setArmed(true)}>
            Run the sensitivity
          </Button>
        </div>
      )}
    </Panel>
  )
}
