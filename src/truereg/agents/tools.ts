// ───────────────────────────────────────────────────────────────────────────
// THE TOOL LAYER — the deterministic engines, exposed as verifiable tools.
//
// The line the one-pager draws runs straight through this file. Above it,
// agents gather, interpret and explain. Below it, rules decide. Every tool here
// is a thin wrapper over a pure function in src/truereg/cbam or
// src/truereg/obligations; none of them asks a model anything, and none of them
// computes a figure the engine did not.
//
// Three invariants, enforced here rather than requested in a prompt:
//
//   1. NO NUMBER WITHOUT A TOOL. An agent may compose and quote what comes
//      back. It may not derive. Anything it cannot get from a tool it must say
//      it does not know.
//   2. EVERY RESULT CARRIES ITS PROVENANCE. Corpus version, term-base version,
//      defaults-table version and status, the record snapshot, and the exact
//      inputs. That is what makes an answer re-runnable in front of a verifier
//      eighteen months later.
//   3. NOTHING IS SUBMITTED. Tools that touch the outside world — a disclosure
//      to a buyer, a request to a supplier — return a STAGED action for a human
//      to approve. There is no autonomous send.
// ───────────────────────────────────────────────────────────────────────────
import type { RecordBundle, SalesContract } from '../record/types.js'
import { CORPUS_VERSION, CLAUSES, citeAll, clausesFor, REGULATIONS, type RegulationId } from '../corpus/clauses.js'
import { TERMBASE_VERSION, TERMS, getTerm, lintChinese } from '../corpus/terms.js'
import { mapBoundaries, ROUTES, getRoute } from '../cbam/boundaries.js'
import { calculateAll, calculateEmbedded, precursorCategory } from '../cbam/emissions.js'
import { currentDefaults, defaultIntensity } from '../cbam/defaults.js'
import { assessArticle9 } from '../cbam/article9.js'
import { computeDelta, factorFor, type CertificatePrice } from '../cbam/delta.js'
import { buildEvidencePack } from '../cbam/verify.js'
import { OBLIGATIONS, AUTHORING } from '../obligations/authored.js'
import { evaluateObligations, criticalPath } from '../obligations/graph.js'
import { projectFacts, makeProbe } from '../obligations/facts.js'

export interface Provenance {
  corpusVersion: string
  termbaseVersion: string
  defaultsVersion: string
  defaultsStatus: 'published' | 'indicative'
  installationId: string
  period: string
  /** Everything downstream must repeat this where it is 'indicative'. */
  caveat: string | null
  computedAt: string
}

export interface ToolResult<T> {
  tool: string
  inputs: Record<string, unknown>
  value: T
  provenance: Provenance
  ms?: number
}

/** Something the agent wants to happen in the world. NEVER executed here. */
export interface StagedAction {
  kind: 'disclose-to-buyer' | 'request-supplier-data' | 'ask-human' | 'open-screen'
  /** Why a human is in the loop at all — money, or regulatory risk, or both. */
  escalationReason: string
  summaryEn: string
  summaryZh: string
  payload: Record<string, unknown>
}

export interface ToolContext {
  bundle: RecordBundle
  contracts: SalesContract[]
  certificatePrice: CertificatePrice
  /** Regimes this workspace is entitled to. Enforced in runTool, not in a prompt. */
  allowed: RegulationId[]
  /** Carry unresolved precursors at default rather than refusing to state a
   *  figure. A human decision, surfaced in every result that depends on it. */
  substituteDefaults: boolean
  /** Collected in request order. The client renders them for approval. */
  staged: StagedAction[]
}

export class ToolError extends Error {
  constructor(message: string, public code: string) { super(message); this.name = 'ToolError' }
}

function prov(ctx: ToolContext): Provenance {
  const d = currentDefaults()
  return {
    corpusVersion: CORPUS_VERSION, termbaseVersion: TERMBASE_VERSION,
    defaultsVersion: d.version, defaultsStatus: d.status,
    installationId: ctx.bundle.installation.id,
    period: `${ctx.bundle.period.from}/${ctx.bundle.period.to}`,
    caveat: d.status === 'published' ? null : d.caveat,
    computedAt: new Date().toISOString(),
  }
}

const wrap = <T>(ctx: ToolContext, tool: string, inputs: Record<string, unknown>, value: T): ToolResult<T> =>
  ({ tool, inputs, value, provenance: prov(ctx) })

function assertEntitled(ctx: ToolContext, r: unknown): RegulationId {
  const id = String(r ?? 'cbam-eu') as RegulationId
  if (!REGULATIONS[id]) throw new ToolError(`Unknown regulation "${id}". Known: ${Object.keys(REGULATIONS).join(', ')}.`, 'unknown_regulation')
  if (!ctx.allowed.includes(id)) throw new ToolError(`This workspace is not subscribed to ${REGULATIONS[id].name}. Do not analyse or discuss it.`, 'not_entitled')
  return id
}

const memo = new WeakMap<ToolContext, any>()
/** One computation per context, shared by every tool that needs it. Keeps a
 *  multi-tool turn internally consistent — two tools can never disagree. */
function core(ctx: ToolContext) {
  let c = memo.get(ctx)
  if (c) return c
  const mappings = mapBoundaries(ctx.bundle)
  const emissions = calculateAll(ctx.bundle, { substituteDefaultsForUnknownPrecursors: ctx.substituteDefaults })
  const declared = emissions.reduce((a, e) => a + e.attributed, 0)
  const article9 = assessArticle9(ctx.bundle.carbonPricesPaid, declared)
  const delta = computeDelta(ctx.contracts, emissions, {
    price: ctx.certificatePrice, defaultsCountry: ctx.bundle.installation.country,
    article9Certificates: article9.deductibleCertificates,
  })
  const pack = buildEvidencePack(ctx.bundle, emissions, mappings)
  const facts = projectFacts(ctx.bundle, ctx.contracts)
  const states = evaluateObligations(OBLIGATIONS, { facts, periodEnd: ctx.bundle.period.to, probe: makeProbe(ctx.bundle) })
  c = { mappings, emissions, article9, delta, pack, facts, states }
  memo.set(ctx, c)
  return c
}

// ── INTAKE ──────────────────────────────────────────────────────────────────

export function readRecord(ctx: ToolContext) {
  const b = ctx.bundle
  return wrap(ctx, 'read_record', {}, {
    operator: { name: b.operator.name, nameLocal: b.operator.nameLocal, country: b.operator.country },
    installation: { id: b.installation.id, name: b.installation.name, nameLocal: b.installation.nameLocal, country: b.installation.country },
    period: { from: b.period.from, to: b.period.to },
    processUnits: b.processUnits.map((u) => ({ id: u.id, localName: u.localName, name: u.name, describedFunction: u.describedFunction, feeds: u.feeds })),
    products: b.products.map((p) => ({ id: p.id, name: p.name, nameLocal: p.nameLocal, classification: p.classification, outputTonnes: p.output.value, outputQuality: p.output.quality })),
    counts: {
      energyFlows: b.energyFlows.length, materialFlows: b.materialFlows.length,
      directEmissionSources: b.directEmissions.length, documents: b.documents.length,
      supplierDeclarations: b.supplierDeclarations.length, contracts: ctx.contracts.length,
    },
  })
}

export function intakeQueue(ctx: ToolContext) {
  const unstructured = ctx.bundle.documents.filter((d) => !d.structured)
  const missingRef = [
    ...ctx.bundle.energyFlows.filter((e) => !e.amount.sourceRef).map((e) => ({ kind: 'energyFlow', id: e.id, what: e.carrier })),
    ...ctx.bundle.directEmissions.filter((d) => !d.amount.sourceRef).map((d) => ({ kind: 'directEmission', id: d.id, what: d.category })),
  ]
  return wrap(ctx, 'intake_queue', {}, {
    unstructured: unstructured.map((d) => ({ id: d.id, kind: d.kind, title: d.title, titleLocal: d.titleLocal, language: d.language, pages: d.pages })),
    unstructuredCount: unstructured.length,
    quantitiesWithoutSourceReference: missingRef,
    note: 'A quantity with no source reference cannot be traced by a verifier and is a finding regardless of whether the number is right.',
  })
}

// ── BOUNDARY ────────────────────────────────────────────────────────────────

export function mapBoundary(ctx: ToolContext) {
  const { mappings } = core(ctx)
  const open = mappings.filter((m: any) => m.status !== 'resolved')
  for (const m of open) {
    ctx.staged.push({
      kind: 'ask-human',
      escalationReason: 'The production route decides which fuels are attributed. A wrong route is a wrong number on every downstream figure.',
      summaryEn: m.questionEn ?? '', summaryZh: m.questionZh ?? '',
      payload: { processUnitId: m.processUnitId, localName: m.localName, candidates: m.candidates.map((c: any) => ({ routeId: c.route.id, nameEn: c.route.nameEn, nameZh: c.route.nameZh, confidence: c.confidence, evidence: c.evidence })) },
    })
  }
  return wrap(ctx, 'map_boundary', {}, {
    mappings: mappings.map((m: any) => ({
      processUnitId: m.processUnitId, localName: m.localName, status: m.status,
      routeId: m.resolved?.id ?? null, routeEn: m.resolved?.nameEn ?? null, routeZh: m.resolved?.nameZh ?? null,
      candidates: m.candidates.map((c: any) => ({ routeId: c.route.id, confidence: Number(c.confidence.toFixed(2)), matchedOn: c.evidence.map((e: any) => e.marker) })),
      questionEn: m.questionEn ?? null,
    })),
    openQuestions: open.length,
    routes: ROUTES.map((r) => ({ id: r.id, nameEn: r.nameEn, nameZh: r.nameZh, category: r.category, relevantPrecursors: r.relevantPrecursors, excludes: r.excludes })),
    clauseIds: ['cbam.annexIII'],
  })
}

// ── PRECURSOR ───────────────────────────────────────────────────────────────

export function tracePrecursors(ctx: ToolContext) {
  const { emissions } = core(ctx)
  const gaps = emissions.flatMap((e: any) => e.unknowns.filter((u: any) => u.id.startsWith('precursor.')).map((u: any) => ({ productId: e.productId, productName: e.productName, ...u })))
  const decls = ctx.bundle.supplierDeclarations.map((s) => ({
    id: s.id, supplier: s.supplierName, supplierLocal: s.supplierNameLocal, material: s.material,
    tonnes: s.received.value, status: s.status, requestedOn: s.requestedOn ?? null,
    declaredIntensity: s.declaredIntensity?.value ?? null,
    category: precursorCategory(s.material),
  }))
  for (const g of gaps) {
    ctx.staged.push({
      kind: 'request-supplier-data',
      escalationReason: `Unresolved precursor worth roughly ${Math.round(g.materialityTco2e ?? 0).toLocaleString()} tCO₂e. Carrying it at default is a commercial decision, not a technical one.`,
      summaryEn: `Request embedded-emissions data: ${g.what}`,
      summaryZh: `请求隐含排放数据：${g.whatZh}`,
      payload: { productId: g.productId, unknownId: g.id, materialityTco2e: g.materialityTco2e ?? null },
    })
  }
  return wrap(ctx, 'trace_precursors', {}, {
    declarations: decls,
    gaps: gaps.map((g: any) => ({ productId: g.productId, productName: g.productName, what: g.what, whatZh: g.whatZh, needed: g.needed, materialityTco2e: g.materialityTco2e ?? null, blocking: g.blocking })),
    outstanding: decls.filter((d) => d.status === 'none' || d.status === 'requested').length,
    note: 'A precursor is only what Annex III lists as relevant for the route. Do not chase the whole bill of materials.',
    clauseIds: ['cbam.art3', 'cbam.annexIII'],
  })
}

// ── EMISSIONS (deterministic core) ──────────────────────────────────────────

export function computeEmissions(ctx: ToolContext, productId?: string | null) {
  const { emissions } = core(ctx)
  const rows = productId ? emissions.filter((e: any) => e.productId === productId) : emissions
  if (productId && !rows.length) throw new ToolError(`No product "${productId}". Call read_record for the ids.`, 'unknown_product')
  return wrap(ctx, 'compute_embedded_emissions', { productId: productId ?? null }, {
    products: rows.map((e: any) => ({
      productId: e.productId, productName: e.productName, routeId: e.routeId, category: e.category,
      activityLevelTonnes: e.activityLevel,
      specificEmbeddedEmissions: e.see, seeDirect: e.seeDirect, seeIndirect: e.seeIndirect,
      attributedTco2e: e.attributed, directTco2e: e.direct, indirectTco2e: e.indirect, precursorTco2e: e.precursor,
      basis: e.basis, weakestQuality: e.weakestQuality, publishedInputs: e.publishedInputs,
      terms: e.terms.map((t: any) => ({ bucket: t.bucket, label: t.label, tco2e: t.tco2e, maths: t.maths, quality: t.quality })),
      unknowns: e.unknowns.map((u: any) => ({ what: u.what, needed: u.needed, blocking: u.blocking, materialityTco2e: u.materialityTco2e ?? null })),
      caveats: e.caveats,
    })),
    substituteDefaults: ctx.substituteDefaults,
    method: 'Annex IV: attributed emissions ÷ activity level, plus the embedded emissions of relevant precursors consumed.',
    clauseIds: ['cbam.art7', 'cbam.annexIV', 'cbam.annexIII'],
  })
}

export function compareToDefaults(ctx: ToolContext) {
  const { emissions } = core(ctx)
  const country = ctx.bundle.installation.country
  return wrap(ctx, 'compare_to_defaults', {}, {
    rows: emissions.map((e: any) => {
      const d = e.category ? defaultIntensity(e.category, country, true) : null
      return {
        productId: e.productId, productName: e.productName, category: e.category,
        actualSee: e.see, defaultSee: d?.total ?? null,
        deltaPerTonne: e.see != null && d ? d.total - e.see : null,
        defaultStatus: d?.status ?? null, defaultFellBackToWorldAverage: d?.fellBack ?? null,
      }
    }),
    defaultsCaveat: currentDefaults().status === 'published' ? null : currentDefaults().caveat,
    clauseIds: ['cbam.default-values', 'cbam.art7'],
  })
}

// ── DELTA ───────────────────────────────────────────────────────────────────

export function buyerExposure(ctx: ToolContext, year?: number | null) {
  const { delta } = core(ctx)
  // Forward view: same tonnes, same SEE, the phase-out of free allocation only.
  const horizon = [2026, 2027, 2028, 2029, 2030, 2032, 2034].map((y) => {
    const f = factorFor(y)
    const base = delta.contracts.filter((c: any) => !c.blocked)
    const saving = base.reduce((a: number, c: any) => a + (c.deltaSeePerTonne! * c.tonnes * f * ctx.certificatePrice.eur), 0)
    return { year: y, freeAllocationFactor: f, buyerSavingEur: saving }
  })
  return wrap(ctx, 'buyer_exposure', { year: year ?? null }, {
    headlineEn: delta.headlineEn, headlineZh: delta.headlineZh,
    certificatePrice: delta.price,
    contracts: delta.contracts.map((c: any) => ({
      contractId: c.contractId, buyer: c.buyerName, buyerCountry: c.buyerCountry, eori: c.eori,
      tonnes: c.tonnes, year: c.year, defaultSee: c.defaultSee, actualSee: c.actualSee,
      deltaPerTonne: c.deltaSeePerTonne, certificatesOnDefault: c.certificatesOnDefault,
      certificatesOnActual: c.certificatesOnActual, buyerSavingEur: c.buyerSavingEur,
      savingPerTonneEur: c.savingPerTonneEur, savingAsShareOfContract: c.savingAsShareOfContract,
      freeAllocationFactor: c.freeAllocationFactor, blocked: c.blocked,
    })),
    totals: delta.totals,
    horizon,
    note: 'The mill carries no CBAM obligation. Every figure here is the BUYER’s surrender, which is why it is stated per contract and per EORI.',
    clauseIds: delta.clauseIds,
  })
}

export function article9(ctx: ToolContext) {
  const { article9: a } = core(ctx)
  return wrap(ctx, 'assess_carbon_price', {}, {
    verdictEn: a.verdictEn, verdictZh: a.verdictZh,
    deductibleCertificates: a.deductibleCertificates,
    declaredTco2e: a.declaredTco2e,
    lines: a.lines.map((l: any) => ({ scheme: l.scheme, recognised: l.recognition?.recognised ?? null, paid: l.paid, currency: l.currency, freeAllocation: l.freeAllocation, deductible: l.deductible, reasonEn: l.reasonEn, reasonZh: l.reasonZh, asOf: l.recognition?.asOf ?? null })),
    clauseIds: a.clauseIds,
  })
}

// ── VERIFIER ────────────────────────────────────────────────────────────────

export function evidencePack(ctx: ToolContext) {
  const { pack } = core(ctx)
  return wrap(ctx, 'assemble_evidence_pack', {}, {
    readiness: pack.readiness,
    challenges: pack.challenges.map((c: any) => ({
      id: c.id, severity: c.severity, challengeEn: c.challengeEn, challengeZh: c.challengeZh,
      remedyEn: c.remedyEn, remedyZh: c.remedyZh, atStakeTco2e: c.atStakeTco2e, principle: c.principle, refs: c.refs,
    })),
    manifest: pack.manifest,
    clauseIds: pack.clauseIds,
  })
}

// ── DISCLOSURE ──────────────────────────────────────────────────────────────

export function prepareDisclosure(ctx: ToolContext, eori?: string | null) {
  const { delta, emissions } = core(ctx)
  const rows = delta.contracts.filter((c: any) => !eori || c.eori === eori)
  if (eori && !rows.length) throw new ToolError(`No contract carries EORI "${eori}".`, 'unknown_eori')
  const byBuyer = new Map<string, any>()
  for (const c of rows) {
    const key = c.eori ?? c.buyerName
    const e = emissions.find((x: any) => delta.contracts.some((d: any) => d.contractId === c.contractId) && x.productId === ctx.contracts.find((k) => k.id === c.contractId)?.productId)
    const cur = byBuyer.get(key) ?? { eori: c.eori, buyer: c.buyerName, country: c.buyerCountry, tonnes: 0, lines: [] }
    cur.tonnes += c.tonnes
    cur.lines.push({ contractId: c.contractId, tonnes: c.tonnes, productId: e?.productId ?? null, see: e?.see ?? null, basis: e?.basis ?? null, verified: false })
    byBuyer.set(key, cur)
  }
  const packets = [...byBuyer.values()]
  for (const p of packets) {
    ctx.staged.push({
      kind: 'disclose-to-buyer',
      escalationReason: 'Disclosure sends this installation’s emissions data to a third party. It is irreversible and commercially sensitive, so a person releases it.',
      summaryEn: `Share the emissions record for ${p.tonnes.toLocaleString()} t with ${p.buyer} (${p.eori ?? 'no EORI on file'}).`,
      summaryZh: `向 ${p.buyer}（${p.eori ?? '档案中无EORI'}）共享 ${p.tonnes.toLocaleString()} 吨货物的排放记录。`,
      payload: { eori: p.eori, buyer: p.buyer, tonnes: p.tonnes, lines: p.lines },
    })
  }
  return wrap(ctx, 'prepare_disclosure', { eori: eori ?? null }, {
    packets,
    submitted: false,
    note: 'Nothing has been sent. Each packet is staged for a person to release, and each buyer sees only what relates to its own goods.',
    clauseIds: ['cbam.art10', 'cbam.art6'],
  })
}

// ── OBLIGATIONS & WATCH ─────────────────────────────────────────────────────

export function obligationState(ctx: ToolContext, regulation?: string | null) {
  const reg = regulation ? assertEntitled(ctx, regulation) : null
  const { states } = core(ctx)
  const rows = states.filter((s: any) => !reg || s.obligation.regulation === reg).filter((s: any) => ctx.allowed.includes(s.obligation.regulation))
  return wrap(ctx, 'evaluate_obligations', { regulation: reg }, {
    obligations: rows.map((s: any) => ({
      id: s.obligation.id, regulation: s.obligation.regulation, actor: s.obligation.actor,
      titleEn: s.obligation.titleEn, titleZh: s.obligation.titleZh,
      summaryEn: s.obligation.summaryEn, summaryZh: s.obligation.summaryZh,
      status: s.status, ready: s.ready, dueOn: s.dueOn, daysToDue: s.daysToDue,
      because: s.because, unknownFacts: s.unknownFacts,
      evidence: s.evidence.map((e: any) => ({ label: e.requirement.label, labelZh: e.requirement.labelZh, state: e.state, detail: e.detail, needsThirdParty: !!e.requirement.needsThirdParty })),
      consequence: s.obligation.consequence ?? null,
      dependsOn: s.obligation.dependsOn ?? [],
      clauseIds: s.obligation.clauseIds,
    })),
    authoring: AUTHORING.filter((a) => ctx.allowed.includes(a.regulation)),
  })
}

export function watchChanges(ctx: ToolContext) {
  const { states, emissions, delta } = core(ctx)
  const d = currentDefaults()
  // What a change to each watched input would move. This is the watch agent's
  // actual job: not "the law changed" but "these installations and these
  // contracts are now different, by this much".
  const exposedTonnes = delta.contracts.filter((c: any) => !c.blocked).reduce((a: number, c: any) => a + c.tonnes, 0)
  return wrap(ctx, 'watch_changes', {}, {
    watched: [
      { id: 'defaults', label: 'Default values table', version: d.version, status: d.status, affects: `${delta.contracts.length} contract(s), ${exposedTonnes.toLocaleString()} t — the default is the comparator on every one.`, sensitivity: 'A 10% rise in the crude-steel default raises the value of proving actuals proportionally.' },
      { id: 'article9', label: 'Article 9 recognition of the China national ETS', version: CORPUS_VERSION, status: 'monitored', affects: `${ctx.bundle.carbonPricesPaid.map((p) => p.scheme).join(', ') || 'no scheme recorded'}`, sensitivity: 'Recognition would convert a domestic cost already borne into a deduction on the buyer’s surrender.' },
      { id: 'free-allocation', label: 'CBAM free-allocation phase-out factor', version: CORPUS_VERSION, status: 'legislated', affects: 'Every contract, rising each year to 2034.', sensitivity: `The same delta is worth ${(factorFor(2034) / factorFor(2026)).toFixed(0)}× more in 2034 than in 2026.` },
      { id: 'corpus', label: 'Clause corpus', version: CORPUS_VERSION, status: 'current', affects: `${states.filter((s: any) => s.status === 'applies').length} live obligation(s).`, sensitivity: 'Any amendment re-opens every conclusion pinned to an earlier corpus version.' },
    ],
    pinnedVersions: { corpus: CORPUS_VERSION, termbase: TERMBASE_VERSION, defaults: d.version },
    recomputeNote: `Every stored conclusion pins these versions. When one moves, the ${emissions.length} product figure(s) and ${delta.contracts.length} contract exposure(s) here are recomputed and the difference is reported.`,
  })
}

// ── CORPUS ──────────────────────────────────────────────────────────────────

export function citeClause(ctx: ToolContext, ids: string[]) {
  const rows = citeAll(ids)
  const missing = rows.filter((r: any) => 'missing' in r)
  if (missing.length === rows.length) throw new ToolError(`No clause matches ${ids.join(', ')}. Available: ${CLAUSES.map((c) => c.id).join(', ')}.`, 'unknown_clause')
  return wrap(ctx, 'cite_clause', { ids }, {
    clauses: rows.map((r: any) => 'missing' in r ? { id: r.id, missing: true } : {
      id: r.id, citation: r.citation, titleEn: r.titleEn, titleZh: r.titleZh,
      textEn: r.textEn, textZh: r.textZh, status: r.status, celex: r.celex ?? null, url: r.url ?? null,
      version: r.version, governingLanguage: 'en',
    }),
    note: 'The EU text governs. The Chinese rendering is a reading aid and must be presented as such.',
  })
}

export function lookupTerm(ctx: ToolContext, term: string) {
  const t = getTerm(term)
  if (!t) throw new ToolError(`"${term}" is not in the term base. Do not translate it yourself — a rendering that is not in the term base must be flagged, not invented. Terms held: ${TERMS.map((x) => x.en).join(', ')}.`, 'unknown_term')
  return wrap(ctx, 'lookup_term', { term }, {
    en: t.en, zh: t.zh, definitionEn: t.definitionEn, definitionZh: t.definitionZh,
    status: t.status, forbidden: t.forbidden, clauseId: t.clauseId ?? null, version: t.version,
    mustFlag: t.status === 'draft',
  })
}

export function checkChinese(ctx: ToolContext, text: string) {
  const hits = lintChinese(text)
  return wrap(ctx, 'check_chinese', { chars: text.length }, {
    ok: hits.length === 0,
    problems: hits.map((h) => ({ wrong: h.wrong, correct: h.term.zh, term: h.term.en, why: h.why })),
    note: hits.length ? 'Rewrite using the approved rendering before showing this to anyone. A near-miss here changes the number, not just the tone.' : 'No forbidden rendering found.',
  })
}

export function regulationOverview(ctx: ToolContext) {
  return wrap(ctx, 'regulation_overview', {}, {
    regulations: Object.values(REGULATIONS).map((r) => ({ ...r, entitled: ctx.allowed.includes(r.id), clauses: clausesFor(r.id).length })),
    authoring: AUTHORING,
    note: 'Regulations this workspace is not entitled to must not be analysed.',
  })
}

// ── registry ────────────────────────────────────────────────────────────────

export const TOOL_REGISTRY = [
  'read_record', 'intake_queue', 'map_boundary', 'trace_precursors',
  'compute_embedded_emissions', 'compare_to_defaults', 'buyer_exposure', 'assess_carbon_price',
  'assemble_evidence_pack', 'prepare_disclosure', 'evaluate_obligations', 'watch_changes',
  'cite_clause', 'lookup_term', 'check_chinese', 'regulation_overview',
] as const
export type ToolName = (typeof TOOL_REGISTRY)[number]

export function runTool(name: string, input: any, ctx: ToolContext): ToolResult<unknown> {
  const t0 = Date.now()
  const i = input ?? {}
  let r: ToolResult<unknown>
  switch (name) {
    case 'read_record': r = readRecord(ctx); break
    case 'intake_queue': r = intakeQueue(ctx); break
    case 'map_boundary': r = mapBoundary(ctx); break
    case 'trace_precursors': r = tracePrecursors(ctx); break
    case 'compute_embedded_emissions': r = computeEmissions(ctx, i.productId); break
    case 'compare_to_defaults': r = compareToDefaults(ctx); break
    case 'buyer_exposure': r = buyerExposure(ctx, i.year); break
    case 'assess_carbon_price': r = article9(ctx); break
    case 'assemble_evidence_pack': r = evidencePack(ctx); break
    case 'prepare_disclosure': r = prepareDisclosure(ctx, i.eori); break
    case 'evaluate_obligations': r = obligationState(ctx, i.regulation); break
    case 'watch_changes': r = watchChanges(ctx); break
    case 'cite_clause': r = citeClause(ctx, Array.isArray(i.ids) ? i.ids : [i.id].filter(Boolean)); break
    case 'lookup_term': r = lookupTerm(ctx, String(i.term ?? '')); break
    case 'check_chinese': r = checkChinese(ctx, String(i.text ?? '')); break
    case 'regulation_overview': r = regulationOverview(ctx); break
    default: throw new ToolError(`Unknown tool "${name}". Available: ${TOOL_REGISTRY.join(', ')}.`, 'unknown_tool')
  }
  r.ms = Date.now() - t0
  return r
}

export function runToolSafe(name: string, input: any, ctx: ToolContext): { ok: true; result: ToolResult<unknown> } | { ok: false; error: { code: string; message: string } } {
  try { return { ok: true, result: runTool(name, input, ctx) } }
  catch (e: any) { return { ok: false, error: { code: e?.code ?? 'tool_error', message: String(e?.message ?? e) } } }
}

export function defaultContext(bundle: RecordBundle, contracts: SalesContract[], allowed: RegulationId[] = ['cbam-eu', 'cbam-uk']): ToolContext {
  return {
    bundle, contracts, allowed, substituteDefaults: true, staged: [],
    certificatePrice: { eur: 78, asOf: '2026-09-01', source: 'Assumed, tracking the EU ETS auction price', status: 'assumed' },
  }
}
