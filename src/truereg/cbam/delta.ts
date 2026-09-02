// ───────────────────────────────────────────────────────────────────────────
// THE DELTA — what proving the number is actually worth, to whom, per contract.
//
// The mill carries no CBAM obligation. Its buyer does. So the commercial case
// has to be stated in the buyer's currency and against the buyer's alternative:
// what the declarant surrenders on DEFAULT values versus on this installation's
// verified actuals, per contract and per tonne.
//
// Two adjustments decide whether the case is real:
//   • the free-allocation factor — the surrender is reduced to the extent EU
//     producers still receive free allowances, and that factor phases out. A
//     delta computed without it is overstated in the early years, which is
//     exactly when the customer is deciding whether to buy this at all.
//   • Article 9 — a recognised domestic carbon price reduces the surrender.
//     For China it does not, and the model must not quietly assume it does.
// ───────────────────────────────────────────────────────────────────────────
import type { SalesContract } from '../record/types.js'
import { defaultIntensity } from './defaults.js'
import type { EmbeddedEmissions } from './emissions.js'
import type { GoodsCategory } from './boundaries.js'

/** Share of the surrender that is NOT waived by remaining EU free allocation.
 *  Reduces the certificates due in the phase-in years. Authored as data with a
 *  clause, and revised by the watch agent rather than hardcoded in a formula. */
export const FREE_ALLOCATION_FACTOR: Record<number, number> = {
  2026: 0.025, 2027: 0.05, 2028: 0.10, 2029: 0.225, 2030: 0.485,
  2031: 0.61, 2032: 0.735, 2033: 0.86, 2034: 1.0,
}
export const factorFor = (year: number) => FREE_ALLOCATION_FACTOR[year] ?? (year < 2026 ? 0 : 1)

export interface CertificatePrice {
  /** €/tCO₂e. Tracks the EU ETS auction price by construction. */
  eur: number
  asOf: string
  source: string
  status: 'observed' | 'assumed'
}

export interface ContractDelta {
  contractId: string
  buyerName: string
  buyerCountry: string
  eori: string | null
  tonnes: number
  year: number
  category: GoodsCategory | null
  /** tCO₂e per tonne under the default table. */
  defaultSee: number | null
  /** tCO₂e per tonne from this installation's verified actuals. */
  actualSee: number | null
  /** Positive = the actuals are better than the default. */
  deltaSeePerTonne: number | null
  /** Certificates the buyer surrenders under each basis, after the free-
   *  allocation factor and any Article 9 deduction. */
  certificatesOnDefault: number | null
  certificatesOnActual: number | null
  /** € the buyer avoids by using the verified record. */
  buyerSavingEur: number | null
  savingPerTonneEur: number | null
  /** Share of the contract's own value, where the price is known. */
  savingAsShareOfContract: number | null
  freeAllocationFactor: number
  basis: EmbeddedEmissions['basis']
  /** Every caveat that must travel with this figure. */
  caveats: string[]
  /** Set when the delta cannot be stated and why. */
  blocked: string | null
}

export interface DeltaResult {
  price: CertificatePrice
  contracts: ContractDelta[]
  totals: {
    tonnes: number
    buyerSavingEur: number
    certificatesAvoided: number
    /** Contracts where the delta could not be computed. */
    blockedCount: number
  }
  /** The headline, stated once, in the buyer's terms. */
  headlineEn: string
  headlineZh: string
  clauseIds: string[]
}

export interface DeltaOptions {
  price: CertificatePrice
  /** Article 9 deduction available in certificates, spread pro-rata by tonnage. */
  article9Certificates?: number
  /** Country whose default values apply. Defaults to the installation's. */
  defaultsCountry: string
}

const yearOf = (iso: string) => new Date(iso).getUTCFullYear()

export function computeDelta(contracts: SalesContract[], emissions: EmbeddedEmissions[], opts: DeltaOptions): DeltaResult {
  const byProduct = new Map(emissions.map((e) => [e.productId, e]))
  const totalTonnes = contracts.reduce((a, c) => a + c.tonnes, 0)
  const a9 = opts.article9Certificates ?? 0

  const rows: ContractDelta[] = contracts.map((c) => {
    const e = byProduct.get(c.productId)
    const year = yearOf(c.deliveryFrom)
    const f = factorFor(year)
    const cat = e?.category ?? null
    const base = {
      contractId: c.id, buyerName: c.buyerName, buyerCountry: c.buyerCountry,
      eori: c.buyerIdentifiers?.EORI ?? null, tonnes: c.tonnes, year, category: cat,
      freeAllocationFactor: f, basis: e?.basis ?? 'default' as const,
    }
    if (!e) return { ...base, defaultSee: null, actualSee: null, deltaSeePerTonne: null, certificatesOnDefault: null, certificatesOnActual: null, buyerSavingEur: null, savingPerTonneEur: null, savingAsShareOfContract: null, caveats: [], blocked: `No emissions record for product ${c.productId}.` }

    const di = cat ? defaultIntensity(cat, opts.defaultsCountry, true) : null
    const defaultSee = di?.total ?? null
    const actualSee = e.see
    const caveats = [...e.caveats]
    if (di) caveats.push(di.caveat)

    if (defaultSee == null || actualSee == null) {
      return {
        ...base, defaultSee, actualSee, deltaSeePerTonne: null, certificatesOnDefault: null, certificatesOnActual: null,
        buyerSavingEur: null, savingPerTonneEur: null, savingAsShareOfContract: null, caveats,
        blocked: actualSee == null
          ? `Actual embedded emissions are not yet determinable — ${e.unknowns.filter((u) => u.blocking).length} blocking unknown(s). Until they are resolved this buyer surrenders on defaults.`
          : `No default value is held for ${cat ?? 'this category'}, so the comparison cannot be stated.`,
      }
    }

    // Certificates due = SEE × tonnes × free-allocation factor, less any
    // recognised Article 9 deduction apportioned by this contract's share.
    const share = totalTonnes > 0 ? c.tonnes / totalTonnes : 0
    const dedu = a9 * share
    const certDefault = Math.max(0, defaultSee * c.tonnes * f - dedu)
    const certActual = Math.max(0, actualSee * c.tonnes * f - dedu)
    const saving = (certDefault - certActual) * opts.price.eur

    return {
      ...base, defaultSee, actualSee,
      deltaSeePerTonne: defaultSee - actualSee,
      certificatesOnDefault: certDefault, certificatesOnActual: certActual,
      buyerSavingEur: saving, savingPerTonneEur: c.tonnes > 0 ? saving / c.tonnes : 0,
      savingAsShareOfContract: c.pricePerTonne ? saving / (c.pricePerTonne * c.tonnes) : null,
      caveats: [...new Set(caveats)], blocked: null,
    }
  })

  const ok = rows.filter((r) => !r.blocked)
  const saving = ok.reduce((a, r) => a + (r.buyerSavingEur ?? 0), 0)
  const certs = ok.reduce((a, r) => a + ((r.certificatesOnDefault ?? 0) - (r.certificatesOnActual ?? 0)), 0)
  const blocked = rows.length - ok.length

  const headlineEn = ok.length === 0
    ? 'The buyer exposure cannot be stated yet — no contract has a determinable actual figure. Every tonne currently surrenders on default values.'
    : `Verified actuals save your EU buyers €${Math.round(saving).toLocaleString()} across ${ok.length} contract${ok.length === 1 ? '' : 's'} — ${certs.toLocaleString(undefined, { maximumFractionDigits: 0 })} fewer certificates${blocked ? `, with ${blocked} contract${blocked === 1 ? '' : 's'} still on defaults` : ''}.`

  const headlineZh = ok.length === 0
    ? '目前尚无法陈述买方风险敞口 — 无任何合同具备可确定的实际值。所有吨数均按默认值清缴。'
    : `经核查的实际值可为您的欧盟买方在 ${ok.length} 份合同中节省 €${Math.round(saving).toLocaleString()} — 减少 ${certs.toLocaleString(undefined, { maximumFractionDigits: 0 })} 份证书${blocked ? `；另有 ${blocked} 份合同仍按默认值` : ''}。`

  return {
    price: opts.price, contracts: rows,
    totals: { tonnes: totalTonnes, buyerSavingEur: saving, certificatesAvoided: certs, blockedCount: blocked },
    headlineEn, headlineZh,
    clauseIds: ['cbam.art6', 'cbam.art7', 'cbam.free-allocation-factor'],
  }
}
