// The shared AI guard: every model-calling route opens with it, so these are
// the checks that stand between a deployed URL and the Anthropic bill.
import { describe, it, expect, beforeEach } from 'vitest'
import { hashPassword, issue } from '../_auth.js'
import { _reset } from '../_ratelimit.js'
import { _resetGuard, guardAi, readJson, sameOrigin, clip, DAILY_LIMIT } from '../_guard.js'

const USER = { email: 'a@oem.com', name: 'A', workspace: 'ws-guard', passwordHash: hashPassword('x') }

function fakeRes() {
  const out: { code?: number; body?: any; headers: Record<string, string> } = { headers: {} }
  return {
    out,
    status(c: number) { out.code = c; return this },
    json(b: any) { out.body = b; return this },
    setHeader(k: string, v: string) { out.headers[k] = v },
  }
}
const req = (over: Record<string, any> = {}, headers: Record<string, string> = {}) => ({
  method: 'POST', body: { ok: true },
  headers: { host: 'app.example.com', cookie: `ul_session=${issue(USER)}`, ...headers },
  ...over,
})

beforeEach(() => { _reset(); _resetGuard() })

describe('guardAi', () => {
  it('passes a signed-in same-origin POST and hands back the parsed body', async () => {
    const g = await guardAi(req({}, { origin: 'https://app.example.com' }), fakeRes(), 'copilot')
    expect(g?.session.workspace).toBe('ws-guard')
    expect(g?.body).toEqual({ ok: true })
  })

  it('405s anything but POST', async () => {
    const res = fakeRes()
    expect(await guardAi(req({ method: 'GET' }), res, 'copilot')).toBeNull()
    expect(res.out.code).toBe(405)
  })

  it('401s without a session', async () => {
    const res = fakeRes()
    expect(await guardAi(req({}, { cookie: '' }), res, 'copilot')).toBeNull()
    expect(res.out.code).toBe(401)
  })

  it('403s a cross-site browser POST even with a valid cookie', async () => {
    const res = fakeRes()
    expect(await guardAi(req({}, { origin: 'https://evil.example' }), res, 'copilot')).toBeNull()
    expect(res.out.code).toBe(403)
  })

  it('429s one user hammering a route, with Retry-After', async () => {
    let last = fakeRes()
    for (let i = 0; i < 10; i++) { last = fakeRes(); await guardAi(req(), last, 'agents') }
    expect(last.out.code).toBe(429)
    expect(Number(last.out.headers['Retry-After'])).toBeGreaterThan(0)
  })

  it('stops a workspace at the daily ceiling', async () => {
    // Spread across users so the per-user burst does not trip first.
    let last = fakeRes()
    for (let i = 0; i <= DAILY_LIMIT; i++) {
      const u = { ...USER, email: `u${i}@oem.com` }
      last = fakeRes()
      await guardAi(req({}, { cookie: `ul_session=${issue(u)}` }), last, 'copilot')
      if (last.out.code === 429 && /daily/i.test(last.out.body.error)) break
    }
    expect(last.out.code).toBe(429)
  })
})

describe('readJson', () => {
  it('400s malformed JSON instead of throwing', () => {
    const res = fakeRes()
    expect(readJson({ body: '{not json' }, res)).toBeNull()
    expect(res.out.code).toBe(400)
  })
  it('413s an oversized body', () => {
    const res = fakeRes()
    expect(readJson({ body: JSON.stringify({ a: 'x'.repeat(2000) }) }, res, 1000)).toBeNull()
    expect(res.out.code).toBe(413)
  })
  it('rejects a non-object body', () => {
    const res = fakeRes()
    expect(readJson({ body: '[1,2]' }, res)).toBeNull()
    expect(res.out.code).toBe(400)
  })
})

describe('sameOrigin / clip', () => {
  it('allows a non-browser client with no Origin', () => {
    expect(sameOrigin({ headers: { host: 'a.com' } })).toBe(true)
  })
  it('allows a configured extra origin', () => {
    process.env.ALLOWED_ORIGINS = 'https://staging.example.com'
    expect(sameOrigin({ headers: { host: 'a.com', origin: 'https://staging.example.com' } })).toBe(true)
    delete process.env.ALLOWED_ORIGINS
  })
  it('strips control characters and caps length', () => {
    expect(clip('a\u0000b\u0007c', 10)).toBe('abc')
    expect(clip('x'.repeat(50), 5)).toBe('xxxxx')
  })
})
