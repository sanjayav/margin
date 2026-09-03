/* ───────────────────────────────────────────────────────────────────────────
   Workspace state.
   ---------------------------------------------------------------------------
   Deliberately small. Anything derivable from the engine is derived, never
   stored: the store holds WHO is here, WHERE they are, WHAT the agents have
   produced, and the working assumptions. Computed positions live in hooks so
   they can never go stale behind a cached copy.
   ─────────────────────────────────────────────────────────────────────────── */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CountryId, Scenario } from '../../engine/types'
import { getPack, PACK_LIST } from '../../engine/rulepacks'
import type { Autonomy, PersonaId, Role } from '../auth/rbac'
import { getPersona } from '../auth/rbac'
import type { AgentId, AgentRun, Citation, ModuleId } from '../agents/kernel'
import type { DriverKey, DriverSet } from '../../engine/outlook'
import { DRIVER_DEFAULTS } from '../../engine/outlook'
import type { EvidenceItem, ForecastCase } from '../modules/forecast/cases'
import { BUILTIN_CASES } from '../modules/forecast/cases'

export interface SessionUser {
  email: string
  name: string
  workspace: string
  role: Role
  persona?: PersonaId
}

export interface Member { id: string; email: string; name: string; role: Role; status: 'active' | 'invited'; lastSeen?: string }

/** One entry in the credit blotter. Deliberately a TRANSFER record, not a
 *  position: positions are computed by the engine from the fleet, and the
 *  blotter records what moves between entities on top of that. Keeping the two
 *  apart is what lets the book say "computed + recorded = net" and show its
 *  working. */
export interface CreditTicket {
  id: string
  country: CountryId
  year: number
  /** The entity whose book this sits on. */
  entity: string
  side: 'buy' | 'sell'
  /** Credit units — gap-metric × vehicles, the same unit the engine computes
   *  balances in. */
  qty: number
  /** Price per unit, in the pack's currency. */
  price: number
  counterparty?: string
  note?: string
  status: 'draft' | 'posted' | 'cancelled'
  createdAt: string
  createdBy: string
  postedAt?: string
  postedBy?: string
}

export type Theme = 'light' | 'dark'

/** Where a driver value came from. Six months after a plan is signed, "why is
 *  adoption 55%?" has to have an answer, and "someone dragged a slider" is not
 *  one. Every change to the Assumption Book records its origin and, where an
 *  agent made it, the source it rests on. */
export interface DriverProvenance {
  origin: 'default' | 'analyst' | 'agent'
  at: string
  by?: string
  citation?: Citation
  /** The value before this change, so a revision can be read as a movement. */
  from?: number
}

/** The default working assumptions for a market — a pristine basis, so a screen
 *  reading "actuals" can never accidentally show yesterday's slider positions. */
export const baseScenario = (c: CountryId): Scenario => {
  const p = getPack(c)
  return {
    year: p.defaultYear ?? p.years[0],
    evSharePct: null, salesMultiplier: 1, massShiftKg: 0, ecoBoostG: 0,
    poolingEnabled: false, superCreditsEnabled: false, mix: null, extraVariants: [],
  }
}

interface AppState {
  /* ── identity ── */
  session: SessionUser | null
  members: Member[]
  onboarded: boolean
  setSession: (s: SessionUser | null) => void
  completeOnboarding: (p: { persona: PersonaId; markets: CountryId[]; autonomy: Autonomy; role?: Role }) => void
  signOut: () => void

  /* ── workspace policy ── */
  autonomy: Autonomy
  setAutonomy: (a: Autonomy) => void
  markets: CountryId[]           // markets this workspace has switched on
  setMarkets: (m: CountryId[]) => void

  /* ── navigation ── */
  country: CountryId
  module: ModuleId | 'settings'
  theme: Theme
  navCollapsed: boolean
  consoleOpen: boolean
  paletteOpen: boolean
  setCountry: (c: CountryId) => void
  setModule: (m: ModuleId | 'settings') => void
  setTheme: (t: Theme) => void
  toggleNav: () => void
  setConsole: (b: boolean) => void
  setPalette: (b: boolean) => void
  /** The tab you were last on, per module. Coming back to a module and landing
   *  somewhere other than where you left is a small thing that makes a workspace
   *  feel like it forgot you. Keyed by module id. */
  moduleTab: Record<string, string>
  setModuleTab: (m: string, t: string) => void

  /* ── working assumptions ── */
  scenario: Scenario
  patchScenario: (p: Partial<Scenario>) => void
  resetScenario: () => void

  /* ── forecast scope ── */
  /** Which manufacturer the Forecast module is scoped to, per market. Absent
   *  means the whole market. Kept per market because "we forecast Maruti in
   *  India" says nothing about which entity you care about in the EU. */
  forecastTarget: Partial<Record<CountryId, string>>
  setForecastTarget: (c: CountryId, maker: string | null) => void

  /* ── the credit desk ── */
  /** Which compliance entity the Credit book desk is working, per market. */
  deskEntity: Partial<Record<CountryId, string>>
  setDeskEntity: (c: CountryId, entity: string | null) => void
  /** The desk's working price per credit unit, per market. An assumption, not a
   *  quote — seeded from the pack and changeable, because a book valued at a
   *  price nobody chose is a book nobody can defend. */
  deskPrice: Partial<Record<CountryId, number>>
  setDeskPrice: (c: CountryId, price: number | null) => void
  /** The blotter. Draft and posted transfer tickets — the recorded side of the
   *  book, alongside the engine-computed side. */
  tickets: CreditTicket[]
  addTicket: (t: CreditTicket) => void
  setTicketStatus: (id: string, status: CreditTicket['status'], by?: string) => void
  removeTicket: (id: string) => void

  /* ── the assumption book ── */
  /** Driver overrides, keyed by SCOPE: `IN` for the market view, `IN:Maruti…`
   *  for a manufacturer that has been given its own view. A manufacturer with
   *  no override inherits the market's book, which is the right default — most
   *  of these drivers are market facts, not company decisions. */
  drivers: Record<string, DriverSet>
  /** Keyed `${scope}:${driverKey}`. */
  driverProvenance: Record<string, DriverProvenance>
  setDriver: (scope: string, key: DriverKey, value: number, p: Omit<DriverProvenance, 'at' | 'from'>) => void
  resetDrivers: (scope: string) => void
  /** Give a manufacturer its own book, seeded from whatever it inherits today. */
  forkDriverBook: (scope: string, from: DriverSet) => void

  /* ── the scenario board ── */
  cases: ForecastCase[]
  upsertCase: (c: ForecastCase) => void
  removeCase: (id: string) => void
  setCaseWeight: (id: string, w: number) => void
  resetCases: () => void

  /* ── the evidence feed ── */
  evidence: EvidenceItem[]
  addEvidence: (items: EvidenceItem[]) => void
  setEvidenceStatus: (id: string, status: EvidenceItem['status']) => void
  clearEvidence: () => void

  /* ── agent runs ── */
  runs: AgentRun[]
  activeRunId: string | null
  upsertRun: (r: AgentRun) => void
  patchRun: (id: string, p: Partial<AgentRun>) => void
  setActiveRun: (id: string | null) => void
  clearRuns: () => void
}

const DEMO_MEMBERS: Member[] = [
  { id: 'm1', email: 'sanjay.v@marklytics.co.uk', name: 'Sanjay V', role: 'owner', status: 'active', lastSeen: new Date().toISOString() },
]

export const useApp = create<AppState>()(persist((set, get) => ({
  session: null,
  members: DEMO_MEMBERS,
  onboarded: false,
  setSession: (s) => set({ session: s }),
  completeOnboarding: ({ persona, markets, autonomy, role }) => {
    const p = getPersona(persona)
    const country = markets[0] ?? 'IN'
    set((st) => ({
      onboarded: true,
      persona, autonomy, markets,
      country,
      scenario: baseScenario(country),
      module: p.home as ModuleId,
      session: st.session ? { ...st.session, persona, role: role ?? st.session.role } : st.session,
    }))
  },
  /**
   * Signing out has to reach the server. The session cookie is HttpOnly, so
   * only the server can revoke it — clearing local state alone leaves a valid
   * cookie behind, and SignIn restores from it on mount precisely so an
   * existing session does not ask for a password again. The two together mean
   * a purely local sign-out is undone by the next page load.
   *
   * Local state is cleared whether or not the request lands: someone on a
   * dead network who clicks Sign out must still leave the screen.
   */
  signOut: () => {
    void fetch('/api/session', { method: 'DELETE', credentials: 'same-origin' }).catch(() => {})
    set({ session: null, onboarded: false, runs: [], activeRunId: null })
  },

  autonomy: 'propose',
  setAutonomy: (a) => set({ autonomy: a }),
  markets: PACK_LIST.map((p) => p.id),
  setMarkets: (m) => set({ markets: m }),

  country: 'IN',
  module: 'plan',
  theme: 'light',
  navCollapsed: false,
  consoleOpen: false,
  paletteOpen: false,
  setCountry: (c) => set({ country: c, scenario: baseScenario(c) }),
  setModule: (m) => set({ module: m }),
  setTheme: (t) => { document.documentElement.dataset.theme = t; set({ theme: t }) },
  toggleNav: () => set((s) => ({ navCollapsed: !s.navCollapsed })),
  setConsole: (b) => set({ consoleOpen: b }),
  setPalette: (b) => set({ paletteOpen: b }),
  moduleTab: {},
  setModuleTab: (m, t) => set((s) => ({ moduleTab: { ...s.moduleTab, [m]: t } })),

  scenario: baseScenario('IN'),
  patchScenario: (p) => set((s) => ({ scenario: { ...s.scenario, ...p } })),
  resetScenario: () => set((s) => ({ scenario: baseScenario(s.country) })),

  forecastTarget: {},
  setForecastTarget: (c, maker) => set((s) => {
    const next = { ...s.forecastTarget }
    if (maker) next[c] = maker; else delete next[c]
    return { forecastTarget: next }
  }),

  deskEntity: {},
  setDeskEntity: (c, entity) => set((s) => {
    const next = { ...s.deskEntity }
    if (entity) next[c] = entity; else delete next[c]
    return { deskEntity: next }
  }),
  deskPrice: {},
  setDeskPrice: (c, price) => set((s) => {
    const next = { ...s.deskPrice }
    if (price != null && isFinite(price) && price >= 0) next[c] = price; else delete next[c]
    return { deskPrice: next }
  }),
  tickets: [],
  addTicket: (t) => set((s) => ({ tickets: [t, ...s.tickets].slice(0, 200) })),
  setTicketStatus: (id, status, by) => set((s) => ({
    tickets: s.tickets.map((t) => (t.id === id
      ? { ...t, status, ...(status === 'posted' ? { postedAt: new Date().toISOString(), postedBy: by } : {}) }
      : t)),
  })),
  removeTicket: (id) => set((s) => ({ tickets: s.tickets.filter((t) => t.id !== id || t.status === 'posted') })),

  drivers: {},
  driverProvenance: {},
  setDriver: (scope, key, value, p) => set((s) => {
    // Writing to a manufacturer scope that has no book yet forks it from the
    // market view first — otherwise a single edit would silently reset the
    // other three drivers to the market defaults.
    const country = scope.split(':')[0] as CountryId
    const book = s.drivers[scope] ?? s.drivers[country] ?? DRIVER_DEFAULTS[country]
    return {
      drivers: { ...s.drivers, [scope]: { ...book, [key]: value } },
      driverProvenance: {
        ...s.driverProvenance,
        [`${scope}:${key}`]: { ...p, at: new Date().toISOString(), from: book[key] },
      },
    }
  }),
  resetDrivers: (scope) => set((s) => {
    const drivers = { ...s.drivers }
    delete drivers[scope]
    const prov = Object.fromEntries(Object.entries(s.driverProvenance).filter(([k]) => !k.startsWith(`${scope}:`)))
    return { drivers, driverProvenance: prov }
  }),
  forkDriverBook: (scope, from) => set((s) => ({ drivers: { ...s.drivers, [scope]: { ...from } } })),

  cases: BUILTIN_CASES.map((c) => ({ ...c })),
  upsertCase: (c) => set((s) => ({
    cases: s.cases.some((x) => x.id === c.id) ? s.cases.map((x) => (x.id === c.id ? c : x)) : [...s.cases, c],
  })),
  removeCase: (id) => set((s) => ({ cases: s.cases.filter((c) => c.id !== id || c.builtin) })),
  setCaseWeight: (id, w) => set((s) => ({ cases: s.cases.map((c) => (c.id === id ? { ...c, weight: Math.max(0, w) } : c)) })),
  resetCases: () => set({ cases: BUILTIN_CASES.map((c) => ({ ...c })) }),

  evidence: [],
  // Newest first, de-duplicated on url-or-headline: an agent re-run must not
  // stack three copies of the same article on the feed.
  addEvidence: (items) => set((s) => {
    const key = (e: EvidenceItem) => (e.url ?? e.headline).toLowerCase()
    const seen = new Set(s.evidence.map(key))
    const fresh = items.filter((e) => !seen.has(key(e)))
    return { evidence: [...fresh, ...s.evidence].slice(0, 120) }
  }),
  setEvidenceStatus: (id, status) => set((s) => ({ evidence: s.evidence.map((e) => (e.id === id ? { ...e, status } : e)) })),
  clearEvidence: () => set({ evidence: [] }),

  runs: [],
  activeRunId: null,
  upsertRun: (r) => set((s) => ({
    runs: s.runs.some((x) => x.id === r.id) ? s.runs.map((x) => (x.id === r.id ? r : x)) : [r, ...s.runs].slice(0, 60),
    activeRunId: r.id,
  })),
  patchRun: (id, p) => set((s) => ({ runs: s.runs.map((r) => (r.id === id ? { ...r, ...p } : r)) })),
  setActiveRun: (id) => set({ activeRunId: id }),
  clearRuns: () => set({ runs: [], activeRunId: null }),
}), {
  name: 'aire.workspace.v2',
  // Runs are intentionally NOT persisted: an agent trace is only meaningful
  // against the data it ran on, and rehydrating one after the fleet changed
  // would present a stale reading as a current one.
  // The Assumption Book, the scenario board and the evidence feed DO persist:
  // they are the analyst's own work, and losing them on a reload would make the
  // module unusable. Runs do not, for the reason above.
  partialize: (s) => ({
    session: s.session, onboarded: s.onboarded, autonomy: s.autonomy, markets: s.markets,
    country: s.country, module: s.module, theme: s.theme, navCollapsed: s.navCollapsed,
    members: s.members, moduleTab: s.moduleTab, forecastTarget: s.forecastTarget,
    drivers: s.drivers, driverProvenance: s.driverProvenance,
    cases: s.cases, evidence: s.evidence,
    deskEntity: s.deskEntity, deskPrice: s.deskPrice, tickets: s.tickets,
  }),
}))

/* ── selectors ────────────────────────────────────────────────────────────── */
export const useRole = () => useApp((s) => s.session?.role)
export const useRuns = (agentId?: AgentId) =>
  useApp((s) => (agentId ? s.runs.filter((r) => r.agentId === agentId) : s.runs))
export const useActiveRun = () => useApp((s) => s.runs.find((r) => r.id === s.activeRunId) ?? null)

/** The scope key for a forecast: the market, or a manufacturer within it. */
export const driverScope = (c: CountryId, target?: string | null) => (target ? `${c}:${target}` : c)

/** The Assumption Book in force for a scope. A manufacturer falls back to its
 *  market's book, and a market falls back to its own defaults — never to a
 *  global default, because an EU adoption assumption has no business governing
 *  India. */
export const useDriverBook = (c: CountryId, target?: string | null): DriverSet =>
  useApp((s) => s.drivers[driverScope(c, target)] ?? s.drivers[c] ?? DRIVER_DEFAULTS[c])

/** True when this manufacturer is reading the market's book rather than one of
 *  its own. Surfaced, because "inherited" and "chosen" are different claims. */
export const useInheritsBook = (c: CountryId, target?: string | null): boolean =>
  useApp((s) => !!target && !s.drivers[driverScope(c, target)])
