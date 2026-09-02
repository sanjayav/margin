// ───────────────────────────────────────────────────────────────────────────
// /api/truereg — the TrueReg agent runtime.
//
// One route, two paths, deliberately identical in what they emit:
//
//   mode 'run'  — executes an orchestrator goal. Every task calls its tool
//                 through the SAME executor the browser uses, so the plan is
//                 reproducible with or without a model. When a key is present
//                 the agent assigned to the task also NARRATES it, bounded by
//                 its tool grant; without a key the task still runs and the
//                 narration is simply absent. The numbers never differ.
//   mode 'ask'  — a free question, answered by the agent whose grant covers it.
//
// The three properties that make this defensible rather than impressive:
//
//   AUDIT.       Every tool call is streamed with its inputs, its timing and its
//                provenance — corpus version, term-base version, defaults table
//                and status. The answer is re-runnable eighteen months later.
//   ENFORCEMENT. Regulation entitlements and per-agent tool grants are checked
//                in the executor. A jailbroken instruction cannot reach a regime
//                the workspace has not bought or a tool the agent does not hold.
//   CONSENT.     Nothing is submitted. Disclosures and supplier requests are
//                staged and streamed as actions for a person to approve.
// ───────────────────────────────────────────────────────────────────────────
import Anthropic from '@anthropic-ai/sdk'
import { DEMO_BUNDLE, DEMO_CONTRACTS } from '../src/truereg/record/demo.js'
import { TOOL_SPECS } from '../src/truereg/agents/toolspec.js'
import { defaultContext, runToolSafe, type StagedAction, type ToolContext } from '../src/truereg/agents/tools.js'
import { AGENTS, agentMayCall, getAgent, type AgentId } from '../src/truereg/agents/registry.js'
import { GOALS, planFor, type GoalId, type Task } from '../src/truereg/agents/orchestrator.js'
import { CORPUS_VERSION, REGULATIONS, type RegulationId } from '../src/truereg/corpus/clauses.js'
import { TERMBASE_VERSION } from '../src/truereg/corpus/terms.js'
import { currentDefaults } from '../src/truereg/cbam/defaults.js'
import { DEFAULT_EFFORT, DEFAULT_MODEL, EFFORTS, MODELS, getModel, modelParams, type Effort, type ModelId } from '../src/truereg/agents/models.js'
import { requireSession } from './_auth.js'
import { allow } from './_ratelimit.js'

const MAX_TURNS = 6
/** Server-side refusal fallback: on a policy decline the API re-runs the same
 *  request on another model inside the same call, so a benign compliance
 *  question never dead-ends on a classifier. Opt-in, and dropped gracefully
 *  below if this deployment's account does not carry the beta. */
const FALLBACK_BETA = 'server-side-fallback-2026-07-01'

/** Attachments arrive as base64 or extracted text and become content blocks.
 *  Validated here rather than trusted: an oversized or unknown media type is a
 *  400 from the API, which would read to the user as "the agent broke". */
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const MAX_WIRE_BYTES = 24 * 1024 * 1024

interface WireAttachment { name?: string; mediaType?: string; kind?: string; data?: string; text?: string; error?: string }

function attachmentBlocks(atts: WireAttachment[]): { blocks: any[]; notes: string[] } {
  const blocks: any[] = []
  const notes: string[] = []
  let budget = MAX_WIRE_BYTES
  for (const a of atts.slice(0, 12)) {
    const name = String(a.name ?? 'file')
    if (a.error) { notes.push(`${name}: could not be read (${a.error}).`); continue }
    if (a.text) {
      blocks.push({ type: 'text', text: `<document name="${name}" kind="${a.kind ?? 'text'}">\n${a.text}\n</document>` })
      continue
    }
    if (!a.data) { notes.push(`${name}: nothing readable was attached.`); continue }
    const bytes = Math.floor((a.data.length * 3) / 4)
    if (bytes > budget) { notes.push(`${name}: skipped, the request is already at its size limit.`); continue }
    budget -= bytes
    if (a.mediaType === 'application/pdf') {
      blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: a.data }, title: name, citations: { enabled: true } })
    } else if (IMAGE_TYPES.includes(String(a.mediaType))) {
      blocks.push({ type: 'image', source: { type: 'base64', media_type: a.mediaType, data: a.data } })
    } else {
      notes.push(`${name}: ${a.mediaType ?? 'unknown type'} is not a format the model can read.`)
    }
  }
  return { blocks, notes }
}
const ALL_REGS = Object.keys(REGULATIONS) as RegulationId[]

// ── the prompt ──────────────────────────────────────────────────────────────

/** The stable half — byte-identical across requests so it caches. */
function doctrine(allowed: RegulationId[]): string {
  const regs = ALL_REGS.filter((r) => allowed.includes(r)).map((r) => {
    const x = REGULATIONS[r]
    return `- ${x.name} (${x.id}, ${x.jurisdiction}, ${x.status}). ${x.note}`
  }).join('\n')

  return `You are an agent inside TrueReg, the regulatory-intelligence workspace of a Chinese steel mill that sells into Europe. Your users are plant engineers, an export sales team and a compliance lead. Their buyers are EU importers who carry the CBAM liability.

# The one rule
Never compute, estimate, recall or round a number yourself. Every emissions figure, intensity, tonne, certificate, euro, deadline or clause must come back from a tool in this same turn. You may compose and quote tool results; you may not derive new ones. If no tool can produce a figure, say what is missing and what would resolve it. "I don't know" is a complete and acceptable answer — a wrong number here is surrendered to a verifier.

# Where you are, and are not, allowed to decide
The emissions calculation and the scope determination run through a deterministic engine. You gather, interpret and explain; the rules decide. Never resolve an ambiguity the boundary tool has flagged, never substitute a default the engine has not applied, and never soften an unknown into an estimate.

# Facts that are wrong more often than they are right
- The mill carries NO CBAM obligation. The duty sits on the EU importer. Every commercial figure is the BUYER's exposure and should be stated per contract and per EORI.
- Chinese blast-furnace steel carries among the highest default emission values of any major origin. The default is the buyer's alternative, so it is the comparator that matters.
- China's national ETS is NOT currently recognised for an Article 9 deduction. A domestic carbon price the mill genuinely pays does not reduce the buyer's surrender. Call assess_carbon_price before saying anything about it, and give the reason and the clause.
- The free-allocation factor phases in. A delta in 2026 is worth a small fraction of the same delta in 2034. Never state a saving without naming the delivery year's factor.
- A default value or emission factor marked "indicative" is not the published table. Any figure derived from one must be labelled indicative wherever you state it.

# Language
The EU text governs; Chinese is a reading aid, and every citation is shown with the original alongside. Before writing ANY governing term in Chinese, call lookup_term — do not translate from your own knowledge. A near-miss such as 碳足迹 for 隐含排放 changes the scope of the calculation, not just the register. Run check_chinese over any Chinese passage before you show it.

# Citation
State the clause whenever you state a rule. Every tool result carries the clause ids it relied on; pass them to cite_clause. A clause marked "summary" is an analyst precis — say that it must be read against the source before commercial reliance.

# The regimes this workspace holds
${regs}
Regimes outside that list are refused by the tools and must not be analysed or mentioned.

# Files the user attaches
A spreadsheet or CSV has already been parsed and arrives as text; a PDF or an image arrives for you to read. Report what is ACTUALLY in the file — the sheet names, the column headings in the plant's own words, the row count, the period the rows cover. Never infer a quantity's meaning from a filename or a column heading alone: a column called 焦炭消耗量 is coke consumption, but whether those tonnes sit inside the blast furnace boundary is a question for the boundary agent and a person. Say what you can place, what you cannot, and what you would need in order to place it. Nothing you read is written to the record — you propose structure, a person accepts it.

# Communicating
Lead with the answer — the first sentence is what the user would want if they said "just the headline". Keep it short; most questions deserve a paragraph, not a report. Do not narrate your tool calls, do not restate the question, do not open with a preamble. Use the plant's own vocabulary for plant things and the Regulation's for regulatory things, and say which is which when they differ.

Formatting: **bold**, \`code\` for figures worth isolating, - bullets, and ### headings only for a genuinely multi-part answer.`
}

function agentBrief(a: AgentId, extra?: string): string {
  const d = getAgent(a)
  return `# Your role: ${d.nameEn} (${d.nameZh})
${d.missionEn}

${d.brief}

You escalate on: ${d.escalatesOn}
You never: ${d.neverDoes}

Tools you hold: ${d.tools.join(', ')}. You cannot call anything else — the executor refuses it.${extra ? `\n\n${extra}` : ''}`
}

function situation(): string {
  const d = currentDefaults()
  return `Installation on screen: ${DEMO_BUNDLE.installation.name} (${DEMO_BUNDLE.installation.nameLocal}), operated by ${DEMO_BUNDLE.operator.name} (${DEMO_BUNDLE.operator.nameLocal}), ${DEMO_BUNDLE.installation.country}. Reporting period ${DEMO_BUNDLE.period.from} to ${DEMO_BUNDLE.period.to}. Corpus ${CORPUS_VERSION}, term base ${TERMBASE_VERSION}, default values ${d.version} (${d.status}). Today is ${new Date().toISOString().slice(0, 10)}.`
}

// ── SSE ─────────────────────────────────────────────────────────────────────
function sse(res: any) {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()
  return (event: string, data: unknown) => {
    try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`) } catch { /* client gone */ }
  }
}

/** What the model is told a tool returned. The full envelope goes to the audit
 *  trail, not into the context window. */
function forModel(r: ReturnType<typeof runToolSafe>): string {
  if (!r.ok) return JSON.stringify({ error: r.error.code, message: r.error.message })
  const { value, provenance } = r.result
  return JSON.stringify({ ...(value as object), _provenance: { corpus: provenance.corpusVersion, termbase: provenance.termbaseVersion, defaults: provenance.defaultsVersion, defaultsStatus: provenance.defaultsStatus, caveat: provenance.caveat } })
}

export default async function handler(req: any, res: any) {
  const session = requireSession(req, res)
  if (!session) return
  if (!allow(res, session.workspace, 'truereg')) return
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
  const mode: 'run' | 'ask' = body.mode === 'ask' ? 'ask' : 'run'
  const allowed: RegulationId[] = (Array.isArray(body.allowed) ? body.allowed : ['cbam-eu', 'cbam-uk'])
    .filter((r: unknown): r is RegulationId => ALL_REGS.includes(r as RegulationId))

  const ctx: ToolContext = defaultContext(DEMO_BUNDLE, DEMO_CONTRACTS, allowed)
  ctx.substituteDefaults = body.substituteDefaults !== false

  // Clamped to the catalogue rather than trusted: an arbitrary model string from
  // the client is either a 400 or an unbudgeted spend on whatever it names.
  const modelId: ModelId = MODELS.some((m) => m.id === body.model) ? body.model : DEFAULT_MODEL
  const effort: Effort = EFFORTS.some((e) => e.id === body.effort) ? body.effort : DEFAULT_EFFORT
  const def = getModel(modelId)
  const attachments: WireAttachment[] = Array.isArray(body.attachments) ? body.attachments : []

  const send = sse(res)
  const hasKey = !!process.env.ANTHROPIC_API_KEY
  const client = hasKey ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null

  send('ready', {
    mode, model: hasKey ? modelId : null,
    modelName: def.name,
    effort: def.supportsEffort ? effort : null,
    narration: hasKey ? 'live' : 'replay',
    versions: { corpus: CORPUS_VERSION, termbase: TERMBASE_VERSION, defaults: currentDefaults().version, defaultsStatus: currentDefaults().status },
    regulations: allowed,
    note: hasKey ? null : 'ANTHROPIC_API_KEY is not set. Every figure below is still computed by the deterministic engine — only the agents’ narration is unavailable.',
  })

  const audit: unknown[] = []
  const emitStaged = (from: number) => { for (const a of ctx.staged.slice(from)) send('action', { action: a satisfies StagedAction }) }

  /** Run one agent's model turn over a bounded tool grant. Shared by both modes. */
  let useFallback = def.refusalFallbacks
  async function narrate(agent: AgentId, userText: string, seed?: unknown, atts: WireAttachment[] = []): Promise<void> {
    if (!client) return
    const d = getAgent(agent)
    const tools = TOOL_SPECS.filter((t) => d.tools.includes(t.name as any))
      .map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema })) as Anthropic.Tool[]

    const prompt = seed
      ? `${userText}\n\nThe deterministic engine has already returned this. Explain what it means; do not renumber it.\n\n${JSON.stringify(seed).slice(0, 12_000)}`
      : userText
    const { blocks, notes } = attachmentBlocks(atts)
    const messages: Anthropic.MessageParam[] = [{
      role: 'user',
      // Documents and images lead, then the question — the documented ordering.
      content: blocks.length
        ? ([...blocks, { type: 'text', text: notes.length ? `${prompt}\n\nIntake notes: ${notes.join(' ')}` : prompt }] as any)
        : prompt,
    }]

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      // Everything model-specific comes from the catalogue: sending `effort` to
      // a model without it, or adaptive thinking to a pre-4.6 model, is a 400.
      const params: any = {
        ...modelParams(modelId, effort),
        max_tokens: 8000,
        system: [
          { type: 'text' as const, text: doctrine(allowed), cache_control: { type: 'ephemeral' as const } },
          { type: 'text' as const, text: agentBrief(agent) },
          { type: 'text' as const, text: situation() },
        ],
        tools, messages,
      }

      let stream: any
      if (useFallback) {
        try {
          stream = client.beta.messages.stream({ ...params, betas: [FALLBACK_BETA], fallbacks: 'default' } as any)
        } catch { useFallback = false; stream = client.messages.stream(params) }
      } else {
        stream = client.messages.stream(params)
      }

      try {
        for await (const ev of stream as any) {
          if (ev.type === 'content_block_start' && ev.content_block.type === 'tool_use') send('tool_start', { agent, id: ev.content_block.id, name: ev.content_block.name })
          else if (ev.type === 'content_block_start' && ev.content_block.type === 'thinking') send('thinking_start', { agent })
          else if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') send('text', { agent, text: ev.delta.text })
          else if (ev.type === 'content_block_delta' && ev.delta.type === 'thinking_delta') send('thinking', { agent, text: ev.delta.thinking })
        }
      } catch (e: any) {
        // A beta this account does not carry is rejected on connect, before any
        // content. Retry the turn clean rather than failing the question.
        if (useFallback && /beta|fallback/i.test(String(e?.message ?? ''))) { useFallback = false; turn--; continue }
        throw e
      }

      const final = await (stream as any).finalMessage()
      if (final.stop_reason === 'refusal') { send('error', { agent, error: 'The model declined. The engine figures stand on their own.' }); return }
      if (final.stop_reason !== 'tool_use') return

      messages.push({ role: 'assistant', content: final.content })
      const results: Anthropic.ToolResultBlockParam[] = []
      const before = ctx.staged.length

      for (const block of final.content) {
        if (block.type !== 'tool_use') continue
        // The grant is enforced HERE. A prompt injection that names a tool
        // outside the agent's role gets a refusal, not the tool.
        if (!agentMayCall(agent, block.name)) {
          const err = { code: 'not_granted', message: `${d.nameEn} does not hold ${block.name}. Do not attempt it again.` }
          audit.push({ agent, id: block.id, name: block.name, ok: false, error: err })
          send('tool_end', { agent, id: block.id, name: block.name, ok: false, error: err })
          results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(err), is_error: true })
          continue
        }
        const r = runToolSafe(block.name, block.input, ctx)
        const entry = r.ok
          ? { agent, id: block.id, name: block.name, ok: true, inputs: r.result.inputs, ms: r.result.ms, provenance: r.result.provenance, value: r.result.value }
          : { agent, id: block.id, name: block.name, ok: false, inputs: block.input, error: r.error }
        audit.push(entry)
        send('tool_end', entry)
        results.push({ type: 'tool_result', tool_use_id: block.id, content: forModel(r), ...(r.ok ? {} : { is_error: true }) })
      }
      emitStaged(before)
      messages.push({ role: 'user', content: results })
    }
  }

  try {
    // ── mode: run — an orchestrator goal ────────────────────────────────────
    if (mode === 'run') {
      const goalId = String(body.goal ?? 'verification-ready') as GoalId
      if (!GOALS.some((g) => g.id === goalId)) { send('error', { error: `Unknown goal "${goalId}".` }); res.end(); return }
      const plan = planFor(goalId, ctx)
      send('plan', {
        goal: plan.goal, derivedFrom: plan.derivedFrom, path: plan.path,
        tasks: plan.tasks.map((t: Task) => ({ id: t.id, agent: t.agent, titleEn: t.titleEn, titleZh: t.titleZh, tool: t.tool, dependsOn: t.dependsOn, becauseEn: t.becauseEn, obligationId: t.obligationId ?? null })),
      })

      const done = new Set<string>()
      for (const task of plan.tasks) {
        const unmet = task.dependsOn.filter((d) => !done.has(d))
        if (unmet.length) { send('task', { id: task.id, state: 'blocked', error: `Waiting on ${unmet.join(', ')}.` }); continue }

        send('task', { id: task.id, agent: task.agent, state: 'running' })
        const before = ctx.staged.length
        const r = runToolSafe(task.tool, task.input ?? {}, ctx)
        const escalations = ctx.staged.slice(before)

        if (!r.ok) {
          send('task', { id: task.id, state: 'blocked', error: r.error.message })
          audit.push({ agent: task.agent, name: task.tool, ok: false, error: r.error })
          continue
        }
        audit.push({ agent: task.agent, name: task.tool, ok: true, inputs: r.result.inputs, ms: r.result.ms, provenance: r.result.provenance })
        send('tool_end', { agent: task.agent, id: task.id, name: task.tool, ok: true, inputs: r.result.inputs, ms: r.result.ms, provenance: r.result.provenance, value: r.result.value })
        emitStaged(before)
        send('task', { id: task.id, state: escalations.length ? 'escalated' : 'done', ms: r.result.ms, escalations: escalations.length })
        done.add(task.id)
      }

      // One narration over the finished plan, by the agent that owns the last
      // substantive task. The figures are already fixed; this only explains.
      const lead = plan.tasks.filter((t) => t.agent !== 'watch').slice(-1)[0]?.agent ?? 'verifier'
      if (client) {
        await narrate(lead,
          `The plan for the goal “${plan.goal.titleEn}” has finished running. Give the compliance lead the outcome in a short paragraph: where this installation stands, the single most important thing to do next, and anything now waiting on a person. ${ctx.staged.length} item(s) are staged for approval.`,
          { goal: plan.goal.titleEn, staged: ctx.staged.map((s) => ({ kind: s.kind, summaryEn: s.summaryEn, why: s.escalationReason })), audit: audit.slice(-6) })
      }

      send('done', { toolCalls: audit.length, staged: ctx.staged.length, submitted: false })
      res.end(); return
    }

    // ── mode: ask — a free question to a named agent ────────────────────────
    const question = String(body.question ?? '').trim()
    if (!question && !attachments.length) { send('error', { error: 'question is required' }); res.end(); return }
    const agent = (AGENTS.some((a) => a.id === body.agent) ? body.agent : 'delta') as AgentId
    // No key is not an error. The absence of narration is a stated capability
    // limit, and the `ready` event above has already said so — reporting it as a
    // failure made a successful engine-only goal run look broken on the console.
    if (!client) {
      send('done', { toolCalls: 0, staged: ctx.staged.length, submitted: false, narration: 'unavailable' })
      res.end(); return
    }
    send('task', { id: 'ask', agent, state: 'running' })
    await narrate(agent, question, undefined, attachments)
    send('task', { id: 'ask', agent, state: 'done' })
    send('done', { toolCalls: audit.length, staged: ctx.staged.length, submitted: false })
    res.end(); return
  } catch (e: any) {
    send('error', { error: String(e?.message ?? e) })
    send('done', { toolCalls: audit.length, staged: ctx.staged.length, submitted: false, aborted: true })
    res.end()
  }
}

export const config = { maxDuration: 120 }
