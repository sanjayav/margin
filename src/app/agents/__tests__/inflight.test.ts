/**
 * @vitest-environment jsdom
 *
 * Stopping live runs.
 *
 * A run is a streaming request that bills for as long as it lasts. The client
 * built an AbortController, handed its signal to fetch, and then dropped it —
 * so nothing could ever call abort(). A run could not be stopped by anything:
 * not a stop control, not a sign-out, not closing the tab. It ran to completion
 * and charged for it.
 *
 * The properties worth pinning are the ones whose failure is silent — a run
 * that quietly keeps going costs money without erroring.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { register, release, stopRun, stopAllRuns, isInflight, inflightCount } from '../inflight'

beforeEach(() => { stopAllRuns() })

describe('the in-flight registry', () => {
  it('aborts the controller for one run', () => {
    const ctl = new AbortController()
    register('r1', ctl)
    expect(isInflight('r1')).toBe(true)

    stopRun('r1')

    expect(ctl.signal.aborted).toBe(true)
    expect(isInflight('r1')).toBe(false)
  })

  it('leaves other runs alone when stopping one', () => {
    const a = new AbortController(); const b = new AbortController()
    register('a', a); register('b', b)

    stopRun('a')

    expect(a.signal.aborted).toBe(true)
    expect(b.signal.aborted).toBe(false)
    expect(inflightCount()).toBe(1)
  })

  it('stops every run at once, which is what sign-out needs', () => {
    const ctls = ['a', 'b', 'c'].map((id) => {
      const c = new AbortController()
      register(id, c)
      return c
    })

    stopAllRuns()

    expect(ctls.every((c) => c.signal.aborted)).toBe(true)
    expect(inflightCount()).toBe(0)
  })

  it('survives release() being called from inside abort()', () => {
    // The real client releases in a `finally`, which abort() triggers
    // synchronously — so stopAllRuns is iterating a map that is being mutated
    // underneath it. Iterating the live map directly would skip runs, leaving
    // some still streaming after sign-out.
    const ctls = ['a', 'b', 'c'].map((id) => {
      const c = new AbortController()
      c.signal.addEventListener('abort', () => release(id))
      register(id, c)
      return c
    })

    stopAllRuns()

    expect(ctls.every((c) => c.signal.aborted)).toBe(true)
    expect(inflightCount()).toBe(0)
  })

  it('is a no-op for a run that already finished', () => {
    const ctl = new AbortController()
    register('r1', ctl)
    release('r1')

    expect(() => stopRun('r1')).not.toThrow()
    // A finished run must not be marked aborted after the fact — that would
    // rewrite a completed run's outcome as a stop.
    expect(ctl.signal.aborted).toBe(false)
  })

  it('is a no-op when nothing is running', () => {
    expect(() => stopAllRuns()).not.toThrow()
    expect(inflightCount()).toBe(0)
  })

  it('replaces the controller when a run id is reused', () => {
    const first = new AbortController(); const second = new AbortController()
    register('r1', first)
    register('r1', second)

    stopRun('r1')

    expect(second.signal.aborted).toBe(true)
    expect(inflightCount()).toBe(0)
  })
})

describe('signing out stops agents', () => {
  it('aborts runs before the session is cleared', async () => {
    const { useApp } = await import('../../state/appStore')
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })))

    const ctl = new AbortController()
    register('live-run', ctl)
    useApp.setState({ session: { email: 'a@b.c', name: 'A', workspace: 'w', role: 'analyst' } })

    useApp.getState().signOut()

    expect(ctl.signal.aborted).toBe(true)
    expect(inflightCount()).toBe(0)
    expect(useApp.getState().session).toBeNull()
    vi.unstubAllGlobals()
  })
})
