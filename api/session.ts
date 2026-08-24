// /api/session — sign in, sign out, and "who am I".
//
//   POST { email, password }  → sets an HttpOnly session cookie, returns the session
//   GET                       → the current session, or 401
//   DELETE                    → clears the cookie
//
// One route rather than three because they are one resource, and because every
// extra serverless entry point is another thing to remember to guard.
import { authenticate, issue, setSessionCookie, clearSessionCookie, sessionFrom } from './_auth.js'

/** Deliberately slow and deliberately vague: a wrong email and a wrong password
 *  are the same answer, so the endpoint can't be used to enumerate users. */
const BAD = 'Incorrect email or password.'

// Per-IP throttle on failed sign-ins. In-memory, so it is per serverless
// instance rather than global — it blunts online guessing without pretending to
// be a distributed rate limiter.
const fails = new Map<string, { n: number; until: number }>()
const MAX_FAILS = 8
const LOCKOUT_MS = 10 * 60 * 1000

function ipOf(req: any): string {
  const fwd = String(req.headers?.['x-forwarded-for'] ?? '')
  return fwd.split(',')[0].trim() || req.socket?.remoteAddress || 'unknown'
}

export default async function handler(req: any, res: any) {
  const method = String(req.method ?? 'GET').toUpperCase()

  if (method === 'GET') {
    const s = sessionFrom(req)
    if (!s) { res.status(401).json({ error: 'Not signed in.' }); return }
    res.status(200).json({ email: s.email, name: s.name, workspace: s.workspace, exp: s.exp })
    return
  }

  if (method === 'DELETE') {
    clearSessionCookie(res)
    res.status(200).json({ ok: true })
    return
  }

  if (method !== 'POST') { res.status(405).json({ error: 'Method not allowed.' }); return }

  const ip = ipOf(req)
  const rec = fails.get(ip)
  if (rec && rec.n >= MAX_FAILS && Date.now() < rec.until) {
    res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' })
    return
  }

  const body = typeof req.body === 'string' ? safeParse(req.body) : (req.body ?? {})
  let user
  try {
    user = authenticate(body.email, body.password)
  } catch (e: any) {
    // A configuration error (no AUTH_USERS in production, bad JSON) must not be
    // reported as a credential failure — that would send an operator hunting
    // for the wrong problem.
    console.error('[auth] configuration error:', e?.message)
    res.status(500).json({ error: 'Authentication is not configured on the server.' })
    return
  }

  if (!user) {
    const next = { n: (rec?.n ?? 0) + 1, until: Date.now() + LOCKOUT_MS }
    fails.set(ip, next)
    res.status(401).json({ error: BAD })
    return
  }

  fails.delete(ip)
  setSessionCookie(res, issue(user))
  res.status(200).json({ email: user.email, name: user.name, workspace: user.workspace })
}

function safeParse(s: string): any {
  try { return JSON.parse(s) } catch { return {} }
}
