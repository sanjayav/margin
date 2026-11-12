/* ───────────────────────────────────────────────────────────────────────────
   LIBRARY — every regulation Reg AI knows, and the switch that tracks it.
   ---------------------------------------------------------------------------
   The tracked set is the workspace's lens: the radar, the reader, the
   countdown and every watch pass follow it. Choosing is per regulation, grouped
   by market, filterable by market and by kind (CO₂, CBAM, trading, product).
   ─────────────────────────────────────────────────────────────────────────── */
import React, { useMemo, useState } from 'react'
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'
import { Badge, Button, Input, Segmented, Switch, cx, toneVars } from '../../design/primitives'
import Icon from '../../design/icons'
import { useApp } from '../../state/appStore'
import type { CountryId } from '../../../engine/types'
import { STAGE_META } from './catalogue'
import {
  CATEGORY_META, CATEGORY_ORDER, DEFAULT_TRACKED, MARKET_NAME, MARKET_ORDER, REGULATIONS,
  regMoving, regStage, type RegCategory, type Regulation,
} from './regulations'
import { CATEGORY_COLOR, CategoryChip, CategoryTile, Flag } from './ui/assets'
import { row, spring } from './ui/motion'
import { fmtDate } from './ui/RegDrawer'

export function Library({ onOpen }: { onOpen: (r: Regulation) => void }) {
  const tracked = useApp((s) => s.regTracked)
  const toggle = useApp((s) => s.toggleReg)
  const setTracked = useApp((s) => s.setRegTracked)
  const [q, setQ] = useState('')
  const [markets, setMarkets] = useState<CountryId[]>([])
  const [cat, setCat] = useState<'all' | RegCategory>('all')
  const [onlyTracked, setOnlyTracked] = useState(false)
  const now = useMemo(() => Date.now(), [])

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return REGULATIONS.filter((r) =>
      (!markets.length || markets.includes(r.market)) &&
      (cat === 'all' || r.category === cat) &&
      (!onlyTracked || tracked.includes(r.id)) &&
      (!needle || `${r.name} ${r.tagline} ${MARKET_NAME[r.market]} ${CATEGORY_META[r.category].label}`.toLowerCase().includes(needle)))
  }, [q, markets, cat, onlyTracked, tracked])

  const groups = MARKET_ORDER.map((m) => ({ m, regs: visible.filter((r) => r.market === m) })).filter((g) => g.regs.length)
  const allVisibleTracked = visible.length > 0 && visible.every((r) => tracked.includes(r.id))
  const isDefault = tracked.length === DEFAULT_TRACKED.length && DEFAULT_TRACKED.every((id) => tracked.includes(id))

  const toggleMarket = (m: CountryId) => setMarkets((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]))

  return (
    <div className="space-y-4">
      {/* ── summary strip ── */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {CATEGORY_ORDER.map((c) => {
          const all = REGULATIONS.filter((r) => r.category === c)
          const on = all.filter((r) => tracked.includes(r.id)).length
          const active = cat === c
          return (
            <motion.button key={c} onClick={() => setCat(active ? 'all' : c)} whileTap={{ scale: 0.98 }}
              className={cx('relative flex items-center gap-3 overflow-hidden rounded-[var(--r-lg)] border bg-[var(--surface-1)] p-3 text-left shadow-[var(--sh-1),var(--sh-lit)] transition-colors',
                active ? 'border-[var(--ink-3)]' : 'border-[var(--line)] hover:border-[var(--line-strong)]')}>
              <span aria-hidden className="absolute inset-x-0 top-0 h-[2px]" style={{ background: CATEGORY_COLOR[c] }} />
              <CategoryTile category={c} size={34} />
              <span className="min-w-0">
                <span className="block truncate text-[12px] font-semibold text-[var(--ink-1)]">{CATEGORY_META[c].label}</span>
                <span className="mt-0.5 block text-[11px] tabular-nums text-[var(--ink-4)]">{on} of {all.length} tracked</span>
              </span>
            </motion.button>
          )
        })}
      </div>

      {/* ── toolbar ── */}
      <div className="flex flex-wrap items-center gap-2.5 rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface-1)] p-2.5 shadow-[var(--sh-1),var(--sh-lit)]">
        <div className="relative w-full sm:w-[260px]">
          <Icon name="search" size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-4)]" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search CBAM, CAFE, Euro 7…" className="!pl-8" aria-label="Search regulations" />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {MARKET_ORDER.map((m) => {
            const on = markets.includes(m)
            return (
              <motion.button key={m} onClick={() => toggleMarket(m)} whileTap={{ scale: 0.96 }} aria-pressed={on}
                className={cx('inline-flex h-[32px] items-center gap-1.5 rounded-[var(--r-full)] border px-2.5 text-[12px] font-medium transition-colors',
                  on ? 'border-[var(--ink-2)] bg-[var(--surface-3)] text-[var(--ink-1)]' : 'border-[var(--line)] text-[var(--ink-3)] hover:border-[var(--line-strong)] hover:text-[var(--ink-1)]')}>
                <Flag market={m} size={16} />{m}
              </motion.button>
            )
          })}
          {markets.length > 0 && <Button size="xs" variant="ghost" onClick={() => setMarkets([])}>Clear</Button>}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <Switch size="sm" checked={onlyTracked} onChange={setOnlyTracked} label="Tracked only" />
          <Button size="sm" variant="secondary"
            onClick={() => setTracked(allVisibleTracked
              ? tracked.filter((id) => !visible.some((r) => r.id === id))
              : [...tracked, ...visible.map((r) => r.id)])}
            disabled={!visible.length}>
            {allVisibleTracked ? 'Untrack all shown' : 'Track all shown'}
          </Button>
          {!isDefault && <Button size="sm" variant="ghost" icon={<Icon name="refresh" size={12} />} onClick={() => setTracked(DEFAULT_TRACKED)}>Defaults</Button>}
        </div>
      </div>

      {cat !== 'all' && (
        <div className="flex items-center gap-2 text-[12px] text-[var(--ink-3)]">
          <CategoryChip category={cat} /> {CATEGORY_META[cat].blurb}
          <button className="ml-1 text-[var(--ink-4)] underline-offset-2 hover:underline" onClick={() => setCat('all')}>Show all kinds</button>
        </div>
      )}

      {/* ── groups ── */}
      <LayoutGroup>
        <AnimatePresence mode="popLayout" initial={false}>
          {groups.map(({ m, regs }) => (
            <motion.section key={m} layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="overflow-hidden rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface-1)] shadow-[var(--sh-1),var(--sh-lit)]">
              <header className="flex items-center gap-2.5 border-b border-[var(--line-soft)] bg-[var(--surface-2)] px-4 py-2.5">
                <Flag market={m} size={22} />
                <span className="text-[13px] font-semibold text-[var(--ink-1)]">{MARKET_NAME[m]}</span>
                <span className="text-[11px] tabular-nums text-[var(--ink-4)]">
                  {regs.filter((r) => tracked.includes(r.id)).length} of {regs.length} tracked
                </span>
              </header>
              <ul className="divide-y divide-[var(--line-soft)]">
                <AnimatePresence initial={false}>
                  {regs.map((r) => (
                    <LibraryRow key={r.id} reg={r} now={now} on={tracked.includes(r.id)}
                      onToggle={() => toggle(r.id)} onOpen={() => onOpen(r)} />
                  ))}
                </AnimatePresence>
              </ul>
            </motion.section>
          ))}
        </AnimatePresence>
      </LayoutGroup>

      {!groups.length && (
        <div className="rounded-[var(--r-lg)] border border-dashed border-[var(--line-strong)] p-10 text-center">
          <div className="text-[13px] font-semibold text-[var(--ink-1)]">No regulations match</div>
          <p className="mt-1 text-[12px] text-[var(--ink-4)]">Clear a filter or search for something else.</p>
        </div>
      )}
    </div>
  )
}

function LibraryRow({ reg, now, on, onToggle, onOpen }: {
  reg: Regulation; now: number; on: boolean; onToggle: () => void; onOpen: () => void
}) {
  const stage = regStage(reg.id)
  const moving = regMoving(reg.id)
  const next = reg.milestones.map((m) => ({ ...m, at: Date.parse(m.date) })).filter((m) => m.at >= now).sort((a, b) => a.at - b.at)[0]

  return (
    <motion.li layout="position" variants={row} initial="hidden" animate="show" exit="exit"
      className={cx('group relative grid items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors md:grid-cols-[minmax(0,1fr)_150px_170px_auto]',
        on ? 'bg-[var(--surface-1)]' : 'bg-[var(--surface-1)] hover:bg-[var(--surface-2)]')}>
      {/* tracked rule */}
      <motion.span aria-hidden className="absolute inset-y-0 left-0 w-[3px] origin-top" style={{ background: 'var(--brand)' }}
        initial={false} animate={{ scaleY: on ? 1 : 0 }} transition={spring} />

      <button onClick={onOpen} className="flex min-w-0 items-center gap-3 rounded-[var(--r-sm)] text-left focus-visible:outline-none focus-visible:shadow-[var(--ring)]">
        <CategoryTile category={reg.category} size={34} />
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-[13px] font-semibold text-[var(--ink-1)] group-hover:underline group-hover:underline-offset-2">{reg.name}</span>
            {reg.packBacked
              ? <Badge tone="info" icon={<Icon name="gauge" size={10} />}>Engine-priced</Badge>
              : <span className="text-[10.5px] text-[var(--ink-4)]">tracked, not priced</span>}
          </span>
          <span className="mt-0.5 block text-[12px] leading-snug text-[var(--ink-3)]">{reg.tagline}</span>
        </span>
      </button>

      <div className="flex flex-wrap items-center gap-1.5 md:flex-col md:items-start md:gap-1">
        <Badge tone={STAGE_META[stage].tone} dot>{STAGE_META[stage].label}</Badge>
        {moving && moving !== stage && (
          <span className="text-[10.5px] font-semibold" style={{ color: toneVars(STAGE_META[moving].tone).fg }}>{STAGE_META[moving].label} moving</span>
        )}
      </div>

      <div className="min-w-0 text-[11.5px]">
        {next ? (
          <>
            <div className="font-semibold tabular-nums text-[var(--ink-1)]">{fmtDate(next.at)}{next.indicative && <span className="ml-1 font-normal text-[var(--warn-ink)]">·&nbsp;indicative</span>}</div>
            <div className="truncate text-[var(--ink-4)]" title={next.label}>{next.label}</div>
          </>
        ) : <span className="text-[var(--ink-4)]">No dated step ahead</span>}
      </div>

      <div className="flex items-center justify-end gap-2">
        <Switch checked={on} onChange={onToggle} />
        <span className="w-[56px] text-[11px] font-medium text-[var(--ink-3)]">{on ? 'Tracking' : 'Track'}</span>
      </div>
    </motion.li>
  )
}
