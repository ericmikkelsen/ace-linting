# Design: synonyms and suggestions for questions

Status: built (S1 to S6). The shapes below were verified against RACE; the unverified cases of the first draft are now resolved.

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

### Second round (variables), which settled the open cases

The first draft's verb shape ("If somebody buys something then he purchases it.") worked only for some subjects, and failed for a thing as the subject of a transitive verb and for ditransitive verbs. The cause: in "...then it parses it", both "it"s refer to the same antecedent, the object. Rules written with ACE variables avoid pronouns altogether:

| Case | Rule | Result |
|---|---|---|
| Intransitive, person | `If somebody X stops then X halts.` | Answered (John) |
| Intransitive, thing | same rule | Answered (a machine); "somebody" is not limited to people in RACE |
| "Who halts?" with both | same rule | Answered with both |
| Transitive, person and thing | `If somebody X reads something Y then X parses Y.` | Answered for John and for a machine; "Who parses a card?" answered |
| Ditransitive | `If somebody X brings something Y to somebody Z then X sends Y to Z.` | Answered; also with "shows" |
| Adverb, intransitive verb | `If somebody X waits quickly then X waits rapidly.` | Answered |
| Adverb, transitive verb | `If somebody X reads something Y quickly then X reads Y rapidly.` | Answered |
| Over-firing | the same rules with a different verb or object in the question | Unknown, as it should be |

The first round's ditransitive failure was therefore the pronoun shape, not the lexicon.

## Design

### 1. Synonym rules (deterministic, explicit)

A rule says two words mean the same thing for this user, in one direction or both. It compiles to ACE sentences by word class:

| Class | Compiled sentence (X means Y) |
|---|---|
| noun | `Every X is a Y.` (and the reverse when both ways) |
| adjective | `Everything that is X is Y.` |
| verb, intransitive | `If somebody X Xs then X Ys.` (variables; written in full below) |
| verb, transitive | `If somebody X buys something Y then X purchases Y.` |
| verb, ditransitive | `If somebody X brings something Y to somebody Z then X sends Y to Z.` (each verb's preposition, "to" by default) |
| adverb (tied to one verb) | `If somebody X waits quickly then X waits rapidly.` |

An adverb rule names the verb it applies to (`verb: "wait"`), because "quickly means rapidly" cannot be stated for every verb at once. Still unsupported: prepositions, and the double-object form "gives a machine a card".

Where they go: the compiled sentences are appended **after** the user's text before calling RACE, so the numbering of the user's own sentences in the proof does not shift. The proof lines that come from a rule are labeled (`sentence: 0`, `synonym: rule`).

Rules are never closed transitively by us; each link is something the user wrote. RACE chains them because each is a real sentence.

### 2. Suggestions when the answer is unknown

After `ask` returns unknown, a separate step looks at the unmatched words from `WhyNot`:

1. For each unmatched noun, verb or adjective, look up its WordNet synonym sets and collect the other words in those sets.
2. Keep only words that actually appear in the axiom text (any inflected form).
3. Offer each as a suggestion with its WordNet definition so the user can tell the sense apart: "Did you mean 'buys'? (to obtain by paying)". Accepting it adds a synonym rule.
4. Show at most three per unmatched word, ordered by how many synonym sets they share with the question word.

The synonym data comes from Open English WordNet's synset files (each synset has `members` and a `definition`). `npm run build:synonyms` builds a compact index limited to words in our generated lexicon and to sets with at least two members. Measured: 23,199 sets (24,436 nouns, 6,260 verbs, 11,524 adjectives), 2.9 MB raw and 0.98 MB gzipped. `createAce({ synonymIndex })` takes the index or a loader that is called once, on the first unknown answer.

Tried against the real index and lexicon: buy => purchase, client => customer, urgent => pressing and read => study were suggested and, once accepted, made the question answerable. "Does a manager arrange a meeting?" from "schedules" got no suggestion (WordNet does not put the two in one set). The read => study sense ("be a student of a certain subject") shows why the definition is shown: the user decides.

### 3. Fuzzy matching, narrowly

- **Typos:** APE already suggests corrections for unknown words (its messages carry a "bad word, good word" pair, which our linter shows as `suggestion`). With a lexicon of about 74,000 words, a typo that happens to be a real word is no longer caught; we do not try to fix that in v1.
- **Narrowing the text before RACE (S5, built):** long texts are narrowed to sentences related to the question, with a retry on everything when the answer is unknown. The narrowing now follows the user's synonym rules, chains included: a question about "purchase" also pulls in sentences about "buy" when a rule links them. Only the user's rules are used: RACE cannot use a synonym without a rule, so widening the selection with WordNet synonyms would add sentences it cannot use. This matters for "who" questions, where narrowing can silently drop a sentence that would have added an answer (the retry only triggers on "unknown").
- **Matching word forms:** the narrowing compares candidate base forms (purchases, purchased and purchase meet). The first version stripped "es" from "purchases" and so never matched "purchase"; the tests that exercised it passed only because other words overlapped. Fixed and tested.
- **Not planned:** matching question words to the lexicon by edit distance inside the answering path. That would answer questions about words the user did not write.

## API sketch

```ts
type SynonymRule =
  | { class: "noun" | "adjective"; from: string; to: string; both?: boolean }
  | { class: "verb"; valency: "intransitive" | "transitive" | "ditransitive"; from: string; to: string; both?: boolean;
      fromSg3?: string; toSg3?: string; fromPrep?: string; toPrep?: string }
  | { class: "adverb"; verb: string; valency: "intransitive" | "transitive"; from: string; to: string; both?: boolean; verbSg3?: string };

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
2. **Many rules slow RACE.** Each relevant rule adds an axiom to the proof search; only rules whose words occur in the question or the text are sent (chains included). Not measured with hundreds of rules.
3. **Narrowing can drop answers.** For a "who" question on a long text, a narrowed text that still answers gives only the answers found in the chosen sentences. Rule-aware selection closes the synonym gap but not the general one.
4. **The double-object form** ("gives a machine a card") and preposition synonyms have no rule shape.
5. **Licensing:** the index is derived from Open English WordNet, so it carries the same notices as the lexicon (CC BY 4.0 and the Princeton WordNet license).
6. **Where rules are stored:** in the instance only, or exportable as plain ACE text? Exporting the compiled sentences would make rules portable and readable.
