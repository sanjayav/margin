# Underline — emissions compliance control room

A live, interactive screen where a car maker sees exactly where its fleet sits
against the legal emissions limit, what it will cost in fines, and the cheapest
set of changes to get below the line — across every market it sells in.

Built from the Build Brief + the four OEM compliance workbooks (EU, India,
Australia, UK).

## Run it — full backend, zero config

```bash
npm install
npm run dev      # http://localhost:5180 — UI + live /api backend
npm run build    # type-check + production bundle
```

`npm run dev` now runs the **whole backend locally** (a Vite plugin serves the `/api` routes). With no cloud account it uses a **local file store** auto-seeded from the official extract, so the data layer is genuinely live (`Admin → Data freshness` shows **Live · DB**). No Postgres or Vercel needed to develop.

Optional upgrades, each independent:

```bash
cp .env.example .env
# ANTHROPIC_API_KEY=...   → turns on the "Ask Underline" AI analyst
# DATABASE_URL=...        → switches the store from local file to Neon Postgres
```

## Accounts and tenants

The API decides who you are. Every data route requires a session cookie issued
by `POST /api/session`, and every session carries a **workspace** — the tenant
boundary. Saved scenarios, working assumptions and imported datasets are scoped
to it, so **two customers on one deployment cannot see each other's work**.
Datasets read through to a shared baseline (the official extract) until a
workspace imports its own.

```bash
# one workspace per customer
node scripts/make-user.mjs priya@maruti.co.in "Priya Sharma" maruti
node scripts/make-user.mjs ops@hyundai.com    "Ops"          hyundai
```

Add the printed objects to `AUTH_USERS` (a JSON array) and set `SESSION_SECRET`.
Rotating the secret signs everyone out — that is how you revoke a session.

With neither set, local dev runs a single built-in demo user and says so loudly.
In production an unset value is a hard failure rather than a silent default, so
a misconfigured deploy refuses to issue sessions instead of accepting the demo
password.

The AI routes are rate-limited per workspace (in-memory, so per serverless
instance — a guardrail against runaway usage, not a billing control).

With `DATABASE_URL` set: `npm run db:setup` once, then `npm run ingest:eu` for the full EEA dataset. Deploy to Vercel (`vercel`) for the scheduled cron refresh. Everything degrades gracefully — the app always works, the AI chat is the only piece that strictly needs a key.

## The workspace — five modules + one add-on

Inside a country module the sidebar is exactly five modules, plus utilities:

Fact and hypothesis are separate surfaces (the FP&A / EEA-monitoring doctrine):
**Analyse and the Credit book run on the ACTUALS basis** — the as-sold book of
record, structurally unreachable by levers, citing its dataset vintage — while
Scenario/Forecast model on the working assumptions and lead with Δ vs actuals.

| Module | What it does |
| --- | --- |
| **Analyse** | The actuals monitoring surface — drill market → pool → maker → model → variant on the book of record. Facts rail: reporting period, dataset provenance & vintage, fleet profile. No levers can reach it. |
| **Forecast** | Big-4-grade, driver-based: an **Assumption Book** (sourced fundamentals with draft→reviewed→signed-off governance), an outlook that projects the latest actuals (volumes, S-curve ZE adoption mandate-floored, CO₂/mass drift), a weighted **case matrix** (Base/Upside/Downside/Management) with probability-weighted expected exposure, a YoY **fine bridge** (regulation+volume+tech+mix, sums exactly), two-way sensitivities & break-even, Monte-Carlo bands, and a one-click **board pack**. Backtested: the 2025-seeded India outlook lands within 5% of 2026 actuals. |
| **Scenario** | The modelling home — *Model* (the drill workbench under working assumptions, variance-vs-actuals first), *Get under the line* (ranked, costed path) and *Compare scenarios*. Saved scenarios pin the dataset vintage they were seeded from. |
| **Credit book** | The position ledger: surplus/deficit by maker and year, banked cumulative positions, buyer↔seller trade planner priced at the market credit price (shadow-priced at the fine rate where the regime only pools, e.g. EU). |
| **Pricing** | Compliance cost per car, model-level price ladder (which nameplates carry the burden, which earn credit value), pass-through and point-of-sale tax levers (GST/cess, VAT, VED, LCT). |
| *Pooling* (add-on) | Cheapest legal partition + Shapley fair settlement — an add-on because only some regimes allow pooled averages. |

Utilities below the modules: **Data & imports** (expert table, pivots, and the Import Studio — drop an .xlsx/.csv or paste from Excel; S&P Global Mobility and JATO extracts auto-map), **Intelligence**, **Admin**.

## The AI analyst (accurate by design)

`api/ask.ts` runs **Claude (`claude-opus-4-8`)** with **tool use over the real engine**. The model understands the question and narrates the answer, but it never does arithmetic — every emissions figure, limit, gap, fine and cost comes from `query_compliance` / `get_recommendations`, which call the same `src/engine` code the charts use. It can also drive the live screen via `update_dashboard`. That keeps a spoken answer exactly as trustworthy as the chart, and quotes the fine's plain maths.

## The one idea that keeps it simple

Every country's rules differ in only four ways — the **limit formula**, the
**credit system**, the **pooling rules**, and the **fine rate**. Everything else
is shared. Those four things live in a *rule pack*; nothing country-specific
touches the screens.

```
src/engine/
  engine.ts            ONE shared "group the cars, take the weighted average"
                       operation — runs at market / maker / model / engine level
  types.ts             Vehicle + RulePack contracts
  recommend.ts         "Get me under the line" greedy €-per-gram optimiser
  intelligence.ts      dated, sourced early-warning event feed
  rulepacks/
    eu.ts              Reg (EU) 2019/631 — mass target, ZLEV factor, €95/g, pooling
    india.ts           CAFE II (2025–26 actuals) → draft CAFE III — L/100km target,
                       super-credits, CNF discounts, EC Act 2022 stepped penalty
    australia.ts       NVES — break-pointed Type 1/Type 2 lines, A$100/g, credit trading
    uk.ts              VETS ZEV mandate modelled as the unit mandate it is —
                       % non-ZE metric, £12,000 per missing ZEV, CRTS credit trading
```

Adding the US or China = writing a new file in `rulepacks/`. No screen changes.

## The three things that matter

1. **See the line** — `components/LimitChart.tsx`, a fully custom SVG chart. The
   limit line rises with mass; the fleet sits as a marker; below is green, above
   is a fine. No chart library.
2. **Change anything, see it live** — `components/ScenarioRail.tsx`. Every slider
   (zero-emission share, fleet mass, sales, eco-innovation, pooling) recomputes
   the chart, the gap and the fine within the same frame. Moving mass moves the
   fleet *and* the limit line together.
3. **Get me under the line** — `screens/GetUnderLine.tsx`. A ranked, costed
   to-do list that actually re-runs the engine after each step until you clear
   the limit.

## Data

Two layers, in priority order at runtime:

1. **Live open-source scrape (EU).** `npm run ingest:open` pulls **every new car and
   van registered in the EU, Norway and Iceland** from the **European Environment
   Agency** CO₂-monitoring file behind Reg (EU) 2019/631, through the EEA's public
   **DiscoData SQL API** (`scripts/ingest-eu-eea.mjs`). Source of record:
   [EEA Datahub — Monitoring of CO₂ emissions from passenger cars](https://www.eea.europa.eu/en/datahub/datahubitem-view/fa8b1229-3db6-495d-b18e-9c9b3267c02b),
   2025 provisional, published 25 Jun 2026.

   One source row is one registered vehicle (verified: `COUNT(*) == SUM(r)`), so
   registrations are counted and every average is registration-weighted — the basis the
   regulation itself uses. The pull is **exhaustive**, not top-N: all 8,586 car and 2,963
   van model × fuel × mode groups, aggregated to `manufacturer · model · powertrain` with
   each maker's registrations, CO₂, test mass and eco-innovation credit preserved
   **exactly** (anything beyond the per-maker model cap folds into `Other models` rows
   back-solved from the exact sums, so no truncation bias). Aggregating per manufacturer
   keeps each query inside the DiscoData timeout; the whole pull takes ~30 s.

   It writes the bundled extract *and* the store the app reads — local file store by
   default, Neon when `DATABASE_URL` is set. The 2025 fleet is held across the 2025–2030
   horizon (the limit tightens per the rule pack); held rows are labelled as held.

   **Four methodology points that make the numbers tie out to the EEA's own publication:**

   | | |
   |---|---|
   | `Mh NOT LIKE 'AA-%'` | drops individual/small-series approval buckets. With it the car fleet reads **96.72 g/km on 10,799,313 registrations**; the EEA press release says 96.7 g/km and 10.8 million. Without it you get 96.88 and nothing ties out. |
   | eco-innovation must be `COALESCE`d | `Erwltp` is NULL on vehicles claiming no credit, so `AVG()` averages *claimants only* and reports 1.50 g/km where the true per-vehicle credit is **0.777**. The naive read understates fleet CO₂ — and every fine. |
   | powertrain comes from `Fm`, not `Ft` | `Fm` carries the mode: `P` = plug-in (OVC-HEV), `H` = non-plug hybrid (NOVC-HEV), `E` = electric. Reading `Ft` alone files 3.3M petrol hybrids as plain ICE and cannot see a plug-in at all. |
   | `Mh` ≠ `Mp` | `Mh` is the compliance manufacturer, `Mp` its declared Article 6 pool — different things ("HYUNDAI TURKIYE" sits in pool "HYUNDAI MOTOR EUROPE"). Both are kept, so the **real 2025 pools** are modelled: Tesla's 16-member pool, "Mercedes-Benz, Volvo Cars, Polestar and Smart", BMW, Nissan-BYD, Hyundai, KG Mobility–Xpeng. |

   Cars reconcile to the published headline **exactly** — the EEA truncates to one decimal,
   so 96.725 → "96.7", 18.979 → "18.9", 9.772 → "9.7". Vans do not: this reads 172.5 g/km
   against a published 172.1 (BEV 10.5% vs 10.3%). Every plausible filter was swept and
   none reproduces all three published van figures at once; the likely cause is the
   multi-stage attribution vans need under Annex III, which the flat file does not expose
   (`CO2`, `CO2mon`, `Mmon`, `MRObaseI`, `MRObaseC` are all NULL). The van fleet is
   therefore the honest registration-weighted read, accurate to ~0.25% of the published
   average. See the NOTE in `scripts/ingest-eu-eea.mjs`.

   `scripts/ingest-open.mjs` and `scripts/ingest-eu.mjs` are **superseded** and carry the
   defects listed above; their headers say so.

2. **Bundled official extract (fallback + IN/AU/UK/CN).** Real model-level rows extracted
   from the supplied workbooks (`src/data/fleet_data.json`). India, Australia, the UK and
   China stay on this extract — none publishes a comparable open *registration* API (the
   UK VCA and AU Green Vehicle Guide are spec catalogues with no volumes). The EU rows in
   the bundle are now the EEA pull itself, so the offline fallback is the real market too.

```bash
npm run ingest:open   # EEA cars + vans → bundled extract + local file store (zero config)
npm run verify:eu     # 39 checks: data ties to the EEA release, rule pack ties to the statute,
                      # engine ties to reality (who is short, who is long, what pooling saves)
DATABASE_URL=... npm run db:setup && DATABASE_URL=... npm run ingest:eu   # also load Neon
```

Both layers are guarded in CI by `src/engine/__tests__/eu.golden.test.ts` — the target-line
constants are written out by hand from the regulation, and the dataset assertions are the
EEA's own published headline, so the suite fails if either the engine or the ingest drifts.

`Admin → Data freshness` shows **Live · DB**). No Postgres or Vercel needed to develop.

Optional upgrades, each independent:

```bash
cp .env.example .env
# ANTHROPIC_API_KEY=...   → turns on the "Ask Underline" AI analyst
# DATABASE_URL=...        → switches the store from local file to Neon Postgres
```

## Accounts and tenants

The API decides who you are. Every data route requires a session cookie issued
by `POST /api/session`, and every session carries a **workspace** — the tenant
boundary. Saved scenarios, working assumptions and imported datasets are scoped
to it, so **two customers on one deployment cannot see each other's work**.
Datasets read through to a shared baseline (the official extract) until a
workspace imports its own.

```bash
# one workspace per customer
node scripts/make-user.mjs priya@maruti.co.in "Priya Sharma" maruti
node scripts/make-user.mjs ops@hyundai.com    "Ops"          hyundai
```

Add the printed objects to `AUTH_USERS` (a JSON array) and set `SESSION_SECRET`.
Rotating the secret signs everyone out — that is how you revoke a session.

With neither set, local dev runs a single built-in demo user and says so loudly.
In production an unset value is a hard failure rather than a silent default, so
a misconfigured deploy refuses to issue sessions instead of accepting the demo
password.

The AI routes are rate-limited per workspace (in-memory, so per serverless
instance — a guardrail against runaway usage, not a billing control).

With `DATABASE_URL` set: `npm run db:setup` once, then `npm run ingest:eu` for the full EEA dataset. Deploy to Vercel (`vercel`) for the scheduled cron refresh. Everything degrades gracefully — the app always works, the AI chat is the only piece that strictly needs a key.

## The workspace — five modules + one add-on

Inside a country module the sidebar is exactly five modules, plus utilities:

Fact and hypothesis are separate surfaces (the FP&A / EEA-monitoring doctrine):
**Analyse and the Credit book run on the ACTUALS basis** — the as-sold book of
record, structurally unreachable by levers, citing its dataset vintage — while
Scenario/Forecast model on the working assumptions and lead with Δ vs actuals.

| Module | What it does |
| --- | --- |
| **Analyse** | The actuals monitoring surface — drill market → pool → maker → model → variant on the book of record. Facts rail: reporting period, dataset provenance & vintage, fleet profile. No levers can reach it. |
| **Forecast** | Big-4-grade, driver-based: an **Assumption Book** (sourced fundamentals with draft→reviewed→signed-off governance), an outlook that projects the latest actuals (volumes, S-curve ZE adoption mandate-floored, CO₂/mass drift), a weighted **case matrix** (Base/Upside/Downside/Management) with probability-weighted expected exposure, a YoY **fine bridge** (regulation+volume+tech+mix, sums exactly), two-way sensitivities & break-even, Monte-Carlo bands, and a one-click **board pack**. Backtested: the 2025-seeded India outlook lands within 5% of 2026 actuals. |
| **Scenario** | The modelling home — *Model* (the drill workbench under working assumptions, variance-vs-actuals first), *Get under the line* (ranked, costed path) and *Compare scenarios*. Saved scenarios pin the dataset vintage they were seeded from. |
| **Credit book** | The position ledger: surplus/deficit by maker and year, banked cumulative positions, buyer↔seller trade planner priced at the market credit price (shadow-priced at the fine rate where the regime only pools, e.g. EU). |
| **Pricing** | Compliance cost per car, model-level price ladder (which nameplates carry the burden, which earn credit value), pass-through and point-of-sale tax levers (GST/cess, VAT, VED, LCT). |
| *Pooling* (add-on) | Cheapest legal partition + Shapley fair settlement — an add-on because only some regimes allow pooled averages. |

Utilities below the modules: **Data & imports** (expert table, pivots, and the Import Studio — drop an .xlsx/.csv or paste from Excel; S&P Global Mobility and JATO extracts auto-map), **Intelligence**, **Admin**.

## The AI analyst (accurate by design)

`api/ask.ts` runs **Claude (`claude-opus-4-8`)** with **tool use over the real engine**. The model understands the question and narrates the answer, but it never does arithmetic — every emissions figure, limit, gap, fine and cost comes from `query_compliance` / `get_recommendations`, which call the same `src/engine` code the charts use. It can also drive the live screen via `update_dashboard`. That keeps a spoken answer exactly as trustworthy as the chart, and quotes the fine's plain maths.

## The one idea that keeps it simple

Every country's rules differ in only four ways — the **limit formula**, the
**credit system**, the **pooling rules**, and the **fine rate**. Everything else
is shared. Those four things live in a *rule pack*; nothing country-specific
touches the screens.

```
src/engine/
  engine.ts            ONE shared "group the cars, take the weighted average"
                       operation — runs at market / maker / model / engine level
  types.ts             Vehicle + RulePack contracts
  recommend.ts         "Get me under the line" greedy €-per-gram optimiser
  intelligence.ts      dated, sourced early-warning event feed
  rulepacks/
    eu.ts              Reg (EU) 2019/631 — mass target, ZLEV factor, €95/g, pooling
    india.ts           CAFE II (2025–26 actuals) → draft CAFE III — L/100km target,
                       super-credits, CNF discounts, EC Act 2022 stepped penalty
    australia.ts       NVES — break-pointed Type 1/Type 2 lines, A$100/g, credit trading
    uk.ts              VETS ZEV mandate modelled as the unit mandate it is —
                       % non-ZE metric, £12,000 per missing ZEV, CRTS credit trading
```

Adding the US or China = writing a new file in `rulepacks/`. No screen changes.

## The three things that matter

1. **See the line** — `components/LimitChart.tsx`, a fully custom SVG chart. The
   limit line rises with mass; the fleet sits as a marker; below is green, above
   is a fine. No chart library.
2. **Change anything, see it live** — `components/ScenarioRail.tsx`. Every slider
   (zero-emission share, fleet mass, sales, eco-innovation, pooling) recomputes
   the chart, the gap and the fine within the same frame. Moving mass moves the
   fleet *and* the limit line together.
3. **Get me under the line** — `screens/GetUnderLine.tsx`. A ranked, costed
   to-do list that actually re-runs the engine after each step until you clear
   the limit.

## Data

Two layers, in priority order at runtime:

1. **Live open-source scrape (EU).** `npm run ingest:open` pulls **real registration
   data** from the **European Environment Agency** CO₂-monitoring database via its
   public **DiscoData SQL API** (`scripts/ingest-open.mjs`). Each source row is one
   registered car, so the script aggregates server-side to the engine's level —
   `manufacturer (harmonised compliance parent) · model · fuel → registration-weighted
   WLTP CO₂ + test mass + registrations` — for the top manufacturers and their top
   models (~6.6 M registrations, 2025 provisional). No multi-GB download. It writes to
   the same store the app reads: the local file store by default, or Neon when
   `DATABASE_URL` is set. The real current-year fleet is held across the 2025–2030
   horizon as the baseline (the limit tightens per the rule pack); those forward years
   are the 2025 baseline projected, not measured. HEV/MHEV fold into ICE because the
   EEA fuel field doesn't separate them.

2. **Bundled official extract (fallback + IN/AU/UK).** Real model-level rows extracted
   from the supplied workbooks (`src/data/fleet_data.json`; EU rows additionally
   enriched with the workbook's per-variant spec). India, Australia and the UK stay on
   this extract — none publishes a comparable open *registration* API (the UK VCA and
   AU Green Vehicle Guide are spec catalogues with no volumes). Add a market by writing
   another adapter in `ADAPTERS` in `scripts/ingest-open.mjs`.

```bash
npm run ingest:open      # scrape EEA → local file store (zero config)
DATABASE_URL=... npm run db:setup && DATABASE_URL=... npm run ingest:open   # also load Neon
```

`Admin → Data freshness` shows **Live · DB** for any market loaded into the store.
