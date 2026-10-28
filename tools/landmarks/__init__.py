"""Hand-made landmarks, as one pack per map: tools/landmarks/<map id>.py, with - in the id
written as _ (combe_down.py for combe-down). A map with no pack simply has none.

Everything else in the build is generic, worked out from the open data for any area. A pack is
for what the data can't show: a spire, a portico, a bridge. Each pack has

    place(ctx) -> list of landmarks, each [kind, x, y, ground, angle, ...]

and may have

    replaces(ctx) -> indexes into ctx.buildings of parts a landmark stands in place of

which is called first, once the buildings are known (ctx.water and ctx.pitches aren't yet), so
a pack can work out its landmarks there and hand them back from place(). place() may also set
ctx.clear to polygons the landmarks cover: clear() then takes the trees, shrubs, garden walls,
gates, doors and street furniture out of them, once the map is put together.

where x, y are model metres (east, north), ground is the height the landmark stands on, angle
turns it about the vertical, and the rest depends on the kind. ctx carries the map's data:
    buildings  one dict per building part: poly, whole (the footprint before it was split by
               roof level), name, props (Overture properties), eaves and ridge (metres)
    places     Overture places as (shapely Point in lon/lat, properties)
    water      water surfaces, as written to the map (r rings, z level); place() only
    pitches    the sports pitches, as written to the map (see tools/pitches.py); place() only
    proj       lon, lat -> model x, y
    gelev      ground height at model x, y
The game draws each kind with a builder in web/src/landmarks/ (see index.ts there): a new kind
for another area is a new builder, registered by name.

Every map also gets its churches' towers and spires, as the lidar measured them (tools/towers.py),
alongside its pack's landmarks: where the pack has a spire of its own, the pack's stands.
"""
import importlib
import towers

TOWERS = []


def load(pack_id, map_id=None):
    """The pack, or None; and the towers of the map it's for."""
    TOWERS[:] = towers.load(map_id or pack_id)
    name = f"landmarks.{pack_id.replace('-', '_')}"
    try:
        return importlib.import_module(name)
    except ModuleNotFoundError as e:
        if e.name != name: raise
        return None


def replaced(pack, ctx):
    own = set(pack.replaces(ctx)) if pack is not None and hasattr(pack, "replaces") else set()
    return own | towers.replaces(ctx, TOWERS)


def place(pack, ctx):
    own = pack.place(ctx) if pack is not None else []
    return own + towers.place(ctx, TOWERS, own)


def named(ctx, text):
    """Model x, y of the first place whose name contains text, or None."""
    for g, p in ctx.places:
        if text in ((p.get("names") or {}).get("primary") or ""):
            return ctx.proj(g.x, g.y)
    return None


def clear(ctx, d):
    """Take the small things out from under the landmarks (ctx.clear) in map d, as it's written."""
    import shapely
    from shapely.geometry import Point
    areas = getattr(ctx, "clear", [])
    if not areas: return
    zone = shapely.union_all(areas)
    inside = lambda x, y: zone.contains(Point(x, y))
    for k, (ix, iy) in dict(tr=(0, 1), sb=(0, 1), dr=(0, 1), by=(0, 1), fx=(1, 2), sh=(0, 1)).items():
        if d.get(k): d[k] = [q for q in d[k] if not inside(q[ix], q[iy])]
    for k in ("gt", "fp", "dv"):
        if d.get(k): d[k] = [q for q in d[k] if not inside((q[0] + q[2]) / 2, (q[1] + q[3]) / 2)]
    # walls, fences and hedges: keep the runs of them outside
    runs = []
    for b in d.get("br") or []:
        cur = []
        for q in b["p"]:
            if inside(q[0], q[1]):
                if len(cur) > 1: runs.append(dict(b, p=cur))
                cur = []
            else: cur.append(q)
        if len(cur) > 1: runs.append(dict(b, p=cur))
    d["br"] = runs
