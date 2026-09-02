/* ───────────────────────────────────────────────────────────────────────────
   DATA — sources, imports and whether the numbers can be filed.
   ---------------------------------------------------------------------------
   Everything else in the platform is downstream of this module, so it answers
   the only two questions that matter about a dataset:

     · IS IT CURRENT?  Every source has a cadence. A source past its window is
       an exception whatever it says, and the strip at the top says so.
     · CAN IT BE FILED? Reconciliation and an outlier scan, run through the same
       engine the rest of the product uses, with the failing rows named.

   The Data steward agent handles the part people actually get wrong: mapping an
   arriving file to the schema. It proposes a mapping with a confidence per
   column and refuses to let a low-confidence column through silently.
   ─────────────────────────────────────────────────────────────────────────── */
import React, { useMemo, useRef, useState } from 'react'
import {
  Badge, Button, Callout, Card, cx, EmptyState, Metric, MetricRow, Panel,
  Progress, Segmented, StatusDot, Table, Td, Th, Tooltip, Tr, useToast, type Tone,
} from '../../design/primitives'
import Icon from '../../design/icons'
import { ShareBar, DV } from '../../design/charts'
import { ModulePage } from '../../shell/AppShell'
import { AgentLauncher } from '../../agents/ui/AgentConsole'
import { FindingCard } from '../../agents/ui/RunTrace'
import { useApp, useRole } from '../../state/appStore'
import { settledThrough, usePosition } from '../../state/usePosition'
import { can } from '../../auth/rbac'
import { clientContext, dataQuality } from '../../../engine/tools'
import { PACK_LIST, getPack } from '../../../engine/rulepacks'
import { getMeta } from '../../../data/fleet'
import { fmtInt } from '../../../engine/engine'
import type { CountryId } from '../../../engine/types'
import { ForecastData, FundamentalData } from './browsers'

const CADENCE_DAYS: Record<string, number> = { EU: 90, IN: 30, UK: 90, AU: 90, CN: 30 }

function age(iso: string | null) {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

/* ── every market's source, side by side ─────────────────────────────────── */

function SourceTable() {
  const markets = useApp((s) => s.markets)
  const setCountry = useApp((s) => s.setCountry)
  const country = useApp((s) => s.country)
  const rows = PACK_LIST.filter((p) => markets.includes(p.id))

  return (
    <Panel flush title="Sources" icon={<Icon name="data" size={14} />}
      sub="One row per market. The refresh window is the cadence that market's source actually publishes on.">
      <Table>
        <thead>
          <tr>
            <Th>Market</Th>
            <Th>Source</Th>
            <Th align="center">Coverage</Th>
            <Th align="right">Version</Th>
            <Th align="right">Age</Th>
            <Th align="center">Freshness</Th>
            <Th align="right">Refresh window</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const meta = getMeta(p.id as CountryId)
            const a = age(meta.lastRefreshed)
            const win = CADENCE_DAYS[p.id] ?? 30
            const tone: Tone = a == null ? 'neutral' : a <= win * 0.7 ? 'pos' : a <= win ? 'warn' : 'neg'
            return (
              <Tr key={p.id} interactive selected={country === p.id} onClick={() => setCountry(p.id as CountryId)}>
                <Td strong><span className="flex items-center gap-2"><span className="text-[14px] leading-none">{p.flag}</span>{p.name}</span></Td>
                <Td className="max-w-[300px]"><span className="block truncate" title={meta.source || p.source}>{meta.source || p.source}</span></Td>
                <Td align="center">
                  <Badge tone={p.coverage.tier === 'market' ? 'pos' : p.coverage.tier === 'partial' ? 'warn' : 'neutral'}>
                    {p.coverage.tier === 'market' ? 'Market' : p.coverage.tier === 'partial' ? 'Partial' : 'Preview'}
                  </Badge>
                </Td>
                <Td align="right" mono className="!text-[var(--ink-4)]">{meta.datasetVersion || 'bundled'}</Td>
                <Td align="right">{a == null ? <span className="text-[var(--ink-5)]">—</span> : `${a}d`}</Td>
                <Td align="center">
                  <Tooltip content={a == null ? 'Bundled extract — never refreshed from a live source.' : `${a} days old against a ${win}-day refresh window.`}>
                    <span className="inline-flex items-center gap-1.5">
                      <StatusDot tone={tone} size={6} pulse={tone === 'neg'} />
                      <span className="text-[11.5px] text-[var(--ink-3)]">
                        {a == null ? 'bundled' : a <= win * 0.7 ? 'current' : a <= win ? 'due soon' : 'overdue'}
                      </span>
                    </span>
                  </Tooltip>
                </Td>
                <Td align="right">
                  <Tooltip content={`${a ?? 0} of ${win} days into this source's refresh window.`}>
                    <span className="inline-block w-[76px] align-middle">
                      <Progress value={a == null ? 0 : Math.min(100, (a / win) * 100)} tone={tone} height={4} />
                    </span>
                  </Tooltip>
                </Td>
              </Tr>
            )
          })}
        </tbody>
      </Table>
    </Panel>
  )
}

/* ── the import lane ──────────────────────────────────────────────────────── */

function ImportLane() {
  const role = useRole()
  const country = useApp((s) => s.country)
  const year = useApp((s) => s.scenario.year)
  const session = useApp((s) => s.session)
  const setConsole = useApp((s) => s.setConsole)
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [drag, setDrag] = useState(false)
  const allowed = can(role, 'data.import')

  const accept = (f: File | null | undefined) => {
    if (!f) return
    setFile(f)
    toast({
      tone: 'info', title: 'File staged',
      body: `${f.name} is ready. Run the Data steward to map it against the schema — nothing is imported until you approve the mapping.`,
    })
  }

  return (
    <Panel title="Import" icon={<Icon name="upload" size={14} />}
      sub="Drop a registrations or specification workbook. It is inspected and mapped before anything is loaded.">
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); accept(e.dataTransfer.files?.[0]) }}
        className={cx('rounded-[var(--r-md)] border-2 border-dashed px-4 py-8 text-center transition-colors',
          drag ? 'border-[var(--brand)] bg-[var(--brand-tint)]' : 'border-[var(--line-strong)] bg-[var(--surface-2)]')}>
        <Icon name="upload" size={22} className="mx-auto mb-2 text-[var(--ink-4)]" />
        {file ? (
          <>
            <div className="text-[12.5px] font-semibold text-[var(--ink-1)]">{file.name}</div>
            <div className="mt-0.5 text-[11.5px] text-[var(--ink-4)]">{(file.size / 1024).toFixed(0)} KB · staged, not imported</div>
            <div className="mt-3 flex items-center justify-center gap-2">
              <AgentLauncher moduleId="data" hint="Map this file against the platform schema" />
              <Button size="sm" variant="ghost" onClick={() => setFile(null)}>Remove</Button>
            </div>
          </>
        ) : (
          <>
            <div className="text-[12.5px] text-[var(--ink-2)]">Drop a file here, or</div>
            <Button size="sm" variant="secondary" className="mt-2" disabled={!allowed}
              onClick={() => input.current?.click()}>Choose a file</Button>
            {!allowed && <div className="mt-2 text-[11px] text-[var(--ink-4)]">Your role cannot import data.</div>}
          </>
        )}
        <input ref={input} type="file" hidden accept=".xlsx,.xls,.csv"
          onChange={(e) => accept(e.target.files?.[0])} />
      </div>

      <ul className="mt-3 space-y-1.5">
        {[
          'The file is inspected first — sheets, headers, units and row shape.',
          'Each column is matched to the platform schema with a confidence score.',
          'Anything below confidence is surfaced for you, never guessed through.',
          'Nothing reaches the workspace until you approve the mapping.',
        ].map((t, i) => (
          <li key={t} className="flex gap-2 text-[11.5px] leading-relaxed text-[var(--ink-3)]">
            <span className="w-3.5 shrink-0 text-right tabular-nums text-[var(--ink-5)]">{i + 1}</span>{t}
          </li>
        ))}
      </ul>
    </Panel>
  )
}

/* ── quality ──────────────────────────────────────────────────────────────── */

function QualityReport() {
  const country = useApp((s) => s.country)
  const workingYear = useApp((s) => s.scenario.year)
  const markets = useApp((s) => s.markets)
  const { pack } = usePosition('actuals')
  // "Can these numbers be filed?" is a question about the RECORD. Running it
  // over the source's forward rows would grade a projection for filability,
  // which is not a thing.
  const settled = settledThrough(country)
  const year = Math.min(workingYear, settled)
  const clamped = workingYear > settled

  const report = useMemo(() => {
    try {
      const ctx = clientContext(markets, true)
      return dataQuality(ctx, country, year).value
    } catch {
      return null
    }
  }, [country, year, markets])

  if (!report) {
    return (
      <Panel title="Quality" icon={<Icon name="shield" size={14} />}>
        <EmptyState compact icon={<Icon name="alert" size={17} />} title="Quality report unavailable"
          body="The reconciliation could not run against the loaded dataset for this year." />
      </Panel>
    )
  }

  const tone = report.verdict === 'pass' ? 'pos' : report.verdict === 'warn' ? 'warn' : 'neg'

  return (
    <Panel title="Can these numbers be filed?" icon={<Icon name="shield" size={14} />}
      sub={clamped
        ? `Reconciliation and outlier scan over the ${pack.name} record for ${year} — the latest settled year. ${workingYear} is a forward row, and a projection cannot be graded for filability.`
        : `Reconciliation and outlier scan over the ${pack.name} record for ${year}.`}
      actions={
        <>
          {clamped && <Badge tone="neutral">reading {year}</Badge>}
          <Badge tone={tone} dot>{report.verdict === 'pass' ? 'Filable' : report.verdict === 'warn' ? 'Filable with caveats' : 'Not filable'}</Badge>
        </>
      }>

      <MetricRow className="mb-4">
        <Metric size="sm" label="Rows" value={fmtInt(report.coverage.rows)} sub={`${fmtInt(report.coverage.units)} units`} />
        <Metric size="sm" label="Entities" value={report.coverage.parents} sub={`${report.coverage.models} models`} />
        <Metric size="sm" label="Errors" value={report.anomalies.errors} tone={report.anomalies.errors ? 'neg' : 'pos'} sub="rows that would fail a filing" />
        <Metric size="sm" label="Warnings" value={report.anomalies.warns} tone={report.anomalies.warns ? 'warn' : undefined} sub="rows worth a look" />
      </MetricRow>

      <div className="t-label mb-2">Checks</div>
      <ul className="mb-4 space-y-2">
        {report.checks.map((c) => (
          <li key={c.label} className="flex items-start gap-2.5">
            <StatusDot size={7} tone={c.status === 'pass' ? 'pos' : c.status === 'warn' ? 'warn' : 'neg'} />
            <div className="min-w-0">
              <div className="text-[12px] font-medium text-[var(--ink-1)]">{c.label}</div>
              <div className="mt-0.5 text-[11px] leading-relaxed text-[var(--ink-4)]">{c.detail}</div>
            </div>
          </li>
        ))}
      </ul>

      {!!Object.keys(report.anomalies.byKind).length && (
        <>
          <div className="t-label mb-2">Anomalies by kind</div>
          <ShareBar height={11}
            parts={Object.entries(report.anomalies.byKind).map(([name, value], i) => ({ name, value: value as number, color: DV[i % DV.length] }))} />
        </>
      )}

      {!!report.worstRows.length && (
        <>
          <div className="t-label mb-2 mt-4">Rows that need attention</div>
          <div className="overflow-hidden rounded-[var(--r-sm)] border border-[var(--line)]">
            <Table>
              <thead>
                <tr><Th>Row</Th><Th>Kind</Th><Th>What is wrong</Th></tr>
              </thead>
              <tbody>
                {report.worstRows.map((r, i) => (
                  <Tr key={i}>
                    <Td strong className="max-w-[220px]"><span className="block truncate">{r.label}</span></Td>
                    <Td><Badge tone={r.severity === 'error' ? 'neg' : 'warn'}>{r.kind}</Badge></Td>
                    <Td className="!text-[var(--ink-3)]">{r.message}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
        </>
      )}

      <Callout className="mt-4" tone={report.datasetTier === 'preview' ? 'warn' : 'neutral'} icon={<Icon name="file" size={14} />}>
        {report.note}
      </Callout>
    </Panel>
  )
}

/* ── the module ───────────────────────────────────────────────────────────── */

export default function DataModule() {
  const runs = useApp((s) => s.runs)
  const setConsole = useApp((s) => s.setConsole)
  const steward = runs.find((r) => r.agentId === 'data.steward')
  const storedTab = useApp((s) => s.moduleTab.data)
  const setStoredTab = useApp((s) => s.setModuleTab)
  const tab = (storedTab as 'sources' | 'fundamental' | 'forecast') ?? 'sources'
  const setTab = (t: 'sources' | 'fundamental' | 'forecast') => setStoredTab('data', t)

  return (
    <ModulePage wide
      title="Data"
      sub="Where every number in the platform comes from, how fresh it is, and whether it could survive a filing."
      actions={<AgentLauncher moduleId="data" hint="Profile the loaded data and grade it" />}>

      <Segmented className="mb-4" value={tab} onChange={setTab}
        options={[
          { id: 'sources', label: 'Sources & quality', icon: <Icon name="data" size={13} />, hint: 'Freshness, import and whether it could be filed' },
          { id: 'fundamental', label: 'Fundamental data', icon: <Icon name="list" size={13} />, hint: 'The rows the engine reads' },
          { id: 'forecast', label: 'Forecast data', icon: <Icon name="forecast" size={13} />, hint: 'The rows the engine produces for forward years' },
        ]} />

      {tab === 'fundamental' && <FundamentalData />}
      {tab === 'forecast' && <ForecastData />}

      {tab === 'sources' && (<>
      <div className="mb-4"><SourceTable /></div>

      {steward?.findings.length ? (
        <section className="mb-4">
          <div className="mb-2 flex items-center gap-2">
            <Icon name="agent" size={13} className="text-[var(--agent)]" />
            <span className="t-label !text-[var(--agent-ink)]">Data steward · {steward.findings.length} {steward.findings.length === 1 ? 'issue' : 'issues'}</span>
            <button onClick={() => { useApp.getState().setActiveRun(steward.id); setConsole(true) }}
              className="text-[11px] text-[var(--ink-4)] underline-offset-2 hover:text-[var(--ink-2)] hover:underline">see the working</button>
          </div>
          <div className="grid gap-2 lg:grid-cols-2">{steward.findings.slice(0, 4).map((f) => <FindingCard key={f.id} f={f} />)}</div>
        </section>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
        <ImportLane />
        <QualityReport />
      </div>
      </>)}
    </ModulePage>
  )
}
