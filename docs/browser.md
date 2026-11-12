# Using ace-linting in a browser

The library runs APE and RACE in a Web Worker, so typing never blocks the page. Nothing is sent anywhere except the one-time download of APE and RACE.

## Build

```bash
npm run build:browser    # dist-browser/ace-linting.js + assets/ (the worker and the Prolog runtime)
npm run dev:demo         # demo with live squiggles, questions and synonym rules at http://localhost:5173/
npm run build:demo       # a static copy of the demo in demo-dist/
```

A bundler is needed to use the source (Vite is set up here), because the Prolog runtime ships as CommonJS. The built bundle is a plain ES module:

```html
<script type="module">
  import { createAce } from "./dist-browser/ace-linting.js";
  const ace = await createAce();           // fetches APE and RACE at pinned commits, checks every file's hash
  const { diagnostics } = await ace.lint("Every customer inserts.");
</script>
```

Keep `ace-linting.js` and its `assets/` folder together: the worker is found next to the bundle.

## Sizes (measured)

| File | Raw | Gzip |
|---|---|---|
| `ace-linting.js` | 31.7 KB | 12 KB |
| worker | 10 KB | 4 KB |
| Prolog runtime chunk (SWI-Prolog compiled to WebAssembly, in `assets/`) | 7.2 MB | 2.1 MB |
| APE and RACE source, fetched on first use | about 1.4 MB | |

## First load and the saved copy

On the first load the browser downloads 72 files from `raw.githubusercontent.com` (APE and RACE at their pinned commits, falling back to jsDelivr), checks each against its recorded sha256, and keeps the verified bytes in IndexedDB. Later loads need no network. If IndexedDB is unavailable (private windows) the library falls back to downloading each time. Measured in a browser: about 1.9 s to a ready editor from the saved copy and about 3.6 s for the first load from GitHub.

## Checking it yourself

- `demo/selftest.html` (under `npm run dev:demo`) runs 13 checks in the browser: worker, hash-checked download, IndexedDB persistence, timeout restart, synonyms, plugins, and that no request carries the user's text. The page title becomes `PASS 13/13`.
- `demo/built-smoke.html` checks the built bundle: build it, run `node scripts/serve.mjs`, open `http://localhost:4177/demo/built-smoke.html`.

## Notes

- The demo's offline mode serves the `vendor/` checkouts from the dev server instead of GitHub; the pinned hashes are still checked. Add `?remote=1` to use GitHub.
- The browser bundle is built with `__ACE_BROWSER__` set, so Node-only code (file system access, worker threads) is removed.
