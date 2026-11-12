# Spike results (Node, swipl-wasm 8.3.0 / SWI-Prolog 10.1.20)

Scripts: `scripts/spike.mjs` (APE), `scripts/spike-race.mjs` (RACE). The Clex measurements below were taken before Clex was removed from the project (licensing); they remain as a record of what a large lexicon costs. Run with `node scripts/<name>.mjs`.

## Verdict against the spec's spike list

| # | Item | Result |
|---|---|---|
| 1 | APE loads under `swipl-wasm` without native packages | **Pass.** The parser core (`ace_to_drs`) loads and runs. `library(sgml)` exists; `library(http/...)` does not, but the parser does not need it (only APE's server mode does). |
| 2 | Bad sentence gives error with usable position | **Pass, with caveats** (see Positions below). |
| 3 | RACE answers a question in the same runtime | **Pass**, after one workaround: `library(time)` (alarms) is missing, so `call_with_time_limit/2` is stubbed to run without an in-Prolog limit. Timeouts must come from terminating the worker. |
| 4 | Timings and sizes recorded | Done (below). |
| 5 | Same calls work in a browser Web Worker | **Pass.** `demo/spike.html` + `demo/spike-worker.js` in the built-in browser gave identical parse errors and RACE answers. Runtime up in about 100 ms, 72 source files fetched and written in about 36 ms (local server), grammar compile about 210 ms, RACE load about 400 ms, answers 6-8 ms. |

## What ran

- `Every customer inserts a card.` parses to a DRS with no messages.
- `Every customer inserts.` fails with `message(error, sentence, 1-5, 'Every customer inserts. <>', ...)`.
- RACE over "John is a customer. Mary is a customer. John inserts a card. Every customer who inserts a card is happy.":
  - "Is John happy?" -> proof listing axioms 1, 3, 4.
  - "Who is happy?" -> proofs with substitutions `who = John` and `who = (at least 1) customer`.
  - "Is Mary happy?" -> no proof and `WhyNot: ['proper name: Mary','adjective: happy','copula: is/are']`. This is the "unknown" case, and it stays unknown (not "no"), as decided.
- With the small default lexicon, `The coffee executes the command.` fails with "Use the prefix n:, v:, a: or p:" on unknown words. With Clex loaded it parses (only warnings about the definite noun phrases having no antecedent). So ACE does not check word types: the semantic type check plugin in the plan is justified.

## Timings (this machine, warm Node process)

| Step | Time |
|---|---|
| swipl-wasm runtime start | about 120 ms |
| Compile APE grammar (`fit_to_plp`) | about 230-260 ms (can be done once at build time) |
| Load APE (small lexicon) | about 230 ms |
| Load APE with Clex | about 1,140 ms (source consult; a saved state should cut this, untested) |
| Load RACE | about 420-485 ms |
| Parse one sentence | 1-15 ms (about 58 ms for the first sentence after loading Clex) |
| RACE answer | 6-12 ms |

## Sizes

| Item | Raw | Gzip |
|---|---|---|
| `swipl-web.wasm` | 2.3 MB | 0.84 MB |
| `swipl-bundle.js` (single-file) | 6.4 MB | 2.0 MB |
| Clex lexicon (`clex_lexicon.pl`) | 3.4 MB | 0.62 MB |
| APE Prolog source | about 1 MB | |
| RACE Prolog source | about 0.4 MB | |

**Clex fits easily inside the 50 MB budget, so the "expand" fallback is not needed.** Remaining cost is load time (about 1.1 s as source), which a saved state or precompiled files should reduce.

## Positions (for diagnostics)

- Sentence-scope messages carry `Sentence-Token` and a text with `<>` marking the failure point (e.g. `1-5`, `1-2`).
- Token numbering starts at the first word as 1 (the start marker `^` is not counted). The reported failure token can be one past the last token (it points after the final period when something is missing).
- Word-scope messages (unknown words) carry no token number (`1-''`); the offending word is in the subject field, so the range must be found by locating that word in the sentence text.
- Anaphor-scope messages (e.g. definite noun phrase with no antecedent) carry `1-2`, `1-5`, i.e. a token number.
- So the plan's mapping strategy holds, with the word-scope case handled by text search and the sentence-scope case handled by token index with a whole-sentence fallback.

## Layout notes for the build

- RACE expects APE at `../ape/` relative to its `prolog/` folder (its own symlink is broken in a plain checkout). In the virtual file system this works by copying APE's `prolog/` to `/race/ape` and RACE's `prolog/` to `/race/prolog`.
- RACE prints many singleton-variable warnings on load; filter them.

## Open items before v1

1. Try saving a precompiled state to cut load time.
2. Confirm that terminating the worker is enough for runaway proofs (stub removes the in-Prolog limit).
3. **License flag for Eric:** `clex_lexicon.pl` says "Derived from: COMLEX, Copyright 2005 LDC, University of Pennsylvania" while declaring GPL-3.0 from the Attempto Group. COMLEX comes from the Linguistic Data Consortium, which has its own license terms. Whether redistributing a COMLEX-derived lexicon under GPL is cleared is not documented in the Clex repo. This needs checking with the Attempto group or LDC before we publish a package that bundles Clex.
