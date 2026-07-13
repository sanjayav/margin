import { useEffect, useMemo, useRef, useState } from 'react'
import { create } from 'zustand'
import { useStore } from '../state/store'
import { MODULE_META, ALL_MODULES } from '../lib/modules'
import { getFleet, parentsFor } from '../data/fleet'
import { parentPoolMap } from '../engine/pooling'
import { buildShareUrl } from '../lib/share'
import Icon, { type IconName } from './Icon'

/** Open/close state lives outside React trees so the top bar, shells and the
 *  global hotkey can all drive the same palette. */
export const useCmdK = create<{ open: boolean; setOpen: (b: boolean) => void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}))

interface Command {
  id: string
  group: string
  label: string
  sub?: string
  icon: IconName
  accent?: string // swatch colour for module rows
  run: () => void
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
export const CMDK_HINT = isMac ? '⌘K' : 'Ctrl K'

export default function CommandK() {
  const open = useCmdK((s) => s.open)
  const setOpen = useCmdK((s) => s.setOpen)
  const view = useStore((s) => s.view)
  const country = useStore((s) => s.country)
  const scenario = useStore((s) => s.scenario)
  const owned = useStore((s) => s.subscribedModules)
  const poolingAddon = useStore((s) => s.poolingAddon)
  const dataVersion = useStore((s) => s.dataVersion)
  const setScreen = useStore((s) => s.setScreen)
  const setParent = useStore((s) => s.setParent)
  const setDrill = useStore((s) => s.setDrill)
  const enterModule = useStore((s) => s.enterModule)
  const exitToPlatform = useStore((s) => s.exitToPlatform)
  const logout = useStore((s) => s.logout)

  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // global hotkey
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(!useCmdK.getState().open) }
      else if (e.key === 'Escape' && useCmdK.getState().open) { e.preventDefault(); setOpen(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setOpen])

  // Reset on CLOSE (not open) so a reopen starts blank even if the user types
  // before effects flush; focus on open, lock page scroll behind the overlay.
  useEffect(() => {
    if (!open) { setQ(''); setSel(0); return }
    const t = setTimeout(() => inputRef.current?.focus(), 10) // fallback; autoFocus covers mount
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { clearTimeout(t); document.body.style.overflow = prev }
  }, [open])

  const inModule = view === 'module'

  const commands = useMemo<Command[]>(() => {
    if (!open) return []
    const done = (fn: () => void) => () => { fn(); setOpen(false) }
    const list: Command[] = []

    if (inModule) {
      const screens: { label: string; icon: IconName; go: () => void; sub?: string }[] = [
        { label: 'Analyse', icon: 'scatter', go: () => setScreen('analyse'), sub: 'actuals — the book of record, market → variant' },
        { label: 'Forecast', icon: 'trending', go: () => setScreen('forecast'), sub: 'multi-year scenario studio' },
        { label: 'Scenario · Model', icon: 'sliders' as IconName, go: () => setScreen('model'), sub: 'the workbench — levers on the live drill' },
        { label: 'Scenario · Get under the line', icon: 'target', go: () => setScreen('under'), sub: 'cheapest path to compliance' },
        { label: 'Scenario · Compare', icon: 'layers', go: () => setScreen('compare'), sub: 'saved scenarios side-by-side' },
        { label: 'Credit book', icon: 'scale' as IconName, go: () => setScreen('creditbook'), sub: 'positions, banking & trades' },
        { label: 'Pricing', icon: 'card' as IconName, go: () => setScreen('pricing'), sub: 'compliance cost per car · price & tax' },
        ...(poolingAddon ? [{ label: 'Pooling', icon: 'handshake' as IconName, go: () => setScreen('pooling'), sub: 'pools, value-split & trading' }] : []),
        { label: 'Data & imports', icon: 'database', go: () => setScreen('data'), sub: 'expert table · facets · import studio' },
        { label: 'Intelligence', icon: 'activity', go: () => setScreen('intel'), sub: 'regulatory event feed' },
        { label: 'Admin', icon: 'settings', go: () => setScreen('admin'), sub: 'rule packs · data freshness' },
      ]
      screens.forEach((s) => list.push({ id: `go-${s.label}`, group: 'Go to', label: s.label, sub: s.sub, icon: s.icon, run: done(s.go) }))

      parentsFor(country).forEach((m) =>
        list.push({
          id: `mk-${m}`, group: 'Manufacturers', label: m, sub: 'open in Analyse', icon: 'building',
          run: done(() => {
            const pmap = parentPoolMap(getFleet(country), scenario.year)
            setParent(m); setDrill([pmap[m] ?? m, m]); setScreen('analyse')
          }),
        }))
    }

    ALL_MODULES.forEach((c) => {
      const meta = MODULE_META[c]
      const isOwned = owned.includes(c)
      const current = inModule && c === country
      if (current) return
      list.push({
        id: `mod-${c}`, group: inModule ? 'Switch module' : 'Open module',
        label: meta.name, sub: isOwned ? meta.tagline : 'locked · subscribe', icon: isOwned ? 'layers' : 'shield', accent: meta.accent,
        run: done(() => (isOwned ? enterModule(c) : exitToPlatform('subscription'))),
      })
    })

    const platform: { label: string; icon: IconName; go: () => void }[] = [
      { label: 'Platform home', icon: 'gauge', go: () => exitToPlatform('home') },
      { label: 'Modules', icon: 'layers', go: () => exitToPlatform('modules') },
      { label: 'Subscription & billing', icon: 'card', go: () => exitToPlatform('subscription') },
    ]
    platform.forEach((p) => list.push({ id: `pf-${p.label}`, group: 'Platform', label: p.label, icon: p.icon, run: done(p.go) }))

    if (inModule) {
      list.push({
        id: 'act-link', group: 'Actions', label: 'Copy share link', sub: 'reproducible deep-link to this exact view', icon: 'link',
        run: done(() => { const url = buildShareUrl(); navigator.clipboard?.writeText(url).catch(() => {}) }),
      })
    }
    list.push({ id: 'act-out', group: 'Actions', label: 'Sign out', icon: 'reset', run: done(logout) })
    return list
  }, [open, inModule, country, scenario.year, owned, poolingAddon, dataVersion, setOpen, setScreen, setParent, setDrill, enterModule, exitToPlatform, logout])

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return commands
    const score = (c: Command) => {
      const label = c.label.toLowerCase()
      if (label.startsWith(needle)) return 0
      if (label.includes(needle)) return 1
      if ((c.sub ?? '').toLowerCase().includes(needle) || c.group.toLowerCase().includes(needle)) return 2
      return -1
    }
    return commands.map((c) => ({ c, s: score(c) })).filter((x) => x.s >= 0).sort((a, b) => a.s - b.s).map((x) => x.c)
  }, [commands, q])

  useEffect(() => { setSel(0) }, [q])
  useEffect(() => {
    listRef.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [sel, results])

  if (!open) return null

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); results[sel]?.run() }
  }

  // group rows for rendering, preserving result order
  let lastGroup = ''

  return (
    <div className="overlay-in fixed inset-0 z-[90] flex items-start justify-center bg-[#0D0B08]/55 px-4 pt-[14vh] backdrop-blur-[3px]" onMouseDown={() => setOpen(false)}>
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="modal-pop w-full max-w-[560px] overflow-hidden rounded-2xl border border-white/[0.10]"
        style={{ background: 'linear-gradient(180deg, #201C15, #17140F)', boxShadow: '0 40px 90px -30px rgba(0,0,0,0.85), 0 0 0 1px rgba(0,0,0,0.4)' }}
        role="dialog" aria-modal="true" aria-label="Command palette"
      >
        <div className="flex items-center gap-3 border-b border-white/[0.08] px-4 py-3.5">
          <Icon name="search" size={17} className="shrink-0 text-brand-400" />
          <input
            ref={inputRef} autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKeyDown}
            placeholder={inModule ? 'Jump to a screen, manufacturer, module or action…' : 'Jump to a screen, module or action…'}
            className="w-full bg-transparent text-[14px] text-white outline-none placeholder:text-[#6E665A]"
          />
          <span className="kbd shrink-0">esc</span>
        </div>

        <div ref={listRef} className="max-h-[46vh] overflow-y-auto p-2">
          {results.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Icon name="search" size={20} className="text-[#5E574C]" />
              <div className="text-sm text-[#8A8174]">Nothing matches “{q}”</div>
            </div>
          )}
          {results.map((c, i) => {
            const header = c.group !== lastGroup ? c.group : null
            lastGroup = c.group
            const active = i === sel
            return (
              <div key={c.id}>
                {header && <div className="px-2.5 pb-1 pt-2.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-[#6E665A]">{header}</div>}
                <button
                  data-selected={active}
                  onMouseEnter={() => setSel(i)} onClick={() => c.run()}
                  className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors ${active ? 'bg-white/[0.08]' : ''}`}
                >
                  <span
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border ${active ? 'border-brand/40 text-brand-400' : 'border-white/[0.08] text-[#8A8174]'}`}
                    style={c.accent ? { color: c.accent, borderColor: `${c.accent}55` } : undefined}
                  >
                    <Icon name={c.icon} size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-[13.5px] font-medium ${active ? 'text-white' : 'text-[#D8D0C2]'}`}>{c.label}</span>
                    {c.sub && <span className="block truncate text-[11px] text-[#7E766A]">{c.sub}</span>}
                  </span>
                  {active && <span className="kbd shrink-0">↵</span>}
                </button>
              </div>
            )
          })}
        </div>

        <div className="flex items-center gap-4 border-t border-white/[0.08] px-4 py-2.5 text-[10.5px] text-[#7E766A]">
          <span className="flex items-center gap-1.5"><span className="kbd">↑</span><span className="kbd">↓</span> navigate</span>
          <span className="flex items-center gap-1.5"><span className="kbd">↵</span> select</span>
          <span className="flex items-center gap-1.5"><span className="kbd">esc</span> close</span>
          <span className="ml-auto flex items-center gap-1.5 text-[#5E574C]"><Icon name="spark" size={11} className="text-brand-400/70" /> Autocred AI</span>
        </div>
      </div>
    </div>
  )
}
