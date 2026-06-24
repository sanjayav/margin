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
import { getPack, PACK_LIST } from '../src/engine/rulepacks/index.js'
import { FLEET } from '../src/data/fleet.js'
import { buildTree, aggregateParent, fmtNum } from '../src/engine/engine.js'
import { simulateRisk } from '../src/engine/montecarlo.js'
import { poolOptimise } from '../src/engine/pooling.js'
import { recommend } from '../src/engine/recommend.js'
import type { CountryId, Scenario, Vehicle } from '../src/engine/types.js'
import { getCurrent } from './_store.js'

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
  if (!parent) {
    // Fines are assessed PER MAKER — the whole-market exposure is the SUM of
    // per-maker fines, NOT the fine of the market-average (which is ~0 because a
    // clean maker offsets a dirty one in the average).
    const tree = buildTree(fleets[country], pack, scenario)
    const makers = (tree.children ?? []).filter((c) => c.rawUnits > 0)
    const fine = makers.reduce((a, c) => a + c.fine, 0)
    const over = makers.filter((c) => c.status === 'fine')
    return {
      market: pack.name, entity: 'Whole market', year: scenario.year, unit: pack.metricUnit, currency: pack.currency,
      fleetAverage: +fmtNum(tree.avgMetric, 2), limit: +fmtNum(tree.limit, 2), averageGap: +fmtNum(tree.gap, 2),
      marketFine: Math.round(fine),
      note: 'marketFine is the SUM of per-maker fines. The fleet average being under the line does NOT mean zero fines — assess each maker.',
      makersOverTheLine: over.length, makers: makers.length,
      registrations: tree.rawUnits, zeroEmissionSharePct: Math.round(tree.zlevShare * 100),
      perMaker: makers.map((c) => ({ maker: c.label, fleet: +fmtNum(c.avgMetric, 2), limit: +fmtNum(c.limit, 2), gap: +fmtNum(c.gap, 2), fine: Math.round(c.fine), status: c.status })),
    }
  }
  const agg = aggregateParent(fleets[country], pack, scenario, parent)
  return {
    market: pack.name,
    entity: parent,
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
        screen: { type: 'string', enum: ['analyze', 'analytics', 'data', 'pooling', 'plan', 'under', 'pool', 'forecast', 'intel', 'admin'] },
        parent: { type: 'string' },
        drillPath: { type: 'array', items: { type: 'string' }, description: 'Analyze drill scope: [maker] or [maker, model].' },
        year: { type: 'integer' },
        evSharePct: { type: 'number' },
        massShiftKg: { type: 'number' },
        salesMultiplier: { type: 'number' },
        ecoBoostG: { type: 'number' },
        mix: { type: 'object', description: 'Powertrain shares applied to the current scope, e.g. {"BEV":40,"HEV":35,"ICE":25}.' },
        creditPrice: { type: 'number' },
        phevUF: { type: 'boolean', description: 'EU: apply the 2025 PHEV utility-factor correction (default true).' },
        poolingEnabled: { type: 'boolean' },
        superCreditsEnabled: { type: 'boolean' },
      },
    },
  },
  {
    name: 'simulate_risk',
    description: 'Monte-Carlo €-at-risk: samples BEV-share, sales and mass uncertainty and re-runs the engine to return the fine distribution (P10/P50/P90, mean) and the probability of a fine, for a maker or the whole market. Use for "how likely", "worst case" or "P90" questions.',
    input_schema: {
      type: 'object',
      properties: { country: { type: 'string', enum: ['EU', 'IN', 'AU', 'UK'] }, parent: { type: 'string', description: 'Maker, or omit for the whole market.' }, year: { type: 'integer' } },
      required: ['country'],
    },
  },
  {
    name: 'optimise_pool',
    description: 'Find the value-maximising pool and the fair Shapley settlement per maker: who pays or receives and how much, the total fine removed, and the pool\'s residual fine. Use for pooling / credit-trading questions.',
    input_schema: {
      type: 'object',
      properties: { country: { type: 'string', enum: ['EU', 'IN', 'AU', 'UK'] }, year: { type: 'integer' } },
      required: ['country'],
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
    if (name === 'simulate_risk') {
      const country = input.country as CountryId
      const raw = fleets[country], pack = getPack(country), s = buildScenario(country, input)
      let r
      if (input.parent) {
        const by: any = {}; let tot = 0
        for (const v of raw) if (v.year === s.year && v.parent === input.parent) { by[v.powertrain] = (by[v.powertrain] || 0) + v.sales; tot += v.sales }
        const shares: any = {}; for (const p in by) shares[p] = tot ? (by[p] / tot) * 100 : 0
        r = simulateRisk({ base: s, groups: [{ key: input.parent, shares }], currentOverrides: {}, fineOf: (sc, ov) => aggregateParent(raw, pack, sc, input.parent, ov).fine, n: 300 })
      } else {
        const by: any = {}, tot: any = {}
        for (const v of raw) if (v.year === s.year) { (by[v.parent] ??= {})[v.powertrain] = (by[v.parent]?.[v.powertrain] || 0) + v.sales; tot[v.parent] = (tot[v.parent] || 0) + v.sales }
        const groups = Object.entries(by).map(([mk, b]: any) => { const sh: any = {}; for (const p in b) sh[p] = tot[mk] ? (b[p] / tot[mk]) * 100 : 0; return { key: mk, shares: sh } })
        r = simulateRisk({ base: s, groups, currentOverrides: {}, fineOf: (sc, ov) => { const t = buildTree(raw, pack, sc, ov); return (t.children || []).reduce((a, c) => a + c.fine, 0) }, n: 300 })
      }
      return JSON.stringify({ currency: pack.currency, scope: input.parent ?? 'whole market', year: s.year, p10: Math.round(r.p10), p50: Math.round(r.p50), p90: Math.round(r.p90), mean: Math.round(r.mean), probabilityOfAFine: +r.probOver.toFixed(2) })
    }
    if (name === 'optimise_pool') {
      const country = input.country as CountryId
      const raw = fleets[country], pack = getPack(country), s = buildScenario(country, input)
      const opt = poolOptimise(raw, pack, s)
      return JSON.stringify({
        currency: pack.currency, members: opt.members, fineRemoved: Math.round(opt.savings), pooledResidualFine: Math.round(opt.pooledFine),
        settlements: opt.split.map((m) => ({ maker: m.parent, role: m.role, standaloneFine: Math.round(m.standaloneFine), shapleyShare: Math.round(m.shapley), receives: m.finalCost < 0 ? Math.round(-m.finalCost) : 0, pays: m.finalCost > 0 ? Math.round(m.finalCost) : 0 })),
      })
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

ACCURACY IS NON-NEGOTIABLE. Never compute or estimate a number yourself. Every emissions figure, limit, gap, fine, cost, probability or share must come from a tool. Use query_compliance for a single position; get_recommendations for the cheapest way under the line; simulate_risk for probabilities, ranges or worst-case; optimise_pool for pooling/credit-trading. A question mentioning P10/P50/P90, "how likely", "chance", "range" or "worst case" REQUIRES simulate_risk — query_compliance returns only a point estimate. For the WHOLE market, the exposure is the marketFine field (the SUM of per-maker fines); the fleet average being under the line does NOT mean €0 — always check makersOverTheLine. Call the tool first, then answer using exactly what it returns; quote the fine's plain maths when you state a fine. update_dashboard drives the live screen and can also set the powertrain mix, credit price, PHEV utility factor and drill scope.

Entitlements: the user's organisation has subscribed to these markets ONLY: ${(ctx.ownedModules ?? ['EU', 'IN', 'AU', 'UK']).join(', ')}. Never analyse, mention or switch to any other market.${ctx.pooling === false ? ' The Pooling add-on is not active — do not use optimise_pool or open the pooling screen.' : ''}

The markets you may use (country differences live in rule packs):
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
