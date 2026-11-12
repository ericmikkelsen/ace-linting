# Adding and removing words

APE only knows the words in its lexicon. `ace.lexicon` lets a user add words and take them out again, safely.

```ts
const result = await ace.lexicon.add([
  { class: "noun", lemma: "gadget" },
  { class: "verb", lemma: "frob", valency: "transitive", pp: "frobbed" },
]);
// result.added, result.replaced, result.unchanged, result.rejected (each with a reason), result.warnings

await ace.lint("A customer frobs a gadget.");      // no errors now
await ace.lexicon.remove({ class: "noun", lemma: "gadget" });
ace.lexicon.list();                                 // what is in
```

Entry classes and fields: `noun` (optional `plural`, `gender`), `noun-mass`, `verb` (`valency`: intransitive, transitive or ditransitive; optional `sg3`, `pp`, `past`, `prep`), `adjective` and `adverb` (optional `comp`, `sup`). Forms that follow regular English rules are generated, including the simple past: it defaults to the participle (`bought`), and you give `past` only when they differ (`pp: "written", past: "wrote"`) or `past: false` to leave it out. The past is a word of its own, so `John bought a card.` is valid but is not the same fact as `John buys a card.` (see [docs/tense.md](tense.md)). A verb whose past participle might double its last letter (stop, frob) must spell it out; the entry is refused otherwise.

## What `add` does

1. Checks the shape of every entry first; a bad entry stops the call before anything changes.
2. An entry identical to one already in goes to `unchanged` and nothing happens.
3. An entry for the same word and class with different forms **replaces** the older one (`replaced`).
4. APE then reports conflicts, and an entry it objects to is **rejected** and not kept, with the reason:
   - a function word (`every`, `not`, ...) cannot be redefined;
   - a word cannot be both an adverb and a noun;
   - two new entries cannot define the same form (the first stays).
   If a rejected entry was replacing an older one, the older one is put back.
5. Unless you pass `{ validate: false }`, each kept entry must parse in a few sample sentences; one that does not is rejected as well.

## What `remove` does

`remove({ class, lemma })` takes the word out. For a verb, leaving out `valency` removes every valency; nouns and mass nouns share one slot. Removing a word that is not there does nothing.

## Limits

- **APE's built-in words cannot be removed.** An entry for a word it already knows adds forms next to the built-in ones (adding `card` with plural `cardz` makes both `cards` and `cardz` valid); removing the entry takes only yours away.
- Entries survive a worker restart (for example after an `ask` timeout): the current lexicon is replayed, so additions, replacements and removals all stay as they were.
- `ace.addEntries` and the `lexicon` option of `createAce` are the unchecked, fast path for a large trusted list (the generated WordNet lexicon uses it). Entries added that way still show up in `list()` and can be removed with `remove`, but they get no conflict handling or sample sentences.
- Capitalized words that APE does not know are accepted as proper names with a warning, so names need no entries.
