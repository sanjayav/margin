/* ───────────────────────────────────────────────────────────────────────────
   The instrument catalogue.
   ---------------------------------------------------------------------------
   Reg AI's premise is that a compliance platform should be able to show you the
   RULE, not just the consequence of the rule. So this file is the platform's
   structured reading of the instruments behind each rule pack: what the
   instrument is, which article or clause does the work, and — the part that
   makes it more than a reading list — WHICH ENGINE PARAMETER each clause drives.

   Two honesty rules govern everything here:

   1. THIS IS A READING, NOT THE LAW. Every entry names its primary source and
      is labelled with the stage it is at. The authoritative text is the
      instrument itself; this is a map to it.
   2. NUMBERS COME FROM THE PACK, NOT FROM HERE. A clause says which parameter
      it drives; the VALUE is read live from the loaded rule pack at render
      time. That way the catalogue can never quietly disagree with the engine —
      if the pack changes, this screen changes with it.
   ─────────────────────────────────────────────────────────────────────────── */
import type { CountryId } from '../../../engine/types'

export type Stage = 'consultation' | 'draft' | 'notified' | 'in force' | 'sunset'

export const STAGE_ORDER: Stage[] = ['consultation', 'draft', 'notified', 'in force', 'sunset']

export const STAGE_META: Record<Stage, { label: string; tone: 'neutral' | 'warn' | 'info' | 'pos' | 'neg'; blurb: string }> = {
  consultation: { label: 'Consultation', tone: 'neutral', blurb: 'Open for comment. The shape can still change materially — plan for a range, not a number.' },
  draft:        { label: 'Draft',        tone: 'warn',    blurb: 'Published in draft. Model it, stress it, but do not file against it.' },
  notified:     { label: 'Notified',     tone: 'info',    blurb: 'Made and published, with a future commencement date. This is what you plan to.' },
  'in force':   { label: 'In force',     tone: 'pos',     blurb: 'Operative now. This is what you file against.' },
  sunset:       { label: 'Superseded',   tone: 'neutral', blurb: 'No longer operative for new compliance years, but still relevant to historic positions.' },
}

/** Which engine parameter a clause actually drives. The value is read from the
 *  live rule pack, never stored here. */
export type Drives =
  | 'limit' | 'fine' | 'pooling' | 'transfer' | 'credits' | 'eco' | 'cycle' | 'coverage' | 'scope' | 'none'

export interface Clause {
  ref: string
  heading: string
  text: string
  drives: Drives
  /** What a planner should take from it, in one line. */
  soWhat?: string
}

export interface Instrument {
  id: string
  market: CountryId
  title: string
  shortTitle: string
  citation: string
  authority: string
  stage: Stage
  /** Compliance years this instrument governs. `to: null` = open-ended. */
  from: number
  to: number | null
  url?: string
  summary: string
  clauses: Clause[]
}

/* ── the catalogue ────────────────────────────────────────────────────────── */

export const INSTRUMENTS: Instrument[] = [
  /* ── European Union ─────────────────────────────────────────────────────── */
  {
    id: 'eu-2019-631', market: 'EU', stage: 'in force', from: 2020, to: null,
    shortTitle: 'CO₂ standards for cars and vans',
    title: 'Regulation (EU) 2019/631 setting CO₂ emission performance standards for new passenger cars and new light commercial vehicles',
    citation: 'Regulation (EU) 2019/631', authority: 'European Parliament and Council',
    url: 'https://eur-lex.europa.eu/eli/reg/2019/631/oj',
    summary:
      'The operative instrument for EU car and van CO₂. It sets a fleet-average target per manufacturer, adjusted for the mass of that manufacturer’s own fleet, and charges a premium on every gram over it. It is also the reason the EU has no tradable credit: compliance moves between manufacturers by pooling under Article 6, and by nothing else.',
    clauses: [
      { ref: 'Art. 4', heading: 'Specific emission targets', drives: 'limit',
        text: 'Each manufacturer’s specific emissions target is derived from the EU fleet-wide target adjusted for the difference between its own average test mass and the reference mass, by the slope set in Annex I.',
        soWhat: 'A heavier fleet gets a looser target. Mass therefore moves your limit as well as your position — which is why mass is never a one-way lever.' },
      { ref: 'Art. 5', heading: 'Super-credits', drives: 'credits',
        text: 'The multiplier applied to registrations below the low-emission threshold, phased out after the 2022 compliance year.',
        soWhat: 'Expired. A model that offers you super-credits in the EU is wrong about the year.' },
      { ref: 'Art. 6', heading: 'Pooling', drives: 'pooling',
        text: 'Manufacturers may form a pool for the purposes of meeting their targets. Pool members are assessed on the pool’s combined average rather than individually.',
        soWhat: 'Pooling shares an average. It does not issue, transfer, price or bank anything — there is nothing to sell.' },
      { ref: 'Art. 8', heading: 'Excess emissions premium', drives: 'fine',
        text: 'Where a manufacturer’s average specific emissions exceed its target, an excess emissions premium is charged per gram of exceedance, per vehicle registered.',
        soWhat: 'The charge is per gram AND per car, so volume multiplies exposure even though it does not move the fleet average.' },
      { ref: 'Art. 11', heading: 'Eco-innovation', drives: 'eco',
        text: 'Certified innovative technologies not captured by the test procedure may reduce a manufacturer’s average specific emissions, subject to a cap.',
        soWhat: 'Real, capped and certification-gated. Useful at the margin; never a strategy on its own.' },
      { ref: 'Art. 15', heading: 'Review and trajectory', drives: 'limit',
        text: 'The EU fleet-wide targets step down on the trajectory set in Annex I, subject to the review clauses.',
        soWhat: 'The step changes are the cliff edges. A plan that clears every year except one is a plan that fails.' },
    ],
  },
  {
    id: 'eu-2023-851', market: 'EU', stage: 'in force', from: 2025, to: null,
    shortTitle: '2030/2035 amendment',
    title: 'Regulation (EU) 2023/851 amending Regulation (EU) 2019/631 as regards strengthening the CO₂ emission performance standards',
    citation: 'Regulation (EU) 2023/851', authority: 'European Parliament and Council',
    url: 'https://eur-lex.europa.eu/eli/reg/2023/851/oj',
    summary:
      'The amendment that reset the trajectory: a steeper reduction from 2030 and a 100% reduction from 2035, with a review clause. It is the instrument behind every "what happens in 2035" conversation.',
    clauses: [
      { ref: 'Art. 1(5)', heading: 'Strengthened trajectory', drives: 'limit',
        text: 'The EU fleet-wide targets are tightened from 2030 and set to a 100% reduction from 2035 for both cars and vans.',
        soWhat: 'From 2035 the target admits no tailpipe CO₂ at all, which makes the fleet-average framing degenerate — plan the transition, not the arithmetic.' },
      { ref: 'Art. 1(9)', heading: 'Review clause', drives: 'none',
        text: 'The Commission shall review the effectiveness and impact of the Regulation and report, with the possibility of proposing amendments.',
        soWhat: 'The formal channel through which the 2035 position can move. Watch it; do not assume it.' },
    ],
  },

  /* ── India ──────────────────────────────────────────────────────────────── */
  {
    id: 'in-ec-act', market: 'IN', stage: 'in force', from: 2023, to: null,
    shortTitle: 'Energy Conservation (Amendment) Act',
    title: 'The Energy Conservation (Amendment) Act, 2022',
    citation: 'Act No. 19 of 2022', authority: 'Parliament of India',
    summary:
      'The enabling and penalty instrument behind CAFE. It is what makes a fuel-consumption norm enforceable and sets the stepped per-vehicle penalty that the platform charges.',
    clauses: [
      { ref: 's. 26', heading: 'Penalty for non-compliance', drives: 'fine',
        text: 'A stepped penalty is charged per vehicle of the non-compliant fleet, with a higher band once the exceedance passes the statutory threshold.',
        soWhat: 'The step is a cliff, not a slope. Being marginally over the threshold costs materially more than being marginally under it.' },
      { ref: 's. 14', heading: 'Power to prescribe norms', drives: 'none',
        text: 'The Central Government may prescribe energy consumption norms and standards for equipment, appliances and vehicles.',
        soWhat: 'The head of power CAFE III is being made under.' },
    ],
  },
  {
    id: 'in-cafe-2', market: 'IN', stage: 'in force', from: 2022, to: 2026,
    shortTitle: 'CAFE II',
    title: 'Corporate Average Fuel Efficiency norms, phase II',
    citation: 'BEE / Ministry of Power — CAFE II', authority: 'Bureau of Energy Efficiency',
    summary:
      'The operative Indian norm. Assessed on the Modified Indian Driving Cycle, per manufacturer, with no pooled average and no transferable instrument.',
    clauses: [
      { ref: 'Norm', heading: 'Corporate average target', drives: 'limit',
        text: 'A corporate-average fuel-consumption target scaled to the manufacturer’s average kerb mass against the reference mass.',
        soWhat: 'India assesses every manufacturer standalone. There is no pool to join and no credit to buy.' },
      { ref: 'Cycle', heading: 'Test cycle', drives: 'cycle',
        text: 'Compliance is measured on the MIDC (NEDC-derived) procedure.',
        soWhat: 'The cycle is the reason an Indian number and a European number for the same car do not match.' },
    ],
  },
  {
    id: 'in-cafe-3', market: 'IN', stage: 'draft', from: 2027, to: 2032,
    shortTitle: 'CAFE III (draft)',
    title: 'Draft Corporate Average Fuel Efficiency norms, phase III',
    citation: 'BEE draft CAFE III', authority: 'Bureau of Energy Efficiency',
    summary:
      'The drafted successor to CAFE II, tightening the target line from FY2027-28 and introducing carbon-neutral-fuel treatment and a transition toward WLTP. It is a draft: model it, stress it, do not file against it.',
    clauses: [
      { ref: 'Target line', heading: 'Tightened corporate average', drives: 'limit',
        text: 'A stepped-down corporate-average target from FY2027-28 through the end of the drafted schedule.',
        soWhat: 'The whole Indian exposure conversation lives here — and it is not notified, which is why the platform exposes a target-stringency stress lever for this market only.' },
      { ref: 'CNF', heading: 'Carbon-neutral fuel treatment', drives: 'limit',
        text: 'A discount applied to the measured fuel consumption of vehicles running qualifying carbon-neutral fuel pathways.',
        soWhat: 'Materially changes who is compliant. If it is struck from the final norms, positions move — model both.' },
      { ref: 'Cycle', heading: 'MIDC to WLTP transition', drives: 'cycle',
        text: 'The norm anticipates a transition from MIDC to WLTP, with the conversion factor to be notified separately.',
        soWhat: 'A conversion notified later, applied to a target set earlier, is a transition cliff. It is worth modelling before it is worth arguing about.' },
    ],
  },

  /* ── United Kingdom ─────────────────────────────────────────────────────── */
  {
    id: 'uk-vets', market: 'UK', stage: 'in force', from: 2024, to: null,
    shortTitle: 'ZEV mandate (VETS)',
    title: 'The Vehicle Emissions Trading Schemes Order 2023',
    citation: 'SI 2023/1268', authority: 'Department for Transport',
    url: 'https://www.legislation.gov.uk/uksi/2023/1268/contents/made',
    summary:
      'The UK’s zero-emission vehicle mandate, run as a trading scheme. Unlike the EU it creates an actual transferable instrument — allowances — alongside a separate non-ZEV CO₂ scheme, and it sets a statutory ZEV share that rises each year.',
    clauses: [
      { ref: 'Pt. 2', heading: 'ZEV share obligation', drives: 'limit',
        text: 'A registered participant must hold allowances equal to the specified proportion of its relevant registrations for the scheme year.',
        soWhat: 'A statutory floor on zero-emission share. Any adoption assumption below it is not a scenario, it is a breach.' },
      { ref: 'Pt. 4', heading: 'Transfer of allowances', drives: 'transfer',
        text: 'Allowances may be transferred between registered participants, subject to the conditions of the scheme.',
        soWhat: 'Here there really is something to buy — the word "credit" is accurate in the UK in a way it is not in the EU.' },
      { ref: 'Pt. 5', heading: 'Borrowing and carry-over', drives: 'credits',
        text: 'Limited borrowing from future scheme years and carry-over of surplus allowances are permitted within stated caps.',
        soWhat: 'Borrowing turns a breach into a bigger obligation later. It is a financing decision, not a compliance fix.' },
      { ref: 'Sch.', heading: 'Payment in lieu', drives: 'fine',
        text: 'A specified payment applies per vehicle in respect of an unmet obligation.',
        soWhat: 'The effective ceiling on the allowance price — nobody rationally pays more than this to close a gap.' },
    ],
  },

  /* ── Australia ──────────────────────────────────────────────────────────── */
  {
    id: 'au-nves', market: 'AU', stage: 'in force', from: 2025, to: null,
    shortTitle: 'New Vehicle Efficiency Standard',
    title: 'New Vehicle Efficiency Standard Act 2024',
    citation: 'NVES Act 2024', authority: 'Commonwealth of Australia',
    summary:
      'Australia’s first CO₂ standard for new light vehicles. A mass-based target with separate treatment for the two vehicle types, a credit that can be transferred and banked, and a per-gram penalty.',
    clauses: [
      { ref: 'Pt. 2', heading: 'Emissions value and target', drives: 'limit',
        text: 'A supplier’s target is set by a mass-based curve with break points, applied separately by vehicle type.',
        soWhat: 'The break points matter more than the slope: a fleet that sits near one is very sensitive to mix.' },
      { ref: 'Pt. 3', heading: 'Credits and debits', drives: 'transfer',
        text: 'Suppliers accrue credits or debits against their target, which may be transferred or carried forward within the stated period.',
        soWhat: 'A real instrument with an expiry. A banked credit is a wasting asset — the year you use it in is a decision.' },
      { ref: 'Pt. 4', heading: 'Penalty', drives: 'fine',
        text: 'An amount is payable per gram of exceedance per vehicle where debits are not discharged within the permitted period.',
        soWhat: 'The clock on discharging debits is the thing to plan around, not the rate.' },
    ],
  },

  /* ── China ──────────────────────────────────────────────────────────────── */
  {
    id: 'cn-dual-credit', market: 'CN', stage: 'in force', from: 2021, to: null,
    shortTitle: 'Dual-credit measures',
    title: 'Parallel Management Measures for Corporate Average Fuel Consumption and New Energy Vehicle Credits',
    citation: 'MIIT dual-credit measures', authority: 'Ministry of Industry and Information Technology',
    summary:
      'Two credit accounts, not one. A manufacturer must satisfy a corporate-average fuel-consumption obligation AND a separate new-energy-vehicle ratio, with distinct rules on which surplus can offset which deficit.',
    clauses: [
      { ref: 'CAFC', heading: 'Corporate average fuel consumption credit', drives: 'limit',
        text: 'A credit or debit is generated against the corporate-average fuel-consumption target for the year.',
        soWhat: 'This is the axis that behaves like every other regime in the platform.' },
      { ref: 'NEV', heading: 'New energy vehicle credit ratio', drives: 'credits',
        text: 'A separate obligation to generate NEV credits equal to a specified proportion of conventional production.',
        soWhat: 'A maker can be long on one axis and short on the other. Netting them into a single "position" is the classic China modelling error.' },
      { ref: 'Transfer', heading: 'Transfer and offset', drives: 'transfer',
        text: 'Credits may be transferred between affiliated enterprises and traded, subject to the offset rules between the two accounts.',
        soWhat: 'The offset rules — not the prices — decide what a surplus is actually worth.' },
    ],
  },
  {
    id: 'cn-gb27999', market: 'CN', stage: 'in force', from: 2021, to: null,
    shortTitle: 'GB 27999 fuel-consumption limits',
    title: 'GB 27999 — Fuel consumption evaluation methods and targets for passenger cars',
    citation: 'GB 27999', authority: 'National standards committee',
    summary:
      'The national standard that supplies the target curve behind the CAFC axis: a stepped, mass-based fuel-consumption limit and the evaluation method used to test against it.',
    clauses: [
      { ref: 'Curve', heading: 'Mass-based target curve', drives: 'limit',
        text: 'The corporate-average target is derived from a stepped curve over curb mass.',
        soWhat: 'Stepped, not smooth. A small mass change near a step is worth more than a large one inside a band.' },
      { ref: 'Method', heading: 'Evaluation method', drives: 'cycle',
        text: 'The test procedure and the aggregation method used to compute the corporate average.',
        soWhat: 'Determines whether a declared figure is comparable to the one in your own dataset.' },
    ],
  },
]

export const instrumentsFor = (market: CountryId) =>
  INSTRUMENTS.filter((i) => i.market === market)
    .sort((a, b) => STAGE_ORDER.indexOf(b.stage) - STAGE_ORDER.indexOf(a.stage) || a.from - b.from)

export const DRIVES_LABEL: Record<Drives, string> = {
  limit: 'The limit', fine: 'The charge', pooling: 'Pooling', transfer: 'Transfer mechanism',
  credits: 'Flexibilities', eco: 'Eco-innovation', cycle: 'Test cycle',
  coverage: 'Dataset coverage', scope: 'Scope', none: 'Nothing computed',
}
