// Render children only once they are near the viewport.
//
// Some panels are cheap to look at and expensive to build. The Forecast tornado
// runs buildForecast eight times across every year — roughly 48 full-year engine
// passes — for a chart that sits well below the fold. Paying for that during the
// screen's first paint is what made Forecast feel slow to open.
//
// The gate is one-way: once shown, it stays mounted, so scrolling back and forth
// never recomputes. `minHeight` reserves the space so nothing jumps when it
// arrives, and where IntersectionObserver is unavailable it renders immediately
// rather than hiding content.
import { useEffect, useRef, useState, type ReactNode } from 'react'

export default function WhenVisible({ children, minHeight = 220, rootMargin = '300px', placeholder }: {
  children: ReactNode
  minHeight?: number
  rootMargin?: string
  placeholder?: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (shown) return
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') { setShown(true); return }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setShown(true); io.disconnect() }
    }, { rootMargin })
    io.observe(el)
    return () => io.disconnect()
  }, [shown, rootMargin])

  return (
    <div ref={ref} style={shown ? undefined : { minHeight }}>
      {shown ? children : (placeholder ?? (
        <div className="flex h-full items-center justify-center rounded-2xl border border-black/[0.05] bg-black/[0.015]" style={{ minHeight }}>
          <span className="text-[11.5px] text-ink-500">Preparing…</span>
        </div>
      ))}
    </div>
  )
}
