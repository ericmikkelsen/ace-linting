// SPDX-License-Identifier: GPL-3.0-only
import { test } from "node:test";
import assert from "node:assert/strict";
import { toDiagnostics } from "../src/diagnostics.ts";
import type { ApeMessage } from "../src/types.ts";

// Messages below are real APE output captured in scripts/spike.mjs and scripts/spike-clex.mjs.

test("a sentence-scope error points at the failing token, even one past the end", () => {
  const text = "Every customer inserts.";
  const msg: ApeMessage = { importance: "error", scope: "sentence", sentence: 1, token: 5, subject: "Every customer inserts. <>", description: "This is the first sentence that was not ACE." };
  const [d] = toDiagnostics(text, [msg]);
  assert.equal(d!.severity, "error");
  assert.equal(d!.code, "ape/sentence");
  assert.equal(text.slice(d!.range.start, d!.range.end), ".");
  assert.equal(d!.approximate, undefined);
});

test("a sentence-scope error in the middle points at that token", () => {
  const text = "The coffee executes the command.";
  const msg: ApeMessage = { importance: "error", scope: "sentence", sentence: 1, token: 2, subject: "The <> coffee executes the command.", description: "" };
  const [d] = toDiagnostics(text, [msg]);
  assert.equal(text.slice(d!.range.start, d!.range.end), "coffee");
});

test("a word-scope error has no token number: every occurrence of the word is underlined", () => {
  const text = "A cat sees a cat.";
  const msg: ApeMessage = { importance: "error", scope: "word", sentence: 1, token: null, subject: "cat", description: "Use the prefix n:, v:, a: or p:." };
  const ds = toDiagnostics(text, [msg]);
  assert.equal(ds.length, 2);
  assert.deepEqual(ds.map((d) => text.slice(d.range.start, d.range.end)), ["cat", "cat"]);
  assert.equal(ds[0]!.suggestion, "Use the prefix n:, v:, a: or p:.");
});

test("an anaphor warning keeps its explanation as the message and the fix as the suggestion", () => {
  const text = "The coffee executes the command.";
  const msg: ApeMessage = { importance: "warning", scope: "anaphor", sentence: 1, token: 5, subject: "The definite noun phrase 'the command' does not have an antecedent.", description: "Introduce an appropriate antecedent." };
  const [d] = toDiagnostics(text, [msg]);
  assert.equal(d!.severity, "warning");
  assert.equal(text.slice(d!.range.start, d!.range.end), "command");
  assert.match(d!.message, /does not have an antecedent/);
  assert.equal(d!.suggestion, "Introduce an appropriate antecedent.");
});

test("ranges are offsets into the whole text for a later sentence, with non-ASCII before it", () => {
  const text = "Zoë owns a café. Every customer inserts.";
  const msg: ApeMessage = { importance: "error", scope: "sentence", sentence: 2, token: 5, subject: "", description: "" };
  const [d] = toDiagnostics(text, [msg]);
  assert.equal(d!.sentence, 2);
  assert.equal(text.slice(d!.range.start, d!.range.end), ".");
  assert.equal(d!.range.start, text.length - 1);
});

test("when APE's tokens disagree with ours, the whole sentence is underlined and marked approximate", () => {
  const text = "Every customer inserts.";
  const msg: ApeMessage = { importance: "error", scope: "sentence", sentence: 1, token: 2, subject: "", description: "" };
  const [d] = toDiagnostics(text, [msg], { apeTokens: [["Every", "customer", "inserts", ".", "extra"]] });
  assert.equal(text.slice(d!.range.start, d!.range.end), text);
  assert.equal(d!.approximate, true);
});

test("when APE's tokens agree with ours, the exact token is used", () => {
  const text = "Every customer inserts.";
  const msg: ApeMessage = { importance: "error", scope: "sentence", sentence: 1, token: 2, subject: "", description: "" };
  const [d] = toDiagnostics(text, [msg], { apeTokens: [["Every", "customer", "inserts", "."]] });
  assert.equal(text.slice(d!.range.start, d!.range.end), "customer");
  assert.equal(d!.approximate, undefined);
});

test("a message with no sentence number covers the whole text", () => {
  const text = "A man waits";
  const msg: ApeMessage = { importance: "error", scope: "sentence", sentence: null, token: null, subject: "Every ACE text must end with . or ? or !.", description: "" };
  const [d] = toDiagnostics(text, [msg]);
  assert.deepEqual(d!.range, { start: 0, end: text.length });
  assert.equal(d!.approximate, true);
  assert.equal(d!.sentence, 0);
});

test("APE's 'interpreted as a proper name' warning says so, instead of calling the word unknown", () => {
  const text = "Zorblax inserts a card.";
  const msg: ApeMessage = { importance: "warning", scope: "word", sentence: 1, token: null, subject: "Zorblax", description: "Undefined word. Interpreted as a singular proper name." };
  const [d] = toDiagnostics(text, [msg]);
  assert.equal(d!.severity, "warning");
  assert.equal(d!.code, "ape/word");
  assert.equal(text.slice(d!.range.start, d!.range.end), "Zorblax");
  assert.match(d!.message, /treated as a proper name/);
  assert.doesNotMatch(d!.message, /Unknown or unsupported/);
  assert.match(d!.suggestion ?? "", /common word/);
});

test("an unknown lowercase word keeps the 'unknown word' wording and APE's prefix hint", () => {
  const text = "A zorblax waits.";
  const msg: ApeMessage = { importance: "error", scope: "word", sentence: 1, token: null, subject: "zorblax", description: "Use the prefix n:, v:, a: or p:." };
  const [d] = toDiagnostics(text, [msg]);
  assert.match(d!.message, /Unknown or unsupported word 'zorblax'/);
  assert.equal(d!.suggestion, "Use the prefix n:, v:, a: or p:.");
});
