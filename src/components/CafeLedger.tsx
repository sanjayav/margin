// ───────────────────────────────────────────────────────────────────────────
// CAFE LEDGER — the master file's regulatory columns (AO–AT), CALCULATED.
// Sanjay's structure ends in six computed columns the workbook leaves blank:
//   P (g/km) · CAFCS (=P/23.7135) · T (g/km) · ACAFC (=T/23.7135) ·
//   +ve Credit / −ve Debit · Compliance
// The engine already computes all of them (its India metric IS CAFCS, its
// limit IS ACAFC); this table presents them under the exact master headings,
// per manufacturer for the selected reporting year, on the screen's basis
// (actuals on Analyse, working scenario on the Model workbench) — and exports
// a CSV whose header row is the master structure verbatim.
// ───────────────────────────────────────────────────────────────────────────
import { useMemo } from 'react'
import { useCompliance, type Basis } from '../lib/useCompliance'
import { fmtNum, fmtInt } from '../engine/engine'
import { Section, BasisChip } from './ui'
import Icon from './Icon'

const PETROL_DIV = 23.7135 // BEE: g CO₂/km → petrol-equivalent L/100km

export default function CafeLedger({ basis }: { basis: Basis }) {
  const { pack, tree, scenario, meta } = useCompliance(basis)

  const rows = useMemo(() => (tree.children ?? [])
    .filter((c) => c.rawUnits > 0)
    .map((c) => {
      const cafcs = c.avgMetric            // engine metric = L/100km (petrol-eq)
      const acafc = c.limit
      return {
        parent: c.label,
        units: c.rawUnits,
        P: cafcs * PETROL_DIV,
        cafcs,
        T: acafc * PETROL_DIV,
        acafc,
        credit: acafc - cafcs,             // + = credit, − = debit (master convention)
        status: c.status,
      }
    })
    .sort((a, b) => b.credit - a.credit), [tree])

  const exportCsv = () => {
    // the master structure's own headings, verbatim
    const headers = ['Year', 'Sales Market', 'Regultory Name', 'Annual Corporate Average CO₂ Performance (P) (g/km)', 'CAFCS (= P/23.7135) (L/100 km)', "Manufacturer's Annual Corporate Average CO₂ Target (T) (g/km)", 'ACAFC (= T/23.7135) (L/100 km)', '+ve Credit / -ve Debit', "Manufacturer's Corporate Average CO₂ Compliance"]
    const body = rows.map((r) => [
      scenario.year, 'IN', `"${r.parent}"`,
      r.P.toFixed(3), r.cafcs.toFixed(3), r.T.toFixed(3), r.acafc.toFixed(3), r.credit.toFixed(3),
      r.status === 'exempt' ? 'EXEMPT' : r.credit >= 0 ? 'YES' : 'NO',
    ].join(','))
    const blob = new Blob([[headers.join(','), ...body].join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `cafe-ledger-in-${scenario.year}-${basis}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Section
      className="rise"
      title={<span className="flex items-center gap-2"><Icon name="scale" size={15} className="text-brand" /> CAFE ledger · {scenario.year}</span>}
      right={
        <span className="flex items-center gap-2">
          <BasisChip basis={basis === 'actuals' ? 'actuals' : 'live'} meta={basis === 'actuals' ? meta : undefined} />
          <button onClick={exportCsv} className="btn-ghost px-2.5 py-1 text-[11px]"><Icon name="section" size={12} /> Export (master columns)</button>
        </span>
      }>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs" data-testid="cafe-ledger">
          <thead>
            <tr className="border-b border-black/[0.08] align-bottom text-[9.5px] font-semibold uppercase tracking-wide text-ink-500">
              <th className="py-2 pr-3">Regultory Name</th>
              <th className="py-2 pr-3 text-right">Units</th>
              <th className="py-2 pr-3 text-right">Annual Corporate Average CO₂ Performance (P) <span className="normal-case">(g/km)</span></th>
              <th className="py-2 pr-3 text-right">CAFCS (= P/23.7135) <span className="normal-case">(L/100 km)</span></th>
              <th className="py-2 pr-3 text-right">Corporate Average CO₂ Target (T) <span className="normal-case">(g/km)</span></th>
              <th className="py-2 pr-3 text-right">ACAFC (= T/23.7135) <span className="normal-case">(L/100 km)</span></th>
              <th className="py-2 pr-3 text-right">+ve Credit / −ve Debit</th>
              <th className="py-2 text-right">CO₂ Compliance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.parent} className="border-b border-black/[0.04] odd:bg-black/[0.012]">
                <td className="whitespace-nowrap py-2 pr-3 font-semibold text-ink-100">{r.parent}</td>
                <td className="num py-2 pr-3 text-right text-ink-400">{fmtInt(r.units)}</td>
                <td className="num py-2 pr-3 text-right font-semibold text-ink-100">{fmtNum(r.P, 1)}</td>
                <td className="num py-2 pr-3 text-right text-ink-300">{fmtNum(r.cafcs, 3)}</td>
                <td className="num py-2 pr-3 text-right text-ink-200">{fmtNum(r.T, 1)}</td>
                <td className="num py-2 pr-3 text-right text-ink-300">{fmtNum(r.acafc, 3)}</td>
                <td className={`num py-2 pr-3 text-right font-bold ${r.credit >= 0 ? 'text-safe' : 'text-danger'}`}>{r.credit >= 0 ? '+' : '−'}{fmtNum(Math.abs(r.credit), 3)}</td>
                <td className="py-2 text-right">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${r.status === 'exempt' ? 'bg-warn/10 text-warn' : r.credit >= 0 ? 'bg-safe/10 text-safe' : 'bg-danger/10 text-danger'}`}>
                    {r.status === 'exempt' ? 'EXEMPT' : r.credit >= 0 ? 'YES' : 'NO'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2.5 text-[10.5px] leading-relaxed text-ink-500">
        The master structure's computed columns (AO–AT), calculated by the compliance engine: CAFCS is the sales-weighted petrol-equivalent fuel consumption ({basis === 'actuals' ? 'statutory mechanisms only' : 'with the workbench levers applied'}; super-credits and CNF per the BEE draft where enabled), ACAFC is the mass-based standard for this fleet. Credit/debit is ACAFC − CAFCS in L/100 km — the workbook's own sign convention. Unlike the file's illustrative FY2022 rows, EVs are included at 0 g/km, as CAFE requires.
      </p>
    </Section>
  )
}
