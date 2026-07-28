import { useStore } from '../state/store'
import { MODULE_META, ALL_MODULES, AI_PRICE_GBP, POOLING_PRICE_GBP } from '../lib/modules'
import Icon from '../components/Icon'
import Flag from '../components/Flag'

function Switch({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} role="switch" aria-checked={on}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-all duration-200 active:scale-95 ${on ? 'shadow-[0_2px_8px_-2px_rgba(232,34,59,0.5)]' : ''}`}
      style={{ background: on ? 'linear-gradient(180deg,#F66864,#E8223B)' : 'rgba(0,0,0,0.15)', boxShadow: on ? undefined : 'inset 0 1px 2px rgba(0,0,0,0.12)' }}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all duration-200 ${on ? 'left-[22px] shadow-[0_1px_3px_rgba(120,40,0,0.4)]' : 'left-0.5 shadow'}`} />
    </button>
  )
}

export default function Subscription() {
  const owned = useStore((s) => s.subscribedModules)
  const ai = useStore((s) => s.aiEnabled)
  const pooling = useStore((s) => s.poolingAddon)
  const subscribe = useStore((s) => s.subscribe)
  const unsubscribe = useStore((s) => s.unsubscribe)
  const setAi = useStore((s) => s.setAi)
  const setPooling = useStore((s) => s.setPooling)
  const enter = useStore((s) => s.enterModule)

  const moduleTotal = owned.reduce((a, c) => a + MODULE_META[c].priceGBP, 0)
  const total = moduleTotal + (ai ? AI_PRICE_GBP : 0) + (pooling ? POOLING_PRICE_GBP : 0)

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
      {/* left: catalogue */}
      <div className="space-y-5">
        <div className="card p-5">
          <div className="mb-1 flex items-center gap-2">
            <Icon name="layers" size={16} className="text-brand" />
            <h2 className="font-display text-[15px] font-bold tracking-tight text-ink-100">Country modules</h2>
          </div>
          <p className="mb-4 text-[11px] text-ink-500">Each market is its own module — subscribe to one or many. Changes apply instantly (mock billing until Stripe is connected).</p>
          <div className="divide-y divide-black/[0.05]">
            {ALL_MODULES.map((c) => {
              const m = MODULE_META[c], on = owned.includes(c)
              return (
                <div key={c} className="flex items-center gap-3 py-3">
                  <Flag id={m.id} className="h-9 w-10" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-ink-100">{m.name}</div>
                    <div className="truncate text-[11px] text-ink-500">{m.tagline} · {m.regulation}</div>
                  </div>
                  <div className="shrink-0 rounded-full border border-black/[0.08] px-2 py-0.5 text-right text-[10px] font-semibold uppercase tracking-wide text-ink-500">Custom</div>
                  <Switch on={on} onClick={() => (on ? unsubscribe(c) : subscribe(c))} />
                </div>
              )
            })}
          </div>
        </div>

        <div className="card p-5">
          <div className="mb-1 flex items-center gap-2">
            <Icon name="spark" size={16} className="text-brand" />
            <h2 className="font-display text-[15px] font-bold tracking-tight text-ink-100">Add-ons</h2>
          </div>
          <p className="mb-4 text-[11px] text-ink-500">Cross-cutting capabilities — used inside every module you own.</p>
          <div className="divide-y divide-black/[0.05]">
            <div className="flex items-center gap-3 py-3">
              <span className="grid h-9 w-10 place-items-center rounded-lg text-white" style={{ background: 'linear-gradient(160deg,#F66864,#E8223B)' }}><Icon name="spark" size={16} /></span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-ink-100">AI Analyst</div>
                <div className="truncate text-[11px] text-ink-500">Ask AiRE in plain English — numbers from the live engine.</div>
              </div>
              <div className="shrink-0 rounded-full border border-black/[0.08] px-2 py-0.5 text-right text-[10px] font-semibold uppercase tracking-wide text-ink-500">Custom</div>
              <Switch on={ai} onClick={() => setAi(!ai)} />
            </div>
            <div className="flex items-center gap-3 py-3">
              <span className="grid h-9 w-10 place-items-center rounded-lg bg-accentblue/15 text-accentblue"><Icon name="handshake" size={16} /></span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-ink-100">Pooling & credit market</div>
                <div className="truncate text-[11px] text-ink-500">Cheapest legal pool, fair value-split & credit trading where the regime allows.</div>
              </div>
              <div className="shrink-0 rounded-full border border-black/[0.08] px-2 py-0.5 text-right text-[10px] font-semibold uppercase tracking-wide text-ink-500">Custom</div>
              <Switch on={pooling} onClick={() => setPooling(!pooling)} />
            </div>
          </div>
        </div>
      </div>

      {/* right: summary */}
      <div className="space-y-4">
        <div className="card sticky top-6 p-5">
          <div className="label text-ink-500">Your plan</div>
          <div className="font-display mt-1 text-[24px] font-extrabold leading-none tracking-tight text-ink-100">Custom pricing</div>
          <div className="mt-1.5 text-[11px] text-ink-500">Tailored to your markets, entities and scale.</div>
          <div className="mt-4 space-y-2 border-t border-black/[0.05] pt-4 text-[12px]">
            <div className="text-[10px] font-bold uppercase tracking-wide text-ink-500">Included</div>
            {owned.length === 0 && <div className="text-ink-500">No modules selected.</div>}
            {owned.map((c) => (
              <div key={c} className="flex items-center gap-1.5 text-ink-200"><Icon name="check" size={12} className="text-safe" /> {MODULE_META[c].name}</div>
            ))}
            {ai && <div className="flex items-center gap-1.5 text-ink-200"><Icon name="check" size={12} className="text-safe" /> AI Analyst</div>}
            {pooling && <div className="flex items-center gap-1.5 text-ink-200"><Icon name="check" size={12} className="text-safe" /> Pooling & credit market</div>}
          </div>
          <a href="mailto:sales@marklytics.co.uk?subject=AiRE%20subscription" className="btn-primary mt-5 w-full"><Icon name="card" size={15} /> Talk to sales</a>
          {owned.length > 0 && (
            <button onClick={() => enter(owned[0])} className="btn-ghost mt-2 w-full"><Icon name="scatter" size={15} /> Open {MODULE_META[owned[0]].name}</button>
          )}
          <p className="mt-3 text-[10px] leading-relaxed text-ink-500">Pricing is bespoke and agreed with sales. Entitlements are mocked locally until billing is connected.</p>
        </div>
      </div>
    </div>
  )
}
