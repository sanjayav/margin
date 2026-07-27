// ───────────────────────────────────────────────────────────────────────────
// ANOMALY SCANNER — deterministic data-quality checks on a fleet extract.
//
// Runs on the live dataset (Data module) and on an import BEFORE it commits, so
// impossible or suspicious rows are caught rather than silently skewing a
// sales-weighted compliance average. Pure, no deps — the same scan powers the
// Data module's quality panel and the Import Studio's review gate.
//
// Checks: impossible values · cross-field contradictions · statistical outliers
// (IQR fences within each powertrain) · completeness · duplicates.
// ───────────────────────────────────────────────────────────────────────────
import type { Vehicle } from './types.js'

export type AnomalySeverity = 'error' | 'warn'
export interface Anomaly {
  severity: AnomalySeverity
  kind: string
  row: number            // index into the scanned array
  label: string          // human row id (maker · model)
  field?: keyof Vehicle
  message: string
}

const isBev = (v: Vehicle) => v.co2 === 0 || /bev|electric/i.test(`${v.powertrain} ${v.fuel}`)
const rowLabel = (v: Vehicle) => `${(v.parent || '—').split(' ')[0]} · ${v.model || '—'}${v.variant ? ` (${v.variant})` : ''}`

// median & IQR fences (Tukey) — robust to the very outliers we're hunting.
function fences(xs: number[]): { lo: number; hi: number } | null {
  const s = [...xs].sort((a, b) => a - b)
  if (s.length < 8) return null // too few to judge an outlier
  const q = (p: number) => { const i = (s.length - 1) * p; const lo = Math.floor(i); return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo) }
  const q1 = q(0.25), q3 = q(0.75), iqr = q3 - q1
  return { lo: q1 - 3 * iqr, hi: q3 + 3 * iqr } // 3×IQR = "far out", conservative
}

export function scanAnomalies(rows: Vehicle[]): Anomaly[] {
  const out: Anomaly[] = []
  const add = (severity: AnomalySeverity, kind: string, i: number, message: string, field?: keyof Vehicle) =>
    out.push({ severity, kind, row: i, label: rowLabel(rows[i]), message, field })

  // ── per-row: impossible values, contradictions, completeness ──────────────
  const seen = new Map<string, number>()
  rows.forEach((v, i) => {
    if (!v.parent) add('error', 'missing', i, 'No manufacturer — the row can’t be attributed to a compliance entity.', 'parent')
    if (!v.model) add('error', 'missing', i, 'No model name.', 'model')
    if (!v.year || v.year < 2000 || v.year > 2100) add('error', 'bad-year', i, `Implausible year “${v.year}”.`, 'year')
    if (v.co2 < 0) add('error', 'impossible-co2', i, `Negative CO₂ (${v.co2}).`, 'co2')
    if (v.mass <= 0) add('error', 'impossible-mass', i, `Non-positive kerb mass (${v.mass} kg).`, 'mass')
    else if (v.mass < 400 || v.mass > 4000) add('warn', 'mass-range', i, `Kerb mass ${v.mass} kg is outside the plausible passenger-car range (400–4,000).`, 'mass')
    if (v.sales < 0) add('error', 'negative-sales', i, `Negative units (${v.sales}).`, 'sales')
    else if (!v.sales) add('warn', 'zero-sales', i, 'Zero units — the row won’t affect the sales-weighted average.', 'sales')
    // cross-field contradictions
    if (isBev(v) && v.co2 > 0) add('error', 'bev-co2', i, `Electric/BEV row with ${v.co2} g/km CO₂ — should be 0.`, 'co2')
    if (!isBev(v) && v.co2 === 0 && v.sales > 0) add('warn', 'ice-zero-co2', i, 'Combustion row with 0 CO₂ — likely a mislabelled powertrain or a missing value.', 'co2')
    if (isBev(v) && (v.battery == null || v.battery === 0)) add('warn', 'bev-no-battery', i, 'BEV with no battery capacity recorded.', 'battery')
    // duplicate key
    const key = `${v.parent}|${v.model}|${v.variant ?? ''}|${v.year}`.toLowerCase()
    if (seen.has(key)) add('warn', 'duplicate', i, `Duplicate of row ${seen.get(key)! + 1} (same maker · model · variant · year).`)
    else seen.set(key, i)
  })

  // ── statistical outliers: CO₂ & mass within each powertrain group ──────────
  const groups = new Map<string, number[]>()
  rows.forEach((v, i) => { const g = v.powertrain || 'ICE'; (groups.get(g) ?? groups.set(g, []).get(g)!).push(i) })
  for (const [, idxs] of groups) {
    for (const [field, unit] of [['co2', 'g/km'], ['mass', 'kg']] as const) {
      const vals = idxs.map((i) => rows[i][field] as number).filter((x) => x > 0)
      const f = fences(vals)
      if (!f) continue
      for (const i of idxs) {
        const x = rows[i][field] as number
        if (x > 0 && (x < f.lo || x > f.hi)) add('warn', `${field}-outlier`, i, `${field === 'co2' ? 'CO₂' : 'Mass'} ${x} ${unit} is a statistical outlier for its powertrain (peers ${f.lo < 0 ? 0 : Math.round(f.lo)}–${Math.round(f.hi)}).`, field)
      }
    }
  }

  // errors first, then by row
  return out.sort((a, b) => (a.severity === b.severity ? a.row - b.row : a.severity === 'error' ? -1 : 1))
}

export interface AnomalySummary { errors: number; warns: number; total: number; byKind: Record<string, number> }
export function summariseAnomalies(list: Anomaly[]): AnomalySummary {
  const byKind: Record<string, number> = {}
  for (const a of list) byKind[a.kind] = (byKind[a.kind] ?? 0) + 1
  return { errors: list.filter((a) => a.severity === 'error').length, warns: list.filter((a) => a.severity === 'warn').length, total: list.length, byKind }
}
