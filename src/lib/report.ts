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
.brand { display: inline-grid; place-items: center; width: 30px; height: 30px; border-radius: 8px; background: #ED4709; color: #fff; font-weight: 900; }
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
  <div class="head"><span class="brand">A</span><div><h1>Autocred AI — Compliance Report</h1>
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

  <div class="foot">Autocred AI · figures computed by the shared compliance engine from official-source data. Pinned to dataset version ${meta.datasetVersion}. Illustrative where noted in the rule pack.</div>`
}

export function openPrintReport(title: string, bodyHtml: string) {
  const w = window.open('', '_blank', 'width=920,height=1000')
  if (!w) { alert('Allow pop-ups to export the report.'); return }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${CSS}</style></head><body>${bodyHtml}<script>window.onload=function(){setTimeout(function(){window.print()},350)}<\/script></body></html>`)
  w.document.close()
}
