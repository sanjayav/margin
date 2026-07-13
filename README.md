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
| **Forecast** | Multi-year scenario studio: materialised scenario specs, ramp levers, Monte-Carlo P10–P90 bands, breach-year detection. |
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
