// ───────────────────────────────────────────────────────────────────────────
// /api/copilot — AiRE, the platform's master AI.
//
// One brain for the whole workspace. Claude Opus 5 understands the question and
// narrates the answer; EVERY number is computed by the deterministic engine
// through the shared tool layer (src/engine/tools.ts). The model never does
// arithmetic — it calls a tool and explains exactly what came back.
//
// Three things make this enterprise-grade rather than a chat box:
//
//   • AUDIT. Every tool call is streamed to the client with its inputs, its
//     timing, and the provenance of the data it read (dataset version, coverage
//     tier, rule pack, basis). The answer is re-runnable, so it is defensible.
//   • ENFORCEMENT. Market entitlements are applied inside the tool executor, not
//     asked for in the prompt. A jailbroken instruction cannot reach a market
//     the workspace has not subscribed to.
//   • CONSENT. The co-pilot may PROPOSE changes to the live workspace; it never
//     applies them. Actions are staged and the user approves.
//
// Two modes on one route:
//   mode 'chat' (default) — the streaming analyst loop.
//   mode 'take'           — a short analyst framing of a finding the engine has
//                           already computed. It reframes; it cannot renumber.
// ───────────────────────────────────────────────────────────────────────────
import Anthropic from '@anthropic-ai/sdk'
import { PACK_LIST, getPack } from '../src/engine/rulepacks/index.js'
import { FLEET } from '../src/data/fleet.js'
import { TOOL_SPECS } from '../src/engine/toolspec.js'
import { fleetSourceFrom, runToolSafe, type ToolContext, type WorkspaceAction } from '../src/engine/tools.js'
import type { CountryId, Vehicle } from '../src/engine/types.js'
import { getCurrent } from './_store.js'
import { requireSession } from './_auth.js'
import { allow } from './_ratelimit.js'

const MODEL = 'claude-opus-5'
/** Where a policy refusal is re-run server-side, so a benign compliance question
 *  never dead-ends on a classifier. Opt-in, and degraded gracefully below. */
const FALLBACK_MODEL = 'claude-opus-4-8'
const FALLBACK_BETA = 'server-side-fallback-2026-06-01'
const MAX_TURNS = 10
const ALL: CountryId[] = ['EU', 'IN', 'AU', 'UK', 'CN']

// ── the workspace's own data ────────────────────────────────────────────────
// The co-pilot must reason over exactly what the screens show. Answering from
// the shared baseline while the user looks at their own import would be worse
// than not answering at all.
async function loadFleets(workspace: string) {
  const rows: Partial<Record<CountryId, Vehicle[]>> = {}
  const metas: Partial<Record<CountryId, { datasetVersion: string; lastRefreshed: string | null; source: string }>> = {}
  await Promise.all(PACK_LIST.map(async (p) => {
    rows[p.id] = FLEET[p.id]
    try {
      const data = await getCurrent(p.id, workspace)
      if (data?.vehicles?.length) {
        rows[p.id] = data.vehicles
        metas[p.id] = { datasetVersion: data.meta.datasetVersion, lastRefreshed: data.meta.lastRefreshed, source: data.meta.source }
      }
    } catch { /* keep the bundled extract */ }
  }))
  return fleetSourceFrom(rows, metas)
}

// ── the prompt ──────────────────────────────────────────────────────────────

/** The stable half. Byte-identical across requests so it caches; every volatile
 *  fact (which screen, which maker, which year) lives in the block after it. */
function doctrine(allowed: CountryId[], pooling: boolean): string {
  const packs = PACK_LIST.filter((p) => allowed.includes(p.id)).map((p) =>
    `- ${p.name} (${p.id}): limit in ${p.metricUnit}. ${p.limitNote} Penalty: ${p.fineRateLabel}. Transfer: ${p.transfer.note} Years ${p.years[0]}–${p.years[p.years.length - 1]}. Data: ${p.coverage.tier}.`,
  ).join('\n')

  return `You are AiRE, the analyst inside an emissions-compliance control room used by manufacturers, their regulatory affairs teams and their boards.

# The one rule
Never compute, estimate, recall or round a number yourself. Every emissions figure, limit, gap, fine, cost, share, probability or price must come back from a tool in this same turn. If no tool can produce a figure, say what is missing rather than approximating it. You may compose and compare tool results; you may not derive new ones. Quote a fine's plain-language maths when you state a fine.

# Choosing a tool
- Where does X stand / how big is the gap / what is the fine → get_position.
- How do we fix it / what is cheapest / can we clear it → cheapest_path.
- How likely / what range / worst case / what should we provision → simulate_risk. A point estimate cannot answer these.
- More than one year / when do we breach / is the trajectory viable → run_forecast.
- Why did it move / what is driving this → outlook_bridge.
- Surplus, headroom, credits, buying, selling, banking → credit_ledger first, because it tells you whether the instrument exists at all.
- Across our markets / where are we most exposed → portfolio.
- How does the regulation work / why is the limit that number → regulation_brief.
- Before any answer a board or a regulator would act on, and always when the dataset coverage is "preview" → data_quality.
Call tools in parallel when they are independent. Prefer one well-aimed call over three speculative ones.

# Regime doctrine — getting these wrong is a factual error, not a style choice
- Exposure is assessed PER MAKER. A market whose average sits under the line routinely carries very large exposure, because a clean maker offsets a dirty one in the mean. For a market, always read marketFine and makersOver.
- The EU has NO transfer instrument. Article 6 pooling makes members share one fleet average; nothing is issued, transferred, priced or banked. Headroom there is real and valuable, but it moves by joining a pool. Never write "sell credits", "credit price" or "banked position" for the EU.
- China does not have an "over the line" verdict. It has a two-axis credit balance (CAFC fuel economy + NEV volume). Use dual_credit, and describe the position in credits.
- India runs fiscal years — FY2027-28, not 2027 — and CAFE III moves the homologation cycle from MIDC to WLTP, which lifts the fleet number by roughly a fifth with no change to any vehicle. Flag the basis whenever it matters.
- A "preview" dataset is arithmetically correct over an unrepresentative sample fleet. Say so in the answer; never present it as a market position.

# Driving the workspace
update_workspace PROPOSES a change; it does not apply one. The user approves it. Use it whenever they ask to see, open, switch to or change something, pair it with the tool that computes the numbers so your words match the screen, and always fill \`why\`.

# Entitlements
This workspace has subscribed to: ${allowed.join(', ') || 'no markets'}.${pooling ? '' : ' The Pooling & credit-market add-on is NOT active.'} Markets outside that list are refused by the tools and must not be analysed or mentioned.

# The markets you may use
${packs}

# Communicating
Lead with the answer. The first sentence should be what the user would ask for if they said "just give me the headline"; supporting detail and reasoning come after. Keep responses focused and brief — most questions deserve a short paragraph, not a report. Use the market's own units and currency. Write in complete sentences, not fragments or arrow chains, and spell out terms rather than abbreviating them. Use a table only for short enumerable facts. Do not narrate your tool calls, do not restate the question, and do not open with a preamble.

Deliver what was asked at the scope intended. Make routine judgment calls yourself; check in only when different readings would lead to materially different work. If you think the question rests on a wrong premise, say so in a sentence and answer it anyway.

Formatting available to you: **bold**, \`code\` for figures worth isolating, - bullets, and ### headings for a genuinely multi-part answer.`
}

/** The volatile half — never cached, always last. */
function situation(ctx: any): string {
  const c = ctx?.country as CountryId | undefined
  const pack = c && ALL.includes(c) ? getPack(c) : null
  const s = ctx?.scenario ?? {}
  return `Right now the user is looking at: market=${pack?.name ?? ctx?.country ?? '—'}, maker=${ctx?.parent ?? '—'}, screen=${ctx?.screen ?? '—'}, year=${s.year ?? '—'}, forced zero-emission share=${s.evSharePct ?? 'as-sold'}, mass shift=${s.massShiftKg ?? 0}kg, reading depth=${ctx?.viewMode ?? 'analyst'}. Today is ${new Date().toISOString().slice(0, 10)}. Default to this market, maker and year when the user does not name one.`
}

const TAKE_SYSTEM = `You are AiRE, a senior emissions-compliance analyst. You are handed a FINDING a deterministic engine has ALREADY computed — a headline, engine-verified metrics, a situation, a severity and a recommendation.

Write a crisp 2–3 sentence analyst take for a compliance lead: what it means, what to weigh, and the first move. Add judgment and framing, not new facts.

Hard rules: never invent, alter, round or contradict a number, and reference only the metrics given. Never contradict the recommendation — sharpen it. Plain prose only: no headings, no bullets, no preamble like "Here's my take". Be specific and direct.`

// ── SSE plumbing ────────────────────────────────────────────────────────────
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

/** What the model is told a tool returned. Compact — the full envelope goes to
 *  the audit trail, not into the context window. */
function toolResultForModel(r: { ok: boolean; result?: any; error?: any }): string {
  if (!r.ok) return JSON.stringify({ error: r.error.code, message: r.error.message })
  const { value, provenance } = r.result
  return JSON.stringify({
    ...(value as object),
    _provenance: { dataset: provenance.dataVersion, coverage: provenance.coverage, basis: provenance.basis, refreshed: provenance.refreshed },
  })
}

export default async function handler(req: any, res: any) {
  // This route spends the server's Anthropic key: a session, then a per-workspace
  // ceiling. Without both, a deployed URL is an open frontier-model endpoint.
  const session = requireSession(req, res)
  if (!session) return
  if (!allow(res, session.workspace, 'copilot')) return
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return }
  if (!process.env.ANTHROPIC_API_KEY) { res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set on the server.' }); return }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
  const mode: 'chat' | 'take' = body.mode === 'take' || (body.finding && !body.message) ? 'take' : 'chat'
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const send = sse(res)

  // ── mode: take ────────────────────────────────────────────────────────────
  if (mode === 'take') {
    if (!body.finding) { send('error', { error: 'finding is required' }); res.end(); return }
    try {
      const stream = client.messages.stream({
        model: MODEL, max_tokens: 600,
        output_config: { effort: 'low' },
        system: TAKE_SYSTEM,
        messages: [{ role: 'user', content: JSON.stringify(body.finding) }],
      })
      for await (const ev of stream) {
        if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') send('delta', { text: ev.delta.text })
      }
      const final = await stream.finalMessage()
      if (final.stop_reason === 'refusal') send('error', { error: 'The model declined to frame this finding. The engine numbers stand on their own.' })
      send('done', {})
    } catch (e: any) {
      send('error', { error: String(e?.message ?? e) })
    }
    res.end()
    return
  }

  // ── mode: chat ────────────────────────────────────────────────────────────
  const message = String(body.message ?? '').trim()
  if (!message) { send('error', { error: 'message is required' }); res.end(); return }

  const reqCtx = body.context ?? {}
  // Entitlement claims still originate on the client (billing is mocked — see
  // docs/PACKAGING.md). Clamping them to known markets and enforcing them in the
  // tool executor is the half that does not depend on the client being honest.
  const allowed: CountryId[] = (Array.isArray(reqCtx.ownedModules) ? reqCtx.ownedModules : ALL).filter((c: unknown): c is CountryId => ALL.includes(c as CountryId))
  const pooling = reqCtx.pooling !== false

  const actions: WorkspaceAction[] = []
  const toolCtx: ToolContext = { fleet: await loadFleets(session.workspace), allowed, pooling, actions }

  const tools = TOOL_SPECS.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema })) as Anthropic.Tool[]

  const messages: Anthropic.MessageParam[] = [
    ...(Array.isArray(body.history) ? body.history : [])
      .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .slice(-10)
      .map((m: any) => ({ role: m.role as 'user' | 'assistant', content: String(m.content) })),
    { role: 'user', content: message },
  ]

  send('ready', { model: MODEL, tools: TOOL_SPECS.map((t) => t.name), markets: allowed })

  const audit: unknown[] = []
  let useFallback = true
  let usage = { input: 0, output: 0, cacheRead: 0 }

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const params = {
        model: MODEL,
        max_tokens: 8000,
        // Adaptive thinking is on by default on Opus 5; asking for the summary is
        // what makes the reasoning visible in the trace instead of a silent pause.
        thinking: { type: 'adaptive' as const, display: 'summarized' as const },
        output_config: { effort: 'high' as const },
        system: [
          { type: 'text' as const, text: doctrine(allowed, pooling), cache_control: { type: 'ephemeral' as const } },
          { type: 'text' as const, text: situation(reqCtx) },
        ],
        tools,
        messages,
      }

      // Server-side fallback re-runs a policy refusal on another model in the
      // same call. It is a beta; if this deployment's account does not carry it,
      // drop it once and carry on rather than failing the user's question.
      let stream: ReturnType<typeof client.messages.stream>
      if (useFallback) {
        try {
          stream = client.beta.messages.stream({
            ...params, betas: [FALLBACK_BETA], fallbacks: [{ model: FALLBACK_MODEL }],
          } as any) as any
        } catch { useFallback = false; stream = client.messages.stream(params) }
      } else {
        stream = client.messages.stream(params)
      }

      const pending = new Map<number, string>()
      try {
        for await (const ev of stream as any) {
          if (ev.type === 'content_block_start') {
            if (ev.content_block.type === 'tool_use') {
              pending.set(ev.index, ev.content_block.name)
              send('tool_start', { id: ev.content_block.id, name: ev.content_block.name })
            } else if (ev.content_block.type === 'thinking') {
              send('thinking_start', {})
            }
          } else if (ev.type === 'content_block_delta') {
            if (ev.delta.type === 'text_delta') send('text', { text: ev.delta.text })
            else if (ev.delta.type === 'thinking_delta') send('thinking', { text: ev.delta.thinking })
          }
        }
      } catch (e: any) {
        // A rejected beta surfaces on connect, before any content — retry clean.
        if (useFallback && turn === 0 && /beta|fallback/i.test(String(e?.message ?? ''))) {
          useFallback = false
          turn--
          continue
        }
        throw e
      }

      const final = await (stream as any).finalMessage()
      usage = {
        input: usage.input + (final.usage?.input_tokens ?? 0),
        output: usage.output + (final.usage?.output_tokens ?? 0),
        cacheRead: usage.cacheRead + (final.usage?.cache_read_input_tokens ?? 0),
      }

      if (final.stop_reason === 'refusal') {
        send('error', { error: 'The model declined this request. Rephrase it as a compliance question about your subscribed markets.' })
        break
      }

      if (final.stop_reason === 'tool_use') {
        messages.push({ role: 'assistant', content: final.content })
        const results: Anthropic.ToolResultBlockParam[] = []
        const before = actions.length

        for (const block of final.content) {
          if (block.type !== 'tool_use') continue
          const r = runToolSafe(block.name, block.input, toolCtx)
          const entry = r.ok
            ? { id: block.id, name: block.name, ok: true, inputs: r.result.inputs, ms: r.result.ms, provenance: r.result.provenance, value: r.result.value }
            : { id: block.id, name: block.name, ok: false, inputs: block.input, error: r.error }
          audit.push(entry)
          send('tool_end', entry)
          results.push({ type: 'tool_result', tool_use_id: block.id, content: toolResultForModel(r), ...(r.ok ? {} : { is_error: true }) })
        }

        // Anything update_workspace staged this turn, surfaced for approval.
        for (const a of actions.slice(before)) send('action', { action: a })

        messages.push({ role: 'user', content: results })
        continue
      }

      // end_turn (or max_tokens) — the answer is complete.
      send('done', { stopReason: final.stop_reason, usage, toolCalls: audit.length, turns: turn + 1 })
      res.end()
      return
    }

    send('error', { error: 'I could not finish that within the tool budget — try narrowing the question.' })
  } catch (e: any) {
    send('error', { error: String(e?.message ?? e) })
  }
  send('done', { stopReason: 'aborted', usage, toolCalls: audit.length })
  res.end()
}

export const config = { maxDuration: 120 }
