# ace-linting

Write notes in a controlled form of English, find out which sentences a computer cannot read, and ask questions that are answered by logical proof. It runs in Node and in the browser, and in the browser nothing you type leaves the page.

The language is **Attempto Controlled English (ACE)**: a small, strict subset of English that has exactly one meaning per sentence. `ace-linting` is a linter and question-answering layer on top of two existing ACE tools, which it downloads on first use and does not include: **APE**, the parser, and **RACE**, the reasoner (both from the Attempto group at the University of Zurich).

> **Status: early.** It has 185 automated tests and an in-browser self-test, but it is not published to npm yet, the repository is private, and very few people have used it. Treat it as a tool for learning and experiments.

## What it looks like

```text
John is a customer. Mary is a customer. John inserts a card.
Every customer who inserts a card is happy.
```

- Typing a sentence ACE cannot read gets a wavy underline and a reason.
- `Is John happy?` is answered **yes, with the proof**: the three sentences it used.
- `Is Mary happy?` is answered **unknown**: nothing in the text proves it. "Unknown" never silently turns into "no".
- `Who is happy?` lists the answers it can prove.

## Try the demo

You need Node 22.12 or later, and access to the repository (it is private: sign in to GitHub with `gh auth login` or use your own credentials).

```bash
git clone --recurse-submodules https://github.com/ericmikkelsen/ace-linting.git
cd ace-linting
npm install
npm run dev:demo          # open http://localhost:5173/
```

The demo has a notes box and a question box. Both are checked as you type: wavy underlines on the words that are wrong, the reasons listed underneath, and a red (error) or amber (warning) border. Pressing **Ask** shows the answer and its proof. Add `?remote=1` to the address to download APE and RACE from GitHub instead of using the copies in `vendor/` (the files are checked against pinned hashes either way).

## ACE in five minutes

ACE reads like English but follows fixed rules. These are valid:

| Sentence | What it shows |
|---|---|
| `John is a customer.` | names start with a capital letter and need no entry |
| `A customer inserts a card.` | simple facts |
| `Every customer who inserts a card is happy.` | rules, with "who" and "that" clauses |
| `If John buys a card then Mary is happy.` | if ... then |
| `No customer inserts a card.` / `A customer does not insert a card.` | negation |
| `John inserts two cards.` / `John inserts at least 3 cards.` | integers and number words |
| `John buys a card on Monday.` | time is a fact about the event, not a tense |
| `Mary likes John and John likes Mary.` / `John is happy or Mary is happy.` | and, or |

Questions: `Is John happy?`, `Does John buy a card?`, `Who is happy?`, `When does John buy a card?` (RACE documents more question words, such as which and how many; this project does not test them).

Things that are **not** ACE, and what the linter says:

- **Any tense but the present.** `John bought a card.`, `John has bought a card.`, `John will buy a card.`, `John is buying a card.`, `Did John buy a card?` are all rejected, with a message that names the tense and suggests the present tense (`John buys a card.`), the passive (`A card is bought by John.`) or a time (`John buys a card on Monday.`).
- Words it does not know. A lowercase word that is not in the lexicon is an error that points to ACE's prefixes (`A n:gadget waits.`) or to adding the word (see below).
- `any`, decimals such as `3.5`, and everything else outside ACE.

The full language is described by the Attempto group at attempto.ifi.uzh.ch.

## Use it from Node

It is not on npm yet. Build a package from the repository and install that:

```bash
npm install
npm run build && npm run build:browser
npm pack --ignore-scripts                          # makes ace-linting-0.0.0.tgz
# in your own project:
npm install /path/to/ace-linting-0.0.0.tgz
```

```ts
import { createAce } from "ace-linting";

const ace = await createAce();   // first run: downloads APE and RACE (about 1.4 MB, 72 files), checks every file's hash, caches them

const { diagnostics } = await ace.lint("Every customer inserts.");
// [{ severity: "error", code: "ape/sentence", message: "This is not valid ACE at or after this point.",
//    range: { start: 22, end: 23 }, sentence: 1 }]

const text = "John is a customer. Mary is a customer. John inserts a card. Every customer who inserts a card is happy.";

await ace.ask({ text, question: "Is John happy?" });
// { status: "answered", answers: [], proofs: [{ axioms: [
//     { sentence: 1, text: "John is a customer." },
//     { sentence: 3, text: "John inserts a card." },
//     { sentence: 4, text: "Every customer who inserts a card is happy." } ] }], ... }

await ace.ask({ text, question: "Who is happy?" });
// { status: "answered", answers: [{ word: "who", value: "John" }, ...], ... }

await ace.ask({ text, question: "Is Mary happy?" });
// { status: "unknown", unmatched: [{ wordClass: "proper name", word: "Mary" }, ...] }

await ace.dispose();
```

Files are cached in `~/.cache/ace-linting` (or `$ACE_LINTING_CACHE`); later runs work offline.

## Use it in a browser

```bash
npm run build:browser     # dist-browser/ace-linting.js plus its assets/ folder
```

```html
<script type="module">
  import { createAce } from "./dist-browser/ace-linting.js";
  const ace = await createAce();    // downloads APE and RACE once, verifies them, keeps them in IndexedDB
  const { diagnostics } = await ace.lint("Every customer inserts.");
</script>
```

Keep `ace-linting.js` and the `assets/` folder together. The library is about 12 KB gzipped plus a 2 MB (gzipped) Prolog runtime. See [docs/browser.md](docs/browser.md).

## The API

| Call | What it does |
|---|---|
| `createAce(options?)` | Starts APE (and RACE) in a worker. Options: `lexicon` (entries to load), `upstream` (cache folder, URLs), `synonymIndex` (suggestions for synonyms); `apeDir`/`raceDir` for local checkouts. |
| `ace.lint(text)` | `{ diagnostics }`: each has `severity` (`error` or `warning`), `message`, `range` (character offsets), `sentence`, and often a `suggestion`. Safe to call on every keystroke (`debounce` is exported). |
| `ace.parse(text)` | What APE understood: verbs with subjects and objects, with ranges and pronouns resolved. |
| `ace.ask({ text, question })` | `answered` (answers and a proof numbered by your own sentences), `unknown`, `invalid` (diagnostics for the text and the question) or `timeout`. Option: `timeoutMs`. |
| `ace.lexicon.add / remove / list` | Add or remove words; entries that clash with function words or other classes are rejected with the reason. |
| `ace.synonyms.add / remove / list` | Say two words mean the same, as a rule that appears in proofs. |
| `ace.use(plugin)` | Add checks after parsing, such as `typeCheck` ("a coffee cannot execute"). |

Words: names (capitalized) and anything in the lexicon work. To add your own:

```ts
await ace.lexicon.add({ class: "noun", lemma: "gadget" });
await ace.lint("A customer inserts a gadget.");   // no errors now
```

Details: [docs/user-lexicon.md](docs/user-lexicon.md) (words), [docs/question-synonyms.md](docs/question-synonyms.md) (synonym rules and suggestions), [docs/plugins.md](docs/plugins.md) (plugins), [docs/tense.md](docs/tense.md) (why there is no past tense, and what was tried).

## Limits to expect

- **Strict by design.** Anything that is not ACE is reported, including every tense but the present. That is the point of a linter, and it is what makes the answers trustworthy.
- **Small built-in vocabulary.** APE starts with about 2,000 words. A larger lexicon (about 74,000 words, from Open English WordNet and VerbNet) can be generated with the scripts in `scripts/`; see [docs/lexicon-plan.md](docs/lexicon-plan.md). The generating step needs the source data and is not automated end to end.
- **First run needs the network** once, to download APE and RACE from GitHub. If those repositories disappear, a fresh install cannot start until the files are supplied (`apeFiles`/`raceFiles`).
- **Long texts** are narrowed to the sentences related to a question before RACE sees them, and retried in full when the answer is unknown. A "who" question on a very long text can therefore return only some of the answers.
- **A runaway proof** is stopped by terminating the worker (`timeoutMs`, default 5 s), which then restarts.
- **Memory.** Loading the full generated lexicon took about 330 MB in a Node process.

## Develop

```bash
npm install
npm test                   # type check, then the whole suite
npm run build              # dist/ for Node
npm run build:browser      # dist-browser/ for browsers
npm run dev:demo           # the demo
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
