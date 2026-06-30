import { useMemo } from 'react'
import { useStore } from '../state/store'
import { MODULE_META, ALL_MODULES, AI_PRICE_GBP, POOLING_PRICE_GBP, moduleSummary } from '../lib/modules'
import { fmtInt, fmtMoney, fmtNum } from '../engine/engine'
import Icon from '../components/Icon'

const INCLUDED = ['Analyze drill-down', 'Analytics charts', 'Raw data viewer', 'Plan & pooling', 'Forecast']

export default function Modules() {
  const owned = useStore((s) => s.subscribedModules)
  const ai = useStore((s) => s.aiEnabled)
  const pooling = useStore((s) => s.poolingAddon)
  const enter = useStore((s) => s.enterModule)
  const goto = useStore((s) => s.setPlatformScreen)
  const dataVersion = useStore((s) => s.dataVersion)
  const summaries = useMemo(() => Object.fromEntries(ALL_MODULES.map((c) => [c, moduleSummary(c)])), [dataVersion])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {ALL_MODULES.map((c, i) => {
          const m = MODULE_META[c], s = summaries[c]
          const isOwned = owned.includes(c)
          return (
            <div key={c} style={{ animationDelay: `${i * 70}ms` }} className={`card rise relative overflow-hidden p-5 ${isOwned ? '' : 'opacity-95'}`}>
              <span className="absolute inset-x-0 top-0 h-1" style={{ background: m.accent }} />
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-12 place-items-center rounded-xl text-[12px] font-bold text-white" style={{ background: m.accent }}>{m.flag}</span>
                  <div>
                    <div className="font-display text-[16px] font-bold leading-tight text-ink-100">{m.name}</div>
                    <div className="text-[11px] text-ink-500">{m.tagline}</div>
                  </div>
                </div>
                {isOwned
                  ? <span className="rounded-full bg-safe/10 px-2 py-0.5 text-[10px] font-bold text-safe">Active</span>
                  : <span className="flex items-center gap-1 rounded-full bg-black/[0.05] px-2 py-0.5 text-[10px] font-bold text-ink-500"><Icon name="shield" size={10} /> Locked</span>}
              </div>

              <div className="mt-3 rounded-lg bg-black/[0.02] px-3 py-2 text-[11px] text-ink-500">{m.regulation}</div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div><div className="dnum text-[15px] font-bold text-ink-100">{fmtNum(s.fleet, 0)}</div><div className="text-[10px] text-ink-500">fleet {s.metricUnit}</div></div>
                <div><div className="dnum text-[15px] font-bold text-ink-100">{fmtInt(s.makers)}</div><div className="text-[10px] text-ink-500">makers</div></div>
                <div><div className={`dnum text-[15px] font-bold ${s.fine > 0 ? 'text-danger' : 'text-safe'}`}>{fmtMoney(s.fine, s.currency)}</div><div className="text-[10px] text-ink-500">at risk</div></div>
              </div>

              <div className="mt-4 flex flex-wrap gap-1.5">
                {INCLUDED.map((f) => <span key={f} className="rounded-md bg-black/[0.04] px-1.5 py-0.5 text-[10px] text-ink-500">{f}</span>)}
              </div>

              <div className="mt-5 flex items-center justify-between border-t border-black/[0.05] pt-4">
                <div className="text-[11px] text-ink-500">from <span className="dnum font-bold text-ink-200">£{m.priceGBP}</span>/mo</div>
                {isOwned
                  ? <button onClick={() => enter(c)} className="btn-primary px-4 py-2 text-xs"><Icon name="scatter" size={14} /> Open module</button>
                  : <button onClick={() => goto('subscription')} className="btn-ghost px-4 py-2 text-xs"><Icon name="card" size={14} /> Subscribe</button>}
              </div>
            </div>
          )
        })}
      </div>

      {/* add-ons */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="card rise flex items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white" style={{ background: 'linear-gradient(160deg,#FF8A4C,#ED4709)' }}><Icon name="spark" size={20} /></span>
            <div>
              <div className="font-display text-[14px] font-bold text-ink-100">AI Analyst</div>
              <div className="text-[11px] text-ink-500">Ask Autocred AI — works in every owned module. £{AI_PRICE_GBP}/mo</div>
            </div>
          </div>
          {ai
            ? <span className="shrink-0 rounded-full bg-safe/10 px-3 py-1.5 text-xs font-bold text-safe">Active</span>
            : <button onClick={() => goto('subscription')} className="btn-primary shrink-0 px-4 py-2 text-xs">Add</button>}
        </div>
        <div className="card rise flex items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent"><Icon name="handshake" size={20} /></span>
            <div>
              <div className="font-display text-[14px] font-bold text-ink-100">Pooling & credit market</div>
              <div className="text-[11px] text-ink-500">Cheapest pool, fair value-split, trading. £{POOLING_PRICE_GBP}/mo</div>
            </div>
          </div>
          {pooling
            ? <span className="shrink-0 rounded-full bg-safe/10 px-3 py-1.5 text-xs font-bold text-safe">Active</span>
            : <button onClick={() => goto('subscription')} className="btn-primary shrink-0 px-4 py-2 text-xs">Add</button>}
        </div>
      </div>
    </div>
  )
}
