"""The game map: a circle 2 km across inside a force field, centred on the Hadley Arms, Combe Down, Bath."""
import math

CENTRE = (-2.34517, 51.36238)   # lon, lat
FIELD = 1000                    # force field radius in metres: the play area is 2 km across
HALF = 1100                     # metres from centre to each edge of the data, so scenery shows past the field
RELEASE = "2026-09-23.1"        # Overture Maps release

_lon0, _lat0 = CENTRE
_dlon = HALF / (111320 * math.cos(math.radians(_lat0)))
_dlat = HALF / 110574
BBOX = (_lon0 - _dlon, _lat0 - _dlat, _lon0 + _dlon, _lat0 + _dlat)   # W, S, E, N

# Local character areas, as circles (name, x east, y north, radius) in metres from the centre.
# First match wins. Positions come from named places in the map data; edges are approximate.
ZONES = [
    ("mulberry", -660, 30, 270),     # Mulberry Park: the 2016+ redevelopment of the MoD site
    ("foxhill", -930, -230, 380),    # Foxhill: post-war estate of about 900 homes
    ("village", -60, -300, 330),     # old Combe Down: Church Road, Holy Trinity, De Montalt Place
    ("village", 60, -40, 140),       # North Road around the Hadley Arms
]
