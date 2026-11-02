"""Work spread over the machine's cores at build time, with the answers in the order asked.

Each item is worked out on its own in a forked process, so it comes out exactly as it would one at a
time: the map files are the same whichever order the cores finish in. Nothing here is decided over
the network.
"""
import multiprocessing
import os

_job = None


def _run(i):
    return _job(i)


def pmap(fn, items, jobs=None, chunksize=1):
    """[fn(x) for x in items], over `jobs` forked processes (all the cores by default). `fn` may be a
    closure: the workers are forked after it is set, so it needn't pickle; only its answers do."""
    global _job
    items = list(items)
    jobs = min(jobs or os.cpu_count() or 1, len(items))
    if jobs < 2:
        return [fn(x) for x in items]
    _job = lambda i: fn(items[i])
    try:
        with multiprocessing.get_context("fork").Pool(jobs) as pool:
            return pool.map(_run, range(len(items)), chunksize=chunksize)
    finally:
        _job = None
