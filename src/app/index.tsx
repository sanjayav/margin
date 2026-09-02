/* ───────────────────────────────────────────────────────────────────────────
   AppRoot — the three states the application can be in.
     no session  → sign in
     session, not set up → onboarding
     otherwise   → the workspace
   ─────────────────────────────────────────────────────────────────────────── */
import React, { Suspense, lazy } from 'react'
import { ToastHost, Spinner } from './design/primitives'
import { useApp } from './state/appStore'
import { AppShell } from './shell/AppShell'
import SignIn from './auth/SignIn'
import Onboarding from './auth/Onboarding'
import ErrorBoundary from './shell/ErrorBoundary'

const Plan       = lazy(() => import('./modules/plan/PlanModule'))
const Forecast   = lazy(() => import('./modules/forecast/ForecastModule'))
const Scenario   = lazy(() => import('./modules/scenario/ScenarioModule'))
const CreditBook = lazy(() => import('./modules/creditbook/CreditBookModule'))
const Pooling    = lazy(() => import('./modules/pooling/PoolingModule'))
const Data       = lazy(() => import('./modules/data/DataModule'))
const RegAI      = lazy(() => import('./modules/regai/RegAIModule'))
const Settings   = lazy(() => import('./modules/settings/SettingsModule'))

const SCREENS = { plan: Plan, forecast: Forecast, scenario: Scenario, creditbook: CreditBook, pooling: Pooling, data: Data, regai: RegAI, settings: Settings }

function Loading() {
  return (
    <div className="grid h-full place-items-center text-[var(--ink-4)]">
      <span className="flex items-center gap-2 text-[12.5px]"><Spinner size={14} /> Loading module…</span>
    </div>
  )
}

export default function AppRoot() {
  const session = useApp((s) => s.session)
  const onboarded = useApp((s) => s.onboarded)
  const module = useApp((s) => s.module)

  if (!session) return <ToastHost><SignIn /></ToastHost>
  if (!onboarded) return <ToastHost><Onboarding /></ToastHost>

  const Screen = SCREENS[module as keyof typeof SCREENS] ?? Plan
  return (
    <ToastHost>
      <AppShell>
        <ErrorBoundary screenKey={module}>
          <Suspense fallback={<Loading />}><Screen /></Suspense>
        </ErrorBoundary>
      </AppShell>
    </ToastHost>
  )
}
