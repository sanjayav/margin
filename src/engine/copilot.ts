// ───────────────────────────────────────────────────────────────────────────
// COMPLIANCE CO-PILOT — the agentic layer, kept honest by the engine.
//
// A deterministic MONITOR scans the market's position (via the tool layer),
// detects signals (breach, tightening cliff, thin headroom, surplus), and turns
// each into a FINDING: a headline, grounded prose, engine-computed metrics
// (each traceable to the tool that produced it), costed options, and a
// recommendation. No number is invented — every metric carries the tool +
// inputs that produced it, so the whole finding is re-runnable and auditable.
// An LLM narrative layer (api/copilot) can polish the prose; it never changes a
// number. This module is pure and runs everywhere (no key, no network).
// ───────────────────────────────────────────────────────────────────────────
import { getPack } from './rulepacks'
import { fmtInt, fmtNum, fmtMoney } from './engine'
import { getPosition, cheapestPath, dualCreditPosition, type Provenance } from './tools'
import type { CountryId } from './types'

export type Severity = 'critical' | 'high' | 'watch' | 'clear'
const RANK: Record<Severity, number> = { critical: 0, high: 1, watch: 2, clear: 3 }

/** A single traceable number — the tool + inputs that produced it. */
export interface Metric { label: string; value: string; tool: string; inputs: Record<string, unknown> }
export interface Option { title: string; detail: string; action?: FindingAction }
/** What the user can approve a finding into. */
export interface FindingAction { kind: 'model' | 'draft' | 'creditbook'; maker?: string; year: number; scenario?: Record<string, unknown> }
export interface Finding {
  id: string
  country: CountryId
  maker?: string
  year: number
  severity: Severity
  category: string           // 'Breach' · 'Transition cliff' · 'Headroom' · 'Opportunity' · 'Market'
  headline: string
  situation: string
  why: string
  metrics: Metric[]
  options: Option[]
  recommendation: string
  provenance: Provenance
}

const fy = (country: CountryId, y: number) => (country === 'IN' ? `FY${String(y).slice(2)}–${String(y + 1).slice(2)}` : `${y}`)

/** The whole agentic scan for one market — deterministic, engine-grounded. */
export function runCoPilot(country: CountryId): Finding[] {
  const pack = getPack(country)
  const year = pack.defaultYear ?? pack.years[0]
  const lastYear = pack.years[pack.years.length - 1]
  const unit = pack.metricUnit, cur = pack.currency
  const pos = getPosition(country, year).value
  const out: Finding[] = []

  const posMetric = (label: string, value: string): Metric => ({ label, value, tool: 'get_position', inputs: { country, year } })
  const over = [...pos.makers].filter((m) => m.over).sort((a, b) => b.fine - a.fine)
  const topFine = over[0]?.fine ?? 0

  // ── per-maker breach findings ──────────────────────────────────────────────
  over.slice(0, 5).forEach((m, i) => {
    const route = cheapestPath(country, m.name, year).value
    const sev: Severity = i === 0 && over.length > 0 ? 'critical' : 'high'
    const short = m.name.split(' ').slice(0, 2).join(' ')
    const opts: Option[] = []
    if (route.cheapest) opts.push({ title: `${route.cheapest.title}`, detail: `${fmtMoney(route.cheapest.cost, cur)} — cheapest first step to clear`, action: { kind: 'model', maker: m.name, year } })
    if (pack.creditPrice != null) opts.push({ title: 'Buy credits', detail: `cover the ${fmtNum(m.gap, 2)} ${unit} gap at the traded price`, action: { kind: 'creditbook', maker: m.name, year } })
    opts.push({ title: 'Draft board note', detail: 'export the maker report with the working', action: { kind: 'draft', maker: m.name, year } })
    out.push({
      id: `${country}:breach:${m.name}:${year}`, country, maker: m.name, year, severity: sev, category: 'Breach',
      headline: `${short} breaches ${fy(country, year)} — ${fmtMoney(m.fine, cur)} at risk`,
      situation: `${short} is ${fmtNum(m.gap, 2)} ${unit} over its ${fmtNum(m.limit, 2)} target across ${fmtInt(m.units)} units, exposing ${fmtMoney(m.fine, cur)}.`,
      why: `The fleet number sits above the mass-linked target; without a change the statutory penalty applies on every registration.`,
      metrics: [
        posMetric('Gap to target', `+${fmtNum(m.gap, 2)} ${unit}`),
        posMetric('Exposure', fmtMoney(m.fine, cur)),
        ...(route.cheapest ? [{ label: 'Cheapest fix', value: fmtMoney(route.cheapest.cost, cur), tool: 'cheapest_path', inputs: { country, maker: m.name, year } } as Metric] : []),
      ],
      options: opts,
      recommendation: route.cheapest ? `${route.cheapest.title} is the cheapest route — ${fmtMoney(route.cheapest.cost, cur)} vs ${fmtMoney(m.fine, cur)} exposure. Model it, then provision the residual.` : `No fleet lever clears it alone — buy credits or provision ${fmtMoney(m.fine, cur)}.`,
      provenance: pos ? getPosition(country, year).provenance : ({} as Provenance),
    })
  })

  // ── tightening cliff: makers clear now but caught by the horizon ────────────
  const posLast = getPosition(country, lastYear).value
  const caught = posLast.makers.filter((m) => m.over && !pos.makers.find((x) => x.name === m.name)?.over)
  if (caught.length) {
    out.push({
      id: `${country}:cliff:${lastYear}`, country, year: lastYear, severity: 'high', category: 'Transition cliff',
      headline: `${caught.length} maker${caught.length === 1 ? '' : 's'} caught as the target tightens to ${fy(country, lastYear)}`,
      situation: `${caught.map((m) => m.name.split(' ')[0]).join(', ')} clear${caught.length === 1 ? 's' : ''} ${fy(country, year)} but breach${caught.length === 1 ? 'es' : ''} by ${fy(country, lastYear)} as the limit falls to ${fmtNum(posLast.limit, 2)} ${unit}.`,
      why: `The target tightens faster than today's fleet mix improves — a plan set now avoids a scramble later.`,
      metrics: [
        { label: `Limit ${fy(country, year)} → ${fy(country, lastYear)}`, value: `${fmtNum(pos.limit, 2)} → ${fmtNum(posLast.limit, 2)}`, tool: 'get_position', inputs: { country, year: lastYear } },
        { label: 'Newly over', value: `${caught.length} maker${caught.length === 1 ? '' : 's'}`, tool: 'get_position', inputs: { country, year: lastYear } },
      ],
      options: [{ title: 'Model the horizon', detail: 'run the adoption path in Forecast', action: { kind: 'model', year: lastYear } }],
      recommendation: `Bring electrification or lightweighting forward — clearing the ${fy(country, lastYear)} target from a ${fy(country, year)} base is cheaper than a late correction.`,
      provenance: posLast ? getPosition(country, lastYear).provenance : ({} as Provenance),
    })
  }

  // ── India · MIDC→WLTP cycle cliff ───────────────────────────────────────────
  if (country === 'IN') {
    const wltp = getPosition(country, year, { cycleWltp: true }).value
    const flip = wltp.makers.filter((m) => m.over && !pos.makers.find((x) => x.name === m.name)?.over).length
    out.push({
      id: `${country}:wltp:${year}`, country, year, severity: flip > 0 ? 'high' : 'watch', category: 'Transition cliff',
      headline: `MIDC→WLTP lifts the fleet number ~18% at ${fy(country, year)}`,
      situation: `On WLTP the fleet reads ${fmtNum(wltp.avgMetric, 2)} ${unit} vs ${fmtNum(pos.avgMetric, 2)} on MIDC — the CAFE III cycle change, with the conversion factor still to be notified.`,
      why: flip > 0 ? `${flip} maker(s) flip clear→breach purely from the cycle change.` : `No maker flips today, but the cliff erases the headroom of makers still clear.`,
      metrics: [
        { label: 'Fleet MIDC → WLTP', value: `${fmtNum(pos.avgMetric, 2)} → ${fmtNum(wltp.avgMetric, 2)}`, tool: 'get_position', inputs: { country, year, ov: { cycleWltp: true } } },
        { label: 'Makers flipped', value: `${flip}`, tool: 'get_position', inputs: { country, year, ov: { cycleWltp: true } } },
      ],
      options: [{ title: 'Open India intelligence', detail: 'the full cycle-conversion read', action: { kind: 'model', year } }],
      recommendation: `Stress every plan on WLTP — a maker comfortable on MIDC can breach on the transition basis.`,
      provenance: getPosition(country, year, { cycleWltp: true }).provenance,
    })
  }

  // ── China · dual-credit summary (the real two-axis position) ────────────────
  if (country === 'CN') {
    const dc = dualCreditPosition(country, year).value
    out.push({
      id: `${country}:dualcredit:${year}`, country, year, severity: dc.creditsToBuy > 0.5 ? 'high' : 'clear', category: 'Dual-credit',
      headline: `${dc.over} of ${dc.makers} makers must buy credits · ${fmtMoney(dc.cost, cur)}`,
      situation: `China scores both axes: fuel-economy (CAFC ${dc.cafcCredit >= 0 ? '+' : ''}${fmtInt(dc.cafcCredit)}) and EV-volume (NEV ${dc.nevBalance >= 0 ? '+' : ''}${fmtInt(dc.nevBalance)}). ${dc.over} entities are short after self-offset.`,
      why: `A CAFC deficit clears with own NEV surplus first; only the residual, plus any NEV deficit, must be bought.`,
      metrics: [
        { label: 'Credits to buy', value: fmtInt(dc.creditsToBuy), tool: 'dual_credit', inputs: { country, year } },
        { label: 'Cost to clear', value: fmtMoney(dc.cost, cur), tool: 'dual_credit', inputs: { country, year } },
        { label: 'Battery demand', value: `${fmtNum(dc.batteryGWh, 0)} GWh`, tool: 'dual_credit', inputs: { country, year } },
      ],
      options: [{ title: 'Open the Credit book', detail: 'the full two-axis ledger & offsets', action: { kind: 'creditbook', year } }],
      recommendation: `Clear NEV deficits on the market and offset CAFC with own surplus — the Credit book shows the cheapest order per entity.`,
      provenance: dualCreditPosition(country, year).provenance,
    })
  }

  // ── opportunity: the biggest surplus, if credits trade ──────────────────────
  if (pack.creditPrice != null) {
    const surplus = [...pos.makers].filter((m) => !m.over && m.gap < -0.15).sort((a, b) => a.gap - b.gap)[0]
    if (surplus) {
      const value = Math.abs(surplus.gap) * (pack.creditPrice ?? 0) * surplus.units
      out.push({
        id: `${country}:surplus:${surplus.name}:${year}`, country, maker: surplus.name, year, severity: 'clear', category: 'Opportunity',
        headline: `${surplus.name.split(' ').slice(0, 2).join(' ')} holds headroom worth ≈ ${fmtMoney(value, cur)}`,
        situation: `${surplus.name.split(' ')[0]} sits ${fmtNum(Math.abs(surplus.gap), 2)} ${unit} under target across ${fmtInt(surplus.units)} units — bankable or sellable surplus.`,
        why: `Over-compliance carries value where credits trade; unused headroom is money on the table.`,
        metrics: [
          posMetric('Headroom', `${fmtNum(Math.abs(surplus.gap), 2)} ${unit}`),
          posMetric('Est. credit value', fmtMoney(value, cur)),
        ],
        options: [{ title: 'Open the Credit book', detail: 'bank or list the surplus', action: { kind: 'creditbook', maker: surplus.name, year } }],
        recommendation: `Bank the surplus for a tighter year or sell it — either monetises headroom that otherwise expires.`,
        provenance: getPosition(country, year).provenance,
      })
    }
  }

  // ── market summary (always) ─────────────────────────────────────────────────
  out.unshift({
    id: `${country}:market:${year}`, country, year, severity: pos.over > 0 ? (topFine > 0 ? 'high' : 'watch') : 'clear', category: 'Market',
    headline: pos.over > 0 ? `${pos.over} of ${pos.makers.length} makers over the line · ${fmtMoney(pos.marketFine, cur)} at risk` : `All ${pos.makers.length} makers clear at ${fy(country, year)}`,
    situation: `Market fleet ${fmtNum(pos.avgMetric, 2)} vs a ${fmtNum(pos.limit, 2)} ${unit} target. ${pos.over > 0 ? `${pos.over} maker${pos.over === 1 ? '' : 's'} exposed.` : 'No penalty applies at today’s mix.'}`,
    why: `The market average is often under the line even when individual makers breach — exposure is per maker, not the mean.`,
    metrics: [posMetric('Fleet vs target', `${fmtNum(pos.avgMetric, 2)} / ${fmtNum(pos.limit, 2)}`), posMetric('Total exposure', fmtMoney(pos.marketFine, cur)), posMetric('Makers over', `${pos.over} / ${pos.makers.length}`)],
    options: [{ title: 'Open the Plan', detail: 'the book of record', action: { kind: 'model', year } }],
    recommendation: pos.over > 0 ? `Work the breaches below — each carries a costed cheapest route.` : `Position is clear; watch the tightening horizon and surplus opportunities.`,
    provenance: getPosition(country, year).provenance,
  })

  return out.sort((a, b) => RANK[a.severity] - RANK[b.severity])
}

/** Compact input for the optional LLM narrative layer (never changes a number). */
export function findingForLLM(f: Finding) {
  return { headline: f.headline, category: f.category, maker: f.maker, year: f.year, severity: f.severity, metrics: f.metrics.map((m) => `${m.label}: ${m.value}`), recommendation: f.recommendation }
}
