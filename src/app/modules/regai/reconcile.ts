/* ───────────────────────────────────────────────────────────────────────────
   Rule-pack reconciliation.
   ---------------------------------------------------------------------------
   Every compliance platform has the same silent failure: the rules move and the
   software does not. It shows up as numbers that are quietly a draft behind,
   and nobody finds out until a regulator or a customer does.

   So the platform states the gap itself. This file is a dated, cited comparison
   between WHAT THE LOADED RULE PACK HOLDS and WHAT THE CURRENT DRAFT SAYS, with
   an explicit verdict on each line:

     aligned   — the pack matches the current instrument
     structural — the pack is missing a MECHANISM the draft added; this changes
                  answers, not just figures
     numeric   — the pack holds a figure the draft has since moved
     open      — the draft itself is unresolved, so nobody can be aligned yet

   The rule this file obeys: it never silently adopts a figure from a
   consultation that is still open. It shows both, dates both, cites both, and
   leaves the decision to a person — which is the same contract every agent in
   this product works under.
   ─────────────────────────────────────────────────────────────────────────── */
import type { CountryId } from '../../../engine/types'

export type Verdict = 'aligned' | 'structural' | 'numeric' | 'open'

export const VERDICT_META: Record<Verdict, { label: string; tone: 'pos' | 'neg' | 'warn' | 'neutral'; blurb: string }> = {
  aligned: { label: 'Aligned', tone: 'pos', blurb: 'The pack matches the current instrument.' },
  structural: { label: 'Structural gap', tone: 'neg', blurb: 'The draft adds a mechanism the pack did not have. This changes answers, not just figures.' },
  numeric: { label: 'Figure moved', tone: 'warn', blurb: 'The pack holds a value the current draft has since changed.' },
  open: { label: 'Unresolved', tone: 'neutral', blurb: 'The instrument itself is undecided — nobody can be aligned yet.' },
}

export interface ReconLine {
  id: string
  topic: string
  /** What the engine is using right now. */
  pack: string
  /** What the current instrument says. */
  current: string
  verdict: Verdict
  /** What it means for a number on screen. */
  soWhat: string
  /** Whether the platform has since closed the gap. */
  closed?: boolean
  source: string
  dated: string
}

export interface Reconciliation {
  market: CountryId
  /** The instrument version the pack's numbers were built from. */
  packBasis: string
  /** The instrument the comparison is against. */
  against: string
  againstDated: string
  lines: ReconLine[]
}

export const RECONCILIATIONS: Reconciliation[] = [
  {
    market: 'IN',
    packBasis: 'BEE draft CAFE III, 25 September 2025',
    against: 'BEE draft CAFE III (revised), 16 July 2026 — consultation closed 6 August 2026',
    againstDated: '2026-07-16',
    lines: [
      {
        id: 'in-blocks', topic: 'Compliance period',
        pack: 'Was assessed year by year',
        current: 'Two multi-year blocks: FY2027-28 → FY2029-30, then FY2030-31 → FY2031-32',
        verdict: 'structural', closed: true,
        soWhat: 'The one that changed answers. A manufacturer over the line in a single year and under it either side does NOT breach — the platform was showing a charge that would never be levied. Now modelled: see Forecast → Blocks.',
        source: 'Draft CAFE-III, compliance block provisions', dated: '2026-07-16',
      },
      {
        id: 'in-lapse', topic: 'Credit carry-forward',
        pack: 'Banked credits, no expiry modelled',
        current: 'Credits carry forward INSIDE a block and lapse when it closes',
        verdict: 'structural', closed: true,
        soWhat: 'A surplus is a wasting asset with a date on it. The credit desk and the Blocks view now warn before it expires; valuing a banked position without an expiry overstates it.',
        source: 'Draft CAFE-III, carry-forward provisions', dated: '2026-07-16',
      },
      {
        id: 'in-pooling', topic: 'Pooling',
        pack: 'Not permitted in India at all',
        current: 'Voluntary pooling between manufacturers, from CAFE III only',
        verdict: 'structural', closed: true,
        soWhat: 'A whole route to compliance the platform was refusing to price. Now year-aware: no pooling under CAFE II, available from FY2027-28 — the Pooling module and the agent gate both ask about the year, not the market.',
        source: 'Draft CAFE-III, voluntary pooling provisions', dated: '2026-07-16',
      },
      {
        id: 'in-price', topic: 'Credit buyout price',
        pack: 'One flat price — ₹2,500 per gCO₂/km',
        current: '₹2,500/g in FY2027-28, rising ₹500 a year to ₹4,500/g in FY2031-32',
        verdict: 'structural', closed: true,
        soWhat: 'Valuing a five-year book at the front-year price understates its back end by 44%. The desk now reads the published year, and says which year it is reading.',
        source: 'Draft CAFE-III, BEE buyout schedule', dated: '2026-07-16',
      },
      {
        id: 'in-super', topic: 'Super-credit multipliers',
        pack: 'BEV ×3.0 · PHEV ×2.5 · strong hybrid ×2.0 · flex-fuel ×1.5',
        current: 'BEV and range-extender ×3.0 · PHEV ×2.5 · strong hybrid ×1.6 · flex-fuel ×1.1',
        verdict: 'numeric',
        soWhat: 'Strong hybrid and flex-fuel were both cut. A hybrid-heavy plan modelled on the pack’s ×2.0 is claiming credit the current draft does not give — the direction of the error flatters the maker, which is the worse direction.',
        source: 'Draft CAFE-III, super-credit table', dated: '2026-07-16',
      },
      {
        id: 'in-smallcar', topic: 'Small-car concession',
        pack: 'Not modelled',
        current: 'A proposed 3 gCO₂/km relaxation for sub-4m petrol cars (capped 9 g) was DROPPED; the relief is folded into a flatter curve instead',
        verdict: 'aligned',
        soWhat: 'The pack is right by accident here — it never modelled the concession, and the concession no longer exists. Worth knowing it was contested: Tata and Mahindra argued it benefited one manufacturer.',
        source: 'Revised draft — concession withdrawn', dated: '2026-07-16',
      },
      {
        id: 'in-targets', topic: 'Target curve',
        pack: 'Constant d tightening 3.73 → 3.01 L/100km at a 1,170 kg reference',
        current: 'Fleet-average target 3.996 L/100km (94.76 gCO₂/km) in FY2027-28 → 3.3273 L/100km (78.90 g) in FY2031-32',
        verdict: 'numeric',
        soWhat: 'These are not the same quantity — the pack holds the curve CONSTANT at a reference mass, the draft quotes the resulting FLEET-AVERAGE target. They can only be compared through the market’s actual average mass. Treat the absolute levels here as needing a primary-source check before any filing.',
        source: 'Draft CAFE-III target schedule', dated: '2026-07-16',
      },
      {
        id: 'in-notify', topic: 'Legal status',
        pack: 'Flagged draft throughout',
        current: 'Still a draft. Consultation closed 6 August 2026; norms are not notified',
        verdict: 'open',
        soWhat: 'Nothing in CAFE III can be filed against yet. The stringency lever in Scenario exists precisely so the risk of the final rules landing tighter can be priced rather than assumed away.',
        source: 'Energy Conservation Act 2001 (as amended 2022), s.14 head of power', dated: '2026-08-06',
      },
    ],
  },
  {
    market: 'EU',
    packBasis: 'Regulation (EU) 2019/631 as amended by 2023/851',
    against: 'Regulation (EU) 2025/1214',
    againstDated: '2025-06-01',
    lines: [
      {
        id: 'eu-avg', topic: 'Compliance period',
        pack: 'Was assessed year by year',
        current: '2025, 2026 and 2027 may be met on a three-year average',
        verdict: 'structural', closed: true,
        soWhat: 'The same trap as India’s blocks, in the largest market on the platform. A maker over the line in 2025 alone does not breach if the three years together clear. Now modelled — and note nothing is banked or traded: this is time, not an instrument.',
        source: 'Regulation (EU) 2025/1214', dated: '2025-06-01',
      },
      {
        id: 'eu-instrument', topic: 'Transfer mechanism',
        pack: 'No credit issued; Article 6 pooling only',
        current: 'Unchanged — the EU issues no compliance credit',
        verdict: 'aligned',
        soWhat: 'The vocabulary rule holds: “credit”, “trade”, “seller” and “banked position” are all factually wrong here. The Credit book renders as a Position book in the EU for this reason.',
        source: 'Regulation (EU) 2019/631, Art. 6', dated: '2023-04-25',
      },
      {
        id: 'eu-super', topic: 'Super-credits',
        pack: 'Expired after 2022',
        current: 'Unchanged — expired',
        verdict: 'aligned',
        soWhat: 'A model offering EU super-credits is wrong about the year. The lever is absent in this market rather than disabled.',
        source: 'Regulation (EU) 2019/631, Art. 5', dated: '2023-04-25',
      },
      {
        id: 'eu-class', topic: 'Class separation',
        pack: 'M1 and N1 assessed as separate obligations',
        current: 'Unchanged — Article 8 charges each independently',
        verdict: 'aligned',
        soWhat: 'Van headroom cannot pay down a car deficit. Netting the two would understate exposure, and the engine keeps them apart.',
        source: 'Regulation (EU) 2019/631, Art. 4 and Art. 8', dated: '2023-04-25',
      },
    ],
  },
  {
    market: 'UK',
    packBasis: 'The Vehicle Emissions Trading Schemes Order 2023 (SI 2023/1268)',
    against: 'SI 2023/1268 as amended',
    againstDated: '2024-01-03',
    lines: [
      {
        id: 'uk-borrow', topic: 'Borrowing',
        pack: 'Modelled as a note, not as a cost',
        current: 'Borrowing from future scheme years 2024–29 at 3.5% compounding, repaid by 2030',
        verdict: 'numeric',
        soWhat: 'Borrowing turns a breach into a larger obligation later — it is financing, not compliance, and the platform prices it as neither. A borrowed position should carry its interest into the forward years.',
        source: 'SI 2023/1268, borrowing provisions', dated: '2024-01-03',
      },
      {
        id: 'uk-window', topic: 'Trading window',
        pack: 'Not modelled as a calendar constraint',
        current: 'Allowances transfer in a November–December window',
        verdict: 'numeric',
        soWhat: 'A desk lives by its calendar. Cover that is available in August is not available in January, and the credit desk currently shows no runway to the window.',
        source: 'SI 2023/1268, transfer provisions', dated: '2024-01-03',
      },
      {
        id: 'uk-bank', topic: 'Banking',
        pack: 'Three-year banking stated in the pack note',
        current: 'Unchanged',
        verdict: 'aligned',
        soWhat: 'The desk cites this rule directly on the entity’s book.',
        source: 'SI 2023/1268', dated: '2024-01-03',
      },
    ],
  },
  {
    market: 'CN',
    packBasis: 'MIIT dual-credit measures · GB 27999',
    against: 'MIIT dual-credit measures as in force',
    againstDated: '2023-07-01',
    lines: [
      {
        id: 'cn-dual', topic: 'Two accounts',
        pack: 'CAFC and NEV modelled as distinct axes',
        current: 'Unchanged — a CAFC surplus does not clear an NEV deficit',
        verdict: 'aligned',
        soWhat: 'Netting the two into one “position” is the classic China modelling error. An NEV deficit clears only with NEV credits.',
        source: 'MIIT dual-credit measures', dated: '2023-07-01',
      },
      {
        id: 'cn-affiliate', topic: 'Affiliate transfer',
        pack: 'Stated in the pack note, not modelled as a constraint',
        current: 'CAFC deficits may clear via transfer from an affiliated enterprise with ≥25% shareholding',
        verdict: 'numeric',
        soWhat: 'The pooling optimiser does not know which counterparties are affiliates, so it can propose a transfer the rule would not allow. Group structure is missing data, not missing logic.',
        source: 'MIIT dual-credit measures, 关联企业 provisions', dated: '2023-07-01',
      },
    ],
  },
  {
    market: 'AU',
    packBasis: 'New Vehicle Efficiency Standard Act 2024',
    against: 'NVES Act 2024 as in force',
    againstDated: '2024-05-01',
    lines: [
      {
        id: 'au-rates', topic: 'Penalty and credit price',
        pack: 'Illustrative A$ figures pending observed market price',
        current: 'Statutory penalty per gram per vehicle; no observed secondary market price yet',
        verdict: 'open',
        soWhat: 'The pack flags these as illustrative and every money figure in Australia carries that badge. Do not quote an Australian credit valuation externally until a market price exists.',
        source: 'NVES Act 2024, Part 4', dated: '2024-05-01',
      },
      {
        id: 'au-types', topic: 'Vehicle types',
        pack: 'Break-point curve applied by type',
        current: 'Unchanged — Type 1 and Type 2 carry separate curves and break points',
        verdict: 'aligned',
        soWhat: 'A fleet sitting near a break point is very sensitive to mix, which is why the mass view exists in Plan.',
        source: 'NVES Act 2024, Part 2', dated: '2024-05-01',
      },
    ],
  },
]

export const reconciliationFor = (market: CountryId) =>
  RECONCILIATIONS.find((r) => r.market === market) ?? null

export function reconSummary(r: Reconciliation) {
  const open = r.lines.filter((l) => l.verdict !== 'aligned' && !l.closed)
  return {
    total: r.lines.length,
    aligned: r.lines.filter((l) => l.verdict === 'aligned').length,
    closed: r.lines.filter((l) => l.closed).length,
    open: open.length,
    structuralOpen: open.filter((l) => l.verdict === 'structural').length,
  }
}
