// Real country flags. Imported as five individual SVG modules rather than via
// flag-icons' stylesheet — that pulls in 142 flags (~6 MB) and a 27 KB CSS file
// to render the five markets the platform actually sells. Vite inlines or
// fingerprints each import, so the bundle carries exactly what is on screen.
import type { CountryId } from '../engine/types'
import eu from 'flag-icons/flags/1x1/eu.svg'
import gb from 'flag-icons/flags/1x1/gb.svg'
import inFlag from 'flag-icons/flags/1x1/in.svg'
import au from 'flag-icons/flags/1x1/au.svg'
import cn from 'flag-icons/flags/1x1/cn.svg'

const SRC: Record<CountryId, string> = { EU: eu, UK: gb, IN: inFlag, AU: au, CN: cn }
const NAME: Record<CountryId, string> = {
  EU: 'European Union', UK: 'United Kingdom', IN: 'India', AU: 'Australia', CN: 'China',
}

export default function Flag({ id, className = '', rounded = 'rounded-lg' }: { id: CountryId; className?: string; rounded?: string }) {
  return (
    <span
      className={`inline-block bg-cover bg-center shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)] ${rounded} ${className}`}
      style={{ backgroundImage: `url(${SRC[id]})` }}
      role="img"
      aria-label={NAME[id]}
    />
  )
}
