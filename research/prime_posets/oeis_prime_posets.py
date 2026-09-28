"""Count unlabeled prime posets by cardinality and exact order dimension.

Run: python oeis_prime_posets.py --max-size 9 --workers 8
Requires Python >= 3.10 and python-igraph (tested with igraph 1.0.0).

The program does not read the published counts or any other local file.
It enumerates every unlabeled poset by adding one maximal point, rejects
posets with a nontrivial module, and computes each remaining poset's exact
order dimension.  BLISS (through igraph) supplies canonical graph labels.

Representation: upper[x] is a bit mask of all points strictly above x.
Thus the directed graph has an edge x -> y for every strict comparison x < y.
The graph encodes the full transitive closure, not just cover relations.

This is an exhaustive algorithm, not a fast formula.  It was run through
size 9; higher sizes may need much more time and memory.  A local Python
installation and python-igraph are required.  The worker count affects only
parallelism, not the result.
"""

from __future__ import annotations

import argparse
import os
from collections import Counter
from functools import lru_cache
from multiprocessing import Pool
from time import perf_counter

import igraph


def lower_masks(upper: tuple[int, ...]) -> tuple[int, ...]:
    """Return the strict predecessor mask of each point."""
    lower = [0] * len(upper)
    for x, successors in enumerate(upper):
        for y in range(len(upper)):
            if successors >> y & 1:
                lower[y] |= 1 << x
    return tuple(lower)


def canonical(upper: tuple[int, ...]) -> tuple[int, ...]:
    """Use BLISS to give isomorphic directed comparability graphs one key."""
    n = len(upper)
    edges = [(x, y) for x in range(n) for y in range(n) if upper[x] >> y & 1]
    graph = igraph.Graph(n, edges=edges, directed=True)
    graph = graph.permute_vertices(graph.canonical_permutation())
    rows = [0] * n
    for x, y in graph.get_edgelist():
        rows[x] |= 1 << y
    return tuple(rows)


def children(upper: tuple[int, ...]) -> set[tuple[int, ...]]:
    """Add a maximal point above each order ideal, then remove isomorphs."""
    n = len(upper)
    lower = lower_masks(upper)
    result = set()
    for ideal in range(1 << n):
        if any((ideal >> x & 1) and (lower[x] & ~ideal) for x in range(n)):
            continue
        enlarged = tuple(
            successors | ((ideal >> x & 1) << n) for x, successors in enumerate(upper)
        ) + (0,)
        result.add(canonical(enlarged))
    return result


def is_prime(upper: tuple[int, ...]) -> bool:
    """Test every proper subset of size >= 2 for the module property."""
    n = len(upper)
    lower = lower_masks(upper)
    full = (1 << n) - 1
    for module in range(1, full):
        if module.bit_count() < 2:
            continue
        for outside in range(n):
            if module >> outside & 1:
                continue
            below = module & lower[outside]
            above = module & upper[outside]
            if below not in (0, module) or above not in (0, module):
                break
        else:
            return False
    return True


def linear_extensions(upper: tuple[int, ...]):
    """Yield every topological ordering of the poset."""
    n = len(upper)
    lower = lower_masks(upper)
    all_points = (1 << n) - 1

    def visit(done: int, order: tuple[int, ...]):
        if done == all_points:
            yield order
            return
        for x in range(n):
            bit = 1 << x
            if not done & bit and lower[x] & ~done == 0:
                yield from visit(done | bit, order + (x,))

    yield from visit(0, ())


def order_dimension(upper: tuple[int, ...]) -> int:
    """Minimum number of linear extensions that reverse all critical pairs.

    An ordered incomparable pair (x,y) is critical when every point below x
    is below y, and every point above y is above x.  The critical-pair
    theorem says that linear extensions form a realizer exactly when they
    collectively reverse every such pair.  We solve the resulting finite
    set-cover problem exactly, trying dimensions in increasing order.
    """
    n = len(upper)
    lower = lower_masks(upper)
    critical = []
    for x in range(n):
        for y in range(n):
            if x == y or upper[x] >> y & 1 or upper[y] >> x & 1:
                continue
            if lower[x] & ~lower[y] == 0 and upper[y] & ~upper[x] == 0:
                critical.append((x, y))
    if not critical:
        return 1

    full = (1 << len(critical)) - 1
    reversal_masks = set()
    for order in linear_extensions(upper):
        rank = [0] * n
        for i, x in enumerate(order):
            rank[x] = i
        reversal_masks.add(sum(
            1 << i for i, (x, y) in enumerate(critical) if rank[y] < rank[x]
        ))

    # An extension whose reversal set is contained in another can be omitted.
    masks = sorted(reversal_masks, key=lambda mask: (-mask.bit_count(), mask))
    maximal = []
    for mask in masks:
        if not any(mask & other == mask for other in maximal):
            maximal.append(mask)
    masks = maximal

    for d in range(1, max(2, n // 2) + 1):
        @lru_cache(None)
        def cover(remaining: int, depth: int) -> bool:
            if not remaining:
                return True
            if not depth:
                return False
            if depth == 1:
                return any(mask & remaining == remaining for mask in masks)
            # Every solution must reverse this pair.  Choose the pair with
            # the fewest candidate extensions to reduce the search tree.
            bits = [1 << i for i in range(len(critical)) if remaining >> i & 1]
            bit = min(bits, key=lambda b: sum(bool(mask & b) for mask in masks))
            return any(cover(remaining & ~mask, depth - 1)
                       for mask in masks if mask & bit)

        if cover(full, d):
            return d
    raise AssertionError("dimension exceeds the finite-poset bound")


def dimension_counts(primes: list[tuple[int, ...]], workers: int) -> dict[int, int]:
    """Classify each prime poset; multiprocessing avoids changing the math."""
    counts: Counter[int] = Counter()
    if workers == 1:
        dimensions = map(order_dimension, primes)
        for dimension in dimensions:
            counts[dimension] += 1
    else:
        with Pool(processes=workers) as pool:
            for dimension in pool.imap_unordered(order_dimension, primes, chunksize=8):
                counts[dimension] += 1
    return dict(sorted(counts.items()))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--max-size", type=int, default=10)
    parser.add_argument("--workers", type=int, default=min(8, os.cpu_count() or 1))
    args = parser.parse_args()
    if args.max_size < 4 or args.workers < 1:
        parser.error("--max-size must be at least 4 and --workers at least 1")

    start = perf_counter()
    posets = {()}
    for k in range(1, args.max_size + 1):
        posets = {child for parent in posets for child in children(parent)}
        if k < 4:
            print(f"k={k} unlabeled_posets={len(posets)}", flush=True)
            continue
        primes = [poset for poset in posets if is_prime(poset)]
        print(f"k={k} unlabeled_posets={len(posets)} prime_posets={len(primes)} "
              f"classifying...", flush=True)
        counts = dimension_counts(primes, args.workers)
        assert sum(counts.values()) == len(primes)
        row = [counts.get(d, 0) for d in range(2, k // 2 + 1)]
        assert sum(row) == len(primes)
        print(f"k={k} dimension_counts={counts} row={row} "
              f"elapsed_seconds={perf_counter() - start:.1f}", flush=True)


if __name__ == "__main__":
    main()
