"""The game maps. Each is a circle inside a force field, built from the data around its centre.

Every tool takes a map id (a key of MAPS) and reads its settings with area(map_id).
"""
import math
from types import SimpleNamespace

RELEASE = "2026-09-23.1"        # Overture Maps release

MAPS = {
    "combe-down": dict(
        name="Combe Down",
        centre=(-2.34517, 51.36238),   # lon, lat: the Hadley Arms
        field=1000,                    # force field radius in metres: the play area is 2 km across
        half=1100,                     # metres from centre to each edge of the data, so scenery shows past the field
        # Local character areas, as circles (zone, x east, y north, radius) in metres from the centre.
        # First match wins. Positions come from named places in the map data; edges are approximate.
        zones=[
            ("mulberry", -660, 30, 270),     # Mulberry Park: the 2016+ redevelopment of the MoD site
            ("foxhill", -930, -230, 380),    # Foxhill: post-war estate of about 900 homes
            ("village", -60, -300, 330),     # old Combe Down: Church Road, Holy Trinity, De Montalt Place
            ("village", 60, -40, 140),       # North Road around the Hadley Arms
        ],
    ),
}


def area(map_id):
    """Settings for one map, plus its data bounding box (W, S, E, N) in lon/lat."""
    if map_id not in MAPS:
        raise SystemExit(f"unknown map {map_id!r}: choose from {', '.join(MAPS)}")
    m = SimpleNamespace(id=map_id, **MAPS[map_id])
    lon0, lat0 = m.centre
    dlon = m.half / (111320 * math.cos(math.radians(lat0)))
    dlat = m.half / 110574
    m.bbox = (lon0 - dlon, lat0 - dlat, lon0 + dlon, lat0 + dlat)
    return m
