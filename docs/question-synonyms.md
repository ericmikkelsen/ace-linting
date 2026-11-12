# Design: synonyms and suggestions for questions

Status: DRAFT for review. Nothing is built; it depends on the Ask API (Task 4). Facts marked "verified" come from running RACE under `swipl-wasm` on 2026-11-11 with our generated lexicon loaded.

## Problem

RACE answers by logical proof, so it only matches the words that appear. If the notes say "John buys a card" and the question is "Does John purchase a card?", the answer is "unknown". The user probably meant the same thing. We want to bridge that gap without giving up the deterministic, explainable answers that are the point of the project.

## Principles

1. **Answers stay proofs.** A synonym is never a silent rewrite. It becomes an explicit ACE sentence that appears in the proof, so the answer shows why.
2. **The user decides what counts as a synonym.** WordNet may suggest, never assume. Word senses differ ("bank"), and automatic inference would produce wrong answers fluently.
3. **"Unknown" stays "unknown".** A question we cannot prove is not turned into "no", and a missing synonym is the usual reason for "unknown".
4. **No fuzzy answering.** Approximate matching can suggest and can narrow down which sentences to try, but it never decides an answer.

## What we verified

| Case | Axioms | Question | Result |
|---|---|---|---|
| No bridge | John buys a card. | Does John purchase a card? | Unknown. `WhyNot` lists `proper name: John`, `countable common noun: (at least 1) card`, `transitive verb: purchase` |
| Transitive verb rule | John buys a card. If somebody buys something then he purchases it. | Does John purchase a card? | Answered; proof lists both sentences and the substitutions `somebody = John`, `something = (at least 1) card` |
| Same rule, "who" question | (same) | Who purchases a card? | Answered with `who = John` |
| Intransitive verb rule | John arrives. If somebody arrives then he comes. | Does John come? | Answered |
| Non-human subject | A machine stops. If something stops then it halts. | Does a machine halt? | Answered |
| Adjective rule | The task is urgent. Everything that is urgent is important. | Is the task important? | Answered |
| Noun rule | John is a client. Every client is a customer. | Is John a customer? / Who is a customer? | Answered; proof shows the rule and `who = John` |
| Wrong phrasings | "If somebody buys something then somebody purchases it." and "If a person buys a card then the person purchases the card." | Does John purchase a card? | Unknown (the second `somebody` is a new person, and John is a name, not a "person") |
| Ditransitive verb rule | John sends a card to Mary. If somebody sends something to somebody then he mails it to him. | Does John mail a card to Mary? | **Unknown, not understood yet.** `WhyNot` listed `transitive verb: mail`; probably a lexicon or phrasing problem. Not supported until fixed. |

Also verified: `WhyNot` is a list of strings of the form `<word class>: <word>`, which is what the suggestion step reads.

## Design

### 1. Synonym rules (deterministic, explicit)

A rule says two words mean the same thing for this user, in one direction or both. It compiles to ACE sentences by word class, using the shapes verified above:

| Class | Compiled sentence (X means Y) |
|---|---|
| noun | `Every X is a Y.` (and `Every Y is a X.` when both ways) |
| intransitive verb | `If somebody Xs then he Ys.` |
| transitive verb | `If somebody Xs something then he Ys it.` |
| adjective | `Everything that is X is Y.` |

Not supported until verified: adverbs, prepositions, ditransitive verbs, and verbs whose subject is not a person (the verified non-person case used `something`/`it`, which needs a second rule when the same verb takes people and things).

Where they go: the compiled sentences are appended **after** the user's text before calling RACE, so the numbering of the user's own sentences in the proof does not shift. The proof lines that come from a rule are labeled, so an editor can say "because 'buys' = 'purchases'".

Rules are never closed transitively (A=B and B=C does not give A=C); each link is something the user wrote.

### 2. Suggestions when the answer is unknown

After `ask` returns unknown, a separate step looks at the unmatched words from `WhyNot`:

1. For each unmatched noun, verb or adjective, look up its WordNet synonym sets and collect the other words in those sets.
2. Keep only words that actually appear in the axiom text (any inflected form).
3. Offer each as a suggestion with its WordNet definition so the user can tell the sense apart: "Did you mean 'buys'? (to obtain by paying)". Accepting it adds a synonym rule.
4. Show at most three per unmatched word, ordered by how many synonym sets they share with the question word.

The synonym data comes from Open English WordNet's synset files (each synset has `members` and a `definition`, verified in the downloaded data). We would build a compact index at build time, limited to words in our lexicon and to sets with at least two members, and load it lazily on first suggestion. Its size is unmeasured.

### 3. Fuzzy matching, narrowly

- **Typos:** APE already suggests corrections for unknown words (its messages carry a "bad word, good word" pair, which our linter shows as `suggestion`). With a lexicon of about 74,000 words, a typo that happens to be a real word is no longer caught; we do not try to fix that in v1.
- **Narrowing the text before RACE:** the plan already selects relevant sentences before calling RACE, and retries with the full text if the answer is unknown. That selection can use WordNet synonyms to include sentences with related words. This only chooses which sentences to try; RACE still proves the answer, so soundness is unaffected.
- **Not planned:** matching question words to the lexicon by edit distance inside the answering path. That would answer questions about words the user did not write.

## API sketch

```ts
type SynonymRule = {
  class: "noun" | "verb" | "adjective";
  from: string;              // lemma
  to: string;                // lemma
  both?: boolean;            // default false: from => to only
  valency?: "intransitive" | "transitive"; // verbs only
};

ace.synonyms.add(rule: SynonymRule): void;
ace.synonyms.remove(rule: SynonymRule): void;
ace.synonyms.list(): SynonymRule[];

type ProofLine = { text: string; kind: "axiom" | "synonym" | "substitution" };

type AskResult =
  | { status: "answered"; answers: string[]; proof: ProofLine[] }
  | { status: "unknown"; unmatched: { word: string; wordClass: string }[]; suggestions: Suggestion[] }
  | { status: "timeout" };

type Suggestion = { word: string; replacement: string; gloss: string; rule: SynonymRule };
```

Suggestions are computed by an optional module (`ace-linting/suggest`) so the synonym index is only downloaded when someone uses it. The rules themselves are part of the core Ask path.

## Phases

| Step | What | Done when |
|---|---|---|
| S1 | Compile rules to ACE sentences and append them for `ask` | Tests reproduce the verified cases above, including the wrong-phrasing guard (a rule is rejected if its words are not in the lexicon) |
| S2 | Label proof lines from rules | A test asserts the synonym line carries `kind: "synonym"` |
| S3 | Build the synonym index from WordNet | `npm run build:synonyms` writes a file with measured size and load time; notices updated |
| S4 | Suggestions from `WhyNot` | A test turns "buys a card / purchase" into a suggestion with a gloss; accepting it makes the question answerable |
| S5 | Synonym-aware sentence selection | A test where the relevant sentence uses a synonym is still found; the answer is unchanged when run with the full text |
| S6 | Verify ditransitive, adverb and mixed-subject cases | Each either passes with a documented template or is documented as unsupported |

## Risks and open questions

1. **Sense ambiguity.** Suggestions show definitions for this reason; accepted rules are the user's responsibility. Should a rule record its sense so the editor can show it later?
2. **Many rules slow RACE.** Each rule adds an axiom to the proof search. Only include rules whose words occur in the question or the text.
3. **Size of the synonym index** is unmeasured (WordNet has about 107,000 synsets). Needs a measurement and a lazy-loading plan for the browser.
4. **People versus things.** A verb rule written with `somebody` covers people; things need `something`. Do we emit both, and does emitting both cause duplicate answers? Needs a test.
5. **Ditransitive verbs** failed in the one case tried; cause unknown.
6. **Licensing:** the index is derived from Open English WordNet, so it carries the same notices as the lexicon (CC BY 4.0 and the Princeton WordNet license).
7. **Where rules are stored:** in the instance only, or exportable as an ACE text the user keeps with their notes? Exporting the compiled sentences as plain ACE would make rules portable and readable.
