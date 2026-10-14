#!/usr/bin/env bash
# Build the map (and/or take screenshots) of one commit on Dan's Mac, in one command, so a request
# from an agent is one line to run. It is for the Mac's Remote Control session, but runs on any
# machine with git, Python (numpy, shapely, Pillow) and Node.
#
#   tools/mac_build.sh <commit or branch> [--map] [--only "ti,tj ti,tj"] [--check] [--shots views.json]
#                      [--push <branch>] [--out <dir>]
#
#   --map           rebuild the map: canal, railway, every square, the whole-city map and the pubs
#                   (the order in README.md, "Rebuild a map")
#   --only "..."    rebuild only those squares (quick looks; the village's nine are stitched together,
#                   so give all nine or none of them)
#   --check         run the clash check (tools/check_map.py --all) after building, and keep its report
#   --shots f.json  build the game and take the views in f.json with tools/shoot.mjs
#   --push b        commit the rebuilt map files to branch b on Dan's fork (danturn/CombeDowner)
#   --out d         where the report goes (default ~/combedowner-builds/<short commit>)
#
# What it does, so nothing is left behind and two requests never fight over the machine:
#  - waits its turn: only one of these runs at a time (a lock in ~/.combedowner-build.lock);
#  - checks the commit out into a throwaway worktree, never touching /Users/dan/CombeDowner's own files;
#  - if that commit's map was built here before with the same options, it says so and reuses it;
#  - shares node_modules between worktrees with the same package-lock.json;
#  - writes build.log, check.txt (with --check), changed.txt (which map files changed), the shots
#    and timings.txt to the report folder, and removes the worktree at the end, even if it fails.
set -euo pipefail

REPO=${COMBEDOWNER_REPO:-/Users/dan/CombeDowner}
VENV=${COMBEDOWNER_VENV:-/Users/dan/.venvs/combedowner}
CACHE=${COMBEDOWNER_CACHE:-$HOME/.cache/combedowner}
MAP=combe-down
HERE=$(cd "$(dirname "$0")" && pwd)       # this copy's tools, for the screenshot tool on older commits
hash16() { if command -v shasum >/dev/null; then shasum; else sha1sum; fi | cut -c1-16; }

ref=${1:?usage: tools/mac_build.sh <commit or branch> [--map] [--only \"ti,tj ...\"] [--check] [--shots views.json] [--push branch] [--out dir]}
shift
do_map= only= check= shots= push= out=
while [ $# -gt 0 ]; do
  case $1 in
    --map) do_map=1 ;;
    --only) only=$2; do_map=1; shift ;;
    --check) check=1 ;;
    --shots) shots=$(cd "$(dirname "$2")" && pwd)/$(basename "$2"); shift ;;
    --push) push=$2; shift ;;
    --out) out=$2; shift ;;
    *) echo "unknown option $1" >&2; exit 2 ;;
  esac
  shift
done

# ---- one at a time ------------------------------------------------------------------------------
LOCK=$HOME/.combedowner-build.lock
until mkdir "$LOCK" 2>/dev/null; do
  # a lock left by a build that was killed outright: an hour is far longer than any build
  if [ -n "$(find "$LOCK" -maxdepth 0 -mmin +60 2>/dev/null)" ]; then echo "clearing a stale lock"; rm -rf "$LOCK"; continue; fi
  echo "waiting: another build is running ($(cat "$LOCK/who" 2>/dev/null || echo unknown))"
  sleep 5
done
echo "$ref since $(date +%H:%M:%S)" > "$LOCK/who"

WT=
cleanup() {
  [ -n "$WT" ] && git -C "$REPO" worktree remove --force "$WT" 2>/dev/null || true
  rm -rf "$LOCK"
}
trap cleanup EXIT

# ---- the commit, in its own worktree ------------------------------------------------------------
git -C "$REPO" fetch -q origin 2>/dev/null || true
git -C "$REPO" fetch -q https://github.com/danturn/CombeDowner.git "$ref" 2>/dev/null || true
sha=$(git -C "$REPO" rev-parse --verify -q "$ref^{commit}" || git -C "$REPO" rev-parse --verify -q "origin/$ref^{commit}" || git -C "$REPO" rev-parse FETCH_HEAD)
short=${sha:0:7}
out=${out:-$HOME/combedowner-builds/$short}
mkdir -p "$out"
out=$(cd "$out" && pwd)
: > "$out/timings.txt"
stamp() { echo "$1: $(( $(date +%s) - $2 ))s" | tee -a "$out/timings.txt"; }
echo "commit $sha ($ref)" | tee "$out/commit.txt"

WT=$(mktemp -d "${TMPDIR:-/tmp}/combedowner-$short-XXXX")
git -C "$REPO" worktree add -q --detach "$WT" "$sha"
cd "$WT"
# shellcheck disable=SC1091
[ -f "$VENV/bin/activate" ] && . "$VENV/bin/activate"

# ---- the map ------------------------------------------------------------------------------------
key="$sha${only:+ only $only}"
done_mark=$CACHE/maps/$(echo "$key" | hash16)
if [ -n "$do_map" ] && [ -d "$done_mark" ]; then
  echo "this commit's map was built here before (${only:-every square}): reusing it"
  cp -R "$done_mark/maps/." web/public/maps/
  cp "$done_mark"/*.txt "$out/" 2>/dev/null || true
  do_map=
  reused=1
fi
if [ -n "$do_map" ]; then
  t=$(date +%s)
  {
    python3 -I tools/mapdata.py unpack $MAP
    python3 -I tools/canal.py $MAP data/raw/$MAP/wide web/public/maps/$MAP-canal.json
    python3 -I tools/railway.py $MAP data/raw/$MAP/wide web/public/maps/$MAP-rail.json
    if [ -n "$only" ]; then
      # shellcheck disable=SC2086
      python3 -I tools/prep_tiles.py $MAP data/raw/$MAP/wide web/public/maps/$MAP --force --only $only
    else
      python3 -I tools/prep_tiles.py $MAP data/raw/$MAP/wide web/public/maps/$MAP --force
      python3 -I tools/prep_wide.py $MAP data/raw/$MAP/wide web/public/maps/$MAP-wide.json
      python3 -I tools/pubs.py $MAP data/raw/$MAP/wide web/public/maps/$MAP-pubs.json
    fi
  } > "$out/build.log" 2>&1 || { stamp "map build FAILED" "$t"; tail -30 "$out/build.log"; exit 1; }
  stamp "map build" "$t"
  git status --short web/public/maps > "$out/changed.txt"
  echo "$(wc -l < "$out/changed.txt" | tr -d ' ') map files changed"
fi
if [ -n "$check" ]; then
  t=$(date +%s)
  [ -d data/raw/$MAP/wide ] || python3 -I tools/mapdata.py unpack $MAP > /dev/null
  python3 -I tools/check_map.py $MAP web/public/maps --all > "$out/check.txt" 2>&1 || true
  stamp "clash check" "$t"
fi
if [ -n "$do_map" ]; then
  mkdir -p "$done_mark/maps"
  git ls-files -m -o --exclude-standard web/public/maps | while read -r f; do
    mkdir -p "$done_mark/maps/$(dirname "${f#web/public/maps/}")"
    cp "$f" "$done_mark/maps/${f#web/public/maps/}"
  done
  cp "$out"/changed.txt "$out"/check.txt "$done_mark/" 2>/dev/null || true
fi

# ---- screenshots --------------------------------------------------------------------------------
if [ -n "$shots" ]; then
  t=$(date +%s)
  lock=$(hash16 < web/package-lock.json)
  nm=$CACHE/node_modules/$lock
  if [ ! -d "$nm/node_modules" ]; then
    mkdir -p "$nm" && cp web/package.json web/package-lock.json "$nm/"
    (cd "$nm" && npm ci --no-audit --no-fund --silent && npm install --no-save --silent playwright@1.56.1)
  fi
  ln -s "$nm/node_modules" web/node_modules
  (cd web && npx vite build --logLevel error)
  stamp "game build" "$t"
  t=$(date +%s)
  PW="$nm/node_modules/playwright" node "$HERE/shoot.mjs" "$shots" --out "$out/shots" --tag "$short"
  stamp "screenshots" "$t"
fi

# ---- send the map back as a branch on Dan's fork ------------------------------------------------
if [ -n "$push" ] && { [ -n "$do_map" ] || [ -n "${reused:-}" ]; }; then
  git add web/public/maps
  if git diff --cached --quiet; then echo "the map is the same as the commit's: nothing to push"
  else
    git -c user.name="Dan's Mac" -c user.email="noreply@users.noreply.github.com" commit -q -m "The map is rebuilt on Dan's Mac from $short"
    git push -q https://github.com/danturn/CombeDowner.git "HEAD:refs/heads/$push"
    echo "pushed the rebuilt map to danturn/CombeDowner $push ($(git rev-parse --short HEAD))"
  fi
fi
echo "report in $out"
