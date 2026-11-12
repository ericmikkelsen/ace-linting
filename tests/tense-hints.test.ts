// SPDX-License-Identifier: GPL-3.0-only
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createAce, parseEntries, type Ace, type Diagnostic } from "../src/index.ts";
import { describeTense } from "../src/tense.ts";

// --- the pure classifier

test("tense helper words are recognised", () => {
  assert.equal(describeTense("will")?.kind, "future");
  assert.equal(describeTense("shall")?.kind, "future");
  assert.equal(describeTense("did")?.kind, "past");
  assert.equal(describeTense("was")?.kind, "past");
  assert.equal(describeTense("were")?.kind, "past");
  assert.equal(describeTense("had")?.kind, "past");
});

test("a participle after has/have/had is a perfect tense; -ing after is/are/was/were is progressive", () => {
  assert.equal(describeTense("bought", "has")?.kind, "perfect");
  assert.equal(describeTense("called", "have")?.kind, "perfect");
  assert.equal(describeTense("buying", "is")?.kind, "progressive");
  assert.equal(describeTense("waiting", "are")?.kind, "progressive");
});

test("a word that looks like a past form is flagged; ordinary words are not", () => {
  assert.equal(describeTense("bought")?.kind, "past");
  assert.equal(describeTense("called")?.kind, "past");
  assert.equal(describeTense("wrote")?.kind, "past");
  assert.equal(describeTense("customer"), undefined);
  assert.equal(describeTense("card"), undefined);
  assert.equal(describeTense("buys"), undefined);
  assert.equal(describeTense("has"), undefined, "has alone is the verb 'to have'");
  assert.equal(describeTense("is"), undefined);
});

test("a word merely ending in -ing or -ed after an ordinary word is not a tense", () => {
  assert.equal(describeTense("building", "a"), undefined, "a noun after an article");
  assert.equal(describeTense("bed"), undefined);
  assert.equal(describeTense("red"), undefined);
});

// --- through the linter

const LEXICON = parseEntries(fs.readFileSync("lexicon/core/core.jsonl", "utf8"));
let ace: Ace;
before(async () => { ace = await createAce({ apeDir: "vendor/APE/prolog", lexicon: LEXICON }); });
after(async () => { await ace.dispose(); });

const errors = async (text: string): Promise<Diagnostic[]> => (await ace.lint(text)).diagnostics.filter((d) => d.severity === "error");
const slice = (t: string, d: Diagnostic) => t.slice(d.range.start, d.range.end);

for (const [text, word, kind] of [
  ["John bought a card.", "bought", /past tense/],
  ["John will buy a card.", "will", /future/],
  ["John has bought a card.", "bought", /perfect/],
  ["John is buying a card.", "buying", /progressive/],
  ["A card was bought by John.", "was", /past tense/],
] as const) {
  test(`'${text}' is explained as a tense, pointing at '${word}'`, async () => {
    const ds = await errors(text);
    const hint = ds.find((d) => kind.test(d.message));
    assert.ok(hint, `no tense message in: ${JSON.stringify(ds.map((d) => d.message))}`);
    assert.equal(slice(text, hint), word);
    assert.match(hint.message, /only the present tense/);
    assert.match(hint.suggestion ?? "", /on Monday/);
    assert.match(hint.suggestion ?? "", /passive/);
  });
}

test("APE's spelling hint for 'will' ('till') is replaced by the tense explanation", async () => {
  const ds = await errors("John will buy a card.");
  assert.ok(!ds.some((d) => /till/.test(d.suggestion ?? "")));
});

test("valid present-tense sentences get no tense message", async () => {
  for (const t of ["John buys a card.", "A card is bought by John.", "John has a card.", "John buys a card on Monday."]) {
    assert.deepEqual(await errors(t), [], t);
  }
});

test("a sentence that is wrong for another reason keeps its ordinary message", async () => {
  const ds = await errors("Every customer inserts.");
  assert.ok(ds.length > 0);
  assert.ok(!ds.some((d) => /tense/.test(d.message)));
});
