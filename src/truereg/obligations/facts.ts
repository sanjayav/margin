// ───────────────────────────────────────────────────────────────────────────
// FACT PROJECTION — the one bridge between the neutral record and the graph.
//
// Rules read facts, never the record. That indirection is what stops a
// regulation's vocabulary leaking into the product record: a CBAM rule asks
// `destination.countries contains EU`, not `record.isCbamGood`. The projection
// itself is neutral — it describes the plant and the shipments, and has no
// opinion about which regime cares.
//
// Absence is preserved. A fact that cannot be established is simply not emitted,
// so the evaluator returns 'indeterminate' rather than quietly deciding that a
// duty does not apply. That is the "I don't know is a first-class answer" rule,
// enforced mechanically rather than requested in a prompt.
// ───────────────────────────────────────────────────────────────────────────
import type { RecordBundle, SalesContract, DataQuality } from '../record/types.js'
import type { FactSet, EvidenceProbe } from './graph.js'

const RANK: Record<DataQuality, number> = { measured: 4, calculated: 3, 'supplier-declared': 2, estimated: 1, default: 0 }

export function projectFacts(b: RecordBundle, contracts: SalesContract[]): FactSet {
  const f: FactSet = {}

  f['installation.country'] = b.installation.country
  f['installation.id'] = b.installation.id
  f['operator.country'] = b.operator.country
  f['period.from'] = b.period.from
  f['period.to'] = b.period.to

  // Products and how they are classified. Codes are emitted per scheme AND as a
  // flat list, because a rule should be able to ask "any CN code starting 72"
  // without knowing how many products there are.
  const cn = b.products.flatMap((p) => p.classification.filter((c) => c.scheme === 'CN').map((c) => c.code))
  if (cn.length) {
    f['product.cnCodes'] = cn
    f['product.cnChapters'] = [...new Set(cn.map((c) => c.slice(0, 2)))]
  }
  f['product.count'] = b.products.length
  const totalOut = b.products.reduce((a, p) => a + (p.output.unit === 't' ? p.output.value : 0), 0)
  if (totalOut > 0) f['product.outputTonnes'] = totalOut

  // Where the goods actually go. This is a commercial fact, not a regulatory one.
  if (contracts.length) {
    const dest = [...new Set(contracts.map((c) => c.buyerCountry))]
    f['destination.countries'] = dest
    f['destination.blocs'] = [...new Set(dest.map(euBloc).filter(Boolean) as string[])]
    f['contract.count'] = contracts.length
    f['contract.tonnes'] = contracts.reduce((a, c) => a + c.tonnes, 0)
  }

  // Emissions evidence available on site.
  const directTotal = b.directEmissions.reduce((a, d) => a + d.amount.value, 0)
  f['emissions.directSourceCount'] = b.directEmissions.length
  if (b.directEmissions.length) f['emissions.directTotalTco2e'] = directTotal
  const worst = [...b.directEmissions, ...b.energyFlows.map((e) => ({ amount: e.amount }))]
    .map((x) => RANK[x.amount.quality]).sort((a, z) => a - z)[0]
  if (worst !== undefined) f['emissions.weakestQualityRank'] = worst
  f['emissions.hasActuals'] = b.directEmissions.length > 0 && b.products.some((p) => p.output.value > 0)

  // Electricity — the fact that decides whether an indirect figure is possible.
  const elec = b.energyFlows.filter((e) => e.carrier === 'electricity')
  f['energy.electricityFlowCount'] = elec.length
  if (elec.length) f['energy.electricityMwh'] = elec.reduce((a, e) => a + toMWh(e.amount.value, e.amount.unit), 0)
  f['energy.purchasedElectricity'] = elec.some((e) => e.purchased)

  // Purchased inputs whose upstream footprint belongs to someone else.
  f['supplier.declarationCount'] = b.supplierDeclarations.length
  f['supplier.unresolvedCount'] = b.supplierDeclarations.filter((s) => s.status === 'none' || s.status === 'requested').length
  f['supplier.verifiedCount'] = b.supplierDeclarations.filter((s) => s.status === 'verified').length

  // Carbon price actually paid at home. Whether anyone credits it is decided in
  // the regime layer — this only records that money changed hands.
  const schemes = b.carbonPricesPaid.map((c) => c.scheme)
  f['carbonPrice.schemeCount'] = schemes.length
  if (schemes.length) {
    f['carbonPrice.schemes'] = schemes
    f['carbonPrice.paidTotal'] = b.carbonPricesPaid.reduce((a, c) => a + c.amount.value, 0)
    f['carbonPrice.hasFreeAllocation'] = b.carbonPricesPaid.some((c) => (c.freeAllocation?.value ?? 0) > 0)
  }

  // Documentary state — the intake queue, expressed as a fact.
  f['documents.count'] = b.documents.length
  f['documents.unstructuredCount'] = b.documents.filter((d) => !d.structured).length

  // Process shape, in the plant's own terms. Deliberately NOT a route
  // classification — that is an interpretation and belongs to cbam/boundaries.
  f['process.unitCount'] = b.processUnits.length
  if (b.processUnits.length) f['process.localNames'] = b.processUnits.map((u) => u.localName)

  return f
}

const EU27 = new Set(['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE'])
function euBloc(c: string): string | null { return EU27.has(c) ? 'EU' : c === 'GB' ? 'UK' : null }
function toMWh(v: number, unit: string): number {
  if (unit === 'MWh') return v
  if (unit === 'kWh') return v / 1000
  if (unit === 'GWh') return v * 1000
  return v
}

/** Answer an evidence probe against the record. Kept beside the projection so
 *  the graph never learns the record's shape. */
export function makeProbe(b: RecordBundle) {
  return (p: EvidenceProbe): { ok: boolean; partial?: boolean; detail: string } => {
    if ('documents' in p) {
      const hits = b.documents.filter((d) => d.kind === p.documents)
      const structured = hits.filter((d) => d.structured)
      const need = p.minCount ?? 1
      if (hits.length === 0) return { ok: false, detail: `no ${p.documents.replace(/-/g, ' ')} on file` }
      if (structured.length < need) return { ok: false, partial: true, detail: `${hits.length} on file, ${structured.length} structured — intake incomplete` }
      return { ok: true, detail: `${structured.length} structured ${p.documents.replace(/-/g, ' ')} document${structured.length === 1 ? '' : 's'}` }
    }
    if ('quantityQuality' in p) {
      const pool = p.quantityQuality === 'directEmissions' ? b.directEmissions.map((d) => d.amount)
        : p.quantityQuality === 'energyFlows' ? b.energyFlows.map((e) => e.amount)
        : p.quantityQuality === 'materialFlows' ? b.materialFlows.map((m) => m.amount)
        : p.quantityQuality === 'output' ? b.products.map((x) => x.output)
        : []
      if (!pool.length) return { ok: false, detail: `no ${p.quantityQuality} recorded` }
      const need = RANK[p.atLeast]
      const below = pool.filter((q) => RANK[q.quality] < need)
      if (!below.length) return { ok: true, detail: `${pool.length} quantities at ${p.atLeast} or better` }
      return { ok: false, partial: below.length < pool.length, detail: `${below.length} of ${pool.length} quantities below ${p.atLeast} (${[...new Set(below.map((q) => q.quality))].join(', ')})` }
    }
    const facts = projectFacts(b, [])
    const has = Object.prototype.hasOwnProperty.call(facts, p.fact)
    if (p.op === 'exists') return { ok: has, detail: has ? `${p.fact} present` : `${p.fact} not established` }
    if (!has) return { ok: false, detail: `${p.fact} not established` }
    const v = facts[p.fact]
    if (p.op === 'eq') return { ok: v === p.value, detail: `${p.fact} = ${String(v)}` }
    return { ok: Number(v) >= Number(p.value), detail: `${p.fact} = ${String(v)} (need ≥ ${String(p.value)})` }
  }
}
