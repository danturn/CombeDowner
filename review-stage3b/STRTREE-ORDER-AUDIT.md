# Every STRtree query in `tools/partition`, and whether its result order matters

An STRtree's `query()` returns items in an order that depends on how the index was built - how many
items went in, and in what order. So an order-sensitive use of a `query()` result is a window- or
input-dependent answer. Measured: the same 37 buildings, in a different order from a bigger window,
made `make_plots` cut one piece into 47 plots instead of 45, with the cut lines differing by 1 cm.

34 `query(` calls. Classified by whether the order of the returned list reaches the output.

## Order matters - sorted (behaviour changes)

| where | what it does with the result | why order reaches the output |
|---|---|---|
| `plots.make_plots` `inside` | the building list the region is divided between | feeds `geoms` → `side_wall_lines` → `house_divisions` → the cut lines, and the `max()` tie-break in the growing |
| `plots.make_plots` `mine` | a `set` of seeds | a set, so already unordered; sorted for consistency of the seed loop |
| `plots.make_plots` `ev` | the evidence lines carried EXTEND and unioned into the cut network | `unary_union` of a reordered list can node differently |
| `plots.make_plots` `ev_tree` in the cost walk | `any(...)` over neighbours | only a boolean, but the `min` that follows in other places is order-sensitive; sorted for one rule |
| `plots.house_divisions` `tree.query(g.buffer(BACK_ROWS))` | neighbour pairs `j > i` | the bisector's `near` pick is a tie-break on distance equality |
| `plots.side_wall_lines` `tree.query(seg.buffer(0.6))` | which neighbour shares the wall | `shared = j` keeps the *last* match - outright order-dependent |
| `plots.back_lines` `tree.query(g.buffer(reach))` | row partners | same pattern as above |
| `plots._uncovered` `par_tree.query(...)` | the parcel lines a cut stands down along | unioned; reorder can change the noded result |
| `plots.Parcels.near` `ltree.query(...)` | the parcel rings cut into the block | unioned into the network |
| `plots.front_normals` `roads_tree.query(c.buffer(50))` | `min(near, key=distance)` | ties broken by list order |
| `plots.classify_edges` grouping | segments appended per label pair | `linemerge` output shape depends on append order |
| `checks.edges_through_buildings` | `inner[k]`, first match wins (`break`) | first hit decides the reported position |
| `openings.front_edges` | edges per building, then `min(eids, key=distance)` | ties broken by order |
| `once.worked_pieces` `btree.query(near)` | the buildings unioned to grow a block | `unary_union` of a reordered list |
| `once.worked_pieces` `ctree.query(grown)` | the corridors carved out | same |
| `surface.partition` `tree.query(rp)` | `best` by PRIORITY, first lowest wins | ties keep the first, so order picks the label |
| `buildings.clean_buildings` both queries | `out[j].difference(...)` in a loop | earlier footprints win; order decides who yields |
| `corridors.side_reach` `obstacles_tree.query(ray)` | `best` by distance | ties broken by order |
| `graph.street_graph` `src.query(...)` | `min(key=distance)` | ties broken by order |

## Order does not matter - left alone

| where | why not |
|---|---|
| `plots.on_line` | `min(...)` over distances; order cannot change a minimum |
| `plots.garden_share` | `min(...)` over distances |
| `plots.Parcels.index_of` | returns the first *containing* parcel, and a point is in at most one |
| `plots.ring_adjacency` `ftree.query` | results are added to a `set`, then filtered by length |
| `plots.make_plots` `evtree.query` cost probe | `any(...)` - a boolean, order-free |
| `assemble.relabel` | accumulates length **per label** into a dict, then takes the two largest; a sum is order-free |
| `checks.narrow_corridors`, `unreachable_plots` (three queries), `buildings_cut` | all `any(...)`/`min(...)` or a graph walk whose `seen` set makes order irrelevant |
| `openings._far_sides`, `_open_beyond` | append-then-test, no tie-break |
| `render.loose_ends` | `any(...)` - a boolean |
| `once.read_cleaned` | not a query; filters a list, preserving the file's order |

## The fix

`plots.make_plots` sorts its building list by global index before anything uses it, which is the one
that produced the wrong answer. The others that matter are sorted the same way - by the stable id each
list already carries (global building index, the line's position in its file, the edge's id) - so the
order comes from the data rather than from the index.
