import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createAce, type Ace } from "../src/index.ts";

// Pins what APE (with its small built-in lexicon) does with numerals and names, as checked on 2026-11-11.
// If an APE upgrade changes any of this, these tests say so.
let ace: Ace;
before(async () => { ace = await createAce({ apeDir: "vendor/APE/prolog" }); });
after(async () => { await ace.dispose(); });

const ok = async (text: string) => assert.deepEqual((await ace.lint(text)).diagnostics, [], text);

test("integers, number words and quantity phrases need no lexicon entries", async () => {
  for (const t of [
    "John inserts 3 cards.",
    "John inserts two cards.",
    "John inserts at least 3 cards.",
    "John inserts at most two cards.",
    "John inserts exactly 3 cards.",
    "Three customers insert a card.",
  ]) await ok(t);
});

test("decimal numbers are not accepted", async () => {
  const { diagnostics } = await ace.lint("John inserts 3.5 cards.");
  assert.ok(diagnostics.some((d) => d.severity === "error"));
});

test("an unknown capitalized word is accepted as a proper name, with a warning only", async () => {
  const { diagnostics } = await ace.lint("Zorblax inserts a card.");
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0]!.severity, "warning");
  assert.match(diagnostics[0]!.suggestion ?? "", /proper name/);
});

test("an unknown lowercase word is an error that points to the n:/v:/a:/p: prefixes", async () => {
  const { diagnostics } = await ace.lint("A zorblax inserts a card.");
  const word = diagnostics.find((d) => d.code === "ape/word");
  assert.equal(word?.severity, "error");
  assert.match(word?.suggestion ?? "", /prefix n:, v:, a: or p:/);
});

test("a word declared inline with a prefix parses", async () => {
  await ok("A n:zorblax inserts a card.");
});
