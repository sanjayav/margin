// ───────────────────────────────────────────────────────────────────────────
// FACTS RAIL — the Analyse module's right rail. Where the ScenarioRail edits
// assumptions, this rail states facts: reporting period, dataset provenance
// and vintage, and the as-sold fleet profile. Deliberately contains ZERO
// levers — Analyse is the book of record (see docs: basis doctrine).
// ───────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo } from 'react'
import { useStore } from '../state/store'
import { useCompliance } from '../lib/useCompliance'
import { buildTree, fmtInt, fmtMoney, fmtNum, monthsFiled, scopeToMonth, unscopedVolume } from '../engine/engine'
import { buildDualCredit } from '../engine/china/dualcredit'
import { BasisChip } from './ui'
import Icon from './Icon'

export default function FactsRail() {
  const c = useCompliance('actuals')
  const { pack, scenario, meta, country } = c
  const patch = useStore((s) => s.patchScenario)
  // The rail states the facts for whatever period Plan is reading, so it scopes
  // with the screen — a verdict beside a part-year chart must be that part-year.
  const planScope = useStore((s) => s.planScope)
  const setPlanScope = useStore((s) => s.setPlanScope)
  const raw = useMemo(() => scopeToMonth(c.raw, scenario.year, planScope), [c.raw, scenario.year, planScope])
  const tree = useMemo(
    () => (planScope.through == null ? c.tree : buildTree(raw, pack, scenario, {})),
    [planScope.through, raw, pack, scenario, c.tree],
  )
  const filed = useMemo(() => monthsFiled(c.raw, scenario.year), [c.raw, scenario.year])
  const outside = useMemo(() => unscopedVolume(c.raw, scenario.year, planScope), [c.raw, scenario.year, planScope])
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const mName = (i: number) => MONTHS[((pack.fiscalYearStartMonth ?? 1) - 1 + i) % 12]
  const setScreen = useStore((s) => s.setScreen)
  // China verdict is a credit balance (积分), not a "line".
  const isCN = pack.id === 'CN'
  const dc = isCN ? buildDualCredit(tree, scenario, pack.creditPrice ?? pack.fineRate) : null
  const crn = (n: number) => `${n >= 0 ? '+' : '−'}${fmtInt(Math.abs(n))}`

  // dataset vintage: years at/before the refresh are monitored actuals; later
  // years are the same as-sold fleet judged against that year's statutory line.
  const vintageYear = pack.actualsThroughYear ?? (meta.lastRefreshed ? new Date(meta.lastRefreshed).getFullYear() : new Date().getFullYear())
  const actualYears = useMemo(() => pack.years.filter((y) => y <= vintageYear), [pack.years, vintageYear])
  // Plan shows actuals only — if the shared year is a forward one, pull it back
  // to the latest actual so the book of record never opens on a projection.
  useEffect(() => { if (scenario.year > vintageYear) patch({ year: actualYears[actualYears.length - 1] ?? vintageYear }) }, [vintageYear]) // eslint-disable-line react-hooks/exhaustive-deps
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
    <aside data-density="rail" className="rail-dark relative flex w-[19.5rem] shrink-0 flex-col gap-3 overflow-y-auto border-l border-white/[0.06] p-4" style={{ background: 'linear-gradient(178deg, #221B17 0%, #1B1714 42%, #17130F 100%)' }}>
      <div aria-hidden className="pointer-events-none absolute -right-14 -top-8 h-52 w-52 rounded-full blur-3xl" style={{ background: 'radial-gradient(circle, rgba(14,159,110,0.13), transparent 64%)' }} />
      <div className="relative flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[13px] font-bold text-white"><Icon name="shield" size={15} className="text-safe" /> Facts</span>
        <BasisChip basis="actuals" meta={meta} />
      </div>
      <p className="text-[10.5px] leading-relaxed text-white/45">
        The book of record: official registrations as sold. No lever can reach this screen; modelling lives in Scenario.
      </p>

      {/* reporting period — Plan is the book of record, so only the ACTUAL
          (monitored) years are offered; forward years live in Forecast/Scenario. */}
      <div>
        <div className="label mb-1.5 text-white/55">Reporting period</div>
        <div className="flex flex-wrap gap-1">
          {actualYears.map((y) => {
            const on = y === scenario.year
            return (
              <button key={y} onClick={() => patch({ year: y })} title={`${y}: monitored period`}
                className={`num rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${on ? 'bg-white text-[#1B1714]' : 'bg-white/[0.06] text-white/45 hover:text-white'}`}>
                {y}
              </button>
            )
          })}
        </div>
        <p className="mt-1.5 text-[10px] leading-snug text-white/45">Actuals only. Forward years — the CAFE III / draft horizon — live in <button onClick={() => setScreen('forecast')} className="font-semibold text-brand hover:underline">Forecast</button> and Scenario.</p>

        {/* Registrations file monthly, so the year has a "so far". Only offered
            for a year that actually filed monthly — everything on Plan follows
            this, not just a panel. */}
        {filed > 0 && (
          <div className="mt-3 border-t border-white/[0.07] pt-3">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="label text-white/55">Through month</span>
              {planScope.through != null && (
                <span className="flex items-center gap-0.5 rounded-md bg-white/[0.06] p-0.5">
                  {(['ytd', 'month'] as const).map((m) => (
                    <button key={m} onClick={() => setPlanScope({ ...planScope, mode: m })}
                      title={m === 'ytd' ? 'Cumulative from the first month — the compliance position' : 'That month on its own — the diagnostic reading'}
                      className={`rounded px-1.5 py-0.5 text-[9.5px] font-bold transition ${planScope.mode === m ? 'bg-white text-[#1B1714]' : 'text-white/45 hover:text-white'}`}>
                      {m === 'ytd' ? 'YTD' : 'Month'}
                    </button>
                  ))}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              <button onClick={() => setPlanScope({ through: null, mode: planScope.mode })}
                title="The whole compliance year"
                className={`rounded-lg px-2 py-1 text-[10.5px] font-bold transition ${planScope.through == null ? 'bg-white text-[#1B1714]' : 'bg-white/[0.06] text-white/45 hover:text-white'}`}>
                {filed >= 12 ? 'Full year' : 'All filed'}
              </button>
              {Array.from({ length: filed }, (_, i) => i + 1).map((m) => (
                <button key={m} onClick={() => setPlanScope({ through: m, mode: planScope.mode })}
                  title={`${planScope.mode === 'month' ? mName(m - 1) + ' alone' : `Year to date through ${mName(m - 1)}`}`}
                  className={`num rounded-lg px-2 py-1 text-[10.5px] font-bold transition ${planScope.through === m ? 'bg-white text-[#1B1714]' : 'bg-white/[0.06] text-white/45 hover:text-white'}`}>
                  {mName(m - 1)}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[10px] leading-snug text-white/45">
              {planScope.through == null
                ? `${filed} of 12 months filed. Every number on this screen is the whole period.`
                : planScope.mode === 'ytd'
                  ? <>Every number is <b className="text-white/70">cumulative through {mName(planScope.through - 1)}</b> — the compliance position so far.</>
                  : <>Every number is <b className="text-white/70">{mName(planScope.through - 1)} alone</b> — diagnostic, not the compliance position.</>}
              {outside > 0 && ` ${fmtInt(outside)} units carry no monthly split at source and sit outside this reading.`}
            </p>
          </div>
        )}
      </div>

      {/* verdict — credit standing for China, the line for CO₂/FC markets */}
      {isCN ? (
        <div className={`rounded-xl border p-3 ${dc!.totals.creditsToBuy > 0.5 ? 'border-danger/25 bg-danger/[0.05]' : 'border-safe/25 bg-safe/[0.05]'}`}>
          <div className="label text-white/55">Credit standing · 积分 · {scenario.year}</div>
          <div className="mt-1.5 text-[13px] font-bold leading-tight">
            <span className="text-white/45">CAFC </span><span className={dc!.totals.cafcCredit >= 0 ? 'text-safe' : 'text-danger'}>{crn(dc!.totals.cafcCredit)}</span>
            <span className="text-white/45"> · NEV </span><span className={dc!.totals.nevBalance >= 0 ? 'text-safe' : 'text-danger'}>{crn(dc!.totals.nevBalance)}</span>
          </div>
          <div className={`mt-1.5 text-[11.5px] font-semibold ${dc!.totals.makersOver > 0 ? 'text-danger' : 'text-safe'}`}>
            {dc!.totals.makers - dc!.totals.makersOver} of {dc!.totals.makers} clear both · {fmtMoney(dc!.totals.cost, pack.currency)} to buy clear
          </div>
        </div>
      ) : (
        <div className={`rounded-xl border p-3 ${tree.gap > 0 ? 'border-danger/25 bg-danger/[0.05]' : 'border-safe/25 bg-safe/[0.05]'}`}>
          <div className="label text-white/55">Market verdict · {scenario.year}</div>
          <div className="num mt-1.5 text-[20px] font-bold leading-none text-white">
            {fmtNum(tree.avgMetric, 1)} <span className="text-xs font-semibold text-white/45">/ {fmtNum(tree.limit, 1)} {pack.metricUnit}</span>
          </div>
          <div className={`mt-1.5 text-[11.5px] font-semibold ${tree.gap > 0 ? 'text-danger' : 'text-safe'}`}>
            {tree.gap > 0 ? `${fmtNum(tree.gap, 1)} over` : `${fmtNum(Math.abs(tree.gap), 1)} under`} · {fmtMoney(marketFine, pack.currency)} at risk · {over} of {makers.length} makers over
          </div>
        </div>
      )}

      {/* dataset provenance */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-3">
        <div className="label mb-1.5 text-white/55">Dataset</div>
        <div className="space-y-1 text-[11px] leading-relaxed text-white/70">
          <div className="flex items-start gap-1.5"><Icon name="database" size={12} className="mt-0.5 shrink-0 text-brand" /><span>{meta.source}</span></div>
          <div className="flex items-center gap-1.5"><Icon name="clock" size={12} className="shrink-0 text-white/45" /><span>{meta.lastRefreshed ? `refreshed ${new Date(meta.lastRefreshed).toLocaleDateString()}` : 'bundled extract'} · <span className="num">v{String(meta.datasetVersion).slice(-6)}</span></span></div>
          <div className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${meta.live ? 'bg-safe' : 'bg-warn'}`} />
            <span>{meta.live ? 'Live dataset (store)' : 'Bundled extract (offline fallback)'}</span>
          </div>
        </div>
        <button onClick={() => setScreen('data')} className="mt-2 text-[10.5px] font-semibold text-brand hover:underline">Data & imports →</button>
      </div>

      {/* fleet profile */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-3">
        <div className="label mb-2 text-white/55">Fleet profile · {scenario.year}</div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
          <div><div className="text-white/45">Registrations</div><div className="num font-bold text-white">{fmtInt(tree.rawUnits)}</div></div>
          <div><div className="text-white/45">Manufacturers</div><div className="num font-bold text-white">{makers.length}</div></div>
          <div><div className="text-white/45">Zero-emission</div><div className="num font-bold text-white">{(tree.zlevShare * 100).toFixed(1)}%</div></div>
          <div><div className="text-white/45">{pack.massLabel}</div><div className="num font-bold text-white">{fmtInt(tree.avgMass)} kg</div></div>
          <div><div className="text-white/45">Declared pools</div><div className="num font-bold text-white">{facts.pools}</div></div>
          <div><div className="text-white/45">{country === 'EU' ? 'Assessed at' : 'Assessed per'}</div><div className="font-bold text-white">{pack.pooling.enabled ? 'pool level' : 'manufacturer'}</div></div>
        </div>
      </div>

      {/* the handoff */}
      <button onClick={() => setScreen('model')} className="btn-primary w-full py-2.5 text-sm"><Icon name="sliders" size={15} /> Model this →</button>
      <p className="text-center text-[10px] text-white/45">opens the Scenario workbench with this scope</p>

      <div className="mt-auto pt-2 text-[9.5px] leading-relaxed text-white/30">{pack.source}</div>
    </aside>
  )
}
