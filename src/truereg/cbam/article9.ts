// ───────────────────────────────────────────────────────────────────────────
// ARTICLE 9 — carbon price paid in the country of origin.
//
// The commercially important answer for a Chinese mill is a NO, and the product
// has to deliver it clearly rather than bury it. China's national ETS is not
// currently recognised for an Article 9 deduction, so a domestic carbon cost
// the mill genuinely pays buys the buyer nothing. Saying that plainly, with the
// clause and the reason, is worth more than a hedge — the mill's alternative is
// to discover it from its buyer.
//
// The recognition list is DATA with an effective date, because this is exactly
// the kind of thing that moves. The watch agent watches this table; when a row
// changes, every affected installation and contract is recomputed and the
// people who were told "no" are told what changed.
// ───────────────────────────────────────────────────────────────────────────
import type { CarbonPricePaid } from '../record/types.js'

export interface SchemeRecognition {
  /** Matched against CarbonPricePaid.scheme, case-insensitively, as a substring. */
  match: string
  jurisdiction: string
  label: string
  labelZh: string
  recognised: boolean
  /** Why, in the terms a compliance lead needs. */
  reasonEn: string
  reasonZh: string
  /** When this determination was last checked. Stale entries are shown as such. */
  asOf: string
  clauseIds: string[]
}

export const RECOGNITION: SchemeRecognition[] = [
  {
    match: 'china national ets', jurisdiction: 'CN',
    label: 'China national ETS (全国碳排放权交易市场)', labelZh: '全国碳排放权交易市场',
    recognised: false,
    reasonEn: 'Not currently recognised for an Article 9 deduction. The scheme allocates allowances free of charge against an intensity benchmark rather than imposing a price on each tonne emitted, so there is no carbon price effectively paid on the declared embedded emissions to deduct. Steel’s inclusion in the scheme does not by itself change this.',
    reasonZh: '目前不获认可作第9条扣减。该机制按强度基准免费分配配额，而非就每吨排放征收价格，故就申报的隐含排放并无实际已付碳价可供扣减。钢铁行业被纳入该机制本身并不改变此结论。',
    asOf: '2026-09-01', clauseIds: ['cbam.art9'],
  },
  {
    match: 'guangdong', jurisdiction: 'CN', label: 'Guangdong pilot ETS', labelZh: '广东碳排放权交易试点',
    recognised: false,
    reasonEn: 'Regional pilot scheme; not currently recognised. The same free-allocation structure applies and the pilots are being folded into the national scheme.',
    reasonZh: '区域试点机制，目前不获认可。其免费分配结构相同，且试点正逐步并入全国机制。',
    asOf: '2026-09-01', clauseIds: ['cbam.art9'],
  },
  {
    match: 'uk ets', jurisdiction: 'GB', label: 'UK Emissions Trading Scheme', labelZh: '英国碳排放交易体系',
    recognised: true,
    reasonEn: 'A cap-and-trade scheme imposing a price on emitted tonnes. A deduction may be claimed for the price effectively paid, net of free allocation, certified by an independent person.',
    reasonZh: '为总量控制与交易机制，对已排放吨数定价。可就实际已付价格（扣除免费配额后）申请扣减，并须经独立人士认证。',
    asOf: '2026-09-01', clauseIds: ['cbam.art9'],
  },
]

export interface Article9Result {
  /** tCO₂e of the declared embedded emissions this claim could cover. */
  declaredTco2e: number
  /** The deduction actually available, in CBAM certificates (1 = 1 tCO₂e). */
  deductibleCertificates: number
  /** Gross amount paid, before any of it is disallowed. */
  paidGross: { amount: number; currency: string; scheme: string }[]
  lines: Article9Line[]
  /** The plain answer, first. */
  verdictEn: string
  verdictZh: string
  clauseIds: string[]
}

export interface Article9Line {
  scheme: string
  recognition: SchemeRecognition | null
  paid: number
  currency: string
  freeAllocation: number
  deductible: number
  reasonEn: string
  reasonZh: string
}

/** Assess every carbon price the operator paid against the recognition list.
 *
 *  Deliberately returns zero rather than an optimistic estimate for an
 *  unrecognised scheme: the deduction is the buyer's to claim and a wrong
 *  encouragement here becomes a refused claim on the buyer's declaration. */
export function assessArticle9(paid: CarbonPricePaid[], declaredTco2e: number): Article9Result {
  const lines: Article9Line[] = paid.map((p) => {
    const rec = RECOGNITION.find((r) => p.scheme.toLowerCase().includes(r.match)) ?? null
    const free = p.freeAllocation?.value ?? 0
    if (!rec) {
      return {
        scheme: p.scheme, recognition: null, paid: p.amount.value, currency: p.currency, freeAllocation: free, deductible: 0,
        reasonEn: `“${p.scheme}” is not on the recognition list. Whether it qualifies has not been determined, so no deduction is assumed. This is an open question, not a refusal.`,
        reasonZh: `“${p.scheme}”不在认可清单内。其是否符合条件尚未确定，故不假定任何扣减。此为待决问题，而非否定结论。`,
      }
    }
    if (!rec.recognised) {
      return { scheme: p.scheme, recognition: rec, paid: p.amount.value, currency: p.currency, freeAllocation: free, deductible: 0, reasonEn: rec.reasonEn, reasonZh: rec.reasonZh }
    }
    // Recognised: the deduction is the price paid on the declared tonnes, net of
    // free allocation. Certificates, not currency — the surrender is in units.
    const netUnits = Math.max(0, (p.unitsSurrendered?.value ?? 0) - free)
    const deductible = Math.min(netUnits, declaredTco2e)
    return {
      scheme: p.scheme, recognition: rec, paid: p.amount.value, currency: p.currency, freeAllocation: free, deductible,
      reasonEn: `${rec.reasonEn} Net of ${free.toLocaleString()} free allowances, ${deductible.toLocaleString()} certificates may be claimed, subject to independent certification.`,
      reasonZh: `${rec.reasonZh} 扣除 ${free.toLocaleString()} 单位免费配额后，可申请 ${deductible.toLocaleString()} 份证书，惟须经独立认证。`,
    }
  })

  const deductible = lines.reduce((a, l) => a + l.deductible, 0)
  const unrecognised = lines.filter((l) => l.recognition && !l.recognition.recognised)
  const undetermined = lines.filter((l) => !l.recognition)

  const verdictEn = !paid.length
    ? 'No carbon price paid in the country of origin has been recorded, so no Article 9 deduction arises.'
    : deductible > 0
      ? `${deductible.toLocaleString()} certificates of deduction are available, subject to independent certification.`
      : unrecognised.length
        ? `No Article 9 deduction is available. ${unrecognised.map((l) => l.scheme).join(', ')} is not currently recognised, so the domestic carbon cost the installation genuinely bears does not reduce the buyer’s surrender.`
        : 'No deduction has been established; the schemes recorded are not on the recognition list and their status is undetermined.'

  const verdictZh = !paid.length
    ? '未记录在原产国支付的碳价，故不产生第9条扣减。'
    : deductible > 0
      ? `可获 ${deductible.toLocaleString()} 份证书的扣减，惟须经独立认证。`
      : unrecognised.length
        ? `无第9条扣减可用。${unrecognised.map((l) => l.scheme).join('、')}目前不获认可，故本装置实际承担的国内碳成本并不减少买方的清缴义务。`
        : '未确定任何扣减；所记录机制不在认可清单内，其状态尚未确定。'

  return {
    declaredTco2e,
    deductibleCertificates: deductible,
    paidGross: paid.map((p) => ({ amount: p.amount.value, currency: p.currency, scheme: p.scheme })),
    lines, verdictEn, verdictZh,
    clauseIds: ['cbam.art9'],
  }
}
