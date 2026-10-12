"""The game maps. Each is a circle inside a force field, built from the data around its centre.

Every tool takes a map id (a key of MAPS) and reads its settings with area(map_id). Each map has:
- centre (lon, lat): the origin of the map's coordinates;
- field (force field radius, metres), around field_centre (x east, y north, metres from the centre;
  the centre itself if not given), and half (metres from the field's centre to each edge of the
  data, so scenery shows past the field);
- zones: local character areas as circles (zone, x east, y north, radius) in metres from the
  centre, first match wins, and default_zone for everywhere else (see buildings.py);
- view (x, y): what the menu backdrop circles around.
"""
import math
from types import SimpleNamespace

RELEASE = "2026-09-23.1"        # Overture Maps release

MAPS = {
    "combe-down": dict(
        name="Combe Down",
        centre=(-2.34517, 51.36238),   # lon, lat: the Hadley Arms
        # the force field takes in the old village circle (1 km round the Hadley Arms) and reaches
        # north-west down Lyncombe Vale to the far end of the Devonshire tunnel; the Combe Down
        # tunnel runs right under the village
        field=1465,                    # force field radius in metres: the play area is 2.9 km across
        field_centre=(-410, 220),
        half=1565,
        # positions come from named places in the map data; edges are approximate
        zones=[
            ("mulberry", -660, 30, 270),     # Mulberry Park: the 2016+ redevelopment of the MoD site
            ("foxhill", -930, -230, 380),    # Foxhill: post-war estate of about 900 homes
            ("village", -60, -300, 330),     # old Combe Down: Church Road, Holy Trinity, De Montalt Place
            ("village", 60, -40, 140),       # North Road around the Hadley Arms
            ("victorian", -1350, 1050, 450), # Bear Flat, Wellsway and Devonshire Buildings: Bath stone terraces
            ("victorian", -750, 1150, 350),  # Lyncombe Vale and Lyncombe Hill: Victorian villas
        ],
        spawn="Firs Field",            # where everyone starts: the green between North Road, The Firs and The Avenue
        default_zone="suburb",
    ),
    "victoria-park": dict(
        name="Royal Victoria Park",
        # between the Great Dell at the park's west end and the Circus, which both just fit
        centre=(-2.3708, 51.3868),
        field=600,                     # 1.2 km across
        half=750,
        zones=[
            ("georgian", 190, 60, 150),      # the Royal Crescent and Crescent Lane
            ("georgian", 75, 20, 155),       # Marlborough Buildings
            ("georgian", 450, -70, 210),     # Brock Street, the Circus, Rivers Street, Catharine Place, Bennett Street
            ("georgian", 470, -320, 130),    # Gay Street, Queen's Parade, Queen Square
            ("georgian", 200, 250, 110),     # St James's Square
            ("georgian", 99, -470, 90),      # Norfolk Crescent
            ("riverside", -360, -420, 200),  # Western Riverside, between Upper Bristol Road and the Avon
            ("victorian", -560, 120, 260),   # Park Lane and Weston Road, west of the park
            ("victorian", -60, 520, 260),    # Cavendish Road and Sion Hill, up the hill to the north
        ],
        default_zone="bath",
        view=(170, 50),                # the Royal Crescent, seen across its lawn
    ),
}


def area(map_id):
    """Settings for one map, plus its data bounding box (W, S, E, N) in lon/lat, centred on the field."""
    if map_id not in MAPS:
        raise SystemExit(f"unknown map {map_id!r}: choose from {', '.join(MAPS)}")
    m = SimpleNamespace(id=map_id, **{"field_centre": (0, 0), **MAPS[map_id]})
    lon0, lat0 = m.centre
    kx, ky = 111320 * math.cos(math.radians(lat0)), 110574
    m.middle = (lon0 + m.field_centre[0] / kx, lat0 + m.field_centre[1] / ky)   # lon, lat of the field's centre
    mlon, mlat = m.middle
    m.bbox = (mlon - m.half / kx, mlat - m.half / ky, mlon + m.half / kx, mlat + m.half / ky)
    return m
