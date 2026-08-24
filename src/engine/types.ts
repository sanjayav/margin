// ───────────────────────────────────────────────────────────────────────────
// AiRE · shared types
// The calculation engine is country-agnostic. Everything that differs between
// countries lives in a RulePack (the "four things that change per country":
// limit formula, credit system, pooling rules, fine rate).
// ───────────────────────────────────────────────────────────────────────────

export type CountryId = 'EU' | 'IN' | 'AU' | 'UK' | 'CN'

export interface Vehicle {
  parent: string          // Compliance parent (the car maker)
  pool: string            // Pooling group it may join
  brand: string
  make: string
  model: string
  year: number
  powertrain: string      // BEV / PHEV / HEV / MHEV / ICE / Strong Hybrid ...
  fuel: string
  co2: number             // g CO₂/km (tailpipe, official)
  mass: number            // kg (test / kerb mass per country)
  sales: number           // registrations / units sold
  vclass: string          // Passenger car / LCV / Type 1 / Type 2 ...
  ecoBenefit?: number      // eco-innovation g credit (EU/UK)
  cnf?: number             // carbon-neutral-fuel discount fraction (India)
  engineCC?: number
  zev?: number
  scenario?: string
  /** Set by the engine on user-added hypothetical variants: the row's typed
   *  spec/volume is an explicit assumption — fleet-level levers (volume
   *  multiplier, mix reweighting, EV-share reallocation, mass shift, eco)
   *  never rescale it. */
  pinned?: boolean
  // ── richer per-variant spec (populated from the official workbooks where
  //    available; all optional so the engine never depends on them) ──
  variant?: string         // human variant/spec descriptor (e.g. "Auto · FWD · 61 kWh")
  variantId?: string       // stable spec/brand id from the source (e.g. "SZK-01")
  battery?: number         // usable battery capacity, kWh (BEV/PHEV)
  range?: number           // electric/WLTP range, km
  energy?: number          // energy consumption (Wh/km or L/100km per market)
  kerbMass?: number        // kerb mass, kg
  testMass?: number        // test mass, kg (EU limit basis)
  footprint?: number       // footprint, m² (where the limit is footprint-based)
  gearbox?: string
  driveline?: string
  market?: string          // country / sub-market label
  segment?: string         // market segment (India A–F, etc.)
  bodyStyle?: string       // SUV / Hatchback / Sedan / MPV …
  driveCycle?: string      // homologation cycle (MIDC / WLTC / NEDC …)
  powerKW?: number         // rated power, kW
  co2Estimated?: boolean   // co2 was back-filled from siblings/mass fit, not measured
  /** Months of the year the source actually recorded (1–11 on a part-year
   *  pull; absent means a complete year). A sales-weighted average is
   *  volume-invariant, so compliance is unaffected — but the year's absolute
   *  volume and fine exposure are partial, and surfaces should say so. */
  monthsRecorded?: number
  /** Registrations per month of the compliance year, index 0 = the first month
   *  (see `RulePack.fiscalYearStartMonth`). Its length is how far the year has
   *  been REPORTED, so a 0 inside it is a real zero-sales month while anything
   *  past the end simply has not been filed yet. Always sums to `sales`. */
  monthly?: number[]
  /** Set when the row's volume is not a model-level figure — e.g. a parent
   *  whose source records only a brand total with no model split. */
  salesBasis?: string
  /** Which workbook this row came from. A market can be assembled from more
   *  than one source (India merges a 5-entity plan file with a full-market
   *  registrations file), and a row must be able to say which. */
  source?: string
  /** Which parallel powertrain launch this row currently assumes. Set only on
   *  rows whose source lists several MUTUALLY EXCLUSIVE options (see below). */
  powertrainOption?: string
  /** The alternative launches the source offers for this model, richest-CO₂
   *  first. The row ships as `powertrainOptions[0]` — the conservative choice,
   *  since a compliance plan must not book clean-tech credit for a product
   *  decision the maker has not committed to. `scenario.powertrainOptionMode`
   *  switches the fleet onto another option. */
  powertrainOptions?: PowertrainOption[]
  // ── the India master-file structure (every heading has a home; empty
  //    columns are captured so they light up the moment the file fills them) ──
  ftCode?: string          // fuel-type code (G/D/C/E/H/L)
  fuelKmpl?: number        // fuel economy, km/l
  fuelMpg?: number         // fuel economy, mpg
  fuelL100?: number        // fuel consumption, L/100km (petrol-equivalent)
  rangeAlt?: number        // second E-Range column (alt cycle)
  otrPrice?: number        // on-the-road price
  tax?: number             // tax rate/amount as recorded in the source
  refMass?: number         // reference mass, kg
  lengthMm?: number
  widthMm?: number
  heightMm?: number
  // ── added-variant volume control (only used on Scenario.extraVariants) ──
  share?: number           // 0–1: this variant's target share of its scope (proportional)
  shareScope?: 'market' | 'manufacturer' | 'model'
}

/** One candidate launch for a model whose source lists parallel, mutually
 *  exclusive powertrains rather than an additive variant mix. */
export interface PowertrainOption {
  powertrain: string
  fuel: string
  co2: number
  mass?: number
  battery?: number
  /** this family's share of the source's combined variant volume */
  share?: number
}

/** Live, user-controlled assumptions. Moving any of these recomputes everything. */
export interface Scenario {
  year: number
  evSharePct: number | null   // null = use actual fleet mix; else force ZE share %
  salesMultiplier: number     // 1.0 = as-sold
  massShiftKg: number         // shift average test mass (moves fleet AND the limit)
  ecoBoostG: number           // extra eco-innovation credit, g CO₂/km
  poolingEnabled: boolean
  superCreditsEnabled: boolean
  mix?: Record<string, number> | null  // per-powertrain weights; engine renormalizes to shares
  extraVariants?: Vehicle[]   // hypothetical variants the user added
  phevUF?: boolean            // EU: apply the 2025+ PHEV utility-factor correction (default true)
  creditPrice?: number | null // override the pack's credit price for trading value
  /** Regulatory-stringency stress for DRAFT regimes (%, applied to the target
   *  line by packs whose norms are not yet notified — India CAFE III). Negative
   *  = final rules land tighter than the draft. null/0 = as drafted. */
  targetShiftPct?: number | null
  /** India CAFE III: carbon-neutral-fuel discounts (E20 petrol 8%, CNG 5%,
   *  flex 22.3%) — auto-derived from fuel where the row carries no explicit
   *  cnf. Default true; false models "CNF struck from the final rules". */
  cnfEnabled?: boolean
  /** India CAFE III · fuel-pathway lever. Extra carbon-neutral-fuel discount
   *  POINTS on top of the auto-derived per-vehicle CNF, modelling a richer
   *  blend/CNG pathway (E20 → E27 → flex/CNG). 0 = today's E20 baseline. */
  cnfBoostPct?: number
  /** India CAFE III · apply the MIDC→WLTP cycle-conversion uplift to fuel use
   *  (the cycle change typically raises the measured number ~18%). Stress-tests
   *  the FY2027-28 transition cliff while the limit stays MIDC-based. */
  cycleWltp?: boolean
  /** Which of a model's parallel powertrain launches to assume, for the rows
   *  whose source offers several mutually-exclusive options (`Vehicle
   *  .powertrainOptions`). 'conservative' (default) takes the highest-CO₂
   *  option — no uncommitted clean-tech credit; 'electrified' takes the
   *  lowest; 'blended' volume-weights them, which is a portfolio view rather
   *  than any single achievable launch. Rows without options are untouched. */
  powertrainOptionMode?: 'conservative' | 'electrified' | 'blended'
  // ── China dual-credit (双积分) — second-axis levers, read only by the CN
  //    dual-credit ledger. null/undefined = statutory value for the year. ──
  /** Override the NEV credit RATIO requirement (% of the conventional-car base
   *  a maker must earn in NEV credits). null = the statutory schedule
   *  (2023 18% · 2024 28% · 2025 38% · 2026 48% · 2027 58%). */
  nevRatioTarget?: number | null
  /** ¥ per NEV credit for valuing a maker's net position and the cost of
   *  clearing a deficit. null = the pack's creditPrice. */
  nevCreditPrice?: number | null
  /** Allow affiliate (关联企业, ≥25% equity) CAFC-surplus transfers to net across
   *  a group's legal entities before costing a deficit. Default false — each
   *  entity is judged standalone. */
  affiliateTransfer?: boolean
}

/** How an added variant's volume is expressed. `absolute` adds units on top of
 *  the fleet; `share` makes the variant a % of its scope, shrinking the existing
 *  volume in that scope proportionately so the scope total stays constant. */
export type ShareScope = 'market' | 'manufacturer' | 'model'

export interface LimitContext {
  year: number
  avgMass: number
  zlevShare: number   // share of registrations that are zero/low-emission
  vclass: string
  scenario: Scenario
}

/** How complete a market's bundled dataset is.
 *   • `market`  — essentially the whole regulated market. Every maker a customer
 *                 would look for is present, so market-level totals are real.
 *   • `partial` — real, sourced rows, but only some compliance entities. Per-maker
 *                 figures stand; market totals are scope totals and say so.
 *   • `preview` — a sample carried to exercise the rule pack. Correct arithmetic
 *                 over an unrepresentative fleet — never shown as a market view. */
export type CoverageTier = 'market' | 'partial' | 'preview'

/** The instrument (if any) that moves compliance between manufacturers. */
export interface TransferModel {
  /** 'pool' = a shared fleet average only, no instrument (EU Article 6).
   *  'trade' = transferable credits/allowances with a price. */
  kind: 'pool' | 'trade'
  /** What one unit of headroom IS, singular — 'ZEV allowance', 'NEV credit'. */
  unit: string
  /** The verb a surface should use — 'pool', 'trade'. */
  verb: string
  /** How a surplus holder is described — 'pool partner', 'seller'. */
  supplier: string
  /** How a deficit holder is described — 'pool member', 'buyer'. */
  taker: string
  /** One line on the mechanism, shown where the distinction matters. */
  note: string
}

export interface DataCoverage {
  tier: CoverageTier
  /** One line naming the source and the scope, shown under the workspace.
   *  Written to be read by a customer, not by us. */
  label: string
  /** Shown on the module card and the preview interstitial when tier is not
   *  `market` — what is missing and what it means for the numbers on screen. */
  detail?: string
}

export interface RulePack {
  id: CountryId
  name: string
  flag: string
  currency: string        // ISO-ish symbol used for fines
  metricUnit: string      // 'g CO₂/km' or 'L/100km'
  metricLabel: string     // 'Fleet CO₂' etc
  massLabel: string       // 'Test mass' / 'Kerb mass' / 'MIRO'
  fineRate: number        // charged per metric-unit over, per vehicle
  fineRateLabel: string   // human string, e.g. '€95 per g/km · per car'
  /** True while the pack's fine/credit rates are placeholders pending primary-source
   *  confirmation — surfaced as an "illustrative" badge wherever money is shown. */
  illustrativeRates?: boolean
  creditPrice?: number    // price of one credit (per metric-unit · per vehicle) where trading exists
  creditPriceLabel?: string
  years: number[]
  /** Landing year for a fresh scenario. Defaults to years[0] when omitted — set
   *  it when the chronological first year (e.g. a historic actuals baseline) is
   *  not the year the workspace should open on. */
  defaultYear?: number
  /** Latest year with SETTLED actuals. Years after this are the source's forward
   *  (planning/projection) rows — the UI flags them "projected". Defaults to the
   *  data-refresh year when omitted; set it when the dataset blends actuals with
   *  forward years (e.g. China: 2024–25 settled, 2026–27 Phase-6 planning). */
  actualsThroughYear?: number
  /** Calendar month (1–12) the compliance year starts on. India's CAFE year is
   *  the fiscal year, so FY2025-26 runs Apr 2025 → Mar 2026 and month 1 of a
   *  monthly filing is April. Defaults to 1 (calendar year). */
  fiscalYearStartMonth?: number
  classes: string[]
  smallVolumeThreshold: number
  /** True where each vehicle CLASS is its own compliance obligation, so the
   *  classes must not net against each other. Under Reg (EU) 2019/631 a maker
   *  holds separate M1 and N1 targets and Article 8 charges each independently:
   *  van headroom cannot pay down a car deficit. Regimes that assess one blended
   *  fleet leave this unset. */
  classSeparateCompliance?: boolean
  pooling: { enabled: boolean; note: string }
  credits: string         // human description of the credit system

  /** How compliance moves BETWEEN compliance entities in this regime.
   *
   *  This exists because the EU has NO transfer instrument. Article 6 pooling
   *  makes members share ONE fleet average — nothing is issued, transferred,
   *  priced or banked, so "credit", "trade", "seller" and "banked position" are
   *  all factually wrong for the EU. Headroom there is real and valuable, but it
   *  moves by joining a pool, not by selling anything. Every regime must declare
   *  its mechanism so no surface can describe a market that does not exist. */
  transfer: TransferModel
  limitNote: string       // how the limit is built, plain language
  source: string          // where the official numbers come from
  /** Set when the bundled dataset covers only part of the real market —
   *  surfaces an honesty chip so "market" verdicts read as covered-scope. */
  coverageNote?: string
  /** How complete this market's dataset is. Drives the provenance line under
   *  the workspace and the readiness state on the module card — replacing the
   *  old blanket "illustrative until live data connected" disclaimer, which was
   *  false for a market carrying a full registrations file (India) and not
   *  specific enough for one carrying a partial book (China). */
  coverage: DataCoverage

  /** Per-vehicle emissions figure that gets weighted-averaged (after credits). */
  vehicleMetric: (v: Vehicle, s: Scenario) => number
  /** Effective registrations — super-credits can multiply EV units. */
  vehicleUnits: (v: Vehicle, s: Scenario) => number
  /** Is this a zero-emission vehicle (0 g) — drives the displayed ZE share. */
  isZeroEmission: (v: Vehicle) => boolean
  /** Is this a zero- OR low-emission vehicle (EU: 0–50 g/km) — drives the ZLEV
   *  benchmark target relaxation. Defaults to isZeroEmission when omitted. */
  isZLEV?: (v: Vehicle) => boolean
  /** Plug-in hybrids are always handled as their own special case. */
  isPlugInHybrid: (v: Vehicle) => boolean
  /** The mass-based (or share-based) compliance limit for a fleet. */
  limit: (ctx: LimitContext) => number
  /** Year-specific reduction headline for the forecast view. */
  forecast: (year: number) => { limit: number; note: string }
  /** Non-linear statutory penalty (e.g. India's stepped ₹25k/₹50k per car).
   *  When present it replaces the linear excess × fineRate × units formula;
   *  fineRate stays as the linear-equivalent used for MACC/benchmark lines. */
  fineFor?: (excess: number, units: number, s: Scenario) => number
  /** False when the compliance limit does not move with vehicle mass (unit
   *  mandates like the UK ZEV scheme) — hides mass levers, which would be
   *  engineering theatre with no compliance effect. Default: true. */
  massBasedLimit?: boolean
  /** Which regulatory regime governs a given year — lets one pack model a
   *  market in transition (India: CAFE II → draft CAFE III) and lets the UI
   *  badge draft years honestly. cycle = the homologation test cycle of that
   *  era (MIDC/NEDC vs WLTP), cycleNote = the one-line source caveat; both
   *  drive the era bands on the Plan trajectory and the in-chart year badge. */
  regimeFor?: (year: number) => { name: string; draft?: boolean; cycle?: string; cycleNote?: string }
  /** Legal eco-innovation credit cap (g/km) for a year, where the regime has one.
   *  Undefined ⇒ no eco-innovation mechanism (the eco lever has no effect and the
   *  optimiser won't propose it). Drives the ScenarioRail cap and recommend.ts. */
  ecoCap?: (year: number) => number
}

export interface FineMath {
  excess: number
  fineRate: number
  units: number
  fine: number
  expression: string   // "4.2 g/km over × €95 × 182,400 cars"
}

/** One vehicle class's standalone position inside a mixed fleet. */
export interface ClassPosition {
  vclass: string
  units: number
  avgMetric: number
  limit: number
  gap: number
  fine: number
}

export interface Aggregate {
  label: string
  // 'fleet' = market · 'pool' = compliance pool · 'parent' = manufacturer ·
  // 'model' · 'variant' (leaf). 'powertrain' kept for the legacy buildTree.
  level: 'fleet' | 'pool' | 'parent' | 'model' | 'variant' | 'powertrain'
  key: string
  units: number           // effective units (after super-credits)
  rawUnits: number        // actual registrations
  avgMetric: number       // weighted-average emissions/FC after credits
  rawAvgMetric: number    // before credits (tailpipe)
  avgMass: number
  zlevShare: number
  limit: number
  gap: number             // avgMetric − limit  (positive = over = fine)
  fine: number
  status: 'compliant' | 'fine' | 'no-sales' | 'exempt'
  fineMath: FineMath
  /** Position per vehicle class. Only meaningful where a regime makes each class
   *  its OWN obligation (`classSeparateCompliance`) — there `fine` is the sum of
   *  these, not a single blended charge, and a maker can be long on cars while
   *  short on vans. Length 1 for a single-class fleet. */
  classes?: ClassPosition[]
  children?: Aggregate[]
  vehicles: Vehicle[]
}
