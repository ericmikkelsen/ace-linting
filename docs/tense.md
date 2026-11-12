# Plan: tenses

Status: P0 and P1 are built. P2 and P3 remain a plan.

## The problem

ACE has one tense, the simple present, in active and passive. Checked with the real linter:

| Sentence | Result |
|---|---|
| `John buys a card.` | valid |
| `A card is bought by John.` | valid |
| `John bought a card.` | not ACE |
| `A card was bought by John.` | not ACE |
| `John has bought a card.` / `will buy` / `is buying` / `did buy` | not ACE |
| `John buys a card on Monday.` | valid; `When does John buy a card?` answers "(on) Monday" |

"bought" is in the lexicon only as the participle used in the passive, so it is not a word form of an active verb.

## What "all past tense things" covers

Two kinds of forms, which need different tools:

| Kind | Examples | Tool |
|---|---|---|
| **Lexical**: one word changes | bought, wrote, cut, saw, went | Add the form to the lexicon. No grammar change. Covers the simple past of every verb. |
| **Periphrastic**: helper words | was bought (passive past), has bought, had bought, will buy, is buying, did buy, was happy | The grammar has no place for them. Needs rewriting before the parser, or a change to APE. |

This plan builds the lexical kind for all verbs and leaves the periphrastic kind as designed-but-later.

## What was tested (2026-11-12)

1. APE accepts past forms registered as extra **finite forms of the same lemma** (`tv_finsg(bought, buy)`, `tv_infpl(bought, buy)`): no warnings, and the parse is **identical to the present tense**, so the tense is silently dropped.
2. APE accepts a past form registered as **its own verb** (`tv_finsg(bought, bought)`, `tv_infpl(bought, bought)`): no warnings, "John bought a card.", "Two customers bought a card.", "Every customer who bought a card is happy." and "Who bought a card?" all parse, with the predicate named `bought`, distinct from `buy`. The passive "A card is bought by John." still has the predicate `buy`, because the participle entry points to `buy`.
3. Across all 11,259 verb entries of our generated lexicon: a past form can be derived for 11,237 (22 skipped, forms with apostrophes or no usable form). For 11,064 the past equals the participle (regular verbs and no-change verbs such as cut); for 173 they differ (broke/broken, gave/given, took/taken). Adding all of them as own-verb forms (22,474 terms) gave **134 conflicts (0.6%)**, every one "this form of a verb is defined twice": verb homographs such as cut, set, hit, put, let, shut, split (past equals the infinitive), saw, found, fell, felt, lay, bound, ground, bed, shed, seed, smelt. No conflicts with nouns, adjectives or adverbs.

## The key design choice: what is "bought" to the logic?

| Choice | "John bought a card." means | Questions | Cost |
|---|---|---|---|
| **A. Own word (recommended)** | the predicate `bought`; not the same as `buy` | "Who bought a card?" works; "Does John buy a card?" does **not** use it | Nothing is silently equated; the past is visible in the vocabulary. Cross-tense questions need an explicit rule |
| B. Same word as the present | the predicate `buy`, tense erased | any question form works, including "Does John buy a card?" | The past is lost: a past fact answers a present question. Misleading for notes |
| C. Tense marker | present form plus a visible marker such as "at Past" | "Did ...?" can differ from "Does ...?" | Needs the rewriting layer (below); the most faithful, the most work |

**Recommendation: A now, with C as a separate later project.** A follows the decision above, is small, and leaves nothing hidden. When someone wants a past fact to answer a present question, they say so with a rule (the synonym machinery already supports verb rules; see `docs/question-synonyms.md`), so the link is explicit and visible in proofs.

## Plan

### P0. Say it clearly (small, independent)

Make the linter explain tense. When an unknown word in a sentence is a known tense helper (`will`, `did`, `has`, `have`, `had`, `was`, `were`) or an `-ing` verb form after `is/are`, or a known past form (via a past-to-lemma index), say: "ACE has only the present tense. Write `John buys a card.`, `A card is bought by John.`, or add a time (`... on Monday.`)." Today the hint can be odd (`will` suggests `till`, because APE treats it as a misspelling).
- Done when: tests cover each helper word and a past form, and the message replaces APE's spelling hint for them.

### P1. Past forms for every verb (the core)

1. **Data model.** `LexEntry` verb gets an optional `past` (simple past). `toApeLines` emits, for own-word mode, `<k>_finsg(past, past)` and `<k>_infpl(past, past)` (with the preposition for ditransitive verbs). Entries whose `past` equals the infinitive are skipped (the form already exists).
2. **Derivation, for all verbs.**
   - Regular verbs: past = participle (the existing `regularPp` rule).
   - Irregular verbs: from Open English WordNet's exception lists. When it lists two non-`-ing` forms, the participle is the one we already chose and the past is the other (173 verbs differ); when it lists one, past = participle (11,064).
   - Hand-written overrides (CC0) for `be`, `have`, `do`, `go`, `say` and others the lists get wrong; `be` needs `was`/`were` as a special case (copula, see P3).
   - Skip forms that are not plain lowercase letters.
3. **Conflicts.** Past forms that APE reports as "defined twice" (measured: 134 terms) are resolved by the existing priority rules, plus an explicit list of homographs where a common verb's past must win (for example see/saw over the verb saw): decided once, in a small hand-written file, and checked by a test.
4. **Validation.** The build checks each past form with a sample sentence (`A customer ${past} a card.` and so on), as for every other entry. The provenance report counts past forms per source.
5. **User words.** `ace.lexicon.add` accepts `past` on a verb; `list`/`remove` carry it with the verb.
6. **Size and speed.** About 22,000 more terms, roughly +1.5 MB of lexicon text; re-measure load time (currently about 0.6 s for 74,000 entries).

- Done when: "John bought a card.", "Two customers bought a card.", "Who bought a card?" and relative clauses parse for sample verbs of each class (regular, irregular, no-change, ditransitive), the conflict list is documented, and the lexicon build reports its counts.

### P2. Links between tenses (optional, user-controlled)

- A per-lexicon switch to merge instead (choice B) for people who prefer erased tense, implemented as registering the past form against the present lemma (tested in 1 above). Off by default.
- A helper that offers rules such as "bought implies buy" as an explicit synonym-style rule (verb rule from the past form to the present form), shown in proofs like any other rule.
- Done when: both are covered by tests, and the docs state plainly that merging erases tense.

### P3. Periphrastic tenses (separate project, only if needed)

Constructions with helper words cannot be added through the lexicon. Two routes:
- **Rewrite before parsing** (recommended if pursued): a normalizer turns `was bought`, `has bought`, `will buy`, `is buying`, `did buy` into the present form plus a visible marker (for example a prepositional phrase with a time constant: `John buys a card at Past.`), with a source map so diagnostics point at the user's original words. Questions are rewritten the same way (`Did John buy a card?` to `Does John buy a card at Past?`). It needs: the marker design (Past, Now, Future, and how an unmarked sentence behaves), the offset map, and a hook for it in `createAce`.
- **Change APE's grammar**: not recommended. We do not ship APE; a fork would need its own hosting, pinned hashes, license handling and upkeep, and APE's grammar interacts in ways that are easy to break.
- Done when: its own design document exists, with the marker semantics checked against RACE.

## What P1 did (2026-11-12)

- `LexEntry` verbs have `past` (default: the participle; `false` leaves it out). The past is its own word; when it equals the infinitive (cut, put) only the singular form is added.
- The lexicon build derives `past` for every verb. About 190 irregular verbs carry an explicit `past`.
- **A bug found on the way:** the participle heuristic picked `began` for `begin` (both end in -n), so the old lexicon had the wrong participle for begin and a few others. It is replaced by `pastAndParticiple`, tested on 15 pairs (wrote/written, began/begun, sang/sung, swam/swum, drank/drunk, showed/shown, went/gone and more).
- **Conflicts** with other verbs' forms are settled in the build: the base verb wins by default, and `lexicon/oewn/homographs.json` lists seven forms where the past must win (saw, found, fell, felt, bound, spat, smelt). Several valencies of one verb share their past; a rival verb with the same past loses it. 49 verb entries end up without a past form (listed in the generated PROVENANCE.md), for example lie/lay, bear/bore, grind/ground, and spelling variants such as install/instal. A past form only counts as clashing when APE complains about verb forms; an adverb that is also a noun has nothing to do with it.
- **Checked** on the full generated lexicon: 25 of 25 sample sentences are valid, including bought, wrote, saw, found, fell, felt, left, went, took, gave a card to Mary, cut, put, read, ran, sat, stood, told, ate, drank, plural subjects and a relative clause.
- **Cost:** the generated lexicon grew from 4.8 MB to 5.4 MB of text; loading all 74,000 entries took about 0.7 s (it was about 0.6 s), and Node's process memory went from about 327 MB to 361 MB.

## Risks and open questions

1. **Homographs.** 134 measured conflicts, resolved by a hand list. Which reading wins for ambiguous ones (`saw`, `found`, `left`, `felt`) is a judgment call, and an ambiguous sentence is read one way only.
2. **Participle versus past.** WordNet gives forms unlabeled; we choose the participle by spelling (an `-n`/`-en` ending) and take the other as the past. The 173 differing verbs should be reviewed once by a person.
3. **The passive keeps the present lemma.** "A card is bought by John." has the predicate `buy` while "John bought a card." has `bought`. That is the cost of choice A; choice B removes it at the price of tense.
4. **Copula and modals.** `was`, `were`, `will`, `would`, `can` are function words APE owns; they are out of reach for the lexicon.
5. **Time as data stays the better habit.** `John buys a card on Monday.` already answers "When?" and keeps time explicit and queryable.
6. **Everything in the checks above is for English verbs in our lexicon;** other word classes (adjectives like "bought") are not part of this.
