/* A regulation, opened: what it is, its key dates, the instruments behind it,
   where to read the source, and the switch that tracks it. */
import React from 'react'
import { motion } from 'framer-motion'
import { Badge, Button, Callout, Drawer, Switch, cx } from '../../../design/primitives'
import Icon from '../../../design/icons'
import { useApp } from '../../../state/appStore'
import { STAGE_META } from '../catalogue'
import { CATEGORY_META, MARKET_NAME, instrumentsOf, regMoving, regStage, type Regulation } from '../regulations'
import { CategoryChip, CategoryTile, Flag } from './assets'
import { rise, stagger } from './motion'

export const fmtDate = (iso: string | number) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

export function RegDrawer({ reg, onClose, onRead }: {
  reg: Regulation | null; onClose: () => void; onRead?: (reg: Regulation) => void
}) {
  const tracked = useApp((s) => s.regTracked)
  const toggle = useApp((s) => s.toggleReg)
  if (!reg) return <Drawer open={false} onClose={onClose} />
  const on = tracked.includes(reg.id)
  const stage = regStage(reg.id)
  const moving = regMoving(reg.id)
  const inst = instrumentsOf(reg.id)
  const now = Date.now()

  return (
    <Drawer open onClose={onClose} width={520}
      title={<span className="flex items-center gap-2"><Flag market={reg.market} size={20} />{reg.name}</span>}
      sub={`${MARKET_NAME[reg.market]} · ${CATEGORY_META[reg.category].label}`}
      footer={
        <div className="flex items-center justify-between gap-3">
          <Switch checked={on} onChange={() => toggle(reg.id)} label={on ? 'Tracking' : 'Not tracked'}
            sub={on ? 'On the radar, in the reader and in every watch pass.' : 'Track it to bring it into Reg AI.'} />
          {onRead && inst.length > 0 && (
            <Button size="sm" variant="secondary" icon={<Icon name="book" size={12} />} onClick={() => onRead(reg)}>Read the clauses</Button>
          )}
        </div>
      }>
      <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className="space-y-5">
        <motion.div variants={rise} className="flex items-start gap-3">
          <CategoryTile category={reg.category} size={38} />
          <div className="min-w-0">
            <p className="text-[13px] leading-relaxed text-[var(--ink-2)]">{reg.tagline}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge tone={STAGE_META[stage].tone} dot>{STAGE_META[stage].label}</Badge>
              {moving && moving !== stage && <Badge tone={STAGE_META[moving].tone}>{STAGE_META[moving].label} moving</Badge>}
              <CategoryChip category={reg.category} />
              {reg.packBacked
                ? <Badge tone="info" icon={<Icon name="gauge" size={10} />}>Priced by the engine</Badge>
                : <Badge tone="neutral">Tracked, not priced</Badge>}
            </div>
          </div>
        </motion.div>

        {!reg.packBacked && (
          <motion.div variants={rise}>
            <Callout tone="neutral" icon={<Icon name="alert" size={13} />}>
              No rule pack computes this regulation. Reg AI tracks its stage and dates and the watch reports changes,
              but no figure on the platform is derived from it.
            </Callout>
          </motion.div>
        )}

        <motion.section variants={rise}>
          <div className="t-label mb-2">Key dates</div>
          {reg.milestones.length ? (
            <ol className="relative ml-1.5 space-y-3 border-l border-[var(--line)] pl-4">
              {reg.milestones.map((m) => {
                const past = Date.parse(m.date) < now
                return (
                  <li key={m.date + m.label} className="relative">
                    <span className={cx('absolute -left-[21.5px] top-1 h-[9px] w-[9px] rounded-full border-2 border-[var(--surface-1)]')}
                      style={{ background: past ? 'var(--ink-5)' : 'var(--brand)' }} />
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className={cx('text-[12px] font-semibold tabular-nums', past ? 'text-[var(--ink-4)]' : 'text-[var(--ink-1)]')}>{fmtDate(m.date)}</span>
                      {m.indicative && <Badge tone="warn">indicative</Badge>}
                    </div>
                    <p className={cx('mt-0.5 text-[12px] leading-relaxed', past ? 'text-[var(--ink-4)]' : 'text-[var(--ink-2)]')}>{m.label}</p>
                  </li>
                )
              })}
            </ol>
          ) : <p className="text-[12px] text-[var(--ink-4)]">No dated step. This is under review and has no commencement date.</p>}
        </motion.section>

        <motion.section variants={rise}>
          <div className="t-label mb-2">Instruments</div>
          <div className="space-y-2">
            {inst.map((i) => (
              <div key={i.id} className="rounded-[var(--r-md)] border border-[var(--line)] p-3">
                <div className="flex items-center gap-2">
                  <span className="t-mono rounded-[3px] bg-[var(--surface-3)] px-1.5 py-px text-[10.5px] text-[var(--ink-2)]">{i.citation}</span>
                  <Badge tone={STAGE_META[i.stage].tone}>{STAGE_META[i.stage].label}</Badge>
                  <span className="ml-auto text-[10.5px] tabular-nums text-[var(--ink-4)]">{i.from}–{i.to ?? 'open'}</span>
                </div>
                <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--ink-3)]">{i.summary}</p>
              </div>
            ))}
          </div>
        </motion.section>

        <motion.section variants={rise}>
          <div className="t-label mb-2">Official sources</div>
          <div className="flex flex-wrap gap-1.5">
            {reg.sources.map((s) => (
              <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-1)] px-2.5 py-1.5 text-[11.5px] font-medium text-[var(--ink-2)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--ink-1)]">
                <Icon name="globe" size={11} />{s.name}<Icon name="external" size={10} className="text-[var(--ink-4)]" />
              </a>
            ))}
          </div>
        </motion.section>

        <motion.p variants={rise} className="text-[11px] leading-relaxed text-[var(--ink-4)]">
          This is the platform’s structured reading of the regulation, not the regulation itself. Dates marked indicative depend on a later act,
          an amendment or a condition — check the primary source before relying on them.
        </motion.p>
      </motion.div>
    </Drawer>
  )
}
