# Third-party licenses

Not legal advice. Clex is not used (see below). Last reviewed with the release preparation; the open points are listed at the end.

| Component | Source | License (as found) | Where the text lives | Status |
|---|---|---|---|---|
| APE (ACE Parsing Engine) | https://github.com/Attempto/APE | LGPL-3.0-or-later. File headers say "version 3 ... or any later version"; `LICENSE.txt` is the LGPL v3 text. Copyright 2008-2013 Attempto Group, University of Zurich. | `vendor/APE/LICENSE.txt` | Verified from the files. |
| RACE (reasoner) | https://github.com/Attempto/RACE | GPL-3.0. `LICENSE` is the GPL v3 text. The file headers I read do not say "or later", so treat it as GPL-3.0-only. | `vendor/RACE/LICENSE` | Verified from the files; "only" vs "or later" not stated. |
| SWI-Prolog and `swipl-wasm` | https://github.com/SWI-Prolog/npm-swipl-wasm | Simplified BSD (BSD-2-Clause). `swipl-wasm` package.json also says BSD-2-Clause. | `node_modules/swipl-wasm/LICENSE.txt` | Verified from the package. Bundled components (e.g. zlib) still to inventory. |

## Our package

Our own code is licensed GPL-3.0-only for now. RACE is GPL-3.0 (no "or later" stated), so the combined work that includes it can only be distributed under GPL-3.0. APE is LGPL-3.0-or-later, which can be combined into a GPL-3.0 work. Revisit if RACE's authors state "or later".

## Clex is not used

We looked at Clex (https://github.com/Attempto/Clex) and removed it. Its data file says it is derived from COMLEX (Copyright 2005 LDC, University of Pennsylvania) while declaring GPL-3.0 from the Attempto Group, and nothing we could find says whether LDC allowed that release. Rather than depend on an unresolved question, we do not use, fetch or ship Clex or any COMLEX-derived data.

## Our lexicon

We build our own lexicon (`lexicon/`), and `lexicon/PROVENANCE.md` will record every source, its license and what we took. A word list from outside is used only after its license is read and recorded here.

APE's own small built-in lexicon (about 2,000 entries, in `prolog/lexicon/clex_lexicon.pl` inside the APE repo) carries only APE's LGPL header with no "derived from" note. We fetch it with APE (we do not ship it); worth a question to the Attempto group about where its entries came from.

## Lexicon sources (ingested; see `lexicon/NOTICE.md` for versions, hashes and full notices)

Details and reading notes: `docs/lexicon-sources.md`. Raw license texts are in `lexicon/licenses/`.

| Source | License | What we must carry |
|---|---|---|
| Open English WordNet 2025 (on Princeton WordNet 3.1) | CC BY 4.0 plus the Princeton WordNet license | Both copyright notices and the disclaimer on all derived entries; credit Princeton WordNet and the Open English WordNet team; no use of Princeton's name in promotion |
| VerbNet 3.4 (University of Colorado) | VerbNet 3.x license (permissive) | Copyright notice, license statements and disclaimer on all copies; cite Kipper et al. when describing applications; no use of Colorado or CU names in promotion |
| Our hand-written core | CC0 | Nothing; must contain only entries we author |
| Wiktionary data (only if adopted at L4) | CC BY-SA 4.0 (and GFDL) | Credit and link, say we changed it, license notice; derived entries stay GPLv3 or BY-SA |

## What ships, and what does not

| Item | In the npm package? | How the user gets it | License text |
|---|---|---|---|
| ace-linting source and builds | Yes | npm | `LICENSE` (GPL-3.0-only); each source file has an SPDX header |
| APE and RACE | **No** | Downloaded at first use from their repositories at pinned commits, every file checked against a recorded sha256 (`src/upstream-manifest.ts`) | In their repositories (APE: LGPL-3.0-or-later; RACE: GPL-3.0) |
| SWI-Prolog compiled to WebAssembly | In the browser bundle (`dist-browser/assets/`); as the `swipl-wasm` dependency for Node | npm | `licenses/swipl-wasm-LICENSE.txt` (BSD-2-Clause) |
| Core vocabulary | Yes | npm | `lexicon/licenses/CC0-1.0.txt` |
| Open English WordNet and VerbNet entries (`lexicon/oewn/oewn.jsonl`, `lexicon/dist/synonyms.json`) | Yes, when generated before packing | npm | `lexicon/licenses/` and `lexicon/NOTICE.md` |
| Clex / COMLEX | No, not used anywhere | | |

## Runtime components inside the WebAssembly build

`swipl-wasm`'s license file says SWI-Prolog "may be linked with libraries covered by more restrictive license" and names the predicate `license/0` as the way to list the components loaded into a build. We ran it in the version we ship (SWI-Prolog 10.1.20, `swipl-wasm` 8.3.0): it reported no additional components. The binary contains zlib (zlib license, permissive). SWI-Prolog's unbounded integers (`bounded` is false, `gmp_version` is absent) are implemented by something other than GMP; we did not confirm what (SWI-Prolog 10 can use LibBF, which is MIT licensed), so that is an open point.

## Build tools

Vite 8 and TypeScript are used to build and are not shipped. The browser bundle contains small helper code generated by the bundler, which carries no separate notice requirement that we are aware of.

## Open points (not decided by us)

1. Whether `swipl-wasm`'s build links libraries with additional license terms beyond what `license/0` reports (for example the library used for unbounded integers).
2. RACE states GPL-3.0 without "or later"; we treat it as GPL-3.0-only and so license this package GPL-3.0-only. Revisit if its authors state otherwise.
3. Where APE's small built-in lexicon (about 2,000 entries, fetched with APE, not shipped by us) comes from; its file carries only APE's LGPL header.
4. The Princeton WordNet license and VerbNet license permit our use as described, with their notices preserved. We read both texts; a lawyer should confirm before a public release.
5. CC0 for the core vocabulary is only valid for entries we authored. The test suite checks the source tag on each entry but cannot prove authorship.
