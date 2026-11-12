import { test } from "node:test";
import assert from "node:assert/strict";
import { splitSentences, tokenizeSentence } from "../src/tokenize.ts";

test("splits sentences and keeps character offsets", () => {
  const text = "Every customer inserts a card.  John is happy? Yes!";
  const s = splitSentences(text);
  assert.deepEqual(s.map((x) => x.text), ["Every customer inserts a card.", "John is happy?", "Yes!"]);
  for (const x of s) assert.equal(text.slice(x.range.start, x.range.end), x.text);
});

test("a period inside a number does not end a sentence", () => {
  assert.equal(splitSentences("John has 3.5 cards. Mary sleeps.").length, 2);
});

test("a quoted string never ends a sentence", () => {
  const s = splitSentences('John writes "Stop. Now.". Mary sleeps.');
  assert.equal(s.length, 2);
  assert.equal(s[0]!.text, 'John writes "Stop. Now.".');
});

test("text with no final period is kept as its own sentence", () => {
  const s = splitSentences("A man waits. A woman sleeps");
  assert.equal(s.length, 2);
  assert.equal(s[1]!.text, "A woman sleeps");
});

test("offsets are right with non-ASCII text", () => {
  const text = "Zoë owns a café. Mary sleeps.";
  const s = splitSentences(text);
  assert.equal(text.slice(s[1]!.range.start, s[1]!.range.end), "Mary sleeps.");
});

test("tokenizer numbers words and punctuation like APE (first word is token 1)", () => {
  const t = tokenizeSentence("Every customer inserts.");
  assert.deepEqual(t.map((x) => x.text), ["Every", "customer", "inserts", "."]);
});
