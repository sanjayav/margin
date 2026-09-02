/* ───────────────────────────────────────────────────────────────────────────
   Agent console — the right rail.
   ---------------------------------------------------------------------------
   Docked rather than modal, because watching an agent work while reading the
   screen it is working on is the entire point. Three views:

     Agents    — what is available here, what it does, and how to start it.
     Run       — the live trace of the run you are watching.
     Activity  — every run in this session, newest first.

   The console never blocks the workspace. An agent can be mid-run while you
   keep reading; nothing it produces reaches your assumptions until you approve.
   ─────────────────────────────────────────────────────────────────────────── */
import React, { useMemo, useState } from 'react'
import {
  Badge, Button, cx, EmptyState, IconButton, Input, Segmented, Spinner, StatusDot, Tooltip, relTime, useToast,
} from '../../design/primitives'
import Icon from '../../design/icons'
import { useApp, useRole } from '../../state/appStore'
import { can } from '../../auth/rbac'
import { AGENTS, agentsForModule, getAgent } from '../registry'
import type { AgentDef, AgentRun, ModuleId } from '../kernel'
import { STATUS_LABEL, STATUS_TONE, isRunning } from '../kernel'
import { decideRun, startRun } from '../client'
import { RunTrace } from './RunTrace'

/* ── one agent, ready to run ──────────────────────────────────────────────── */

function AgentRow({ agent, expanded, onToggle, onRun, busy, allowed }: {
  agent: AgentDef; expanded: boolean; onToggle: () => void
  onRun: (prompt?: string) => void; busy: boolean; allowed: boolean
}) {
  const [prompt, setPrompt] = useState('')
  return (
    <div className={cx('overflow-hidden rounded-[var(--r-md)] border transition-colors',
      expanded ? 'border-[var(--line-strong)] bg-[var(--surface-1)]' : 'border-[var(--line)] bg-[var(--surface-1)]')}>
      <button onClick={onToggle} className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left">
        <span className="mt-px grid h-7 w-7 shrink-0 place-items-center rounded-[var(--r-sm)]"
          style={{ background: 'var(--agent-tint)', color: agent.accent }}>
          <Icon name="agent" size={15} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="text-[12.5px] font-semibold text-[var(--ink-1)]">{agent.name}</span>
            {busy && <Spinner size={11} className="text-[var(--agent)]" />}
          </span>
          <span className="mt-0.5 block text-[11.5px] leading-relaxed text-[var(--ink-3)]">{agent.purpose}</span>
        </span>
        <Icon name="chevron" size={12} className={cx('mt-1.5 shrink-0 text-[var(--ink-5)] transition-transform', expanded && 'rotate-90')} />
      </button>

      {expanded && (
        <div className="anim-fade border-t border-[var(--line-soft)] px-3 py-3">
          <div className="t-label mb-1.5">What it does each run</div>
          <ol className="mb-3 space-y-1">
            {agent.method.map((m, i) => (
              <li key={i} className="flex gap-2 text-[11.5px] leading-relaxed text-[var(--ink-3)]">
                <span className="w-3.5 shrink-0 text-right tabular-nums text-[var(--ink-5)]">{i + 1}</span>{m}
              </li>
            ))}
          </ol>

          <div className="t-label mb-1.5">What it can reach</div>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {agent.tools.map((t) => (
              <Tooltip key={t.id} content={t.blurb}>
                <span className={cx('inline-flex items-center gap-1 rounded-[var(--r-xs)] border px-1.5 py-[3px] text-[10.5px]',
                  t.external ? 'border-[var(--info-line)] bg-[var(--info-tint)] text-[var(--info-ink)]' : 'border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink-3)]')}>
                  <Icon name={t.external ? 'globe' : 'tool'} size={10} />{t.label}
                </span>
              </Tooltip>
            ))}
          </div>

          {allowed ? (
            <>
              <Input value={prompt} onChange={(e) => setPrompt(e.target.value)}
                placeholder="Optional — narrow the run, e.g. “focus on Tata and Mahindra”"
                onKeyDown={(e) => { if (e.key === 'Enter' && !busy) onRun(prompt || undefined) }} />
              <div className="mt-2 flex items-center gap-2">
                <Button size="sm" variant="primary" loading={busy} icon={<Icon name="play" size={12} />}
                  onClick={() => onRun(prompt || undefined)}>Run agent</Button>
                <span className="text-[10.5px] text-[var(--ink-4)]">
                  {agent.cadence === 'on-demand' ? 'Runs when you ask' : `Also runs ${agent.cadence}`}
                </span>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-1.5 rounded-[var(--r-sm)] bg-[var(--surface-2)] px-2.5 py-2 text-[11.5px] text-[var(--ink-4)]">
              <Icon name="lock" size={12} /> Your role cannot run this agent.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ── run list ─────────────────────────────────────────────────────────────── */

function RunRow({ run, active, onClick }: { run: AgentRun; active: boolean; onClick: () => void }) {
  const agent = getAgent(run.agentId)
  return (
    <button onClick={onClick}
      className={cx('flex w-full items-center gap-2.5 rounded-[var(--r-sm)] px-2.5 py-2 text-left transition-colors',
        active ? 'bg-[var(--brand-tint)]' : 'hover:bg-[var(--surface-2)]')}>
      <StatusDot tone={STATUS_TONE[run.status]} pulse={isRunning(run.status)} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-medium text-[var(--ink-1)]">{agent?.name ?? run.agentId}</span>
        <span className="block truncate text-[10.5px] text-[var(--ink-4)]">
          {STATUS_LABEL[run.status]} · {relTime(run.startedAt)}
          {run.findings.length > 0 && ` · ${run.findings.length} finding${run.findings.length === 1 ? '' : 's'}`}
        </span>
      </span>
      {run.status === 'awaiting_approval' && <Badge tone="warn">approve</Badge>}
    </button>
  )
}

/* ── the console ──────────────────────────────────────────────────────────── */

export function AgentConsole() {
  const open = useApp((s) => s.consoleOpen)
  const setOpen = useApp((s) => s.setConsole)
  const moduleId = useApp((s) => s.module)
  const country = useApp((s) => s.country)
  const runs = useApp((s) => s.runs)
  const activeRunId = useApp((s) => s.activeRunId)
  const setActiveRun = useApp((s) => s.setActiveRun)
  const patchScenario = useApp((s) => s.patchScenario)
  const session = useApp((s) => s.session)
  const autonomy = useApp((s) => s.autonomy)
  const scenarioYear = useApp((s) => s.scenario.year)
  const role = useRole()
  const toast = useToast()

  const [tab, setTab] = useState<'agents' | 'run' | 'activity'>('agents')
  const [expanded, setExpanded] = useState<string | null>(null)

  const active = runs.find((r) => r.id === activeRunId) ?? null
  const here = useMemo(
    () => (moduleId === 'settings' ? AGENTS : agentsForModule(moduleId as ModuleId)),
    [moduleId],
  )
  const pending = runs.filter((r) => r.status === 'awaiting_approval').length
  const busyIds = new Set(runs.filter((r) => isRunning(r.status)).map((r) => r.agentId))

  const run = (agent: AgentDef, prompt?: string) => {
    startRun({ agentId: agent.id, country, prompt, context: { year: scenarioYear, module: moduleId } }, session?.name ?? 'you')
    setTab('run')
  }

  /** Approving applies the proposal's levers to the WORKING assumptions — never
   *  to the book of record. Publishing to a basis is a separate, permissioned
   *  act with its own confirmation. */
  const apply = (r: AgentRun) => {
    const patch: Record<string, unknown> = {}
    for (const c of r.proposal?.changes ?? []) {
      const key = c.path.replace(/^scenario\./, '')
      patch[key] = c.to
    }
    patchScenario(patch as never)
    toast({ tone: 'pos', title: 'Applied to your working assumptions', body: `${Object.keys(patch).length} lever${Object.keys(patch).length === 1 ? '' : 's'} moved. The book of record is untouched.` })
  }

  if (!open) return null

  return (
    <aside className="anim-slide flex h-full shrink-0 flex-col border-l border-[var(--line)] bg-[var(--chrome-sub)]"
      style={{ width: 'var(--console-w)' }} aria-label="Agent console">
      <header className="flex items-center gap-2 border-b border-[var(--line)] bg-[var(--chrome)] px-3 py-2.5">
        <Icon name="agent" size={16} className="text-[var(--agent)]" />
        <span className="t-title flex-1">Agents</span>
        <Tooltip content={`Workspace autonomy: ${autonomy}. Agents ${autonomy === 'observe' ? 'only report' : autonomy === 'propose' ? 'draft changes for approval' : 'may apply low-risk reversible changes'}.`}>
          <Badge tone="agent">{autonomy}</Badge>
        </Tooltip>
        <IconButton label="Close agent console" onClick={() => setOpen(false)}>
          <Icon name="x" size={14} />
        </IconButton>
      </header>

      <div className="border-b border-[var(--line)] bg-[var(--chrome)] px-3 pb-2.5">
        <Segmented block size="sm" value={tab} onChange={setTab}
          options={[
            { id: 'agents', label: `Agents · ${here.length}` },
            { id: 'run', label: 'Run' },
            { id: 'activity', label: pending ? `Activity · ${pending}` : `Activity · ${runs.length}` },
          ]} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === 'agents' && (
          <div className="space-y-2">
            {here.map((a) => (
              <AgentRow key={a.id} agent={a}
                expanded={expanded === a.id}
                onToggle={() => setExpanded((v) => (v === a.id ? null : a.id))}
                onRun={(p) => run(a, p)}
                busy={busyIds.has(a.id)}
                allowed={can(role, a.requires) && can(role, 'agent.run')} />
            ))}
          </div>
        )}

        {tab === 'run' && (active
          ? <RunTrace run={active} canApprove={can(role, 'agent.approve') && can(role, active ? getAgent(active.agentId).applyRequires : 'agent.run')}
              onDecide={(v) => { decideRun(active.id, v, session?.name ?? 'you'); toast({ tone: v === 'approved' ? 'pos' : 'neutral', title: v === 'approved' ? 'Proposal approved' : 'Proposal rejected', body: v === 'approved' ? undefined : 'The run stays in the activity trail with your decision recorded.' }) }}
              onApply={() => apply(active)} />
          : <EmptyState art="agent" compact icon={<Icon name="agent" size={18} />} title="No run selected"
              body="Start an agent, or pick a run from Activity." />)}

        {tab === 'activity' && (runs.length
          ? <div className="space-y-0.5">
              {runs.map((r) => <RunRow key={r.id} run={r} active={r.id === activeRunId}
                onClick={() => { setActiveRun(r.id); setTab('run') }} />)}
            </div>
          : <EmptyState art="agent" compact icon={<Icon name="history" size={18} />} title="No runs yet"
              body="Agent runs from this session appear here with their full working." />)}
      </div>
    </aside>
  )
}

/* ── inline launcher, used in every module header ─────────────────────────── */

export function AgentLauncher({ moduleId, hint }: { moduleId: ModuleId; hint?: string }) {
  const setConsole = useApp((s) => s.setConsole)
  const country = useApp((s) => s.country)
  const year = useApp((s) => s.scenario.year)
  const session = useApp((s) => s.session)
  const runs = useApp((s) => s.runs)
  const role = useRole()

  const agents = agentsForModule(moduleId)
  const primary = agents[0]
  if (!primary) return null

  const last = runs.find((r) => r.agentId === primary.id)
  const busy = !!last && isRunning(last.status)
  const allowed = can(role, primary.requires) && can(role, 'agent.run')

  return (
    <div className="flex items-center gap-2">
      {last && !busy && (
        <button onClick={() => { useApp.getState().setActiveRun(last.id); setConsole(true) }}
          className="flex items-center gap-1.5 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-1)] px-2 py-1 text-[11px] text-[var(--ink-3)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--ink-1)]">
          <StatusDot tone={STATUS_TONE[last.status]} size={6} />
          {STATUS_LABEL[last.status]} · {relTime(last.startedAt)}
        </button>
      )}
      <Button size="sm" variant={busy ? 'secondary' : 'primary'} loading={busy} disabled={!allowed}
        icon={busy ? undefined : <Icon name="spark" size={13} />}
        title={allowed ? hint ?? primary.purpose : 'Your role cannot run this agent.'}
        onClick={() => {
          setConsole(true)
          if (!busy && allowed) startRun({ agentId: primary.id, country, context: { year, module: moduleId } }, session?.name ?? 'you')
        }}>
        {busy ? 'Running…' : primary.name}
      </Button>
    </div>
  )
}
