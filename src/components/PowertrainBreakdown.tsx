import { useMemo } from 'react'
import type { Aggregate, RulePack, Scenario } from '../engine/types'
import { fmtInt, fmtNum } from '../engine/engine'

const PT_COLOR: Record<string, string> = {
  BEV: '#3ddc97', PHEV: '#5b8def', HEV: '#8b7ff0', MHEV: '#ffb454', ICE: '#ff5d6c', 'Strong Hybrid': '#8b7ff0',
}
const ptColor = (p: string) => PT_COLOR[p] ?? '#8C8273'

interface Row { pt: string; rawUnits: number; effUnits: number; avg: number; contribution: number; share: number }

/** How the sales-weighted fleet average is built, per powertrain. The
 *  contributions sum to the fleet figure — the visual "how we got this number". */
export default function PowertrainBreakdown({ agg, pack, scenario }: { agg: Aggregate; pack: RulePack; scenario: Scenario }) {
  const rows = useMemo<Row[]>(() => {
    const by = new Map<string, { raw: number; eff: number; w: number }>()
    let totalRaw = 0, totalEff = 0
    for (const v of agg.vehicles) {
      const eff = pack.vehicleUnits(v, scenario)
      const m = pack.vehicleMetric(v, scenario)
      const cur = by.get(v.powertrain) ?? { raw: 0, eff: 0, w: 0 }
      cur.raw += v.sales; cur.eff += eff; cur.w += m * eff
      by.set(v.powertrain, cur)
      totalRaw += v.sales; totalEff += eff
    }
    return [...by.entries()]
      .map(([pt, c]) => ({ pt, rawUnits: c.raw, effUnits: c.eff, avg: c.eff ? c.w / c.eff : 0, contribution: totalEff ? c.w / totalEff : 0, share: totalRaw ? c.raw / totalRaw : 0 }))
      .sort((a, b) => b.rawUnits - a.rawUnits)
  }, [agg, pack, scenario])

  const maxContribution = Math.max(...rows.map((r) => r.contribution), 0.001)

  return (
    <div>
      {/* stacked share bar */}
      <div className="mb-4 flex h-3 w-full overflow-hidden rounded-full bg-ink-800">
        {rows.map((r) => (
          <div key={r.pt} style={{ width: `${r.share * 100}%`, background: ptColor(r.pt) }} title={`${r.pt} ${Math.round(r.share * 100)}%`} />
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-black/[0.06]">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-black/[0.03] text-left text-[11px] uppercase tracking-wider text-ink-500">
              <th className="px-3 py-2 font-semibold">Powertrain</th>
              <th className="px-3 py-2 text-right font-semibold">Share</th>
              <th className="px-3 py-2 text-right font-semibold">Units</th>
              <th className="px-3 py-2 text-right font-semibold">Avg {pack.metricUnit}</th>
              <th className="px-3 py-2 font-semibold">Adds to fleet avg</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.pt} className="border-t border-black/[0.04]">
                <td className="px-3 py-2 font-medium text-ink-100"><span className="mr-2 inline-block h-2 w-2 rounded-full align-middle" style={{ background: ptColor(r.pt) }} />{r.pt}</td>
                <td className="px-3 py-2 text-right num text-ink-300">{Math.round(r.share * 100)}%</td>
                <td className="px-3 py-2 text-right num text-ink-500">{fmtInt(r.rawUnits)}</td>
                <td className="px-3 py-2 text-right num">{fmtNum(r.avg, 1)}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/5">
                      <div className="h-full rounded-full" style={{ width: `${(r.contribution / maxContribution) * 100}%`, background: ptColor(r.pt) }} />
                    </div>
                    <span className="num w-12 text-right text-xs text-ink-300">+{fmtNum(r.contribution, 1)}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-black/10 bg-black/[0.03]">
              <td className="px-3 py-2 font-semibold text-ink-100">Fleet</td>
              <td className="px-3 py-2 text-right num text-ink-500">100%</td>
              <td className="px-3 py-2 text-right num text-ink-300">{fmtInt(agg.rawUnits)}</td>
              <td className="px-3 py-2 text-right num font-bold text-ink-100">{fmtNum(agg.avgMetric, 1)}</td>
              <td className="px-3 py-2 text-right num font-bold text-ink-100">= {fmtNum(agg.avgMetric, 1)} {pack.metricUnit}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
