/* ───────────────────────────────────────────────────────────────────────────
   WATCHTOWER — Reg AI's front page.
   ---------------------------------------------------------------------------
   One screen that answers the three questions a compliance lead opens Reg AI
   with, in the order they ask them:
     1. What am I tracking, and how settled is it?      (hero + radar)
     2. What bites next, and when?                       (countdown)
     3. What has the watch found?                        (signals)
   Everything here follows the workspace's tracked set (Library tab).
   ─────────────────────────────────────────────────────────────────────────── */
import React, { useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Badge, Button, CountUp, EmptyState, StatusDot, relTime, toneVars } from '../../design/primitives'
import Icon from '../../design/icons'
import { Citations } from '../../agents/ui/RunTrace'
import { SEVERITY_TONE } from '../../agents/kernel'
import { useApp } from '../../state/appStore'
import { STAGE_META } from './catalogue'
import {
  MARKET_NAME, MARKET_ORDER, REG_BY_ID, regMoving, regStage, upcoming, type Regulation,
} from './regulations'
import { SEVERITY_META } from './watch'
import { CategoryTile, Flag, HeroGround } from './ui/assets'
import { RadarScope } from './ui/RadarScope'
import { EASE, rise, row, stagger } from './ui/motion'
import { fmtDate } from './ui/RegDrawer'
import { useWatch } from './ui/useWatch'

const DAY = 86_400_000
const INT = (v: number) => String(Math.round(v))
const SEV_RANK = { info: 0, low: 1, medium: 2, high: 3, critical: 4 } as const

/** Urgency, not stage: how soon a date is decides how loud it is. */
const urgency = (days: number) => (days <= 90 ? 'neg' : days <= 365 ? 'warn' : 'info') as 'neg' | 'warn' | 'info'

export function Watchtower({ onOpen, goTo }: {
  onOpen: (r: Regulation) => void
  goTo: (tab: 'library' | 'agent') => void
}) {
  const tracked = useApp((s) => s.regTracked)
  const cfg = useApp((s) => s.regWatch)
  const watch = useWatch()
  const now = useMemo(() => Date.now(), [])

  const regs = useMemo(() => tracked.map((id) => REG_BY_ID[id]).filter((r): r is Regulation => !!r), [tracked])
  const ahead = useMemo(() => upcoming(tracked, now, cfg.horizonMonths), [tracked, now, cfg.horizonMonths])
  const markets = new Set(regs.map((r) => r.market)).size
  const inForce = regs.filter((r) => regStage(r.id) === 'in force').length
  const moving = regs.filter((r) => regMoving(r.id)).length
  const next = ahead[0]
  const nextDays = next ? Math.ceil((next.at - now) / DAY) : null

  if (!regs.length) {
    return (
      <EmptyState art="search" title="You are not tracking any regulations"
        body="Choose the regulations that matter to your markets — CO₂ standards, CAFE, CBAM, emissions trading, type-approval — and Reg AI will put them on one radar, count down to their key dates and point the watch at them."
        action={<Button variant="primary" icon={<Icon name="plus" size={13} />} onClick={() => goTo('library')}>Choose regulations</Button>} />
    )
  }

  return (
    <motion.div variants={stagger(0.07)} initial="hidden" animate="show" className="space-y-4">
      {/* ── due prompt ── */}
      <AnimatePresence>
        {watch.due && !watch.busy && (
          <motion.div key="due" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: EASE }} className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 rounded-[var(--r-lg)] border border-[var(--info-line)] bg-[var(--info-tint)] px-4 py-3">
              <StatusDot tone="info" pulse />
              <div className="min-w-0 flex-1 text-[12.5px] text-[var(--info-ink)]">
                <b>A {cfg.cadence} pass is due.</b> {watch.lastPass ? `The last one finished ${relTime(watch.lastPass)}.` : 'The watch has not run yet.'}
                {' '}Passes run when you start them — nothing runs, or bills, in the background.
              </div>
              <Button size="sm" variant="primary" disabled={!watch.allowed} icon={<Icon name="spark" size={12} />} onClick={() => watch.run()}>Run the pass</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── hero ── */}
      <motion.section variants={rise}
        className="relative overflow-hidden rounded-[var(--r-xl)] border border-[var(--line)] bg-[var(--surface-1)] shadow-[var(--sh-2),var(--sh-lit)]">
        <HeroGround />
        <div className="relative grid items-center gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:p-8">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-[var(--r-full)] border border-[var(--line)] bg-[var(--surface-1)] px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[.08em] text-[var(--ink-3)]">
                <StatusDot tone={watch.busy ? 'agent' : 'pos'} pulse={watch.busy} size={6} />
                {watch.busy ? `${cfg.name} is reading` : 'Regulatory watchtower'}
              </span>
            </div>
            <h2 className="mt-4 text-[34px] font-semibold leading-[1.08] tracking-[-.032em] text-[var(--ink-1)]" style={{ textWrap: 'balance' } as React.CSSProperties}>
              <CountUp value={regs.length} format={INT} /> regulation{regs.length === 1 ? '' : 's'} across{' '}
              <CountUp value={markets} format={INT} /> market{markets === 1 ? '' : 's'}
            </h2>
            <p className="t-sub mt-2 max-w-[56ch]">
              {next
                ? <>Next to bite: <b className="text-[var(--ink-1)]">{next.reg.name}</b> — {next.label.charAt(0).toLowerCase() + next.label.slice(1)}, {fmtDate(next.at)}.</>
                : `Nothing tracked has a dated step in the next ${cfg.horizonMonths} months.`}
            </p>

            <div className="mt-6 grid max-w-[560px] grid-cols-3 gap-px overflow-hidden rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--line)]">
              {[
                { label: 'In force', value: inForce, tone: 'pos', sub: 'what you file against' },
                { label: 'Moving', value: moving, tone: 'warn', sub: 'draft, notified or open' },
                { label: 'Days to next date', value: nextDays ?? 0, tone: next ? urgency(nextDays!) : 'neutral', sub: next ? fmtDate(next.at) : 'none in horizon' },
              ].map((s) => (
                <div key={s.label} className="relative bg-[var(--surface-1)] px-3.5 pb-3 pt-3.5">
                  <span aria-hidden className="absolute inset-x-0 top-0 h-[2px]"
                    style={{ background: s.tone === 'neutral' ? 'var(--line-strong)' : `var(--${s.tone})` }} />
                  <div className="t-label">{s.label}</div>
                  <div className="mt-1 text-[26px] font-semibold leading-none tracking-[-.03em] tabular-nums text-[var(--ink-1)]">
                    {s.label === 'Days to next date' && !next ? '—' : <CountUp value={s.value} format={INT} />}
                  </div>
                  <div className="mt-1.5 truncate text-[11px] text-[var(--ink-4)]">{s.sub}</div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-2">
              <Button variant="primary" loading={watch.busy} disabled={!watch.allowed} icon={watch.busy ? undefined : <Icon name="spark" size={13} />}
                onClick={() => watch.run()}
                title={watch.allowed ? undefined : 'Your role cannot run agents.'}>
                {watch.busy ? 'Watching…' : `Run ${cfg.name}`}
              </Button>
              <Button variant="secondary" icon={<Icon name="settings" size={13} />} onClick={() => goTo('agent')}>Tune the agent</Button>
              <Button variant="ghost" icon={<Icon name="list" size={13} />} onClick={() => goTo('library')}>Manage tracked</Button>
            </div>
          </div>

          <div className="hidden lg:block">
            <RadarScope tracked={tracked} now={now} onSelect={onOpen} />
            <div className="mt-1 flex flex-wrap justify-center gap-x-3 gap-y-1">
              {(['in force', 'notified', 'draft', 'consultation'] as const).map((s) => (
                <span key={s} className="inline-flex items-center gap-1.5 text-[10.5px] text-[var(--ink-4)]">
                  <StatusDot tone={STAGE_META[s].tone} size={6} />{STAGE_META[s].label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </motion.section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Countdown items={ahead} now={now} horizon={cfg.horizonMonths} onOpen={onOpen} />
        <Signals goTo={goTo} />
      </div>

      <MarketBoard regs={regs} now={now} onOpen={onOpen} />
    </motion.div>
  )
}

/* ── countdown ──────────────────────────────────────────────────────────── */

function Countdown({ items, now, horizon, onOpen }: {
  items: ReturnType<typeof upcoming>; now: number; horizon: number; onOpen: (r: Regulation) => void
}) {
  const end = useMemo(() => { const d = new Date(now); d.setMonth(d.getMonth() + horizon); return d.getTime() }, [now, horizon])
  const span = end - now
  const ticks = useMemo(() => {
    const out: { at: number; label: string }[] = []
    const d = new Date(now); d.setDate(1); d.setMonth(d.getMonth() + 1)
    const step = horizon <= 12 ? 2 : horizon <= 24 ? 4 : 6
    while (d.getTime() < end) {
      if (d.getMonth() % step === 0) out.push({ at: d.getTime(), label: d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }) })
      d.setMonth(d.getMonth() + 1)
    }
    return out
  }, [now, end, horizon])

  return (
    <motion.section variants={rise}
      className="overflow-hidden rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface-1)] shadow-[var(--sh-1),var(--sh-lit)]">
      <header className="flex items-center gap-3 border-b border-[var(--line-soft)] px-4 py-3">
        <span className="grid h-7 w-7 place-items-center rounded-[var(--r-sm)] bg-[var(--surface-2)] text-[var(--ink-3)]"><Icon name="clock" size={14} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="t-title-sm">Countdown</h3>
          <p className="t-cap mt-0.5">Every key date in your tracked regulations over the next {horizon} months.</p>
        </div>
        <Badge tone="neutral">{items.length} date{items.length === 1 ? '' : 's'}</Badge>
      </header>

      {/* the track */}
      <div className="px-4 pb-1 pt-5">
        <div className="relative h-10">
          <div className="absolute inset-x-0 top-[13px] h-[3px] rounded-full bg-[var(--surface-3)]" />
          <motion.div className="absolute left-0 top-[13px] h-[3px] rounded-full"
            style={{ background: 'linear-gradient(90deg, var(--neg), var(--warn) 30%, var(--info))' }}
            initial={{ width: 0 }} animate={{ width: '100%' }} transition={{ duration: 1.1, ease: EASE, delay: 0.2 }} />
          <span className="absolute -top-0.5 left-0 text-[9.5px] font-semibold uppercase tracking-[.08em] text-[var(--ink-4)]">Today</span>
          {ticks.map((t) => (
            <span key={t.at} className="absolute top-[22px] -translate-x-1/2 text-[9.5px] tabular-nums text-[var(--ink-5)]"
              style={{ left: `${((t.at - now) / span) * 100}%` }}>{t.label}</span>
          ))}
          {items.map((m, i) => (
            <motion.button key={m.reg.id + m.date} onClick={() => onOpen(m.reg)}
              className="absolute top-[8px] -translate-x-1/2 rounded-full"
              style={{ left: `${((m.at - now) / span) * 100}%` }}
              initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.5 + i * 0.06, type: 'spring', stiffness: 420, damping: 18 }}
              whileHover={{ scale: 1.35 }} title={`${m.reg.name} — ${fmtDate(m.at)}`}>
              <span className="block h-[13px] w-[13px] rounded-full border-2 border-[var(--surface-1)] shadow-[var(--sh-1)]"
                style={{ background: `var(--${urgency(Math.ceil((m.at - now) / DAY))})` }} />
            </motion.button>
          ))}
        </div>
      </div>

      {items.length ? (
        <motion.ul variants={stagger(0.04, 0.3)} initial="hidden" animate="show" className="divide-y divide-[var(--line-soft)]">
          {items.slice(0, 7).map((m) => {
            const days = Math.ceil((m.at - now) / DAY)
            const tone = urgency(days)
            return (
              <motion.li key={m.reg.id + m.date} variants={row}>
                <button onClick={() => onOpen(m.reg)}
                  className="group relative flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--surface-2)]">
                  <span aria-hidden className="absolute inset-y-2 left-0 w-[2px] rounded-r-full" style={{ background: `var(--${tone})` }} />
                  <div className="w-[62px] shrink-0 text-center">
                    <div className="text-[17px] font-semibold leading-none tracking-[-.02em] tabular-nums" style={{ color: `var(--${tone}-ink)` }}>{days}</div>
                    <div className="mt-0.5 text-[9.5px] font-semibold uppercase tracking-[.08em] text-[var(--ink-4)]">day{days === 1 ? '' : 's'}</div>
                  </div>
                  <Flag market={m.reg.market} size={18} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[12.5px] font-semibold text-[var(--ink-1)]">{m.reg.name}</span>
                      {m.indicative && <Badge tone="warn">indicative</Badge>}
                    </div>
                    <div className="truncate text-[11.5px] text-[var(--ink-3)]">{m.label}</div>
                  </div>
                  <span className="shrink-0 text-[11px] tabular-nums text-[var(--ink-4)]">{fmtDate(m.at)}</span>
                  <Icon name="chevron" size={12} className="shrink-0 text-[var(--ink-5)] transition-transform group-hover:translate-x-0.5" />
                </button>
              </motion.li>
            )
          })}
        </motion.ul>
      ) : (
        <p className="px-4 pb-4 pt-2 text-[12px] text-[var(--ink-4)]">Nothing tracked has a dated step in this window. Lengthen the look-ahead on the Agent tab, or track more regulations.</p>
      )}
    </motion.section>
  )
}

/* ── signals (what the watch found) ─────────────────────────────────────── */

function Signals({ goTo }: { goTo: (tab: 'library' | 'agent') => void }) {
  const watch = useWatch()
  const cfg = watch.cfg
  const run = watch.last
  const findings = (run?.findings ?? []).filter((f) => SEV_RANK[f.severity] >= SEV_RANK[cfg.minSeverity])

  return (
    <motion.section variants={rise}
      className="flex flex-col overflow-hidden rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface-1)] shadow-[var(--sh-1),var(--sh-lit)]">
      <header className="flex items-center gap-3 border-b border-[var(--line-soft)] px-4 py-3">
        <span className="grid h-7 w-7 place-items-center rounded-[var(--r-sm)] bg-[var(--agent-tint)] text-[var(--agent-ink)]"><Icon name="agent" size={14} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="t-title-sm">Signals</h3>
          <p className="t-cap mt-0.5">{run ? `${cfg.name} · ${relTime(run.startedAt)} · ${SEVERITY_META[cfg.minSeverity].label.toLowerCase()}` : 'What the watch has found, cited.'}</p>
        </div>
        {run && (
          <Button size="xs" variant="ghost" onClick={() => { useApp.getState().setActiveRun(run.id); useApp.getState().setConsole(true) }}>Full trace</Button>
        )}
      </header>
      <div className="min-h-0 flex-1">
        {watch.busy && !findings.length ? (
          <div className="space-y-2.5 p-4">
            {[0, 1, 2].map((i) => (
              <motion.div key={i} className="h-[58px] rounded-[var(--r-md)] bg-[var(--surface-2)]"
                animate={{ opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1.4, delay: i * 0.15 }} />
            ))}
          </div>
        ) : findings.length ? (
          <motion.ul variants={stagger(0.05)} initial="hidden" animate="show" className="space-y-2 p-3">
            <AnimatePresence initial={false}>
              {findings.map((f) => {
                const tone = SEVERITY_TONE[f.severity]
                return (
                  <motion.li key={f.id} variants={row} layout
                    className="relative overflow-hidden rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-1)] py-2.5 pl-4 pr-3">
                    <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: `var(--${tone === 'neutral' ? 'line-strong' : tone})` }} />
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-[.08em]" style={{ color: tone === 'neutral' ? 'var(--ink-4)' : `var(--${tone}-ink)` }}>{f.severity}</span>
                      {f.subject && <Badge tone="neutral">{f.subject}</Badge>}
                    </div>
                    <div className="mt-1 text-[12.5px] font-semibold leading-snug text-[var(--ink-1)]">{f.title}</div>
                    <p className="mt-1 line-clamp-3 text-[11.5px] leading-relaxed text-[var(--ink-3)]">{f.detail}</p>
                    <Citations items={f.citations} dense />
                  </motion.li>
                )
              })}
            </AnimatePresence>
          </motion.ul>
        ) : (
          <EmptyState compact art="agent" title={run ? 'Nothing at or above your threshold' : 'No pass yet'}
            body={run
              ? `The last pass found nothing at “${SEVERITY_META[cfg.minSeverity].label.toLowerCase()}”. Lower the threshold on the Agent tab to see more.`
              : 'Run the watch to check the official sources for every regulation you track, classify what moved, and quantify it where the engine can.'}
            action={<Button size="sm" variant="secondary" icon={<Icon name="settings" size={12} />} onClick={() => goTo('agent')}>Tune the agent</Button>} />
        )}
      </div>
    </motion.section>
  )
}

/* ── market board ───────────────────────────────────────────────────────── */

function MarketBoard({ regs, now, onOpen }: { regs: Regulation[]; now: number; onOpen: (r: Regulation) => void }) {
  const groups = MARKET_ORDER.map((m) => ({ m, regs: regs.filter((r) => r.market === m) })).filter((g) => g.regs.length)
  return (
    <motion.section variants={rise}>
      <div className="mb-2.5 flex items-baseline justify-between">
        <h3 className="t-title">By market</h3>
        <span className="t-cap">Click a regulation to open it</span>
      </div>
      <motion.div variants={stagger(0.06)} className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {groups.map(({ m, regs: rs }) => (
          <motion.div key={m} variants={rise} whileHover={{ y: -2 }} transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className="overflow-hidden rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface-1)] shadow-[var(--sh-1),var(--sh-lit)] transition-shadow hover:shadow-[var(--sh-2),var(--sh-lit)]">
            <div className="flex items-center gap-2.5 border-b border-[var(--line-soft)] px-3.5 py-2.5">
              <Flag market={m} size={24} />
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--ink-1)]">{MARKET_NAME[m]}</span>
              <span className="text-[11px] tabular-nums text-[var(--ink-4)]">{rs.length}</span>
            </div>
            <ul className="p-1.5">
              {rs.map((r) => {
                const stage = regStage(r.id)
                const mv = regMoving(r.id)
                const nx = r.milestones.map((x) => ({ ...x, at: Date.parse(x.date) })).filter((x) => x.at >= now).sort((a, b) => a.at - b.at)[0]
                return (
                  <li key={r.id}>
                    <button onClick={() => onOpen(r)}
                      className="flex w-full items-center gap-2.5 rounded-[var(--r-sm)] px-2 py-2 text-left transition-colors hover:bg-[var(--surface-2)]">
                      <CategoryTile category={r.category} size={28} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[12.5px] font-semibold text-[var(--ink-1)]">{r.name}</span>
                          {r.packBacked && <Icon name="gauge" size={11} className="shrink-0 text-[var(--info)]" />}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-[var(--ink-4)]">
                          {nx ? `${fmtDate(nx.at)} · ${nx.label}` : 'No dated step ahead'}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <Badge tone={STAGE_META[stage].tone} dot>{STAGE_META[stage].label}</Badge>
                        {mv && mv !== stage && <span className="text-[10px] font-semibold" style={{ color: toneVars(STAGE_META[mv].tone).fg }}>{STAGE_META[mv].label} moving</span>}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </motion.div>
        ))}
      </motion.div>
    </motion.section>
  )
}
