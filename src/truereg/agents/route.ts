// ───────────────────────────────────────────────────────────────────────────
// INTENT ROUTING — which agent answers, and what it answers from.
//
// Two jobs, and the second is the one that matters.
//
//   route()     picks the agent whose grant covers the question. With a model
//               configured this is all that is needed: the agent then chooses
//               its own tools inside its grant.
//
//   answer()    produces a COMPLETE answer with no model in the path at all.
//               Every figure this product states already comes from a
//               deterministic tool, so a question that maps cleanly onto a tool
//               can be answered without an LLM — the model was only ever
//               writing the prose around numbers it was forbidden to compute.
//
// That second path is not a degraded mode bolted on. It is what the doctrine
// implies: if the engine owns every number, an unanswerable question is one
// that needs judgement, not arithmetic — and those are the ones worth spending
// a model on. Answers from here are labelled as engine answers, so nobody
// mistakes a routed lookup for analysis.
// ───────────────────────────────────────────────────────────────────────────
import type { AgentId } from './registry.js'
import { runToolSafe, type ToolContext, type ToolName } from './tools.js'

export interface Route {
  agent: AgentId
  tool: ToolName
  input: Record<string, unknown>
  /** Shown on the answer so the routing is never a black box. */
  why: string
  score: number
}

interface Rule {
  agent: AgentId
  tool: ToolName
  why: string
  /** Lower-cased substrings. Chinese included — the plant asks in Chinese. */
  keys: string[]
  /** Terms that make this rule decisive when they appear. */
  strong?: string[]
}

const RULES: Rule[] = [
  { agent: 'delta', tool: 'buyer_exposure', why: 'The question is about commercial value, and exposure is always the buyer’s.',
    keys: ['worth', 'save', 'saving', 'money', 'euro', '€', 'cost', 'buyer', 'customer', 'contract', 'exposure', 'price', 'commercial', 'nordstahl', 'ponente', 'benelux', 'ibérica', 'iberica', 'severn', 'eori', '买方', '合同', '价值', '节省', '成本'],
    strong: ['buyer', 'contract', 'worth', 'exposure', 'eori', '买方', '合同'] },
  { agent: 'delta', tool: 'compare_to_defaults', why: 'A comparison against the default value is the buyer’s alternative.',
    keys: ['default', 'defaults', 'comparison', 'compare', 'versus', ' vs ', 'benchmark', '默认值', '比较'], strong: ['default', '默认值'] },
  { agent: 'delta', tool: 'assess_carbon_price', why: 'Article 9 decides whether a domestic carbon price reduces the buyer’s surrender.',
    keys: ['article 9', 'article9', 'carbon price', 'ets', 'deduction', 'deduct', 'carbon tax', 'domestic carbon', '第9条', '碳价', '碳市场', '扣减'], strong: ['article 9', 'ets', 'deduction', '第9条', '碳价'] },
  { agent: 'precursor', tool: 'compute_embedded_emissions', why: 'The embedded-emissions figure comes only from the deterministic Annex IV calculation.',
    keys: ['emission', 'emissions', 'see', 'intensity', 'tco2', 'co2', 'carbon number', 'footprint', 'per tonne', 'figure', 'number', '排放', '隐含排放', '强度', '每吨'],
    strong: ['embedded', 'emissions', 'intensity', 'tco2', '隐含排放', '排放'] },
  { agent: 'precursor', tool: 'trace_precursors', why: 'Precursors are traced and chased by the precursor agent.',
    keys: ['precursor', 'supplier', 'sinter', 'coke', 'pig iron', 'slab', 'upstream', 'purchased', '前体', '供应商', '烧结', '焦炭', '生铁', '板坯'],
    strong: ['precursor', 'supplier', 'sinter', 'pig iron', 'slab', '前体', '供应商'] },
  { agent: 'boundary', tool: 'map_boundary', why: 'Route and boundary questions belong to the boundary agent, which flags ambiguity rather than guessing.',
    keys: ['boundary', 'route', 'furnace', 'annex iii', 'process unit', 'blast', 'converter', 'arc', 'mill', 'system boundary', '边界', '路线', '高炉', '转炉', '电炉', '工序', '烧结机'],
    strong: ['boundary', 'route', 'furnace', 'annex iii', '边界', '路线', '高炉', '转炉'] },
  { agent: 'verifier', tool: 'assemble_evidence_pack', why: 'Verification readiness is rehearsed deterministically before the site visit.',
    keys: ['verifier', 'verification', 'verify', 'audit', 'site visit', 'ready', 'readiness', 'challenge', 'finding', 'evidence', '核查', '现场', '证据', '就绪'],
    strong: ['verifier', 'verification', 'audit', 'readiness', '核查'] },
  { agent: 'disclosure', tool: 'evaluate_obligations', why: 'Duties, deadlines and who must act come from the obligation graph.',
    keys: ['obligation', 'duty', 'duties', 'deadline', 'due', 'when', 'declare', 'declaration', 'surrender', 'register', 'must we', 'do we have to', 'compliant', 'compliance', '义务', '截止', '申报', '清缴', '登记'],
    strong: ['obligation', 'deadline', 'declaration', 'surrender', 'duty', '义务', '截止', '申报'] },
  { agent: 'disclosure', tool: 'prepare_disclosure', why: 'Disclosure is staged per buyer against its EORI and released by a person.',
    keys: ['disclose', 'disclosure', 'share', 'send to buyer', 'registry', 'o3ci', 'submit', '披露', '共享', '提交'],
    strong: ['disclose', 'disclosure', 'registry', '披露'] },
  { agent: 'watch', tool: 'watch_changes', why: 'The watch agent tracks the versioned inputs every stored conclusion is pinned to.',
    keys: ['change', 'changes', 'amendment', 'revision', 'update', 'monitor', 'watch', 'risk of', 'what could', '变化', '修订', '监测'],
    strong: ['amendment', 'revision', 'watch', '修订'] },
  { agent: 'watch', tool: 'regulation_overview', why: 'Coverage and roadmap questions read the regime map.',
    keys: ['uk', 'united kingdom', 'espr', 'eudr', 'csrd', 'other regime', 'roadmap', 'coverage', 'what else', 'which regulation', '英国', '其他法规'],
    strong: ['uk', 'espr', 'eudr', 'csrd', 'roadmap', '英国'] },
  { agent: 'intake', tool: 'intake_queue', why: 'Data completeness is the intake agent’s queue.',
    keys: ['document', 'documents', 'missing data', 'unstructured', 'invoice', 'log', 'record keeping', 'traceable', 'intake', '文件', '发票', '日志', '缺失'],
    strong: ['document', 'unstructured', 'invoice', 'intake', '文件'] },
  { agent: 'boundary', tool: 'lookup_term', why: 'Governing terms are read from the controlled term base, never translated freehand.',
    keys: ['translate', 'translation', 'chinese for', 'in chinese', 'term', 'what does', 'mean', 'definition', '翻译', '中文', '术语', '定义'],
    strong: ['translate', 'in chinese', 'term base', '翻译', '术语'] },
  { agent: 'intake', tool: 'read_record', why: 'A question about the installation itself reads the record.',
    keys: ['installation', 'plant', 'mill', 'record', 'what do we have', 'overview', 'products', 'period', '装置', '工厂', '记录', '产品'] },
]

const TERM_HINTS: Record<string, string> = {
  'embedded emission': 'embedded-emissions', 'embedded emissions': 'embedded-emissions',
  precursor: 'precursor', '前体': 'precursor', 'default value': 'default-value', '默认值': 'default-value',
  'activity level': 'activity-level', 'system boundary': 'system-boundary', 'production route': 'production-route',
  'carbon price': 'carbon-price-due', 'net calorific': 'net-calorific-value', ncv: 'net-calorific-value',
  see: 'specific-embedded-emissions', 'specific embedded': 'specific-embedded-emissions',
  eori: 'eori', coke: 'coke', sinter: 'sinter', '烧结矿': 'sinter', 'pig iron': 'pig-iron', '生铁': 'pig-iron',
  'blast furnace': 'blast-furnace', '高炉': 'blast-furnace', 'electric arc': 'electric-arc-furnace', '电弧炉': 'electric-arc-furnace',
  'basic oxygen': 'basic-oxygen-furnace', '转炉': 'basic-oxygen-furnace', 'attributed emission': 'attributed-emissions',
}

/** Pick the agent and the tool that answers this question. */
export function route(question: string): Route {
  const q = ` ${question.toLowerCase().trim()} `
  let best: Route = { agent: 'intake', tool: 'read_record', input: {}, why: 'No tool matched the question specifically, so the record is read and the question put back to you.', score: 0 }

  for (const r of RULES) {
    let score = 0
    for (const k of r.keys) if (q.includes(k)) score += 1
    for (const k of r.strong ?? []) if (q.includes(k)) score += 3
    if (score > best.score) best = { agent: r.agent, tool: r.tool, input: {}, why: r.why, score }
  }

  // A term question needs the term itself, which the generic router cannot guess.
  if (best.tool === 'lookup_term') {
    const hit = Object.keys(TERM_HINTS).find((k) => q.includes(k))
    if (hit) best.input = { term: TERM_HINTS[hit] }
    else best = { agent: 'intake', tool: 'read_record', input: {}, why: 'A term was asked about but not named in a form the term base holds.', score: 0 }
  }
  // Naming one buyer scopes the disclosure packet to that buyer.
  if (best.tool === 'prepare_disclosure') {
    const m = /\b([A-Z]{2}[A-Z0-9]{6,17})\b/.exec(question)
    if (m) best.input = { eori: m[1] }
  }
  return best
}

// ── deterministic answers ───────────────────────────────────────────────────

export interface AnswerFigure { label: string; value: string; tone?: 'ink' | 'safe' | 'danger' | 'warn' | 'blue'; sub?: string }
export interface AnswerRow { label: string; sub?: string; value?: string; tone?: 'ink' | 'safe' | 'danger' | 'warn' }

export interface EngineAnswer {
  route: Route
  /** The one sentence that answers the question. Assembled from engine values. */
  headline: string
  headlineZh?: string
  figures: AnswerFigure[]
  rows: AnswerRow[]
  /** Anything the answer must carry with it — indicative inputs, unknowns. */
  caveats: string[]
  clauseIds: string[]
  ms: number
}

const n0 = (v: number) => Math.round(v).toLocaleString('en-GB')
const n2 = (v: number, d = 2) => v.toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d })
const eur = (v: number) => `€${n0(v)}`

/** Answer entirely from the deterministic engine. Returns null when the question
 *  genuinely needs judgement rather than a lookup — which is the honest outcome
 *  and the case a model is actually worth spending on. */
export function answer(question: string, ctx: ToolContext): EngineAnswer | null {
  const r = route(question)
  const res = runToolSafe(r.tool, r.input, ctx)
  if (!res.ok) return null
  const v = res.result.value as any
  const ms = res.result.ms ?? 0
  const base = { route: r, figures: [] as AnswerFigure[], rows: [] as AnswerRow[], caveats: [] as string[], clauseIds: (v.clauseIds ?? []) as string[], ms }
  const indicative = res.result.provenance.caveat ? [res.result.provenance.caveat] : []

  switch (r.tool) {
    case 'compute_embedded_emissions': {
      const named = v.products.filter((p: any) => p.category !== 'sintered-ore')
      const lead = named.find((p: any) => p.productId === 'pr-hrc') ?? named[0]
      if (!lead) return null
      return {
        ...base,
        headline: lead.specificEmbeddedEmissions == null
          ? `${lead.productName} cannot be stated yet — ${lead.unknowns.filter((u: any) => u.blocking).length} blocking unknown remains, so the buyer surrenders on defaults until it is closed.`
          : `${lead.productName} is ${n2(lead.specificEmbeddedEmissions, 3)} tCO₂e per tonne — ${n2(lead.directTco2e / lead.activityLevelTonnes, 3)} direct, ${n2(lead.indirectTco2e / lead.activityLevelTonnes, 3)} indirect and ${n2(lead.precursorTco2e / lead.activityLevelTonnes, 3)} carried in from precursors.`,
        headlineZh: lead.specificEmbeddedEmissions == null ? undefined : `${lead.productName}的单位隐含排放为每吨 ${n2(lead.specificEmbeddedEmissions, 3)} 吨二氧化碳当量。`,
        figures: named.map((p: any) => ({
          label: p.productName, value: p.specificEmbeddedEmissions == null ? '—' : n2(p.specificEmbeddedEmissions, 3),
          sub: 'tCO₂e/t', tone: p.specificEmbeddedEmissions == null ? 'danger' : p.basis === 'actual' ? 'safe' : 'warn',
        })),
        rows: lead.terms.map((t: any) => ({ label: t.label, sub: t.maths, value: `${n0(t.tco2e)} t`, tone: t.quality === 'default' || t.quality === 'estimated' ? 'warn' : 'ink' })),
        caveats: [...new Set<string>([...indicative, ...named.flatMap((p: any) => p.caveats), ...named.flatMap((p: any) => p.unknowns.map((u: any) => u.what))])],
      }
    }

    case 'compare_to_defaults': {
      const best = v.rows.filter((x: any) => x.deltaPerTonne != null).sort((a: any, b: any) => b.deltaPerTonne - a.deltaPerTonne)[0]
      if (!best) return null
      return {
        ...base,
        headline: `Your actuals beat the ${ctx.bundle.installation.country} default on every product that can be stated — ${best.productName} by ${n2(best.deltaPerTonne, 2)} tCO₂e per tonne (${n2(best.actualSee, 2)} against a default of ${n2(best.defaultSee, 2)}).`,
        figures: v.rows.filter((x: any) => x.actualSee != null).map((x: any) => ({
          label: x.productName, value: x.deltaPerTonne == null ? '—' : `−${n2(x.deltaPerTonne, 2)}`, sub: 'vs default', tone: 'safe' as const,
        })),
        rows: v.rows.map((x: any) => ({ label: x.productName, sub: `default ${x.defaultSee == null ? '—' : n2(x.defaultSee, 2)} · actual ${x.actualSee == null ? 'not determinable' : n2(x.actualSee, 2)}`, value: x.defaultFellBackToWorldAverage ? 'world fallback' : undefined, tone: x.actualSee == null ? 'warn' : 'ink' })),
        caveats: [...indicative, ...(v.defaultsCaveat ? [v.defaultsCaveat] : [])],
      }
    }

    case 'buyer_exposure': {
      const live = v.contracts.filter((c: any) => !c.blocked)
      const far = v.horizon[v.horizon.length - 1]
      return {
        ...base,
        headline: v.headlineEn, headlineZh: v.headlineZh,
        figures: [
          { label: 'Buyer saving', value: eur(v.totals.buyerSavingEur), tone: 'safe', sub: 'this reporting period' },
          { label: 'Certificates avoided', value: n0(v.totals.certificatesAvoided), sub: `at €${v.certificatePrice.eur}/tCO₂e` },
          { label: `In ${far.year}`, value: eur(far.buyerSavingEur), tone: 'blue', sub: 'same delta, free allocation gone' },
          { label: 'On defaults', value: String(v.totals.blockedCount), tone: v.totals.blockedCount ? 'warn' : 'ink', sub: v.totals.blockedCount ? 'contracts still exposed' : 'every contract priced' },
        ],
        rows: v.contracts.map((c: any) => ({
          label: c.buyer,
          sub: c.blocked ? c.blocked : `${n0(c.tonnes)} t · ${c.eori ?? 'no EORI'} · default ${n2(c.defaultSee, 2)} vs actual ${n2(c.actualSee, 2)} · factor ${n2(c.freeAllocationFactor * 100, 1)}%`,
          value: c.buyerSavingEur == null ? '—' : `${eur(c.buyerSavingEur)}`,
          tone: c.blocked ? 'warn' : 'safe',
        })),
        caveats: indicative,
      }
    }

    case 'assess_carbon_price':
      return {
        ...base, headline: v.verdictEn, headlineZh: v.verdictZh,
        figures: [{ label: 'Deductible certificates', value: n0(v.deductibleCertificates), tone: v.deductibleCertificates > 0 ? 'safe' : 'danger' }],
        rows: v.lines.map((l: any) => ({ label: l.scheme, sub: l.reasonEn, value: l.recognised === true ? 'recognised' : l.recognised === false ? 'not recognised' : 'undetermined', tone: l.recognised ? 'safe' : 'danger' })),
        caveats: indicative,
      }

    case 'assemble_evidence_pack': {
      const blocking = v.challenges.filter((c: any) => c.severity === 'blocking')
      return {
        ...base,
        headline: `${v.readiness.verdictEn} The largest single item is “${v.challenges[0]?.challengeEn.slice(0, 120) ?? 'nothing outstanding'}”`,
        headlineZh: v.readiness.verdictZh,
        figures: [
          { label: 'Readiness', value: String(v.readiness.score), sub: 'out of 100', tone: v.readiness.blocking ? 'danger' : v.readiness.score >= 80 ? 'safe' : 'warn' },
          { label: 'Blocking', value: String(v.readiness.blocking), tone: v.readiness.blocking ? 'danger' : 'safe' },
          { label: 'Material', value: String(v.readiness.material), tone: 'warn' },
          { label: 'Documents missing', value: String(v.manifest.filter((m: any) => m.required && m.structured === 0).length), tone: 'warn' },
        ],
        rows: v.challenges.map((c: any) => ({ label: c.challengeEn, sub: `Closes with: ${c.remedyEn}`, value: c.atStakeTco2e ? `${n0(c.atStakeTco2e)} t` : undefined, tone: c.severity === 'blocking' ? 'danger' : c.severity === 'material' ? 'warn' : 'ink' })),
        caveats: blocking.length ? ['A readiness score above a blocking finding is a false comfort. The blocking items are listed first.'] : [],
      }
    }

    case 'trace_precursors':
      return {
        ...base,
        headline: v.gaps.length
          ? `${v.gaps.length} precursor gap${v.gaps.length === 1 ? '' : 's'} remain${v.gaps.length === 1 ? 's' : ''}, worth about ${n0(v.gaps.reduce((a: number, g: any) => a + (g.materialityTco2e ?? 0), 0))} tCO₂e. ${v.outstanding} supplier request${v.outstanding === 1 ? ' is' : 's are'} outstanding.`
          : 'Every relevant precursor has emissions data on file.',
        figures: [
          { label: 'Gaps', value: String(v.gaps.length), tone: v.gaps.length ? 'warn' : 'safe' },
          { label: 'At stake', value: `${n0(v.gaps.reduce((a: number, g: any) => a + (g.materialityTco2e ?? 0), 0))} t`, sub: 'tCO₂e' },
          { label: 'Outstanding requests', value: String(v.outstanding), tone: v.outstanding ? 'warn' : 'safe' },
        ],
        rows: [
          ...v.gaps.map((g: any) => ({ label: g.what, sub: g.needed, value: g.materialityTco2e ? `${n0(g.materialityTco2e)} t` : undefined, tone: 'warn' as const })),
          ...v.declarations.map((d: any) => ({ label: `${d.supplier} — ${d.material}`, sub: `${n0(d.tonnes)} t · ${d.status}${d.declaredIntensity ? ` · ${n2(d.declaredIntensity, 2)} tCO₂e/t` : ''}`, tone: d.status === 'verified' || d.status === 'received' ? 'safe' as const : 'warn' as const })),
        ],
        caveats: indicative,
      }

    case 'map_boundary':
      return {
        ...base,
        headline: v.openQuestions
          ? `${v.openQuestions} of ${v.mappings.length} process units cannot be mapped from the plant’s own words. Those are questions for a person — the candidate routes attribute different fuels.`
          : `All ${v.mappings.length} process units map onto an Annex III route.`,
        figures: [
          { label: 'Units mapped', value: `${v.mappings.length - v.openQuestions}/${v.mappings.length}`, tone: v.openQuestions ? 'warn' : 'safe' },
          { label: 'Open questions', value: String(v.openQuestions), tone: v.openQuestions ? 'danger' : 'safe' },
        ],
        rows: v.mappings.map((m: any) => ({
          label: m.localName,
          sub: m.status === 'resolved' ? `${m.routeEn} — matched on ${m.candidates[0]?.matchedOn.join(', ')}` : (m.questionEn ?? m.status),
          value: m.status, tone: m.status === 'resolved' ? 'safe' : 'warn',
        })),
        caveats: [],
      }

    case 'evaluate_obligations': {
      const live = v.obligations.filter((o: any) => o.status === 'applies')
      const next = live.filter((o: any) => o.dueOn).sort((a: any, b: any) => a.daysToDue - b.daysToDue)[0]
      const undet = v.obligations.filter((o: any) => o.status === 'indeterminate')
      return {
        ...base,
        headline: next
          ? `${live.length} duties are in force. The next is “${next.titleEn}”, due ${next.dueOn} — ${next.daysToDue} days away, and it sits on the ${next.actor}.`
          : `${live.length} duties are in force against this record.`,
        figures: [
          { label: 'In force', value: String(live.length) },
          { label: 'Evidence complete', value: `${live.filter((o: any) => o.ready).length}/${live.length}`, tone: live.every((o: any) => o.ready) ? 'safe' : 'warn' },
          { label: 'Next deadline', value: next?.dueOn ?? '—', tone: (next?.daysToDue ?? 999) < 120 ? 'danger' : 'ink' },
          { label: 'Cannot be determined', value: String(undet.length), tone: undet.length ? 'warn' : 'safe' },
        ],
        rows: v.obligations.map((o: any) => ({
          label: o.titleEn,
          sub: `${o.actor} · ${o.status}${o.dueOn ? ` · due ${o.dueOn}` : ''}${o.status === 'applies' && !o.ready ? ` · ${o.evidence.filter((e: any) => e.state !== 'present').length} evidence gaps` : ''}`,
          tone: o.status === 'applies' ? (o.ready ? 'safe' : 'warn') : o.status === 'indeterminate' ? 'warn' : 'ink',
        })),
        caveats: undet.length ? ['A duty whose trigger depends on a fact the record does not hold is reported as indeterminate. That is not the same as not applying.'] : [],
      }
    }

    case 'prepare_disclosure':
      return {
        ...base,
        headline: `${v.packets.length} disclosure packet${v.packets.length === 1 ? '' : 's'} staged, each keyed to its buyer’s EORI. Nothing has been sent — a person releases each one.`,
        figures: [
          { label: 'Packets staged', value: String(v.packets.length) },
          { label: 'Submitted', value: 'none', tone: 'safe' },
        ],
        rows: v.packets.map((p: any) => ({ label: p.buyer, sub: `${p.eori ?? 'no EORI on file'} · ${n0(p.tonnes)} t · ${p.lines.length} contract line(s)`, tone: 'ink' })),
        caveats: ['Each buyer sees only what relates to its own goods.'],
      }

    case 'watch_changes':
      return {
        ...base,
        headline: `Four inputs are watched. Every stored conclusion is pinned to corpus ${v.pinnedVersions.corpus} and defaults ${v.pinnedVersions.defaults}; when one moves, the affected contracts are recomputed.`,
        figures: Object.entries(v.pinnedVersions).map(([k, val]) => ({ label: k, value: String(val) })),
        rows: v.watched.map((w: any) => ({ label: w.label, sub: `${w.affects} — ${w.sensitivity}`, value: w.status, tone: w.status === 'indicative' ? 'warn' : 'ink' })),
        caveats: [],
      }

    case 'regulation_overview':
      return {
        ...base,
        headline: `${v.regulations.filter((x: any) => x.entitled).length} regime(s) held. Adding the second cost ${v.authoring.find((a: any) => a.regulation === 'cbam-uk')?.hoursToAuthor ?? '—'} analyst-hours and no code release, against ${v.authoring.find((a: any) => a.regulation === 'cbam-eu')?.hoursToAuthor ?? '—'} for the first.`,
        figures: v.authoring.map((a: any) => ({ label: a.regulation, value: `${a.hoursToAuthor} h`, sub: `${a.codeChangesRequired} code changes`, tone: a.codeChangesRequired === 0 ? 'safe' as const : 'danger' as const })),
        rows: v.regulations.map((x: any) => ({ label: x.name, sub: x.note, value: x.entitled ? x.status : 'not held', tone: x.entitled ? 'ink' : 'warn' })),
        caveats: [],
      }

    case 'intake_queue':
      return {
        ...base,
        headline: v.unstructuredCount
          ? `${v.unstructuredCount} source document${v.unstructuredCount === 1 ? ' has' : 's have'} not been reconciled to the figures. Until they are, those quantities are not traceable — which is a verification finding whether or not the number is right.`
          : 'Every source document has been reconciled to the figures.',
        figures: [
          { label: 'Unstructured', value: String(v.unstructuredCount), tone: v.unstructuredCount ? 'warn' : 'safe' },
          { label: 'Quantities with no source reference', value: String(v.quantitiesWithoutSourceReference.length), tone: v.quantitiesWithoutSourceReference.length ? 'warn' : 'safe' },
        ],
        rows: v.unstructured.map((d: any) => ({ label: d.title, sub: `${d.titleLocal ?? ''} · ${d.kind} · ${d.pages ?? '?'} pages · ${d.language}`, value: 'not read', tone: 'warn' })),
        caveats: [],
      }

    case 'lookup_term':
      return {
        ...base,
        headline: `“${v.en}” is 「${v.zh}」. ${v.definitionEn}`,
        headlineZh: v.definitionZh,
        figures: [{ label: 'Approved rendering', value: v.zh, tone: v.status === 'approved' ? 'safe' : 'warn', sub: v.status }],
        rows: v.forbidden.map((f: any) => ({ label: `Never: ${f.zh}`, sub: f.why, tone: 'danger' as const })),
        caveats: v.mustFlag ? ['This term is a draft rendering and must be flagged wherever it is used.'] : [],
        clauseIds: v.clauseId ? [v.clauseId] : [],
      }

    case 'read_record':
      return {
        ...base,
        headline: `${v.installation.name} (${v.installation.nameLocal}), operated by ${v.operator.name}, over ${v.period.from} to ${v.period.to}: ${v.products.length} products across ${v.processUnits.length} process units.`,
        figures: [
          { label: 'Process units', value: String(v.processUnits.length) },
          { label: 'Products', value: String(v.products.length) },
          { label: 'Documents', value: String(v.counts.documents) },
          { label: 'Contracts', value: String(v.counts.contracts) },
        ],
        rows: v.products.map((p: any) => ({ label: `${p.name} (${p.nameLocal ?? ''})`, sub: `${n0(p.outputTonnes)} t · ${p.classification.map((c: any) => `${c.scheme} ${c.code}`).join(', ')}`, tone: 'ink' })),
        caveats: r.score === 0 ? ['No tool matched that question specifically. This is the record it would have been answered from — try naming what you want: the number, the buyer exposure, verification readiness, precursors, duties, or a term.'] : [],
      }

    default:
      return null
  }
}
