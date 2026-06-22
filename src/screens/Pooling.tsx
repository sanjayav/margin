import { useMemo, useState, useEffect } from 'react'
import { useCompliance } from '../lib/useCompliance'
import { useStore } from '../state/store'
import { standings, poolResult, bestForMaker } from '../engine/pooling'
import { fmtMoney, fmtNum, fmtInt } from '../engine/engine'
import { Section, StatusPill, Stat, Bar } from '../components/ui'
import Icon from '../components/Icon'

export default function Pooling() {
  const { pack, raw, scenario } = useCompliance()
  const dataVersion = useStore((s) => s.dataVersion)

  const rows = useMemo(() => standings(raw, pack, scenario), [raw, pack, scenario, dataVersion])
  const allParents = rows.map((r) => r.parent)

  const [members, setMembers] = useState<string[]>([])
  // default selection: everyone who's short + everyone with surplus (the value-creating pool)
  useEffect(() => {
    setMembers(rows.filter((r) => r.gap > 0 || r.creditBalance > 0).map((r) => r.parent))
  }, [pack.id, dataVersion]) // eslint-disable-line react-hooks/exhaustive-deps

  const grand = useMemo(() => poolResult(raw, pack, scenario, allParents), [raw, pack, scenario, dataVersion]) // eslint-disable-line react-hooks/exhaustive-deps
  const selected = useMemo(
    () => (members.length >= 1 ? poolResult(raw, pack, scenario, members) : null),
    [raw, pack, scenario, members, dataVersion], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const standaloneTotal = rows.reduce((a, r) => a + r.fine, 0)
  const surplusTotal = rows.filter((r) => r.creditBalance > 0).reduce((a, r) => a + r.creditBalance, 0)
  const shortMakers = rows.filter((r) => r.fine > 0)
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.creditBalance)), 1)

  const toggle = (p: string) => setMembers((m) => (m.includes(p) ? m.filter((x) => x !== p) : [...m, p]))

  if (!pack.pooling.enabled && pack.creditPrice == null) {
    return (
      <div className="space-y-5 animate-slidein">
        <div className="card flex items-start gap-3 p-5">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-black/10 bg-black/[0.03] text-warn"><Icon name="alert" size={18} /></div>
          <div>
            <h3 className="font-semibold text-ink-100">No pooling or trading in {pack.name}</h3>
            <p className="mt-1 text-sm text-ink-400">{pack.pooling.note} Each maker is assessed standalone — see the standings below.</p>
          </div>
        </div>
        <Standings rows={rows} pack={pack} maxAbs={maxAbs} />
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-slidein">
      {/* Market summary */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Standalone fines" value={fmtMoney(standaloneTotal, pack.currency)} sub="if no one cooperates" accent={standaloneTotal > 0 ? 'text-danger' : 'text-safe'} />
        <Stat label="If the whole market pools" value={fmtMoney(grand.fine, pack.currency)} sub={`${grand.status === 'fine' ? 'residual fine' : 'fully compliant'}`} accent={grand.fine > 0 ? 'text-warn' : 'text-safe'} />
        <Stat label="Value poolable" value={fmtMoney(standaloneTotal - grand.fine, pack.currency)} sub="total fine removable" accent="text-brand" />
        <Stat label="Surplus available" value={`${fmtInt(surplusTotal)}`} sub={`g·units of headroom to share`} accent="text-accent" />
      </div>

      {/* Standings */}
      <Standings rows={rows} pack={pack} maxAbs={maxAbs} />

      {/* Pool builder */}
      <Section title="Pool builder" right={<span className="text-[11px] text-ink-500">{pack.pooling.note}</span>}>
        <div className="mb-4 flex flex-wrap gap-2">
          {allParents.map((p) => {
            const on = members.includes(p)
            const r = rows.find((x) => x.parent === p)!
            return (
              <button key={p} onClick={() => toggle(p)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${on ? 'border-brand/40 bg-brand/10 text-ink-100' : 'border-black/10 text-ink-500 hover:text-ink-100'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${r.gap > 0 ? 'bg-danger' : 'bg-safe'}`} />
                {p}
              </button>
            )
          })}
          <button onClick={() => setMembers(allParents)} className="ml-auto text-[11px] font-semibold text-ink-500 hover:text-ink-100">Select all</button>
        </div>

        {selected && members.length >= 2 ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className={`card p-4 ${selected.gap > 0 ? 'border-warn/30' : 'border-safe/30'}`}>
              <div className="label">Pooled position</div>
              <div className={`mt-1 num text-2xl font-black ${selected.gap > 0 ? 'text-warn' : 'text-safe'}`}>{selected.gap > 0 ? '+' : ''}{fmtNum(selected.gap, 1)}</div>
              <div className="text-xs text-ink-500">{pack.metricUnit} · fleet {fmtNum(selected.avgMetric, 1)} / limit {fmtNum(selected.limit, 1)}</div>
              <div className="mt-2"><StatusPill status={selected.status} /></div>
            </div>
            <Stat label="Pooled fine" value={fmtMoney(selected.fine, pack.currency)} sub={`vs ${fmtMoney(selected.standaloneFine, pack.currency)} standalone`} accent={selected.fine > 0 ? 'text-danger' : 'text-safe'} />
            <div className="card p-4">
              <div className="label">Value unlocked</div>
              <div className="num mt-1 text-2xl font-black text-brand">{fmtMoney(selected.saved, pack.currency)}</div>
              <div className="mt-1 text-xs text-ink-500">
                {selected.saved > 0
                  ? `Settle ~${fmtMoney(selected.saved * 0.5, pack.currency)}–${fmtMoney(selected.saved * 0.8, pack.currency)} from short to surplus makers (illustrative).`
                  : 'No fine to remove in this combination.'}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-ink-500">Pick two or more makers to model a pool.</p>
        )}
      </Section>

      {/* Best move per short maker */}
      {shortMakers.length > 0 && (
        <Section title="Cheapest route to compliance, per maker" right={<span className="text-[11px] text-ink-500">pool vs buy credits vs pay</span>}>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {shortMakers.map((m) => (
              <MakerOptions key={m.parent} parent={m.parent} fine={m.fine} />
            ))}
          </div>
        </Section>
      )}

      {/* Credit market */}
      {pack.creditPrice != null && (
        <Section title="Credit market" right={<span className="text-[11px] text-ink-500">{pack.creditPriceLabel}</span>}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <div className="label mb-2 text-safe">Sellers — surplus headroom</div>
              <div className="space-y-2">
                {rows.filter((r) => r.creditBalance > 0).map((r) => (
                  <div key={r.parent} className="flex items-center justify-between rounded-lg border border-black/[0.04] bg-black/[0.02] px-3 py-2 text-sm">
                    <span className="text-ink-100">{r.parent}</span>
                    <span className="num text-safe">{fmtInt(r.creditBalance)} g·units · earns ≈ {fmtMoney(r.creditBalance * (pack.creditPrice ?? 0), pack.currency)}</span>
                  </div>
                ))}
                {rows.every((r) => r.creditBalance <= 0) && <div className="text-sm text-ink-500">No surplus sellers this year.</div>}
              </div>
            </div>
            <div>
              <div className="label mb-2 text-danger">Buyers — uncovered deficit</div>
              <div className="space-y-2">
                {rows.filter((r) => r.gap > 0).map((r) => (
                  <div key={r.parent} className="flex items-center justify-between rounded-lg border border-black/[0.04] bg-black/[0.02] px-3 py-2 text-sm">
                    <span className="text-ink-100">{r.parent}</span>
                    <span className="num text-danger">{fmtInt(r.gap * r.units)} g·units · fine {fmtMoney(r.fine, pack.currency)}</span>
                  </div>
                ))}
                {rows.every((r) => r.gap <= 0) && <div className="text-sm text-ink-500">No buyers — everyone's under the line.</div>}
              </div>
            </div>
          </div>
        </Section>
      )}
    </div>
  )
}

function Standings({ rows, pack, maxAbs }: any) {
  return (
    <Section title="Where each maker stands">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-black/[0.03] text-left text-[11px] uppercase tracking-wider text-ink-500">
              <th className="px-4 py-2.5">Maker</th>
              <th className="px-4 py-2.5">Role</th>
              <th className="px-4 py-2.5 text-right">Fleet</th>
              <th className="px-4 py-2.5 text-right">Limit</th>
              <th className="px-4 py-2.5 text-right">Gap</th>
              <th className="px-4 py-2.5">Credit balance (g·units)</th>
              <th className="px-4 py-2.5 text-right">Fine</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any) => {
              const surplus = r.creditBalance > 0
              return (
                <tr key={r.parent} className="border-t border-black/[0.04]">
                  <td className="px-4 py-2.5 font-medium text-ink-100">{r.parent}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${surplus ? 'border-safe/30 bg-safe/10 text-safe' : r.gap > 0 ? 'border-danger/30 bg-danger/10 text-danger' : 'border-black/10 text-ink-500'}`}>
                      {surplus ? 'Surplus seller' : r.gap > 0 ? 'Short buyer' : 'Balanced'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right num">{fmtNum(r.avgMetric, 1)}</td>
                  <td className="px-4 py-2.5 text-right num text-ink-500">{fmtNum(r.limit, 1)}</td>
                  <td className={`px-4 py-2.5 text-right num font-semibold ${r.gap > 0 ? 'text-danger' : 'text-safe'}`}>{r.gap > 0 ? '+' : ''}{fmtNum(r.gap, 1)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="relative h-2 w-32 overflow-hidden rounded-full bg-black/5">
                        <div className={`absolute top-0 h-full ${surplus ? 'left-1/2 bg-safe' : 'right-1/2 bg-danger'}`} style={{ width: `${(Math.abs(r.creditBalance) / maxAbs) * 50}%` }} />
                        <div className="absolute left-1/2 top-0 h-full w-px bg-black/20" />
                      </div>
                      <span className={`num text-xs ${surplus ? 'text-safe' : 'text-danger'}`}>{r.creditBalance > 0 ? '+' : ''}{fmtInt(r.creditBalance)}</span>
                    </div>
                  </td>
                  <td className={`px-4 py-2.5 text-right num ${r.fine > 0 ? 'text-danger' : 'text-ink-500'}`}>{fmtMoney(r.fine, pack.currency)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Section>
  )
}

function MakerOptions({ parent, fine }: { parent: string; fine: number }) {
  const { pack, raw, scenario } = useCompliance()
  const dataVersion = useStore((s) => s.dataVersion)
  const opts = useMemo(() => bestForMaker(raw, pack, scenario, parent), [raw, pack, scenario, parent, dataVersion])
  const ICON: Record<string, any> = { pool: 'handshake', credits: 'card', fine: 'alert' }
  const maxCost = Math.max(...opts.map((o) => o.cost), 1)
  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="font-semibold text-ink-100">{parent}</div>
        <div className="num text-xs text-danger">standalone fine {fmtMoney(fine, pack.currency)}</div>
      </div>
      <div className="space-y-2">
        {opts.map((o) => (
          <div key={o.type} className={`rounded-xl border p-3 ${o.best ? 'border-brand/40 bg-brand/[0.06]' : 'border-black/[0.06] bg-black/[0.02]'}`}>
            <div className="flex items-center gap-2">
              <span className={`grid h-6 w-6 place-items-center rounded-lg ${o.best ? 'bg-brand/20 text-brand' : 'bg-black/5 text-ink-400'}`}><Icon name={ICON[o.type]} size={13} /></span>
              <span className="text-sm font-semibold text-ink-100">{o.label}</span>
              {o.best && <span className="rounded-full border border-brand/40 bg-brand/10 px-2 py-0.5 text-[9px] font-bold uppercase text-brand">cheapest</span>}
              <span className="ml-auto num text-sm font-bold text-ink-100">{fmtMoney(o.cost, pack.currency)}</span>
            </div>
            <div className="mt-1.5"><Bar value={o.cost} max={maxCost} color={o.best ? 'bg-brand' : 'bg-ink-600'} /></div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-ink-500">{o.detail}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
