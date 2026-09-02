/* ───────────────────────────────────────────────────────────────────────────
   Agent registry — the seven agents the platform ships with.
   ---------------------------------------------------------------------------
   One per module, plus the cross-cutting regulatory watcher. Each declares its
   purpose, its method and its tools in the user's language, because that block
   is rendered verbatim before a run: nobody should have to guess what an agent
   is about to touch.
   ─────────────────────────────────────────────────────────────────────────── */
import type { AgentDef, AgentId, ModuleId } from './kernel.js'

export const AGENTS: AgentDef[] = [
  {
    id: 'plan.monitor',
    name: 'Position monitor',
    module: 'plan',
    accent: 'var(--dv-1)',
    purpose: 'Keeps the current-year and prior-year position true to the data, and tells you the moment it stops being true.',
    method: [
      'Check every source feeding this market for a newer file than the one loaded',
      'Recompute the position from the pool level down — pool, manufacturer, model, variant',
      'Compare against the last computed position and isolate what actually moved',
      'Raise an exception for any level whose status changed, or whose data is past its refresh window',
    ],
    tools: [
      { id: 'fleet.read', label: 'Fleet reader', blurb: 'Reads the loaded registrations and specifications for this market.' },
      { id: 'source.freshness', label: 'Source clock', blurb: 'Compares each source against its expected refresh cadence.' },
      { id: 'engine.hierarchy', label: 'Hierarchy calculator', blurb: 'Re-derives compliance at pool, manufacturer, model and variant level.' },
      { id: 'engine.diff', label: 'Position differ', blurb: 'Isolates what changed since the previous computed position.' },
    ],
    requires: 'plan.view', applyRequires: 'data.edit', cadence: 'hourly', maxAutonomy: 'act',
  },
  {
    id: 'forecast.horizon',
    name: 'Horizon analyst',
    module: 'forecast',
    accent: 'var(--dv-4)',
    purpose: 'Watches the live news and source feed, and turns what it finds into a dated, cited revision to a named assumption — never into a number with no parent.',
    method: [
      'Read the current Assumption Book and the falsifier written against each case on the board',
      'Search the live news, trade and regulatory feed for items that bear on those four assumptions',
      'Classify every item: which assumption, which direction, how strongly, and what the revised value would be',
      'Post each item to the evidence feed with its citation, so a person accepts or dismisses it',
      'Where the feed shows a coherent world the board does not cover, put a new case on it — at zero weight, with a falsifier',
      'Re-run the projection under any revision it proposes, and stop at the human',
    ],
    tools: [
      { id: 'rulepack.trajectory', label: 'Rule trajectory', blurb: 'Reads the notified limit curve and phase-in schedule for each forecast year.' },
      { id: 'web.search', label: 'Live news feed', blurb: 'Searches current news, trade press and regulatory sources for anything bearing on the four assumptions.', external: true },
      { id: 'web.fetch', label: 'Source reader', blurb: 'Opens a specific article or document and extracts the figures it actually states.', external: true },
      { id: 'evidence.post', label: 'Evidence feed', blurb: 'Posts a dated, cited item to the feed, classified against the assumption it moves.' },
      { id: 'case.propose', label: 'Scenario board', blurb: 'Adds a case to the board at zero weight — a coherent world, with a falsifier and its sources.' },
      { id: 'engine.project', label: 'Projection engine', blurb: 'Applies the driver set year by year and computes the resulting position.' },
      { id: 'engine.cases', label: 'Case builder', blurb: 'Stresses each driver to produce the low and high cases around the central line.' },
    ],
    requires: 'forecast.view', applyRequires: 'forecast.publish', cadence: 'weekly', maxAutonomy: 'propose',
  },
  {
    id: 'scenario.architect',
    name: 'Scenario architect',
    module: 'scenario',
    accent: 'var(--dv-3)',
    purpose: 'Turns a goal in plain language — "get under the line by 2028 for the least money" — into a scenario the engine has already checked.',
    method: [
      'Read the goal and restate it as a target, a deadline and a constraint set',
      'Read the current position and the levers this regime actually allows',
      'Search the lever space for the cheapest combination that meets the target',
      'Hand the resulting lever set to the engine for re-derivation before proposing it',
    ],
    tools: [
      { id: 'engine.position', label: 'Current position', blurb: 'Reads the live position this scenario starts from.' },
      { id: 'rulepack.levers', label: 'Lever catalogue', blurb: 'Lists the levers this regime permits and their legal bounds.' },
      { id: 'engine.search', label: 'Lever search', blurb: 'Evaluates candidate lever combinations against the target.' },
      { id: 'cost.model', label: 'Cost model', blurb: 'Prices each lever using the workspace cost assumptions.' },
      { id: 'engine.validate', label: 'Validator', blurb: 'Re-derives the full position from the proposed levers.' },
    ],
    requires: 'scenario.view', applyRequires: 'scenario.publish', cadence: 'on-demand', maxAutonomy: 'propose',
  },
  {
    id: 'book.keeper',
    name: 'Ledger keeper',
    module: 'creditbook',
    accent: 'var(--dv-2)',
    purpose: 'Keeps the credit book reconciled to the computed position, and flags every entry that no longer agrees with it.',
    method: [
      'Read every ledger entry and its stated basis',
      'Recompute the position that each entry claims to represent',
      'Flag entries whose basis has moved, expired or been superseded',
      'Draft the correcting entries — never post them',
    ],
    tools: [
      { id: 'ledger.read', label: 'Ledger reader', blurb: 'Reads all credit positions, transfers and banked balances.' },
      { id: 'engine.position', label: 'Position calculator', blurb: 'Recomputes the compliance position behind each entry.' },
      { id: 'rulepack.transfer', label: 'Transfer rules', blurb: 'Checks each entry against what this regime actually permits.' },
      { id: 'ledger.reconcile', label: 'Reconciler', blurb: 'Matches entries to positions and isolates the differences.' },
    ],
    requires: 'creditbook.view', applyRequires: 'creditbook.post', cadence: 'daily', maxAutonomy: 'propose',
  },
  {
    id: 'data.steward',
    name: 'Data steward',
    module: 'data',
    accent: 'var(--dv-5)',
    purpose: 'Maps an incoming file to the platform schema, grades what arrived, and refuses to let a bad column through quietly.',
    method: [
      'Inspect the incoming file — sheets, headers, units and row shape',
      'Propose a column mapping against the platform schema, with a confidence per column',
      'Profile the mapped data for gaps, outliers, unit mismatches and duplicate keys',
      'Report a quality grade and the exact rows that would need attention',
    ],
    tools: [
      { id: 'file.inspect', label: 'File inspector', blurb: 'Reads sheet names, headers and a row sample from the upload.' },
      { id: 'schema.match', label: 'Schema matcher', blurb: 'Matches incoming headers to platform fields with a confidence score.' },
      { id: 'data.profile', label: 'Profiler', blurb: 'Measures completeness, ranges, duplicates and unit consistency.' },
      { id: 'data.reconcile', label: 'Reconciler', blurb: 'Compares the upload against the currently loaded dataset.' },
    ],
    requires: 'data.view', applyRequires: 'data.import', cadence: 'on-change', maxAutonomy: 'propose',
  },
  {
    id: 'pool.broker',
    name: 'Pooling broker',
    module: 'pooling',
    accent: 'var(--dv-6)',
    purpose: 'Runs the whole pooling job as a workflow: who could pool, whether it is legal here, what it is worth, and what the term sheet says.',
    method: [
      'Confirm this regime permits pooling and read its constraints',
      'Enumerate candidate partitions of the eligible manufacturers',
      'Score each partition on total exposure avoided and on each member’s standalone alternative',
      'Price the settlement between members and draft the terms',
    ],
    tools: [
      { id: 'rulepack.pooling', label: 'Pooling rules', blurb: 'Reads whether this regime pools at all, and on what terms.' },
      { id: 'pool.enumerate', label: 'Partition search', blurb: 'Generates and prunes candidate pool memberships.' },
      { id: 'engine.pool', label: 'Pool calculator', blurb: 'Computes the pooled average and each member’s standalone position.' },
      { id: 'price.settle', label: 'Settlement pricer', blurb: 'Values the transfer between members against their alternatives.' },
      { id: 'doc.terms', label: 'Term drafter', blurb: 'Drafts the heads of terms for the proposed pool.' },
    ],
    // Signing a pool is a contract between legal entities. No autonomy setting
    // may ever let software do that on its own.
    requires: 'pooling.view', applyRequires: 'pooling.execute', cadence: 'on-demand', maxAutonomy: 'propose',
  },
  {
    id: 'reg.watch',
    name: 'Regulatory watch',
    module: 'regai',
    accent: 'var(--dv-1)',
    purpose: 'Watches the rules themselves — per country — and tells you what a change would do to your position before it is in force.',
    method: [
      'Monitor the official sources for this market: gazettes, consultations, technical committees',
      'Classify each item by stage — consultation, draft, notified, in force — and by what it touches',
      'Translate the change into rule-pack terms: which parameter moves, by how much, from when',
      'Quantify the impact on your current position and route it to the affected module',
    ],
    tools: [
      { id: 'reg.sources', label: 'Official sources', blurb: 'Reads the registered regulatory sources for this market.', external: true },
      { id: 'web.search', label: 'Regulatory search', blurb: 'Searches for amendments, consultations and enforcement notices.', external: true },
      { id: 'web.fetch', label: 'Document reader', blurb: 'Opens a specific instrument and extracts the operative provisions.', external: true },
      { id: 'rulepack.diff', label: 'Rule differ', blurb: 'Expresses the change as a delta against the loaded rule pack.' },
      { id: 'engine.impact', label: 'Impact calculator', blurb: 'Recomputes your position under the changed rule.' },
    ],
    requires: 'regai.view', applyRequires: 'data.edit', cadence: 'daily', maxAutonomy: 'propose',
  },
]

export const AGENT_BY_ID = Object.fromEntries(AGENTS.map((a) => [a.id, a])) as Record<AgentId, AgentDef>
export const agentsForModule = (m: ModuleId) => AGENTS.filter((a) => a.module === m)
export const getAgent = (id: AgentId) => AGENT_BY_ID[id]
