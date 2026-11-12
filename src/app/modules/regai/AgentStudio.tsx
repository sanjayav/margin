/* ───────────────────────────────────────────────────────────────────────────
   AGENT STUDIO — tune the Regulatory watch.
   ---------------------------------------------------------------------------
   Two kinds of setting, kept visibly apart:
     · THE BRIEF   what to watch, how far ahead, how loud, how deep, in what
                   voice. Yours to change; saved to this workspace as you go.
     · GUARDRAILS  the model, the tool allowlist, propose-only autonomy and the
                   validation gate. Shown, locked, enforced on the server.
   The preview on the right is built by the same function the server uses, so
   it is exactly what the model receives — not a paraphrase of it.
   ─────────────────────────────────────────────────────────────────────────── */
import React, { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Badge, Button, Input, Segmented, StatusDot, Switch, Textarea, cx, relTime } from '../../design/primitives'
import Icon from '../../design/icons'
import { useApp } from '../../state/appStore'
import { AGENT_BY_ID } from '../../agents/registry'
import { STATUS_LABEL, STATUS_TONE } from '../../agents/kernel'
import { AI_MODEL_NAME } from '../../../ai/model'
import { REG_BY_ID, type Regulation } from './regulations'
import {
  DEFAULT_WATCH, DEPTH_META, FOCUS_OPTIONS, INSTRUCTIONS_MAX, SEVERITY_META, composeBrief,
  type WatchConfig, type WatchSeverity,
} from './watch'
import { Flag } from './ui/assets'
import { EASE, rise, spring, stagger } from './ui/motion'
import { useWatch } from './ui/useWatch'

export function AgentStudio({ goTo }: { goTo: (tab: 'library') => void }) {
  const cfg = useApp((s) => s.regWatch)
  const save = useApp((s) => s.patchRegWatch)
  const resetStore = useApp((s) => s.resetRegWatch)
  const tracked = useApp((s) => s.regTracked)
  const theme = useApp((s) => s.theme)
  const watch = useWatch()
  const agent = AGENT_BY_ID['reg.watch']

  const regs = useMemo(() => tracked.map((id) => REG_BY_ID[id]).filter((r): r is Regulation => !!r), [tracked])
  const brief = useMemo(() => composeBrief(cfg, regs), [cfg, regs])
  const isDefault = JSON.stringify(cfg) === JSON.stringify(DEFAULT_WATCH)

  // A quiet "saved" tick after each edit — settings persist as you go, and a
  // person should not have to wonder whether they did. Counted on the edit,
  // not on the store, so rehydration on load does not claim a save.
  const [saved, setSaved] = useState(0)
  const patch = (p: Partial<WatchConfig>) => { save(p); setSaved((n) => n + 1) }
  const reset = () => { resetStore(); setSaved((n) => n + 1) }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <motion.div variants={stagger(0.06)} initial="hidden" animate="show" className="space-y-4">
        {/* ── identity ── */}
        <motion.section variants={rise}
          className="relative overflow-hidden rounded-[var(--r-xl)] border border-[var(--line)] bg-[var(--surface-1)] p-5 shadow-[var(--sh-2),var(--sh-lit)]">
          <span aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-[260px] w-[260px] rounded-full"
            style={{ background: 'radial-gradient(closest-side, color-mix(in srgb, var(--agent) 14%, transparent), transparent)' }} />
          <div className="relative flex flex-wrap items-center gap-4">
            <motion.span className="relative grid h-14 w-14 shrink-0 place-items-center rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface-1)] shadow-[var(--sh-2),var(--sh-lit)]"
              animate={watch.busy ? { rotate: [0, 4, -4, 0] } : { rotate: 0 }} transition={{ repeat: watch.busy ? Infinity : 0, duration: 1.6 }}>
              <img src={theme === 'dark' ? '/brand/aire-mark-white.png' : '/brand/aire-mark-black.png'} alt="" className="h-7 w-7 object-contain" draggable={false} />
              <span className="absolute -bottom-1 -right-1"><StatusDot tone={watch.busy ? 'agent' : 'pos'} pulse={watch.busy} size={10} /></span>
            </motion.span>
            <div className="min-w-0 flex-1">
              <label className="t-label" htmlFor="watch-name">Agent name</label>
              <Input id="watch-name" value={cfg.name} maxLength={40} onChange={(e) => patch({ name: e.target.value })}
                className="!h-[38px] !text-[16px] font-semibold tracking-[-.01em]" />
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-[var(--ink-4)]">{agent.purpose}</p>
            </div>
            <div className="flex items-center gap-2">
              <AnimatePresence mode="wait">
                {saved > 0 && (
                  <motion.span key={saved} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }} className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--pos-ink)]">
                    <Icon name="check" size={11} />Saved
                  </motion.span>
                )}
              </AnimatePresence>
              {!isDefault && <Button size="sm" variant="ghost" icon={<Icon name="refresh" size={12} />} onClick={reset}>Reset</Button>}
            </div>
          </div>
        </motion.section>

        {/* ── scope ── */}
        <Card title="Scope" icon="globe" sub="The watch reads these regulations and nothing else. Change the set in the Library.">
          <div className="flex flex-wrap gap-1.5">
            <AnimatePresence initial={false}>
              {regs.map((r) => (
                <motion.span key={r.id} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={spring}
                  className="inline-flex items-center gap-1.5 rounded-[var(--r-full)] border border-[var(--line)] bg-[var(--surface-1)] py-1 pl-1.5 pr-2.5 text-[11.5px] font-medium text-[var(--ink-2)]">
                  <Flag market={r.market} size={15} />{r.name}
                </motion.span>
              ))}
            </AnimatePresence>
            {!regs.length && <span className="text-[12px] text-[var(--ink-4)]">Nothing tracked — the watch falls back to the vehicle CO₂ regime of the current market.</span>}
          </div>
          <Button className="mt-3" size="sm" variant="secondary" icon={<Icon name="list" size={12} />} onClick={() => goTo('library')}>Edit tracked regulations</Button>
        </Card>

        {/* ── schedule & reach ── */}
        <Card title="Schedule & reach" icon="clock" sub="How often a pass is due, and how far ahead each pass looks.">
          <div className="grid gap-4 md:grid-cols-2">
            <Setting label="Cadence" hint={cfg.cadence === 'manual'
              ? 'Runs only when someone starts it.'
              : `Reg AI flags a pass as due ${cfg.cadence === 'daily' ? 'each day' : 'each week'}. It still waits for a person to start it — nothing bills in the background.`}>
              <Segmented size="sm" block value={cfg.cadence} onChange={(v) => patch({ cadence: v })}
                options={[{ id: 'manual', label: 'Manual' }, { id: 'daily', label: 'Daily' }, { id: 'weekly', label: 'Weekly' }]} />
            </Setting>
            <Setting label="Look-ahead" hint="Commencement dates, consultations and drafts inside this window are in scope.">
              <Segmented size="sm" block value={String(cfg.horizonMonths) as '6' | '12' | '24' | '36'}
                onChange={(v) => patch({ horizonMonths: Number(v) as WatchConfig['horizonMonths'] })}
                options={[{ id: '6', label: '6 mo' }, { id: '12', label: '12 mo' }, { id: '24', label: '24 mo' }, { id: '36', label: '36 mo' }]} />
            </Setting>
          </div>
        </Card>

        {/* ── signal ── */}
        <Card title="Signal" icon="bell" sub="How loud the watch is, and what it weighs most.">
          <Setting label="Sensitivity">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" role="radiogroup" aria-label="Sensitivity">
              {(Object.keys(SEVERITY_META) as WatchSeverity[]).map((s, i) => {
                const on = cfg.minSeverity === s
                return (
                  <motion.button key={s} role="radio" aria-checked={on} onClick={() => patch({ minSeverity: s })} whileTap={{ scale: 0.98 }}
                    className={cx('relative flex flex-col items-start justify-start rounded-[var(--r-md)] border p-2.5 text-left transition-colors',
                      on ? 'border-[var(--ink-2)] bg-[var(--surface-2)]' : 'border-[var(--line)] hover:border-[var(--line-strong)]')}>
                    <span className="flex items-center gap-1.5">
                      <span className="flex gap-[2px]" aria-hidden>
                        {[0, 1, 2, 3].map((b) => (
                          <span key={b} className="w-[3px] rounded-full" style={{ height: 5 + b * 2.5, alignSelf: 'flex-end', background: b >= i ? 'var(--ink-1)' : 'var(--line-strong)' }} />
                        ))}
                      </span>
                      <span className="text-[12px] font-semibold text-[var(--ink-1)]">{SEVERITY_META[s].label}</span>
                    </span>
                    <span className="mt-1 block text-[11px] leading-snug text-[var(--ink-4)]">{SEVERITY_META[s].hint}</span>
                    {on && <motion.span layoutId="sev-ring" className="pointer-events-none absolute inset-0 rounded-[var(--r-md)] ring-1 ring-[var(--ink-2)]" transition={spring} />}
                  </motion.button>
                )
              })}
            </div>
          </Setting>
          <Setting className="mt-4" label="Focus" hint="Steers what the watch looks for first. It never widens what the agent may do.">
            <div className="flex flex-wrap gap-1.5">
              {FOCUS_OPTIONS.map((f) => {
                const on = cfg.focus.includes(f.id)
                return (
                  <motion.button key={f.id} whileTap={{ scale: 0.96 }} aria-pressed={on} title={f.hint}
                    onClick={() => patch({ focus: on ? cfg.focus.filter((x) => x !== f.id) : [...cfg.focus, f.id] })}
                    className={cx('inline-flex items-center gap-1.5 rounded-[var(--r-full)] border px-3 py-1.5 text-[12px] font-medium transition-colors',
                      on ? 'border-[var(--ink-1)] bg-[var(--ink-1)] text-[var(--canvas)]' : 'border-[var(--line)] text-[var(--ink-3)] hover:border-[var(--line-strong)] hover:text-[var(--ink-1)]')}>
                    <AnimatePresence initial={false}>
                      {on && (
                        <motion.span initial={{ width: 0, opacity: 0 }} animate={{ width: 'auto', opacity: 1 }} exit={{ width: 0, opacity: 0 }} className="overflow-hidden">
                          <Icon name="check" size={11} />
                        </motion.span>
                      )}
                    </AnimatePresence>
                    {f.label}
                  </motion.button>
                )
              })}
            </div>
          </Setting>
        </Card>

        {/* ── research ── */}
        <Card title="Research" icon="search" sub="How hard each pass digs.">
          <Setting label="Depth" hint={DEPTH_META[cfg.depth].hint}>
            <Segmented size="sm" value={cfg.depth} onChange={(v) => patch({ depth: v })}
              options={(Object.keys(DEPTH_META) as (keyof typeof DEPTH_META)[]).map((d) => ({
                id: d, label: <span className="tabular-nums">{DEPTH_META[d].label} · {DEPTH_META[d].searches}</span>,
              }))} />
          </Setting>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-[var(--r-md)] border border-[var(--line)] p-3">
              <Switch checked={cfg.webSearch} onChange={(v) => patch({ webSearch: v })} label="Search the web"
                sub="Gazettes, consultations and trade press. Off means the pass reads only what the platform already holds." />
            </div>
            <div className="rounded-[var(--r-md)] border border-[var(--line)] p-3">
              <Switch checked={cfg.quantify} onChange={(v) => patch({ quantify: v })} label="Price each change"
                sub="Re-derive your position under each change where a rule pack exists. Off is faster: classify and cite only." />
            </div>
          </div>
        </Card>

        {/* ── instructions ── */}
        <Card title="Instructions" icon="edit" sub="Anything else the watch should know about how your team works. Sent as your request — it cannot override the guardrails.">
          <Textarea rows={4} maxLength={INSTRUCTIONS_MAX} value={cfg.instructions}
            onChange={(e) => patch({ instructions: e.target.value })}
            placeholder="e.g. We import flat steel from India and China — flag anything that changes CBAM default values for those origins first." />
          <div className="mt-1.5 flex justify-end text-[10.5px] tabular-nums text-[var(--ink-4)]">{cfg.instructions.length} / {INSTRUCTIONS_MAX}</div>
        </Card>

        {/* ── guardrails ── */}
        <Card title="Guardrails" icon="lock" sub="Safety properties of the agent. Shown so you know they hold; not settings, and enforced on the server.">
          <ul className="grid gap-2 md:grid-cols-2">
            {[
              { k: 'Model', v: `${AI_MODEL_NAME}, platform-wide. No other model can be selected.` },
              { k: 'Autonomy', v: 'Proposes only. A change to your workspace waits for a person with the right role.' },
              { k: 'Validation gate', v: 'Every proposal is re-derived by the deterministic engine before anyone sees it as actionable.' },
              { k: 'Tools', v: `${agent.tools.map((t) => t.label).join(', ')}. Nothing outside this allowlist can be called.` },
              { k: 'Spend', v: 'Per-user and per-workspace rate limits, and a daily ceiling on AI requests.' },
              { k: 'Your instructions', v: 'Delivered as a user request inside the brief — never as an operator instruction.' },
            ].map((g) => (
              <li key={g.k} className="flex gap-2.5 rounded-[var(--r-md)] bg-[var(--surface-2)] p-2.5">
                <Icon name="lock" size={12} className="mt-0.5 shrink-0 text-[var(--ink-4)]" />
                <span className="min-w-0">
                  <span className="block text-[11.5px] font-semibold text-[var(--ink-1)]">{g.k}</span>
                  <span className="mt-0.5 block text-[11.5px] leading-relaxed text-[var(--ink-3)]">{g.v}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </motion.div>

      {/* ── preview ── */}
      <div className="xl:sticky xl:top-4 xl:self-start">
        <motion.section initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.45, ease: EASE, delay: 0.1 }}
          className="overflow-hidden rounded-[var(--r-xl)] border border-[var(--line)] bg-[var(--surface-1)] shadow-[var(--sh-3),var(--sh-lit)]">
          <header className="flex items-center gap-2.5 border-b border-[var(--line-soft)] px-4 py-3">
            <Icon name="file" size={14} className="text-[var(--ink-3)]" />
            <div className="min-w-0 flex-1">
              <h3 className="t-title-sm">What the agent receives</h3>
              <p className="t-cap mt-0.5">Built by the same function the server runs.</p>
            </div>
            <Badge tone="agent">{AI_MODEL_NAME}</Badge>
          </header>
          <div className="max-h-[360px] overflow-y-auto bg-[var(--surface-2)] px-4 py-3">
            <AnimatePresence mode="wait" initial={false}>
              <motion.pre key={brief} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} exit={{ opacity: 0.4 }} transition={{ duration: 0.15 }}
                className="t-mono whitespace-pre-wrap break-words text-[11px] leading-[1.65] text-[var(--ink-2)]">{brief}</motion.pre>
            </AnimatePresence>
          </div>
          <dl className="grid grid-cols-3 divide-x divide-[var(--line-soft)] border-t border-[var(--line-soft)] text-center">
            {[
              { k: 'Regulations', v: regs.length },
              { k: 'Web lookups', v: cfg.webSearch ? `≤ ${DEPTH_META[cfg.depth].searches}` : 'off' },
              { k: 'Look-ahead', v: `${cfg.horizonMonths} mo` },
            ].map((x) => (
              <div key={x.k} className="px-2 py-2.5">
                <dt className="t-label">{x.k}</dt>
                <dd className="m-0 mt-0.5 text-[14px] font-semibold tabular-nums text-[var(--ink-1)]">{x.v}</dd>
              </div>
            ))}
          </dl>
          <div className="border-t border-[var(--line-soft)] p-4">
            <Button block variant="primary" size="md" loading={watch.busy} disabled={!watch.allowed}
              icon={watch.busy ? undefined : <Icon name="play" size={12} />} onClick={() => watch.run()}>
              {watch.busy ? 'Pass in progress…' : `Run ${cfg.name}`}
            </Button>
            {watch.last ? (
              <button onClick={() => { useApp.getState().setActiveRun(watch.last!.id); useApp.getState().setConsole(true) }}
                className="mt-2.5 flex w-full items-center justify-center gap-1.5 text-[11.5px] text-[var(--ink-3)] hover:text-[var(--ink-1)]">
                <StatusDot tone={STATUS_TONE[watch.last.status]} size={6} />
                {STATUS_LABEL[watch.last.status]} · {relTime(watch.last.startedAt)} · open trace
              </button>
            ) : (
              <p className="mt-2.5 text-center text-[11.5px] text-[var(--ink-4)]">
                {watch.allowed ? 'No pass yet in this session.' : 'Your role can tune the brief but not run agents.'}
              </p>
            )}
          </div>
        </motion.section>

        <motion.section initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.45, ease: EASE, delay: 0.18 }}
          className="mt-4 rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface-1)] p-4 shadow-[var(--sh-1),var(--sh-lit)]">
          <div className="t-label mb-2.5">Official sources in scope</div>
          <ul className="space-y-2">
            {regs.flatMap((r) => r.sources.map((s) => ({ r, s }))).filter((x, i, a) => a.findIndex((y) => y.s.name === x.s.name) === i).slice(0, 10).map(({ r, s }) => (
              <li key={s.name}>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-2 text-[12px]">
                  <Flag market={r.market} size={14} />
                  <span className="min-w-0 flex-1 truncate font-medium text-[var(--ink-2)] group-hover:text-[var(--ink-1)] group-hover:underline">{s.name}</span>
                  <span className="truncate text-[11px] text-[var(--ink-4)]">{r.name}</span>
                  <Icon name="external" size={10} className="shrink-0 text-[var(--ink-5)]" />
                </a>
              </li>
            ))}
          </ul>
        </motion.section>
      </div>
    </div>
  )
}

/* ── local layout atoms ─────────────────────────────────────────────────── */

function Card({ title, sub, icon, children }: { title: string; sub?: string; icon: Parameters<typeof Icon>[0]['name']; children: React.ReactNode }) {
  return (
    <motion.section variants={rise}
      className="rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface-1)] shadow-[var(--sh-1),var(--sh-lit)]">
      <header className="flex items-start gap-3 px-4 pb-3 pt-3.5">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[var(--r-sm)] bg-[var(--surface-2)] text-[var(--ink-3)]"><Icon name={icon} size={14} /></span>
        <div className="min-w-0">
          <h3 className="t-title-sm">{title}</h3>
          {sub && <p className="t-cap mt-0.5 leading-relaxed">{sub}</p>}
        </div>
      </header>
      <div className="px-4 pb-4">{children}</div>
    </motion.section>
  )
}

function Setting({ label, hint, className, children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <div className="mb-1.5 text-[12px] font-medium text-[var(--ink-2)]">{label}</div>
      {children}
      {hint && <p className="mt-1.5 text-[11.5px] leading-relaxed text-[var(--ink-4)]">{hint}</p>}
    </div>
  )
}
