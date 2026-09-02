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

export type ModelId = 'claude-fable-5' | 'claude-opus-5' | 'claude-sonnet-5' | 'claude-haiku-4-5'
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
  /** Does it accept output_config.effort? Pre-4.6 models return 400. */
  supportsEffort: boolean
  /** Does it accept thinking:{type:'adaptive'}? Pre-4.6 models do not. */
  supportsAdaptiveThinking: boolean
  /** Thinking cannot be turned off at all on this model. */
  thinkingAlwaysOn: boolean
  /** Worth pairing with server-side refusal fallbacks. */
  refusalFallbacks: boolean
  tier: 'frontier' | 'default' | 'fast' | 'cheap'
}

/** Ordered most capable first. `claude-opus-5` is the default and the one the
 *  agent workforce is tuned against. */
export const MODELS: ModelDef[] = [
  {
    id: 'claude-fable-5', name: 'Claude Fable 5', tier: 'frontier',
    forEn: 'The most capable model. Worth it for a long, messy installation where the boundary and the precursor chain both have to be reasoned about at once.',
    forZh: '能力最强的模型。当边界与前体链条需同时推理的复杂装置，值得使用。',
    inputPerMTok: 10, outputPerMTok: 50, context: 1_000_000, vision: true,
    supportsEffort: true, supportsAdaptiveThinking: true, thinkingAlwaysOn: true, refusalFallbacks: true,
  },
  {
    id: 'claude-opus-5', name: 'Claude Opus 5', tier: 'default',
    forEn: 'The default. Best balance of agentic tool use and cost — this is what the seven agents are written for.',
    forZh: '默认选项。代理式工具调用与成本的最佳平衡 — 七个代理即以此为基准编写。',
    inputPerMTok: 5, outputPerMTok: 25, context: 1_000_000, vision: true,
    supportsEffort: true, supportsAdaptiveThinking: true, thinkingAlwaysOn: false, refusalFallbacks: true,
  },
  {
    id: 'claude-sonnet-5', name: 'Claude Sonnet 5', tier: 'fast',
    forEn: 'Faster and less than half the price. Good for routine questions where the engine has already done the hard part.',
    forZh: '更快，价格不到一半。适合引擎已完成主要工作的常规问题。',
    inputPerMTok: 2, outputPerMTok: 10, context: 1_000_000, vision: true,
    supportsEffort: true, supportsAdaptiveThinking: true, thinkingAlwaysOn: false, refusalFallbacks: false,
  },
  {
    id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', tier: 'cheap',
    forEn: 'Cheapest. A smaller 200K context and no effort control — fine for short lookups, not for interpreting a plant record.',
    forZh: '成本最低。上下文仅200K且不支持思考强度控制 — 适合简短查询，不适合解读工厂记录。',
    inputPerMTok: 1, outputPerMTok: 5, context: 200_000, vision: true,
    supportsEffort: false, supportsAdaptiveThinking: false, thinkingAlwaysOn: false, refusalFallbacks: false,
  },
]

export const DEFAULT_MODEL: ModelId = 'claude-opus-5'
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
 *  `output_config.effort` on a pre-4.6 model, adaptive thinking on Haiku,
 *  or `thinking:{type:'disabled'}` above effort `high` on Opus 5. */
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
