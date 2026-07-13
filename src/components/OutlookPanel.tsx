// ───────────────────────────────────────────────────────────────────────────
// The Big-4 layer of Forecast, market-level and driver-based:
//   · Assumption Book — every fundamental with value, source, rationale and a
//     review status (draft → reviewed → signed-off). Editing demotes to draft.
//   · YoY bridge — the fine walk: regulation + volume + tech + ZE mix, with a
//     residual guard (effects sum to the total by construction).
//   · Two-way sensitivity — adoption × tech improvement grid on the final year.
//   · Break-even — the adoption share at which the final-year fine reaches 0.
// All numbers come from engine/outlook.ts → the deterministic engine.
// ───────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import type { CountryId, RulePack, Vehicle } from '../engine/types'
import {
  DRIVER_META, type DriverKey, type OutlookConfig,
  bridgeYear, twoWay, breakEvenAdoption, outlookBaseYear, outlookRun, mandateFloor,
} from '../engine/outlook'
import { svgSCurve } from '../lib/packcharts'
import { useDrivers, driverSetFor, type DriverStatus } from '../lib/drivers'
import { fmtMoney, fmtNum } from '../engine/engine'
import { Section } from './ui'
import Icon from './Icon'

const STATUS_META: Record<DriverStatus, { label: string; cls: string }> = {
  draft: { label: 'Draft', cls: 'border-warn/40 bg-warn/10 text-warn' },
  reviewed: { label: 'Reviewed', cls: 'border-brand/40 bg-brand/10 text-brand' },
  'signed-off': { label: 'Signed off', cls: 'border-safe/40 bg-safe/10 text-safe' },
}
const NEXT: Record<DriverStatus, DriverStatus> = { draft: 'reviewed', reviewed: 'signed-off', 'signed-off': 'draft' }

export default function OutlookPanel({ raw, pack, country, vintageYear }: {
  raw: Vehicle[]; pack: RulePack; country: CountryId; vintageYear: number
}) {
  const overrides = useDrivers((s) => s.overrides)
  const governance = useDrivers((s) => s.governance)
  const setDriver = useDrivers((s) => s.setDriver)
  const setStatus = useDrivers((s) => s.setStatus)
  const resetDrivers = useDrivers((s) => s.resetDrivers)
  const drivers = useMemo(() => driverSetFor(country, overrides), [country, overrides])
  const gov = governance[country] ?? {}
  const cfg: OutlookConfig = useMemo(() => ({ raw, pack, drivers, vintageYear }), [raw, pack, drivers, vintageYear])
  const baseYear = useMemo(() => outlookBaseYear(raw, pack, vintageYear), [raw, pack, vintageYear])
  const finalYear = pack.years[pack.years.length - 1]

  const signedOff = DRIVER_META.filter((m) => (gov[m.key]?.status ?? 'draft') === 'signed-off').length

  // the adoption path the base case follows (S-curve + statutory floor)
  const sCurveSvg = useMemo(() => {
    const run = outlookRun(cfg)
    return svgSCurve(pack.years, pack.years.map((y) => run.shareFor(y)), pack.years.map((y) => mandateFloor(pack, y)), `Zero-emission adoption path · seeded from ${run.baseYear} actuals`)
  }, [cfg, pack])

  // ── bridge ──
  const bridgeYears = pack.years.slice(1)
  const [bYear, setBYear] = useState(bridgeYears[Math.min(1, bridgeYears.length - 1)] ?? pack.years[0])
  const bridge = useMemo(() => bridgeYear(cfg, bridgeYears.includes(bYear) ? bYear : bridgeYears[0]), [cfg, bYear, bridgeYears]) // eslint-disable-line react-hooks/exhaustive-deps
  const bridgeMax = bridge ? Math.max(bridge.from, bridge.to, ...bridge.effects.map((e) => Math.abs(e.delta)), 1) : 1

  // ── two-way sensitivity + break-even ──
  const sens = useMemo(() => {
    const meta = (k: DriverKey) => DRIVER_META.find((m) => m.key === k)!
    const clamp = (k: DriverKey, v: number) => Math.min(meta(k).max, Math.max(meta(k).min, v))
    const rows = [-10, -5, 0, 5, 10].map((d) => clamp('evShareHorizon', drivers.evShareHorizon + d))
    const cols = [-1, -0.5, 0, 0.5, 1].map((d) => clamp('iceCo2Improve', drivers.iceCo2Improve + d))
    const grid = twoWay(cfg, 'evShareHorizon', 'iceCo2Improve', rows, cols, finalYear)
    const max = Math.max(...grid.flat().map((c) => c.fine), 1)
    return { rows, cols, grid, max }
  }, [cfg, drivers, finalYear])
  const breakEven = useMemo(() => breakEvenAdoption(cfg, finalYear), [cfg, finalYear])

  return (
    <div className="space-y-5">
      {/* ── ASSUMPTION BOOK ── */}
      <Section
        title={<span className="flex items-center gap-2"><Icon name="section" size={15} className="text-brand" /> Assumption Book</span>}
        right={
          <span className="flex items-center gap-2 text-[11px] text-ink-500">
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${signedOff === DRIVER_META.length ? 'border-safe/40 bg-safe/10 text-safe' : 'border-warn/40 bg-warn/10 text-warn'}`}>
              {signedOff}/{DRIVER_META.length} signed off
            </span>
            <button onClick={() => resetDrivers(country)} className="font-semibold text-ink-500 transition hover:text-danger">Reset to defaults</button>
          </span>
        }>
        <p className="-mt-2 mb-3 text-[11px] leading-relaxed text-ink-500">
          The fundamentals under every case, seeded from the {baseYear} actuals. Each is an owned, sourced assumption — editing one demotes it to <b>draft</b> until re-reviewed. Makers hold share; the statutory path comes from the rule pack and is not an assumption.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-black/[0.08] text-[10px] font-semibold uppercase tracking-wide text-ink-500">
                <th className="py-2 pr-3">Driver</th>
                <th className="py-2 pr-3">Value</th>
                <th className="py-2 pr-3">Rationale</th>
                <th className="hidden py-2 pr-3 lg:table-cell">Source anchor</th>
                <th className="py-2 pr-3">Owner</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {DRIVER_META.map((m) => {
                const st = gov[m.key]?.status ?? 'draft'
                const sm = STATUS_META[st]
                return (
                  <tr key={m.key} className="border-b border-black/[0.04] align-top">
                    <td className="whitespace-nowrap py-2.5 pr-3 font-semibold text-ink-100">{m.label}</td>
                    <td className="py-2.5 pr-3">
                      <span className="flex items-center gap-1.5">
                        <input type="number" value={drivers[m.key]} min={m.min} max={m.max} step={m.step}
                          onChange={(e) => { const v = parseFloat(e.target.value); if (!Number.isNaN(v)) setDriver(country, m.key, Math.min(m.max, Math.max(m.min, v))) }}
                          className="num w-[70px] rounded-md border border-black/10 bg-white px-1.5 py-1 text-right text-xs font-bold text-ink-100 outline-none focus:border-brand/40" />
                        <span className="text-[10px] text-ink-500">{m.unit}</span>
                      </span>
                      <input type="range" min={m.min} max={m.max} step={m.step} value={drivers[m.key]}
                        onChange={(e) => setDriver(country, m.key, parseFloat(e.target.value))}
                        className="mt-1.5 w-[150px]" style={{ ['--fill' as string]: `${((drivers[m.key] - m.min) / (m.max - m.min)) * 100}%` }} />
                    </td>
                    <td className="max-w-[300px] py-2.5 pr-3 text-[11px] leading-snug text-ink-400">{m.rationale}</td>
                    <td className="hidden max-w-[220px] py-2.5 pr-3 text-[11px] leading-snug text-ink-500 lg:table-cell">{m.source}</td>
                    <td className="whitespace-nowrap py-2.5 pr-3 text-[11px] text-ink-400">{m.owner}</td>
                    <td className="py-2.5">
                      <button onClick={() => setStatus(country, m.key, NEXT[st])} title="Click to advance: draft → reviewed → signed off"
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-bold transition ${sm.cls}`}>{sm.label}</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ── ADOPTION S-CURVE ── */}
      <Section title="Electrification path" right={<span className="text-[11px] text-ink-500">base-case S-curve · gold = statutory floor where mandated</span>}>
        <div className="mx-auto max-w-[820px]" dangerouslySetInnerHTML={{ __html: sCurveSvg }} />
      </Section>

      <div className="grid gap-5 xl:grid-cols-2">
        {/* ── YoY BRIDGE ── */}
        <Section
          title="Fine bridge · year over year"
          right={
            <span className="flex items-center gap-1">
              {bridgeYears.map((y) => (
                <button key={y} onClick={() => setBYear(y)}
                  className={`num rounded-md px-2 py-0.5 text-[10px] font-bold transition ${y === (bridge?.year ?? bYear) ? 'bg-ink-100 text-white' : 'bg-black/5 text-ink-500 hover:text-ink-100'}`}>{y}</button>
              ))}
            </span>
          }>
          {bridge && (
            <div className="space-y-1.5">
              <BridgeRow label={`${bridge.year - 1} market fine`} value={bridge.from} max={bridgeMax} kind="total" currency={pack.currency} />
              {bridge.effects.map((e) => <BridgeRow key={e.label} label={e.label} value={e.delta} max={bridgeMax} kind="delta" currency={pack.currency} />)}
              <BridgeRow label={`${bridge.year} market fine`} value={bridge.to} max={bridgeMax} kind="total" currency={pack.currency} />
              <p className="pt-1 text-[10.5px] text-ink-500">
                Sequential attribution (regulation → volume → tech → mix). Effects sum to the total —
                residual <span className={`num font-bold ${Math.abs(bridge.residual) < Math.max(1, bridge.to * 0.001) ? 'text-safe' : 'text-danger'}`}>{fmtMoney(Math.abs(bridge.residual), pack.currency)}</span>.
              </p>
            </div>
          )}
        </Section>

        {/* ── TWO-WAY SENSITIVITY ── */}
        <Section
          title={`Sensitivity · ${finalYear} market fine`}
          right={<span className="text-[11px] text-ink-500">ZE horizon share × combustion improvement</span>}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-center text-[11px]">
              <thead>
                <tr>
                  <th className="p-1 text-left text-[9.5px] font-semibold uppercase tracking-wide text-ink-500">ZE % ↓ · tech →</th>
                  {sens.cols.map((c) => <th key={c} className="num p-1 text-[10px] font-bold text-ink-400">{fmtNum(c, 2)}%/yr</th>)}
                </tr>
              </thead>
              <tbody>
                {sens.grid.map((row, ri) => (
                  <tr key={ri}>
                    <td className="num p-1 text-left text-[10px] font-bold text-ink-400">{fmtNum(sens.rows[ri], 0)}%</td>
                    {row.map((cell, ci) => {
                      const heat = cell.fine / sens.max
                      const isCenter = ri === 2 && ci === 2
                      return (
                        <td key={ci} title={`${fmtNum(cell.row, 0)}% ZE · ${fmtNum(cell.col, 2)}%/yr → ${fmtMoney(cell.fine, pack.currency)}`}
                          className={`num p-1.5 font-semibold ${isCenter ? 'ring-2 ring-inset ring-ink-100/70' : ''}`}
                          style={{ background: cell.fine <= 0 ? 'rgba(14,159,110,0.12)' : `rgba(224,72,77,${0.06 + heat * 0.3})`, color: cell.fine <= 0 ? '#0E9F6E' : '#B3261E' }}>
                          {cell.fine <= 0 ? '0' : fmtMoney(cell.fine, pack.currency)}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2.5 text-[10.5px] leading-relaxed text-ink-500">
            Boxed cell = the Assumption Book as set. Break-even:{' '}
            {breakEven == null
              ? <b className="text-warn">electrification alone cannot zero the {finalYear} fine</b>
              : breakEven <= 0
                ? <b className="text-safe">already clear at today's adoption path</b>
                : <><b className="num text-ink-100">{fmtNum(breakEven, 1)}%</b> ZE share at horizon zeroes the {finalYear} market fine.</>}
          </p>
        </Section>
      </div>
    </div>
  )
}

function BridgeRow({ label, value, max, kind, currency }: { label: string; value: number; max: number; kind: 'total' | 'delta'; currency: string }) {
  const w = Math.min(100, (Math.abs(value) / max) * 100)
  const pos = value >= 0
  return (
    <div className="flex items-center gap-2 text-[11.5px]">
      <span className={`w-40 truncate ${kind === 'total' ? 'font-bold text-ink-100' : 'text-ink-400'}`}>{label}</span>
      <div className="relative h-4 flex-1 overflow-hidden rounded bg-black/[0.04]">
        {kind === 'total'
          ? <div className="absolute left-0 top-0 h-full rounded bg-ink-300/80" style={{ width: `${w}%` }} />
          : <div className={`absolute top-0 h-full ${pos ? 'left-1/2 bg-danger/70' : 'right-1/2 bg-safe/70'}`} style={{ width: `${w / 2}%` }} />}
        {kind === 'delta' && <span className="absolute left-1/2 top-0 h-full w-px bg-black/20" />}
      </div>
      <span className={`num w-24 shrink-0 text-right font-bold ${kind === 'total' ? 'text-ink-100' : pos ? 'text-danger' : 'text-safe'}`}>
        {kind === 'delta' && (pos ? '+' : '−')}{fmtMoney(Math.abs(value), currency)}
      </span>
    </div>
  )
}
