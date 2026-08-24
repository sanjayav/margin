import { useMemo, useState, useEffect } from 'react'
import { useCompliance } from '../lib/useCompliance'
import { useStore } from '../state/store'
import { standings, poolResult, bestForMaker, poolOptimise, poolGroups, parentPoolMap, type PoolGroup } from '../engine/pooling'
import { fmtMoney, fmtNum, fmtInt } from '../engine/engine'
import { Section, StatusPill, Stat, Bar } from '../components/ui'
import Icon from '../components/Icon'
import PoolBalance, { type BalanceMember } from '../components/PoolBalance'

export default function Pooling() {
  const { pack, raw, scenario, country } = useCompliance()
  const dataVersion = useStore((s) => s.dataVersion)
  const setScreen = useStore((s) => s.setScreen)
  const setParent = useStore((s) => s.setParent)
  const overrides = useStore((s) => s.makerOverrides)

  // China: no pooled averages at all — the whole clearing mechanism (own surplus,
  // affiliate transfer, NEV-credit trading) is the dual-credit ledger. Send the
  // user there rather than render an EU-style pool optimiser the law forbids.
  if (country === 'CN') {
    return (
      <div className="space-y-5 animate-slidein">
        <div className="card relative overflow-hidden p-6">
          <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: 'linear-gradient(180deg,#E8223B,#E8223B55)' }} />
          <div className="flex items-start gap-4">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand"><Icon name="handshake" size={20} /></div>
            <div className="min-w-0">
              <div className="label text-ink-500">Pooling · 双积分</div>
              <h3 className="font-display mt-1 text-[19px] font-bold text-ink-100">China doesn’t pool fleets.</h3>
              <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-ink-400">
                Unlike the EU, Chinese makers can’t combine fleets into one shared average. Every <b className="text-ink-200">compliance entity</b> is judged standalone on <b className="text-ink-200">both</b> axes — fuel-economy (CAFC 积分) and EV-volume (NEV 积分). A deficit is cleared, in order, by the maker’s <b className="text-ink-200">own carried-over surplus</b>, a transfer from an <b className="text-ink-200">affiliate</b> (关联企业, ≥25% equity), or by <b className="text-ink-200">buying NEV credits</b>. An NEV deficit can only ever be bought clear.
              </p>
              <button onClick={() => setScreen('creditbook')} className="btn-primary mt-4"><Icon name="scale" size={15} /> Open the Credit book — clear & trade credits</button>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            { icon: 'reset', t: 'Own surplus first', d: 'A prior-year CAFC surplus (banked, ≤5-yr validity) offsets a current CAFC deficit before anything is bought.' },
            { icon: 'handshake', t: 'Affiliate transfer', d: 'CAFC surplus can move between entities with ≥25% common equity — intra-group only, never an open pool.' },
            { icon: 'card', t: 'Buy NEV credits', d: 'The residual CAFC deficit and any NEV deficit are cleared on the NEV-credit market (¥/credit, volatile).' },
          ].map((s) => (
            <div key={s.t} className="card p-4">
              <div className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-lg bg-brand/10 text-brand"><Icon name={s.icon as any} size={14} /></span><span className="text-[13px] font-bold text-ink-100">{s.t}</span></div>
              <p className="mt-2 text-[11.5px] leading-relaxed text-ink-500">{s.d}</p>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const rows = useMemo(() => standings(raw, pack, scenario, overrides), [raw, pack, scenario, overrides, dataVersion])
  const allParents = rows.map((r) => r.parent)
  const pmap = useMemo(() => parentPoolMap(raw, scenario.year), [raw, scenario.year])
  const groups = useMemo(() => poolGroups(raw, pack, scenario, overrides), [raw, pack, scenario, overrides, dataVersion]) // eslint-disable-line react-hooks/exhaustive-deps

  const [members, setMembers] = useState<string[]>([])
  // default selection: everyone who's short + everyone with surplus (the value-creating pool)
  useEffect(() => {
    setMembers(rows.filter((r) => r.gap > 0 || r.creditBalance > 0).map((r) => r.parent))
  }, [pack.id, dataVersion]) // eslint-disable-line react-hooks/exhaustive-deps

  const grand = useMemo(() => poolResult(raw, pack, scenario, allParents, overrides), [raw, pack, scenario, overrides, dataVersion]) // eslint-disable-line react-hooks/exhaustive-deps
  const opt = useMemo(() => poolOptimise(raw, pack, scenario, undefined, overrides), [raw, pack, scenario, overrides, dataVersion]) // eslint-disable-line react-hooks/exhaustive-deps
  const selected = useMemo(
    () => (members.length >= 1 ? poolResult(raw, pack, scenario, members, overrides) : null),
    [raw, pack, scenario, members, overrides, dataVersion], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const standaloneTotal = rows.reduce((a, r) => a + r.fine, 0)
  const surplusTotal = rows.filter((r) => r.creditBalance > 0).reduce((a, r) => a + r.creditBalance, 0)
  const shortMakers = rows.filter((r) => r.fine > 0)
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.creditBalance)), 1)

  const toggle = (p: string) => setMembers((m) => (m.includes(p) ? m.filter((x) => x !== p) : [...m, p]))

  if (!pack.pooling.enabled) {
    // No pooled averages in this regime. Where credit TRADING exists instead
    // (India's draft CAFE III), the Credit book is the statutory surface — a
    // pool optimiser here would model something the law doesn't allow. We show a
    // standalone standings board and route credit clearing to the Credit book.
    const overCount = shortMakers.length
    const board = [...rows].sort((a, b) => b.fine - a.fine || b.gap - a.gap)
    return (
      <div className="space-y-5 animate-slidein">
        {/* premium hero */}
        <div className="relative overflow-hidden rounded-[22px] border border-black/[0.06] px-8 py-8" style={{ background: 'linear-gradient(120deg, #1B1714 0%, #211A16 48%, #17130F 100%)' }}>
          <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full blur-3xl" style={{ background: 'radial-gradient(circle, rgba(232,34,59,0.28), transparent 62%)' }} />
          <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.4]" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '26px 26px', maskImage: 'radial-gradient(120% 130% at 92% 0%, #000 30%, transparent 74%)', WebkitMaskImage: 'radial-gradient(120% 130% at 92% 0%, #000 30%, transparent 74%)' }} />
          <div className="relative flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45"><Icon name="handshake" size={13} className="text-brand-400" /> Pooling · {pack.name}</div>
              <h1 className="font-display mt-3 text-[30px] font-extrabold leading-[1.06] tracking-[-0.03em] text-white">{pack.name} assesses every maker standalone.</h1>
              <p className="mt-2.5 text-[13.5px] leading-relaxed text-white/55">{pack.pooling.note} There are no shared averages to optimise, so each maker clears its own line — or trades credits.</p>
              {pack.creditPrice != null && (
                <button onClick={() => setScreen('creditbook')} className="btn-primary mt-5"><Icon name="scale" size={15} /> Clear &amp; trade credits in the Credit book</button>
              )}
            </div>
            <div className="flex gap-6">
              <HeroStat label="Over the line" value={`${overCount}/${rows.length}`} tone={overCount ? '#FF8A83' : '#7FD8AC'} sub="makers with a fine" />
              <HeroStat label="Standalone exposure" value={fmtMoney(standaloneTotal, pack.currency)} tone={standaloneTotal > 0 ? '#FF8A83' : '#7FD8AC'} sub={`${scenario.year} · no pooling relief`} />
              <HeroStat label="Surplus headroom" value={fmtInt(surplusTotal)} tone="#7FD8AC" sub="g·units to sell as credits" />
            </div>
          </div>
        </div>

        <StandaloneBoard rows={board} maxAbs={maxAbs} pack={pack} onModel={(p) => { setParent(p); setScreen('analyse') }} />
      </div>
    )
  }

  const optBalance: BalanceMember[] = useMemo(
    () => opt.members
      .map((p) => rows.find((r) => r.parent === p))
      .filter(Boolean)
      .map((r) => ({ parent: r!.parent, balance: r!.creditBalance, gap: r!.gap, units: r!.units, fine: r!.fine })),
    [opt.members, rows],
  )
  const topReceiver = opt.split.find((m) => m.finalCost < -0.5)
  return (
    <div className="space-y-5 animate-slidein">
      {/* THE VERDICT — what pooling is worth this year, in one sentence */}
      <div className="rise card relative overflow-hidden p-5">
        <span className="absolute inset-y-0 left-0 w-1" style={{ background: opt.savings > 0 ? '#E8223B' : '#0E9F6E' }} />
        <div className="label">The verdict · {scenario.year}</div>
        <p className="mt-1.5 max-w-3xl text-[15px] leading-relaxed text-ink-300">
          {opt.savings > 0 ? (
            <>Pooling can remove <b className="num text-brand">{fmtMoney(opt.savings, pack.currency)}</b> of the{' '}
              <b className="num text-danger">{fmtMoney(standaloneTotal, pack.currency)}</b> standalone fines in {pack.name} — the
              value-maximising pool has <b className="text-ink-100">{opt.members.length} makers</b> and leaves{' '}
              <b className="num">{fmtMoney(opt.pooledFine, pack.currency)}</b> unavoidable.
              {topReceiver && <> Fair settlement pays <b className="text-ink-100">{topReceiver.parent}</b> ≈ <b className="num text-safe">{fmtMoney(Math.abs(topReceiver.finalCost), pack.currency)}</b> for lending its headroom.</>}
            </>
          ) : standaloneTotal > 0 ? (
            <>Pooling removes nothing this year — the shortfalls are larger than the available surplus. The{' '}
              <b className="num text-danger">{fmtMoney(standaloneTotal, pack.currency)}</b> exposure needs fleet change or credits, not partners.</>
          ) : (
            <>Every maker is under the line in {scenario.year} — there is no fine to pool away. Surplus holders can still bank or sell headroom below.</>
          )}
        </p>
      </div>

      {/* Market summary */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Standalone fines" value={fmtMoney(standaloneTotal, pack.currency)} sub="if no one cooperates" accent={standaloneTotal > 0 ? 'text-danger' : 'text-safe'} />
        <Stat label="If the whole market pools" value={fmtMoney(grand.fine, pack.currency)} sub={`${grand.status === 'fine' ? 'residual fine' : 'fully compliant'}`} accent={grand.fine > 0 ? 'text-warn' : 'text-safe'} />
        <Stat label="Value poolable" value={fmtMoney(standaloneTotal - grand.fine, pack.currency)} sub="total fine removable" accent="text-brand" />
        <Stat label="Surplus available" value={`${fmtInt(surplusTotal)}`} sub={`g·units of headroom to share`} accent="text-accentblue" />
      </div>

      {/* What pooling actually IS here. The optimiser below ranks coalitions by
          value, which quietly implies you can form one at will — you cannot, and
          the constraints change which of its answers are usable. */}
      <MechanicsStrip pack={pack} />

      {/* Registered pool groups — the legal hierarchy from the source data */}
      <PoolGroups groups={groups} pack={pack} onOpen={setMembers} />

      {/* Optimiser — best pool + Shapley fair value-split */}
      {opt.savings > 0 && (
        <Section title="Optimiser · best pool & fair settlement"
          right={<span className="text-[11px] text-ink-500">Shapley value-split{opt.omitted > 0 ? ` · top ${opt.members.length} of ${opt.members.length + opt.omitted}` : ''}</span>}>
          {opt.omitted > 0 && (
            <p className="mb-3 flex items-start gap-2 rounded-lg border border-black/[0.06] bg-black/[0.02] px-3 py-2 text-[11px] leading-relaxed text-ink-500">
              <Icon name="scale" size={13} className="mt-[1px] shrink-0 text-ink-400" />
              <span>
                The search covers the <b className="text-ink-300">{opt.members.length}</b> makers that can move the answer — those carrying a fine or real headroom, largest first.
                <b className="text-ink-300"> {opt.omitted}</b> smaller relevant makers are outside this roster; adding them can only improve the total, never worsen it.
                Use the pool builder below to price any specific combination.
              </span>
            </p>
          )}
          <div className="mb-5 rounded-2xl border border-black/[0.05] bg-black/[0.015] p-4">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-500">Who carries whom</div>
            <PoolBalance
              members={optBalance}
              currency={pack.currency}
              metricUnit={pack.metricUnit}
              net={optBalance.reduce((a, m) => a + m.balance, 0)}
              residualFine={opt.pooledFine}
            />
          </div>
          <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
            <Stat label="Recommended pool" value={`${opt.members.length} makers`} sub="value-maximising coalition" />
            <Stat label="Fine removed" value={fmtMoney(opt.savings, pack.currency)} sub={`pooled residual ${fmtMoney(opt.pooledFine, pack.currency)}`} accent="text-brand" />
            <Stat label="Settlements" value={`${opt.split.filter((m) => m.finalCost < 0).length} ⇄ ${opt.split.filter((m) => m.finalCost > 0.5).length}`} sub="receive ⇄ pay" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-black/[0.03] text-left text-[11px] uppercase tracking-wider text-ink-500">
                  <th className="px-4 py-2.5">Maker</th>
                  <th className="px-4 py-2.5">Role</th>
                  <th className="px-4 py-2.5 text-right">Standalone fine</th>
                  <th className="px-4 py-2.5 text-right">Fair share of savings</th>
                  <th className="px-4 py-2.5 text-right">Settlement</th>
                </tr>
              </thead>
              <tbody>
                {opt.split.map((m) => {
                  const receives = m.finalCost < 0
                  return (
                    <tr key={m.parent} className="border-t border-black/[0.04]">
                      <td className="px-4 py-2.5 font-medium text-ink-100">{m.parent}</td>
                      <td className="px-4 py-2.5">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${m.role === 'seller' ? 'border-safe/30 bg-safe/10 text-safe' : m.role === 'buyer' ? 'border-danger/30 bg-danger/10 text-danger' : 'border-black/10 text-ink-500'}`}>{m.role}</span>
                      </td>
                      <td className="num px-4 py-2.5 text-right text-ink-500">{fmtMoney(m.standaloneFine, pack.currency)}</td>
                      <td className="num px-4 py-2.5 text-right font-semibold text-brand">{fmtMoney(m.shapley, pack.currency)}</td>
                      <td className={`num px-4 py-2.5 text-right font-bold ${receives ? 'text-safe' : 'text-danger'}`}>{receives ? 'receive ' : 'pay '}{fmtMoney(Math.abs(m.finalCost), pack.currency)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-ink-500">The value-maximising pool removes {fmtMoney(opt.savings, pack.currency)} of fines. Each member's fair settlement = its standalone fine − its Shapley share; surplus sellers are paid for the headroom they lend, buyers pay less than their standalone fine, and the settlements net to the pool's residual {fmtMoney(opt.pooledFine, pack.currency)}.</p>
        </Section>
      )}

      {/* Standings */}
      <Standings rows={rows} pack={pack} maxAbs={maxAbs} />

      {/* Pool builder */}
      <Section title="Pool builder" right={<span className="text-[11px] text-ink-500">{pack.pooling.note}</span>}>
        <div className="mb-4 flex flex-wrap gap-2">
          {allParents.map((p) => {
            const on = members.includes(p)
            const r = rows.find((x) => x.parent === p)!
            return (
              <button key={p} onClick={() => toggle(p)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${on ? 'border-brand/40 bg-brand/10 text-ink-100' : 'border-black/10 text-ink-500 hover:text-ink-100'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${r.gap > 0 ? 'bg-danger' : 'bg-safe'}`} />
                {p}
              </button>
            )
          })}
          <button onClick={() => setMembers(allParents)} className="ml-auto text-[11px] font-semibold text-ink-500 hover:text-ink-100">Select all</button>
        </div>

        {selected && members.length >= 2 ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className={`card p-4 ${selected.gap > 0 ? 'border-warn/30' : 'border-safe/30'}`}>
              <div className="label">Pooled position</div>
              <div className={`mt-1 num text-2xl font-black ${selected.gap > 0 ? 'text-warn' : 'text-safe'}`}>{selected.gap > 0 ? '+' : ''}{fmtNum(selected.gap, 1)}</div>
              <div className="text-xs text-ink-500">{pack.metricUnit} · fleet {fmtNum(selected.avgMetric, 1)} / limit {fmtNum(selected.limit, 1)}</div>
              <div className="mt-2"><StatusPill status={selected.status} /></div>
            </div>
            <Stat label="Pooled fine" value={fmtMoney(selected.fine, pack.currency)} sub={`vs ${fmtMoney(selected.standaloneFine, pack.currency)} standalone`} accent={selected.fine > 0 ? 'text-danger' : 'text-safe'} />
            <div className="card p-4">
              <div className="label">Value unlocked</div>
              <div className="num mt-1 text-2xl font-black text-brand">{fmtMoney(selected.saved, pack.currency)}</div>
              <div className="mt-1 text-xs text-ink-500">
                {selected.saved > 0
                  ? `Settle ~${fmtMoney(selected.saved * 0.5, pack.currency)}–${fmtMoney(selected.saved * 0.8, pack.currency)} from short to surplus makers (illustrative).`
                  : 'No fine to remove in this combination.'}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-ink-500">Pick two or more makers to model a pool.</p>
        )}
      </Section>

      {/* Best move per short maker */}
      {shortMakers.length > 0 && (
        <Section title="Cheapest route to compliance, per maker" right={<span className="text-[11px] text-ink-500">pool vs buy credits vs pay</span>}>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {shortMakers.map((m) => (
              <MakerOptions key={m.parent} parent={m.parent} fine={m.fine} />
            ))}
          </div>
        </Section>
      )}

      {/* Credit market */}
      {pack.creditPrice != null && (
        <Section title="Credit market" right={<span className="text-[11px] text-ink-500">{pack.creditPriceLabel}</span>}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <div className="label mb-2 text-safe">Sellers — surplus headroom</div>
              <div className="space-y-2">
                {rows.filter((r) => r.creditBalance > 0).map((r) => (
                  <div key={r.parent} className="flex items-center justify-between rounded-lg border border-black/[0.04] bg-black/[0.02] px-3 py-2 text-sm">
                    <span className="text-ink-100">{r.parent}</span>
                    <span className="num text-safe">{fmtInt(r.creditBalance)} g·units · earns ≈ {fmtMoney(r.creditBalance * (pack.creditPrice ?? 0), pack.currency)}</span>
                  </div>
                ))}
                {rows.every((r) => r.creditBalance <= 0) && <div className="text-sm text-ink-500">No surplus sellers this year.</div>}
              </div>
            </div>
            <div>
              <div className="label mb-2 text-danger">Buyers — uncovered deficit</div>
              <div className="space-y-2">
                {rows.filter((r) => r.gap > 0).map((r) => (
                  <div key={r.parent} className="flex items-center justify-between rounded-lg border border-black/[0.04] bg-black/[0.02] px-3 py-2 text-sm">
                    <span className="text-ink-100">{r.parent}</span>
                    <span className="num text-danger">{fmtInt(r.gap * r.units)} g·units · fine {fmtMoney(r.fine, pack.currency)}</span>
                  </div>
                ))}
                {rows.every((r) => r.gap <= 0) && <div className="text-sm text-ink-500">No buyers — everyone's under the line.</div>}
              </div>
            </div>
          </div>
        </Section>
      )}
    </div>
  )
}

function PoolGroups({ groups, pack, onOpen }: { groups: PoolGroup[]; pack: any; onOpen?: (members: string[]) => void }) {
  return (
    <Section title="Registered pool groups" right={<span className="text-[11px] text-ink-500">Compliance Pool hierarchy</span>}>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {groups.map((g) => {
          const multi = g.members.length > 1
          const res = g.result
          return (
            <div key={g.pool} className="card p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-ink-100">{g.pool}</div>
                  <div className="text-[11px] text-ink-500">{g.members.length} member{g.members.length > 1 ? 's' : ''}</div>
                </div>
                <StatusPill status={res.status} />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div><div className="label">Fleet</div><div className="num text-sm font-bold text-ink-100">{fmtNum(res.avgMetric, 1)}</div></div>
                <div><div className="label">Limit</div><div className="num text-sm font-bold text-ink-400">{fmtNum(res.limit, 1)}</div></div>
                <div><div className="label">Gap</div><div className={`num text-sm font-bold ${res.gap > 0 ? 'text-danger' : 'text-safe'}`}>{res.gap > 0 ? '+' : ''}{fmtNum(res.gap, 1)}</div></div>
              </div>
              <div className="mt-3 space-y-1 border-t border-black/[0.05] pt-2">
                {g.members.map((m) => (
                  <div key={m.parent} className="flex items-center gap-2 text-[11px]">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${m.gap > 0 ? 'bg-danger' : 'bg-safe'}`} />
                    <span className="flex-1 truncate text-ink-200">{m.parent}</span>
                    <span className={`num ${m.gap > 0 ? 'text-danger' : 'text-safe'}`}>{m.gap > 0 ? '+' : ''}{fmtNum(m.gap, 1)}</span>
                    <span className="num w-14 text-right text-ink-500">{fmtInt(m.units)}u</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <div className="text-[11px] text-ink-500">
                  {multi
                    ? <>pooled fine <span className="num font-semibold text-ink-200">{fmtMoney(res.fine, pack.currency)}</span>{g.saved > 0 && <> · saves {fmtMoney(g.saved, pack.currency)}</>}</>
                    : <>standalone fine <span className="num font-semibold text-ink-200">{fmtMoney(g.standaloneFine, pack.currency)}</span></>}
                </div>
                {onOpen && multi && <button onClick={() => onOpen(g.members.map((m) => m.parent))} className="shrink-0 text-[10px] font-semibold text-brand hover:underline">Model this pool</button>}
              </div>
            </div>
          )
        })}
      </div>
    </Section>
  )
}

function Standings({ rows, pack, maxAbs, pmap }: any) {
  return (
    <Section title="Where each maker stands" right={<span className="text-[11px] text-ink-500">grouped by registered pool</span>}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-black/[0.03] text-left text-[11px] uppercase tracking-wider text-ink-500">
              <th className="px-4 py-2.5">Manufacturer</th>
              <th className="px-4 py-2.5">Registered pool</th>
              <th className="px-4 py-2.5">Role</th>
              <th className="px-4 py-2.5 text-right">Fleet</th>
              <th className="px-4 py-2.5 text-right">Limit</th>
              <th className="px-4 py-2.5 text-right">Gap</th>
              <th className="px-4 py-2.5">Credit balance (g·units)</th>
              <th className="px-4 py-2.5 text-right">Fine</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any) => {
              const surplus = r.creditBalance > 0
              return (
                <tr key={r.parent} className="border-t border-black/[0.04]">
                  <td className="px-4 py-2.5 font-medium text-ink-100">{r.parent}</td>
                  <td className="px-4 py-2.5 text-ink-500">{pmap?.[r.parent] ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${surplus ? 'border-safe/30 bg-safe/10 text-safe' : r.gap > 0 ? 'border-danger/30 bg-danger/10 text-danger' : 'border-black/10 text-ink-500'}`}>
                      {surplus ? 'Surplus seller' : r.gap > 0 ? 'Short buyer' : 'Balanced'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right num">{fmtNum(r.avgMetric, 1)}</td>
                  <td className="px-4 py-2.5 text-right num text-ink-500">{fmtNum(r.limit, 1)}</td>
                  <td className={`px-4 py-2.5 text-right num font-semibold ${r.gap > 0 ? 'text-danger' : 'text-safe'}`}>{r.gap > 0 ? '+' : ''}{fmtNum(r.gap, 1)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="relative h-2 w-32 overflow-hidden rounded-full bg-black/5">
                        <div className={`absolute top-0 h-full ${surplus ? 'left-1/2 bg-safe' : 'right-1/2 bg-danger'}`} style={{ width: `${(Math.abs(r.creditBalance) / maxAbs) * 50}%` }} />
                        <div className="absolute left-1/2 top-0 h-full w-px bg-black/20" />
                      </div>
                      <span className={`num text-xs ${surplus ? 'text-safe' : 'text-danger'}`}>{r.creditBalance > 0 ? '+' : ''}{fmtInt(r.creditBalance)}</span>
                    </div>
                  </td>
                  <td className={`px-4 py-2.5 text-right num ${r.fine > 0 ? 'text-danger' : 'text-ink-500'}`}>{fmtMoney(r.fine, pack.currency)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Section>
  )
}

// ── What pooling IS in this regime ───────────────────────────────────────────
// The optimiser ranks coalitions by value, which quietly implies any of them can
// be formed. Under Article 6 they cannot: a pool is a FORWARD declaration, it is
// per vehicle class, and an open pool cannot refuse a comer. Stating the
// constraints next to the optimiser is the difference between a recommendation
// an analyst can act on and one that gets thrown out in the first legal review.
function MechanicsStrip({ pack }: { pack: any }) {
  const pooled = pack.transfer?.kind === 'pool'
  const items: { icon: any; t: string; d: string }[] = pooled
    ? [
        { icon: 'clock', t: 'Declared in advance', d: 'Article 6(3): members must notify the Commission by 31 December of the calendar year the pool covers. It is a commitment made before the year is known — not a coalition chosen once the registrations are in.' },
        { icon: 'layers', t: 'Per vehicle class', d: 'A manufacturer holds separate M1 and N1 targets, so a car pool and a van pool are separate arrangements. Van headroom cannot be lent against a car deficit.' },
        { icon: 'handshake', t: 'Open on fair terms', d: 'Article 6(4): between unconnected manufacturers the pool manager must admit any maker that asks, on fair, reasonable and non-discriminatory terms. Connected undertakings pool freely.' },
        { icon: 'scale', t: 'One average, no instrument', d: 'Members are assessed on one combined fleet average. Nothing is issued, priced or banked — the money moves as a private settlement between members, which is what the split below values.' },
      ]
    : [
        { icon: 'scale', t: 'Assessed standalone', d: pack.pooling?.note ?? 'Each manufacturer clears its own line.' },
      ]
  return (
    <Section title={<span className="flex items-center gap-2"><Icon name="shield" size={15} className="text-brand" /> How pooling works here</span>}
      right={<span className="text-[11px] text-ink-500">Reg (EU) 2019/631 Article 6</span>}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((s) => (
          <div key={s.t} className="rounded-xl border border-black/[0.06] bg-white/70 p-3.5">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand"><Icon name={s.icon} size={14} /></span>
              <span className="text-[12.5px] font-bold leading-tight text-ink-100">{s.t}</span>
            </div>
            <p className="mt-2 text-[11.5px] leading-relaxed text-ink-500">{s.d}</p>
          </div>
        ))}
      </div>
    </Section>
  )
}

function HeroStat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: string }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-white/40">{label}</div>
      <div className="dnum mt-1.5 text-[22px] font-black leading-none tracking-[-0.02em]" style={{ color: tone }}>{value}</div>
      <div className="mt-1 text-[10.5px] text-white/40">{sub}</div>
    </div>
  )
}

// Premium standalone standings board — one card per maker (no pool framing, since
// no-pool regimes never combine fleets). Fleet vs its own line, gap, fine, credits.
function StandaloneBoard({ rows, maxAbs, pack, onModel }: { rows: any[]; maxAbs: number; pack: any; onModel: (p: string) => void }) {
  return (
    <Section title="Where each maker stands" right={<span className="text-[11px] text-ink-500">standalone · every maker clears its own line</span>}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => {
          const over = r.gap > 0
          const hex = over ? '#E0484D' : '#0E9F6E'
          const surplus = r.creditBalance > 0
          const scaleMax = Math.max(r.avgMetric, r.limit, 1) * 1.14
          const fleetPct = (r.avgMetric / scaleMax) * 100
          const limitPct = (r.limit / scaleMax) * 100
          return (
            <div key={r.parent} className="group relative overflow-hidden rounded-2xl border border-black/[0.06] bg-white p-4 transition hover:border-black/[0.12]">
              <span aria-hidden className="absolute inset-x-0 top-0 h-[2px]" style={{ background: `linear-gradient(90deg, ${hex}, ${hex}00 82%)` }} />
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 pr-1">
                  <div className="truncate text-[13.5px] font-bold text-ink-100" title={r.parent}>{r.parent}</div>
                  <div className="text-[10.5px] text-ink-500">{fmtInt(r.units)} units · {pack.name}</div>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${hex}14`, color: hex }}>
                  <Icon name={over ? 'alert' : 'check'} size={10} /> {over ? 'Over' : 'Under'}
                </span>
              </div>

              <div className="mt-3.5">
                <div className="relative h-2 rounded-full bg-black/[0.05]">
                  <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, fleetPct)}%`, background: hex }} />
                  <div className="absolute -top-1 h-4 w-[2px] rounded" style={{ left: `${Math.min(100, limitPct)}%`, background: '#1C1812' }} title="the line" />
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[10.5px]">
                  <span className="num text-ink-400">fleet <span className="font-bold text-ink-100">{fmtNum(r.avgMetric, 1)}</span></span>
                  <span className="num text-ink-400">line {fmtNum(r.limit, 1)} {pack.metricUnit}</span>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 border-t border-black/[0.05] pt-3 text-center">
                <div><div className="text-[9px] font-semibold uppercase tracking-wide text-ink-500">Gap</div><div className="dnum mt-0.5 text-[12.5px] font-bold" style={{ color: over ? hex : '#0E9F6E' }}>{over ? '+' : ''}{fmtNum(r.gap, 1)}</div></div>
                <div><div className="text-[9px] font-semibold uppercase tracking-wide text-ink-500">Fine</div><div className="dnum mt-0.5 text-[12.5px] font-bold" style={{ color: r.fine > 0 ? hex : '#8C8273' }}>{r.fine > 0 ? fmtMoney(r.fine, pack.currency) : '—'}</div></div>
                <div><div className="text-[9px] font-semibold uppercase tracking-wide text-ink-500">Credits</div><div className={`dnum mt-0.5 text-[12.5px] font-bold ${surplus ? 'text-safe' : r.creditBalance < 0 ? 'text-danger' : 'text-ink-400'}`}>{r.creditBalance > 0 ? '+' : ''}{fmtInt(r.creditBalance)}</div></div>
              </div>

              <button onClick={() => onModel(r.parent)} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-black/[0.07] bg-black/[0.015] py-1.5 text-[11px] font-semibold text-ink-400 transition hover:border-brand/30 hover:text-brand">
                <Icon name="scatter" size={12} /> Open in Plan
              </button>
            </div>
          )
        })}
      </div>
    </Section>
  )
}

function MakerOptions({ parent, fine }: { parent: string; fine: number }) {
  const { pack, raw, scenario } = useCompliance()
  const dataVersion = useStore((s) => s.dataVersion)
  const setScreen = useStore((s) => s.setScreen)
  const overrides = useStore((s) => s.makerOverrides)
  const opts = useMemo(() => bestForMaker(raw, pack, scenario, parent, overrides), [raw, pack, scenario, parent, overrides, dataVersion])
  const ICON: Record<string, any> = { pool: 'handshake', credits: 'card', fine: 'alert' }
  const maxCost = Math.max(...opts.map((o) => o.cost), 1)
  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="font-semibold text-ink-100">{parent}</div>
        <div className="num text-xs text-danger">standalone fine {fmtMoney(fine, pack.currency)}</div>
      </div>
      <div className="space-y-2">
        {opts.map((o) => (
          <div key={o.type} className={`rounded-xl border p-3 ${o.best ? 'border-brand/40 bg-brand/[0.06]' : 'border-black/[0.06] bg-black/[0.02]'}`}>
            <div className="flex items-center gap-2">
              <span className={`grid h-6 w-6 place-items-center rounded-lg ${o.best ? 'bg-brand/20 text-brand' : 'bg-black/5 text-ink-400'}`}><Icon name={ICON[o.type]} size={13} /></span>
              <span className="text-sm font-semibold text-ink-100">{o.label}</span>
              {o.best && <span className="rounded-full border border-brand/40 bg-brand/10 px-2 py-0.5 text-[9px] font-bold uppercase text-brand">cheapest</span>}
              <span className="ml-auto num text-sm font-bold text-ink-100">{fmtMoney(o.cost, pack.currency)}</span>
            </div>
            <div className="mt-1.5"><Bar value={o.cost} max={maxCost} color={o.best ? 'bg-brand' : 'bg-ink-600'} /></div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-ink-500">{o.detail}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
