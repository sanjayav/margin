// ───────────────────────────────────────────────────────────────────────────
// VERIFICATION READINESS — predicting the challenge before the site visit.
//
// An accredited verifier's findings are not random. They come from a short list
// of things that are always weak in a first-year submission, and each one is
// detectable from the record itself. So the challenges are DETERMINISTIC rules,
// not a model's guesses: same record, same findings, every time, each naming
// the Annex VI principle it comes from and the document that would close it.
//
// The value is the ordering. A verifier's day is finite and they spend it where
// the materiality is; so the pack is ranked by tCO₂e at stake, not by how easy
// the item is to fix. That ranking is what turns a checklist into preparation.
// ───────────────────────────────────────────────────────────────────────────
import type { RecordBundle } from '../record/types.js'
import type { EmbeddedEmissions } from './emissions.js'
import type { BoundaryMapping } from './boundaries.js'

export type Severity = 'blocking' | 'material' | 'housekeeping'

export interface Challenge {
  id: string
  severity: Severity
  /** What the verifier will say, in their words. */
  challengeEn: string
  challengeZh: string
  /** What closes it. Specific enough to hand to a plant engineer. */
  remedyEn: string
  remedyZh: string
  /** tCO₂e the finding puts in question. Drives the ranking. */
  atStakeTco2e: number | null
  /** Annex VI verification principle engaged. */
  principle: string
  clauseIds: string[]
  /** Record objects the finding points at, so the UI can jump to them. */
  refs: string[]
}

export interface EvidencePack {
  installationId: string
  period: { from: string; to: string }
  /** Ranked, most material first. */
  challenges: Challenge[]
  /** Documents the verifier will ask for, and whether they exist. */
  manifest: { kind: string; label: string; held: number; structured: number; required: boolean }[]
  readiness: {
    /** 0–100. Deliberately blunt: any blocking finding caps it at 40. */
    score: number
    verdictEn: string
    verdictZh: string
    blocking: number
    material: number
  }
  clauseIds: string[]
}

const REQUIRED_DOCS: { kind: string; label: string; required: boolean }[] = [
  { kind: 'production-log', label: 'Production records (activity level)', required: true },
  { kind: 'energy-invoice', label: 'Energy invoices', required: true },
  { kind: 'process-log', label: 'Process logs', required: true },
  { kind: 'meter-calibration', label: 'Meter calibration certificates', required: true },
  { kind: 'lab-report', label: 'Laboratory analyses (carbon content, NCV)', required: true },
  { kind: 'supplier-declaration', label: 'Supplier declarations for precursors', required: false },
  { kind: 'purchase-contract', label: 'Purchase contracts for precursors', required: false },
]

export function buildEvidencePack(b: RecordBundle, emissions: EmbeddedEmissions[], mappings: BoundaryMapping[]): EvidencePack {
  const ch: Challenge[] = []
  // NOT the sum over products: an integrated mill's chain rolls sinter into hot
  // metal into slab into coil, so adding attributed emissions across products
  // counts the same tonne up to four times. The exposure a boundary error puts
  // in question is the largest single attributed figure — the final good that
  // carries the whole chain.
  const totalAttributed = emissions.reduce((a, e) => Math.max(a, e.attributed), 0)

  // 1. Boundary is unsettled — nothing downstream survives this.
  for (const m of mappings.filter((x) => x.status !== 'resolved')) {
    // The boundary agent has already framed the question correctly for each
    // case. An unrecognised unit has no candidate routes at all, so telling the
    // verifier that "the routes on the table attribute different fuels" was
    // simply untrue for half of these findings.
    ch.push({
      id: `boundary.${m.processUnitId}`, severity: 'blocking',
      challengeEn: m.questionEn ?? `The Annex III route for “${m.localName}” is not established.`,
      challengeZh: m.questionZh ?? `“${m.localName}”的附件三生产路线尚未确定。`,
      remedyEn: m.status === 'ambiguous'
        ? 'A plant engineer states which route the unit actually runs, in writing, and the statement is filed as a process log.'
        : 'A plant engineer describes what the unit does and whether its output leaves the installation — it may sit outside the boundary entirely.',
      remedyZh: m.status === 'ambiguous'
        ? '由工艺工程师书面说明该单元实际所属路线，并作为工艺日志归档。'
        : '由工艺工程师说明该单元的功能及其产出是否离开本装置 — 该单元可能完全在边界之外。',
      atStakeTco2e: totalAttributed, principle: 'Completeness — the system boundary must be established before emissions are attributed.',
      clauseIds: ['cbam.annexIII', 'cbam.art8'], refs: [m.processUnitId],
    })
  }

  // 2. Unresolved precursors, ranked by what they actually put at stake.
  for (const e of emissions) {
    for (const u of e.unknowns) {
      if (!u.id.startsWith('precursor.')) continue
      ch.push({
        id: `${e.productId}.${u.id}`, severity: u.blocking ? 'blocking' : 'material',
        challengeEn: `${u.what}. On what basis is the precursor carried, and can the supplier’s figure be traced to that supplier’s own records?`,
        challengeZh: `${u.whatZh}。该前体以何基础计入？供应商数值能否追溯至其自身记录？`,
        remedyEn: u.needed,
        remedyZh: '取得供应商就每吨隐含排放出具的声明；若无，则以默认值计入并明确说明。',
        atStakeTco2e: u.materialityTco2e ?? null, principle: 'Accuracy — precursor emissions are part of the declared figure.',
        clauseIds: ['cbam.annexIII', 'cbam.art8'], refs: [e.productId],
      })
    }
  }

  // 3. Meter calibration — the classic first-visit finding.
  const calib = b.documents.filter((d) => d.kind === 'meter-calibration')
  const metered = b.energyFlows.filter((e) => e.amount.quality === 'measured')
  if (metered.length && !calib.length) {
    ch.push({
      id: 'meters.uncalibrated', severity: 'material',
      challengeEn: `${metered.length} energy quantities are presented as measured, but no meter calibration certificate is on file. Show that the instruments were within calibration for the whole period.`,
      challengeZh: `有 ${metered.length} 项能源数据以"实测"呈报，但档案中无计量器具校准证书。请证明相关仪表在整个报告期内均处于校准有效期内。`,
      remedyEn: 'File the calibration certificate for each meter covering the reporting period, and an uncertainty assessment for each measurement system.',
      remedyZh: '归档覆盖报告期的各计量器具校准证书，以及各测量系统的不确定度评估。',
      atStakeTco2e: emissions.reduce((a, e) => a + e.direct + e.indirect, 0),
      principle: 'Accuracy — measurement systems must be demonstrably fit for purpose.',
      clauseIds: ['cbam.art8'], refs: metered.map((m) => m.id),
    })
  }

  // 4. Estimated data inside the boundary.
  for (const e of emissions) {
    const est = e.terms.filter((t) => t.quality === 'estimated' || t.quality === 'default')
    if (!est.length) continue
    const at = est.reduce((a, t) => a + t.tco2e, 0)
    ch.push({
      id: `${e.productId}.estimated`, severity: at / Math.max(e.attributed, 1) > 0.1 ? 'material' : 'housekeeping',
      challengeEn: `${est.length} term${est.length === 1 ? '' : 's'} in ${e.productName} rest on estimated or default data, covering ${Math.round((at / Math.max(e.attributed, 1)) * 100)}% of attributed emissions. Justify why a measured value was not available.`,
      challengeZh: `${e.productName}中有 ${est.length} 项基于估算或默认数据，占归属排放的 ${Math.round((at / Math.max(e.attributed, 1)) * 100)}%。请说明为何无法取得实测值。`,
      remedyEn: 'Either replace with a measured value, or document the reason the measurement is not technically feasible and the conservatism of the substitute.',
      remedyZh: '或以实测值替代；或书面记录技术上无法测量的原因，以及替代值的保守性。',
      atStakeTco2e: at, principle: 'Conservatism — substitutes must not understate emissions.',
      clauseIds: ['cbam.art7', 'cbam.art8'], refs: [e.productId],
    })
  }

  // 5. Unstructured documents — the pack is not traceable until they are read.
  const unstructured = b.documents.filter((d) => !d.structured)
  if (unstructured.length) {
    ch.push({
      id: 'intake.unstructured', severity: 'housekeeping',
      challengeEn: `${unstructured.length} source document${unstructured.length === 1 ? ' has' : 's have'} not been reconciled to the figures. Every quantity in the declaration must be traceable to a source record.`,
      challengeZh: `有 ${unstructured.length} 份源文件尚未与数据核对。申报中的每一数量均须可追溯至源记录。`,
      remedyEn: 'Complete intake so each quantity carries a source reference to the document and page it came from.',
      remedyZh: '完成数据结构化，使每一数量均附有源文件及页码的引用。',
      atStakeTco2e: null, principle: 'Transparency — the audit trail must be complete.',
      clauseIds: ['cbam.art8'], refs: unstructured.map((d) => d.id),
    })
  }

  // 6. Activity level basis.
  for (const e of emissions) {
    const p = b.products.find((x) => x.id === e.productId)
    if (p && p.output.quality !== 'measured') {
      ch.push({
        id: `${e.productId}.activity`, severity: 'material',
        challengeEn: `Activity level for ${e.productName} is ${p.output.quality}, not measured. SEE is a quotient — an overstated denominator understates the result, which is the direction a verifier tests hardest.`,
        challengeZh: `${e.productName}的活动水平为"${p.output.quality}"而非实测。单位隐含排放为商值 — 分母偏高会低估结果，而这正是核查机构最着力检验的方向。`,
        remedyEn: 'Reconcile output to weighbridge or dispatch records for the period.',
        remedyZh: '将产量与报告期的地磅或发货记录核对一致。',
        atStakeTco2e: e.attributed, principle: 'Accuracy — the activity level is half the calculation.',
        clauseIds: ['cbam.annexIV'], refs: [e.productId],
      })
    }
  }

  const rank: Record<Severity, number> = { blocking: 0, material: 1, housekeeping: 2 }
  ch.sort((a, z) => rank[a.severity] - rank[z.severity] || (z.atStakeTco2e ?? 0) - (a.atStakeTco2e ?? 0))

  const manifest = REQUIRED_DOCS.map((d) => {
    const held = b.documents.filter((x) => x.kind === d.kind)
    return { kind: d.kind, label: d.label, held: held.length, structured: held.filter((x) => x.structured).length, required: d.required }
  })

  const blocking = ch.filter((c) => c.severity === 'blocking').length
  const material = ch.filter((c) => c.severity === 'material').length
  const missingRequired = manifest.filter((m) => m.required && m.structured === 0).length
  let score = 100 - material * 9 - missingRequired * 11 - ch.filter((c) => c.severity === 'housekeeping').length * 3
  if (blocking) score = Math.min(score, 40 - blocking * 5)
  score = Math.max(0, Math.min(100, Math.round(score)))

  const verdictEn = blocking
    ? `Not ready. ${blocking} finding${blocking === 1 ? '' : 's'} would stop the verification before the site visit begins.`
    : score >= 80
      ? `Substantially ready. ${material} material finding${material === 1 ? '' : 's'} to close before the visit.`
      : `Not yet ready. ${material} material finding${material === 1 ? '' : 's'} and ${missingRequired} required document set${missingRequired === 1 ? '' : 's'} outstanding.`

  const verdictZh = blocking
    ? `尚未就绪。有 ${blocking} 项发现将导致核查在现场访问前即行中止。`
    : score >= 80
      ? `基本就绪。现场访问前尚需关闭 ${material} 项重要发现。`
      : `尚未就绪。有 ${material} 项重要发现及 ${missingRequired} 类必备文件未完成。`

  return {
    installationId: b.installation.id, period: { from: b.period.from, to: b.period.to },
    challenges: ch, manifest,
    readiness: { score, verdictEn, verdictZh, blocking, material },
    clauseIds: ['cbam.art8'],
  }
}
