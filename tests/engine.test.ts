// SPDX-License-Identifier: GPL-3.0-only
import { test, before } from "node:test";
import assert from "node:assert/strict";
import SWIPL from "swipl-wasm";
import { createEngine, type Engine, type SwiplFactory } from "../src/engine.ts";
import { readTree } from "../src/node.ts";
import { GLUE } from "../src/glue.ts";

// Development source: the vendor/ submodule. In production the files come from the fetch-and-verify step.
let engine: Engine;
before(async () => {
  engine = await createEngine(
    { ape: readTree("vendor/APE/prolog"), glue: GLUE },
    (() => SWIPL({ arguments: ["-q"], print: () => {}, printErr: () => {} })) as unknown as SwiplFactory,
  );
});

const slice = (text: string, d: { range: { start: number; end: number } }) => text.slice(d.range.start, d.range.end);

test("valid ACE has no diagnostics", () => {
  assert.deepEqual(engine.lint("Every customer inserts a card."), []);
});

test("a missing object is flagged at the end of the sentence, with exact ranges", () => {
  const text = "Every customer inserts.";
  const ds = engine.lint(text);
  assert.equal(ds.length, 1);
  assert.equal(ds[0]!.code, "ape/sentence");
  assert.equal(slice(text, ds[0]!), ".");
  assert.equal(ds[0]!.approximate, undefined);
});

test("unknown words are underlined where they appear (small built-in lexicon)", () => {
  const text = "The coffee executes the command.";
  const words = engine.lint(text).filter((d) => d.code === "ape/word").map((d) => slice(text, d));
  assert.deepEqual(words.sort(), ["coffee", "command", "executes"]);
});

test("an error in the second sentence is mapped into the whole text", () => {
  const text = "A customer inserts a card. Every customer inserts.";
  const ds = engine.lint(text);
  assert.equal(ds[0]!.sentence, 2);
  assert.equal(slice(text, ds[0]!), ".");
  assert.equal(ds[0]!.range.start, text.length - 1);
});

test("text without a final period is reported", () => {
  const ds = engine.lint("A customer inserts a card");
  assert.ok(ds.length >= 1);
  assert.equal(ds[0]!.severity, "error");
});

test("a second identical call returns the cached result", () => {
  const a = engine.lint("Every customer inserts.");
  assert.equal(engine.lint("Every customer inserts."), a);
});

test("parse: an obligation carries its modality and a prepositional modifier with a quoted string", () => {
  const text = 'I must v:finish a n:logo for Miquel before "2026-11-13".';
  const [event] = engine.parse(text).parsed.events;
  assert.equal(event!.verb, "finish");
  assert.deepEqual(event!.modality, ["must"]);
  assert.deepEqual(event!.modifiers, [{ preposition: "before", value: { kind: "string", value: "2026-11-13" } }]);
  assert.equal(slice(text, event!.subject as { range: { start: number; end: number } }), "I");
  assert.deepEqual(event!.indirect, { kind: "name", name: "Miquel" });
  assert.match(event!.id, /^r\d+$/);
});

test("parse: a plain fact has no modality and no modifiers", () => {
  const [event] = engine.parse("John inserts a card.").parsed.events;
  assert.equal(event!.modality, undefined);
  assert.equal(event!.modifiers, undefined);
});

test("parse: a modal box and each side of a conditional are named", () => {
  const can = engine.parse("John can insert a card.").parsed.events[0]!;
  assert.deepEqual(can.modality, ["can"]);
  const rule = engine.parse("If John inserts a card then Mary waits.").parsed.events;
  assert.deepEqual(rule.map((e) => [e.verb, e.modality]), [["insert", ["if"]], ["wait", ["then"]]]);
});

test("parse: an adverb is a modifier of its event", () => {
  const [event] = engine.parse("John quickly inserts a card.").parsed.events;
  assert.deepEqual(event!.modifiers, [{ adverb: "quickly" }]);
});
