import { useMemo } from 'react'
import { useStore } from '../state/store'
import { MODULE_META, ALL_MODULES, moduleSummary } from '../lib/modules'
import { fmtInt, fmtMoney, fmtNum } from '../engine/engine'
import { Stat } from '../components/ui'
import Icon from '../components/Icon'

function MiniBar({ fleet, limit }: { fleet: number; limit: number }) {
  const scale = Math.max(limit * 1.5, fleet * 1.08, 1)
  const over = fleet > limit
  return (
    <div className="relative mt-2 h-1.5 w-full rounded-full bg-black/[0.06]">
      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, (fleet / scale) * 100)}%`, background: over ? '#E0484D' : '#0E9F6E' }} />
      <div className="absolute -inset-y-[2px] w-[2px] rounded bg-[#C9A227]" style={{ left: `${Math.min(100, (limit / scale) * 100)}%` }} />
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

  return (
    <div className="space-y-6">
      {/* hero */}
      <div className="rise card relative overflow-hidden p-6">
        <div className="absolute -right-10 -top-16 h-48 w-48 rounded-full bg-brand/[0.07] blur-2xl" />
        <div className="relative">
          <div className="label text-ink-500">Welcome back</div>
          <h1 className="font-display mt-1 text-[28px] font-bold tracking-tight text-ink-100">Vijay</h1>
          <p className="mt-1.5 max-w-lg text-sm text-ink-400">
            {owned.length} compliance {owned.length === 1 ? 'module' : 'modules'} active{ai ? ' · AI Analyst on' : ''}. Open a module to analyse, simulate and plan, or add a market.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {owned.slice(0, 1).map((c) => (
              <button key={c} onClick={() => enter(c)} className="btn-primary"><Icon name="scatter" size={16} /> Open {MODULE_META[c].name}</button>
            ))}
            <button onClick={() => goto('modules')} className="btn-ghost"><Icon name="layers" size={15} /> All modules</button>
          </div>
        </div>
      </div>

      {/* portfolio KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat className="rise [animation-delay:60ms]" label="Active modules" value={`${owned.length} / ${ALL_MODULES.length}`} sub={owned.map((c) => MODULE_META[c].flag).join(' · ') || 'none'} />
        <Stat className="rise [animation-delay:120ms]" label="AI Analyst" value={ai ? 'Active' : 'Off'} sub={ai ? 'across all modules' : 'add-on available'} accent={ai ? 'text-safe' : 'text-ink-400'} />
        <Stat className="rise [animation-delay:180ms]" label="Registrations" value={fmtInt(totalUnits)} sub={`${totalMakers} makers tracked`} />
        <Stat className="rise [animation-delay:240ms]" label="Makers over the line" value={fmtInt(totalOver)} sub="across owned modules" accent={totalOver > 0 ? 'text-danger' : 'text-safe'} />
      </div>

      {/* owned modules */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-[15px] font-bold tracking-tight text-ink-100">Your modules</h2>
          <button onClick={() => goto('subscription')} className="text-[11px] font-semibold text-brand hover:underline">Manage subscription</button>
        </div>
        {owned.length === 0 && (
          <div className="card flex flex-col items-center gap-3 p-10 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand/10 text-brand"><Icon name="layers" size={22} /></span>
            <div>
              <div className="font-display text-[15px] font-bold text-ink-100">No modules yet</div>
              <div className="mt-1 text-[12px] text-ink-500">Subscribe to a market to start analysing — EU, India, Australia or the UK.</div>
            </div>
            <button onClick={() => goto('modules')} className="btn-primary"><Icon name="layers" size={15} /> Browse modules</button>
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {owned.map((c, i) => {
            const m = MODULE_META[c], s = summaries[c]
            const over = s.fleet > s.limit
            return (
              <button key={c} onClick={() => enter(c)} style={{ animationDelay: `${300 + i * 60}ms` }} className="card rise card-hover group p-5 text-left">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-11 place-items-center rounded-xl text-[12px] font-bold text-white" style={{ background: m.accent }}>{m.flag}</span>
                    <div>
                      <div className="font-display text-[15px] font-bold leading-tight text-ink-100">{m.name}</div>
                      <div className="text-[11px] text-ink-500">{m.tagline}</div>
                    </div>
                  </div>
                  <span className="flex items-center gap-1 rounded-full bg-safe/10 px-2 py-0.5 text-[10px] font-bold text-safe">Active</span>
                </div>
                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <div className="label text-ink-500">Fleet {s.metricUnit}</div>
                    <div className="dnum text-[22px] font-bold leading-none text-ink-100">{fmtNum(s.fleet, 1)}<span className="ml-1 text-[11px] font-semibold text-ink-500">/ {fmtNum(s.limit, 1)}</span></div>
                  </div>
                  <div className="text-right">
                    <div className="label text-ink-500">At risk</div>
                    <div className={`dnum text-[15px] font-bold ${s.fine > 0 ? 'text-danger' : 'text-safe'}`}>{fmtMoney(s.fine, s.currency)}</div>
                  </div>
                </div>
                <MiniBar fleet={s.fleet} limit={s.limit} />
                <div className="mt-4 flex items-center justify-between text-[11px] text-ink-500">
                  <span>{fmtInt(s.makers)} makers · {fmtInt(s.units)} units</span>
                  <span className="flex items-center gap-1 font-semibold text-brand opacity-0 transition group-hover:opacity-100">Open module <Icon name="chevron" size={12} /></span>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* available */}
      {locked.length > 0 && (
        <div>
          <h2 className="font-display mb-3 text-[15px] font-bold tracking-tight text-ink-100">Add a market</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {locked.map((c) => {
              const m = MODULE_META[c]
              return (
                <button key={c} onClick={() => goto('subscription')} className="card card-hover flex items-center gap-3 p-4 text-left">
                  <span className="grid h-9 w-10 place-items-center rounded-lg text-[11px] font-bold text-white opacity-60" style={{ background: m.accent }}>{m.flag}</span>
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
