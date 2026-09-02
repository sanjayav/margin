// ───────────────────────────────────────────────────────────────────────────
// EMBEDDED EMISSIONS — Annex IV, deterministically.
//
// NO MODEL IS IN THIS PATH. Given the same record and the same corpus version
// this function returns byte-identical output, and every term it produces
// carries the flow it came from, the factor it used, the data quality behind it
// and the clause that authorises it. That trace is the difference between a
// number a verifier accepts and a number a chatbot asserted.
//
// The shape of Annex IV:
//
//   attributed emissions = direct emissions of the process
//                        + emissions of consumed heat
//                        + indirect emissions of consumed electricity (Annex II goods)
//
//   specific embedded emissions (SEE) = attributed emissions / activity level
//
//   complex goods: SEE(good) = SEE(own process) + Σ (precursor mass per tonne × SEE(precursor))
//
// Unknowns are returned, never assumed. A precursor with no supplier data does
// not silently become zero and does not silently become a default: it is
// reported as an unknown, and the caller decides — with the human — whether to
// substitute a default and carry that fact forward.
// ───────────────────────────────────────────────────────────────────────────
import type { RecordBundle, ProductRecord, DataQuality } from '../record/types.js'
import { attributedFlows, getRoute, mapBoundaries, type BoundaryMapping, type GoodsCategory } from './boundaries.js'
import { defaultIntensity } from './defaults.js'
import { fuelFactor, gridFactor, type Factor } from './factors.js'

export interface Term {
  /** What this contributes to. */
  bucket: 'direct' | 'indirect' | 'precursor'
  label: string
  labelZh?: string
  /** tCO₂e over the period. */
  tco2e: number
  /** Human-readable arithmetic, e.g. "412,000 t coke × 3.14 tCO₂e/t". */
  maths: string
  quality: DataQuality
  factor?: Factor
  sourceRefs: string[]
  clauseIds: string[]
}

export interface Unknown {
  id: string
  what: string
  whatZh: string
  /** What would resolve it — the precursor agent's queue. */
  needed: string
  /** Rough tCO₂e at stake if it is wrong, where that can be bounded. */
  materialityTco2e?: number
  blocking: boolean
}

export type Basis = 'actual' | 'partial' | 'default'

export interface EmbeddedEmissions {
  productId: string
  productName: string
  routeId: string | null
  category: GoodsCategory | null
  /** Actual output over the period, tonnes. */
  activityLevel: number
  direct: number
  indirect: number
  precursor: number
  /** Attributed emissions over the period, tCO₂e. */
  attributed: number
  /** Specific embedded emissions, tCO₂e per tonne. null when not determinable. */
  see: number | null
  seeDirect: number | null
  seeIndirect: number | null
  terms: Term[]
  unknowns: Unknown[]
  basis: Basis
  /** True when every factor and table used is the published one. When false the
   *  figure is indicative and must be labelled as such wherever it appears. */
  publishedInputs: boolean
  /** Every caveat the inputs carried, verbatim, for display. */
  caveats: string[]
  clauseIds: string[]
  /** Weakest data quality anywhere in the chain — the verifier's first target. */
  weakestQuality: DataQuality | null
}

export interface CalcOptions {
  /** Override the grid factor with a contractual/PPA figure. */
  overrideElectricity?: Factor
  /** Substitute defaults for unresolved precursors. Off by default: the honest
   *  answer is "unknown", and substituting is a decision a human takes. */
  substituteDefaultsForUnknownPrecursors?: boolean
  /** Country whose defaults apply when substituting. Defaults to the installation's. */
  defaultsCountry?: string
  /** SEE of precursors this installation produced ITSELF, by category.
   *  An integrated mill makes its own sinter and hot metal; Annex IV carries
   *  those into crude steel as precursors just the same, but their SEE is
   *  computed here rather than declared by a supplier. Populated by
   *  calculateAll(), which walks the routes in production order. */
  internalSee?: Map<GoodsCategory, { see: number; basis: Basis; productName: string }>
}

const QRANK: Record<DataQuality, number> = { measured: 4, calculated: 3, 'supplier-declared': 2, estimated: 1, default: 0 }
const toMWh = (v: number, u: string) => (u === 'kWh' ? v / 1000 : u === 'GWh' ? v * 1000 : v)
const n = (x: number, d = 2) => x.toLocaleString('en-GB', { maximumFractionDigits: d })

/** Route for a product: the route its process units resolved to. A product
 *  whose units disagree is left unrouted rather than forced. */
function routeFor(p: ProductRecord, mappings: BoundaryMapping[]): { routeId: string | null; ambiguous: BoundaryMapping[] } {
  const mine = mappings.filter((m) => p.processUnitIds.includes(m.processUnitId))
  const resolved = [...new Set(mine.map((m) => m.resolved?.id).filter(Boolean) as string[])]
  const ambiguous = mine.filter((m) => m.status !== 'resolved')
  // The route of a multi-step product is the LAST resolved step — the one that
  // produced the saleable good. Upstream steps are carried as precursors.
  const order = ['sinter', 'bf', 'dri', 'bof', 'eaf', 'products']
  const last = resolved.sort((a, b) => order.indexOf(a) - order.indexOf(b)).pop() ?? null
  return { routeId: last, ambiguous }
}

export function calculateEmbedded(b: RecordBundle, product: ProductRecord, opts: CalcOptions = {}, mappings?: BoundaryMapping[]): EmbeddedEmissions {
  const maps = mappings ?? mapBoundaries(b)
  const { routeId, ambiguous } = routeFor(product, maps)
  const route = routeId ? getRoute(routeId) : null
  const terms: Term[] = []
  const unknowns: Unknown[] = []
  const caveats: string[] = []
  const factors: Factor[] = []
  const clauseIds = new Set<string>(['cbam.art7', 'cbam.annexIV'])
  const country = opts.defaultsCountry ?? b.installation.country

  for (const m of ambiguous) {
    unknowns.push({
      id: `boundary.${m.processUnitId}`,
      what: `Production route for “${m.localName}” is ${m.status}`,
      whatZh: `“${m.localName}”的生产路线${m.status === 'ambiguous' ? '存在歧义' : '无法识别'}`,
      needed: m.questionEn ?? 'A human must confirm which Annex III route this unit belongs to.',
      blocking: true,
    })
  }

  const activityLevel = product.output.unit === 't' ? product.output.value : 0
  if (activityLevel <= 0) {
    unknowns.push({
      id: 'activity.level', what: 'Activity level (actual output over the period) is not established',
      whatZh: '活动水平（报告期实际产量）未确定',
      needed: 'Production records for the period, in tonnes of saleable output.', blocking: true,
    })
  }

  // ── direct ────────────────────────────────────────────────────────────────
  // Preference order: an operator's own measured/calculated source-stream figure
  // beats anything we would derive from fuel. Deriving is the fallback, and the
  // trace says which happened.
  const flows = routeId ? attributedFlows(b, maps, routeId) : { unitIds: [], energy: [], materials: [], direct: [], excluded: [] }
  let direct = 0
  if (flows.direct.length) {
    for (const d of flows.direct) {
      direct += d.amount.value
      terms.push({
        bucket: 'direct', label: `${d.category} emissions — ${d.method}`,
        tco2e: d.amount.value,
        maths: `${n(d.amount.value)} tCO₂e reported by the operator (${d.method}, ${d.amount.quality})`,
        quality: d.amount.quality, sourceRefs: [d.amount.sourceRef, ...d.documentIds].filter(Boolean) as string[],
        clauseIds: ['cbam.annexIV'],
      })
    }
  } else {
    for (const e of flows.energy) {
      if (e.carrier === 'electricity') continue
      const f = fuelFactor(e.carrier)
      if (!f) {
        unknowns.push({
          id: `fuel.${e.id}`, what: `No emission factor for fuel “${e.carrierLocal ?? e.carrier}”`,
          whatZh: `燃料“${e.carrierLocal ?? e.carrier}”无排放因子`,
          needed: 'A published factor, or a laboratory carbon-content analysis for this stream.', blocking: false,
        })
        continue
      }
      // Energy-denominated factors need the fuel's energy content; a mass-denominated one does not.
      let qty = e.amount.value
      let mathsIn = `${n(qty)} ${e.amount.unit}`
      if (f.per === 'GJ' && e.amount.unit !== 'GJ') {
        if (!e.ncv) {
          unknowns.push({
            id: `ncv.${e.id}`, what: `Net calorific value missing for “${e.carrierLocal ?? e.carrier}”`,
            whatZh: `“${e.carrierLocal ?? e.carrier}”缺少低位发热量`,
            needed: 'NCV from a laboratory analysis. Note that plant records often quote the GROSS value; using it overstates energy.', blocking: false,
          })
          continue
        }
        qty = e.amount.value * e.ncv.value
        mathsIn = `${n(e.amount.value)} ${e.amount.unit} × ${n(e.ncv.value, 3)} ${e.ncv.unit} NCV = ${n(qty)} GJ`
      }
      const t = qty * f.value
      direct += t
      factors.push(f)
      terms.push({
        bucket: 'direct', label: `${e.carrier} combustion`, labelZh: e.carrierLocal,
        tco2e: t, maths: `${mathsIn} × ${f.value} tCO₂e/${f.per} = ${n(t)} tCO₂e`,
        quality: e.amount.quality, factor: f,
        sourceRefs: [e.amount.sourceRef, ...e.documentIds].filter(Boolean) as string[],
        clauseIds: ['cbam.annexIV'],
      })
    }
    if (!flows.energy.length && !flows.direct.length && routeId) {
      unknowns.push({
        id: 'direct.none', what: 'No direct emissions or fuel consumption attributed to this process',
        whatZh: '未有直接排放或燃料消耗归属于该过程',
        needed: 'Process logs and energy invoices for the units inside the system boundary.', blocking: true,
      })
    }
  }

  // ── indirect (electricity) ────────────────────────────────────────────────
  let indirect = 0
  if (route?.indirectApplies) {
    clauseIds.add('cbam.art3')
    const elec = flows.energy.filter((e) => e.carrier === 'electricity')
    if (elec.length) {
      const gf = opts.overrideElectricity ?? gridFactor(b.installation.country)
      factors.push(gf)
      for (const e of elec) {
        const mwh = toMWh(e.amount.value, e.amount.unit)
        const t = mwh * gf.value
        indirect += t
        terms.push({
          bucket: 'indirect', label: `electricity — ${gf.label}`, labelZh: e.carrierLocal,
          tco2e: t, maths: `${n(mwh)} MWh × ${gf.value} tCO₂e/MWh = ${n(t)} tCO₂e`,
          quality: e.amount.quality, factor: gf,
          sourceRefs: [e.amount.sourceRef, ...e.documentIds].filter(Boolean) as string[],
          clauseIds: ['cbam.art3', 'cbam.annexIV'],
        })
      }
    } else {
      unknowns.push({
        id: 'indirect.none', what: 'Electricity consumption for this process is not established',
        whatZh: '该过程的电力消耗未确定',
        needed: 'Metered electricity consumption or utility invoices for the units inside the boundary.', blocking: false,
      })
    }
  }

  // ── precursors ────────────────────────────────────────────────────────────
  let precursor = 0
  if (route?.relevantPrecursors.length) {
    clauseIds.add('cbam.annexIII')
    for (const cat of route.relevantPrecursors) {
      const decls = b.supplierDeclarations.filter((s) => precursorCategory(s.material) === cat)
      // Scoped to the units INSIDE this route's boundary. Scanning every flow in
      // the bundle would let a blast furnace's ore appear as a rolling mill's
      // precursor once a second product exists.
      const flowsIn = flows.materials.filter((m) => m.direction === 'in' && precursorCategory(m.material) === cat)
      // The quantity that must be accounted for is what the process CONSUMED,
      // not what a supplier happened to declare. Taking the declared figure as
      // the denominator was hiding the gap it exists to reveal.
      const declaredT = decls.reduce((a, d) => a + d.received.value, 0)
      const flowT = flowsIn.reduce((a, m) => a + m.amount.value, 0)
      const tonnes = Math.max(flowT, declaredT)
      if (tonnes <= 0) continue

      // Internally produced precursor: the mill made it, so its SEE is known
      // from this same calculation rather than from a supplier's paperwork.
      // Everything consumed beyond what suppliers shipped is the mill's own.
      const internal = opts.internalSee?.get(cat)
      const internalT = internal ? Math.max(0, tonnes - declaredT) : 0
      if (internal && internalT > 0.5) {
        const t = internalT * internal.see
        precursor += t
        terms.push({
          bucket: 'precursor', label: `${cat.replace(/-/g, ' ')} produced on site (${internal.productName})`,
          tco2e: t,
          maths: `${n(internalT)} t × ${n(internal.see, 3)} tCO₂e/t computed for this installation = ${n(t)} tCO₂e`,
          quality: internal.basis === 'actual' ? 'calculated' : 'estimated',
          sourceRefs: [], clauseIds: ['cbam.annexIII', 'cbam.annexIV'],
        })
      }

      const resolved = decls.filter((d) => d.declaredIntensity && (d.status === 'received' || d.status === 'verified'))
      const resolvedT = resolved.reduce((a, d) => a + d.received.value, 0) + internalT
      for (const d of resolved) {
        const t = d.received.value * d.declaredIntensity!.value
        precursor += t
        terms.push({
          bucket: 'precursor', label: `${d.material} from ${d.supplierName}`, labelZh: d.supplierNameLocal,
          tco2e: t,
          maths: `${n(d.received.value)} t × ${n(d.declaredIntensity!.value, 3)} tCO₂e/t (${d.status}) = ${n(t)} tCO₂e`,
          quality: d.status === 'verified' ? 'supplier-declared' : 'supplier-declared',
          sourceRefs: d.documentIds, clauseIds: ['cbam.annexIII', 'cbam.annexIV'],
        })
      }

      const gap = tonnes - resolvedT
      if (gap > 0.5) {
        const di = defaultIntensity(cat, country, true)
        const materiality = di ? gap * di.total : undefined
        if (opts.substituteDefaultsForUnknownPrecursors && di) {
          precursor += gap * di.total
          caveats.push(di.caveat)
          terms.push({
            bucket: 'precursor', label: `${cat} — unresolved, carried at default`,
            tco2e: gap * di.total,
            maths: `${n(gap)} t × ${n(di.total, 3)} tCO₂e/t default (${di.status}${di.fellBack ? ', country fallback' : ''}) = ${n(gap * di.total)} tCO₂e`,
            quality: 'default', sourceRefs: [], clauseIds: ['cbam.art7', 'cbam.annexIII'],
          })
        }
        unknowns.push({
          id: `precursor.${cat}`,
          what: `${n(gap)} t of ${cat.replace(/-/g, ' ')} has no supplier emissions data`,
          whatZh: `${n(gap)} 吨${cat === 'sintered-ore' ? '烧结矿' : cat === 'pig-iron' ? '生铁' : cat}缺少供应商排放数据`,
          needed: `A supplier declaration of embedded emissions per tonne. ${decls.filter((d) => d.status === 'requested').length} request(s) already outstanding.`,
          materialityTco2e: materiality,
          blocking: !opts.substituteDefaultsForUnknownPrecursors,
        })
      }
    }
  }

  const attributed = direct + indirect + precursor
  const blocked = unknowns.some((u) => u.blocking)
  const see = blocked || activityLevel <= 0 ? null : attributed / activityLevel
  const usedDefault = terms.some((t) => t.quality === 'default')
  const basis: Basis = blocked ? 'default' : usedDefault ? 'partial' : 'actual'
  const qualities = terms.map((t) => t.quality)
  const weakest = qualities.length ? qualities.reduce((a, q) => (QRANK[q] < QRANK[a] ? q : a)) : null
  const publishedInputs = factors.every((f) => f.status === 'published') && !usedDefault && factors.length > 0
  if (!publishedInputs) {
    for (const f of new Set(factors.filter((x) => x.status !== 'published').map((x) => `${x.label}: ${x.source}`))) caveats.push(f)
  }

  return {
    productId: product.id, productName: product.name, routeId, category: route?.category ?? null,
    activityLevel, direct, indirect, precursor, attributed,
    see, seeDirect: see == null ? null : direct / activityLevel, seeIndirect: see == null ? null : indirect / activityLevel,
    terms, unknowns, basis, publishedInputs, caveats: [...new Set(caveats)],
    clauseIds: [...clauseIds], weakestQuality: weakest,
  }
}

/** Map a free-text material name onto a precursor category. Conservative: an
 *  unrecognised material is not a precursor, because inventing one over-declares. */
export function precursorCategory(material: string): GoodsCategory | null {
  const m = material.toLowerCase()
  if (/sinter|烧结|pellet|球团/.test(m)) return 'sintered-ore'
  if (/pig iron|hot metal|生铁|铁水/.test(m)) return 'pig-iron'
  if (/dri|hbi|direct reduced|直接还原/.test(m)) return 'dri'
  if (/slab|billet|bloom|crude steel|板坯|方坯|粗钢/.test(m)) return 'crude-steel'
  if (/ferro|合金/.test(m)) return 'ferro-alloys'
  return null
}

/** Production order. A precursor must be costed before the good that consumes
 *  it, which is the only reason this ordering exists. */
const ROUTE_ORDER = ['sinter', 'bf', 'dri', 'bof', 'eaf', 'products']

export function calculateAll(b: RecordBundle, opts: CalcOptions = {}): EmbeddedEmissions[] {
  const maps = mapBoundaries(b)
  const internalSee = new Map<GoodsCategory, { see: number; basis: Basis; productName: string }>()
  const order = [...b.products].sort((a, z) => {
    const ra = ROUTE_ORDER.indexOf(routeFor(a, maps).routeId ?? '')
    const rz = ROUTE_ORDER.indexOf(routeFor(z, maps).routeId ?? '')
    return (ra < 0 ? 99 : ra) - (rz < 0 ? 99 : rz)
  })
  const out = new Map<string, EmbeddedEmissions>()
  for (const p of order) {
    const e = calculateEmbedded(b, p, { ...opts, internalSee }, maps)
    out.set(p.id, e)
    if (e.category && e.see != null && !internalSee.has(e.category)) {
      internalSee.set(e.category, { see: e.see, basis: e.basis, productName: e.productName })
    }
  }
  // Return in the caller's original product order — the production order is an
  // implementation detail of the chaining, not something a screen should see.
  return b.products.map((p) => out.get(p.id)!).filter(Boolean)
}
