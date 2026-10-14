"""Build the game as one self-contained HTML file (code, styles and one map inline).

Usage: python3 -I tools/build_single.py <web dir> <out.html> [map, default combe-down]

Runs a Vite build with VITE_SOLO_ONLY=1 into <web dir>/dist-single, then inlines the script,
the stylesheet and public/maps/<map>.json (for a map whose ground all comes in squares, its village's
nine stitched into one by tools/stitch.py). The result needs no server: open it straight from disk.
"""
import json, os, re, subprocess, sys

web, out = sys.argv[1], sys.argv[2]
map_id = sys.argv[3] if len(sys.argv) > 3 else "combe-down"
dist = os.path.join(web, "dist-single")
subprocess.run(["npx", "vite", "build", "--outDir", "dist-single", "--emptyOutDir"], cwd=web, check=True,
               env={**os.environ, "VITE_SOLO_ONLY": "1"})
html = open(os.path.join(dist, "index.html")).read()
read = lambda rel: open(os.path.join(dist, rel.lstrip("./"))).read()

def script(m):
    js = read(m.group(1)).replace("</script", "<\\/script")
    return f'<script type="module">{js}</script>'

def style(m):
    return f"<style>{read(m.group(1))}</style>"

html = re.sub(r'<script type="module" crossorigin src="([^"]+)"></script>', script, html)
html = re.sub(r'<link rel="stylesheet" crossorigin href="([^"]+)">', style, html)
# a map whose ground all comes in squares (the village and the rest of Bath) carries its village's
# nine inline, stitched into one, with nothing round them
path = os.path.join(web, "public", "maps", f"{map_id}.json")
if "t" not in json.load(open(path)):
    path = os.path.join(dist, f"{map_id}-village.json")
    subprocess.run([sys.executable, "-I", os.path.join(os.path.dirname(os.path.abspath(__file__)), "stitch.py"), map_id,
                    os.path.join(web, "public", "maps", map_id), path], check=True)
data = open(path).read()
assert "</" not in data
html = html.replace("</body>", f'<script type="application/json" id="mapdata" data-map="{map_id}">{data}</script>\n</body>')
# the module script must run after the map data is in the document
m = re.search(r'<script type="module">.*?</script>', html, re.S)
html = html[:m.start()] + html[m.end():]
html = html.replace("</body>", m.group(0) + "\n</body>")
open(out, "w").write(html)
print(f"{out}: {len(html) / 1e6:.1f} MB")
