// ───────────────────────────────────────────────────────────────────────────
// DUTIES — the obligation graph, and the metric that proves it is one.
//
// Every duty is shown as the six things it decomposes into: who, where, on what
// conditions, on what evidence, by when, under which clause. That is the whole
// data model, so the screen is really a view of the authoring — which is the
// point. The UK mechanism appears beside the EU one from the same record and
// the same product fields, and the authoring panel states what it cost: three
// analyst-hours and no code release.
//
// 'Indeterminate' is given the same visual weight as the other two states. A
// duty whose trigger depends on a fact the record does not hold is not the same
// as a duty that does not apply, and collapsing the two is how compliance
// software quietly lies.
// ───────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { useTr } from '../../truereg/ui/state'
import { OBLIGATIONS, AUTHORING } from '../../truereg/obligations/authored'
import { evaluateObligations, type ObligationState } from '../../truereg/obligations/graph'
import { projectFacts, makeProbe } from '../../truereg/obligations/facts'
import { REGULATIONS, CORPUS_VERSION, type RegulationId } from '../../truereg/corpus/clauses'
import { TERMBASE_VERSION } from '../../truereg/corpus/terms'
import { currentDefaults } from '../../truereg/cbam/defaults'
import { DEMO_BUNDLE, DEMO_CONTRACTS } from '../../truereg/record/demo'
import Icon from '../../components/Icon'
import { Bi, Big, ClauseChip, Empty, Figure, Lede, Panel, Unit, n0 } from './parts'

const STATUS = {
  applies: { label: 'Applies', zh: '适用', c: 'text-brand', dot: 'bg-brand' },
  'not-applicable': { label: 'Does not apply', zh: '不适用', c: 'text-ink-500', dot: 'bg-ink-600' },
  indeterminate: { label: 'Cannot be determined', zh: '无法确定', c: 'text-warn', dot: 'bg-warn' },
} as const

export default function Duties() {
  const allowed = useTr((s) => s.allowed)
  const states = useMemo(() => evaluateObligations(OBLIGATIONS, {
    facts: projectFacts(DEMO_BUNDLE, DEMO_CONTRACTS),
    periodEnd: DEMO_BUNDLE.period.to,
    probe: makeProbe(DEMO_BUNDLE),
  }).filter((s) => allowed.includes(s.obligation.regulation)), [allowed])

  const byReg = useMemo(() => {
    const m = new Map<RegulationId, ObligationState[]>()
    for (const s of states) m.set(s.obligation.regulation, [...(m.get(s.obligation.regulation) ?? []), s])
    return m
  }, [states])

  const live = states.filter((s) => s.status === 'applies')
  const ready = live.filter((s) => s.ready)
  const next = live.filter((s) => s.dueOn).sort((a, b) => (a.daysToDue ?? 0) - (b.daysToDue ?? 0))[0]
  const d = currentDefaults()

  return (
    <div className="space-y-4 sm:space-y-5">
      <Lede meta={<>
        <span>{states.length} duties evaluated across {byReg.size} regime{byReg.size === 1 ? '' : 's'}</span>
        <span>{ready.length} of {live.length} with complete evidence</span>
      </>}>
        {next
          ? <>Next: <Big>{next.obligation.titleEn}</Big>, due <Big tone={(next.daysToDue ?? 999) < 120 ? 'danger' : 'safe'}>{next.dueOn}</Big> <Unit>— {next.daysToDue} days, and it sits on the {next.obligation.actor}.</Unit></>
          : <><Big>{live.length}</Big> <Unit>duties are in force against this record.</Unit></>}
      </Lede>

      <Panel
        title="Every duty, decomposed the same way"
        titleZh="以同一方式分解的每项义务"
        hint="Actor, jurisdiction, trigger conditions, required evidence, deadline, source clause. That decomposition is regulation-agnostic, which is why the second regime below cost authoring rather than engineering."
      >
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
          <Figure label="Duties in force" labelZh="生效义务" value={live.length} sub={`of ${states.length} evaluated against this record`} />
          <Figure label="Evidence complete" labelZh="证据齐备" tone={ready.length === live.length ? 'safe' : 'warn'} value={`${ready.length}/${live.length}`} sub="every requirement present on file" />
          <Figure label="Next deadline" labelZh="下一截止日" tone={(next?.daysToDue ?? 999) < 120 ? 'danger' : 'ink'} value={next?.dueOn ?? '—'}
            sub={next ? <>{next.obligation.titleEn} · {next.daysToDue} days</> : 'nothing scheduled'} />
          <Figure label="Regimes held" labelZh="已覆盖机制" tone="blue" value={allowed.length}
            sub={allowed.map((a) => REGULATIONS[a].jurisdiction).join(' · ')} />
        </div>
      </Panel>

      {[...byReg.entries()].map(([reg, rows]) => {
        const r = REGULATIONS[reg]
        return (
          <Panel key={reg} title={r.name} titleZh={r.nameZh} hint={r.note}
            right={<span className={`chip ${r.status === 'live' ? '!border-safe/25 !bg-safe/[0.07] !text-safe' : '!border-accentblue/25 !bg-accentblue/[0.06] !text-accentblue'}`}>{r.status}</span>}>
            <ul className="space-y-2">{rows.map((s) => <Duty key={s.obligation.id} s={s} />)}</ul>
          </Panel>
        )
      })}

      {byReg.size === 0 && <Empty title="No regimes held" body="This workspace is not subscribed to any regulation, so no duty can be evaluated." />}

      <Panel
        title="Time to author"
        titleZh="编制耗时"
        hint="Tracked as a first-class metric from CBAM onward. Adding a regime must require an analyst and the model, with no code release — the moment it needs an engineer, the obligation model was not general enough, and that is a defect rather than a task."
      >
        <ul className="space-y-2.5">
          {AUTHORING.map((a) => (
            <li key={a.regulation} className="rounded-2xl border border-black/[0.06] bg-black/[0.02] p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[12.5px] font-bold text-ink-100">{REGULATIONS[a.regulation].name}</span>
                <span className="flex items-center gap-3">
                  <span className="dnum text-[19px] font-bold text-ink-100">{a.hoursToAuthor}<span className="ml-1 text-[11px] font-semibold text-ink-500">analyst-hours</span></span>
                  <span className={`chip ${a.codeChangesRequired === 0 ? '!border-safe/25 !bg-safe/[0.07] !text-safe' : '!border-danger/25 !bg-danger/[0.07] !text-danger'}`}>
                    <Icon name={a.codeChangesRequired === 0 ? 'check' : 'alert'} size={11} />
                    {a.codeChangesRequired} code changes
                  </span>
                </span>
              </div>
              <p className="mt-2 max-w-[76ch] text-[11.5px] leading-relaxed text-ink-500">{a.note}</p>
              <p className="mt-1.5 text-[10.5px] text-ink-500">{a.authoredBy}, {a.authoredOn}{a.reviewedBy ? ` · reviewed by ${a.reviewedBy}` : ''}</p>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel
        title="What this conclusion is pinned to"
        titleZh="本结论所锁定的版本"
        hint="Every stored answer records these versions. When one moves, the watch agent recomputes which installations and which contracts are now different — and by how much."
      >
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {[
            { k: 'Clause corpus', v: CORPUS_VERSION, s: 'current' as const, n: `${live.length} live duties depend on it` },
            { k: 'Bilingual term base', v: TERMBASE_VERSION, s: 'current' as const, n: 'controls every Chinese rendering' },
            { k: 'Default values', v: d.version, s: d.status, n: 'the comparator on every contract' },
          ].map((x) => (
            <div key={x.k} className="rounded-2xl border border-black/[0.06] bg-black/[0.02] p-3.5">
              <div className="label">{x.k}</div>
              <div className="mono mt-1.5 text-[13px] font-bold text-ink-100">{x.v}</div>
              <div className={`mt-1.5 inline-flex items-center gap-1.5 text-[10.5px] font-bold ${x.s === 'indicative' ? 'text-warn' : 'text-safe'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${x.s === 'indicative' ? 'bg-warn' : 'bg-safe'}`} />{x.s}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-ink-500">{x.n}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}

function Duty({ s }: { s: ObligationState }) {
  const [open, setOpen] = useState(false)
  const o = s.obligation
  const st = STATUS[s.status]
  const urgent = s.status === 'applies' && s.daysToDue != null && s.daysToDue < 200
  return (
    <li className={`rounded-2xl border transition ${open ? 'border-black/[0.12] bg-black/[0.015]' : 'border-black/[0.06]'}`}>
      <button onClick={() => setOpen(!open)} className="flex w-full items-start gap-3 p-4 text-left">
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${st.dot}`} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="text-[13px] font-semibold text-ink-100"><Bi en={o.titleEn} zh={o.titleZh} /></span>
            <span className="chip !py-0.5 !text-[10px]">{o.actor}</span>
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
            <span className={`font-bold ${st.c}`}><Bi en={st.label} zh={st.zh} /></span>
            {s.dueOn && <span className={urgent ? 'font-semibold text-danger' : 'text-ink-500'}>due {s.dueOn}{s.daysToDue != null && ` · ${s.daysToDue} days`}</span>}
            {s.status === 'applies' && (
              <span className={s.ready ? 'font-semibold text-safe' : 'text-ink-500'}>
                {s.ready ? 'evidence complete' : `${s.evidence.filter((e) => e.state !== 'present').length} of ${s.evidence.length} evidence gaps`}
              </span>
            )}
          </span>
        </span>
        <Icon name="chevron" size={13} className={`mt-1 shrink-0 text-ink-600 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>

      {open && (
        <div className="space-y-4 border-t border-black/[0.06] p-4" style={{ animation: 'rise .25s cubic-bezier(.2,.7,.2,1)' }}>
          <p className="max-w-[76ch] text-[12.5px] leading-relaxed text-ink-300"><Bi en={o.summaryEn} zh={o.summaryZh} /></p>

          {s.unknownFacts.length > 0 && (
            <div className="rounded-xl border border-warn/25 bg-warn/[0.05] p-3.5">
              <div className="text-[11.5px] font-bold text-warn">This cannot be determined from your record</div>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-400">
                The trigger depends on {s.unknownFacts.map((f) => <span key={f} className="mono">{f}</span>).reduce((a, b) => <>{a}, {b}</>)}, which the record does not establish. That is not the same as the duty not applying, and it is not rounded down to one.
              </p>
            </div>
          )}

          {s.because.length > 0 && (
            <div>
              <div className="label mb-1.5">Why it was decided that way</div>
              <ul className="space-y-1">{s.because.map((b, i) => <li key={i} className="mono text-[11px] text-ink-500">{b}</li>)}</ul>
            </div>
          )}

          {s.evidence.length > 0 && (
            <div>
              <div className="label mb-2">Required evidence</div>
              <ul className="space-y-1.5">
                {s.evidence.map((e) => (
                  <li key={e.requirement.id} className="flex items-start gap-2.5">
                    <span className={`mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-md ${e.state === 'present' ? 'bg-safe/12 text-safe' : e.state === 'insufficient' ? 'bg-warn/12 text-warn' : 'bg-danger/10 text-danger'}`}>
                      <Icon name={e.state === 'present' ? 'check' : e.state === 'insufficient' ? 'clock' : 'close'} size={10} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[12px] font-semibold text-ink-200"><Bi en={e.requirement.label} zh={e.requirement.labelZh} /></span>
                      <span className="block text-[11px] text-ink-500">{e.detail}{e.requirement.needsThirdParty && ' · needs a third party'}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {o.consequence && (
            <div className="rounded-xl border border-black/[0.06] bg-black/[0.025] p-3.5">
              <div className="label mb-1">If it is missed</div>
              <p className="text-[12px] leading-relaxed text-ink-300">{o.consequence}</p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <ClauseChip ids={o.clauseIds} />
            <span className="chip !text-[10px]">{o.jurisdiction}</span>
            <span className="chip !text-[10px]">{o.deadline.label}</span>
          </div>
        </div>
      )}
    </li>
  )
}
