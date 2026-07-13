// ───────────────────────────────────────────────────────────────────────────
// Pure-SVG chart builders — the Big-4 deck graphics, as strings.
// Used by the Forecast board pack (print HTML) and rendered inline in the app,
// so the deliverable and the screen show the same picture. No dependencies,
// node-safe (unit-tested in scripts/check-outlook.ts).
// ───────────────────────────────────────────────────────────────────────────

const FONT = 'font-family="ui-sans-serif,system-ui" '
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
const money = (n: number, cur: string) => {
  const a = Math.abs(n)
  const s = a >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : a >= 1e6 ? `${(n / 1e6).toFixed(0)}M` : a >= 1e3 ? `${(n / 1e3).toFixed(0)}k` : `${Math.round(n)}`
  return `${cur}${s}`
}

export interface FanSeries { name: string; hex: string; values: number[] }

/** Scenario fan chart: every case line vs the statutory limit line. */
export function svgFanChart(years: number[], series: FanSeries[], limit: number[], unit: string, title: string): string {
  const W = 760, H = 280, L = 52, R = 150, T = 30, B = 34
  const all = [...series.flatMap((s) => s.values), ...limit]
  const lo = Math.min(...all), hi = Math.max(...all)
  const pad = Math.max((hi - lo) * 0.12, 0.5)
  const y = (v: number) => T + (H - T - B) * (1 - (v - (lo - pad)) / ((hi + pad) - (lo - pad)))
  const x = (i: number) => L + (W - L - R) * (years.length <= 1 ? 0.5 : i / (years.length - 1))
  const line = (vals: number[], hex: string, dash = '', w = 2.5) =>
    `<polyline fill="none" stroke="${hex}" stroke-width="${w}" ${dash ? `stroke-dasharray="${dash}"` : ''} points="${vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}"/>`
  const gridY = [lo, (lo + hi) / 2, hi].map((v) =>
    `<line x1="${L}" y1="${y(v)}" x2="${W - R}" y2="${y(v)}" stroke="#e5e7eb" stroke-width="1"/><text x="${L - 6}" y="${y(v) + 3.5}" ${FONT}font-size="10" fill="#9ca3af" text-anchor="end">${v >= 100 ? Math.round(v) : v.toFixed(1)}</text>`).join('')
  const xLabels = years.map((yr, i) => `<text x="${x(i)}" y="${H - 12}" ${FONT}font-size="10" fill="#9ca3af" text-anchor="middle">${yr}</text>`).join('')
  const legend = [{ name: 'Statutory limit', hex: '#E0A100' }, ...series].map((s, k) =>
    `<rect x="${W - R + 10}" y="${T + k * 18}" width="10" height="3" rx="1.5" fill="${s.hex}"/><text x="${W - R + 26}" y="${T + k * 18 + 4}" ${FONT}font-size="10.5" fill="#374151">${esc(s.name.slice(0, 20))}</text>`).join('')
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(title)}">
  <text x="${L}" y="16" ${FONT}font-size="12" font-weight="700" fill="#111827">${esc(title)}</text>
  <text x="${W - R}" y="16" ${FONT}font-size="10" fill="#9ca3af" text-anchor="end">${esc(unit)}</text>
  ${gridY}${xLabels}
  ${line(limit, '#E0A100', '6 4', 2)}
  ${series.map((s) => line(s.values, s.hex)).join('')}
  ${legend}</svg>`
}

export interface WaterfallStep { label: string; value: number; kind: 'total' | 'delta' }

/** Big-4 waterfall: totals as full columns, deltas as floating steps with connectors. */
export function svgWaterfall(steps: WaterfallStep[], currency: string, title: string): string {
  const W = 760, H = 280, L = 56, R = 16, T = 30, B = 56
  // cumulative walk
  let cum = 0
  const pos = steps.map((s) => {
    if (s.kind === 'total') { cum = s.value; return { ...s, from: 0, to: s.value } }
    const from = cum; cum += s.value; return { ...s, from, to: cum }
  })
  const hi = Math.max(...pos.flatMap((p) => [p.from, p.to]), 1)
  const lo = Math.min(...pos.flatMap((p) => [p.from, p.to]), 0)
  const y = (v: number) => T + (H - T - B) * (1 - (v - lo) / (hi - lo || 1))
  const bw = (W - L - R) / steps.length
  const bars = pos.map((p, i) => {
    const x0 = L + i * bw + bw * 0.16
    const w = bw * 0.68
    const y0 = y(Math.max(p.from, p.to)), y1 = y(Math.min(p.from, p.to))
    const h = Math.max(2, y1 - y0)
    const fill = p.kind === 'total' ? '#4b5563' : p.value > 0 ? '#E0484D' : '#0E9F6E'
    const conn = i < pos.length - 1 ? `<line x1="${x0 + w}" y1="${y(p.to)}" x2="${L + (i + 1) * bw + bw * 0.16}" y2="${y(p.to)}" stroke="#9ca3af" stroke-dasharray="3 3" stroke-width="1"/>` : ''
    const val = p.kind === 'total' ? money(p.to, currency) : `${p.value >= 0 ? '+' : '−'}${money(Math.abs(p.value), currency)}`
    return `<rect x="${x0.toFixed(1)}" y="${y0.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${fill}"/>${conn}
    <text x="${(x0 + w / 2).toFixed(1)}" y="${(y0 - 6).toFixed(1)}" ${FONT}font-size="10" font-weight="700" fill="#111827" text-anchor="middle">${val}</text>
    <text x="${(x0 + w / 2).toFixed(1)}" y="${H - 34}" ${FONT}font-size="9.5" fill="#6b7280" text-anchor="middle">${esc(p.label.length > 14 ? p.label.slice(0, 13) + '…' : p.label)}</text>`
  }).join('')
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(title)}">
  <text x="${L}" y="16" ${FONT}font-size="12" font-weight="700" fill="#111827">${esc(title)}</text>
  <line x1="${L}" y1="${y(0)}" x2="${W - R}" y2="${y(0)}" stroke="#d1d5db" stroke-width="1"/>
  ${bars}
  <text x="${L}" y="${H - 14}" ${FONT}font-size="9.5" fill="#9ca3af">Sequential attribution — effects sum to the total by construction.</text></svg>`
}

/** Adoption S-curve with the statutory mandate floor shaded where one exists. */
export function svgSCurve(years: number[], shares: number[], floors: (number | null)[], title: string): string {
  const W = 760, H = 240, L = 46, R = 20, T = 30, B = 34
  const y = (v: number) => T + (H - T - B) * (1 - v / 100)
  const x = (i: number) => L + (W - L - R) * (years.length <= 1 ? 0.5 : i / (years.length - 1))
  const hasFloor = floors.some((f) => f != null)
  const floorArea = hasFloor
    ? `<polygon fill="rgba(224,161,0,0.12)" points="${floors.map((f, i) => `${x(i).toFixed(1)},${y(f ?? 0).toFixed(1)}`).join(' ')} ${x(years.length - 1).toFixed(1)},${y(0)} ${x(0).toFixed(1)},${y(0)}"/>
       <polyline fill="none" stroke="#E0A100" stroke-width="1.5" stroke-dasharray="5 4" points="${floors.map((f, i) => `${x(i).toFixed(1)},${y(f ?? 0).toFixed(1)}`).join(' ')}"/>`
    : ''
  const grid = [0, 25, 50, 75, 100].map((v) =>
    `<line x1="${L}" y1="${y(v)}" x2="${W - R}" y2="${y(v)}" stroke="#eef0f2" stroke-width="1"/><text x="${L - 6}" y="${y(v) + 3.5}" ${FONT}font-size="9.5" fill="#9ca3af" text-anchor="end">${v}%</text>`).join('')
  const dots = shares.map((s, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(s).toFixed(1)}" r="3" fill="#0E9F6E"/><text x="${x(i).toFixed(1)}" y="${(y(s) - 8).toFixed(1)}" ${FONT}font-size="9.5" font-weight="700" fill="#0E7A4E" text-anchor="middle">${Math.round(s)}%</text>`).join('')
  const xLabels = years.map((yr, i) => `<text x="${x(i)}" y="${H - 12}" ${FONT}font-size="10" fill="#9ca3af" text-anchor="middle">${yr}</text>`).join('')
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(title)}">
  <text x="${L}" y="16" ${FONT}font-size="12" font-weight="700" fill="#111827">${esc(title)}</text>
  ${hasFloor ? `<text x="${W - R}" y="16" ${FONT}font-size="9.5" fill="#B78400" text-anchor="end">shaded = statutory mandate floor</text>` : ''}
  ${grid}${floorArea}
  <polyline fill="none" stroke="#0E9F6E" stroke-width="2.5" points="${shares.map((s, i) => `${x(i).toFixed(1)},${y(s).toFixed(1)}`).join(' ')}"/>
  ${dots}${xLabels}</svg>`
}
