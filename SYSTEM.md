# AiRE — system design

How the product is structured, why the interface works the way it does, and the
order it gets built. Read with PRODUCT.md (what is true) and DESIGN.md (how it
looks).

---

## 1. The interaction model

### The problem with what exists
Eleven destinations, each dense. The user must know *which screen answers their
question* before they can ask it. That is the complexity: not the number of
pixels, but the fact that navigation is a prerequisite for getting an answer.

### The model: intent first, evidence on demand
The reference products (Claude, ChatGPT, Sierra, Decagon, Attio) all share one
move: **you state intent; the system does the navigating.** The workspace does
not disappear — it becomes the *evidence surface* rather than the entry point.

AiRE has an unusual advantage here. In most AI products the model produces the
answer, so trust is the hard problem. Here a deterministic engine produces the
answer and the model only *narrates and navigates*. Every claim can expand into
the exact computation that produced it.

**So tool-use disclosure and "the defensible number" are the same feature.** That
is the product's design idea, and nothing else in this category has it.

### Three layers of disclosure
Every answer in the product is the same object at three depths. Most people stop
at the first; the auditor goes to the third; both are served.

| Layer | Shows | Who |
|---|---|---|
| **1 · Answer** | One number, one sentence, one action. | Everyone |
| **2 · Evidence** | Which engine tools ran, what they returned, the fleet/limit/gap behind it, the rule applied. | Analyst |
| **3 · Provenance** | Raw inputs, the statutory clause, the dataset vintage, elapsed time. | Auditor, regulator |

This is one component (`<Answer>`), not three screens. It renders in the agent
thread AND at the top of every module, so a number never appears anywhere in the
product without a path to its own working.

### Progressive delegation
Actions the agent proposes are **staged, never applied**. The user approves. As a
given action type is approved repeatedly, it can be promoted to auto-apply for
that workspace. Autonomy is earned by demonstrated reliability rather than
granted at launch. (`StagedAction` already models this.)

### What this does to the IA
Navigation stops being the primary interface and becomes a way to *browse* what
you could have asked for.

    Ask            ← the front door. Intent in, answer out.
    Overview       ← the standing answer, no question needed
    Analyse        ← evidence surface: drill, compare, trace
    Plan           ← change something and price it
    Data           ← the rows, the imports, the provenance

Five, not eleven. Credit book, Pricing, Pooling, Forecast, Compare and
Intelligence become *panels inside* Analyse and Plan, or answers you can ask for.

---

## 2. Information architecture

    App shell        market switcher · Ask · nav · workspace identity
      └ Market       (registered module; owns its own nav + labels)
          └ Module   one job, one primary action
              └ Answer   layer 1 → 2 → 3

Rules that keep it simple as it grows:
- A module has **one** primary action.
- A module never shows a second module's controls. If it needs them, it links.
- Anything that is a *question* is a saved ask, not a new screen.
- A market may omit a module entirely. Absence is a valid answer.

---

## 3. Component system

Three tiers. A screen may only use the tier above it.

**Tier 1 — primitives** (`src/design/primitives.tsx`)
MetricBand · Block · Figure · Status · Table · Provenance.
No product knowledge. No market knowledge.

**Tier 2 — patterns** (`src/design/patterns/`)
Answer (the three-layer disclosure) · ToolTrace (what the engine ran) ·
StagedChange (approve/dismiss) · EmptyState · ComparisonBar.
Product-aware, market-agnostic.

**Tier 3 — market screens** (`src/markets/<id>/screens/`)
Composed from tiers 1–2. Owns its market's language and layout.

Anything reused twice moves down a tier. Anything with a `country ===` in it is
in the wrong tier.

---

## 4. Code architecture

    src/
      engine/      deterministic compute + rule packs. No React, no market UI.
      design/      tokens, primitives, patterns. No product data.
      agent/       tool spec, streaming client, turn state.
      markets/     <id>/ screens · nav · copy · index.ts (defineMarket)
      app/         shell, routing, auth, store
      lib/         cross-cutting helpers

Boundaries enforced by direction of dependency:
`markets → design → (nothing)` and `markets → engine → (nothing)`.
`design` never imports `markets`. `engine` never imports React.

---

## 5. Build order — inch by inch

Each step ships working and is reviewed before the next starts.

1. **Answer pattern** — the three-layer component. Everything else depends on it.
2. **Ask surface** — the agent thread rendering Answer + ToolTrace + StagedChange.
3. **EU Overview** on the Answer pattern (replaces the current one).
4. **EU Analyse** — evidence surface; absorbs Compare + Intelligence.
5. **EU Plan** — absorbs Scenario + Action plan + Forecast + Pricing.
6. **EU Data** — rows, imports, provenance.
7. **Retire** the EU legacy screens.
8. **Register IN**, then UK, AU, CN — each with its own modules and language.
9. **Delete** the 41 `country ===` branches and the CN/IN forks.

Done means: typecheck, tests, the EU verifier, the design detector, and a
screenshot reviewed at 1560px and at 1024px.

---

## 6. UI architecture

Benchmarked against Linear/Stripe/Notion (navigation), Bloomberg (expert
density) and the master–detail–inspector pattern.

### The shell — three panes, fixed meaning

    ┌─────────┬────────────────────────────┬───────────┐
    │  NAV    │      WORKING SURFACE       │ INSPECTOR │
    │ market  │  one module, one job,      │ evidence  │
    │ modules │  ONE primary action,       │ · agent   │
    │ persona │  ≤ 4 metrics above fold    │ · assumption │
    └─────────┴────────────────────────────┴───────────┘
                  ⌘K — the same grammar, typed

The third pane is the fix for the biggest structural inconsistency in the
current app: today it is FactsRail on one screen, ScenarioRail on another and
nothing on a third, so the user cannot learn what the right-hand side of the
screen *is*. It becomes ONE thing — the Inspector — which always answers "tell me
more about what I have selected". What fills it is contextual; that it exists,
and where, is not.

Sidebar navigation stays visible. ⌘K complements it and never replaces it: a
command palette is how an expert moves, not how a new user learns.

### The grammar — one vocabulary, three ways in

Bloomberg's real lesson is not density, it is a compact learnable vocabulary that
experts internalise. AiRE has five verbs:

    show     <maker | market | model>     navigate to it
    why      <number>                     open its computation
    what if  <change>                     stage a scenario
    compare  <a> <b>                      side by side
    prove    <number>                     provenance + export

Every UI affordance maps to one of these, every one is typeable in ⌘K, and every
one is sayable to the agent. That equivalence is the point: **the agent's intent
vocabulary and the app's command vocabulary are the same set**, so the agent can
do anything the user can do, and using the UI teaches the agent.

New capability = a new noun, not a new verb. If something needs a sixth verb, it
probably belongs inside an existing one.

### Density is a mode

`Board` and `Analyst` already exist and mean almost nothing. They become the
answer to "the product is too complex" — without making it useless for the people
who live in it.

| | Board | Analyst |
|---|---|---|
| Reader | exec, compliance officer checking in | daily analyst |
| Shows | one number, one sentence, large type | tables, drill, inspector |
| Controls | none | full |
| Metrics above fold | 1 | ≤ 4 |

Same engine, same numbers. One is the calm door, the other the cockpit.

### Rules that keep the shell honest
- A module has ONE primary action. If it needs two, it is two modules.
- ≤ 4 metrics above the fold (Stripe's discipline). The fifth goes in the Inspector.
- The Inspector never contains a primary action — it explains, it does not decide.
- Nothing in the working surface is unreachable by the grammar.
