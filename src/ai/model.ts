// ───────────────────────────────────────────────────────────────────────────
// THE MODEL — one constant for every AI surface in the platform.
//
// Every route that calls Claude (agents, co-pilot, forecast, TrueReg) reads the
// model from here and nowhere else. There is deliberately no env override and
// no client-selectable model: a request can never name a different model, so
// it can never run up spend on one, and a deploy can never drift off Sonnet by
// a forgotten variable.
//
// Request rules for Claude Sonnet 5.5 that every route must respect — each of
// these is a 400 rather than a degraded answer:
//   · thinking {type:'disabled'} is rejected (adaptive is the default; to turn
//     it off use {type:'between_tools'}, which no route here needs)
//   · forced tool_choice ('any' / 'tool') is rejected — use 'auto'
//   · non-default temperature / top_p / top_k are rejected
//   · assistant prefill is rejected
// Refusal fallback: the array form may only name claude-sonnet-5, which keeps
// a rescued request inside the Sonnet family.
// ───────────────────────────────────────────────────────────────────────────

export const AI_MODEL = 'claude-sonnet-5-5' as const
export const AI_MODEL_NAME = 'Claude Sonnet 5.5'

/** Server-side refusal fallback. A benign compliance question that trips a
 *  safety classifier is re-run on Sonnet 5 inside the same call instead of
 *  failing the user. */
export const FALLBACK_BETA = 'server-side-fallback-2026-07-01'
export const FALLBACK_MODEL = 'claude-sonnet-5' as const

/** USD per million tokens — for cost display and the daily budget. */
export const AI_PRICE = { inputPerMTok: 2, outputPerMTok: 10, cacheReadPerMTok: 0.1 } as const

/** Adds the refusal fallback to a request body. Use with client.beta.messages. */
export function withFallback<T extends object>(params: T): T & { betas: string[]; fallbacks: { model: string }[] } {
  return { ...params, betas: [FALLBACK_BETA], fallbacks: [{ model: FALLBACK_MODEL }] }
}
