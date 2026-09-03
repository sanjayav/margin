/**
 * @vitest-environment jsdom
 *
 * Signing out must revoke the SERVER session, not just the local one.
 *
 * The session cookie is HttpOnly by design, so the browser cannot clear it —
 * only a request to the server can. Meanwhile SignIn restores from that cookie
 * on mount, deliberately, so someone with a live session is not asked for a
 * password again. Those two facts combine badly: a sign-out that only clears
 * client state looks like it worked and is undone by the next page load, which
 * on a shared machine hands the session to whoever reloads next.
 *
 * This shipped that way — the v2 store cleared state and never called DELETE,
 * while the legacy store it replaced had always done both.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useApp } from '../appStore'

const SESSION = { email: 'sanjay.v@marklytics.co.uk', name: 'Sanjay V', workspace: 'marklytics', role: 'analyst' as const }

describe('signOut', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) }))
    vi.stubGlobal('fetch', fetchMock)
    useApp.setState({ session: SESSION, onboarded: true })
  })

  afterEach(() => { vi.unstubAllGlobals() })

  it('asks the server to clear the cookie', () => {
    useApp.getState().signOut()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/session')
    expect(init.method).toBe('DELETE')
    // Without this the cookie is not sent, so the server has nothing to revoke.
    expect(init.credentials).toBe('same-origin')
  })

  it('clears the local session', () => {
    useApp.getState().signOut()

    const st = useApp.getState()
    expect(st.session).toBeNull()
    expect(st.onboarded).toBe(false)
  })

  it('drops the run history, which is another user’s data on a shared machine', () => {
    useApp.setState({ runs: [{ id: 'r1' } as never], activeRunId: 'r1' })
    useApp.getState().signOut()

    expect(useApp.getState().runs).toEqual([])
    expect(useApp.getState().activeRunId).toBeNull()
  })

  it('still signs out locally when the request fails', async () => {
    // A failed revoke leaves the cookie alive, but trapping someone in a
    // signed-in UI is the worse of the two failures.
    fetchMock.mockImplementation(() => Promise.reject(new Error('offline')))

    expect(() => useApp.getState().signOut()).not.toThrow()
    expect(useApp.getState().session).toBeNull()

    // The rejection is handled, not left to surface as an unhandled rejection.
    await new Promise((r) => setTimeout(r, 0))
  })
})
