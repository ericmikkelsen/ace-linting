# Plugins

A plugin adds diagnostics after APE has parsed a text. It cannot change or remove APE's own diagnostics.

```ts
import { createAce, typeCheck, type Plugin } from "ace-linting";

const ace = await createAce();

const noPassive: Plugin = {
  name: "style",
  afterParse(parsed) {
    return parsed.events
      .filter((e) => e.object?.kind === "property")           // "A card is X": adjective predicates
      .map((e) => ({ severity: "warning", code: "adjective", message: "Prefer a verb.", range: e.range, sentence: e.sentence }));
  },
};

const remove = ace.use(noPassive);   // diagnostics get the code "style/adjective"
await ace.lint("A customer is happy.");
remove();
```

## What a plugin sees

`afterParse(parsed: ParsedText)` receives what APE understood:

- `parsed.events`: each verb with its `subject`, `object` and `indirect` arguments and the verb's character `range`.
- An argument is an `object` (a noun phrase, with `id`, `noun` and `range`), a `name` (a proper name such as John) or a `property` (the adjective after "is").
- Pronouns and "the X" are already resolved: the subject of "He waits." has the same `id` as the "customer" it refers to, with the range in the earlier sentence. Compare `arg.sentence` with `event.sentence` to tell.
- `parsed.objects` lists every noun phrase; `parsed.sentences` the sentence spans.

A plugin returns diagnostics (or nothing), synchronously or as a promise.

## Rules

- Diagnostics get the plugin's name as a code prefix (`types/subject`) unless they already have it.
- A plugin that throws, or returns a malformed diagnostic (bad range, wrong shape), is reported as one warning, `ace-linting/plugin-error`, and the rest of the linting is unaffected.
- Two plugins cannot share a name; `ace.use` returns a function that removes the plugin.
- Plugin findings never block `ask`: only APE's own errors make a text or question `invalid`.

## Built in: `typeCheck`

ACE has no word types ("A coffee executes a command." is valid ACE). `typeCheck(schema)` adds them:

```ts
typeCheck({
  types: { SystemAgent: ["Agent"] },                       // optional hierarchy
  nouns: { coffee: "Consumable", user: "SystemAgent" },     // noun lemma -> type
  verbs: { execute: { subject: ["Agent"], object: ["Payload"] } },
});
```

A noun with no declared type is never reported. Mismatches are `types/subject` or `types/object` errors, pointing at the noun when it is in the verb's sentence and at the verb when a pronoun leads back to an earlier sentence.
