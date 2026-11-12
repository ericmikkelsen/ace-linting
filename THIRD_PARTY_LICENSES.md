# Third-party licenses

Status: DRAFT. Not legal advice. Clex is not used (see below).

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

## Still to do

- Inventory what `swipl-wasm`'s bundle contains beyond SWI-Prolog and copy each license text into the package.
- Add per-file license headers to our source files.
- Make the published tarball carry `LICENSE`, this file, and each component's license text, and tag the repo so the matching source is available for each release.
