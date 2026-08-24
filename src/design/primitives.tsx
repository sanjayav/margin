// ───────────────────────────────────────────────────────────────────────────
// DESIGN PRIMITIVES — see DESIGN.md.
//
// These exist so consistency is structural rather than remembered. Every screen
// is built from these pieces, so "one number leads", "colour means something or
// it is absent" and "whitespace separates, not borders" hold without anyone
// having to re-apply them.
//
// The rule that removes the most visual noise: a surface gets a border OR a
// shadow OR a fill — never two, and usually none. Grouping is space.
// ───────────────────────────────────────────────────────────────────────────
import type { ReactNode } from 'react'
import Icon, { type IconName } from '../components/Icon'
import { STATUS } from '../lib/palette'

/* ── Metric band ──────────────────────────────────────────────────────────
   The one dark surface in the product. It is where the eye lands, and it
   carries exactly one number plus the sentence that explains it. */
export function MetricBand({ eyebrow, value, unit, sentence, secondary, action, tone = 'neutral' }: {
  eyebrow: string
  value: string
  unit?: string
  sentence: ReactNode
  secondary?: { label: string; value: string; tone?: 'good' | 'bad' | 'neutral' }[]
  action?: { label: string; icon?: IconName; onClick: () => void }
  tone?: 'good' | 'bad' | 'neutral'
}) {
  const hue = tone === 'bad' ? STATUS.fine : tone === 'good' ? STATUS.compliant : '#FFFFFF'
  return (
    <section className="rounded-2xl px-8 py-7 text-white" style={{ background: '#1B1714' }}>
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/40">{eyebrow}</div>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2.5">
            <span className="dnum font-display font-extrabold leading-[0.95] tracking-[-0.03em] tabular-nums"
              style={{ fontSize: 'clamp(34px,4vw,52px)', color: hue }}>{value}</span>
            {unit && <span className="text-[13px] font-medium text-white/45">{unit}</span>}
          </div>
          <p className="mt-3 max-w-[62ch] text-[13.5px] leading-[1.55] text-white/65">{sentence}</p>
        </div>
        {!!secondary?.length && (
          <dl className="flex shrink-0 gap-9">
            {secondary.map((s) => (
              <div key={s.label}>
                <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">{s.label}</dt>
                <dd className="dnum mt-1.5 text-[19px] font-bold tabular-nums leading-none"
                  style={{ color: s.tone === 'bad' ? STATUS.fine : s.tone === 'good' ? STATUS.compliant : 'rgba(255,255,255,0.9)' }}>{s.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      {action && (
        <button onClick={action.onClick}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-[13px] font-semibold text-white transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400">
          {action.icon && <Icon name={action.icon} size={15} />}{action.label}
        </button>
      )}
    </section>
  )
}

/* ── Section ───────────────────────────────────────────────────────────────
   A heading and its content. No box. Space does the grouping. */
export function Block({ title, hint, action, children }: {
  title: string
  hint?: ReactNode
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="mt-12 first:mt-0">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="font-display text-[17px] font-bold tracking-[-0.01em] text-ink-100">{title}</h2>
          {hint && <p className="mt-1 text-[12.5px] leading-relaxed text-ink-500">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

/* ── Figure ────────────────────────────────────────────────────────────────
   A number with its unit and its basis. There is no variant without a basis —
   a figure whose origin cannot be stated does not belong on the screen. */
export function Figure({ label, value, unit, basis, tone = 'neutral', size = 'md' }: {
  label: string
  value: string
  unit?: string
  basis: string
  tone?: 'good' | 'bad' | 'warn' | 'neutral'
  size?: 'md' | 'lg'
}) {
  const color = tone === 'bad' ? STATUS.fine : tone === 'good' ? STATUS.compliant : tone === 'warn' ? '#D98005' : '#1C1812'
  return (
    <div>
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.13em] text-ink-500">{label}</div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className={`dnum font-bold tabular-nums leading-none tracking-[-0.02em] ${size === 'lg' ? 'text-[30px]' : 'text-[22px]'}`} style={{ color }}>{value}</span>
        {unit && <span className="text-[11.5px] text-ink-500">{unit}</span>}
      </div>
      <div className="mt-1.5 text-[11.5px] leading-snug text-ink-500">{basis}</div>
    </div>
  )
}

/* ── Status ────────────────────────────────────────────────────────────────
   Never colour alone: an icon and a word travel with the hue. */
const STATUS_META: Record<string, { label: string; icon: IconName; color: string }> = {
  compliant: { label: 'Under the line', icon: 'check', color: STATUS.compliant },
  fine: { label: 'Over the line', icon: 'alert', color: STATUS.fine },
  exempt: { label: 'Exempt', icon: 'shield', color: STATUS.exempt },
  'no-sales': { label: 'No registrations', icon: 'dot', color: STATUS['no-sales'] },
}
export function Status({ status }: { status: string }) {
  const m = STATUS_META[status] ?? STATUS_META['no-sales']
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold" style={{ color: m.color }}>
      <Icon name={m.icon} size={12} /> {m.label}
    </span>
  )
}

/* ── Table ─────────────────────────────────────────────────────────────────
   Stripe's lesson: rules between rows, never around them; numbers tabular and
   right-aligned so a column reads as a column. */
export interface Column<T> {
  key: string
  header: string
  align?: 'left' | 'right'
  width?: string
  cell: (row: T) => ReactNode
}
export function Table<T>({ columns, rows, rowKey, onRowClick, empty = 'Nothing to show.' }: {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  onRowClick?: (row: T) => void
  empty?: string
}) {
  if (!rows.length) return <p className="py-10 text-center text-[13px] text-ink-500">{empty}</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={{ width: c.width }}
                className={`border-b border-black/[0.08] pb-2.5 pl-5 first:pl-0 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-500 ${c.align === 'right' ? 'text-right' : 'text-left'}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined}
              className={`border-b border-black/[0.05] transition-colors ${onRowClick ? 'cursor-pointer hover:bg-black/[0.02]' : ''}`}>
              {columns.map((c) => (
                <td key={c.key} className={`py-3 pl-5 first:pl-0 text-[13px] text-ink-200 ${c.align === 'right' ? 'text-right tabular-nums' : ''}`}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ── Provenance ────────────────────────────────────────────────────────────
   The product's whole claim, made visible. Every screen that states a figure
   states where it came from. */
export function Provenance({ source, vintage, detail }: { source: string; vintage: string; detail?: string }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-ink-500">
      <Icon name="shield" size={12} className="text-ink-400" />
      <span className="font-medium text-ink-400">{source}</span>
      <span aria-hidden>·</span>
      <span>{vintage}</span>
      {detail && <><span aria-hidden>·</span><span>{detail}</span></>}
    </p>
  )
}
