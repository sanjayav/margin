# AiRE — rebuild plan

Everything decided, in one place, in build order. Read with PRODUCT.md (truth),
DESIGN.md (look), SYSTEM.md (structure).

---

## 0. The thesis

**Decision-grade compliance.** Compliance data good enough to make a product
decision on, not just good enough to file.

Two teams, two models, no bridge today:
- **Compliance** — statutorily accurate, backward-looking. Exists to file and defend.
- **Planning** — forward-looking, not statutorily accurate. Spreadsheets with a
  simplified formula, because the real one is hard and changes.

Product decisions run 3–5 years ahead; compliance is assessed annually in arrears.
The gap is where an OEM loses hundreds of millions. Nobody serves it: S&P/JATO
sell data and unit forecasts, Big 4 sell a project, Watershed/Persefoni do
corporate carbon (a different problem), OEMs run a spreadsheet per market.

The moat needs three things at once and each is hard: **statutory math to the
clause**, **real registration data**, **a forward model**. We have all three.

---

## 1. The flow

    SENSE → UNDERSTAND → DECIDE → COMMIT → DEFEND → (SENSE)

| Stage | Question | Persona | Module |
|---|---|---|---|
| Sense | What changed, what needs me? | Compliance | **Brief** |
| Understand | Why is that the number? | Both | **Analyse** |
| Decide | What does this decision cost? | Planning | **Plan** |
| Commit | We agree this is the assumption. | Both | **Assumption Book** |
| Defend | Prove it to an auditor or board. | Compliance | **Filing** |

**Commit is the differentiator.** It is the handshake where a planning assumption
becomes compliance's record of truth, with an owner, a date and an audit trail.
That single object is why two teams use one tool instead of two.

---

## 2. Modules — five, not eleven

    Brief      Sense.      what needs you today. NO fine as the greeting.
    Analyse    Understand. drill, compare, trace. absorbs Compare + Intelligence.
    Plan       Decide.     scenario + cheapest path + forecast + pricing.
    Book       Commit.     assumptions, owners, sources, approvals, audit trail.
    Data       Evidence.   rows, imports, provenance.

Ask is not a module — it is the spine, reachable everywhere.
Pooling / Credit book become panels inside Plan and Analyse.

---

## 3. UI architecture

Three panes with FIXED meaning (SYSTEM.md §6):

    NAV │ WORKING SURFACE │ INSPECTOR
        │ one job         │ evidence · agent · assumption
        │ ONE action      │ (never a primary action)
        │ ≤4 metrics      │
              ⌘K — the grammar, typed

**The grammar — one vocabulary, three ways in:**

    show <thing> · why <number> · what if <change> · compare <a> <b> · prove <number>

Every UI affordance maps to a verb; every verb is typeable and sayable. The
agent's intent vocabulary and the app's command vocabulary are the same set.

**Density is a mode:** Board (one number, no controls) vs Analyst (the cockpit).

---

## 4. Packaging

Per-market SKU + add-ons. Three access states: owned · sellable · unavailable.
`unavailable` is legal, not commercial — China cannot pool, so it is never
offered. Base = compliance (position, drill, data, provenance, filing).
Add-on = planning (forecast, scenario, cheapest path, book). Platform add-ons:
ai, portfolio. Locked states compute their own value from the customer's data.

---

## 5. Build sequence

Each step ships working, is screenshotted at 1560 and 1024, and is reviewed
before the next begins.

**Phase 1 — the shell** (makes everything after it fast)
1. `AppShell` — three panes, fixed meaning, nav from the market registry
   × entitlements.
2. `CommandPalette` — the five verbs, over markets/makers/models/modules.
3. Density mode — Board vs Analyst, actually different.

**Phase 2 — the EU loop, end to end**
4. `Brief` wired to runCoPilot findings. (pattern built)
5. `Analyse` — drill + evidence in the Inspector. Absorbs Compare, Intelligence.
6. `Plan` — intent → staged changes → approve. Absorbs Scenario, Get-under-line,
   Forecast, Pricing, Pooling.
7. `Book` — the Assumption Book. The moat.
8. `Data` — Claude-like ingest: the agent maps the file and asks about conflicts.
9. `Filing` — board pack / filing export with full provenance.

**Phase 3 — the rest**
10. Retire the EU legacy screens.
11. Register IN, UK, AU, CN with their own modules and language.
12. Delete the 41 `country ===` branches and the CN/IN forks.
13. Entitlements server-authoritative (today: localStorage, trivially editable).

**Definition of done, every step:** typecheck · tests · EU verifier · Impeccable
detector · screenshot reviewed at two widths · no new `country ===` in shared code.

---

## 6. Risks

- **Scope.** 8,400 lines of screens exist. The rebuild runs BESIDE them (market
  registry routing already prefers registered modules), so nothing breaks
  mid-flight and each module is swapped when its replacement is better.
- **Entitlements are client-side.** The paywall is decorative until the API
  enforces it. Must land before anyone is charged.
- **Forecast performance.** ~3.6s and inherent to the work it does; revisit by
  deferring non-focused scenarios, not by another memo.
