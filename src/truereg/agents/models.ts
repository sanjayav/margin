// ───────────────────────────────────────────────────────────────────────────
// MODEL CHOICE — which brain narrates, and how hard it thinks.
//
// The engine owns every number regardless of what is picked here, so the model
// choice never changes a figure. What it changes is the quality of the reading
// around the figures: how well an ambiguous plant record is interpreted, how
// sharply a verifier challenge is anticipated, how a Chinese process note is
// reconciled against the term base.
//
// Two independent dials, and they are commonly confused:
//
//   MODEL   which model runs. Capability tiers, with real price differences.
//   EFFORT  how much thinking that model spends before answering. This is the
//           precision dial, and on current models it moves quality more than
//           stepping up a tier does — lower effort on a newer model often beats
//           high effort on an older one.
//
// The per-model API rules below are not cosmetic. Sending `effort` to a model
// that does not support it is a 400, and so is sending adaptive thinking to a
// pre-4.6 model. Those rules live here rather than in the route handler so
// there is one place to correct when the API moves.
// ───────────────────────────────────────────────────────────────────────────

import { AI_MODEL, AI_MODEL_NAME, AI_PRICE } from '../../ai/model.js'

/** One model, platform-wide (src/ai/model.ts). The catalogue shape is kept so
 *  the picker UI and the server-side clamp keep working; it simply has one row. */
export type ModelId = typeof AI_MODEL
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export interface ModelDef {
  id: ModelId
  name: string
  /** One line: when this is the right pick for THIS product. */
  forEn: string
  forZh: string
  /** USD per million tokens. */
  inputPerMTok: number
  outputPerMTok: number
  /** Context window, tokens. */
  context: number
  /** Can it read an image or a scanned PDF page? */
  vision: boolean
  /** Does it accept output_config.effort? */
  supportsEffort: boolean
  /** Does it accept thinking:{type:'adaptive'}? */
  supportsAdaptiveThinking: boolean
  /** Thinking cannot be turned off at all on this model. */
  thinkingAlwaysOn: boolean
  /** Paired with server-side refusal fallbacks (to Sonnet 5). */
  refusalFallbacks: boolean
  tier: 'frontier' | 'default' | 'fast' | 'cheap'
}

export const MODELS: ModelDef[] = [
  {
    id: AI_MODEL, name: AI_MODEL_NAME, tier: 'fast',
    forEn: 'The platform model. Fast, strong at agentic tool use, and priced for everyday compliance work — the engine does the arithmetic, the model reads and explains.',
    forZh: '平台统一模型。速度快，擅长代理式工具调用，适合日常合规工作 — 计算由引擎完成，模型负责解读与说明。',
    inputPerMTok: AI_PRICE.inputPerMTok, outputPerMTok: AI_PRICE.outputPerMTok, context: 1_000_000, vision: true,
    // `disabled` thinking is a 400 on Sonnet 5.5; adaptive is the default.
    supportsEffort: true, supportsAdaptiveThinking: true, thinkingAlwaysOn: true, refusalFallbacks: true,
  },
]

export const DEFAULT_MODEL: ModelId = AI_MODEL
/** Agentic tool-use work rewards a high setting; this is the tuned default. */
export const DEFAULT_EFFORT: Effort = 'high'

export const getModel = (id: string): ModelDef =>
  MODELS.find((m) => m.id === id) ?? MODELS.find((m) => m.id === DEFAULT_MODEL)!

export const EFFORTS: { id: Effort; label: string; hint: string }[] = [
  { id: 'low', label: 'Low', hint: 'Fewest tool calls, terse answers. Routine lookups.' },
  { id: 'medium', label: 'Medium', hint: 'A step down from the default where quality holds.' },
  { id: 'high', label: 'High', hint: 'The default. The sweet spot for quality against token spend.' },
  { id: 'xhigh', label: 'Extra high', hint: 'Best for long agentic runs — a whole goal, or an ambiguous boundary.' },
  { id: 'max', label: 'Max', hint: 'When being right matters more than what it costs. Verification prep, a figure going to a buyer.' },
]

/** Build the model-specific half of a Messages request.
 *
 *  Everything that differs per model lives here, because each of these is a
 *  400 rather than a degraded answer if it is sent to a model that rejects it:
 *  e.g. `thinking:{type:'disabled'}` on Sonnet 5.5. */
export function modelParams(id: ModelId, effort: Effort, opts: { streamReasoning?: boolean } = {}) {
  const m = getModel(id)
  const p: Record<string, unknown> = { model: m.id }
  if (m.supportsEffort) p.output_config = { effort }
  if (m.supportsAdaptiveThinking) {
    // 'summarized' is not the default on this generation; without it the client
    // sees a long silence instead of the agent's reasoning.
    p.thinking = { type: 'adaptive', display: opts.streamReasoning === false ? 'omitted' : 'summarized' }
  }
  return p
}

/** Rough cost of one turn, for the picker. Indicative only — real spend depends
 *  on how many tools the agent calls and how much of the record it reads. */
export function estimateTurnCostUsd(id: ModelId, inputTokens = 12_000, outputTokens = 900): number {
  const m = getModel(id)
  return (inputTokens / 1e6) * m.inputPerMTok + (outputTokens / 1e6) * m.outputPerMTok
}
