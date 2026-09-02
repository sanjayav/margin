// ───────────────────────────────────────────────────────────────────────────
// MULTI-YEAR COMPLIANCE BLOCKS
//
// Annual compliance is an assumption, not a law of nature, and two of the five
// regimes this platform covers have stopped making it:
//
//   · India, draft CAFE III — assessed over blocks (FY2027-28 → FY2029-30,
//     then FY2030-31 → FY2031-32), with credits lapsing at each block end.
//   · EU, Reg (EU) 2025/1214 — 2025 to 2027 may be met on a three-year average.
//
// Why this file exists rather than a flag somewhere: a manufacturer over the
// line in one year and comfortably under it either side does NOT breach under a
// block, and the platform was reporting an annual breach with a fine attached.
// That is a wrong answer with money on it, and the kind of thing a compliance
// team would find out about from their regulator rather than from us.
//
// The block average is VOLUME-WEIGHTED, because that is what a fleet average is
// — a year selling twice as many cars carries twice the weight. Averaging the
// annual averages unweighted would quietly favour whichever year was smallest.
// ───────────────────────────────────────────────────────────────────────────
import { aggregateParent, buildTree } from './engine.js'
import type { Aggregate, ComplianceBlock, RulePack, Scenario, Vehicle } from './types.js'

export interface BlockYear {
  year: number
  metric: number
  limit: number
  gap: number
  units: number
  fine: number
  /** Whether this year would breach if judged on its own. */
  breachesAlone: boolean
}

export interface BlockPosition {
  block: ComplianceBlock
  years: BlockYear[]
  /** Volume-weighted fleet metric across the block. */
  avgMetric: number
  /** Volume-weighted target across the block. */
  avgLimit: number
  gap: number
  units: number
  status: 'compliant' | 'fine' | 'no-sales'
  /** The charge on the block position, computed by the pack's own fine rule
   *  against the block-average exceedance and the block's total volume. */
  fine: number
  /** Sum of the standalone annual charges — what the platform would have said
   *  before blocks existed. The difference between this and `fine` is the whole
   *  value of the block. */
  annualFine: number
  /** Years that breach alone but are carried by the block. */
  rescuedYears: number[]
  /** Years compliant alone while the block as a whole still breaches. */
  draggedYears: number[]
}

/** The blocks a pack declares that intersect the years given. */
export function blocksFor(pack: RulePack, years?: number[]): ComplianceBlock[] {
  const all = pack.complianceBlocks ?? []
  if (!years?.length) return all
  return all.filter((b) => b.years.some((y) => years.includes(y)))
}

/** The block a year falls in, if any. A year may belong to at most one. */
export function blockOf(pack: RulePack, year: number): ComplianceBlock | null {
  return (pack.complianceBlocks ?? []).find((b) => b.years.includes(year)) ?? null
}

/** Whether pooling is available in a given compliance year.
 *
 *  `pooling.enabled` says the regime has the concept; `pooling.fromYear` says
 *  when it starts. India has neither under CAFE II and both from draft CAFE III,
 *  so anything that offers a pooling lever, prices a pool, or validates an
 *  agent's pooling proposal has to ask about a YEAR, not about a market. */
export function poolingAllowed(pack: RulePack, year: number): boolean {
  if (!pack.pooling.enabled) return false
  return pack.pooling.fromYear == null || year >= pack.pooling.fromYear
}

/** The credit price in force for a compliance year: the schedule where the pack
 *  publishes one, the flat price otherwise, null where no instrument exists. */
export function creditPriceFor(pack: RulePack, year: number): number | null {
  const byYear = pack.creditPriceByYear?.[year]
  if (byYear != null && isFinite(byYear)) return byYear
  return pack.creditPrice ?? null
}

/** Position over a whole block, for the market or one manufacturer.
 *
 *  A year the dataset does not cover is skipped rather than counted as zero —
 *  a block average that silently includes a year of no data is not an average
 *  of anything. `years` reports only what was actually assessed. */
export function blockPosition(
  raw: Vehicle[], pack: RulePack, scenario: Scenario, block: ComplianceBlock, parent?: string | null,
): BlockPosition {
  const nodeFor = (year: number): Aggregate => {
    const s: Scenario = { ...scenario, year }
    if (parent) return aggregateParent(raw, pack, s, parent)
    const t = buildTree(raw, pack, s)
    // Market level: the charge is per compliance entity, so the market's
    // annual fine is the sum of its makers' — never the fine a single blended
    // entity would owe.
    return { ...t, fine: (t.children ?? []).reduce((a, c) => a + c.fine, 0) }
  }

  const years: BlockYear[] = []
  for (const y of block.years) {
    const n = nodeFor(y)
    if (n.rawUnits <= 0) continue
    years.push({
      year: y, metric: n.avgMetric, limit: n.limit, gap: n.gap,
      units: n.rawUnits, fine: n.fine, breachesAlone: n.gap > 0,
    })
  }

  const units = years.reduce((a, y) => a + y.units, 0)
  if (!units) {
    return {
      block, years, avgMetric: 0, avgLimit: 0, gap: 0, units: 0,
      status: 'no-sales', fine: 0, annualFine: 0, rescuedYears: [], draggedYears: [],
    }
  }

  const avgMetric = years.reduce((a, y) => a + y.metric * y.units, 0) / units
  const avgLimit = years.reduce((a, y) => a + y.limit * y.units, 0) / units
  const gap = avgMetric - avgLimit
  const annualFine = years.reduce((a, y) => a + y.fine, 0)

  // Charge the block exceedance through the pack's own fine rule, so a stepped
  // schedule stays stepped. Packs without one fall back to the linear rate.
  const fine = gap > 0
    ? (pack.fineFor ? pack.fineFor(gap, units, { year: block.years[block.years.length - 1] } as never) : gap * pack.fineRate * units)
    : 0

  const compliant = gap <= 0
  return {
    block, years, avgMetric, avgLimit, gap, units,
    status: compliant ? 'compliant' : 'fine',
    fine, annualFine,
    rescuedYears: compliant ? years.filter((y) => y.breachesAlone).map((y) => y.year) : [],
    draggedYears: compliant ? [] : years.filter((y) => !y.breachesAlone).map((y) => y.year),
  }
}

/** Credits banked in a block that will lapse when it ends.
 *
 *  A banked credit with an expiry is a wasting asset, and the year you use it
 *  in is a decision. Surfacing "these units die on 31 March" is the difference
 *  between a ledger and a calendar. */
export interface LapseWarning {
  block: ComplianceBlock
  /** Last compliance year of the block. */
  lapsesAfter: number
  /** Surplus units earned in the block, at the block position. */
  units: number
  /** Value at the price in force in the final year of the block. */
  value: number | null
}

export function lapseWarning(
  pos: BlockPosition, pack: RulePack,
): LapseWarning | null {
  if (!pos.block.creditsLapse || pos.gap >= 0 || pos.units <= 0) return null
  const lapsesAfter = pos.block.years[pos.block.years.length - 1]
  const units = Math.abs(pos.gap) * pos.units
  const price = creditPriceFor(pack, lapsesAfter)
  return { block: pos.block, lapsesAfter, units, value: price != null ? units * price : null }
}
