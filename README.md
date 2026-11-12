# ace-linting

Write notes in Attempto Controlled English (ACE), see which sentences are not valid ACE, and ask questions that are answered by logical proof. Runs in Node and in the browser; in the browser nothing you type leaves the page.

It uses two existing tools, which it fetches when first used and does not include: **APE**, the ACE parser, and **RACE**, the ACE reasoner (both from the Attempto group at the University of Zurich).

## Use

```ts
import { createAce } from "ace-linting";

const ace = await createAce();                      // first run: downloads APE and RACE, checks every file's hash, caches them

const { diagnostics } = await ace.lint("Every customer inserts.");
// [{ severity: "error", code: "ape/sentence", range: { start: 22, end: 23 }, ... }]

const answer = await ace.ask({
  text: "John is a customer. John inserts a card. Every customer who inserts a card is happy.",
  question: "Is John happy?",
});
// { status: "answered", proofs: [{ axioms: [{ sentence: 1, ... }, ...] }], ... }

await ace.dispose();
```

- `lint(text)` returns diagnostics with character ranges for editors (wavy underlines). `parse(text)` returns what APE understood.
- `ask({ text, question })` returns `answered` (with the proof, numbered by your own sentences), `unknown` (it cannot be proved; this never means "no"), `invalid` (the text or question is not ACE) or `timeout`.
- `lexicon`, `addEntries` and a CC0 core vocabulary add words; `synonyms` adds rules such as "buy implies purchase" that show up in proofs; `use(plugin)` adds checks such as `typeCheck`. See [docs/plugins.md](docs/plugins.md) and [docs/question-synonyms.md](docs/question-synonyms.md).
- In a browser, see [docs/browser.md](docs/browser.md): a Vite build, a demo, and an IndexedDB cache for the downloaded files.

## Develop

```bash
npm install
npm test                   # type check, then the test suite
npm run build              # dist/ for Node
npm run build:browser      # dist-browser/ for browsers
npm run dev:demo           # the demo at http://localhost:5173/
```

`vendor/APE` and `vendor/RACE` are git submodules used only during development and tests. They are not part of the published package.

## Licensing

ace-linting is released under the **GPL-3.0-only** (see `LICENSE`). This is not legal advice; the details below are what we found, and `THIRD_PARTY_LICENSES.md` has the full inventory.

- **APE** (LGPL-3.0-or-later) and **RACE** (GPL-3.0) are not included in this package. They are downloaded at first use from their own repositories, at pinned commits, and every file is checked against a recorded hash. Because RACE is GPL-3.0 and this package works with it, this package is GPL-3.0-only too.
- **SWI-Prolog**, compiled to WebAssembly (via `swipl-wasm`, BSD-2-Clause), is part of the browser bundle; its license text is in `licenses/swipl-wasm-LICENSE.txt`.
- **Lexicon data** comes from three places, each with its notices in `lexicon/NOTICE.md` and the license texts in `lexicon/licenses/`:
  - our hand-written core vocabulary (CC0 1.0, public domain);
  - **Open English WordNet** 2025 (CC BY 4.0, built on Princeton WordNet 3.1);
  - **VerbNet** 3.4 (University of Colorado, permissive license) for verb frames.
  Word lists derived from Open English WordNet and VerbNet are modified material and carry those notices. The names of Princeton University and the University of Colorado are not used to promote this package. If you describe an application based on VerbNet, cite Kipper, Korhonen, Ryant and Palmer (2008), *Language Resources and Evaluation*.
- **Source:** the package includes its TypeScript source (`src/`), build scripts and the lexicon build pipeline, which is the form to modify it in.

We do not use Clex or any COMLEX-derived data.
