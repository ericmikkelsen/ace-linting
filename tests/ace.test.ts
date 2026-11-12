import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createAce, AceError, debounce, type Ace } from "../src/index.ts";

// Development source for APE's files: the vendor/ submodule.
let ace: Ace;
before(async () => { ace = await createAce({ apeDir: "vendor/APE/prolog" }); });
after(async () => { await ace.dispose(); });

test("lint runs in a worker and returns diagnostics", async () => {
  const text = "Every customer inserts.";
  const { diagnostics } = await ace.lint(text);
  assert.equal(diagnostics.length, 1);
  assert.equal(text.slice(diagnostics[0]!.range.start, diagnostics[0]!.range.end), ".");
});

test("valid text gives an empty list", async () => {
  assert.deepEqual((await ace.lint("Every customer inserts a card.")).diagnostics, []);
});

test("concurrent calls each get their own answer", async () => {
  const [a, b] = await Promise.all([ace.lint("Every customer inserts a card."), ace.lint("Every customer inserts.")]);
  assert.equal(a.diagnostics.length, 0);
  assert.equal(b.diagnostics.length, 1);
});

test("an already-aborted call rejects with AbortError", async () => {
  const c = new AbortController();
  c.abort();
  await assert.rejects(ace.lint("A man waits.", { signal: c.signal }), { name: "AbortError" });
});

test("aborting a call in flight rejects it and leaves the instance usable", async () => {
  const c = new AbortController();
  const p = ace.lint("A man waits. A woman sleeps.", { signal: c.signal });
  c.abort();
  await assert.rejects(p, { name: "AbortError" });
  assert.deepEqual((await ace.lint("A man waits.")).diagnostics, []);
});

test("createAce without local files reports clearly when the upstream cannot be reached", async () => {
  await assert.rejects(
    createAce({ upstream: { cacheDir: "/nonexistent-ace-linting-cache-for-test", baseUrls: ["http://127.0.0.1:1/{path}"] } }),
    (e: unknown) => e instanceof AceError && /could not get APE and RACE/.test(e.message),
  );
});

test("after dispose, calls reject", async () => {
  const other = await createAce({ apeDir: "vendor/APE/prolog" });
  await other.dispose();
  await assert.rejects(other.lint("A man waits."), AceError);
});

test("debounce runs once after quiet and resolves every caller with the last result", async () => {
  let calls = 0;
  const d = debounce(async (s: string) => { calls++; return s; }, 20);
  const results = await Promise.all([d("a"), d("b"), d("c")]);
  assert.equal(calls, 1);
  assert.deepEqual(results, ["c", "c", "c"]);
});
