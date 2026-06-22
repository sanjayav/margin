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
    india.ts           Draft CAFE III — L/100km target, super-credits, CNF discounts
    australia.ts       NVES — break-pointed Type 1/Type 2 lines, A$100/g, credit trading
    uk.ts              VETS/ZEV mandate — illustrative CO₂ line from the non-ZE allowance
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

321 real model-level rows extracted from the supplied workbooks
(`src/data/fleet_data.json`). Figures are illustrative until the live EEA / BEE /
DCCEEW / DfT datasets are connected, exactly as the brief notes.
