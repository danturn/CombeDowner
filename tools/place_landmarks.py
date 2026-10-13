"""Place a map's landmarks again on full-detail squares that are already built, without
rebuilding them: for a new landmark in the map's pack (tools/landmarks/bath.py for Bath), where
rebuilding the square from the raw data isn't to hand.

Usage: python3 -I tools/place_landmarks.py <map> <tiles dir> ti,tj [ti,tj ...]

e.g. python3 -I tools/place_landmarks.py combe-down web/public/maps/combe-down -2,3

For each square it works out the pack's landmarks from what the square already holds (its
buildings, pitches, water and terrain, with its neighbours' terrain round the edges), takes out
the buildings they stand in place of, clears what's under them (landmarks.clear) and writes the
square's landmarks afresh. A full rebuild (tools/prep_tiles.py --force) comes to the same thing,
except that there the places named in the data are to hand as well.
"""
import json, math, os, sys
from types import SimpleNamespace
from shapely.geometry import Polygon

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from area import area
import landmarks


def terrain(tiles):
    """Ground height at model (x, y) from the squares given (as written: decimetres above z0)."""
    def gelev(x, y):
        for d in tiles:
            T = d["t"]
            fi, fj = (x - T["x0"]) / T["dx"], (y - T["y0"]) / T["dy"]
            if 0 <= fi <= T["nx"] - 1 and 0 <= fj <= T["ny"] - 1:
                i, j = min(T["nx"] - 2, int(fi)), min(T["ny"] - 2, int(fj))
                u, v = fi - i, fj - j
                h = lambda a, b: T["h"][b * T["nx"] + a] / 10 + T["z0"]
                return (h(i, j) * (1 - u) + h(i + 1, j) * u) * (1 - v) + (h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u) * v
        return tiles[0]["t"]["z0"]
    return gelev


def main():
    map_id, out_dir, *which = sys.argv[1:]
    A = area(map_id)
    pack = landmarks.load(A.landmarks)
    lon0, lat0 = A.centre
    kx, ky = 111320 * math.cos(math.radians(lat0)), 110574
    proj = lambda lon, lat: ((lon - lon0) * kx, (lat - lat0) * ky)
    for w in which:
        ti, tj = (int(v) for v in w.split(","))
        path = os.path.join(out_dir, f"{ti}_{tj}.json")
        d = json.load(open(path))
        near = [d] + [json.load(open(p)) for a in (-1, 0, 1) for b in (-1, 0, 1) if (a or b)
                      for p in [os.path.join(out_dir, f"{ti + a}_{tj + b}.json")] if os.path.exists(p)]
        ctx = SimpleNamespace(
            buildings=[dict(poly=Polygon(b["r"][0], b["r"][1:]), whole=Polygon(b["r"][0], b["r"][1:]), name=b.get("n", ""), props={},
                            eaves=b["h"], ridge=b["h"] + b.get("rp", 0)) for b in d["bl"]],
            places=[], proj=proj, gelev=terrain(near), water=d.get("wp", []), pitches=[p for t in near for p in t.get("pi", [])])
        gone = landmarks.replaced(pack, ctx)
        d["bl"] = [b for i, b in enumerate(d["bl"]) if i not in gone]
        x0, y0, x1, y1 = d["b"]
        d["lm"] = [q for q in landmarks.place(pack, ctx) if x0 <= q[1] < x1 and y0 <= q[2] < y1]
        landmarks.clear(ctx, d)
        json.dump(d, open(path, "w"), separators=(",", ":"))
        print(f"{ti}_{tj}: {len(gone)} buildings replaced; landmarks: {', '.join(str(q[0]) for q in d['lm']) or 'none'}")


if __name__ == "__main__":
    main()
