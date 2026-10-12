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
