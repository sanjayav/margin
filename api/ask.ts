// ───────────────────────────────────────────────────────────────────────────
// /api/ask — the Margin AI analyst (Vercel serverless function)
//
// Claude (claude-opus-4-8) understands the question and narrates the answer;
// EVERY number is computed by the deterministic engine via tool use. The model
// never does arithmetic — it calls query_compliance / get_recommendations and
// explains the exact figures the engine returns. update_dashboard lets it drive
// the live UI. This is what keeps the answers as trustworthy as the chart.
// ───────────────────────────────────────────────────────────────────────────
import Anthropic from '@anthropic-ai/sdk'
import { getPack, PACK_LIST } from '../src/engine/rulepacks'
import { FLEET } from '../src/data/fleet'
import { buildTree, aggregateParent, fmtNum } from '../src/engine/engine'
import { recommend } from '../src/engine/recommend'
import type { CountryId, Scenario, Vehicle } from '../src/engine/types'
import { getCurrent } from './_store'

const MODEL = 'claude-opus-4-8'
type Fleets = Record<CountryId, Vehicle[]>

/** Live fleet from the store (Neon or local), else the bundled extract — so the
 *  analyst's numbers match what the screens show. */
async function loadFleets(): Promise<Fleets> {
  const out: Fleets = { EU: FLEET.EU, IN: FLEET.IN, AU: FLEET.AU, UK: FLEET.UK }
  await Promise.all(
    PACK_LIST.map(async (p) => {
      try {
        const data = await getCurrent(p.id)
        if (data?.vehicles?.length) out[p.id] = data.vehicles
      } catch { /* keep extract */ }
    }),
  )
  return out
}

function parentsOf(fleets: Fleets, country: CountryId): string[] {
  return [...new Set(fleets[country].map((v) => v.parent))].sort()
}

function defaultScenario(country: CountryId): Scenario {
  const pack = getPack(country)
  return {
    year: pack.years[0],
    evSharePct: null,
    salesMultiplier: 1,
    massShiftKg: 0,
    ecoBoostG: 0,
    poolingEnabled: false,
    superCreditsEnabled: country === 'IN',
  }
}

function buildScenario(country: CountryId, o: any = {}): Scenario {
  const s = defaultScenario(country)
  if (o.year != null) s.year = o.year
  if (o.evSharePct != null) s.evSharePct = o.evSharePct
  if (o.salesMultiplier != null) s.salesMultiplier = o.salesMultiplier
  if (o.massShiftKg != null) s.massShiftKg = o.massShiftKg
  if (o.ecoBoostG != null) s.ecoBoostG = o.ecoBoostG
  if (o.poolingEnabled != null) s.poolingEnabled = o.poolingEnabled
  if (o.superCreditsEnabled != null) s.superCreditsEnabled = o.superCreditsEnabled
  return s
}

function summarize(fleets: Fleets, country: CountryId, parent: string | null, o: any) {
  const pack = getPack(country)
  const scenario = buildScenario(country, o)
  const agg = parent
    ? aggregateParent(fleets[country], pack, scenario, parent)
    : buildTree(fleets[country], pack, scenario)
  return {
    market: pack.name,
    entity: parent ?? 'Whole market',
    year: scenario.year,
    unit: pack.metricUnit,
    currency: pack.currency,
    fleetMetric: +fmtNum(agg.avgMetric, 2),
    limit: +fmtNum(agg.limit, 2),
    gap: +fmtNum(agg.gap, 2),
    status: agg.status,
    fine: Math.round(agg.fine),
    fineExpression: agg.fineMath.expression,
    registrations: agg.rawUnits,
    zeroEmissionSharePct: Math.round(agg.zlevShare * 100),
  }
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'list_makers',
    description: 'List the car makers (compliance parents) available in a market.',
    input_schema: {
      type: 'object',
      properties: { country: { type: 'string', enum: ['EU', 'IN', 'AU', 'UK'] } },
      required: ['country'],
    },
  },
  {
    name: 'query_compliance',
    description:
      'Compute a maker\'s (or the whole market\'s) compliance position for a given year and optional scenario assumptions. Returns the exact weighted-average fleet emissions, the legal limit, the gap, the projected fine and its plain-language maths. Always use this for any number — never estimate.',
    input_schema: {
      type: 'object',
      properties: {
        country: { type: 'string', enum: ['EU', 'IN', 'AU', 'UK'] },
        parent: { type: 'string', description: 'Maker name, or omit for the whole market.' },
        year: { type: 'integer' },
        evSharePct: { type: 'number', description: 'Force the zero-emission sales share, 0-95.' },
        massShiftKg: { type: 'number', description: 'Shift average vehicle mass in kg (moves the limit and CO₂).' },
        salesMultiplier: { type: 'number', description: 'Scale total registrations, e.g. 1.1 = +10%.' },
        ecoBoostG: { type: 'number', description: 'Extra eco-innovation credit, g/km, 0-7.' },
        poolingEnabled: { type: 'boolean' },
        superCreditsEnabled: { type: 'boolean' },
      },
      required: ['country', 'year'],
    },
  },
  {
    name: 'get_recommendations',
    description:
      'Run the "get me under the line" optimiser for a maker: the cheapest realistic ranked set of changes to clear the limit, each with a cost, difficulty and the fine it avoids.',
    input_schema: {
      type: 'object',
      properties: {
        country: { type: 'string', enum: ['EU', 'IN', 'AU', 'UK'] },
        parent: { type: 'string' },
        year: { type: 'integer' },
      },
      required: ['country', 'parent', 'year'],
    },
  },
  {
    name: 'update_dashboard',
    description:
      'Reconfigure the live screen the user is looking at. Call this whenever the user asks to see, open, switch to, or change something — it moves the market, maker, screen, year, or any live assumption. Use alongside query_compliance so your spoken answer matches the screen.',
    input_schema: {
      type: 'object',
      properties: {
        country: { type: 'string', enum: ['EU', 'IN', 'AU', 'UK'] },
        screen: { type: 'string', enum: ['analyze', 'plan', 'under', 'pool', 'forecast', 'intel', 'admin'] },
        parent: { type: 'string' },
        year: { type: 'integer' },
        evSharePct: { type: 'number' },
        massShiftKg: { type: 'number' },
        salesMultiplier: { type: 'number' },
        ecoBoostG: { type: 'number' },
        poolingEnabled: { type: 'boolean' },
        superCreditsEnabled: { type: 'boolean' },
      },
    },
  },
]

function runTool(name: string, input: any, actions: any[], fleets: Fleets): string {
  try {
    if (name === 'list_makers') {
      return JSON.stringify({ makers: parentsOf(fleets, input.country) })
    }
    if (name === 'query_compliance') {
      return JSON.stringify(summarize(fleets, input.country, input.parent ?? null, input))
    }
    if (name === 'get_recommendations') {
      const pack = getPack(input.country as CountryId)
      const plan = recommend(fleets[input.country as CountryId], pack, buildScenario(input.country, input), input.parent)
      return JSON.stringify({
        maker: plan.parent,
        currency: pack.currency,
        fineBefore: Math.round(plan.fineBefore),
        fineAfter: Math.round(plan.fineAfter),
        clearedTheLimit: plan.cleared,
        totalCost: Math.round(plan.totalCost),
        actions: plan.actions.map((a, i) => ({
          rank: i + 1,
          title: a.title,
          detail: a.detail,
          difficulty: a.difficulty,
          cost: Math.round(a.cost),
          clears: +fmtNum(a.gramsCleared, 2),
          unit: pack.metricUnit,
          fineAvoided: Math.round(a.fineAvoided),
        })),
      })
    }
    if (name === 'update_dashboard') {
      actions.push(input)
      return 'Dashboard updated for the user.'
    }
    return JSON.stringify({ error: `unknown tool ${name}` })
  } catch (e: any) {
    return JSON.stringify({ error: String(e?.message ?? e) })
  }
}

function systemPrompt(ctx: any): string {
  const packs = PACK_LIST.map(
    (p) =>
      `- ${p.flag} ${p.name}: limit in ${p.metricUnit}; ${p.limitNote} Fine: ${p.fineRateLabel}. Pooling ${p.pooling.enabled ? 'allowed' : 'per-maker'}. Years ${p.years[0]}–${p.years[p.years.length - 1]}.`,
  ).join('\n')
  return `You are the analyst inside Margin, an emissions-compliance control room for car makers in the EU, India, Australia and the UK.

Your job: answer the user's question precisely and, when they want to see or change something, drive the live screen with update_dashboard.

ACCURACY IS NON-NEGOTIABLE. Never compute or estimate a number yourself. Every emissions figure, limit, gap, fine, cost or share must come from query_compliance or get_recommendations. If a question needs a number, call the tool first, then answer using exactly what it returns. Quote the fine's plain maths (the fineExpression) when you state a fine.

The four markets (country differences live in rule packs):
${packs}

The user is currently looking at: market=${ctx.country}, maker=${ctx.parent}, screen=${ctx.screen}, year=${ctx.scenario?.year}, forced zero-emission share=${ctx.scenario?.evSharePct ?? 'as-sold'}, mass shift=${ctx.scenario?.massShiftKg ?? 0}kg.

Style: concise and direct — lead with the answer, then one or two supporting sentences. Use the market's units and currency. When you change the view, say what you changed. Don't narrate tool calls.`
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' })
    return
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set on the server.' })
    return
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
  const { message, history = [], context = {} } = body
  if (!message) {
    res.status(400).json({ error: 'message is required' })
    return
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const actions: any[] = []
  const fleets = await loadFleets()

  const messages: Anthropic.MessageParam[] = [
    ...history
      .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-8)
      .map((m: any) => ({ role: m.role, content: m.content })),
    { role: 'user', content: String(message) },
  ]

  try {
    for (let i = 0; i < 6; i++) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 2048,
        thinking: { type: 'adaptive' },
        system: systemPrompt(context),
        tools: TOOLS,
        messages,
      })

      if (response.stop_reason === 'tool_use') {
        messages.push({ role: 'assistant', content: response.content })
        const results: Anthropic.ToolResultBlockParam[] = []
        for (const block of response.content) {
          if (block.type === 'tool_use') {
            results.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: runTool(block.name, block.input, actions, fleets),
            })
          }
        }
        messages.push({ role: 'user', content: results })
        continue
      }

      const answer = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim()
      res.status(200).json({ answer, actions })
      return
    }
    res.status(200).json({ answer: 'I could not finish that — try narrowing the question.', actions })
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message ?? e) })
  }
}

export const config = { maxDuration: 60 }
