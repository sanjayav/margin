// ───────────────────────────────────────────────────────────────────────────
// THE MONITOR — the co-pilot's deterministic half.
//
// Before anyone asks a question, this scans the market through the SAME tool
// layer the LLM uses and turns every signal into a FINDING: a headline, grounded
// prose, engine-computed metrics (each traceable to the tool + inputs that
// produced it), costed options, and a recommendation.
//
// Nothing here is invented and nothing here needs a network. The model can
// frame a finding (api/copilot · mode 'take'); it can never change a number.
// That split is what makes the co-pilot briefable to a board.
// ───────────────────────────────────────────────────────────────────────────
import { getPack } from './rulepacks/index.js'
import { fmtInt, fmtNum, fmtMoney } from './engine.js'
import {
  getPosition, cheapestPath, dualCreditPosition, creditLedger, dataQuality,
  assertEntitled, type Provenance, type ToolContext,
} from './tools.js'
import type { CountryId } from './types.js'

export type Severity = 'critical' | 'high' | 'watch' | 'clear'
const RANK: Record<Severity, number> = { critical: 0, high: 1, watch: 2, clear: 3 }

/** A single traceable number — the tool + inputs that produced it. */
export interface Metric { label: string; value: string; tool: string; inputs: Record<string, unknown> }
export interface Option { title: string; detail: string; action?: FindingAction }
/** What the user can approve a finding into. */
export interface FindingAction { kind: 'model' | 'draft' | 'creditbook' | 'pooling' | 'forecast' | 'data'; maker?: string; year: number; scenario?: Record<string, unknown> }

export interface Finding {
  id: string
  country: CountryId
  maker?: string
  year: number
  severity: Severity
  /** 'Breach' · 'Transition cliff' · 'Headroom' · 'Opportunity' · 'Market' ·
   *  'Dual-credit' · 'Data integrity' · 'Risk' */
  category: string
  headline: string
  situation: string
  why: string
  metrics: Metric[]
  options: Option[]
  recommendation: string
  provenance: Provenance
  /** The question that opens this finding in the conversation. */
  ask: string
}

const fy = (country: CountryId, y: number) => (country === 'IN' ? `FY${String(y).slice(2)}–${String(y + 1).slice(2)}` : `${y}`)
const short = (name: string) => name.split(' ').slice(0, 2).join(' ')

export interface ScanOptions {
  /** Widen the breach list from the top 3 to the top 6. Each entry runs the
   *  cheapest-path optimiser, so the console does the narrow scan on mount and
   *  widens it when the browser is idle — the rail paints immediately either way.
   *
   *  Deliberately absent: exposure simulation. A 300-draw Monte-Carlo over a
   *  market the size of the EU is ~12s of arithmetic, which is fine on a server
   *  and a frozen tab in a browser. Ask the co-pilot for it instead — it runs
   *  the same tool server-side and streams the answer back with its working. */
  deep?: boolean
}

/** The whole scan for one market — deterministic, engine-grounded, offline. */
export function runCoPilot(ctx: ToolContext, country: CountryId, opts: ScanOptions = {}): Finding[] {
  // The monitor reads the engine directly rather than through runTool, so it
  // asserts the same boundary the LLM path does. A market the workspace has not
  // subscribed to is never scanned, cached or shown.
  assertEntitled(ctx, country)
  const deep = opts.deep === true
  const pack = getPack(country)
  const year = pack.defaultYear ?? pack.years[0]
  const lastYear = pack.years[pack.years.length - 1]
  const unit = pack.metricUnit, cur = pack.currency
  const out: Finding[] = []

  const posR = getPosition(ctx, country, year)
  const pos = posR.value
  const makers = pos.perMaker ?? []
  const posMetric = (label: string, value: string): Metric => ({ label, value, tool: 'get_position', inputs: { country, year } })
  const over = makers.filter((m) => m.over).sort((a, b) => b.fine - a.fine)
  const topFine = over[0]?.fine ?? 0

  // ── market summary (always first) ─────────────────────────────────────────
  out.push({
    id: `${country}:market:${year}`, country, year,
    severity: pos.makersOver! > 0 ? (topFine > 0 ? 'high' : 'watch') : 'clear',
    category: 'Market',
    headline: pos.makersOver! > 0
      ? `${pos.makersOver} of ${pos.makers} makers over the line · ${fmtMoney(pos.marketFine!, cur)} at risk`
      : `All ${pos.makers} makers clear at ${fy(country, year)}`,
    situation: `Market fleet ${fmtNum(pos.avgMetric, 2)} against a ${fmtNum(pos.limit, 2)} ${unit} target across ${fmtInt(pos.registrations)} registrations. ${pos.makersOver! > 0 ? `${pos.makersOver} maker${pos.makersOver === 1 ? ' is' : 's are'} exposed.` : 'No penalty applies at today’s mix.'}`,
    why: 'The market average is routinely under the line while individual makers breach — exposure is assessed per maker, so the mean tells you nothing about the bill.',
    metrics: [
      posMetric('Fleet vs target', `${fmtNum(pos.avgMetric, 2)} / ${fmtNum(pos.limit, 2)} ${unit}`),
      posMetric('Total exposure', fmtMoney(pos.marketFine!, cur)),
      posMetric('Makers over', `${pos.makersOver} of ${pos.makers}`),
      posMetric('Zero-emission share', `${pos.zeroEmissionSharePct}%`),
    ],
    options: [{ title: 'Open the Plan', detail: 'the book of record for this year', action: { kind: 'model', year } }],
    recommendation: pos.makersOver! > 0
      ? 'Work the breaches below — each carries a costed cheapest route.'
      : 'Position is clear. Watch the tightening horizon and monetise the headroom.',
    provenance: posR.provenance,
    ask: `Brief me on ${pack.name} ${fy(country, year)}: who is over the line and what is the exposure?`,
  })

  // ── per-maker breaches ────────────────────────────────────────────────────
  over.slice(0, deep ? 6 : 3).forEach((m, i) => {
    const routeR = cheapestPath(ctx, country, m.name, year)
    const route = routeR.value
    const opts: Option[] = []
    if (route.cheapest) opts.push({ title: route.cheapest.title, detail: `${fmtMoney(route.cheapest.cost, cur)} — cheapest first step to clear`, action: { kind: 'model', maker: m.name, year } })
    if (pack.creditPrice != null) opts.push({ title: `Cover with ${pack.transfer.unit}s`, detail: `close the ${fmtNum(m.gap, 2)} ${unit} gap at the traded price`, action: { kind: 'creditbook', maker: m.name, year } })
    opts.push({ title: 'Draft the board note', detail: 'export the maker report with the full working', action: { kind: 'draft', maker: m.name, year } })
    out.push({
      id: `${country}:breach:${m.name}:${year}`, country, maker: m.name, year,
      severity: i === 0 ? 'critical' : 'high', category: 'Breach',
      headline: `${short(m.name)} breaches ${fy(country, year)} — ${fmtMoney(m.fine, cur)} at risk`,
      situation: `${short(m.name)} sits ${fmtNum(m.gap, 2)} ${unit} above its ${fmtNum(m.limit, 2)} target across ${fmtInt(m.units)} registrations, exposing ${fmtMoney(m.fine, cur)}.`,
      why: 'The fleet number is above the mass-linked target; without a change the statutory penalty applies to every registration.',
      metrics: [
        posMetric('Gap to target', `+${fmtNum(m.gap, 2)} ${unit}`),
        posMetric('Exposure', fmtMoney(m.fine, cur)),
        posMetric('Zero-emission share', `${m.zeroEmissionSharePct}%`),
        ...(route.cheapest ? [{ label: 'Cheapest fix', value: fmtMoney(route.cheapest.cost, cur), tool: 'cheapest_path', inputs: { country, maker: m.name, year } } as Metric] : []),
      ],
      options: opts,
      recommendation: route.cheapest
        ? `${route.cheapest.title} is the cheapest route — ${fmtMoney(route.cheapest.cost, cur)} against ${fmtMoney(m.fine, cur)} of exposure. Model it, then provision the residual.`
        : `No single fleet lever clears it. ${pack.transfer.kind === 'trade' ? `Buy ${pack.transfer.unit}s` : 'Find a pool partner'} or provision ${fmtMoney(m.fine, cur)}.`,
      provenance: routeR.provenance,
      ask: `Why is ${short(m.name)} over the line in ${fy(country, year)}, and what is the cheapest way to clear it?`,
    })
  })

  // ── tightening cliff: clear today, caught by the horizon ──────────────────
  if (lastYear !== year) {
    const lastR = getPosition(ctx, country, lastYear)
    const last = lastR.value
    const caught = (last.perMaker ?? []).filter((m) => m.over && !makers.find((x) => x.name === m.name)?.over)
    if (caught.length) {
      out.push({
        id: `${country}:cliff:${lastYear}`, country, year: lastYear, severity: 'high', category: 'Transition cliff',
        headline: `${caught.length} maker${caught.length === 1 ? '' : 's'} caught as the target tightens to ${fy(country, lastYear)}`,
        situation: `${caught.slice(0, 4).map((m) => m.name.split(' ')[0]).join(', ')} clear${caught.length === 1 ? 's' : ''} ${fy(country, year)} but breach${caught.length === 1 ? 'es' : ''} by ${fy(country, lastYear)} as the limit falls from ${fmtNum(pos.limit, 2)} to ${fmtNum(last.limit, 2)} ${unit}.`,
        why: 'The target tightens faster than today’s mix improves. A plan set now is materially cheaper than a late correction.',
        metrics: [
          { label: `Limit ${fy(country, year)} → ${fy(country, lastYear)}`, value: `${fmtNum(pos.limit, 2)} → ${fmtNum(last.limit, 2)} ${unit}`, tool: 'get_position', inputs: { country, year: lastYear } },
          { label: 'Newly over', value: `${caught.length} maker${caught.length === 1 ? '' : 's'}`, tool: 'get_position', inputs: { country, year: lastYear } },
          { label: 'Horizon exposure', value: fmtMoney(last.marketFine!, cur), tool: 'get_position', inputs: { country, year: lastYear } },
        ],
        options: [{ title: 'Run the horizon', detail: 'project the adoption path in Forecast', action: { kind: 'forecast', year: lastYear } }],
        recommendation: 'Bring electrification or lightweighting forward — clearing the horizon target from today’s base costs less than a scramble in the final year.',
        provenance: lastR.provenance,
        ask: `Forecast ${pack.name} to ${lastYear} — who gets caught as the target tightens, and what does it cost?`,
      })
    }
  }

  // ── India · MIDC→WLTP cycle cliff ─────────────────────────────────────────
  if (country === 'IN') {
    const wltpR = getPosition(ctx, country, year, null, { cycleWltp: true })
    const wltp = wltpR.value
    const flip = (wltp.perMaker ?? []).filter((m) => m.over && !makers.find((x) => x.name === m.name)?.over).length
    out.push({
      id: `${country}:wltp:${year}`, country, year, severity: flip > 0 ? 'high' : 'watch', category: 'Transition cliff',
      headline: `MIDC→WLTP lifts the fleet number ~18% at ${fy(country, year)}`,
      situation: `On WLTP the fleet reads ${fmtNum(wltp.avgMetric, 2)} ${unit} against ${fmtNum(pos.avgMetric, 2)} on MIDC — the CAFE III cycle change, with the conversion factor still to be notified.`,
      why: flip > 0
        ? `${flip} maker${flip === 1 ? '' : 's'} flip clear→breach on the cycle change alone, with no change to a single vehicle.`
        : 'No maker flips today, but the cliff erases the headroom of every maker still clear.',
      metrics: [
        { label: 'Fleet MIDC → WLTP', value: `${fmtNum(pos.avgMetric, 2)} → ${fmtNum(wltp.avgMetric, 2)} ${unit}`, tool: 'get_position', inputs: { country, year, cycleWltp: true } },
        { label: 'Makers flipped', value: `${flip}`, tool: 'get_position', inputs: { country, year, cycleWltp: true } },
        { label: 'Exposure on WLTP', value: fmtMoney(wltp.marketFine!, cur), tool: 'get_position', inputs: { country, year, cycleWltp: true } },
      ],
      options: [{ title: 'Stress the plan on WLTP', detail: 'apply the cycle conversion to the live scenario', action: { kind: 'model', year, scenario: { cycleWltp: true } } }],
      recommendation: 'Stress every plan on WLTP — a maker comfortable on MIDC can breach on the transition basis alone.',
      provenance: wltpR.provenance,
      ask: `What happens to India on the WLTP basis, and who flips from clear to breach?`,
    })
  }

  // ── China · dual-credit (the real two-axis position) ──────────────────────
  if (country === 'CN') {
    const dcR = dualCreditPosition(ctx, country, year)
    const dc = dcR.value
    out.push({
      id: `${country}:dualcredit:${year}`, country, year, severity: dc.creditsToBuy > 0.5 ? 'high' : 'clear', category: 'Dual-credit',
      headline: `${dc.makersShort} of ${dc.makers} entities must buy credits · ${fmtMoney(dc.costToClear, cur)}`,
      situation: `China scores both axes: fuel economy (CAFC ${dc.cafcCredit >= 0 ? '+' : ''}${fmtInt(dc.cafcCredit)}) and NEV volume (${dc.nevBalance >= 0 ? '+' : ''}${fmtInt(dc.nevBalance)}). ${dc.makersShort} entities are short after self-offset.`,
      why: 'A CAFC deficit clears against the entity’s own NEV surplus first; only the residual, plus any NEV deficit, has to be bought on the market.',
      metrics: [
        { label: 'Credits to buy', value: fmtInt(dc.creditsToBuy), tool: 'dual_credit', inputs: { country, year } },
        { label: 'Cost to clear', value: fmtMoney(dc.costToClear, cur), tool: 'dual_credit', inputs: { country, year } },
        { label: 'Implied battery demand', value: `${fmtNum(dc.batteryGWh, 0)} GWh`, tool: 'dual_credit', inputs: { country, year } },
      ],
      options: [{ title: 'Open the Credit book', detail: 'the full two-axis ledger and offset order', action: { kind: 'creditbook', year } }],
      recommendation: 'Clear NEV deficits on the market and offset CAFC with own surplus — the Credit book shows the cheapest order per entity.',
      provenance: dcR.provenance,
      ask: 'Walk me through the China dual-credit position — who is short and what does clearing cost?',
    })
  }

  // ── headroom: the biggest surplus, in the regime's own instrument ─────────
  const ledgerR = creditLedger(ctx, country, year)
  const ledger = ledgerR.value
  const best = ledger.positions.filter((p) => p.balance > 0).sort((a, b) => b.balance - a.balance)[0]
  if (best && best.headroom > 0.15) {
    const tradeable = ledger.instrument === 'trade' && best.value != null
    out.push({
      id: `${country}:surplus:${best.maker}:${year}`, country, maker: best.maker, year, severity: 'clear', category: 'Opportunity',
      headline: tradeable
        ? `${short(best.maker)} holds headroom worth ≈ ${fmtMoney(best.value!, cur)}`
        : `${short(best.maker)} holds ${fmtNum(best.headroom, 2)} ${unit} of poolable headroom`,
      situation: `${best.maker.split(' ')[0]} sits ${fmtNum(best.headroom, 2)} ${unit} under target across ${fmtInt(best.units)} registrations — the market's largest surplus.`,
      why: ledger.note,
      metrics: [
        { label: 'Headroom', value: `${fmtNum(best.headroom, 2)} ${unit}`, tool: 'credit_ledger', inputs: { country, year } },
        { label: `Market ${ledger.verb} capacity`, value: `${fmtInt(ledger.totalSurplus)} vs ${fmtInt(ledger.totalDeficit)} short`, tool: 'credit_ledger', inputs: { country, year } },
        ...(tradeable ? [{ label: 'Estimated value', value: fmtMoney(best.value!, cur), tool: 'credit_ledger', inputs: { country, year } } as Metric] : []),
      ],
      // Where nothing is issued or traded (the EU) there is no ledger to open —
      // the surplus is realised by pooling, so that is where the option points.
      options: [tradeable
        ? { title: 'Open the Credit book', detail: `see every ${ledger.supplierLabel ?? 'surplus'} position`, action: { kind: 'creditbook' as const, maker: best.maker, year } }
        : { title: 'Open Pooling', detail: `see every ${ledger.supplierLabel ?? 'surplus'} position and model the partnership`, action: { kind: 'pooling' as const, maker: best.maker, year } }],
      recommendation: tradeable
        ? 'Bank the surplus for a tighter year or list it — either monetises headroom that otherwise expires.'
        : `There is no instrument to sell here. The value is realised by ${ledger.verb}ing with a short maker — model the partnership before it is negotiated.`,
      provenance: ledgerR.provenance,
      ask: `What is ${short(best.maker)}'s headroom worth, and how do I realise it in ${pack.name}?`,
    })
  }

  // ── data integrity: can these numbers actually be filed? ──────────────────
  const dqR = dataQuality(ctx, country, year)
  const dq = dqR.value
  if (dq.verdict !== 'pass' || dq.anomalies.errors > 0 || dq.datasetTier === 'preview') {
    out.push({
      id: `${country}:data:${year}`, country, year,
      severity: dq.verdict === 'fail' || dq.datasetTier === 'preview' ? 'high' : 'watch',
      category: 'Data integrity',
      headline: dq.datasetTier === 'preview'
        ? `${pack.name} is a preview dataset — not a market position`
        : `${dq.anomalies.errors} data error${dq.anomalies.errors === 1 ? '' : 's'} would not survive a filing review`,
      situation: dq.datasetTier === 'preview'
        ? `The rule pack is trusted; the fleet behind it is a sample. Arithmetic is exact, the position is illustrative.`
        : `${dq.anomalies.errors} error and ${dq.anomalies.warns} warning rows across ${fmtInt(dq.coverage.rows)} rows covering ${fmtInt(dq.coverage.units)} registrations.`,
      why: 'A fine computed on rows that do not reconcile is not defensible. Fix the data before the position is quoted.',
      metrics: [
        { label: 'Reconciliation', value: dq.verdict.toUpperCase(), tool: 'data_quality', inputs: { country, year } },
        { label: 'Errors / warnings', value: `${dq.anomalies.errors} / ${dq.anomalies.warns}`, tool: 'data_quality', inputs: { country, year } },
        { label: 'Coverage', value: `${dq.coverage.parents} makers · ${fmtInt(dq.coverage.rows)} rows`, tool: 'data_quality', inputs: { country, year } },
      ],
      options: [{ title: 'Open Data & imports', detail: 'review the rows the scan flagged', action: { kind: 'data', year } }],
      recommendation: dq.datasetTier === 'preview'
        ? 'Import the market registrations file before this module is used for a filing decision.'
        : 'Clear the error rows first — warnings can be dispositioned in the note.',
      provenance: dqR.provenance,
      ask: `Is the ${pack.name} dataset clean enough to file on? Show me what the scan flagged.`,
    })
  }

  return out.sort((a, b) => RANK[a.severity] - RANK[b.severity])
}

/** Compact input for the optional LLM narrative layer (it never changes a number). */
export function findingForLLM(f: Finding) {
  return {
    headline: f.headline, category: f.category, maker: f.maker, year: f.year, severity: f.severity,
    market: getPack(f.country).name,
    metrics: f.metrics.map((m) => `${m.label}: ${m.value}`),
    situation: f.situation, why: f.why, recommendation: f.recommendation,
    dataset: { version: f.provenance.dataVersion, coverage: f.provenance.coverage, basis: f.provenance.basis },
  }
}

export type { Provenance }
