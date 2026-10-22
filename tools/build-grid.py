#!/usr/bin/env python3
"""
BLIZU – gradi vlastitu bazu mjesta iz OpenStreetMap izvoda (.osm.pbf).

Upotreba:
  pip install osmium
  python3 tools/build-grid.py izlaz_dir filtrirano1.pbf:original1.pbf filtrirano2.pbf:original2.pbf ...
  (dio iza ":" je opcion; iz njega se čitaju granice izvoda)

Izlaz:
  izlaz_dir/index.json       -> {"updated": ..., "boxes": [[s,w,n,e],...], "cells": {"430_177": 412, ...}}
  izlaz_dir/<lat10>_<lng10>.json -> niz elemenata u istom obliku kao Overpass (type,id,tags,lat/lon ili center)

Ćelija je 0,1° x 0,1° (oko 11 x 8 km); ključ = floor(lat*10)_floor(lng*10).
"""
import json, math, os, re, sys, time

KEEP = ["name", "name:sr", "name:sr-Latn", "name:bs", "name:hr", "name:en", "amenity", "tourism", "historic",
        "natural", "leisure", "cuisine", "opening_hours", "phone", "contact:phone", "description", "image",
        "wikimedia_commons", "wikidata", "website", "check_date", "survey:date",
        "diet:vegetarian", "diet:vegan", "wheelchair", "dog", "pets_allowed", "fee", "kids_area", "highchair", "changing_table"]
AMEN = {"restaurant", "cafe", "bar", "pub", "fast_food", "ice_cream", "theatre", "cinema", "arts_centre", "nightclub"}
TOUR = {"attraction", "viewpoint", "museum", "gallery"}
HIST = {"castle", "fort", "monument", "ruins", "archaeological_site", "memorial"}
LEIS = {"beach_resort", "park", "marina"}
CYR = re.compile("[\u0400-\u04FF]")


def keep(t):
    """Da li je objekat mjesto koje Mestigo prikazuje (isto što i upiti u aplikaciji)."""
    if not t.get("name"):
        return False
    if any(k.startswith(("disused", "abandoned", "was:", "demolished", "razed")) for k in t):
        return False
    if t.get("access") in ("private", "no") or t.get("opening_hours") == "closed":
        return False
    return (t.get("amenity") in AMEN or t.get("tourism") in TOUR or t.get("historic") in HIST
            or t.get("natural") == "beach" or t.get("leisure") in LEIS)


def slim(t):
    o = {k: t[k] for k in KEEP if k in t and t[k]}
    # ćirilični naziv zamijeni latiničnim ako postoji
    if CYR.search(o.get("name", "")):
        for k in ("name:bs", "name:hr", "name:sr-Latn", "name:en"):
            if o.get(k) and not CYR.search(o[k]):
                o["name"] = o[k]
                break
    return o


def cell(lat, lon):
    return f"{math.floor(lat * 10)}_{math.floor(lon * 10)}"


def write_grid(items, boxes, out):
    """items: lista (type, id, lat, lon, tags). Piše ćelije i index.json."""
    os.makedirs(out, exist_ok=True)
    for f in os.listdir(out):
        if f.endswith(".json"):
            os.remove(os.path.join(out, f))
    seen, cells = set(), {}
    for typ, i, lat, lon, tags in items:
        t = slim(tags)
        dk = (t["name"].lower(), t.get("amenity") or t.get("tourism") or t.get("historic") or "x", round(lat, 3), round(lon, 3))
        if dk in seen:
            continue
        seen.add(dk)
        el = {"type": typ, "id": i, "tags": t}
        if typ == "node":
            el["lat"], el["lon"] = round(lat, 6), round(lon, 6)
        else:
            el["center"] = {"lat": round(lat, 6), "lon": round(lon, 6)}
        cells.setdefault(cell(lat, lon), []).append(el)
    for k, v in cells.items():
        with open(os.path.join(out, k + ".json"), "w", encoding="utf-8") as f:
            json.dump(v, f, ensure_ascii=False, separators=(",", ":"))
    idx = {"updated": int(time.time()), "boxes": boxes, "cells": {k: len(v) for k, v in cells.items()}}
    with open(os.path.join(out, "index.json"), "w", encoding="utf-8") as f:
        json.dump(idx, f, separators=(",", ":"))
    return len(seen), len(cells)


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    import osmium  # pip install osmium
    out, files = sys.argv[1], sys.argv[2:]
    items, boxes = [], []

    class H(osmium.SimpleHandler):
        def node(self, n):
            if len(n.tags) and n.location.valid():
                t = {x.k: x.v for x in n.tags}
                if keep(t):
                    items.append(("node", n.id, n.location.lat, n.location.lon, t))

        def way(self, w):
            if not len(w.tags):
                return
            t = {x.k: x.v for x in w.tags}
            if not keep(t):
                return
            pts = [(x.lat, x.lon) for x in w.nodes if x.location.valid()]
            if pts:
                items.append(("way", w.id, sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts), t))

    for arg in files:
        # "filtrirano.pbf:original.pbf" -> podaci iz prvog, granice (bbox) iz zaglavlja originala
        f, orig = (arg.split(":", 1) + [arg])[:2] if ":" in arg else (arg, arg)
        print("Čitam", f, flush=True)
        b = osmium.io.Reader(orig).header().box()
        if b.valid():
            boxes.append([round(b.bottom_left.lat, 4), round(b.bottom_left.lon, 4), round(b.top_right.lat, 4), round(b.top_right.lon, 4)])
        H().apply_file(f, locations=True)
    n, c = write_grid(items, boxes, out)
    print(f"Gotovo: {n} mjesta u {c} ćelija -> {out}")


if __name__ == "__main__":
    main()
