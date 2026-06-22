import { useCompliance } from '../lib/useCompliance'
import { PACK_LIST } from '../engine/rulepacks'
import { DATA_REFRESHED, getFleet, getMeta } from '../data/fleet'
import { Section } from '../components/ui'
import Icon from '../components/Icon'
import { fmtInt } from '../engine/engine'
import { reconcile } from '../engine/reconcile'
import { getPack } from '../engine/rulepacks'
import type { Scenario } from '../engine/types'

const Badge = ({ code }: { code: string }) => (
  <span className="grid h-6 min-w-[36px] place-items-center rounded-md border border-black/10 bg-black/[0.03] px-1 text-[10px] font-bold tracking-wide text-ink-300">{code}</span>
)

export default function Admin() {
  const { pack, country } = useCompliance()

  return (
    <div className="space-y-5 animate-slidein">
      <Section title="Rule packs" right={<span className="text-[11px] text-ink-500">country differences live here — adding a country is a config change, not a rebuild</span>}>
        <div className="overflow-hidden rounded-xl border border-black/[0.06]">
          <table className="w-full text-sm">
            <thead><tr className="bg-black/[0.03] text-left text-[11px] uppercase tracking-wider text-ink-500">
              <th className="px-4 py-2.5">Pack</th><th className="px-4 py-2.5">Limit formula</th><th className="px-4 py-2.5">Credits</th><th className="px-4 py-2.5">Pooling</th><th className="px-4 py-2.5">Fine rate</th>
            </tr></thead>
            <tbody>
              {PACK_LIST.map((p) => (
                <tr key={p.id} className={`border-t border-black/[0.04] ${p.id === country ? 'bg-brand/[0.04]' : ''}`}>
                  <td className="px-4 py-3 font-semibold text-ink-100 whitespace-nowrap"><span className="flex items-center gap-2"><Badge code={p.flag} /> {p.name}</span></td>
                  <td className="px-4 py-3 text-xs text-ink-400 max-w-xs">{p.limitNote}</td>
                  <td className="px-4 py-3 text-xs text-ink-400 max-w-xs">{p.credits}</td>
                  <td className="px-4 py-3 text-xs">{p.pooling.enabled ? <span className="text-safe">Enabled</span> : <span className="text-ink-500">Per-maker</span>}</td>
                  <td className="px-4 py-3 text-xs text-ink-300">{p.fineRateLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Data freshness" right={<span className="text-[11px] text-ink-500">official sources, refreshed on a schedule</span>}>
          <div className="space-y-3">
            {PACK_LIST.map((p) => {
              const meta = getMeta(p.id)
              const refreshed = meta.lastRefreshed ? new Date(meta.lastRefreshed).toISOString().slice(0, 10) : DATA_REFRESHED[p.id]
              return (
                <div key={p.id} className="flex items-center justify-between rounded-xl border border-black/[0.04] bg-black/[0.02] px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <Badge code={p.flag} />
                    <div>
                      <div className="flex items-center gap-2 font-medium text-ink-100">
                        {p.name}
                        <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase ${meta.live ? 'border-safe/30 bg-safe/10 text-safe' : 'border-black/10 bg-black/5 text-ink-500'}`}>
                          {meta.live ? 'Live · DB' : 'Offline · extract'}
                        </span>
                      </div>
                      <div className="text-[11px] text-ink-500">{meta.source}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="num text-sm text-ink-100">{fmtInt(getFleet(p.id).length)} model rows</div>
                    <div className="text-[11px] text-ink-500">refreshed {refreshed}</div>
                  </div>
                </div>
              )
            })}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-ink-500">
            Live rows come from Neon via <span className="mono">/api/fleet</span>; a Vercel cron calls <span className="mono">/api/refresh</span> on schedule. Run <span className="mono">npm run ingest:eu</span> to load the full EEA dataset. Until a DB is connected, the bundled official extract is used.
          </p>
        </Section>

        <Section title={`Active pack · ${pack.name}`}>
          <dl className="space-y-2.5 text-sm">
            <KV k="Metric unit" v={`${pack.metricLabel} (${pack.metricUnit})`} />
            <KV k="Mass basis" v={pack.massLabel} />
            <KV k="Compliance years" v={pack.years.join(', ')} />
            <KV k="Vehicle classes" v={pack.classes.join(', ')} />
            <KV k="Small-volume exemption" v={pack.smallVolumeThreshold > 0 ? `< ${fmtInt(pack.smallVolumeThreshold)} units` : 'none'} />
            <KV k="Currency" v={pack.currency} />
          </dl>
          <div className="mt-4 rounded-xl border border-black/[0.06] bg-black/[0.02] p-3 text-xs leading-relaxed text-ink-500">
            One shared calculation engine computes the weighted average at every level — market, maker, model, engine type — and reads all country differences from the pack above.
          </div>
        </Section>
      </div>

      <Section title="Reconciliation & data quality" right={<span className="text-[11px] text-ink-500">internal consistency checks on the live data</span>}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {PACK_LIST.map((p) => {
            const base: Scenario = { year: p.years[0], evSharePct: null, salesMultiplier: 1, massShiftKg: 0, ecoBoostG: 0, poolingEnabled: false, superCreditsEnabled: p.id === 'IN' }
            const rec = reconcile(getFleet(p.id), getPack(p.id), base)
            const tone = rec.worst === 'fail' ? 'text-danger' : rec.worst === 'warn' ? 'text-warn' : 'text-safe'
            const passed = rec.checks.filter((c) => c.status === 'pass').length
            return (
              <div key={p.id} className="card p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2"><Badge code={p.flag} /><span className="font-semibold text-ink-100">{p.name}</span></div>
                  <span className={`num text-xs font-bold ${tone}`}>{passed}/{rec.checks.length} checks · {p.years[0]}</span>
                </div>
                <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-500">
                  <span>{fmtInt(rec.coverage.rows)} rows</span><span>{rec.coverage.parents} makers</span><span>{rec.coverage.models} models</span><span>{rec.coverage.years} years</span><span>{fmtInt(rec.coverage.units)} units</span>
                </div>
                <div className="space-y-1.5">
                  {rec.checks.map((c) => (
                    <div key={c.label} className="flex items-start gap-2 text-xs">
                      <Icon name={c.status === 'pass' ? 'check' : c.status === 'warn' ? 'alert' : 'close'} size={13} className={`mt-0.5 shrink-0 ${c.status === 'pass' ? 'text-safe' : c.status === 'warn' ? 'text-warn' : 'text-danger'}`} />
                      <span className="text-ink-300">{c.label}</span>
                      <span className="ml-auto text-right text-ink-500">{c.detail}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-ink-500">
          These verify the numbers are internally consistent. The next step for full assurance is reconciling against each source's published headline averages — wired per market as those reference figures are connected.
        </p>
      </Section>

      <Section title="Users & roles">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[['Compliance lead', 'sanjay.v@marklytics.co.uk', 'Owner'], ['Fleet planner', 'planner@oem.example', 'Editor'], ['Auditor', 'audit@oem.example', 'Viewer']].map(([n, e, r]) => (
            <div key={e} className="card p-4">
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-full bg-accent/20 font-bold text-accent">{n[0]}</div>
                <div className="min-w-0"><div className="truncate text-sm font-semibold text-ink-100">{n}</div><div className="truncate text-[11px] text-ink-500">{e}</div></div>
              </div>
              <div className="mt-3 chip">{r}</div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}

const KV = ({ k, v }: { k: string; v: string }) => (
  <div className="flex items-center justify-between border-b border-black/[0.04] pb-2"><dt className="text-ink-500">{k}</dt><dd className="num font-medium text-ink-100 text-right">{v}</dd></div>
)
