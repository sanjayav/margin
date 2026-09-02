// ───────────────────────────────────────────────────────────────────────────
// AUTH — server-issued sessions, and the workspace every request belongs to.
//
// This replaces a client-side credential check that anyone could walk past by
// setting one localStorage key. Two things follow from it:
//
//   1. The API decides who you are. A route asks `requireSession(req, res)` and
//      either gets a session or has already sent 401 — there is no client claim
//      to trust.
//   2. Every request carries a WORKSPACE. The store is keyed by it, so two
//      customers on one deployment cannot see each other's scenarios or
//      imported data. That isolation is the whole point; the login is just how
//      a request acquires a workspace.
//
// Sessions are stateless HMAC-signed tokens in an HttpOnly cookie — no session
// table to provision, and revocation-by-rotation (change SESSION_SECRET).
//
// Users come from AUTH_USERS (JSON, see below). With none configured the module
// runs in DEV MODE: a single demo user, and a loud warning. Dev mode refuses to
// engage when VERCEL_ENV is 'production', so a misconfigured deploy fails closed
// rather than silently accepting the demo password.
// ───────────────────────────────────────────────────────────────────────────
import { createHmac, timingSafeEqual, scryptSync, randomBytes } from 'node:crypto'
import type { Role } from '../src/app/auth/rbac.js'

export interface Session {
  email: string
  name: string
  /** Tenant boundary. Every store read and write is scoped to this. */
  workspace: string
  /** What this user is allowed to do. Carried in the SIGNED token, never sent
   *  by the client: a role the browser could assert is not an authorisation
   *  model. Absent on tokens issued before roles existed — treated as the
   *  least-privileged role, not the most. */
  role?: Role
  /** Seconds since epoch. */
  exp: number
}

export interface User {
  email: string
  name: string
  workspace: string
  /** Defaults to 'analyst' when AUTH_USERS omits it — a configuration slip
   *  must under-grant, never over-grant. */
  role?: Role
  /** `scrypt:<saltHex>:<hashHex>` — never a plaintext password. */
  passwordHash: string
}

const COOKIE = 'ul_session'
const TTL_SECONDS = 12 * 60 * 60 // a working day; a demo or an analyst session
const isProd = process.env.VERCEL_ENV === 'production'

// ── configuration ──────────────────────────────────────────────────────────

/** In dev with nothing configured, the app must still start. In production it
 *  must not: an unset secret there would mean every deploy signs with the same
 *  well-known key, which is not a session system. */
function secret(): string {
  const s = process.env.SESSION_SECRET
  if (s && s.length >= 16) return s
  if (isProd) throw new Error('SESSION_SECRET is not set. Refusing to issue sessions in production.')
  return 'dev-only-insecure-session-secret'
}

let warned = false
function devUsers(): User[] {
  if (!warned) {
    warned = true
    console.warn('[auth] AUTH_USERS is not set — running with the built-in demo user. Do not deploy like this.')
  }
  // Hash generated at load so the plaintext never sits in the bundle as a
  // comparable constant. Password: "marginio" (the previous demo credential,
  // kept so existing demo scripts still work locally).
  return [{ email: 'vijay@margin.io', name: 'Vijay', workspace: 'demo', role: 'owner', passwordHash: hashPassword('marginio') }]
}

/** AUTH_USERS='[{"email":"a@oem.com","name":"A","workspace":"maruti","passwordHash":"scrypt$..."}]'
 *  One workspace per customer. Two users sharing a workspace share their data —
 *  that is the intended way to give a customer a team. */
export function users(): User[] {
  const raw = process.env.AUTH_USERS
  if (!raw) {
    if (isProd) throw new Error('AUTH_USERS is not set. Refusing to run without configured users in production.')
    return devUsers()
  }
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { throw new Error('AUTH_USERS is not valid JSON.') }
  if (!Array.isArray(parsed)) throw new Error('AUTH_USERS must be a JSON array.')
  return parsed.map((u: any, i) => {
    for (const k of ['email', 'workspace', 'passwordHash'] as const) {
      if (typeof u?.[k] !== 'string' || !u[k]) throw new Error(`AUTH_USERS[${i}] is missing "${k}".`)
    }
    return { email: String(u.email).trim().toLowerCase(), name: String(u.name ?? u.email), workspace: String(u.workspace), passwordHash: String(u.passwordHash) }
  })
}

// ── passwords ──────────────────────────────────────────────────────────────

const SCRYPT_KEYLEN = 64

/** `scrypt:<saltHex>:<hashHex>`. Used by scripts/make-user.mjs to mint entries.
 *
 *  COLON-separated, not `$`-separated, and that is load-bearing: these hashes
 *  live inside AUTH_USERS in a .env file, and dotenv-expand reads `$937d8d…` as
 *  a variable reference and expands it to nothing — silently truncating
 *  `scrypt$salt$hash` to `scrypt`. The failure mode is the worst kind: every
 *  password is rejected in local dev while working in production, where env
 *  vars never pass through dotenv. Hex contains no colons, so `:` is
 *  unambiguous and needs no escaping anywhere. */
export function hashPassword(plain: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(plain, salt, SCRYPT_KEYLEN)
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`
}

export function verifyPassword(plain: string, stored: string): boolean {
  // Accept the legacy `$` form too, so a hash minted before the separator
  // changed still verifies rather than locking someone out.
  const parts = stored.includes(':') ? stored.split(':') : stored.split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  try {
    const salt = Buffer.from(parts[1], 'hex')
    const expected = Buffer.from(parts[2], 'hex')
    if (expected.length !== SCRYPT_KEYLEN) return false
    const actual = scryptSync(plain, salt, SCRYPT_KEYLEN)
    return timingSafeEqual(actual, expected)
  } catch { return false }
}

// ── tokens ─────────────────────────────────────────────────────────────────

const b64 = (b: Buffer) => b.toString('base64url')

function sign(payload: string): string {
  return b64(createHmac('sha256', secret()).update(payload).digest())
}

export function issue(user: User): string {
  const body: Session = {
    email: user.email, name: user.name, workspace: user.workspace,
    role: user.role ?? 'analyst',
    exp: Math.floor(Date.now() / 1000) + TTL_SECONDS,
  }
  const payload = b64(Buffer.from(JSON.stringify(body)))
  return `${payload}.${sign(payload)}`
}

/** Returns the session, or null for anything not currently valid. Never throws
 *  on malformed input — a hostile cookie is just an unauthenticated request. */
export function verify(token: string | undefined | null): Session | null {
  if (!token) return null
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return null
  const payload = token.slice(0, dot)
  const mac = token.slice(dot + 1)
  let expected: string
  try { expected = sign(payload) } catch { return null }
  // Constant-time compare, and only on equal lengths (timingSafeEqual throws otherwise).
  const a = Buffer.from(mac), b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const s = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Session
    if (!s?.workspace || !s?.email) return null
    if (typeof s.exp !== 'number' || s.exp * 1000 < Date.now()) return null
    return s
  } catch { return null }
}

// ── request plumbing ───────────────────────────────────────────────────────

function readCookie(req: any, name: string): string | undefined {
  const header: string = req?.headers?.cookie ?? ''
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === name) return decodeURIComponent(rest.join('='))
  }
  return undefined
}

export function sessionFrom(req: any): Session | null {
  return verify(readCookie(req, COOKIE))
}

export function setSessionCookie(res: any, token: string) {
  const attrs = ['Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${TTL_SECONDS}`]
  if (isProd) attrs.push('Secure')
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(token)}; ${attrs.join('; ')}`)
}

export function clearSessionCookie(res: any) {
  const attrs = ['Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0']
  if (isProd) attrs.push('Secure')
  res.setHeader('Set-Cookie', `${COOKIE}=; ${attrs.join('; ')}`)
}

/** The guard every data route opens with. Returns null AFTER sending 401, so a
 *  caller that forgets to check still cannot leak data — it can only send a
 *  second response, which is a visible bug rather than a silent breach. */
export function requireSession(req: any, res: any): Session | null {
  const s = sessionFrom(req)
  if (!s) {
    res.status(401).json({ error: 'Not signed in.' })
    return null
  }
  return s
}

/** Authenticate a credential pair. Constant-ish time: an unknown email still
 *  runs a scrypt verification against a dummy hash so timing doesn't enumerate
 *  valid addresses. */
export function authenticate(email: string, password: string): User | null {
  const target = String(email ?? '').trim().toLowerCase()
  const all = users()
  const user = all.find((u) => u.email === target)
  const hash = user?.passwordHash ?? DUMMY_HASH
  const ok = verifyPassword(String(password ?? ''), hash)
  return ok && user ? user : null
}

const DUMMY_HASH = hashPassword(randomBytes(24).toString('hex'))
