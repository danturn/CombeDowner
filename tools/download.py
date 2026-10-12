"""Download one Overture Maps layer for the game map's bounding box.

Usage: python3 -I tools/download.py <type> <out.geojson>

Calls the overturemaps library directly with STAC disabled, because the CLI insists on
fetching stac.overturemaps.org, which some networks block. The data itself comes from S3.
"""
import os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from overturemaps.core import record_batch_reader
from overturemaps.cli import get_writer, copy
from area import BBOX, RELEASE

type_, out = sys.argv[1], sys.argv[2]
t = time.time()
reader = record_batch_reader(type_, BBOX, release=RELEASE, stac=False)
with get_writer("geojson", out, schema=reader.schema) as w:
    copy(reader, w)
print(f"{type_}: done in {time.time() - t:.0f}s")
