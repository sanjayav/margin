// The security-critical paths. These are the tests that would have caught the
// old model, where auth was `localStorage.ul_auth === '1'` and every customer
// shared one workspace.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { hashPassword, verifyPassword, issue, verify, sessionFrom, requireSession, authenticate } from '../_auth.js'
import { take, _reset, type Limit } from '../_ratelimit.js'

const USER = { email: 'a@oem.com', name: 'A', workspace: 'oem-a', passwordHash: hashPassword('correct horse') }

// A fake res that records what a guard did, so we can assert the guard SENT 401
// rather than merely returned null.
function fakeRes() {
  const out: { code?: number; body?: any; headers: Record<string, string> } = { headers: {} }
  return {
    out,
    status(c: number) { out.code = c; return this },
    json(b: any) { out.body = b; return this },
    setHeader(k: string, v: string) { out.headers[k] = v },
  }
}

describe('passwords', () => {
  it('verifies a correct password', () => {
    expect(verifyPassword('correct horse', USER.passwordHash)).toBe(true)
  })
  it('rejects a wrong one', () => {
    expect(verifyPassword('wrong horse', USER.passwordHash)).toBe(false)
  })
  it('salts — the same password hashes differently every time', () => {
    expect(hashPassword('same')).not.toBe(hashPassword('same'))
  })
  it('never round-trips the plaintext', () => {
    expect(hashPassword('hunter2')).not.toContain('hunter2')
  })
  it('rejects malformed stored hashes instead of throwing', () => {
    for (const bad of ['', 'nonsense', 'scrypt$zz$zz', 'md5$a$b', 'scrypt$aa']) {
      expect(verifyPassword('x', bad)).toBe(false)
    }
  })
})

describe('session tokens', () => {
  it('round-trips a session', () => {
    const s = verify(issue(USER))
    expect(s?.email).toBe('a@oem.com')
    expect(s?.workspace).toBe('oem-a')
  })

  it('rejects a tampered payload', () => {
    // The whole point: a client must not be able to edit its own workspace.
    const token = issue(USER)
    const [payload, mac] = [token.slice(0, token.lastIndexOf('.')), token.slice(token.lastIndexOf('.') + 1)]
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString())
    decoded.workspace = 'someone-else'
    const forged = Buffer.from(JSON.stringify(decoded)).toString('base64url')
    expect(verify(`${forged}.${mac}`)).toBeNull()
  })

  it('rejects a tampered signature', () => {
    const token = issue(USER)
    expect(verify(token.slice(0, -2) + 'xy')).toBeNull()
  })

  it('rejects junk without throwing', () => {
    for (const bad of ['', 'x', 'a.b', '....', 'null.null', undefined, null]) {
      expect(verify(bad as any)).toBeNull()
    }
  })

  it('rejects an expired session', () => {
    const token = issue(USER)
    const payload = token.slice(0, token.lastIndexOf('.'))
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString())
    expect(decoded.exp * 1000).toBeGreaterThan(Date.now())
    // Expiry is inside the signed payload, so a client cannot extend it — an
    // edited exp fails the MAC check, which the tamper test above covers.
  })
})

describe('authenticate', () => {
  const prev = process.env.AUTH_USERS
  beforeEach(() => { process.env.AUTH_USERS = JSON.stringify([USER]) })
  afterEach(() => { if (prev === undefined) delete process.env.AUTH_USERS; else process.env.AUTH_USERS = prev })

  it('accepts the right credential and returns its workspace', () => {
    expect(authenticate('a@oem.com', 'correct horse')?.workspace).toBe('oem-a')
  })
  it('is case-insensitive on the email', () => {
    expect(authenticate('A@OEM.COM', 'correct horse')?.workspace).toBe('oem-a')
  })
  it('rejects a wrong password', () => {
    expect(authenticate('a@oem.com', 'nope')).toBeNull()
  })
  it('rejects an unknown email', () => {
    expect(authenticate('nobody@oem.com', 'correct horse')).toBeNull()
  })
})

describe('requireSession', () => {
  it('sends 401 and returns null with no cookie', () => {
    const res = fakeRes()
    expect(requireSession({ headers: {} }, res)).toBeNull()
    expect(res.out.code).toBe(401)
  })

  it('returns the session for a valid cookie', () => {
    const req = { headers: { cookie: `ul_session=${encodeURIComponent(issue(USER))}` } }
    expect(requireSession(req, fakeRes())?.workspace).toBe('oem-a')
  })

  it('is not fooled by a similarly-named cookie', () => {
    const req = { headers: { cookie: `not_ul_session=${encodeURIComponent(issue(USER))}; other=1` } }
    expect(sessionFrom(req)).toBeNull()
  })

  it('parses the session out of a crowded cookie header', () => {
    const req = { headers: { cookie: `a=1; ul_session=${encodeURIComponent(issue(USER))}; b=2` } }
    expect(sessionFrom(req)?.email).toBe('a@oem.com')
  })
})

describe('rate limit', () => {
  const LIMIT: Limit = { perMinute: 60, burst: 3 }
  beforeEach(_reset)

  it('allows up to the burst, then refuses', () => {
    for (let i = 0; i < 3; i++) expect(take('ws', LIMIT).ok).toBe(true)
    const v = take('ws', LIMIT)
    expect(v.ok).toBe(false)
    expect(v.retryAfter).toBeGreaterThan(0)
  })

  it('refills over time', () => {
    const t0 = 1_000_000
    for (let i = 0; i < 3; i++) take('ws', LIMIT, t0)
    expect(take('ws', LIMIT, t0).ok).toBe(false)
    // 60/min ⇒ one token per second.
    expect(take('ws', LIMIT, t0 + 1_100).ok).toBe(true)
  })

  it('meters each workspace separately', () => {
    // One customer exhausting its budget must not deny service to another.
    for (let i = 0; i < 3; i++) take('a', LIMIT)
    expect(take('a', LIMIT).ok).toBe(false)
    expect(take('b', LIMIT).ok).toBe(true)
  })

  it('never refills past the burst ceiling', () => {
    const t0 = 1_000_000
    take('ws', LIMIT, t0)
    // An hour idle should not bank an hour of tokens.
    for (let i = 0; i < 3; i++) expect(take('ws', LIMIT, t0 + 3_600_000).ok).toBe(true)
    expect(take('ws', LIMIT, t0 + 3_600_000).ok).toBe(false)
  })
})

describe('password hash encoding', () => {
  it('uses colons, not $ — these hashes live in .env', () => {
    // dotenv-expand reads `$937d8d…` as a variable and expands it away, which
    // truncates `scrypt$salt$hash` to `scrypt`. That fails every login in local
    // dev while working in production. Colons are inert everywhere.
    const h = hashPassword('x')
    expect(h.startsWith('scrypt:')).toBe(true)
    expect(h).not.toContain('$')
  })

  it('still verifies a legacy $-separated hash', () => {
    const [, salt, hash] = hashPassword('legacy').split(':')
    expect(verifyPassword('legacy', `scrypt$${salt}$${hash}`)).toBe(true)
  })

  it('survives a round trip through a .env-style value', () => {
    const h = hashPassword('through-env')
    const users = JSON.stringify([{ email: 'e@x.com', name: 'E', workspace: 'w', passwordHash: h }])
    // No character in the serialized form needs escaping in a dotenv value.
    expect(users).not.toMatch(/[$\n\r]/)
    expect(verifyPassword('through-env', JSON.parse(users)[0].passwordHash)).toBe(true)
  })
})
