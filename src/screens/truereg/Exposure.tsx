// ───────────────────────────────────────────────────────────────────────────
// EXPOSURE — whose money, and how much of it.
//
// The mill carries no CBAM obligation, so every figure on this screen belongs
// to somebody else: the EU importer who surrenders certificates against these
// tonnes. That framing decides the whole layout — per contract, per EORI, in
// euros, against the default the buyer would otherwise use.
//
// Two things this screen refuses to flatter. The free-allocation factor is
// stated on every row, because a 2026 delta is a small fraction of the same
// delta later. And Article 9 is answered plainly: the Chinese ETS payment the
// mill genuinely makes does not currently reduce anybody's surrender.
// ───────────────────────────────────────────────────────────────────────────
import { useMemo } from 'react'
import { useTr } from '../../truereg/ui/state'
import { calculateAll } from '../../truereg/cbam/emissions'
import { computeDelta } from '../../truereg/cbam/delta'
import { assessArticle9 } from '../../truereg/cbam/article9'
import { DEMO_BUNDLE, DEMO_CONTRACTS } from '../../truereg/record/demo'
import Icon from '../../components/Icon'
import { Bi, Big, ClauseChip, Figure, Lede, Panel, Scroller, TermChip, Unit, eur, n0, n2 } from './parts'

const PRICE = { eur: 78, asOf: '2026-09-01', source: 'Assumed, tracking the EU ETS auction price', status: 'assumed' as const }

export default function Exposure() {
  const substitute = useTr((s) => s.substituteDefaults)
  const { delta, a9, horizon } = useMemo(() => {
    const rows = calculateAll(DEMO_BUNDLE, { substituteDefaultsForUnknownPrecursors: substitute })
    const a9 = assessArticle9(DEMO_BUNDLE.carbonPricesPaid, rows.reduce((a, e) => a + e.attributed, 0))
    const delta = computeDelta(DEMO_CONTRACTS, rows, { price: PRICE, defaultsCountry: 'CN', article9Certificates: a9.deductibleCertificates })
    const live = delta.contracts.filter((c) => !c.blocked)
    const horizon = [2026, 2027, 2028, 2029, 2030, 2032, 2034].map((y) => {
      const f = y >= 2034 ? 1 : ({ 2026: 0.025, 2027: 0.05, 2028: 0.10, 2029: 0.225, 2030: 0.485, 2032: 0.735 } as Record<number, number>)[y] ?? 1
      return { year: y, factor: f, saving: live.reduce((a, c) => a + c.deltaSeePerTonne! * c.tonnes * f * PRICE.eur, 0) }
    })
    return { delta, a9, horizon }
  }, [substitute])

  const peak = Math.max(...horizon.map((h) => h.saving), 1)

  const live = delta.contracts.filter((c) => !c.blocked)
  return (
    <div className="space-y-4 sm:space-y-5">
      <Lede meta={<>
        <span>{live.length} of {delta.contracts.length} contracts priced · {n0(delta.totals.tonnes)} t</span>
        <span>certificates at €{PRICE.eur}/tCO₂e ({PRICE.status})</span>
        {a9.deductibleCertificates === 0 && <span className="text-danger">no Article 9 deduction</span>}
      </>}>
        {live.length === 0
          ? <>No contract has a <Big tone="danger">determinable</Big> figure yet — every tonne surrenders on defaults.</>
          : <>Verified actuals save your EU buyers <Big tone="safe">{eur(delta.totals.buyerSavingEur)}</Big> this period,
              and <Big tone="brand">{eur(horizon[horizon.length - 1].saving)}</Big> <Unit>a year once free allocation is gone.</Unit></>}
      </Lede>

      <Panel
        title="What proving the number is worth"
        titleZh="证明该数值的价值"
        hint={<>The duty sits on your buyer, not on this installation. Every figure below is the importer’s surrender under a <TermChip id="default-value">default value</TermChip> versus your verified actuals.</>}
        right={<ClauseChip ids={['cbam.art6', 'cbam.free-allocation-factor']} />}
      >
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
          <Figure label="Buyer saving, this period" labelZh="本期买方节省" tone="safe" value={eur(delta.totals.buyerSavingEur)}
            sub={<>across {delta.contracts.filter((c) => !c.blocked).length} contract(s)</>} />
          <Figure label="Certificates avoided" labelZh="减少的证书" value={n0(delta.totals.certificatesAvoided)} unit="units"
            sub={<>at €{PRICE.eur}/tCO₂e ({PRICE.status})</>} />
          <Figure label="Tonnes covered" labelZh="覆盖吨数" value={n0(delta.totals.tonnes)} unit="t"
            sub={delta.totals.blockedCount > 0 ? <span className="text-warn">{delta.totals.blockedCount} contract(s) still on defaults</span> : 'every contract priced'} />
          <Figure label="Same delta in 2034" labelZh="同等差额于2034年" tone="blue" value={eur(horizon[horizon.length - 1].saving)}
            sub="once free allocation is fully withdrawn" />
        </div>
      </Panel>

      <Panel
        title="Per contract, per EORI"
        titleZh="按合同与EORI"
        hint="Each buyer’s own exposure. Disclosure is keyed to the EORI, so no buyer ever sees another’s tonnage or price."
      >
        <Scroller>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-black/[0.08]">
                {['Buyer', 'Tonnes', 'Default', 'Actual', 'Δ /t', 'Factor', 'Buyer saving'].map((h, i) => (
                  <th key={h} className={`pb-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-500 ${i > 0 ? 'pl-3 text-right' : 'pr-3'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {delta.contracts.map((c) => (
                <tr key={c.contractId} className="border-b border-black/[0.05] last:border-0">
                  <td className="py-3 pr-3 align-top">
                    <div className="text-[12.5px] font-semibold text-ink-100">{c.buyerName}</div>
                    <div className="mono mt-0.5 text-[10.5px] text-ink-500">{c.eori ?? 'no EORI on file'} · {c.buyerCountry} · {c.year}</div>
                    {c.blocked && <div className="mt-1.5 max-w-[46ch] text-[11px] leading-relaxed text-warn">{c.blocked}</div>}
                  </td>
                  <td className="dnum py-3 pl-3 text-right align-top text-[12.5px] text-ink-300">{n0(c.tonnes)}</td>
                  <td className="dnum py-3 pl-3 text-right align-top text-[12.5px] text-ink-400">{c.defaultSee == null ? '—' : n2(c.defaultSee)}</td>
                  <td className="dnum py-3 pl-3 text-right align-top text-[12.5px] font-bold text-ink-100">{c.actualSee == null ? '—' : n2(c.actualSee)}</td>
                  <td className={`dnum py-3 pl-3 text-right align-top text-[12.5px] font-bold ${(c.deltaSeePerTonne ?? 0) > 0 ? 'text-safe' : 'text-ink-500'}`}>{c.deltaSeePerTonne == null ? '—' : `−${n2(c.deltaSeePerTonne)}`}</td>
                  <td className="dnum py-3 pl-3 text-right align-top text-[11.5px] text-ink-500" data-tip="Share of the surrender not waived by remaining EU free allocation in the delivery year.">{n2(c.freeAllocationFactor * 100, 1)}%</td>
                  <td className="dnum py-3 pl-3 text-right align-top">
                    <div className={`text-[13px] font-bold ${c.buyerSavingEur ? 'text-safe' : 'text-ink-500'}`}>{c.buyerSavingEur == null ? '—' : eur(c.buyerSavingEur)}</div>
                    {c.savingPerTonneEur != null && <div className="mt-0.5 text-[10.5px] text-ink-500">€{n2(c.savingPerTonneEur)}/t{c.savingAsShareOfContract != null && ` · ${n2(c.savingAsShareOfContract * 100, 2)}% of value`}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Scroller>
      </Panel>

      <Panel
        title="The same delta, as free allocation is withdrawn"
        titleZh="随免费配额退坡的同一差额"
        hint="Volumes and emissions held constant. Only the free-allocation factor moves — which is why an early number understates what this is worth."
        right={<ClauseChip ids={['cbam.free-allocation-factor']} />}
      >
        <ul className="space-y-2">
          {horizon.map((h, i) => (
            <li key={h.year} className="flex items-center gap-3" style={{ animation: `rise .5s cubic-bezier(.2,.7,.2,1) ${i * 40}ms backwards` }}>
              <span className="dnum w-10 shrink-0 text-[12px] font-bold text-ink-400">{h.year}</span>
              <span className="h-6 flex-1 overflow-hidden rounded-md bg-black/[0.035]">
                <span className="block h-full rounded-md transition-all duration-500"
                  style={{ width: `${Math.max(1.5, (h.saving / peak) * 100)}%`, background: h.year <= 2027 ? 'linear-gradient(90deg,#B3A892,#DBD2BF)' : 'linear-gradient(90deg,#0E9F6E,#5ED2A8)' }} />
              </span>
              <span className="dnum w-24 shrink-0 text-right text-[12px] font-bold text-ink-200">{eur(h.saving)}</span>
              <span className="dnum hidden w-12 shrink-0 text-right text-[10.5px] text-ink-500 sm:block">{n2(h.factor * 100, 1)}%</span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel
        title="Article 9 — the carbon price you already pay"
        titleZh="第9条 — 您已支付的碳价"
        right={<ClauseChip ids={['cbam.art9']} />}
      >
        <div className={`rounded-2xl border p-4 ${a9.deductibleCertificates > 0 ? 'border-safe/25 bg-safe/[0.04]' : 'border-danger/25 bg-danger/[0.035]'}`}>
          <div className="flex items-start gap-3">
            <Icon name={a9.deductibleCertificates > 0 ? 'check' : 'close'} size={17} className={`mt-0.5 shrink-0 ${a9.deductibleCertificates > 0 ? 'text-safe' : 'text-danger'}`} />
            <p className="text-[13.5px] font-semibold leading-relaxed text-ink-100">
              <Bi en={a9.verdictEn} zh={a9.verdictZh} zhClass="text-[12.5px] font-medium" />
            </p>
          </div>
        </div>
        <ul className="mt-3 space-y-2.5">
          {a9.lines.map((l) => (
            <li key={l.scheme} className="rounded-2xl border border-black/[0.06] bg-black/[0.02] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[12.5px] font-bold text-ink-100">{l.scheme}</span>
                <span className={`chip ${l.recognition?.recognised ? '!border-safe/25 !bg-safe/[0.08] !text-safe' : '!border-danger/25 !bg-danger/[0.07] !text-danger'}`}>
                  {l.recognition ? (l.recognition.recognised ? 'Recognised' : 'Not recognised') : 'Undetermined'}
                </span>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[11.5px] text-ink-500">
                <span>Paid <span className="dnum font-semibold text-ink-300">{n0(l.paid)} {l.currency}</span></span>
                <span>Free allocation <span className="dnum font-semibold text-ink-300">{n0(l.freeAllocation)} tCO₂e</span></span>
                <span>Deductible <span className="dnum font-semibold text-ink-300">{n0(l.deductible)}</span> certificates</span>
              </div>
              <p className="mt-2.5 max-w-[76ch] text-[11.5px] leading-relaxed text-ink-400">
                <Bi en={l.reasonEn} zh={l.reasonZh} />
              </p>
              {l.recognition && <p className="mt-2 text-[10.5px] text-ink-500">Determination as of {l.recognition.asOf}. The watch agent re-opens this if it moves.</p>}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  )
}
