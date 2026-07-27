import type { ReactNode } from 'react'
import type { Aggregate } from '../engine/types'
import type { FleetMeta } from '../data/fleet'

/** The basis declaration every computed screen carries: fact vs hypothesis.
 *  Actuals cite their dataset vintage (the FP&A/EEA convention — a verdict is
 *  only meaningful against a named dataset version). */
export function BasisChip({ basis, meta, scenarioName }: { basis: 'actuals' | 'live'; meta?: FleetMeta; scenarioName?: string }) {
  if (basis === 'actuals') {
    const vintage = meta ? `${meta.live ? 'live' : 'extract'} · v${String(meta.datasetVersion).slice(-6)}` : 'as sold'
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-safe/30 bg-safe/[0.08] px-2.5 py-1 text-[10.5px] font-bold text-safe"
        title={meta ? `${meta.source}${meta.lastRefreshed ? ` · refreshed ${new Date(meta.lastRefreshed).toLocaleDateString()}` : ''}` : undefined}>
        <span className="h-1.5 w-1.5 rounded-full bg-safe" /> Basis: Actuals <span className="font-semibold opacity-70">{vintage}</span>
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/[0.08] px-2.5 py-1 text-[10.5px] font-bold text-brand"
      title="Computed under the working assumptions — not the book of record">
      <span className="h-1.5 w-1.5 rounded-full bg-brand" /> Basis: Scenario{scenarioName ? <span className="font-semibold opacity-80">· {scenarioName}</span> : null}
    </span>
  )
}

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
  // status stats get a colored accent rail; plain metrics a warm-neutral one.
  const toned = !!accent && accent !== 'text-ink-100'
  const hex = accent === 'text-safe' ? '#0E9F6E' : accent === 'text-danger' ? '#E0484D' : accent === 'text-warn' ? '#D98005'
    : accent === 'text-accentblue' ? '#3B6FE0' : accent === 'text-brand' ? '#E8223B' : '#C9BCA3'
  return (
    <div className={`card group relative overflow-hidden p-5 ${className}`}>
      <span aria-hidden className="absolute inset-x-0 top-0 h-[2px]" style={{ background: `linear-gradient(90deg, ${hex}, ${hex}00 82%)`, opacity: toned ? 0.8 : 0.5 }} />
      {toned && <div aria-hidden className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100" style={{ background: `${hex}22` }} />}
      <div className="label relative">{label}</div>
      <div className={`dnum relative mt-2.5 text-[26px] font-bold leading-none tracking-[-0.02em] ${accent ?? 'text-ink-100'}`}>{value}</div>
      {sub && <div className="relative mt-2.5 text-[10.5px] leading-snug text-ink-500">{sub}</div>}
    </div>
  )
}

export function Section({ title, right, children, className = '' }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`card p-6 ${className}`}>
      {(title || right) && (
        <div className="mb-5 flex items-center justify-between gap-3">
          {title && <h3 className="font-display text-[16px] font-bold tracking-[-0.02em] text-ink-100">{title}</h3>}
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
