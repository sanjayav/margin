# Margin — Accuracy Gaps & Competitive Benchmark

_Last reviewed: 2026-06. Run `npm run validate` for the live red/green status._

This document is the single source of truth for (1) where the engine is inaccurate vs the
actual regulations and (2) how Margin compares to the established players. Every regulatory
claim is sourced; every accuracy gap is reproduced as a check in `src/engine/validate.ts`.

---

## 1. Accuracy gap register

Validation baseline: **17 pass · 3 fail · 6 review**. The machinery (weighted averages,
fine formula, pooling sub-additivity, mass-monotonic limits, small-volume exemption) is
**correct**. The gaps are concentrated in the **EU 2025 calibration**.

### Hard failures (engine produces a provably wrong number)

| # | Gap | Engine now | Correct (2025) | Impact | Source |
|---|-----|-----------|----------------|--------|--------|
| F1 | **Eco-innovation cap** | 7 g/km | **6 g/km** (2025–2029); 4 g/km (2030–2034) | makers over-credited up to 1 g/km | Reg (EU) 2023/851 (amends Art 11) |
| F2 | **Mass-adjustment slope** | a = 0.0333 (MIRO basis) | **a = 0.0144 on test-mass basis** | mis-targets heavy/light fleets by several g/km | Comm. Impl. Dec. (EU) 2023/1623; JRC133502 |
| F3 | **ZLEV benchmark** | relaxes target above **15%** ZE | benchmark is **25%** cars / 17% vans | clean makers wrongly relaxed up to +5% → fines understated | Reg (EU) 2023/851; EC Cars & Vans |

### Structural reviews (sourced, need a model change not just a constant)

| # | Gap | Why it matters | Source |
|---|-----|----------------|--------|
| R1 | **Universal 95 g baseline** instead of manufacturer-specific 2021 WLTP | engine 2025 car target ≈ 80.75 g vs EU-wide reference **93.6 g WLTP**; per-maker error ±10–15 g | EC Cars & Vans; ICCT 2025 targets (Oct 2024) |
| R2 | **ZLEV share counts only 0 g**, not 0–50 g/km | PHEVs/efficient hybrids excluded from the ZLEV share → benchmark relaxation undercounted | Reg (EU) 2023/851 |
| R3 | **PHEV utility factor not modelled** (~2× CO₂) | Euro 6e-bis doubles official PHEV CO₂: new types 1 Jan 2025, all regs 1 Jan 2026; further step 2027/2028. PHEV-heavy makers look far cleaner than reality | Comm. Reg (EU) 2023/443 |
| R4 | **2025–2027 three-year averaging not modelled** | Reg (EU) 2025/1214 lets makers average 2025–2027; changes who actually owes a premium this year | Reg (EU) 2025/1214 |
| R5 | **UK modelled as a CO₂ proxy line** | UK is a **ZEV sales mandate** (28% cars / 16% vans in 2025; £15k/car shortfall; CRTS/VRTS trading), not a CO₂ average | DfT VETS Order 2023 |
| R6 | **Illustrative fine/credit rates** | IN ₹1,000/L·car, UK £100/g·car, £50 credit are placeholders; AU A$100/g and EU €95/g are statutory | engine rule packs |

### Confirmed-correct (regulatory anchors that pass)

EU €95/g·car premium (Art 8) · AU NVES Type 1 = 141 g / Type 2 = 210 g (2025) · AU A$100/g penalty ·
India CAFE III d = 3.7264 L/100km & 0.002 slope (FY2027) · UK 28% ZEV trajectory · BEV → 0 in all packs.

### Derogation note (labels, low priority)
Small-volume = **< 10,000** cars/yr (individual derogation); niche = **10,000–300,000** (45% below 2007,
ends after 2028); **< 1,000 exempt**. Engine only models the <1,000 exemption (acceptable; bands are edge cases).

---

## 2. Competitive benchmark

How the incumbents build it (sources: company product pages + Internet Archive, ICCT, EUR-Lex, industry press).

| Player | What it is | Strength | Limit for us |
|--------|-----------|----------|--------------|
| **S&P Global Mobility** (VPaC / Novation) | physics-based compliance engine: 12-yr CO₂/FE forecast, 60k powertrain combos, credit/penalty/pooling economics, tech cost curves | deepest engine + registration data moat (90+ countries, VIN) | US/EU/China/Brazil focus; **India CAFE / AU NVES / UK ZEV not confirmed**; no probabilistic output |
| **Dataforce** ("Road to Zero") | EU 2019/631 to fine level: per-maker/group/pool targets, ZLEV bonus, €95/g, 3-yr averaging; ICCT's data source | regulation-accurate EU core + channel-split registration data | deterministic only; no PHEV-UF param documented; EU-only |
| **JATO Dynamics** (WLTP Link) | variant/trim + **option-level** CO₂ data, 50+ markets | finest data granularity | data vendor, **no OEM penalty/pooling engine**; CO₂ tracker only |
| **ICCT** | the public **reference implementation**: exact `E0 + a·(M−M0)`, ZLEV, eco cap, 3-yr averaging, **PHEV UF as a first-class time-versioned input**, OEM-resolved forecasts | the credibility bar — match their constants | not a product; ranges not probabilistic distributions |
| **AVL / FEV / Ricardo** | engineering consulting: tech cost/CO₂ curves → what to build | prescriptive roadmaps | bespoke consulting, not self-serve analytics |

### Dimension-by-dimension — what "best in class" looks like

| Dimension | Best-in-class (who) | Margin today | Gap |
|-----------|--------------------|--------------|-----|
| Data granularity | option-level CO₂ (JATO); channel split (Dataforce); VIN 90+ ctry (S&P) | model/variant, 321-row sample | **buy/license data; don't build** |
| Regulatory-engine correctness | ICCT reference constants + PHEV UF versioning | machinery correct, EU 2025 calibration red | **fix F1–F3, R1–R3** |
| Forecasting | OEM-resolved BEV-share & gap, 12-yr horizon (S&P/ICCT) | basic forecast screen | tie to live data + cost curves |
| **Uncertainty / probabilistic** | **nobody productises it** | none | **whitespace — biggest differentiator** |
| **Pooling / credit-market** | gram-gap→€ ceiling, surplus matching (analysts only) | single-year pool average | **whitespace — build the optimiser** |
| Scenario simulation | interactive mix + tech cost curves (Dataforce/S&P) | mix/mass/sales/variants ✓ | add cost-of-compliance & policy variants |
| Board outputs | analyst portals; no single-verdict pack confirmed | KPIs + export | **whitespace — verdict pack + AI analyst** |

---

## 3. Where Margin wins (the four whitespaces)

No incumbent is confirmed to productise these together:

1. **Probabilistic penalty exposure** — P10/P50/P90 €-at-risk, confidence bands on the gap. Universal gap in the market.
2. **Multi-party pooling/credit optimiser** — the gram-gap→€ bridge (ceiling = €95 × g over × registrations; floor ≈ 0 for pure-BEV sellers), surplus/deficit matching, discounted by the 2025–27 averaging flexibility. (Reference: Tesla EU pool ≈ €1.8bn FCA deal 2019–21; sector faced up to €15bn 2025 fines absent pooling.)
3. **True multi-region breadth** — EU + India CAFE + Australia NVES + UK ZEV as first-class packs with **correctly versioned PHEV utility factors**.
4. **Board-ready single-verdict output + AI analyst** narrating drivers and scenarios.

---

## 4. Roadmap (prioritised)

**Phase 1 — make EU provably accurate (turns 3 fails + R1/R2 green).**
F2 slope 0.0144 (test-mass, year-versioned) · F1 eco cap 6 g (year-versioned) · F3 ZLEV benchmark 25%/17% ·
R2 ZLEV = 0–50 g/km · R1 manufacturer-specific 2021 baseline (calibrate fleet target to 93.6 g).

**Phase 2 — the hard correctness nuance.**
R3 PHEV utility-factor as a time-versioned parameter (2025/26 + 2027/28 steps) · R4 2025–27 three-year averaging.

**Phase 3 — differentiate.**
Probabilistic layer (Monte-Carlo on mix/price → €-at-risk distribution) · pooling optimiser with the gram-gap→€ bridge · UK as a proper ZEV unit-mandate (R5) · label illustrative rates (R6).

**Phase 4 — data & scale.**
License/ingest channel-split registration data (Dataforce-grade) into Neon; replace the 321-row sample.

Each phase re-runs `npm run validate`; a change is "done" only when its check is green.
