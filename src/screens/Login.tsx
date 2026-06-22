import { useState } from 'react'
import { useStore, CRED } from '../state/store'
import Icon from '../components/Icon'

const CHROME = '#17140F'

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
    <div className="relative flex h-screen items-center justify-center overflow-hidden" style={{ background: CHROME }}>
      {/* animated aurora */}
      <div className="aurora-1 pointer-events-none absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full blur-3xl" style={{ background: 'radial-gradient(circle, rgba(242,81,14,0.45), transparent 65%)' }} />
      <div className="aurora-2 pointer-events-none absolute -bottom-48 -right-32 h-[560px] w-[560px] rounded-full blur-3xl" style={{ background: 'radial-gradient(circle, rgba(217,128,5,0.38), transparent 65%)' }} />
      <div className="pointer-events-none absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%27120%27 height=%27120%27%3E%3Cfilter id=%27n%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%270.85%27 numOctaves=%273%27/%3E%3C/filter%3E%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23n)%27/%3E%3C/svg%3E")' }} />

      <div className="relative z-10 w-[400px] max-w-[92vw] rise">
        {/* brand */}
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="mb-4 grid h-16 w-16 place-items-center rounded-2xl text-white shadow-glow" style={{ background: 'linear-gradient(160deg,#FF8A4C,#ED4709)' }}>
            <span className="text-4xl font-black leading-none">M</span>
          </div>
          <h1 className="font-display text-[34px] font-bold leading-none tracking-tight text-gradient">Margin</h1>
          <p className="mt-2.5 text-sm text-[#A89E8C]">The emissions-compliance control room</p>
        </div>

        {/* card */}
        <form onSubmit={submit} className="rounded-2xl border border-white/[0.09] bg-white/[0.04] p-6 backdrop-blur-xl" style={{ boxShadow: '0 30px 60px -30px rgba(0,0,0,0.7)' }}>
          <Field label="Work email" icon="user">
            <input type="email" autoFocus value={email} onChange={(e) => { setEmail(e.target.value); setErr(false) }}
              placeholder="you@oem.com" className="w-full bg-transparent text-sm text-white outline-none placeholder:text-[#6E665A]" />
          </Field>
          <Field label="Password" icon="shield">
            <input type="password" value={pass} onChange={(e) => { setPass(e.target.value); setErr(false) }}
              placeholder="••••••••" className="w-full bg-transparent text-sm text-white outline-none placeholder:text-[#6E665A]" />
          </Field>

          {err && (
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-danger/40 bg-danger/15 px-3 py-2 text-xs text-danger">
              <Icon name="alert" size={14} /> Incorrect email or password.
            </div>
          )}

          <button type="submit" disabled={busy} className="btn-primary w-full py-3 text-[15px]">
            {busy ? <span className="flex items-center gap-2"><span className="h-2 w-2 animate-pulse rounded-full bg-white" /> Signing in…</span> : <>Sign in <Icon name="arrow-right" size={16} /></>}
          </button>

          <button type="button" onClick={() => { setEmail(CRED.user); setPass(CRED.pass); setErr(false) }}
            className="mt-3 w-full text-center text-[11px] text-[#8A8174] transition hover:text-white">
            Use demo credentials
          </button>
        </form>

        <p className="mt-5 text-center text-[10px] leading-relaxed text-[#6E665A]">
          Official sources only · EEA · BEE · DCCEEW · DfT<br />Figures illustrative until live datasets are connected.
        </p>
      </div>
    </div>
  )
}

function Field({ label, icon, children }: { label: string; icon: any; children: React.ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.13em] text-[#8A8174]">{label}</span>
      <div className="flex items-center gap-2.5 rounded-xl border border-white/[0.1] bg-black/20 px-3.5 py-2.5 transition focus-within:border-brand/50">
        <Icon name={icon} size={16} className="text-[#7E766A]" />
        {children}
      </div>
    </label>
  )
}
