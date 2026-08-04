#!/usr/bin/env python3
# ───────────────────────────────────────────────────────────────────────────
# Apply the India extract to the bundled fleet data — FULL REPLACE.
# Per direction (2026-08-05): India carries ONLY DEMO DATA_SHARED.xlsx. Every
# earlier India source is gone — the 12-OEM / 4.79M-unit extract, the
# Maruti/Tata/Mahindra rows, the master-data file and the Ram workbook.
#
#   1. IN rows = the extract's fleet rows AS-IS, 2025–2032.
#      No horizon replication any more: the old convention held the latest
#      actual year against each future statutory line because the source had
#      no forward view. DEMO DATA_SHARED carries the OEMs' own per-year plan
#      for 2027–2032 (real, differing volumes and mix), so replicating would
#      overwrite genuine data with a copy of 2026. The ingest already tags
#      those years 'Baseline projection' so Data's Basis column still tells
#      plan from record.
#   2. rewrite src/data/fleet_data.{json,ts} (EU/AU/UK/CN untouched)
#   3. rewrite src/data/india_catalog.ts from the workbook's variant library
#
# Run:  python3 scripts/ingest-india-demo.py && python3 scripts/apply-india-extract.py
# ───────────────────────────────────────────────────────────────────────────
import json, os
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
EXTRACT = os.path.join(ROOT, ".data", "india_extract.json")
FLEET_JSON = os.path.join(ROOT, "src", "data", "fleet_data.json")
FLEET_TS = os.path.join(ROOT, "src", "data", "fleet_data.ts")
CATALOG_TS = os.path.join(ROOT, "src", "data", "india_catalog.ts")

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

    rows = extract["IN_fleet"]
    fleet["IN"] = rows  # FULL replace — nothing of the old IN survives

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

    meta = extract.get("meta", {})
    print(f"→ IN fully replaced from {meta.get('source', '?')}: {len(fleet['IN'])} rows, read as given (no horizon replication)")
    units = defaultdict(int)
    makers = defaultdict(set)
    for v in fleet["IN"]:
        units[v["year"]] += v["sales"]
        makers[v["year"]].add(v["parent"])
    for y in sorted(makers):
        n = sum(1 for v in fleet["IN"] if v["year"] == y)
        part = next((v.get("monthsRecorded") for v in fleet["IN"] if v["year"] == y and v.get("monthsRecorded")), None)
        tag = f"  · part-year, {part}/12 months recorded" if part else ""
        basis = "record" if all(v.get("scenario") == "Base" for v in fleet["IN"] if v["year"] == y) else "plan"
        print(f"   {y} {FY(y)}: {len(makers[y])} makers, {n:3d} rows, {units[y]:9,d} units  ({basis}){tag}")
    other = {k: len(v) for k, v in fleet.items() if k != "IN"}
    print(f"   other markets untouched: {other}")
    print("→ wrote", os.path.relpath(FLEET_JSON, ROOT), "+", os.path.relpath(FLEET_TS, ROOT))
    print("→ wrote", os.path.relpath(CATALOG_TS, ROOT), f"({len(catalog)} variant specs, {len(set(v['model'] for v in catalog))} models)")


if __name__ == "__main__":
    main()
