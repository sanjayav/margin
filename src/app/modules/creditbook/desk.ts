/* ───────────────────────────────────────────────────────────────────────────
   The credit desk's arithmetic.
   ---------------------------------------------------------------------------
   A credit book has two sides and this file keeps them apart on purpose:

     COMPUTED — the position the engine derives from the fleet. Nobody can type
                it, post to it, or argue with it except by changing the data.
     RECORDED — the blotter: transfers the desk has drafted or posted on top of
                that position.

   The book's one honest equation is  computed + recorded = net,  and every
   figure a ticket shows is derived here from those two sides — never typed in
   by the person raising the ticket. A blotter where the "resulting position"
   is a free-text field is how books stop reconciling.
   ─────────────────────────────────────────────────────────────────────────── */
import type { CountryId } from '../../../engine/types'
import type { CreditTicket } from '../../state/appStore'

export const newTicketId = () => `tkt_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

/** Signed effect of one ticket on the entity's balance, in credit units.
 *  A buy raises the balance, a sell lowers it. Cancelled tickets are inert. */
export const ticketEffect = (t: CreditTicket): number =>
  t.status === 'cancelled' ? 0 : (t.side === 'buy' ? t.qty : -t.qty)

export interface BlotterSummary {
  /** Net units from POSTED tickets only — the recorded side of the book. */
  postedUnits: number
  /** Net units drafts would add if executed. Kept separate: a draft is an
   *  intention, and an intention on the same line as a fact is how a desk
   *  double-counts its own cover. */
  draftUnits: number
  /** Cash out (negative = paid), posted only. */
  postedCash: number
  draftCash: number
  posted: CreditTicket[]
  drafts: CreditTicket[]
}

export function summariseBlotter(tickets: CreditTicket[], country: CountryId, entity: string, year: number): BlotterSummary {
  const mine = tickets.filter((t) => t.country === country && t.entity === entity && t.year === year)
  const posted = mine.filter((t) => t.status === 'posted')
  const drafts = mine.filter((t) => t.status === 'draft')
  const cash = (t: CreditTicket) => (t.side === 'buy' ? -1 : 1) * t.qty * t.price
  return {
    postedUnits: posted.reduce((a, t) => a + ticketEffect(t), 0),
    draftUnits: drafts.reduce((a, t) => a + ticketEffect(t), 0),
    postedCash: posted.reduce((a, t) => a + cash(t), 0),
    draftCash: drafts.reduce((a, t) => a + cash(t), 0),
    posted, drafts,
  }
}

export interface NetPosition {
  computed: number
  posted: number
  net: number
  /** Net including drafts — shown as "if executed", never as the position. */
  ifExecuted: number
  /** Units still uncovered after the net (0 when long or square). */
  shortfall: number
  shortfallIfExecuted: number
}

export function netPosition(computedBalance: number, blotter: BlotterSummary): NetPosition {
  const net = computedBalance + blotter.postedUnits
  const ifExecuted = net + blotter.draftUnits
  return {
    computed: computedBalance,
    posted: blotter.postedUnits,
    net,
    ifExecuted,
    shortfall: Math.max(0, -net),
    shortfallIfExecuted: Math.max(0, -ifExecuted),
  }
}

/* ───────────────────────────────────────────────────────────────────────────
   Banking and carry rules, per regime — the platform's reading, with the
   operative instrument named. The VALUES here are qualitative on purpose:
   where a pack carries a figure it is quoted from the pack at render time, and
   this table never invents a number the instrument did not give us.
   ─────────────────────────────────────────────────────────────────────────── */

export interface BankingRule {
  canBank: boolean
  headline: string
  detail: string
  source: string
  draft?: boolean
}

export const BANKING: Record<CountryId, BankingRule> = {
  UK: {
    canBank: true,
    headline: 'Allowances bank for up to 3 years; borrowing 2024–29 at 3.5%',
    detail: 'CRTS/VRTS allowances transfer between manufacturers in the Nov–Dec trading window, bank for up to three years, and may be borrowed from future scheme years 2024–29 at 3.5% compounding, repaid by 2030. Borrowing turns a breach into a bigger obligation later — it is financing, not compliance.',
    source: 'The Vehicle Emissions Trading Schemes Order 2023 (SI 2023/1268)',
  },
  AU: {
    canBank: true,
    headline: 'Over-achievers bank credits and may sell them within the stated period',
    detail: 'Credits and debits accrue against the target and may be transferred or carried forward within the period the Act states. A banked credit is a wasting asset: the year you use it in is a decision, not an afterthought.',
    source: 'New Vehicle Efficiency Standard Act 2024',
  },
  IN: {
    canBank: true, draft: true,
    headline: 'Draft CAFE III provides banked, tradable credits — none of this exists under CAFE II',
    detail: 'The drafted norms provide banked credits trading between manufacturers at a notified price. Until CAFE III is notified, this desk models the draft mechanism: treat every valuation as indicative and every ticket as planning, not settlement.',
    source: 'BEE draft CAFE III · Energy Conservation (Amendment) Act 2022',
  },
  CN: {
    canBank: true,
    headline: 'CAFC clears via carried-over surplus, affiliate transfer (≥25%) or purchased NEV credits',
    detail: 'A CAFC deficit clears through the maker’s own carried-over surplus, transfer from an affiliated enterprise (关联企业, ≥25% shareholding), or purchased NEV credits. An NEV deficit clears only with NEV credits — the two accounts do not net, which is the classic China modelling error.',
    source: 'MIIT dual-credit measures',
  },
  EU: {
    canBank: false,
    headline: 'No instrument exists — headroom moves by pooling, and only by pooling',
    detail: 'Article 6 pooling shares one fleet average; nothing is issued, priced, banked or carried forward. The only time flexibility is the 2025–27 three-year averaging added by Reg (EU) 2025/1214. There is no blotter to keep here.',
    source: 'Regulation (EU) 2019/631, Art. 6 · Reg (EU) 2025/1214',
  },
}

/** The rational ceiling on a credit price: the charge you would otherwise pay
 *  per unit per vehicle. Null where the regime's charge is not a simple linear
 *  rate (a stepped per-vehicle penalty has no single per-unit equivalent, and
 *  pretending it does would mis-price the ceiling). */
export function priceCeiling(fineRate: number, stepped: boolean): number | null {
  return stepped ? null : fineRate
}
