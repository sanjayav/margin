#!/usr/bin/env python3
# ───────────────────────────────────────────────────────────────────────────
# India extract — "DEMO DATA_SHARED.xlsx" → platform schema.
# THE India pipeline as of 2026-08-05: this workbook fully replaces every
# earlier India source (the Ram scenario workbook, the 'master data' file and
# the 27-Jul update). Nothing of the old 12-OEM / 4.79M-unit extract survives.
#
# One sheet ('Plan'), header on row 3, data from row 4. Column C = Data Mode:
#   Variant     → full spec, planning volume in AU   → IN_catalog (spec library)
#   Model       → the SALES row: volume AV, and for 2025–26 the pre-computed
#                 avg CO₂ (AG) / avg kerb mass (AH)  → IN_fleet
#   Brand       → parent total AW + fuel mix AX..BB  → reconciliation check
#   Group /
#   Regulatory  → present but EMPTY in this workbook (BC..BH are all blank),
#                 so compliance is engine-computed, not read from the sheet.
#
# Two properties of this workbook drive the design:
#   • 2025 is a complete 12-month actual; 2026 is a 3-month YTD part-year
#     (M1..M3 only). Both are ingested verbatim and 2026 is tagged
#     monthsRecorded=3 so the UI can badge it — a sales-weighted average is
#     volume-invariant, so compliance is unaffected; only absolute volume and
#     fine exposure are understated, and now visibly so.
#   • 2027–2032 are the workbook's own forward plan, with real per-year model
#     volumes. They are NOT replicated from a base year (the old convention) —
#     they are read as given and tagged 'Baseline projection' so the Data
#     screen's Basis column still tells plan from record.
#
# Model rows for 2027+ carry no AG/AH, so CO₂ and mass are derived from that
# model's variant specs. This reproduces the workbook's OWN convention: where
# AG/AH do exist (2025–26), AG == the mean CO₂ of the model's same-year
# variants and AH == their mean kerb weight (verified 57/60 rows on kerb).
#
# Run:  python3 scripts/ingest-india-demo.py ["path/to/DEMO DATA_SHARED.xlsx"]
# Out:  .data/india_extract.json  (consumed by apply-india-extract.py)
# ───────────────────────────────────────────────────────────────────────────
import json, sys, os, re, zipfile
from collections import defaultdict, Counter
from xml.etree import ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DEFAULT_XLSX = os.path.normpath(os.path.join(ROOT, "..", "DEMO DATA_SHARED.xlsx"))
# the full-market second source (12 OEMs incl. Maruti Suzuki) — see parse_vijay
VIJAY_XLSX = os.path.normpath(os.path.join(ROOT, "..", "update dat india 27 july.xlsx"))
OUT = os.path.join(ROOT, ".data", "india_extract.json")
SHEET = "Plan"

# ── value vocabulary → what the India rule pack expects ──────────────────────
# Super-credit keys in src/engine/rulepacks/india.ts: BEV, 'Range-Extender
# Hybrid', PHEV, 'Strong Hybrid Flex Fuel', 'Strong Hybrid', 'Flex Fuel Ethanol'.
POWERTRAIN = {
    "ICE": "ICE", "ICE SS": "ICE",     # start-stop is still a conventional ICE
    "ICE CNG": "ICE",                   # fuel column already carries CNG
    "MHEV": "MHEV",                     # mild hybrid — no CAFE III super-credit
    "HEV": "Strong Hybrid",            # full/strong hybrid — ×2
    "PHEV": "PHEV",                     # ×2.5
    "REEV": "Range-Extender Hybrid",   # ×3
    "BEV": "BEV",                       # ×3, zero tailpipe
    "FCEV": "BEV",                      # fuel-cell → zero tailpipe, treat as ZE
}
FUEL = {
    "Gasoline": "Petrol", "Diesel": "Diesel", "CNG": "CNG",
    "Electricity": "Electric", "Hydrogen": "Hydrogen", "LPG": "LPG",
}
# 'ARAI' is the homologation agency, not a cycle — the Indian cycle it runs is
# MIDC. Normalise so driveCycle stays a valid cycle vocabulary.
DRIVECYCLE = {"ARAI": "MIDC", "MIDC": "MIDC", "NEDC": "NEDC", "WLTC": "WLTC"}
ZE_PT = {"BEV", "Range-Extender Hybrid"}
FY = lambda y: f"FY {y}-{(y + 1) % 100:02d}"
MONTH_COLS = ["AI", "AJ", "AK", "AL", "AM", "AN", "AO", "AP", "AQ", "AR", "AS", "AT"]
# Years the workbook records as history; everything later is its forward plan.
ACTUAL_YEARS = {2025, 2026}

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


def read_sheet(xlsx, sheet_name, header_from=4):
    """Minimal zero-dependency .xlsx reader — returns [{col_letter: value}].
    `header_from` is the first DATA row (1-based); rows above it are headers."""
    z = zipfile.ZipFile(xlsx)
    shared = []
    try:
        root = ET.fromstring(z.read("xl/sharedStrings.xml"))
        for si in root.iter(NS + "si"):
            shared.append("".join(t.text or "" for t in si.iter(NS + "t")))
    except KeyError:
        pass
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    RNS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
    target = None
    for sh in wb.iter(NS + "sheet"):
        if sh.get("name") == sheet_name:
            rid = sh.get(RNS + "id")
            for rel in rels:
                if rel.get("Id") == rid:
                    target = rel.get("Target")
    if not target:
        sys.exit(f"sheet {sheet_name!r} not found in {xlsx}")
    path = target if target.startswith("xl/") else "xl/" + target.lstrip("/")
    ws = ET.fromstring(z.read(path))
    out = {}
    for row in ws.iter(NS + "row"):
        cells = {}
        for c in row.iter(NS + "c"):
            col = re.match(r"([A-Z]+)", c.get("r")).group(1)
            t, v = c.get("t"), c.find(NS + "v")
            if t == "inlineStr":
                node = c.find(NS + "is")
                val = "".join(x.text or "" for x in node.iter(NS + "t")) if node is not None else ""
            elif v is None:
                val = ""
            elif t == "s":
                val = shared[int(v.text)]
            else:
                val = v.text
            if val != "" and val is not None:
                cells[col] = val
        out[int(row.get("r"))] = cells
    return [out[i] for i in sorted(out) if i >= header_from and out[i]]


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def txt(v):
    s = str(v).strip() if v is not None else None
    return s or None


def mean(xs):
    xs = [x for x in xs if x is not None]
    return sum(xs) / len(xs) if xs else None


def wmean(pairs):
    """Sales-weighted mean. Weights need only be internally consistent within
    the model — the absolute scale cancels — so the variant AU volumes are a
    valid weighting even though they do not reconcile to the model total."""
    pairs = [(x, w) for x, w in pairs if x is not None and w]
    tw = sum(w for _, w in pairs)
    return sum(x * w for x, w in pairs) / tw if tw else None


def spec_stats(specs):
    """Sales-weight the model's variant specs when EVERY variant carries a
    planning volume, else fall back to the simple mean the workbook itself
    uses in AG/AH."""
    co2s = [num(s.get("Y")) for s in specs]
    kerbs = [num(s.get("T")) for s in specs]
    vols = [num(s.get("AU")) for s in specs]
    if specs and all(v for v in vols):
        return wmean(zip(co2s, vols)), wmean(zip(kerbs, vols)), "variant (sales-weighted)"
    return mean(co2s), mean(kerbs), "variant (mean)"


# ── mutually-exclusive powertrain launches ───────────────────────────────────
# For 5 models the workbook lists EACH powertrain family at the FULL model
# volume — MG's "Astor / ZS EV Successor" 2027 shows ICE 38,800, MHEV 38,800
# AND BEV 38,800 against a model total of 38,800. Those are alternative launch
# decisions ("do we bring it as petrol, mild-hybrid or electric?"), not an
# additive mix: the families do not sum to the model's volume.
#
# Blending them would hand the model a CO₂ no real launch produces (92.5 g/km
# for MG, versus 152.6 / 125.0 / 0 for the three actual options). So the fleet
# row takes the CONSERVATIVE family — the highest-CO₂ option — because a
# compliance plan must not book clean-tech credit for a product decision the
# maker has not committed to, and being wrong in that direction is safe. The
# alternatives ride along in `powertrainOptions` so the Scenario module can
# switch between them (see scenario.powertrainOptionMode).
def powertrain_options(specs, model_volume):
    """→ (options, is_ambiguous). Options are per-powertrain-family roll-ups."""
    fams = defaultdict(list)
    for s in specs:
        pt = POWERTRAIN.get(txt(s.get("K")), txt(s.get("K")))
        if pt:
            fams[pt].append(s)
    vols = [num(s.get("AU")) for s in specs]
    if len(fams) < 2 or not specs or not all(v for v in vols) or not model_volume:
        return None, False
    total = sum(vols)
    # An additive split sums to the model's own volume; anything else means the
    # families are parallel alternatives rather than shares of one line-up.
    if abs(total - model_volume) <= 1:
        return None, False
    opts = []
    for pt, ss in fams.items():
        c, m, _ = spec_stats(ss)
        bat = mean([num(s.get("O")) for s in ss if num(s.get("O"))])
        fuels = [FUEL.get(txt(s.get("Q")), txt(s.get("Q"))) for s in ss if s.get("Q")]
        is_ze = pt in ZE_PT
        rec = {
            "powertrain": pt,
            "fuel": "Electric" if is_ze else (Counter(fuels).most_common(1)[0][0] if fuels else "Petrol"),
            "co2": 0.0 if is_ze else round(c, 2),
            "mass": round(m, 1) if m is not None else None,
            "share": round(sum(num(s.get("AU")) for s in ss) / total, 4),
        }
        if bat:
            rec["battery"] = bat
        opts.append({k: v for k, v in rec.items() if v is not None})
    opts.sort(key=lambda o: -o["co2"])          # conservative (highest CO₂) first
    return opts, True



# ── SECOND SOURCE: the full-market workbook ─────────────────────────────────
# DEMO DATA_SHARED covers 5 compliance entities. "update dat india 27 july.xlsx"
# (sheet VIJAY) covers 12 — the whole Indian PV market, ~4.79M units in
# FY2025-26 — including Maruti Suzuki, Hyundai, Tata, Mahindra, Kia, Renault,
# Nissan and FCA. It carries the same Data-Mode roll-up and, importantly, the
# same monthly split (AV..BG = M1..M12, BH = the annual total).
#
# It is a MESSIER file than the primary, so it is repaired against its own
# control totals before anything is merged (see repair_year_stamps).
#
# Its column layout differs from the primary — mapped here once:
VJ = {
    "year": "A", "market": "B", "mode": "C", "scenario": "D", "parent": "E",
    "brand": "F", "model": "G", "variant": "H", "variantId": "I",
    "bodyStyle": "J", "segment": "K", "powertrain": "L", "engineL": "M",
    "fuel": "N", "powerKW": "O", "ftCode": "P", "gearbox": "Q", "driveline": "R",
    "battery": "S", "kerb": "T", "co2": "V", "kmpl": "W", "mpg": "X",
    "l100": "Y", "footprint": "Z", "energy": "AA", "range": "AB",
    "refMass": "AE", "testMass": "AF", "vclass": "AH", "cycle": "AI",
    "avgCo2": "AM", "avgMass": "AN", "volume": "BH",
}
VJ_MONTHS = ["AV", "AW", "AX", "AY", "AZ", "BA", "BB", "BC", "BD", "BE", "BF", "BG"]
# BMW carries no volume in any year — an empty entity, not a compliance parent.
VJ_SKIP = {"BMW India Pvt. Lt"}


def repair_year_stamps(models, brands, log):
    """The July workbook stamps a few Model rows with the wrong fiscal year.

    Evidence, not guesswork: each case shows up as a parent whose model rows do
    not sum to its own Brand row, by EXACTLY the volume of one duplicated
    (parent, model, year) row — and the offsetting error appears in the
    adjacent year. Maruti's e VITARA is the clearest: 3,652 units sitting in
    fiscal months 10-12 (Jan-Mar, the tail of FY2025-26) but stamped 2026,
    leaving 2025 short by exactly 3,652 and 2026 over by exactly 3,652.

    So: for every parent-year that fails to reconcile, look for a duplicate row
    whose volume equals the discrepancy and whose move to the adjacent year
    fixes BOTH years. Move it. Anything that cannot be resolved this way is
    reported and left alone — never silently adjusted.
    """
    want = defaultdict(float)
    for b in brands:
        want[(txt(b.get(VJ["parent"])), int(num(b.get(VJ["year"])) or 0))] += num(b.get(VJ["volume"])) or 0

    def got():
        g = defaultdict(float)
        for d in models:
            g[(txt(d.get(VJ["parent"])), int(num(d.get(VJ["year"])) or 0))] += num(d.get(VJ["volume"])) or 0
        return g

    for _ in range(8):  # a few passes; each move can only help
        g = got()
        off = {k: g.get(k, 0) - v for k, v in want.items() if abs(g.get(k, 0) - v) > 0.5}
        if not off:
            break
        moved = False
        for (parent, year), delta in sorted(off.items()):
            if delta <= 0:
                continue  # this year has too MUCH; find the row to move out
            dup = Counter((txt(d.get(VJ["parent"])), txt(d.get(VJ["model"])), int(num(d.get(VJ["year"])) or 0))
                          for d in models)
            for d in models:
                key = (txt(d.get(VJ["parent"])), txt(d.get(VJ["model"])), int(num(d.get(VJ["year"])) or 0))
                if key != (parent, txt(d.get(VJ["model"])), year) or dup[key] < 2:
                    continue
                vol = num(d.get(VJ["volume"])) or 0
                if abs(vol - delta) > 0.5:
                    continue
                for other in (year - 1, year + 1):
                    if off.get((parent, other), 0) <= -delta + 0.5 and off.get((parent, other), 0) >= -delta - 0.5:
                        filled = [i for i, c in enumerate(VJ_MONTHS, 1) if num(d.get(c))]
                        d[VJ["year"]] = str(other)
                        log.append(f"{parent[:26]} · {txt(d.get(VJ['model']))}: {int(vol):,} units re-stamped "
                                   f"{year} → {other} (units sit in fiscal months {filled}; both years then reconcile)")
                        moved = True
                        break
                if moved:
                    break
            if moved:
                break
        if not moved:
            break
    return {k: v for k, v in ((k, got().get(k, 0) - v) for k, v in want.items()) if abs(v) > 0.5}


def parse_vijay(xlsx):
    """→ (fleet rows, catalog rows, report). Model rows carry the sales."""
    rows = read_sheet(xlsx, "VIJAY ", header_from=4)
    models = [d for d in rows if d.get(VJ["mode"]) == "Model" and txt(d.get(VJ["parent"])) not in VJ_SKIP]
    brands = [d for d in rows if d.get(VJ["mode"]) == "Brand" and txt(d.get(VJ["parent"])) not in VJ_SKIP]
    variants = defaultdict(list)
    for d in rows:
        if d.get(VJ["mode"]) == "Variant" and txt(d.get(VJ["parent"])) not in VJ_SKIP:
            variants[(txt(d.get(VJ["parent"])), txt(d.get(VJ["model"])), int(num(d.get(VJ["year"])) or 0))].append(d)

    repairs = []
    residual = repair_year_stamps(models, brands, repairs)

    # after repair, how far into each year the market has actually filed
    coverage = {}
    for d in models:
        y = int(num(d.get(VJ["year"])) or 0)
        filled = [i for i, c in enumerate(VJ_MONTHS, 1) if num(d.get(c))]
        if filled:
            coverage[y] = max(coverage.get(y, 0), max(filled))
    # A stray month beyond the market's filing window is a source artefact (Kia
    # books 2 units in Oct-Nov of a year filed only to June). Fold it into the
    # last filed month so the annual total is preserved exactly and the monthly
    # frame stays coherent — never dropped.
    folded = []

    fleet, catalog = [], []
    dropped = []
    for d in models:
        parent = txt(d.get(VJ["parent"]))
        model = txt(d.get(VJ["model"]))
        year = int(num(d.get(VJ["year"])) or 0)
        vol = num(d.get(VJ["volume"])) or 0
        if vol <= 0 or not parent or not model:
            dropped.append(f"{year} {(parent or '?')[:24]} · {model or '(no model)'}")
            continue
        specs = variants.get((parent, model, year)) or variants.get((parent, model, year + 1)) or []
        pts = [POWERTRAIN.get(txt(s.get(VJ["powertrain"])), txt(s.get(VJ["powertrain"]))) for s in specs if s.get(VJ["powertrain"])]
        modal_pt = Counter(pts).most_common(1)[0][0] if pts else "ICE"
        fuels = [FUEL.get(txt(s.get(VJ["fuel"])), txt(s.get(VJ["fuel"]))) for s in specs if s.get(VJ["fuel"])]
        modal_fuel = Counter(fuels).most_common(1)[0][0] if fuels else "Petrol"
        avg_co2 = num(d.get(VJ["avgCo2"]))
        avg_mass = num(d.get(VJ["avgMass"]))
        if avg_co2 is None:
            avg_co2 = mean([num(s.get(VJ["co2"])) for s in specs])
        if avg_mass is None:
            avg_mass = mean([num(s.get(VJ["kerb"])) for s in specs])
        is_ze = (avg_co2 == 0) or modal_pt in ZE_PT

        cov = coverage.get(year, 0)
        monthly = None
        if cov:
            raw_m = [int(num(d.get(c)) or 0) for c in VJ_MONTHS]
            head, tail = raw_m[:cov], raw_m[cov:]
            if sum(tail):
                head[-1] += sum(tail)
                folded.append(f"{year} {parent[:22]} · {model}: {sum(tail):,} units filed beyond month {cov} folded into it")
            if sum(head):
                monthly = head

        rec = {
            "parent": parent, "pool": parent,
            "brand": txt(d.get(VJ["brand"])), "make": txt(d.get(VJ["brand"])),
            "model": model, "year": year, "fyLabel": FY(year),
            "powertrain": modal_pt,
            "fuel": "Electric" if is_ze else modal_fuel,
            "co2": 0.0 if is_ze else round(avg_co2, 2) if avg_co2 is not None else 0.0,
            "mass": round(avg_mass, 1) if avg_mass is not None else None,
            "sales": int(vol),
            "bodyStyle": next((txt(s.get(VJ["bodyStyle"])) for s in specs if s.get(VJ["bodyStyle"])), None),
            "segment": next((txt(s.get(VJ["segment"])) for s in specs if s.get(VJ["segment"])), None),
            "footprint": next((num(s.get(VJ["footprint"])) for s in specs if num(s.get(VJ["footprint"]))), None),
            "driveCycle": next((DRIVECYCLE.get(txt(s.get(VJ["cycle"])), txt(s.get(VJ["cycle"]))) for s in specs if s.get(VJ["cycle"])), None),
            "battery": mean([num(s.get(VJ["battery"])) for s in specs
                             if num(s.get(VJ["battery"])) and POWERTRAIN.get(txt(s.get(VJ["powertrain"])), txt(s.get(VJ["powertrain"]))) == modal_pt]),
            "cnf": 0,
            "vclass": "Passenger car",
            "scenario": "Base",
            "source": "update dat india 27 july.xlsx",
        }
        if monthly:
            rec["monthly"] = monthly
            if 0 < len(monthly) < 12:
                rec["monthsRecorded"] = len(monthly)
        fleet.append({k: v for k, v in rec.items() if v is not None})

    for (parent, model, year), specs in variants.items():
        for d in specs:
            pt = POWERTRAIN.get(txt(d.get(VJ["powertrain"])), txt(d.get(VJ["powertrain"])) or "ICE")
            is_ze = pt in ZE_PT
            rec = {
                "market": txt(d.get(VJ["market"])) or "IN", "parent": parent,
                "brand": txt(d.get(VJ["brand"])), "model": model,
                "variant": txt(d.get(VJ["variant"])), "variantId": txt(d.get(VJ["variantId"])),
                "ftCode": txt(d.get(VJ["ftCode"])), "powertrain": pt,
                "powerKW": num(d.get(VJ["powerKW"])), "gearbox": txt(d.get(VJ["gearbox"])),
                "driveline": txt(d.get(VJ["driveline"])), "battery": num(d.get(VJ["battery"])),
                "engineCC": round(num(d.get(VJ["engineL"])) * 1000) if num(d.get(VJ["engineL"])) else None,
                "fuel": FUEL.get(txt(d.get(VJ["fuel"])), txt(d.get(VJ["fuel"]))),
                "bodyStyle": txt(d.get(VJ["bodyStyle"])), "segment": txt(d.get(VJ["segment"])),
                "kerbMass": num(d.get(VJ["kerb"])), "footprint": num(d.get(VJ["footprint"])),
                "refMass": num(d.get(VJ["refMass"])), "testMass": num(d.get(VJ["testMass"])),
                "vclass": txt(d.get(VJ["vclass"])),
                "co2": 0.0 if is_ze else num(d.get(VJ["co2"])),
                "fuelKmpl": num(d.get(VJ["kmpl"])), "fuelMpg": num(d.get(VJ["mpg"])),
                "fuelL100": num(d.get(VJ["l100"])), "energy": num(d.get(VJ["energy"])),
                "range": num(d.get(VJ["range"])),
                "driveCycle": DRIVECYCLE.get(txt(d.get(VJ["cycle"])), txt(d.get(VJ["cycle"]))),
                "year": year, "source": "update dat india 27 july.xlsx",
            }
            catalog.append({k: v for k, v in rec.items() if v is not None})

    return fleet, catalog, {
        "repairs": repairs, "residual": residual, "coverage": coverage,
        "dropped": dropped, "folded": folded,
        "brands": [{"parent": txt(b.get(VJ["parent"])), "year": int(num(b.get(VJ["year"])) or 0),
                    "sales": num(b.get(VJ["volume"])) or 0} for b in brands],
    }


def main():
    xlsx = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_XLSX
    rows = read_sheet(xlsx, SHEET)

    variants = defaultdict(list)   # (parent, model, year) → variant rows
    by_model = defaultdict(list)   # (parent, model)       → variant rows, any year
    models, brands, regs = [], [], []
    for d in rows:
        mode, parent, model, year = d.get("C"), txt(d.get("E")), txt(d.get("G")), num(d.get("A"))
        if mode == "Variant":
            variants[(parent, model, year)].append(d)
            by_model[(parent, model)].append(d)
        elif mode == "Model":
            models.append(d)
        elif mode == "Brand":
            brands.append(d)
        elif mode in ("Group", "Regulatory"):
            regs.append(d)

    # ── how much of each year the workbook actually recorded ─────────────────
    # 2025 fills M1..M12; 2026 only M1..M3. Rows without a monthly split
    # inherit their year's coverage.
    coverage = {}
    for d in models:
        y = int(num(d.get("A")) or 0)
        filled = [i for i, c in enumerate(MONTH_COLS, 1) if num(d.get(c))]
        if filled:
            coverage[y] = max(coverage.get(y, 0), max(filled))

    # ── catalog: every variant spec (no sales — it is a spec library) ────────
    catalog = []
    for (parent, model, year), specs in variants.items():
        for d in specs:
            pt = POWERTRAIN.get(txt(d.get("K")), txt(d.get("K")) or "ICE")
            is_ze = pt in ZE_PT
            rec = {
                "market": txt(d.get("B")) or "IN",
                "parent": parent,
                "brand": txt(d.get("F")),
                "model": model,
                "variant": txt(d.get("H")),
                "variantId": txt(d.get("I")),
                "ftCode": txt(d.get("J")),
                "powertrain": pt,
                "powerKW": num(d.get("L")),
                "gearbox": txt(d.get("M")),
                "driveline": txt(d.get("N")),
                "battery": num(d.get("O")),
                "engineCC": round(num(d.get("P")) * 1000) if num(d.get("P")) else None,
                "fuel": FUEL.get(txt(d.get("Q")), txt(d.get("Q"))),
                "bodyStyle": txt(d.get("R")),
                "segment": txt(d.get("S")),
                "kerbMass": num(d.get("T")),
                "footprint": num(d.get("U")),
                "refMass": num(d.get("V")),
                "testMass": num(d.get("W")),
                "vclass": txt(d.get("X")),
                "co2": 0.0 if is_ze else num(d.get("Y")),
                "fuelKmpl": num(d.get("Z")),
                "fuelMpg": num(d.get("AA")),
                "fuelL100": num(d.get("AB")),
                "energy": num(d.get("AC")),
                "range": num(d.get("AD")),
                "rangeAlt": num(d.get("AE")),
                "driveCycle": DRIVECYCLE.get(txt(d.get("AF")), txt(d.get("AF"))),
                "year": year,
            }
            catalog.append({k: v for k, v in rec.items() if v is not None})

    # ── fleet: the Model rows are the only rows that carry compliance sales ──
    fleet = []
    fixes = {"dropped_no_sales": [], "co2_from_variants": 0, "mass_from_variants": 0,
             "spec_year_fallback": [], "weighted": 0, "powertrain_options": []}
    for d in models:
        parent, model = txt(d.get("E")), txt(d.get("G"))
        year = int(num(d.get("A")) or 0)
        vol = num(d.get("AV"))
        if not vol or vol <= 0:
            fixes["dropped_no_sales"].append(f"{year} {(parent or '?')[:28]} · {model}")
            continue

        specs = variants.get((parent, model, float(year)), [])
        if not specs and by_model.get((parent, model)):
            # nearest year with a spec for this model — the spec library is
            # sparse in the plan years, but a model's spec barely moves
            pool = by_model[(parent, model)]
            best = min({int(num(s.get("A")) or 0) for s in pool}, key=lambda y: (abs(y - year), y))
            specs = [s for s in pool if int(num(s.get("A")) or 0) == best]
            fixes["spec_year_fallback"].append(f"{year} {(parent or '?')[:20]} · {model} ← specs {best}")

        avg_co2, avg_mass = num(d.get("AG")), num(d.get("AH"))
        # Parallel powertrain launches: take the conservative option, keep the rest.
        opts, ambiguous = powertrain_options(specs, vol)
        # latch the decision now — avg_co2 is back-filled further down, so
        # re-testing `avg_co2 is None` later would silently read False.
        use_options = bool(ambiguous and avg_co2 is None)
        if use_options:
            pick = opts[0]
            fixes["powertrain_options"].append(
                f"{year} {(parent or '?')[:20]} · {model} → {pick['powertrain']} "
                f"({pick['co2']:g} g/km) of {', '.join(o['powertrain'] for o in opts)}")
            specs = [s for s in specs
                     if POWERTRAIN.get(txt(s.get("K")), txt(s.get("K"))) == pick["powertrain"]]
        s_co2, s_mass, basis = spec_stats(specs)
        if avg_co2 is None and s_co2 is not None:
            avg_co2 = round(s_co2, 2)
            fixes["co2_from_variants"] += 1
            if "weighted" in basis:
                fixes["weighted"] += 1
        if avg_mass is None and s_mass is not None:
            avg_mass = round(s_mass, 1)
            fixes["mass_from_variants"] += 1

        pts = [POWERTRAIN.get(txt(s.get("K")), txt(s.get("K"))) for s in specs if s.get("K")]
        modal_pt = Counter(pts).most_common(1)[0][0] if pts else "ICE"
        fuels = [FUEL.get(txt(s.get("Q")), txt(s.get("Q"))) for s in specs if s.get("Q")]
        modal_fuel = Counter(fuels).most_common(1)[0][0] if fuels else "Petrol"
        is_ze = (avg_co2 == 0) or modal_pt in ZE_PT
        # Battery must come only from variants that share the row's powertrain.
        # Averaging across a mixed line-up put an electrified sibling's pack on
        # an ICE-labelled row (MG's Astor/ZS-EV-successor read 39.9 kWh as ICE).
        own = [s for s in specs if POWERTRAIN.get(txt(s.get("K")), txt(s.get("K"))) == modal_pt]
        battery = mean([num(s.get("O")) for s in own if num(s.get("O"))])

        months = coverage.get(year, 0)
        rec = {
            "parent": parent,
            "pool": parent,                      # CAFE is assessed per manufacturer
            "brand": txt(d.get("F")),
            "make": txt(d.get("F")),
            "model": model,
            "year": year,
            "fyLabel": FY(year),
            "powertrain": modal_pt,
            "fuel": "Electric" if is_ze else modal_fuel,
            "co2": 0.0 if is_ze else (avg_co2 if avg_co2 is not None else 0.0),
            "mass": avg_mass,
            "sales": int(vol),
            # the Model row carries its own body style / segment — no join needed
            "bodyStyle": txt(d.get("R")),
            "segment": txt(d.get("S")),
            "footprint": next((num(s.get("U")) for s in specs if num(s.get("U"))), None),
            "driveCycle": next((DRIVECYCLE.get(txt(s.get("AF")), txt(s.get("AF"))) for s in specs if s.get("AF")), None),
            # battery is recorded per variant (col O); roll it up so an electrified
            # model row is not flagged incomplete for a spec the source does carry
            "battery": battery,
            # explicit 0 preserves the shipped India convention: the rule pack's
            # autoCnf() fires only when a row carries NO cnf, so leaving this
            # unset would silently switch CNF discounts on for the whole market.
            "cnf": 0,
            "vclass": "Passenger car",
            "scenario": "Base" if year in ACTUAL_YEARS else "Baseline projection",
            "source": "DEMO DATA_SHARED.xlsx",
        }
        # part-year actuals are tagged so the UI can badge them; a sales-weighted
        # average is volume-invariant, so only volume/fine exposure is partial.
        if year in ACTUAL_YEARS and 0 < months < 12:
            rec["monthsRecorded"] = months
        # Per-month registrations (cols AI..AT), truncated to the months the
        # YEAR has reported. Inside that window a blank cell is a genuine
        # zero-sales month, not missing data — MG's Hector sells nothing from
        # M8–M11 and then 850 in M12 — so blanks become 0 and the array always
        # sums back to the annual volume. Beyond the window there is simply no
        # data yet, which is what makes month-by-month compliance meaningful.
        if months:
            rec["monthly"] = [int(num(d.get(c)) or 0) for c in MONTH_COLS[:months]]
        if use_options:
            # the row states which launch it assumes, and carries the others
            rec["powertrainOption"] = opts[0]["powertrain"]
            rec["powertrainOptions"] = opts
        fleet.append({k: v for k, v in rec.items() if v is not None})

    # ── brand-total-only parent-years ────────────────────────────────────────
    # BYD 2025/26 records a Brand total (6,170 / 2,964) but leaves every Model
    # row's volume blank, and its 2025-26 line-up (Atto 3 · Seal · eMAX 7 ·
    # Sealion 7) shares no model with 2027+ (Atto 2 · Dolphin) — so there is no
    # basis in the workbook to split it. Dropping it would lose 9,134 RECORDED
    # units; splitting it evenly would invent per-model figures the source never
    # states. Instead the recorded total is carried as ONE self-describing row
    # whose spec is the mean of that parent-year's variants. Every such parent
    # is 100% BEV here, so CO₂ is 0 however the volume is attributed and only
    # the (mass-based) target line depends on the averaging.
    got_by_py = defaultdict(int)
    for v in fleet:
        got_by_py[(v["parent"], v["year"])] += v["sales"]
    fixes["brand_total_rows"] = []
    for b in brands:
        parent, year = txt(b.get("E")), int(num(b.get("A")) or 0)
        total = num(b.get("AW"))
        if not total or total <= 0 or got_by_py.get((parent, year), 0) > 0:
            continue
        specs = [s for (p, _m, y), ss_ in variants.items() if p == parent and y == float(year) for s in ss_]
        if not specs:
            continue
        s_co2, s_mass, _ = spec_stats(specs)
        pts = [POWERTRAIN.get(txt(s.get("K")), txt(s.get("K"))) for s in specs if s.get("K")]
        modal_pt = Counter(pts).most_common(1)[0][0] if pts else "ICE"
        fuels = [FUEL.get(txt(s.get("Q")), txt(s.get("Q"))) for s in specs if s.get("Q")]
        modal_fuel = Counter(fuels).most_common(1)[0][0] if fuels else "Petrol"
        is_ze = (s_co2 == 0) or modal_pt in ZE_PT
        lineup = sorted({txt(m) for (p, m, y) in variants if p == parent and y == float(year)})
        months = coverage.get(year, 0)
        rec = {
            "parent": parent, "pool": parent,
            "brand": txt(b.get("F")), "make": txt(b.get("F")),
            # the label states its own granularity — nothing here is per-model
            "model": f"{txt(b.get('F'))} range (brand total)",
            "year": year, "fyLabel": FY(year),
            "powertrain": modal_pt,
            "fuel": "Electric" if is_ze else modal_fuel,
            "co2": 0.0 if is_ze else round(s_co2, 2),
            "mass": round(s_mass, 1) if s_mass is not None else None,
            "sales": int(total),
            "bodyStyle": next((txt(s.get("R")) for s in specs if s.get("R")), None),
            "segment": next((txt(s.get("S")) for s in specs if s.get("S")), None),
            "footprint": next((num(s.get("U")) for s in specs if num(s.get("U"))), None),
            "driveCycle": next((DRIVECYCLE.get(txt(s.get("AF")), txt(s.get("AF"))) for s in specs if s.get("AF")), None),
            # battery is recorded per variant (col O); roll it up so an electrified
            # model row is not flagged incomplete for a spec the source does carry
            "battery": mean([num(s.get("O")) for s in specs if num(s.get("O")) and POWERTRAIN.get(txt(s.get("K")), txt(s.get("K"))) == modal_pt]),
            "cnf": 0,
            "vclass": "Passenger car",
            "scenario": "Base" if year in ACTUAL_YEARS else "Baseline projection",
            "source": "DEMO DATA_SHARED.xlsx",
            "salesBasis": "brand total — the source records no model-level split",
        }
        if year in ACTUAL_YEARS and 0 < months < 12:
            rec["monthsRecorded"] = months
        fleet.append({k: v for k, v in rec.items() if v is not None})
        fixes["brand_total_rows"].append(f"{year} {parent[:28]} → {int(total):,} units over {len(lineup)} models ({' · '.join(lineup)})")
        # these model rows were dropped for having no volume, but the parent's
        # total is now carried — stop reporting them as a data loss
        fixes["dropped_no_sales"] = [x for x in fixes["dropped_no_sales"]
                                     if not x.startswith(f"{year} {parent[:28]}")]

    # ── brand rows: totals + the recorded fuel mix ───────────────────────────
    brand_rows = [{
        "parent": txt(b.get("E")), "brand": txt(b.get("F")), "year": int(num(b.get("A")) or 0),
        "sales": num(b.get("AW")),
        "mix": {k: num(b.get(c)) for k, c in
                (("petrol", "AX"), ("diesel", "AY"), ("cng", "AZ"), ("bev", "BA"), ("shev", "BB"))
                if num(b.get(c)) is not None},
    } for b in brands]

    # BC..BH (P / CAFCS / T / ACAFC / credit / compliance) are blank throughout
    # this workbook — compliance is computed by the engine, not read from here.
    reg_rows = [{
        "parent": txt(g.get("E")), "targetYear": int(num(g.get("A")) or 0), "mode": txt(g.get("C")),
        "P_gpkm": num(g.get("BC")), "CAFCS_l100": num(g.get("BD")),
        "T_gpkm": num(g.get("BE")), "ACAFC_l100": num(g.get("BF")),
        "credit": num(g.get("BG")), "compliant": txt(g.get("BH")),
    } for g in regs]
    reg_populated = sum(1 for r in reg_rows if any(r[k] is not None for k in
                        ("P_gpkm", "CAFCS_l100", "T_gpkm", "ACAFC_l100", "credit", "compliant")))

    # ── MERGE the full-market second source ─────────────────────────────────
    # The primary is authoritative for the entities it covers — it is the newer
    # file and the only one carrying the FY2027-28 → FY2032-33 plan. The second
    # source contributes the entities the primary does not have at all, which is
    # most of the Indian market: Maruti Suzuki, Hyundai, Tata, Mahindra, Kia,
    # Renault, Nissan and FCA. No entity is ever taken from both, so nothing is
    # double-counted.
    vj_fleet, vj_catalog, vj = parse_vijay(VIJAY_XLSX) if os.path.exists(VIJAY_XLSX) else ([], [], None)
    primary_parents = {v["parent"] for v in fleet}
    added = sorted({v["parent"] for v in vj_fleet} - primary_parents)
    vj_keep = [v for v in vj_fleet if v["parent"] in set(added)]
    vj_cat_keep = [v for v in vj_catalog if v.get("parent") in set(added)]

    # The second source stops at FY2026-27. Leaving it there would collapse the
    # market from 13 makers to 5 the moment the plan years start, so each added
    # maker's COMPLETE year (FY2025-26 — 2026 is only a part-year pull) is held
    # against every later statutory line, tagged 'Baseline projection' exactly
    # like any other projection on this screen. Their own monthly filing is not
    # carried forward: a projection has not filed anything.
    plan_years = sorted({v["year"] for v in fleet} - ACTUAL_YEARS)
    # the latest COMPLETE year — never the part-year, or every plan year would
    # inherit a 3-month volume as if it were twelve
    complete = [y for y in sorted(ACTUAL_YEARS)
                if any(v["year"] == y for v in vj_keep) and (vj["coverage"].get(y, 0) >= 12 if vj else False)]
    base_year = max(complete) if complete else max(y for y in ACTUAL_YEARS if any(v["year"] == y for v in vj_keep))
    held = []
    for y in plan_years:
        for v in vj_keep:
            if v["year"] != base_year:
                continue
            held.append({**{k: x for k, x in v.items() if k not in ("monthly", "monthsRecorded")},
                         "year": y, "fyLabel": FY(y), "scenario": "Baseline projection"})
    fleet = fleet + vj_keep + held
    catalog = catalog + vj_cat_keep

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    payload = {
        "meta": {
            "source": os.path.basename(xlsx),
            "sheet": SHEET,
            "market": "IN",
            "ingested": "2026-08-05",
            "note": "DEMO DATA_SHARED is the ONLY India source (2026-08-05); it fully replaces the Ram workbook, the master-data file and the 27-Jul update.",
            "fleetGranularity": "model (sales recorded on the Model roll-up row, col AV)",
            "catalogGranularity": "variant (spec library; col AU planning volumes are not compliance sales)",
            "yearCoverage": {str(y): f"{m}/12 months recorded" for y, m in sorted(coverage.items())},
            "planYears": "2027-2032 are the workbook's own forward plan (read as given, tagged 'Baseline projection') — not replicated from a base year",
            "regNote": f"Group/Regulatory rows present but empty (BC..BH blank in {reg_populated}/{len(reg_rows)} populated) — compliance is engine-computed",
        },
        "IN_fleet": fleet,
        "IN_catalog": catalog,
        "IN_brand_totals": brand_rows,
        "IN_regulatory_reference": reg_rows,
    }
    with open(OUT, "w") as f:
        json.dump(payload, f, indent=1)

    # ── validation report ────────────────────────────────────────────────────
    print(f"→ wrote {os.path.relpath(OUT, ROOT)}  (source: {os.path.basename(xlsx)} · sheet {SHEET!r})")
    yrs = sorted({v["year"] for v in fleet})
    print(f"\nIN_fleet   : {len(fleet)} model rows · {len({v['parent'] for v in fleet})} compliance parents · {yrs[0]}–{yrs[-1]}")
    print(f"IN_catalog : {len(catalog)} variant specs · {len({v['model'] for v in catalog})} models")
    print(f"year coverage recorded: {dict(sorted(coverage.items()))}  (12 = full year)")

    print(f"\nBrand-total reconciliation (Σ model sales  vs  Brand row AW):")
    got = defaultdict(int)
    for v in fleet:
        got[(v["parent"], v["year"])] += v["sales"]
    want = defaultdict(float)
    for b in brand_rows:
        want[(b["parent"], b["year"])] += b["sales"] or 0
    ok = True
    for key in sorted(want, key=lambda k: (k[1], k[0])):
        g, w = got.get(key, 0), int(want[key])
        flag = "ok" if g == w else "MISMATCH"
        if flag != "ok":
            ok = False
            print(f"   {key[1]}  {key[0][:44]:44} extracted={g:8,d}  workbook={w:8,d}  {flag}")
    print(f"   ({sum(1 for k in want if got.get(k, 0) == int(want[k]))}/{len(want)} parent-years reconcile exactly)")
    print(f"   → reconciliation {'PASSED' if ok else 'FAILED'}")

    print(f"\nDerivations applied:")
    print(f"   model rows dropped (no sales recorded) : {len(fixes['dropped_no_sales'])}")
    for x in fixes["dropped_no_sales"]:
        print(f"       · {x}")
    print(f"   brand-total rows carried (no model split in source) : {len(fixes['brand_total_rows'])}")
    for x in fixes["brand_total_rows"]:
        print(f"       · {x}")
    print(f"   CO₂ derived from variant specs         : {fixes['co2_from_variants']} / {len(fleet)}  ({fixes['weighted']} sales-weighted, rest simple mean = the workbook's own AG convention)")
    print(f"   mass derived from variant specs        : {fixes['mass_from_variants']} / {len(fleet)}")
    print(f"   spec taken from a neighbouring year    : {len(fixes['spec_year_fallback'])}")
    withm = [v for v in fleet if v.get("monthly")]
    print(f"   monthly registrations carried          : {len(withm)} rows "
          f"({sorted({len(v['monthly']) for v in withm})} months) · "
          f"reconcile to annual: {all(sum(v['monthly']) == v['sales'] for v in withm)}")
    print(f"   parallel powertrain launches resolved to the conservative option : {len(fixes['powertrain_options'])}")
    for x in fixes["powertrain_options"]:
        print(f"       · {x}")

    if vj:
        print(f"\n{'='*74}\nSECOND SOURCE · update dat india 27 july.xlsx (sheet VIJAY) — the full market")
        print(f"{'='*74}")
        print(f"   entities added (absent from the primary) : {len(added)}")
        for a in added:
            u25 = sum(v['sales'] for v in vj_keep if v['parent'] == a and v['year'] == 2025)
            u26 = sum(v['sales'] for v in vj_keep if v['parent'] == a and v['year'] == 2026)
            print(f"       {a[:44]:44} FY25-26 {u25:>10,}   FY26-27 {u26:>9,}")
        print(f"   entities NOT taken (primary is authoritative) : "
              f"{sorted({v['parent'] for v in vj_fleet} & primary_parents)}")
        print(f"   BMW skipped (no volume in any year)")
        print(f"\n   year-stamp repairs (each proven by the file's own Brand control totals):")
        for r in vj["repairs"]:
            print(f"       · {r}")
        print(f"   unresolved reconciliation residual : "
              f"{ {k: round(v) for k, v in vj['residual'].items()} if vj['residual'] else 'NONE — every parent-year reconciles exactly'}")
        print(f"   stray months folded into the filing window : {len(vj['folded'])}")
        for f in vj["folded"]:
            print(f"       · {f}")
        print(f"   month coverage after repair : {vj['coverage']}")
        print(f"   model rows dropped (no volume) : {len(vj['dropped'])}")
        print(f"\n   held flat across {plan_years} from FY{base_year}-{(base_year+1)%100} "
              f"(tagged 'Baseline projection') : {len(held)} rows")

    print(f"\nFleet totals by year:")
    agg = defaultdict(lambda: {"u": 0, "uco2": 0.0, "umass": 0.0})
    for v in fleet:
        a = agg[v["year"]]
        a["u"] += v["sales"]; a["uco2"] += v["sales"] * v["co2"]; a["umass"] += v["sales"] * (v.get("mass") or 0)
    for y in sorted(agg):
        a = agg[y]
        cov = coverage.get(y)
        tag = f"  · {cov}/12 months (part-year)" if cov and cov < 12 else ("  · plan" if y not in ACTUAL_YEARS else "")
        print(f"   {y} {FY(y)}  {a['u']:9,d} units   avg CO₂ {a['uco2']/a['u']:6.2f} g/km   avg mass {a['umass']/a['u']:7.1f} kg{tag}")

    print(f"\nVocab check — powertrains: {sorted({v['powertrain'] for v in fleet})}")
    print(f"             fuels      : {sorted({v['fuel'] for v in fleet})}")
    print(f"             segments   : {sorted({v.get('segment') for v in fleet if v.get('segment')})}")
    print(f"             bodyStyles : {sorted({v.get('bodyStyle') for v in fleet if v.get('bodyStyle')})}")
    print(f"             driveCycles: {sorted({v.get('driveCycle') for v in fleet if v.get('driveCycle')})}")
    missing_mass = [v for v in fleet if not v.get("mass")]
    print(f"\nCompleteness — fleet rows missing mass: {len(missing_mass)}  · missing CO₂ on a non-ZE row: "
          f"{sum(1 for v in fleet if v['co2'] == 0 and v['powertrain'] not in ZE_PT)}")
    bev_bad = [v for v in catalog if v["powertrain"] == "BEV" and v.get("co2", 0) != 0]
    print(f"             catalog BEV rows with non-zero CO₂ (should be 0): {len(bev_bad)}")


if __name__ == "__main__":
    main()
