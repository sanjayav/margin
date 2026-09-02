/* ───────────────────────────────────────────────────────────────────────────
   The position workbench.
   ---------------------------------------------------------------------------
   A scatter on its own is a picture. What a research desk actually works with
   is a LINKED VIEW: a chart and a ranked table describing the same selection,
   a control row that re-encodes the chart without reloading it, and a way to
   pin a handful of entities and put them side by side.

   Four things make this analyst-grade rather than decorative:

     RANK AND MOVEMENT. A league table with position, share of total exposure,
     and the change against the last settled year. "Third worst, and two places
     worse than last year" is a finding; "7.4 L/100km" is a number.

     LINKED SELECTION. Hovering a row lights its bubble and vice versa. Nothing
     in the panel can be describing a different entity from the thing next to it.

     RE-ENCODING, NOT RELOADING. Colour-by and size-by change what the same
     marks mean — position, zero-emission share, exposure — so one chart answers
     "who is over", "who is electrifying" and "where is the money" without three
     separate charts to keep in sync.

     PIN AND COMPARE. Up to four entities held side by side with the spread
     between them called out. That is the step people otherwise do in a
     spreadsheet, and the step where the errors happen.
   ─────────────────────────────────────────────────────────────────────────── */
import React, { useMemo, useState } from 'react'
import {
  Badge, Button, EmptyState, Panel, Progress, Segmented, StatusDot, Table, Td, Th,
  Tooltip, Tr, cx, fmtGap,
} from '../../design/primitives'
import Icon from '../../design/icons'
import { Dumbbell, LineChart, PositionMap, Sparkline, type MapPoint } from '../../design/charts'
import { entityExposure, settledThrough, usePosition } from '../../state/usePosition'
import { baseScenario } from '../../state/appStore'
import { buildDrillTree, fmtInt, fmtMoney, fmtNum, monthlyCompliance } from '../../../engine/engine'
import type { Aggregate } from '../../../engine/types'

const LEVEL_LABEL: Record<string, string> = {
  fleet: 'market', pool: 'pool', parent: 'manufacturer', model: 'model', variant: 'variant', powertrain: 'powertrain',
}

type View = 'risk' | 'mass' | 'gap' | 'trace'
type ColourBy = 'position' | 'ze' | 'exposure'
type SizeBy = 'units' | 'exposure'

const MAX_PINS = 4

export function PositionWorkbench({ path, setPath, selected, setSelected, hovered, setHovered }: {
  path: string[]; setPath: (p: string[]) => void
  selected: string | null; setSelected: (k: string | null) => void
  hovered: string | null; setHovered: (k: string | null) => void
}) {
  const { pack, raw, drill, scenario, country } = usePosition('actuals')
  const [view, setView] = useState<View>('risk')
  const [colourBy, setColourBy] = useState<ColourBy>('position')
  const [sizeBy, setSizeBy] = useState<SizeBy>('units')
  const [fullRange, setFullRange] = useState(false)
  const [pins, setPins] = useState<string[]>([])
  const [sort, setSort] = useState<{ key: 'gap' | 'exposure' | 'units' | 'metric'; dir: 'asc' | 'desc' }>({ key: 'exposure', dir: 'desc' })

  /* ── the node in view ─────────────────────────────────────────────────── */
  const node = useMemo(() => {
    let n: Aggregate = drill
    for (const key of path) {
      const next = (n.children ?? []).find((c) => c.key === key)
      if (!next) break
      n = next
    }
    return n
  }, [drill, path])

  const children = useMemo(() => (node.children ?? []).filter((c) => c.rawUnits > 0), [node])

  /* ── the same level, a year earlier — for rank movement ───────────────── */
  const prevYear = useMemo(() => {
    const settled = settledThrough(country)
    return pack.years.filter((y) => y < Math.min(scenario.year, settled)).slice(-1)[0] ?? null
  }, [pack.years, scenario.year, country])

  const previous = useMemo(() => {
    if (prevYear == null) return null
    const tree = buildDrillTree(raw, pack, { ...baseScenario(country), year: prevYear })
    let n: Aggregate = tree
    for (const key of path) {
      const next = (n.children ?? []).find((c) => c.key === key)
      if (!next) return null
      n = next
    }
    const kids = (n.children ?? []).filter((c) => c.rawUnits > 0)
    // Rank last year by the same measure, so a rank delta means something.
    const ranked = [...kids].sort((a, b) => entityExposure(b) - entityExposure(a))
    return {
      byKey: new Map(kids.map((c) => [c.key, c])),
      rankOf: new Map(ranked.map((c, i) => [c.key, i + 1])),
    }
  }, [prevYear, raw, pack, country, path])

  /* ── rows ─────────────────────────────────────────────────────────────── */
  const totalExposure = useMemo(() => children.reduce((a, c) => a + entityExposure(c), 0), [children])

  const rows = useMemo(() => {
    const base = children.map((c) => {
      const exposure = entityExposure(c)
      const was = previous?.byKey.get(c.key) ?? null
      return {
        node: c, key: c.key, label: c.label,
        metric: c.avgMetric, limit: c.limit, gap: c.gap, units: c.rawUnits, mass: c.avgMass,
        ze: c.zlevShare * 100,
        exposure,
        share: totalExposure > 0 ? (exposure / totalExposure) * 100 : 0,
        wasGap: was?.gap ?? null,
        wasMetric: was?.avgMetric ?? null,
        drillable: (c.children ?? []).some((g) => g.rawUnits > 0),
      }
    })
    const ranked = [...base].sort((a, b) => b.exposure - a.exposure)
    const rankNow = new Map(ranked.map((r, i) => [r.key, i + 1]))
    return base.map((r) => ({
      ...r,
      rank: rankNow.get(r.key)!,
      rankWas: previous?.rankOf.get(r.key) ?? null,
    }))
  }, [children, previous, totalExposure])

  const sorted = useMemo(() => {
    const dir = sort.dir === 'desc' ? -1 : 1
    return [...rows].sort((a, b) => dir * ((a[sort.key] as number) - (b[sort.key] as number)))
  }, [rows, sort])

  /* ── chart marks ──────────────────────────────────────────────────────── */
  const points: MapPoint[] = useMemo(() => rows.map((r) => ({
    key: r.key, label: r.label, units: r.units, metric: r.metric, limit: r.limit,
    gap: r.gap, exposure: r.exposure, mass: r.mass, drillable: r.drillable,
    // Re-encoding, not reloading: the same mark answers a different question.
    tone: colourBy === 'position' ? undefined
      : colourBy === 'ze' ? zeTone(r.ze)
      : exposureTone(r.share),
    weight: sizeBy === 'exposure' ? Math.max(r.exposure, totalExposure * 0.004) : r.units,
  })), [rows, colourBy, sizeBy, totalExposure])

  const crumbs = useMemo(() => {
    const out: { key: string | null; label: string }[] = [{ key: null, label: drill.label }]
    let n: Aggregate = drill
    for (const key of path) {
      const next = (n.children ?? []).find((c) => c.key === key)
      if (!next) break
      n = next
      out.push({ key, label: next.label })
    }
    return out
  }, [drill, path])

  const monthly = useMemo(() => monthlyCompliance(raw, pack, scenario), [raw, pack, scenario])
  const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const start = (pack.fiscalYearStartMonth ?? 1) - 1

  const togglePin = (key: string) =>
    setPins((p) => (p.includes(key) ? p.filter((k) => k !== key) : p.length >= MAX_PINS ? p : [...p, key]))

  const pinned = pins.map((k) => rows.find((r) => r.key === k)).filter(Boolean) as typeof rows
  const top3 = [...rows].sort((a, b) => b.exposure - a.exposure).slice(0, 3)
  const concentration = top3.reduce((a, r) => a + r.share, 0)
  const levelName = LEVEL_LABEL[children[0]?.level ?? 'parent'] ?? 'entity'

  const money = (v: number) => fmtMoney(v, pack.currency)
  const isMap = view === 'risk' || view === 'mass'

  return (
    <Panel flush
      title="The position"
      sub={{
        risk: 'Gap to limit against registrations, with the limit drawn flat. A fine is charged per gram and per car, so the money is the top-right.',
        mass: `Fleet against ${pack.massLabel.toLowerCase()} — the dashed line is the limit as it varies with mass. This is why two makers at the same CO₂ are not in the same trouble.`,
        gap: 'Each entity drawn from its own limit to where it actually sits.',
        trace: 'Year-to-date position after each month filed.',
      }[view]}
      icon={<Icon name="target" size={14} />}
      actions={
        <Segmented size="sm" value={view} onChange={setView}
          options={[
            { id: 'risk', label: 'Risk', hint: 'Where the exposure is' },
            { id: 'mass', label: 'Mass', hint: 'Why each limit sits where it does' },
            { id: 'gap', label: 'Gap', hint: 'Ranked distance from each own limit' },
            { id: 'trace', label: 'Trace', hint: 'Month by month', disabled: monthly.length < 2 },
          ]} />
      }>

      {/* ── the control row ── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--line-soft)] px-4 py-2.5">
        <div className="flex items-center gap-1">
          {crumbs.map((c, i) => (
            <React.Fragment key={c.key ?? 'root'}>
              {i > 0 && <Icon name="chevron" size={10} className="text-[var(--ink-5)]" />}
              <button onClick={() => { setPath(path.slice(0, i)); setSelected(null); setPins([]) }}
                disabled={i === crumbs.length - 1}
                className={cx('rounded-[var(--r-xs)] px-1.5 py-0.5 text-[12px] transition-colors',
                  i === crumbs.length - 1 ? 'font-semibold text-[var(--ink-1)]'
                    : 'text-[var(--ink-4)] hover:bg-[var(--surface-2)] hover:text-[var(--ink-1)]')}>
                {c.label}
              </button>
            </React.Fragment>
          ))}
          <span className="ml-1 text-[11px] text-[var(--ink-4)]">{rows.length} {levelName}{rows.length === 1 ? '' : 's'}</span>
        </div>

        {isMap && (
          <>
            <span className="ml-auto flex items-center gap-1.5">
              <span className="text-[10.5px] uppercase tracking-[.07em] text-[var(--ink-5)]">Colour</span>
              <Segmented size="sm" value={colourBy} onChange={setColourBy}
                options={[
                  { id: 'position', label: 'Position', hint: 'Over or inside its own limit' },
                  { id: 'ze', label: 'ZE share', hint: 'Zero-emission share of registrations' },
                  { id: 'exposure', label: 'Exposure', hint: 'Share of total exposure at this level' },
                ]} />
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-[10.5px] uppercase tracking-[.07em] text-[var(--ink-5)]">Size</span>
              <Segmented size="sm" value={sizeBy} onChange={setSizeBy}
                options={[{ id: 'units', label: 'Volume' }, { id: 'exposure', label: 'Exposure' }]} />
            </span>
          </>
        )}
      </div>

      {/* ── chart ↔ table ── */}
      <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_max(392px,32%)]">
        <div className="min-w-0 border-b border-[var(--line-soft)] p-4 xl:border-b-0 xl:border-r">
          {isMap && (points.length ? (
            <>
              <PositionMap
                points={points} variant={view} unit={pack.metricUnit} height={344}
                selected={selected} hovered={hovered}
                onSelect={setSelected} onHover={setHovered}
                onDrill={(p) => { setPath([...path, p.key]); setSelected(null); setPins([]) }}
                fullRange={fullRange} onFullRange={setFullRange}
                colourBy={colourBy}
                format={(v) => fmtNum(v, 1)} />
              <Legend colourBy={colourBy} sizeBy={sizeBy} />
            </>
          ) : (
            <EmptyState art="chart" compact icon={<Icon name="target" size={18} />} title="Nothing with volume at this level" />
          ))}

          {view === 'gap' && (
            <Dumbbell rows={rows.map((r) => ({ label: r.label, limit: r.limit, actual: r.metric, volume: r.units }))}
              unit={pack.metricUnit} height={344} format={(v) => fmtNum(v, 1)}
              animateKey={`${scenario.year}:${path.join()}`}
              selected={rows.find((r) => r.key === selected)?.label}
              onSelect={(l) => {
                const hit = rows.find((r) => r.label === l)
                setSelected(hit && selected !== hit.key ? hit.key : null)
              }} />
          )}

          {view === 'trace' && (monthly.length >= 2 ? (
            <LineChart
              x={monthly.map((_, i) => MO[(start + i) % 12])}
              unit={pack.metricUnit} height={344}
              series={[{ name: 'Year to date', points: monthly.map((p) => p.ytdMetric ?? null), area: true, color: 'var(--dv-1)' }]}
              refLine={monthly.map((p) => p.ytdLimit ?? null)} refLabel="Limit"
              band={{ lower: monthly.map(() => 0), upper: monthly.map((p) => p.ytdLimit ?? null), label: 'Compliant region' }} />
          ) : (
            <EmptyState art="chart" compact icon={<Icon name="clock" size={18} />} title="No monthly filing in this dataset"
              body="This market's source records annual totals only." />
          ))}
        </div>

        {/* ── the league table ── */}
        <div className="min-w-0">
          <div className="flex items-center gap-2 border-b border-[var(--line-soft)] px-3 py-2">
            <span className="t-label !mb-0">Ranked by exposure</span>
            {totalExposure > 0 && (
              <Tooltip content={`${top3.map((r) => r.label).join(', ')} carry ${concentration.toFixed(0)}% of the exposure at this level.`}>
                <span><Badge tone={concentration > 60 ? 'neg' : 'neutral'}>top 3 = {concentration.toFixed(0)}%</Badge></span>
              </Tooltip>
            )}
            {pins.length > 0 && (
              <Button size="xs" variant="ghost" className="ml-auto" onClick={() => setPins([])}>Clear {pins.length} pinned</Button>
            )}
          </div>

          <div className="max-h-[392px] overflow-auto">
            <Table className="table-fixed">
              <colgroup>
                <col style={{ width: 34 }} />
                <col />
                <col style={{ width: 62 }} />
                <col style={{ width: 118 }} />
                <col style={{ width: 62 }} />
              </colgroup>
              <thead>
                <tr>
                  <Th />
                  <Th>{levelName}</Th>
                  <Th align="right" sortable sorted={sort.key === 'gap' && sort.dir} onSort={() => setSort((s) => ({ key: 'gap', dir: s.key === 'gap' && s.dir === 'desc' ? 'asc' : 'desc' }))}>Gap</Th>
                  <Th align="right" sortable sorted={sort.key === 'exposure' && sort.dir} onSort={() => setSort((s) => ({ key: 'exposure', dir: s.key === 'exposure' && s.dir === 'desc' ? 'asc' : 'desc' }))}>Exposure</Th>
                  {/* Volume lives on the bubble and in the row tooltip — a column
                      for it pushed rank movement off the edge, and movement is the
                      one thing no other surface here shows. */}
                  <Th align="center">vs {prevYear ?? '—'}</Th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => {
                  const on = selected === r.key
                  const warm = hovered === r.key
                  const move = r.rankWas != null ? r.rankWas - r.rank : null
                  const gapMove = r.wasGap != null ? r.gap - r.wasGap : null
                  return (
                    <Tr key={r.key} interactive selected={on}
                      className={warm && !on ? 'bg-[var(--surface-2)]' : undefined}
                      onMouseEnter={() => setHovered(r.key)}
                      onMouseLeave={() => setHovered(null)}
                      onClick={() => setSelected(on ? null : r.key)}
                      onDoubleClick={() => r.drillable && (setPath([...path, r.key]), setSelected(null), setPins([]))}>
                      <Td>
                        <button onClick={(e) => { e.stopPropagation(); togglePin(r.key) }}
                          title={pins.includes(r.key) ? 'Unpin' : pins.length >= MAX_PINS ? `Pin up to ${MAX_PINS}` : 'Pin to compare'}
                          className={cx('grid h-5 w-5 place-items-center rounded-[var(--r-xs)] transition-colors',
                            pins.includes(r.key) ? 'bg-[var(--ink-1)] text-[var(--canvas)]' : 'text-[var(--ink-5)] hover:bg-[var(--surface-3)] hover:text-[var(--ink-2)]')}>
                          <span className="text-[10px] font-bold tabular-nums">{r.rank}</span>
                        </button>
                      </Td>
                      <Td>
                        <span className="flex min-w-0 items-center gap-1.5"
                          title={`${r.label} — ${fmtInt(r.units)} registrations · ${r.ze.toFixed(1)}% zero-emission · fleet ${fmtNum(r.metric, 1)} against a limit of ${fmtNum(r.limit, 1)} ${pack.metricUnit}`}>
                          <StatusDot size={6} tone={r.gap > 0 ? 'neg' : 'pos'} />
                          <span className="truncate font-medium text-[var(--ink-1)]">{r.label}</span>
                          {r.drillable && <Icon name="chevron" size={9} className="shrink-0 text-[var(--ink-5)]" />}
                        </span>
                      </Td>
                      <Td align="right">
                        <span className={cx('font-semibold', r.gap > 0 ? 'text-[var(--neg-ink)]' : 'text-[var(--pos-ink)]')}>{fmtGap(r.gap)}</span>
                      </Td>
                      <Td align="right">
                        {r.exposure > 0 ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="hidden w-[30px] 2xl:inline-block"><Progress value={r.share} height={4} tone={r.share > 25 ? 'neg' : 'neutral'} /></span>
                            <span className="font-semibold text-[var(--neg-ink)]">{money(r.exposure)}</span>
                          </span>
                        ) : <span className="text-[var(--ink-5)]">—</span>}
                      </Td>
                      <Td align="center">
                        {gapMove == null ? <span className="text-[var(--ink-5)]">—</span> : (
                          <Tooltip content={`Gap ${fmtGap(r.wasGap!)} → ${fmtGap(r.gap)}${move ? ` · ${Math.abs(move)} place${Math.abs(move) === 1 ? '' : 's'} ${move > 0 ? 'better' : 'worse'} on exposure` : ''}`}>
                            <span className={cx('inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums',
                              Math.abs(gapMove) < 0.05 ? 'text-[var(--ink-4)]'
                                : gapMove < 0 ? 'text-[var(--pos-ink)]' : 'text-[var(--neg-ink)]')}>
                              {Math.abs(gapMove) < 0.05 ? 'flat' : <>{gapMove < 0 ? '↓' : '↑'}{fmtNum(Math.abs(gapMove), 1)}</>}
                            </span>
                          </Tooltip>
                        )}
                      </Td>
                    </Tr>
                  )
                })}
              </tbody>
            </Table>
          </div>
        </div>
      </div>

      {/* ── the compare tray ── */}
      {pinned.length > 0 && (
        <div className="anim-in border-t border-[var(--line)] bg-[var(--surface-2)] px-4 py-3">
          <div className="mb-2 flex items-center gap-2">
            <Icon name="layers" size={12} className="text-[var(--ink-4)]" />
            <span className="t-label !mb-0">Comparing {pinned.length}</span>
            <span className="text-[11px] text-[var(--ink-4)]">
              spread {fmtNum(Math.max(...pinned.map((p) => p.gap)) - Math.min(...pinned.map((p) => p.gap)), 1)} {pack.metricUnit}
              {' · '}{money(Math.max(...pinned.map((p) => p.exposure)) - Math.min(...pinned.map((p) => p.exposure)))} of exposure between best and worst
            </span>
          </div>
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${pinned.length}, minmax(0,1fr))` }}>
            {pinned.map((r) => {
              const best = r.gap === Math.min(...pinned.map((p) => p.gap))
              return (
                <div key={r.key}
                  className={cx('rounded-[var(--r-md)] border bg-[var(--surface-1)] p-3',
                    best ? 'border-[var(--pos-line)]' : 'border-[var(--line)]')}>
                  <div className="flex items-start gap-1.5">
                    <StatusDot size={6} tone={r.gap > 0 ? 'neg' : 'pos'} />
                    <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[var(--ink-1)]" title={r.label}>{r.label}</span>
                    <button onClick={() => togglePin(r.key)} className="text-[var(--ink-5)] hover:text-[var(--ink-2)]" aria-label={`Unpin ${r.label}`}>
                      <Icon name="x" size={11} />
                    </button>
                  </div>
                  <dl className="mt-2 space-y-1 text-[11.5px]">
                    <Row k="Fleet" v={`${fmtNum(r.metric, 1)} ${pack.metricUnit}`} />
                    <Row k="Its limit" v={`${fmtNum(r.limit, 1)} ${pack.metricUnit}`} />
                    <Row k="Gap" v={fmtGap(r.gap)} tone={r.gap > 0 ? 'neg' : 'pos'} />
                    <Row k="Exposure" v={r.exposure > 0 ? money(r.exposure) : '—'} tone={r.exposure > 0 ? 'neg' : undefined} />
                    <Row k="Volume" v={fmtInt(r.units)} />
                    <Row k="Zero-emission" v={`${r.ze.toFixed(1)}%`} />
                  </dl>
                  {best && pinned.length > 1 && <div className="mt-2 text-[10.5px] font-semibold text-[var(--pos-ink)]">best of the pinned</div>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </Panel>
  )
}

function Row({ k, v, tone }: { k: string; v: string; tone?: 'neg' | 'pos' }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-[var(--ink-4)]">{k}</dt>
      <dd className={cx('m-0 font-semibold tabular-nums',
        tone === 'neg' ? 'text-[var(--neg-ink)]' : tone === 'pos' ? 'text-[var(--pos-ink)]' : 'text-[var(--ink-1)]')}>{v}</dd>
    </div>
  )
}

/* Sequential ramps: ONE hue, light to dark. A rainbow here would imply
   categories where there is a magnitude. */
const zeTone = (pct: number) => {
  const steps = ['#E6F2EC', '#B9DECC', '#7FC4A6', '#3FA37E', '#0E8C60']
  return steps[Math.min(4, Math.floor((pct / 40) * 5))]
}
const exposureTone = (share: number) => {
  const steps = ['#FBE9E9', '#F5C6C6', '#EC9A9A', '#DC5F5F', '#C81E1E']
  return steps[Math.min(4, Math.floor((share / 30) * 5))]
}

function Legend({ colourBy, sizeBy }: { colourBy: ColourBy; sizeBy: SizeBy }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-[var(--ink-3)]">
      {colourBy === 'position' && (
        <>
          <span className="inline-flex items-center gap-1.5"><span className="h-[9px] w-[9px] rounded-full border-2 border-[var(--pos)] bg-[var(--pos)] opacity-60" /> inside its limit</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-[9px] w-[9px] rounded-full border-2 border-[var(--neg)] bg-[var(--neg)] opacity-60" /> over its limit</span>
        </>
      )}
      {colourBy !== 'position' && (
        <span className="inline-flex items-center gap-1.5">
          {colourBy === 'ze' ? 'Zero-emission share' : 'Share of exposure'}
          <span className="inline-flex overflow-hidden rounded-full">
            {(colourBy === 'ze' ? [0, 10, 20, 30, 40] : [0, 8, 15, 22, 30]).map((v) => (
              <span key={v} className="h-[9px] w-[16px]" style={{ background: colourBy === 'ze' ? zeTone(v) : exposureTone(v) }} />
            ))}
          </span>
          <span className="text-[var(--ink-4)]">low → high</span>
        </span>
      )}
      <span className="text-[var(--ink-4)]">bubble area = {sizeBy === 'units' ? 'registrations' : 'exposure'}</span>
      <span className="ml-auto text-[var(--ink-4)]">click to select · double-click to drill</span>
    </div>
  )
}
