# India — "Scenario Planning Tool" workbook → platform mapping

> **2026-07-14 — MASTER FILE ERA.** India now sources **exclusively** from
> `SCENARIO PLANNING TOOL Master data.xlsx` (one sheet, the proven Data-Mode
> roll-up; 4 OEMs × 2025–26; 66 variants / 28 sales rows). Pipeline:
> `scripts/ingest-india-master.py` → `scripts/apply-india-extract.py` (FULL
> replace — the 2027–31 demo rows and the Ram-workbook catalog are deleted).
> Horizon 2027–31 = the 2026 actuals replicated against each year's statutory
> line (the platform's baseline-projection convention; Analyse badges them P;
> the Forecast outlook evolves them from fundamentals). Everything below this
> banner documents the original Ram-workbook analysis and mapping decisions,
> which the master pipeline inherits.

Maps `SCENARIO PLANNING TOOL UPDATE Ram.xlsx` onto the Underline data model
(`src/engine/types.ts` `Vehicle` + the `IN` rule pack). Extractor:
`scripts/ingest-india-scenario.py` → `.data/india_extract.json`, applied to the
committed bundle by `scripts/apply-india-extract.py`.

## 1. What the workbook is

Five sheets, two of them reference/vocabulary, three of them data:

| Sheet | Role | Maps to |
| --- | --- | --- |
| **Attibute** | attribute dictionary × 12 markets (which fields each market uses) | documentation only |
| **Attibute Classification** | controlled vocab (Segment, Powertrain, Fuel, Gearbox, Driveline, Body Style, Class, Cycle) | value-translation tables in the extractor |
| **DATA** | 649 real variant specs, 20 brands, MY2025–26. **No sales.** | `IN_catalog` — variant spec library |
| **VIJAY** | worked compliance example for 4 OEMs (MG, Renault, Nissan, Skoda) with a variant→model→brand→regulatory roll-up. Sales live at **model** level. | `IN_fleet` — the sales-carrying compliance fleet |
| **FLEET** | published AU (NVES) + EU (CO₂) registry benchmark rows | not India; comparative reference for the Pooling view |

### The VIJAY roll-up (column C = "Data Mode")

```text
Variant    → full spec, NO volume                            (leaf)
Model      → volume(U), avgCO2(AM), avgWeightedMass(AN)      ← sales enter here
Brand      → total volume(U)
Regulatory → P, CAFCS, Target T, ACAFC, credit/debit, YES/NO (AO–AT)
```

This is exactly the engine's aggregate ladder (`variant → model → parent → fleet`)
plus the compliance calc. The `Regulatory` columns AO–AT are one-to-one with the
engine's outputs.

## 2. Field mapping (DATA/VIJAY column → `Vehicle`)

| Workbook | `Vehicle` field | Transform |
| --- | --- | --- |
| Year (A) | `year` + `fyLabel` | `2025 → "FY 2025-26"` |
| Regultory Name (VIJAY E) | `parent` | legal entity, drives per-manufacturer CAFE |
| Brand (F) | `brand`, `make` | marque (MG, Skoda …) |
| Model (G) | `model` | |
| Variant / Variant Code (H/I) | `variant` / `variantId` | |
| Body Style (I/J) | `bodyStyle` | |
| Segment (J/K) | `segment` | A–F |
| Powertrain (K/L) | `powertrain` | vocab-mapped (see §3) |
| Engine Capacity L (L/M) | `engineCC` | ×1000, L→cc |
| Fuel Type (M/N) | `fuel` | Gasoline→Petrol, Electricity→Electric … |
| Engine Power kW (N) | `powerKW` | |
| Gear Box / Driveline (P·Q) | `gearbox` / `driveline` | |
| Battery kWh (R) | `battery` | |
| Kerb Weight (S/T) | `kerbMass`; `mass` for the fleet | CAFE limit basis |
| Vehicle Volume (VIJAY U, model rows) | `sales` | model-level |
| Fuel Consumption CO₂ (U/V) | `co2` | tailpipe g/km; 0 for BEV/REEV/FCEV |
| Avg CO₂ / Avg weighted mass (AM/AN) | `co2` / `mass` (fleet) | model roll-up |
| Foot Print m² (X/Z) | `footprint` | |
| Vehicle Classification (AA) | `vclass` | M1 → "Passenger car" |
| Drive Cycle (AD/AI) | `driveCycle` | ARAI→MIDC (see §4) |
| E-Range (AB) · Reference/Test Mass (AE/AF) · L·W·H (AJ–AL) | `range` / `testMass` / dims | available in VIJAY, not yet consumed |

## 3. Compliance parity with the `IN` rule pack

The rule pack already implements the same BEE CAFE math the workbook is structured around:

- **Target** `T`: `0.002 × (mass − ref) + d`; CAFE II (`<FY2027-28`, ref 1145, d 4.765)
  → CAFE III (ref 1170, d tightening 3.7264→3.0139). Workbook MY2025–26 rows are
  **CAFE II years**.
- **Performance→FC**: `CO₂ / 23.7135` (= AP/AR "CAFCS/ACAFC" in the workbook).
- **Super-credits** (BEV ×3, REEV ×3, PHEV ×2.5, strong hybrid ×2), CNF discounts,
  and the credit/debit column — all present in the pack.

No engine change was needed to compute these rows; the extract feeds straight in.

## 4. Data & logic issues found — and how the extractor handles them

| Issue | Where | Fix in extractor |
| --- | --- | --- |
| `ICE CNG` used as a powertrain | DATA, 15 Tata rows | normalised → `ICE` (fuel already `CNG`) |
| MG **ZS EV 2025** has sales but blank avg mass/CO₂ | VIJAY | mass back-filled from variant kerb weights (1547 kg); CO₂=0 (BEV) |
| Model rows with **0 / blank sales** (Hector Plus '26, M9 '26, X-Trail '26) | VIJAY | dropped from `IN_fleet` (kept in catalog) — cannot affect a weighted average |
| `driveCycle = "ARAI"` (agency, not a cycle) | DATA, 6 rows | normalised → `MIDC` |
| Numeric cells in text fields (Nexon.ev variant "45") | DATA | coerced to strings |
| **95 / 649** variants missing tailpipe CO₂ (and fuel economy) | DATA source gap | back-filled as **flagged estimates** — see below |
| **Regulatory rows P/T are illustrative, not computed** | VIJAY AO–AT | see below — the key logical finding |

### CO₂ back-fill methodology (the 95 estimates)

The affected rows (Mahindra/Tata/Toyota SUV "variant group" rows) all carry kerb
mass. Estimates are tiered: (1) mean CO₂ of same-model+fuel siblings, mass-adjusted
by the per-fuel slope; (2) same brand+segment+fuel siblings, mass-adjusted;
(3) per-fuel linear fit `CO₂ = a·kerb + b` over all complete ICE-family rows
(petrol r²=0.72, diesel r²=0.65 on 321/85 rows). The complete rows show
`CO₂ × km/l` is constant per fuel to ~1% cv, validating the physics. Every
estimated record carries `co2Estimated: true`. All 95 estimates land inside the
sane 60–400 g/km band (Scorpio-N diesel ≈160, Thar ≈145).

### The regulatory-row logical error (important)

The workbook's `Regulatory` P (corporate-average CO₂) **excludes EV volumes**:

- Renault '26 (no EVs): workbook P 122.0 ≈ engine P 120.2 ✓
- **MG '25**: workbook P **150.3** vs engine P **23.1** — MG's ~57k EV units
  (Windsor/ZS/Comet) are omitted in the worked example. Under CAFE the corporate
  average must include EVs at 0 g/km (before super-credits), so **150.3 is wrong**.

Treat the workbook's AO–AT numbers as an illustrative template of the *columns*,
not as correct results. The platform engine computes them correctly; the extract
carries them only under `IN_regulatory_reference` for traceability.

## 5. Integration — DONE

Applied and verified end-to-end (48/48 engine checks in `scripts/verify-india.ts`):

1. **`IN` rule pack** now `years: [2025…2031]` with `defaultYear: 2027` — the
   CAFE II actuals are in the year strip; the workspace still opens on the CAFE III
   headline year. (`defaultYear` added to `RulePack`; `defaultScenario` honours it.)
2. **Merged fleet** — real MY2025–26 rows (MG/Renault/Nissan/Skoda) sit beside the
   2027–31 CAFE III demo (Maruti/Tata/Mahindra) in `src/data/fleet_data.{json,ts}`.
   88 IN rows. EU/AU/UK untouched.
3. **`IN_catalog`** → `src/data/india_catalog.ts` (649 specs, 174 models, CO₂
   100% populated incl. flagged estimates); the "Build a variant" picker prefills
   powertrain/CO₂/mass from a real model (IN only).
4. **`Vehicle`** gained `segment`, `bodyStyle`, `driveCycle`, `powerKW`,
   `co2Estimated`; the Data screen pivots by Segment / Body style where present.

Pipeline (idempotent):

```bash
python3 scripts/ingest-india-scenario.py   # workbook → .data/india_extract.json
python3 scripts/apply-india-extract.py     # → committed src/data/
```

## 6. Still open (source-data, not code)

- Complete VIJAY sales for the remaining **16 brands** to go from a 4-OEM worked
  example to a full-market fleet — the **Import Studio** on the Data screen is the
  intended path (OEM actuals / S&P Global Mobility / JATO imports merge by
  maker-year).
- Replace the 95 `co2Estimated` values with homologated figures when the source
  workbook is completed.
