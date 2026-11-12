import { useMemo } from 'react'
import { useApp, useRole } from '../../../state/appStore'
import { startRun } from '../../../agents/client'
import { can } from '../../../auth/rbac'
import { isRunning } from '../../../agents/kernel'

const CADENCE_MS = { daily: 86_400_000, weekly: 7 * 86_400_000 } as const

/** Everything a Reg AI surface needs to run the Regulatory watch: whether this
 *  role may, whether a pass is in flight, the last pass, and whether the
 *  workspace's cadence says one is due. There is no background scheduler, so
 *  "due" is a prompt to a person — never an unasked-for, billed run. */
export function useWatch() {
  const runs = useApp((s) => s.runs)
  const country = useApp((s) => s.country)
  const year = useApp((s) => s.scenario.year)
  const session = useApp((s) => s.session)
  const cfg = useApp((s) => s.regWatch)
  const lastPass = useApp((s) => s.regLastPass)
  const role = useRole()

  const last = runs.find((r) => r.agentId === 'reg.watch') ?? null
  const busy = !!last && isRunning(last.status)
  const allowed = can(role, 'regai.view') && can(role, 'agent.run')

  const due = useMemo(() => {
    if (cfg.cadence === 'manual') return false
    if (!lastPass) return true
    return Date.now() - Date.parse(lastPass) > CADENCE_MS[cfg.cadence]
  }, [cfg.cadence, lastPass])

  const run = (prompt?: string) => {
    if (busy || !allowed) return
    useApp.getState().setConsole(true)
    startRun({ agentId: 'reg.watch', country, prompt, context: { year, module: 'regai' } }, session?.name ?? 'you')
  }

  return { run, busy, allowed, last, lastPass, due, cfg }
}
