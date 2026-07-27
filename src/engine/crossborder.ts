// ───────────────────────────────────────────────────────────────────────────
// CROSS-BORDER TRUTH ENGINE — one catalogue, every regime.
//
// Takes a product catalogue (a set of Vehicles) and evaluates it against EVERY
// regime rule pack: fleet fuel-use / CO₂ vs the statutory limit, the gap, the
// fine exposure, the zero-emission share, and the ZE share that would clear the
// line. It is the deterministic core of the Compliance Co-pilot — the LLM may
// narrate the result, but every number here comes straight from the shared
// engine. Nothing is invented.
//
// Each regime measures on its own basis (EU WLTP gCO₂/km, India MIDC L/100km,
// China CAFC WLTC L/100km …). We evaluate the catalogue's DECLARED figures under
// each pack's formula and surface the cycle, so a cross-border verdict is honest
// about what it assumes rather than silently converting between cycles.
// ───────────────────────────────────────────────────────────────────────────
import type { CountryId, LimitContext, RulePack, Scenario, Vehicle } from './types.js'
import { PACK_LIST, RULE_PACKS } from './rulepacks/index.js'
import { buildTree, fmtInt, fmtMoney, fmtNum } from './engine.js'

/** A neutral "as-declared" scenario for a pack — no levers, statutory credits. */
function neutral(pack: RulePack, year: number): Scenario {
  return {
    year,
    evSharePct: null,
    salesMultiplier: 1,
    massShiftKg: 0,
    ecoBoostG: 0,
    poolingEnabled: false,
    superCreditsEnabled: pack.id === 'IN' || pack.id === 'CN',
    mix: null,
    phevUF: true,
    creditPrice: null,
  }
}

export interface Offender {
  model: string
  powertrain: string
  metric: number
  limit: number
  over: number
}

export interface RegimeVerdict {
  country: CountryId
  packName: string
  flag: string
  currency: string
  metricUnit: string
  metricLabel: string
  year: number
  regimeName: string
  draft: boolean
  cycle: string
  avgMetric: number
  limit: number
  gap: number // avgMetric − limit; over the line when > 0
  headroom: number // limit − avgMetric when compliant (≥ 0)
  fine: number
  fineExpression: string
  units: number
  zeShare: number // 0..1
  reqZe: number | null // ZE share needed to clear; null = infeasible even at 95%
  compliant: boolean
  offenders: Offender[]
}

export interface CrossBorderResult {
  verdicts: RegimeVerdict[]
  productN: number
  totalUnits: number
  passCount: number
  failCount: number
  totalExposure: number // Σ fines across the regimes checked (worst-case, all markets)
  worst: RegimeVerdict | null // highest relative exceedance
  best: RegimeVerdict | null // biggest headroom / cleanest pass
}

/** Evaluate one catalogue against one regime. */
function checkRegime(vehicles: Vehicle[], pack: RulePack): RegimeVerdict {
  const year = pack.defaultYear ?? pack.years[pack.years.length - 1]
  const sc = neutral(pack, year)
  // Treat the catalogue as the regime's mainstream passenger class so every
  // market judges the same cars against its own passenger-car curve.
  const fleet = vehicles.map((v) => ({ ...v, vclass: pack.classes[0], year }))
  const root = buildTree(fleet, pack, sc)

  // ZE glide: the zero-emission share that would just clear the line.
  let reqZe: number | null = null
  if (root.gap > 0) {
    for (let s = 0; s <= 95; s += 1) {
      if (buildTree(fleet, pack, { ...sc, evSharePct: s }).gap <= 0.0001) { reqZe = s; break }
    }
  } else reqZe = 0

  // Per-product offenders — each car's own metric vs the limit at its mass.
  const offenders: Offender[] = fleet
    .map((v) => {
      const metric = pack.vehicleMetric(v, sc)
      const ctx: LimitContext = { year, avgMass: v.mass, zlevShare: 0, vclass: v.vclass, scenario: sc }
      const limit = pack.limit(ctx)
      return { model: v.model || v.variant || '—', powertrain: v.powertrain || '—', metric, limit, over: metric - limit }
    })
    .filter((o) => o.over > 0.05)
    .sort((a, b) => b.over - a.over)
    .slice(0, 4)

  const regime = pack.regimeFor?.(year) ?? { name: pack.name, draft: false, cycle: pack.metricUnit }
  return {
    country: pack.id,
    packName: pack.name,
    flag: pack.flag,
    currency: pack.currency,
    metricUnit: pack.metricUnit,
    metricLabel: pack.metricLabel,
    year,
    regimeName: regime.name,
    draft: !!regime.draft,
    cycle: regime.cycle ?? pack.metricUnit,
    avgMetric: root.avgMetric,
    limit: root.limit,
    gap: root.gap,
    headroom: Math.max(0, root.limit - root.avgMetric),
    fine: root.fine,
    fineExpression: root.fineMath.expression,
    units: root.rawUnits,
    zeShare: root.zlevShare,
    reqZe,
    compliant: root.gap <= 0,
    offenders,
  }
}

/** Run a catalogue across every regime (or a chosen subset). */
export function crossBorderCheck(vehicles: Vehicle[], countries?: CountryId[]): CrossBorderResult {
  const packs = countries?.length ? countries.map((c) => RULE_PACKS[c]) : PACK_LIST
  const verdicts = packs.map((p) => checkRegime(vehicles, p))
  const fails = verdicts.filter((v) => !v.compliant)
  const worst = fails.slice().sort((a, b) => b.gap / (b.limit || 1) - a.gap / (a.limit || 1))[0] ?? null
  const passes = verdicts.filter((v) => v.compliant)
  const best = passes.slice().sort((a, b) => b.headroom / (b.limit || 1) - a.headroom / (a.limit || 1))[0] ?? null
  return {
    verdicts,
    productN: vehicles.length,
    totalUnits: vehicles.reduce((a, v) => a + (v.sales || 0), 0),
    passCount: passes.length,
    failCount: fails.length,
    totalExposure: verdicts.reduce((a, v) => a + v.fine, 0),
    worst,
    best,
  }
}

// ── printable cross-border compliance report (fed to openPrintReport) ────────
export function crossBorderReportHtml(result: CrossBorderResult, name: string, dateISO: string): string {
  const rows = result.verdicts
    .map((v) => {
      const cls = v.compliant ? 'under' : 'over'
      const verdict = v.compliant ? 'Compliant' : 'Over the line'
      return `<tr>
        <td><strong>${v.packName}</strong><div style="color:#9ca3af;font-size:11px">${v.regimeName}${v.draft ? ' · draft' : ''} · ${v.cycle} · FY${v.year}</div></td>
        <td style="text-align:right">${fmtNum(v.avgMetric, 1)} ${v.metricUnit}</td>
        <td style="text-align:right">${fmtNum(v.limit, 1)} ${v.metricUnit}</td>
        <td style="text-align:right" class="${cls}">${v.gap > 0 ? '+' : ''}${fmtNum(v.gap, 1)}</td>
        <td style="text-align:right">${Math.round(v.zeShare * 100)}%</td>
        <td style="text-align:right" class="${v.fine > 0 ? 'over' : 'under'}">${v.fine > 0 ? fmtMoney(v.fine, v.currency) : '—'}</td>
        <td class="${cls}">${verdict}</td>
      </tr>`
    })
    .join('')
  const detail = result.verdicts
    .filter((v) => !v.compliant && v.offenders.length)
    .map(
      (v) => `<h2>${v.packName} — what's driving the exceedance</h2>
      <table><thead><tr><th>Product</th><th>Powertrain</th><th style="text-align:right">${v.metricLabel}</th><th style="text-align:right">Limit</th><th style="text-align:right">Over</th></tr></thead><tbody>
      ${v.offenders.map((o) => `<tr><td>${o.model}</td><td>${o.powertrain}</td><td style="text-align:right">${fmtNum(o.metric, 1)}</td><td style="text-align:right">${fmtNum(o.limit, 1)}</td><td style="text-align:right" class="over">+${fmtNum(o.over, 1)} ${v.metricUnit}</td></tr>`).join('')}
      </tbody></table>
      ${v.reqZe != null ? `<p class="sub">Clears at a <strong>${v.reqZe}%</strong> zero-emission share (today ${Math.round(v.zeShare * 100)}%).</p>` : `<p class="sub">Electrification alone can't clear this line — needs lighter models, credits or pooling.</p>`}`,
    )
    .join('')

  return `
  <div class="head"><span class="brand">&#9650; AiRE</span><div><h1>Cross-border compliance report</h1>
    <div class="sub">${name} · ${result.productN} products · ${fmtInt(result.totalUnits)} units · ${result.verdicts.length} regimes · generated ${dateISO}</div></div></div>

  <h2>Verdict</h2>
  <div class="big ${result.failCount ? 'over' : 'under'}">${result.passCount}/${result.verdicts.length} markets clear${result.failCount ? ` · ${result.failCount} over the line` : ''}</div>
  <div class="row"><span class="k">Products checked</span><span class="v">${result.productN} · ${fmtInt(result.totalUnits)} units</span></div>
  ${result.worst ? `<div class="row"><span class="k">Largest single-market fine</span><span class="v over">${fmtMoney(result.worst.fine, result.worst.currency)} · ${result.worst.packName}</span></div>` : ''}
  <p class="sub">Fines are shown per market in each regime's own currency — see the matrix. They are not summed across currencies.</p>

  <h2>Regime matrix</h2>
  <table><thead><tr><th>Market · regime</th><th style="text-align:right">Fleet</th><th style="text-align:right">Limit</th><th style="text-align:right">Gap</th><th style="text-align:right">ZE</th><th style="text-align:right">Fine</th><th>Verdict</th></tr></thead><tbody>${rows}</tbody></table>

  ${detail}

  <div class="foot">AiRE Compliance Co-pilot · every figure computed by the shared compliance engine — nothing estimated. Each market is evaluated under its own rule pack on the catalogue's declared test figures; cycle conversion between regimes (WLTP ↔ MIDC ↔ CAFC) is not applied and is a stated assumption. Draft regimes (marked) can still change before notification.</div>`
}
