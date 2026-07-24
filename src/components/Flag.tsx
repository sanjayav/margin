// Real country flags (flag-icons SVG) — replaces the text code chips for a more
// premium, recognizable asset. Square variant, rounded, with a hairline ring.
import type { CountryId } from '../engine/types'

const ISO: Record<CountryId, string> = { EU: 'eu', UK: 'gb', IN: 'in', AU: 'au', CN: 'cn' }

export default function Flag({ id, className = '', rounded = 'rounded-lg' }: { id: CountryId; className?: string; rounded?: string }) {
  return (
    <span
      className={`fi fi-${ISO[id]} fis inline-block bg-cover bg-center shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)] ${rounded} ${className}`}
      role="img"
      aria-label={id}
    />
  )
}
