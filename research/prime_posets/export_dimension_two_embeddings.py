"""Export one 2D point embedding per unlabeled prime poset of each size.

Usage: python export_dimension_two_embeddings.py OUTPUT_DIR --max-size 9 --workers 8

Each output file contains permutations.  The point at x-rank i has y-rank
permutation[i-1]; x and y are ranks in two linear extensions.  For a
dimension-2 poset, coordinatewise order is exactly its partial order.
This recognizes dimension 2 directly by finding two linear extensions with
opposite orders on every incomparable pair.  It does not call the critical-
pair dimension routine used for the OEIS count.
"""

from __future__ import annotations

import argparse
import json
import os
from multiprocessing import Pool
from pathlib import Path

from oeis_prime_posets import children, is_prime, linear_extensions


def permutation_if_dimension_two(upper: tuple[int, ...]) -> tuple[int, ...] | None:
    n = len(upper)
    incomparable = [(x, y) for x in range(n) for y in range(x + 1, n)
                    if not (upper[x] >> y & 1) and not (upper[y] >> x & 1)]
    if not incomparable:
        return None
    full = (1 << len(incomparable)) - 1
    seen: dict[int, tuple[int, ...]] = {}
    for order in linear_extensions(upper):
        rank = {x: i for i, x in enumerate(order)}
        mask = sum(1 << i for i, (x, y) in enumerate(incomparable)
                   if rank[x] < rank[y])
        opposite = seen.get(full ^ mask)
        if opposite is not None:
            x_rank = {x: i + 1 for i, x in enumerate(opposite)}
            y_rank = {x: i + 1 for i, x in enumerate(order)}
            for x in range(n):
                for y in range(n):
                    relation = bool(upper[x] >> y & 1)
                    geometry = x_rank[x] < x_rank[y] and y_rank[x] < y_rank[y]
                    assert relation == geometry
            return tuple(y_rank[x] for x in opposite)
        seen.setdefault(mask, order)
    return None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output_dir", type=Path)
    parser.add_argument("--max-size", type=int, default=9)
    parser.add_argument("--workers", type=int, default=min(8, os.cpu_count() or 1))
    args = parser.parse_args()
    if args.max_size < 4 or args.workers < 1:
        parser.error("--max-size must be at least 4 and --workers at least 1")
    args.output_dir.mkdir(parents=True, exist_ok=True)

    posets = {()}
    for k in range(1, args.max_size + 1):
        posets = {child for parent in posets for child in children(parent)}
        if k < 4:
            continue
        primes = sorted(p for p in posets if is_prime(p))
        if args.workers > 1 and k >= 8:
            with Pool(processes=args.workers) as pool:
                results = pool.imap_unordered(permutation_if_dimension_two,
                                              primes, chunksize=16)
                permutations = sorted(p for p in results if p is not None)
        else:
            permutations = sorted(p for p in map(permutation_if_dimension_two,
                                                 primes) if p is not None)
        assert len(permutations) == len(set(permutations))
        path = args.output_dir / f"n-{k}.json"
        path.write_text(json.dumps(permutations, separators=(",", ":")),
                        encoding="utf-8")
        print(f"n={k} unlabeled={len(posets)} prime={len(primes)} "
              f"dimension2={len(permutations)} bytes={path.stat().st_size}",
              flush=True)


if __name__ == "__main__":
    main()
