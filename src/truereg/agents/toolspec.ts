// ───────────────────────────────────────────────────────────────────────────
// TOOL SPECIFICATIONS — the contract the agents read.
//
// Plain JSON Schema with no SDK import, so the same catalogue is sent to the
// model, rendered in the audit trail, and asserted in tests. Every description
// says WHEN to call the tool, because that is what decides whether an answer
// comes from the engine or from the model's memory — and only one of those is
// defensible to a verifier.
//
// Names MUST match src/truereg/agents/tools.ts · TOOL_REGISTRY.
// ───────────────────────────────────────────────────────────────────────────

export interface ToolSpec {
  name: string
  description: string
  input_schema: { type: 'object'; properties: Record<string, unknown>; required?: string[] }
  group: 'record' | 'boundary' | 'calculation' | 'commercial' | 'verification' | 'corpus' | 'governance'
  label: string
}

const REG = { type: 'string', enum: ['cbam-eu', 'cbam-uk', 'espr-eu', 'eudr-eu', 'csrd-eu'], description: 'Regulation id. The workspace’s entitlements are enforced by the executor.' }

export const TOOL_SPECS: ToolSpec[] = [
  {
    name: 'read_record', group: 'record', label: 'Reading the record',
    description: 'The installation record: operator, process units in the plant’s own words, products with their classifications and output, and counts of the flows and documents on file. Call this FIRST in almost every task — planning against a record you have not read is planning against an assumption, and the process-unit ids you need for every other tool come from here.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'intake_queue', group: 'record', label: 'Triaging documents',
    description: 'Which source documents are still unstructured, and which recorded quantities carry no source reference. Call this for any question about data completeness, what is left to do, or why a figure cannot yet be traced. A quantity a verifier cannot trace is a finding even when the number is correct.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'map_boundary', group: 'boundary', label: 'Mapping the boundary',
    description: 'Maps each process unit’s plant vernacular onto an Annex III production route, returning what matched, the confidence, and an explicit question where the plant’s own words do not settle it. Call this before any emissions question. NEVER resolve an ambiguous unit yourself — the routes on the table attribute different fuels, and the tool has already staged the question for a human.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'trace_precursors', group: 'calculation', label: 'Tracing precursors',
    description: 'Every relevant precursor for the mapped routes: what the supplier has declared, what is still outstanding, and what each gap is worth in tCO₂e. Call this for any question about upstream inputs, suppliers, sinter, coke, pig iron or purchased slab. The materiality figure is what makes a supplier chase get prioritised.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'compute_embedded_emissions', group: 'calculation', label: 'Computing embedded emissions',
    description: 'THE DETERMINISTIC CALCULATION. Specific embedded emissions per product under Annex IV, with every term’s arithmetic, its data quality, the unknowns that remain, and whether the figure rests on published or indicative inputs. This is the ONLY source of an emissions number. If it returns null for a product, the honest answer is that the figure is not yet determinable — say what is blocking it rather than estimating.',
    input_schema: { type: 'object', properties: { productId: { type: 'string', description: 'Omit for every product. Ids come from read_record.' } } },
  },
  {
    name: 'compare_to_defaults', group: 'commercial', label: 'Comparing to defaults',
    description: 'Actual specific embedded emissions against the default value for the same category and country. Call this whenever the question is whether proving the number is worth anything — the default is the buyer’s alternative and therefore the only meaningful comparator. Returns whether the default table is published or indicative; say which.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'buyer_exposure', group: 'commercial', label: 'Modelling buyer exposure',
    description: 'Per-contract and per-tonne exposure for each EU buyer under defaults versus actuals, after the delivery year’s free-allocation factor and any Article 9 deduction, plus the forward curve to 2034. Call this for any commercial, contract, buyer, pricing or "what is this worth" question. The mill carries no CBAM obligation — every figure here is the BUYER’s surrender.',
    input_schema: { type: 'object', properties: { year: { type: 'integer', description: 'Optional focus year. The forward curve is always returned.' } } },
  },
  {
    name: 'assess_carbon_price', group: 'commercial', label: 'Assessing Article 9',
    description: 'Whether a carbon price paid in the country of origin reduces the buyer’s surrender. REQUIRED before mentioning the Chinese ETS, a domestic carbon cost, or any deduction. China’s national ETS is not currently recognised, so a real domestic cost buys the buyer nothing — never imply otherwise, and give the reason and the clause when you say so.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'assemble_evidence_pack', group: 'verification', label: 'Rehearsing the verification',
    description: 'The findings an accredited verifier will raise, ranked by tCO₂e at stake, each with the challenge in the verifier’s words, the remedy in the plant engineer’s, and the Annex VI principle engaged — plus the document manifest and a readiness score. Call this for any question about verification, the site visit, readiness or evidence. Never quote the score without the blocking findings underneath it.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'prepare_disclosure', group: 'verification', label: 'Staging disclosure',
    description: 'Builds the per-buyer disclosure packet keyed to EORI, so each declarant sees only what relates to its own goods. STAGES ONLY — nothing is submitted, and every packet waits for a person to release it. Say so explicitly whenever you use this.',
    input_schema: { type: 'object', properties: { eori: { type: 'string', description: 'Restrict to one buyer. Omit for every buyer.' } } },
  },
  {
    name: 'evaluate_obligations', group: 'governance', label: 'Evaluating obligations',
    description: 'Every duty in the obligation graph evaluated against this record: whether it applies, why, what evidence is present or missing, when it falls due, and what it depends on. Call this for "what do we have to do", "what is the deadline", "are we compliant" or any question spanning more than one duty. A status of "indeterminate" means a fact is genuinely missing — report that, do not round it to not-applicable.',
    input_schema: { type: 'object', properties: { regulation: REG } },
  },
  {
    name: 'watch_changes', group: 'governance', label: 'Watching for change',
    description: 'The versioned inputs every stored conclusion is pinned to — corpus, term base, default values, the Article 9 recognition list, the free-allocation phase-out — with what each one moves if it changes. Call this for "what could change", "what are we exposed to", or when a conclusion is being stored for later reliance.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'cite_clause', group: 'corpus', label: 'Citing the clause',
    description: 'The authentic clause text with its citation, CELEX number and the Chinese rendering. Call this whenever you state a rule. The EU text governs and the Chinese is a reading aid — present it that way. A clause marked "summary" is an analyst precis and must be flagged as needing reading against the source before commercial reliance.',
    input_schema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' }, description: 'Clause ids, e.g. ["cbam.art9"]. Every tool result carries the ids it relied on.' } }, required: ['ids'] },
  },
  {
    name: 'lookup_term', group: 'corpus', label: 'Looking up the term',
    description: 'The approved Chinese rendering of a governing term, with the renderings that are forbidden and why. MANDATORY before writing any governing term in Chinese — do not translate from your own knowledge. A near-miss such as 碳足迹 for 隐含排放 changes the scope of the calculation, not merely the tone.',
    input_schema: { type: 'object', properties: { term: { type: 'string', description: 'English term or term-base id, e.g. "embedded emissions".' } }, required: ['term'] },
  },
  {
    name: 'check_chinese', group: 'corpus', label: 'Checking the Chinese',
    description: 'Lints Chinese text against the term base for forbidden renderings. Call this on any Chinese passage before showing it to a user. It is cheap and it catches the class of error that produces a wrong number.',
    input_schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  },
  {
    name: 'regulation_overview', group: 'governance', label: 'Reading the regime map',
    description: 'The regulations on the platform, which this workspace is entitled to, and the authoring record for each — analyst-hours and code changes required to add it. Call this for roadmap, coverage or "what else does this cover" questions.',
    input_schema: { type: 'object', properties: {} },
  },
]

export const specFor = (name: string) => TOOL_SPECS.find((s) => s.name === name)
