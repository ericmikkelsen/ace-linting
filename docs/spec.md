# Spec: ace-linting

Status: DRAFT 2 (decisions from review applied). Nothing is built. The spike in "Success Criteria" gates everything else. The npm name `ace-linting` was unclaimed when checked.

## Decisions so far

- Name: `ace-linting` (the package also exposes `ask`; the name stays).
- New repo; importable from Node and browser; extension functions are part of v1.
- License: GPL-3.0-only. RACE is GPL-3.0 with no "or later" stated, and APE is LGPL-3.0-or-later, so the combined work is GPL-3.0. Not legal advice; confirm before publishing. Clex is not bundled until its COMLEX/LDC origin is cleared (see `THIRD_PARTY_LICENSES.md`).
- Distribution: our package ships none of APE or RACE. They are fetched from upstream at pinned commits and checked against recorded hashes (at install/build time in Node, at first load in the browser). The `vendor/` submodules are for development only and are excluded from the published package (`files` whitelist). Prebuilt images containing their code are not shipped; the Prolog file system is assembled at load time, as the spike does. Any hosted demo fetches them from upstream too.
- Build steps are fine, so a bundler is allowed.
- Size budget: about 50 MB total, with the Prolog image fetched lazily on first use.
- Unknown stays unknown: a question the text cannot prove is reported as "unknown", never converted to "no".
- Lexicon: Clex is removed (COMLEX/LDC provenance). We build our own clean lexicon with recorded provenance, on top of APE's small built-in lexicon, plus user-added words. See Task 5 in `tasks/plan.md`.
- v1 scope: lint and ask. No autocomplete.

## Objective

A small library that lets someone write Attempto Controlled English (ACE) in a browser or in Node, see which sentences are not valid ACE, and ask questions that are answered deterministically from what they wrote.

- **Linter.** Text in, diagnostics out: each has a severity, a message, and a source range, so an editor can draw a squiggle.
- **Ask.** Text plus a question in, answer plus proof out, using RACE (the ACE reasoner).
- **Importable.** One package, importable from Node and from browser ES modules, with the same API in both.
- **Extensible.** Functions to add words to the lexicon at runtime and to plug in extra checks (for example type checks), without editing the library.
- **Local.** In the browser everything runs on the device. Text is never sent to a server.

Users: people writing facts and rules in ACE (project notes first), and developers embedding the library in their own editors.

Not a goal for v1: autocomplete or next-word suggestions, a new grammar, LLM translation of free text into ACE, a hosted service.

## Assumptions (correct me)

1. APE (parser, LGPL-3.0) and RACE (reasoner, GPL-3.0) are used as they are, not rewritten.
2. They run in SWI-Prolog compiled to WebAssembly (`swipl-wasm`, the official npm package), inside a Web Worker in the browser and a worker thread in Node.
3. The library ships open source under GPL-3.0-or-later.
4. TypeScript source with exported types for every output (including a types-only entry), compiled to ES modules. A build step (bundler) is allowed to package the worker and wasm for browsers; Node consumers import the package directly.
5. The Prolog image (APE and RACE precompiled) is a build artifact produced by a script, not hand-edited.

## Tech Stack

- TypeScript (strict), compiled to ES modules; output types are exported and pinned by a type-level test (`tsc --noEmit`).
- `swipl-wasm` (npm) as the Prolog runtime.
- APE and RACE vendored as pinned git submodules (they already pin each other).
- Lexicon: our own clean lexicon (`lexicon/`, provenance recorded), loaded through APE's user-lexicon mechanism.
- Tests: `node --test`. No framework dependency.

## Public API (sketch, to be reviewed)

```js
import { createAce } from "ace-web";

const ace = await createAce();            // starts worker, loads image

ace.lexicon.add({ noun: "invoice" });     // extend the dictionary
ace.lexicon.add({ verb: "owns", forms: ["own", "owns", "owned"] });

const { diagnostics, paraphrase } = await ace.lint("Maren owns the rider task.");
// diagnostics: [{ severity, code, message, range: { start, end }, sentence }]

const answer = await ace.ask({
  text: "Maren owns the rider task.",
  question: "Who owns the rider task?",
  timeoutMs: 2000
});
// answer: { status: "answered" | "unknown" | "timeout", answers: [...], proof: [...] }

ace.use({ name: "types", afterParse(result, api) { /* extra diagnostics */ } });
await ace.dispose();
```

Rules for the API: every call is async and cancellable; diagnostics have a stable shape that does not leak Prolog terms; extensions can add diagnostics but cannot change what APE accepted.

## Commands

```
Install:        npm install
Build image:    npm run build:image      # compile APE + RACE into the wasm Prolog image
Test:           npm test                 # node --test
Spike:          node scripts/spike.mjs   # parse + ask smoke test, prints timings
Demo (browser): npm run demo             # static server for demo/index.html
```

## Project Structure

```
src/index.ts        → createAce and public exports (types exported alongside)
src/worker.ts       → worker entry (browser Worker / Node worker_threads)
src/diagnostics.ts  → map APE messages to {severity, code, message, range}
src/lexicon.ts      → add/remove words, generate inflected forms, validate conflicts
src/extensions.ts   → plugin hooks
vendor/APE, vendor/RACE → git submodules, pinned, not edited
prolog/             → thin glue predicates we write (entry points, serialization)
scripts/            → build-image, spike
tests/              → fixtures: sentence → expected diagnostics / answers
demo/               → minimal editor with squiggles and a question box
docs/               → this spec, plan, decisions
```

## Code Style

```ts
export type Diagnostic = {
  severity: "error" | "warning";
  code: string;
  message: string;
  range: { start: number; end: number };
  sentence: number;
  suggestion?: string;
};

export type AskResult =
  | { status: "answered"; answers: string[]; proof: string[] }
  | { status: "unknown" }
  | { status: "timeout" };

export async function lint(text: string): Promise<Diagnostic[]> {
  const result = await runtime.parse(text);
  return result.messages.map(toDiagnostic(text));
}
```

Small pure functions, no classes unless state demands it, no Prolog terms crossing the worker boundary, named exports.

## Testing Strategy

- **Fixture tests** (the main tool): a table of ACE sentences with the expected result (valid, or the expected diagnostic code and range). Run in Node on every change.
- **Ask fixtures:** text + question + expected answer, including "unknown" cases that must not become "no".
- **Range tests:** every diagnostic range must point at the right characters in the original text, including multi-sentence input and non-ASCII text.
- **Extension tests:** a word added through `lexicon.add` makes a previously failing sentence pass, and conflicting additions are rejected with a clear message.
- **Browser smoke test:** the same fixtures run in a real browser worker once, to catch environment differences.
- Never edit `vendor/` to make a test pass.

## Boundaries

- **Always:** pin APE, RACE and `swipl-wasm` versions; add a fixture for every bug; keep license headers and the notice files required by APE (LGPL) and RACE (GPL).
- **Ask first:** adding dependencies, changing the public API shape, changing the project license, any server-side component, exceeding the 50 MB size budget.
- **Never:** send user text to a server, edit vendored APE or RACE (patch upstream or wrap instead), commit personal notes or data as fixtures, ship without source and license notices.

## Success Criteria

**Spike (gate for everything else), done when:**
1. `swipl-wasm` loads APE and parses "Every customer inserts a card." in Node, returning a DRS and a paraphrase.
2. A deliberately bad sentence returns an error with enough position information to compute a character range, or we know exactly what is missing.
3. RACE answers "Who inserts a card?" over a short text in the same runtime.
4. Parse time per sentence and image load time are measured and recorded, with the gz size of the wasm and image.
5. The same calls work in a browser Web Worker.

If 1 or 3 cannot work without native Prolog packages, stop and rewrite this spec (options: patch around the dependency, move to a server, or reimplement in JS).

**v1, done when:**
- `lint` returns correct diagnostics and ranges for the fixture set, and `ask` answers the question fixtures including "unknown".
- `lexicon.add` and `use` work as described, with tests.
- The demo page shows live squiggles (debounced) and a question box, with no network requests after load.
- The package imports cleanly in Node and in a browser ES module page.
- Typing latency target (to confirm after spike): lint of a typical note stays under about 100 ms per edit, off the main thread.

## Strategies (proposed, to be confirmed by the spike)

**Diagnostic ranges.** From reading APE's source: its messages carry a scope (character, word, sentence, anaphor or pronoun), a position of the form sentence-number and token-number, the offending token, and often a suggested fix. APE also requires every sentence to end with `.`, `?` or `!`. So:
1. Split the text into sentences ourselves, so we know each sentence's character offsets.
2. Map APE's token number to a character range using a tokenizer that mirrors APE's, and cross-check it against APE's own token output.
3. If a message has no token position, or the cross-check fails, underline the whole sentence rather than guess.
4. Pronoun and reference messages depend on earlier sentences, so lint always parses the text up to the current sentence, not the sentence alone.

**Smaller bits (speed and runaway proofs).**
- Lint: split into sentences, cache each sentence's result keyed by a hash of the text up to and including it, and re-parse only from the first edited sentence onward. Debounce edits, and keep it off the main thread.
- Ask: before calling RACE, select the relevant sentences (those sharing content words with the question, plus rules that mention them) so the proof search works on a small set. If it comes back "unknown", retry once with the full text under a longer timeout.
- Timeouts: each ask runs in a worker that can be terminated, so a runaway proof only kills that worker, which restarts on the next call.

## Open Questions

1. Does APE's core parser path need `clib`, `sgml` or `http` packages that `swipl-wasm` does not include? (Spike item 1; if it does, we patch around it or drop that output path.)
2. Do APE's token numbers line up with a tokenizer we can mirror, including punctuation, quotes and non-ASCII text? (Spike item 2.)
3. Which sources can feed our clean lexicon, with licenses we can verify and attribute? (See Task 5.)
4. Is relevance selection good enough for RACE, or does it drop a needed rule and turn a provable answer into "unknown"? Needs fixtures.
5. When a user-added word conflicts with a word in our lexicon or APE's built-in one, the user entry overrides, with a warning. Confirm this is how APE's user-lexicon mechanism behaves.
6. License notices: confirm what APE, RACE and any lexicon source require us to ship or attribute. (We ship neither APE nor RACE, only fetch them.)
