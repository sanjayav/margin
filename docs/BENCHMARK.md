# Margin — Accuracy Gaps & Competitive Benchmark

_Last reviewed: 2026-07. Run `npm run validate` for the live red/green status._

This document is the single source of truth for (1) where the engine is inaccurate vs the
actual regulations and (2) how Margin compares to the established players. Every regulatory
claim is sourced; every accuracy gap is reproduced as a check in `src/engine/validate.ts`.

---

## 1. Accuracy gap register

Validation baseline: **32 pass · 0 fail · 2 review** (was 29/0/2). The machinery (weighted
averages, fine formula, pooling & 3-year sub-additivity, mass-monotonic limits, small-volume
exemption) is **correct**, the **EU 2025 calibration is accurate** (Phases 1–2), the
**UK is a true ZEV unit mandate** (R5 resolved), and **India is modelled as a market in
transition**: CAFE II in force pre-FY2027, draft CAFE III (badged, stress-testable via the
draft-stringency lever) from FY2027-28, with the **statutory EC Act 2022 stepped penalty
(₹25k/₹50k per car at the 0.2 L/100km step)** replacing the old ₹1,000/L placeholder.
Assumption scoping is hierarchy-correct: eco-innovation certificates scope to the
manufacturer (baked per-vehicle in `applyScenario`), mass levers are hidden for unit
mandates (`massBasedLimit: false`) and at pool level, and regulator-side settings
(pooling, super-credits, PHEV UF, credit price, draft stringency) stay market-global.

### Resolved in Phase 1 (EU calibration → green)

| # | Was | Now | Source |
|---|-----|-----|--------|
| F1 | eco cap 7 g/km | **6 g/km** (year-versioned 7→6→4) | Reg (EU) 2023/851 |
| F2 | slope 0.0333 (MIRO) | **0.0144 test-mass**, TM0 1609.6 | Comm. Impl. Dec. (EU) 2023/1623 |
| F3 | ZLEV relax above 15% | **25% car / 17% van**, 2025–29 only | Reg (EU) 2023/851 |
| R1 | universal 95 g baseline | **93.6 g fleet target** + mass term | EC Cars & Vans; ICCT |
| R2 | ZLEV = 0 g only | **0–50 g/km** (`isZLEV`) | Reg (EU) 2023/851 |

### Resolved in Phase 2 (the correctness nuance → green)

| # | Was | Now | Source |
|---|-----|-----|--------|
| R3 | PHEV CO₂ static | **utility-factor correction** (~2× at 2026, further step 2028), year-versioned | Comm. Reg (EU) 2023/443 |
| R4 | annual compliance only | **2025–27 three-year averaging** (engine + Analyze card) | Reg (EU) 2025/1214 |

### Resolved in Phase 3 (UK → true unit mandate)

| # | Was | Now | Source |
|---|-----|-----|--------|
| R5 | UK as a CO₂ proxy line | **True ZEV unit mandate**: metric = non-ZE share %, limit = allowed non-ZE share (cars 22→80% ZEV 2024–30, vans 10→70%), fine = **£12,000 × missing ZEVs** (Apr 2025 statutory rate), <2,500-unit scope threshold, credits ≈£4k (observed CRTS trading) | DfT VETS Order 2023 · Apr 2025 flexibility package |
| R6 (partial) | UK £100/g placeholder | UK rates now statutory; **India ₹1,000/L·car remains illustrative** and is badged "illustrative rate" in-product | engine rule packs |

### Remaining reviews (Phase 3b)

| # | Gap | Why it matters | Source |
|---|-----|----------------|--------|
| R7 | **UK vans at the car fine rate; banking/borrowing & CO₂-conversion not modelled** | vans carry £15k vs cars' £12k; allowances bank **≤3 yrs**; borrowing runs **2024–29** (year caps 75% → 50→70% (2025 amendment) → 25%…, **3.5% compounding interest**, repay by **2030**); bank/borrow/convert/trade happens in the **1 Nov–31 Dec window** | DfT VETS Order 2023 · SI 2025/1101 · DfT *VETS: How to Comply* (Jun 2026) |
| R6 | **India fine/credit rates illustrative** | IN ₹1,000/L·car is a placeholder; AU A$100/g, EU €95/g, UK £12k/car are statutory | engine rule packs |

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
| **Mobility Global** — ex-S&P Global Mobility, NYSE: MBGL since 1 Jul 2026 (VPaC + Automotive Compliance Suite, powered by Novation Analytics' ENERGY™) | physics-based compliance engine: 12-yr CO₂/FE forecast, 60k powertrain combos; Compliance+ Rolling Short-term Forecast = monthly EU per-manufacturer/**pool** positions incl. excess-emission premiums (Tableau); Compliance Tech/Co$t = "force compliance" pathways + tech cost curves | deepest engine + registration data moat | **US/EU/China/Brazil only — India CAFE / AU NVES / UK VETS confirmed absent** (product pages, verified Jul 2026); no probabilistic output anywhere in portfolio; no pooling-partner optimiser found. NB: "AutoCreditInsight" is an unrelated US auto-lending product (TransUnion) — never cite it as the CO₂ competitor |
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

## 2b. Is "the line" the right concept? — benchmark & verdict

_Prompted by external feedback (Jul 2026) that "the line concept is old". Method: make the
claim falsifiable — per market, does a line abstraction reproduce the statute's numbers? —
rather than argue taste. Regulatory parameters below verified Jul 2026 (sources at foot)._

### Fidelity matrix — what each law actually assesses

| Market | How the law settles compliance | Class | Modelled today | Line-only error |
|--------|-------------------------------|-------|----------------|-----------------|
| **EU** (Reg 2019/631) | avg specific emissions vs mass-indexed target; premium €95/g × units. Flexibilities: pooling, ZLEV benchmark, eco cap, 2025–27 3-yr averaging | **Line + flexibilities** | pooling ✓ ZLEV ✓ eco ✓ 3-yr ✓ PHEV-UF ✓ | ≈ none — the line **is** the statute |
| **India** (CAFE II → draft III) | per-maker norm (L/100km); stepped EC-Act penalty; draft III adds super-credits + credit trading at a notified price | **Line + (draft) trading** | line ✓ super-credits ✓ trading price ✓ | ≈ none today; ledger arrives if CAFE III notifies banking |
| **UK** (VETS) | **statutory allowance ledger**: 1 allowance/ZEV; bank **≤3 yrs**; borrow **2024–29** (year caps, **3.5% compounding**, repay by 2030); trade/convert in the **Nov–Dec window**; £12k/car only on the *unsettled* shortfall | **Ledger around a line** | target line ✓ trading price ✓ · banking/borrowing/conversion ✗ (R7) | **Real** — a single-year fine overstates any maker that banks or borrows |
| **AU** (NVES) | target line (Type 1/2) generates **units**: credits bank **3 yrs**, tradeable; debits have **2 yrs** to clear; A$100/g civil (A$50/g on infringement notice) only if unsettled | **Ledger around a line** | target line ✓ trading price ✓ · multi-year carry ✗ | **Real** — a 2025 debit cleared by 2027 credits owes A$0; the line view books a fine in 2025 |

### Verdict

**The line is not old — it is the statute where it matters most.** The EU premium formula is
literally distance-from-the-line × €95 × units, India's CAFE the same shape, and every
incumbent with a product (Mobility Global Compliance+, Dataforce, ICCT — §2) presents
target-vs-average, i.e. a line. Even the ledger regimes *define their credits relative to
the line* — the line generates the units.

What **is** dated is a **single-year, line-only settlement view** in regimes with
intertemporal flexibilities. UK VETS and AU NVES settle across years (bank / borrow / carry /
trade). There, the honest architecture is two layers:

- **Verdict layer — the line** (keep): where you stand vs the law this year. Intuitive, statutory, chart-able.
- **Settlement layer — the ledger** (build for UK + AU; India when CAFE III notifies): credits earned / banked / borrowed / bought / expiring by vintage year, and the fine only on what stays unsettled. This is also whitespace #2's natural extension — banking/borrowing is what makes the credit optimiser real.

### The benchmark itself — three tests, run in order

1. **Law fidelity** (extends `npm run validate`): add ledger worked examples — UK: bank a
   2024 surplus, apply it in 2026; borrow at 3.5% compounding, repay by 2030 · AU: 2025
   debit cleared by 2027 credits ⇒ **A$0**. These fail by construction today — the failure
   count is the measured size of the critique, per market.
2. **Materiality**: on the bundled fleets, per-maker fine delta — line-only vs ledger-settled.
   The £ / A$ delta decides build-or-don't with a number, not an opinion.
3. **Presentation scan** (§2, verified Jul 2026): every incumbent that exists is line-based;
   UK/AU are unserved by anyone. Refresh quarterly.

_Sources: DfT **VETS: How to Comply** (Jun 2026) · VETS (Amendment) SI 2025/1101 ·
NVES Regulator, **How infringement notices and penalties are applied** · Pitcher Partners,
**Understanding NVES** (compliance mechanisms)._

---

## 3. Where Margin wins (the four whitespaces)

No incumbent is confirmed to productise these together:

1. **Probabilistic penalty exposure** — P10/P50/P90 €-at-risk, confidence bands on the gap. Universal gap in the market.
2. **Multi-party pooling/credit optimiser** — the gram-gap→€ bridge (ceiling = €95 × g over × registrations; floor ≈ 0 for pure-BEV sellers), surplus/deficit matching, discounted by the 2025–27 averaging flexibility. (Reference: Tesla EU pool ≈ €1.8bn FCA deal 2019–21; sector faced up to €15bn 2025 fines absent pooling.)
3. **True multi-region breadth** — EU + India CAFE + Australia NVES + UK ZEV as first-class packs with **correctly versioned PHEV utility factors**.
4. **Board-ready single-verdict output + AI analyst** narrating drivers and scenarios.

---

## 4. Roadmap (prioritised)

**✅ Phase 1 — EU provably accurate (DONE).**
F2 slope 0.0144 (test-mass, year-versioned) · F1 eco cap 6 g (year-versioned) · F3 ZLEV benchmark 25%/17% ·
R2 ZLEV = 0–50 g/km · R1 fleet target calibrated to 93.6 g + mass term.

**✅ Phase 2 — the hard correctness nuance (DONE).**
R3 PHEV utility-factor time-versioned (2025/26 + 2027/28 steps) · R4 2025–27 three-year averaging (engine + Analyze card).

**Phase 3 — differentiate (next).**
Probabilistic layer (Monte-Carlo on mix/price → €-at-risk distribution) · pooling optimiser with the gram-gap→€ bridge · UK as a proper ZEV unit-mandate (R5) · label illustrative rates (R6).

**Phase 4 — data & scale.**
License/ingest channel-split registration data (Dataforce-grade) into Neon; replace the 321-row sample.

Each phase re-runs `npm run validate`; a change is "done" only when its check is green.
