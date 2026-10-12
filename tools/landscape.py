"""Front doors, garden shrubs and the Palladian Bridge.

Doors: each house gets a front door on the wall that faces the nearest street (terraced houses
put it towards one side, as they do), painted in one of the colours common on Bath doors.

Shrubs: wherever the canopy height map shows growth between 1 and 3.5 m that is not a tree top,
not on a road and not inside a building, there is a shrub. Sampled on a 4.8 m grid, outside mapped woods.

Palladian Bridge: Prior Park's 1755 covered bridge, placed from Overture's point for it.
"""
import math
import numpy as np
import shapely
from shapely.geometry import LineString, Point

DOOR_COLOURS = 8   # renderer palette size


BAY_ZONES = {"suburb", "foxhill"}


def front_doors(polys, info, roads, gelev, rnd, bays=None):
    """Doors (and, if a list is given, bay windows: 1930s suburban semis and detached houses
    usually have one beside the door, often two storeys high)."""
    lines = [LineString([(a, b) for a, b, _ in r["p"]]) for r in roads
             if r["c"] not in ("footway", "steps", "path", "cycleway", "bridleway", "track") and len(r["p"]) > 1]
    tree = shapely.STRtree(lines)
    out = []
    for i, (poly, b) in enumerate(zip(polys, info)):
        if b["kind"] not in ("detached", "semi", "terrace") or b["eaves"] < 3: continue
        c = poly.centroid
        near = [int(k) for k in tree.query(c.buffer(50))]
        if not near: continue
        road = min((lines[k] for k in near), key=lambda l: l.distance(c))
        ring = list(poly.exterior.coords)[:-1]
        best = None
        for k in range(len(ring)):
            a, q = ring[k], ring[(k + 1) % len(ring)]
            L = math.dist(a, q)
            if L < 2.2: continue
            m = ((a[0] + q[0]) / 2, (a[1] + q[1]) / 2)
            d = road.distance(Point(m))
            if best is None or d < best[0] - 0.5: best = (d, a, q, L)
        if not best: continue
        _, a, q, L = best
        ux, uy = (q[0] - a[0]) / L, (q[1] - a[1]) / L
        # terraces put the door towards one side; others nearer the middle
        f = (0.25 if rnd.random() < 0.5 else 0.75) if b["kind"] == "terrace" else 0.5 + rnd.uniform(-0.15, 0.15)
        px, py = a[0] + ux * L * f, a[1] + uy * L * f
        nx, ny = uy, -ux
        if (px - c.x) * nx + (py - c.y) * ny < 0: nx, ny = -nx, -ny
        ang = math.atan2(uy, ux)
        if math.sin(ang) * nx - math.cos(ang) * ny < 0: ang += math.pi
        px, py = px + nx * 0.03, py + ny * 0.03
        out.append([round(px, 2), round(py, 2), round(gelev(px, py), 2), round(ang, 3), rnd.randrange(DOOR_COLOURS)])
        if bays is not None and b["kind"] in ("semi", "detached") and b["zone"] in BAY_ZONES and L > 6 and rnd.random() < 0.6:
            g = f + (0.32 if f < 0.5 else -0.32)          # on the other side of the door
            bx, by = a[0] + ux * L * g + nx * 0.45, a[1] + uy * L * g + ny * 0.45
            storeys = 2 if b["eaves"] > 4.5 and rnd.random() < 0.6 else 1
            bays.append([round(bx, 2), round(by, 2), round(gelev(bx, by), 2), round(ang, 3), storeys, b["wall"][0], round(min(2.6, L * 0.32), 2)])
    return out


def shrubs(canopy, footprints, roads, RW, inside, gelev, woods=(), step_px=4):
    """Woods are left out: their undergrowth is hidden under the trees anyway."""
    if canopy is None: return []
    solid = shapely.STRtree(list(woods) + [f.buffer(0.8) for f in footprints] +
                            [LineString([(a, b) for a, b, _ in r["p"]]).buffer(RW.get(r["c"], 3) / 2 + 0.6)
                             for r in roads if len(r["p"]) > 1])
    h = canopy.h
    out = []
    R = 6378137.0
    for j in range(0, h.shape[0], step_px):
        row = h[j]
        for i in np.nonzero((row[::step_px] >= 1.0) & (row[::step_px] <= 3.5))[0] * step_px:
            X, Y = canopy.x0 + (i + 0.5) * canopy.dx, canopy.y0 + (j + 0.5) * canopy.dy
            lon = math.degrees(X / R)
            lat = math.degrees(2 * math.atan(math.exp(Y / R)) - math.pi / 2)
            x, y = (lon - canopy.lon0) * canopy.kx, (lat - canopy.lat0) * canopy.ky
            if not inside(x, y) or math.hypot(x, y) > 1060: continue
            if len(solid.query(Point(x, y), predicate="intersects")): continue
            out.append([round(x, 1), round(y, 1), round(gelev(x, y), 1), round(float(row[i]), 1)])
    return out


def palladian_bridge(places, proj, wp, gelev):
    for g, p in places:
        if ((p.get("names") or {}).get("primary") or "") == "Palladian Bridge":
            x, y = proj(g.x, g.y)
            # sit it at the nearest water level
            z = gelev(x, y)
            best = None
            for w in wp:
                for ring in w["r"][:1]:
                    d = min(math.hypot(px - x, py - y) for px, py in ring)
                    if best is None or d < best[0]: best = (d, w["z"])
            if best and best[0] < 60: z = best[1]
            return [["bridge", round(x, 2), round(y, 2), round(z, 2), 0.0]]
    return []


def approaches(gates, drives, doors, polys, gelev, rnd):
    """Front paths from each gate to the nearest front door, driveways from each drive gap up to
    the house (with a car on most), and wheelie bins beside front doors."""
    btree = shapely.STRtree(polys)
    door_pts = [Point(d[0], d[1]) for d in doors]
    dtree = shapely.STRtree(door_pts) if door_pts else None
    paths, drv, fx = [], [], []
    r2 = lambda v: round(float(v), 2)
    for x0, y0, x1, y1, _z, _style in gates:
        g = Point((x0 + x1) / 2, (y0 + y1) / 2)
        if dtree is None: break
        near = [int(k) for k in dtree.query(g.buffer(25))]
        if not near: continue
        k = min(near, key=lambda k: door_pts[k].distance(g))
        d = door_pts[k]
        line = LineString([g, d])
        # stop short of the wall, and skip if the path would cut through another building
        if line.length < 1.5 or any(polys[int(b)].intersection(line).length > 1.0 for b in btree.query(line)): continue
        paths.append([r2(g.x), r2(g.y), r2(d.x), r2(d.y)])
    for x, y, i in drives:
        house = polys[i]
        c = house.centroid
        ux, uy = c.x - x, c.y - y
        L = math.hypot(ux, uy) or 1
        ux, uy = ux / L, uy / L
        # run towards the house until close to its wall (at most 14 m)
        length = 2.0
        while length < 14 and house.distance(Point(x + ux * length, y + uy * length)) > 1.2: length += 0.5
        ex, ey = x + ux * length, y + uy * length
        if any(polys[int(b)].intersects(LineString([(x, y), (ex, ey)]).buffer(1.2)) for b in btree.query(Point(ex, ey).buffer(15)) if int(b) != i):
            continue
        drv.append([r2(x), r2(y), r2(ex), r2(ey)])
        if length > 6 and rnd.random() < 0.6:
            mx, my = x + ux * (length - 3.2), y + uy * (length - 3.2)
            fx.append(["car", r2(mx), r2(my), r2(gelev(mx, my)), r2(math.atan2(uy, ux) + (math.pi if rnd.random() < 0.5 else 0)), rnd.randrange(10)])
    for dx, dy, dz, ang, _ in doors:
        if rnd.random() < 0.5: continue
        # beside the door, half a metre out from the wall
        ox, oy = math.cos(ang), math.sin(ang)
        nx, ny = math.sin(ang), -math.cos(ang)     # out of the wall (the door's local +z)
        side = 1.6 if rnd.random() < 0.5 else -1.6
        bx, by = dx + ox * side + nx * 0.55, dy + oy * side + ny * 0.55
        fx.append(["wheelie", r2(bx), r2(by), r2(gelev(bx, by)), r2(ang), rnd.randrange(3)])
    return paths, drv, fx
