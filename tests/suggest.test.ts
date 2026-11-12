// SPDX-License-Identifier: GPL-3.0-only
import { test } from "node:test";
import assert from "node:assert/strict";
import { createAce, type LexEntry } from "../src/index.ts";
import { suggest } from "../src/suggest.ts";
import { buildIndex, type RawSynset, type SynonymIndex } from "../src/synonym-index.ts";

// --- building the index (pure)

const SYNSETS: RawSynset[] = [
  { pos: "v", members: ["buy", "purchase", "take"], definition: "obtain by paying" },
  { pos: "v", members: ["buy", "believe"], definition: "accept as true" },
  { pos: "n", members: ["client", "customer", "Client State"], definition: "someone who pays" },
  { pos: "n", members: ["lonely"], definition: "only one member" },
  { pos: "s", members: ["urgent", "pressing"], definition: "demanding attention" },
];

test("the index keeps single plain lowercase words, drops one-member sets, and maps lemmas to their sets", () => {
  const idx = buildIndex(SYNSETS, new Set(["buy", "purchase", "take", "believe", "client", "customer", "urgent", "pressing", "lonely"]));
  assert.deepEqual(idx.v["buy"]!.map((i) => idx.synsets[i]![0]), ["obtain by paying", "accept as true"]);
  assert.deepEqual(idx.synsets[idx.v["purchase"]![0]!]![1], ["buy", "purchase", "take"]);
  assert.deepEqual(idx.n["client"]!.map((i) => idx.synsets[i]![1]), [["client", "customer"]], "'Client State' is dropped");
  assert.equal(idx.n["lonely"], undefined);
  assert.ok(idx.a["urgent"], "satellite adjectives count as adjectives");
});

test("words outside the allowed lexicon are left out", () => {
  const idx = buildIndex(SYNSETS, new Set(["buy", "purchase"]));
  assert.deepEqual(idx.synsets[idx.v["buy"]![0]!]![1], ["buy", "purchase"]);
});

test("words that are also JavaScript object keys (constructor, toString) index and look up correctly", () => {
  const idx = buildIndex(
    [{ pos: "n", members: ["constructor", "builder"], definition: "someone who builds" }, { pos: "n", members: ["valueof", "worth"], definition: "x" }],
    new Set(["constructor", "builder", "valueof", "worth"]),
  );
  assert.deepEqual(idx.n["constructor"], [0]);
  const roundTripped = JSON.parse(JSON.stringify(idx)) as typeof idx;
  assert.deepEqual(suggest([{ wordClass: "countable common noun", word: "constructor" }], "A builder waits.", roundTripped)[0]?.replacement, "builder");
  assert.deepEqual(suggest([{ wordClass: "countable common noun", word: "toString" }], "A builder waits.", roundTripped), []);
  assert.deepEqual(suggest([{ wordClass: "countable common noun", word: "hasownproperty" }], "A builder waits.", roundTripped), []);
});

// --- suggesting (pure)

const index: SynonymIndex = buildIndex(SYNSETS, new Set(["buy", "purchase", "take", "believe", "client", "customer", "urgent", "pressing"]));

test("an unmatched verb gets the synonym that appears in the text, with its definition and a ready rule", () => {
  const s = suggest([{ wordClass: "transitive verb", word: "purchase" }], "John buys a card.", index);
  assert.equal(s.length, 1);
  assert.equal(s[0]!.replacement, "buy");
  assert.match(s[0]!.gloss, /obtain by paying/);
  assert.deepEqual(s[0]!.rule, { class: "verb", valency: "transitive", from: "buy", to: "purchase" });
});

test("synonyms that are not in the text are not suggested, and neither is the word itself", () => {
  assert.deepEqual(suggest([{ wordClass: "transitive verb", word: "purchase" }], "John sleeps.", index), []);
  assert.deepEqual(suggest([{ wordClass: "transitive verb", word: "purchase" }], "John purchases a card.", index), []);
});

test("a noun's '(at least 1)' prefix is ignored", () => {
  const s = suggest([{ wordClass: "countable common noun", word: "(at least 1) customer" }], "John is a client.", index);
  assert.deepEqual(s[0]!.rule, { class: "noun", from: "client", to: "customer" });
});

test("an adjective gets an adjective rule", () => {
  const s = suggest([{ wordClass: "adjective", word: "pressing" }], "A task is urgent.", index);
  assert.deepEqual(s[0]!.rule, { class: "adjective", from: "urgent", to: "pressing" });
});

test("classes we cannot write a rule for (proper names, prepositions, ditransitive verbs) get nothing", () => {
  assert.deepEqual(suggest([{ wordClass: "proper name", word: "John" }, { wordClass: "preposition", word: "to" }, { wordClass: "ditransitive verb", word: "purchase" }], "John buys a card.", index), []);
});

test("at most the requested number of suggestions per word, and no duplicates", () => {
  const s = suggest([{ wordClass: "transitive verb", word: "purchase" }, { wordClass: "transitive verb", word: "purchase" }], "John buys and takes a card.", index, 1);
  assert.equal(s.length, 1);
});

// --- through ask

const LEXICON: LexEntry[] = [
  { class: "verb", lemma: "buy", valency: "transitive", pp: "bought", source: "test" },
  { class: "verb", lemma: "purchase", valency: "transitive", source: "test" },
];

test("an unknown answer carries suggestions, and accepting one makes the question answerable", async () => {
  const ace = await createAce({ apeDir: "vendor/APE/prolog", raceDir: "vendor/RACE/prolog", lexicon: LEXICON, synonymIndex: index });
  try {
    const first = await ace.ask({ text: "John buys a card.", question: "Does John purchase a card?" });
    if (first.status !== "unknown") assert.fail(`expected unknown, got ${first.status}`);
    assert.equal(first.suggestions.length, 1);
    await ace.synonyms.add(first.suggestions[0]!.rule);
    assert.equal((await ace.ask({ text: "John buys a card.", question: "Does John purchase a card?" })).status, "answered");
  } finally { await ace.dispose(); }
});

test("without an index, unknown answers have no suggestions", async () => {
  const ace = await createAce({ apeDir: "vendor/APE/prolog", raceDir: "vendor/RACE/prolog", lexicon: LEXICON });
  try {
    const r = await ace.ask({ text: "John buys a card.", question: "Does John purchase a card?" });
    if (r.status !== "unknown") assert.fail(`expected unknown, got ${r.status}`);
    assert.deepEqual(r.suggestions, []);
  } finally { await ace.dispose(); }
});

test("the index can be given as a loader that is called only when needed", async () => {
  let loads = 0;
  const ace = await createAce({ apeDir: "vendor/APE/prolog", raceDir: "vendor/RACE/prolog", lexicon: LEXICON, synonymIndex: async () => { loads++; return index; } });
  try {
    assert.equal((await ace.ask({ text: "John buys a card.", question: "Does John buy a card?" })).status, "answered");
    assert.equal(loads, 0, "not loaded for an answered question");
    await ace.ask({ text: "John buys a card.", question: "Does John purchase a card?" });
    await ace.ask({ text: "John buys a card.", question: "Does John purchase a card?" });
    assert.equal(loads, 1, "loaded once, on the first unknown");
  } finally { await ace.dispose(); }
});
