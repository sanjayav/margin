/* ───────────────────────────────────────────────────────────────────────────
   SETTINGS — people, permissions and agent policy.
   ---------------------------------------------------------------------------
   The permission matrix is rendered from ROLE_PERMISSIONS itself rather than
   being written out again in JSX. That means the table on screen cannot drift
   from what the server enforces: if someone adds a permission to a role, this
   page shows it on the next render, and if they forget to, the page shows that
   too. A permissions screen maintained by hand is a permissions screen that
   lies.
   ─────────────────────────────────────────────────────────────────────────── */
import React, { useState } from 'react'
import {
  Avatar, Badge, Button, Callout, Card, cx, Dialog, Divider, Field, Input,
  MenuItem, Panel, Popover, Segmented, Select, StatusDot, Switch, Table, Td, Th,
  Tooltip, Tr, relTime, useToast,
} from '../../design/primitives'
import Icon from '../../design/icons'
import { ModulePage } from '../../shell/AppShell'
import { useApp, useRole } from '../../state/appStore'
import {
  AUTONOMY, PERSONAS, ROLES, ROLE_PERMISSIONS, can,
  type Autonomy, type Permission, type Role,
} from '../../auth/rbac'
import { AGENTS } from '../../agents/registry'
import { PACK_LIST } from '../../../engine/rulepacks'
import type { CountryId } from '../../../engine/types'

/** The permission groups the matrix is drawn in. Every permission in
 *  ROLE_PERMISSIONS must appear in exactly one group — anything missed shows up
 *  in the "ungrouped" row rather than disappearing. */
const GROUPS: { label: string; perms: Permission[] }[] = [
  { label: 'See', perms: ['plan.view', 'forecast.view', 'scenario.view', 'creditbook.view', 'pooling.view', 'data.view', 'regai.view', 'settings.view'] },
  { label: 'Model', perms: ['scenario.create', 'data.import', 'export.create'] },
  { label: 'Commit', perms: ['scenario.publish', 'forecast.publish', 'creditbook.post', 'pooling.propose', 'pooling.execute', 'data.edit'] },
  { label: 'Agents', perms: ['agent.run', 'agent.approve', 'agent.configure'] },
  { label: 'Workspace', perms: ['members.manage', 'billing.manage', 'audit.view'] },
]

const PERM_LABEL: Partial<Record<Permission, string>> = {
  'plan.view': 'Plan', 'forecast.view': 'Forecast', 'scenario.view': 'Scenario',
  'creditbook.view': 'Credit book', 'pooling.view': 'Pooling', 'data.view': 'Data',
  'regai.view': 'Reg AI', 'settings.view': 'Settings',
  'scenario.create': 'Build scenarios', 'data.import': 'Import data', 'export.create': 'Export',
  'scenario.publish': 'Publish a scenario', 'forecast.publish': 'Publish a forecast',
  'creditbook.post': 'Post to the ledger', 'pooling.propose': 'Propose a pool',
  'pooling.execute': 'Execute a pool', 'data.edit': 'Edit data',
  'agent.run': 'Run agents', 'agent.approve': 'Approve agent output', 'agent.configure': 'Configure agents',
  'members.manage': 'Manage members', 'billing.manage': 'Billing', 'audit.view': 'Audit trail',
}

export default function SettingsModule() {
  const [tab, setTab] = useState<'people' | 'permissions' | 'agents' | 'markets'>('people')
  const role = useRole()

  return (
    <ModulePage wide
      title="Settings"
      sub="Who is in this workspace, what each role can do, and how far the agents may go.">
      <Segmented className="mb-5" value={tab} onChange={setTab}
        options={[
          { id: 'people', label: 'People', icon: <Icon name="users" size={13} /> },
          { id: 'permissions', label: 'Permissions', icon: <Icon name="lock" size={13} /> },
          { id: 'agents', label: 'Agent policy', icon: <Icon name="agent" size={13} /> },
          { id: 'markets', label: 'Markets', icon: <Icon name="globe" size={13} /> },
        ]} />
      {tab === 'people' && <People />}
      {tab === 'permissions' && <Permissions />}
      {tab === 'agents' && <AgentPolicy />}
      {tab === 'markets' && <Markets />}
    </ModulePage>
  )
}

/* ── people ───────────────────────────────────────────────────────────────── */

function People() {
  const members = useApp((s) => s.members)
  const session = useApp((s) => s.session)
  const role = useRole()
  const toast = useToast()
  const [invite, setInvite] = useState(false)
  const [email, setEmail] = useState('')
  const [newRole, setNewRole] = useState<Role>('analyst')
  const may = can(role, 'members.manage')

  const add = () => {
    const v = email.trim().toLowerCase()
    if (!v.includes('@')) return
    useApp.setState((s) => ({
      members: [...s.members, { id: `m${Date.now()}`, email: v, name: v.split('@')[0], role: newRole, status: 'invited' }],
    }))
    toast({ tone: 'pos', title: 'Invitation queued', body: `${v} will join as ${ROLES.find((r) => r.id === newRole)!.label}.` })
    setEmail(''); setInvite(false)
  }

  const changeRole = (id: string, r: Role) => {
    useApp.setState((s) => ({ members: s.members.map((m) => (m.id === id ? { ...m, role: r } : m)) }))
    toast({ tone: 'info', title: 'Role updated', body: 'The change takes effect on their next sign-in, when a new signed session is issued.' })
  }

  return (
    <>
      <Panel flush title={`Members · ${members.length}`} icon={<Icon name="users" size={14} />}
        sub="A role travels in the signed session, so a change here takes effect when the person next signs in."
        actions={may && <Button size="sm" variant="primary" icon={<Icon name="plus" size={13} />} onClick={() => setInvite(true)}>Invite</Button>}>
        <Table>
          <thead>
            <tr><Th>Person</Th><Th>Role</Th><Th>Scope</Th><Th align="center">Status</Th><Th align="right">Last seen</Th></tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const meta = ROLES.find((r) => r.id === m.role)!
              const isMe = m.email === session?.email
              return (
                <Tr key={m.id}>
                  <Td>
                    <span className="flex items-center gap-2.5">
                      <Avatar name={m.name} size={26} />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-[var(--ink-1)]">
                          {m.name}{isMe && <span className="ml-1 font-normal text-[var(--ink-4)]">(you)</span>}
                        </span>
                        <span className="block truncate text-[11px] text-[var(--ink-4)]">{m.email}</span>
                      </span>
                    </span>
                  </Td>
                  <Td>
                    {may && !isMe ? (
                      <Popover align="start" width={280}
                        trigger={({ toggle }) => (
                          <button onClick={toggle} className="flex items-center gap-1.5 rounded-[var(--r-xs)] border border-[var(--line)] bg-[var(--surface-1)] px-2 py-1 text-[11.5px] hover:border-[var(--line-strong)]">
                            {meta.label}<Icon name="chevronDown" size={11} className="text-[var(--ink-5)]" />
                          </button>
                        )}>
                        {({ close }) => (
                          <>
                            {ROLES.map((r) => (
                              <MenuItem key={r.id} sub={r.blurb} onClick={() => { changeRole(m.id, r.id); close() }}
                                icon={r.id === m.role ? <Icon name="check" size={12} /> : <span className="w-3" />}>
                                {r.label}
                              </MenuItem>
                            ))}
                          </>
                        )}
                      </Popover>
                    ) : <Badge tone={m.role === 'owner' ? 'brand' : 'neutral'}>{meta.label}</Badge>}
                  </Td>
                  <Td className="!text-[var(--ink-3)]">{meta.scope}</Td>
                  <Td align="center">
                    <Badge tone={m.status === 'active' ? 'pos' : 'warn'} dot>{m.status}</Badge>
                  </Td>
                  <Td align="right" className="!text-[var(--ink-4)]">{m.lastSeen ? relTime(m.lastSeen) : '—'}</Td>
                </Tr>
              )
            })}
          </tbody>
        </Table>
      </Panel>

      <Callout className="mt-4" tone="info" icon={<Icon name="shield" size={14} />} title="The separation that matters">
        An <b>Analyst</b> can run every agent in the platform. Only a <b>Compliance lead</b>, <b>Administrator</b> or <b>Owner</b> can let an
        agent result reach the book of record. That single split is what keeps an autonomous workspace auditable, and it is enforced
        in the API, not in this screen.
      </Callout>

      <Dialog open={invite} onClose={() => setInvite(false)} title="Invite someone"
        sub="They will receive access to every market this workspace has switched on."
        footer={<><Button variant="ghost" onClick={() => setInvite(false)}>Cancel</Button><Button variant="primary" onClick={add}>Send invitation</Button></>}>
        <div className="space-y-3.5">
          <Field label="Work email" required>
            <Input autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="colleague@manufacturer.com" />
          </Field>
          <Field label="Role" hint={ROLES.find((r) => r.id === newRole)!.blurb}>
            <Select value={newRole} onChange={(e) => setNewRole(e.target.value as Role)}>
              {ROLES.filter((r) => r.id !== 'owner').map((r) => <option key={r.id} value={r.id}>{r.label} — {r.scope}</option>)}
            </Select>
          </Field>
        </div>
      </Dialog>
    </>
  )
}

/* ── permissions ──────────────────────────────────────────────────────────── */

function Permissions() {
  const grouped = new Set(GROUPS.flatMap((g) => g.perms))
  const ungrouped = Object.values(ROLE_PERMISSIONS).flat().filter((p, i, a) => a.indexOf(p) === i && !grouped.has(p))

  return (
    <>
      <Panel flush title="Role matrix" icon={<Icon name="lock" size={14} />}
        sub="Rendered directly from the permission table the API enforces — this page cannot disagree with the server.">
        <div className="overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <Th className="!sticky !left-0 !z-[2] min-w-[190px]">Permission</Th>
                {ROLES.map((r) => (
                  <Th key={r.id} align="center" className="min-w-[92px]">
                    <Tooltip content={r.blurb}><span className="cursor-help">{r.label}</span></Tooltip>
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {GROUPS.map((g) => (
                <React.Fragment key={g.label}>
                  <tr>
                    <td colSpan={ROLES.length + 1} className="border-b border-[var(--line)] bg-[var(--surface-2)] px-3 py-1.5">
                      <span className="t-label">{g.label}</span>
                    </td>
                  </tr>
                  {g.perms.map((p) => (
                    <Tr key={p}>
                      <Td className="!sticky !left-0 !bg-[var(--surface-1)]">
                        <span className="font-medium text-[var(--ink-1)]">{PERM_LABEL[p] ?? p}</span>
                        <span className="ml-1.5 text-[10.5px] text-[var(--ink-5)]">{p}</span>
                      </Td>
                      {ROLES.map((r) => {
                        const on = ROLE_PERMISSIONS[r.id].includes(p)
                        return (
                          <Td key={r.id} align="center">
                            {on
                              ? <Icon name="check" size={13} className="mx-auto text-[var(--pos)]" strokeWidth={2.2} />
                              : <span className="mx-auto block h-[3px] w-[9px] rounded-full bg-[var(--line-strong)]" />}
                          </Td>
                        )
                      })}
                    </Tr>
                  ))}
                </React.Fragment>
              ))}
              {!!ungrouped.length && (
                <>
                  <tr><td colSpan={ROLES.length + 1} className="border-b border-[var(--line)] bg-[var(--warn-tint)] px-3 py-1.5">
                    <span className="t-label !text-[var(--warn-ink)]">Ungrouped — add these to a group in SettingsModule.tsx</span>
                  </td></tr>
                  {ungrouped.map((p) => (
                    <Tr key={p}>
                      <Td className="!sticky !left-0 !bg-[var(--surface-1)]">{p}</Td>
                      {ROLES.map((r) => (
                        <Td key={r.id} align="center">
                          {ROLE_PERMISSIONS[r.id].includes(p) ? <Icon name="check" size={13} className="mx-auto text-[var(--pos)]" /> : '—'}
                        </Td>
                      ))}
                    </Tr>
                  ))}
                </>
              )}
            </tbody>
          </Table>
        </div>
      </Panel>

      <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {PERSONAS.map((p) => (
          <Card key={p.id}>
            <div className="text-[12.5px] font-semibold text-[var(--ink-1)]">{p.label}</div>
            <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--ink-3)]">{p.blurb}</p>
            <Divider className="!my-2.5" />
            <div className="flex items-center gap-1.5 text-[11px] text-[var(--ink-4)]">
              <Icon name="user" size={11} /> Suggested role: <b className="text-[var(--ink-2)]">{ROLES.find((r) => r.id === p.suggestedRole)!.label}</b>
            </div>
          </Card>
        ))}
      </div>
    </>
  )
}

/* ── agent policy ─────────────────────────────────────────────────────────── */

function AgentPolicy() {
  const autonomy = useApp((s) => s.autonomy)
  const setAutonomy = useApp((s) => s.setAutonomy)
  const role = useRole()
  const toast = useToast()
  const may = can(role, 'agent.configure')

  return (
    <>
      <Panel title="Workspace autonomy" icon={<Icon name="agent" size={14} />}
        sub="The ceiling on what any agent may do without a person. Enforced in the runner, not in the browser.">
        <div className="space-y-3">
          {AUTONOMY.map((a) => (
            <button key={a.id} disabled={!may}
              onClick={() => { setAutonomy(a.id); toast({ tone: 'info', title: `Autonomy set to ${a.label.toLowerCase()}`, body: a.blurb }) }}
              className={cx('flex w-full items-start gap-3 rounded-[var(--r-md)] border p-3.5 text-left transition-all',
                autonomy === a.id ? 'border-[var(--brand)] bg-[var(--brand-tint)]' : 'border-[var(--line)] bg-[var(--surface-1)] hover:border-[var(--line-strong)]',
                !may && 'cursor-not-allowed opacity-60')}>
              <span className={cx('mt-px grid h-[17px] w-[17px] shrink-0 place-items-center rounded-full border',
                autonomy === a.id ? 'border-[var(--brand)] bg-[var(--brand)] text-white' : 'border-[var(--line-strong)] text-transparent')}>
                <Icon name="check" size={10} strokeWidth={2.4} />
              </span>
              <span>
                <span className="block text-[12.5px] font-semibold text-[var(--ink-1)]">{a.label}</span>
                <span className="mt-0.5 block text-[11.5px] leading-relaxed text-[var(--ink-3)]">{a.blurb}</span>
              </span>
            </button>
          ))}
        </div>
        {!may && <p className="mt-3 flex items-center gap-1.5 text-[11.5px] text-[var(--ink-4)]"><Icon name="lock" size={12} /> Your role cannot change agent policy.</p>}
      </Panel>

      <Panel flush className="mt-4" title="Agents" icon={<Icon name="grid" size={14} />}
        sub="Every agent, what it fronts, its cadence and the ceiling it can never be raised past.">
        <Table>
          <thead>
            <tr><Th>Agent</Th><Th>Module</Th><Th>Cadence</Th><Th align="center">Ceiling</Th><Th align="center">Effective</Th><Th>Needs to apply</Th></tr>
          </thead>
          <tbody>
            {AGENTS.map((a) => {
              // The effective setting is the stricter of workspace policy and the
              // agent's own ceiling — shown so nobody assumes a global setting
              // silently raised an agent past what it is allowed to be.
              const order: Autonomy[] = ['observe', 'propose', 'act']
              const effective = order[Math.min(order.indexOf(autonomy), order.indexOf(a.maxAutonomy))]
              const capped = effective !== autonomy
              return (
                <Tr key={a.id}>
                  <Td>
                    <span className="flex items-center gap-2">
                      <span className="h-[7px] w-[7px] rounded-[2px]" style={{ background: a.accent }} />
                      <span>
                        <span className="block font-semibold text-[var(--ink-1)]">{a.name}</span>
                        <span className="block max-w-[420px] truncate text-[11px] text-[var(--ink-4)]">{a.purpose}</span>
                      </span>
                    </span>
                  </Td>
                  <Td className="capitalize !text-[var(--ink-3)]">{a.module}</Td>
                  <Td className="!text-[var(--ink-3)]">{a.cadence}</Td>
                  <Td align="center"><Badge tone={a.maxAutonomy === 'propose' ? 'warn' : 'neutral'}>{a.maxAutonomy}</Badge></Td>
                  <Td align="center">
                    {capped
                      ? <Tooltip content={`Workspace policy is “${autonomy}”, but this agent's ceiling is “${a.maxAutonomy}”. The stricter of the two applies.`}>
                          <span><Badge tone="info">{effective} · capped</Badge></span>
                        </Tooltip>
                      : <Badge tone="agent">{effective}</Badge>}
                  </Td>
                  <Td mono className="!text-[var(--ink-4)]">{a.applyRequires}</Td>
                </Tr>
              )
            })}
          </tbody>
        </Table>
      </Panel>

      <Callout className="mt-4" tone="neg" icon={<Icon name="lock" size={14} />} title="The rule autonomy cannot override">
        At every setting, a proposal that would post to the credit book, publish a scenario or a forecast, or execute a pool requires a
        named human approval. That list lives in <b>ALWAYS_NEEDS_APPROVAL</b> in the RBAC module and is checked in the runner —
        there is no configuration that removes it.
      </Callout>
    </>
  )
}

/* ── markets ──────────────────────────────────────────────────────────────── */

function Markets() {
  const markets = useApp((s) => s.markets)
  const setMarkets = useApp((s) => s.setMarkets)
  const country = useApp((s) => s.country)
  const role = useRole()
  const may = can(role, 'members.manage')
  const toast = useToast()

  return (
    <Panel title="Markets" icon={<Icon name="globe" size={14} />}
      sub="Which rule packs this workspace has switched on. Turning a market off removes it from the switcher and from every agent's reach.">
      <div className="space-y-3">
        {PACK_LIST.map((p) => {
          const on = markets.includes(p.id)
          const isCurrent = country === p.id
          return (
            <div key={p.id} className="flex items-start gap-3 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-1)] p-3.5">
              <span className="mt-px text-[18px] leading-none">{p.flag}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[12.5px] font-semibold text-[var(--ink-1)]">{p.name}</span>
                  <Badge tone={p.coverage.tier === 'market' ? 'pos' : p.coverage.tier === 'partial' ? 'warn' : 'neutral'}>
                    {p.coverage.tier === 'market' ? 'Market data' : p.coverage.tier === 'partial' ? 'Covered scope' : 'Preview data'}
                  </Badge>
                  {isCurrent && <Badge tone="brand">current</Badge>}
                </div>
                <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--ink-3)]">{p.limitNote}</p>
                <p className="mt-1 text-[11px] text-[var(--ink-4)]">{p.coverage.label}</p>
              </div>
              <Switch size="sm" checked={on} disabled={!may || (isCurrent && on)}
                onChange={(v) => {
                  setMarkets(v ? [...markets, p.id] : markets.filter((m) => m !== p.id))
                  toast({ tone: v ? 'pos' : 'neutral', title: `${p.name} ${v ? 'switched on' : 'switched off'}` })
                }} />
            </div>
          )
        })}
      </div>
      {!may && <p className="mt-3 flex items-center gap-1.5 text-[11.5px] text-[var(--ink-4)]"><Icon name="lock" size={12} /> Your role cannot change the market list.</p>}
    </Panel>
  )
}
