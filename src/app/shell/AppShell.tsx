/* ───────────────────────────────────────────────────────────────────────────
   App shell — navigation, header, command palette.
   ---------------------------------------------------------------------------
   Structure, stated once:

     ┌──────────┬────────────────────────────────────┬───────────┐
     │ Nav      │ Header — where you are, how you are │ Agent     │
     │ 236px    ├────────────────────────────────────┤ console   │
     │          │ Module                             │ 396px     │
     └──────────┴────────────────────────────────────┴───────────┘

   Three ideas the old shell got wrong and this one fixes:

   • ONE LEVEL OF NAVIGATION. There is no launcher-then-workspace two-step and no
     collapsible hub tree. Every module is one click from every other module, and
     the market is a control in the header, not a place you travel to.
   • THE VERDICT IS ALWAYS ON SCREEN. Position and exposure sit in the header on
     every module, on a stated basis, so no screen can be read out of context.
   • THE AGENTS HAVE A HOME. A docked rail, not a floating assistant — an agent
     is part of the workspace, not a chatbot bolted to the corner of it.
   ─────────────────────────────────────────────────────────────────────────── */
import React, { useEffect, useMemo, useState } from 'react'
import {
  Avatar, Badge, Button, cx, Divider, IconButton, Input, Kbd, MenuItem, Popover,
  Segmented, StatusDot, Tooltip, fmtCompact, fmtGap,
} from '../design/primitives'
import Icon, { Logo, type IconName } from '../design/icons'
import { useApp, useRole } from '../state/appStore'
import { settledThrough, usePosition } from '../state/usePosition'
import { can, ROLES, type Permission } from '../auth/rbac'
import { PACK_LIST } from '../../engine/rulepacks'
import type { CountryId } from '../../engine/types'
import { AGENTS, agentsForModule } from '../agents/registry'
import { isRunning } from '../agents/kernel'
import type { ModuleId } from '../agents/kernel'
import { AgentConsole } from '../agents/ui/AgentConsole'
import { fmtMoney, fmtNum } from '../../engine/engine'

/* ── module map ───────────────────────────────────────────────────────────── */

export interface ModuleMeta {
  id: ModuleId | 'settings'
  label: string
  icon: IconName
  blurb: string
  perm: Permission
  group: 'Position' | 'Instruments' | 'Foundation'
}

export const MODULES: ModuleMeta[] = [
  { id: 'plan',       label: 'Plan',        icon: 'plan',       group: 'Position',    perm: 'plan.view',      blurb: 'Actuals only — this year and last, and how fresh they are' },
  { id: 'forecast',   label: 'Forecast',    icon: 'forecast',   group: 'Position',    perm: 'forecast.view',  blurb: 'The next five years, built from evidence' },
  { id: 'scenario',   label: 'Scenario',    icon: 'scenario',   group: 'Position',    perm: 'scenario.view',  blurb: 'What you could do about it, validated' },
  { id: 'creditbook', label: 'Credit book', icon: 'creditbook', group: 'Instruments', perm: 'creditbook.view',blurb: 'Positions, transfers and banked balances' },
  { id: 'pooling',    label: 'Pooling',     icon: 'pooling',    group: 'Instruments', perm: 'pooling.view',   blurb: 'Who to pool with, and what it is worth' },
  { id: 'data',       label: 'Data',        icon: 'data',       group: 'Foundation',  perm: 'data.view',      blurb: 'Sources, imports and quality' },
  { id: 'regai',      label: 'Reg AI',      icon: 'regai',      group: 'Foundation',  perm: 'regai.view',     blurb: 'What the rules are about to do to you' },
  { id: 'settings',   label: 'Settings',    icon: 'settings',   group: 'Foundation',  perm: 'settings.view',  blurb: 'People, roles and agent policy' },
]

export const moduleMeta = (id: string) => MODULES.find((m) => m.id === id) ?? MODULES[0]

/* ── navigation ───────────────────────────────────────────────────────────── */

function NavItem({ m, active, collapsed, onClick, busy, badge }: {
  m: ModuleMeta; active: boolean; collapsed: boolean; onClick: () => void; busy: boolean; badge?: number
}) {
  const body = (
    <button onClick={onClick}
      className={cx('group relative flex w-full items-center gap-2.5 rounded-[var(--r-sm)] px-2.5 py-[7px] text-left transition-colors duration-fast',
        active
          ? 'bg-[var(--nav-active)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.07)]'
          : 'text-[var(--nav-fg-dim)] hover:bg-[var(--nav-hover)] hover:text-[var(--nav-fg)]',
        collapsed && 'justify-center px-0')}>
      {active && <span className="absolute -left-[10px] top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-[var(--brand)]" />}
      <Icon name={m.icon} size={16} className={cx('shrink-0 transition-colors', active ? 'text-[var(--brand)]' : 'text-[var(--nav-fg-faint)] group-hover:text-[var(--nav-fg-dim)]')} />
      {!collapsed && (
        <>
          <span className="flex-1 truncate text-[12.5px] font-medium">{m.label}</span>
          {busy && <StatusDot tone="agent" pulse size={6} />}
          {!busy && badge ? <Badge tone="warn">{badge}</Badge> : null}
        </>
      )}
    </button>
  )
  return collapsed ? <Tooltip content={<><b>{m.label}</b><br />{m.blurb}</>} side="right">{body}</Tooltip> : body
}

function Sidebar() {
  const module = useApp((s) => s.module)
  const setModule = useApp((s) => s.setModule)
  const collapsed = useApp((s) => s.navCollapsed)
  const toggleNav = useApp((s) => s.toggleNav)
  const session = useApp((s) => s.session)
  const signOut = useApp((s) => s.signOut)
  const runs = useApp((s) => s.runs)
  const setTheme = useApp((s) => s.setTheme)
  const theme = useApp((s) => s.theme)
  const role = useRole()

  const visible = MODULES.filter((m) => can(role, m.perm))
  const groups = ['Position', 'Instruments', 'Foundation'] as const
  const busyModules = new Set(runs.filter((r) => isRunning(r.status)).map((r) => AGENTS.find((a) => a.id === r.agentId)?.module))
  const pendingByModule = runs.filter((r) => r.status === 'awaiting_approval')
    .reduce<Record<string, number>>((acc, r) => {
      const m = AGENTS.find((a) => a.id === r.agentId)?.module
      if (m) acc[m] = (acc[m] ?? 0) + 1
      return acc
    }, {})

  return (
    <nav className={cx('flex shrink-0 flex-col transition-[width] duration-base ease-std')}
      style={{ width: collapsed ? 'var(--nav-w-sm)' : 'var(--nav-w)', background: 'var(--nav-bg)' }} aria-label="Modules">
      {/* One mark, not two. The lockup already contains it — putting the
          standalone mark beside the lockup showed the logo twice. Expanded gets
          the lockup; collapsed gets the mark on its own. */}
      <div className={cx('flex items-center gap-2.5 px-3 py-3.5', collapsed && 'justify-center px-0')}>
        {collapsed ? (
          <Logo size={24} animated />
        ) : (
          <div className="min-w-0 flex-1">
            <img src="/brand/aire-lockup-white.png" alt="AiRE" draggable={false}
              className="brand-mark h-[19px] w-auto object-contain object-left" />
            <div className="mt-[5px] truncate text-[10px] text-[var(--nav-fg-faint)]">{session?.workspace ?? 'workspace'}</div>
          </div>
        )}
        {!collapsed && (
          <button onClick={toggleNav} aria-label="Collapse navigation" title="Collapse navigation"
            className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[var(--r-sm)] text-[var(--nav-fg-faint)] transition-colors hover:bg-[var(--nav-hover)] hover:text-[var(--nav-fg)]">
            <Icon name="panel" size={14} />
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-2">
        {groups.map((g) => {
          const items = visible.filter((m) => m.group === g)
          if (!items.length) return null
          return (
            <div key={g} className="mb-3">
              {!collapsed && <div className="t-label mb-1 px-2.5 !text-[var(--nav-fg-faint)]">{g}</div>}
              <div className="space-y-0.5">
                {items.map((m) => (
                  <NavItem key={m.id} m={m} collapsed={collapsed}
                    active={module === m.id}
                    busy={busyModules.has(m.id as ModuleId)}
                    badge={pendingByModule[m.id]}
                    onClick={() => setModule(m.id)} />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <div className="border-t p-2" style={{ borderColor: 'var(--nav-line)' }}>
        {collapsed ? (
          <div className="flex flex-col items-center gap-1.5">
            <button onClick={toggleNav} aria-label="Expand navigation"
              className="grid h-[26px] w-[26px] place-items-center rounded-[var(--r-sm)] text-[var(--nav-fg-faint)] hover:bg-[var(--nav-hover)] hover:text-[var(--nav-fg)]">
              <Icon name="panel" size={14} />
            </button>
            <Avatar name={session?.name ?? '?'} size={24} />
          </div>
        ) : (
          <Popover align="start" width={216}
            trigger={({ toggle }) => (
              <button onClick={toggle} className="flex w-full items-center gap-2.5 rounded-[var(--r-sm)] px-1.5 py-1.5 text-left transition-colors hover:bg-[var(--nav-hover)]">
                <Avatar name={session?.name ?? '?'} size={26} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-medium text-[var(--nav-fg)]">{session?.name}</span>
                  <span className="block truncate text-[10.5px] text-[var(--nav-fg-faint)]">
                    {ROLES.find((r) => r.id === role)?.label ?? role}
                  </span>
                </span>
                <Icon name="chevronDown" size={12} className="shrink-0 text-[var(--nav-fg-faint)]" />
              </button>
            )}>
            {({ close }) => (
              <>
                <div className="px-2.5 py-2">
                  <div className="text-[12px] font-medium text-[var(--ink-1)]">{session?.name}</div>
                  <div className="truncate text-[10.5px] text-[var(--ink-4)]">{session?.email}</div>
                </div>
                <Divider className="!my-1" />
                <MenuItem icon={<Icon name={theme === 'light' ? 'moon' : 'sun'} size={13} />}
                  onClick={() => { setTheme(theme === 'light' ? 'dark' : 'light'); close() }}>
                  {theme === 'light' ? 'Dark theme' : 'Light theme'}
                </MenuItem>
                <MenuItem icon={<Icon name="settings" size={13} />} onClick={() => { useApp.getState().setModule('settings'); close() }}>Workspace settings</MenuItem>
                <Divider className="!my-1" />
                <MenuItem icon={<Icon name="logout" size={13} />} danger onClick={signOut}>Sign out</MenuItem>
              </>
            )}
          </Popover>
        )}
      </div>
    </nav>
  )
}

/* ── header ───────────────────────────────────────────────────────────────── */

/** The verdict. Present on every module, always on a STATED basis — a number
 *  without its basis is the thing that gets people into trouble. */
function VerdictPill() {
  const module = useApp((s) => s.module)
  // Monitoring surfaces read the book of record; modelling surfaces read the
  // working assumptions. Saying which is not decoration.
  const basis = module === 'plan' || module === 'creditbook' || module === 'data' ? 'actuals' : 'working'
  const { pack, tree, totals } = usePosition(basis)
  const under = tree.gap <= 0
  return (
    <div className="flex items-center gap-3">
      <Tooltip content={basis === 'actuals'
        ? 'The book of record: as-sold data with no assumptions applied.'
        : 'Your working assumptions — levers you have set, or an agent proposal you approved.'}>
        <span className={cx('rounded-[var(--r-full)] border px-2 py-[3px] text-[10px] font-semibold uppercase tracking-[.05em]',
          basis === 'actuals' ? 'border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink-4)]' : 'border-[var(--info-line)] bg-[var(--info-tint)] text-[var(--info-ink)]')}>
          {basis === 'actuals' ? 'Actuals' : 'Working'}
        </span>
      </Tooltip>

      <div className={cx('flex items-center gap-2 rounded-[var(--r-md)] border px-2.5 py-1.5',
        under ? 'border-[var(--pos-line)] bg-[var(--pos-tint)]' : 'border-[var(--neg-line)] bg-[var(--neg-tint)]')}>
        <StatusDot tone={under ? 'pos' : 'neg'} pulse={!under} />
        <div className="leading-tight">
          <div className="text-[9.5px] font-semibold uppercase tracking-[.05em] text-[var(--ink-4)]">
            {under ? 'Under the line' : 'Over the line'}
            <span className="ml-1 font-medium normal-case tracking-normal text-[var(--ink-5)]">{fmtGap(tree.gap)}</span>
          </div>
          <div className="text-[12px] font-semibold tabular-nums text-[var(--ink-1)]">
            {fmtNum(tree.avgMetric, 1)}
            <span className="font-normal text-[var(--ink-4)]"> / {fmtNum(tree.limit, 1)} {pack.metricUnit}</span>
          </div>
        </div>
      </div>

      <div className="text-right leading-tight">
        <div className="t-label">Exposure</div>
        <div className="text-[13px] font-semibold tabular-nums text-[var(--ink-1)]">
          {fmtMoney(totals.exposure, pack.currency)}
          <span className="ml-1.5 text-[10.5px] font-normal text-[var(--ink-4)]">{totals.over}/{totals.count} over</span>
        </div>
      </div>
    </div>
  )
}

function MarketSwitcher() {
  const country = useApp((s) => s.country)
  const setCountry = useApp((s) => s.setCountry)
  const markets = useApp((s) => s.markets)
  const packs = PACK_LIST.filter((p) => markets.includes(p.id))
  const active = packs.find((p) => p.id === country) ?? packs[0]
  return (
    <Popover align="start" width={276}
      trigger={({ toggle }) => (
        <button onClick={toggle}
          className="flex items-center gap-2 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-1)] px-2 py-1.5 transition-colors hover:border-[var(--line-strong)]">
          <span className="text-[15px] leading-none">{active?.flag}</span>
          <span className="text-[12.5px] font-medium text-[var(--ink-1)]">{active?.name}</span>
          <Icon name="chevronDown" size={12} className="text-[var(--ink-5)]" />
        </button>
      )}>
      {({ close }) => (
        <>
          <div className="t-label px-2.5 py-1.5">Market</div>
          {packs.map((p) => (
            <MenuItem key={p.id} onClick={() => { setCountry(p.id as CountryId); close() }}
              icon={<span className="text-[14px] leading-none">{p.flag}</span>}
              sub={`${p.coverage.tier === 'market' ? 'Market data' : p.coverage.tier === 'partial' ? 'Covered scope' : 'Preview data'} · ${p.metricUnit}`}>
              {p.name}
            </MenuItem>
          ))}
        </>
      )}
    </Popover>
  )
}

function TopBar() {
  const module = useApp((s) => s.module)
  const setPalette = useApp((s) => s.setPalette)
  const consoleOpen = useApp((s) => s.consoleOpen)
  const setConsole = useApp((s) => s.setConsole)
  const runs = useApp((s) => s.runs)
  const scenario = useApp((s) => s.scenario)
  const patch = useApp((s) => s.patchScenario)
  const { pack } = usePosition('actuals')
  const meta = moduleMeta(module)
  const pending = runs.filter((r) => r.status === 'awaiting_approval').length
  const active = runs.filter((r) => isRunning(r.status)).length

  return (
    <header className="relative flex shrink-0 items-center gap-3 border-b border-[var(--line)] bg-[var(--chrome)] px-4"
      style={{ height: 'var(--top-h)', boxShadow: 'var(--sh-lit)' }}>
      <div className="flex min-w-0 items-center gap-2.5">
        <MarketSwitcher />
        <Icon name="chevron" size={11} className="text-[var(--ink-5)]" />
        <span className="truncate text-[13px] font-semibold text-[var(--ink-1)]">{meta.label}</span>
      </div>

      {/* Plan reads the book of record, so the header must not offer it a year
          that has not been filed. Every other module models forward and gets
          the full range. */}
      <select value={scenario.year} onChange={(e) => patch({ year: Number(e.target.value) })}
        aria-label="Compliance year"
        className="h-[28px] cursor-pointer rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-1)] px-2 text-[12px] font-medium text-[var(--ink-1)] hover:border-[var(--line-strong)]">
        {pack.years
          .filter((y) => module !== 'plan' || y <= settledThrough(pack.id))
          .map((y) => (
            <option key={y} value={y}>
              {y}{y > settledThrough(pack.id) ? ' · projected' : ''}
            </option>
          ))}
      </select>

      <div className="ml-auto flex items-center gap-2.5">
        <VerdictPill />
        <Divider vertical className="!h-6" />
        <button onClick={() => setPalette(true)}
          className="flex items-center gap-2 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-1)] px-2.5 py-1.5 text-[12px] text-[var(--ink-4)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--ink-2)]">
          <Icon name="search" size={13} />
          <span className="hidden lg:inline">Search</span>
          <Kbd>⌘K</Kbd>
        </button>
        <Button size="sm" variant={consoleOpen ? 'quiet' : 'secondary'} onClick={() => setConsole(!consoleOpen)}
          icon={<Icon name="agent" size={14} className={active ? 'text-[var(--agent)]' : undefined} />}>
          <span className="hidden lg:inline">Agents</span>
          {pending > 0 && <Badge tone="warn" className="ml-0.5">{pending}</Badge>}
          {active > 0 && pending === 0 && <StatusDot tone="agent" pulse size={6} />}
        </Button>
      </div>
    </header>
  )
}

/* ── command palette ──────────────────────────────────────────────────────── */

function CommandPalette() {
  const open = useApp((s) => s.paletteOpen)
  const setOpen = useApp((s) => s.setPalette)
  const setModule = useApp((s) => s.setModule)
  const setCountry = useApp((s) => s.setCountry)
  const setConsole = useApp((s) => s.setConsole)
  const markets = useApp((s) => s.markets)
  const role = useRole()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)

  const items = useMemo(() => {
    const list: { id: string; label: string; hint: string; icon: IconName; group: string; run: () => void }[] = []
    for (const m of MODULES) {
      if (!can(role, m.perm)) continue
      list.push({ id: `go:${m.id}`, label: m.label, hint: m.blurb, icon: m.icon, group: 'Go to', run: () => setModule(m.id) })
    }
    for (const p of PACK_LIST.filter((x) => markets.includes(x.id))) {
      list.push({ id: `mk:${p.id}`, label: `Switch to ${p.name}`, hint: p.limitNote, icon: 'globe', group: 'Market', run: () => setCountry(p.id as CountryId) })
    }
    for (const a of AGENTS) {
      if (!can(role, a.requires) || !can(role, 'agent.run')) continue
      list.push({ id: `ag:${a.id}`, label: `Run ${a.name}`, hint: a.purpose, icon: 'spark', group: 'Agents', run: () => { setModule(a.module); setConsole(true) } })
    }
    const needle = q.trim().toLowerCase()
    return needle
      ? list.filter((i) => `${i.label} ${i.hint} ${i.group}`.toLowerCase().includes(needle)).slice(0, 12)
      : list.slice(0, 12)
  }, [q, role, markets]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setSel(0) }, [q])
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(!open) }
      if (!open) return
      if (e.key === 'Escape') setOpen(false)
      if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, items.length - 1)) }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)) }
      if (e.key === 'Enter' && items[sel]) { e.preventDefault(); items[sel].run(); setOpen(false); setQ('') }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, items, sel, setOpen])

  if (!open) return null
  let lastGroup = ''
  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center p-6 pt-[14vh]">
      <div className="anim-fade absolute inset-0 bg-[rgba(22,21,15,.4)] backdrop-blur-[2px]" onClick={() => setOpen(false)} />
      <div className="anim-scale relative w-[560px] max-w-full overflow-hidden rounded-[var(--r-xl)] border border-[var(--line)] bg-[var(--surface-1)] shadow-[var(--sh-4)]">
        <div className="flex items-center gap-2.5 border-b border-[var(--line-soft)] px-4">
          <Icon name="search" size={15} className="text-[var(--ink-4)]" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Go to a module, switch market, run an agent…"
            className="h-[46px] flex-1 border-0 bg-transparent text-[14px] text-[var(--ink-1)] outline-none placeholder:text-[var(--ink-5)]" />
          <Kbd>esc</Kbd>
        </div>
        <div className="max-h-[344px] overflow-y-auto p-1.5">
          {items.length === 0 && <div className="px-3 py-8 text-center text-[12.5px] text-[var(--ink-4)]">Nothing matches “{q}”.</div>}
          {items.map((it, i) => {
            const head = it.group !== lastGroup ? (lastGroup = it.group) : null
            return (
              <React.Fragment key={it.id}>
                {head && <div className="t-label px-2.5 pb-1 pt-2">{head}</div>}
                <button onMouseEnter={() => setSel(i)} onClick={() => { it.run(); setOpen(false); setQ('') }}
                  className={cx('flex w-full items-center gap-2.5 rounded-[var(--r-sm)] px-2.5 py-2 text-left',
                    i === sel ? 'bg-[var(--surface-3)]' : '')}>
                  <Icon name={it.icon} size={15} className="shrink-0 text-[var(--ink-4)]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] text-[var(--ink-1)]">{it.label}</span>
                    <span className="block truncate text-[11px] text-[var(--ink-4)]">{it.hint}</span>
                  </span>
                  {i === sel && <Icon name="arrowRight" size={13} className="shrink-0 text-[var(--ink-5)]" />}
                </button>
              </React.Fragment>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ── the shell ────────────────────────────────────────────────────────────── */

export function AppShell({ children }: { children: React.ReactNode }) {
  const theme = useApp((s) => s.theme)
  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])
  const module = useApp((s) => s.module)
  return (
    <div className="flex h-screen overflow-hidden bg-[var(--canvas)]">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col border-l border-[var(--line)]">
        <TopBar />
        <div className="flex min-h-0 flex-1">
          <main key={module} className="anim-in min-w-0 flex-1 overflow-y-auto">{children}</main>
          <AgentConsole />
        </div>
      </div>
      <CommandPalette />
    </div>
  )
}

/* ── the page frame every module uses ─────────────────────────────────────── */

/** The header band.
 *
 *  It was a 21px title and a paragraph, floating on the same grey as everything
 *  below it — so a module read as a stream of cards with a label on top rather
 *  than as a document with a beginning. Now it is a distinct band on the surface
 *  colour, closed with a hairline, with the title given real scale. Scale
 *  contrast between the page title and the content beneath it is most of what
 *  makes an interface feel composed rather than assembled. */
export function ModulePage({ title, sub, actions, toolbar, children, wide }: {
  title: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode
  /** A row that belongs to the header rather than the content — filters, a
   *  scope switcher, a period control. */
  toolbar?: React.ReactNode
  children: React.ReactNode; wide?: boolean
}) {
  return (
    <div>
      <header className="border-b border-[var(--line)] bg-[var(--surface-1)]" style={{ boxShadow: 'var(--sh-lit)' }}>
        <div className={cx('mx-auto px-6 pb-5 pt-6', wide ? 'max-w-[1480px]' : 'max-w-[1220px]')}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="t-display-lg">{title}</h1>
              {sub && <p className="t-sub mt-2 max-w-[76ch]">{sub}</p>}
            </div>
            {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
          </div>
          {toolbar && <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">{toolbar}</div>}
        </div>
      </header>
      <div className={cx('mx-auto px-6 pb-10 pt-5', wide ? 'max-w-[1480px]' : 'max-w-[1220px]')}>{children}</div>
    </div>
  )
}
