// Early-warning intelligence feed — dated, sourced industry events.
// Illustrative records styled after real regulatory signals.
import type { CountryId } from './types'

export type EventKind = 'fine' | 'alliance' | 'dispute' | 'rule' | 'data'

export interface IntelEvent {
  id: string
  date: string
  country: CountryId | 'GLOBAL'
  kind: EventKind
  title: string
  body: string
  source: string
  impact: 'high' | 'medium' | 'low'
  parents?: string[]
}

export const INTEL: IntelEvent[] = [
  { id: 'e1', date: '2026-06-12', country: 'EU', kind: 'rule', impact: 'high',
    title: '2025–2027 averaging flexibility confirmed in Official Journal',
    body: 'Regulation (EU) 2025/1214 lets makers be judged on a three-year average for 2025–2027, easing single-year exceedances. Margin now lets you toggle this in Admin.',
    source: 'EUR-Lex · Official Journal L-series', parents: [] },
  { id: 'e2', date: '2026-06-03', country: 'EU', kind: 'alliance', impact: 'medium',
    title: 'MG Motor Europe signals openness to an open pool for 2026',
    body: 'A surplus of zero-emission registrations makes MG an attractive pooling partner. Surplus is currently absorbing roughly 3.1 g/km of headroom.',
    source: 'Industry filing · ACEA register', parents: ['MG Motor Europe'] },
  { id: 'e3', date: '2026-05-28', country: 'IN', kind: 'rule', impact: 'high',
    title: 'BEE confirms CAFE III norms commence FY2027-28',
    body: 'Draft CAFE 2027 constants (a=0.002, c=1170 kg) tighten the fuel-use target from 3.73 to 3.01 L/100km by FY2031-32. Super-credits for BEV remain at ×3.',
    source: 'Bureau of Energy Efficiency notification', parents: [] },
  { id: 'e4', date: '2026-05-21', country: 'AU', kind: 'fine', impact: 'high',
    title: 'NVES: first credit-shortfall liabilities accrue from Jul 2025 starts',
    body: 'Type 2 (light commercial) lines tighten fastest. Diesel-heavy makers face A$100/g exposure unless credits are purchased before the 2-year repayment window closes.',
    source: 'DCCEEW · NVES determination', parents: ['Ford Australia'] },
  { id: 'e5', date: '2026-05-15', country: 'UK', kind: 'dispute', impact: 'medium',
    title: 'Consultation opens on VETS ZEV mandate trajectory review',
    body: 'Government reviewing the 2030 non-ZE allowance (currently 0.20 for cars). A tighter path would pull the illustrative CO₂ line down further.',
    source: 'DfT consultation portal', parents: [] },
  { id: 'e6', date: '2026-05-09', country: 'EU', kind: 'fine', impact: 'high',
    title: 'Suzuki Motor Corporation flagged above 2025 line on current mix',
    body: 'On as-sold 2025 registrations the Suzuki parent sits above its mass-based target. Eco-innovation certification and a higher BEV share are the lowest-cost levers.',
    source: 'EEA monitoring · provisional', parents: ['Suzuki Motor Corporation'] },
  { id: 'e7', date: '2026-04-30', country: 'IN', kind: 'data', impact: 'low',
    title: 'India FY2027-28 model-level dataset refreshed',
    body: 'Maruti, Tata and Mahindra model lines updated with E20 carbon-neutral-fuel discounts (8%) and revised kerb masses.',
    source: 'SIAM / VAHAN aggregation', parents: [] },
  { id: 'e8', date: '2026-04-22', country: 'AU', kind: 'alliance', impact: 'medium',
    title: 'MG Australia credit surplus available on the illustrative market',
    body: 'BEV-led mix banks credits trading near A$50/unit — cheaper than the A$100/g penalty for short makers.',
    source: 'Trading simulator · illustrative', parents: ['MG Australia'] },
  { id: 'e9', date: '2026-04-10', country: 'EU', kind: 'rule', impact: 'medium',
    title: 'Eco-innovation cap reaffirmed at 7 g/km',
    body: 'Article 11 cap unchanged. Models can still claim certified off-cycle savings up to the cap; Margin applies MIN(model benefit, 7).',
    source: 'EUR-Lex', parents: [] },
  { id: 'e10', date: '2026-03-30', country: 'GLOBAL', kind: 'data', impact: 'low',
    title: 'US and China rule packs scoped for the next release',
    body: 'Architecture validated across four packs; adding a country is a config change, not a rebuild.',
    source: 'Margin roadmap', parents: [] },
]
