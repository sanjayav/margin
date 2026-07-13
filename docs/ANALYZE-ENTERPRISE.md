# Analyze — Enterprise Blueprint

_Written 2026-07 after a full module review + market scan. Companion to `BENCHMARK.md`
(§2b line-concept verdict) — this is the "how do we take Analyze to enterprise grade" plan._

---

## 1. Where Analyze stands today (inventory)

The module is already unusually strong for its size — a real analysis workbench, not a dashboard:

| Capability | Status |
|---|---|
| Verdict sentence (answer in words) + biggest-drag + required-ZE + cheapest-path link | ✓ |
| 5-level drill: Market → Pool → Manufacturer → Model → Variant, breadcrumbed, deep-linkable | ✓ |
| Bubble-vs-limit chart (mass × metric × volume), status/powertrain encoding switch | ✓ |
| Trajectory chips (gap by year, click-to-move), gap heatmap (maker×year), mekko (volume×mix) | ✓ |
| Powertrain breakdown ("how the average is built"), children scoreboard w/ sort | ✓ |
| EU 2025–27 three-year averaging card (Reg 2025/1214) | ✓ |
| Provenance drawer ("show the working") + CSV of contributions + data freshness date | ✓ |
| Print report, share links, draft-regime + illustrative-rate badges | ✓ |
| Live scenario rail (assumption ledger, revertible chips), Monte-Carlo €-at-risk | ✓ |

**Honest position vs incumbents:** feature-for-feature, the *analysis* already exceeds what
Dataforce Road to Zero (monthly gap/penalty monitoring by brand/pool/group/country) and the
Tableau-delivered VPaC/Compliance+ portals expose to users. What separates "impressive demo"
from "enterprise product" is not more charts — it is the six pillars below.

## 2. The enterprise bar (evidence)

- **Monthly position monitoring** is the working cadence of the industry — Dataforce's whole
  pitch is monthly monitoring so OEMs "steer the sales strategy towards CO₂ compliance,
  leaving enough time to react"; ICCT ships a monthly European Car Market Monitor.
  → Enterprise Analyze must answer *"what moved since last month, and why"* — not only
  *"where am I under today's assumptions"*.
- **Four pivots** are table stakes: brand · pool · OEM group · country/channel (Dataforce).
  We have pool/maker/model/variant; **country-within-market and channel splits are missing**
  (data supports `market` per row).
- **Positions, premiums, distressed-OEM flags, 12-yr horizon** (VPaC/Compliance+) — we match
  or beat, except position *history*.
- **Enterprise software table stakes** (any buyer's checklist): SSO/RBAC, audit trail,
  scheduled + branded exports (XLSX/PDF/PPTX), alerting, API access for their own BI,
  data lineage/vintage, multi-user server state. Today: demo login, localStorage-first
  state, print-only report, no alerts, no API surface.

## 3. Gap analysis — six pillars

### P1 · Measurement — from "gap" to a four-currency position (differentiating)
The one true fact (distance from target) expressed in the four currencies a board acts on
(see BENCHMARK.md §2b): **gap** (statutory verdict — keep) · **headroom %** (gap ÷ limit —
comparable across makers/years/markets) · **credit position in units** (long/short g·units
or allowances — the tradeable quantity, native to UK/AU and every pooling deal) ·
**money three ways** (fine ceiling vs mark-to-market at credit price vs cheapest
internal path from `recommend()`), min highlighted = *the cheapest out*.
All inputs exist in the engine (`gap`, `rawUnits`, `creditPrice`, `fineFor`, `recommend`,
`simulateRisk`, `poolOptimise`). Presentational composition, not new math.

### P2 · Attribution — "why did it change" (differentiating)
Enterprise analysts must decompose a position move between two states (year → year,
data vintage → vintage, scenario → scenario) into **mix · volume · mass · regulatory ·
credits** contributions. The engine makes this cheap: re-run `aggregate` swapping one
factor at a time (sequential/Shapley-lite decomposition). `GapWaterfall` already renders
waterfalls in GetUnderLine — generalise it into an Analyze "What changed" card. Add
**peer benchmarking** (headroom-% percentile among makers; "distressed" flag à la VPaC)
and **concentration** (top-N models = X% of the gap — Pareto of `gap × units`).

### P3 · Time & data — positions over *data* time, not just scenario time
- **Position history**: snapshot per data refresh (`/api/refresh` exists; store a
  compressed per-maker aggregate per vintage in the Neon store) → "position vs last month"
  delta chip + sparkline; the monthly-monitoring story.
- **As-of/vintage pinning**: every number carries its data vintage (provenance has
  `lastRefreshed`; promote to the Analyze header, not just the drawer).
- **Country/channel pivot** within a market (rows carry `market`; add a pivot control).
- **Ledger layer** (UK/AU banking/borrowing settlement — BENCHMARK §2b tests 1–2) as the
  settlement view beside the annual verdict.

### P4 · Workflow — what compliance teams do with the numbers
- **Exports that match how they work**: XLSX (they live in Excel — the origin workbooks
  prove it) and a branded PDF/PPTX **board pack** (verdict + position + attribution +
  plan); today's print-HTML report is the seed.
- **Saved views** (drill + scenario + pivots as named bookmarks; extend saved scenarios).
- **Alerts**: threshold ("headroom < 1 g"), event ("new data vintage landed",
  "position deteriorated > X"), delivered by email/Slack — needs a small server job.
- **Annotations**: analyst commentary pinned to a node + vintage (board-pack narrative).

### P5 · Governance & scale — the enterprise sale
- **Real auth → roles** (analyst edit vs exec read-only) → SSO/SAML → org workspaces;
  server-authoritative state (today: localStorage + single-blob mirror).
- **Audit trail**: who changed which assumption when (the assumption ledger is per-session
  UI today; persist events).
- **API surface**: read-only positions endpoint (JSON) so customers pull into their own
  Tableau/PowerBI — the delivery mode incumbents trained the market on.
- **Data scale**: 321-row extract → licensed registration data (BENCHMARK Phase 4).
  Engine is O(rows) per interaction: ingest-time compression to weighted variant rows
  (engine already treats `sales` as a weight) keeps the client engine viable to ~10⁵ rows;
  beyond that, server-side aggregation per (maker, model, pt, year) with the same rule packs.
- **Performance hygiene**: virtualise the scoreboard, defer heavy panels (pattern already
  used in ScenarioRail/Forecast).

### P6 · AI — from chat to analyst-grade narration
- **"What moved" narration** on refresh: AI reads the P2 attribution + P3 delta and writes
  the monthly commentary (numbers engine-computed — the house invariant).
- **Anomaly flags**: engine-side z-scores on position moves; AI explains, never computes.
- **Scheduled board pack**: monthly auto-generated pack (P4 export × P6 narration).

## 4. Target information architecture (the screen)

```
Breadcrumb · regime badge · vintage chip ("data: 2026-06 · EEA") · actions (share/working/export)
┌─ VERDICT (words, kept) ──────────────┬─ TRAJECTORY chips (kept) ─┐
├─ POSITION CARD (P1: verdict badge · headroom% · long/short units · money×3 w/ cheapest-out)
├─ WHAT CHANGED (P2: waterfall vs last vintage/year · peer percentile · concentration)
├─ bubble-vs-limit (kept) · scoreboard (kept, virtualised)
├─ heatmap · mekko (kept) · country/channel pivot (P3)
├─ SETTLEMENT (P3 ledger, UK/AU: banked/borrowed/net · 3-yr card stays for EU)
└─ actions: under-the-line · pooling · forecast (kept)
```

## 5. Build plan (phased, each verified like Forecast Studio)

| Phase | Scope | Effort | Unlocks |
|---|---|---|---|
| **A — Position & attribution** | P1 Position card · P2 What-changed waterfall + peer percentile + concentration | ~2–3 sessions | The measurement story; demo-ready differentiation |
| **B — Trust** | P3 vintage chip in header · position-history snapshots + delta · persisted audit of assumption changes | ~2 sessions | The monthly-monitoring story; auditability |
| **C — Workflow** | XLSX + board-pack export · saved views · alerts (server job) | ~2–3 sessions | Daily-use stickiness; exec surface |
| **D — Platform** | Auth/RBAC/SSO · positions API · data-scale pipeline | larger; sequence with billing | The enterprise contract checklist |
| **E — Ledger** | UK/AU banking settlement (BENCHMARK §2b tests 1–2 first) | ~2 sessions | Closes the "line is old" critique in-product |

**Recommended order: A → B → E → C → D.** A and B are pure engine+frontend (fast, verified
headless); E lands the regulatory-honesty story; C/D follow commercial traction.

_Sources: Dataforce Road to Zero product page & CO₂-compliance notes · ICCT European Car
Market Monitor (monthly series) · S&P Global Mobility VPaC product page · BENCHMARK.md §2
(verified Jul 2026 scan: Mobility Global/VPaC coverage & absence of probabilistic/pooling/
board-verdict productisation)._
