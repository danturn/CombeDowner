"""Speed limits for the streets, in whole mph, from OpenStreetMap's tags (tools/osm.py roads).

A way's own `maxspeed` comes first ("20 mph", "national", or a bare number, which OpenStreetMap
means as km/h). Without one, the zone tags say it (`maxspeed:type`, `zone:maxspeed`,
`source:maxspeed`: "GB:zone20", "GB:nsl_single" and the like). The national limit is 60 on a single
carriageway and 70 on a dual one or a motorway; a "restricted road" (street lights, so a built-up
area) is 30.

A way with no limit in its tags takes it from the street it carries on from: where its ends meet
ways of the same kind (or the same name) and they all agree, and it is short enough to be a gap in
the tagging rather than a street of its own. Anything still without one takes the limit most of
that kind of street has in the map, measured by length, so a city that has gone 20 mph on its
residential streets gets 20 there, and a map with no tags at all gets the UK's 30 in town.

The partition's street graph (partition/once.py) and the wide map (prep_wide.py) both read the
answer from `resolve`, so a street has one limit wherever the game looks it up.
"""
import re
from collections import defaultdict

# what the game drives on and so needs a limit for (tools/partition and web/src/drivingtest.ts)
LIMITED = {"motorway", "trunk", "primary", "secondary", "tertiary", "residential", "unclassified", "living_street"}
GAP = 200.0          # metres: the longest untagged way that takes its neighbours' limit
TOWN = 30            # the UK's default in a built-up area


def kind(highway):
    return (highway or "").removesuffix("_link")


def _dual(tags):
    k = kind(tags.get("highway"))
    return k == "motorway" or (k in ("trunk", "primary") and tags.get("oneway") in ("yes", "1", "-1"))


def _zone(v, tags):
    """A limit from a GB zone token ("GB:zone20", "GB:nsl_single", "GB:30 mph", "GB:20"), or None."""
    m = re.search(r"GB:(nsl_single|nsl_dual|nsl_restricted|motorway|urban|rural|zone\s*(\d+)|(\d+)(?:\s*mph)?)", v or "")
    if not m: return None
    w = m.group(1)
    if w == "nsl_single" or w == "rural": return 70 if _dual(tags) else 60
    if w in ("nsl_dual", "motorway"): return 70
    if w in ("nsl_restricted", "urban"): return 30
    return int(m.group(2) or m.group(3))


def parse(tags):
    """The way's limit in whole mph from its own tags, or None if they don't say."""
    v = (tags.get("maxspeed") or "").split(";")[0].strip().lower()
    if v:
        if v in ("national", "uk:national", "gb:national"): return 70 if _dual(tags) else 60
        m = re.fullmatch(r"(\d+(?:\.\d+)?)\s*(mph|km/h|kmh|kph)?", v)
        if m:
            n = float(m.group(1))
            if m.group(2) == "mph": return int(round(n))
            return int(5 * round(n / 1.609344 / 5))      # (a sign in km/h, as the nearest the UK puts up)
        z = _zone(tags.get("maxspeed"), tags)
        if z: return z
    for k in ("maxspeed:type", "zone:maxspeed", "source:maxspeed"):
        z = _zone(tags.get(k), tags)
        if z: return z
    return None


def resolve(roads, log=print):
    """roads: [(LineString in metres, tags with "osm")]. Returns ({osm id: mph} for every way of a
    LIMITED kind, {kind: mph} for the rest of the map's streets of each kind)."""
    ways = [(g, p) for g, p in roads if kind(p.get("highway")) in LIMITED and g.length > 0]
    lim = {p["osm"]: parse(p) for _, p in ways}
    at = defaultdict(list)
    key = lambda c: (round(c[0], 1), round(c[1], 1))
    for i, (g, _) in enumerate(ways):
        cs = list(g.coords)
        at[key(cs[0])].append(i); at[key(cs[-1])].append(i)

    tagged = {o for o, v in lim.items() if v}
    for _ in range(3):
        took = {}
        for i, (g, p) in enumerate(ways):
            if lim[p["osm"]] or g.length > GAP: continue
            cs, k, n = list(g.coords), kind(p.get("highway")), p.get("name")
            seen = {lim[ways[j][1]["osm"]] for c in (cs[0], cs[-1]) for j in at[key(c)] if j != i
                    and (kind(ways[j][1].get("highway")) == k or (n and ways[j][1].get("name") == n))}
            seen.discard(None)
            if len(seen) == 1: took[p["osm"]] = seen.pop()
        if not took: break
        lim.update(took)

    share = defaultdict(lambda: defaultdict(float))
    for g, p in ways:
        if p["osm"] in tagged: share[kind(p.get("highway"))][lim[p["osm"]]] += g.length
    default = {k: max(share[k].items(), key=lambda kv: (kv[1], -kv[0]))[0] if share[k] else TOWN for k in LIMITED}
    inherited = sum(1 for o, v in lim.items() if v and o not in tagged)
    for g, p in ways:
        if not lim[p["osm"]]: lim[p["osm"]] = default[kind(p.get("highway"))]
    log(f"  speed limits: {len(tagged)} of {len(ways)} streets tagged, {inherited} carry on from the next, "
        f"the rest by kind: " + ", ".join(f"{k} {v}" for k, v in sorted(default.items())))
    return lim, default
