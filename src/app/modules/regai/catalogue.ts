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
import type { CountryId } from '../../../engine/types.js'

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
  /** The regulation (programme) this instrument belongs to — see regulations.ts. */
  regulation: string
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
    id: 'eu-2019-631', regulation: 'eu-car-co2', market: 'EU', stage: 'in force', from: 2020, to: null,
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
    id: 'eu-2023-851', regulation: 'eu-car-co2', market: 'EU', stage: 'in force', from: 2025, to: null,
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
    id: 'in-ec-act', regulation: 'in-cafe', market: 'IN', stage: 'in force', from: 2023, to: null,
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
    id: 'in-cafe-2', regulation: 'in-cafe', market: 'IN', stage: 'in force', from: 2022, to: 2026,
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
    id: 'in-cafe-3', regulation: 'in-cafe', market: 'IN', stage: 'draft', from: 2027, to: 2032,
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
    id: 'uk-vets', regulation: 'uk-zev', market: 'UK', stage: 'in force', from: 2024, to: null,
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
    id: 'au-nves', regulation: 'au-nves', market: 'AU', stage: 'in force', from: 2025, to: null,
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
    id: 'cn-dual-credit', regulation: 'cn-dual-credit', market: 'CN', stage: 'in force', from: 2021, to: null,
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
    id: 'cn-gb27999', regulation: 'cn-dual-credit', market: 'CN', stage: 'in force', from: 2021, to: null,
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

  /* ── Beyond vehicle CO₂ — the carbon instruments an OEM's supply chain and
        operations answer to. No rule pack computes these, so every clause here
        drives 'none' or 'scope': the reader shows the rule, the Impact tab does
        not price it. ──────────────────────────────────────────────────────── */
  {
    id: 'eu-2023-956', regulation: 'eu-cbam', market: 'EU', stage: 'in force', from: 2026, to: null,
    shortTitle: 'CBAM',
    title: 'Regulation (EU) 2023/956 establishing a carbon border adjustment mechanism',
    citation: 'Regulation (EU) 2023/956', authority: 'European Parliament and Council',
    url: 'https://eur-lex.europa.eu/eli/reg/2023/956/oj',
    summary:
      'Puts a carbon price on the embedded emissions of imported cement, iron and steel, aluminium, fertilisers, electricity and hydrogen, mirroring the EU ETS price. The transitional reporting period ran from October 2023 to the end of 2025; the definitive period, with surrendered certificates, applies from 2026. Amended in 2025 to simplify it for small importers — read the consolidated text for current thresholds and dates.',
    clauses: [
      { ref: 'Art. 2 · Annex I', heading: 'Scope', drives: 'scope',
        text: 'Applies to goods listed in Annex I originating outside the customs territory of the Union, including specified downstream iron, steel and aluminium products.',
        soWhat: 'A finished vehicle is not in scope, but steel and aluminium inputs — and some fasteners and parts — are. The cost lands in your purchase price.' },
      { ref: 'Art. 5 · 17', heading: 'Authorised declarant', drives: 'none',
        text: 'Only an authorised CBAM declarant may import CBAM goods above the applicable threshold in the definitive period.',
        soWhat: 'An operational gate, not a price: an importer without the status cannot clear the goods.' },
      { ref: 'Art. 6', heading: 'Annual CBAM declaration', drives: 'none',
        text: 'The declarant submits an annual declaration of the quantity of goods imported, their embedded emissions and the certificates to be surrendered.',
        soWhat: 'Embedded-emissions data from your suppliers becomes a filing input. Default values apply where it is missing, and they are set to be unfavourable.' },
      { ref: 'Art. 20–22', heading: 'Certificates', drives: 'none',
        text: 'CBAM certificates are sold at a price reflecting the EU ETS auction price and surrendered against declared embedded emissions.',
        soWhat: 'The carbon price you pay tracks the EU ETS. A supplier with verified low emissions is worth more than a cheaper one on defaults.' },
    ],
  },
  {
    id: 'eu-2003-87', regulation: 'eu-ets', market: 'EU', stage: 'in force', from: 2005, to: null,
    shortTitle: 'EU ETS',
    title: 'Directive 2003/87/EC establishing a system for greenhouse gas emission allowance trading within the Union',
    citation: 'Directive 2003/87/EC', authority: 'European Parliament and Council',
    url: 'https://eur-lex.europa.eu/eli/dir/2003/87/oj',
    summary:
      'The EU emissions trading system: a cap on emissions from power, heavy industry and aviation, with tradable allowances. It sets the carbon price CBAM mirrors, and free allocation to CBAM sectors phases out as CBAM phases in.',
    clauses: [
      { ref: 'Art. 9', heading: 'The cap', drives: 'none',
        text: 'The Union-wide quantity of allowances decreases each year by a linear reduction factor.',
        soWhat: 'A falling cap is a rising price over time — the input to every steel and aluminium cost forecast.' },
      { ref: 'Art. 10a', heading: 'Free allocation and its phase-out', drives: 'none',
        text: 'Free allocation to sectors covered by CBAM is reduced progressively as CBAM applies.',
        soWhat: 'Your European suppliers lose free allowances on the same schedule your importers start paying CBAM.' },
    ],
  },
  {
    id: 'eu-2023-959', regulation: 'eu-ets2', market: 'EU', stage: 'notified', from: 2027, to: null,
    shortTitle: 'ETS2 · road fuels',
    title: 'Directive (EU) 2023/959 — emissions trading for buildings, road transport and additional sectors (Chapter IVa)',
    citation: 'Directive (EU) 2023/959, Ch. IVa', authority: 'European Parliament and Council',
    url: 'https://eur-lex.europa.eu/eli/dir/2023/959/oj',
    summary:
      'A separate trading system covering the fuel supplied for road transport and buildings, applied upstream at fuel suppliers. It puts a carbon price on petrol and diesel at the pump — which changes the running-cost case for zero-emission vehicles.',
    clauses: [
      { ref: 'Ch. IVa', heading: 'Upstream fuel obligation', drives: 'none',
        text: 'Regulated entities releasing fuels for consumption in road transport and buildings surrender allowances for the emissions of those fuels.',
        soWhat: 'Not an OEM obligation, but a demand driver: a higher pump price is an argument your ZEV forecast should carry.' },
      { ref: 'Art. 30k', heading: 'Start-date safeguard', drives: 'none',
        text: 'The start of allowance surrender can be postponed by one year where energy prices are exceptionally high.',
        soWhat: 'The start year is conditional. Model the ZEV demand effect from either year.' },
    ],
  },
  {
    id: 'eu-2024-1257', regulation: 'eu-euro7', market: 'EU', stage: 'notified', from: 2026, to: null,
    shortTitle: 'Euro 7',
    title: 'Regulation (EU) 2024/1257 on type-approval of motor vehicles with respect to their emissions and battery durability (Euro 7)',
    citation: 'Regulation (EU) 2024/1257', authority: 'European Parliament and Council',
    url: 'https://eur-lex.europa.eu/eli/reg/2024/1257/oj',
    summary:
      'The pollutant-emissions and battery-durability type-approval regulation. It applies first to new types of cars and vans, then to all new registrations a year later, and adds brake-particle limits and minimum battery-durability requirements for electrified vehicles.',
    clauses: [
      { ref: 'Art. 20', heading: 'Application dates', drives: 'scope',
        text: 'Applies to new types of M1 and N1 vehicles from 29 November 2026 and to all new M1 and N1 vehicles from 29 November 2027.',
        soWhat: 'A carry-over model with no Euro 7 approval cannot be registered after the second date — a product-plan cliff, not a CO₂ one.' },
      { ref: 'Annex I', heading: 'Battery durability', drives: 'none',
        text: 'Minimum performance requirements for traction-battery durability over the vehicle’s life.',
        soWhat: 'Durability becomes a type-approval condition, which matters for every ZEV volume your CO₂ plan depends on.' },
    ],
  },
  {
    id: 'eu-2023-1542', regulation: 'eu-battery', market: 'EU', stage: 'in force', from: 2024, to: null,
    shortTitle: 'Battery Regulation',
    title: 'Regulation (EU) 2023/1542 concerning batteries and waste batteries',
    citation: 'Regulation (EU) 2023/1542', authority: 'European Parliament and Council',
    url: 'https://eur-lex.europa.eu/eli/reg/2023/1542/oj',
    summary:
      'Life-cycle rules for batteries placed on the EU market: carbon-footprint declarations and performance classes for EV batteries, a digital battery passport, recycled-content targets and due diligence on raw materials. Most obligations phase in on dates tied to delegated and implementing acts.',
    clauses: [
      { ref: 'Art. 7', heading: 'Carbon footprint', drives: 'none',
        text: 'Electric-vehicle batteries carry a carbon-footprint declaration, followed by performance classes and maximum thresholds, each applying from dates set by the delegated acts.',
        soWhat: 'Battery CO₂ becomes something a regulator can cap — the first step toward life-cycle accounting for the ZEVs your fleet target relies on.' },
      { ref: 'Art. 77', heading: 'Battery passport', drives: 'none',
        text: 'EV batteries placed on the market carry an electronic battery passport from 18 February 2027.',
        soWhat: 'A data obligation on your supply chain with a fixed date.' },
    ],
  },
  {
    id: 'uk-cbam', regulation: 'uk-cbam', market: 'UK', stage: 'draft', from: 2027, to: null,
    shortTitle: 'UK CBAM',
    title: 'UK carbon border adjustment mechanism (legislated through the Finance Bill)',
    citation: 'UK CBAM — HM Treasury / HMRC', authority: 'HM Treasury',
    summary:
      'A UK carbon border charge on imports of aluminium, cement, fertiliser, hydrogen, and iron and steel, from 1 January 2027, set against the UK carbon price. Treated here as draft until the legislation and its regulations are confirmed in force — check the current status before filing.',
    clauses: [
      { ref: 'Scope', heading: 'Covered goods', drives: 'scope',
        text: 'Applies to specified goods in the covered sectors imported into the UK, above a registration threshold.',
        soWhat: 'Same exposure shape as EU CBAM for steel and aluminium inputs, on a different carbon price and its own forms.' },
      { ref: 'Rate', heading: 'The charge', drives: 'none',
        text: 'The charge is calculated from the embedded emissions of the goods and a CBAM rate reflecting the UK carbon price, less any carbon price paid abroad.',
        soWhat: 'A carbon price paid in the country of origin reduces the charge — supplier evidence of that is worth money.' },
    ],
  },
  {
    id: 'uk-2020-1265', regulation: 'uk-ets', market: 'UK', stage: 'in force', from: 2021, to: null,
    shortTitle: 'UK ETS',
    title: 'The Greenhouse Gas Emissions Trading Scheme Order 2020',
    citation: 'SI 2020/1265', authority: 'UK ETS Authority',
    url: 'https://www.legislation.gov.uk/uksi/2020/1265/contents',
    summary:
      'The UK’s post-Brexit emissions trading scheme for power, heavy industry and aviation. It sets the carbon price that UK CBAM is pegged to.',
    clauses: [
      { ref: 'Cap', heading: 'Cap and trajectory', drives: 'none',
        text: 'A cap on allowances that reduces over the scheme’s phases.',
        soWhat: 'The price input for UK steel and aluminium costs and for the UK CBAM rate.' },
    ],
  },
  {
    id: 'in-ccts', regulation: 'in-ccts', market: 'IN', stage: 'in force', from: 2023, to: null,
    shortTitle: 'Carbon Credit Trading Scheme',
    title: 'Carbon Credit Trading Scheme, 2023',
    citation: 'Ministry of Power — CCTS 2023', authority: 'Ministry of Power / Bureau of Energy Efficiency',
    summary:
      'India’s domestic carbon market, made under the Energy Conservation Act. Its compliance mechanism sets greenhouse-gas emission-intensity targets for obligated entities in energy-intensive sectors, starting with a first set of industrial sectors and expanding by notification.',
    clauses: [
      { ref: 'Compliance', heading: 'Emission-intensity targets', drives: 'none',
        text: 'Obligated entities receive GHG emission-intensity targets; those that beat them earn tradable carbon credit certificates, those that miss them must surrender certificates.',
        soWhat: 'Matters to an OEM through its steel, aluminium and component suppliers — and, over time, as a domestic carbon price that could be credited against CBAM-style charges abroad.' },
      { ref: 'Offset', heading: 'Offset mechanism', drives: 'none',
        text: 'Non-obligated entities may register projects to earn credits under the offset mechanism.',
        soWhat: 'A route to credits outside the vehicle norms — not a substitute for CAFE compliance.' },
    ],
  },
  {
    id: 'cn-ets', regulation: 'cn-ets', market: 'CN', stage: 'in force', from: 2021, to: null,
    shortTitle: 'National carbon market',
    title: 'Interim Regulations on the Administration of Carbon Emissions Trading',
    citation: 'State Council Decree No. 775', authority: 'State Council / Ministry of Ecology and Environment',
    summary:
      'China’s national emissions trading market. It began with the power sector and has been extended to further heavy industries, with steel, cement and aluminium smelting the first additions. The 2024 State Council regulations put the market on a firmer legal footing.',
    clauses: [
      { ref: 'Scope', heading: 'Covered sectors', drives: 'scope',
        text: 'Key emitting entities in covered sectors are allocated allowances and must surrender allowances equal to verified emissions.',
        soWhat: 'Steel and aluminium coverage means a domestic carbon cost in Chinese supply chains — and, for exports, a carbon price that may be credited under CBAM.' },
    ],
  },
  {
    id: 'au-safeguard', regulation: 'au-safeguard', market: 'AU', stage: 'in force', from: 2016, to: null,
    shortTitle: 'Safeguard Mechanism',
    title: 'National Greenhouse and Energy Reporting (Safeguard Mechanism) Rule, as reformed in 2023',
    citation: 'NGER Act 2007 · Safeguard Rule', authority: 'Clean Energy Regulator',
    summary:
      'Baselines for Australia’s largest industrial emitters, declining each year to 2030 under the 2023 reforms, with tradable Safeguard Mechanism Credits for facilities that come in under their baseline.',
    clauses: [
      { ref: 'Baselines', heading: 'Declining baselines', drives: 'none',
        text: 'Facility baselines decline on a set trajectory; facilities above baseline must surrender credits or units.',
        soWhat: 'A carbon cost on domestic heavy industry — relevant through local steel and aluminium supply, not the vehicle standard.' },
    ],
  },
  {
    id: 'au-carbon-leakage', regulation: 'au-leakage', market: 'AU', stage: 'consultation', from: 2027, to: null,
    shortTitle: 'Carbon leakage review',
    title: 'Carbon Leakage Review — including options for a border carbon adjustment',
    citation: 'DCCEEW carbon leakage review', authority: 'Department of Climate Change, Energy, the Environment and Water',
    summary:
      'A government review of carbon-leakage risk under the Safeguard Mechanism, including whether Australia should adopt a border carbon adjustment. It is a review, not an instrument: nothing here is law, and the dates on the radar are indicative.',
    clauses: [
      { ref: 'Options', heading: 'Policy options', drives: 'none',
        text: 'Assessment of leakage risk by sector and of policy responses, including a border carbon adjustment on selected imports.',
        soWhat: 'Track it, do not model it. If a border adjustment is proposed, it becomes a draft instrument here.' },
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
