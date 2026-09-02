// ───────────────────────────────────────────────────────────────────────────
// THE NUMBER — the deterministic figure, with the whole derivation on screen.
//
// This is the surface a verifier reads over the customer's shoulder, so the
// number is never shown alone. Every term carries its arithmetic, its data
// quality and the clause behind it; every unknown is named with what it is
// worth; and the switch that decides whether unresolved precursors are carried
// at default is a visible, reversible human decision rather than a setting.
// ───────────────────────────────────────────────────────────────────────────
import { useMemo } from 'react'
import { useTr } from '../../truereg/ui/state'
import { mapBoundaries } from '../../truereg/cbam/boundaries'
import { calculateAll } from '../../truereg/cbam/emissions'
import { defaultIntensity } from '../../truereg/cbam/defaults'
import { DEMO_BUNDLE } from '../../truereg/record/demo'
import Icon from '../../components/Icon'
import { Bi, BasisBadge, Big, Caveat, ClauseChip, Figure, Lede, Panel, QualityDot, Scroller, TermChip, Unit, n0, n2 } from './parts'

const BUCKET = {
  direct: { label: 'Direct', zh: '直接', color: '#E8223B' },
  indirect: { label: 'Indirect (electricity)', zh: '间接（电力）', color: '#3B6FE0' },
  precursor: { label: 'Precursors', zh: '前体', color: '#8b5cf6' },
} as const

export default function TheNumber() {
  const substitute = useTr((s) => s.substituteDefaults)
  const setSubstitute = useTr((s) => s.setSubstituteDefaults)
  const { rows, maps } = useMemo(() => ({
    rows: calculateAll(DEMO_BUNDLE, { substituteDefaultsForUnknownPrecursors: substitute }),
    maps: mapBoundaries(DEMO_BUNDLE),
  }), [substitute])

  const open = maps.filter((m) => m.status !== 'resolved')
  const saleable = rows.filter((r) => r.category !== 'sintered-ore')

  const hrc = rows.find((r) => r.productId === 'pr-hrc')
  const hrcDefault = hrc?.category ? defaultIntensity(hrc.category, DEMO_BUNDLE.installation.country, true) : null
  const blocking = rows.reduce((a, r) => a + r.unknowns.filter((u) => u.blocking).length, 0)

  return (
    <div className="space-y-4 sm:space-y-5">
      <Lede meta={<>
        <span>{rows.length} products · {n0(rows.reduce((a, r) => a + r.activityLevel, 0))} t of output</span>
        {open.length > 0 && <span className="text-warn">{open.length} boundary question{open.length === 1 ? '' : 's'} open</span>}
        {blocking > 0 && <span className="text-danger">{blocking} figure{blocking === 1 ? '' : 's'} not determinable</span>}
      </>}>
        {hrc?.see == null
          ? <>Hot-rolled coil <Big tone="danger">cannot be stated</Big> until the blocking unknowns are closed.</>
          : <>Hot-rolled coil is proving at <Big>{n2(hrc.see, 3)}</Big> <Unit>tCO₂e/t</Unit>
              {hrcDefault && <>, <Big tone="safe">{n2(hrcDefault.total - hrc.see, 2)}</Big> <Unit>under the Chinese default</Unit></>}<Unit>.</Unit></>}
      </Lede>

      <Panel
        title="Specific embedded emissions"
        titleZh="单位隐含排放"
        hint={<>Attributed emissions divided by the activity level, plus the embedded emissions of relevant <TermChip id="precursor">precursors</TermChip> consumed. No model is in this path — the same record gives the same figure every time.</>}
        right={<ClauseChip ids={['cbam.annexIV', 'cbam.art7']} />}
      >
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
          {rows.map((e) => {
            const d = e.category ? defaultIntensity(e.category, DEMO_BUNDLE.installation.country, true) : null
            const better = e.see != null && d ? d.total - e.see : null
            return (
              <Figure key={e.productId}
                label={e.productName} labelZh={DEMO_BUNDLE.products.find((p) => p.id === e.productId)?.nameLocal}
                tone={e.see == null ? 'danger' : better != null && better > 0 ? 'safe' : 'ink'}
                value={e.see == null ? '—' : n2(e.see, 3)} unit={e.see == null ? undefined : 'tCO₂e/t'}
                sub={<>
                  {d && <span className="block">Default <span className="dnum font-semibold text-ink-300">{n2(d.total, 2)}</span>{better != null && better > 0 && <span className="ml-1.5 font-semibold text-safe">−{n2(better, 2)}</span>}</span>}
                  <span className="mt-1.5 block">{n0(e.activityLevel)} t over the period</span>
                </>}
              />
            )
          })}
        </div>

        <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-black/[0.07] bg-black/[0.02] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-[12.5px] font-bold text-ink-100">Carry unresolved precursors at their default value</div>
            <p className="mt-1 max-w-[62ch] text-[11.5px] leading-relaxed text-ink-500">
              {substitute
                ? 'On. A figure is stated, and every term that rests on a default is marked. Turn it off to see which products cannot honestly be stated at all yet.'
                : 'Off. Where a precursor is unresolved, no figure is stated. This is the strict reading — and the number a verifier would accept.'}
            </p>
          </div>
          <button onClick={() => setSubstitute(!substitute)} role="switch" aria-checked={substitute}
            className={`relative h-7 w-12 shrink-0 rounded-full border transition ${substitute ? 'border-warn/40 bg-warn/25' : 'border-black/[0.12] bg-black/[0.06]'}`}>
            <span className={`absolute top-[3px] h-[21px] w-[21px] rounded-full bg-white shadow transition-all ${substitute ? 'left-[24px]' : 'left-[3px]'}`} />
          </button>
        </div>
      </Panel>

      {open.length > 0 && (
        <Panel
          title={`${open.length} boundary question${open.length === 1 ? '' : 's'} for a person`}
          titleZh="待人工确认的边界问题"
          hint="The route decides which fuels are attributed, so a wrong route is a wrong number everywhere downstream. Where the plant’s own words do not settle it, the boundary agent asks rather than picks."
          right={<ClauseChip ids={['cbam.annexIII']} />}
        >
          <ul className="space-y-2.5">
            {open.map((m) => (
              <li key={m.processUnitId} className="rounded-2xl border border-warn/25 bg-warn/[0.035] p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="dnum text-[15px] font-bold text-ink-100" lang="zh-CN">{m.localName}</span>
                  <span className="chip !border-warn/25 !bg-warn/[0.08] !text-warn">{m.status}</span>
                </div>
                <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink-300"><Bi en={m.questionEn} zh={m.questionZh} /></p>
                {m.candidates.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {m.candidates.map((c) => (
                      <span key={c.route.id} className="chip">
                        <Bi en={c.route.nameEn} zh={c.route.nameZh} />
                        <span className="dnum ml-1 font-bold text-ink-400">{Math.round(c.confidence * 100)}%</span>
                        <span className="ml-1 text-ink-600">matched “{c.evidence.map((e) => e.marker).join(', ')}”</span>
                      </span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {saleable.map((e) => (
        <Panel key={e.productId}
          title={`How ${e.productName} was calculated`}
          titleZh={`${DEMO_BUNDLE.products.find((p) => p.id === e.productId)?.nameLocal ?? ''}的计算过程`}
          right={<BasisBadge basis={e.basis} published={e.publishedInputs} />}
        >
          {e.see != null && (
            <>
              <div className="mb-4 flex items-baseline gap-2">
                <span className="dnum text-[30px] font-bold leading-none tracking-[-0.035em] text-ink-100 sm:text-[38px]">{n2(e.see, 3)}</span>
                <span className="text-[13px] font-semibold text-ink-500">tCO₂e per tonne</span>
              </div>
              <div className="mb-1.5 flex h-2.5 w-full overflow-hidden rounded-full bg-black/[0.05]">
                {(['direct', 'indirect', 'precursor'] as const).map((b) => {
                  const v = b === 'direct' ? e.direct : b === 'indirect' ? e.indirect : e.precursor
                  const pct = e.attributed > 0 ? (v / e.attributed) * 100 : 0
                  if (pct <= 0) return null
                  return <span key={b} style={{ width: `${pct}%`, background: BUCKET[b].color }} data-tip={`${BUCKET[b].label}: ${n2(v / e.activityLevel, 3)} tCO₂e/t`} />
                })}
              </div>
              <div className="mb-5 flex flex-wrap gap-x-4 gap-y-1.5">
                {(['direct', 'indirect', 'precursor'] as const).map((b) => {
                  const v = b === 'direct' ? e.direct : b === 'indirect' ? e.indirect : e.precursor
                  if (v <= 0) return null
                  return (
                    <span key={b} className="flex items-center gap-1.5 text-[11.5px] text-ink-400">
                      <span className="h-2 w-2 rounded-full" style={{ background: BUCKET[b].color }} />
                      <Bi en={BUCKET[b].label} zh={BUCKET[b].zh} />
                      <span className="dnum font-bold text-ink-200">{n2(v / e.activityLevel, 3)}</span>
                    </span>
                  )
                })}
              </div>
            </>
          )}

          <Scroller>
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-black/[0.08]">
                  <th className="pb-2 pr-3 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-500">Term</th>
                  <th className="pb-2 pr-3 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-500">Arithmetic</th>
                  <th className="pb-2 pr-3 text-right text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-500">tCO₂e</th>
                  <th className="pb-2 text-right text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-500">Quality</th>
                </tr>
              </thead>
              <tbody>
                {e.terms.map((t, i) => (
                  <tr key={i} className="border-b border-black/[0.05] last:border-0">
                    <td className="py-2.5 pr-3 align-top">
                      <span className="flex items-center gap-2 text-[12.5px] font-semibold text-ink-200">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: BUCKET[t.bucket].color }} />
                        {t.label}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 align-top text-[11.5px] leading-relaxed text-ink-500">{t.maths}</td>
                    <td className="dnum py-2.5 pr-3 text-right align-top text-[12.5px] font-bold text-ink-200">{n0(t.tco2e)}</td>
                    <td className="py-2.5 text-right align-top">
                      <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-500"><QualityDot q={t.quality} />{t.quality}</span>
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-black/[0.10]">
                  <td className="pt-3 pr-3 text-[12.5px] font-bold text-ink-100">Attributed emissions</td>
                  <td className="pt-3 pr-3 text-[11.5px] text-ink-500">÷ {n0(e.activityLevel)} t activity level</td>
                  <td className="dnum pt-3 pr-3 text-right text-[13px] font-bold text-ink-100">{n0(e.attributed)}</td>
                  <td className="dnum pt-3 text-right text-[13px] font-bold text-ink-100">{e.see == null ? '—' : `${n2(e.see, 3)}/t`}</td>
                </tr>
              </tbody>
            </table>
          </Scroller>

          {e.unknowns.length > 0 && (
            <div className="mt-5 rounded-2xl border border-black/[0.07] bg-black/[0.02] p-4">
              <div className="label mb-3">Not known — and not estimated</div>
              <ul className="space-y-3">
                {e.unknowns.map((u) => (
                  <li key={u.id} className="flex items-start gap-2.5">
                    <Icon name={u.blocking ? 'alert' : 'clock'} size={14} className={`mt-px shrink-0 ${u.blocking ? 'text-danger' : 'text-warn'}`} />
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-semibold text-ink-200"><Bi en={u.what} zh={u.whatZh} /></p>
                      <p className="mt-1 text-[11.5px] leading-relaxed text-ink-500">{u.needed}</p>
                      {u.materialityTco2e != null && (
                        <p className="mt-1.5 text-[11.5px] font-semibold text-ink-400">Worth about <span className="dnum">{n0(u.materialityTco2e)}</span> tCO₂e — that is what is at stake in getting it right.</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Caveat items={e.caveats} />
          <div className="mt-4"><ClauseChip ids={e.clauseIds} /></div>
        </Panel>
      ))}
    </div>
  )
}
