/* ───────────────────────────────────────────────────────────────────────────
   Reg AI motion presets (Framer Motion).
   ---------------------------------------------------------------------------
   Same rules as design/motion.ts: motion carries meaning, it is interruptible,
   and reduced motion is obeyed — the module root wraps everything in
   <MotionConfig reducedMotion="user">, which turns transforms off for anyone
   who has asked the OS for less motion.

   One spring for things that move because a person moved them (toggles,
   reordering), one ease for things that arrive (sections, lists).
   ─────────────────────────────────────────────────────────────────────────── */
import type { Transition, Variants } from 'framer-motion'

/** The house curve — ease-out-expo, matching --ease-out in tokens.css. */
export const EASE = [0.16, 1, 0.3, 1] as const

export const spring: Transition = { type: 'spring', stiffness: 520, damping: 38, mass: 0.7 }
export const softSpring: Transition = { type: 'spring', stiffness: 260, damping: 30 }

/** A container that reveals its children in sequence. */
export const stagger = (gap = 0.045, delay = 0.02): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: gap, delayChildren: delay } },
})

/** Arrive: lift and fade. */
export const rise: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.42, ease: EASE } },
}

/** Tab content swap: a short crossfade with a hint of travel. */
export const page: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.32, ease: EASE } },
  exit: { opacity: 0, y: -4, transition: { duration: 0.16, ease: EASE } },
}

/** A list row that may be filtered in or out. */
export const row: Variants = {
  hidden: { opacity: 0, y: 6, scale: 0.995 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.3, ease: EASE } },
  exit: { opacity: 0, scale: 0.98, transition: { duration: 0.14 } },
}
