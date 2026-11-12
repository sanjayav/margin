// ───────────────────────────────────────────────────────────────────────────
// THE AI GUARD — the one gate every model-calling route opens with.
//
// Before this, each AI route did its own checks in its own order, and they had
// drifted: one parsed the body before checking the method, three crashed with
// a 500 on malformed JSON, one shared another route's budget. This puts the
// checks in one place, in one order:
//
//   1. method       POST only
//   2. session      signed cookie, verified server-side (401)
//   3. origin       a browser POST must come from this site (403) — SameSite=Lax
//                   already stops a cross-site form carrying the cookie; this
//                   is the second lock, not the only one
//   4. per-user     burst limit per signed-in user per route (429)
//   5. per-minute   durable counter per workspace per route (429)
//   6. per-day      durable daily ceiling per workspace across all AI (429)
//   7. body         size-capped, safely parsed JSON (413 / 400)
//
// Durable counters live in Neon when DATABASE_URL is set, so the ceiling is
// global across serverless instances. Without a database they fall back to
// per-instance memory: still a guardrail, and the app still runs offline.
// ───────────────────────────────────────────────────────────────────────────
import { neon } from '@neondatabase/serverless'
import { requireSession, type Session } from './_auth.js'
import { LIMITS, take } from './_ratelimit.js'

const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null

export type AiRoute = 'agents' | 'copilot' | 'forecast' | 'truereg'

/** Requests per workspace per UTC day across every AI route. A runaway client
 *  or a leaked session stops here rather than at the invoice. */
export const DAILY_LIMIT = Math.max(1, Number(process.env.AI_DAILY_LIMIT) || 400)

/** Requests per workspace per minute, per route — shared by every user in it. */
const WORKSPACE_PER_MINUTE: Record<AiRoute, number> = { agents: 12, copilot: 40, forecast: 20, truereg: 16 }

const DEFAULT_MAX_BODY = 256 * 1024

// ── origin ─────────────────────────────────────────────────────────────────

function allowedOrigins(): string[] {
  return String(process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
}

/** A browser always sends Origin on a cross-origin POST. A request with no
 *  Origin is a non-browser client, which cannot ride a victim's cookie, so it
 *  is judged by the session alone. */
export function sameOrigin(req: any): boolean {
  const origin = String(req.headers?.origin ?? '')
  if (!origin) return true
  let host: string
  try { host = new URL(origin).host } catch { return false }
  const self = String(req.headers?.['x-forwarded-host'] ?? req.headers?.host ?? '')
  if (host === self) return true
  return allowedOrigins().some((o) => { try { return new URL(o).host === host } catch { return false } })
}

// ── body ───────────────────────────────────────────────────────────────────

/** Parses the body without ever throwing. Returns null after sending the error. */
export function readJson(req: any, res: any, maxBytes = DEFAULT_MAX_BODY): Record<string, any> | null {
  const raw = req.body
  let body: unknown
  if (raw == null || raw === '') body = {}
  else if (typeof raw === 'string' || Buffer.isBuffer(raw)) {
    const text = String(raw)
    if (Buffer.byteLength(text) > maxBytes) { tooLarge(res, maxBytes); return null }
    try { body = JSON.parse(text) } catch { res.status(400).json({ error: 'Body is not valid JSON.' }); return null }
  } else body = raw
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    res.status(400).json({ error: 'Body must be a JSON object.' }); return null
  }
  if (typeof raw !== 'string' && JSON.stringify(body).length > maxBytes) { tooLarge(res, maxBytes); return null }
  return body as Record<string, any>
}

function tooLarge(res: any, max: number) {
  res.status(413).json({ error: `Request is larger than ${Math.round(max / 1024)}KB.` })
}

// ── durable counters ───────────────────────────────────────────────────────

const memCounters = new Map<string, { n: number; resetAt: number }>()
let tableReady: Promise<unknown> | null = null

function ensureTable() {
  if (!sql) return Promise.resolve()
  tableReady ??= sql`create table if not exists ai_rate (
      key text primary key,
      n integer not null,
      reset_at timestamptz not null
    )`.catch((e) => { tableReady = null; throw e })
  return tableReady
}

/** Fixed-window counter: increments `key` and returns the count in the current
 *  window plus when the window resets. Atomic in Postgres (one upsert). */
async function bump(key: string, windowMs: number): Promise<{ n: number; resetAt: number }> {
  const now = Date.now()
  if (sql) {
    try {
      await ensureTable()
      const resetAt = new Date(now + windowMs).toISOString()
      const rows = await sql`
        insert into ai_rate (key, n, reset_at) values (${key}, 1, ${resetAt})
        on conflict (key) do update set
          n = case when ai_rate.reset_at <= now() then 1 else ai_rate.n + 1 end,
          reset_at = case when ai_rate.reset_at <= now() then excluded.reset_at else ai_rate.reset_at end
        returning n, reset_at`
      const r = rows[0] as any
      return { n: Number(r.n), resetAt: new Date(r.reset_at).getTime() }
    } catch (e: any) {
      // A database hiccup must not open the floodgates or take the AI down —
      // degrade to the per-instance counter for this request.
      console.error('[guard] durable rate counter unavailable:', e?.message)
    }
  }
  const cur = memCounters.get(key)
  if (!cur || cur.resetAt <= now) {
    const next = { n: 1, resetAt: now + windowMs }
    memCounters.set(key, next)
    return next
  }
  cur.n++
  return cur
}

function limited(res: any, retryAfterSec: number, message: string) {
  res.setHeader('Retry-After', String(Math.max(1, retryAfterSec)))
  res.status(429).json({ error: message, retryAfter: Math.max(1, retryAfterSec) })
}

// ── the guard ──────────────────────────────────────────────────────────────

export interface Guarded { session: Session; body: Record<string, any> }

/** Runs every check for an AI route. Returns null after sending the error
 *  response; the caller just returns. */
export async function guardAi(req: any, res: any, route: AiRoute, opts: { maxBytes?: number } = {}): Promise<Guarded | null> {
  if (String(req.method ?? '').toUpperCase() !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ error: 'POST only.' }); return null
  }
  const session = requireSession(req, res)
  if (!session) return null
  if (!sameOrigin(req)) { res.status(403).json({ error: 'Cross-origin request refused.' }); return null }

  // Per user, in memory: instant, and stops one person's stuck loop without
  // touching the database.
  const user = take(`${route}:${session.workspace}:${session.email}`, LIMITS[route])
  if (!user.ok) { limited(res, user.retryAfter, `Too many requests. Try again in ${user.retryAfter}s.`); return null }

  const minute = await bump(`m:${route}:${session.workspace}`, 60_000)
  if (minute.n > WORKSPACE_PER_MINUTE[route]) {
    limited(res, Math.ceil((minute.resetAt - Date.now()) / 1000), 'Your workspace is sending too many AI requests. Try again shortly.')
    return null
  }
  const day = new Date().toISOString().slice(0, 10)
  const msToMidnight = Date.parse(`${day}T00:00:00Z`) + 86_400_000 - Date.now()
  const daily = await bump(`d:${session.workspace}:${day}`, msToMidnight)
  if (daily.n > DAILY_LIMIT) {
    limited(res, Math.ceil(msToMidnight / 1000), `Your workspace has reached its daily AI limit (${DAILY_LIMIT} requests). It resets at 00:00 UTC.`)
    return null
  }

  const body = readJson(req, res, opts.maxBytes)
  if (!body) return null
  return { session, body }
}

/** Untrusted text bound for a prompt: stringified, control characters removed,
 *  length-capped. */
export function clip(v: unknown, max: number): string {
  // eslint-disable-next-line no-control-regex
  return String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, max)
}

/** An error message safe to send to the client: the model API's own messages
 *  can echo request internals, so only a generic line leaves the server. */
export function publicError(e: any): string {
  console.error('[ai]', e?.status ?? '', e?.message ?? e)
  const status = Number(e?.status)
  if (status === 429 || status === 529) return 'The AI service is busy. Try again in a moment.'
  if (status === 401 || status === 403) return 'The AI service rejected the server credentials.'
  return 'The AI request failed. The engine figures are unaffected.'
}

/** Test seam. */
export function _resetGuard() { memCounters.clear() }
