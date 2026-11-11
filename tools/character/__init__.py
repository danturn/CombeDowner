"""Local character: what each building is, measured from open data, and the local habits that follow.

A town's habits (railings round a basement area, a stone wall to a front garden, a parapet in front
of the roof) belong to the kind of building, not to the town: a Georgian terrace in Bristol has the
same area railings as one in Bath. So the build measures each building's character from the data
(tools/character/measure.py), the same fields for every map whatever the sources were, and looks up
what to build in a table of rules (rules.json beside this file), which is data anyone can read and
change. A map can add to or change the table with tools/character/maps/<map>.json.

The one call for a build step:

    from character import decide
    got = decide("area_railings", thing, ctx)      # {"railings": "area", "rule": "town house area"}

thing is what is being built (a flight's edge, a garden boundary, a building), as a dict of what the
step knows of it; ctx is its setting: {"building": the nearest building's character (measure.py's
Survey.near), "zone": the map's zone there (area.py), ...}. The table's conditions name fields as
"thing.front_gap" or "building.form". The first rule whose conditions all hold gives the answer;
if none does, the decision's "otherwise" does.

The conditions, each a field and a test of it:
- a value: the field is that value; a list: the field is one of them;
- {"before": year} / {"after": year}: a building's "built" years (earliest, latest) start before
  the year / end after it;
- {"atmost": n}, {"atleast": n}, {"below": n}, {"above": n}: a number;
- {"not": value or list}: the field is anything else, an unknown one included;
- {"known": true or false}: the data says something of the field, or nothing;
- "any": [conditions, ...]: at least one of these sets holds.
A field the data says nothing of fails every test but "not" and "known": false, so a rule only
holds where the data shows it does.
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
_tables = {}


def rules(map_id=None):
    """The rules table for a map: the shared one, with the map's own file over it, if it has one.
    A map's rule with the same name as a shared one replaces it ("off": true drops it); its other
    rules are tried before the shared ones. Its styles are added to or replace the shared ones."""
    if map_id in _tables: return _tables[map_id]
    with open(os.path.join(HERE, "rules.json")) as f: table = json.load(f)
    own = os.path.join(HERE, "maps", f"{map_id}.json") if map_id else None
    if own and os.path.exists(own):
        with open(own) as f: mine = json.load(f)
        table["styles"] = {**table.get("styles", {}), **mine.get("styles", {})}
        table["evidence"] = {**table.get("evidence", {}), **mine.get("evidence", {})}
        for name, d in mine.get("decisions", {}).items():
            base = table["decisions"].setdefault(name, {"rules": [], "otherwise": {}})
            theirs = {r["name"]: r for r in d.get("rules", [])}
            kept = [theirs.pop(r["name"], r) for r in base["rules"]]
            base["rules"] = [r for r in list(theirs.values()) + kept if not r.get("off")]
            if "otherwise" in d: base["otherwise"] = d["otherwise"]
    _tables[map_id] = table
    return table


def field(ctx, path):
    v = ctx
    for k in path.split("."):
        if not isinstance(v, dict): return None
        v = v.get(k)
    return v


def _span(v):
    """A field as (earliest, latest): a building's built years, or a single number."""
    if isinstance(v, (list, tuple)) and len(v) == 2: return v
    return (v, v) if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def test(v, want):
    if isinstance(want, list): return v is not None and v in want
    if not isinstance(want, dict): return v is not None and v == want
    for op, arg in want.items():
        if op == "not":
            if v in (arg if isinstance(arg, list) else [arg]) and v is not None: return False
        elif op == "known":
            if (v is not None) != bool(arg): return False
        elif op in ("before", "after"):
            s = _span(v)
            if s is None or (s[0] >= arg if op == "before" else s[1] <= arg): return False
        elif op in ("atmost", "atleast", "below", "above"):
            if not isinstance(v, (int, float)) or isinstance(v, bool): return False
            if not {"atmost": v <= arg, "atleast": v >= arg, "below": v < arg, "above": v > arg}[op]: return False
        else:
            raise ValueError(f"unknown test {op!r} in the rules table")
    return True


def holds(when, ctx):
    for path, want in when.items():
        if path == "any":
            if not any(holds(w, ctx) for w in want): return False
        elif not test(field(ctx, path), want):
            return False
    return True


def decide(decision, thing, ctx, map_id=None):
    """What the rules table says to build for one thing in its setting (see the top). The answer is
    the matching rule's "then", with "rule" naming it (None where the decision's otherwise answers)."""
    table = rules(map_id)
    if decision not in table["decisions"]: raise KeyError(f"no decision {decision!r} in the rules table")
    d = table["decisions"][decision]
    whole = {**ctx, "thing": thing}
    for r in d["rules"]:
        if holds(r["when"], whole): return {**r["then"], "rule": r["name"]}
    return {**d.get("otherwise", {}), "rule": None}
