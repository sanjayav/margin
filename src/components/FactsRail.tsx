// ───────────────────────────────────────────────────────────────────────────
// FACTS RAIL — the Analyse module's right rail. Where the ScenarioRail edits
// assumptions, this rail states facts: reporting period, dataset provenance
// and vintage, and the as-sold fleet profile. Deliberately contains ZERO
// levers — Analyse is the book of record (see docs: basis doctrine).
// ───────────────────────────────────────────────────────────────────────────
import { useMemo } from 'react'
import { useStore } from '../state/store'
import { useCompliance } from '../lib/useCompliance'
import { fmtInt, fmtMoney, fmtNum } from '../engine/engine'
import { buildDualCredit } from '../engine/china/dualcredit'
import { BasisChip } from './ui'
import Icon from './Icon'

export default function FactsRail() {
  const { pack, raw, tree, scenario, meta, country } = useCompliance('actuals')
  const patch = useStore((s) => s.patchScenario)
  const setScreen = useStore((s) => s.setScreen)
  // China verdict is a credit balance (积分), not a "line".
  const isCN = pack.id === 'CN'
  const dc = isCN ? buildDualCredit(tree, scenario, pack.creditPrice ?? pack.fineRate) : null
  const crn = (n: number) => `${n >= 0 ? '+' : '−'}${fmtInt(Math.abs(n))}`

  // dataset vintage: years at/before the refresh are monitored actuals; later
  // years are the same as-sold fleet judged against that year's statutory line.
  const vintageYear = pack.actualsThroughYear ?? (meta.lastRefreshed ? new Date(meta.lastRefreshed).getFullYear() : new Date().getFullYear())
  const makers = (tree.children ?? []).filter((c) => c.rawUnits > 0)
  const marketFine = makers.reduce((a, c) => a + c.fine, 0)
  const over = makers.filter((c) => c.status === 'fine').length
  const facts = useMemo(() => {
    const pools = new Set(raw.filter((v) => v.year === scenario.year).map((v) => v.pool || v.parent))
    return { pools: pools.size }
  }, [raw, scenario.year])
  // Does the selected year ship its own rows (a real forward-planning fleet, as in
  // the China dataset) vs. being a naive carry-forward of the last actual fleet?
  const yearHasOwnRows = useMemo(() => raw.some((v) => v.year === scenario.year), [raw, scenario.year])

  return (
    <aside className="flex w-[19.5rem] shrink-0 flex-col gap-3 overflow-y-auto border-l border-black/[0.06] bg-ink-900/30 p-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[13px] font-bold text-ink-100"><Icon name="shield" size={15} className="text-safe" /> Facts</span>
        <BasisChip basis="actuals" meta={meta} />
      </div>
      <p className="text-[10.5px] leading-relaxed text-ink-500">
        The book of record — official registrations as sold. No lever can reach this screen; modelling lives in Scenario.
      </p>

      {/* reporting period */}
      <div>
        <div className="label mb-1.5 text-ink-400">Reporting period</div>
        <div className="flex flex-wrap gap-1">
          {pack.years.map((y) => {
            const on = y === scenario.year
            const projected = y > vintageYear
            return (
              <button key={y} onClick={() => patch({ year: y })} title={projected ? `${y}: the as-sold fleet judged against the ${y} statutory line (baseline projection)` : `${y}: monitored period`}
                className={`num rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${on ? 'bg-ink-100 text-white' : 'bg-black/5 text-ink-500 hover:text-ink-100'}`}>
                {y}{projected && <span className={`ml-1 text-[8px] font-black uppercase ${on ? 'text-warn' : 'text-warn/80'}`}>P</span>}
              </button>
            )
          })}
        </div>
        {scenario.year > vintageYear && (
          <p className="mt-1.5 text-[10px] leading-snug text-warn"><Icon name="alert" size={10} className="mr-0.5 inline" /> {yearHasOwnRows
            ? `${scenario.year} is a forward year: the source's own ${scenario.year} planning fleet, judged against the ${scenario.year} target. No scenario levers applied.`
            : `${scenario.year} is a projection: today's as-sold fleet against the ${scenario.year} target. No assumptions applied.`}</p>
        )}
      </div>

      {/* verdict — credit standing for China, the line for CO₂/FC markets */}
      {isCN ? (
        <div className={`rounded-xl border p-3 ${dc!.totals.creditsToBuy > 0.5 ? 'border-danger/25 bg-danger/[0.05]' : 'border-safe/25 bg-safe/[0.05]'}`}>
          <div className="label text-ink-400">Credit standing · 积分 · {scenario.year}</div>
          <div className="mt-1.5 text-[13px] font-bold leading-tight">
            <span className="text-ink-500">CAFC </span><span className={dc!.totals.cafcCredit >= 0 ? 'text-safe' : 'text-danger'}>{crn(dc!.totals.cafcCredit)}</span>
            <span className="text-ink-500"> · NEV </span><span className={dc!.totals.nevBalance >= 0 ? 'text-safe' : 'text-danger'}>{crn(dc!.totals.nevBalance)}</span>
          </div>
          <div className={`mt-1.5 text-[11.5px] font-semibold ${dc!.totals.makersOver > 0 ? 'text-danger' : 'text-safe'}`}>
            {dc!.totals.makers - dc!.totals.makersOver} of {dc!.totals.makers} clear both · {fmtMoney(dc!.totals.cost, pack.currency)} to buy clear
          </div>
        </div>
      ) : (
        <div className={`rounded-xl border p-3 ${tree.gap > 0 ? 'border-danger/25 bg-danger/[0.05]' : 'border-safe/25 bg-safe/[0.05]'}`}>
          <div className="label text-ink-400">Market verdict · {scenario.year}</div>
          <div className="num mt-1.5 text-[20px] font-bold leading-none text-ink-100">
            {fmtNum(tree.avgMetric, 1)} <span className="text-xs font-semibold text-ink-500">/ {fmtNum(tree.limit, 1)} {pack.metricUnit}</span>
          </div>
          <div className={`mt-1.5 text-[11.5px] font-semibold ${tree.gap > 0 ? 'text-danger' : 'text-safe'}`}>
            {tree.gap > 0 ? `${fmtNum(tree.gap, 1)} over` : `${fmtNum(Math.abs(tree.gap), 1)} under`} · {fmtMoney(marketFine, pack.currency)} at risk · {over} of {makers.length} makers over
          </div>
        </div>
      )}

      {/* dataset provenance */}
      <div className="rounded-xl border border-black/[0.06] bg-white/50 p-3">
        <div className="label mb-1.5 text-ink-400">Dataset</div>
        <div className="space-y-1 text-[11px] leading-relaxed text-ink-300">
          <div className="flex items-start gap-1.5"><Icon name="database" size={12} className="mt-0.5 shrink-0 text-brand" /><span>{meta.source}</span></div>
          <div className="flex items-center gap-1.5"><Icon name="clock" size={12} className="shrink-0 text-ink-500" /><span>{meta.lastRefreshed ? `refreshed ${new Date(meta.lastRefreshed).toLocaleDateString()}` : 'bundled extract'} · <span className="num">v{String(meta.datasetVersion).slice(-6)}</span></span></div>
          <div className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${meta.live ? 'bg-safe' : 'bg-warn'}`} />
            <span>{meta.live ? 'Live dataset (store)' : 'Bundled extract (offline fallback)'}</span>
          </div>
        </div>
        <button onClick={() => setScreen('data')} className="mt-2 text-[10.5px] font-semibold text-brand hover:underline">Data & imports →</button>
      </div>

      {/* fleet profile */}
      <div className="rounded-xl border border-black/[0.06] bg-white/50 p-3">
        <div className="label mb-2 text-ink-400">Fleet profile · {scenario.year}</div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
          <div><div className="text-ink-500">Registrations</div><div className="num font-bold text-ink-100">{fmtInt(tree.rawUnits)}</div></div>
          <div><div className="text-ink-500">Manufacturers</div><div className="num font-bold text-ink-100">{makers.length}</div></div>
          <div><div className="text-ink-500">Zero-emission</div><div className="num font-bold text-ink-100">{(tree.zlevShare * 100).toFixed(1)}%</div></div>
          <div><div className="text-ink-500">{pack.massLabel}</div><div className="num font-bold text-ink-100">{fmtInt(tree.avgMass)} kg</div></div>
          <div><div className="text-ink-500">Declared pools</div><div className="num font-bold text-ink-100">{facts.pools}</div></div>
          <div><div className="text-ink-500">{country === 'EU' ? 'Assessed at' : 'Assessed per'}</div><div className="font-bold text-ink-100">{pack.pooling.enabled ? 'pool level' : 'manufacturer'}</div></div>
        </div>
      </div>

      {/* the handoff */}
      <button onClick={() => setScreen('model')} className="btn-primary w-full py-2.5 text-sm"><Icon name="sliders" size={15} /> Model this →</button>
      <p className="text-center text-[10px] text-ink-500">opens the Scenario workbench with this scope</p>

      <div className="mt-auto pt-2 text-[9.5px] leading-relaxed text-ink-600">{pack.source}</div>
    </aside>
  )
}
