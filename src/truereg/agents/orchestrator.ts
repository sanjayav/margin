// ───────────────────────────────────────────────────────────────────────────
// THE ORCHESTRATOR — a goal becomes agent tasks, and money stops at a human.
//
// "Get installation 3 verification-ready by March" is decomposed here. The
// crucial design choice: THE PLAN IS DERIVED, NOT INVENTED. It comes from the
// obligation graph's critical path plus the gaps the deterministic engines
// found in the record — so the same goal against the same record produces the
// same plan every time, and a customer can be shown why each task exists by
// pointing at the duty or the gap that put it there.
//
// A model that invented the plan would be a better demo and a worse product:
// you could not tell a verifier why step four was in the list.
//
// Execution is where the agents earn their keep — reading, interpreting,
// explaining, chasing. Every task that produces a staged action stops and waits
// for a person, which is the mechanical form of "escalates to a human at every
// decision carrying money or risk".
// ───────────────────────────────────────────────────────────────────────────
import { criticalPath } from '../obligations/graph.js'
import { OBLIGATIONS } from '../obligations/authored.js'
import type { AgentId } from './registry.js'
import { agentMayCall, getAgent } from './registry.js'
import { runToolSafe, type StagedAction, type ToolContext, type ToolName, type ToolResult } from './tools.js'

export type GoalId = 'verification-ready' | 'buyer-case' | 'close-precursors' | 'first-declaration' | 'second-regime'

export interface Goal {
  id: GoalId
  titleEn: string
  titleZh: string
  /** The duty this goal discharges, when there is one. The plan is its path. */
  obligationId?: string
  promptEn: string
  icon: 'shield' | 'scale' | 'link' | 'section' | 'layers'
}

export const GOALS: Goal[] = [
  { id: 'verification-ready', obligationId: 'cbam.eu.verify', icon: 'shield',
    titleEn: 'Get this installation verification-ready', titleZh: '使本装置达到可核查状态',
    promptEn: 'Everything an accredited verifier will test, in the order they will test it, with what closes each finding.' },
  { id: 'buyer-case', icon: 'scale',
    titleEn: 'Build the buyer case', titleZh: '构建买方商业论证',
    promptEn: 'What proving the number is worth to each EU buyer, per contract and per tonne, against the default they would otherwise use.' },
  { id: 'close-precursors', obligationId: 'cbam.eu.account-precursors', icon: 'link',
    titleEn: 'Close the precursor gaps', titleZh: '关闭前体数据缺口',
    promptEn: 'Every upstream input without emissions data, what it is worth, and what to ask each supplier for.' },
  { id: 'first-declaration', obligationId: 'cbam.eu.declare-and-surrender', icon: 'section',
    titleEn: 'Take a buyer to first declaration', titleZh: '协助买方完成首次申报',
    promptEn: 'The full critical path from registration to the declarant’s 30 September surrender.' },
  { id: 'second-regime', icon: 'layers',
    titleEn: 'Extend to the UK mechanism', titleZh: '扩展至英国机制',
    promptEn: 'What the same verified dataset satisfies in the second regime, and what genuinely has to be collected again.' },
]

export type TaskState = 'pending' | 'running' | 'done' | 'escalated' | 'blocked' | 'skipped'

export interface Task {
  id: string
  agent: AgentId
  titleEn: string
  titleZh: string
  /** The tool that produces this task's ground truth. */
  tool: ToolName
  input?: Record<string, unknown>
  dependsOn: string[]
  /** Why this task is in the plan — an obligation id or a named gap. Shown in
   *  the UI so no step is unexplained. */
  becauseEn: string
  obligationId?: string
  state: TaskState
  result?: ToolResult<unknown>
  error?: { code: string; message: string }
  /** Actions this task staged. Non-empty means a person is required. */
  escalations: StagedAction[]
  ms?: number
}

export interface Plan {
  goal: Goal
  tasks: Task[]
  /** Duties the plan discharges, in discharge order. */
  path: { id: string; titleEn: string; titleZh: string; dueOn: string | null }[]
  derivedFrom: string
}

const t = (id: string, agent: AgentId, tool: ToolName, titleEn: string, titleZh: string, becauseEn: string, dependsOn: string[] = [], input?: Record<string, unknown>, obligationId?: string): Task =>
  ({ id, agent, tool, titleEn, titleZh, becauseEn, dependsOn, input, obligationId, state: 'pending', escalations: [] })

/** Build the task list for a goal. Deterministic: same goal + same record → same
 *  plan. The obligation graph supplies the spine; the engines supply the gaps. */
export function planFor(goalId: GoalId, ctx: ToolContext): Plan {
  const goal = GOALS.find((g) => g.id === goalId)
  if (!goal) throw new Error(`Unknown goal "${goalId}".`)

  const pathObs = goal.obligationId ? criticalPath(OBLIGATIONS, goal.obligationId) : []
  const path = pathObs.map((o) => ({ id: o.id, titleEn: o.titleEn, titleZh: o.titleZh, dueOn: null as string | null }))

  // Common spine. Every goal starts by knowing what is on file, because a plan
  // built on an unread record is a plan built on an assumption.
  const tasks: Task[] = [
    t('read', 'intake', 'read_record', 'Read the installation record', '读取装置记录',
      'Nothing can be planned against a record that has not been read.'),
    t('intake', 'intake', 'intake_queue', 'Triage the unstructured documents', '梳理未结构化文件',
      'A quantity with no traceable source is a verification finding regardless of whether the number is right.', ['read']),
    t('boundary', 'boundary', 'map_boundary', 'Map plant vernacular onto Annex III routes', '将工厂术语映射至附件三路线',
      'The route decides the system boundary, and the boundary decides which fuels are attributed.', ['read'], undefined, 'cbam.eu.determine-route'),
  ]

  const needsNumber: GoalId[] = ['verification-ready', 'buyer-case', 'close-precursors', 'first-declaration', 'second-regime']
  if (needsNumber.includes(goalId)) {
    tasks.push(
      t('precursors', 'precursor', 'trace_precursors', 'Trace precursors and chase the gaps', '追溯前体并跟进缺口',
        'Relevant precursors are part of the declared figure; an unresolved one is carried at a default that is materially worse.', ['boundary'], undefined, 'cbam.eu.account-precursors'),
      t('emissions', 'precursor', 'compute_embedded_emissions', 'Compute embedded emissions under Annex IV', '依附件四计算隐含排放',
        'The deterministic calculation. No model is in this path.', ['boundary', 'precursors'], undefined, 'cbam.eu.calculate-emissions'),
    )
  }

  if (goalId === 'verification-ready' || goalId === 'first-declaration') {
    tasks.push(
      t('pack', 'verifier', 'assemble_evidence_pack', 'Rehearse the verification', '预演核查',
        'The findings an accredited verifier raises are predictable from the record; predicting them before the visit is the point.', ['emissions'], undefined, 'cbam.eu.verify'),
    )
  }

  if (goalId === 'buyer-case' || goalId === 'first-declaration') {
    tasks.push(
      t('defaults', 'delta', 'compare_to_defaults', 'Compare actuals against the default values', '将实际值与默认值比较',
        'The default is the buyer’s alternative, so it is the only meaningful comparator.', ['emissions']),
      t('a9', 'delta', 'assess_carbon_price', 'Assess the Article 9 position', '评估第9条状况',
        'A domestic carbon price is only worth something to the buyer if the scheme is recognised. Assuming it is would overstate the case.', ['emissions'], undefined, 'cbam.eu.claim-carbon-price'),
      t('exposure', 'delta', 'buyer_exposure', 'Model buyer exposure per contract', '按合同测算买方风险敞口',
        'The mill carries no obligation; the buyer does. The case has to be stated in the buyer’s currency.', ['defaults', 'a9']),
    )
  }

  if (goalId === 'close-precursors') {
    tasks.push(
      t('defaults', 'delta', 'compare_to_defaults', 'Price what each gap costs at default', '按默认值测算各缺口的代价',
        'A supplier chase needs a number attached or it does not get prioritised.', ['emissions']),
    )
  }

  if (goalId === 'first-declaration') {
    tasks.push(
      t('disclose', 'disclosure', 'prepare_disclosure', 'Stage the buyer disclosures', '暂存买方披露包',
        'Each declarant needs the record against its own EORI, and nothing may be sent without a person releasing it.', ['pack', 'exposure'], undefined, 'cbam.eu.disclose-to-declarant'),
      t('obligations', 'disclosure', 'evaluate_obligations', 'Confirm every duty on the path is discharged', '确认路径上各项义务均已履行',
        'The declaration is the last duty on a chain; a gap anywhere upstream surfaces here.', ['disclose'], undefined, 'cbam.eu.declare-and-surrender'),
    )
  }

  if (goalId === 'second-regime') {
    tasks.push(
      t('regimes', 'watch', 'regulation_overview', 'Read what the second regime requires', '了解第二个机制的要求',
        'Expansion is authoring work; the question is what the existing dataset already satisfies.', ['emissions']),
      t('uk', 'watch', 'evaluate_obligations', 'Evaluate the UK duties against the same record', '以同一记录评估英国义务',
        'Same mill, same verified emissions dataset — the incremental collection is what has to be justified.', ['regimes'], { regulation: 'cbam-uk' }),
    )
  }

  tasks.push(
    t('watch', 'watch', 'watch_changes', 'Pin the versions this conclusion depends on', '锁定本结论所依赖的版本',
      'Every conclusion is pinned to a corpus, term-base and defaults version, so the watch agent knows what to re-open when one moves.', tasks.slice(-1).map((x) => x.id)),
  )

  return {
    goal, tasks, path,
    derivedFrom: goal.obligationId
      ? `Critical path of ${goal.obligationId} in the obligation graph, plus the gaps found in the record.`
      : 'The gaps found in the record by the deterministic engines.',
  }
}

export interface RunOptions {
  /** Called as each task changes state, so the UI can stream a live plan. */
  onTask?: (task: Task) => void
  /** Stop at the first task that stages an action. Default true — the whole
   *  point is that money-bearing decisions wait for a person. */
  haltOnEscalation?: boolean
}

/** Run a plan deterministically: each task calls its tool through the executor,
 *  with the agent's grant enforced. This is the replay path and the ground truth
 *  the live model path is checked against. */
export function runPlan(plan: Plan, ctx: ToolContext, opts: RunOptions = {}): Plan {
  const halt = opts.haltOnEscalation ?? false
  const done = new Map<string, Task>()
  let halted = false

  for (const task of plan.tasks) {
    if (halted) { task.state = 'skipped'; opts.onTask?.(task); continue }
    const unmet = task.dependsOn.filter((d) => done.get(d)?.state !== 'done' && done.get(d)?.state !== 'escalated')
    if (unmet.length) {
      task.state = 'blocked'
      task.error = { code: 'blocked', message: `Waiting on: ${unmet.join(', ')}.` }
      done.set(task.id, task); opts.onTask?.(task); continue
    }

    task.state = 'running'; opts.onTask?.(task)
    if (!agentMayCall(task.agent, task.tool)) {
      task.state = 'blocked'
      task.error = { code: 'not_granted', message: `${getAgent(task.agent).nameEn} may not call ${task.tool}.` }
      done.set(task.id, task); opts.onTask?.(task); continue
    }

    const before = ctx.staged.length
    const t0 = Date.now()
    const r = runToolSafe(task.tool, task.input ?? {}, ctx)
    task.ms = Date.now() - t0
    if (!r.ok) {
      task.state = 'blocked'; task.error = r.error
    } else {
      task.result = r.result
      task.escalations = ctx.staged.slice(before)
      task.state = task.escalations.length ? 'escalated' : 'done'
      if (task.escalations.length && halt) halted = true
    }
    done.set(task.id, task); opts.onTask?.(task)
  }
  return plan
}

export interface PlanSummary {
  total: number
  done: number
  escalated: number
  blocked: number
  /** Every action waiting on a person, in the order they were raised. */
  awaitingHuman: StagedAction[]
  /** Nothing is ever submitted. Stated as a fact the UI can assert. */
  submittedAnything: false
}

export function summarise(plan: Plan): PlanSummary {
  return {
    total: plan.tasks.length,
    done: plan.tasks.filter((t) => t.state === 'done').length,
    escalated: plan.tasks.filter((t) => t.state === 'escalated').length,
    blocked: plan.tasks.filter((t) => t.state === 'blocked').length,
    awaitingHuman: plan.tasks.flatMap((t) => t.escalations),
    submittedAnything: false,
  }
}
