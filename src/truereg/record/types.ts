// ───────────────────────────────────────────────────────────────────────────
// THE PRODUCT RECORD — regulation-neutral, permanently.
//
// This is the asset the customer assembles once. Every regulation the platform
// ever covers reads THIS; none of them writes to it. The discipline is absolute
// and it is the whole thesis: a mill assembles its production reality once, and
// CBAM, the UK mechanism, ESPR and whatever follows are each a *reading* of it.
//
// The test for whether a field belongs here: could a regulator repeal CBAM
// tomorrow and this field still describe something true about the plant? If the
// answer is no, the field belongs in src/truereg/cbam/, not here.
//
// Consequently there is no `cbamGoodsCategory`, no `embeddedEmissions`, no
// `defaultValue`, no `cnCode` masquerading as a product type. There is a
// classification with a named scheme; there are mass balances, energy flows and
// measured emissions. CBAM's opinion about them lives elsewhere.
//
// Everything is denominated in SI with the unit carried alongside the number,
// because a unit error in this layer is a wrong tonne of CO₂ downstream and no
// amount of agent cleverness recovers from it.
// ───────────────────────────────────────────────────────────────────────────

/** ISO-3166 alpha-2. The record does not know which of these are "third countries". */
export type CountryCode = string

/** How a quantity was arrived at. Drives evidence requirements in EVERY regime,
 *  which is why it is neutral: "measured" vs "estimated" is a fact about the
 *  plant, not about Europe. */
export type DataQuality = 'measured' | 'calculated' | 'supplier-declared' | 'estimated' | 'default'

export interface Quantity {
  value: number
  unit: string
  quality: DataQuality
  /** Relative uncertainty, fraction (0.05 = ±5%). Verifiers ask; be ready. */
  uncertainty?: number
  /** Where this number physically came from — a meter id, an invoice number, a
   *  ledger line. The verifier agent walks these; a quantity without one is a
   *  finding waiting to happen. */
  sourceRef?: string
}

/** A document the operator holds. Neutral: an invoice is an invoice. */
export interface SourceDocument {
  id: string
  kind: 'production-log' | 'energy-invoice' | 'process-log' | 'lab-report' | 'meter-calibration' | 'purchase-contract' | 'supplier-declaration' | 'other'
  title: string
  /** As written by the plant, in the plant's own language. Never translate in place. */
  titleLocal?: string
  language: string
  periodFrom?: string
  periodTo?: string
  /** Set once an agent has structured it. Unstructured documents are the
   *  intake agent's queue. */
  structured: boolean
  pages?: number
}

// ── the physical plant ──────────────────────────────────────────────────────

export interface Operator {
  id: string
  name: string
  nameLocal?: string
  country: CountryCode
  /** Economic-operator identifiers, keyed by scheme (e.g. USCC for China,
   *  EORI for an EU importer). A map, so no scheme is privileged. */
  identifiers: Record<string, string>
}

export interface Installation {
  id: string
  operatorId: string
  name: string
  nameLocal?: string
  country: CountryCode
  /** Decimal degrees. Required by more regimes than you would think. */
  lat?: number
  lon?: number
  /** UN/LOCODE or similar, if the operator has one. */
  locode?: string
}

/** A physical process step. The name is the PLANT'S name for it — vernacular,
 *  in the plant's language. Mapping this onto any regime's boundary is an act of
 *  interpretation and it happens in the regime layer, never here. */
export interface ProcessUnit {
  id: string
  installationId: string
  /** What the plant calls it, verbatim. e.g. "2#高炉". */
  localName: string
  /** A neutral English gloss, if one exists. May be absent — that absence is
   *  information the boundary agent needs. */
  name?: string
  /** Free-text function as described by plant staff. Deliberately unstructured:
   *  forcing a taxonomy here is where the wrong answers get baked in. */
  describedFunction?: string
  /** Downstream units this one feeds, by id. The plant's material graph. */
  feeds: string[]
}

// ── flows ───────────────────────────────────────────────────────────────────

export interface EnergyFlow {
  id: string
  processUnitId: string
  /** 'electricity' | 'coke-oven-gas' | 'natural-gas' | 'coal' | 'steam' | … —
   *  an open vocabulary, because plants burn what they burn. */
  carrier: string
  carrierLocal?: string
  amount: Quantity
  /** Net calorific value where the carrier is a fuel. */
  ncv?: Quantity
  /** true when the carrier is bought in rather than produced on site. */
  purchased: boolean
  documentIds: string[]
}

export interface MaterialFlow {
  id: string
  processUnitId: string
  direction: 'in' | 'out'
  material: string
  materialLocal?: string
  amount: Quantity
  /** Carbon content as a mass fraction, where it has been assayed. */
  carbonContent?: Quantity
  /** Set when the material was bought rather than made on site — this is what
   *  makes something a candidate precursor under regimes that have the concept. */
  supplierId?: string
  /** Classification of the purchased material under a named scheme. */
  classification?: Classification
  documentIds: string[]
}

export interface DirectEmissionSource {
  id: string
  processUnitId: string
  /** 'combustion' | 'process' | 'flaring' | … */
  category: string
  /** tCO2e over the period, however the operator arrived at it. */
  amount: Quantity
  method: 'calculation' | 'measurement' | 'mass-balance'
  documentIds: string[]
}

// ── output ──────────────────────────────────────────────────────────────────

export interface Classification {
  /** 'CN' | 'HS' | 'UNSPSC' | a national scheme. Never assume CN. */
  scheme: string
  code: string
  /** The scheme's own description, not ours. */
  description?: string
}

export interface CompositionEntry {
  /** Element or constituent symbol/name: 'Fe', 'C', 'Cr', 'Zn coating'. */
  constituent: string
  massFraction: number
}

/** A produced good over a production period. The unit of everything downstream. */
export interface ProductRecord {
  id: string
  installationId: string
  name: string
  nameLocal?: string
  classification: Classification[]
  /** Which process units made it, in order. The route is a FACT about the
   *  plant; what a regulation calls that route is the regulation's problem. */
  processUnitIds: string[]
  /** Saleable output over the period. */
  output: Quantity
  composition?: CompositionEntry[]
  /** Scrap / recycled input share, if measured. Read by more than one regime. */
  recycledContentFraction?: number
}

export interface ProductionPeriod {
  id: string
  installationId: string
  from: string // ISO date
  to: string
}

/** Everything known about one installation over one period. The agents fill
 *  this; the deterministic engines read it and never mutate it. */
export interface RecordBundle {
  operator: Operator
  installation: Installation
  period: ProductionPeriod
  processUnits: ProcessUnit[]
  energyFlows: EnergyFlow[]
  materialFlows: MaterialFlow[]
  directEmissions: DirectEmissionSource[]
  products: ProductRecord[]
  documents: SourceDocument[]
  /** Carbon prices the operator has actually paid in its own jurisdiction, with
   *  the scheme named. Whether any regime will *credit* them is not decided
   *  here — see cbam/article9.ts. */
  carbonPricesPaid: CarbonPricePaid[]
  /** Purchased inputs whose upstream emissions someone else must declare.
   *  Neutral framing: "we bought this and do not know its footprint". */
  supplierDeclarations: SupplierDeclaration[]
}

export interface CarbonPricePaid {
  id: string
  /** The scheme's own name: 'China national ETS', 'Guangdong pilot ETS'. */
  scheme: string
  jurisdiction: CountryCode
  /** Amount actually paid over the period, in the scheme's currency. */
  amount: Quantity
  currency: string
  /** Allowances surrendered, where the scheme works that way. */
  unitsSurrendered?: Quantity
  /** Free allocation received — a rebate in substance, and every regime that
   *  credits a carbon price nets it off. */
  freeAllocation?: Quantity
  documentIds: string[]
}

export interface SupplierDeclaration {
  id: string
  supplierId: string
  supplierName: string
  supplierNameLocal?: string
  supplierCountry: CountryCode
  material: string
  classification?: Classification
  /** Mass received over the period. */
  received: Quantity
  /** Embodied emissions per tonne AS DECLARED BY THE SUPPLIER. Neutral name —
   *  it is a number on a piece of paper until a regime decides what it means. */
  declaredIntensity?: Quantity
  /** 'none' | 'requested' | 'received' | 'verified'. Drives the precursor chase. */
  status: 'none' | 'requested' | 'received' | 'verified'
  requestedOn?: string
  documentIds: string[]
}

// ── commercial reality ──────────────────────────────────────────────────────
// A sales contract is not a regulatory object — a mill has them regardless. But
// exposure is always *someone's*, and that someone is identified per contract.

export interface SalesContract {
  id: string
  productId: string
  buyerName: string
  buyerCountry: CountryCode
  /** Buyer identifiers by scheme — 'EORI' for an EU importer, and nothing
   *  privileged about that. */
  buyerIdentifiers: Record<string, string>
  tonnes: number
  /** Delivery window; drives which regulatory period the shipment falls in. */
  deliveryFrom: string
  deliveryTo: string
  incoterm?: string
  /** Contract value per tonne in the contract currency, where disclosed. */
  pricePerTonne?: number
  currency?: string
}
