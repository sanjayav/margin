import { create } from 'zustand'
import type { Aggregate, RulePack, Scenario } from '../engine/types'
import type { FleetMeta } from '../data/fleet'

export interface ProvPayload {
  agg: Aggregate
  pack: RulePack
  scenario: Scenario
  meta: FleetMeta
}

interface ProvState {
  open: boolean
  payload: ProvPayload | null
  show: (p: ProvPayload) => void
  close: () => void
}

/** Global "show the working" drawer — any number can open it from anywhere. */
export const useProvenance = create<ProvState>((set) => ({
  open: false,
  payload: null,
  show: (payload) => set({ open: true, payload }),
  close: () => set({ open: false }),
}))

export interface Contribution {
  model: string
  powertrain: string
  fuel: string
  co2: number
  mass: number
  sales: number
  metric: number          // emissions figure after credits (what gets averaged)
  effUnits: number        // effective units (super-credits)
  weight: number          // metric × effUnits
}

/** The exact rows and weights behind a fleet's weighted-average emissions. */
export function contributions(agg: Aggregate, pack: RulePack, s: Scenario): Contribution[] {
  return agg.vehicles
    .map((v) => {
      const metric = pack.vehicleMetric(v, s)
      const effUnits = pack.vehicleUnits(v, s)
      return { model: v.model, powertrain: v.powertrain, fuel: v.fuel, co2: v.co2, mass: v.mass, sales: v.sales, metric, effUnits, weight: metric * effUnits }
    })
    .sort((a, b) => b.weight - a.weight)
}

export function rowsCsv(agg: Aggregate, pack: RulePack, s: Scenario): string {
  const head = ['model', 'powertrain', 'fuel', `co2_gpkm`, 'mass_kg', 'sales', `metric_${pack.metricUnit.replace(/\W/g, '')}`, 'effective_units', 'weighted_contribution']
  const lines = contributions(agg, pack, s).map((c) =>
    [c.model, c.powertrain, c.fuel, c.co2, c.mass, c.sales, c.metric.toFixed(3), Math.round(c.effUnits), c.weight.toFixed(1)]
      .map((x) => (typeof x === 'string' && x.includes(',') ? `"${x}"` : x)).join(','),
  )
  return [head.join(','), ...lines].join('\n')
}

export function download(filename: string, text: string, mime = 'text/csv') {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
