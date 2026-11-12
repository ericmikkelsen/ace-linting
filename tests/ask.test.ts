// SPDX-License-Identifier: GPL-3.0-only
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createAce, AceError, type Ace } from "../src/index.ts";
import { selectRelevant } from "../src/select.ts";
import { toAskResult } from "../src/ask.ts";

const AXIOMS = "John is a customer. Mary is a customer. John inserts a card. Every customer who inserts a card is happy.";

// --- pure parts

test("raw RACE output with proofs becomes an answered result, numbered by the original sentences", () => {
  const r = toAskResult({
    proofs: [["1: John is a customer.", "3: John inserts a card.", "4: Every customer who inserts a card is happy."]],
    whyNot: [],
    messages: [],
  }, [1, 2, 3, 4]);
  assert.equal(r.status, "answered");
  if (r.status !== "answered") return;
  assert.deepEqual(r.proofs[0]!.axioms.map((a) => a.sentence), [1, 3, 4]);
  assert.deepEqual(r.answers, []);
});

test("sentence numbers are mapped back when only some sentences were sent to RACE", () => {
  const r = toAskResult({ proofs: [["1: A.", "2: B."]], whyNot: [], messages: [] }, [4, 9]);
  if (r.status !== "answered") assert.fail("expected answered");
  assert.deepEqual(r.proofs[0]!.axioms.map((a) => a.sentence), [4, 9]);
});

test("substitutions become answers, deduplicated across proofs", () => {
  const r = toAskResult({
    proofs: [
      ["1: John is a customer.", "Substitution: who = John"],
      ["1: John is a customer.", "Substitution: who = John"],
      ["2: Mary is a customer.", "Substitution: who = Mary"],
    ],
    whyNot: [], messages: [],
  }, [1, 2]);
  if (r.status !== "answered") assert.fail("expected answered");
  assert.deepEqual(r.answers, [{ word: "who", value: "John" }, { word: "who", value: "Mary" }]);
  assert.deepEqual(r.proofs[0]!.substitutions, [{ word: "who", value: "John" }]);
});

test("no proofs means unknown, with the unmatched words and their classes", () => {
  const r = toAskResult({ proofs: [], whyNot: ["proper name: Mary", "adjective: happy", "countable common noun: (at least 1) card"], messages: [] }, [1]);
  assert.equal(r.status, "unknown");
  if (r.status !== "unknown") return;
  assert.deepEqual(r.unmatched, [
    { wordClass: "proper name", word: "Mary" },
    { wordClass: "adjective", word: "happy" },
    { wordClass: "countable common noun", word: "(at least 1) card" },
  ]);
});

test("selectRelevant keeps sentences that share words with the question, and those linked to them", () => {
  const sentences = [
    "The weather is nice.",                 // 0 irrelevant
    "John inserts a card.",                 // 1 shares 'john'
    "A dog sleeps.",                        // 2 irrelevant
    "Every customer who inserts a card is happy.", // 3 shares 'card' with sentence 1, 'inserts'
    "Mary reads a report.",                 // 4 irrelevant
  ];
  assert.deepEqual(selectRelevant(sentences, "Is John happy?"), [1, 3]);
});

test("selectRelevant returns every sentence index when nothing matches", () => {
  assert.deepEqual(selectRelevant(["A dog sleeps.", "A cat waits."], "Is John happy?"), [0, 1]);
});

// --- through the worker with real RACE

let ace: Ace;
before(async () => { ace = await createAce({ apeDir: "vendor/APE/prolog", raceDir: "vendor/RACE/prolog" }); });
after(async () => { await ace.dispose(); });

test("a yes/no question is answered with the axioms used", async () => {
  const r = await ace.ask({ text: AXIOMS, question: "Is John happy?" });
  assert.equal(r.status, "answered");
  if (r.status !== "answered") return;
  assert.deepEqual(r.proofs[0]!.axioms.map((a) => a.sentence), [1, 3, 4]);
});

test("a who question returns its answers", async () => {
  const r = await ace.ask({ text: AXIOMS, question: "Who is happy?" });
  if (r.status !== "answered") assert.fail(`expected answered, got ${r.status}`);
  assert.ok(r.answers.some((a) => a.word === "who" && a.value === "John"));
});

test("a question that cannot be proved is unknown, never no", async () => {
  const r = await ace.ask({ text: AXIOMS, question: "Is Mary happy?" });
  assert.equal(r.status, "unknown");
  if (r.status !== "unknown") return;
  assert.ok(r.unmatched.some((u) => u.word === "happy" && u.wordClass === "adjective"));
});

test("text or a question that is not valid ACE is reported as invalid, with diagnostics", async () => {
  const r = await ace.ask({ text: AXIOMS, question: "Is happy John?" });
  assert.equal(r.status, "invalid");
  if (r.status !== "invalid") return;
  assert.ok(r.question.some((d) => d.severity === "error"));
  assert.deepEqual(r.text, []);
});

test("a long text is answered the same as the short one", async () => {
  const filler = Array.from({ length: 30 }, () => "A machine waits.").join(" ");
  const r = await ace.ask({ text: `${filler} ${AXIOMS}`, question: "Is John happy?" });
  if (r.status !== "answered") assert.fail(`expected answered, got ${r.status}`);
  // the four real sentences are numbered 31-34 in the original text
  assert.deepEqual(r.proofs[0]!.axioms.map((a) => a.sentence), [31, 33, 34]);
});

test("a call that runs past timeoutMs returns timeout, and the instance keeps working afterwards", async () => {
  const r = await ace.ask({ text: AXIOMS, question: "Is John happy?", timeoutMs: 1 });
  assert.equal(r.status, "timeout");
  const again = await ace.ask({ text: AXIOMS, question: "Is John happy?" });
  assert.equal(again.status, "answered");
});

test("lexicon additions survive a timeout restart", async () => {
  await ace.addEntries([{ class: "noun", lemma: "gizmo", source: "test" }]);
  const t = await ace.ask({ text: AXIOMS, question: "Is John happy?", timeoutMs: 1 });
  assert.equal(t.status, "timeout");
  assert.deepEqual((await ace.lint("A customer inserts a gizmo.")).diagnostics, []);
});

test("ask without RACE files fails clearly", async () => {
  const noRace = await createAce({ apeDir: "vendor/APE/prolog" });
  try {
    await assert.rejects(noRace.ask({ text: AXIOMS, question: "Is John happy?" }), AceError);
  } finally {
    await noRace.dispose();
  }
});

test("when the narrowed text gives unknown, ask retries with every sentence before answering", async () => {
  // A deliberately bad narrowing that drops the sentence the proof needs.
  const r = await ace.ask({ text: AXIOMS, question: "Is John happy?", select: () => [0] });
  if (r.status !== "answered") assert.fail(`expected answered after the retry, got ${r.status}`);
  assert.deepEqual(r.proofs[0]!.axioms.map((a) => a.sentence), [1, 3, 4]);
});

test("a question that stays unknown after the retry is reported as unknown", async () => {
  const r = await ace.ask({ text: AXIOMS, question: "Is Mary happy?", select: () => [0] });
  assert.equal(r.status, "unknown");
});
