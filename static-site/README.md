# SmallCats static site

This directory contains the complete application deployed at [smallcats.info](https://smallcats.info). The build emits a static single-page application: Cloudflare serves files, and the browser performs all browsing, queries, visualization, and category lookup without a running server or database.

## Source layout

- `src/pages/<route>.html` contains editable page copy and markup.
- The neighboring page modules contain route-specific dynamic behavior.
- `src/app.js` is the router.
- `src/data.js` and `src/ui.js` provide shared data access and presentation helpers.
- `scripts/build.mjs` compiles the database and bundles the application into `dist/`.

The site retains the original Bulma and Font Awesome visual language. Its draggable quivers use the modular D3 packages, and the enumeration page renders mathematics with KaTeX. All dependencies are bundled locally with esbuild, so page rendering does not depend on a third-party CDN.

## Build data

The production build combines two inputs:

- the adjacent [SmallCategories](https://github.com/diracdeltafunk/SmallCategories) checkout's `database/` directory contains the canonical multiplication tables;
- this repository's `../website-data/` directory contains preserved public names, descriptions, proposition definitions, and proposition values.

The compiler reads the canonical tables and their proposition masks, and adds the names and descriptions in `website-data` by `SmallCat(n,k,i)` coordinates. Public routes use those coordinates and proposition names; no provider-specific identifiers or credentials are compiled into the site.

Compiled data is published under a versioned URL namespace, currently `/data/v6/`. Bump that namespace whenever the database contents, metadata, facts, or compiled data schema change; otherwise a browser may combine cached files from different releases.

The Query page also accepts a finite category presentation. Objects are space-separated names; generators are lines such as `f: x -> y`; relations are equations of composable paths such as `f g = h` or `a a = id_x`. Paths are written in traversal order. The browser resolves the presentation to a finite multiplication table, then uses the build's label-independent lookup index and an exact isomorphism check to find its database entry. A presentation that does not resolve within the browser's path limit reports that limitation rather than returning a possible quotient.

Each category page computes two posets from its multiplication table. Congruences are equivalence relations on parallel morphisms preserved by composition, ordered by refinement. Two-sided ideals are subsets of morphisms closed under composition on either side, ordered by inclusion; the empty ideal is included. Small posets have full Hasse diagrams. Larger ones have a navigable diagram of each selected element and its immediate neighbors, with rank counts for the whole poset. Selecting a poset element colors the quiver: congruence classes share a color, while ideal members are highlighted and other morphisms are muted.

Install the pinned dependencies and make a production build:

```sh
npm ci
npm run build:production
```

With data in another location, invoke the compiler directly:

```sh
node scripts/build.mjs \
  --database /path/to/SmallCategories/database \
  --website-data /path/to/SmallCategories-site/website-data
```

`npm run build` is useful for a tables-only development build; it omits public metadata and proposition facts. In either mode, `dist/` is generated output and is ignored by Git. Because the compiler reads the database working tree, local database edits are reflected in the output.

## Preview and checks

Serve the generated site with its single-page-app fallback:

```sh
npm run preview
```

The preview is available at <http://127.0.0.1:8000>. Run source checks and the fixture build with:

```sh
npm run check
npm test
```

## Cloudflare Pages

The hosted build clones the public database repository at build time and requires no secrets:

```sh
npm run build:cloudflare
```

Cloudflare's Git integration uses:

- Framework preset: **None**
- Build command: `npm --prefix static-site ci && npm --prefix static-site run build:cloudflare`
- Build output directory: `static-site/dist`
- Root directory: blank

The build defaults to the database repository's `master` branch. Preview builds may set `SMALLCATS_DATABASE_REF` to another pushed Git ref; `SMALLCATS_DATABASE_REPOSITORY` may point to another repository URL.
