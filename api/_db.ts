// Neon serverless Postgres client (HTTP driver — ideal for Vercel functions).
// If DATABASE_URL is unset, `sql` is null and callers fall back to the bundled
// extract so the app always works offline.
import { neon } from '@neondatabase/serverless'

export const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null

export interface VehicleRow {
  parent: string; pool: string; brand: string; make: string; model: string
  year: number; powertrain: string; fuel: string; co2: number; mass: number
  sales: number; vclass: string; ecoBenefit?: number; cnf?: number; zev?: number; engineCC?: number
}

export function rowToVehicle(r: any): VehicleRow {
  return {
    parent: r.parent, pool: r.pool, brand: r.brand, make: r.make, model: r.model,
    year: r.year, powertrain: r.powertrain, fuel: r.fuel,
    co2: Number(r.co2), mass: Number(r.mass), sales: Number(r.sales), vclass: r.vclass,
    ecoBenefit: r.eco_benefit == null ? undefined : Number(r.eco_benefit),
    cnf: r.cnf == null ? undefined : Number(r.cnf),
    zev: r.zev == null ? undefined : Number(r.zev),
    engineCC: r.engine_cc == null ? undefined : Number(r.engine_cc),
  }
}
