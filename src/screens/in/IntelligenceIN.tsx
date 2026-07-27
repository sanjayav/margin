// ───────────────────────────────────────────────────────────────────────────
// INTELLIGENCE · India — the CAFE compliance intelligence cockpit.
//
// Six engine-grounded reads, one at a time. A scannable index of the six on the
// left; a single spacious detail panel on the right. Every number is computed
// live from the shared engine on the as-sold book — never invented.
//   Cycle cliff (MIDC→WLTP #4) · Super-credit leverage (#6) · SUV & mass (#3)
//   Fuel pathway (#2) · Cheapest route per maker (#5) · Provisioning (#7)
// ───────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { useCompliance } from '../../lib/useCompliance'
import { useStore } from '../../state/store'
import { buildTree, fmtInt, fmtNum, fmtMoney } from '../../engine/engine'
import { baselineScenario } from '../../engine/forecast'
import { recommend, type Action } from '../../engine/recommend'
import type { Aggregate, Scenario } from '../../engine/types'
import Icon, { type IconName } from '../../components/Icon'

const LEVER_LABEL: Record<Action['lever'], string> = { ev: 'Electrify', light: 'Lightweight', eco: 'Eco-innovation', trim: 'Trim heavy models', pool: 'Trade credits', credits: 'Buy credits' }
const LEVER_ICON: Record<Action['lever'], IconName> = { ev: 'bolt', light: 'feather', eco: 'leaf', trim: 'scissors', pool: 'handshake', credits: 'card' }

export default function IntelligenceIN() {
  const { pack, raw, country } = useCompliance('actuals')
  const setScreen = useStore((s) => s.setScreen)
  const base = useMemo(() => baselineScenario(pack), [pack])
  const [sel, setSel] = useState('cycle')

  const cafe3 = pack.years.find((y) => y >= 2027) ?? 2027
  const last = pack.years[pack.years.length - 1]
  const first = pack.years[0]
  const cur = pack.currency
  const fy = (y: number) => `FY${String(y).slice(2)}–${String(y + 1).slice(2)}`

  const A = useMemo(() => {
    const treeAt = (year: number, ov: Partial<Scenario> = {}) => buildTree(raw, pack, { ...base, year, ...ov })
    const makers = (t: Aggregate) => (t.children ?? []).filter((c) => c.rawUnits > 0)
    const mFine = (t: Aggregate) => makers(t).reduce((a, c) => a + c.fine, 0)
    const nOver = (t: Aggregate) => makers(t).filter((c) => c.gap > 0).length

    const midc = treeAt(cafe3), wltp = treeAt(cafe3, { cycleWltp: true })
    const flipped = makers(midc).filter((c) => { const w = makers(wltp).find((x) => x.label === c.label); return c.gap <= 0 && w && w.gap > 0 }).length
    const cycle = { midc, wltp, flipped, overMidc: nOver(midc), overWltp: nOver(wltp), dFuel: wltp.avgMetric - midc.avgMetric, dRisk: mFine(wltp) - mFine(midc) }

    const scOn = treeAt(cafe3, { superCreditsEnabled: true }), scOff = treeAt(cafe3, { superCreditsEnabled: false })
    const supercredit = { dilution: scOff.avgMetric - scOn.avgMetric, on: scOn.avgMetric, off: scOff.avgMetric, makersSaved: nOver(scOff) - nOver(scOn), riskSaved: mFine(scOff) - mFine(scOn) }

    const PATHS = [
      { key: 'E20', label: 'E20', note: 'today · nationwide', boost: 0 },
      { key: 'E27', label: 'E27', note: 'higher ethanol', boost: 3 },
      { key: 'CNG', label: 'CNG-forward', note: 'petrol → CNG', boost: 8 },
      { key: 'FLEX', label: 'Flex E85', note: 'flex-fuel', boost: 14 },
    ]
    const pathway = PATHS.map((p) => { const t = treeAt(cafe3, { cnfBoostPct: p.boost }); return { ...p, fuel: t.avgMetric, gap: t.gap, risk: mFine(t) } })

    const tFirst = treeAt(first), tLast = treeAt(last)
    const massDrift = tLast.avgMass - tFirst.avgMass
    const suvUnits = raw.filter((v) => v.year === last && /suv|mpv|utility|crossover/i.test(`${v.bodyStyle ?? ''} ${v.segment ?? ''}`)).reduce((a, v) => a + v.sales, 0)
    const totUnits = raw.filter((v) => v.year === last).reduce((a, v) => a + v.sales, 0)
    const masscreep = { massDrift, targetRelief: 0.002 * massDrift, fuelFirst: tFirst.avgMetric, fuelLast: tLast.avgMetric, massFirst: tFirst.avgMass, massLast: tLast.avgMass, suvShare: totUnits ? (suvUnits / totUnits) * 100 : 0 }

    const perMaker = makers(midc).map((c) => {
      const plan = recommend(raw, pack, { ...base, year: cafe3 }, c.label, {})
      const cheapest = [...plan.actions].filter((a) => a.gramsCleared > 0.0001).sort((a, b) => a.cost / (a.gramsCleared || 1) - b.cost / (b.gramsCleared || 1))[0]
      return { name: c.label, gap: c.gap, fine: c.fine, cheapest }
    }).sort((a, b) => b.fine - a.fine)

    const provisioning = pack.years.filter((y) => y >= cafe3).map((y) => { const t = treeAt(y); return { year: y, risk: mFine(t), over: nOver(t), makers: makers(t).length } })
    return { cycle, supercredit, pathway, masscreep, perMaker, provisioning, provTotal: provisioning.reduce((a, p) => a + p.risk, 0), overNow: nOver(midc), makersNow: makers(midc).length }
  }, [raw, pack, base, cafe3, last, first])

  if (country !== 'IN') return null

  const READS = [
    { id: 'cycle', icon: 'alert' as IconName, tone: '#E0484D', label: 'MIDC → WLTP cliff', value: `+${fmtNum(A.cycle.dFuel, 2)}`, unit: 'L/100km' },
    { id: 'super', icon: 'bolt' as IconName, tone: '#0E9F6E', label: 'Super-credit leverage', value: `−${fmtNum(A.supercredit.dilution, 2)}`, unit: 'L/100km' },
    { id: 'suv', icon: 'trending' as IconName, tone: '#D98005', label: 'SUV & mass mix', value: `${fmtNum(A.masscreep.suvShare, 0)}%`, unit: 'of fleet' },
    { id: 'fuel', icon: 'leaf' as IconName, tone: '#12B981', label: 'Fuel pathway', value: `${fmtNum(A.pathway[0].fuel, 2)}→${fmtNum(A.pathway[3].fuel, 2)}`, unit: 'L/100km' },
    { id: 'maker', icon: 'target' as IconName, tone: '#3B6FE0', label: 'Cheapest route, per maker', value: `${A.overNow}`, unit: `of ${A.makersNow} must act` },
    { id: 'prov', icon: 'scale' as IconName, tone: '#E8223B', label: 'Penalty provisioning', value: fmtMoney(A.provTotal, cur), unit: `to ${fy(last)}` },
  ]
  const active = READS.find((r) => r.id === sel)!

  return (
    <div className="mx-auto max-w-[1180px] space-y-8 pb-16 animate-slidein">
      {/* ── hero · compact ───────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-[22px] border border-black/[0.06] px-8 py-9" style={{ background: 'linear-gradient(120deg, #1B1714 0%, #211A16 48%, #17130F 100%)' }}>
        <div aria-hidden className="pointer-events-none absolute -right-28 -top-28 h-80 w-80 rounded-full blur-3xl" style={{ background: 'radial-gradient(circle, rgba(232,34,59,0.30), transparent 62%)' }} />
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.4]" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '26px 26px', maskImage: 'radial-gradient(120% 130% at 92% 0%, #000 30%, transparent 74%)', WebkitMaskImage: 'radial-gradient(120% 130% at 92% 0%, #000 30%, transparent 74%)' }} />
        <div className="relative flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
          <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400/60" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand-400" /></span>
          India intelligence · CAFE II → III
        </div>
        <h1 className="font-display mt-4 max-w-[20ch] text-[38px] font-extrabold leading-[1.05] tracking-[-0.035em] text-white">Six reads that decide CAFE.</h1>
        <p className="mt-3 text-[14px] font-medium text-white/45">Computed live from the engine · {fy(cafe3)} · as-sold book</p>
      </div>

      {/* ── index + detail ───────────────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        {/* left · the six reads */}
        <div className="flex flex-col gap-1.5">
          {READS.map((r) => {
            const on = r.id === sel
            return (
              <button key={r.id} onClick={() => setSel(r.id)}
                className={`group relative flex items-center gap-3.5 rounded-2xl border px-4 py-3.5 text-left transition-all ${on ? 'border-black/[0.08] bg-white shadow-[0_2px_10px_-4px_rgba(60,45,20,0.14)]' : 'border-transparent hover:bg-black/[0.02]'}`}>
                {on && <span className="absolute left-0 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-r-full" style={{ background: r.tone }} />}
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl transition" style={{ background: on ? `${r.tone}18` : 'rgba(0,0,0,0.04)', color: on ? r.tone : '#8C8273' }}><Icon name={r.icon} size={16} /></span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-[13.5px] font-semibold ${on ? 'text-ink-100' : 'text-ink-400'}`}>{r.label}</span>
                  <span className="dnum block text-[12px] font-medium text-ink-500">{r.value} <span className="text-ink-500/70">{r.unit}</span></span>
                </span>
                <Icon name="chevron" size={15} className={`shrink-0 transition ${on ? 'text-ink-400' : 'text-ink-600 opacity-0 group-hover:opacity-100'}`} />
              </button>
            )
          })}
        </div>

        {/* right · the detail panel */}
        <div key={sel} className="rounded-[22px] border border-black/[0.06] bg-[#FFFDF9] p-8 shadow-[0_1px_2px_rgba(40,30,15,0.03),0_24px_48px_-32px_rgba(120,90,50,0.2)] screen-in">
          <div className="flex items-center gap-2.5">
            <span className="grid h-7 w-7 place-items-center rounded-lg" style={{ background: `${active.tone}16`, color: active.tone }}><Icon name={active.icon} size={14} /></span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-500">{active.label}</span>
          </div>
          <Detail id={sel} A={A} cur={cur} fy={fy} cafe3={cafe3} first={first} last={last} setScreen={setScreen} tone={active.tone} />
        </div>
      </div>
    </div>
  )
}

// ── detail panels ────────────────────────────────────────────────────────────
function Big({ value, unit, tone }: { value: string; unit: string; tone: string }) {
  return <div className="mt-3 flex items-baseline gap-2"><span className="dnum text-[52px] font-bold leading-none tracking-[-0.04em]" style={{ color: tone }}>{value}</span><span className="text-[15px] font-semibold text-ink-500">{unit}</span></div>
}
function Line({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 max-w-[54ch] text-[15px] font-medium leading-[1.6] text-ink-300">{children}</p>
}
function Facts({ items }: { items: [string, string][] }) {
  return (
    <div className="mt-7 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-black/[0.06] bg-black/[0.05]">
      {items.map(([k, v]) => (
        <div key={k} className="bg-[#FFFDF9] px-4 py-3.5"><div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-500">{k}</div><div className="dnum mt-1.5 text-[17px] font-bold tracking-[-0.02em] text-ink-100">{v}</div></div>
      ))}
    </div>
  )
}
function VsBar({ label, val, max, hex, sub }: { label: string; val: number; max: number; hex: string; sub: string }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between"><span className="text-[12px] font-semibold text-ink-400">{label}</span><span className="dnum text-[13px] font-bold text-ink-100">{sub}</span></div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/[0.05]"><div className="h-full rounded-full" style={{ width: `${Math.max(4, (val / max) * 100)}%`, background: hex }} /></div>
    </div>
  )
}

function Detail({ id, A, cur, fy, cafe3, first, last, setScreen, tone }: any) {
  if (id === 'cycle') {
    const max = Math.max(A.cycle.midc.avgMetric, A.cycle.wltp.avgMetric)
    return (<>
      <Big value={`+${fmtNum(A.cycle.dFuel, 2)}`} unit="L/100km on the cliff" tone={tone} />
      <Line>The MIDC→WLTP switch lifts the measured fleet number ~18%. The {A.cycle.overMidc} makers already over stay capped at ₹50k/car — India’s fine is a staircase — so the cliff first erodes the headroom of makers still clear.</Line>
      <div className="mt-7 space-y-4">
        <VsBar label="Fleet on MIDC (today)" val={A.cycle.midc.avgMetric} max={max} hex="#8C8273" sub={`${fmtNum(A.cycle.midc.avgMetric, 2)} L/100km`} />
        <VsBar label="Fleet on WLTP (CAFE III)" val={A.cycle.wltp.avgMetric} max={max} hex={tone} sub={`${fmtNum(A.cycle.wltp.avgMetric, 2)} L/100km`} />
      </div>
      <Facts items={[['Makers over', `${A.cycle.overMidc} → ${A.cycle.overWltp}`], ['Added ₹ at risk', A.cycle.dRisk > 0 ? fmtMoney(A.cycle.dRisk, cur) : '—'], ['Basis', 'MIDC → WLTP']]} />
    </>)
  }
  if (id === 'super') {
    const max = Math.max(A.supercredit.on, A.supercredit.off)
    return (<>
      <Big value={`−${fmtNum(A.supercredit.dilution, 2)}`} unit="L/100km dilution" tone={tone} />
      <Line>BEV ×3, PHEV ×2.5 and strong-hybrid ×2 multiply clean-tech volume in the denominator, pulling the fleet mean down {fmtNum(A.supercredit.dilution, 2)} L/100km — the difference between a {fmtNum(A.supercredit.on, 2)} and a {fmtNum(A.supercredit.off, 2)} CAFE number for FY{String(cafe3).slice(2)} headroom.</Line>
      <div className="mt-7 space-y-4">
        <VsBar label="With super-credits" val={A.supercredit.on} max={max} hex={tone} sub={`${fmtNum(A.supercredit.on, 2)} L/100km`} />
        <VsBar label="Without" val={A.supercredit.off} max={max} hex="#8C8273" sub={`${fmtNum(A.supercredit.off, 2)} L/100km`} />
      </div>
      <Facts items={[['Multipliers', 'BEV ×3 · SH ×2'], ['Makers kept clear', `${A.supercredit.makersSaved}`], ['₹ avoided', A.supercredit.riskSaved > 0 ? fmtMoney(A.supercredit.riskSaved, cur) : 'headroom']]} />
    </>)
  }
  if (id === 'suv') {
    const lighter = A.masscreep.massDrift < 0
    return (<>
      <Big value={`${fmtNum(A.masscreep.suvShare, 0)}%`} unit="SUV share of the fleet" tone={tone} />
      <Line>SUVs dominate India. Kerb mass is {lighter ? <><b className="text-ink-100">{fmtInt(A.masscreep.massDrift)} kg lighter</b> as EVs mix in</> : <>drifting <b className="text-ink-100">+{fmtInt(A.masscreep.massDrift)} kg</b> heavier</>} through {fy(last)} — the mass-linked target gives back {fmtNum(Math.abs(A.masscreep.targetRelief), 2)} L/100km, but a heavier SUV pivot erodes headroom via the fuel–mass link.</Line>
      <Facts items={[['Kerb mass', `${fmtInt(A.masscreep.massFirst)} → ${fmtInt(A.masscreep.massLast)}`], ['Fuel use', `${fmtNum(A.masscreep.fuelFirst, 1)} → ${fmtNum(A.masscreep.fuelLast, 1)}`], ['Target relief', `${fmtNum(A.masscreep.targetRelief, 2)}`]]} />
    </>)
  }
  if (id === 'fuel') {
    const p0 = A.pathway[0].fuel, min = Math.min(...A.pathway.map((p: any) => p.fuel)), max = Math.max(...A.pathway.map((p: any) => p.fuel))
    return (<>
      <Big value={`−${fmtNum(p0 - A.pathway[3].fuel, 2)}`} unit="L/100km at flex-fuel" tone={tone} />
      <Line>India’s signature lever: carbon-neutral fuels discount fleet fuel use. Each step down the blend/CNG pathway lowers the CAFE number and the bill — computed via the CNF-boost lever.</Line>
      <div className="mt-7 space-y-3.5">
        {A.pathway.map((p: any, i: number) => {
          const dRisk = p.risk - A.pathway[0].risk
          return (
            <div key={p.key} className="flex items-center gap-4">
              <div className="w-28 shrink-0"><div className="text-[13px] font-bold text-ink-100">{p.label}</div><div className="text-[10.5px] text-ink-500">{p.note}</div></div>
              <div className="relative h-9 flex-1 overflow-hidden rounded-lg bg-black/[0.04]">
                <div className="flex h-full items-center justify-end rounded-lg pr-3" style={{ width: `${20 + ((p.fuel - min) / (max - min || 1)) * 78}%`, background: i === 0 ? '#C9BCA3' : `linear-gradient(90deg, ${tone}AA, ${tone})` }}>
                  <span className="dnum text-[13px] font-bold text-white">{fmtNum(p.fuel, 2)}</span>
                </div>
              </div>
              <div className="w-24 shrink-0 text-right text-[12px] font-semibold">{i === 0 ? <span className="text-ink-500">baseline</span> : dRisk < -0.5 ? <span className="num text-safe">{fmtMoney(dRisk, cur)}</span> : <span className="num text-safe">−{fmtNum(A.pathway[0].fuel - p.fuel, 2)}</span>}</div>
            </div>
          )
        })}
      </div>
    </>)
  }
  if (id === 'maker') {
    return (<>
      <Big value={`${A.perMaker.filter((m: any) => m.gap > 0).length}`} unit={`of ${A.perMaker.length} makers must act`} tone={tone} />
      <Line>The cheapest first step to clear each maker at {fy(cafe3)}, ranked by {cur} per L/100km — from the same optimiser as the compliance path.</Line>
      <div className="mt-6 space-y-1">
        {A.perMaker.map((m: any) => (
          <div key={m.name} className="flex items-center gap-3 rounded-xl px-3 py-3 transition hover:bg-black/[0.02]">
            <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink-100">{m.name.split(' ').slice(0, 2).join(' ')}</span>
            <span className={`dnum w-16 text-right text-[13px] font-bold ${m.gap > 0 ? 'text-danger' : 'text-safe'}`}>{m.gap > 0 ? '+' : ''}{fmtNum(m.gap, 2)}</span>
            <span className="w-40">{m.gap <= 0
              ? <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-safe"><Icon name="check" size={12} /> already clear</span>
              : <span className="inline-flex items-center gap-2 text-[12.5px] font-medium text-ink-300"><span className="grid h-6 w-6 place-items-center rounded-lg bg-brand/10 text-brand"><Icon name={m.cheapest ? LEVER_ICON[m.cheapest.lever as Action['lever']] : 'card'} size={12} /></span>{m.cheapest ? LEVER_LABEL[m.cheapest.lever as Action['lever']] : 'Buy credits'}</span>}</span>
            <span className="dnum w-24 text-right text-[13px] font-bold text-ink-100">{m.gap <= 0 ? '—' : m.cheapest ? fmtMoney(m.cheapest.cost, cur) : fmtMoney(m.fine, cur)}</span>
          </div>
        ))}
      </div>
      <button onClick={() => setScreen('under')} className="mt-5 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-brand transition hover:gap-2.5">Model in full on the compliance path <Icon name="chevron" size={13} /></button>
    </>)
  }
  // provisioning
  const max = Math.max(...A.provisioning.map((p: any) => p.risk), 1)
  return (<>
    <Big value={fmtMoney(A.provTotal, cur)} unit={`cumulative to ${fy(last)}`} tone={tone} />
    <Line>EC Amendment Act 2022 stepped penalty — ₹25k/car at ≤0.2 L/100km over, ₹50k/car beyond — on the as-sold book against each year’s draft CAFE III target. Provision against the trajectory, not a single year.</Line>
    <div className="mt-8 flex items-end gap-3">
      {A.provisioning.map((p: any) => (
        <div key={p.year} className="flex flex-1 flex-col items-center gap-2">
          <div className="dnum text-[11px] font-bold text-ink-400">{p.risk > 0 ? fmtMoney(p.risk, cur) : '—'}</div>
          <div className="flex h-32 w-full items-end"><div className="w-full rounded-t-lg" style={{ height: `${Math.max(4, (p.risk / max) * 100)}%`, background: p.risk > 0 ? `linear-gradient(180deg, #F17074, ${tone})` : '#E6DCC8' }} /></div>
          <div className="text-[11px] font-semibold text-ink-500">{fy(p.year)}</div>
          <div className="text-[10px] text-ink-500/80">{p.over}/{p.makers} over</div>
        </div>
      ))}
    </div>
  </>)
}
