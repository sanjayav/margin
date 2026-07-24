#!/usr/bin/env python3
"""Ingest the real China dual-credit dataset (China Data.xlsx) into the CN fleet.

Replaces the old MODELLED benchmark with the authoritative variant-level data:
6 compliance entities (BMW, Brilliance-BMW, Porsche, Tata, Chery-Tata, Tesla),
years 2024-2027, real WLTP CO2 / kerb mass / battery / e-range / sales. Only the
`Variant`-mode rows are the fleet; the Model/Brand/Regulatory-mode rows are the
source's own pre-aggregations (the engine recomputes those).

Writes CN into src/data/fleet_data.json + fleet_data.ts (mirrors the India
ingest). Engine columns: co2 g/km (WLTP), mass = kerb weight (kg).
"""
import json, os
import openpyxl

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
XLSX = os.path.join(os.path.dirname(ROOT), 'China Data.xlsx')  # repo root, one up from underline/
JSON_PATH = os.path.join(ROOT, 'src/data/fleet_data.json')
TS_PATH = os.path.join(ROOT, 'src/data/fleet_data.ts')

# column indices (0-based) in the CHINA sheet
C = dict(year=0, mode=2, parent=4, brand=5, model=6, vname=7, vcode=8, body=9,
         seg=10, pt=11, cc=12, fuel=13, power=14, batt=18, kerb=19,
         co2w=26, elecw=28, range_w=30, sales=31)

PT_MAP = {'ICE: SS': 'ICE', 'MHEV': 'MHEV', 'HEV': 'HEV', 'PHEV': 'PHEV', 'BEV': 'BEV', 'FCEV': 'FCEV'}


def num(v, d=0.0):
    try:
        return float(v)
    except (TypeError, ValueError):
        return d


def build_rows():
    wb = openpyxl.load_workbook(XLSX, read_only=True, data_only=True)
    ws = wb['CHINA']
    out = []
    for r in ws.iter_rows(min_row=2, values_only=True):
        if r[C['mode']] != 'Variant':
            continue
        pt_raw = r[C['pt']]
        pt = PT_MAP.get(pt_raw, str(pt_raw or 'ICE'))
        fuel_raw = str(r[C['fuel']] or '')
        is_bev = pt in ('BEV', 'FCEV') or 'Electric' in fuel_raw
        is_phev = pt in ('PHEV', 'EREV')
        fuel = 'Electric' if is_bev else ('Petrol Plug-in Hybrid' if is_phev else 'Petrol')
        co2 = 0.0 if is_bev else round(num(r[C['co2w']]), 1)
        sales = int(round(num(r[C['sales']])))
        if sales <= 0:
            continue
        parent = str(r[C['parent']] or 'Unknown')
        row = {
            'parent': parent, 'pool': parent,
            'brand': str(r[C['brand']] or parent), 'make': str(r[C['brand']] or parent),
            'model': str(r[C['model']] or '—'),
            'variant': str(r[C['vcode']] or r[C['vname']] or ''),
            'year': int(r[C['year']]),
            'powertrain': pt, 'fuel': fuel,
            'co2': co2, 'mass': round(num(r[C['kerb']]), 1), 'sales': sales,
            'vclass': 'Passenger car', 'scenario': 'Base',
        }
        seg = r[C['seg']]; body = r[C['body']]; cc = r[C['cc']]; pwr = r[C['power']]
        batt = num(r[C['batt']]); rng = num(r[C['range_w']]); elec = num(r[C['elecw']])
        if seg: row['segment'] = str(seg)
        if body: row['bodyStyle'] = str(body)
        if cc: row['engineCC'] = round(num(cc) * 1000)  # litres → cc
        if pwr: row['powerKW'] = round(num(pwr))
        if (is_bev or is_phev):
            if batt > 0: row['battery'] = round(batt, 1)
            if rng > 0: row['range'] = round(rng)
            if elec > 0: row['energy'] = round(elec * 10)  # kWh/100km → Wh/km (Phase 6 CAFC)
        row['driveCycle'] = 'WLTC'
        out.append(row)
    return out


cn_rows = build_rows()

with open(JSON_PATH, encoding='utf-8') as f:
    data = json.load(f)
data['CN'] = cn_rows
with open(JSON_PATH, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

header = (
    "// AUTO-GENERATED from fleet_data.json — do not edit by hand.\n"
    "// Bundled as a TS module so serverless functions (Vercel Node ESM runtime)\n"
    "// load the data without JSON import-attribute issues.\n"
    "/* eslint-disable */\n"
)
with open(TS_PATH, 'w', encoding='utf-8') as f:
    f.write(header)
    f.write("const data: Record<string, any[]> = " + json.dumps(data, ensure_ascii=False) + "\n")
    f.write("export default data\n")

# report
from collections import Counter
yrs = Counter(r['year'] for r in cn_rows)
ents = Counter(r['parent'] for r in cn_rows)
print(f"CN rows written: {len(cn_rows)}  years={dict(sorted(yrs.items()))}")
print(f"entities ({len(ents)}): " + ", ".join(f"{k} {v}" for k, v in ents.most_common()))
print(f"total sales: {sum(r['sales'] for r in cn_rows):,}")
