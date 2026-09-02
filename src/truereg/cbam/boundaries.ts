// ───────────────────────────────────────────────────────────────────────────
// SYSTEM BOUNDARIES & PRODUCTION ROUTES — the regime's opinion about the plant.
//
// This is where CBAM vocabulary is finally allowed to exist. The record knows
// only that the plant has a unit it calls 2#高炉 that feeds a unit it calls
// 1#转炉; this file knows that Annex III has a closed list of routes, that a
// route decides the system boundary, and that the boundary decides which flows
// are attributed to the goods.
//
// The mapping from plant vernacular to route is the one genuinely interpretive
// step in the whole calculation, and it is the step this file refuses to guess
// at. `matchRoute` returns candidates with evidence and a confidence, and says
// AMBIGUOUS when the plant's own words do not settle it. The boundary agent
// then asks a human. A silent guess here is a wrong number everywhere.
// ───────────────────────────────────────────────────────────────────────────
import type { ProcessUnit, RecordBundle } from '../record/types.js'

export type GoodsCategory = 'sintered-ore' | 'pig-iron' | 'dri' | 'crude-steel' | 'iron-steel-products' | 'ferro-alloys'

export interface Route {
  id: string
  category: GoodsCategory
  nameEn: string
  nameZh: string
  /** Precursor goods carried into this route's output under Annex III. */
  relevantPrecursors: GoodsCategory[]
  /** Is electricity consumption attributed (i.e. is the good in Annex II)? */
  indirectApplies: boolean
  /** Plant-vernacular markers, in Chinese and English, that indicate this route.
   *  Matching is evidence, never proof — see matchRoute. */
  markers: { zh: string[]; en: string[] }
  /** Flows the boundary EXCLUDES, which is where over-declaration comes from. */
  excludes: string[]
  clauseIds: string[]
}

export const ROUTES: Route[] = [
  {
    id: 'sinter', category: 'sintered-ore', nameEn: 'Sinter plant', nameZh: '烧结',
    relevantPrecursors: [], indirectApplies: true,
    markers: { zh: ['烧结', '球团'], en: ['sinter', 'pellet'] },
    excludes: ['downstream ironmaking fuel', 'rolling mill energy'],
    clauseIds: ['cbam.annexIII'],
  },
  {
    id: 'bf', category: 'pig-iron', nameEn: 'Blast furnace route (hot metal / pig iron)', nameZh: '高炉路线（铁水／生铁）',
    relevantPrecursors: ['sintered-ore'], indirectApplies: true,
    markers: { zh: ['高炉', '炼铁', '铁水'], en: ['blast furnace', 'bf', 'hot metal', 'ironmaking'] },
    excludes: ['steelmaking converter emissions', 'downstream rolling'],
    clauseIds: ['cbam.annexIII'],
  },
  {
    id: 'dri', category: 'dri', nameEn: 'Direct reduced iron', nameZh: '直接还原铁',
    relevantPrecursors: [], indirectApplies: true,
    markers: { zh: ['直接还原', '气基竖炉'], en: ['dri', 'direct reduced', 'midrex', 'hbi'] },
    excludes: ['melting energy'],
    clauseIds: ['cbam.annexIII'],
  },
  {
    id: 'bof', category: 'crude-steel', nameEn: 'Basic oxygen furnace route (crude steel)', nameZh: '转炉路线（粗钢）',
    relevantPrecursors: ['pig-iron', 'dri'], indirectApplies: true,
    markers: { zh: ['转炉', '炼钢', '连铸'], en: ['bof', 'converter', 'basic oxygen', 'steelmaking', 'continuous casting'] },
    excludes: ['blast-furnace direct emissions (carried as the pig-iron precursor instead)', 'hot rolling'],
    clauseIds: ['cbam.annexIII', 'cbam.annexIV'],
  },
  {
    id: 'eaf', category: 'crude-steel', nameEn: 'Electric arc furnace route (crude steel)', nameZh: '电弧炉路线（粗钢）',
    relevantPrecursors: ['dri', 'pig-iron'], indirectApplies: true,
    markers: { zh: ['电弧炉', '电炉', '废钢'], en: ['eaf', 'electric arc', 'scrap melting'] },
    excludes: ['scrap upstream emissions (scrap carries none)'],
    clauseIds: ['cbam.annexIII', 'cbam.annexIV'],
  },
  {
    id: 'products', category: 'iron-steel-products', nameEn: 'Iron or steel products (rolling, coating)', nameZh: '钢铁制品（轧制、涂镀）',
    relevantPrecursors: ['crude-steel'], indirectApplies: true,
    markers: { zh: ['轧机', '热轧', '冷轧', '镀锌', '涂层'], en: ['rolling', 'hot strip', 'cold rolling', 'galvanis', 'coating'] },
    excludes: ['upstream steelmaking direct emissions (carried as the crude-steel precursor)'],
    clauseIds: ['cbam.annexIII'],
  },
]

export const getRoute = (id: string) => ROUTES.find((r) => r.id === id)

export interface RouteMatch {
  route: Route
  /** 0–1. Marker evidence only — never a substitute for a human confirming it. */
  confidence: number
  /** The exact plant strings that produced the match. Shown to the human. */
  evidence: { unitId: string; localName: string; marker: string }[]
}

export interface BoundaryMapping {
  processUnitId: string
  localName: string
  /** null when the plant's own words do not settle it — the escalation case. */
  resolved: Route | null
  candidates: RouteMatch[]
  status: 'resolved' | 'ambiguous' | 'unrecognised'
  /** What a human is being asked, in both languages. Empty when resolved. */
  questionEn?: string
  questionZh?: string
}

const norm = (s: string) => s.toLowerCase().trim()

/** Map one process unit onto a route from the plant's own vocabulary.
 *
 *  Deliberately conservative. Two routes matching with comparable evidence is
 *  AMBIGUOUS, not "pick the higher score": a converter shop and an arc furnace
 *  shop both say 炼钢, and choosing wrong swaps a coal footprint for a grid one. */
export function matchUnit(u: ProcessUnit): BoundaryMapping {
  const hay = [u.localName, u.name ?? '', u.describedFunction ?? ''].map(norm).join(' ')
  const matches: RouteMatch[] = []
  for (const r of ROUTES) {
    const evidence: RouteMatch['evidence'] = []
    for (const m of r.markers.zh) if (hay.includes(m)) evidence.push({ unitId: u.id, localName: u.localName, marker: m })
    for (const m of r.markers.en) if (hay.includes(norm(m))) evidence.push({ unitId: u.id, localName: u.localName, marker: m })
    if (evidence.length) {
      // Longer, more specific markers are stronger evidence: 电弧炉 beats 炼钢.
      const strength = Math.max(...evidence.map((e) => e.marker.length))
      matches.push({ route: r, confidence: Math.min(1, 0.45 + strength * 0.09 + (evidence.length - 1) * 0.08), evidence })
    }
  }
  matches.sort((a, b) => b.confidence - a.confidence)

  if (!matches.length) {
    return {
      processUnitId: u.id, localName: u.localName, resolved: null, candidates: [], status: 'unrecognised',
      questionEn: `No Annex III production route matches “${u.localName}”. What does this unit do, and does its output leave the installation?`,
      questionZh: `“${u.localName}”未匹配到附件三的任何生产路线。该单元的功能是什么？其产出是否离开本装置？`,
    }
  }
  const [top, second] = matches
  const decisive = !second || top.confidence - second.confidence >= 0.15
  if (decisive) return { processUnitId: u.id, localName: u.localName, resolved: top.route, candidates: matches, status: 'resolved' }
  return {
    processUnitId: u.id, localName: u.localName, resolved: null, candidates: matches, status: 'ambiguous',
    questionEn: `“${u.localName}” matches ${matches.slice(0, 2).map((m) => m.route.nameEn).join(' and ')} equally. Which is it? The two routes attribute different fuels and produce materially different emissions.`,
    questionZh: `“${u.localName}”同时匹配${matches.slice(0, 2).map((m) => m.route.nameZh).join('与')}，证据相当。实际为哪一路线？两者归属的燃料不同，所得排放差异重大。`,
  }
}

export function mapBoundaries(b: RecordBundle): BoundaryMapping[] {
  return b.processUnits.map(matchUnit)
}

/** Which flows the boundary attributes to a route's output. Everything the
 *  boundary excludes is listed too, because a verifier's first question is
 *  what you LEFT OUT and why. */
export function attributedFlows(b: RecordBundle, mappings: BoundaryMapping[], routeId: string) {
  const unitIds = new Set(mappings.filter((m) => m.resolved?.id === routeId).map((m) => m.processUnitId))
  return {
    unitIds: [...unitIds],
    energy: b.energyFlows.filter((e) => unitIds.has(e.processUnitId)),
    materials: b.materialFlows.filter((m) => unitIds.has(m.processUnitId)),
    direct: b.directEmissions.filter((d) => unitIds.has(d.processUnitId)),
    excluded: getRoute(routeId)?.excludes ?? [],
  }
}
