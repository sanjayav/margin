/* ───────────────────────────────────────────────────────────────────────────
   Sign in.
   ---------------------------------------------------------------------------
   Two panes, and each has exactly one job.

   LEFT — the credential form, on white, and nothing else. No marketing, no
   carousel, no second call to action. Somebody arriving here at 8am on filing
   day wants one field, then another, then in.

   RIGHT — a dark brand field. It is dark on purpose: it frames the white form
   the way the dark rail frames the workspace, so the product's silhouette is
   the same before and after you sign in. The motion in it is a slow orbit and
   a drifting scatter of the fleet the platform actually reasons about — points
   converging toward a line. It loops slowly, obeys reduced-motion, and never
   competes with the form for attention.
   ─────────────────────────────────────────────────────────────────────────── */
import React, { useEffect, useMemo, useState } from 'react'
import { Button, Callout, Field, Input, Spinner, cx } from '../design/primitives'
import Icon, { LogoHero } from '../design/icons'
import { prefersReducedMotion } from '../design/motion'
import { useApp } from '../state/appStore'
import type { Role } from './rbac'

const PROOF = [
  { k: '5', label: 'regulatory regimes on one engine', detail: 'EU · India · United Kingdom · Australia · China' },
  { k: '7', label: 'agents, one per module', detail: 'Every one of them proposes; none of them decides' },
  { k: '0', label: 'unverified numbers reach your ledger', detail: 'The engine re-derives every proposal before anyone sees it' },
]

/** The field behind the mark: a slow orbit, and a scatter of points drifting
 *  toward a line. It is the product's own geometry — a fleet approaching its
 *  limit — rather than a stock gradient blob. */
function BrandField() {
  const still = prefersReducedMotion()
  const dots = useMemo(
    () => Array.from({ length: 26 }, (_, i) => ({
      // Deterministic pseudo-random, so the composition is stable across
      // renders and identical on every machine.
      x: ((i * 73) % 97) / 97, y: ((i * 41) % 89) / 89,
      r: 1.4 + ((i * 17) % 5) * 0.5,
      d: (i % 7) * 1.1, o: 0.18 + ((i * 13) % 6) * 0.06,
    })),
    [],
  )
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* a warm bloom behind the mark, off-centre so the composition is not a bullseye */}
      <div className="absolute left-[72%] top-[38%] h-[620px] w-[620px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(232,34,59,.20) 0%, rgba(232,34,59,.05) 44%, transparent 70%)' }} />

      {/* concentric rings, expanding — the radar the Reg AI module is named for */}
      {[0, 1, 2].map((i) => (
        <span key={i} className="absolute left-[72%] top-[38%] h-[330px] w-[330px] -translate-x-1/2 -translate-y-1/2 rounded-full border"
          style={{
            borderColor: 'rgba(255,255,255,.10)',
            animation: still ? undefined : `aire-ring 7s var(--ease-out) infinite ${i * 2.33}s`,
          }} />
      ))}

      {/* the fleet: points drifting toward a line */}
      <svg className="absolute inset-0 h-full w-full">
        <line x1="8%" y1="82%" x2="92%" y2="58%" stroke="rgba(255,255,255,.16)" strokeWidth="1.25" strokeDasharray="6 5" />
        {dots.map((d, i) => (
          <circle key={i} cx={`${8 + d.x * 84}%`} cy={`${34 + d.y * 52}%`} r={d.r}
            fill={d.y > 0.55 ? 'rgba(255,255,255,.55)' : 'rgba(255,120,132,.75)'}
            opacity={d.o}
            style={{ animation: still ? undefined : `aire-drift ${11 + (i % 5) * 2.5}s var(--ease) infinite ${d.d}s` }} />
        ))}
      </svg>

      {/* a fine grid, barely there — it reads as engineering rather than mood */}
      <div className="absolute inset-0 opacity-[.30]"
        style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,.14) 1px, transparent 0)', backgroundSize: '26px 26px' }} />
    </div>
  )
}

export default function SignIn() {
  const setSession = useApp((s) => s.setSession)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(true)

  // An existing cookie should not make anyone type their password again.
  useEffect(() => {
    let live = true
    fetch('/api/session', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => { if (live && s?.email) setSession({ email: s.email, name: s.name, workspace: s.workspace, role: (s.role ?? 'analyst') as Role }) })
      .catch(() => {})
      .finally(() => { if (live) setChecking(false) })
    return () => { live = false }
  }, [setSession])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/session', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        credentials: 'same-origin', body: JSON.stringify({ email, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error ?? 'Sign-in failed.'); return }
      setSession({ email: data.email, name: data.name, workspace: data.workspace, role: (data.role ?? 'analyst') as Role })
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally { setBusy(false) }
  }

  if (checking) {
    return (
      <div className="grid h-screen place-items-center bg-[var(--canvas)]">
        <span className="anim-fade flex flex-col items-center gap-3">
          <LogoHero size={54} />
          <span className="flex items-center gap-2 text-[12px] text-[var(--ink-4)]"><Spinner size={12} /> Checking your session…</span>
        </span>
      </div>
    )
  }

  return (
    <div className="grid h-screen grid-cols-1 bg-[var(--surface-1)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)]">
      {/* ── the form ── */}
      <div className="flex items-center justify-center px-6 py-10">
        <div className="anim-in w-full max-w-[356px]">
          <img src="/brand/aire-lockup-black.png" alt="AiRE" className="mb-9 h-[26px] w-auto object-contain object-left" draggable={false} />

          <h1 className="text-[27px] font-semibold leading-[1.15] tracking-[-.028em] text-[var(--ink-1)]">
            Welcome back
          </h1>
          <p className="t-sub mt-2">Sign in to your compliance workspace.</p>

          <form onSubmit={submit} className="mt-7 space-y-3.5">
            {error && <Callout tone="neg" icon={<Icon name="alert" size={14} />}>{error}</Callout>}
            <Field label="Work email" htmlFor="email">
              <Input id="email" type="email" autoComplete="username" required autoFocus
                value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@manufacturer.com" />
            </Field>
            <Field label="Password" htmlFor="password">
              <Input id="password" type="password" autoComplete="current-password" required
                value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </Field>
            <Button type="submit" variant="primary" size="lg" block loading={busy}
              iconRight={<Icon name="arrowRight" size={14} />}>Sign in</Button>
          </form>

          <div className="mt-7 border-t border-[var(--line-soft)] pt-5">
            <p className="flex items-start gap-2 text-[11px] leading-relaxed text-[var(--ink-4)]">
              <Icon name="lock" size={12} className="mt-px shrink-0" />
              Sessions are server-issued, HttpOnly and expire after a working day. Your role travels inside the signed session — the
              browser never asserts it.
            </p>
          </div>
        </div>
      </div>

      {/* ── the brand field ── */}
      <div className="relative hidden overflow-hidden lg:block" style={{ background: 'var(--nav-bg)' }}>
        <BrandField />

        <div className="relative flex h-full flex-col justify-between px-14 py-14">
          <div className="flex items-center gap-2.5">
            <span className="h-px w-8 bg-white/25" />
            <span className="text-[11px] uppercase tracking-[.14em] text-white/45">Emissions compliance platform</span>
          </div>

          <div className="flex flex-col items-start">
            <LogoHero size={88} className="mb-8" />
            <h2 className="max-w-[13ch] text-[38px] font-semibold leading-[1.08] tracking-[-.032em] text-white">
              Know the number before the regulator does.
            </h2>
            <p className="mt-4 max-w-[42ch] text-[13.5px] leading-relaxed text-white/55">
              Your fleet, run through the actual rule pack, in every market you file in — with an agent on every module and a
              deterministic engine standing between what it proposes and what you sign.
            </p>
          </div>

          <div className="stagger grid grid-cols-3 gap-6 border-t border-white/10 pt-7">
            {PROOF.map((p) => (
              <div key={p.label}>
                <div className="text-[26px] font-semibold tabular-nums leading-none tracking-[-.03em] text-white">{p.k}</div>
                <div className="mt-2 text-[11.5px] font-medium leading-snug text-white/75">{p.label}</div>
                <div className="mt-1 text-[10.5px] leading-snug text-white/35">{p.detail}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
