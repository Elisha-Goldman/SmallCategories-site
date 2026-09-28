"""Check that exported coordinate drawings are distinct prime posets.

Usage: python verify_embedding_data.py research/prime_posets/page/data
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from oeis_prime_posets import canonical, is_prime


def poset_from_permutation(permutation: list[int]) -> tuple[int, ...]:
    return tuple(sum(1 << j for j in range(i + 1, len(permutation))
                     if permutation[i] < permutation[j])
                 for i in range(len(permutation)))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("data_dir", type=Path)
    args = parser.parse_args()

    for n in range(4, 10):
        permutations = json.loads((args.data_dir / f"n-{n}.json").read_text())
        keys = set()
        for permutation in permutations:
            assert len(permutation) == n
            assert sorted(permutation) == list(range(1, n + 1))
            poset = poset_from_permutation(permutation)
            assert is_prime(poset), (n, permutation)
            key = canonical(poset)
            assert key not in keys, (n, permutation)
            keys.add(key)
        print(f"n={n} distinct_prime_embeddings={len(keys)}", flush=True)


if __name__ == "__main__":
    main()
