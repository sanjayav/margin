// Reconciliation & data-quality checks — run on the live data so a compliance
// team can see the numbers are internally consistent before trusting a fine.
import type { RulePack, Scenario, Vehicle } from './types'
import { buildTree } from './engine'

export interface Check { label: string; status: 'pass' | 'warn' | 'fail'; detail: string }
export interface Reconciliation {
  checks: Check[]
  coverage: { parents: number; models: number; years: number; rows: number; units: number }
  worst: 'pass' | 'warn' | 'fail'
}

export function reconcile(raw: Vehicle[], pack: RulePack, s: Scenario): Reconciliation {
  const tree = buildTree(raw, pack, s)
  const kids = tree.children ?? []
  const checks: Check[] = []

  const childUnits = kids.reduce((a, c) => a + c.rawUnits, 0)
  checks.push({ label: 'Registrations reconcile', status: Math.abs(childUnits - tree.rawUnits) < 1 ? 'pass' : 'fail', detail: `maker totals ${childUnits.toLocaleString()} = market ${tree.rawUnits.toLocaleString()}` })

  const yearRows = raw.filter((v) => v.year === s.year)
  const missing = yearRows.filter((v) => v.co2 == null || Number.isNaN(v.co2) || !(v.mass > 0)).length
  checks.push({ label: 'Complete CO₂ & mass', status: missing === 0 ? 'pass' : missing / Math.max(1, yearRows.length) < 0.02 ? 'warn' : 'fail', detail: missing === 0 ? 'all rows have CO₂ and mass' : `${missing} of ${yearRows.length} rows missing CO₂/mass` })

  const zero = yearRows.filter((v) => !(v.sales > 0)).length
  checks.push({ label: 'Sales present', status: zero === 0 ? 'pass' : 'warn', detail: zero === 0 ? 'every row has registrations' : `${zero} rows with zero sales` })

  const metrics = yearRows.map((v) => pack.vehicleMetric(v, s))
  const lo = Math.min(...metrics, tree.avgMetric), hi = Math.max(...metrics, tree.avgMetric)
  const within = tree.avgMetric >= lo - 0.01 && tree.avgMetric <= hi + 0.01
  checks.push({ label: 'Average within model range', status: within ? 'pass' : 'fail', detail: `fleet ${tree.avgMetric.toFixed(1)} in [${lo.toFixed(1)}, ${hi.toFixed(1)}] ${pack.metricUnit}` })

  checks.push({ label: 'Limit computed', status: tree.limit > 0 ? 'pass' : 'fail', detail: `market limit ${tree.limit.toFixed(1)} ${pack.metricUnit}` })

  const badFine = kids.some((c) => !(c.fine >= 0) || !Number.isFinite(c.fine))
  checks.push({ label: 'Fines finite & non-negative', status: badFine ? 'fail' : 'pass', detail: badFine ? 'invalid fine detected' : 'all fines valid' })

  const worst: Reconciliation['worst'] = checks.some((c) => c.status === 'fail') ? 'fail' : checks.some((c) => c.status === 'warn') ? 'warn' : 'pass'
  return {
    checks, worst,
    coverage: { parents: kids.length, models: new Set(yearRows.map((v) => v.model)).size, years: new Set(raw.map((v) => v.year)).size, rows: yearRows.length, units: tree.rawUnits },
  }
}
