// ───────────────────────────────────────────────────────────────────────────
// AUTHORED OBLIGATIONS — rows, not code.
//
// This file is the deliverable of an ANALYST, not an engineer. Nothing below
// imports an engine, computes anything, or branches. If adding a regime ever
// requires touching graph.ts, facts.ts or the engines, that is a defect in the
// obligation model and it is tracked as one.
//
// UK CBAM is authored here alongside the EU mechanism for exactly that reason:
// it is the proof that the second regime cost rows and hours rather than a
// release. Its authoring record sits next to the EU one so the ratio is visible
// on the screen rather than asserted in a deck.
// ───────────────────────────────────────────────────────────────────────────
import { CLAUSES } from '../corpus/clauses.js'
import { assertGraphIntegrity, type AuthoringRecord, type Obligation } from './graph.js'

const EU_BOUND = { fact: 'destination.blocs', op: 'contains', value: 'EU' } as const
const UK_BOUND = { fact: 'destination.blocs', op: 'contains', value: 'UK' } as const
const IRON_STEEL = { fact: 'product.cnChapters', op: 'contains', value: '72' } as const
const THIRD_COUNTRY = { fact: 'installation.country', op: 'ne', value: 'EU' } as const

export const OBLIGATIONS: Obligation[] = [
  // ── EU CBAM ───────────────────────────────────────────────────────────────
  {
    id: 'cbam.eu.register-installation', regulation: 'cbam-eu', actor: 'operator', jurisdiction: 'EU',
    titleEn: 'Register the installation in the CBAM registry',
    titleZh: '在CBAM登记册中登记装置',
    summaryEn: 'The operator registers the installation so it can make embedded-emissions records available to authorised declarants, controlling which buyer sees which record.',
    summaryZh: '经营者登记装置，以便向经授权申报人提供隐含排放记录，并控制哪一买方可查看哪一记录。',
    trigger: { all: [THIRD_COUNTRY, IRON_STEEL, EU_BOUND] },
    evidence: [
      { id: 'inst.identity', label: 'Installation identity and geolocation', labelZh: '装置身份与地理坐标', satisfiedBy: { fact: 'installation.country', op: 'exists' } },
      { id: 'inst.operator', label: 'Operator legal identity', labelZh: '经营者法律身份', satisfiedBy: { fact: 'operator.country', op: 'exists' } },
    ],
    deadline: { kind: 'rolling', days: 0, label: 'Before the first record is shared with a declarant' },
    clauseIds: ['cbam.art10'],
    consequence: 'Without registration the buyer cannot receive an operator record and must fall back to default values.',
  },
  {
    id: 'cbam.eu.determine-route', regulation: 'cbam-eu', actor: 'operator', jurisdiction: 'EU',
    titleEn: 'Determine the production route and system boundary',
    titleZh: '确定生产路线与系统边界',
    summaryEn: 'Map each production process onto one qualifying Annex III route and fix the system boundary that decides which fuels, inputs and process emissions are attributed to the goods.',
    summaryZh: '将各生产过程映射至附件三的某一合格路线，并确定系统边界，据以决定哪些燃料、投入与过程排放归属于该货物。',
    trigger: { all: [IRON_STEEL, EU_BOUND] },
    evidence: [
      { id: 'route.units', label: 'Process units and their material flow', labelZh: '工艺单元及其物料流', satisfiedBy: { fact: 'process.unitCount', op: 'gte', value: 1 } },
      { id: 'route.logs', label: 'Process logs for the reporting period', labelZh: '报告期工艺日志', satisfiedBy: { documents: 'process-log' } },
    ],
    deadline: { kind: 'rolling', days: 0, label: 'Before emissions can be calculated' },
    clauseIds: ['cbam.annexIII'],
    dependsOn: ['cbam.eu.register-installation'],
    consequence: 'The wrong route attributes the wrong emissions and invalidates every downstream figure.',
  },
  {
    id: 'cbam.eu.account-precursors', regulation: 'cbam-eu', actor: 'operator', jurisdiction: 'EU',
    titleEn: 'Account for relevant precursors',
    titleZh: '核算相关前体',
    summaryEn: 'Obtain embedded-emissions data for each relevant precursor consumed — sinter, coke, pig iron, purchased slab — from its supplier, or apply default values and say so.',
    summaryZh: '就所消耗的各相关前体（烧结矿、焦炭、生铁、外购板坯）自其供应商取得隐含排放数据；否则适用默认值并予以说明。',
    trigger: { all: [IRON_STEEL, EU_BOUND, { fact: 'supplier.declarationCount', op: 'gte', value: 1 }] },
    evidence: [
      { id: 'prec.declarations', label: 'Supplier declarations for every purchased precursor', labelZh: '各外购前体的供应商声明', satisfiedBy: { documents: 'supplier-declaration' }, needsThirdParty: true },
      { id: 'prec.quantities', label: 'Measured quantities of precursor consumed', labelZh: '前体消耗量实测值', satisfiedBy: { quantityQuality: 'materialFlows', atLeast: 'calculated' } },
    ],
    deadline: { kind: 'annual', month: 6, day: 30, offsetYears: 1, label: 'In time for the declarant’s verification' },
    clauseIds: ['cbam.art3', 'cbam.annexIII'],
    dependsOn: ['cbam.eu.determine-route'],
    consequence: 'An unresolved precursor is carried at its default value, which for Chinese blast-furnace inputs is materially above a real mill’s actuals.',
  },
  {
    id: 'cbam.eu.calculate-emissions', regulation: 'cbam-eu', actor: 'operator', jurisdiction: 'EU',
    titleEn: 'Calculate embedded emissions under Annex IV',
    titleZh: '依附件四计算隐含排放',
    summaryEn: 'Compute attributed emissions for the production process and divide by the activity level to obtain specific embedded emissions, adding the embedded emissions of consumed precursors.',
    summaryZh: '计算生产过程的归属排放并除以活动水平得出单位隐含排放，并加计所消耗前体的隐含排放。',
    trigger: { all: [IRON_STEEL, EU_BOUND] },
    evidence: [
      { id: 'calc.direct', label: 'Direct emissions by source stream', labelZh: '按源流划分的直接排放', satisfiedBy: { quantityQuality: 'directEmissions', atLeast: 'calculated' } },
      { id: 'calc.energy', label: 'Energy consumption with invoices', labelZh: '能源消耗及发票', satisfiedBy: { documents: 'energy-invoice' } },
      { id: 'calc.activity', label: 'Activity level — actual output over the period', labelZh: '活动水平 — 报告期实际产量', satisfiedBy: { quantityQuality: 'output', atLeast: 'measured' } },
      { id: 'calc.meters', label: 'Meter calibration certificates', labelZh: '计量器具校准证书', satisfiedBy: { documents: 'meter-calibration' }, needsThirdParty: true },
    ],
    deadline: { kind: 'annual', month: 6, day: 30, offsetYears: 1, label: 'In time for the declarant’s verification' },
    clauseIds: ['cbam.art7', 'cbam.annexIV'],
    dependsOn: ['cbam.eu.determine-route', 'cbam.eu.account-precursors'],
    consequence: 'Emissions that cannot be adequately determined fall back to default values, which is the expensive outcome this whole exercise exists to avoid.',
  },
  {
    id: 'cbam.eu.verify', regulation: 'cbam-eu', actor: 'verifier', jurisdiction: 'EU',
    titleEn: 'Independent verification of declared embedded emissions',
    titleZh: '对申报隐含排放的独立核查',
    summaryEn: 'An accredited verifier checks the declared embedded emissions against the Annex VI principles, including a site visit, and issues a verification report the declarant attaches to its declaration.',
    summaryZh: '经认可的核查机构依附件六原则核查所申报的隐含排放（含现场访问），并出具核查报告，由申报人附于其申报。',
    trigger: { all: [IRON_STEEL, EU_BOUND] },
    evidence: [
      { id: 'ver.pack', label: 'Complete evidence pack traceable to source documents', labelZh: '可追溯至源文件的完整证据包', satisfiedBy: { fact: 'documents.unstructuredCount', op: 'eq', value: 0 } },
      { id: 'ver.meters', label: 'Calibration and uncertainty assessment', labelZh: '校准与不确定度评估', satisfiedBy: { documents: 'meter-calibration' }, needsThirdParty: true },
      { id: 'ver.lab', label: 'Laboratory analyses for carbon content and NCV', labelZh: '碳含量与低位发热量的实验室分析', satisfiedBy: { documents: 'lab-report' }, needsThirdParty: true },
    ],
    deadline: { kind: 'annual', month: 8, day: 31, offsetYears: 1, label: 'Before the declarant’s 30 September deadline' },
    clauseIds: ['cbam.art8'],
    dependsOn: ['cbam.eu.calculate-emissions'],
    consequence: 'An unverified figure cannot be used in the declaration; the declarant surrenders on default values instead.',
  },
  {
    id: 'cbam.eu.disclose-to-declarant', regulation: 'cbam-eu', actor: 'operator', jurisdiction: 'EU',
    titleEn: 'Make the emissions record available to each authorised declarant',
    titleZh: '向各经授权申报人提供排放记录',
    summaryEn: 'Share the verified record with each EU buyer against its EORI, disclosing to each declarant only what relates to its own goods.',
    summaryZh: '按各欧盟买方的EORI号共享经核查的记录，且仅向各申报人披露与其自身货物相关的内容。',
    trigger: { all: [IRON_STEEL, EU_BOUND, { fact: 'contract.count', op: 'gte', value: 1 }] },
    evidence: [
      { id: 'disc.contracts', label: 'Buyer identity and EORI per contract', labelZh: '各合同的买方身份与EORI号', satisfiedBy: { fact: 'contract.count', op: 'gte', value: 1 } },
      { id: 'disc.verified', label: 'Verification report issued', labelZh: '已出具核查报告', satisfiedBy: { documents: 'lab-report' } },
    ],
    deadline: { kind: 'annual', month: 8, day: 31, offsetYears: 1, label: 'In time for each buyer’s declaration' },
    clauseIds: ['cbam.art10', 'cbam.art7'],
    dependsOn: ['cbam.eu.verify'],
    consequence: 'A buyer who receives nothing declares on defaults and prices that into the next contract.',
  },
  {
    id: 'cbam.eu.declare-and-surrender', regulation: 'cbam-eu', actor: 'declarant', jurisdiction: 'EU',
    titleEn: 'Submit the CBAM declaration and surrender certificates',
    titleZh: '提交CBAM申报并清缴证书',
    summaryEn: 'By 30 September the authorised declarant files the preceding year’s declaration — quantities, total embedded emissions, verification reports — and surrenders the corresponding CBAM certificates.',
    summaryZh: '经授权申报人应于9月30日前就上一年度提交申报（数量、隐含排放总量、核查报告），并清缴相应的CBAM证书。',
    trigger: { all: [IRON_STEEL, EU_BOUND] },
    evidence: [
      { id: 'dec.emissions', label: 'Verified embedded emissions per good', labelZh: '各货物经核查的隐含排放', satisfiedBy: { fact: 'emissions.hasActuals', op: 'eq', value: true } },
      { id: 'dec.quantities', label: 'Imported quantities reconciled to customs', labelZh: '与海关核对一致的进口数量', satisfiedBy: { fact: 'contract.tonnes', op: 'gte', value: 1 } },
    ],
    deadline: { kind: 'annual', month: 9, day: 30, offsetYears: 1, label: '30 September following the import year' },
    clauseIds: ['cbam.art6', 'cbam.art4'],
    dependsOn: ['cbam.eu.disclose-to-declarant'],
    consequence: 'The liability is the buyer’s, and a buyer exposed to defaults on your tonnes reprices or resources them.',
  },
  {
    id: 'cbam.eu.claim-carbon-price', regulation: 'cbam-eu', actor: 'declarant', jurisdiction: 'EU',
    titleEn: 'Claim a deduction for carbon price paid in the country of origin',
    titleZh: '就原产国已付碳价申请扣减',
    summaryEn: 'Where a carbon price was effectively paid on the declared emissions in the origin country and the scheme qualifies, claim a certified reduction net of any rebate or free allocation.',
    summaryZh: '若已就申报排放在原产国实际支付碳价且该机制符合条件，可申请经认证的扣减，并扣除任何回扣或免费配额。',
    trigger: { all: [EU_BOUND, { fact: 'carbonPrice.schemeCount', op: 'gte', value: 1 }] },
    evidence: [
      { id: 'a9.proof', label: 'Proof of carbon price effectively paid', labelZh: '实际已付碳价的证明', satisfiedBy: { documents: 'other' }, needsThirdParty: true },
      { id: 'a9.rebates', label: 'Disclosure of rebates and free allocation', labelZh: '回扣与免费配额的披露', satisfiedBy: { fact: 'carbonPrice.hasFreeAllocation', op: 'exists' } },
    ],
    deadline: { kind: 'annual', month: 9, day: 30, offsetYears: 1, label: 'With the declaration' },
    clauseIds: ['cbam.art9'],
    consequence: 'A claim on a scheme that does not qualify is refused and the certificates are surrendered in full anyway.',
  },

  // ── UK CBAM — the second regime, authored not engineered ──────────────────
  {
    id: 'cbam.uk.report-emissions', regulation: 'cbam-uk', actor: 'declarant', jurisdiction: 'UK',
    titleEn: 'Report embedded emissions on UK-bound goods',
    titleZh: '就输往英国的货物申报隐含排放',
    summaryEn: 'The person responsible for the goods on import reports embedded emissions for specified emissions-intensive goods, using actual data where available and default values otherwise.',
    summaryZh: '进口时对货物负责之人须就特定高排放货物申报隐含排放；有实际数据时采用实际数据，否则采用默认值。',
    trigger: { all: [IRON_STEEL, UK_BOUND] },
    evidence: [
      { id: 'uk.emissions', label: 'Embedded emissions per good', labelZh: '各货物的隐含排放', satisfiedBy: { fact: 'emissions.hasActuals', op: 'eq', value: true } },
      { id: 'uk.quantities', label: 'Imported quantities', labelZh: '进口数量', satisfiedBy: { fact: 'contract.tonnes', op: 'gte', value: 1 } },
    ],
    deadline: { kind: 'annual', month: 5, day: 31, offsetYears: 1, label: 'Following the accounting period' },
    clauseIds: ['ukcbam.scope'],
    consequence: 'The same dataset already assembled for the EU satisfies this; the incremental collection cost is near zero, and not claiming it means paying twice.',
  },
]

export const AUTHORING: AuthoringRecord[] = [
  {
    regulation: 'cbam-eu', authoredBy: 'Regulatory analyst', authoredOn: '2026-09-01',
    hoursToAuthor: 34, codeChangesRequired: 0, reviewedBy: 'Second analyst',
    note: 'The first regime. Hours include building the clause corpus and the term base from scratch — a one-off cost the next regime does not repeat.',
  },
  {
    regulation: 'cbam-uk', authoredBy: 'Regulatory analyst', authoredOn: '2026-09-01',
    hoursToAuthor: 3, codeChangesRequired: 0, reviewedBy: 'Second analyst',
    note: 'Same installation, same verified dataset. The obligation reuses the EU record projection unchanged — which is the whole point of the neutral product record.',
  },
]

assertGraphIntegrity(OBLIGATIONS, new Set(CLAUSES.map((c) => c.id)))
