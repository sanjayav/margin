import type { ReactNode } from 'react'
import { useProvenance, contributions, rowsCsv, download } from '../lib/provenance'
import { fmtInt, fmtMoney, fmtNum } from '../engine/engine'
import { StatusPill } from './ui'
import Icon from './Icon'

export default function ProvenanceDrawer() {
  const { open, payload, close } = useProvenance()
  if (!open || !payload) return null
  const { agg, pack, scenario, meta } = payload
  const contribs = contributions(agg, pack, scenario)
  const totalWeight = contribs.reduce((a, c) => a + c.weight, 0)
  const top = contribs.slice(0, 12)

  const refreshed = meta.lastRefreshed ? new Date(meta.lastRefreshed).toISOString().slice(0, 10) : '—'

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={close}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative flex h-full w-[560px] max-w-[94vw] flex-col overflow-hidden border-l border-black/10 bg-ink-900/95 shadow-card animate-slidein" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-black/[0.06] px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand/15 text-brand"><Icon name="shield" size={16} /></div>
            <div>
              <div className="text-sm font-bold text-ink-100">Show the working</div>
              <div className="text-[10px] text-ink-500">{agg.label} · {scenario.year}</div>
            </div>
          </div>
          <button onClick={close} className="text-ink-500 hover:text-ink-100"><Icon name="close" size={18} /></button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {/* Visual: fleet vs limit + fine flow */}
          {(() => {
            const max = Math.max(agg.avgMetric, agg.limit, 1) * 1.1
            const over = agg.gap > 0
            return (
              <div className="rounded-xl border border-black/[0.06] bg-black/[0.02] p-4">
                <div className="space-y-2.5">
                  <Track label="Fleet" value={agg.avgMetric} max={max} unit={pack.metricUnit} color={over ? '#ff5d6c' : '#3ddc97'} />
                  <Track label="Limit" value={agg.limit} max={max} unit={pack.metricUnit} color="#E0A100" />
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs">
                  <span className="text-ink-500">gap</span>
                  <span className={`num font-bold ${over ? 'text-danger' : 'text-safe'}`}>{over ? '+' : ''}{fmtNum(agg.gap, 1)} {pack.metricUnit}</span>
                </div>
                {/* fine flow */}
                <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
                  <Chip>{fmtNum(agg.fineMath.excess, 2)} over</Chip><Op>×</Op>
                  <Chip>{pack.currency}{pack.fineRate}</Chip><Op>×</Op>
                  <Chip>{fmtInt(agg.fineMath.units)} units</Chip><Op>=</Op>
                  <span className={`num rounded-md px-2 py-1 font-bold ${agg.fine > 0 ? 'bg-danger/15 text-danger' : 'bg-safe/15 text-safe'}`}>{fmtMoney(agg.fine, pack.currency)}</span>
                </div>
              </div>
            )
          })()}

          {/* Provenance */}
          <div className="rounded-xl border border-black/[0.06] bg-black/[0.02] p-4">
            <div className="label mb-2 flex items-center gap-1.5"><Icon name="database" size={12} /> Data provenance</div>
            <dl className="space-y-1.5 text-xs">
              <Row k="Source" v={meta.source} />
              <Row k="Dataset version" v={meta.datasetVersion} mono />
              <Row k="Refreshed" v={refreshed} mono />
              <Row k="Status" v={meta.live ? 'Live · database' : 'Bundled extract (offline)'} c={meta.live ? 'text-safe' : 'text-ink-400'} />
              <Row k="Rule pack" v={`${pack.name} · ${pack.fineRateLabel}`} />
            </dl>
          </div>

          {/* Limit derivation */}
          <div>
            <div className="label mb-2">1 · The limit</div>
            <p className="mb-2 text-xs leading-relaxed text-ink-400">{pack.limitNote}</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Cell k={pack.massLabel} v={`${fmtInt(agg.avgMass)} kg`} />
              <Cell k="ZE share" v={`${Math.round(agg.zlevShare * 100)}%`} />
              <Cell k="Limit" v={`${fmtNum(agg.limit, 1)} ${pack.metricUnit}`} accent />
            </div>
          </div>

          {/* Fleet weighted average */}
          <div>
            <div className="label mb-2">2 · Fleet emissions (sales-weighted average)</div>
            <div className="overflow-hidden rounded-xl border border-black/[0.06]">
              <table className="w-full text-xs">
                <thead><tr className="bg-black/[0.03] text-left text-ink-500">
                  <th className="px-3 py-2 font-semibold">Model</th>
                  <th className="px-3 py-2 text-right font-semibold">{pack.metricUnit}</th>
                  <th className="px-3 py-2 text-right font-semibold">Units</th>
                  <th className="px-3 py-2 text-right font-semibold">Weight</th>
                </tr></thead>
                <tbody>
                  {top.map((c, i) => (
                    <tr key={i} className="border-t border-black/[0.04]">
                      <td className="px-3 py-1.5 text-ink-100">{c.model} <span className="text-ink-600">{c.powertrain}</span></td>
                      <td className="px-3 py-1.5 text-right num">{fmtNum(c.metric, 1)}</td>
                      <td className="px-3 py-1.5 text-right num text-ink-500">{fmtInt(c.effUnits)}</td>
                      <td className="px-3 py-1.5 text-right num text-ink-400">{fmtInt(c.weight)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-black/10 bg-black/[0.03]">
                    <td className="px-3 py-2 font-semibold text-ink-100">Σ {fmtInt(agg.units)} units</td>
                    <td className="px-3 py-2 text-right num font-bold text-ink-100" colSpan={3}>{fmtInt(totalWeight)} ÷ {fmtInt(agg.units)} = {fmtNum(agg.avgMetric, 1)} {pack.metricUnit}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {contribs.length > top.length && <div className="mt-1 text-[10px] text-ink-500">Showing top {top.length} of {contribs.length} model·powertrain rows — full set in the CSV.</div>}
          </div>

          {/* Gap + fine */}
          <div>
            <div className="label mb-2">3 · Gap & fine</div>
            <div className="space-y-2 rounded-xl border border-black/[0.06] bg-ink-950/50 p-3 font-mono text-xs">
              <div className="flex justify-between"><span className="text-ink-500">fleet − limit</span><span className={agg.gap > 0 ? 'text-danger' : 'text-safe'}>{fmtNum(agg.avgMetric, 1)} − {fmtNum(agg.limit, 1)} = {agg.gap > 0 ? '+' : ''}{fmtNum(agg.gap, 1)}</span></div>
              <div className="flex justify-between border-t border-black/[0.06] pt-2"><span className="text-ink-500">fine</span><span className={agg.fine > 0 ? 'text-danger' : 'text-safe'}>{agg.fineMath.expression}</span></div>
              <div className="flex justify-between"><span className="text-ink-500">=</span><span className="font-bold text-ink-100">{fmtMoney(agg.fine, pack.currency)}</span></div>
            </div>
            <div className="mt-2"><StatusPill status={agg.status} /></div>
          </div>
        </div>

        <footer className="border-t border-black/[0.06] p-4">
          <button onClick={() => download(`${agg.label.replace(/\W+/g, '_')}_${scenario.year}_rows.csv`, rowsCsv(agg, pack, scenario))} className="btn-ghost w-full">
            <Icon name="database" size={15} /> Download underlying rows (CSV)
          </button>
        </footer>
      </div>
    </div>
  )
}

const Track = ({ label, value, max, unit, color }: { label: string; value: number; max: number; unit: string; color: string }) => (
  <div className="flex items-center gap-2">
    <span className="w-10 shrink-0 text-[10px] uppercase tracking-wide text-ink-500">{label}</span>
    <div className="h-5 flex-1 overflow-hidden rounded-md bg-black/5">
      <div className="h-full rounded-md transition-all" style={{ width: `${(value / max) * 100}%`, background: color }} />
    </div>
    <span className="num w-20 shrink-0 text-right text-xs font-semibold text-ink-100">{fmtNum(value, 1)} {unit}</span>
  </div>
)
const Chip = ({ children }: { children: ReactNode }) => <span className="num rounded-md bg-black/[0.04] px-2 py-1 text-ink-300">{children}</span>
const Op = ({ children }: { children: ReactNode }) => <span className="text-ink-600">{children}</span>

const Row = ({ k, v, mono, c }: { k: string; v: string; mono?: boolean; c?: string }) => (
  <div className="flex items-start justify-between gap-3"><dt className="text-ink-500">{k}</dt><dd className={`text-right ${mono ? 'mono' : ''} ${c ?? 'text-ink-200'}`}>{v}</dd></div>
)
const Cell = ({ k, v, accent }: { k: string; v: string; accent?: boolean }) => (
  <div className={`rounded-lg p-2 ${accent ? 'bg-brand/10 ring-1 ring-brand/30' : 'bg-black/[0.03]'}`}>
    <div className="text-[10px] text-ink-500">{k}</div>
    <div className="num text-sm font-bold text-ink-100">{v}</div>
  </div>
)
