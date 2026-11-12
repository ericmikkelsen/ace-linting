// SPDX-License-Identifier: GPL-3.0-only
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createAce, type Ace } from "../src/index.ts";

let ace: Ace;
before(async () => {
  ace = await createAce({ apeDir: "vendor/APE/prolog", raceDir: "vendor/RACE/prolog" });
  const r = await ace.lexicon.add([
    { class: "verb", lemma: "call", valency: "transitive", source: "test" },
    { class: "verb", lemma: "buy", valency: "transitive", pp: "bought", source: "test" },
    { class: "verb", lemma: "write", valency: "transitive", pp: "written", past: "wrote", source: "test" },
    { class: "verb", lemma: "cut", valency: "transitive", pp: "cut", source: "test" },
    { class: "verb", lemma: "arrive", valency: "intransitive", source: "test" },
    { class: "verb", lemma: "send", valency: "ditransitive", prep: "to", pp: "sent", source: "test" },
  ]);
  assert.deepEqual(r.rejected, [], "the test verbs are accepted");
});
after(async () => { await ace.dispose(); });

const errors = async (t: string) => (await ace.lint(t)).diagnostics.filter((d) => d.severity === "error");
const valid = async (t: string) => assert.deepEqual(await errors(t), [], t);

test("the simple past parses for regular, irregular, no-change, intransitive and ditransitive verbs", async () => {
  for (const t of [
    "John called a card.",
    "Two customers called a card.",
    "John bought a card.",
    "John wrote a card.",
    "John cut a card.",
    "Two customers cut a card.",
    "John arrived.",
    "Two customers arrived.",
    "John sent a card to Mary.",
    "Every customer who bought a card is happy.",
  ]) await valid(t);
});

test("the present tense and the passive still work next to the past", async () => {
  for (const t of ["John buys a card.", "A card is bought by John.", "A card is written by John.", "John writes a card."]) await valid(t);
});

test("past tense is its own word: 'wrote' is a different predicate from 'write'", async () => {
  const past = (await ace.parse("John wrote a card.")).events[0]!;
  const present = (await ace.parse("John writes a card.")).events[0]!;
  const passive = (await ace.parse("A card is written by John.")).events[0]!;
  assert.equal(past.verb, "wrote");
  assert.equal(present.verb, "write");
  assert.equal(passive.verb, "write", "the passive keeps the present verb");
});

test("who-questions work in the past; a present question does not use a past fact (the past is not erased)", async () => {
  const r = await ace.ask({ text: "John bought a card.", question: "Who bought a card?" });
  if (r.status !== "answered") assert.fail(`expected answered, got ${r.status}`);
  assert.ok(r.answers.some((a) => a.value === "John"));
  assert.equal((await ace.ask({ text: "John bought a card.", question: "Does John buy a card?" })).status, "unknown");
});

test("a rule can link the past to the present when the user wants it", async () => {
  // the past form is its own verb, so the rule names it as the finite form of the "from" verb
  const rule = { class: "verb", valency: "transitive", from: "bought", to: "buy", fromSg3: "bought" } as const;
  await ace.synonyms.add(rule);
  try {
    assert.equal((await ace.ask({ text: "John bought a card.", question: "Does John buy a card?" })).status, "answered");
  } finally { ace.synonyms.remove(rule); }
});

test("past: false turns the past off for one verb", async () => {
  await ace.lexicon.add({ class: "verb", lemma: "frob", valency: "transitive", pp: "frobbed", past: false, source: "test" });
  assert.ok((await errors("John frobbed a card.")).length > 0);
  await ace.lexicon.remove({ class: "verb", lemma: "frob" });
});

test("a verb whose past form is already another verb's form is rejected, with the reason", async () => {
  await ace.lexicon.add({ class: "verb", lemma: "see", valency: "transitive", pp: "seen", past: "saw", source: "test" });
  const r = await ace.lexicon.add({ class: "verb", lemma: "saw", valency: "transitive", pp: "sawed", source: "test" });
  assert.equal(r.rejected.length, 1);
  assert.match(r.rejected[0]!.reason, /defined twice/);
  await valid("John saw a card.");
});
