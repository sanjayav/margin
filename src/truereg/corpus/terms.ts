// ───────────────────────────────────────────────────────────────────────────
// THE BILINGUAL TERM BASE — a controlled, versioned asset, not a dictionary.
//
// A wrong rendering of "embedded emissions" or "precursor" produces a wrong
// NUMBER, not merely an awkward sentence. So this file behaves like a rule
// pack: every entry is versioned, has an approval state, names the trap it
// exists to prevent, and is the ONLY place a Chinese rendering of a governing
// term is allowed to come from. Agents are instructed to look terms up here
// rather than translate, and a term whose status is 'draft' must be flagged in
// the answer that uses it.
//
// `forbidden` is the important column. Chinese steel and carbon-market
// vocabulary already contains near-misses that a fluent translator will reach
// for and that mean something materially different under the Regulation —
// 碳足迹 (carbon footprint, a lifecycle concept) for 隐含排放 (embedded
// emissions, a bounded production-process concept) being the costly one.
// ───────────────────────────────────────────────────────────────────────────

export const TERMBASE_VERSION = '2026.09-01'

export interface Term {
  id: string
  /** The governing form, as it appears in the EU text. */
  en: string
  /** The approved Chinese rendering. */
  zh: string
  /** Renderings that are wrong here, with the reason. This is the asset. */
  forbidden: { zh: string; why: string }[]
  definitionEn: string
  definitionZh: string
  /** 'approved' entries may be used silently; 'draft' must be flagged wherever
   *  it appears in an answer. */
  status: 'approved' | 'draft'
  /** Clause the governing definition comes from, where there is one. */
  clauseId?: string
  version: string
  /** Domain, for grouping in the UI. */
  domain: 'regulation' | 'process' | 'measurement' | 'commercial'
}

export const TERMS: Term[] = [
  {
    id: 'embedded-emissions', en: 'embedded emissions', zh: '隐含排放',
    forbidden: [
      { zh: '碳足迹', why: 'Carbon footprint is a lifecycle concept covering the whole value chain to end of life. Embedded emissions are bounded by the Annex III system boundary and stop at the production process plus relevant precursors. Using it inflates scope and produces a number no verifier will accept.' },
      { zh: '内含碳', why: 'Reads as "contained carbon" — the carbon physically in the material, which is a composition figure, not an emissions figure.' },
    ],
    definitionEn: 'Direct emissions released during the production of goods and, for goods listed in Annex II, indirect emissions from electricity consumed during production.',
    definitionZh: '货物生产过程中排放的直接排放；对附件二所列货物，另包括生产过程中所消耗电力产生的间接排放。',
    status: 'approved', clauseId: 'cbam.art3', version: TERMBASE_VERSION, domain: 'regulation',
  },
  {
    id: 'precursor', en: 'precursor', zh: '前体',
    forbidden: [
      { zh: '原材料', why: 'Raw material is broader: every input to the process. A precursor is specifically a CBAM good used as input to another CBAM good, and only "relevant precursors" listed in Annex III are carried. Translating it as 原材料 leads plant staff to hand over the whole bill of materials and to over-declare.' },
      { zh: '上游产品', why: 'Upstream product is a supply-chain description with no defined boundary. Precursor status is decided by Annex III, not by position in the chain.' },
    ],
    definitionEn: 'A good used as an input in the production process of another good, whose embedded emissions are carried into that good where Annex III lists it as a relevant precursor.',
    definitionZh: '用作另一货物生产过程投入的货物；当附件三将其列为相关前体时，其隐含排放计入该货物。',
    status: 'approved', clauseId: 'cbam.art3', version: TERMBASE_VERSION, domain: 'regulation',
  },
  {
    id: 'specific-embedded-emissions', en: 'specific embedded emissions (SEE)', zh: '单位隐含排放',
    forbidden: [{ zh: '排放强度', why: 'Emission intensity is the general term and is used for country averages and default values. SEE is the specific, installation-and-process figure computed under Annex IV. Conflating them makes it impossible to tell an actual from a default in a Chinese-language report.' }],
    definitionEn: 'Attributed emissions of a production process divided by the activity level of that process, expressed in tCO₂e per tonne of goods.',
    definitionZh: '生产过程的归属排放除以该过程的活动水平，以每吨货物的二氧化碳当量吨数表示。',
    status: 'approved', clauseId: 'cbam.annexIV', version: TERMBASE_VERSION, domain: 'regulation',
  },
  {
    id: 'attributed-emissions', en: 'attributed emissions', zh: '归属排放',
    forbidden: [{ zh: '分配排放', why: '分配 implies allocation of a quota or allowance, which is the ETS free-allocation sense and the opposite direction of travel. Attribution here means assigning measured emissions to a production process.' }],
    definitionEn: 'The share of an installation’s emissions assigned to a specific production process under the Annex III system boundary.',
    definitionZh: '按附件三系统边界归属于特定生产过程的装置排放份额。',
    status: 'approved', clauseId: 'cbam.annexIV', version: TERMBASE_VERSION, domain: 'regulation',
  },
  {
    id: 'system-boundary', en: 'system boundary', zh: '系统边界',
    forbidden: [],
    definitionEn: 'The set of inputs, fuels, heat and process emissions that Annex III attributes to a given production process for a given aggregated goods category.',
    definitionZh: '附件三就特定汇总货物类别的特定生产过程所归属的投入、燃料、热量与过程排放的集合。',
    status: 'approved', clauseId: 'cbam.annexIII', version: TERMBASE_VERSION, domain: 'regulation',
  },
  {
    id: 'production-route', en: 'production route', zh: '生产路线',
    forbidden: [{ zh: '工艺流程', why: 'Process flow is the plant’s own description of how material moves. A production route is a closed list in Annex III, and only one of them can apply to a given output.' }],
    definitionEn: 'One of the qualifying routes listed in Annex III for an aggregated goods category, e.g. the blast furnace route or the electric arc furnace route.',
    definitionZh: '附件三就某一汇总货物类别所列的合格路线之一，例如高炉路线或电弧炉路线。',
    status: 'approved', clauseId: 'cbam.annexIII', version: TERMBASE_VERSION, domain: 'regulation',
  },
  {
    id: 'default-value', en: 'default value', zh: '默认值',
    forbidden: [{ zh: '缺省排放', why: 'Reads as "missing emissions" and invites the reading that nothing was emitted. A default value is a high, conservative substitute applied precisely because actuals were not proven.' }],
    definitionEn: 'The emission intensity applied where actual embedded emissions cannot be adequately determined, set by Commission implementing act and based on exporting-country averages plus a mark-up.',
    definitionZh: '在无法充分确定实际隐含排放时适用的排放强度，由欧盟委员会实施法案规定，以出口国平均值加成为基础。',
    status: 'approved', clauseId: 'cbam.default-values', version: TERMBASE_VERSION, domain: 'regulation',
  },
  {
    id: 'authorised-declarant', en: 'authorised CBAM declarant', zh: '经授权的CBAM申报人',
    forbidden: [{ zh: '报关行', why: 'Customs broker is a service provider. The authorised declarant holds the CBAM liability itself, and the distinction decides who pays.' }],
    definitionEn: 'The person authorised to import goods within CBAM scope into the customs territory of the Union, on whom the declaration and surrender obligations sit.',
    definitionZh: '获授权将CBAM范围内货物进口至欧盟关税领土之人，申报与清缴义务由其承担。',
    status: 'approved', clauseId: 'cbam.art4', version: TERMBASE_VERSION, domain: 'regulation',
  },
  {
    id: 'carbon-price-due', en: 'carbon price effectively paid', zh: '实际已付碳价',
    forbidden: [{ zh: '碳价', why: 'A bare "carbon price" is a market quotation. Article 9 credits only the amount effectively paid on the declared embedded emissions, net of rebates and free allocation — a materially smaller and differently computed figure.' }],
    definitionEn: 'The amount actually paid in the country of origin, in the form of a tax, levy or allowance surrender, on the declared embedded emissions, net of any rebate or compensation including free allocation.',
    definitionZh: '就申报的隐含排放在原产国以税费或配额清缴形式实际支付的金额，扣除任何回扣或补偿（含免费配额）后的净额。',
    status: 'approved', clauseId: 'cbam.art9', version: TERMBASE_VERSION, domain: 'regulation',
  },
  {
    id: 'activity-level', en: 'activity level', zh: '活动水平',
    forbidden: [{ zh: '产能', why: 'Capacity is nameplate. Activity level is actual output over the reporting period, and using capacity understates SEE at every plant running below nameplate — which is most of them.' }],
    definitionEn: 'The quantity of goods actually produced by a production process over the reporting period.',
    definitionZh: '报告期内某生产过程实际生产的货物数量。',
    status: 'approved', clauseId: 'cbam.annexIV', version: TERMBASE_VERSION, domain: 'measurement',
  },
  {
    id: 'blast-furnace', en: 'blast furnace', zh: '高炉', forbidden: [],
    definitionEn: 'Shaft furnace reducing iron ore with coke to produce hot metal (pig iron).',
    definitionZh: '以焦炭还原铁矿石生产铁水（生铁）的竖炉。',
    status: 'approved', version: TERMBASE_VERSION, domain: 'process',
  },
  {
    id: 'basic-oxygen-furnace', en: 'basic oxygen furnace (BOF)', zh: '转炉',
    forbidden: [{ zh: '氧气顶吹转炉', why: 'Over-specific: names one BOF variant (LD/BOP). The route classification does not turn on the blowing arrangement, and the narrower term causes plants with bottom-blown vessels to answer "no".' }],
    definitionEn: 'Converter refining hot metal into crude steel by oxygen blowing.',
    definitionZh: '以吹氧将铁水精炼为粗钢的转炉。',
    status: 'approved', version: TERMBASE_VERSION, domain: 'process',
  },
  {
    id: 'electric-arc-furnace', en: 'electric arc furnace (EAF)', zh: '电弧炉', forbidden: [],
    definitionEn: 'Furnace melting scrap and/or direct reduced iron using an electric arc.',
    definitionZh: '利用电弧熔化废钢及/或直接还原铁的炉子。',
    status: 'approved', version: TERMBASE_VERSION, domain: 'process',
  },
  {
    id: 'sinter', en: 'sinter', zh: '烧结矿',
    forbidden: [{ zh: '烧结', why: '烧结 alone is the process (sintering); 烧结矿 is the material. Asking a plant for 烧结 tonnage returns process hours, not tonnes.' }],
    definitionEn: 'Agglomerated iron ore fines produced on a sinter strand and charged to the blast furnace.',
    definitionZh: '在烧结机上团聚而成、装入高炉的铁矿粉烧结产物。',
    status: 'approved', version: TERMBASE_VERSION, domain: 'process',
  },
  {
    id: 'pig-iron', en: 'pig iron / hot metal', zh: '生铁／铁水',
    forbidden: [{ zh: '铁水', why: 'Not forbidden but ambiguous alone: 铁水 is molten hot metal going straight to the converter, 生铁 is cast and can be purchased. The two carry different precursor treatment when one is bought in, so the term base keeps both and requires the state to be stated.' }],
    definitionEn: 'Iron produced in a blast furnace, either transferred molten to steelmaking or cast for sale.',
    definitionZh: '高炉生产的铁；或以铁水形式直送炼钢，或铸造后销售。',
    status: 'approved', version: TERMBASE_VERSION, domain: 'process',
  },
  {
    id: 'coke', en: 'coke', zh: '焦炭',
    forbidden: [{ zh: '焦煤', why: 'Coking coal is the input to the coke oven; coke is its output. They have different carbon contents and different precursor status, and the confusion is common in translated plant records.' }],
    definitionEn: 'Carbonised coal produced in a coke oven, used as reductant and fuel in the blast furnace.',
    definitionZh: '在焦炉中碳化煤而得，用作高炉还原剂与燃料。',
    status: 'approved', version: TERMBASE_VERSION, domain: 'process',
  },
  {
    id: 'net-calorific-value', en: 'net calorific value (NCV)', zh: '低位发热量',
    forbidden: [{ zh: '发热量', why: 'Ambiguous between gross (高位) and net (低位). Chinese plant records frequently quote gross; using it as net overstates fuel energy by roughly 5% for gas and flows straight into the emissions figure.' }],
    definitionEn: 'Lower heating value of a fuel, excluding the latent heat of water vapour in the combustion products.',
    definitionZh: '燃料的低位发热量，不计燃烧产物中水蒸气的潜热。',
    status: 'approved', version: TERMBASE_VERSION, domain: 'measurement',
  },
  {
    id: 'eori', en: 'EORI number', zh: 'EORI号',
    forbidden: [],
    definitionEn: 'Economic Operators Registration and Identification number, identifying the EU importer. Disclosure is keyed to it so each buyer sees only its own record.',
    definitionZh: '欧盟经济经营者注册与识别号，用以识别欧盟进口商。信息披露以此为索引，确保各买方仅可见其自身记录。',
    status: 'approved', version: TERMBASE_VERSION, domain: 'commercial',
  },
  {
    id: 'o3ci', en: 'CBAM Registry / O3CI submission', zh: 'CBAM登记册申报',
    forbidden: [],
    definitionEn: 'The Commission’s electronic system through which operators register installations and share embedded-emissions records with authorised declarants.',
    definitionZh: '欧盟委员会的电子系统，经营者据以登记装置并向经授权申报人共享隐含排放记录。',
    status: 'draft', clauseId: 'cbam.art10', version: TERMBASE_VERSION, domain: 'commercial',
  },
]

const BY_ID = new Map(TERMS.map((t) => [t.id, t]))
const BY_EN = new Map(TERMS.map((t) => [t.en.toLowerCase(), t]))

export function getTerm(idOrEn: string): Term | undefined {
  return BY_ID.get(idOrEn) ?? BY_EN.get(idOrEn.toLowerCase())
}

/** Every forbidden rendering, flattened — used to lint agent output before it
 *  ever reaches a user. A near-miss rendering is a numeric risk, so it is
 *  caught mechanically rather than left to the model's discretion. */
export function lintChinese(text: string): { term: Term; wrong: string; why: string }[] {
  const hits: { term: Term; wrong: string; why: string }[] = []
  for (const t of TERMS) {
    for (const f of t.forbidden) {
      if (text.includes(f.zh)) hits.push({ term: t, wrong: f.zh, why: f.why })
    }
  }
  return hits
}

export const draftTerms = () => TERMS.filter((t) => t.status === 'draft')
