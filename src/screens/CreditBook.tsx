// ───────────────────────────────────────────────────────────────────────────
// CREDIT BOOK — the compliance position ledger, flagship edition.
//   · KPI band with live count-ups
//   · CREDIT MARKET MAP: sellers' surplus streams to buyers' deficits along
//     animated flow links (greedy largest-to-largest allocation, engine
//     balances only). Nodes wear company logos; click a flow to load that
//     pair into the settlement planner.
//   · Maker ledger with brand identity and staggered row entrances
//   · Banked cumulative positions · buyer×seller settlement planner
// A ledger is a record of fact: defaults to the ACTUALS basis; the working
// scenario is an explicit overlay. Where a regime has no credit market (EU
// pools rather than trades) positions are valued at the shadow price (= the
// fine one unit of surplus would extinguish). prefers-reduced-motion stills
// the flows; every number stays engine-computed.
// ───────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { useStore, defaultScenario } from '../state/store'
import { useCompliance } from '../lib/useCompliance'
import { standings, type Standing } from '../engine/pooling'
import { fmtInt, fmtMoney, fmtNum } from '../engine/engine'
import { Stat, Section, BasisChip } from '../components/ui'
import BrandChip from '../components/BrandChip'
import { brandLogoUrl, brandInitials, brandColor } from '../lib/brands'
import { useCountUp } from '../lib/useCountUp'
import Icon from '../components/Icon'

const short = (name: string) => name.split(/\s+/).slice(0, 2).join(' ')

// ── the credit market map ────────────────────────────────────────────────────
interface Flow { seller: string; buyer: string; qty: number }

/** Greedy largest-to-largest allocation of surplus to deficit — the natural
 *  clearing illustration (engine balances in, flows out; no invented volume). */
function allocate(sellers: Standing[], buyers: Standing[]): Flow[] {
  const s = sellers.map((x) => ({ name: x.parent, left: x.creditBalance })).sort((a, b) => b.left - a.left)
  const b = buyers.map((x) => ({ name: x.parent, need: -x.creditBalance })).sort((a, b) => b.need - a.need)
  const flows: Flow[] = []
  let i = 0, j = 0
  while (i < s.length && j < b.length) {
    const qty = Math.min(s[i].left, b[j].need)
    if (qty > 0) flows.push({ seller: s[i].name, buyer: b[j].name, qty })
    s[i].left -= qty
    b[j].need -= qty
    if (s[i].left <= 1e-9) i++
    if (b[j].need <= 1e-9) j++
  }
  return flows
}

function MarketMap({ sellers, buyers, unit, onPick, picked }: {
  sellers: Standing[]; buyers: Standing[]; unit: string
  onPick: (seller: string, buyer: string) => void
  picked: { seller?: string; buyer?: string }
}) {
  const [hover, setHover] = useState<Flow | null>(null)
  const [failed, setFailed] = useState<Set<string>>(new Set())
  const fail = (n: string) => setFailed((p) => { const x = new Set(p); x.add(n); return x })

  const flows = useMemo(() => allocate(sellers, buyers), [sellers, buyers])
  const W = 860
  const rows = Math.max(sellers.length, buyers.length, 1)
  const H = Math.max(230, 56 + rows * 58)
  const yAt = (i: number, n: number) => 46 + (H - 76) * (n <= 1 ? 0.5 : i / (n - 1))
  const sy = new Map(sellers.map((s, i) => [s.parent, yAt(i, sellers.length)]))
  const by = new Map(buyers.map((b, i) => [b.parent, yAt(i, buyers.length)]))
  const maxQty = Math.max(...flows.map((f) => f.qty), 1)
  const maxBal = Math.max(...sellers.map((s) => s.creditBalance), ...buyers.map((b) => -b.creditBalance), 1)
  const nodeR = (bal: number) => 13 + Math.sqrt(Math.abs(bal) / maxBal) * 11

  if (!sellers.length || !buyers.length) {
    return <p className="py-8 text-center text-xs text-ink-500">{!sellers.length ? 'No surplus this year — a one-sided market has nothing to clear.' : 'No deficits this year — nothing needs to buy.'}</p>
  }

  const isDim = (f: Flow) => hover && !(hover.seller === f.seller && hover.buyer === f.buyer)
  const node = (st: Standing, side: 'seller' | 'buyer') => {
    const x = side === 'seller' ? 96 : W - 96
    const y = (side === 'seller' ? sy : by).get(st.parent)!
    const r = nodeR(st.creditBalance)
    const url = brandLogoUrl(st.parent)
    const bad = !url || failed.has(st.parent)
    const active = picked.seller === st.parent || picked.buyer === st.parent
    const involved = hover && (hover.seller === st.parent || hover.buyer === st.parent)
    return (
      <g key={st.parent} className="cb-node" style={{ opacity: hover && !involved ? 0.35 : 1 }}>
        <circle cx={x} cy={y} r={r} fill={side === 'seller' ? 'rgba(14,159,110,0.10)' : 'rgba(224,72,77,0.10)'}
          stroke={side === 'seller' ? '#0E9F6E' : '#E0484D'} strokeWidth={active ? 3 : 2} />
        <clipPath id={`cb-${side}-${st.parent.replace(/[^a-zA-Z0-9]/g, '')}`}><circle cx={x} cy={y} r={r - 2.5} /></clipPath>
        <circle cx={x} cy={y} r={r - 2.5} fill={bad ? brandColor(st.parent) : '#FFFDF9'} />
        {!bad
          ? <image href={url!} x={x - (r - 2.5) * 0.72} y={y - (r - 2.5) * 0.72} width={(r - 2.5) * 1.44} height={(r - 2.5) * 1.44}
              clipPath={`url(#cb-${side}-${st.parent.replace(/[^a-zA-Z0-9]/g, '')})`} preserveAspectRatio="xMidYMid meet"
              style={{ pointerEvents: 'none' }} onError={() => fail(st.parent)} />
          : <text x={x} y={y + 3} textAnchor="middle" fontSize={Math.max(7, r * 0.7)} fontWeight={800} fill="#fff" style={{ pointerEvents: 'none' }}>{brandInitials(st.parent)}</text>}
        <text x={side === 'seller' ? x - r - 8 : x + r + 8} y={y - 2} textAnchor={side === 'seller' ? 'end' : 'start'} fontSize="10.5" fontWeight={700} fill="#3E382E">{short(st.parent)}</text>
        <text x={side === 'seller' ? x - r - 8 : x + r + 8} y={y + 11} textAnchor={side === 'seller' ? 'end' : 'start'} fontSize="9.5" fill={side === 'seller' ? '#0E7A4E' : '#B3261E'} className="num">
          {st.creditBalance >= 0 ? '+' : '−'}{fmtInt(Math.abs(st.creditBalance))}
        </text>
      </g>
    )
  }

  return (
    <div data-testid="credit-flow" className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 640 }}>
        <text x={96} y={20} textAnchor="middle" fontSize="10" fontWeight={800} letterSpacing="1.5" fill="#0E7A4E">SELLERS · SURPLUS</text>
        <text x={W - 96} y={20} textAnchor="middle" fontSize="10" fontWeight={800} letterSpacing="1.5" fill="#B3261E">BUYERS · DEFICIT</text>
        {/* flows under the nodes */}
        {flows.map((f, i) => {
          const y1 = sy.get(f.seller)!, y2 = by.get(f.buyer)!
          const w = 1.5 + (f.qty / maxQty) * 11
          const d = `M ${96 + 26} ${y1} C ${W * 0.38} ${y1}, ${W * 0.62} ${y2}, ${W - 96 - 26} ${y2}`
          const pickedFlow = picked.seller === f.seller && picked.buyer === f.buyer
          return (
            <g key={i} style={{ cursor: 'pointer', opacity: isDim(f) ? 0.14 : 1, transition: 'opacity .2s' }}
              onMouseEnter={() => setHover(f)} onMouseLeave={() => setHover(null)} onClick={() => onPick(f.seller, f.buyer)}>
              <path d={d} fill="none" stroke="#0E9F6E" strokeOpacity={pickedFlow ? 0.5 : 0.28} strokeWidth={w + 5} strokeLinecap="round" />
              <path d={d} fill="none" stroke={pickedFlow ? '#F2510E' : '#0E9F6E'} strokeWidth={w} strokeLinecap="round" className="cb-flow" />
            </g>
          )
        })}
        {sellers.map((s) => node(s, 'seller'))}
        {buyers.map((b) => node(b, 'buyer'))}
        {/* hover readout */}
        {hover && (() => {
          const y = (sy.get(hover.seller)! + by.get(hover.buyer)!) / 2
          const label = `${short(hover.seller)} → ${short(hover.buyer)} · ${fmtInt(hover.qty)} ${unit}·units`
          const tw = label.length * 6.2 + 18
          return (
            <g style={{ pointerEvents: 'none' }}>
              <rect x={W / 2 - tw / 2} y={y - 13} width={tw} height={24} rx="12" fill="#17140F" opacity="0.94" />
              <text x={W / 2} y={y + 3} textAnchor="middle" fontSize="10.5" fontWeight={700} fill="#EDE6D8" className="num">{label}</text>
            </g>
          )
        })()}
      </svg>
      <p className="mt-1 text-[10.5px] text-ink-500">Greedy largest-to-largest clearing of engine balances — link width = transferable credits. Click a flow to load the pair into the settlement planner.</p>
    </div>
  )
}

// ── the screen ───────────────────────────────────────────────────────────────
export default function CreditBook() {
  const [basisSel, setBasisSel] = useState<'actuals' | 'scenario'>('actuals')
  const { pack, raw, scenario: liveScenario, overrides: liveOverrides, country, meta } = useCompliance()
  const selectedParent = useStore((s) => s.selectedParent)
  const setParent = useStore((s) => s.setParent)
  const [focusYear, setFocusYear] = useState(liveScenario.year)
  const actualsBase = useMemo(() => defaultScenario(country), [country])
  const scenario = basisSel === 'actuals' ? actualsBase : liveScenario
  const overrides = basisSel === 'actuals' ? {} : liveOverrides
  const hasMarket = pack.creditPrice != null
  const price = (basisSel === 'scenario' ? liveScenario.creditPrice : null) ?? pack.creditPrice ?? pack.fineRate
  const priceLabel = hasMarket
    ? (pack.creditPriceLabel ?? `at ${pack.currency}${fmtNum(price, 0)} per unit`)
    : `shadow price = fine rate (${pack.name} pools rather than trades)`

  const byYear = useMemo(() =>
    pack.years.map((year) => ({ year, rows: standings(raw, pack, { ...scenario, year }, overrides) })),
    [raw, pack, scenario, overrides])
  const focus = byYear.find((y) => y.year === focusYear) ?? byYear[0]

  const sellers = focus.rows.filter((r) => r.creditBalance > 0 && r.units > 0)
  const buyers = focus.rows.filter((r) => r.creditBalance < 0 && r.units > 0)
  const surplus = sellers.reduce((a, r) => a + r.creditBalance, 0)
  const deficit = buyers.reduce((a, r) => a + -r.creditBalance, 0)
  const atRisk = buyers.reduce((a, r) => a + r.fine, 0)

  // live count-ups on the headline numbers
  const netA = useCountUp(surplus - deficit)
  const surplusA = useCountUp(surplus)
  const deficitA = useCountUp(deficit)
  const valueA = useCountUp(surplus * price)
  const riskA = useCountUp(atRisk)

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

  // settlement planner (the map's onPick lands here)
  const [buyer, setBuyer] = useState<string>('')
  const [seller, setSeller] = useState<string>('')
  const b = focus.rows.find((r) => r.parent === (buyer || buyers[0]?.parent))
  const s = focus.rows.find((r) => r.parent === (seller || sellers[0]?.parent))
  const qty = b && s ? Math.min(-b.creditBalance, s.creditBalance) : 0
  const cost = qty * price
  const fineAvoided = b ? b.fine * Math.min(1, qty / Math.max(-b.creditBalance, 1e-9)) : 0

  const animKey = `${focus.year}-${basisSel}`

  return (
    <div className="space-y-5">
      {/* KPI band — count-up morphs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat className="rise" label="Net market position" value={`${netA >= 0 ? '+' : '−'}${fmtInt(Math.abs(netA))}`} sub={`${pack.metricUnit}·units · ${focus.year}`} accent={surplus >= deficit ? 'text-safe' : 'text-danger'} />
        <Stat className="rise [animation-delay:50ms]" label="Surplus for sale" value={`+${fmtInt(surplusA)}`} sub={`${sellers.length} sellers`} accent="text-safe" />
        <Stat className="rise [animation-delay:100ms]" label="Deficit to cover" value={`−${fmtInt(deficitA)}`} sub={`${buyers.length} buyers`} accent="text-danger" />
        <Stat className="rise [animation-delay:150ms]" label={hasMarket ? 'Surplus market value' : 'Surplus shadow value'} value={fmtMoney(valueA, pack.currency)} sub={priceLabel} />
        <Stat className="rise [animation-delay:200ms]" label="Fine at risk" value={fmtMoney(riskA, pack.currency)} sub="buyers, if nothing trades" accent={atRisk > 0 ? 'text-danger' : 'text-safe'} />
      </div>

      {/* year strip + basis */}
      <div className="rise card flex flex-wrap items-center gap-2 p-4 [animation-delay:200ms]">
        <BasisChip basis={basisSel === 'actuals' ? 'actuals' : 'live'} meta={basisSel === 'actuals' ? meta : undefined} />
        <span className="flex items-center gap-0.5 rounded-lg bg-black/[0.04] p-0.5">
          {(['actuals', 'scenario'] as const).map((bb) => (
            <button key={bb} onClick={() => setBasisSel(bb)}
              className={`rounded-md px-2 py-0.5 text-[10px] font-semibold transition ${basisSel === bb ? 'bg-white text-ink-100 shadow-sm' : 'text-ink-500 hover:text-ink-100'}`}>
              {bb === 'actuals' ? 'Actuals' : 'Working scenario'}
            </button>
          ))}
        </span>
        <span className="h-5 w-px bg-black/[0.07]" />
        <span className="label flex items-center gap-1.5 text-ink-400"><Icon name="clock" size={13} /> Book year</span>
        {byYear.map(({ year, rows }) => {
          const net = rows.reduce((a, r) => a + r.creditBalance, 0)
          const on = year === focus.year
          return (
            <button key={year} onClick={() => setFocusYear(year)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${on ? 'scale-[1.04] bg-ink-100 text-white shadow-card' : 'bg-black/5 text-ink-500 hover:text-ink-100'}`}>
              {year} <span className={`num text-[10px] ${net >= 0 ? (on ? 'text-safe' : 'text-safe/80') : (on ? 'text-[#FF9A8B]' : 'text-danger/80')}`}>{net >= 0 ? '+' : '−'}{fmtInt(Math.abs(net))}</span>
            </button>
          )
        })}
        <span className="ml-auto flex items-center gap-2 text-[11px] text-ink-500"><span className="chip">{pack.metricUnit}·units</span><span>1 unit of surplus offsets 1 of deficit</span></span>
      </div>

      {/* THE CREDIT MARKET MAP */}
      <Section className="rise [animation-delay:240ms]"
        title={<span className="flex items-center gap-2"><Icon name="activity" size={15} className="text-brand" /> Credit market map · {focus.year}</span>}
        right={<span className="hidden text-[11px] text-ink-500 md:inline">surplus streams to deficit — engine balances, greedy clearing</span>}>
        <div key={animKey} className="screen-in">
          <MarketMap sellers={sellers} buyers={buyers} unit={pack.metricUnit}
            picked={{ seller: seller || sellers[0]?.parent, buyer: buyer || buyers[0]?.parent }}
            onPick={(ss, bb) => { setSeller(ss); setBuyer(bb) }} />
        </div>
      </Section>

      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        {/* maker ledger with brand identity */}
        <Section className="rise [animation-delay:280ms]" title={`Positions · ${focus.year}`} right={<span className="text-[11px] text-ink-500">click a maker to track its banked position</span>}>
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
              <tbody key={animKey}>
                {focus.rows.map((r, i) => {
                  const sellerRow = r.creditBalance > 0
                  const neutral = Math.abs(r.creditBalance) < 1
                  const active = r.parent === selectedParent
                  return (
                    <tr key={r.parent} onClick={() => setParent(r.parent)} style={{ animationDelay: `${Math.min(i * 35, 400)}ms` }}
                      className={`rise cursor-pointer border-b border-black/[0.04] transition-colors ${active ? 'bg-brand/[0.06]' : 'odd:bg-black/[0.012] hover:bg-brand/[0.04]'}`}>
                      <td className="whitespace-nowrap px-3 py-2 font-medium text-ink-100"><span className="flex items-center gap-2"><BrandChip name={r.parent} size={22} />{r.parent}</span></td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${neutral ? 'bg-black/[0.06] text-ink-400' : sellerRow ? 'bg-safe/10 text-safe' : 'bg-danger/10 text-danger'}`}>
                          {neutral ? 'Neutral' : sellerRow ? 'Seller' : 'Buyer'}
                        </span>
                      </td>
                      <td className="num px-3 py-2 text-right text-ink-300">{fmtInt(r.units)}</td>
                      <td className={`num px-3 py-2 text-right font-semibold ${r.gap > 0 ? 'text-danger' : 'text-safe'}`}>{r.gap > 0 ? '+' : ''}{fmtNum(r.gap, 2)}</td>
                      <td className={`num px-3 py-2 text-right font-bold ${sellerRow ? 'text-safe' : neutral ? 'text-ink-400' : 'text-danger'}`}>{r.creditBalance >= 0 ? '+' : '−'}{fmtInt(Math.abs(r.creditBalance))}</td>
                      <td className="num px-3 py-2 text-right font-semibold text-ink-100">
                        {sellerRow ? fmtMoney(r.creditBalance * price, pack.currency) : neutral ? '—' : fmtMoney(r.fine, pack.currency)}
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
          <Section className="rise [animation-delay:320ms]" title={<span className="flex items-center gap-2"><BrandChip name={selectedParent} size={20} /> Banked position · {short(selectedParent)}</span>}>
            <div className="space-y-1.5">
              {bank.map(({ year, bal, cum }) => (
                <div key={year} className="flex items-center gap-2 text-[11px]">
                  <span className="num w-9 text-ink-500">{year}</span>
                  <div className="relative h-3.5 flex-1 overflow-hidden rounded bg-black/[0.04]">
                    <div className={`absolute top-0 h-full transition-all duration-500 ${bal >= 0 ? 'left-1/2 bg-safe/70' : 'right-1/2 bg-danger/70'}`}
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

          {/* settlement planner */}
          <Section className="rise [animation-delay:360ms]" title={hasMarket ? 'Trade planner' : 'Pool settlement planner'} right={<span className="num text-[11px] text-ink-500">{pack.currency}{fmtNum(price, 0)}/unit{hasMarket ? '' : ' (shadow)'}</span>}>
            {buyers.length && sellers.length ? (
              <div className="space-y-3">
                {/* the pair, with identity + an animated settlement flow */}
                <div className="flex items-center justify-between rounded-xl border border-black/[0.06] bg-black/[0.02] px-3 py-2.5">
                  <span className="flex min-w-0 items-center gap-2"><BrandChip name={(seller || sellers[0]?.parent) ?? ''} size={26} /><span className="truncate text-[11px] font-bold text-ink-100">{short((seller || sellers[0]?.parent) ?? '')}</span></span>
                  <svg viewBox="0 0 90 16" className="mx-2 h-4 w-[90px] shrink-0"><path d="M2 8 H82" stroke="#0E9F6E" strokeWidth="2.5" strokeLinecap="round" className="cb-flow" /><path d="M78 3 L86 8 L78 13 Z" fill="#0E9F6E" /></svg>
                  <span className="flex min-w-0 items-center gap-2"><span className="truncate text-[11px] font-bold text-ink-100">{short((buyer || buyers[0]?.parent) ?? '')}</span><BrandChip name={(buyer || buyers[0]?.parent) ?? ''} size={26} /></span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Seller
                    <select value={seller || sellers[0]?.parent} onChange={(e) => setSeller(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs font-semibold text-ink-100 outline-none">
                      {sellers.map((r) => <option key={r.parent} value={r.parent}>{short(r.parent)}</option>)}
                    </select>
                  </label>
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Buyer
                    <select value={buyer || buyers[0]?.parent} onChange={(e) => setBuyer(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs font-semibold text-ink-100 outline-none">
                      {buyers.map((r) => <option key={r.parent} value={r.parent}>{short(r.parent)}</option>)}
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
