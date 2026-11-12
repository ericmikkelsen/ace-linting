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
  { class: "verb", lemma: "bring", valency: "ditransitive", prep: "to", pp: "brought", source: "test" },
  { class: "verb", lemma: "send", valency: "ditransitive", prep: "to", pp: "sent", source: "test" },
  { class: "verb", lemma: "stop", valency: "intransitive", pp: "stopped", source: "test" },
  { class: "verb", lemma: "halt", valency: "intransitive", source: "test" },
  { class: "verb", lemma: "wait", valency: "intransitive", source: "test" },
  { class: "verb", lemma: "read", valency: "transitive", pp: "read", source: "test" },
  { class: "verb", lemma: "parse", valency: "transitive", source: "test" },
  { class: "adverb", lemma: "quickly", source: "test" },
  { class: "adverb", lemma: "rapidly", source: "test" },
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

test("verb rules use variables, which RACE applies to people and things alike", () => {
  assert.deepEqual(compileRule({ class: "verb", valency: "transitive", from: "buy", to: "purchase" }), ["If somebody X buys something Y then X purchases Y."]);
  assert.deepEqual(compileRule({ class: "verb", valency: "intransitive", from: "arrive", to: "come" }), ["If somebody X arrives then X comes."]);
});

test("a ditransitive rule keeps the preposition of each verb, 'to' unless told otherwise", () => {
  assert.deepEqual(compileRule({ class: "verb", valency: "ditransitive", from: "bring", to: "send" }), ["If somebody X brings something Y to somebody Z then X sends Y to Z."]);
  assert.deepEqual(compileRule({ class: "verb", valency: "ditransitive", from: "buy", to: "get", fromPrep: "for", toPrep: "to" }), ["If somebody X buys something Y for somebody Z then X gets Y to Z."]);
});

test("an adverb rule belongs to one verb, because the adverb modifies that verb's action", () => {
  assert.deepEqual(compileRule({ class: "adverb", verb: "wait", valency: "intransitive", from: "quickly", to: "rapidly" }), ["If somebody X waits quickly then X waits rapidly."]);
  assert.deepEqual(compileRule({ class: "adverb", verb: "read", valency: "transitive", from: "quickly", to: "rapidly", both: true }), [
    "If somebody X reads something Y quickly then X reads Y rapidly.",
    "If somebody X reads something Y rapidly then X reads Y quickly.",
  ]);
  assert.throws(() => compileRule({ class: "adverb", from: "quickly", to: "rapidly" } as never), /verb/);
});

test("irregular third-person forms can be given", () => {
  assert.deepEqual(compileRule({ class: "verb", valency: "transitive", from: "have", to: "own", fromSg3: "has" }), ["If somebody X has something Y then X owns Y."]);
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

// --- the leftover cases, verified against RACE

test("a ditransitive rule answers: bring implies send", async () => {
  const rule = { class: "verb", valency: "ditransitive", from: "bring", to: "send" } as const;
  await ace.synonyms.add(rule);
  try {
    const r = await ace.ask({ text: "John brings a card to Mary.", question: "Does John send a card to Mary?" });
    assert.equal(r.status, "answered");
  } finally { ace.synonyms.remove(rule); }
});

test("one verb rule serves a person and a thing as the subject", async () => {
  const rule = { class: "verb", valency: "intransitive", from: "stop", to: "halt" } as const;
  await ace.synonyms.add(rule);
  try {
    assert.equal((await ace.ask({ text: "A machine stops.", question: "Does a machine halt?" })).status, "answered");
    assert.equal((await ace.ask({ text: "John stops.", question: "Does John halt?" })).status, "answered");
    const who = await ace.ask({ text: "John stops. A machine stops.", question: "Who halts?" });
    if (who.status !== "answered") assert.fail(`expected answered, got ${who.status}`);
  } finally { ace.synonyms.remove(rule); }
});

test("a transitive rule with a thing as the subject answers, and does not fire for another object", async () => {
  const rule = { class: "verb", valency: "transitive", from: "read", to: "parse" } as const;
  await ace.synonyms.add(rule);
  try {
    assert.equal((await ace.ask({ text: "A machine reads a card.", question: "Does a machine parse a card?" })).status, "answered");
    assert.equal((await ace.ask({ text: "John reads a card.", question: "Does John parse a machine?" })).status, "unknown");
  } finally { ace.synonyms.remove(rule); }
});

test("an adverb rule for one verb answers, and does not fire for a different verb", async () => {
  const rule = { class: "adverb", verb: "wait", valency: "intransitive", from: "quickly", to: "rapidly" } as const;
  await ace.synonyms.add(rule);
  try {
    assert.equal((await ace.ask({ text: "John waits quickly.", question: "Does John wait rapidly?" })).status, "answered");
    assert.equal((await ace.ask({ text: "John stops quickly.", question: "Does John stop rapidly?" })).status, "unknown");
  } finally { ace.synonyms.remove(rule); }
});

test("a transitive adverb rule answers too", async () => {
  const rule = { class: "adverb", verb: "read", valency: "transitive", from: "quickly", to: "rapidly" } as const;
  await ace.synonyms.add(rule);
  try {
    assert.equal((await ace.ask({ text: "John reads a card quickly.", question: "Does John read a card rapidly?" })).status, "answered");
  } finally { ace.synonyms.remove(rule); }
});

// --- narrowing a long text must not lose what only a rule connects

test("on a long text, a sentence that only a synonym rule links to the question is still included", async () => {
  const rule = { class: "verb", valency: "transitive", from: "buy", to: "purchase" } as const;
  await ace.synonyms.add(rule);
  try {
    const filler = Array.from({ length: 30 }, () => "A machine waits.").join(" ");
    const r = await ace.ask({ text: `${filler} John buys a card. Mary purchases a card.`, question: "Who purchases something?" });
    if (r.status !== "answered") assert.fail(`expected answered, got ${r.status}`);
    const who = r.answers.filter((a) => a.word === "who").map((a) => a.value).sort();
    assert.deepEqual(who, ["John", "Mary"], "John is only reachable through the buy => purchase rule");
  } finally { ace.synonyms.remove(rule); }
});
