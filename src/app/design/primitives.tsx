/* ───────────────────────────────────────────────────────────────────────────
   AiRE Design System — primitives
   ---------------------------------------------------------------------------
   Roughly thirty components that every screen in the platform is built from.
   Two conventions hold throughout and are worth stating once:

   1. COLOUR COMES FROM TOKENS. Utilities read `var(--…)` from tokens.css. There
      is no hex in this file. Theme switching is therefore free.
   2. TONE IS A PROP, NOT A COLOUR. A caller says `tone="neg"`, never "red".
      That is what stops a designer's red and a breach's red drifting apart, and
      it is why `<Badge tone="neg">` is safe to use in a table cell that a
      regulator will read.
   ─────────────────────────────────────────────────────────────────────────── */
import React, {
  createContext, forwardRef, useCallback, useContext, useEffect,
  useId, useLayoutEffect, useMemo, useRef, useState,
} from 'react'
import { createPortal } from 'react-dom'
import { useAnimatedNumber } from './motion'
import { EmptyArt, type ArtName } from './art'

export const cx = (...parts: (string | false | 0 | null | undefined)[]) => parts.filter(Boolean).join(' ')

/** The semantic families. Everything that carries meaning picks one of these. */
export type Tone = 'neutral' | 'brand' | 'pos' | 'warn' | 'neg' | 'info' | 'agent'

const TONE: Record<Tone, { fg: string; bg: string; line: string; solid: string }> = {
  neutral: { fg: 'var(--ink-3)',   bg: 'var(--surface-2)',  line: 'var(--line)',       solid: 'var(--ink-3)' },
  brand:   { fg: 'var(--brand-ink)', bg: 'var(--brand-tint)', line: 'var(--brand-line)', solid: 'var(--brand)' },
  pos:     { fg: 'var(--pos-ink)',  bg: 'var(--pos-tint)',   line: 'var(--pos-line)',   solid: 'var(--pos)' },
  warn:    { fg: 'var(--warn-ink)', bg: 'var(--warn-tint)',  line: 'var(--warn-line)',  solid: 'var(--warn)' },
  neg:     { fg: 'var(--neg-ink)',  bg: 'var(--neg-tint)',   line: 'var(--neg-line)',   solid: 'var(--neg)' },
  info:    { fg: 'var(--info-ink)', bg: 'var(--info-tint)',  line: 'var(--info-line)',  solid: 'var(--info)' },
  agent:   { fg: 'var(--agent-ink)',bg: 'var(--agent-tint)', line: 'var(--agent-line)', solid: 'var(--agent)' },
}
export const toneVars = (t: Tone) => TONE[t]

/* ═══════════════════════════════════════════════════════════════════════════
   Button
   ═══════════════════════════════════════════════════════════════════════════ */

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'quiet'
type BtnSize = 'xs' | 'sm' | 'md' | 'lg'

const BTN_SIZE: Record<BtnSize, string> = {
  xs: 'h-[26px] px-2 text-[11.5px] gap-1 rounded-[var(--r-xs)]',
  sm: 'h-[30px] px-2.5 text-[12.5px] gap-1.5 rounded-[var(--r-sm)]',
  md: 'h-[34px] px-3.5 text-[13px] gap-1.5 rounded-[var(--r-md)]',
  lg: 'h-[40px] px-5 text-[14px] gap-2 rounded-[var(--r-md)]',
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant
  size?: BtnSize
  loading?: boolean
  icon?: React.ReactNode
  iconRight?: React.ReactNode
  block?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, icon, iconRight, block, className, children, disabled, ...rest }, ref,
) {
  const base = cx(
    'inline-flex select-none items-center justify-center whitespace-nowrap font-medium',
    'transition-[background,border-color,color,box-shadow,transform] duration-fast ease-std',
    'active:translate-y-px disabled:pointer-events-none',
    BTN_SIZE[size], block && 'w-full',
  )
  const skin: Record<BtnVariant, string> = {
    primary:   'bg-[var(--brand)] text-white shadow-[var(--sh-1)] hover:bg-[var(--brand-hover)] active:bg-[var(--brand-press)] disabled:bg-[var(--surface-3)] disabled:text-[var(--ink-5)] disabled:shadow-none',
    secondary: 'border border-[var(--line)] bg-[var(--surface-1)] text-[var(--ink-1)] shadow-[var(--sh-1)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)] disabled:text-[var(--ink-5)] disabled:shadow-none',
    ghost:     'text-[var(--ink-3)] hover:bg-[var(--surface-2)] hover:text-[var(--ink-1)] disabled:text-[var(--ink-5)]',
    quiet:     'border border-transparent bg-[var(--surface-2)] text-[var(--ink-2)] hover:bg-[var(--surface-3)] hover:text-[var(--ink-1)] disabled:text-[var(--ink-5)]',
    danger:    'border border-[var(--neg-line)] bg-[var(--neg-tint)] text-[var(--neg-ink)] hover:border-[var(--neg)] hover:bg-[var(--neg)] hover:text-white disabled:border-[var(--line)] disabled:bg-[var(--surface-2)] disabled:text-[var(--ink-5)]',
  }
  return (
    <button ref={ref} disabled={disabled || loading} className={cx(base, skin[variant], className)} {...rest}>
      {loading ? <Spinner size={size === 'lg' ? 15 : 12} /> : icon}
      {children}
      {iconRight}
    </button>
  )
})

export function IconButton({ label, className, ...rest }: ButtonProps & { label: string }) {
  return (
    <Button aria-label={label} title={label} variant="ghost" size="sm"
      className={cx('!h-[30px] !w-[30px] !p-0', className)} {...rest} />
  )
}

export function Spinner({ size = 13, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={cx('shrink-0', className)}
      style={{ animation: 'aire-spin .7s linear infinite' }} aria-hidden>
      <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeOpacity=".22" strokeWidth="2" />
      <path d="M8 1.8A6.2 6.2 0 0 1 14.2 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Surfaces
   ═══════════════════════════════════════════════════════════════════════════ */

export function Card({ className, flush, interactive, children, ...rest }:
  React.HTMLAttributes<HTMLDivElement> & { flush?: boolean; interactive?: boolean }) {
  return (
    <div className={cx(
      'rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface-1)] shadow-[var(--sh-1),var(--sh-lit)]',
      !flush && 'p-4',
      interactive && 'lift cursor-pointer hover:border-[var(--line-strong)]',
      className,
    )} {...rest}>{children}</div>
  )
}

/** A card with a titled header rule — the workhorse container for a screen
 *  section. `actions` sits on the header baseline so a section's controls are
 *  always in the same place on every screen. */
export function Panel({ title, sub, actions, icon, className, bodyClass, children, footer, flush, accent }: {
  title?: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode; icon?: React.ReactNode
  className?: string; bodyClass?: string; children?: React.ReactNode; footer?: React.ReactNode
  /** Body sits flush to the panel edge — for tables and charts that draw their
   *  own inset. */
  flush?: boolean
  /** A tone rule down the leading edge, for a panel that carries a verdict
   *  rather than just content. */
  accent?: Tone
}) {
  return (
    <section className={cx('relative overflow-hidden rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface-1)] shadow-[var(--sh-1),var(--sh-lit)]', className)}>
      {accent && <span aria-hidden className="absolute inset-y-0 left-0 w-[2px]" style={{ background: TONE[accent].solid }} />}
      {(title || actions) && (
        <header className="relative flex items-center gap-3 px-4 py-3">
          <span aria-hidden className="absolute inset-x-0 bottom-0 h-px"
            style={{ background: 'linear-gradient(90deg, transparent, var(--line) 8%, var(--line) 92%, transparent)' }} />
          {icon && <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[var(--r-sm)] bg-[var(--surface-2)] text-[var(--ink-3)]">{icon}</span>}
          <div className="min-w-0 flex-1">
            {title && <h3 className="t-title-sm truncate">{title}</h3>}
            {sub && <p className="t-cap mt-0.5 leading-relaxed">{sub}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div className={cx(!flush && 'p-[18px]', bodyClass)}>{children}</div>
      {footer && <footer className="border-t border-[var(--line-soft)] bg-[var(--surface-2)] px-4 py-2.5">{footer}</footer>}
    </section>
  )
}

export function SectionHead({ title, sub, actions, className }: {
  title: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode; className?: string
}) {
  return (
    <div className={cx('mb-3 flex items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        <h2 className="t-title">{title}</h2>
        {sub && <p className="t-cap mt-0.5">{sub}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </div>
  )
}

/** A titled chapter. Long modules were one continuous stream of white cards on
 *  grey, which reads as a dump rather than a document. A section gives the eye
 *  a place to rest and the page a structure you can skim. */
export function Section({ title, sub, actions, children, className }: {
  title?: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode
  children: React.ReactNode; className?: string
}) {
  return (
    <section className={cx('mt-7 first:mt-0', className)}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="t-title">{title}</h2>}
            {sub && <p className="t-cap mt-1 max-w-[74ch]">{sub}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </div>
      )}
      <div className="space-y-4">{children}</div>
    </section>
  )
}

export const Divider = ({ className, vertical }: { className?: string; vertical?: boolean }) =>
  vertical
    ? <span className={cx('inline-block w-px self-stretch bg-[var(--line)]', className)} />
    : <hr className={cx('my-3 border-0 border-t border-[var(--line-soft)]', className)} />

/* ═══════════════════════════════════════════════════════════════════════════
   Status vocabulary
   ═══════════════════════════════════════════════════════════════════════════ */

export function Badge({ tone = 'neutral', solid, dot, icon, className, children }: {
  tone?: Tone; solid?: boolean; dot?: boolean; icon?: React.ReactNode; className?: string; children: React.ReactNode
}) {
  const t = TONE[tone]
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-[var(--r-full)] px-2 py-[3px] text-[11px] font-semibold', className)}
      style={solid
        ? { background: t.solid, color: 'var(--ink-inv)' }
        : { background: t.bg, color: t.fg, boxShadow: `inset 0 0 0 1px ${t.line}` }}>
      {dot && <span className="h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: solid ? 'currentColor' : t.solid }} />}
      {icon}
      {children}
    </span>
  )
}

export function StatusDot({ tone = 'neutral', pulse, size = 7 }: { tone?: Tone; pulse?: boolean; size?: number }) {
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {pulse && <span className="absolute inset-0 rounded-full" style={{ background: TONE[tone].solid, animation: 'aire-pulse 1.8s var(--ease) infinite' }} />}
      <span className="relative rounded-full" style={{ width: size, height: size, background: TONE[tone].solid }} />
    </span>
  )
}

export const Kbd = ({ children }: { children: React.ReactNode }) => (
  <kbd className="rounded-[4px] border border-[var(--line)] bg-[var(--surface-2)] px-1 py-px font-sans text-[10px] font-semibold text-[var(--ink-4)]">{children}</kbd>
)

export function Callout({ tone = 'info', title, icon, children, actions, className }: {
  tone?: Tone; title?: React.ReactNode; icon?: React.ReactNode; children?: React.ReactNode
  actions?: React.ReactNode; className?: string
}) {
  const t = TONE[tone]
  return (
    <div className={cx('flex items-start gap-3 rounded-[var(--r-md)] px-3.5 py-3', className)}
      style={{ background: t.bg, boxShadow: `inset 0 0 0 1px ${t.line}` }}>
      {icon && <span className="mt-px shrink-0" style={{ color: t.solid }}>{icon}</span>}
      <div className="min-w-0 flex-1">
        {title && <div className="text-[12.5px] font-semibold" style={{ color: t.fg }}>{title}</div>}
        {children && <div className={cx('text-[12px] leading-relaxed text-[var(--ink-3)]', title && 'mt-0.5')}>{children}</div>}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Metric — the single most repeated object in the product
   ═══════════════════════════════════════════════════════════════════════════ */

export function Metric({ label, value, unit, delta, deltaTone, hint, sub, tone, icon, size = 'md', className }: {
  label: React.ReactNode; value: React.ReactNode; unit?: React.ReactNode
  delta?: React.ReactNode; deltaTone?: Tone; hint?: React.ReactNode; sub?: React.ReactNode
  tone?: Tone; icon?: React.ReactNode; size?: 'sm' | 'md' | 'lg'; className?: string
}) {
  const px = size === 'lg' ? 34 : size === 'sm' ? 20 : 28
  return (
    <div className={cx('min-w-0', className)}>
      <div className="flex items-center gap-1.5">
        {icon && <span className="text-[var(--ink-4)]">{icon}</span>}
        <span className="t-label truncate">{label}</span>
        {hint && <Tooltip content={hint}><InfoDot /></Tooltip>}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="t-num font-semibold"
          style={{ fontSize: px, lineHeight: 1.06, letterSpacing: px > 22 ? '-.03em' : '-.02em', color: tone ? TONE[tone].fg : 'var(--ink-1)' }}>{value}</span>
        {unit && <span className="text-[12px] font-medium text-[var(--ink-4)]">{unit}</span>}
        {delta != null && <Badge tone={deltaTone ?? 'neutral'} className="ml-0.5 !py-0">{delta}</Badge>}
      </div>
      {sub && <div className="t-cap mt-1 overflow-hidden leading-snug [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">{sub}</div>}
    </div>
  )
}

/** A number that animates to its new value. Used for every headline figure,
 *  because the change is often the whole point — an exposure that moved is more
 *  informative than an exposure that is merely large. */
export function CountUp({ value, format, duration }: { value: number; format?: (v: number) => string; duration?: number }) {
  const v = useAnimatedNumber(isFinite(value) ? value : 0, duration)
  return <>{(format ?? ((n: number) => n.toFixed(1)))(v)}</>
}

const InfoDot = () => (
  <span className="grid h-[13px] w-[13px] cursor-help place-items-center rounded-full border border-[var(--line-strong)] text-[8px] font-bold text-[var(--ink-4)]">i</span>
)

/** A row of metrics divided by hairlines — the first thing read on every
 *  module, so it is given the height and the figure size to earn that.
 *
 *  Each cell carries a 2px rule in its metric's own tone. It is the cheapest
 *  hierarchy in the product: a row of five identical white boxes tells you
 *  nothing at a glance, and the same row with one red rule and one green tells
 *  you where to look before you have read a word. Untoned metrics get a neutral
 *  rule rather than none, so the row still reads as a set. */
export function MetricRow({ children, className }: { children: React.ReactNode; className?: string }) {
  const items = React.Children.toArray(children)
  return (
    <div className={cx('stagger grid gap-px overflow-hidden rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--line)] shadow-[var(--sh-2),var(--sh-lit)]', className)}
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0,1fr))` }}>
      {items.map((c, i) => {
        const tone = (React.isValidElement(c) ? (c.props as { tone?: Tone }).tone : undefined) ?? 'neutral'
        return (
          <div key={i} className="relative bg-[var(--surface-1)] px-4 pb-4 pt-[15px]">
            <span aria-hidden className="absolute inset-x-0 top-0 h-[2px]"
              style={{ background: tone === 'neutral' ? 'var(--line-strong)' : TONE[tone].solid }} />
            {c}
          </div>
        )
      })}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Form controls
   ═══════════════════════════════════════════════════════════════════════════ */

export function Field({ label, hint, error, required, children, className, htmlFor }: {
  label?: React.ReactNode; hint?: React.ReactNode; error?: React.ReactNode
  required?: boolean; children: React.ReactNode; className?: string; htmlFor?: string
}) {
  return (
    <div className={cx('min-w-0', className)}>
      {label && (
        <label htmlFor={htmlFor} className="mb-1.5 flex items-center gap-1 text-[12px] font-medium text-[var(--ink-2)]">
          {label}{required && <span className="text-[var(--brand)]">*</span>}
        </label>
      )}
      {children}
      {error
        ? <p className="mt-1 text-[11.5px] text-[var(--neg-ink)]">{error}</p>
        : hint ? <p className="mt-1 text-[11.5px] text-[var(--ink-4)]">{hint}</p> : null}
    </div>
  )
}

const CONTROL = cx(
  'w-full rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-1)] px-2.5 text-[13px] text-[var(--ink-1)]',
  'placeholder:text-[var(--ink-5)] transition-[border-color,box-shadow] duration-fast',
  'hover:border-[var(--line-strong)] focus:border-[var(--ink-3)] focus:outline-none focus:shadow-[var(--ring)]',
  'disabled:cursor-not-allowed disabled:bg-[var(--surface-2)] disabled:text-[var(--ink-4)]',
)

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean; addon?: React.ReactNode }>(
  function Input({ className, invalid, addon, ...rest }, ref) {
    const input = <input ref={ref} className={cx(CONTROL, 'h-[34px]', invalid && '!border-[var(--neg)]', addon && 'pr-9', className)} {...rest} />
    if (!addon) return input
    return (
      <div className="relative">
        {input}
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11.5px] font-medium text-[var(--ink-4)]">{addon}</span>
      </div>
    )
  })

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={cx(CONTROL, 'resize-none py-2 leading-relaxed', className)} {...rest} />
  })

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <div className="relative">
        <select ref={ref} className={cx(CONTROL, 'h-[34px] cursor-pointer appearance-none pr-8', className)} {...rest}>{children}</select>
        <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-4)]" width="11" height="11" viewBox="0 0 12 12" aria-hidden>
          <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    )
  })

export function Switch({ checked, onChange, label, sub, disabled, size = 'md' }: {
  checked: boolean; onChange: (v: boolean) => void; label?: React.ReactNode; sub?: React.ReactNode
  disabled?: boolean; size?: 'sm' | 'md'
}) {
  const w = size === 'sm' ? 28 : 34, h = size === 'sm' ? 16 : 20, k = h - 4
  const control = (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative shrink-0 rounded-full transition-colors duration-base ease-std disabled:opacity-40"
      style={{ width: w, height: h, background: checked ? 'var(--brand)' : 'var(--line-strong)' }}>
      <span className="absolute top-1/2 rounded-full bg-white shadow-[var(--sh-1)] transition-[left] duration-base ease-decel"
        style={{ width: k, height: k, left: checked ? w - k - 2 : 2, transform: 'translateY(-50%)' }} />
    </button>
  )
  if (!label) return control
  return (
    <label className="flex cursor-pointer items-start gap-3">
      {control}
      <span className="min-w-0">
        <span className="block text-[12.5px] font-medium text-[var(--ink-1)]">{label}</span>
        {sub && <span className="mt-0.5 block text-[11.5px] leading-relaxed text-[var(--ink-4)]">{sub}</span>}
      </span>
    </label>
  )
}

export function Segmented<T extends string>({ value, onChange, options, size = 'md', block, className }: {
  value: T; onChange: (v: T) => void; block?: boolean; className?: string
  options: { id: T; label: React.ReactNode; icon?: React.ReactNode; hint?: string; disabled?: boolean }[]
  size?: 'sm' | 'md'
}) {
  /* The indicator MOVES between options rather than appearing on the new one.
     It is a small thing and it is most of the difference between a control that
     feels built and one that feels assembled — the eye tracks the travel and
     the change reads as a single event instead of two. */
  const wrap = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<{ left: number; width: number } | null>(null)
  const [ready, setReady] = useState(false)

  useLayoutEffect(() => {
    const el = wrap.current?.querySelector<HTMLElement>(`[data-seg="${CSS.escape(String(value))}"]`)
    if (!el || !wrap.current) return
    setBox({ left: el.offsetLeft, width: el.offsetWidth })
    // Skip the transition on the first paint, or the indicator slides in from
    // the left edge every time the component mounts.
    const t = requestAnimationFrame(() => setReady(true))
    return () => cancelAnimationFrame(t)
  }, [value, options, size, block])

  return (
    <div ref={wrap}
      className={cx('relative inline-flex items-center gap-0.5 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] p-0.5',
        block && 'flex w-full', className)}
      role="tablist">
      {box && (
        <span aria-hidden
          className="absolute rounded-[var(--r-sm)] bg-[var(--surface-1)] shadow-[var(--sh-1)]"
          style={{
            left: box.left, width: box.width, top: 2, bottom: 2,
            transition: ready ? 'left 260ms var(--ease-out), width 260ms var(--ease-out)' : undefined,
          }} />
      )}
      {options.map((o) => {
        const on = o.id === value
        return (
          <button key={o.id} data-seg={o.id} role="tab" aria-selected={on} disabled={o.disabled} title={o.hint}
            onClick={() => onChange(o.id)}
            className={cx(
              'relative z-[1] inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--r-sm)] font-medium transition-colors duration-fast ease-std disabled:opacity-40',
              size === 'sm' ? 'h-[24px] px-2.5 text-[11.5px]' : 'h-[28px] px-3 text-[12.5px]',
              on ? 'text-[var(--ink-1)]' : 'text-[var(--ink-4)] hover:text-[var(--ink-2)]',
            )}>
            {o.icon}{o.label}
          </button>
        )
      })}
    </div>
  )
}

/** Underlined tabs — for switching the CONTENT of a screen (Segmented switches
 *  a setting). Keeping the two visually distinct is the whole point. */
export function Tabs<T extends string>({ value, onChange, options, className }: {
  value: T; onChange: (v: T) => void; className?: string
  options: { id: T; label: React.ReactNode; count?: number; icon?: React.ReactNode }[]
}) {
  return (
    <div className={cx('flex items-center gap-1 border-b border-[var(--line)]', className)} role="tablist">
      {options.map((o) => {
        const on = o.id === value
        return (
          <button key={o.id} role="tab" aria-selected={on} onClick={() => onChange(o.id)}
            className={cx('relative -mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-[12.5px] font-medium transition-colors duration-fast',
              on ? 'border-[var(--brand)] text-[var(--ink-1)]' : 'border-transparent text-[var(--ink-4)] hover:text-[var(--ink-2)]')}>
            {o.icon}{o.label}
            {o.count != null && (
              <span className="rounded-[var(--r-full)] bg-[var(--surface-3)] px-1.5 text-[10.5px] font-semibold text-[var(--ink-3)]">{o.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function Slider({ value, onChange, min, max, step = 1, label, format, marks }: {
  value: number; onChange: (v: number) => void; min: number; max: number; step?: number
  label?: React.ReactNode; format?: (v: number) => string; marks?: number[]
}) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div>
      {label && (
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <span className="text-[12px] font-medium text-[var(--ink-2)]">{label}</span>
          <span className="text-[12px] font-semibold tabular-nums text-[var(--ink-1)]">{format ? format(value) : value}</span>
        </div>
      )}
      <div className="relative flex h-4 items-center">
        <div className="absolute inset-x-0 h-[3px] rounded-full bg-[var(--surface-3)]" />
        <div className="absolute h-[3px] rounded-full bg-[var(--ink-3)]" style={{ width: `${pct}%` }} />
        {marks?.map((m) => (
          <span key={m} className="absolute h-[7px] w-px bg-[var(--line-strong)]" style={{ left: `${((m - min) / (max - min)) * 100}%` }} />
        ))}
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-x-0 h-4 w-full cursor-pointer appearance-none bg-transparent
            [&::-webkit-slider-thumb]:h-[14px] [&::-webkit-slider-thumb]:w-[14px] [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[var(--ink-2)]
            [&::-webkit-slider-thumb]:bg-[var(--surface-1)] [&::-webkit-slider-thumb]:shadow-[var(--sh-2)]" />
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Table — dense, scannable, sortable
   ═══════════════════════════════════════════════════════════════════════════ */

export function Table({ className, children, ...rest }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cx('w-full border-collapse text-[12.5px]', className)} {...rest}>{children}</table>
    </div>
  )
}

export function Th({ align = 'left', sortable, sorted, onSort, className, children, ...rest }:
  React.ThHTMLAttributes<HTMLTableCellElement> & { align?: 'left' | 'right' | 'center'; sortable?: boolean; sorted?: 'asc' | 'desc' | false; onSort?: () => void }) {
  return (
    <th className={cx(
      'sticky top-0 z-[1] border-b border-[var(--line)] bg-[var(--surface-2)] px-3 py-[9px] text-[10px] font-semibold uppercase tracking-[.075em] text-[var(--ink-4)] backdrop-blur-[2px]',
      align === 'right' && 'text-right', align === 'center' && 'text-center',
      sortable && 'cursor-pointer select-none hover:text-[var(--ink-2)]', className,
    )} onClick={sortable ? onSort : undefined} {...rest}>
      <span className={cx('inline-flex items-center gap-1', align === 'right' && 'flex-row-reverse')}>
        {children}
        {sortable && (
          <svg width="9" height="9" viewBox="0 0 12 12" className={cx('transition-opacity', sorted ? 'opacity-100 text-[var(--brand)]' : 'opacity-25')} aria-hidden>
            <path d={sorted === 'asc' ? 'M6 3 9.5 8h-7z' : 'M6 9 2.5 4h7z'} fill="currentColor" />
          </svg>
        )}
      </span>
    </th>
  )
}

export function Td({ align = 'left', mono, strong, className, children, ...rest }:
  React.TdHTMLAttributes<HTMLTableCellElement> & { align?: 'left' | 'right' | 'center'; mono?: boolean; strong?: boolean }) {
  return (
    <td className={cx('border-b border-[var(--line-soft)] px-3 py-[9px] text-[var(--ink-2)]',
      align === 'right' && 'whitespace-nowrap text-right tabular-nums', align === 'center' && 'text-center',
      mono && 't-mono', strong && 'font-semibold text-[var(--ink-1)]', className)} {...rest}>{children}</td>
  )
}

export const Tr = ({ className, interactive, selected, children, ...rest }:
  React.HTMLAttributes<HTMLTableRowElement> & { interactive?: boolean; selected?: boolean }) => (
  <tr className={cx(
    'transition-colors duration-fast',
    interactive && 'cursor-pointer hover:bg-[var(--surface-2)]',
    // The edge, not just the wash: in a long table the wash alone is easy to
    // lose and the accent survives a scroll past the row.
    selected && 'relative bg-[var(--brand-tint)] [&>td:first-child]:relative [&>td:first-child]:before:absolute [&>td:first-child]:before:inset-y-0 [&>td:first-child]:before:left-0 [&>td:first-child]:before:w-[2px] [&>td:first-child]:before:bg-[var(--brand)] [&>td:first-child]:before:content-[""]',
    className,
  )} {...rest}>{children}</tr>
)

/* ═══════════════════════════════════════════════════════════════════════════
   Overlays
   ═══════════════════════════════════════════════════════════════════════════ */

function useEscape(active: boolean, fn: () => void) {
  useEffect(() => {
    if (!active) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); fn() } }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [active, fn])
}

/** Body scroll-lock while any overlay is open. Refcounted, so two stacked
 *  overlays do not un-lock the page when only the top one closes. */
let lockCount = 0
function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    if (lockCount++ === 0) document.body.style.overflow = 'hidden'
    return () => { if (--lockCount === 0) document.body.style.overflow = '' }
  }, [active])
}

export function Dialog({ open, onClose, title, sub, children, footer, width = 520, className }: {
  open: boolean; onClose: () => void; title?: React.ReactNode; sub?: React.ReactNode
  children?: React.ReactNode; footer?: React.ReactNode; width?: number; className?: string
}) {
  useEscape(open, onClose); useScrollLock(open)
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto p-6 pt-[10vh]">
      <div className="anim-fade fixed inset-0 bg-[rgba(22,21,15,.42)] backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" style={{ width }}
        className={cx('anim-scale relative max-w-full rounded-[var(--r-xl)] border border-[var(--line)] bg-[var(--surface-1)] shadow-[var(--sh-4)]', className)}>
        {(title || sub) && (
          <header className="border-b border-[var(--line-soft)] px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                {title && <h2 className="t-title text-[15.5px]">{title}</h2>}
                {sub && <p className="t-sub mt-1 leading-relaxed">{sub}</p>}
              </div>
              <IconButton label="Close" onClick={onClose} className="-mr-1 -mt-1">
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
              </IconButton>
            </div>
          </header>
        )}
        <div className="max-h-[62vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex items-center justify-end gap-2 border-t border-[var(--line-soft)] bg-[var(--surface-2)] px-5 py-3">{footer}</footer>}
      </div>
    </div>, document.body)
}

export function Drawer({ open, onClose, title, sub, children, footer, width = 460, side = 'right' }: {
  open: boolean; onClose: () => void; title?: React.ReactNode; sub?: React.ReactNode
  children?: React.ReactNode; footer?: React.ReactNode; width?: number; side?: 'right' | 'left'
}) {
  useEscape(open, onClose); useScrollLock(open)
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[80]">
      <div className="anim-fade absolute inset-0 bg-[rgba(22,21,15,.34)]" onClick={onClose} />
      <aside style={{ width }} role="dialog" aria-modal="true"
        className={cx('absolute inset-y-0 flex max-w-full flex-col border-[var(--line)] bg-[var(--surface-1)] shadow-[var(--sh-4)]',
          side === 'right' ? 'right-0 border-l' : 'left-0 border-r')}
        // A drawer that slides in from the wrong side reads as a different
        // component, so the animation is chosen by the side it docks to.
        data-side={side}>
        <div className="absolute inset-0 flex flex-col" style={{ animation: `aire-slide-r var(--t-slow) var(--ease-out) both`, transformOrigin: side }}>
          <header className="flex items-start justify-between gap-4 border-b border-[var(--line-soft)] px-4 py-3.5">
            <div className="min-w-0">
              {title && <h2 className="t-title">{title}</h2>}
              {sub && <p className="t-cap mt-0.5">{sub}</p>}
            </div>
            <IconButton label="Close" onClick={onClose} className="-mr-1">
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            </IconButton>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
          {footer && <footer className="border-t border-[var(--line-soft)] bg-[var(--surface-2)] px-4 py-3">{footer}</footer>}
        </div>
      </aside>
    </div>, document.body)
}

export function Tooltip({ content, children, side = 'top' }: {
  content: React.ReactNode; children: React.ReactElement; side?: 'top' | 'bottom' | 'left' | 'right'
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const ref = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    if (!open || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    const off = 8
    setPos({
      top:    { x: r.left + r.width / 2, y: r.top - off },
      bottom: { x: r.left + r.width / 2, y: r.bottom + off },
      left:   { x: r.left - off, y: r.top + r.height / 2 },
      right:  { x: r.right + off, y: r.top + r.height / 2 },
    }[side])
  }, [open, side])
  const tx = side === 'top' || side === 'bottom' ? '-50%' : side === 'left' ? '-100%' : '0'
  const ty = side === 'left' || side === 'right' ? '-50%' : side === 'top' ? '-100%' : '0'
  return (
    <>
      <span ref={ref} className="inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}>
        {children}
      </span>
      {open && content != null && createPortal(
        <span role="tooltip" className="anim-fade pointer-events-none fixed z-[95] max-w-[248px] rounded-[var(--r-sm)] px-2 py-1.5 text-[11.5px] leading-snug shadow-[var(--sh-3)]"
          style={{ left: pos.x, top: pos.y, transform: `translate(${tx},${ty})`, background: 'var(--surface-inv)', color: 'var(--canvas)' }}>
          {content}
        </span>, document.body)}
    </>
  )
}

/** Anchored popover. Closes on outside click and Escape — the two things a
 *  hand-rolled dropdown always forgets. */
export function Popover({ trigger, children, align = 'end', width = 240 }: {
  trigger: (p: { open: boolean; toggle: () => void }) => React.ReactNode
  children: (p: { close: () => void }) => React.ReactNode
  align?: 'start' | 'end'; width?: number
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEscape(open, () => setOpen(false))
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    // Deferred so the click that opened it does not immediately close it.
    const t = setTimeout(() => document.addEventListener('mousedown', h), 0)
    return () => { clearTimeout(t); document.removeEventListener('mousedown', h) }
  }, [open])
  return (
    <div ref={box} className="relative">
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open && (
        <div style={{ width }}
          className={cx('anim-scale absolute top-[calc(100%+6px)] z-[70] overflow-hidden rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-1)] p-1 shadow-[var(--sh-3)]',
            align === 'end' ? 'right-0' : 'left-0')}>
          {children({ close: () => setOpen(false) })}
        </div>
      )}
    </div>
  )
}

export function MenuItem({ icon, danger, sub, className, children, ...rest }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: React.ReactNode; danger?: boolean; sub?: React.ReactNode }) {
  return (
    <button className={cx('flex w-full items-center gap-2.5 rounded-[var(--r-sm)] px-2.5 py-[7px] text-left text-[12.5px] transition-colors duration-fast',
      danger ? 'text-[var(--neg-ink)] hover:bg-[var(--neg-tint)]' : 'text-[var(--ink-2)] hover:bg-[var(--surface-2)] hover:text-[var(--ink-1)]', className)} {...rest}>
      {icon && <span className="shrink-0 text-[var(--ink-4)]">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{children}</span>
        {sub && <span className="block truncate text-[11px] text-[var(--ink-4)]">{sub}</span>}
      </span>
    </button>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Toasts
   ═══════════════════════════════════════════════════════════════════════════ */

type Toast = { id: number; tone: Tone; title: string; body?: string; action?: { label: string; run: () => void } }
const ToastCtx = createContext<(t: Omit<Toast, 'id'>) => void>(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastHost({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random()
    setItems((x) => [...x, { ...t, id }])
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 5200)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2">
          {items.map((t) => {
            const tn = TONE[t.tone]
            return (
              <div key={t.id} className="anim-slide pointer-events-auto flex items-start gap-2.5 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-1)] p-3 shadow-[var(--sh-3)]">
                <span className="mt-[5px] h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: tn.solid }} />
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-semibold text-[var(--ink-1)]">{t.title}</div>
                  {t.body && <div className="mt-0.5 text-[11.5px] leading-relaxed text-[var(--ink-3)]">{t.body}</div>}
                </div>
                {t.action && <Button size="xs" variant="quiet" onClick={t.action.run}>{t.action.label}</Button>}
                <button onClick={() => setItems((x) => x.filter((i) => i.id !== t.id))} className="shrink-0 text-[var(--ink-5)] hover:text-[var(--ink-2)]" aria-label="Dismiss">
                  <svg width="12" height="12" viewBox="0 0 14 14"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                </button>
              </div>
            )
          })}
        </div>, document.body)}
    </ToastCtx.Provider>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   States
   ═══════════════════════════════════════════════════════════════════════════ */

export function EmptyState({ icon, art, title, body, action, compact }: {
  icon?: React.ReactNode
  /** Crafted art beats a greyed-out icon in a circle. `icon` still works for
   *  the tight cases where there is no room for a scene. */
  art?: ArtName
  title: React.ReactNode; body?: React.ReactNode; action?: React.ReactNode; compact?: boolean
}) {
  return (
    <div className={cx('flex flex-col items-center text-center', compact ? 'py-7' : 'py-14')}>
      {art
        ? <span className="mb-4"><EmptyArt name={art} size={compact ? 96 : 124} /></span>
        : icon
          ? <span className="mb-3 grid h-11 w-11 place-items-center rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink-4)]">{icon}</span>
          : null}
      <h3 className="t-title-sm">{title}</h3>
      {body && <p className="t-sub mt-1.5 max-w-[400px]">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export const Skeleton = ({ w, h = 12, className }: { w?: number | string; h?: number; className?: string }) =>
  <div className={cx('skeleton', className)} style={{ width: w ?? '100%', height: h }} />

export function Progress({ value, tone = 'brand', height = 5, label }: { value: number; tone?: Tone; height?: number; label?: React.ReactNode }) {
  const v = Math.max(0, Math.min(100, value))
  return (
    <div>
      {label && <div className="mb-1 flex justify-between text-[11.5px] text-[var(--ink-4)]"><span>{label}</span><span className="tabular-nums">{Math.round(v)}%</span></div>}
      <div className="overflow-hidden rounded-full bg-[var(--surface-3)]" style={{ height }}>
        <div className="h-full rounded-full transition-[width] duration-slow ease-decel" style={{ width: `${v}%`, background: TONE[tone].solid }} />
      </div>
    </div>
  )
}

export function Avatar({ name, size = 26, tone = 'neutral' }: { name: string; size?: number; tone?: Tone }) {
  const initials = name.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?'
  // Deterministic tint from the name, so a person keeps the same chip colour
  // across sessions and machines without storing anything.
  const ramp = ['var(--dv-1)', 'var(--dv-2)', 'var(--dv-3)', 'var(--dv-4)', 'var(--dv-5)', 'var(--dv-6)']
  const hash = [...name].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)
  const bg = tone === 'neutral' ? ramp[hash % ramp.length] : TONE[tone].solid
  return (
    <span className="grid shrink-0 place-items-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: bg, fontSize: size * 0.38 }}>{initials}</span>
  )
}

/** A stable id for label/control pairs without pulling in a form library. */
export const useFieldId = (prefix: string) => `${prefix}-${useId()}`

/* ── formatting helpers used across every module ─────────────────────────── */
export const fmtCompact = (n: number, currency = '') => {
  const a = Math.abs(n), s = n < 0 ? '−' : ''
  const [v, u] = a >= 1e9 ? [a / 1e9, 'B'] : a >= 1e6 ? [a / 1e6, 'M'] : a >= 1e3 ? [a / 1e3, 'k'] : [a, '']
  return `${s}${currency}${v.toFixed(v >= 100 || u === '' ? 0 : 1)}${u}`
}
/** Signed, with enough precision for the sign to be meaningful. A gap of
 *  +0.004 must not print as "+0.0" next to a verdict that says "over". */
export const fmtGap = (n: number, d = 1) => {
  const dp = Math.abs(n) > 0 && Math.abs(n) < 0.05 ? Math.max(d, 2) : d
  const v = Math.abs(n).toFixed(dp)
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${v}`
}
export const fmtPct = (n: number, d = 1) => `${n >= 0 ? '' : '−'}${Math.abs(n).toFixed(d)}%`
export const fmtSigned = (n: number, d = 1) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(d)}`
export const relTime = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
