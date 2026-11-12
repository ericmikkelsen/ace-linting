import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createAce, parseEntries, toApeLines, templatesFor, LexiconError, type Ace, type LexEntry } from "../src/index.ts";
import { addS, regularPp } from "../src/inflect.ts";

const core: LexEntry[] = parseEntries(fs.readFileSync("lexicon/core/core.jsonl", "utf8"));

test("inflection rules", () => {
  assert.equal(addS("task"), "tasks");
  assert.equal(addS("box"), "boxes");
  assert.equal(addS("city"), "cities");
  assert.equal(addS("day"), "days");
  assert.equal(regularPp("call"), "called");
  assert.equal(regularPp("update"), "updated");
  assert.equal(regularPp("plan"), undefined, "doubling is not guessed");
  assert.equal(regularPp("carry"), "carried");
});

test("entries convert to APE terms", () => {
  assert.deepEqual(toApeLines({ class: "noun", lemma: "task" }), ["noun_sg(task, task, neutr).", "noun_pl(tasks, task, neutr)."]);
  assert.deepEqual(toApeLines({ class: "noun", lemma: "person", plural: "people", gender: "human" }), ["noun_sg(person, person, human).", "noun_pl(people, person, human)."]);
  assert.deepEqual(toApeLines({ class: "verb", lemma: "call", valency: "transitive" }), ["tv_finsg(calls, call).", "tv_infpl(call, call).", "tv_pp(called, call)."]);
  assert.deepEqual(toApeLines({ class: "adjective", lemma: "to-do" }), ["adj_itr('to-do', 'to-do')."]);
});

test("a verb whose past participle might double needs it spelled out", () => {
  assert.throws(() => toApeLines({ class: "verb", lemma: "stop", valency: "intransitive" }), LexiconError);
  assert.doesNotThrow(() => toApeLines({ class: "verb", lemma: "stop", valency: "intransitive", pp: "stopped" }));
});

test("bad entries are rejected with the line number", () => {
  assert.throws(() => parseEntries('{"class":"noun","lemma":"Task"}'), /line 1/);
  assert.throws(() => parseEntries('{"class":"verb","lemma":"go"}'), /valency/);
  assert.throws(() => parseEntries("not json"), /not valid JSON/);
});

test("every core entry has a source tag and no duplicate (class, lemma) pair", () => {
  const seen = new Set<string>();
  for (const e of core) {
    assert.equal(e.source, "core", `${e.lemma} needs source "core"`);
    const key = `${e.class === "noun-mass" ? "noun" : e.class === "verb" ? `verb-${e.valency}` : e.class}:${e.lemma}`;
    assert.ok(!seen.has(key), `duplicate ${key}`);
    seen.add(key);
  }
});

let ace: Ace;
before(async () => { ace = await createAce({ apeDir: "vendor/APE/prolog" }); });
after(async () => { await ace.dispose(); });

test("the core lexicon loads with no APE messages and each entry parses in its template sentences", async () => {
  const added = await ace.addEntries(core);
  assert.equal(added.count, core.flatMap(toApeLines).length);
  assert.deepEqual(added.messages.filter((m) => m.severity === "error"), []);
  const failures: string[] = [];
  for (const e of core) {
    for (const group of templatesFor(e)) {
      let ok = false;
      for (const sentence of group) {
        const { diagnostics } = await ace.lint(sentence);
        if (!diagnostics.some((d) => d.severity === "error")) { ok = true; break; }
      }
      if (!ok) failures.push(`${e.class} ${e.lemma}: ${group.join(" | ")}`);
    }
  }
  assert.deepEqual(failures, []);
});

test("a function word cannot be redefined: APE warns", async () => {
  const r = await ace.addEntries([{ class: "noun", lemma: "every" }]);
  assert.ok(r.messages.length > 0);
});

test("lexicon warnings do not leak into later lint results", async () => {
  const other = await createAce({ apeDir: "vendor/APE/prolog" });
  try {
    const r = await other.addEntries([{ class: "noun", lemma: "every" }]);
    assert.ok(r.messages.length > 0);
    assert.deepEqual((await other.lint("A customer inserts a card.")).diagnostics, []);
  } finally {
    await other.dispose();
  }
});
