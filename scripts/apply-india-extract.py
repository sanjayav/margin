#!/usr/bin/env python3
# ───────────────────────────────────────────────────────────────────────────
# Apply the India extract to the bundled fleet data.
#   1. new IN = real MY2025–26 rows (IN_fleet)  +  existing IN 2027–31 demo rows
#   2. rewrite  src/data/fleet_data.json
#   3. regenerate src/data/fleet_data.ts  (same auto-generated header)
#   4. write    src/data/india_catalog.ts  (649 variant specs + a lookup)
#
# Idempotent: strips any previously-applied 2025–26 IN rows before re-adding.
# Run:  python3 scripts/ingest-india-scenario.py && python3 scripts/apply-india-extract.py
# ───────────────────────────────────────────────────────────────────────────
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
EXTRACT = os.path.join(ROOT, ".data", "india_extract.json")
FLEET_JSON = os.path.join(ROOT, "src", "data", "fleet_data.json")
FLEET_TS = os.path.join(ROOT, "src", "data", "fleet_data.ts")
CATALOG_TS = os.path.join(ROOT, "src", "data", "india_catalog.ts")

TS_HEADER = (
    "// AUTO-GENERATED from fleet_data.json — do not edit by hand.\n"
    "// Bundled as a TS module so serverless functions (Vercel Node ESM runtime)\n"
    "// load the data without JSON import-attribute issues.\n"
    "/* eslint-disable */\n"
)


def main():
    extract = json.load(open(EXTRACT))
    fleet = json.load(open(FLEET_JSON))

    in_new = extract["IN_fleet"]          # 2025–26 real
    baseline_years = {v["year"] for v in in_new}
    # keep every existing IN row NOT in the baseline years (the 2027–31 demo),
    # so re-running never duplicates the actuals.
    in_keep = [v for v in fleet.get("IN", []) if v.get("year") not in baseline_years]
    fleet["IN"] = in_new + in_keep

    with open(FLEET_JSON, "w") as f:
        json.dump(fleet, f, separators=(", ", ": "))

    with open(FLEET_TS, "w") as f:
        f.write(TS_HEADER)
        f.write("const data: Record<string, any[]> = " + json.dumps(fleet, separators=(", ", ": ")) + "\n")
        f.write("export default data\n")

    catalog = extract["IN_catalog"]
    with open(CATALOG_TS, "w") as f:
        f.write("// AUTO-GENERATED from the India scenario workbook — do not edit by hand.\n")
        f.write("// The full variant spec library (no sales): powers the 'Build a variant'\n")
        f.write("// picker with real India models. See scripts/ingest-india-scenario.py.\n")
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

    # report
    yrs = {}
    for v in fleet["IN"]:
        yrs.setdefault(v["year"], set()).add(v["parent"])
    print("→ merged IN fleet:", len(fleet["IN"]), "rows")
    for y in sorted(yrs):
        print(f"   {y}: {len(yrs[y])} makers, {sum(1 for v in fleet['IN'] if v['year']==y)} rows")
    print("→ wrote", os.path.relpath(FLEET_JSON, ROOT), "+", os.path.relpath(FLEET_TS, ROOT))
    print("→ wrote", os.path.relpath(CATALOG_TS, ROOT), f"({len(catalog)} variant specs, {len(set(v['model'] for v in catalog))} models)")


if __name__ == "__main__":
    main()
