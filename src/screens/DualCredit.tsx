// ───────────────────────────────────────────────────────────────────────────
// CHINA DUAL-CREDIT — bespoke CN workspace, built on shadcn/ui primitives
// (Card · Tabs · Table · Badge · Button · Slider · Separator) themed to the warm
// AiRE palette. China judges every carmaker on TWO balances at once (fuel
// economy = CAFC, EV volume = NEV) and both must finish above zero.
// ───────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { useCompliance } from '../lib/useCompliance'
import { useStore } from '../state/store'
import { fmtInt, fmtNum, fmtMoney } from '../engine/engine'
import { buildDualCredit, nevRatioFor, type OemDualCredit } from '../engine/china/dualcredit'
import { BasisChip } from '../components/ui'
import Icon, { type IconName } from '../components/Icon'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Slider } from '@/components/ui/slider'
import { Separator } from '@/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

const C = { clear: '#0E9F6E', self: '#2E9E8F', warn: '#D98005', short: '#E0484D' }
const STATUS_META: Record<OemDualCredit['status'], { t: string; cls: string; dot: string }> = {
  'both-clear': { t: 'Both clear', cls: 'border-safe/30 bg-safe/10 text-safe', dot: C.clear },
  'self-offset': { t: 'Cleared by own EV', cls: 'border-safe/25 bg-safe/10 text-safe', dot: C.self },
  'cafc-short': { t: 'CAFC short', cls: 'border-warn/30 bg-warn/10 text-warn', dot: C.warn },
  'nev-short': { t: 'NEV short', cls: 'border-warn/30 bg-warn/10 text-warn', dot: C.warn },
  'both-short': { t: 'Both short', cls: 'border-danger/30 bg-danger/10 text-danger', dot: C.short },
}
const cr = (n: number) => `${n >= 0 ? '+' : '−'}${fmtInt(Math.abs(n))}`
type SortKey = 'parent' | 'volume' | 'nevSharePct' | 'cafcCredit' | 'nevBalance' | 'creditsToBuy' | 'cost'

export default function DualCredit() {
  const [basisSel, setBasisSel] = useState<'actuals' | 'scenario'>('actuals')
  const basis = basisSel === 'actuals' ? 'actuals' : 'live'
  const { pack, tree, scenario, meta, country } = useCompliance(basis)
  const patchScenario = useStore((s) => s.patchScenario)
  const [selected, setSelected] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showLedger, setShowLedger] = useState(false)
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'cafcCredit', dir: -1 })

  const dc = useMemo(() => buildDualCredit(tree, scenario, pack.creditPrice ?? pack.fineRate), [tree, scenario, pack])
  const statutoryRatio = nevRatioFor(scenario.year, null)
  const sel = dc.oems.find((o) => o.parent === selected) ?? null
  const groups = useMemo(() => ({
    clear: dc.oems.filter((o) => o.status === 'both-clear'),
    selfOffset: dc.oems.filter((o) => o.status === 'self-offset'),
    mustBuy: dc.oems.filter((o) => o.creditsToBuy > 0.5),
  }), [dc.oems])
  const sortedOems = useMemo(() => {
    const arr = [...dc.oems]
    arr.sort((a, b) => {
      const va = a[sort.key], vb = b[sort.key]
      if (typeof va === 'string' || typeof vb === 'string') return String(va).localeCompare(String(vb)) * sort.dir
      return ((va as number) - (vb as number)) * sort.dir
    })
    return arr
  }, [dc.oems, sort])

  if (country !== 'CN') return null
  const t = dc.totals
  const bothOk = t.makers - t.makersOver
  const allClear = t.makersOver === 0
  const scrollToMaker = (p: string) => { setSelected(p); requestAnimationFrame(() => document.getElementById('dc-offset')?.scrollIntoView({ behavior: 'smooth', block: 'center' })) }
  const clickSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === 'parent' ? 1 : -1 }))

  const exportCsv = () => {
    const head = ['Year', 'Manufacturer', 'Volume', 'NEV %', 'CAFC actual', 'CAFC target', 'CAFC credit', 'NEV earned', 'NEV required', 'NEV balance', 'Credits to buy', 'Cost RMB', 'Verdict']
    const body = dc.oems.map((o) => [scenario.year, `"${o.parent}"`, o.volume, o.nevSharePct.toFixed(1), o.cafcActual.toFixed(3), o.cafcTarget.toFixed(3), Math.round(o.cafcCredit), Math.round(o.nevEarned), Math.round(o.nevRequired), Math.round(o.nevBalance), Math.round(o.creditsToBuy), Math.round(o.cost), STATUS_META[o.status].t].join(','))
    const blob = new Blob([[head.join(','), ...body].join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a')
    a.href = url; a.download = `china-dual-credit-${scenario.year}-${basis}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  const SortHead = ({ k, label, num = true }: { k: SortKey; label: string; num?: boolean }) => (
    <TableHead className={num ? 'text-right' : ''}>
      <button onClick={() => clickSort(k)} className={cn('inline-flex items-center gap-1 transition-colors hover:text-foreground', num && 'flex-row-reverse')}>
        {label}{sort.key === k && <span className="text-brand">{sort.dir === 1 ? '▲' : '▼'}</span>}
      </button>
    </TableHead>
  )

  return (
    <div className="mx-auto max-w-[1120px] space-y-5 pb-12">
      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <Card className="rise overflow-hidden">
        <CardContent className="p-7">
          <div className="flex items-start justify-between gap-6">
            <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <span className="grid h-6 w-6 place-items-center rounded-md bg-primary/10 text-primary"><Icon name="scale" size={12} /></span>
              Credit book · 双积分 dual-credit · {scenario.year}
            </div>
            <Tabs value={basisSel} onValueChange={(v) => setBasisSel(v as 'actuals' | 'scenario')}>
              <TabsList>
                <TabsTrigger value="actuals">Actuals</TabsTrigger>
                <TabsTrigger value="scenario">Scenario</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <h1 className="font-display mt-5 max-w-[19ch] text-[34px] font-bold leading-[1.05] tracking-[-0.03em] text-ink-100">
            {allClear
              ? <>Every carmaker clears <span style={{ color: C.clear }}>both</span> credit tests.</>
              : <><span className="dnum" style={{ color: C.short }}>{t.makersOver}</span> of {t.makers} makers must buy credits to comply.</>}
          </h1>
          <p className="mt-3.5 max-w-[64ch] text-[13.5px] leading-[1.6] text-ink-400" style={{ textWrap: 'pretty' } as React.CSSProperties}>
            China scores each carmaker on two balances that must both finish above zero — <b className="font-semibold text-ink-200">fuel economy</b> (CAFC) and <b className="font-semibold text-ink-200">EV volume</b> (NEV). A fuel-economy shortfall can be covered by a maker's own spare EV credits; an EV shortfall can only be bought clear.
          </p>
        </CardContent>
        <Separator />
        <div className="flex flex-wrap items-center gap-x-10 gap-y-4 px-7 py-5">
          <div className="shrink-0">
            <div className="dnum text-[30px] font-bold leading-none text-ink-100">{bothOk}<span className="text-[17px] font-semibold text-muted-foreground">/{t.makers}</span></div>
            <div className="label mt-1.5">clear both axes</div>
          </div>
          <div className="min-w-[280px] flex-1">
            <div className="flex h-2.5 gap-[3px]">
              {groups.clear.length > 0 && <span className="rounded-full transition-all" style={{ flex: groups.clear.length, background: C.clear }} />}
              {groups.selfOffset.length > 0 && <span className="rounded-full transition-all" style={{ flex: groups.selfOffset.length, background: C.self }} />}
              {groups.mustBuy.length > 0 && <span className="rounded-full transition-all" style={{ flex: groups.mustBuy.length, background: C.short }} />}
            </div>
            <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-ink-400">
              <MeterKey dot={C.clear} n={groups.clear.length} label="clear on both" />
              <MeterKey dot={C.self} n={groups.selfOffset.length} label="covered by own EV credits" />
              <MeterKey dot={C.short} n={groups.mustBuy.length} label="must buy credits" />
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="dnum text-[30px] font-bold leading-none text-ink-100">{Math.round(dc.ratio * 100)}%</div>
            <div className="label mt-1.5">NEV credit ratio{scenario.nevRatioTarget != null && <span className="text-primary"> · set</span>}</div>
          </div>
        </div>
      </Card>

      {/* ── STAT BAR ─────────────────────────────────────────────────────── */}
      <Card className="rise grid grid-cols-2 divide-x divide-y divide-border md:grid-cols-4 md:divide-y-0 [animation-delay:60ms]">
        <StatCell label="Fuel-economy credits" value={cr(t.cafcCredit)} accent={t.cafcCredit >= 0 ? 'text-safe' : 'text-danger'} sub={`surplus ${fmtInt(t.cafcSurplus)} · short ${fmtInt(t.cafcDeficit)}`} />
        <StatCell label="EV-volume credits" value={cr(t.nevBalance)} accent={t.nevBalance >= 0 ? 'text-safe' : 'text-danger'} sub={`earned ${fmtInt(t.nevEarned)} · req ${fmtInt(t.nevRequired)}`} />
        <StatCell label="Credits to buy" value={fmtInt(t.creditsToBuy)} accent={t.creditsToBuy > 0.5 ? 'text-danger' : 'text-safe'} sub="after self-offset" />
        <StatCell label="Cost to clear" value={fmtMoney(t.cost, pack.currency)} accent="text-ink-100" sub={`${bothOk} of ${t.makers} compliant`} />
      </Card>

      {/* ── OUTCOME GROUPS ───────────────────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-3">
        <OutcomeCard delay={80} color={C.clear} icon="check" title="Clear on both" count={groups.clear.length} makers={groups.clear} onPick={scrollToMaker}
          caption="Comfortable surplus on fuel economy and EV volume." />
        <OutcomeCard delay={130} color={C.self} icon="handshake" title="Covered by own EV credits" count={groups.selfOffset.length} makers={groups.selfOffset} onPick={scrollToMaker}
          caption="Behind on fuel economy, but their own spare EV credits cover it." />
        <OutcomeCard delay={180} color={C.short} icon="alert" title="Must buy credits" count={groups.mustBuy.length} makers={groups.mustBuy} onPick={scrollToMaker}
          caption={<>Short after self-offset — <b className="text-ink-200">{fmtMoney(t.cost, pack.currency)}</b> to clear at {fmtMoney(dc.creditPrice, pack.currency)}/credit.</>} />
      </div>

      {/* ── BATTERY DEMAND · the supply-side / CATL lens ─────────────────── */}
      <BatteryDemand dc={dc} currency={pack.currency} onPick={scrollToMaker} />

      {/* ── TWO-AXIS MAP ─────────────────────────────────────────────────── */}
      <Card className="rise [animation-delay:120ms]">
        <CardContent className="p-6">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-[17px] font-bold tracking-[-0.02em] text-ink-100">Where every maker stands</h2>
            <div className="flex flex-wrap items-center gap-3.5 text-[10.5px] text-muted-foreground">
              <MeterKey dot={C.clear} label="both clear" />
              <MeterKey dot={C.warn} label="one axis short" />
              <MeterKey dot={C.short} label="both short" />
              <span>bubble = volume · click to inspect</span>
            </div>
          </div>
          <p className="mb-2 max-w-[64ch] text-[12px] leading-[1.6] text-ink-400">Right = spare fuel-economy credits, up = spare EV credits. The green corner is safe on both; the red corner is short on both.</p>
          <QuadrantScatter oems={dc.oems} selected={selected} onSelect={(p) => setSelected(p === selected ? null : p)} currency={pack.currency} />
        </CardContent>
      </Card>

      {/* ── OFFSET DETAIL ────────────────────────────────────────────────── */}
      {sel && <div id="dc-offset"><OffsetPanel o={sel} currency={pack.currency} price={dc.creditPrice} onClose={() => setSelected(null)} /></div>}

      {/* ── FULL LEDGER ──────────────────────────────────────────────────── */}
      <Card className="rise overflow-hidden [animation-delay:160ms]">
        <button onClick={() => setShowLedger((v) => !v)} className="flex w-full items-center justify-between px-6 py-4 text-left transition-colors hover:bg-muted/50">
          <span className="flex items-center gap-2.5">
            <Icon name="scale" size={16} className="text-primary" />
            <span className="font-display text-[15px] font-bold text-ink-100">Full ledger</span>
            <Badge variant="secondary">all {t.makers} makers</Badge>
          </span>
          <span className="flex items-center gap-3">
            <BasisChip basis={basis} meta={basis === 'actuals' ? meta : undefined} />
            <Icon name="chevron" size={14} className={cn('text-muted-foreground transition-transform', showLedger && 'rotate-90')} />
          </span>
        </button>
        {showLedger && (
          <CardContent className="overlay-in border-t p-6 pt-4">
            <div className="mb-2 flex justify-end">
              <Button variant="outline" size="sm" onClick={exportCsv}><Icon name="section" size={12} /> Export CSV</Button>
            </div>
            <div className="overflow-x-auto">
              <Table data-testid="dual-credit-ledger">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-6" />
                    <SortHead k="parent" label="Manufacturer" num={false} />
                    <SortHead k="volume" label="Volume" />
                    <SortHead k="nevSharePct" label="NEV %" />
                    <TableHead className="text-right">CAFC act / tgt</TableHead>
                    <SortHead k="cafcCredit" label="CAFC credit" />
                    <TableHead className="text-right">NEV earn / req'd</TableHead>
                    <SortHead k="nevBalance" label="NEV balance" />
                    <SortHead k="creditsToBuy" label="To buy" />
                    <TableHead className="text-right">Verdict</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedOems.map((o) => {
                    const sm = STATUS_META[o.status]
                    const isOpen = expanded === o.parent
                    return [
                      <TableRow key={o.parent} onClick={() => setSelected(o.parent === selected ? null : o.parent)}
                        className={cn('cursor-pointer', selected === o.parent && 'bg-primary/[0.05]')}>
                        <TableCell className="pl-1" onClick={(e) => { e.stopPropagation(); setExpanded(isOpen ? null : o.parent) }}>
                          <Icon name="chevron" size={12} className={cn('text-muted-foreground transition-transform', isOpen && 'rotate-90')} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-semibold text-ink-100">
                          <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: sm.dot }} />{o.parent}
                        </TableCell>
                        <TableCell className="num text-right text-ink-400">{fmtInt(o.volume)}</TableCell>
                        <TableCell className="num text-right text-ink-300">{fmtNum(o.nevSharePct, 0)}%</TableCell>
                        <TableCell className="num text-right text-ink-300">{fmtNum(o.cafcActual, 2)} / {fmtNum(o.cafcTarget, 2)}</TableCell>
                        <TableCell className={cn('num text-right font-semibold', o.cafcCredit >= 0 ? 'text-safe' : 'text-danger')}>{cr(o.cafcCredit)}</TableCell>
                        <TableCell className="num text-right text-ink-300">{fmtInt(o.nevEarned)} / {fmtInt(o.nevRequired)}</TableCell>
                        <TableCell className={cn('num text-right font-semibold', o.nevBalance >= 0 ? 'text-safe' : 'text-danger')}>{cr(o.nevBalance)}</TableCell>
                        <TableCell className={cn('num text-right font-semibold', o.creditsToBuy > 0.5 ? 'text-danger' : 'text-muted-foreground')}>{o.creditsToBuy > 0.5 ? fmtInt(o.creditsToBuy) : '—'}</TableCell>
                        <TableCell className="text-right"><Badge variant="outline" className={cn('text-[10.5px]', sm.cls)}>{sm.t}</Badge></TableCell>
                      </TableRow>,
                      isOpen && (
                        <TableRow key={o.parent + '-exp'} className="bg-muted/40 hover:bg-muted/40">
                          <TableCell colSpan={10} className="p-3"><ModelBreakdown o={o} /></TableCell>
                        </TableRow>
                      ),
                    ]
                  })}
                </TableBody>
              </Table>
            </div>
            <p className="mt-3 text-[10.5px] leading-relaxed text-muted-foreground">
              CAFC credit = (target − actual) × volume. NEV earned = Σ per-vehicle standard credit (BEV min(0.0056·R+0.4, 3.4) ×range-band; PHEV 1.6; 2024+ era ≈ halved); NEV required = {Math.round(dc.ratio * 100)}% × adjusted conventional volume. A maker's own NEV surplus clears its CAFC deficit 1:1; an NEV deficit must be bought. Click a row to inspect offsetting, the chevron to drill to models.
            </p>
          </CardContent>
        )}
      </Card>

      {/* ── LEVERS ───────────────────────────────────────────────────────── */}
      <Card className="rise [animation-delay:200ms]">
        <CardContent className="p-6">
          <div className="mb-5 flex items-center gap-2">
            <Icon name="sliders" size={15} className="text-primary" />
            <h2 className="font-display text-[15px] font-bold tracking-[-0.01em] text-ink-100">Test the policy</h2>
            <span className="text-[11px] text-muted-foreground">— effects apply on the Scenario basis</span>
          </div>
          <div className="grid gap-7 md:grid-cols-3">
            <Lever label="NEV credit ratio" hint="Statutory 18→58% (2023–27). Raise it to stress the EV mandate.">
              <Slider min={0} max={80} step={1} value={[scenario.nevRatioTarget ?? Math.round(statutoryRatio * 100)]}
                onValueChange={([v]) => patchScenario({ nevRatioTarget: v })} />
              <div className="mt-2 flex items-center justify-between text-[11px]">
                <span className="num font-bold text-ink-100">{scenario.nevRatioTarget ?? Math.round(statutoryRatio * 100)}%</span>
                {scenario.nevRatioTarget != null && <button onClick={() => patchScenario({ nevRatioTarget: null })} className="text-primary hover:underline">reset to statutory</button>}
              </div>
            </Lever>
            <Lever label="Credit price" hint="¥ per credit — sets the value of every position and the cost to clear.">
              <Slider min={0} max={5000} step={100} value={[scenario.nevCreditPrice ?? dc.creditPrice]}
                onValueChange={([v]) => patchScenario({ nevCreditPrice: v })} />
              <div className="mt-2 flex items-center justify-between text-[11px]">
                <span className="num font-bold text-ink-100">{fmtMoney(scenario.nevCreditPrice ?? dc.creditPrice, pack.currency)}</span>
                {scenario.nevCreditPrice != null && <button onClick={() => patchScenario({ nevCreditPrice: null })} className="text-primary hover:underline">reset</button>}
              </div>
            </Lever>
            <Lever label="Basis" hint="Actuals is the as-sold book of record. Scenario applies the working levers.">
              <Tabs value={basisSel} onValueChange={(v) => setBasisSel(v as 'actuals' | 'scenario')}>
                <TabsList className="w-full">
                  <TabsTrigger value="actuals" className="flex-1">Actuals</TabsTrigger>
                  <TabsTrigger value="scenario" className="flex-1">Scenario</TabsTrigger>
                </TabsList>
              </Tabs>
            </Lever>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function StatCell({ label, value, sub, accent }: { label: string; value: string; sub: string; accent: string }) {
  return (
    <div className="px-6 py-5">
      <div className="label">{label}</div>
      <div className={cn('dnum mt-2 text-[25px] font-bold leading-none tracking-[-0.02em]', accent)}>{value}</div>
      <div className="mt-2 text-[10.5px] leading-snug text-muted-foreground">{sub}</div>
    </div>
  )
}

function OutcomeCard({ color, icon, title, count, caption, makers, onPick, delay }:
  { color: string; icon: IconName; title: string; count: number; caption: React.ReactNode; makers: OemDualCredit[]; onPick: (p: string) => void; delay: number }) {
  const [open, setOpen] = useState(false)
  return (
    <Card className="rise relative overflow-hidden" style={{ animationDelay: `${delay}ms` }}>
      <span aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ background: color, opacity: 0.9 }} />
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: `${color}14`, color }}><Icon name={icon} size={15} /></span>
          <span className="dnum text-[28px] font-bold leading-none" style={{ color }}>{count}</span>
        </div>
        <div className="mt-3.5 text-[13px] font-semibold text-ink-100">{title}</div>
        <p className="mt-1 text-[11.5px] leading-[1.55] text-muted-foreground">{caption}</p>
        {count > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)} className="mt-2 h-auto px-0 text-[11px] font-semibold text-ink-400 hover:bg-transparent hover:text-ink-100">
            {open ? 'Hide' : 'Show'} makers <Icon name="chevron" size={11} className={cn('ml-1 transition-transform', open && 'rotate-90')} />
          </Button>
        )}
        {open && (
          <div className="overlay-in mt-2.5 flex flex-wrap gap-1.5">
            {makers.map((m) => (
              <Button key={m.parent} variant="outline" size="sm" onClick={() => onPick(m.parent)} className="h-auto px-2 py-1 text-[10.5px] font-medium text-ink-400">
                {m.parent.replace(/\s*\(.*/, '')}
              </Button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── battery-demand · the supply-side view (turns NEV credits into GWh) ────────
function BatteryDemand({ dc, currency, onPick }: { dc: ReturnType<typeof buildDualCredit>; currency: string; onPick: (p: string) => void }) {
  const t = dc.totals
  const shortGWh = dc.oems.filter((o) => o.creditsToBuy > 0.5).reduce((a, o) => a + o.batteryGWh, 0)
  const rows = [...dc.oems].sort((a, b) => b.batteryGWh - a.batteryGWh)
  const maxG = Math.max(1, ...rows.map((o) => o.batteryGWh))
  const gwh = (v: number) => `${fmtNum(v, v < 10 ? 1 : 0)} GWh`
  return (
    <Card className="rise border-l-[3px] border-l-primary [animation-delay:110ms]">
      <CardContent className="p-6">
        <div className="mb-1 flex items-center gap-2">
          <Icon name="bolt" size={15} className="text-primary" />
          <h2 className="font-display text-[16px] font-bold tracking-[-0.02em] text-ink-100">Battery demand · the supply-side view</h2>
        </div>
        <p className="mb-4 max-w-[72ch] text-[12px] leading-[1.6] text-ink-400">
          Every NEV the dual-credit mandate forces onto the market needs cells. This translates the credit ledger into <b className="text-ink-200">GWh of battery demand</b> — total, and the slice concentrated at makers who are credit-short and must electrify (build EVs) rather than buy their way clear. That short-maker demand is the addressable pipeline.
        </p>
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <MiniStat label="NEV battery demand" value={gwh(t.batteryGWh)} accent="text-ink-100" sub="cells across the market" />
          <MiniStat label="At credit-short makers" value={gwh(shortGWh)} accent="text-primary" sub={`${dc.oems.filter((o) => o.creditsToBuy > 0.5).length} makers under pressure`} />
          <MiniStat label="To close all shortfalls" value={gwh(t.gwhToClose)} accent="text-danger" sub="if they build EVs, not buy credits" />
          <MiniStat label="Implied cell value" value={fmtMoney(t.batteryGWh * 1e6 * 400, currency)} accent="text-ink-100" sub="≈ ¥400/kWh pack cost" />
        </div>
        <div className="space-y-2">
          {rows.slice(0, 10).map((o) => {
            const short = o.creditsToBuy > 0.5
            return (
              <button key={o.parent} onClick={() => onPick(o.parent)} className="flex w-full items-center gap-4 rounded-lg px-1 py-1 text-left transition hover:bg-muted/40">
                <div className="w-44 shrink-0 truncate text-[12px] font-semibold text-ink-200">
                  <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: short ? C.short : C.clear }} />{o.parent.replace(/\s*\(.*/, '')}
                </div>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${(o.batteryGWh / maxG) * 100}%`, background: short ? C.short : C.clear }} /></div>
                <div className="dnum w-20 shrink-0 text-right text-[13px] font-bold text-ink-100">{gwh(o.batteryGWh)}</div>
                <div className="num w-28 shrink-0 text-right text-[11px] text-muted-foreground">{short ? `+${fmtNum(o.gwhToClose, 1)} to close` : 'clears'}</div>
              </button>
            )
          })}
        </div>
        <p className="mt-4 border-t border-black/[0.05] pt-3 text-[10.5px] leading-relaxed text-muted-foreground">
          Battery demand = Σ NEV volume × usable pack size (from each model's range/spec). "To close" converts a maker's residual credit shortfall into the GWh of extra long-range BEVs that would earn it — the build-vs-buy pipeline. Illustrative pack economics; the mandate trajectory is statutory.
        </p>
      </CardContent>
    </Card>
  )
}

function MiniStat({ label, value, sub, accent }: { label: string; value: string; sub: string; accent: string }) {
  return (
    <div className="rounded-xl border border-black/[0.06] bg-muted/30 p-3.5">
      <div className="label">{label}</div>
      <div className={cn('dnum mt-1.5 text-[19px] font-bold leading-none tracking-[-0.02em]', accent)}>{value}</div>
      <div className="mt-1.5 text-[10px] leading-snug text-muted-foreground">{sub}</div>
    </div>
  )
}

function MeterKey({ dot, n, label }: { dot: string; n?: number; label: string }) {
  return <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: dot }} />{n != null && <b className="num font-semibold text-ink-200">{n}</b>} {label}</span>
}

function QuadrantScatter({ oems, selected, onSelect, currency }: { oems: OemDualCredit[]; selected: string | null; onSelect: (p: string) => void; currency: string }) {
  const [hover, setHover] = useState<string | null>(null)
  const W = 760, H = 440, PAD = 46
  const iw = W - PAD * 2, ih = H - PAD * 2
  const sst = (v: number) => Math.sign(v) * Math.sqrt(Math.abs(v))
  const maxX = Math.max(1, ...oems.map((o) => Math.abs(sst(o.cafcCredit))))
  const maxY = Math.max(1, ...oems.map((o) => Math.abs(sst(o.nevBalance))))
  const px = (v: number) => PAD + iw / 2 + (sst(v) / maxX) * (iw / 2) * 0.9
  const py = (v: number) => PAD + ih / 2 - (sst(v) / maxY) * (ih / 2) * 0.9
  const maxVol = Math.max(1, ...oems.map((o) => o.volume))
  const rad = (vol: number) => 6 + Math.sqrt(vol / maxVol) * 24
  const cx0 = px(0), cy0 = py(0)
  const active = hover ?? selected
  const labelSet = new Set([...oems].sort((a, b) => b.volume - a.volume).slice(0, 6).map((o) => o.parent))
  const shortName = (p: string) => p.replace(/\s*\(.*/, '').replace(/ (Auto|Automobile|Passenger).*/, '').slice(0, 14)
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="overflow-visible" role="img" aria-label="Fuel-economy credits versus EV-volume credits by manufacturer">
        <rect x={cx0} y={PAD} width={W - PAD - cx0} height={cy0 - PAD} rx={12} fill={C.clear} fillOpacity={0.05} />
        <rect x={PAD} y={PAD} width={cx0 - PAD} height={cy0 - PAD} rx={12} fill={C.warn} fillOpacity={0.045} />
        <rect x={cx0} y={cy0} width={W - PAD - cx0} height={H - PAD - cy0} rx={12} fill={C.warn} fillOpacity={0.045} />
        <rect x={PAD} y={cy0} width={cx0 - PAD} height={H - PAD - cy0} rx={12} fill={C.short} fillOpacity={0.05} />
        <line x1={PAD} y1={cy0} x2={W - PAD} y2={cy0} stroke="currentColor" className="text-ink-500/20" strokeWidth={1} />
        <line x1={cx0} y1={PAD} x2={cx0} y2={H - PAD} stroke="currentColor" className="text-ink-500/20" strokeWidth={1} />
        <text x={W - PAD - 8} y={PAD + 16} textAnchor="end" className="text-[10.5px] font-bold" fill={C.clear} opacity={0.75}>safe · both surplus</text>
        <text x={PAD + 8} y={PAD + 16} className="text-[10.5px] font-bold" fill={C.warn} opacity={0.75}>EV covers the gap</text>
        <text x={W - PAD - 8} y={H - PAD - 10} textAnchor="end" className="text-[10.5px] font-bold" fill={C.warn} opacity={0.75}>EV short · must buy</text>
        <text x={PAD + 8} y={H - PAD - 10} className="text-[10.5px] font-bold" fill={C.short} opacity={0.75}>both short · must buy</text>
        <text x={W - PAD} y={cy0 - 7} textAnchor="end" className="fill-current text-ink-500 text-[10px]">more fuel-economy credit →</text>
        <text x={cx0 + 7} y={PAD - 7} className="fill-current text-ink-500 text-[10px]">↑ more EV credit</text>
        {oems.map((o) => {
          const on = active === o.parent
          const sm = STATUS_META[o.status]
          const x = px(o.cafcCredit), y = py(o.nevBalance), r = rad(o.volume)
          return (
            <g key={o.parent} transform={`translate(${x},${y})`} className="lc-bubble cursor-pointer"
              onMouseEnter={() => setHover(o.parent)} onMouseLeave={() => setHover(null)} onClick={() => onSelect(o.parent)}>
              <circle r={r} fill={sm.dot} fillOpacity={on ? 0.5 : 0.26} stroke={sm.dot} strokeWidth={on || selected === o.parent ? 2.5 : 1.2} className="transition-all" />
              {(on || labelSet.has(o.parent)) && <text y={-r - 5} textAnchor="middle" className="fill-current text-ink-200 text-[9.5px] font-semibold">{shortName(o.parent)}</text>}
            </g>
          )
        })}
      </svg>
      {active && (() => {
        const o = oems.find((x) => x.parent === active)!
        return (
          <div className="modal-pop pointer-events-none absolute right-2 top-2 rounded-xl border bg-popover px-3.5 py-2.5 text-[11px] shadow-xl">
            <div className="font-bold text-ink-100">{o.parent}</div>
            <div className="mt-1 text-ink-400">Fuel-econ <b className={o.cafcCredit >= 0 ? 'text-safe' : 'text-danger'}>{cr(o.cafcCredit)}</b> · EV <b className={o.nevBalance >= 0 ? 'text-safe' : 'text-danger'}>{cr(o.nevBalance)}</b></div>
            <div className="text-muted-foreground">{fmtInt(o.volume)} cars · {o.creditsToBuy > 0.5 ? `buy ${fmtInt(o.creditsToBuy)} (${fmtMoney(o.cost, currency)})` : STATUS_META[o.status].t}</div>
          </div>
        )
      })()}
    </div>
  )
}

function ModelBreakdown({ o }: { o: OemDualCredit }) {
  return (
    <div className="overlay-in overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Model</TableHead>
            <TableHead>Powertrain</TableHead>
            <TableHead className="text-right">Volume</TableHead>
            <TableHead className="text-right">Fuel use (L/100km)</TableHead>
            <TableHead className="text-right">EV credit / car</TableHead>
            <TableHead className="text-right">EV credits</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {o.lines.map((l, i) => (
            <TableRow key={l.model + i}>
              <TableCell className="font-medium text-ink-200">{l.model}</TableCell>
              <TableCell><Badge variant="secondary" className="text-[9.5px]">{l.powertrain}</Badge></TableCell>
              <TableCell className="num text-right text-ink-400">{fmtInt(l.sales)}</TableCell>
              <TableCell className="num text-right text-ink-300">{l.isNev && l.cafcL100 === 0 ? '0 (zero-fuel)' : fmtNum(l.cafcL100, 2)}</TableCell>
              <TableCell className="num text-right text-ink-300">{l.isNev ? fmtNum(l.nevCreditEach, 2) : '—'}</TableCell>
              <TableCell className={cn('num text-right font-semibold', l.isNev ? 'text-safe' : 'text-muted-foreground')}>{l.isNev ? `+${fmtInt(l.nevCreditTotal)}` : '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function Lever({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label mb-2.5">{label}</div>
      {children}
      <p className="mt-2 text-[10.5px] leading-snug text-muted-foreground">{hint}</p>
    </div>
  )
}

function OffsetPanel({ o, currency, price, onClose }: { o: OemDualCredit; currency: string; price: number; onClose: () => void }) {
  const cafcDef = Math.max(0, -o.cafcCredit)
  const steps = [
    { label: 'Fuel-economy credit (CAFC)', v: o.cafcCredit, tone: o.cafcCredit >= 0 ? 'safe' : 'danger' as const },
    { label: 'EV-volume credit (NEV)', v: o.nevBalance, tone: o.nevBalance >= 0 ? 'safe' : 'danger' as const },
  ]
  const maxAbs = Math.max(1, ...steps.map((s) => Math.abs(s.v)), o.creditsToBuy)
  return (
    <Card className="rise border-l-[3px] border-l-primary">
      <CardContent className="p-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display flex items-center gap-2 text-[16px] font-bold tracking-[-0.01em] text-ink-100"><Icon name="target" size={15} className="text-primary" /> {o.parent} · how it settles</h2>
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3.5">
            {steps.map((s) => (
              <div key={s.label}>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-ink-400">{s.label}</span>
                  <span className={cn('num font-bold', s.tone === 'safe' ? 'text-safe' : 'text-danger')}>{cr(s.v)}</span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full" style={{ width: `${(Math.abs(s.v) / maxAbs) * 100}%`, background: s.tone === 'safe' ? C.clear : C.short }} />
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-xl border bg-muted/40 p-4 text-[12px] leading-[1.6] text-ink-300">
            {o.status === 'both-clear' && <p><b className="text-safe">Clears on both.</b> Fuel-economy surplus {cr(o.cafcCredit)} and EV surplus {cr(o.nevBalance)} — nothing to buy.</p>}
            {o.status === 'self-offset' && <p><b className="text-safe">Cleared internally.</b> The fuel-economy shortfall of {fmtInt(cafcDef)} is met by spending {fmtInt(o.nevUsedForCafc)} of this maker's own EV credits — no purchase needed.</p>}
            {(o.status === 'cafc-short' || o.status === 'both-short') && <p><b className="text-danger">Fuel-economy shortfall.</b> After spending {fmtInt(o.nevUsedForCafc)} own EV credits, {fmtInt(o.cafcResidual)} credits remain to source (bank, affiliate transfer, or purchase).</p>}
            {(o.status === 'nev-short' || o.status === 'both-short') && <p className="mt-2"><b className="text-danger">EV shortfall.</b> {fmtInt(o.nevShort)} EV credits must be <b>bought</b> — a fuel-economy surplus cannot rescue an EV deficit.</p>}
            <Separator className="my-2.5" />
            <p className="text-ink-400">Residual to buy: <b className="text-ink-100">{fmtInt(o.creditsToBuy)}</b> credits · cost <b className="text-ink-100">{fmtMoney(o.cost, currency)}</b> @ {fmtMoney(price, currency)}/credit.</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
