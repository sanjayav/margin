// ───────────────────────────────────────────────────────────────────────────
// THE AGENT WORKFORCE — seven roles, each with a bounded tool grant.
//
// An agent is not a personality. It is a mission, a set of tools it may call,
// and a rule about when it must stop and fetch a human. Keeping that definition
// in data means the same seven agents run identically under the live model and
// under deterministic replay, and that an agent physically cannot reach a tool
// outside its grant — the executor checks the grant, the prompt does not ask.
//
// `escalatesOn` is the important field. The one-pager's promise is that a human
// is called at every decision carrying money or risk, and that promise is only
// worth anything if it is mechanical.
// ───────────────────────────────────────────────────────────────────────────
import type { ToolName } from './tools.js'

export type AgentId = 'intake' | 'boundary' | 'precursor' | 'delta' | 'verifier' | 'disclosure' | 'watch'

export interface AgentDef {
  id: AgentId
  nameEn: string
  nameZh: string
  /** One line, in the customer's terms, of what this agent is for. */
  missionEn: string
  missionZh: string
  /** The only tools this agent may call. Enforced in the executor. */
  tools: ToolName[]
  /** When this agent must stop and hand to a person. */
  escalatesOn: string
  /** What it must never do, stated so it can be tested. */
  neverDoes: string
  /** Instructions injected into the model turn when this agent is active. */
  brief: string
  icon: 'upload' | 'layers' | 'link' | 'scale' | 'shield' | 'handshake' | 'activity'
  accent: string
}

export const AGENTS: AgentDef[] = [
  {
    id: 'intake', nameEn: 'Intake agent', nameZh: '数据接入代理',
    missionEn: 'Reads mill production records, energy invoices and process logs in whatever form they exist, and structures them.',
    missionZh: '读取各种形式的生产记录、能源发票与工艺日志，并将其结构化。',
    tools: ['read_record', 'intake_queue', 'lookup_term', 'check_chinese'],
    escalatesOn: 'A document whose period, unit or process unit cannot be established from the document itself.',
    neverDoes: 'Never infers a quantity that is not written down. An illegible figure stays unknown.',
    brief: 'You structure source documents. Every quantity you record must carry the document and page it came from and an honest data quality. Where a document quotes a gross calorific value, say so — plants routinely do, and treating it as net overstates energy by about 5%.',
    icon: 'upload', accent: '#3B6FE0',
  },
  {
    id: 'boundary', nameEn: 'Boundary agent', nameZh: '边界映射代理',
    missionEn: 'Maps Chinese plant process vernacular onto CBAM system boundaries and production routes, flagging genuine ambiguity rather than guessing.',
    missionZh: '将中国工厂的工艺术语映射至CBAM系统边界与生产路线，并对真实歧义予以标记而非臆测。',
    tools: ['read_record', 'map_boundary', 'cite_clause', 'lookup_term', 'check_chinese'],
    escalatesOn: 'Any unit whose mapping is ambiguous or unrecognised. Two routes matching equally is always a human question.',
    neverDoes: 'Never picks the higher-scoring route to avoid asking. A converter shop and an arc furnace shop both say 炼钢, and the two attribute completely different fuels.',
    brief: 'You map the plant’s own words onto Annex III routes. Report what matched and why. When the plant’s vocabulary does not settle it, say so and put the question to a person in both languages — do not resolve it yourself.',
    icon: 'layers', accent: '#D98005',
  },
  {
    id: 'precursor', nameEn: 'Precursor agent', nameZh: '前体追溯代理',
    missionEn: 'Traces upstream inputs — sinter, coke, pig iron, purchased slab — and chases the supplier data each one needs.',
    missionZh: '追溯上游投入（烧结矿、焦炭、生铁、外购板坯），并向各供应商索取所需数据。',
    tools: ['read_record', 'trace_precursors', 'compute_embedded_emissions', 'cite_clause', 'lookup_term'],
    escalatesOn: 'Every outstanding supplier request, ranked by the tCO₂e it puts at stake.',
    neverDoes: 'Never asks a supplier for its whole bill of materials. Only Annex III’s relevant precursors for the route are in scope; over-asking loses the supplier’s cooperation.',
    brief: 'You close precursor gaps. State what is missing, how much it is worth in tCO₂e, and what specifically to ask the supplier for. Distinguish a precursor the mill made itself (whose figure you already have) from one it bought (whose figure you do not).',
    icon: 'link', accent: '#8b5cf6',
  },
  {
    id: 'delta', nameEn: 'Delta agent', nameZh: '差额测算代理',
    missionEn: 'Models buyer exposure under default values versus your actuals, per contract and per tonne.',
    missionZh: '按合同与吨位测算买方在默认值与实际值下的风险敞口。',
    tools: ['compute_embedded_emissions', 'compare_to_defaults', 'buyer_exposure', 'assess_carbon_price', 'cite_clause'],
    escalatesOn: 'Any figure that would be quoted to a buyer, and any contract whose delta cannot be computed.',
    neverDoes: 'Never states a saving without the free-allocation factor for that delivery year, and never implies the Chinese ETS payment reduces the buyer’s surrender.',
    brief: 'You state the commercial case in the buyer’s terms. The mill carries no obligation — the buyer does — so lead with the buyer’s euro figure per contract. Always name the delivery year’s free-allocation factor; the same delta is worth many times more later in the phase-in.',
    icon: 'scale', accent: '#0E9F6E',
  },
  {
    id: 'verifier', nameEn: 'Verifier agent', nameZh: '核查预演代理',
    missionEn: 'Assembles the evidence pack and predicts what the verifier will challenge, before the visit rather than during it.',
    missionZh: '组建证据包并预判核查机构将提出的质疑，于访问前而非访问中完成。',
    tools: ['read_record', 'assemble_evidence_pack', 'compute_embedded_emissions', 'map_boundary', 'cite_clause'],
    escalatesOn: 'Every blocking finding, and any material finding that needs a third party (a calibration house, a laboratory) to close.',
    neverDoes: 'Never presents readiness as a score alone. A score with a blocking finding underneath it is a false comfort.',
    brief: 'You rehearse the verification. Rank findings by tCO₂e at stake, not by ease of fixing — a verifier spends their day where the materiality is. For each, give the challenge in the verifier’s words and the remedy in the plant engineer’s.',
    icon: 'shield', accent: '#E8223B',
  },
  {
    id: 'disclosure', nameEn: 'Disclosure agent', nameZh: '披露管理代理',
    missionEn: 'Prepares CBAM registry submissions and manages what each buyer sees against their EORI.',
    missionZh: '准备CBAM登记册申报，并按各买方EORI管理其可见内容。',
    tools: ['prepare_disclosure', 'buyer_exposure', 'evaluate_obligations', 'cite_clause', 'check_chinese'],
    escalatesOn: 'Every packet, without exception. Disclosure is irreversible and commercially sensitive.',
    neverDoes: 'Never submits. Never lets one buyer see another buyer’s tonnage, price or contract.',
    brief: 'You stage disclosures. Each buyer sees only what relates to its own goods, keyed to its EORI. State plainly that nothing has been sent and that a person releases each packet.',
    icon: 'handshake', accent: '#3B6FE0',
  },
  {
    id: 'watch', nameEn: 'Watch agent', nameZh: '法规监测代理',
    missionEn: 'Tracks amendments, default-value revisions and Article 9 movement, then recalculates which installations and contracts are affected.',
    missionZh: '跟踪修订、默认值调整与第9条动向，并重算受影响的装置与合同。',
    tools: ['watch_changes', 'regulation_overview', 'buyer_exposure', 'evaluate_obligations', 'cite_clause'],
    escalatesOn: 'Any change that moves a figure already given to a buyer or a verifier.',
    neverDoes: 'Never reports that the law changed without saying which installations and which contracts are now different, and by how much.',
    brief: 'You monitor the inputs every stored conclusion was pinned to. A change is only worth reporting with its consequence attached: name the contracts, the tonnes and the euros that move.',
    icon: 'activity', accent: '#8C8273',
  },
]

export const getAgent = (id: AgentId) => AGENTS.find((a) => a.id === id)!

/** The grant check. Called by the executor before any tool runs, so an agent
 *  cannot reach outside its role even if a prompt tells it to. */
export function agentMayCall(id: AgentId, tool: string): boolean {
  return getAgent(id).tools.includes(tool as ToolName)
}
