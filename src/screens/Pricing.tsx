// ───────────────────────────────────────────────────────────────────────────
// PRICING — what compliance does to the price of a car.
// Turns the engine's fines and credit values into per-unit price economics:
//   · compliance cost per car (maker fine ÷ units) and the uplift needed to
//     recover it at a chosen pass-through
//   · credit value per car for over-compliers (headroom × credit price)
//   · a model-level price ladder for the focused maker: which nameplates carry
//     the burden, which generate credit value
//   · market tax context (GST/VAT/cess/LCT) so uplifts read as on-road money
// Uses the pack's linear-equivalent fine rate for model-level marginal costs;
// maker totals always use the statutory schedule (fineFor) via the engine.
// ───────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { useStore } from '../state/store'
import { useCompliance } from '../lib/useCompliance'
import { fmtInt, fmtMoney, fmtNum } from '../engine/engine'
import type { CountryId } from '../engine/types'
import { Stat, Section, BasisChip } from '../components/ui'
import Icon from '../components/Icon'

// Effective point-of-sale tax context per market (indicative, editable below).
const TAX: Record<CountryId, { rate: number; label: string; note: string }> = {
  IN: { rate: 0.43, label: 'GST 28% + cess', note: 'GST 28% plus compensation cess 1–22% by size/fuel (SUVs ≈ 50% all-in); small cars carry less.' },
  EU: { rate: 0.21, label: 'VAT ≈21%', note: 'VAT 17–27% by member state, plus national CO₂-linked registration taxes in FR/NL/PT and others.' },
  UK: { rate: 0.20, label: 'VAT 20% + VED', note: 'VAT 20%; first-year VED is CO₂-banded (£10 → £5,490), so high-CO₂ uplifts compound at the till.' },
  AU: { rate: 0.10, label: 'GST 10% + LCT', note: 'GST 10%; Luxury Car Tax 33% applies above the threshold (~A$80k, higher for fuel-efficient cars).' },
}

export default function Pricing() {
  // Pricing states its basis: actuals by default (what compliance costs the
  // as-sold fleet); flip to the working scenario to price a plan. The
  // pass-through and tax levers are PRICING decisions — they stay local and
  // never touch the fleet assumptions.
  const [basisSel, setBasisSel] = useState<'actuals' | 'scenario'>('actuals')
  const { pack, tree, parent, scenario, country, meta } = useCompliance(basisSel === 'actuals' ? 'actuals' : 'live')
  const selectedParent = useStore((s) => s.selectedParent)
  const setParent = useStore((s) => s.setParent)
  const patchScenario = useStore((s) => s.patchScenario)
  const [passThrough, setPassThrough] = useState(100)
  const [taxPct, setTaxPct] = useState(Math.round(TAX[country].rate * 100))
  // no credit market (EU) → value headroom at the shadow price (the fine rate)
  const price = scenario.creditPrice ?? pack.creditPrice ?? pack.fineRate
  const tax = taxPct / 100

  const makers = useMemo(() => (tree.children ?? []).filter((c) => c.rawUnits > 0).sort((a, b) => b.fine - a.fine), [tree])
  const totalUnits = makers.reduce((a, c) => a + c.rawUnits, 0)
  const totalFine = makers.reduce((a, c) => a + c.fine, 0)
  const marketPerUnit = totalUnits ? totalFine / totalUnits : 0

  const focus = makers.find((m) => m.label === selectedParent) ?? makers[0]
  const focusPerUnit = focus && focus.rawUnits ? focus.fine / focus.rawUnits : 0
  const focusCreditPerUnit = focus && focus.gap < 0 ? -focus.gap * price : 0
  const uplift = focusPerUnit * (passThrough / 100)

  // model ladder: marginal per-unit burden vs the maker's own limit
  const ladder = useMemo(() => {
    if (!focus) return []
    return (parent.children ?? [])
      .filter((m) => m.rawUnits > 0)
      .map((m) => {
        const delta = m.avgMetric - parent.limit // + = burden, − = credit generator
        const burden = delta > 0 ? delta * pack.fineRate : 0
        const credit = delta < 0 ? -delta * price : 0
        return { model: m.label, units: m.rawUnits, metric: m.avgMetric, delta, burden, credit }
      })
      .sort((a, b) => b.burden - a.burden || b.credit - a.credit)
  }, [parent, pack, price, focus])
  const maxBurden = Math.max(...ladder.map((l) => Math.max(l.burden, l.credit)), 1)

  return (
    <div className="space-y-5">
      {/* KPI band */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat className="rise" label="Market compliance cost" value={fmtMoney(marketPerUnit, pack.currency)} sub={`per car sold · ${scenario.year}`} accent={marketPerUnit > 0 ? 'text-danger' : 'text-safe'} />
        <Stat className="rise [animation-delay:50ms]" label={`${focus?.label.split(' ')[0] ?? '—'} cost / car`} value={fmtMoney(focusPerUnit, pack.currency)} sub={focus?.status === 'fine' ? 'fine ÷ units' : 'compliant — no fine'} accent={focusPerUnit > 0 ? 'text-danger' : 'text-safe'} />
        <Stat className="rise [animation-delay:100ms]" label="Credit value / car" value={fmtMoney(focusCreditPerUnit, pack.currency)} sub={focusCreditPerUnit > 0 ? 'headroom × credit price' : 'no surplus at current mix'} accent={focusCreditPerUnit > 0 ? 'text-safe' : undefined} />
        <Stat className="rise [animation-delay:150ms]" label="Sticker uplift needed" value={fmtMoney(uplift, pack.currency)} sub={`at ${passThrough}% pass-through`} />
        <Stat className="rise [animation-delay:200ms]" label="On-road uplift" value={fmtMoney(uplift * (1 + tax), pack.currency)} sub={`incl. ${TAX[country].label}`} />
      </div>

      {/* basis + reporting year */}
      <div className="rise card flex flex-wrap items-center gap-2 p-4 [animation-delay:180ms]">
        <BasisChip basis={basisSel === 'actuals' ? 'actuals' : 'live'} meta={basisSel === 'actuals' ? meta : undefined} />
        <span className="flex items-center gap-0.5 rounded-lg bg-black/[0.04] p-0.5">
          {(['actuals', 'scenario'] as const).map((b) => (
            <button key={b} onClick={() => setBasisSel(b)}
              className={`rounded-md px-2 py-0.5 text-[10px] font-semibold transition ${basisSel === b ? 'bg-white text-ink-100 shadow-sm' : 'text-ink-500 hover:text-ink-100'}`}>
              {b === 'actuals' ? 'Actuals' : 'Working scenario'}
            </button>
          ))}
        </span>
        <span className="h-5 w-px bg-black/[0.07]" />
        <span className="label flex items-center gap-1.5 text-ink-400"><Icon name="clock" size={13} /> Year</span>
        {pack.years.map((y) => (
          <button key={y} onClick={() => patchScenario({ year: y })}
            className={`num rounded-lg px-2.5 py-1 text-xs font-bold transition ${y === scenario.year ? 'bg-ink-100 text-white' : 'bg-black/5 text-ink-500 hover:text-ink-100'}`}>{y}</button>
        ))}
      </div>

      {/* India's stepped penalty: improvements only monetise at tier boundaries */}
      {country === 'IN' && focus && (() => {
        const units = focus.rawUnits
        const gap = focus.gap
        const tiers = [
          { label: 'Gap > 0.2 L/100km', fine: 50_000 * units, active: gap > 0.2, desc: '₹50,000 × every vehicle' },
          { label: 'Gap ≤ 0.2 L/100km', fine: 25_000 * units, active: gap > 0 && gap <= 0.2, desc: '₹25,000 × every vehicle' },
          { label: 'Under the line', fine: 0, active: gap <= 0, desc: 'no penalty · credits accrue' },
        ]
        return (
          <div className="rise card p-4 [animation-delay:190ms]" data-testid="fine-staircase">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="label text-ink-400">EC Act 2022 · the fine is a STAIRCASE, not a slope — {focus.label.split(' ')[0]} · {scenario.year}</span>
              <span className="num text-[11px] text-ink-500">current gap {gap > 0 ? '+' : ''}{fmtNum(gap, 2)} L/100km</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {tiers.map((t) => (
                <div key={t.label} className={`rounded-xl border p-3 transition ${t.active ? (t.fine > 0 ? 'border-danger/40 bg-danger/[0.06] ring-1 ring-danger/30' : 'border-safe/40 bg-safe/[0.06] ring-1 ring-safe/30') : 'border-black/[0.06] bg-black/[0.015] opacity-70'}`}>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">{t.label}{t.active && <span className={`ml-1.5 rounded-full px-1.5 py-px text-[8.5px] font-black ${t.fine > 0 ? 'bg-danger text-white' : 'bg-safe text-white'}`}>NOW</span>}</div>
                  <div className={`dnum mt-1 text-[19px] font-bold ${t.fine > 0 ? 'text-danger' : 'text-safe'}`}>{fmtMoney(t.fine, pack.currency)}</div>
                  <div className="text-[10px] text-ink-500">{t.desc}</div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[10.5px] leading-relaxed text-ink-500">Marginal improvements don't reduce the penalty until the gap crosses a tier — cutting {focus.label.split(' ')[0]}'s gap below 0.2 halves the bill; only clearing the line zeroes it. Plan to a boundary, not to a slope.</p>
          </div>
        )
      })()}

      {/* levers */}
      <div className="rise card flex flex-wrap items-center gap-6 p-4 [animation-delay:200ms]">
        <label className="min-w-[220px] flex-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="label text-ink-400">Cost pass-through to price</span>
            <span className="num font-bold text-brand">{passThrough}%</span>
          </div>
          <input type="range" min={0} max={100} step={5} value={passThrough} onChange={(e) => setPassThrough(parseInt(e.target.value))}
            className="mt-1.5 w-full" style={{ ['--fill' as string]: `${passThrough}%` }} />
        </label>
        <label className="min-w-[220px] flex-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="label text-ink-400">Effective point-of-sale tax</span>
            <span className="num font-bold text-brand">{taxPct}%</span>
          </div>
          <input type="range" min={0} max={60} step={1} value={taxPct} onChange={(e) => setTaxPct(parseInt(e.target.value))}
            className="mt-1.5 w-full" style={{ ['--fill' as string]: `${(taxPct / 60) * 100}%` }} />
        </label>
        <p className="max-w-[360px] text-[10.5px] leading-relaxed text-ink-500"><Icon name="alert" size={11} className="mr-1 inline text-warn" />{TAX[country].note}</p>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        {/* maker economics */}
        <Section title={`Compliance cost per car · ${scenario.year}`} right={<span className="text-[11px] text-ink-500">click a maker to load its ladder</span>}>
          <div className="max-h-[46vh] overflow-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 z-10 bg-[#FFFEFB]/95 backdrop-blur">
                <tr className="border-b border-black/[0.08] text-[10px] font-semibold uppercase tracking-wide text-ink-500">
                  <th className="px-3 py-2">Manufacturer</th>
                  <th className="px-3 py-2 text-right">Units</th>
                  <th className="px-3 py-2 text-right">Fine</th>
                  <th className="px-3 py-2 text-right">Cost / car</th>
                  <th className="px-3 py-2 text-right">On-road uplift</th>
                </tr>
              </thead>
              <tbody>
                {makers.map((m) => {
                  const per = m.rawUnits ? m.fine / m.rawUnits : 0
                  const active = m.label === focus?.label
                  return (
                    <tr key={m.label} onClick={() => setParent(m.label)}
                      className={`cursor-pointer border-b border-black/[0.04] transition-colors ${active ? 'bg-brand/[0.06]' : 'odd:bg-black/[0.012] hover:bg-brand/[0.04]'}`}>
                      <td className="whitespace-nowrap px-3 py-2 font-medium text-ink-100">{m.label}</td>
                      <td className="num px-3 py-2 text-right text-ink-300">{fmtInt(m.rawUnits)}</td>
                      <td className={`num px-3 py-2 text-right font-semibold ${m.fine > 0 ? 'text-danger' : 'text-safe'}`}>{m.fine > 0 ? fmtMoney(m.fine, pack.currency) : '—'}</td>
                      <td className={`num px-3 py-2 text-right font-bold ${per > 0 ? 'text-danger' : 'text-safe'}`}>{per > 0 ? fmtMoney(per, pack.currency) : fmtMoney(0, pack.currency)}</td>
                      <td className="num px-3 py-2 text-right font-semibold text-ink-100">{fmtMoney(per * (passThrough / 100) * (1 + tax), pack.currency)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Section>

        {/* model price ladder */}
        <Section title={`Price ladder · ${focus?.label ?? ''}`}
          right={<span className="num text-[11px] text-ink-500">marginal, at {pack.currency}{fmtNum(pack.fineRate, 0)}/{pack.metricUnit}·car</span>}>
          <div className="max-h-[46vh] space-y-1.5 overflow-auto pr-1">
            {ladder.map((l) => {
              const money = l.burden > 0 ? l.burden : l.credit
              const incl = l.burden * (passThrough / 100) * (1 + tax)
              return (
                <div key={l.model} className="flex items-center gap-2 text-[11.5px]">
                  <span className="w-36 truncate font-medium text-ink-100">{l.model}</span>
                  <span className="num w-16 text-right text-ink-500">{fmtInt(l.units)}</span>
                  <div className="relative h-3.5 flex-1 overflow-hidden rounded bg-black/[0.04]">
                    <div className={`absolute top-0 h-full ${l.burden > 0 ? 'left-1/2 bg-danger/70' : 'right-1/2 bg-safe/70'}`}
                      style={{ width: `${Math.min(50, (money / maxBurden) * 50)}%` }} />
                    <span className="absolute left-1/2 top-0 h-full w-px bg-black/20" />
                  </div>
                  <span className={`num w-24 text-right font-semibold ${l.burden > 0 ? 'text-danger' : 'text-safe'}`}>
                    {l.burden > 0 ? `+${fmtMoney(incl, pack.currency)}` : l.credit > 0 ? `−${fmtMoney(l.credit, pack.currency)}` : '—'}
                  </span>
                </div>
              )
            })}
            {ladder.length === 0 && <p className="py-6 text-center text-xs text-ink-500">No models with volume for this maker-year.</p>}
          </div>
          <p className="mt-3 text-[10.5px] leading-relaxed text-ink-500">
            Red = per-car burden priced on-road at your pass-through and tax; green = credit value the model generates per car (headroom × credit price).
            {pack.fineFor ? ' Statutory fines here are stepped — model-level figures use the linear-equivalent rate; maker totals are exact.' : ''}
          </p>
        </Section>
      </div>
    </div>
  )
}
