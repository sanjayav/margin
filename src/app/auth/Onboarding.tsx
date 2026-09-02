/* ───────────────────────────────────────────────────────────────────────────
   Persona onboarding.
   ---------------------------------------------------------------------------
   Four questions, and each one has to EARN its place by changing the product:

     1. What is your job here?   → landing module, pinned modules, which agents
                                   report to you
     2. Which markets?           → the market switcher, and which rule packs load
     3. How far may agents go?   → the workspace autonomy policy, enforced server-side
     4. Who else is coming?      → invitations with roles

   Anything that would not change the workspace is not asked. That is the whole
   design rule for this flow, and it is why there is no "company size" step.
   ─────────────────────────────────────────────────────────────────────────── */
import React, { useState } from 'react'
import { Avatar, Badge, Button, Callout, cx, Field, Input, Select, Progress } from '../design/primitives'
import Icon, { Logo, type IconName } from '../design/icons'
import { useApp } from '../state/appStore'
import { AUTONOMY, PERSONAS, ROLES, type Autonomy, type PersonaId, type Role } from './rbac'
import { PACK_LIST } from '../../engine/rulepacks'
import type { CountryId } from '../../engine/types'
import { getAgent } from '../agents/registry'

const PERSONA_ICON: Record<PersonaId, IconName> = {
  compliance: 'shield', planning: 'forecast', trading: 'scale', exec: 'gauge', data: 'data',
}

const STEPS = ['Your work', 'Markets', 'Agents', 'Your team'] as const

/** A large, selectable card. Used for every choice in this flow so the whole
 *  thing reads as one decision surface rather than four different forms. */
function Choice({ selected, onClick, icon, title, body, foot, wide }: {
  selected: boolean; onClick: () => void; icon?: React.ReactNode
  title: React.ReactNode; body?: React.ReactNode; foot?: React.ReactNode; wide?: boolean
}) {
  return (
    <button type="button" onClick={onClick}
      className={cx('group relative w-full rounded-[var(--r-lg)] border p-4 text-left transition-all duration-base ease-std',
        selected
          ? 'border-[var(--brand)] bg-[var(--brand-tint)] shadow-[var(--sh-2)]'
          : 'border-[var(--line)] bg-[var(--surface-1)] hover:-translate-y-px hover:border-[var(--line-strong)] hover:shadow-[var(--sh-2)]',
        wide && 'flex items-start gap-3.5')}>
      <span className={cx('absolute right-3 top-3 grid h-[17px] w-[17px] place-items-center rounded-full border transition-colors',
        selected ? 'border-[var(--brand)] bg-[var(--brand)] text-white' : 'border-[var(--line-strong)] text-transparent')}>
        <Icon name="check" size={10} strokeWidth={2.4} />
      </span>
      {icon && (
        <span className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r-md)] transition-colors',
          selected ? 'bg-[var(--brand)] text-white' : 'bg-[var(--surface-2)] text-[var(--ink-3)]')}>{icon}</span>
      )}
      <span className={cx('block min-w-0', !wide && icon && 'mt-3')}>
        <span className="block pr-6 text-[13.5px] font-semibold text-[var(--ink-1)]">{title}</span>
        {body && <span className="mt-1 block text-[12px] leading-relaxed text-[var(--ink-3)]">{body}</span>}
        {foot && <span className="mt-2 block">{foot}</span>}
      </span>
    </button>
  )
}

export default function Onboarding() {
  const session = useApp((s) => s.session)
  const complete = useApp((s) => s.completeOnboarding)
  const setMembers = useApp.setState

  const [step, setStep] = useState(0)
  const [persona, setPersona] = useState<PersonaId | null>(null)
  const [markets, setMarkets] = useState<CountryId[]>(['IN'])
  const [autonomy, setAutonomy] = useState<Autonomy>('propose')
  const [invites, setInvites] = useState<{ email: string; role: Role }[]>([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('analyst')

  const p = PERSONAS.find((x) => x.id === persona)
  const canNext = [!!persona, markets.length > 0, true, true][step]

  const finish = () => {
    if (!persona) return
    if (invites.length) {
      setMembers((s) => ({
        members: [...s.members, ...invites.map((i, n) => ({
          id: `inv${n}${Date.now()}`, email: i.email, name: i.email.split('@')[0], role: i.role, status: 'invited' as const,
        }))],
      }))
    }
    complete({ persona, markets, autonomy, role: p?.suggestedRole })
  }

  const addInvite = () => {
    const v = email.trim().toLowerCase()
    if (!v || !v.includes('@') || invites.some((i) => i.email === v)) return
    setInvites((x) => [...x, { email: v, role }])
    setEmail('')
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--canvas)]">
      <header className="flex items-center gap-2.5 border-b border-[var(--line)] bg-[var(--chrome)] px-6 py-3">
        <Logo size={22} />
        <span className="text-[14px] font-bold tracking-[-.02em] text-[var(--ink-1)]">AiRE</span>
        <span className="ml-auto text-[11.5px] text-[var(--ink-4)]">Setting up {session?.workspace}</span>
      </header>

      <div className="mx-auto w-full max-w-[880px] flex-1 px-6 py-9">
        {/* progress */}
        <div className="mb-8">
          <div className="mb-2.5 flex items-center gap-2">
            {STEPS.map((s, i) => (
              <React.Fragment key={s}>
                <button onClick={() => i < step && setStep(i)}
                  className={cx('flex items-center gap-1.5 text-[11.5px] font-medium transition-colors',
                    i === step ? 'text-[var(--ink-1)]' : i < step ? 'cursor-pointer text-[var(--ink-3)] hover:text-[var(--ink-1)]' : 'text-[var(--ink-5)]')}>
                  <span className={cx('grid h-[18px] w-[18px] place-items-center rounded-full text-[10px] font-bold',
                    i < step ? 'bg-[var(--pos)] text-white' : i === step ? 'bg-[var(--brand)] text-white' : 'bg-[var(--surface-3)] text-[var(--ink-4)]')}>
                    {i < step ? <Icon name="check" size={9} strokeWidth={2.6} /> : i + 1}
                  </span>
                  {s}
                </button>
                {i < STEPS.length - 1 && <span className="h-px flex-1 bg-[var(--line)]" />}
              </React.Fragment>
            ))}
          </div>
          <Progress value={((step + 1) / STEPS.length) * 100} height={3} />
        </div>

        <div key={step} className="anim-in">
          {/* ── 1 · persona ── */}
          {step === 0 && (
            <>
              <h1 className="t-display">What do you do here?</h1>
              <p className="t-sub mt-1.5">This decides where you land, which modules are pinned, and which agents report to you. You can change it later.</p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {PERSONAS.map((x) => (
                  <Choice key={x.id} selected={persona === x.id} onClick={() => setPersona(x.id)}
                    icon={<Icon name={PERSONA_ICON[x.id]} size={17} />}
                    title={x.label} body={x.blurb}
                    foot={<span className="inline-flex flex-wrap gap-1">
                      {x.agents.map((a) => <Badge key={a} tone="agent">{getAgent(a as never)?.name ?? a}</Badge>)}
                    </span>} />
                ))}
              </div>
            </>
          )}

          {/* ── 2 · markets ── */}
          {step === 1 && (
            <>
              <h1 className="t-display">Which markets do you file in?</h1>
              <p className="t-sub mt-1.5">Each market loads its own rule pack — the limit formula, the credit system, the pooling rules and the charge. Pick every market you are obligated in.</p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {PACK_LIST.map((pk) => {
                  const on = markets.includes(pk.id)
                  return (
                    <Choice key={pk.id} wide selected={on}
                      onClick={() => setMarkets((m) => (on ? m.filter((c) => c !== pk.id) : [...m, pk.id]))}
                      icon={<span className="text-[18px] leading-none">{pk.flag}</span>}
                      title={pk.name}
                      body={pk.limitNote}
                      foot={<span className="inline-flex flex-wrap items-center gap-1.5">
                        <Badge tone={pk.coverage.tier === 'market' ? 'pos' : pk.coverage.tier === 'partial' ? 'warn' : 'neutral'}>
                          {pk.coverage.tier === 'market' ? 'Market data' : pk.coverage.tier === 'partial' ? 'Covered scope' : 'Preview data'}
                        </Badge>
                        <span className="text-[11px] text-[var(--ink-4)]">{pk.fineRateLabel}</span>
                      </span>} />
                  )
                })}
              </div>
              {markets.length === 0 && <Callout tone="warn" className="mt-4" icon={<Icon name="alert" size={14} />}>Pick at least one market — the workspace has nothing to compute without one.</Callout>}
            </>
          )}

          {/* ── 3 · autonomy ── */}
          {step === 2 && (
            <>
              <h1 className="t-display">How far may the agents go?</h1>
              <p className="t-sub mt-1.5">Every module here is fronted by an agent. This sets the ceiling on what they may do without a person, and it is enforced on the server — not in the browser.</p>
              <div className="mt-6 space-y-3">
                {AUTONOMY.map((a) => (
                  <Choice key={a.id} wide selected={autonomy === a.id} onClick={() => setAutonomy(a.id)}
                    icon={<Icon name={a.id === 'observe' ? 'search' : a.id === 'propose' ? 'edit' : 'play'} size={16} />}
                    title={a.label} body={a.blurb} />
                ))}
              </div>
              <Callout tone="info" className="mt-4" icon={<Icon name="shield" size={14} />} title="One thing autonomy never buys">
                Nothing an agent produces can post to the credit book, publish a scenario or sign a pool without a named human approving it — at any setting. That rule lives in code, not in this screen.
              </Callout>
            </>
          )}

          {/* ── 4 · team ── */}
          {step === 3 && (
            <>
              <h1 className="t-display">Who else needs access?</h1>
              <p className="t-sub mt-1.5">Roles decide what each person can do. The distinction that matters: an analyst can run every agent, but only a compliance lead can let a result reach the book of record.</p>

              <div className="mt-6 flex gap-2">
                <Input className="flex-1" placeholder="colleague@manufacturer.com" value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addInvite() } }} />
                <Select value={role} onChange={(e) => setRole(e.target.value as Role)} className="w-[178px]">
                  {ROLES.filter((r) => r.id !== 'owner').map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </Select>
                <Button variant="secondary" onClick={addInvite} icon={<Icon name="plus" size={13} />}>Add</Button>
              </div>
              <p className="mt-1.5 text-[11.5px] text-[var(--ink-4)]">{ROLES.find((r) => r.id === role)?.blurb}</p>

              <div className="mt-5 overflow-hidden rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface-1)]">
                <div className="flex items-center gap-2.5 border-b border-[var(--line-soft)] px-3.5 py-2.5">
                  <Avatar name={session?.name ?? '?'} size={26} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-medium text-[var(--ink-1)]">{session?.name} <span className="text-[var(--ink-4)]">(you)</span></div>
                    <div className="truncate text-[11px] text-[var(--ink-4)]">{session?.email}</div>
                  </div>
                  <Badge tone="brand">{ROLES.find((r) => r.id === (p?.suggestedRole ?? 'owner'))?.label}</Badge>
                </div>
                {invites.map((i) => (
                  <div key={i.email} className="flex items-center gap-2.5 border-b border-[var(--line-soft)] px-3.5 py-2.5 last:border-0">
                    <Avatar name={i.email} size={26} />
                    <div className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--ink-2)]">{i.email}</div>
                    <Badge tone="neutral">{ROLES.find((r) => r.id === i.role)?.label}</Badge>
                    <button onClick={() => setInvites((x) => x.filter((y) => y.email !== i.email))}
                      className="text-[var(--ink-5)] hover:text-[var(--neg)]" aria-label={`Remove ${i.email}`}>
                      <Icon name="x" size={13} />
                    </button>
                  </div>
                ))}
                {!invites.length && (
                  <div className="px-3.5 py-6 text-center text-[12px] text-[var(--ink-4)]">
                    No invitations yet — you can add people any time from Settings.
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* footer */}
        <div className="mt-8 flex items-center gap-2 border-t border-[var(--line)] pt-5">
          {step > 0 && <Button variant="ghost" onClick={() => setStep((s) => s - 1)} icon={<Icon name="chevron" size={13} className="rotate-180" />}>Back</Button>}
          <div className="ml-auto flex items-center gap-2.5">
            {p && step > 0 && (
              <span className="hidden text-[11.5px] text-[var(--ink-4)] sm:inline">
                Landing on <b className="font-semibold text-[var(--ink-2)]">{p.pinned[0]}</b> · {markets.length} market{markets.length === 1 ? '' : 's'} · agents {autonomy}
              </span>
            )}
            {step < STEPS.length - 1
              ? <Button variant="primary" disabled={!canNext} onClick={() => setStep((s) => s + 1)} iconRight={<Icon name="arrowRight" size={14} />}>Continue</Button>
              : <Button variant="primary" onClick={finish} iconRight={<Icon name="arrowRight" size={14} />}>Open the workspace</Button>}
          </div>
        </div>
      </div>
    </div>
  )
}
