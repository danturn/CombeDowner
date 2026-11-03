# Missing houses in Cape Town's Newlands squares

Status: **parked** (3 November 2026). Dan found Dean Street with no houses down one side and
Montrose Street missing houses on the live Cape Town map (fork `main` 7c215cc9). The houses are
missing from the sources we build from, not dropped by the build. This note records what each
source has there and how a fallback layer could fill the gap, for when we pick it up again.

## Where

The Dean Street meant is the one in Newlands, running from about 18.4585, -33.9690 to 18.4652,
-33.9715 beside Dean Lane and Montrose Street, west of Main Road and the Southern Line. In map
metres that is about (4064, -4821), in square 5,-4 (and 5,-3 within 150 m). The other Dean Street
in the data, at 18.414, -33.928, is a service lane in the city centre.

## What each source has

In the box 18.457..18.466 x -33.974..-33.968, round Dean Street and Montrose Street:

| Source | Buildings | Notes |
|---|---|---|
| Overture 2026-09-23.1 (`building`, what we build from) | 81 | by `sources`: 42 OpenStreetMap, 37 Microsoft ML, 2 Google Open Buildings. Our packed copy drops `sources`, so a query against Overture's S3 parquet was needed to see this |
| City of Cape Town 2D Building Footprints (ODP_SPLIT_6 layer 2), every feature | 91 | the same 91 with `BLD_HGT >= 2`, so `heights.geojson` (which keeps only those) loses nothing here: the City's own layer is just as thin |
| `heights.geojson` (the City's, as packed) | 81 by centroid | |
| Google Open Buildings v3 + Microsoft, as VIDA combines them | 630 | 608 Google, 22 Microsoft. They have the terraces and the houses either side of Dean Street, Montrose Street and the streets north of them |

Plotted over the streets, OpenStreetMap, Overture and the City all leave the blocks either side of
Dean Street and Montrose Street mostly empty, and Google's footprints fill them, house by house.

In square 5,-4 as a whole: 179 Overture footprints (by centroid), 250 of the City's, and 280
buildings in the built square (more than Overture's, as big footprints are split into wings). So
the build isn't losing these houses: they were never in its input.

Across the whole Cape Town wide circle: Overture 34,448 buildings, the City's heights layer
50,100, and VIDA 91,956 (88,612 Google, 3,344 Microsoft). Per square the City's layer often has
far more than Overture (6,-5: 1,385 to 620; 8,-2: 468 to 10). Overture appears to take Microsoft's
footprints where OpenStreetMap has nothing, but almost none of Google's.

## The fallback, as tried

The approach: a `footprints` layer packed for every map beside `building` (the common pack shape;
empty where there's nothing to add), holding only the footprints no better source already has.
Every reader of the buildings takes it with them. Best source first, each footprint kept only where
nothing already kept overlaps it (more than 10% of the smaller of the two), and at least 10 m²:

1. the buildings layer (Overture), untouched;
2. a survey's outlines where the map has one: the heights layer's (the City's footprints);
3. Google's machine-learned footprints at confidence 0.75 or more (the dataset's floor is 0.65).
   Microsoft's are left out, because Overture already takes them where OpenStreetMap has none.

What this would add:

| Map | City outlines | Google (>= 0.75) | Microsoft, if it were taken |
|---|---|---|---|
| Cape Town | 20,298 | 15,032 | 2,638 more |
| Bath (combe-down) | none | none (Google doesn't cover Europe) | 469 |
| Hackney (pembury) | none | none | 117 |
| Bradford-on-Avon | none | none | 91 |

So Cape Town would roughly double its buildings (34,448 to about 69,800), and with Microsoft left
out the three British maps would get an empty layer and build exactly as now. Without the City
outlines, Google's footprints overlapping nothing in Overture come to 42,201 at 0.65, 33,719 at
0.7, 24,986 at 0.75 and 16,537 at 0.8.

How the machine-learned footprints were fetched: VIDA's per-country GeoParquet,
`https://data.source.coop/vida/google-microsoft-open-buildings/geoparquet/by_country/country_iso=ZAF/ZAF.parquet`,
read with duckdb (httpfs, spatial) and filtered on its `bbox` column to the map's wide box. That
takes about 10 s per map. The files are named by ISO 3166-1 alpha-3, so the map needs its country in
`tools/area.py` as well as its `region`.

The prototype was not kept. Wiring it in means reading the layer wherever the build reads
`building.geojson`:

- `prep_map.py` (`L`) and `prep_wide.py` (`L`);
- the partition's own readers: `partition/data.py` `_features`, `partition/__init__.py`
  `load_layer` (adding `footprints` to `OPTIONAL`), `partition/cache.py` `Layers._load`, and the
  `whole("building")` digest in `partition/pipeline.py`, so a new layer invalidates the cached
  pieces;
- `railway.py` (platform canopies) and `canal.py`;
- the split lists: `prep_tiles.SHOPS` and `mapdata.OTHER`.

## Licences

- Google Open Buildings v3: CC BY 4.0 or ODbL, at the user's choice.
- Microsoft Global ML Building Footprints: ODbL.
- VIDA's combined dataset: ODbL.
- City of Cape Town 2D Building Footprints: the City's Open Data Policy (free for any use; credit
  "City of Cape Town"), as for the heights already used.

Any of these would need a row in `data/<map>/README.md`, and Google and the City added to the
credits in `README.md` and `web/index.html`.

## Open questions

- Phones and iPads: twice the buildings in Cape Town's squares. Measure the frame budget first.
- Quality: Google's footprints at 0.75 looked right round Dean Street, but nobody has checked them
  in shots elsewhere (informal settlements, industrial roofs, things under trees).
- Heights: Google's footprints have no measured height unless one of the City's roofs lies under
  them, so most would take the rule-based guess.
- Cleaning: the per-map count of source footprints that the build drops (in a street, overlapping,
  at a square's edge) was not measured. On these two streets it isn't the cause.
