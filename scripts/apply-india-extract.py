#!/usr/bin/env python3
# ───────────────────────────────────────────────────────────────────────────
# Apply the India extract to the bundled fleet data — FULL REPLACE.
# Per direction (2026-07-14): India carries ONLY the master-file data. The old
# 2027–31 demo rows (Maruti/Tata/Mahindra dummies) and the Ram-workbook
# catalog are gone.
#
#   1. IN actual years  = the extract's fleet rows as-is (2025, 2026)
#   2. IN horizon years = the LATEST actual year's rows replicated per CAFE III
#      year (2027–31) — the platform convention (EU does the same): the as-sold
#      fleet held against each year's tightening statutory line. Analyse badges
#      these years "P" (projection); the Forecast outlook evolves them properly.
#   3. rewrite src/data/fleet_data.{json,ts} (EU/AU/UK untouched)
#   4. rewrite src/data/india_catalog.ts from the master's variant library
#
# Run:  python3 scripts/ingest-india-master.py && python3 scripts/apply-india-extract.py
# ───────────────────────────────────────────────────────────────────────────
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
EXTRACT = os.path.join(ROOT, ".data", "india_extract.json")
FLEET_JSON = os.path.join(ROOT, "src", "data", "fleet_data.json")
FLEET_TS = os.path.join(ROOT, "src", "data", "fleet_data.ts")
CATALOG_TS = os.path.join(ROOT, "src", "data", "india_catalog.ts")

# The IN rule pack horizon (src/engine/rulepacks/india.ts): 2025–2031.
HORIZON = [2027, 2028, 2029, 2030, 2031]
FY = lambda y: f"FY {y}-{(y + 1) % 100:02d}"

TS_HEADER = (
    "// AUTO-GENERATED from fleet_data.json — do not edit by hand.\n"
    "// Bundled as a TS module so serverless functions (Vercel Node ESM runtime)\n"
    "// load the data without JSON import-attribute issues.\n"
    "/* eslint-disable */\n"
)


def main():
    extract = json.load(open(EXTRACT))
    fleet = json.load(open(FLEET_JSON))

    actual = extract["IN_fleet"]
    latest = max(v["year"] for v in actual)
    base = [v for v in actual if v["year"] == latest]
    projected = []
    for y in HORIZON:
        for v in base:
            # tagged so every surface (Data table, exports) can tell projection
            # from record — Analyse additionally badges these years "P".
            projected.append({**v, "year": y, "fyLabel": FY(y), "scenario": "Baseline projection"})
    fleet["IN"] = actual + projected  # FULL replace — nothing of the old IN survives

    with open(FLEET_JSON, "w") as f:
        json.dump(fleet, f, separators=(", ", ": "))
    with open(FLEET_TS, "w") as f:
        f.write(TS_HEADER)
        f.write("const data: Record<string, any[]> = " + json.dumps(fleet, separators=(", ", ": ")) + "\n")
        f.write("export default data\n")

    catalog = extract["IN_catalog"]
    with open(CATALOG_TS, "w") as f:
        f.write("// AUTO-GENERATED from the India MASTER workbook — do not edit by hand.\n")
        f.write("// The variant spec library (no sales): powers the 'Build a variant'\n")
        f.write("// picker with real India models. See scripts/ingest-india-master.py.\n")
        f.write("/* eslint-disable */\n")
        f.write("import type { Vehicle } from '../engine/types'\n\n")
        f.write("export const INDIA_CATALOG: Partial<Vehicle>[] = " + json.dumps(catalog, separators=(", ", ": ")) + "\n\n")
        f.write(
            "/** Latest spec per model (most recent year), keyed by lower-cased model name. */\n"
            "export const INDIA_CATALOG_BY_MODEL: Record<string, Partial<Vehicle>> = (() => {\n"
            "  const m: Record<string, Partial<Vehicle>> = {}\n"
            "  for (const v of INDIA_CATALOG) {\n"
            "    const k = (v.model ?? '').toLowerCase()\n"
            "    if (!k) continue\n"
            "    const prev = m[k]\n"
            "    if (!prev || (v.year ?? 0) >= (prev.year ?? 0)) m[k] = v\n"
            "  }\n"
            "  return m\n"
            "})()\n\n"
            "export const INDIA_MODELS: string[] = [...new Set(INDIA_CATALOG.map((v) => v.model!).filter(Boolean))].sort()\n"
        )

    yrs = {}
    for v in fleet["IN"]:
        yrs.setdefault(v["year"], set()).add(v["parent"])
    print("→ IN fully replaced:", len(fleet["IN"]), "rows (actuals", sorted({v['year'] for v in actual}), "+ horizon", HORIZON, "replicated from", latest, ")")
    for y in sorted(yrs):
        print(f"   {y}: {len(yrs[y])} makers, {sum(1 for v in fleet['IN'] if v['year']==y)} rows")
    print("→ wrote", os.path.relpath(FLEET_JSON, ROOT), "+", os.path.relpath(FLEET_TS, ROOT))
    print("→ wrote", os.path.relpath(CATALOG_TS, ROOT), f"({len(catalog)} variant specs, {len(set(v['model'] for v in catalog))} models)")


if __name__ == "__main__":
    main()
