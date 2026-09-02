// ───────────────────────────────────────────────────────────────────────────
// RATE LIMITS — a bound on what one workspace can spend on the model.
//
// The AI routes call Claude on the server's key. Before sessions existed, an
// unauthenticated request could do that, so a deployed URL was an open Opus
// endpoint billed to us. Sessions close that; this bounds the authenticated
// case, where a stuck client or an enthusiastic demo can still run up a bill.
//
// Deliberately simple: an in-memory token bucket per workspace. That makes it
// PER SERVERLESS INSTANCE rather than global — with N warm instances the real
// ceiling is N × the limit. It is a guardrail against runaway usage, not a
// billing control. A global limit needs shared state (Neon or Redis); when that
// matters, replace `take()` and leave every call site as it is.
// ───────────────────────────────────────────────────────────────────────────

interface Bucket { tokens: number; refilledAt: number }

const buckets = new Map<string, Bucket>()

export interface Limit {
  /** Sustained requests per minute. */
  perMinute: number
  /** Burst allowance — how many can arrive at once. */
  burst: number
}

/** Model calls are the expensive ones; chat is the interactive path so it gets
 *  the larger burst, forecast generation the smaller one. */
export const LIMITS = {
  ask: { perMinute: 20, burst: 8 },
  forecast: { perMinute: 10, burst: 4 },
  copilot: { perMinute: 20, burst: 8 },
  // A TrueReg goal fans out over several agent turns in one request, so the
  // per-minute ceiling is lower than the single-question routes.
  truereg: { perMinute: 8, burst: 3 },
} satisfies Record<string, Limit>

export interface Verdict { ok: boolean; retryAfter: number }

/** Take one token for `key`. Returns whether it was available, and how long to
 *  wait if it was not. */
export function take(key: string, limit: Limit, now = Date.now()): Verdict {
  const b = buckets.get(key) ?? { tokens: limit.burst, refilledAt: now }
  // Continuous refill — no timer, no cleanup pass.
  const elapsedMs = Math.max(0, now - b.refilledAt)
  const refill = (elapsedMs / 60_000) * limit.perMinute
  const tokens = Math.min(limit.burst, b.tokens + refill)

  if (tokens < 1) {
    buckets.set(key, { tokens, refilledAt: now })
    const needed = 1 - tokens
    return { ok: false, retryAfter: Math.ceil((needed / limit.perMinute) * 60) }
  }
  buckets.set(key, { tokens: tokens - 1, refilledAt: now })
  return { ok: true, retryAfter: 0 }
}

/** Guard for a route: takes a token and sends 429 if there is none. Returns
 *  true when the caller may proceed. */
export function allow(res: any, workspace: string, route: keyof typeof LIMITS): boolean {
  const v = take(`${route}:${workspace}`, LIMITS[route])
  if (!v.ok) {
    res.setHeader('Retry-After', String(v.retryAfter))
    res.status(429).json({ error: `Too many requests. Try again in ${v.retryAfter}s.` })
    return false
  }
  return true
}

/** Test seam — buckets are process-global, so a test that exhausts one would
 *  otherwise leak into the next. */
export function _reset() { buckets.clear() }
