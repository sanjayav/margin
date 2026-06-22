// ───────────────────────────────────────────────────────────────────────────
// Margin · shared types
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
}

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
  creditPrice?: number    // price of one credit (per metric-unit · per vehicle) where trading exists
  creditPriceLabel?: string
  years: number[]
  classes: string[]
  smallVolumeThreshold: number
  pooling: { enabled: boolean; note: string }
  credits: string         // human description of the credit system
  limitNote: string       // how the limit is built, plain language
  source: string          // where the official numbers come from

  /** Per-vehicle emissions figure that gets weighted-averaged (after credits). */
  vehicleMetric: (v: Vehicle, s: Scenario) => number
  /** Effective registrations — super-credits can multiply EV units. */
  vehicleUnits: (v: Vehicle, s: Scenario) => number
  /** Is this a zero-emission vehicle for ZLEV/share purposes. */
  isZeroEmission: (v: Vehicle) => boolean
  /** Plug-in hybrids are always handled as their own special case. */
  isPlugInHybrid: (v: Vehicle) => boolean
  /** The mass-based (or share-based) compliance limit for a fleet. */
  limit: (ctx: LimitContext) => number
  /** Year-specific reduction headline for the forecast view. */
  forecast: (year: number) => { limit: number; note: string }
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
  level: 'fleet' | 'parent' | 'model' | 'powertrain'
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
