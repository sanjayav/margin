// Company identity chip for HTML surfaces (tables, selects, planners): the
// brand logo on a neutral disc, falling back to the deterministic monogram —
// same resolution rules as the chart bubbles (lib/brands).
import { useState } from 'react'
import { brandLogoUrl, brandInitials, brandColor } from '../lib/brands'

export default function BrandChip({ name, size = 22, className = '' }: { name: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false)
  const url = brandLogoUrl(name)
  const showLogo = !!url && !failed
  return (
    <span style={{ width: size, height: size }} title={name}
      className={`inline-grid shrink-0 place-items-center overflow-hidden rounded-full border border-black/10 bg-white shadow-[0_1px_2px_rgba(60,45,20,0.10)] ${className}`}>
      {showLogo ? (
        <img src={url} width={Math.round(size * 0.72)} height={Math.round(size * 0.72)} style={{ objectFit: 'contain' }}
          alt="" draggable={false} onError={() => setFailed(true)} />
      ) : (
        <span style={{ background: brandColor(name) }} className="grid h-full w-full place-items-center text-[8.5px] font-black leading-none text-white">
          {brandInitials(name)}
        </span>
      )}
    </span>
  )
}
