// SPDX-License-Identifier: GPL-3.0-only
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createAce, AceError, typeCheck, type Ace, type Plugin, type TypeSchema, type ParsedText } from "../src/index.ts";

const slice = (text: string, r: { start: number; end: number }) => text.slice(r.start, r.end);

let ace: Ace;
before(async () => {
  ace = await createAce({
    apeDir: "vendor/APE/prolog",
    lexicon: [
      { class: "noun", lemma: "coffee", source: "test" },
      { class: "noun", lemma: "command", source: "test" },
      { class: "verb", lemma: "execute", valency: "transitive", source: "test" },
    ],
  });
});
after(async () => { await ace.dispose(); });

// --- parse facts

test("parse returns objects and events with character ranges and resolved arguments", async () => {
  const text = "A customer inserts a card.";
  const p = await ace.parse(text);
  assert.equal(p.events.length, 1);
  const e = p.events[0]!;
  assert.equal(e.verb, "insert");
  assert.equal(slice(text, e.range), "inserts");
  assert.ok(e.subject?.kind === "object" && e.subject.noun === "customer" && slice(text, e.subject.range) === "customer");
  assert.ok(e.object?.kind === "object" && e.object.noun === "card" && slice(text, e.object.range) === "card");
});

test("a proper name is a name argument, not an object", async () => {
  const p = await ace.parse("John inserts a card.");
  assert.deepEqual(p.events[0]!.subject, { kind: "name", name: "John" });
});

test("a pronoun refers to the same object as its antecedent, even across sentences", async () => {
  const p = await ace.parse("A customer inserts a card. He waits.");
  const [insert, wait] = p.events;
  assert.equal(wait!.verb, "wait");
  assert.ok(insert!.subject?.kind === "object" && wait!.subject?.kind === "object");
  assert.equal((wait!.subject as { id: string }).id, (insert!.subject as { id: string }).id);
  assert.equal(wait!.sentence, 2);
});

test("events inside a universal statement are found too", async () => {
  const p = await ace.parse("Every customer inserts a card.");
  assert.equal(p.events.length, 1);
  assert.equal(p.events[0]!.verb, "insert");
});

test("an adjective after 'is' shows up as a property argument", async () => {
  const p = await ace.parse("A customer is happy.");
  const e = p.events[0]!;
  assert.equal(e.verb, "be");
  assert.deepEqual(e.object && e.object.kind === "property" ? e.object.adjective : undefined, "happy");
});

test("text with errors still returns what could be parsed (nothing) without throwing", async () => {
  const p = await ace.parse("Every customer inserts.");
  assert.deepEqual(p.events, []);
});

// --- plugin API

test("a plugin's diagnostics are added to APE's, with its name as the code prefix", async () => {
  const unuse = ace.use({
    name: "demo",
    afterParse: (parsed: ParsedText) => parsed.events.map((e) => ({
      severity: "warning" as const, code: "saw-verb", message: `verb ${e.verb}`, range: e.range, sentence: e.sentence,
    })),
  });
  try {
    const { diagnostics } = await ace.lint("A customer inserts a card.");
    assert.deepEqual(diagnostics.map((d) => d.code), ["demo/saw-verb"]);
  } finally { unuse(); }
});

test("a plugin cannot remove or change what APE reported", async () => {
  const unuse = ace.use({ name: "quiet", afterParse: () => [] });
  try {
    const { diagnostics } = await ace.lint("Every customer inserts.");
    assert.ok(diagnostics.some((d) => d.code === "ape/sentence" && d.severity === "error"));
  } finally { unuse(); }
});

test("unsubscribing stops a plugin; using the same name twice is an error", async () => {
  const p: Plugin = { name: "once", afterParse: () => [{ severity: "warning", code: "x", message: "x", range: { start: 0, end: 1 }, sentence: 1 }] };
  const unuse = ace.use(p);
  assert.throws(() => ace.use({ name: "once" }), AceError);
  unuse();
  assert.deepEqual((await ace.lint("A customer waits.")).diagnostics, []);
  ace.use({ name: "once" })(); // the name is free again
});

test("a plugin that throws becomes a warning and does not break linting", async () => {
  const unuse = ace.use({ name: "broken", afterParse: () => { throw new Error("boom"); } });
  try {
    const { diagnostics } = await ace.lint("Every customer inserts.");
    assert.ok(diagnostics.some((d) => d.code === "ape/sentence"), "APE's diagnostics are still there");
    const w = diagnostics.find((d) => d.code === "ace-linting/plugin-error");
    assert.ok(w && w.severity === "warning" && /broken/.test(w.message) && /boom/.test(w.message));
  } finally { unuse(); }
});

test("async plugins are awaited", async () => {
  const unuse = ace.use({ name: "later", afterParse: async () => { await new Promise((r) => setTimeout(r, 5)); return [{ severity: "warning" as const, code: "late", message: "m", range: { start: 0, end: 1 }, sentence: 1 }]; } });
  try {
    assert.deepEqual((await ace.lint("A customer waits.")).diagnostics.map((d) => d.code), ["later/late"]);
  } finally { unuse(); }
});

test("a plugin diagnostic with a bad range is dropped and reported as a plugin error", async () => {
  const unuse = ace.use({ name: "sloppy", afterParse: () => [{ severity: "error" as const, code: "x", message: "m", range: { start: 5, end: 9999 }, sentence: 1 }] });
  try {
    const codes = (await ace.lint("A customer waits.")).diagnostics.map((d) => d.code);
    assert.deepEqual(codes, ["ace-linting/plugin-error"]);
  } finally { unuse(); }
});

// --- the semantic type check

const schema: TypeSchema = {
  types: { SystemAgent: ["Agent"] },
  nouns: { coffee: "Consumable", command: "Payload", user: "SystemAgent", customer: "Agent" },
  verbs: { execute: { subject: ["Agent"], object: ["Payload"] } },
};

test("typeCheck flags a noun whose type a verb does not accept as its subject", async () => {
  const unuse = ace.use(typeCheck(schema));
  try {
    const text = "A coffee executes a command.";
    const ds = (await ace.lint(text)).diagnostics.filter((d) => d.code.startsWith("types/"));
    assert.equal(ds.length, 1);
    assert.equal(ds[0]!.code, "types/subject");
    assert.equal(slice(text, ds[0]!.range), "coffee");
    assert.match(ds[0]!.message, /Consumable/);
    assert.match(ds[0]!.message, /Agent/);
  } finally { unuse(); }
});

test("typeCheck flags a bad object, and accepts good sentences, subtypes and unknown nouns", async () => {
  const unuse = ace.use(typeCheck(schema));
  try {
    const bad = "A customer executes a coffee.";
    const ds = (await ace.lint(bad)).diagnostics.filter((d) => d.code === "types/object");
    assert.equal(ds.length, 1);
    assert.equal(slice(bad, ds[0]!.range), "coffee");
    assert.deepEqual((await ace.lint("A customer executes a command.")).diagnostics, []);
    assert.deepEqual((await ace.lint("A user executes a command.")).diagnostics, [], "SystemAgent is an Agent");
    assert.deepEqual((await ace.lint("A card executes a command.")).diagnostics, [], "a noun with no declared type is not an error");
  } finally { unuse(); }
});

test("typeCheck follows a pronoun back to the noun it stands for", async () => {
  const unuse = ace.use(typeCheck(schema));
  try {
    const text = "A coffee waits. It executes a command.";
    const ds = (await ace.lint(text)).diagnostics.filter((d) => d.code === "types/subject");
    assert.equal(ds.length, 1);
    assert.equal(ds[0]!.sentence, 2, "reported where the verb is, since the noun is in sentence 1");
    assert.equal(slice(text, ds[0]!.range), "executes");
  } finally { unuse(); }
});

test("plugin findings do not stop a question from being asked", async () => {
  const withRace = await createAce({
    apeDir: "vendor/APE/prolog",
    raceDir: "vendor/RACE/prolog",
    lexicon: [
      { class: "noun", lemma: "coffee", source: "test" },
      { class: "noun", lemma: "command", source: "test" },
      { class: "verb", lemma: "execute", valency: "transitive", source: "test" },
    ],
  });
  try {
    withRace.use(typeCheck(schema));
    // "A coffee executes a command." is a type error for the plugin but valid ACE, so RACE may still reason over it
    const r = await withRace.ask({ text: "A coffee executes a command.", question: "Does a coffee execute a command?" });
    assert.equal(r.status, "answered");
  } finally {
    await withRace.dispose();
  }
});
