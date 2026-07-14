// ───────────────────────────────────────────────────────────────────────────
// Autocred AI · shared types
// The calculation engine is country-agnostic. Everything that differs between
// countries lives in a RulePack (the "four things that change per country":
// limit formula, credit system, pooling rules, fine rate).
// ───────────────────────────────────────────────────────────────────────────

export type CountryId = 'EU' | 'IN' | 'AU' | 'UK'

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
  classes: string[]
  smallVolumeThreshold: number
  pooling: { enabled: boolean; note: string }
  credits: string         // human description of the credit system
  limitNote: string       // how the limit is built, plain language
  source: string          // where the official numbers come from
  /** Set when the bundled dataset covers only part of the real market —
   *  surfaces an honesty chip so "market" verdicts read as covered-scope. */
  coverageNote?: string

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
  children?: Aggregate[]
  vehicles: Vehicle[]
}
