import { useEffect, useRef, useState } from 'react'

/** Smoothly animates a number toward `value` (ease-out cubic) on every change. */
export function useCountUp(value: number, ms = 500): number {
  const [display, setDisplay] = useState(value)
  const fromRef = useRef(value)

  useEffect(() => {
    const a = fromRef.current
    const b = value
    if (a === b || !Number.isFinite(b)) { setDisplay(b); fromRef.current = b; return }
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms)
      const e = 1 - Math.pow(1 - p, 3)
      setDisplay(a + (b - a) * e)
      if (p < 1) raf = requestAnimationFrame(tick)
      else fromRef.current = b
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, ms])

  return display
}
