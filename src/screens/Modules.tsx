import { useMemo } from 'react'
import { useStore } from '../state/store'
import { MODULE_META, ALL_MODULES, AI_PRICE_GBP, POOLING_PRICE_GBP, moduleSummary } from '../lib/modules'
import { fmtInt, fmtMoney, fmtNum } from '../engine/engine'
import { getPack, hasCreditBook } from '../engine/rulepacks'
import type { CountryId, CoverageTier } from '../engine/types'
import Icon from '../components/Icon'
import Flag from '../components/Flag'

// A module card must never present a three-manufacturer sample as a market
// position. The tier decides whether the card shows live figures at all.
const COVERAGE_CHIP: Record<CoverageTier, { label: string; cls: string }> = {
  market:  { label: 'Market data',   cls: 'bg-safe/10 text-safe' },
  partial: { label: 'Covered scope', cls: 'bg-warn/10 text-warn' },
  preview: { label: 'Preview data',  cls: 'bg-black/[0.05] text-ink-500' },
}

// What a module subscription buys. The Credit book only exists where an
// instrument moves between makers — the EU issues none, so its card doesn't
// promise a ledger it will never show.
const included = (c: CountryId) => [
  'Plan (actuals drill-down)', 'Forecast studio', 'Scenario workbench & compare',
  ...(hasCreditBook(c) ? ['Credit book'] : []), 'Pricing & tax',
]

export default function Modules() {
  const owned = useStore((s) => s.subscribedModules)
  const ai = useStore((s) => s.aiEnabled)
  const pooling = useStore((s) => s.poolingAddon)
  const enter = useStore((s) => s.enterModule)
  const enterTrueReg = useStore((s) => s.enterTrueReg)
  const goto = useStore((s) => s.setPlatformScreen)
  const dataVersion = useStore((s) => s.dataVersion)
  const summaries = useMemo(() => Object.fromEntries(ALL_MODULES.map((c) => [c, moduleSummary(c)])), [dataVersion])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {ALL_MODULES.map((c, i) => {
          const m = MODULE_META[c], s = summaries[c]
          const isOwned = owned.includes(c)
          const cov = getPack(c).coverage
          const chip = COVERAGE_CHIP[cov.tier]
          const isPreview = cov.tier === 'preview'
          return (
            <div key={c} style={{ animationDelay: `${i * 70}ms` }} className={`card rise relative overflow-hidden p-5 ${isOwned ? '' : 'opacity-95'}`}>
              <span className="absolute inset-x-0 top-0 h-1" style={{ background: m.accent }} />
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <Flag id={m.id} className="h-11 w-12" rounded="rounded-xl" />
                  <div>
                    <div className="font-display text-[16px] font-bold leading-tight text-ink-100">{m.name}</div>
                    <div className="text-[11px] text-ink-500">{m.tagline}</div>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {isOwned
                    ? <span className="rounded-full bg-safe/10 px-2 py-0.5 text-[10px] font-bold text-safe">Active</span>
                    : <span className="flex items-center gap-1 rounded-full bg-black/[0.05] px-2 py-0.5 text-[10px] font-bold text-ink-500"><Icon name="shield" size={10} /> Locked</span>}
                  <span className={`rounded-full px-2 py-0.5 text-[9.5px] font-bold ${chip.cls}`}>{chip.label}</span>
                </div>
              </div>

              <div className="mt-3 rounded-lg bg-black/[0.02] px-3 py-2 text-[11px] text-ink-500">{m.regulation}</div>

              {/* A sample fleet has no market position, so a preview module states
                  what it is instead of printing a number that means nothing. */}
              {isPreview ? (
                <div className="mt-4 rounded-lg border border-dashed border-black/10 bg-black/[0.015] px-3 py-3">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-ink-300"><Icon name="alert" size={12} /> Rule pack ready · market data pending</div>
                  <p className="mt-1 text-[11px] leading-relaxed text-ink-500">{cov.detail}</p>
                </div>
              ) : (
                <>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div><div className="dnum text-[15px] font-bold text-ink-100">{fmtNum(s.fleet, 0)}</div><div className="text-[10px] text-ink-500">fleet {s.metricUnit}</div></div>
                    <div><div className="dnum text-[15px] font-bold text-ink-100">{fmtInt(s.makers)}</div><div className="text-[10px] text-ink-500">makers</div></div>
                    <div><div className={`dnum text-[15px] font-bold ${s.fine > 0 ? 'text-danger' : 'text-safe'}`}>{fmtMoney(s.fine, s.currency)}</div><div className="text-[10px] text-ink-500">at risk</div></div>
                  </div>
                  <div className="mt-2 text-center text-[10px] text-ink-500">{cov.label}</div>
                </>
              )}

              <div className="mt-4 flex flex-wrap gap-1.5">
                {included(c).map((f) => <span key={f} className="rounded-md bg-black/[0.04] px-1.5 py-0.5 text-[10px] text-ink-500">{f}</span>)}
              </div>

              <div className="mt-5 flex items-center justify-between border-t border-black/[0.05] pt-4">
                <div className="text-[11px] text-ink-500">from <span className="dnum font-bold text-ink-200">£{m.priceGBP}</span>/mo</div>
                {isOwned
                  ? <button onClick={() => enter(c)} className={`px-4 py-2 text-xs ${isPreview ? 'btn-ghost' : 'btn-primary'}`}><Icon name="scatter" size={14} /> {isPreview ? 'Open preview' : 'Open module'}</button>
                  : <button onClick={() => goto('subscription')} className="btn-ghost px-4 py-2 text-xs"><Icon name="card" size={14} /> Subscribe</button>}
              </div>
            </div>
          )
        })}
      </div>

      {/* TrueReg — a second product line on the same platform. It is deliberately
          NOT a country module: it reads a product record rather than a fleet, so
          it carries its own workspace and its own obligation graph. */}
      <div className="card rise relative overflow-hidden p-5">
        <span className="absolute inset-x-0 top-0 h-1" style={{ background: 'linear-gradient(90deg,#E8223B,#F66864 55%,transparent)' }} />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand/12 text-brand"><Icon name="shield" size={20} /></span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display text-[16px] font-bold text-ink-100">TrueReg</span>
                <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-bold text-brand">Agentic regulatory intelligence</span>
              </div>
              <p className="mt-1.5 max-w-[64ch] text-[11.5px] leading-relaxed text-ink-500">
                Prove your carbon number, keep the account. An agent workforce assembles, verifies and defends the
                compliance data European buyers now need — starting with CBAM. Works in Chinese, cites in EU legal
                text, and shows its reasoning at every step.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {['CBAM EU · live', 'UK CBAM', 'Deterministic engine', 'Bilingual term base', 'Nothing auto-submitted'].map((f) => (
                  <span key={f} className="rounded-md bg-black/[0.04] px-1.5 py-0.5 text-[10px] text-ink-500">{f}</span>
                ))}
              </div>
            </div>
          </div>
          <button onClick={enterTrueReg} className="btn-primary shrink-0 px-4 py-2 text-xs"><Icon name="shield" size={14} /> Open TrueReg</button>
        </div>
      </div>

      {/* add-ons */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="card rise flex items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white" style={{ background: 'linear-gradient(160deg,#F66864,#E8223B)' }}><Icon name="spark" size={20} /></span>
            <div>
              <div className="font-display text-[14px] font-bold text-ink-100">AI Analyst</div>
              <div className="text-[11px] text-ink-500">Ask AiRE — works in every owned module. £{AI_PRICE_GBP}/mo</div>
            </div>
          </div>
          {ai
            ? <span className="shrink-0 rounded-full bg-safe/10 px-3 py-1.5 text-xs font-bold text-safe">Active</span>
            : <button onClick={() => goto('subscription')} className="btn-primary shrink-0 px-4 py-2 text-xs">Add</button>}
        </div>
        <div className="card rise flex items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accentblue/15 text-accentblue"><Icon name="handshake" size={20} /></span>
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
