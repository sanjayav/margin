import { useState } from 'react'
import { useStore, CRED } from '../state/store'
import Icon from '../components/Icon'

const CHROME = '#141110'

const POINTS: { icon: any; title: string; body: string }[] = [
  { icon: 'scale', title: 'Every market, one control room', body: 'EU, India, UK, Australia and China — CO₂, fuel-economy and dual-credit regimes side by side.' },
  { icon: 'scatter', title: 'Model any future, to 2030', body: 'AI-agent forecasts and scenario planning, recomputed live by a deterministic engine.' },
  { icon: 'shield', title: 'Numbers you can defend', body: 'Every figure is computed from official-source data — never invented, always traceable.' },
]

export default function Login() {
  const login = useStore((s) => s.login)
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [err, setErr] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr(false)
    setTimeout(() => {
      if (!login(email, pass)) { setErr(true); setBusy(false) }
    }, 450)
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#FBF7EF]">
      {/* ── LEFT · brand showcase ─────────────────────────────────────────── */}
      <div className="relative hidden w-[54%] shrink-0 flex-col justify-between overflow-hidden p-12 lg:flex xl:p-16" style={{ background: CHROME }}>
        {/* ambient light */}
        <div className="pointer-events-none absolute -left-40 -top-44 h-[560px] w-[560px] rounded-full blur-3xl" style={{ background: 'radial-gradient(circle, rgba(232,34,59,0.42), transparent 62%)' }} />
        <div className="pointer-events-none absolute -bottom-52 left-1/4 h-[560px] w-[560px] rounded-full blur-3xl" style={{ background: 'radial-gradient(circle, rgba(246,104,100,0.26), transparent 62%)' }} />
        {/* fine dot grid for depth */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.5]" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '26px 26px', maskImage: 'radial-gradient(120% 100% at 30% 20%, #000 40%, transparent 90%)', WebkitMaskImage: 'radial-gradient(120% 100% at 30% 20%, #000 40%, transparent 90%)' }} />
        {/* grain */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.05] mix-blend-overlay" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%27140%27 height=%27140%27%3E%3Cfilter id=%27n%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%270.8%27 numOctaves=%273%27/%3E%3C/filter%3E%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23n)%27/%3E%3C/svg%3E")' }} />

        <div className="relative z-10 rise">
          <img src="/brand/aire-white.png" alt="AiRE" className="h-11 w-auto" />
        </div>

        <div className="relative z-10 max-w-[30rem] rise [animation-delay:80ms]">
          <h1 className="font-display text-[42px] font-extrabold leading-[1.04] tracking-[-0.03em] text-white xl:text-[48px]">
            The emissions-compliance<br />control room.
          </h1>
          <p className="mt-5 text-[15px] leading-relaxed text-white/55">
            Track every regulated market, stress-test any regulatory future, and price the exposure — before it lands.
          </p>
          <div className="mt-10 space-y-5">
            {POINTS.map((p, i) => (
              <div key={p.title} className="flex items-start gap-3.5 rise" style={{ animationDelay: `${160 + i * 80}ms` }}>
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.05] text-brand-400 backdrop-blur-sm">
                  <Icon name={p.icon} size={17} />
                </span>
                <div>
                  <div className="text-[13.5px] font-semibold text-white/90">{p.title}</div>
                  <div className="mt-0.5 text-[12px] leading-relaxed text-white/45">{p.body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-2 text-[11px] font-medium tracking-wide text-white/35 rise [animation-delay:420ms]">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-safe/80" />
          Official sources · EEA · BEE · DCCEEW · DfT · MIIT
        </div>
      </div>

      {/* ── RIGHT · sign in ───────────────────────────────────────────────── */}
      <div className="relative flex flex-1 items-center justify-center px-6 py-10">
        <div className="pointer-events-none absolute inset-0 opacity-[0.5]" style={{ background: 'radial-gradient(900px 420px at 80% -10%, rgba(232,34,59,0.05), transparent 60%)' }} />
        <div className="relative z-10 w-full max-w-[380px] rise [animation-delay:120ms]">
          {/* mark shows on small screens where the left panel is hidden */}
          <img src="/brand/aire-black.png" alt="AiRE" className="mb-8 h-9 w-auto lg:hidden" />

          <div className="mb-7">
            <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-500">Welcome back</div>
            <h2 className="font-display mt-1.5 text-[26px] font-bold tracking-tight text-ink-100">Sign in to AiRE</h2>
          </div>

          <form onSubmit={submit}>
            <Field label="Work email" icon="user">
              <input type="email" autoFocus value={email} onChange={(e) => { setEmail(e.target.value); setErr(false) }}
                placeholder="you@oem.com" className="w-full bg-transparent text-[14px] text-ink-100 outline-none placeholder:text-ink-500" />
            </Field>
            <Field label="Password" icon="shield">
              <input type="password" value={pass} onChange={(e) => { setPass(e.target.value); setErr(false) }}
                placeholder="••••••••" className="w-full bg-transparent text-[14px] text-ink-100 outline-none placeholder:text-ink-500" />
            </Field>

            {err && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/[0.08] px-3 py-2 text-xs font-medium text-danger">
                <Icon name="alert" size={14} /> Incorrect email or password.
              </div>
            )}

            <button type="submit" disabled={busy} className="btn-primary w-full py-3 text-[15px]">
              {busy ? <span className="flex items-center gap-2"><span className="h-2 w-2 animate-pulse rounded-full bg-white" /> Signing in…</span> : <>Sign in <Icon name="arrow-right" size={16} /></>}
            </button>
          </form>

          <button type="button" onClick={() => { setEmail(CRED.user); setPass(CRED.pass); setErr(false) }}
            className="mt-4 flex w-full items-center justify-center gap-1.5 text-[12px] font-medium text-ink-500 transition hover:text-brand">
            <Icon name="spark" size={12} /> Use demo credentials
          </button>

          <p className="mt-10 text-center text-[10.5px] leading-relaxed text-ink-500">
            Figures illustrative until live datasets are connected.
          </p>
        </div>
      </div>
    </div>
  )
}

function Field({ label, icon, children }: { label: string; icon: any; children: React.ReactNode }) {
  return (
    <label className="mb-3.5 block">
      <span className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.13em] text-ink-500">{label}</span>
      <div className="flex items-center gap-2.5 rounded-xl border border-black/10 bg-white px-3.5 py-3 shadow-[0_1px_2px_rgba(40,30,15,0.04)] transition focus-within:border-brand/60 focus-within:shadow-[0_0_0_3px_rgba(232,34,59,0.1)]">
        <Icon name={icon} size={16} className="text-ink-500" />
        {children}
      </div>
    </label>
  )
}
