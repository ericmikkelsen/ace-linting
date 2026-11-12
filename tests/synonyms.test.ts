// SPDX-License-Identifier: GPL-3.0-only
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createAce, AceError, type Ace, type LexEntry } from "../src/index.ts";
import { compileRule } from "../src/synonyms.ts";

const LEXICON: LexEntry[] = [
  { class: "noun", lemma: "client", gender: "human", source: "test" },
  { class: "verb", lemma: "buy", valency: "transitive", pp: "bought", source: "test" },
  { class: "verb", lemma: "purchase", valency: "transitive", source: "test" },
  { class: "verb", lemma: "acquire", valency: "transitive", source: "test" },
  { class: "verb", lemma: "arrive", valency: "intransitive", source: "test" },
  { class: "verb", lemma: "come", valency: "intransitive", pp: "come", sg3: "comes", source: "test" },
  { class: "adjective", lemma: "urgent", source: "test" },
  { class: "adjective", lemma: "important", source: "test" },
];

// --- compiling a rule into ACE sentences (pure)

test("a noun rule becomes 'Every X is a Y.', both ways when asked", () => {
  assert.deepEqual(compileRule({ class: "noun", from: "client", to: "customer" }), ["Every client is a customer."]);
  assert.deepEqual(compileRule({ class: "noun", from: "client", to: "customer", both: true }), ["Every client is a customer.", "Every customer is a client."]);
});

test("the article follows the word: 'an' before a vowel sound", () => {
  assert.deepEqual(compileRule({ class: "noun", from: "client", to: "account" }), ["Every client is an account."]);
});

test("verb rules use the verified shapes for transitive and intransitive verbs", () => {
  assert.deepEqual(compileRule({ class: "verb", valency: "transitive", from: "buy", to: "purchase" }), ["If somebody buys something then he purchases it."]);
  assert.deepEqual(compileRule({ class: "verb", valency: "intransitive", from: "arrive", to: "come" }), ["If somebody arrives then he comes."]);
});

test("irregular third-person forms can be given", () => {
  assert.deepEqual(compileRule({ class: "verb", valency: "transitive", from: "have", to: "own", fromSg3: "has" }), ["If somebody has something then he owns it."]);
});

test("an adjective rule becomes 'Everything that is X is Y.'", () => {
  assert.deepEqual(compileRule({ class: "adjective", from: "urgent", to: "important" }), ["Everything that is urgent is important."]);
});

test("a verb rule without a valency is rejected, since the two shapes differ", () => {
  assert.throws(() => compileRule({ class: "verb", from: "buy", to: "purchase" } as never), /valency/);
});

// --- through the worker with real RACE

let ace: Ace;
before(async () => { ace = await createAce({ apeDir: "vendor/APE/prolog", raceDir: "vendor/RACE/prolog", lexicon: LEXICON }); });
after(async () => { await ace.dispose(); });

test("a rule whose words APE does not know is rejected with the reason", async () => {
  await assert.rejects(
    ace.synonyms.add({ class: "noun", from: "client", to: "zzyzx" }),
    (e: unknown) => e instanceof AceError && /zzyzx/.test(e.message),
  );
  assert.deepEqual(ace.synonyms.list(), []);
});

test("added rules are listed and can be removed", async () => {
  const rule = { class: "noun", from: "client", to: "customer" } as const;
  await ace.synonyms.add(rule);
  assert.deepEqual(ace.synonyms.list(), [rule]);
  ace.synonyms.remove(rule);
  assert.deepEqual(ace.synonyms.list(), []);
});

test("without a rule 'purchase' is unknown; with one it is answered and the proof shows the rule", async () => {
  const text = "John buys a card.";
  const question = "Does John purchase a card?";
  assert.equal((await ace.ask({ text, question })).status, "unknown");

  const rule = { class: "verb", valency: "transitive", from: "buy", to: "purchase" } as const;
  await ace.synonyms.add(rule);
  try {
    const r = await ace.ask({ text, question });
    if (r.status !== "answered") assert.fail(`expected answered, got ${r.status}`);
    const lines = r.proofs[0]!.axioms;
    assert.deepEqual(lines.find((a) => a.sentence === 1)?.text, "John buys a card.");
    const syn = lines.find((a) => a.synonym);
    assert.deepEqual(syn?.synonym, rule);
    assert.equal(syn?.sentence, 0, "a synonym line is not one of the user's sentences");
  } finally { ace.synonyms.remove(rule); }
});

test("the user's own sentence numbers are unchanged when rules are appended", async () => {
  const rule = { class: "noun", from: "client", to: "customer" } as const;
  await ace.synonyms.add(rule);
  try {
    const r = await ace.ask({ text: "A machine waits. John is a client.", question: "Is John a customer?" });
    if (r.status !== "answered") assert.fail(`expected answered, got ${r.status}`);
    assert.deepEqual(r.proofs[0]!.axioms.filter((a) => !a.synonym).map((a) => a.sentence), [2]);
  } finally { ace.synonyms.remove(rule); }
});

test("intransitive verb and adjective rules answer questions too", async () => {
  const a = { class: "verb", valency: "intransitive", from: "arrive", to: "come" } as const;
  const b = { class: "adjective", from: "urgent", to: "important" } as const;
  await ace.synonyms.add(a);
  await ace.synonyms.add(b);
  try {
    assert.equal((await ace.ask({ text: "John arrives.", question: "Does John come?" })).status, "answered");
    assert.equal((await ace.ask({ text: "A card is urgent.", question: "Is a card important?" })).status, "answered");
  } finally { ace.synonyms.remove(a); ace.synonyms.remove(b); }
});

test("rules chain because each is a real sentence: buy -> purchase -> acquire", async () => {
  const r1 = { class: "verb", valency: "transitive", from: "buy", to: "purchase" } as const;
  const r2 = { class: "verb", valency: "transitive", from: "purchase", to: "acquire" } as const;
  await ace.synonyms.add(r1);
  await ace.synonyms.add(r2);
  try {
    const r = await ace.ask({ text: "John buys a card.", question: "Does John acquire a card?" });
    assert.equal(r.status, "answered");
  } finally { ace.synonyms.remove(r1); ace.synonyms.remove(r2); }
});

test("a rule that matters to neither the question nor the text is not sent, and does not change an answer", async () => {
  const rule = { class: "adjective", from: "urgent", to: "important" } as const;
  await ace.synonyms.add(rule);
  try {
    const r = await ace.ask({ text: "John buys a card.", question: "Does John purchase a card?" });
    assert.equal(r.status, "unknown");
  } finally { ace.synonyms.remove(rule); }
});

test("rules also work on long texts that are narrowed before RACE", async () => {
  const rule = { class: "verb", valency: "transitive", from: "buy", to: "purchase" } as const;
  await ace.synonyms.add(rule);
  try {
    const filler = Array.from({ length: 30 }, () => "A machine waits.").join(" ");
    const r = await ace.ask({ text: `${filler} John buys a card.`, question: "Does John purchase a card?" });
    if (r.status !== "answered") assert.fail(`expected answered, got ${r.status}`);
    assert.ok(r.proofs[0]!.axioms.some((a) => a.sentence === 31));
  } finally { ace.synonyms.remove(rule); }
});

test("rules survive a timeout restart", async () => {
  const rule = { class: "noun", from: "client", to: "customer" } as const;
  await ace.synonyms.add(rule);
  try {
    assert.equal((await ace.ask({ text: "John is a client.", question: "Is John a customer?", timeoutMs: 1 })).status, "timeout");
    assert.equal((await ace.ask({ text: "John is a client.", question: "Is John a customer?" })).status, "answered");
  } finally { ace.synonyms.remove(rule); }
});
