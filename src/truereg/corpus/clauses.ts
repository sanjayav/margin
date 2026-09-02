// ───────────────────────────────────────────────────────────────────────────
// THE CLAUSE STORE — the authority every number cites.
//
// Nothing in TrueReg may assert a rule without pointing at a row in here, and
// every row carries the CELEX identifier of the act it came from plus the
// corpus version it was read at. That pairing is what makes an answer
// re-runnable a year later, when the act has been amended and the answer must
// be allowed to have changed.
//
// GOVERNING LANGUAGE IS THE EU TEXT. The Chinese rendering is a reading aid and
// is marked as such at every display site. There is no authoritative Chinese
// CBAM text to fall back on, so a translation presented as equal authority is a
// liability, not a feature.
//
// `status` is honest about what this repo actually ships. 'verbatim' means the
// text is the authentic wording; 'summary' means an analyst's faithful precis
// that MUST be read against the source before it is relied on commercially.
// The UI never hides this distinction and the agents are told to surface it.
// ───────────────────────────────────────────────────────────────────────────

export interface Clause {
  id: string
  regulation: RegulationId
  /** Human citation as a lawyer would write it. */
  citation: string
  article: string
  paragraph?: string
  titleEn: string
  titleZh: string
  /** The operative text, or a faithful precis — see `status`. */
  textEn: string
  textZh: string
  status: 'verbatim' | 'summary'
  /** EUR-Lex CELEX number (or the equivalent national identifier). */
  celex?: string
  /** Public URL for the act. Displayed so a verifier can go and read it. */
  url?: string
  /** Corpus version this row was last checked against. */
  version: string
  /** ISO date the row was last reconciled with the source. */
  checkedOn: string
}

export type RegulationId = 'cbam-eu' | 'cbam-uk' | 'espr-eu' | 'eudr-eu' | 'csrd-eu'

/** Bumped whenever ANY clause changes. Every stored answer pins this, so the
 *  watch agent can tell which past conclusions are now stale. */
export const CORPUS_VERSION = '2026.09-01'

export const REGULATIONS: Record<RegulationId, { id: RegulationId; name: string; nameZh: string; jurisdiction: string; status: 'live' | 'legislated' | 'proposed' | 'planned'; note: string }> = {
  'cbam-eu': {
    id: 'cbam-eu', name: 'EU Carbon Border Adjustment Mechanism', nameZh: '欧盟碳边境调节机制',
    jurisdiction: 'EU', status: 'live',
    note: 'Definitive regime in force from 1 January 2026. First declaration and surrender by the authorised declarant: 30 September 2027 for goods imported in 2026.',
  },
  'cbam-uk': {
    id: 'cbam-uk', name: 'UK Carbon Border Adjustment Mechanism', nameZh: '英国碳边境调节机制',
    jurisdiction: 'UK', status: 'legislated',
    note: 'Introduction announced for 1 January 2027. Same installation, same verified emissions dataset — near-zero incremental data collection once CBAM EU is assembled.',
  },
  'espr-eu': {
    id: 'espr-eu', name: 'Ecodesign for Sustainable Products Regulation', nameZh: '可持续产品生态设计法规',
    jurisdiction: 'EU', status: 'legislated',
    note: 'Framework in force; iron and steel is a priority product group. Reads mass, origin, route and composition already in the product record.',
  },
  'eudr-eu': {
    id: 'eudr-eu', name: 'EU Deforestation Regulation', nameZh: '欧盟零毁林法规',
    jurisdiction: 'EU', status: 'live', note: 'Adjacent regime; on the roadmap once the obligation graph and customer base mature.',
  },
  'csrd-eu': {
    id: 'csrd-eu', name: 'Corporate Sustainability Reporting Directive', nameZh: '企业可持续发展报告指令',
    jurisdiction: 'EU', status: 'live', note: 'Adjacent regime; reads the same emissions dataset at entity rather than product level.',
  },
}

const V = CORPUS_VERSION
const D = '2026-09-01'

export const CLAUSES: Clause[] = [
  {
    id: 'cbam.art1', regulation: 'cbam-eu', citation: 'Regulation (EU) 2023/956, Article 1', article: '1',
    titleEn: 'Subject matter', titleZh: '标的',
    textEn: 'Establishes a carbon border adjustment mechanism applying to the embedded emissions in goods listed in Annex I on their importation into the customs territory of the Union, to prevent the risk of carbon leakage.',
    textZh: '就附件一所列货物进口至欧盟关税领土时的隐含排放建立碳边境调节机制，以防止碳泄漏风险。',
    status: 'summary', celex: '32023R0956', url: 'https://eur-lex.europa.eu/eli/reg/2023/956/oj', version: V, checkedOn: D,
  },
  {
    id: 'cbam.art2', regulation: 'cbam-eu', citation: 'Regulation (EU) 2023/956, Article 2', article: '2',
    titleEn: 'Scope', titleZh: '适用范围',
    textEn: 'Applies to goods listed in Annex I originating in a third country, where those goods, or processed products from those goods resulting from the inward processing procedure, are imported into the customs territory of the Union.',
    textZh: '适用于原产于第三国并进口至欧盟关税领土的附件一所列货物，以及由该等货物经内向加工程序所得的加工产品。',
    status: 'summary', celex: '32023R0956', url: 'https://eur-lex.europa.eu/eli/reg/2023/956/oj', version: V, checkedOn: D,
  },
  {
    id: 'cbam.art3', regulation: 'cbam-eu', citation: 'Regulation (EU) 2023/956, Article 3', article: '3',
    titleEn: 'Definitions — embedded emissions, precursors, installation', titleZh: '定义 — 隐含排放、前体、装置',
    textEn: 'Defines embedded emissions as direct emissions released during the production of goods and, for goods listed in Annex II, indirect emissions from the electricity consumed during production; defines precursors as goods used as input in the production process of another good.',
    textZh: '将"隐含排放"定义为货物生产过程中排放的直接排放，以及对附件二所列货物而言，生产过程中所消耗电力产生的间接排放；将"前体"定义为用作另一货物生产过程投入的货物。',
    status: 'summary', celex: '32023R0956', url: 'https://eur-lex.europa.eu/eli/reg/2023/956/oj', version: V, checkedOn: D,
  },
  {
    id: 'cbam.art4', regulation: 'cbam-eu', citation: 'Regulation (EU) 2023/956, Article 4', article: '4',
    titleEn: 'Importation of goods — authorised declarant required', titleZh: '货物进口 — 须为经授权申报人',
    textEn: 'Goods within scope may be imported into the customs territory of the Union only by an authorised CBAM declarant. The obligation sits on the importer, not on the third-country operator.',
    textZh: '范围内货物仅可由经授权的CBAM申报人进口至欧盟关税领土。该义务由进口商承担，而非第三国经营者。',
    status: 'summary', celex: '32023R0956', url: 'https://eur-lex.europa.eu/eli/reg/2023/956/oj', version: V, checkedOn: D,
  },
  {
    id: 'cbam.art6', regulation: 'cbam-eu', citation: 'Regulation (EU) 2023/956, Article 6', article: '6',
    titleEn: 'CBAM declaration', titleZh: 'CBAM申报',
    textEn: 'By 30 September of each year, the authorised CBAM declarant submits a declaration for the preceding calendar year stating the total quantity of each type of good imported, the total embedded emissions, the number of CBAM certificates to be surrendered, and copies of verification reports issued by accredited verifiers.',
    textZh: '经授权的CBAM申报人应于每年9月30日前，就上一日历年提交申报，载明各类进口货物总量、隐含排放总量、须清缴的CBAM证书数量，以及经认可核查机构出具的核查报告副本。',
    status: 'summary', celex: '32023R0956', url: 'https://eur-lex.europa.eu/eli/reg/2023/956/oj', version: V, checkedOn: D,
  },
  {
    id: 'cbam.art7', regulation: 'cbam-eu', citation: 'Regulation (EU) 2023/956, Article 7', article: '7',
    titleEn: 'Calculation of embedded emissions', titleZh: '隐含排放的计算',
    textEn: 'Embedded emissions in goods are calculated in accordance with the methods set out in Annex IV. Where actual emissions cannot be adequately determined, default values apply. Operators may keep records of the emissions embedded in the goods produced and make them available to declarants.',
    textZh: '货物的隐含排放应依照附件四规定的方法计算。在无法充分确定实际排放的情形下，适用默认值。经营者可保存所生产货物的隐含排放记录并提供予申报人。',
    status: 'summary', celex: '32023R0956', url: 'https://eur-lex.europa.eu/eli/reg/2023/956/oj', version: V, checkedOn: D,
  },
  {
    id: 'cbam.art8', regulation: 'cbam-eu', citation: 'Regulation (EU) 2023/956, Article 8', article: '8',
    titleEn: 'Verification of embedded emissions', titleZh: '隐含排放的核查',
    textEn: 'The authorised CBAM declarant ensures that the total embedded emissions declared are verified by a verifier accredited in accordance with Article 18, applying the verification principles set out in Annex VI.',
    textZh: '经授权的CBAM申报人应确保所申报的隐含排放总量由依第18条获得认可的核查机构核查，并适用附件六规定的核查原则。',
    status: 'summary', celex: '32023R0956', url: 'https://eur-lex.europa.eu/eli/reg/2023/956/oj', version: V, checkedOn: D,
  },
  {
    id: 'cbam.art9', regulation: 'cbam-eu', citation: 'Regulation (EU) 2023/956, Article 9', article: '9',
    titleEn: 'Carbon price paid in a third country', titleZh: '第三国已付碳价',
    textEn: 'An authorised CBAM declarant may claim a reduction in the number of CBAM certificates to be surrendered to account for a carbon price effectively paid in the country of origin for the declared embedded emissions. The claim must be certified by an independent person and is reduced to reflect any rebate or other form of compensation available in that country, including free allocation.',
    textZh: '经授权的CBAM申报人可就申报的隐含排放在原产国实际已付的碳价，申请扣减须清缴的CBAM证书数量。该申请须经独立人士认证，并应就该国可获得的任何回扣或其他形式补偿（包括免费配额）作相应扣减。',
    status: 'summary', celex: '32023R0956', url: 'https://eur-lex.europa.eu/eli/reg/2023/956/oj', version: V, checkedOn: D,
  },
  {
    id: 'cbam.art10', regulation: 'cbam-eu', citation: 'Regulation (EU) 2023/956, Article 10', article: '10',
    titleEn: 'Registration of operators and installations', titleZh: '经营者与装置的登记',
    textEn: 'An operator of an installation located in a third country may request registration in the CBAM registry and, once registered, may make the information on embedded emissions available to authorised CBAM declarants, controlling which declarant sees which record.',
    textZh: '位于第三国的装置经营者可申请在CBAM登记册中登记；登记后可向经授权的CBAM申报人提供隐含排放信息，并控制哪一申报人可查看哪一记录。',
    status: 'summary', celex: '32023R0956', url: 'https://eur-lex.europa.eu/eli/reg/2023/956/oj', version: V, checkedOn: D,
  },
  {
    id: 'cbam.annexIII', regulation: 'cbam-eu', citation: 'Regulation (EU) 2023/956, Annex III', article: 'Annex III',
    titleEn: 'Production routes and system boundaries', titleZh: '生产路线与系统边界',
    textEn: 'Sets out, for each aggregated goods category, the qualifying production routes and the system boundaries of the production processes — which inputs, fuels and process emissions are attributed to the goods, and which relevant precursors must be accounted for.',
    textZh: '就每一汇总货物类别规定合格的生产路线及生产过程的系统边界 — 哪些投入、燃料与过程排放归属于该货物，以及须核算哪些相关前体。',
    status: 'summary', celex: '32023R0956', url: 'https://eur-lex.europa.eu/eli/reg/2023/956/oj', version: V, checkedOn: D,
  },
  {
    id: 'cbam.annexIV', regulation: 'cbam-eu', citation: 'Regulation (EU) 2023/956, Annex IV', article: 'Annex IV',
    titleEn: 'Methods for calculating embedded emissions', titleZh: '隐含排放计算方法',
    textEn: 'Specific embedded emissions of simple goods are the attributed emissions of the production process divided by the activity level of that process. For complex goods, the embedded emissions of relevant precursors consumed are added. Attributed emissions comprise direct emissions from the production process and, where applicable, emissions from the production of consumed heat and, for goods in Annex II, indirect emissions from electricity consumed.',
    textZh: '简单货物的单位隐含排放等于该生产过程的归属排放除以该过程的活动水平。对复杂货物，须加计所消耗相关前体的隐含排放。归属排放包括生产过程的直接排放、（如适用）所消耗热量生产产生的排放，以及对附件二货物而言所消耗电力产生的间接排放。',
    status: 'summary', celex: '32023R0956', url: 'https://eur-lex.europa.eu/eli/reg/2023/956/oj', version: V, checkedOn: D,
  },
  {
    id: 'cbam.default-values', regulation: 'cbam-eu', citation: 'Commission implementing acts on default values (Article 7(7))', article: '7', paragraph: '7',
    titleEn: 'Default values where actual emissions cannot be determined', titleZh: '无法确定实际排放时的默认值',
    textEn: 'The Commission adopts implementing acts setting the default values to be used where actual embedded emissions cannot be adequately determined. Default values are based on the average emission intensity of exporting countries, uplifted by a mark-up determined in the implementing act, and are revised periodically.',
    textZh: '欧盟委员会通过实施法案，规定在无法充分确定实际隐含排放时应采用的默认值。默认值以出口国平均排放强度为基础，并按实施法案确定的加成上浮，且定期修订。',
    status: 'summary', celex: '32023R0956', url: 'https://taxation-customs.ec.europa.eu/carbon-border-adjustment-mechanism_en', version: V, checkedOn: D,
  },
  {
    id: 'cbam.free-allocation-factor', regulation: 'cbam-eu', citation: 'Regulation (EU) 2023/956, Article 31', article: '31',
    titleEn: 'Adjustment for free allocation under the EU ETS', titleZh: '因欧盟ETS免费配额而作的调整',
    textEn: 'The number of CBAM certificates to be surrendered is adjusted to reflect the extent to which EU ETS allowances are allocated free of charge to installations producing the same goods in the Union. The adjustment is phased out as free allocation is withdrawn.',
    textZh: 'CBAM证书清缴数量应作调整，以反映欧盟境内生产同类货物的装置获得免费ETS配额的程度。随着免费配额退坡，该项调整逐步取消。',
    status: 'summary', celex: '32023R0956', url: 'https://eur-lex.europa.eu/eli/reg/2023/956/oj', version: V, checkedOn: D,
  },
  {
    id: 'ukcbam.scope', regulation: 'cbam-uk', citation: 'UK CBAM — scope and liable person',
    article: 'scope',
    titleEn: 'Scope and the liable person', titleZh: '适用范围与责任人',
    textEn: 'A UK carbon border adjustment mechanism applying to specified emissions-intensive imported goods, including iron and steel. The liability sits on the person responsible for the goods on import. Emissions may be reported on actual data where available, otherwise on default values.',
    textZh: '英国碳边境调节机制适用于特定的高排放进口货物，包括钢铁。责任由进口时对货物负责的人承担。排放可按实际数据申报（若可得），否则采用默认值。',
    status: 'summary', url: 'https://www.gov.uk/government/consultations/introduction-of-a-uk-carbon-border-adjustment-mechanism', version: V, checkedOn: D,
  },
]

const BY_ID = new Map(CLAUSES.map((c) => [c.id, c]))

export function getClause(id: string): Clause | undefined { return BY_ID.get(id) }

/** Resolve a set of clause ids, dropping nothing silently — an unresolved id is
 *  returned as a stub so a broken citation is VISIBLE rather than missing. */
export function citeAll(ids: string[]): (Clause | { id: string; missing: true })[] {
  return ids.map((id) => BY_ID.get(id) ?? { id, missing: true as const })
}

export function clausesFor(regulation: RegulationId): Clause[] {
  return CLAUSES.filter((c) => c.regulation === regulation)
}
