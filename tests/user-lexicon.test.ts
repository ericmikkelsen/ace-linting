// SPDX-License-Identifier: GPL-3.0-only
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createAce, type Ace } from "../src/index.ts";

let ace: Ace;
before(async () => { ace = await createAce({ apeDir: "vendor/APE/prolog" }); });
after(async () => { await ace.dispose(); });

const errors = async (text: string) => (await ace.lint(text)).diagnostics.filter((d) => d.severity === "error");
const valid = async (text: string) => assert.deepEqual(await errors(text), [], text);
const invalid = async (text: string) => assert.ok((await errors(text)).length > 0, `${text} should not be valid`);

test("adding a noun makes sentences with it valid, and it is listed", async () => {
  await invalid("A customer inserts a gadget.");
  const r = await ace.lexicon.add({ class: "noun", lemma: "gadget" });
  assert.deepEqual(r.added.map((e) => e.lemma), ["gadget"]);
  assert.deepEqual(r.rejected, []);
  await valid("A customer inserts a gadget.");
  await valid("A customer inserts two gadgets.");
  assert.deepEqual(ace.lexicon.list().map((e) => e.lemma), ["gadget"]);
});

test("adding the same entry again changes nothing and raises no warning", async () => {
  const r = await ace.lexicon.add({ class: "noun", lemma: "gadget" });
  assert.deepEqual(r.added, []);
  assert.deepEqual(r.unchanged.map((e) => e.lemma), ["gadget"]);
  assert.deepEqual(r.warnings, []);
  assert.equal(ace.lexicon.list().length, 1);
});

test("an entry for the same word with different forms replaces the old one", async () => {
  await ace.lexicon.add({ class: "noun", lemma: "widget", plural: "widgetz" });
  await valid("A customer inserts two widgetz.");
  const r = await ace.lexicon.add({ class: "noun", lemma: "widget" });
  assert.deepEqual(r.replaced.map((e) => e.lemma), ["widget"]);
  await valid("A customer inserts two widgets.");
  await invalid("A customer inserts two widgetz.");
  assert.equal(ace.lexicon.list().filter((e) => e.lemma === "widget").length, 1);
});

test("removing a word makes it unknown again, and removing something absent is harmless", async () => {
  const r = await ace.lexicon.remove({ class: "noun", lemma: "gadget" });
  assert.deepEqual(r.removed.map((e) => e.lemma), ["gadget"]);
  await invalid("A customer inserts a gadget.");
  assert.deepEqual(ace.lexicon.list().map((e) => e.lemma), ["widget"]);
  assert.deepEqual((await ace.lexicon.remove({ class: "noun", lemma: "nothere" })).removed, []);
});

test("removing a verb without a valency removes every valency of it", async () => {
  await ace.lexicon.add([
    { class: "verb", lemma: "frob", valency: "transitive", pp: "frobbed", source: "test" },
    { class: "verb", lemma: "frob", valency: "intransitive", pp: "frobbed", source: "test" },
  ]);
  await valid("A customer frobs a card.");
  await valid("A customer frobs.");
  const r = await ace.lexicon.remove({ class: "verb", lemma: "frob" });
  assert.equal(r.removed.length, 2);
  await invalid("A customer frobs.");
});

test("a function word cannot be redefined: the entry is rejected with the reason and nothing is kept", async () => {
  const r = await ace.lexicon.add({ class: "noun", lemma: "every" });
  assert.deepEqual(r.added, []);
  assert.equal(r.rejected.length, 1);
  assert.match(r.rejected[0]!.reason, /function word/);
  assert.ok(!ace.lexicon.list().some((e) => e.lemma === "every"));
  await valid("Every customer inserts a card.");
});

test("a word that would be both an adverb and a noun is rejected, and the existing entry stays valid", async () => {
  await ace.lexicon.add({ class: "noun", lemma: "thingy" });
  const r = await ace.lexicon.add({ class: "adverb", lemma: "thingy" });
  assert.deepEqual(r.added, []);
  assert.match(r.rejected[0]!.reason, /adverb and singular noun/);
  await valid("A customer inserts a thingy.");
  assert.ok(!ace.lexicon.list().some((e) => e.class === "adverb"));
});

test("a rejected replacement leaves the old entry in place", async () => {
  await ace.lexicon.add({ class: "noun", lemma: "doohickey", plural: "doohickeys" });
  // a plural that is a function word cannot be accepted
  const r = await ace.lexicon.add({ class: "noun", lemma: "doohickey", plural: "every" });
  assert.equal(r.rejected.length, 1);
  await valid("A customer inserts two doohickeys.");
  assert.equal((ace.lexicon.list().find((e) => e.lemma === "doohickey" && e.class === "noun") as { plural?: string } | undefined)?.plural, "doohickeys");
});

test("a malformed entry is rejected without touching the lexicon", async () => {
  const before = ace.lexicon.list().length;
  await assert.rejects(ace.lexicon.add({ class: "noun", lemma: "Not Valid" } as never), /lemma/);
  assert.equal(ace.lexicon.list().length, before);
});

test("an entry for a word APE already knows adds forms next to the built-in ones", async () => {
  await ace.lexicon.add({ class: "noun", lemma: "card", plural: "cardz" });
  await valid("A customer inserts two cardz.");
  await valid("A customer inserts two cards.");
  await ace.lexicon.remove({ class: "noun", lemma: "card" });
  await invalid("A customer inserts two cardz.");
  await valid("A customer inserts two cards.");
});

test("entries given at start can be listed and removed like any other", async () => {
  const other = await createAce({ apeDir: "vendor/APE/prolog", lexicon: [{ class: "noun", lemma: "bauble", source: "test" }] });
  try {
    assert.deepEqual(other.lexicon.list().map((e) => e.lemma), ["bauble"]);
    await other.lexicon.remove({ class: "noun", lemma: "bauble" });
    assert.ok((await other.lint("A customer inserts a bauble.")).diagnostics.some((d) => d.severity === "error"));
  } finally { await other.dispose(); }
});

test("user entries survive a timeout restart and removed ones stay removed", async () => {
  const withRace = await createAce({ apeDir: "vendor/APE/prolog", raceDir: "vendor/RACE/prolog" });
  try {
    await withRace.lexicon.add([{ class: "noun", lemma: "keeper" }, { class: "noun", lemma: "dropped" }]);
    await withRace.lexicon.remove({ class: "noun", lemma: "dropped" });
    const r = await withRace.ask({ text: "A machine waits.", question: "Does a machine wait?", timeoutMs: 1 });
    assert.equal(r.status, "timeout");
    assert.deepEqual((await withRace.lint("A customer inserts a keeper.")).diagnostics.filter((d) => d.severity === "error"), []);
    assert.ok((await withRace.lint("A customer inserts a dropped.")).diagnostics.some((d) => d.severity === "error"));
  } finally { await withRace.dispose(); }
});
