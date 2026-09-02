/* ───────────────────────────────────────────────────────────────────────────
   Scenario — the three levers that are not sliders.
   ---------------------------------------------------------------------------
   A single number on a track can express "how much zero-emission share". It
   cannot express the three decisions a product planner actually makes:

     · the SHAPE of the powertrain mix, where moving one share moves the others
     · a NEW VARIANT that does not exist in the fleet yet
     · a TRADE-OFF between two levers that interact

   Each gets a purpose-built control here.
   ─────────────────────────────────────────────────────────────────────────── */
import React, { useMemo, useState } from 'react'
import {
  Badge, Button, Callout, cx, Dialog, EmptyState, Field, Input, Panel, Select,
  Slider, StatusDot, Table, Td, Th, Tooltip, Tr, useToast,
} from '../../design/primitives'
import Icon from '../../design/icons'
import { DV, FieldPad, ShareBar } from '../../design/charts'
import { useApp } from '../../state/appStore'
import { usePosition } from '../../state/usePosition'
import { baseScenario } from '../../state/appStore'
import { buildTree, fmtInt, fmtNum, variantKey } from '../../../engine/engine'
import type { Scenario, Vehicle } from '../../../engine/types'

/* ═══════════════════════════════════════════════════════════════════════════
   Powertrain mix
   ═══════════════════════════════════════════════════════════════════════════ */

/** Shares renormalise, so a mix is always a mix. Pulling BEV up has to pull
 *  something else down; a control that lets the shares sum to 130% is not
 *  modelling a fleet, it is modelling nothing. */
export function PowertrainMix() {
  const { pack, raw, scenario, country } = usePosition('working')
  const patch = useApp((s) => s.patchScenario)

  // The as-sold mix for the year, which is what "reset" means and what the
  // sliders start from when nothing has been set.
  const asSold = useMemo(() => {
    const rows = raw.filter((v) => v.year === scenario.year)
    const total = rows.reduce((a, v) => a + v.sales, 0) || 1
    const by: Record<string, number> = {}
    for (const v of rows) by[v.powertrain] = (by[v.powertrain] ?? 0) + v.sales
    return Object.fromEntries(Object.entries(by).map(([k, n]) => [k, (n / total) * 100]))
  }, [raw, scenario.year])

  const keys = useMemo(
    () => Object.keys(asSold).sort((a, b) => asSold[b] - asSold[a]),
    [asSold],
  )
  const current = useMemo<Record<string, number>>(() => {
    if (!scenario.mix) return asSold
    const sum = Object.values(scenario.mix).reduce((a, b) => a + b, 0) || 1
    return Object.fromEntries(keys.map((k) => [k, ((scenario.mix?.[k] ?? 0) / sum) * 100]))
  }, [scenario.mix, asSold, keys])

  /** Move one share and take the difference proportionally from the others, so
   *  the mix stays a mix. If everything else is at zero there is nothing to take
   *  from, and the move is refused rather than silently clamped. */
  const setShare = (key: string, next: number) => {
    const others = keys.filter((k) => k !== key)
    const rest = others.reduce((a, k) => a + current[k], 0)
    const target = Math.max(0, Math.min(100, next))
    if (rest <= 0.001 && target < 100) return
    const scale = rest > 0 ? (100 - target) / rest : 0
    const mix: Record<string, number> = { [key]: target }
    for (const k of others) mix[k] = current[k] * scale
    patch({ mix })
  }

  const zeroKeys = keys.filter((k) => /BEV|EV|Electric|FCEV/i.test(k))
  const zeShare = zeroKeys.reduce((a, k) => a + current[k], 0)
  const dirty = !!scenario.mix

  if (keys.length < 2) {
    return (
      <EmptyState compact icon={<Icon name="layers" size={17} />} title="One powertrain in this dataset"
        body="A mix needs at least two powertrains to reweight between." />
    )
  }

  return (
    <div>
      <div className="mb-3">
        <ShareBar height={13}
          parts={keys.map((k, i) => ({ name: k, value: current[k], color: DV[i % DV.length] }))} />
      </div>

      <div className="space-y-3.5">
        {keys.map((k, i) => {
          const moved = Math.abs(current[k] - asSold[k]) > 0.05
          return (
            <div key={k}>
              <Slider
                label={
                  <span className="flex items-center gap-1.5">
                    <span className="h-[7px] w-[7px] rounded-[2px]" style={{ background: DV[i % DV.length] }} />
                    {k}
                    {moved && (
                      <Tooltip content={`As sold: ${asSold[k].toFixed(1)}%`}>
                        <span className={cx('text-[10.5px] font-semibold tabular-nums',
                          current[k] > asSold[k] ? 'text-[var(--pos-ink)]' : 'text-[var(--neg-ink)]')}>
                          {current[k] > asSold[k] ? '+' : '−'}{Math.abs(current[k] - asSold[k]).toFixed(1)}
                        </span>
                      </Tooltip>
                    )}
                  </span>
                }
                value={Math.round(current[k] * 10) / 10} min={0} max={100} step={0.5}
                format={(v) => `${v.toFixed(1)}%`}
                onChange={(v) => setShare(k, v)} />
            </div>
          )
        })}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Button size="xs" variant="ghost" disabled={!dirty} onClick={() => patch({ mix: null })}>Reset to as sold</Button>
        <span className="ml-auto text-[11.5px] text-[var(--ink-3)]">
          Zero-emission <b className="tabular-nums text-[var(--ink-1)]">{zeShare.toFixed(1)}%</b>
        </span>
      </div>

      <Callout className="mt-3" tone="neutral" icon={<Icon name="alert" size={13} />}>
        Reweighting the mix moves volume between powertrains at their existing specs. It does not invent a cleaner
        version of a car that does not exist — for that, add a variant.
      </Callout>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Variant builder
   ═══════════════════════════════════════════════════════════════════════════ */

const BLANK = {
  parent: '', model: '', powertrain: 'BEV', fuel: 'Electric',
  co2: 0, mass: 1500, sales: 10000, vclass: '',
}

/** A hypothetical variant is an explicit assumption, so the engine PINS it:
 *  fleet-level levers (volume, mix, EV reallocation, mass shift) deliberately
 *  do not rescale a row you typed. Otherwise "add a 40k BEV" would silently
 *  become "add a 52k BEV" the moment someone nudged the volume multiplier. */
export function VariantBuilder() {
  const { pack, raw, scenario, country } = usePosition('working')
  const patch = useApp((s) => s.patchScenario)
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState({ ...BLANK })

  const parents = useMemo(
    () => [...new Set(raw.filter((v) => v.year === scenario.year).map((v) => v.parent))].sort(),
    [raw, scenario.year],
  )
  const powertrains = useMemo(
    () => [...new Set(raw.map((v) => v.powertrain))].filter(Boolean).sort(),
    [raw],
  )
  const added = scenario.extraVariants ?? []

  // What one added variant does, on its own, to the market position.
  const effect = useMemo(() => {
    if (!added.length) return null
    const without = buildTree(raw, pack, { ...scenario, extraVariants: [] })
    const withThem = buildTree(raw, pack, scenario)
    return { metric: withThem.avgMetric - without.avgMetric, fine: withThem.fine - without.fine, units: withThem.rawUnits - without.rawUnits }
  }, [raw, pack, scenario, added.length])

  const add = () => {
    if (!draft.parent || !draft.model) return
    const v: Vehicle = {
      parent: draft.parent, pool: draft.parent, brand: draft.parent, make: draft.parent,
      model: draft.model, year: scenario.year,
      powertrain: draft.powertrain, fuel: draft.fuel,
      co2: Number(draft.co2) || 0, mass: Number(draft.mass) || 1500,
      sales: Number(draft.sales) || 0,
      vclass: draft.vclass || pack.classes[0] || 'Passenger car',
      variant: `${draft.model} · hypothetical`,
      pinned: true,
      source: 'Scenario · added variant',
    }
    patch({ extraVariants: [...added, v] })
    toast({
      tone: 'pos', title: 'Variant added',
      body: `${draft.parent} ${draft.model} at ${draft.co2} ${pack.metricUnit}. It is pinned, so fleet levers will not rescale it.`,
    })
    setDraft({ ...BLANK })
    setOpen(false)
  }

  const remove = (i: number) => patch({ extraVariants: added.filter((_, n) => n !== i) })

  return (
    <div>
      {added.length ? (
        <>
          <div className="overflow-hidden rounded-[var(--r-sm)] border border-[var(--line)]">
            <Table>
              <thead>
                <tr>
                  <Th>Variant</Th><Th>Powertrain</Th>
                  <Th align="right">{pack.metricUnit}</Th><Th align="right">Mass</Th><Th align="right">Volume</Th><Th />
                </tr>
              </thead>
              <tbody>
                {added.map((v, i) => (
                  <Tr key={`${v.parent}-${v.model}-${i}`}>
                    <Td strong>
                      <span className="block truncate">{v.model}</span>
                      <span className="block text-[11px] font-normal text-[var(--ink-4)]">{v.parent}</span>
                    </Td>
                    <Td><Badge tone="info">{v.powertrain}</Badge></Td>
                    <Td align="right" strong>{fmtNum(v.co2, 1)}</Td>
                    <Td align="right">{fmtInt(v.mass)} kg</Td>
                    <Td align="right">{fmtInt(v.sales)}</Td>
                    <Td align="right">
                      <button onClick={() => remove(i)} className="text-[var(--ink-5)] hover:text-[var(--neg)]" aria-label={`Remove ${v.model}`}>
                        <Icon name="trash" size={13} />
                      </button>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>

          {effect && (
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-[var(--r-sm)] bg-[var(--surface-2)] px-3 py-2.5 text-[11.5px]">
              <span className="t-label !mb-0">Together they move</span>
              <span className="text-[var(--ink-3)]">fleet
                <b className={cx('ml-1 tabular-nums', effect.metric <= 0 ? 'text-[var(--pos-ink)]' : 'text-[var(--neg-ink)]')}>
                  {effect.metric > 0 ? '+' : '−'}{fmtNum(Math.abs(effect.metric), 2)} {pack.metricUnit}
                </b>
              </span>
              <span className="text-[var(--ink-3)]">volume <b className="ml-1 tabular-nums text-[var(--ink-1)]">+{fmtInt(effect.units)}</b></span>
            </div>
          )}
        </>
      ) : (
        <EmptyState art="data" compact icon={<Icon name="plus" size={17} />} title="No hypothetical variants"
          body="Add a car that is not in the fleet yet — a launch, a re-spec, a battery upgrade — and the engine will assess the fleet as if it shipped." />
      )}

      <Button className="mt-3" size="sm" variant="secondary" icon={<Icon name="plus" size={13} />} onClick={() => setOpen(true)}>
        Add a variant
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} width={560}
        title="Add a hypothetical variant"
        sub={`It will be assessed in ${scenario.year} against the ${pack.name} rule pack, and pinned so fleet levers cannot rescale it.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" disabled={!draft.parent || !draft.model} onClick={add}>Add to the scenario</Button>
          </>
        }>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Manufacturer" required>
            <Select value={draft.parent} onChange={(e) => setDraft({ ...draft, parent: e.target.value })}>
              <option value="">Choose…</option>
              {parents.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </Field>
          <Field label="Model name" required>
            <Input value={draft.model} onChange={(e) => setDraft({ ...draft, model: e.target.value })} placeholder="e.g. e-Vitara" />
          </Field>
          <Field label="Powertrain">
            <Select value={draft.powertrain} onChange={(e) => setDraft({ ...draft, powertrain: e.target.value, fuel: /BEV|Electric/i.test(e.target.value) ? 'Electric' : draft.fuel })}>
              {powertrains.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </Field>
          <Field label="Fuel">
            <Input value={draft.fuel} onChange={(e) => setDraft({ ...draft, fuel: e.target.value })} />
          </Field>
          <Field label={pack.metricLabel} hint={`In ${pack.metricUnit}. Zero for a battery-electric variant.`}>
            <Input type="number" step="0.1" value={draft.co2} addon={pack.metricUnit}
              onChange={(e) => setDraft({ ...draft, co2: Number(e.target.value) })} />
          </Field>
          <Field label={pack.massLabel} hint="Moves the mass-based limit as well as the fleet.">
            <Input type="number" step="10" value={draft.mass} addon="kg"
              onChange={(e) => setDraft({ ...draft, mass: Number(e.target.value) })} />
          </Field>
          <Field label="Annual volume" hint="Registrations in the compliance year." className="sm:col-span-2">
            <Input type="number" step="500" value={draft.sales}
              onChange={(e) => setDraft({ ...draft, sales: Number(e.target.value) })} />
          </Field>
        </div>
        <Callout className="mt-4" tone="info" icon={<Icon name="shield" size={13} />}>
          A variant you type is an assumption, and the engine treats it as one: it is excluded from the actuals basis entirely,
          so Plan and the Credit book will never show it.
        </Callout>
      </Dialog>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   The compliance field
   ═══════════════════════════════════════════════════════════════════════════ */

const EV_RANGE: [number, number] = [0, 80]
const MASS_RANGE: [number, number] = [-150, 150]
const COLS = 13
const ROWS = 9

/** Two levers that genuinely interact, drawn as a field you can drag through.
 *
 *  Mass is the reason this exists. Where the limit is mass-based, a heavier
 *  fleet gets a LOOSER target — so mass moves the line as well as the position,
 *  and the net effect can go either way. Someone moving two sliders one at a
 *  time will never see the shape of that; the frontier drawn here is exactly
 *  where it flips. */
export function ComplianceField() {
  const { pack, raw, scenario, country } = usePosition('working')
  const patch = useApp((s) => s.patchScenario)
  const [armed, setArmed] = useState(false)

  const base = useMemo(() => buildTree(raw, pack, { ...baseScenario(country), year: scenario.year }), [raw, pack, country, scenario.year])
  const heavy = raw.length > 2500

  const grid = useMemo(() => {
    if (!armed) return null
    const out: number[][] = []
    for (let r = 0; r < ROWS; r++) {
      const mass = MASS_RANGE[1] - (r / (ROWS - 1)) * (MASS_RANGE[1] - MASS_RANGE[0])
      const row: number[] = []
      for (let c = 0; c < COLS; c++) {
        const ev = EV_RANGE[0] + (c / (COLS - 1)) * (EV_RANGE[1] - EV_RANGE[0])
        const t = buildTree(raw, pack, { ...scenario, evSharePct: ev, massShiftKg: mass })
        row.push(t.gap)
      }
      out.push(row)
    }
    return out
    // Deliberately NOT keyed on the whole scenario: the field is a map of the
    // two levers it draws, and rebuilding it on every unrelated lever change
    // would cost 117 engine passes for no new information.
  }, [armed, raw, pack, scenario.year, scenario.extraVariants, scenario.mix]) // eslint-disable-line react-hooks/exhaustive-deps

  const ev = scenario.evSharePct ?? Math.round(base.zlevShare * 100)
  const mass = scenario.massShiftKg ?? 0

  if (!armed) {
    return (
      <div className="rounded-[var(--r-md)] border border-dashed border-[var(--line-strong)] bg-[var(--surface-2)] px-4 py-8 text-center">
        <Icon name="target" size={22} className="mx-auto mb-2 text-[var(--ink-4)]" />
        <div className="text-[12.5px] font-semibold text-[var(--ink-1)]">Map the trade-off</div>
        <p className="mx-auto mt-1 max-w-[46ch] text-[11.5px] leading-relaxed text-[var(--ink-3)]">
          {ROWS * COLS} engine passes over zero-emission share × average mass, drawing the line where this fleet
          crosses from compliant to breaching. Then drag through it.
        </p>
        <Button className="mt-3" size="sm" variant="secondary" icon={<Icon name="play" size={12} />} onClick={() => setArmed(true)}>
          {heavy ? 'Compute the field (large dataset)' : 'Compute the field'}
        </Button>
      </div>
    )
  }

  return (
    <>
      <FieldPad
        grid={grid ?? [[0]]}
        xRange={EV_RANGE} yRange={MASS_RANGE}
        xLabel="Zero-emission share" xUnit="%"
        yLabel="Average mass shift" yUnit="kg"
        value={{ x: ev, y: mass }}
        onChange={(x, y) => patch({ evSharePct: Math.round(x), massShiftKg: Math.round(y / 5) * 5 })}
        marker={{ x: Math.round(base.zlevShare * 100), y: 0, label: 'as sold' }}
        height={318} />
      <Callout className="mt-3" tone="neutral" icon={<Icon name="alert" size={13} />}>
        {pack.massBasedLimit === false
          ? `${pack.name} does not scale its target with mass, so the frontier here is close to vertical — mass moves your position but not your limit.`
          : `${pack.name} scales the target with ${pack.massLabel.toLowerCase()}, so mass moves the limit as well as the fleet. That is why the frontier leans.`}
      </Callout>
    </>
  )
}
