// ───────────────────────────────────────────────────────────────────────────
// VERIFICATION — the site visit, rehearsed.
//
// Ranked by tCO₂e at stake rather than by ease of fixing, because that is how a
// verifier spends a finite day. Each finding carries the challenge in the
// verifier's words and the remedy in the plant engineer's, which is the only
// form in which it actually gets closed.
//
// The readiness score is never shown without the blocking findings underneath
// it. A green number over an unresolved boundary is worse than no number.
// ───────────────────────────────────────────────────────────────────────────
import { useMemo } from 'react'
import { useTr } from '../../truereg/ui/state'
import { calculateAll } from '../../truereg/cbam/emissions'
import { mapBoundaries } from '../../truereg/cbam/boundaries'
import { buildEvidencePack, type Severity } from '../../truereg/cbam/verify'
import { DEMO_BUNDLE } from '../../truereg/record/demo'
import Icon from '../../components/Icon'
import { Bi, Big, ClauseChip, Lede, Panel, Unit, n0 } from './parts'

const SEV: Record<Severity, { label: string; zh: string; c: string; bar: string; icon: 'alert' | 'shield' | 'check' }> = {
  blocking: { label: 'Blocking', zh: '阻断性', c: 'border-danger/25 bg-danger/[0.035] text-danger', bar: '#E0484D', icon: 'alert' },
  material: { label: 'Material', zh: '重要', c: 'border-warn/25 bg-warn/[0.035] text-warn', bar: '#D98005', icon: 'shield' },
  housekeeping: { label: 'Housekeeping', zh: '一般', c: 'border-black/[0.08] bg-black/[0.02] text-ink-400', bar: '#B3A892', icon: 'check' },
}

export default function Verification() {
  const substitute = useTr((s) => s.substituteDefaults)
  const pack = useMemo(() => {
    const maps = mapBoundaries(DEMO_BUNDLE)
    return buildEvidencePack(DEMO_BUNDLE, calculateAll(DEMO_BUNDLE, { substituteDefaultsForUnknownPrecursors: substitute }), maps)
  }, [substitute])

  const r = pack.readiness
  const tone = r.blocking ? '#E0484D' : r.score >= 80 ? '#0E9F6E' : '#D98005'

  return (
    <div className="space-y-4 sm:space-y-5">
      <Lede meta={<>
        <span>{pack.challenges.length} findings · ranked by tCO₂e at stake</span>
        <span>{pack.manifest.filter((m) => m.required && m.structured > 0).length} of {pack.manifest.filter((m) => m.required).length} required document sets on file</span>
      </>}>
        {r.blocking > 0
          ? <>Not ready — <Big tone="danger">{r.blocking}</Big> <Unit>finding{r.blocking === 1 ? '' : 's'} would stop the verification before the site visit begins.</Unit></>
          : r.score >= 80
            ? <>Substantially ready, with <Big tone="warn">{r.material}</Big> <Unit>material finding{r.material === 1 ? '' : 's'} to close.</Unit></>
            : <>Not yet ready — <Big tone="warn">{r.material}</Big> <Unit>material findings outstanding.</Unit></>}
      </Lede>

      <Panel
        title="Verification readiness"
        titleZh="核查就绪度"
        hint="What an accredited verifier will test, in the order they will test it. Findings are ranked by the tCO₂e each one puts in question, because that is where a verifier’s day goes."
        right={<ClauseChip ids={['cbam.art8']} />}
      >
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="flex items-center gap-4 sm:shrink-0">
            <div className="relative grid h-[86px] w-[86px] shrink-0 place-items-center">
              <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
                <circle cx="50" cy="50" r="43" fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="9" />
                <circle cx="50" cy="50" r="43" fill="none" stroke={tone} strokeWidth="9" strokeLinecap="round"
                  strokeDasharray={`${(r.score / 100) * 270} 999`} style={{ transition: 'stroke-dasharray .7s cubic-bezier(.2,.7,.2,1)' }} />
              </svg>
              <span className="dnum text-[26px] font-bold leading-none" style={{ color: tone }}>{r.score}</span>
            </div>
            <div className="min-w-0">
              <div className="label">Readiness</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {r.blocking > 0 && <span className="chip !border-danger/25 !bg-danger/[0.07] !text-danger">{r.blocking} blocking</span>}
                <span className="chip !border-warn/25 !bg-warn/[0.07] !text-warn">{r.material} material</span>
                <span className="chip">{pack.challenges.length} in total</span>
              </div>
              <p className="mt-2.5 max-w-[34ch] text-[11.5px] leading-relaxed text-ink-500">
                Any blocking finding caps the score at 40. A green number over an unresolved boundary is a false comfort.
              </p>
            </div>
          </div>

          {/* The other half of readiness: what the verifier will ask to see. */}
          <div className="min-w-0 flex-1 border-t border-black/[0.06] pt-4 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
            <div className="label mb-2.5">Required documents</div>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {pack.manifest.filter((m) => m.required).map((m) => {
                const ok = m.structured > 0
                return (
                  <li key={m.kind} className="flex items-center gap-2 text-[11.5px]">
                    <span className={`grid h-4 w-4 shrink-0 place-items-center rounded ${ok ? 'bg-safe/12 text-safe' : 'bg-danger/10 text-danger'}`}>
                      <Icon name={ok ? 'check' : 'close'} size={9} />
                    </span>
                    <span className={`min-w-0 flex-1 truncate ${ok ? 'text-ink-400' : 'font-semibold text-ink-200'}`} title={m.label}>{m.label}</span>
                    <span className="dnum shrink-0 text-[10.5px] text-ink-500">{m.held === 0 ? 'none' : `${m.structured}/${m.held}`}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      </Panel>

      {/* Deliberately not wrapped in a panel. A finding card inside a section
          card containing a remedy card is three nested surfaces for one idea;
          the heading sits on the ground and the findings stand on their own. */}
      <section>
        <h2 className="mb-3 px-1 font-display text-[15px] font-bold tracking-[-0.02em] text-ink-100 sm:text-[16.5px]">
          <Bi en="What the verifier will challenge" zh="核查机构将提出的质疑" zhClass="text-[12.5px] font-semibold" />
        </h2>
        <ul className="space-y-2.5">
          {pack.challenges.map((c, i) => {
            const s = SEV[c.severity]
            return (
              <li key={c.id} className={`relative overflow-hidden rounded-2xl border p-4 ${s.c}`} style={{ animation: `rise .45s cubic-bezier(.2,.7,.2,1) ${i * 35}ms backwards` }}>
                <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: s.bar }} />
                <div className="flex flex-wrap items-center gap-2 pl-1">
                  <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.1em]"><Icon name={s.icon} size={11} /><Bi en={s.label} zh={s.zh} /></span>
                  {c.atStakeTco2e != null && <span className="chip !text-[10px]">{n0(c.atStakeTco2e)} tCO₂e at stake</span>}
                </div>
                <p className="mt-2.5 pl-1 text-[13px] font-semibold leading-relaxed text-ink-100"><Bi en={c.challengeEn} zh={c.challengeZh} zhClass="text-[12.5px] font-medium" /></p>
                <div className="mt-3 flex items-start gap-2.5 border-t border-current/10 pl-1 pt-3">
                  <Icon name="check" size={13} className="mt-0.5 shrink-0 text-safe" />
                  <div className="min-w-0">
                    <div className="label mb-1">What closes it</div>
                    <p className="text-[12px] leading-relaxed text-ink-300"><Bi en={c.remedyEn} zh={c.remedyZh} /></p>
                  </div>
                </div>
                <p className="mt-2.5 pl-1 text-[11px] italic leading-relaxed text-ink-500">{c.principle}</p>
                <div className="mt-2.5 pl-1"><ClauseChip ids={c.clauseIds} compact /></div>
              </li>
            )
          })}
        </ul>
      </section>

      <Panel title="Evidence manifest" titleZh="证据清单" hint="What the verifier will ask to see, and what is on file. A document that exists but has not been reconciled to the figures does not yet count.">
        <ul className="divide-y divide-black/[0.05]">
          {pack.manifest.map((m) => {
            const ok = m.structured > 0
            return (
              <li key={m.kind} className="flex items-center gap-3 py-3">
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${ok ? 'bg-safe/10 text-safe' : m.required ? 'bg-danger/10 text-danger' : 'bg-black/[0.05] text-ink-500'}`}>
                  <Icon name={ok ? 'check' : m.required ? 'close' : 'dot'} size={13} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-semibold text-ink-100">{m.label}</span>
                  <span className="block text-[11px] text-ink-500">
                    {m.held === 0 ? 'nothing on file' : `${m.held} on file, ${m.structured} reconciled`}
                    {m.required && <span className={`ml-1.5 font-semibold ${ok ? 'text-ink-500' : 'text-danger'}`}>· required</span>}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      </Panel>
    </div>
  )
}
