// ───────────────────────────────────────────────────────────────────────────
// TOOL SPECIFICATIONS — the contract the co-pilot reads.
//
// Plain JSON Schema, deliberately free of any SDK import, so the same catalogue
// can be sent to the model, rendered in the audit trail, and asserted in tests.
// Every description says WHEN to call the tool, not just what it does: that is
// what decides whether a question is answered from the engine or from memory.
//
// Names here MUST match src/engine/tools.ts · TOOL_REGISTRY.
// ───────────────────────────────────────────────────────────────────────────

export interface ToolSpec {
  name: string
  description: string
  input_schema: { type: 'object'; properties: Record<string, unknown>; required?: string[] }
  /** Grouping for the audit trail UI. */
  group: 'position' | 'action' | 'risk' | 'market' | 'governance' | 'workspace'
  /** Shown on the trace chip while the tool runs. */
  label: string
}

const MARKET = { type: 'string', enum: ['EU', 'IN', 'AU', 'UK', 'CN'], description: 'Market the workspace is subscribed to.' }
const YEAR = { type: 'integer', description: 'Compliance year. Defaults to the market’s current year.' }
const MAKER = { type: 'string', description: 'Compliance entity (manufacturer parent). Partial names resolve; call list_makers if unsure.' }

const LEVERS = {
  evSharePct: { type: 'number', description: 'Force the zero-emission sales share, 0–95. Omit to keep the as-sold mix.' },
  salesMultiplier: { type: 'number', description: 'Scale registrations, e.g. 1.1 = +10%.' },
  massShiftKg: { type: 'number', description: 'Shift average vehicle mass in kg — moves the mass-based limit AND the fleet number.' },
  ecoBoostG: { type: 'number', description: 'Extra certified eco-innovation credit, capped by the regime.' },
  targetShiftPct: { type: 'number', description: 'Stress the statutory target itself, % (regulatory sensitivity).' },
  cycleWltp: { type: 'boolean', description: 'India only — apply the MIDC→WLTP cycle conversion for CAFE III.' },
  poolingEnabled: { type: 'boolean' },
  superCreditsEnabled: { type: 'boolean' },
  phevUF: { type: 'boolean', description: 'EU — apply the 2025 PHEV utility-factor correction.' },
  creditPrice: { type: 'number', description: 'Override the traded credit price.' },
}

export const TOOL_SPECS: ToolSpec[] = [
  {
    name: 'list_makers', group: 'position', label: 'Listing makers',
    description:
      'List the compliance entities in a market with their registrations. Call this FIRST whenever the user names a maker you have not already resolved, or asks "who" questions — it prevents guessing at a name that does not exist in the dataset.',
    input_schema: { type: 'object', properties: { country: MARKET, year: YEAR }, required: ['country'] },
  },
  {
    name: 'get_position', group: 'position', label: 'Reading the position',
    description:
      'The compliance position: weighted-average fleet emissions, the statutory limit, the gap, the projected fine and its plain-language maths. Omit `maker` for the whole market, which additionally returns every maker ranked by exposure. THIS IS THE DEFAULT TOOL — call this for any question about where someone stands, how big a gap is, or what a fine is. Pass levers to answer "what if" in a single year. For the whole market, read marketFine (the SUM of per-maker fines): a market average under the line does NOT mean zero exposure.',
    input_schema: { type: 'object', properties: { country: MARKET, year: YEAR, maker: MAKER, ...LEVERS }, required: ['country'] },
  },
  {
    name: 'cheapest_path', group: 'action', label: 'Costing the fix',
    description:
      'Run the get-under-the-line optimiser for one maker: a ranked, costed set of changes that clears the limit, each with a cost, a difficulty and the fine it avoids. Call this for any "how do we fix it", "what should we do", "what is cheapest" or "can we clear it" question. Do not propose remedies without it — the ranking is €-per-unit-cleared, which is rarely what intuition picks.',
    input_schema: { type: 'object', properties: { country: MARKET, maker: MAKER, year: YEAR, ...LEVERS }, required: ['country', 'maker'] },
  },
  {
    name: 'simulate_risk', group: 'risk', label: 'Simulating exposure',
    description:
      'Monte-Carlo exposure: samples zero-emission share, volume and mass uncertainty over 300 draws and returns P10/P50/P90, the mean and the probability of a fine. REQUIRED for any question mentioning likelihood, chance, probability, range, confidence, worst case, downside, P90, or what to provision. get_position returns a single point estimate and cannot answer these.',
    input_schema: { type: 'object', properties: { country: MARKET, year: YEAR, maker: MAKER }, required: ['country'] },
  },
  {
    name: 'run_forecast', group: 'risk', label: 'Projecting the horizon',
    description:
      'Project a maker or the whole market across the regime’s multi-year horizon under a plan, returning the first breach year, cumulative exposure, the peak year, the final-year gap and the zero-emission share needed to clear it. Call this for anything spanning more than one year — "to 2030", "over the horizon", "when do we breach", "is the trajectory viable". Levers may ramp: {"from": 8, "to": 45} interpolates linearly across the horizon, which is how a real adoption path is expressed.',
    input_schema: {
      type: 'object',
      properties: {
        country: MARKET,
        target: { type: 'string', description: 'A maker name, or "market" for the whole market.' },
        years: { type: 'array', items: { type: 'integer' }, description: 'Subset of the horizon. Omit for the full regime horizon.' },
        levers: {
          type: 'object',
          description: 'Plan levers. Each is a flat number or a {from,to} ramp across the horizon.',
          properties: {
            evSharePct: { description: 'Zero-emission share: 45 or {"from":8,"to":45}.' },
            salesMultiplier: { description: 'Volume: 1.02 or {"from":1,"to":1.15}.' },
            massShiftKg: { description: 'Mass drift in kg.' },
            ecoBoostG: { description: 'Eco-innovation credit.' },
            targetShiftPct: { description: 'Regulatory stress on the target itself, %.' },
          },
        },
      },
      required: ['country'],
    },
  },
  {
    name: 'outlook_bridge', group: 'risk', label: 'Attributing the change',
    description:
      'Explain WHY exposure moved between two years: a sequential bridge attributing the change to regulation, volume, CO₂/mass technology and zero-emission mix, plus the ZE share at which the year breaks even. Call this for "why did it get worse", "what is driving this", "what moved the number" or when the user needs an attribution rather than a level.',
    input_schema: {
      type: 'object',
      properties: {
        country: MARKET, year: YEAR,
        drivers: {
          type: 'object', description: 'Override the fundamentals. Omit to use the market’s documented defaults.',
          properties: {
            marketGrowth: { type: 'number', description: 'Registration volume trend, %/yr.' },
            evShareHorizon: { type: 'number', description: 'Zero-emission share at the end of the horizon, %.' },
            iceCo2Improve: { type: 'number', description: 'Combustion CO₂ improvement, %/yr.' },
            massDrift: { type: 'number', description: 'Fleet mass drift, kg/yr.' },
          },
        },
      },
      required: ['country', 'year'],
    },
  },
  {
    name: 'credit_ledger', group: 'market', label: 'Reading the credit book',
    description:
      'The credit book: who holds headroom, who is short, what the instrument actually is in this regime, and what a position is worth where a price exists. Call this for any question about surplus, headroom, credits, buying, selling, banking or trading. CRITICAL: the returned `instrument` tells you whether trading exists at all — the EU has NO transfer instrument (headroom moves only by pooling; nothing is issued, sold, priced or banked), so never describe an EU position as a sale.',
    input_schema: { type: 'object', properties: { country: MARKET, year: YEAR }, required: ['country'] },
  },
  {
    name: 'optimise_pool', group: 'market', label: 'Optimising the pool',
    description:
      'Find the value-maximising pool for a market and the fair Shapley settlement per member: who pays, who receives, how much fine is removed and what residual remains. Call this for market-wide pooling or credit-market questions. Requires the Pooling add-on and a regime that permits pooling — the tool will say so if not.',
    input_schema: { type: 'object', properties: { country: MARKET, year: YEAR }, required: ['country'] },
  },
  {
    name: 'pool_partners', group: 'market', label: 'Finding partners',
    description:
      'Ranked ways ONE short maker can deal with its exposure — pool with a named surplus holder, buy credits, or pay the fine — each with a total cost. Call this when the user asks who a specific maker should partner with, or whether pooling beats paying.',
    input_schema: { type: 'object', properties: { country: MARKET, maker: MAKER, year: YEAR }, required: ['country', 'maker'] },
  },
  {
    name: 'dual_credit', group: 'market', label: 'Scoring both axes',
    description:
      'China only. The two-axis dual-credit position: CAFC (fuel-economy) credits, NEV (volume) balance, credits that must be bought after self-offset, the cost to clear and the implied battery demand. Use this INSTEAD of get_position whenever the user asks about the Chinese position in credit terms — China does not have an "over the line" verdict, it has a credit balance.',
    input_schema: { type: 'object', properties: { country: MARKET, year: YEAR }, required: ['country'] },
  },
  {
    name: 'pricing_impact', group: 'market', label: 'Pricing per car',
    description:
      'Compliance economics per vehicle: exposure per car, the cost to clear per car, and the credit cost per car where credits exist. Call this whenever the user frames the question commercially — margin, price, cost per unit, what it does to the business case.',
    input_schema: { type: 'object', properties: { country: MARKET, year: YEAR, maker: MAKER }, required: ['country'] },
  },
  {
    name: 'monthly_trace', group: 'position', label: 'Tracing the filing',
    description:
      'Where a maker stands part-way through the compliance year, month by month, with the running year-to-date average and the exposure if the year closed on that month. Also returns the EU 2025–2027 three-year averaging position where it applies. Call this for "how are we tracking", "year to date", "which month hurt us", or anything about a part-year filing.',
    input_schema: { type: 'object', properties: { country: MARKET, year: YEAR, maker: MAKER }, required: ['country'] },
  },
  {
    name: 'data_quality', group: 'governance', label: 'Checking the data',
    description:
      'Can these numbers be filed? Reconciliation checks plus an outlier scan over the dataset, with the coverage tier. Call this before any answer a regulator or a board would act on, whenever the user questions the numbers, and ALWAYS when the coverage tier is "preview" — a preview fleet is arithmetically correct over an unrepresentative dataset and must never be quoted as a market position without saying so.',
    input_schema: { type: 'object', properties: { country: MARKET, year: YEAR }, required: ['country'] },
  },
  {
    name: 'regulation_brief', group: 'governance', label: 'Reading the rule pack',
    description:
      'The rule pack in plain language: how the limit is constructed, the penalty formula, the flexibilities (eco-innovation cap, super-credits, pooling, transfer mechanism), the applicable regime and test cycle for a year, the limit for every year, and the source. Call this for "how does this work", "what does the regulation say", "why is the limit that number", or before asserting anything about the mechanics of a regime.',
    input_schema: { type: 'object', properties: { country: MARKET, year: YEAR }, required: ['country'] },
  },
  {
    name: 'portfolio', group: 'position', label: 'Rolling up the group',
    description:
      'Every subscribed market side by side: fleet, limit, makers over, exposure and coverage tier. Call this for group-level questions — "across our markets", "where are we most exposed", "which market needs attention". Exposures are in DIFFERENT currencies and must never be summed; compare relative severity instead.',
    input_schema: {
      type: 'object',
      properties: {
        countries: { type: 'array', items: MARKET, description: 'Subset to compare. Omit for every subscribed market.' },
        year: YEAR,
      },
    },
  },
  {
    name: 'update_workspace', group: 'workspace', label: 'Staging a change',
    description:
      'PROPOSE a change to the live workspace the user is looking at — switch market, select a maker, open a screen, set the year, or move an assumption. The change is staged for the user to approve, not applied silently. Call this whenever the user asks to see, open, switch to, show or change something, and pair it with the tool that computes the numbers so your answer matches the screen you are opening. Always fill `why` with a short plain-language reason.',
    input_schema: {
      type: 'object',
      properties: {
        country: MARKET,
        screen: {
          type: 'string',
          enum: ['analyse', 'scenario', 'model', 'under', 'compare', 'forecast', 'creditbook', 'pricing', 'pooling', 'data', 'intel', 'admin'],
          description: 'analyse = Plan, the actuals book of record (no levers reach it); scenario/model = the modelling workbench; under = the action plan; compare = scenario comparison; forecast = the multi-year studio; creditbook = the positions ledger; pricing = cost per car; data = imports & quality.',
        },
        parent: MAKER,
        drillPath: { type: 'array', items: { type: 'string' }, description: 'Drill scope: [maker] or [maker, model].' },
        year: YEAR,
        evSharePct: { type: 'number' },
        massShiftKg: { type: 'number' },
        salesMultiplier: { type: 'number' },
        ecoBoostG: { type: 'number' },
        mix: { type: 'object', description: 'Powertrain shares for the current scope, e.g. {"BEV":40,"HEV":35,"ICE":25}.' },
        creditPrice: { type: 'number' },
        phevUF: { type: 'boolean' },
        poolingEnabled: { type: 'boolean' },
        superCreditsEnabled: { type: 'boolean' },
        why: { type: 'string', description: 'One line the user sees on the approval chip.' },
      },
    },
  },
]

export const SPEC_BY_NAME: Record<string, ToolSpec> = Object.fromEntries(TOOL_SPECS.map((t) => [t.name, t]))

/** Label for a trace chip, falling back to the raw name for an unknown tool. */
export const toolLabel = (name: string): string => SPEC_BY_NAME[name]?.label ?? name
