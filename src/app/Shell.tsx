// ───────────────────────────────────────────────────────────────────────────
// SHELL — three panes with fixed meaning.
//
// The layout problem this fixes is the one that made the product feel complex:
// the right-hand pane was FactsRail on one screen, ScenarioRail on another and
// nothing on a third, so a user could never learn what that side of the screen
// IS. Here it is always the Inspector — "tell me more about what I have
// selected". What fills it is contextual; that it exists, and where, is not.
//
//   NAV            WORKING SURFACE              INSPECTOR
//   market         one module, one job          evidence · agent · assumption
//   modules        ONE primary action           (never a primary action)
//   persona        <= 4 metrics above fold
//
// Navigation stays visible — a command palette is how an expert moves, not how a
// new user learns — and the nav is generated from the market registry crossed
// with entitlements, so a module the customer cannot buy in this regime is not
// rendered at all rather than rendered locked.
// ───────────────────────────────────────────────────────────────────────────
import { useMemo, type ReactNode } from 'react'
import { useStore } from '../state/store'
import { getMarket } from '../markets'
import { visibleModules, entitlementsFrom, type Access } from '../markets/entitlements'
import Icon from '../components/Icon'
import { SURFACE, LINE, TEXT, BRAND, EASE } from '../design/tokens'

export interface ShellProps {
  /** The module surface. */
  children: ReactNode
  /** Pane 3. Absent = the working surface takes the full width. */
  inspector?: ReactNode
  /** Title of the inspector, so the pane always announces what it is. */
  inspectorTitle?: string
}

export default function Shell({ children, inspector, inspectorTitle }: ShellProps) {
  const country = useStore((s) => s.country)
  const screen = useStore((s) => s.screen)
  const setScreen = useStore((s) => s.setScreen)
  const viewMode = useStore((s) => s.viewMode)
  const subscribed = useStore((s) => s.subscribedModules)
  const ai = useStore((s) => s.aiEnabled)
  const pooling = useStore((s) => s.poolingAddon)
  const exitToPlatform = useStore((s) => s.exitToPlatform)

  const market = getMarket(country)
  const ent = useMemo(() => entitlementsFrom(subscribed, ai, pooling), [subscribed, ai, pooling])
  const groups = useMemo(() => {
    if (!market) return []
    const access = new Map(visibleModules(market, ent).map((x) => [x.module.id, x.access]))
    return market.nav
      .map((g) => ({
        group: g.group,
        modules: g.modules
          .map((id) => market.modules[id])
          .filter((m) => m && access.has(m.id))
          .map((m) => ({ ...m, access: access.get(m.id) as Access })),
      }))
      .filter((g) => g.modules.length)
  }, [market, ent])

  // Board is the calm door: one number, no controls, no inspector. Analyst is
  // the cockpit. Same engine, same numbers — the difference is what is shown.
  const board = viewMode === 'board'

  return (
    <div className="aire-dark flex min-h-0 flex-1" style={{ background: SURFACE.base, color: TEXT.primary }}>
      {market && (
        <nav aria-label="Modules" style={{ borderRight: `1px solid ${LINE.hair}` }}
          className="hidden w-[236px] shrink-0 flex-col px-3 py-5 lg:flex">
          {/* Market identity and the way back to the platform. Without this a
              chrome-owning module is a room with no door. */}
          <button onClick={() => exitToPlatform()}
            className="mb-7 flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-white/[0.04]">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[11px] font-bold" style={{ background: SURFACE.high, color: TEXT.secondary, boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06)` }}>{market.id}</span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold" style={{ color: TEXT.primary }}>{market.name}</span>
              <span className="block truncate text-[10.5px]" style={{ color: TEXT.muted }}>Switch module</span>
            </span>
          </button>
          {groups.map((g) => (
            <div key={g.group} className="mb-6">
              <div className="px-2.5 pb-2 text-[9.5px] font-bold uppercase tracking-[0.16em]" style={{ color: TEXT.faint }}>{g.group}</div>
              {g.modules.map((m) => {
                const on = screen === m.id
                return (
                  <button key={m.id} onClick={() => setScreen(m.id as never)} title={m.purpose}
                    style={on
                      ? { background: BRAND.wash, color: TEXT.primary, boxShadow: `inset 2px 0 0 ${BRAND.base}`, transitionTimingFunction: EASE }
                      : { color: TEXT.secondary, transitionTimingFunction: EASE }}
                    className={`group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-all duration-200 ${on ? 'font-semibold' : 'hover:bg-white/[0.04]'}`}>
                    <Icon name={m.icon} size={15} className={on ? 'text-brand' : 'opacity-55'} />
                    <span className="min-w-0 flex-1 truncate">{m.label}</span>
                    {/* A sellable module is shown, not hidden — it has to sell
                        itself. An unavailable one never reaches this list. */}
                    {m.access === 'sellable' && (
                      <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide" style={{ color: TEXT.faint, boxShadow: `inset 0 0 0 1px ${LINE.hair}` }}>Add</span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>
      )}

      <main className={`min-w-0 flex-1 overflow-y-auto ${board ? 'px-10 py-12' : 'px-8 py-7'}`}>
        <div className={board ? 'mx-auto max-w-[820px]' : 'mx-auto max-w-[1200px]'}>{children}</div>
      </main>

      {/* Pane 3 — always the same thing, never a primary action. Hidden in Board,
          because Board's whole promise is that there is nothing to operate. */}
      {inspector && !board && (
        <aside aria-label={inspectorTitle ?? 'Inspector'}
          style={{ borderLeft: `1px solid ${LINE.hair}` }}
          className="hidden w-[328px] shrink-0 overflow-y-auto px-5 py-6 xl:block">
          {inspectorTitle && (
            <div className="mb-4 text-[9.5px] font-bold uppercase tracking-[0.16em]" style={{ color: TEXT.faint }}>{inspectorTitle}</div>
          )}
          {inspector}
        </aside>
      )}
    </div>
  )
}
