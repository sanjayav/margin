// ───────────────────────────────────────────────────────────────────────────
// CREDIT BOOK — the compliance position ledger.
// Everything is computed live from the engine: a maker's credit balance is
// −gap × units in metric-units·vehicles, so value = balance × credit price and
// fine = deficit × fine rate line up exactly with every other screen.
//   · Market positions by year (surplus vs deficit columns)
//   · Maker ledger for the focus year: seller / buyer / neutral, balance, value
//   · Banked position: cumulative multi-year balance for the selected maker
//   · Trade planner: pair a buyer with a seller, price it, show both sides
// ───────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { useStore } from '../state/store'
import { useCompliance } from '../lib/useCompliance'
import { standings } from '../engine/pooling'
import { fmtInt, fmtMoney, fmtNum } from '../engine/engine'
import { Stat, Section } from '../components/ui'
import Icon from '../components/Icon'

const short = (name: string) => name.split(/\s+/).slice(0, 2).join(' ')

export default function CreditBook() {
  const { pack, raw, scenario } = useCompliance()
  const overrides = useStore((s) => s.makerOverrides)
  const selectedParent = useStore((s) => s.selectedParent)
  const setParent = useStore((s) => s.setParent)
  const [focusYear, setFocusYear] = useState(scenario.year)
  // Where the regime has no credit market (EU: pooling only), value positions at
  // the shadow price — the fine one unit of surplus would extinguish.
  const hasMarket = pack.creditPrice != null
  const price = scenario.creditPrice ?? pack.creditPrice ?? pack.fineRate
  const priceLabel = hasMarket
    ? (pack.creditPriceLabel ?? `at ${pack.currency}${fmtNum(price, 0)} per unit`)
    : `shadow price = fine rate (${pack.name} pools rather than trades)`

  // one standings pass per compliance year — the whole book
  const byYear = useMemo(() =>
    pack.years.map((year) => ({ year, rows: standings(raw, pack, { ...scenario, year }, overrides) })),
    [raw, pack, scenario, overrides])
  const focus = byYear.find((y) => y.year === focusYear) ?? byYear[0]

  const sellers = focus.rows.filter((r) => r.creditBalance > 0 && r.units > 0)
  const buyers = focus.rows.filter((r) => r.creditBalance < 0 && r.units > 0)
  const surplus = sellers.reduce((a, r) => a + r.creditBalance, 0)
  const deficit = buyers.reduce((a, r) => a + -r.creditBalance, 0)
  const atRisk = buyers.reduce((a, r) => a + r.fine, 0)

  // banked position: the selected maker's cumulative balance across the years
  const bank = useMemo(() => {
    let cum = 0
    return byYear.map(({ year, rows }) => {
      const r = rows.find((x) => x.parent === selectedParent)
      const bal = r?.creditBalance ?? 0
      cum += bal
      return { year, bal, cum }
    })
  }, [byYear, selectedParent])
  const maxAbs = Math.max(...bank.map((b) => Math.abs(b.bal)), 1)

  // trade planner
  const [buyer, setBuyer] = useState<string>('')
  const [seller, setSeller] = useState<string>('')
  const b = focus.rows.find((r) => r.parent === (buyer || buyers[0]?.parent))
  const s = focus.rows.find((r) => r.parent === (seller || sellers[0]?.parent))
  const qty = b && s ? Math.min(-b.creditBalance, s.creditBalance) : 0
  const cost = qty * price
  // buyer's saving = the fine the transferred credits extinguish, minus the price
  const fineAvoided = b ? b.fine * Math.min(1, qty / Math.max(-b.creditBalance, 1e-9)) : 0

  const unitChip = <span className="chip">{pack.metricUnit}·units</span>

  return (
    <div className="space-y-5">
      {/* KPI band */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat className="rise" label="Net market position" value={`${surplus - deficit >= 0 ? '+' : '−'}${fmtInt(Math.abs(surplus - deficit))}`} sub={`${pack.metricUnit}·units · ${focus.year}`} accent={surplus >= deficit ? 'text-safe' : 'text-danger'} />
        <Stat className="rise [animation-delay:50ms]" label="Surplus for sale" value={`+${fmtInt(surplus)}`} sub={`${sellers.length} sellers`} accent="text-safe" />
        <Stat className="rise [animation-delay:100ms]" label="Deficit to cover" value={`−${fmtInt(deficit)}`} sub={`${buyers.length} buyers`} accent="text-danger" />
        <Stat className="rise [animation-delay:150ms]" label={hasMarket ? 'Surplus market value' : 'Surplus shadow value'} value={fmtMoney(surplus * price, pack.currency)} sub={priceLabel} />
        <Stat className="rise [animation-delay:200ms]" label="Fine at risk" value={fmtMoney(atRisk, pack.currency)} sub="buyers, if nothing trades" accent={atRisk > 0 ? 'text-danger' : 'text-safe'} />
      </div>

      {/* year strip */}
      <div className="rise card flex flex-wrap items-center gap-2 p-4 [animation-delay:200ms]">
        <span className="label flex items-center gap-1.5 text-ink-400"><Icon name="clock" size={13} /> Book year</span>
        {byYear.map(({ year, rows }) => {
          const net = rows.reduce((a, r) => a + r.creditBalance, 0)
          const on = year === focus.year
          return (
            <button key={year} onClick={() => setFocusYear(year)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${on ? 'bg-ink-100 text-white' : 'bg-black/5 text-ink-500 hover:text-ink-100'}`}>
              {year} <span className={`num text-[10px] ${net >= 0 ? (on ? 'text-safe' : 'text-safe/80') : (on ? 'text-[#FF9A8B]' : 'text-danger/80')}`}>{net >= 0 ? '+' : '−'}{fmtInt(Math.abs(net))}</span>
            </button>
          )
        })}
        <span className="ml-auto flex items-center gap-2 text-[11px] text-ink-500">{unitChip}<span>1 unit·{pack.metricUnit} of surplus offsets 1 of deficit</span></span>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        {/* maker ledger */}
        <Section title={`Positions · ${focus.year}`} right={<span className="text-[11px] text-ink-500">click a maker to track its banked position</span>}>
          <div className="max-h-[46vh] overflow-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 z-10 bg-[#FFFEFB]/95 backdrop-blur">
                <tr className="border-b border-black/[0.08] text-[10px] font-semibold uppercase tracking-wide text-ink-500">
                  <th className="px-3 py-2">Manufacturer</th>
                  <th className="px-3 py-2">Side</th>
                  <th className="px-3 py-2 text-right">Units</th>
                  <th className="px-3 py-2 text-right">Gap {pack.metricUnit}</th>
                  <th className="px-3 py-2 text-right">Balance</th>
                  <th className="px-3 py-2 text-right">Value / exposure</th>
                </tr>
              </thead>
              <tbody>
                {focus.rows.map((r) => {
                  const seller = r.creditBalance > 0
                  const neutral = Math.abs(r.creditBalance) < 1
                  const active = r.parent === selectedParent
                  return (
                    <tr key={r.parent} onClick={() => setParent(r.parent)}
                      className={`cursor-pointer border-b border-black/[0.04] transition-colors ${active ? 'bg-brand/[0.06]' : 'odd:bg-black/[0.012] hover:bg-brand/[0.04]'}`}>
                      <td className="whitespace-nowrap px-3 py-2 font-medium text-ink-100">{r.parent}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${neutral ? 'bg-black/[0.06] text-ink-400' : seller ? 'bg-safe/10 text-safe' : 'bg-danger/10 text-danger'}`}>
                          {neutral ? 'Neutral' : seller ? 'Seller' : 'Buyer'}
                        </span>
                      </td>
                      <td className="num px-3 py-2 text-right text-ink-300">{fmtInt(r.units)}</td>
                      <td className={`num px-3 py-2 text-right font-semibold ${r.gap > 0 ? 'text-danger' : 'text-safe'}`}>{r.gap > 0 ? '+' : ''}{fmtNum(r.gap, 2)}</td>
                      <td className={`num px-3 py-2 text-right font-bold ${seller ? 'text-safe' : neutral ? 'text-ink-400' : 'text-danger'}`}>{r.creditBalance >= 0 ? '+' : '−'}{fmtInt(Math.abs(r.creditBalance))}</td>
                      <td className="num px-3 py-2 text-right font-semibold text-ink-100">
                        {seller ? fmtMoney(r.creditBalance * price, pack.currency) : neutral ? '—' : fmtMoney(r.fine, pack.currency)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Section>

        <div className="space-y-5">
          {/* banked position */}
          <Section title={`Banked position · ${short(selectedParent)}`}>
            <div className="space-y-1.5">
              {bank.map(({ year, bal, cum }) => (
                <div key={year} className="flex items-center gap-2 text-[11px]">
                  <span className="num w-9 text-ink-500">{year}</span>
                  <div className="relative h-3.5 flex-1 overflow-hidden rounded bg-black/[0.04]">
                    <div className={`absolute top-0 h-full ${bal >= 0 ? 'left-1/2 bg-safe/70' : 'right-1/2 bg-danger/70'}`}
                      style={{ width: `${Math.min(50, (Math.abs(bal) / maxAbs) * 50)}%` }} />
                    <span className="absolute left-1/2 top-0 h-full w-px bg-black/20" />
                  </div>
                  <span className={`num w-20 text-right font-semibold ${bal >= 0 ? 'text-safe' : 'text-danger'}`}>{bal >= 0 ? '+' : '−'}{fmtInt(Math.abs(bal))}</span>
                  <span className={`num w-20 text-right ${cum >= 0 ? 'text-ink-300' : 'text-danger'}`}>Σ {cum >= 0 ? '+' : '−'}{fmtInt(Math.abs(cum))}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[10.5px] leading-relaxed text-ink-500">
              Cumulative carry-forward is indicative — banking/borrowing windows differ by regime ({pack.name}: {pack.credits.split('.')[0].toLowerCase()}).
            </p>
          </Section>

          {/* trade planner */}
          <Section title={hasMarket ? 'Trade planner' : 'Pool settlement planner'} right={<span className="num text-[11px] text-ink-500">{pack.currency}{fmtNum(price, 0)}/unit{hasMarket ? '' : ' (shadow)'}</span>}>
            {buyers.length && sellers.length ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Buyer
                    <select value={buyer || buyers[0]?.parent} onChange={(e) => setBuyer(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs font-semibold text-ink-100 outline-none">
                      {buyers.map((r) => <option key={r.parent} value={r.parent}>{short(r.parent)}</option>)}
                    </select>
                  </label>
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Seller
                    <select value={seller || sellers[0]?.parent} onChange={(e) => setSeller(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs font-semibold text-ink-100 outline-none">
                      {sellers.map((r) => <option key={r.parent} value={r.parent}>{short(r.parent)}</option>)}
                    </select>
                  </label>
                </div>
                <div className="rounded-xl border border-black/[0.06] bg-black/[0.02] p-3 text-[11.5px]">
                  <div className="flex justify-between"><span className="text-ink-500">Transferable credits</span><span className="num font-bold text-ink-100">{fmtInt(qty)}</span></div>
                  <div className="mt-1 flex justify-between"><span className="text-ink-500">Settlement at market price</span><span className="num font-bold text-ink-100">{fmtMoney(cost, pack.currency)}</span></div>
                  <div className="mt-1 flex justify-between"><span className="text-ink-500">Buyer's fine extinguished</span><span className="num font-bold text-safe">{fmtMoney(fineAvoided, pack.currency)}</span></div>
                  <div className="mt-2 flex justify-between border-t border-black/[0.07] pt-2">
                    <span className="font-semibold text-ink-200">Buyer nets</span>
                    <span className={`num font-bold ${fineAvoided - cost >= 0 ? 'text-safe' : 'text-danger'}`}>{fineAvoided - cost >= 0 ? '+' : '−'}{fmtMoney(Math.abs(fineAvoided - cost), pack.currency)}</span>
                  </div>
                </div>
                <p className="text-[10.5px] leading-relaxed text-ink-500">{pack.credits}</p>
              </div>
            ) : (
              <p className="py-4 text-center text-xs text-ink-500">{buyers.length === 0 ? 'No deficits this year — nothing to buy.' : 'No surplus this year — nothing to sell.'}</p>
            )}
          </Section>
        </div>
      </div>
    </div>
  )
}
