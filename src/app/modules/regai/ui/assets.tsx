/* ───────────────────────────────────────────────────────────────────────────
   Reg AI — premium assets.
   ---------------------------------------------------------------------------
   Flags are real, accurate SVG flags (country-flag-icons), not emoji: emoji
   flags render as two letters on Windows and differently on every platform,
   which is exactly the wrong signal on a screen about jurisdictions.

   Category tiles and the hero ground are built from the design tokens, so they
   follow light and dark theme with no extra work.
   ─────────────────────────────────────────────────────────────────────────── */
import React from 'react'
import { AU, CN, EU, GB, IN, type FlagComponent } from 'country-flag-icons/react/3x2'
import Icon from '../../../design/icons'
import { cx } from '../../../design/primitives'
import type { CountryId } from '../../../../engine/types'
import { CATEGORY_META, type RegCategory } from '../regulations'

const FLAGS: Record<string, FlagComponent> = {
  EU, UK: GB, IN, CN, AU,
}

export function Flag({ market, size = 18, className }: { market: CountryId; size?: number; className?: string }) {
  const F = FLAGS[market]
  if (!F) return null
  return (
    <span className={cx('inline-block shrink-0 overflow-hidden rounded-[3px] shadow-[0_0_0_.5px_var(--line-strong),var(--sh-1)]', className)}
      style={{ width: size, height: Math.round(size * 2 / 3) }}>
      <F title={market} style={{ display: 'block', width: '100%', height: '100%' }} />
    </span>
  )
}

/** One accent per category, from the validated categorical palette, in a fixed
 *  order so a category is the same colour on every screen. */
export const CATEGORY_COLOR: Record<RegCategory, string> = {
  vehicle: 'var(--dv-1)', border: 'var(--dv-2)', trading: 'var(--dv-3)', product: 'var(--dv-4)', industry: 'var(--dv-5)',
}

export function CategoryTile({ category, size = 30 }: { category: RegCategory; size?: number }) {
  const c = CATEGORY_COLOR[category]
  return (
    <span className="relative grid shrink-0 place-items-center rounded-[var(--r-sm)]"
      style={{
        width: size, height: size, color: c,
        background: `linear-gradient(160deg, color-mix(in srgb, ${c} 16%, var(--surface-1)), color-mix(in srgb, ${c} 6%, var(--surface-1)))`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${c} 22%, transparent), var(--sh-lit)`,
      }}>
      <Icon name={CATEGORY_META[category].icon} size={Math.round(size * 0.5)} />
    </span>
  )
}

export function CategoryChip({ category }: { category: RegCategory }) {
  const c = CATEGORY_COLOR[category]
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-[var(--r-full)] px-2 py-[3px] text-[10.5px] font-semibold"
      style={{ color: c, background: `color-mix(in srgb, ${c} 9%, var(--surface-1))`, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${c} 20%, transparent)` }}>
      <span className="h-[5px] w-[5px] rounded-full" style={{ background: c }} />
      {CATEGORY_META[category].short}
    </span>
  )
}

/** The hero ground: a fine dot lattice fading out, under a soft brand bloom.
 *  Pure CSS from tokens — no image request, themes for free. */
export function HeroGround() {
  return (
    <>
      <span aria-hidden className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: 'radial-gradient(var(--line-strong) 1px, transparent 1px)',
          backgroundSize: '18px 18px',
          maskImage: 'radial-gradient(ellipse 70% 90% at 78% 40%, #000 20%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse 70% 90% at 78% 40%, #000 20%, transparent 75%)',
          opacity: 0.55,
        }} />
      <span aria-hidden className="pointer-events-none absolute -right-24 -top-32 h-[420px] w-[420px] rounded-full"
        style={{ background: 'radial-gradient(closest-side, color-mix(in srgb, var(--brand) 10%, transparent), transparent)' }} />
      <span aria-hidden className="pointer-events-none absolute -bottom-40 left-1/3 h-[360px] w-[360px] rounded-full"
        style={{ background: 'radial-gradient(closest-side, color-mix(in srgb, var(--dv-1) 7%, transparent), transparent)' }} />
    </>
  )
}
