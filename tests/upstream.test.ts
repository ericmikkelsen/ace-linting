import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { execFileSync } from "node:child_process";
import { loadUpstream, memoryStore, sha256Hex, UpstreamError, type UpstreamManifest } from "../src/upstream.ts";
import { UPSTREAM } from "../src/upstream-manifest.ts";
import { fileStore } from "../src/node.ts";
import { createAce } from "../src/index.ts";

const enc = (s: string) => new TextEncoder().encode(s);

async function manifestFor(files: Record<string, string>): Promise<UpstreamManifest> {
  const list = await Promise.all(Object.entries(files).map(async ([p, c]) => ({ path: p, sha256: await sha256Hex(enc(c)) })));
  return { ape: { repo: "Attempto/APE", commit: "aaaa", root: "prolog", files: list }, race: { repo: "Attempto/RACE", commit: "bbbb", root: "prolog", files: [] } };
}

test("files are fetched, checked against their hashes, and returned by relative path", async () => {
  const m = await manifestFor({ "a.pl": "alpha", "sub/b.pl": "beta" });
  const urls: string[] = [];
  const out = await loadUpstream(m, {
    baseUrls: ["https://example.test/{repo}/{commit}/{root}/{path}"],
    fetch: async (url) => { urls.push(url); return enc(url.endsWith("a.pl") ? "alpha" : "beta"); },
  });
  assert.deepEqual([...out.ape.keys()].sort(), ["a.pl", "sub/b.pl"]);
  assert.equal(new TextDecoder().decode(out.ape.get("sub/b.pl")), "beta");
  assert.ok(urls.includes("https://example.test/Attempto/APE/aaaa/prolog/sub/b.pl"));
});

test("a file whose bytes do not match the recorded hash is rejected, named, and never stored", async () => {
  const m = await manifestFor({ "a.pl": "alpha" });
  const store = memoryStore();
  await assert.rejects(
    loadUpstream(m, { baseUrls: ["https://x/{path}"], fetch: async () => enc("tampered"), store }),
    (e: unknown) => e instanceof UpstreamError && /a\.pl/.test(e.message) && /hash/.test(e.message),
  );
  assert.equal(await store.get("Attempto/APE@aaaa/prolog/a.pl"), undefined);
});

test("verified files are cached: a second load fetches nothing", async () => {
  const m = await manifestFor({ "a.pl": "alpha" });
  const store = memoryStore();
  let calls = 0;
  const fetch = async () => { calls++; return enc("alpha"); };
  await loadUpstream(m, { baseUrls: ["https://x/{path}"], fetch, store });
  await loadUpstream(m, { baseUrls: ["https://x/{path}"], fetch, store });
  assert.equal(calls, 1);
});

test("a corrupted cache entry is ignored and fetched again", async () => {
  const m = await manifestFor({ "a.pl": "alpha" });
  const store = memoryStore();
  await store.put("Attempto/APE@aaaa/prolog/a.pl", enc("corrupt"));
  let calls = 0;
  const out = await loadUpstream(m, { baseUrls: ["https://x/{path}"], fetch: async () => { calls++; return enc("alpha"); }, store });
  assert.equal(calls, 1);
  assert.equal(new TextDecoder().decode(out.ape.get("a.pl")), "alpha");
});

test("when the first source fails the next one is used", async () => {
  const m = await manifestFor({ "a.pl": "alpha" });
  const tried: string[] = [];
  const out = await loadUpstream(m, {
    baseUrls: ["https://one.test/{path}", "https://two.test/{path}"],
    fetch: async (url) => { tried.push(url); if (url.startsWith("https://one")) throw new Error("down"); return enc("alpha"); },
  });
  assert.deepEqual(tried, ["https://one.test/a.pl", "https://two.test/a.pl"]);
  assert.ok(out.ape.has("a.pl"));
});

test("when every source fails the error names the file", async () => {
  const m = await manifestFor({ "a.pl": "alpha" });
  await assert.rejects(loadUpstream(m, { baseUrls: ["https://x/{path}"], fetch: async () => { throw new Error("offline"); } }), /a\.pl/);
});

test("the pinned manifest matches the development checkouts in vendor/", async () => {
  for (const [key, dir] of [["ape", "vendor/APE"], ["race", "vendor/RACE"]] as const) {
    const pin = UPSTREAM[key];
    const head = execFileSync("git", ["-C", dir, "rev-parse", "HEAD"]).toString().trim();
    assert.equal(pin.commit, head, `${key}: manifest commit differs from ${dir} HEAD (run npm run pin:upstream)`);
    assert.ok(pin.files.length >= 9, `${key}: manifest has its files`);
    for (const f of pin.files) {
      const bytes = new Uint8Array(fs.readFileSync(path.join(dir, pin.root, f.path)));
      assert.equal(await sha256Hex(bytes), f.sha256, `${key}: ${f.path} differs from the manifest (run npm run pin:upstream)`);
    }
  }
});

test("createAce with no local files fetches, verifies and caches the pinned upstream, then lints", async () => {
  // A local server stands in for GitHub: /{repo}/{commit}/{root}/{path} maps to the vendor checkouts.
  const server = http.createServer((req, res) => {
    const [, owner, repo, , root, ...rest] = decodeURIComponent(req.url ?? "").split("/");
    const file = path.join("vendor", repo === "APE" ? "APE" : "RACE", root!, ...rest);
    if (!owner || !fs.existsSync(file)) { res.statusCode = 404; return res.end(); }
    res.end(fs.readFileSync(file));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "ace-linting-test-"));
  try {
    const ace = await createAce({ upstream: { cacheDir, baseUrls: [`http://127.0.0.1:${port}/{repo}/{commit}/{root}/{path}`] } });
    try {
      assert.deepEqual((await ace.lint("Every customer inserts a card.")).diagnostics, []);
      assert.equal((await ace.ask({ text: "John is a customer. John inserts a card. Every customer who inserts a card is happy.", question: "Is John happy?" })).status, "answered");
    } finally {
      await ace.dispose();
    }
    assert.ok(fs.readdirSync(cacheDir).length > 0, "files were cached");
    // second start works with the server gone
    await new Promise((r) => server.close(r));
    const again = await createAce({ upstream: { cacheDir, baseUrls: ["http://127.0.0.1:1/{path}"] } });
    await again.dispose();
  } finally {
    server.close();
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }
});

test("a file store round-trips bytes", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ace-linting-store-"));
  try {
    const store = fileStore(dir);
    assert.equal(await store.get("x/y.pl"), undefined);
    await store.put("x/y.pl", enc("hello"));
    assert.equal(new TextDecoder().decode(await store.get("x/y.pl")), "hello");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
