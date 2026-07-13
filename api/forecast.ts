// ───────────────────────────────────────────────────────────────────────────
// /api/forecast — the AI forecast studio engine (Vercel serverless function)
//
// Two grounded passes, streamed over SSE:
//   A. GENERATE — Claude reads the engine-computed baseline trajectory and turns
//      the user's prose ("if diesel is banned in 2027 and BEV supply is tight")
//      into 2–4 named ForecastScenarioDefs. It sets LEVERS, never outcomes.
//   B. BRIEF   — the server materialises each def and computes its real
//      trajectory with buildForecast, then Claude streams an executive brief
//      using exactly those engine numbers.
//
// Same invariant as /api/ask: the model narrates and shapes scenarios; every
// emissions figure, limit, gap and fine comes from the deterministic engine.
// ───────────────────────────────────────────────────────────────────────────
import Anthropic from '@anthropic-ai/sdk'
import { getPack, PACK_LIST } from '../src/engine/rulepacks/index.js'
import { FLEET } from '../src/data/fleet.js'
import {
  buildForecast, materializeSpec, summariseForecast, baselineScenario, MARKET_TARGET,
  type ForecastScenarioDef,
} from '../src/engine/forecast.js'
import { fmtNum } from '../src/engine/engine.js'
import type { CountryId, Vehicle } from '../src/engine/types.js'
import { getCurrent } from './_store.js'

const MODEL = 'claude-opus-4-8'
type Fleets = Record<CountryId, Vehicle[]>

const COLORS = ['emerald', 'amber', 'violet', 'sky', 'rose', 'teal', 'orange'] as const

/** Live fleet from the store (Neon or local), else the bundled extract — so the
 *  forecast's numbers match what the screens show. Mirrors /api/ask. */
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

function makersOf(fleets: Fleets, country: CountryId): string[] {
  return [...new Set(fleets[country].map((v) => v.parent))].sort()
}

/** Resolve the client's target to a maker name or the market sentinel. */
function resolveTarget(fleets: Fleets, country: CountryId, target: string | undefined): string {
  if (!target || target === MARKET_TARGET || target === '__market__') return MARKET_TARGET
  return makersOf(fleets, country).includes(target) ? target : MARKET_TARGET
}

/** The engine-computed baseline trajectory the AI generates against (no MC bands). */
function baselineContext(fleets: Fleets, country: CountryId, target: string) {
  const pack = getPack(country)
  const raw = fleets[country]
  const base = baselineScenario(pack)
  const fc = buildForecast({ raw, pack, target, baseline: base, plan: base, overrides: {}, bandN: 0 })
  const label = target === MARKET_TARGET ? 'Whole market' : target
  const rows = fc.years.map((y) => ({
    year: y.year, phase: y.note,
    limit: +fmtNum(y.bLimit, 1), fleet: +fmtNum(y.bMetric, 1), gap: +fmtNum(y.bGap, 2),
    fine: Math.round(y.bFine), zeNow: y.bShare, zeNeeded: y.req,
  }))
  return {
    market: pack.name, target: label, unit: pack.metricUnit, currency: pack.currency,
    years: [pack.years[0], pack.years[pack.years.length - 1]],
    firstBreachYear: fc.firstBreach?.year ?? null,
    cumExposureIfMixHolds: Math.round(fc.cumBase),
    limitTightensPct: fc.limitDropPct,
    evOnlyInfeasibleSomeYear: fc.years.some((y) => y.req == null && y.bGap > 0),
    rows,
  }
}

// ── Structured-output schema for scenario generation ──────────────────────────
const ramp = {
  anyOf: [
    { type: 'number' },
    { type: 'object', properties: { from: { type: 'number' }, to: { type: 'number' } }, required: ['from', 'to'], additionalProperties: false },
  ],
}
const leverNum = { anyOf: [{ type: 'null' }, { type: 'number' }, ramp] }
const leverBool = { anyOf: [{ type: 'null' }, { type: 'boolean' }] }

const SCENARIO_SCHEMA = {
  type: 'object',
  properties: {
    scenarios: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          color: { type: 'string', enum: [...COLORS] },
          levers: {
            type: 'object',
            properties: {
              evSharePct: leverNum,
              salesMultiplier: leverNum,
              massShiftKg: leverNum,
              ecoBoostG: leverNum,
              targetShiftPct: leverNum,
              poolingEnabled: leverBool,
              superCreditsEnabled: leverBool,
              phevUF: leverBool,
              creditPrice: { anyOf: [{ type: 'null' }, { type: 'number' }] },
            },
            required: ['evSharePct', 'salesMultiplier', 'massShiftKg', 'ecoBoostG', 'targetShiftPct', 'poolingEnabled', 'superCreditsEnabled', 'phevUF', 'creditPrice'],
            additionalProperties: false,
          },
          events: {
            type: 'array',
            items: { type: 'object', properties: { year: { type: 'integer' }, label: { type: 'string' } }, required: ['year', 'label'], additionalProperties: false },
          },
        },
        required: ['name', 'description', 'color', 'levers', 'events'],
        additionalProperties: false,
      },
    },
  },
  required: ['scenarios'],
  additionalProperties: false,
}

function generationSystem(country: CountryId, ownedNote: string): string {
  const pack = getPack(country)
  return `You are the scenario architect inside Autocred's forecast studio, an emissions-compliance control room for car makers.

The user describes a possible future in plain language. Your job: turn it into 2–4 DISTINCT, decision-useful forecast scenarios by setting LEVERS — you never compute outcomes (emissions, limits, gaps, fines). A deterministic engine computes every number from the levers you set.

Each scenario's \`levers\` object (set a lever to null to leave it as-sold / unchanged):
- evSharePct: FORCE the zero-emission sales share, 0–95. Use a {from,to} ramp to model an electrification pace across the horizon (e.g. {from:22,to:65}). null keeps the fleet's actual mix.
- salesMultiplier: scale registrations. 1 = as-sold, 1.2 = +20% growth, 0.8 = −20%. Ramp for a trajectory.
- massShiftKg: shift average vehicle mass in kg (+ = heavier/more SUVs, − = lightweighting). Moves BOTH fleet CO₂ and the mass-based limit.
- ecoBoostG: extra eco-innovation credit, g/km (0–7). ${pack.ecoCap ? 'Available in this market.' : 'This market has no eco-innovation mechanism — keep null.'}
- targetShiftPct: regulatory-stringency stress for DRAFT regimes (%). Negative = final rules land tighter than drafted. ${pack.regimeFor ? 'Relevant here (regime in transition).' : 'Keep null unless modelling a rule change.'}
- poolingEnabled: allow pooling / credit transfers. ${pack.pooling.enabled ? 'Allowed in this market.' : 'Pooling is per-maker here — keep null/false.'}
- superCreditsEnabled: EV super-credits (${country === 'IN' ? 'India — on by default' : 'off in this market'}).
- phevUF: EU 2025 PHEV utility-factor correction (${country === 'EU' ? 'set false to model the pre-2025 treatment' : 'keep null'}).
- creditPrice: override the credit trading price; null = pack default.

Rules:
- Ground ambition in the baseline you are given. If today's ZE share is 20%, a "modest" scenario might ramp to 35%, an "aggressive" one to 65% — don't invent 90% overnight.
- Make the scenarios span the decision: e.g. a downside/regulatory-shock, a base/current-trajectory, and an upside/mitigation. Name them crisply (2–4 words). Descriptions: one sentence each.
- Use \`events\` to pin narrative moments to a year (e.g. {year:2027, label:"Diesel ban"}). Display only.
- Set every lever key explicitly (null when unused). Emit ONLY levers this market supports.

${ownedNote}
Market: ${pack.flag} ${pack.name} — limit in ${pack.metricUnit}, fine ${pack.fineRateLabel}, years ${pack.years[0]}–${pack.years[pack.years.length - 1]}.`
}

const briefSystem = `You are the forecast analyst inside Autocred. Below are scenarios the deterministic engine has ALREADY computed. Write a tight executive brief (about 120–180 words, plain prose, no headers):
- Lead with the single most important takeaway.
- Explain what drives the divergence between the scenarios (which lever moved the fine).
- Call out when each scenario first breaches the limit and the final-year exposure.
- Name the cheapest credible hedge and, if pooling helps in this market, the pooling upside.
- End with one recommended action.
Every number here is engine-computed — cite the exact figures, never recompute or estimate. Use the market's units and currency. Be concise and direct.`

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return }

  // Validate the client's request before checking server config, so a malformed
  // request gets a 4xx even when the key is unset.
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
  const { prompt, context = {} } = body
  if (!prompt) { res.status(400).json({ error: 'prompt is required' }); return }

  const country: CountryId = (context.country ?? 'EU') as CountryId
  const owned: CountryId[] = context.ownedModules ?? ['EU', 'IN', 'AU', 'UK']
  if (!owned.includes(country)) { res.status(403).json({ error: `Market ${country} is not subscribed.` }); return }

  if (!process.env.ANTHROPIC_API_KEY) { res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set on the server.' }); return }

  // Open the SSE stream. From here, failures surface as an `error` event.
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()
  const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const fleets = await loadFleets()
    const target = resolveTarget(fleets, country, context.target)
    const pack = getPack(country)
    const raw = fleets[country]
    const base = baselineScenario(pack)
    const baseline = baselineContext(fleets, country, target)

    const ownedNote = `The user's organisation has subscribed to these markets ONLY: ${owned.join(', ')}. Only produce scenarios for ${pack.name}.`

    // ── Pass A: generate scenario definitions (structured, grounded on baseline) ──
    const genParams: any = {
      model: MODEL,
      max_tokens: 4096,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high', format: { type: 'json_schema', schema: SCENARIO_SCHEMA } },
      system: generationSystem(country, ownedNote),
      messages: [{
        role: 'user',
        content: `The user is forecasting ${baseline.target} in ${pack.name}. Their request:\n"${String(prompt)}"\n\nEngine-computed baseline (hold today's mix):\n${JSON.stringify(baseline)}`,
      }],
    }
    const genResp = await client.messages.create(genParams)
    const jsonText = (genResp.content.find((b: any) => b.type === 'text') as any)?.text ?? '{}'
    let defs: ForecastScenarioDef[] = []
    try { defs = (JSON.parse(jsonText).scenarios ?? []) as ForecastScenarioDef[] } catch { defs = [] }
    if (!defs.length) { send('error', { error: 'The model did not return any scenarios — try rephrasing.' }); res.end(); return }

    // ── Materialise + compute each scenario on the real engine ──
    const scenarios = defs.slice(0, 4).map((def, i) => {
      const id = `ai-${Date.now()}-${i}`
      const color = def.color && COLORS.includes(def.color as any) ? def.color : COLORS[i % COLORS.length]
      const spec = materializeSpec({ ...def, id, color }, base, pack.years)
      const fc = buildForecast({ raw, pack, target, baseline: base, plan: spec, overrides: {}, bandN: 0 })
      const summary = summariseForecast(fc)
      return {
        id, kind: 'ai' as const, name: def.name, description: def.description, color,
        levers: def.levers, events: def.events ?? [],
        summary,
        series: fc.years.map((y) => ({ year: y.year, metric: +fmtNum(y.lMetric, 1), limit: +fmtNum(y.lLimit, 1), gap: +fmtNum(y.lGap, 2), fine: Math.round(y.lFine) })),
      }
    })

    send('baseline', {
      target: baseline.target, market: pack.name, unit: pack.metricUnit, currency: pack.currency,
      series: baseline.rows.map((r) => ({ year: r.year, metric: r.fleet, limit: r.limit, gap: r.gap, fine: r.fine })),
      firstBreachYear: baseline.firstBreachYear, cumExposure: baseline.cumExposureIfMixHolds,
    })
    send('scenarios', { scenarios })

    // ── Pass B: stream the executive brief from the computed outcomes ──
    const briefInput = {
      market: pack.name, target: baseline.target, unit: pack.metricUnit, currency: pack.currency,
      poolingAllowed: pack.pooling.enabled,
      baseline: { firstBreachYear: baseline.firstBreachYear, cumExposureIfMixHolds: baseline.cumExposureIfMixHolds, limitTightensPct: baseline.limitTightensPct },
      scenarios: scenarios.map((s) => ({ name: s.name, description: s.description, levers: s.levers, ...s.summary })),
    }
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 1200,
      thinking: { type: 'adaptive' },
      system: briefSystem,
      messages: [{ role: 'user', content: JSON.stringify(briefInput) }],
    })
    for await (const ev of stream) {
      if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') send('brief_delta', { text: ev.delta.text })
    }

    send('done', {})
    res.end()
  } catch (e: any) {
    // If the stream is open, emit an error event; otherwise fall back to JSON.
    try { send('error', { error: String(e?.message ?? e) }); res.end() }
    catch { if (!res.headersSent) res.status(500).json({ error: String(e?.message ?? e) }) }
  }
}

export const config = { maxDuration: 60 }
