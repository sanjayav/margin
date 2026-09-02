/* ───────────────────────────────────────────────────────────────────────────
   Motion — the small set of hooks every animated surface in the product uses.
   ---------------------------------------------------------------------------
   Three rules, so animation stays a signal rather than decoration:

   1. MOTION CARRIES MEANING. A number counts up because it changed. A chart
      draws itself because it was just computed. Nothing moves to be pretty.
   2. INTERRUPTIBLE. A value that changes mid-animation retargets from where it
      is, rather than snapping back and starting again — the difference between
      software that feels alive and software that feels stuttery.
   3. REDUCED MOTION IS OBEYED IN JS TOO. A CSS media query cannot stop a
      requestAnimationFrame loop, so every hook here checks the preference and
      jumps straight to the final value.
   ─────────────────────────────────────────────────────────────────────────── */
import { useCallback, useEffect, useRef, useState } from 'react'

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Ease-out-expo: fast commitment, soft landing. The house curve. */
const easeOut = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t))

/** Animate a number toward `value`. Retargets from the current position when
 *  `value` changes mid-flight, so dragging a lever produces one continuous
 *  readout rather than a series of restarts. */
export function useAnimatedNumber(value: number, duration = 600): number {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  const start = useRef(0)
  const raf = useRef(0)
  const current = useRef(value)

  useEffect(() => {
    if (prefersReducedMotion() || !isFinite(value)) { current.current = value; setShown(value); return }
    from.current = current.current
    start.current = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start.current) / duration)
      const v = from.current + (value - from.current) * easeOut(t)
      current.current = v
      setShown(v)
      if (t < 1) raf.current = requestAnimationFrame(tick)
    }
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [value, duration])

  return shown
}

/** 0 → 1 once the element has been on screen. Drives draw-in animations
 *  without paying for them on content the user never scrolled to. */
export function useInView<T extends Element>(once = true) {
  const ref = useRef<T>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (prefersReducedMotion()) { setSeen(true); return }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setSeen(true); if (once) io.disconnect() }
      else if (!once) setSeen(false)
    }, { threshold: 0.12 })
    io.observe(el)
    return () => io.disconnect()
  }, [once])
  return [ref, seen] as const
}

/** A 0 → 1 progress value that runs once when `key` changes. Charts use it to
 *  draw themselves in; changing the key (a new year, a new market) replays it,
 *  which is exactly the moment a reader should notice the chart is new. */
export function useReveal(key: unknown, duration = 700): number {
  const [p, setP] = useState(prefersReducedMotion() ? 1 : 0)
  useEffect(() => {
    if (prefersReducedMotion()) { setP(1); return }
    let raf = 0
    const t0 = performance.now()
    setP(0)
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / duration)
      setP(easeOut(t))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [key, duration])
  return p
}

/* ───────────────────────────────────────────────────────────────────────────
   Drag — pointer-based, normalised to the element's own box.
   Used by the compliance field in Scenario. Deliberately pointer events rather
   than mouse events, so it works with a trackpad, a touchscreen and a pen
   without three code paths.
   ─────────────────────────────────────────────────────────────────────────── */

export interface DragState { x: number; y: number; dragging: boolean }

export function useDragField(
  onChange: (x: number, y: number) => void,
): { ref: React.RefObject<HTMLDivElement>; dragging: boolean; handlers: React.HTMLAttributes<HTMLDivElement> } {
  const ref = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const active = useRef(false)

  const emit = useCallback((e: { clientX: number; clientY: number }) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    onChange(
      Math.min(1, Math.max(0, (e.clientX - r.left) / (r.width || 1))),
      Math.min(1, Math.max(0, (e.clientY - r.top) / (r.height || 1))),
    )
  }, [onChange])

  useEffect(() => {
    if (!dragging) return
    const move = (e: PointerEvent) => { if (active.current) { e.preventDefault(); emit(e) } }
    const up = () => { active.current = false; setDragging(false) }
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [dragging, emit])

  return {
    ref,
    dragging,
    handlers: {
      onPointerDown: (e) => {
        // Only a primary press starts a drag; a right-click or a two-finger
        // gesture should not fling the position across the field.
        if (e.button !== 0) return
        e.preventDefault()
        active.current = true
        setDragging(true)
        emit(e)
      },
    },
  }
}
