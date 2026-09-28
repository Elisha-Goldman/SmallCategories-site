# Prime posets by order dimension

The proposed [poset explorer](../../static-site/src/pages/posets.html) displays one coordinate
embedding of every nonisomorphic prime poset of order dimension exactly 2
with 4 through 9 elements. Here, *prime* means that the poset has no
nontrivial module (equivalently, it is irreducible under lexicographic
substitution).

`oeis_prime_posets.py` exhaustively counts prime posets by size and exact
order dimension. `export_dimension_two_embeddings.py` separately recognizes
dimension 2 by finding two linear extensions that reverse every incomparable
pair. The exporter writes rank permutations to `n-4.json` through `n-9.json`.
`verify_embedding_data.py` reconstructs each poset from its permutation and
checks primeness and uniqueness up to isomorphism.

Requires Python 3.10 or later and `python-igraph` (tested with igraph 1.0.0).
From this directory:

```sh
python oeis_prime_posets.py --max-size 9 --workers 8
python export_dimension_two_embeddings.py page/data --max-size 9 --workers 8
python verify_embedding_data.py page/data
```

The exported counts by size 4 through 9 are `1, 4, 25, 174, 1481, 14136`.
Each data file contains one permutation per isomorphism class: the point at
horizontal rank `i` has vertical rank `permutation[i-1]`. The site's copy of
the data is under `static-site/src/poset-data/v1/`.
