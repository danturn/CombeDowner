"""Proof of concept: build one square of the map as a partition of the ground.

Usage: python3 -I tools/partition_poc.py <ti> <tj> <out dir> [--raw <dir with the .geojson layers>]
                                          [--terrain <dir of terrarium PNGs>]

A thin wrapper round the `tools/partition/` package (stage 1 of the plan split the single file into
modules); the docstring there says what the partition is and what each step decides. Kept so the
existing commands and the plan's table keep working until stage 4 removes it.

    python3 -I tools/partition_poc.py 1 1 out/1_1 --raw data/raw/combe-down/wide --terrain data/raw/combe-down/wide/terrain15
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from partition.__main__ import main

if __name__ == "__main__":
    main()
