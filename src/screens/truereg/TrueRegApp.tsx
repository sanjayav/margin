// ───────────────────────────────────────────────────────────────────────────
// THE TrueReg WORKSPACE SHELL.
//
// Built mobile-first on purpose. The people who hold the answers — the plant
// engineer who knows what 2#炼钢电炉 actually does, the export sales lead
// fielding a buyer's question — are not at a desk when they are asked. So the
// phone layout is the real one: a fixed bottom tab bar, single-column cards,
// wide tables that scroll inside themselves rather than dragging the page
// sideways. The desktop rail is the enhancement, not the other way round.
//
// The chrome states the one thing that must never be misread: whether the
// figures on screen rest on the published tables or on indicative ones.
// ───────────────────────────────────────────────────────────────────────────
import { useMemo } from 'react'
import { useTr, type Surface } from '../../truereg/ui/state'
import { DEMO_BUNDLE, DEMO_CONTRACTS } from '../../truereg/record/demo'
import { calculateAll } from '../../truereg/cbam/emissions'
import { computeDelta } from '../../truereg/cbam/delta'
import { currentDefaults } from '../../truereg/cbam/defaults'
import { CORPUS_VERSION } from '../../truereg/corpus/clauses'
import Icon, { type IconName } from '../../components/Icon'
import ErrorBoundary from '../../components/ErrorBoundary'
import { CorpusSheet, LangToggle, eur, n2 } from './parts'
import Ask from './Ask'
import TheNumber from './TheNumber'
import Exposure from './Exposure'
import Verification from './Verification'
import Duties from './Duties'

const CHROME = '#17140F'

const NAV: { id: Surface; label: string; labelZh: string; icon: IconName; hint: string }[] = [
  { id: 'console', label: 'Ask', labelZh: '提问', icon: 'spark', hint: 'Ask in English or Chinese, or hand the agents a goal' },
  { id: 'number', label: 'The number', labelZh: '排放数值', icon: 'target', hint: 'Embedded emissions and the whole derivation' },
  { id: 'exposure', label: 'Exposure', labelZh: '风险敞口', icon: 'scale', hint: 'What proving it is worth, per buyer' },
  { id: 'verify', label: 'Verify', labelZh: '核查', icon: 'shield', hint: 'The site visit, rehearsed' },
  { id: 'duties', label: 'Duties', labelZh: '义务', icon: 'section', hint: 'The obligation graph across regimes' },
]

const SCREENS: Record<Surface, () => JSX.Element> = { console: Ask, number: TheNumber, exposure: Exposure, verify: Verification, duties: Duties }

export default function TrueRegApp({ onExit }: { onExit?: () => void }) {
  const surface = useTr((s) => s.surface)
  const setSurface = useTr((s) => s.setSurface)
  const substitute = useTr((s) => s.substituteDefaults)
  const Screen = SCREENS[surface]
  const item = NAV.find((n) => n.id === surface)!

  const head = useMemo(() => {
    const rows = calculateAll(DEMO_BUNDLE, { substituteDefaultsForUnknownPrecursors: substitute })
    const hrc = rows.find((r) => r.productId === 'pr-hrc')
    const delta = computeDelta(DEMO_CONTRACTS, rows, {
      price: { eur: 78, asOf: '2026-09-01', source: 'assumed', status: 'assumed' }, defaultsCountry: 'CN',
    })
    return { see: hrc?.see ?? null, basis: hrc?.basis ?? 'default', saving: delta.totals.buyerSavingEur, blocked: delta.totals.blockedCount }
  }, [substitute])

  const defaults = currentDefaults()

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden lg:flex-row">
      {/* ── desktop rail ──────────────────────────────────────────────────── */}
      <nav className="hidden w-[236px] shrink-0 flex-col gap-1 border-r border-white/[0.08] p-3.5 lg:flex" style={{ background: CHROME }}>
        <button onClick={onExit} className="mb-4 flex items-center gap-2.5 px-1.5 pt-1 text-left">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand/15 text-brand-400"><Icon name="shield" size={19} /></span>
          <span>
            <span className="block font-display text-[16px] font-extrabold leading-none tracking-tight text-white">TrueReg</span>
            <span className="mt-1 block text-[10px] tracking-wide text-[#9A9082]">Regulatory intelligence</span>
          </span>
        </button>

        <InstallationCard />

        <div className="label px-1.5 pb-1.5 pt-3 text-[#8A8174]">Workspace</div>
        {NAV.map((n) => {
          const on = surface === n.id
          return (
            <button key={n.id} onClick={() => setSurface(n.id)} title={n.hint}
              className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13.5px] transition ${on ? 'bg-white/[0.08] text-white' : 'text-[#A89E8C] hover:bg-white/[0.04] hover:text-white'}`}>
              {on && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand" />}
              <Icon name={n.icon} size={17} className={on ? 'text-brand-400' : 'text-[#7E766A] group-hover:text-[#B8AE9C]'} />
              <span className="flex-1 font-medium">{n.label}</span>
            </button>
          )
        })}

        <div className="mt-auto space-y-2 pt-4">
          <div className={`rounded-xl border p-3 ${defaults.status === 'published' ? 'border-safe/25 bg-safe/[0.07]' : 'border-warn/25 bg-warn/[0.07]'}`}>
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: defaults.status === 'published' ? '#37D39B' : '#F0A93C' }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: defaults.status === 'published' ? '#0E9F6E' : '#D98005' }} />
              {defaults.status} defaults
            </div>
            <p className="mt-1.5 text-[10px] leading-relaxed text-white/45">
              {defaults.status === 'published' ? 'Figures use the published Commission table.' : 'Figures are correct in method and order of magnitude, and are not the surrendered number.'}
            </p>
          </div>
          <div className="px-1 text-[9.5px] leading-relaxed text-[#6E665A]">
            Corpus {CORPUS_VERSION} · defaults {defaults.version}<br />EU text governs · 中文为阅读辅助
          </div>
        </div>
      </nav>

      {/* ── main ──────────────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* top bar — compact on a phone, informative on a desktop */}
        <header className="sticky top-0 z-30 border-b border-white/[0.08]" style={{ background: CHROME }}>
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-6 sm:py-3">
            <div className="flex min-w-0 items-center gap-3">
              <button onClick={onExit} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand/15 text-brand-400 lg:hidden"><Icon name="shield" size={18} /></button>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[10.5px] text-[#9A9082]">
                  <span className="truncate font-semibold text-[#C9C0B2]" lang="zh-CN">{DEMO_BUNDLE.installation.nameLocal}</span>
                  <span className="hidden text-[#5E574C] sm:inline">/</span>
                  <span className="hidden sm:inline">{DEMO_BUNDLE.period.from.slice(0, 4)}</span>
                </div>
                <h1 className="truncate font-display text-[16px] font-bold leading-tight tracking-tight text-white sm:text-[19px]">{item.label}</h1>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <LangToggle />
              <div className="hidden h-9 w-px bg-white/[0.10] md:block" />
              <div className="hidden text-right md:block">
                <div className="label text-[#8A8174]">HRC actual</div>
                <div className="dnum mt-0.5 text-[14px] font-bold text-white">
                  {head.see == null ? '—' : n2(head.see, 3)}<span className="ml-1 text-[10px] font-medium text-[#9A9082]">tCO₂e/t</span>
                </div>
              </div>
              <div className="hidden h-9 w-px bg-white/[0.10] lg:block" />
              <div className="hidden text-right lg:block">
                <div className="label text-[#8A8174]">Buyer saving</div>
                <div className="dnum mt-0.5 text-[14px] font-bold text-safe">
                  {eur(head.saving)}{head.blocked > 0 && <span className="ml-1 text-[10px] font-medium text-[#F0A93C]">{head.blocked} on defaults</span>}
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* The chat owns its own scrolling so the composer can dock to the pane
            instead of floating over the conversation. Every other surface is a
            plain document and scrolls here. */}
        {surface === 'console' ? (
          <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <ErrorBoundary screenKey={surface}><Screen /></ErrorBoundary>
          </main>
        ) : (
          <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-28 pt-4 sm:px-6 sm:pt-5 lg:pb-6">
            <div className="mx-auto w-full max-w-[1180px]">
              {/* No standing description here: every surface opens with its own
                  live verdict instead. A grey subtitle that never changes is
                  furniture, not information. */}
              <ErrorBoundary screenKey={surface}>
                <div key={surface} style={{ animation: 'screenIn .3s cubic-bezier(.2,.7,.2,1)' }}><Screen /></div>
              </ErrorBoundary>
            </div>
          </main>
        )}
      </div>

      {/* ── phone tab bar ─────────────────────────────────────────────────── */}
      <nav aria-label="Sections"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-white/[0.08] lg:hidden"
        style={{ background: CHROME, paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {NAV.map((n) => {
          const on = surface === n.id
          return (
            <button key={n.id} onClick={() => setSurface(n.id)} aria-current={on ? 'page' : undefined}
              className="relative flex min-w-0 flex-1 flex-col items-center gap-1 py-2.5">
              {on && <span className="absolute inset-x-3 top-0 h-[2px] rounded-b-full bg-brand" />}
              <Icon name={n.icon} size={19} className={on ? 'text-brand-400' : 'text-[#7E766A]'} />
              <span className={`truncate px-1 text-[10px] font-semibold ${on ? 'text-white' : 'text-[#8A8174]'}`}>{n.label}</span>
            </button>
          )
        })}
      </nav>

      <CorpusSheet />
    </div>
  )
}

function InstallationCard() {
  const b = DEMO_BUNDLE
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
      <div className="label text-[#8A8174]">Installation</div>
      <div className="mt-1.5 truncate text-[12.5px] font-bold text-white">{b.installation.name}</div>
      <div className="mt-0.5 truncate text-[11px] text-[#9A9082]" lang="zh-CN">{b.installation.nameLocal} · {b.operator.nameLocal}</div>
      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-[#7E766A]">
        <Icon name="clock" size={10} />
        {b.period.from} → {b.period.to}
      </div>
    </div>
  )
}
