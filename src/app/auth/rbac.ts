/* ───────────────────────────────────────────────────────────────────────────
   RBAC — one permission table, shared by the client and the API.
   ---------------------------------------------------------------------------
   This file is the ONLY place a role's abilities are written down. The sidebar
   hides what you cannot reach, the buttons disable what you cannot do, and the
   API refuses what you cannot have — all three read this table, so they cannot
   drift apart. Client-side checks here are a courtesy (don't show a door that
   won't open); the server check in api/_rbac.ts is the actual boundary.

   The separation that matters in a compliance product is APPROVE vs RUN. An
   analyst may run any agent and build any scenario; only a compliance lead may
   let a result touch the book of record. Every agent proposal therefore passes
   through `agent.approve`, and that permission is deliberately scarce.
   ─────────────────────────────────────────────────────────────────────────── */

export type Role = 'owner' | 'admin' | 'compliance_lead' | 'analyst' | 'trader' | 'viewer' | 'auditor'

export type Permission =
  // modules — visibility
  | 'plan.view' | 'forecast.view' | 'scenario.view' | 'creditbook.view'
  | 'pooling.view' | 'data.view' | 'regai.view' | 'settings.view'
  // modules — action
  | 'scenario.create' | 'scenario.publish'
  | 'creditbook.post'                     // write a transaction to the ledger
  | 'pooling.propose' | 'pooling.execute' // model a pool vs sign a pool
  | 'data.import' | 'data.edit'
  | 'forecast.publish'                    // promote a forecast to the planning basis
  // agents
  | 'agent.run' | 'agent.approve' | 'agent.configure'
  // workspace
  | 'members.manage' | 'billing.manage' | 'audit.view' | 'export.create'

/** Everything a viewer can see. Composed into the richer roles below so a new
 *  read surface only has to be added in one place. */
const READ: Permission[] = [
  'plan.view', 'forecast.view', 'scenario.view', 'creditbook.view',
  'pooling.view', 'data.view', 'regai.view',
]

const ANALYST: Permission[] = [
  ...READ, 'settings.view', 'scenario.create', 'agent.run', 'export.create', 'data.import',
]

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  viewer:  [...READ],
  // An auditor reads everything AND the audit trail, but must not be able to
  // change or run anything — an auditor who can run an agent is a participant.
  auditor: [...READ, 'audit.view', 'export.create', 'settings.view'],
  analyst: ANALYST,
  trader:  [...READ, 'settings.view', 'agent.run', 'export.create',
            'creditbook.post', 'pooling.propose'],
  compliance_lead: [...ANALYST, 'scenario.publish', 'forecast.publish', 'creditbook.post',
                    'pooling.propose', 'pooling.execute', 'data.edit', 'agent.approve', 'audit.view'],
  admin:   [...ANALYST, 'scenario.publish', 'forecast.publish', 'creditbook.post',
            'pooling.propose', 'pooling.execute', 'data.edit', 'agent.approve',
            'agent.configure', 'members.manage', 'audit.view'],
  owner:   [...ANALYST, 'scenario.publish', 'forecast.publish', 'creditbook.post',
            'pooling.propose', 'pooling.execute', 'data.edit', 'agent.approve',
            'agent.configure', 'members.manage', 'billing.manage', 'audit.view'],
}

export interface RoleMeta { id: Role; label: string; blurb: string; scope: string }

export const ROLES: RoleMeta[] = [
  { id: 'owner',           label: 'Owner',           scope: 'Everything, including billing', blurb: 'Full control of the workspace, its members and its subscription.' },
  { id: 'admin',           label: 'Administrator',   scope: 'Everything except billing',     blurb: 'Manages members, data sources and agent policy. Can approve agent output.' },
  { id: 'compliance_lead', label: 'Compliance lead', scope: 'Approve and publish',           blurb: 'Signs off filings. The only non-admin role that can let an agent result reach the book of record.' },
  { id: 'analyst',         label: 'Analyst',         scope: 'Build and model',               blurb: 'Runs agents, builds scenarios and forecasts. Cannot publish or post to the ledger.' },
  { id: 'trader',          label: 'Credit trader',   scope: 'Ledger and pooling',            blurb: 'Works the credit book, pricing and pool proposals. No fleet-data editing.' },
  { id: 'viewer',          label: 'Viewer',          scope: 'Read only',                     blurb: 'Sees every owned module. Changes nothing.' },
  { id: 'auditor',         label: 'Auditor',         scope: 'Read only + audit trail',       blurb: 'Read access plus the full provenance and approval history. Deliberately cannot run agents.' },
]

export const can = (role: Role | undefined, p: Permission): boolean =>
  !!role && ROLE_PERMISSIONS[role].includes(p)

export const canAny = (role: Role | undefined, ...ps: Permission[]) => ps.some((p) => can(role, p))

/* ───────────────────────────────────────────────────────────────────────────
   Personas — what onboarding asks about, and what it changes.
   A persona is NOT a role. The role is what you are allowed to do; the persona
   is what the product should put in front of you first. Someone can be an
   Analyst by permission and a Fleet planner by persona.
   ─────────────────────────────────────────────────────────────────────────── */

export type PersonaId = 'compliance' | 'planning' | 'trading' | 'exec' | 'data'

export interface Persona {
  id: PersonaId
  label: string
  blurb: string
  /** Where this persona lands after sign-in. */
  home: string
  /** Modules pinned to the top of their sidebar. */
  pinned: string[]
  /** Agents subscribed by default — the ones whose findings they should see. */
  agents: string[]
  suggestedRole: Role
}

export const PERSONAS: Persona[] = [
  {
    id: 'compliance', label: 'Compliance & regulatory', suggestedRole: 'compliance_lead',
    blurb: 'You own the filing. You need the current position, what changed since the last update, and a defensible trail.',
    home: 'plan', pinned: ['plan', 'regai', 'creditbook'], agents: ['plan.monitor', 'reg.watch', 'book.keeper'],
  },
  {
    id: 'planning', label: 'Product & fleet planning', suggestedRole: 'analyst',
    blurb: 'You decide the product mix. You need the five-year line, the levers that move it and what each one costs.',
    home: 'forecast', pinned: ['forecast', 'scenario', 'plan'], agents: ['forecast.horizon', 'scenario.architect'],
  },
  {
    id: 'trading', label: 'Credits & pooling', suggestedRole: 'trader',
    blurb: 'You clear the position. You need the ledger, the counterparties and the cheapest legal way to settle.',
    home: 'creditbook', pinned: ['creditbook', 'pooling', 'plan'], agents: ['book.keeper', 'pool.broker'],
  },
  {
    id: 'exec', label: 'Executive & board', suggestedRole: 'viewer',
    blurb: 'You need the verdict, the exposure and the decision in front of you — not the workbench.',
    home: 'plan', pinned: ['plan', 'forecast'], agents: ['plan.monitor', 'forecast.horizon'],
  },
  {
    id: 'data', label: 'Data & systems', suggestedRole: 'admin',
    blurb: 'You keep the numbers fed. You need source health, import quality and the freshness clock.',
    home: 'data', pinned: ['data', 'plan'], agents: ['data.steward', 'plan.monitor'],
  },
]

export const getPersona = (id: PersonaId | undefined) => PERSONAS.find((p) => p.id === id) ?? PERSONAS[0]

/* ───────────────────────────────────────────────────────────────────────────
   Agent autonomy — how far an agent may go on its own.
   This is a workspace policy, set at onboarding and changeable in settings by
   anyone with `agent.configure`. It is enforced server-side in the runner.
   ─────────────────────────────────────────────────────────────────────────── */

export type Autonomy = 'observe' | 'propose' | 'act'

export const AUTONOMY: { id: Autonomy; label: string; blurb: string }[] = [
  { id: 'observe', label: 'Observe',  blurb: 'Agents watch and report. They never draft a change.' },
  { id: 'propose', label: 'Propose',  blurb: 'Agents draft changes and queue them for approval. Nothing applies without a human.' },
  { id: 'act',     label: 'Act',      blurb: 'Agents apply low-risk, reversible changes on their own and escalate the rest. Anything touching the book of record still needs approval.' },
]

/** The one thing autonomy never buys: writing to the book of record. Stated as
 *  code so it cannot be forgotten in a settings screen. */
export const ALWAYS_NEEDS_APPROVAL: Permission[] = [
  'creditbook.post', 'scenario.publish', 'forecast.publish', 'pooling.execute',
]
