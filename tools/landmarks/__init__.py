"""Hand-made landmarks, as one pack per map: tools/landmarks/<map id>.py, with - in the id
written as _ (combe_down.py for combe-down). A map with no pack simply has none.

Everything else in the build is generic, worked out from the open data for any area. A pack is
for what the data can't show: a spire, a portico, a bridge. Each pack has

    place(ctx) -> list of landmarks, each [kind, x, y, ground, angle, ...]

and may have

    replaces(ctx) -> indexes into ctx.buildings of parts a landmark stands in place of

which is called first, once the buildings are known (ctx.water isn't yet), so a pack can work
out its landmarks there and hand them back from place().

where x, y are model metres (east, north), ground is the height the landmark stands on, angle
turns it about the vertical, and the rest depends on the kind. ctx carries the map's data:
    buildings  one dict per building part: poly, whole (the footprint before it was split by
               roof level), name, props (Overture properties), eaves and ridge (metres)
    places     Overture places as (shapely Point in lon/lat, properties)
    water      water surfaces, as written to the map (r rings, z level); place() only
    proj       lon, lat -> model x, y
    gelev      ground height at model x, y
The game draws each kind with a builder in web/src/landmarks/ (see index.ts there): a new kind
for another area is a new builder, registered by name.
"""
import importlib


def load(map_id):
    """The map's pack, or None."""
    name = f"landmarks.{map_id.replace('-', '_')}"
    try:
        return importlib.import_module(name)
    except ModuleNotFoundError as e:
        if e.name != name: raise
        return None


def replaced(pack, ctx):
    return set(pack.replaces(ctx)) if pack is not None and hasattr(pack, "replaces") else set()


def place(pack, ctx):
    return pack.place(ctx) if pack is not None else []


def named(ctx, text):
    """Model x, y of the first place whose name contains text, or None."""
    for g, p in ctx.places:
        if text in ((p.get("names") or {}).get("primary") or ""):
            return ctx.proj(g.x, g.y)
    return None
