"""The review pictures: the partition top-down, the evidence, and the current build the same way.

Every stage's review artefact is these SVGs, so the drawing is kept stable: the same class names
and the same scale in every stage, so pictures from different stages compare. `render` writes one
picture from a list of (kind, [(geometry, class)]) layers; the classes are the partition's
(carriageway, pavement, path, plot, open, building) and the boundary kinds (garden_wall, fence,
hedge, railing, none). `free_ends` marks the ends of a line that touch nothing, which is the count
the plan is watching.
"""
from shapely.geometry import Point
from shapely.strtree import STRtree

STYLE = """<style>
.open{fill:#cfd9bd}.plot{fill:#e4dfd0}.carriageway{fill:#6f6e6a}.pavement{fill:#c9c6bf}.path{fill:#d8d0b8}
.building{fill:#a99a86}.garden_wall,.stone_wall,.brick_wall,.brick_wall_low,.retaining_wall{stroke:#5a4634;stroke-width:1.1;fill:none}
.wall{stroke:#5a4634;stroke-width:1.1;fill:none}.inferred{fill:none}
.fence{stroke:#8a5a2a;stroke-width:0.9;fill:none}.hedge,.hedge_low{stroke:#3f7a3a;stroke-width:1.3;fill:none}.railing{stroke:#333;stroke-width:0.8;fill:none}
.inferred{stroke-dasharray:2 1.5}.none{stroke:none}.centre{stroke:#000;stroke-width:0.3;fill:none;opacity:.35}
.ridge{stroke:#d33;stroke-width:0.7;fill:none;opacity:.8}.free{fill:#d33}
text{font:11px sans-serif;fill:#222}
</style>"""


def svg_path(g):
    parts = []
    polys = g.geoms if g.geom_type == "MultiPolygon" else [g]
    for p in polys:
        if p.is_empty:
            continue
        for r in [p.exterior] + list(p.interiors):
            cs = list(r.coords)
            parts.append("M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in cs) + " Z")
    return " ".join(parts)


def svg_line(g):
    parts = []
    ls = g.geoms if hasattr(g, "geoms") else [g]
    for l in ls:
        cs = list(l.coords)
        if len(cs) > 1:
            parts.append("M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in cs))
    return " ".join(parts)


def render(path, bbox, layers, title):
    x0, y0, x1, y1 = bbox
    w, h = x1 - x0, y1 - y0
    S = 2.0
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w * S:.0f} {h * S + 30:.0f}" '
           f'width="{w * S:.0f}" height="{h * S + 30:.0f}">',
           STYLE, f'<rect width="100%" height="100%" fill="#f4f1ea"/><text x="8" y="20">{title}</text>',
           f'<g transform="translate(0,30) scale({S}) translate({-x0},{y1}) scale(1,-1)">']
    for kind, items in layers:
        for g, cls in items:
            if g.is_empty:
                continue
            if kind == "poly":
                out.append(f'<path class="{cls}" d="{svg_path(g)}"/>')
            elif kind == "line":
                out.append(f'<path class="{cls}" d="{svg_line(g)}"/>')
            elif kind == "dot":
                r = 1.6 if cls != "free" else 4.0
                out.append(f'<circle class="{cls}" cx="{g.x:.1f}" cy="{g.y:.1f}" r="{r}"/>')
    out.append("</g></svg>")
    open(path, "w").write("\n".join(out))


def free_ends(lines, others_union, tol=1.0):
    """How many of the lines have an end that touches nothing (no other line, no building)."""
    n, pts = edges_touching_nothing(lines, others_union, tol)
    return n, pts


def edges_touching_nothing(lines, others_union, tol=1.0, square=None, edge=1.0):
    """Every end of a line that touches nothing: no other line or building within tol. Returns the
    full list of such points. When a square is given, `edge` metres past its boundary count as on
    the square's edge: a boundary that runs out of the square is not a loose end, it is the edge,
    so the caller can count the two separately."""
    tree = STRtree(lines)
    pts = []
    for i, l in enumerate(lines):
        # a closed ring has no end: its first and last points coincide, so a boundary drawn as a
        # loop is not a boundary stopping in mid-air
        if Point(l.coords[0]).distance(Point(l.coords[-1])) < tol:
            continue
        for p in (Point(l.coords[0]), Point(l.coords[-1])):
            if others_union is not None and others_union.distance(p) < tol:
                continue
            if any(j != i and lines[j].distance(p) < tol for j in tree.query(p.buffer(tol))):
                continue
            pts.append(p)
    return len(pts), pts


def loose_ends(lines, others_union, square, tol=1.0, edge=1.0):
    """Free ends split into (on the square's edge, inside it). A free end within `edge` metres of
    the square's *outline* is the boundary running out of the square, not a loose end; anything
    further in is a boundary that stops in mid-air and should not be there. This is the plan's
    "loose ends" figure counted as its own thing, so a stage can be judged on it alone.

    Measured against square.boundary, not square: the distance to a polygon is zero for every
    point inside it, which would count every loose end as on the edge and could never fail."""
    _, pts = edges_touching_nothing(lines, others_union, tol)
    outline = square.boundary
    on_edge = sum(1 for p in pts if outline.distance(p) <= edge)
    return on_edge, len(pts) - on_edge, pts
