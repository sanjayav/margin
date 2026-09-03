// ───────────────────────────────────────────────────────────────────────────
// /api/agents — the agent runner.
//
// Every module in the platform is fronted by an agent, and every one of them
// runs through this single route. That is deliberate: one runner means one
// place where authorisation, entitlement, auditing and — most importantly —
// the VALIDATION GATE are enforced.
//
// The shape of a run:
//
//   1. AUTHORISE.   Session decides who you are; the signed role decides what
//                   you may run. Neither is taken from the request body.
//   2. GATHER.      The model works only through the deterministic tool layer
//                   (src/engine/tools.ts). It has no way to state a number that
//                   did not come back from a tool call, and every call is
//                   streamed to the client with its provenance.
//   3. PROPOSE.     The agent may draft a change — expressed as INPUT levers,
//                   never as an expected output.
//   4. VALIDATE.    The engine re-derives the entire position from those levers
//                   server-side. Bounds are checked, regime legality is checked,
//                   and the agent's own stated expectation is compared against
//                   what the engine actually computed. A proposal that fails is
//                   never shown as actionable.
//
// The model proposes. The engine decides. A human approves.
// ───────────────────────────────────────────────────────────────────────────
import Anthropic from '@anthropic-ai/sdk'
import { PACK_LIST, getPack } from '../src/engine/rulepacks/index.js'
import { FLEET } from '../src/data/fleet.js'
import { TOOL_SPECS } from '../src/engine/toolspec.js'
import { fleetSourceFrom, getPosition, runToolSafe, type ToolContext } from '../src/engine/tools.js'
import type { CountryId, Scenario, Vehicle } from '../src/engine/types.js'
import { getCurrent } from './_store.js'
import { requireSession } from './_auth.js'
import { allow } from './_ratelimit.js'
import { AGENT_BY_ID } from '../src/app/agents/registry.js'
import { can } from '../src/app/auth/rbac.js'
import type { AgentId } from '../src/app/agents/kernel.js'
import { LEVER_BOUNDS as SHARED_LEVER_BOUNDS } from '../src/app/modules/scenario/levers.js'
import { DRIVER_META, DRIVER_DEFAULTS, outlookRun, type DriverKey, type DriverSet } from '../src/engine/outlook.js'
import { poolingAllowed } from '../src/engine/blocks.js'
import { buildTree } from '../src/engine/engine.js'

/**
 * The cheapest tier, by explicit choice. This loop mostly decides which engine
 * tool to call next and narrates what came back — the compliance arithmetic is
 * deterministic TypeScript behind the validation gate, so the model is
 * orchestrating, not calculating, and a wrong number cannot reach the user
 * through it.
 *
 * The trade is real and worth stating: Haiku is weaker at long multi-step
 * reasoning and at regulatory narrative, so expect shallower findings and
 * plainer write-ups, and watch whether passes start needing more turns to
 * reach the same place — more cheap turns can cost more than fewer good ones.
 *
 * AGENT_MODEL overrides, so moving a deployment back up a tier is an env
 * change rather than a redeploy.
 */
const MODEL = process.env.AGENT_MODEL || 'claude-haiku-4-5-20251001'
const MAX_TURNS = 12

/**
 * Prompt caching. Without it a pass pays for the same tokens over and over:
 * every turn re-sends the system prompt, ~4.5k tokens of tool schemas and the
 * entire accumulated transcript at full input price, so a 12-turn run bills the
 * first turn's tool results twelve times. Linear work, quadratic cost.
 *
 * Two breakpoints, which is what the shape of this loop wants:
 *   · static  — tools + system, byte-identical on every turn of every run
 *   · rolling — the end of the transcript, moved forward each turn so a turn
 *               reads everything before it from cache instead of re-buying it
 *
 * A cache read bills at a tenth of an input token, so the rolling breakpoint is
 * where nearly all of the saving comes from. Only the newest turn is paid for
 * at full rate.
 */
export function rollCacheBreakpoint(messages: any[]): void {
  // At most four breakpoints may exist, and a stale one costs a write for a
  // prefix nothing will read again — so clear before re-marking.
  for (const m of messages) {
    if (!Array.isArray(m.content)) continue
    for (const b of m.content) if (b && typeof b === 'object') delete b.cache_control
  }
  for (let i = messages.length - 1; i >= 0; i--) {
    const c = messages[i].content
    if (!Array.isArray(c) || !c.length) continue
    const last = c[c.length - 1]
    if (last && typeof last === 'object') {
      last.cache_control = { type: 'ephemeral' }
      return
    }
  }
}

/** Which engine tools each agent may reach. An agent that cannot touch a tool
 *  cannot be talked into touching it — the allowlist is applied here, not in
 *  the prompt, so a prompt injection has nothing to grab. */
const AGENT_TOOLS: Record<AgentId, string[]> = {
  'plan.monitor':       ['list_makers', 'get_position', 'monthly_trace', 'data_quality', 'portfolio'],
  'forecast.horizon':   ['get_position', 'run_forecast', 'outlook_bridge', 'regulation_brief'],
  'scenario.architect': ['get_position', 'cheapest_path', 'simulate_risk', 'run_forecast', 'regulation_brief'],
  'book.keeper':        ['credit_ledger', 'get_position', 'dual_credit', 'regulation_brief'],
  'data.steward':       ['data_quality', 'get_position', 'list_makers'],
  'pool.broker':        ['optimise_pool', 'pool_partners', 'get_position', 'pricing_impact', 'regulation_brief'],
  'reg.watch':          ['regulation_brief', 'get_position', 'simulate_risk'],
}

/** Levers a proposal is allowed to move, with the bounds the gate enforces.
 *  Imported from the same table the Scenario workbench renders, so the UI can
 *  never offer a value the server would refuse — or hide one it would accept. */
const LEVER_BOUNDS = SHARED_LEVER_BOUNDS

// ── workspace data ──────────────────────────────────────────────────────────

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
    } catch { /* fall back to the bundled extract */ }
  }))
  return fleetSourceFrom(rows, metas)
}

// ── the two agent-authored tools ────────────────────────────────────────────

const REPORT_FINDING = {
  name: 'report_finding',
  description: 'Record one thing you found that a person needs to know. Every finding MUST cite where it came from — a tool result, a rule-pack clause, or a source document. Report findings as you go, not all at the end.',
  input_schema: {
    type: 'object' as const,
    properties: {
      severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'info'] },
      title: { type: 'string', description: 'One line. State the fact, not the activity.' },
      detail: { type: 'string', description: 'Two or three sentences: what it is, why it matters, what it implies.' },
      subject: { type: 'string', description: 'What this is about — a manufacturer, a source, a year.' },
      citations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string' }, ref: { type: 'string' },
            url: { type: 'string' }, asOf: { type: 'string' },
          },
          required: ['label', 'ref'],
        },
      },
    },
    required: ['severity', 'title', 'detail', 'citations'],
  },
}

const POST_EVIDENCE = {
  name: 'post_evidence',
  description:
    'Post one item from the live news or source feed to the workspace evidence feed. Use this for anything you read that bears on one of the four forecast assumptions — a registrations release, an incentive change, a plant or launch announcement, a battery price move, a mandate consultation. ' +
    'Post the headline AS PUBLISHED; never paraphrase it into a claim the source did not make. One call per item, as you find them. ' +
    'If the item implies a different value for the assumption, put that value in `suggested` — a person decides whether to apply it.',
  input_schema: {
    type: 'object' as const,
    properties: {
      headline: { type: 'string', description: 'The headline as published. Not a summary of it.' },
      outlet: { type: 'string', description: 'Who published it.' },
      url: { type: 'string' },
      publishedAt: { type: 'string', description: 'Publication date as the source states it.' },
      summary: { type: 'string', description: 'Two sentences: what it says, and why it bears on the assumption.' },
      driver: { type: 'string', enum: ['marketGrowth', 'evShareHorizon', 'iceCo2Improve', 'massDrift'] },
      direction: { type: 'string', enum: ['raises', 'lowers', 'confirms'] },
      suggested: { type: 'number', description: 'The revised value for that assumption, in the assumption’s own unit. Omit if the item does not support a specific number.' },
      strength: { type: 'string', enum: ['strong', 'moderate', 'weak'], description: 'strong = a published figure or a made instrument; weak = commentary or a single unconfirmed report.' },
    },
    required: ['headline', 'outlet', 'summary', 'driver', 'direction', 'strength'],
  },
}

const PROPOSE_CASE = {
  name: 'propose_case',
  description:
    'Put a scenario on the board. Use this when the live feed shows a coherent WORLD that the current cases do not cover — not a single number moving, but a set of assumptions moving together for one reason. ' +
    'A case must be internally consistent: adoption rising while mass also rises and growth also rises is not a world, it is noise. ' +
    'It lands on the board at ZERO WEIGHT, so it changes no number until a person decides what the odds are. You must give a falsifier — what would have to be true — and cite what put the case on the table.',
  input_schema: {
    type: 'object' as const,
    properties: {
      name: { type: 'string', description: 'Short and specific, e.g. "Incentives lapse in two of five markets".' },
      blurb: { type: 'string', description: 'One or two sentences describing the world, written so someone can argue with it.' },
      falsifier: { type: 'string', description: 'What would have to be true for this to be the case that happens, and what to watch.' },
      deltas: {
        type: 'object',
        description: 'Changes to the Assumption Book, in each assumption’s own unit. Only include the ones this world actually moves.',
        properties: {
          marketGrowth: { type: 'number' }, evShareHorizon: { type: 'number' },
          iceCo2Improve: { type: 'number' }, massDrift: { type: 'number' },
        },
      },
      citations: {
        type: 'array',
        items: {
          type: 'object',
          properties: { label: { type: 'string' }, ref: { type: 'string' }, url: { type: 'string' }, asOf: { type: 'string' } },
          required: ['label', 'ref'],
        },
      },
    },
    required: ['name', 'blurb', 'falsifier', 'deltas', 'citations'],
  },
}

const PROPOSE_CHANGE = {
  name: 'propose_change',
  description:
    'Draft a change for a human to approve. Express it ONLY as input levers (scenario.<lever>) — never as an outcome you expect the platform to record. ' +
    'The engine re-derives every consequence from your levers and will reject the proposal if a lever is out of bounds or illegal in this regime. ' +
    'State what you expect the effect to be in `expected`; a large divergence from what the engine computes is surfaced to the reviewer.',
  input_schema: {
    type: 'object' as const,
    properties: {
      title: { type: 'string' },
      rationale: { type: 'string', description: 'Why this, in the reader’s language. Reference the evidence.' },
      risk: { type: 'string', enum: ['low', 'medium', 'high'] },
      reversible: { type: 'boolean' },
      changes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Either scenario.<lever> (a compliance lever) or driver.<key> (a forecast assumption: marketGrowth, evShareHorizon, iceCo2Improve, massDrift). Do not mix the two kinds in one proposal.' },
            label: { type: 'string' },
            to: { description: 'The proposed value (number or boolean).' },
            unit: { type: 'string' },
          },
          required: ['path', 'label', 'to'],
        },
      },
      expected: {
        type: 'array',
        items: {
          type: 'object',
          properties: { label: { type: 'string' }, value: { type: 'number' }, unit: { type: 'string' } },
          required: ['label', 'value'],
        },
      },
      citations: {
        type: 'array',
        items: {
          type: 'object',
          properties: { label: { type: 'string' }, ref: { type: 'string' }, url: { type: 'string' }, asOf: { type: 'string' } },
          required: ['label', 'ref'],
        },
      },
    },
    required: ['title', 'rationale', 'risk', 'reversible', 'changes', 'citations'],
  },
}

// ── the validation gate ─────────────────────────────────────────────────────

interface GateResult {
  ok: boolean
  checks: { id: string; label: string; status: 'pass' | 'fail' | 'warn'; detail: string }[]
  derived: { label: string; before: number; after: number; unit?: string; better?: 'up' | 'down' }[]
  reason?: string
  overrides: Partial<Scenario>
}

/** A forecast revision is validated differently from a compliance lever: the
 *  bounds come from the driver registry, and the consequence is re-derived by
 *  running the whole horizon under the revised Assumption Book rather than a
 *  single year. Same contract, same refusals — a different calculation. */
function validateDriverProposal(
  proposal: any, ctx: ToolContext, country: CountryId, year: number,
): GateResult {
  const checks: GateResult['checks'] = []
  const pack = getPack(country)
  const base: DriverSet = { ...DRIVER_DEFAULTS[country] }
  const next: DriverSet = { ...base }
  let fatal: string | undefined

  const changes: any[] = Array.isArray(proposal?.changes) ? proposal.changes : []
  if (!changes.length) {
    checks.push({ id: 'shape', label: 'Proposal has changes', status: 'fail', detail: 'No assumption revisions were given, so there is nothing to apply.' })
    fatal = 'The proposal contained no changes.'
  }
  for (const c of changes) {
    const key = String(c?.path ?? '').replace(/^driver\./, '') as DriverKey
    const meta = DRIVER_META.find((m) => m.key === key)
    if (!meta) {
      checks.push({ id: `driver:${key}`, label: `Assumption “${key}” exists`, status: 'fail', detail: `“${c?.path}” is not one of the four forecast assumptions. Refused before reaching the engine.` })
      fatal = `Unknown assumption ${c?.path}.`
      continue
    }
    const v = Number(c.to)
    if (!isFinite(v)) {
      checks.push({ id: `driver:${key}`, label: `${meta.label} is numeric`, status: 'fail', detail: `Received ${JSON.stringify(c.to)}.` })
      fatal = `${meta.label} must be a number.`
      continue
    }
    if (v < meta.min || v > meta.max) {
      checks.push({ id: `driver:${key}`, label: `${meta.label} within bounds`, status: 'fail', detail: `${v}${meta.unit} is outside the permitted ${meta.min}–${meta.max}${meta.unit}.` })
      fatal = `${meta.label} is out of bounds.`
      continue
    }
    next[key] = v
    checks.push({
      id: `driver:${key}`, label: `${meta.label} within bounds`, status: 'pass',
      detail: `${base[key]}${meta.unit} → ${v}${meta.unit}, inside ${meta.min}–${meta.max}${meta.unit}.`,
    })
  }

  const derived: GateResult['derived'] = []
  if (!fatal) {
    const raw = ctx.fleet.rows(country)
    const years = pack.years.filter((y) => y >= year).slice(0, 6)
    const cum = (d: DriverSet) => {
      const run = outlookRun({ raw, pack, drivers: d, vintageYear: year })
      let exposure = 0, endGap = 0
      years.forEach((y, i) => {
        const t = buildTree(run.fleetForYear(y), pack, run.scenarioFor(y))
        exposure += (t.children ?? []).reduce((a, ch) => a + ch.fine, 0)
        if (i === years.length - 1) endGap = t.gap
      })
      return { exposure, endGap }
    }
    const b = cum(base), a = cum(next)
    derived.push(
      { label: `Cumulative exposure (${pack.currency})`, before: b.exposure, after: a.exposure, better: 'down' },
      { label: `${years[years.length - 1]} gap to limit`, before: b.endGap, after: a.endGap, unit: pack.metricUnit, better: 'down' },
    )
    checks.push({
      id: 'engine', label: 'Engine re-derivation', status: 'pass',
      detail: `Re-projected ${years[0]}–${years[years.length - 1]} under the revised assumptions.`,
    })
  }

  const cites: any[] = Array.isArray(proposal?.citations) ? proposal.citations : []
  checks.push({
    id: 'citations', label: 'Evidence cited', status: cites.length ? 'pass' : 'fail',
    detail: cites.length
      ? `${cites.length} source${cites.length > 1 ? 's' : ''} cited.`
      : 'No sources cited. An assumption revision with no source is not reviewable — that is the whole point of the Assumption Book.',
  })
  if (!cites.length) fatal = 'The proposal cited no evidence.'

  return { ok: !fatal, checks, derived, reason: fatal, overrides: {} }
}

/** Re-derive the world from a proposal's levers. This is the only thing in the
 *  system that decides whether an agent's output is real.
 *
 *  Exported for tests: this function is the platform's safety boundary, so its
 *  behaviour is asserted directly rather than inferred from a route response. */
export function validateProposal(
  proposal: any, ctx: ToolContext, country: CountryId, year: number,
): GateResult {
  // Two kinds of proposal, two calculations. A proposal that mixes them is
  // refused rather than partially applied: "change a lever AND an assumption"
  // is two decisions wearing one approval.
  const paths: string[] = (Array.isArray(proposal?.changes) ? proposal.changes : []).map((c: any) => String(c?.path ?? ''))
  const drivers = paths.filter((p) => p.startsWith('driver.')).length
  if (drivers > 0 && drivers === paths.length) return validateDriverProposal(proposal, ctx, country, year)
  if (drivers > 0) {
    return {
      ok: false, derived: [], overrides: {},
      reason: 'A proposal may change compliance levers or forecast assumptions, not both.',
      checks: [{ id: 'shape', label: 'Proposal is one kind of change', status: 'fail', detail: 'It mixed scenario levers with forecast assumptions. Split it into two proposals so each can be approved on its own merits.' }],
    }
  }

  const checks: GateResult['checks'] = []
  const overrides: Record<string, unknown> = {}
  const pack = getPack(country)
  let fatal: string | undefined

  // 1 — every change addresses a known lever, within its bounds.
  const changes: any[] = Array.isArray(proposal?.changes) ? proposal.changes : []
  if (!changes.length) {
    checks.push({ id: 'shape', label: 'Proposal has changes', status: 'fail', detail: 'The proposal contained no lever changes, so there is nothing to apply.' })
    fatal = 'The proposal contained no changes.'
  }
  for (const c of changes) {
    const key = String(c?.path ?? '').replace(/^scenario\./, '')
    const spec = LEVER_BOUNDS[key]
    if (!spec) {
      checks.push({ id: `lever:${key}`, label: `Lever “${key}” is addressable`, status: 'fail', detail: `“${c?.path}” is not a lever this platform exposes. Refused before reaching the engine.` })
      fatal = `Unknown lever ${c?.path}.`
      continue
    }
    if (spec.bool) {
      if (typeof c.to !== 'boolean') {
        checks.push({ id: `lever:${key}`, label: `${spec.label} is a valid setting`, status: 'fail', detail: `Expected true or false, received ${JSON.stringify(c.to)}.` })
        fatal = `${spec.label} must be true or false.`
        continue
      }
      overrides[key] = c.to
      checks.push({ id: `lever:${key}`, label: `${spec.label} within policy`, status: 'pass', detail: `Set to ${c.to ? 'on' : 'off'}.` })
      continue
    }
    const v = Number(c.to)
    if (!isFinite(v)) {
      checks.push({ id: `lever:${key}`, label: `${spec.label} is numeric`, status: 'fail', detail: `Received ${JSON.stringify(c.to)}.` })
      fatal = `${spec.label} must be a number.`
      continue
    }
    if ((spec.min != null && v < spec.min) || (spec.max != null && v > spec.max)) {
      checks.push({ id: `lever:${key}`, label: `${spec.label} within bounds`, status: 'fail', detail: `${v}${spec.unit ?? ''} is outside the permitted ${spec.min}–${spec.max}${spec.unit ?? ''}.` })
      fatal = `${spec.label} is out of bounds.`
      continue
    }
    overrides[key] = v
    checks.push({ id: `lever:${key}`, label: `${spec.label} within bounds`, status: 'pass', detail: `${v}${spec.unit ?? ''} is inside ${spec.min}–${spec.max}${spec.unit ?? ''}.` })
  }

  // 2 — regime legality. A lever that is meaningless here must not be proposed
  //     here, however plausible the model's reasoning was.
  // Pooling is a question about a YEAR, not a market: India has none under
  // CAFE II and voluntary pooling from draft CAFE III, so a proposal to pool in
  // 2026 must be refused even though the pack says pooling exists.
  if (overrides.poolingEnabled === true && !poolingAllowed(pack, year)) {
    checks.push({
      id: 'regime:pooling', label: `Pooling is available in ${pack.name} in ${year}`, status: 'fail',
      detail: pack.pooling.enabled && pack.pooling.fromYear != null
        ? `${pack.name} does not permit pooling in ${year} — it begins in ${pack.pooling.fromYear}. ${pack.pooling.note}`
        : `${pack.name} does not permit pooling. ${pack.pooling.note}`,
    })
    fatal = `Pooling is not available in ${pack.name} in ${year}.`
  } else if (overrides.poolingEnabled === true) {
    checks.push({ id: 'regime:pooling', label: `Pooling is available in ${pack.name} in ${year}`, status: 'pass', detail: pack.pooling.note })
  }
  if (overrides.cycleWltp != null && country !== 'IN') {
    checks.push({ id: 'regime:cycle', label: 'Cycle conversion applies here', status: 'fail', detail: 'The MIDC→WLTP conversion is an India CAFE III construct and has no meaning in this market.' })
    fatal = 'Cycle conversion does not apply in this market.'
  }

  // 3 — re-derive. Even a well-formed proposal is only real once the engine has
  //     computed its consequences from the same code the screens use.
  const derived: GateResult['derived'] = []
  if (!fatal) {
    const before = getPosition(ctx, country, year)
    const after = getPosition(ctx, country, year, null, overrides as Partial<Scenario>)
    const b = before.value as any, a = after.value as any
    const num = (x: unknown) => (typeof x === 'number' && isFinite(x) ? x : 0)
    derived.push(
      { label: `Fleet ${pack.metricLabel}`, before: num(b.avgMetric), after: num(a.avgMetric), unit: pack.metricUnit, better: 'down' },
      { label: 'Limit', before: num(b.limit), after: num(a.limit), unit: pack.metricUnit },
      { label: 'Gap to limit', before: num(b.gap), after: num(a.gap), unit: pack.metricUnit, better: 'down' },
      { label: `Exposure (${pack.currency})`, before: num(b.fine), after: num(a.fine), better: 'down' },
    )
    checks.push({
      id: 'engine', label: 'Engine re-derivation', status: 'pass',
      detail: `Recomputed from the proposed levers: gap moves ${num(b.gap).toFixed(2)} → ${num(a.gap).toFixed(2)} ${pack.metricUnit}.`,
    })

    // 4 — does the agent's own expectation survive contact with the engine?
    //     A model that is confidently wrong about its own proposal is the
    //     failure mode this check exists to catch.
    const expected: any[] = Array.isArray(proposal?.expected) ? proposal.expected : []
    for (const e of expected) {
      const match = derived.find((d) => d.label.toLowerCase().includes(String(e.label ?? '').toLowerCase().split(' ')[0]))
      if (!match) continue
      const drift = Math.abs(match.after - Number(e.value))
      const scale = Math.max(Math.abs(match.after), 1)
      const pct = (drift / scale) * 100
      checks.push({
        id: `expect:${e.label}`,
        label: `Agent’s expectation for ${e.label}`,
        status: pct <= 5 ? 'pass' : pct <= 20 ? 'warn' : 'fail',
        detail: `Agent expected ${Number(e.value).toFixed(2)}; the engine computed ${match.after.toFixed(2)} (${pct.toFixed(0)}% apart).`,
      })
      if (pct > 20) fatal = `The agent’s expectation for ${e.label} diverged ${pct.toFixed(0)}% from the engine.`
    }
  }

  // 5 — citations. An uncited regulatory claim is not a finding.
  const cites: any[] = Array.isArray(proposal?.citations) ? proposal.citations : []
  checks.push({
    id: 'citations', label: 'Evidence cited',
    status: cites.length ? 'pass' : 'fail',
    detail: cites.length ? `${cites.length} source${cites.length > 1 ? 's' : ''} cited.` : 'No sources cited. A proposal with no evidence cannot be reviewed.',
  })
  if (!cites.length) fatal = 'The proposal cited no evidence.'

  return { ok: !fatal, checks, derived, reason: fatal, overrides: overrides as Partial<Scenario> }
}

// ── the system prompt ───────────────────────────────────────────────────────

function systemPrompt(agentId: AgentId, country: CountryId, year: number, ctxNote: string): string {
  const a = AGENT_BY_ID[agentId]
  const pack = getPack(country)
  return [
    `You are ${a.name}, one of the agents inside AiRE — an automotive emissions-compliance platform.`,
    ``,
    `YOUR JOB: ${a.purpose}`,
    ``,
    `YOUR METHOD, in order:`,
    ...a.method.map((m, i) => `${i + 1}. ${m}`),
    ``,
    `MARKET: ${pack.name} (${pack.id}). Compliance year ${year}.`,
    `Limit basis: ${pack.limitNote}`,
    `Charge: ${pack.fineRateLabel}. Metric: ${pack.metricLabel} in ${pack.metricUnit}.`,
    `Transfer mechanism: ${pack.credits}`,
    `Pooling: ${pack.pooling.enabled ? 'permitted — ' : 'NOT permitted — '}${pack.pooling.note}`,
    `Data coverage: ${pack.coverage.tier} — ${pack.coverage.label}`,
    ctxNote ? `\nWORKSPACE CONTEXT:\n${ctxNote}` : '',
    ``,
    `RULES YOU CANNOT BREAK:`,
    `• You may not state a number you did not get back from a tool call. If you need a figure, call a tool. Never estimate, never carry a number forward from memory, never do arithmetic the engine can do.`,
    `• Every finding and every proposal must carry citations. A citation names the tool result, rule-pack clause or document the claim rests on.`,
    `• A proposal expresses INPUT LEVERS ONLY. You never assert an outcome as fact — the engine re-derives all consequences and will reject you if your expectation diverges from what it computes.`,
    `• Use only the vocabulary this regime actually has. In a regime with no transferable instrument, words like "credit", "trade" and "sell" are factually wrong; headroom moves by pooling, if it moves at all.`,
    `• If the data cannot answer the question, say exactly that and say what would be needed. An honest gap beats a confident guess — this output is read by people who file it with a regulator.`,
    ``,
    agentId === 'forecast.horizon'
      ? `LIVE FEED: your first job on every run is the feed, not the arithmetic. Search current news, trade press and official releases for anything bearing on the four forecast assumptions — market growth, zero-emission share at horizon, combustion CO₂ improvement, fleet mass drift. Post EVERY relevant item with post_evidence, using the headline as published. Grade it honestly: 'strong' is a published figure or a made instrument, 'weak' is commentary or one unconfirmed report. Only after the feed is posted should you consider (a) proposing a revision to a single assumption, or (b) calling propose_case where the feed shows a coherent WORLD the board does not yet cover. A case must be internally consistent and must carry a falsifier; it lands at zero weight so it changes nothing until a person gives it odds.`
      : '',
    `WORKING STYLE: call report_finding as you discover things rather than saving them up. When you have a recommendation worth acting on, call propose_change exactly once. Finish with a short plain-language summary — three sentences at most, no preamble, no restating the question.`,
  ].filter(Boolean).join('\n')
}

// ── the route ───────────────────────────────────────────────────────────────

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only.' }); return }

  const session = requireSession(req, res)
  if (!session) return

  const key = process.env.ANTHROPIC_API_KEY
  if (!key) { res.status(503).json({ error: 'No model key configured.', code: 'no_model_key' }); return }

  const body = req.body ?? {}
  const agentId = String(body.agentId ?? '') as AgentId
  const agent = AGENT_BY_ID[agentId]
  if (!agent) { res.status(400).json({ error: `Unknown agent “${body.agentId}”.` }); return }

  // Authorisation from the SIGNED role, not from anything the client sent.
  const role = session.role ?? 'analyst'
  if (!can(role, agent.requires) || !can(role, 'agent.run')) {
    res.status(403).json({ error: `Your role (${role}) cannot run ${agent.name}.` }); return
  }
  // Agent runs are the most expensive thing a session can do, so they share the
  // co-pilot's per-workspace budget rather than getting an unmetered one.
  if (!allow(res, session.workspace, 'copilot')) return

  const country = (String(body.country ?? 'IN') as CountryId)
  if (!PACK_LIST.some((p) => p.id === country)) { res.status(400).json({ error: 'Unknown market.' }); return }
  const pack = getPack(country)
  const year = Number(body.context?.year) || pack.defaultYear || pack.years[0]

  res.writeHead(200, {
    'content-type': 'application/x-ndjson; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
  })
  const send = (ev: unknown) => { res.write(`${JSON.stringify(ev)}\n`) }
  const t0 = Date.now()

  /**
   * Whether the reader is still there. Aborting the fetch client-side — a stop,
   * a sign-out, a closed tab — ends the response, but nothing about that stops
   * this function on its own: it would keep calling the model, turn after turn,
   * and bill every one of them to write a report into a closed socket.
   *
   * Checked between turns rather than mid-request, because a call already in
   * flight is paid for either way. This bounds the spend at one turn past the
   * disconnect instead of the full twelve.
   */
  let clientGone = false
  res.on('close', () => { clientGone = true })

  try {
    const fleet = await loadFleets(session.workspace)
    const ctx: ToolContext = { fleet, allowed: PACK_LIST.map((p) => p.id), pooling: true, actions: [] }

    send({ type: 'status', status: 'planning' })
    send({
      type: 'step',
      step: {
        id: 's0', kind: 'plan', status: 'ok', label: `Planning · ${agent.name}`,
        detail: agent.method.join(' → '),
        citations: [{ label: `${pack.name} rule pack`, ref: pack.source, asOf: pack.coverage.label }],
      },
    })

    const allowedTools = new Set(AGENT_TOOLS[agentId])
    const engineTools = TOOL_SPECS.filter((t) => allowedTools.has(t.name))
      .map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema }))
    const wantsWeb = agent.tools.some((t) => t.external)
    const tools: any[] = [...engineTools, REPORT_FINDING, PROPOSE_CHANGE]
    // Only the agents that actually watch a feed get to write to it.
    if (agentId === 'forecast.horizon' || agentId === 'reg.watch') tools.push(POST_EVIDENCE)
    if (agentId === 'forecast.horizon') tools.push(PROPOSE_CASE)
    if (wantsWeb) tools.unshift({ type: 'web_search_20250305', name: 'web_search', max_uses: 6 })

    const anthropic = new Anthropic({ apiKey: key })
    const ctxNote = typeof body.context === 'object' && body.context
      ? Object.entries(body.context).map(([k, v]) => `• ${k}: ${JSON.stringify(v)}`).join('\n')
      : ''
    // The static breakpoint sits on the system block, which caches the tool
    // schemas with it: the wire order is tools, then system, then messages.
    const system = [{
      type: 'text' as const,
      text: systemPrompt(agentId, country, year, ctxNote),
      cache_control: { type: 'ephemeral' as const },
    }]

    const messages: any[] = [{
      role: 'user',
      content: body.prompt?.trim()
        ? String(body.prompt).slice(0, 4000)
        : `Run your standard pass for ${pack.name}, compliance year ${year}.`,
    }]

    let proposalRaw: any = null
    let summary = ''
    let inTok = 0, outTok = 0, cacheWriteTok = 0, cacheReadTok = 0
    let step = 1

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      if (clientGone) return
      send({ type: 'status', status: turn === 0 ? 'gathering' : 'reasoning' })

      let msg: any
      rollCacheBreakpoint(messages)
      try {
        msg = await anthropic.messages.create({ model: MODEL, max_tokens: 4096, system, tools, messages })
      } catch (e: any) {
        // A deployment without web-search entitlement must still be able to run
        // its engine-only work rather than failing the whole pass.
        if (wantsWeb && /web_search|tool.*not.*(supported|enabled)/i.test(String(e?.message ?? ''))) {
          send({ type: 'step', step: { id: `s${step++}`, kind: 'note', status: 'warn', label: 'Web search unavailable', detail: 'This deployment cannot reach external sources, so the pass continues on internal data only. Findings will be limited to what the workspace already holds.' } })
          tools.shift()
          continue
        }
        throw e
      }

      inTok += msg.usage?.input_tokens ?? 0
      outTok += msg.usage?.output_tokens ?? 0
      cacheWriteTok += msg.usage?.cache_creation_input_tokens ?? 0
      cacheReadTok += msg.usage?.cache_read_input_tokens ?? 0
      messages.push({ role: 'assistant', content: msg.content })

      const text = msg.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('').trim()
      if (text) summary = text

      const calls = msg.content.filter((c: any) => c.type === 'tool_use')
      if (!calls.length) break

      const results: any[] = []
      for (const call of calls) {
        const sid = `s${step++}`

        if (call.name === 'report_finding') {
          const f = call.input as any
          send({ type: 'finding', finding: { id: sid, severity: f.severity, title: f.title, detail: f.detail, subject: f.subject, citations: f.citations ?? [] } })
          results.push({ type: 'tool_result', tool_use_id: call.id, content: 'Recorded.' })
          continue
        }

        if (call.name === 'post_evidence') {
          const e = call.input as any
          send({
            type: 'evidence',
            item: {
              id: `ev_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
              headline: e.headline, outlet: e.outlet, url: e.url, publishedAt: e.publishedAt,
              summary: e.summary, market: country, driver: e.driver, direction: e.direction,
              suggested: typeof e.suggested === 'number' ? e.suggested : undefined,
              strength: e.strength, status: 'new', foundAt: new Date().toISOString(),
            },
          })
          send({ type: 'step', step: { id: sid, kind: 'read', status: 'ok', label: 'Posted to the evidence feed', detail: e.headline, citations: [{ label: e.outlet, ref: e.headline, url: e.url, asOf: e.publishedAt }] } })
          results.push({ type: 'tool_result', tool_use_id: call.id, content: 'Posted. A person will accept or dismiss it.' })
          continue
        }

        if (call.name === 'propose_case') {
          const c = call.input as any
          // Deltas are clamped to the driver registry before the case is ever
          // drawn: a case that pushes an assumption outside its own bounds is
          // not a scenario, and the board must not be able to display one.
          const deltas: Record<string, number> = {}
          const outOfBounds: string[] = []
          for (const [k, v] of Object.entries(c.deltas ?? {})) {
            const meta = DRIVER_META.find((m) => m.key === (k as DriverKey))
            if (!meta || typeof v !== 'number' || !isFinite(v)) continue
            const span = meta.max - meta.min
            if (Math.abs(v) > span) { outOfBounds.push(meta.label); continue }
            deltas[k] = v
          }
          if (!Object.keys(deltas).length || !Array.isArray(c.citations) || !c.citations.length) {
            results.push({
              type: 'tool_result', tool_use_id: call.id, is_error: true,
              content: !Object.keys(deltas).length
                ? 'Refused: the case moved no assumption the platform has, so it is not a case.'
                : 'Refused: a case with no citation cannot be reviewed. Cite what put it on the table.',
            })
            send({ type: 'step', step: { id: sid, kind: 'error', status: 'fail', label: 'Case refused', detail: 'It moved no known assumption, or it cited nothing.' } })
            continue
          }
          send({
            type: 'case',
            case: {
              id: `case_agent_${Date.now().toString(36)}`,
              name: String(c.name).slice(0, 80), blurb: String(c.blurb).slice(0, 400),
              falsifier: String(c.falsifier).slice(0, 400),
              deltas, weight: 0, origin: 'agent', citations: c.citations,
            },
          })
          send({
            type: 'step',
            step: {
              id: sid, kind: 'draft', status: outOfBounds.length ? 'warn' : 'ok',
              label: 'Put a case on the board',
              detail: outOfBounds.length
                ? `${c.name} — ${outOfBounds.join(', ')} dropped as out of bounds.`
                : `${c.name} — added at zero weight, so it changes no number until someone gives it odds.`,
              citations: c.citations,
            },
          })
          results.push({ type: 'tool_result', tool_use_id: call.id, content: 'On the board at zero weight. A person decides the odds.' })
          continue
        }

        if (call.name === 'propose_change') {
          proposalRaw = call.input
          send({ type: 'status', status: 'drafting' })
          send({ type: 'step', step: { id: sid, kind: 'draft', status: 'ok', label: 'Drafted a proposal', detail: proposalRaw.title, citations: proposalRaw.citations ?? [] } })
          results.push({ type: 'tool_result', tool_use_id: call.id, content: 'Proposal received. It will be re-derived by the engine before anyone sees it as actionable.' })
          continue
        }

        // ── engine tool ──
        const spec = TOOL_SPECS.find((t) => t.name === call.name)
        send({ type: 'step', step: { id: sid, kind: 'tool', status: 'running', label: spec?.label ?? call.name, detail: describeInput(call.input), data: call.input } })
        const started = Date.now()
        const out = runToolSafe(call.name, call.input, ctx)
        const ms = Date.now() - started

        if (!out.ok) {
          send({ type: 'step_update', id: sid, patch: { status: 'fail', ms, detail: out.error.message } })
          results.push({ type: 'tool_result', tool_use_id: call.id, is_error: true, content: out.error.message })
          continue
        }
        const p = (out.result as any).provenance
        send({
          type: 'step_update', id: sid,
          patch: {
            status: 'ok', ms,
            data: out.result,
            citations: p ? [{ label: `${pack.name} dataset`, ref: `${p.source ?? pack.source} · version ${p.dataVersion ?? 'bundled'}`, asOf: p.lastRefreshed ?? undefined }] : undefined,
          },
        })
        // 24k characters is ~6.6k tokens, and a tool result is not read once —
        // it stays in the transcript and is re-sent on every later turn, so an
        // oversized one is paid for repeatedly. The engine's own step data is
        // already streamed to the UI in full; the model only needs enough to
        // decide what to do next.
        results.push({ type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(out.result).slice(0, 6000) })
      }

      if (!results.length) break
      messages.push({ role: 'user', content: results })
    }

    // ── the gate ──
    let status = 'done'
    if (proposalRaw) {
      send({ type: 'status', status: 'validating' })
      const gate = validateProposal(proposalRaw, ctx, country, year)
      send({
        type: 'proposal',
        proposal: {
          id: `p_${Date.now().toString(36)}`,
          title: proposalRaw.title, rationale: proposalRaw.rationale,
          changes: (proposalRaw.changes ?? []).map((c: any) => ({ ...c, from: null })),
          expected: proposalRaw.expected ?? [],
          risk: proposalRaw.risk ?? 'medium',
          reversible: proposalRaw.reversible !== false,
          citations: proposalRaw.citations ?? [],
        },
      })
      send({ type: 'validation', validation: { ok: gate.ok, checks: gate.checks, derived: gate.derived, reason: gate.reason } })
      status = gate.ok ? 'awaiting_approval' : 'rejected'
    }

    if (summary) send({ type: 'summary', text: summary })
    send({
      type: 'usage',
      inputTokens: inTok, outputTokens: outTok,
      cacheWriteTokens: cacheWriteTok, cacheReadTokens: cacheReadTok,
      model: MODEL, ms: Date.now() - t0,
    })
    send({ type: 'done', status })
  } catch (e: any) {
    send({ type: 'error', message: String(e?.message ?? e) })
  } finally {
    res.end()
  }
}

/** A one-line, human-readable rendering of a tool's inputs for the trace. The
 *  raw JSON is kept on the step for the audit view; this is what a reader sees. */
function describeInput(input: unknown): string {
  if (!input || typeof input !== 'object') return ''
  return Object.entries(input as Record<string, unknown>)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${k} ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(' · ')
    .slice(0, 160)
}
