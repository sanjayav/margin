import type { ReactNode } from 'react'
import type { Aggregate } from '../engine/types'

export function StatusPill({ status, big }: { status: Aggregate['status']; big?: boolean }) {
  const map = {
    compliant: { t: 'Under the line', c: 'text-safe', bg: 'bg-safe/10 border-safe/30', dot: 'bg-safe' },
    fine: { t: 'Fine due', c: 'text-danger', bg: 'bg-danger/10 border-danger/30', dot: 'bg-danger' },
    exempt: { t: 'Exempt (small volume)', c: 'text-warn', bg: 'bg-warn/10 border-warn/30', dot: 'bg-warn' },
    'no-sales': { t: 'No sales', c: 'text-ink-500', bg: 'bg-black/5 border-black/10', dot: 'bg-ink-500' },
  }[status]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 ${big ? 'py-1.5 text-sm' : 'py-1 text-xs'} font-semibold ${map.bg} ${map.c}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${map.dot} ${status === 'fine' ? 'animate-pulse' : ''}`} />
      {map.t}
    </span>
  )
}

export function Stat({ label, value, sub, accent, className = '' }: { label: string; value: ReactNode; sub?: ReactNode; accent?: string; className?: string }) {
  return (
    <div className={`card p-4 ${className}`}>
      <div className="label">{label}</div>
      <div className={`dnum mt-2 text-[27px] font-bold leading-none ${accent ?? 'text-ink-100'}`}>{value}</div>
      {sub && <div className="mt-2 text-[11px] text-ink-500">{sub}</div>}
    </div>
  )
}

export function Section({ title, right, children, className = '' }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`card p-5 ${className}`}>
      {(title || right) && (
        <div className="mb-4 flex items-center justify-between">
          {title && <h3 className="font-display text-[15.5px] font-bold tracking-tight text-ink-100">{title}</h3>}
          {right}
        </div>
      )}
      {children}
    </div>
  )
}

export function difficultyColor(d: string) {
  return d === 'Easy' ? 'text-safe bg-safe/10 border-safe/30' : d === 'Medium' ? 'text-warn bg-warn/10 border-warn/30' : 'text-danger bg-danger/10 border-danger/30'
}

export function Bar({ value, max, color = 'bg-brand' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-black/5">
      <div className={`h-full rounded-full ${color} transition-all duration-300`} style={{ width: `${pct}%` }} />
    </div>
  )
}
