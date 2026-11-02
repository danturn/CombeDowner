"""Wild ground: bare rock, heath and scrub, sand and wetland, and the boulders on the rock.

The ground grids (prep_map.py's squares, prep_wide.py's whole-city map) give each vertex a kind of
ground, one character each: '0' to '7' are the town's (prep_map.py), and these add
  '8' rock: the land layer's bare rock, stone and scree, and along its cliffs;
  '9' heath and scrub;
  ':' sand and beaches;
  ';' wetland;
and the land layer's grassland is meadow ('3'), its shrubbery a planted bed ('6').

What the land layer maps comes first and wins over the satellite land cover, which only fills open
country nobody has mapped: never inside any mapped land use but a protected area (a national park,
a nature reserve), and never near a street or a building a street comes near (one that might have a
garden, gardens.py), so it can't turn gardens, verges or the edges of a town into heath, though a
hut on a mountain top stands on the mountain. It's the same for every map, from its own data.

Boulders: on bare rock, a few outcrops of them, each one placed by where it is (so two squares
working over the same ground agree), clear of the streets, paths, walls and buildings, as the small
things are in prep_map.py. A boulder is [x, y, ground, size in metres].
"""
import math, zlib
import numpy as np
import shapely
from gardens import STREET_REACH as STREET_REACH_HOME     # how far a house with a garden stands from a street

ROCK, HEATH, SAND, WET = 8, 9, 10, 11
MEADOW, BED = 3, 6
NAMES = {ROCK: "rock", HEATH: "heath", SAND: "sand", WET: "wetland"}
COVER = {"shrub": HEATH, "barren": ROCK, "wetland": WET, "grass": MEADOW, "crop": MEADOW}
CLIFF = 4.0             # metres either side of a mapped cliff's line that is bare rock
BUILT_REACH = 25.0      # metres round a building that the land cover never turns wild
STREET_REACH = 10.0     # metres past a street's carriageway likewise
YARD = 6.0              # metres round a house that are its own yard, whatever the wild ground's outline says
OUTCROP = 1 / 300       # outcrops of boulders to the square metre of bare rock


def digits(a):
    """A kind grid as the maps keep it: one character per vertex, '0' up."""
    return (np.asarray(a, dtype=np.uint8) + 48).tobytes().decode("ascii")


def land_kind(p):
    s, c = p.get("subtype"), p.get("class")
    if s == "rock": return ROCK
    if s == "shrub": return BED if c == "shrubbery" else HEATH
    if s == "sand": return SAND
    if s == "wetland": return WET
    if s == "grass" and c == "grassland": return MEADOW
    return None


def mapped(land, polys, project):
    """(kind, polygon) for each piece of wild ground the land layer maps (as (geometry, properties)),
    and bare rock along its cliffs. polys: a geometry's projected polygons; project: a geometry
    projected whole."""
    out = []
    for g, p in land:
        if p.get("subtype") == "physical" and p.get("class") == "cliff" and "Line" in g.geom_type:
            out.append((ROCK, project(g).buffer(CLIFF, cap_style="flat")))
            continue
        k = land_kind(p)
        if k is not None and g.geom_type.endswith("Polygon"): out += [(k, q) for q in polys(g)]
    return out


def fill(GT, cover_xy, land_cover, land_use, polys, footprints, streets):
    """Paint the satellite land cover's wild kinds onto the ground still unmarked (GT == 0) out in
    open country. footprints: projected building outlines; streets: projected carriageways
    (polygons). cover_xy(poly) gives a window of the grid and the vertices in it inside poly.
    Returns how many vertices it painted."""
    built = np.zeros(GT.shape, dtype=bool)
    for g, p in land_use:
        if p.get("subtype") == "protected": continue
        for q in polys(g): _mark(built, cover_xy, q)
    near_street = shapely.STRtree(streets) if len(streets) else None
    for f in footprints:
        if near_street is None or not len(near_street.query(f, predicate="dwithin", distance=STREET_REACH_HOME)): continue
        _mark(built, cover_xy, f.buffer(BUILT_REACH, quad_segs=2))
    for s in streets: _mark(built, cover_xy, s.buffer(STREET_REACH, quad_segs=2))
    n = 0
    for g, p in land_cover:
        k = COVER.get(p.get("subtype"))
        if k is None: continue
        for q in polys(g):
            win, inn = cover_xy(q)
            m = inn & ~built[win] & (GT[win] == 0)
            GT[win][m] = k
            n += int(m.sum())
    return n


def _mark(built, cover_xy, poly):
    win, inn = cover_xy(poly)
    built[win] |= inn


def _hash(x, y, k):
    return zlib.crc32(f"{x:.0f},{y:.0f},{k}".encode()) / 4294967296


def boulders(GT, GX, GY, step, clear, gelev, keep):
    """Outcrops of boulders over the bare rock of a ground grid (GX, GY: each vertex's position;
    step: the grid's spacing). Each vertex has its own chance of an outcrop, worked from where it
    is, so a grid that overlaps another places the same ones. clear(x, y, r): nothing laid before
    is within r there; keep(x, y): it's this build's to place. Returns [[x, y, ground, size]]."""
    out = []
    chance = OUTCROP * step * step
    for j, i in zip(*np.nonzero(GT == ROCK)):
        cx, cy = float(GX[j, i]), float(GY[j, i])
        if _hash(cx, cy, 0) >= chance: continue
        n = 1 + int(_hash(cx, cy, 1) * 4)
        for b in range(n):
            a, d = _hash(cx, cy, 2 + b) * 2 * math.pi, (0 if b == 0 else 0.8 + _hash(cx, cy, 9 + b) * 1.8)
            x, y = cx + math.cos(a) * d, cy + math.sin(a) * d
            s = (0.6 + _hash(cx, cy, 20 + b) * 1.2) * (1 if b == 0 else 0.6)
            if not keep(x, y) or not clear(x, y, s * 0.6): continue
            out.append([round(x, 1), round(y, 1), round(float(gelev(x, y)), 1), round(s, 2)])
    return out
