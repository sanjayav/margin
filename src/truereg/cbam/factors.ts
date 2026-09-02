// ───────────────────────────────────────────────────────────────────────────
// EMISSION FACTORS — the same honesty contract as defaults.ts.
//
// A factor is never a bare constant in this codebase. It carries a status, a
// source and a version, and any figure computed from an 'indicative' factor is
// itself stamped indicative all the way to the screen. Verifiers ask where the
// factor came from before they ask what the answer was.
// ───────────────────────────────────────────────────────────────────────────

export interface Factor {
  id: string
  label: string
  labelZh?: string
  /** tCO₂e per unit of `per`. */
  value: number
  per: string
  status: 'published' | 'indicative'
  source: string
}

/** Grid electricity, tCO₂e/MWh. The indirect component turns on this number, so
 *  where a plant has a contractual (PPA) factor it should be entered instead —
 *  see `overrideElectricity` on the calculation options. */
export const GRID: Record<string, Factor> = {
  CN: { id: 'grid.CN', label: 'China national grid average', labelZh: '中国电网平均', value: 0.58, per: 'MWh', status: 'indicative', source: 'Analyst estimate pending the Commission’s published electricity emission factors' },
  IN: { id: 'grid.IN', label: 'India national grid average', value: 0.71, per: 'MWh', status: 'indicative', source: 'Analyst estimate' },
  '*': { id: 'grid.*', label: 'Fallback grid average', value: 0.45, per: 'MWh', status: 'indicative', source: 'Analyst estimate' },
}

/** Fuel combustion factors, tCO₂e per tonne of fuel unless `per` says otherwise.
 *  Used only where the operator has NOT supplied a direct-emissions figure for
 *  the source stream; a measured figure always wins. */
export const FUEL: Record<string, Factor> = {
  coke: { id: 'fuel.coke', label: 'Coke', labelZh: '焦炭', value: 3.14, per: 't', status: 'indicative', source: 'Analyst estimate from typical carbon content 0.856' },
  coal: { id: 'fuel.coal', label: 'Coal (bituminous)', labelZh: '烟煤', value: 2.42, per: 't', status: 'indicative', source: 'Analyst estimate' },
  'coke-oven-gas': { id: 'fuel.cog', label: 'Coke oven gas', labelZh: '焦炉煤气', value: 0.044, per: 'GJ', status: 'indicative', source: 'Analyst estimate' },
  'blast-furnace-gas': { id: 'fuel.bfg', label: 'Blast furnace gas', labelZh: '高炉煤气', value: 0.260, per: 'GJ', status: 'indicative', source: 'Analyst estimate' },
  'natural-gas': { id: 'fuel.ng', label: 'Natural gas', labelZh: '天然气', value: 0.0561, per: 'GJ', status: 'indicative', source: 'Analyst estimate' },
  limestone: { id: 'process.limestone', label: 'Limestone calcination', labelZh: '石灰石煅烧', value: 0.44, per: 't', status: 'indicative', source: 'Stoichiometric CaCO₃ → CaO + CO₂' },
}

export function gridFactor(country: string): Factor { return GRID[country] ?? GRID['*'] }
export function fuelFactor(carrier: string): Factor | null { return FUEL[carrier] ?? null }

/** True when every factor used in a calculation is published. Drives whether an
 *  answer may be presented as final rather than indicative. */
export const allPublished = (fs: Factor[]) => fs.length > 0 && fs.every((f) => f.status === 'published')
