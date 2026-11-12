/* ───────────────────────────────────────────────────────────────────────────
   The regulation registry — the level a person TRACKS.
   ---------------------------------------------------------------------------
   An instrument (catalogue.ts) is a legal text. A regulation is the programme
   a compliance lead actually follows — "EU CBAM", "India CAFE" — and it can
   span several instruments (the base regulation, its amendments, its drafts).
   Reg AI lets a workspace choose which regulations it tracks, per market; the
   radar, the reader, the briefing and the Regulatory watch agent all follow
   that choice.

   Honesty rules, same as the catalogue:
   · Key dates are the ones written into the instrument. Where a date depends
     on a later act or has been amended, it is marked `indicative` and the UI
     says so. Nothing here is the law; every entry names its source.
   · `packBacked` regulations have a rule pack and are priced by the engine.
     The rest are tracked and read, not computed — the UI never pretends
     otherwise.
   ─────────────────────────────────────────────────────────────────────────── */
import type { CountryId } from '../../../engine/types.js'
import type { IconName } from '../../design/icons.js'
import { INSTRUMENTS, STAGE_ORDER, type Instrument, type Stage } from './catalogue.js'

export type RegCategory = 'vehicle' | 'border' | 'trading' | 'product' | 'industry'

export const CATEGORY_META: Record<RegCategory, { label: string; short: string; icon: IconName; blurb: string }> = {
  vehicle:  { label: 'Vehicle CO₂ & fuel economy', short: 'Vehicle CO₂', icon: 'gauge',  blurb: 'Fleet-average targets the engine computes your position against.' },
  border:   { label: 'Carbon border adjustment',    short: 'Carbon border', icon: 'globe', blurb: 'A carbon price on imported steel, aluminium and other inputs.' },
  trading:  { label: 'Emissions trading',           short: 'Trading', icon: 'activity', blurb: 'Cap-and-trade systems that set the carbon price upstream of you.' },
  product:  { label: 'Product & type-approval',     short: 'Product', icon: 'shield',  blurb: 'Pollutant, durability and battery rules a model must meet to be sold.' },
  industry: { label: 'Industrial baselines',        short: 'Industry', icon: 'layers', blurb: 'Facility-level obligations on the heavy industry in your supply chain.' },
}

export const CATEGORY_ORDER: RegCategory[] = ['vehicle', 'border', 'trading', 'product', 'industry']

export interface Milestone {
  /** ISO date. */
  date: string
  label: string
  /** Depends on a later act, an amendment or a condition — shown as indicative. */
  indicative?: boolean
}

export interface Source { name: string; url: string }

export interface Regulation {
  id: string
  market: CountryId
  name: string
  /** One line, what it does to an automotive OEM. */
  tagline: string
  category: RegCategory
  /** Priced by a rule pack in the engine. */
  packBacked: boolean
  /** Tracked for a new workspace before anyone chooses. */
  defaultTracked: boolean
  milestones: Milestone[]
  sources: Source[]
}

export const REGULATIONS: Regulation[] = [
  /* ── European Union ───────────────────────────────────────────────────── */
  {
    id: 'eu-car-co2', market: 'EU', name: 'CO₂ standards for cars & vans', category: 'vehicle', packBacked: true, defaultTracked: true,
    tagline: 'Fleet-average CO₂ target per manufacturer, with a premium on every gram over it.',
    milestones: [
      { date: '2025-01-01', label: '2025 target step — 2025–27 assessed on a three-year average (2025 amendment)' },
      { date: '2030-01-01', label: '2030 target step' },
      { date: '2035-01-01', label: '100% reduction as legislated — subject to the review clause', indicative: true },
    ],
    sources: [{ name: 'EUR-Lex', url: 'https://eur-lex.europa.eu/eli/reg/2019/631/oj' }, { name: 'EEA CO₂ monitoring', url: 'https://www.eea.europa.eu' }],
  },
  {
    id: 'eu-cbam', market: 'EU', name: 'CBAM', category: 'border', packBacked: false, defaultTracked: true,
    tagline: 'Carbon price on imported steel, aluminium and other covered inputs.',
    milestones: [
      { date: '2023-10-01', label: 'Transitional reporting began' },
      { date: '2026-01-01', label: 'Definitive period — authorised declarants and certificates' },
      { date: '2027-02-01', label: 'Certificate sales open (as simplified in 2025)', indicative: true },
      { date: '2027-08-31', label: 'First annual declaration for 2026 imports', indicative: true },
    ],
    sources: [{ name: 'EUR-Lex', url: 'https://eur-lex.europa.eu/eli/reg/2023/956/oj' }, { name: 'DG TAXUD · CBAM', url: 'https://taxation-customs.ec.europa.eu/carbon-border-adjustment-mechanism_en' }],
  },
  {
    id: 'eu-ets', market: 'EU', name: 'EU ETS', category: 'trading', packBacked: false, defaultTracked: false,
    tagline: 'The carbon price behind CBAM and your European suppliers’ costs.',
    milestones: [
      { date: '2005-01-01', label: 'Scheme began' },
      { date: '2026-01-01', label: 'Free allocation to CBAM sectors starts phasing out' },
    ],
    sources: [{ name: 'EUR-Lex', url: 'https://eur-lex.europa.eu/eli/dir/2003/87/oj' }, { name: 'DG CLIMA', url: 'https://climate.ec.europa.eu' }],
  },
  {
    id: 'eu-ets2', market: 'EU', name: 'ETS2 · road transport fuels', category: 'trading', packBacked: false, defaultTracked: false,
    tagline: 'Carbon price on petrol and diesel — a demand driver for ZEVs.',
    milestones: [{ date: '2027-01-01', label: 'Surrender obligation starts (can slip a year under the price safeguard)', indicative: true }],
    sources: [{ name: 'EUR-Lex', url: 'https://eur-lex.europa.eu/eli/dir/2023/959/oj' }],
  },
  {
    id: 'eu-euro7', market: 'EU', name: 'Euro 7', category: 'product', packBacked: false, defaultTracked: true,
    tagline: 'Pollutant, brake-particle and battery-durability type-approval.',
    milestones: [
      { date: '2026-11-29', label: 'Applies to new types of cars and vans' },
      { date: '2027-11-29', label: 'Applies to all new cars and vans' },
    ],
    sources: [{ name: 'EUR-Lex', url: 'https://eur-lex.europa.eu/eli/reg/2024/1257/oj' }],
  },
  {
    id: 'eu-battery', market: 'EU', name: 'Battery Regulation', category: 'product', packBacked: false, defaultTracked: false,
    tagline: 'EV battery carbon footprint, passport and recycled content.',
    milestones: [{ date: '2027-02-18', label: 'Battery passport required for EV batteries' }],
    sources: [{ name: 'EUR-Lex', url: 'https://eur-lex.europa.eu/eli/reg/2023/1542/oj' }],
  },

  /* ── United Kingdom ───────────────────────────────────────────────────── */
  {
    id: 'uk-zev', market: 'UK', name: 'ZEV mandate', category: 'vehicle', packBacked: true, defaultTracked: true,
    tagline: 'A rising zero-emission share, traded as allowances.',
    milestones: [
      { date: '2024-01-01', label: 'Scheme began' },
      { date: '2030-01-01', label: '80% ZEV share for cars' },
      { date: '2035-01-01', label: '100% ZEV share for cars' },
    ],
    sources: [{ name: 'legislation.gov.uk', url: 'https://www.legislation.gov.uk/uksi/2023/1268/contents/made' }, { name: 'DfT', url: 'https://www.gov.uk/government/organisations/department-for-transport' }],
  },
  {
    id: 'uk-cbam', market: 'UK', name: 'UK CBAM', category: 'border', packBacked: false, defaultTracked: true,
    tagline: 'UK carbon charge on imported steel, aluminium and other covered goods.',
    milestones: [{ date: '2027-01-01', label: 'Charge applies to covered imports' }],
    sources: [{ name: 'GOV.UK · UK CBAM', url: 'https://www.gov.uk/government/consultations/introduction-of-a-uk-carbon-border-adjustment-mechanism' }],
  },
  {
    id: 'uk-ets', market: 'UK', name: 'UK ETS', category: 'trading', packBacked: false, defaultTracked: false,
    tagline: 'The UK carbon price — and the peg for UK CBAM.',
    milestones: [{ date: '2021-01-01', label: 'Scheme began' }],
    sources: [{ name: 'legislation.gov.uk', url: 'https://www.legislation.gov.uk/uksi/2020/1265/contents' }],
  },

  /* ── India ────────────────────────────────────────────────────────────── */
  {
    id: 'in-cafe', market: 'IN', name: 'CAFE norms', category: 'vehicle', packBacked: true, defaultTracked: true,
    tagline: 'Corporate-average fuel efficiency, assessed per manufacturer.',
    milestones: [
      { date: '2022-04-01', label: 'CAFE II in force' },
      { date: '2027-04-01', label: 'CAFE III draft trajectory begins (FY2027-28)', indicative: true },
    ],
    sources: [{ name: 'Bureau of Energy Efficiency', url: 'https://beeindia.gov.in' }, { name: 'Gazette of India', url: 'https://egazette.gov.in' }],
  },
  {
    id: 'in-ccts', market: 'IN', name: 'Carbon Credit Trading Scheme', category: 'trading', packBacked: false, defaultTracked: false,
    tagline: 'Emission-intensity targets for heavy industry in your supply chain.',
    milestones: [{ date: '2023-06-28', label: 'Scheme notified' }],
    sources: [{ name: 'Bureau of Energy Efficiency', url: 'https://beeindia.gov.in' }],
  },

  /* ── China ────────────────────────────────────────────────────────────── */
  {
    id: 'cn-dual-credit', market: 'CN', name: 'Dual-credit policy', category: 'vehicle', packBacked: true, defaultTracked: true,
    tagline: 'Two ledgers — fuel consumption and NEV credits — with offset rules.',
    milestones: [{ date: '2021-01-01', label: 'Current phase of CAFC and NEV targets' }],
    sources: [{ name: 'MIIT', url: 'https://www.miit.gov.cn' }],
  },
  {
    id: 'cn-ets', market: 'CN', name: 'National carbon market', category: 'trading', packBacked: false, defaultTracked: false,
    tagline: 'Carbon cost on Chinese steel and aluminium supply.',
    milestones: [
      { date: '2021-07-16', label: 'National trading began (power sector)' },
      { date: '2024-05-01', label: 'State Council interim regulations in effect' },
    ],
    sources: [{ name: 'Ministry of Ecology and Environment', url: 'https://www.mee.gov.cn' }],
  },

  /* ── Australia ────────────────────────────────────────────────────────── */
  {
    id: 'au-nves', market: 'AU', name: 'New Vehicle Efficiency Standard', category: 'vehicle', packBacked: true, defaultTracked: true,
    tagline: 'Mass-based CO₂ targets with transferable, expiring credits.',
    milestones: [
      { date: '2025-01-01', label: 'Standard began' },
      { date: '2025-07-01', label: 'Credits and debits start to accrue' },
    ],
    sources: [{ name: 'Federal Register of Legislation', url: 'https://www.legislation.gov.au' }, { name: 'Department of Infrastructure', url: 'https://www.infrastructure.gov.au' }],
  },
  {
    id: 'au-safeguard', market: 'AU', name: 'Safeguard Mechanism', category: 'industry', packBacked: false, defaultTracked: false,
    tagline: 'Declining baselines for Australia’s largest industrial emitters.',
    milestones: [{ date: '2023-07-01', label: 'Reformed baselines began declining' }],
    sources: [{ name: 'Clean Energy Regulator', url: 'https://cer.gov.au' }],
  },
  {
    id: 'au-leakage', market: 'AU', name: 'Carbon leakage review', category: 'border', packBacked: false, defaultTracked: false,
    tagline: 'Whether Australia adopts a border carbon adjustment. A review, not law.',
    milestones: [],
    sources: [{ name: 'DCCEEW', url: 'https://www.dcceew.gov.au' }],
  },
]

export const REG_BY_ID: Record<string, Regulation> = Object.fromEntries(REGULATIONS.map((r) => [r.id, r]))

export const DEFAULT_TRACKED = REGULATIONS.filter((r) => r.defaultTracked).map((r) => r.id)

export const MARKET_ORDER: CountryId[] = ['EU', 'UK', 'IN', 'CN', 'AU']

export const MARKET_NAME: Record<CountryId, string> = {
  EU: 'European Union', UK: 'United Kingdom', IN: 'India', CN: 'China', AU: 'Australia',
} as Record<CountryId, string>

export const instrumentsOf = (regId: string): Instrument[] =>
  INSTRUMENTS.filter((i) => i.regulation === regId)

/** The most settled stage any of a regulation's instruments has reached. */
export function regStage(regId: string): Stage {
  const stages = instrumentsOf(regId).map((i) => i.stage).filter((s) => s !== 'sunset')
  if (!stages.length) return 'consultation'
  return stages.sort((a, b) => STAGE_ORDER.indexOf(b) - STAGE_ORDER.indexOf(a))[0]
}

/** The latest stage — what is moving. A regulation in force with a draft
 *  amendment is "in force, draft moving", and that second half is the point. */
export function regMoving(regId: string): Stage | null {
  const s = instrumentsOf(regId).map((i) => i.stage)
  if (s.includes('consultation')) return 'consultation'
  if (s.includes('draft')) return 'draft'
  if (s.includes('notified')) return 'notified'
  return null
}

export interface DatedMilestone extends Milestone { reg: Regulation; at: number }

/** Milestones across the tracked regulations within a window, soonest first. */
export function upcoming(tracked: string[], fromMs: number, months: number): DatedMilestone[] {
  const until = new Date(fromMs)
  until.setMonth(until.getMonth() + months)
  return tracked
    .map((id) => REG_BY_ID[id]).filter(Boolean)
    .flatMap((reg) => reg.milestones.map((m) => ({ ...m, reg, at: Date.parse(m.date) })))
    .filter((m) => m.at >= fromMs && m.at <= until.getTime())
    .sort((a, b) => a.at - b.at)
}

/** Most recent past milestones — what just changed. */
export function recent(tracked: string[], fromMs: number, months: number): DatedMilestone[] {
  const since = new Date(fromMs)
  since.setMonth(since.getMonth() - months)
  return tracked
    .map((id) => REG_BY_ID[id]).filter(Boolean)
    .flatMap((reg) => reg.milestones.map((m) => ({ ...m, reg, at: Date.parse(m.date) })))
    .filter((m) => m.at < fromMs && m.at >= since.getTime())
    .sort((a, b) => b.at - a.at)
}
