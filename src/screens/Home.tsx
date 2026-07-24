import { useMemo, type ReactNode } from 'react'
import { useStore } from '../state/store'
import { MODULE_META, ALL_MODULES, moduleSummary } from '../lib/modules'
import { fmtInt, fmtMoney, fmtNum } from '../engine/engine'
import Icon from '../components/Icon'
import Flag from '../components/Flag'

function MiniBar({ fleet, limit }: { fleet: number; limit: number }) {
  const scale = Math.max(limit * 1.5, fleet * 1.08, 1)
  const over = fleet > limit
  const pct = Math.min(100, (fleet / scale) * 100)
  return (
    <div className="relative mt-2.5 h-2 w-full overflow-hidden rounded-full bg-black/[0.05]">
      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: over ? 'linear-gradient(90deg,#F17074,#E0484D)' : 'linear-gradient(90deg,#12B981,#0E9F6E)' }} />
      <div className="absolute -inset-y-[3px] w-[2px] rounded bg-[#C9A227]" style={{ left: `${Math.min(100, (limit / scale) * 100)}%` }} />
    </div>
  )
}

// Premium metric tile — icon chip, tabular number, hairline top accent.
function Kpi({ label, value, sub, icon, tone = 'neutral', delay }: { label: string; value: ReactNode; sub: ReactNode; icon: any; tone?: 'neutral' | 'danger' | 'safe'; delay: number }) {
  const accent = tone === 'danger' ? '#E0484D' : tone === 'safe' ? '#0E9F6E' : '#E8223B'
  const valueColor = tone === 'danger' ? 'text-danger' : tone === 'safe' ? 'text-safe' : 'text-ink-100'
  return (
    <div className="card rise relative overflow-hidden p-5" style={{ animationDelay: `${delay}ms` }}>
      <div className="absolute inset-x-0 top-0 h-[2px] opacity-70" style={{ background: `linear-gradient(90deg, ${accent}, transparent 80%)` }} />
      <div className="flex items-start justify-between">
        <div className="label text-ink-500">{label}</div>
        <span className="grid h-7 w-7 place-items-center rounded-lg" style={{ background: `${accent}14`, color: accent }}><Icon name={icon} size={14} /></span>
      </div>
      <div className={`dnum mt-3 text-[24px] font-bold leading-none tracking-tight ${valueColor}`}>{value}</div>
      <div className="mt-2 text-[11px] leading-snug text-ink-500">{sub}</div>
    </div>
  )
}

export default function Home() {
  const owned = useStore((s) => s.subscribedModules)
  const ai = useStore((s) => s.aiEnabled)
  const enter = useStore((s) => s.enterModule)
  const goto = useStore((s) => s.setPlatformScreen)
  const dataVersion = useStore((s) => s.dataVersion)

  const summaries = useMemo(() => Object.fromEntries(owned.map((c) => [c, moduleSummary(c)])), [owned, dataVersion])
  const locked = ALL_MODULES.filter((c) => !owned.includes(c))
  const totalUnits = owned.reduce((a, c) => a + summaries[c].units, 0)
  const totalMakers = owned.reduce((a, c) => a + summaries[c].makers, 0)
  const totalOver = owned.reduce((a, c) => a + summaries[c].over, 0)
  const atRisk = owned.map((c) => ({ c, fine: summaries[c].fine, currency: summaries[c].currency })).filter((x) => x.fine > 0)

  return (
    <div className="mx-auto max-w-[1180px] space-y-6">
      {/* ── hero ─────────────────────────────────────────────────────────── */}
      <div className="rise relative overflow-hidden rounded-[20px] border border-black/[0.06] p-8" style={{ background: 'linear-gradient(120deg, #1B1714 0%, #201A17 46%, #17130F 100%)' }}>
        <div className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full blur-3xl" style={{ background: 'radial-gradient(circle, rgba(232,34,59,0.34), transparent 62%)' }} />
        <div className="pointer-events-none absolute -bottom-28 right-1/3 h-72 w-72 rounded-full blur-3xl" style={{ background: 'radial-gradient(circle, rgba(246,104,100,0.18), transparent 62%)' }} />
        <div className="pointer-events-none absolute inset-0 opacity-[0.4]" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '24px 24px', maskImage: 'radial-gradient(120% 130% at 90% 0%, #000 30%, transparent 75%)', WebkitMaskImage: 'radial-gradient(120% 130% at 90% 0%, #000 30%, transparent 75%)' }} />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-white/45">
              Welcome back
              {ai && <span className="inline-flex items-center gap-1 rounded-full border border-brand-400/30 bg-brand-400/10 px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-brand-400"><Icon name="spark" size={10} /> AI Analyst on</span>}
            </div>
            <h1 className="font-display mt-2 text-[32px] font-extrabold tracking-[-0.02em] text-white">Vijay</h1>
            <p className="mt-2 max-w-md text-[13.5px] leading-relaxed text-white/55">
              {owned.length} compliance {owned.length === 1 ? 'module' : 'modules'} active across {owned.map((c) => MODULE_META[c].flag).join(' · ')}. Open a market to analyse, simulate and plan.
            </p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              {owned.slice(0, 1).map((c) => (
                <button key={c} onClick={() => enter(c)} className="btn-primary"><Icon name="scatter" size={16} /> Open {MODULE_META[c].name}</button>
              ))}
              <button onClick={() => goto('modules')} className="btn inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white/85 transition hover:bg-white/[0.09]"><Icon name="layers" size={15} /> All modules</button>
            </div>
          </div>
          {atRisk.length > 0 && (
            <div className="shrink-0 rounded-2xl border border-white/10 bg-black/25 p-4 backdrop-blur-sm">
              <div className="text-[10px] font-semibold uppercase tracking-[0.13em] text-white/40">Portfolio exposure</div>
              <div className="dnum mt-1.5 text-[22px] font-bold leading-none text-white">{atRisk.map((x) => fmtMoney(x.fine, x.currency)).join('  ·  ')}</div>
              <div className="mt-2 flex items-center gap-1.5 text-[11px] text-white/45"><span className="inline-block h-1.5 w-1.5 rounded-full bg-danger" /> {totalOver} maker{totalOver === 1 ? '' : 's'} over the line</div>
            </div>
          )}
        </div>
      </div>

      {/* ── portfolio KPIs ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <Kpi delay={60} label="Active modules" icon="layers" value={`${owned.length} / ${ALL_MODULES.length}`} sub={owned.map((c) => MODULE_META[c].flag).join(' · ') || 'none'} />
        <Kpi delay={120} label="At risk across portfolio" icon="scale" tone={atRisk.length > 0 ? 'danger' : 'safe'}
          value={atRisk.length === 0 ? 'None' : atRisk.map((x) => fmtMoney(x.fine, x.currency)).join(' · ')}
          sub={atRisk.length === 0 ? 'all owned modules under the line' : `${atRisk.length} market${atRisk.length === 1 ? '' : 's'} exposed`} />
        <Kpi delay={180} label="Registrations" icon="database" value={fmtInt(totalUnits)} sub={`${totalMakers} makers tracked`} />
        <Kpi delay={240} label="Makers over the line" icon="trending" tone={totalOver > 0 ? 'danger' : 'safe'} value={fmtInt(totalOver)} sub="across owned modules" />
      </div>

      {/* ── owned modules ────────────────────────────────────────────────── */}
      <div>
        <div className="mb-3.5 flex items-center justify-between">
          <h2 className="font-display text-[16px] font-bold tracking-tight text-ink-100">Your modules</h2>
          <button onClick={() => goto('subscription')} className="flex items-center gap-1 text-[11px] font-semibold text-brand transition hover:gap-1.5">Manage subscription <Icon name="chevron" size={12} /></button>
        </div>
        {owned.length === 0 && (
          <div className="card flex flex-col items-center gap-3 p-10 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand/10 text-brand"><Icon name="layers" size={22} /></span>
            <div>
              <div className="font-display text-[15px] font-bold text-ink-100">No modules yet</div>
              <div className="mt-1 text-[12px] text-ink-500">Subscribe to a market to start analysing — EU, India, Australia, the UK or China.</div>
            </div>
            <button onClick={() => goto('modules')} className="btn-primary"><Icon name="layers" size={15} /> Browse modules</button>
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {owned.map((c, i) => {
            const m = MODULE_META[c], s = summaries[c]
            return (
              <button key={c} onClick={() => enter(c)} style={{ animationDelay: `${300 + i * 60}ms` }} className="card card-lift rise group relative overflow-hidden p-5 text-left">
                <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-brand/[0.05] opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100" />
                <div className="relative flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <Flag id={m.id} className="h-10 w-11" rounded="rounded-xl" />
                    <div>
                      <div className="font-display text-[15px] font-bold leading-tight text-ink-100">{m.name}</div>
                      <div className="text-[11px] text-ink-500">{m.tagline}</div>
                    </div>
                  </div>
                  <span className="flex items-center gap-1 rounded-full bg-safe/10 px-2 py-0.5 text-[10px] font-bold text-safe"><span className="inline-block h-1.5 w-1.5 rounded-full bg-safe" /> Active</span>
                </div>
                <div className="relative mt-5 flex items-end justify-between">
                  <div>
                    <div className="label text-ink-500">Fleet {s.metricUnit}</div>
                    <div className="dnum text-[23px] font-bold leading-none text-ink-100">{fmtNum(s.fleet, 1)}<span className="ml-1 text-[11px] font-semibold text-ink-500">/ {fmtNum(s.limit, 1)}</span></div>
                  </div>
                  <div className="text-right">
                    <div className="label text-ink-500">At risk</div>
                    <div className={`dnum text-[15px] font-bold ${s.fine > 0 ? 'text-danger' : 'text-safe'}`}>{fmtMoney(s.fine, s.currency)}</div>
                  </div>
                </div>
                <MiniBar fleet={s.fleet} limit={s.limit} />
                <div className="relative mt-4 flex items-center justify-between text-[11px] text-ink-500">
                  <span>{fmtInt(s.makers)} makers · {fmtInt(s.units)} units</span>
                  <span className="flex items-center gap-1 font-semibold text-brand transition-all group-hover:gap-1.5">Open module <Icon name="chevron" size={12} /></span>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── available ────────────────────────────────────────────────────── */}
      {locked.length > 0 && (
        <div>
          <h2 className="font-display mb-3.5 text-[16px] font-bold tracking-tight text-ink-100">Add a market</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {locked.map((c) => {
              const m = MODULE_META[c]
              return (
                <button key={c} onClick={() => goto('subscription')} className="card card-lift group flex items-center gap-3 p-4 text-left">
                  <Flag id={m.id} className="h-9 w-10 opacity-70 transition group-hover:opacity-100" />
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-semibold text-ink-200">{m.name}</div>
                    <div className="flex items-center gap-1 text-[10px] font-semibold text-ink-500"><Icon name="shield" size={10} /> Locked · subscribe</div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
