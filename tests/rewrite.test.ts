// SPDX-License-Identifier: GPL-3.0-only
import { test } from "node:test";
import assert from "node:assert/strict";
import { planRewrites, applyEdits, mapRangeBack, type TenseLookup } from "../src/rewrite.ts";

// A small lexicon: verbs by infinitive and by participle, each giving the past form.
const verbs: Record<string, { past: string; pp: string }> = {
  buy: { past: "bought", pp: "bought" }, call: { past: "called", pp: "called" }, arrive: { past: "arrived", pp: "arrived" },
  stop: { past: "stopped", pp: "stopped" }, send: { past: "sent", pp: "sent" }, break: { past: "broke", pp: "broken" }, write: { past: "wrote", pp: "written" },
};
const lookup: TenseLookup = {
  pastOfLemma: (w) => verbs[w.toLowerCase()]?.past,
  pastOfParticiple: (w) => Object.values(verbs).find((v) => v.pp === w.toLowerCase())?.past,
};
const rewrite = (text: string) => applyEdits(text, planRewrites(text, lookup));

// --- statements: has/have/had + participle becomes the simple past

test("has/have/had plus a participle becomes the past form", () => {
  assert.equal(rewrite("John has bought a card."), "John bought a card.");
  assert.equal(rewrite("Two customers have called a card."), "Two customers called a card.");
  assert.equal(rewrite("Mary had arrived."), "Mary arrived.");
});

test("the past form is used, not the participle (has written -> wrote)", () => {
  assert.equal(rewrite("John has written a card."), "John wrote a card.");
  assert.equal(rewrite("John has broken a card."), "John broke a card.");
});

test("'has' as a main verb, an unknown participle, and a participle used as an adjective are left alone", () => {
  assert.equal(rewrite("John has a card."), "John has a card.");
  assert.equal(rewrite("John has zorbed a card."), "John has zorbed a card.");
  assert.equal(rewrite("John has broken windows."), "John has broken windows.", "'broken' is followed by a plain noun: an adjective");
});

test("each sentence is handled on its own", () => {
  assert.equal(rewrite("John has bought a card. Mary has called John."), "John bought a card. Mary called John.");
});

// --- questions

test("a yes/no question about a named subject becomes a 'who' question, and remembers the name", () => {
  const text = "Did John buy a card?";
  const edits = planRewrites(text, lookup);
  assert.equal(applyEdits(text, edits), "Who bought a card?");
  assert.deepEqual(edits[0]!.who, "John");
  assert.equal(rewrite("Has John bought a card?"), "Who bought a card?");
  assert.equal(rewrite("Did John arrive?"), "Who arrived?");
  assert.equal(rewrite("Did John send a card to Mary?"), "Who sent a card to Mary?");
});

test("a question about a noun phrase becomes 'Is there a ... that ...?'", () => {
  assert.equal(rewrite("Did the customer buy a card?"), "Is there a customer that bought a card?");
  assert.equal(rewrite("Did a machine stop?"), "Is there a machine that stopped?");
  assert.equal(rewrite("Has the customer called John?"), "Is there a customer that called John?");
});

test("the article follows the first word of the noun phrase: 'an old customer'", () => {
  assert.equal(rewrite("Did the old customer buy a card?"), "Is there an old customer that bought a card?");
});

test("a noun that is also a verb inside the subject is not taken for the verb", () => {
  const more: TenseLookup = { pastOfLemma: (w) => (w === "plan" ? "planned" : lookup.pastOfLemma(w)), pastOfParticiple: lookup.pastOfParticiple };
  assert.equal(applyEdits("Did the plan stop?", planRewrites("Did the plan stop?", more)), "Is there a plan that stopped?");
});

test("questions that cannot be rewritten safely are left alone: unknown verb, plural subject, negation, other shapes", () => {
  assert.equal(rewrite("Did John zorb a card?"), "Did John zorb a card?");
  assert.equal(rewrite("Did the customers buy a card?"), "Did the customers buy a card?");
  assert.equal(rewrite("Did John not buy a card?"), "Did John not buy a card?");
  assert.equal(rewrite("Who did John call?"), "Who did John call?");
  assert.equal(rewrite("Does John buy a card?"), "Does John buy a card?");
});

test("a question and a statement in one text are both handled", () => {
  assert.equal(rewrite("John has bought a card. Did John buy a card?"), "John bought a card. Who bought a card?");
});

// --- mapping positions back

test("a position inside a rewritten sentence maps to the whole original sentence; later positions shift back", () => {
  const text = "John has bought a card. Mary waits.";
  const edits = planRewrites(text, lookup);
  const rewritten = applyEdits(text, edits); // "John bought a card. Mary waits."
  const mary = { start: rewritten.indexOf("Mary"), end: rewritten.indexOf("Mary") + 4 };
  const back = mapRangeBack(mary, edits);
  assert.equal(text.slice(back.start, back.end), "Mary");
  const bought = { start: rewritten.indexOf("bought"), end: rewritten.indexOf("bought") + 6 };
  const backBought = mapRangeBack(bought, edits);
  assert.equal(text.slice(backBought.start, backBought.end), "has bought", "the edited words map to the words that were replaced");
});
