import type { Aggregate, RulePack, Scenario } from '../engine/types'
import type { Plan } from '../engine/recommend'
import type { FleetMeta } from '../data/fleet'
import { fmtInt, fmtMoney, fmtNum } from '../engine/engine'

const CSS = `
* { box-sizing: border-box; }
body { font: 14px/1.5 -apple-system, system-ui, sans-serif; color: #1a2230; margin: 0; padding: 40px; background: #fff; }
h1 { font-size: 22px; margin: 0; }
h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .08em; color: #6b7280; margin: 28px 0 10px; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }
.sub { color: #6b7280; font-size: 12px; margin-top: 4px; }
.row { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #f1f3f5; }
.k { color: #6b7280; } .v { font-weight: 600; font-variant-numeric: tabular-nums; }
.big { font-size: 30px; font-weight: 800; font-variant-numeric: tabular-nums; }
.over { color: #d6336c; } .under { color: #0ca678; }
.maths { background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 8px; padding: 12px; font-family: ui-monospace, monospace; font-size: 13px; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th { text-align: left; color: #6b7280; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; border-bottom: 1px solid #e5e7eb; padding: 6px 8px; }
td { padding: 6px 8px; border-bottom: 1px solid #f1f3f5; font-variant-numeric: tabular-nums; }
.brand { display: inline-flex; align-items: center; gap: 7px; font-weight: 900; font-size: 22px; letter-spacing: -0.02em; color: #E8223B; }
.head { display: flex; align-items: center; gap: 12px; }
.foot { margin-top: 36px; color: #9ca3af; font-size: 11px; border-top: 1px solid #e5e7eb; padding-top: 12px; }
@media print { body { padding: 24px; } }
`

export function buildMakerReport(agg: Aggregate, pack: RulePack, s: Scenario, meta: FleetMeta, plan: Plan, dateISO: string): string {
  const over = agg.gap > 0
  const refreshed = meta.lastRefreshed ? new Date(meta.lastRefreshed).toISOString().slice(0, 10) : '—'
  const planRows = plan.actions
    .map((a, i) => `<tr><td>${i + 1}</td><td>${a.title}</td><td>${a.difficulty}</td><td style="text-align:right">${fmtMoney(a.cost, pack.currency)}</td><td style="text-align:right">${fmtMoney(a.fineAvoided, pack.currency)}</td></tr>`)
    .join('')
  return `
  <div class="head"><span class="brand">&#9650; AiRE</span><div><h1>AiRE — Compliance Report</h1>
    <div class="sub">${pack.name} · ${agg.label} · compliance year ${s.year} · generated ${dateISO}</div></div></div>

  <h2>Position</h2>
  <div class="big ${over ? 'over' : 'under'}">${over ? '+' : ''}${fmtNum(agg.gap, 1)} ${pack.metricUnit} <span style="font-size:14px;font-weight:500;color:#6b7280">${over ? 'over the limit' : 'under the limit'}</span></div>
  <div class="row"><span class="k">Fleet emissions (sales-weighted)</span><span class="v">${fmtNum(agg.avgMetric, 1)} ${pack.metricUnit}</span></div>
  <div class="row"><span class="k">Legal limit</span><span class="v">${fmtNum(agg.limit, 1)} ${pack.metricUnit}</span></div>
  <div class="row"><span class="k">Registrations</span><span class="v">${fmtInt(agg.rawUnits)}</span></div>
  <div class="row"><span class="k">Zero-emission share</span><span class="v">${Math.round(agg.zlevShare * 100)}%</span></div>

  <h2>Projected fine</h2>
  <div class="big ${agg.fine > 0 ? 'over' : 'under'}">${fmtMoney(agg.fine, pack.currency)}</div>
  <div class="maths">${agg.fineMath.expression}</div>

  ${plan.before.gap > 0 ? `<h2>Recommended path under the line</h2>
  <p class="sub">Cheapest realistic plan — total cost ${fmtMoney(plan.totalCost, pack.currency)}; ${plan.cleared ? 'clears the limit' : `reduces the fine to ${fmtMoney(plan.fineAfter, pack.currency)}`}.</p>
  <table><thead><tr><th>#</th><th>Action</th><th>Difficulty</th><th style="text-align:right">Cost</th><th style="text-align:right">Fine avoided</th></tr></thead><tbody>${planRows}</tbody></table>` : ''}

  <h2>Data provenance</h2>
  <div class="row"><span class="k">Source</span><span class="v">${meta.source}</span></div>
  <div class="row"><span class="k">Dataset version</span><span class="v">${meta.datasetVersion}</span></div>
  <div class="row"><span class="k">Refreshed</span><span class="v">${refreshed}</span></div>
  <div class="row"><span class="k">Rule pack</span><span class="v">${pack.limitNote}</span></div>
  <div class="row"><span class="k">Fine rate</span><span class="v">${pack.fineRateLabel}</span></div>

  <div class="foot">AiRE · figures computed by the shared compliance engine from official-source data. Pinned to dataset version ${meta.datasetVersion}. Illustrative where noted in the rule pack.</div>`
}

export function openPrintReport(title: string, bodyHtml: string) {
  const w = window.open('', '_blank', 'width=920,height=1000')
  if (!w) { alert('Allow pop-ups to export the report.'); return }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${CSS}</style></head><body>${bodyHtml}<script>window.onload=function(){setTimeout(function(){window.print()},350)}<\/script></body></html>`)
  w.document.close()
}

// ── the Forecast board pack — the Big-4-style deliverable, engine-computed ───
export interface PackCaseRow { name: string; blurb: string; weight: number; cum: number; breachYear: number | null; lastGap: number }
export interface PackDriverRow { label: string; value: number; unit: string; status: string; rationale: string; source: string; owner: string }
export interface PackBridge { year: number; from: number; to: number; effects: { label: string; delta: number }[] }
export interface ForecastPackInput {
  pack: RulePack
  meta: FleetMeta
  dateISO: string
  targetLabel: string
  horizon: [number, number]
  baseYear: number
  cases: PackCaseRow[]
  expected: number
  drivers: PackDriverRow[]
  bridge: PackBridge | null
  breakEven: number | null
  finalYear: number
  /** Pre-rendered SVG strings (lib/packcharts) — the deck's graphics. */
  charts?: { fan?: string; waterfall?: string; sCurve?: string }
}

export function buildForecastPack(i: ForecastPackInput): string {
  const { pack } = i
  const refreshed = i.meta.lastRefreshed ? new Date(i.meta.lastRefreshed).toISOString().slice(0, 10) : '—'
  const caseRows = i.cases.map((c) => `<tr><td><b>${c.name}</b><div class="sub">${c.blurb}</div></td><td style="text-align:right">${Math.round(c.weight * 100)}%</td><td style="text-align:right">${fmtMoney(c.cum, pack.currency)}</td><td style="text-align:right">${c.breachYear ?? 'clears'}</td><td style="text-align:right">${c.lastGap > 0 ? '+' : ''}${fmtNum(c.lastGap, 1)} ${pack.metricUnit}</td></tr>`).join('')
  const driverRows = i.drivers.map((d) => `<tr><td><b>${d.label}</b></td><td style="text-align:right">${fmtNum(d.value, 2)} ${d.unit}</td><td>${d.status}</td><td>${d.owner}</td><td class="sub">${d.rationale}<br/><i>${d.source}</i></td></tr>`).join('')
  const bridgeRows = i.bridge ? i.bridge.effects.map((e) => `<tr><td>${e.label}</td><td style="text-align:right;color:${e.delta > 0 ? '#B3261E' : '#0E7A4E'}">${e.delta >= 0 ? '+' : '−'}${fmtMoney(Math.abs(e.delta), pack.currency)}</td></tr>`).join('') : ''
  const worst = [...i.cases].sort((a, b) => b.cum - a.cum)[0]
  const best = [...i.cases].sort((a, b) => a.cum - b.cum)[0]

  return `
  <div class="head"><span class="brand">&#9650; AiRE</span><div><h1>AiRE — Forecast Board Pack</h1>
    <div class="sub">${pack.name} · ${i.targetLabel} · horizon ${i.horizon[0]}–${i.horizon[1]} · generated ${i.dateISO}</div></div></div>

  <h2>Executive summary</h2>
  <div class="row"><span class="k">Probability-weighted expected exposure (${i.horizon[0]}–${i.horizon[1]})</span><span class="v"><b>${fmtMoney(i.expected, pack.currency)}</b></span></div>
  <div class="row"><span class="k">Range across cases</span><span class="v">${fmtMoney(best.cum, pack.currency)} (${best.name}) → ${fmtMoney(worst.cum, pack.currency)} (${worst.name})</span></div>
  ${i.breakEven != null ? `<div class="row"><span class="k">Break-even electrification</span><span class="v">${fmtNum(i.breakEven, 1)}% ZE share at horizon zeroes the ${i.finalYear} fine</span></div>` : `<div class="row"><span class="k">Break-even electrification</span><span class="v">electrification alone cannot zero the ${i.finalYear} fine</span></div>`}
  <div class="row"><span class="k">Seeded from</span><span class="v">${i.baseYear} actuals · dataset v${i.meta.datasetVersion} · refreshed ${refreshed}</span></div>

  ${i.charts?.fan ? `<div style="margin:14px 0">${i.charts.fan}</div>` : ''}

  <h2>Case matrix</h2>
  <table><thead><tr><th>Case</th><th style="text-align:right">Weight</th><th style="text-align:right">Cumulative fine</th><th style="text-align:right">First breach</th><th style="text-align:right">Final-year gap</th></tr></thead><tbody>${caseRows}</tbody></table>

  ${i.bridge ? `<h2>Fine bridge · ${i.bridge.year - 1} → ${i.bridge.year} (base case, market)</h2>
  <div class="row"><span class="k">${i.bridge.year - 1} market fine</span><span class="v">${fmtMoney(i.bridge.from, pack.currency)}</span></div>
  <table><thead><tr><th>Effect</th><th style="text-align:right">Δ fine</th></tr></thead><tbody>${bridgeRows}</tbody></table>
  <div class="row"><span class="k">${i.bridge.year} market fine</span><span class="v">${fmtMoney(i.bridge.to, pack.currency)}</span></div>
  ${i.charts?.waterfall ? `<div style="margin:14px 0">${i.charts.waterfall}</div>` : ''}
  <p class="sub">Sequential attribution: regulation → volume → technology → zero-emission mix. Effects sum to the total.</p>` : ''}

  ${i.charts?.sCurve ? `<h2>Electrification path</h2><div style="margin:8px 0">${i.charts.sCurve}</div>` : ''}

  <h2>Assumption Book (appendix)</h2>
  <table><thead><tr><th>Driver</th><th style="text-align:right">Value</th><th>Status</th><th>Owner</th><th>Rationale · source</th></tr></thead><tbody>${driverRows}</tbody></table>
  <p class="sub">Makers hold share in the outlook; the statutory target path comes from the rule pack (${pack.source}) and is not an assumption.</p>

  <h2>Methodology & limitations</h2>
  <p class="sub">The outlook projects the ${i.baseYear} as-sold fleet: volumes grow at the market-growth driver, combustion CO₂ improves at the technology driver, mass drifts per the mass driver, and zero-emission share follows an S-curve to the horizon driver (floored by any statutory mandate). Compliance, credits and fines are computed by the same deterministic engine as every live screen — nothing in this pack is estimated outside the stated drivers. Cases are driver-sets; the Management case applies the named saved scenario on the base fundamentals. Limitations: makers hold market share; no new-entrant modelling; model-level launches enter via imported plans, not assumptions.</p>

  <div class="foot">AiRE · forecast board pack. Pinned to dataset version ${i.meta.datasetVersion}; regenerate after each data refresh. Illustrative where noted in the rule pack.</div>`
}
