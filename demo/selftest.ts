// Runs the main behaviours inside a real browser (Web Worker, IndexedDB, fetch, crypto.subtle).
// The page title becomes "PASS n/n" or "FAIL ..." and window.__selftest holds the details.
import { createAce, typeCheck, parseEntries, type Ace } from "../src/index.ts";
import { UPSTREAM } from "../src/upstream-manifest.ts";
import coreLexicon from "../lexicon/core/core.jsonl?raw";

const out = document.getElementById("out") as HTMLElement;
const lines: string[] = [];
let passed = 0;
let failed = 0;
const log = (s: string) => { lines.push(s); out.textContent = lines.join("\n"); };

async function check(name: string, fn: () => Promise<void>) {
  try { await fn(); passed++; log(`PASS ${name}`); }
  catch (e) { failed++; log(`FAIL ${name}: ${e instanceof Error ? e.message : String(e)}`); }
}
function eq<T>(actual: T, expected: T, what = "value") {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
const slice = (t: string, r: { start: number; end: number }) => t.slice(r.start, r.end);

const LOCAL = `${location.origin}/upstream/{repo}/{commit}/{root}/{path}`;
const requests = (needle: string) => performance.getEntriesByType("resource").filter((e) => e.name.includes(needle)).length;

const AXIOMS = "John is a customer. Mary is a customer. John inserts a card. Every customer who inserts a card is happy.";

indexedDB.deleteDatabase("ace-linting"); // start from nothing so the first load really fetches
await new Promise((r) => setTimeout(r, 100));

let ace!: Ace;
await check("starts: fetches the pinned files, verifies their hashes, and creates the worker", async () => {
  const before = requests("/upstream/");
  ace = await createAce({ lexicon: parseEntries(coreLexicon), upstream: { baseUrls: [LOCAL] } });
  const fetched = requests("/upstream/") - before;
  const expected = UPSTREAM.ape.files.length + UPSTREAM.race.files.length;
  if (fetched !== expected) throw new Error(`fetched ${fetched} files, expected ${expected}`);
});

await check("lint: valid text has no diagnostics", async () => eq((await ace.lint("Every customer inserts a card.")).diagnostics, []));

await check("lint: a missing object is flagged at the final period", async () => {
  const text = "Every customer inserts.";
  const ds = (await ace.lint(text)).diagnostics;
  eq(ds.length, 1, "diagnostic count");
  eq(slice(text, ds[0]!.range), ".", "underlined text");
});

await check("lint: the core lexicon is loaded (a core word is not unknown)", async () => eq((await ace.lint("A client inserts a task.")).diagnostics, []));

await check("ask: a yes/no question is answered with its proof numbered by the user's sentences", async () => {
  const r = await ace.ask({ text: AXIOMS, question: "Is John happy?" });
  if (r.status !== "answered") throw new Error(`status ${r.status}`);
  eq(r.proofs[0]!.axioms.map((a) => a.sentence), [1, 3, 4], "sentences used");
});

await check("ask: a who question returns John", async () => {
  const r = await ace.ask({ text: AXIOMS, question: "Who is happy?" });
  if (r.status !== "answered") throw new Error(`status ${r.status}`);
  if (!r.answers.some((a) => a.value === "John")) throw new Error("John is not among the answers");
});

await check("ask: an unprovable question is unknown, never no", async () => eq((await ace.ask({ text: AXIOMS, question: "Is Mary happy?" })).status, "unknown"));

await check("ask: invalid ACE is reported with diagnostics", async () => eq((await ace.ask({ text: AXIOMS, question: "Is happy John?" })).status, "invalid"));

await check("ask: a timeout restarts the worker and keeps working (with the lexicon replayed)", async () => {
  eq((await ace.ask({ text: AXIOMS, question: "Is John happy?", timeoutMs: 1 })).status, "timeout");
  eq((await ace.lint("A client inserts a task.")).diagnostics, [], "core word after restart");
  eq((await ace.ask({ text: AXIOMS, question: "Is John happy?" })).status, "answered");
});

await check("synonyms: a rule makes 'purchase' answerable and shows up in the proof", async () => {
  await ace.addEntries([{ class: "verb", lemma: "purchase", valency: "transitive", source: "selftest" }, { class: "verb", lemma: "buy", valency: "transitive", pp: "bought", source: "selftest" }]);
  eq((await ace.ask({ text: "John buys a card.", question: "Does John purchase a card?" })).status, "unknown");
  await ace.synonyms.add({ class: "verb", valency: "transitive", from: "buy", to: "purchase" });
  const r = await ace.ask({ text: "John buys a card.", question: "Does John purchase a card?" });
  if (r.status !== "answered") throw new Error(`status ${r.status}`);
  if (!r.proofs[0]!.axioms.some((a) => a.synonym)) throw new Error("proof has no synonym line");
});

await check("plugins: typeCheck flags a coffee as a subject", async () => {
  await ace.addEntries([{ class: "noun", lemma: "coffee", source: "selftest" }, { class: "verb", lemma: "execute", valency: "transitive", source: "selftest" }]);
  const unuse = ace.use(typeCheck({ nouns: { coffee: "Consumable", customer: "Agent" }, verbs: { execute: { subject: ["Agent"] } } }));
  try {
    const text = "A coffee executes a card.";
    const ds = (await ace.lint(text)).diagnostics.filter((d) => d.code === "types/subject");
    eq(ds.length, 1, "type diagnostics");
    eq(slice(text, ds[0]!.range), "coffee", "underlined text");
  } finally { unuse(); }
});

await ace.dispose();

await check("cache: verified files persist in IndexedDB, so a second start needs no network", async () => {
  const deadBefore = requests("127.0.0.1:1");
  const again = await createAce({ upstream: { baseUrls: ["http://127.0.0.1:1/{path}"] } });
  try {
    eq((await again.lint("Every customer inserts a card.")).diagnostics, []);
  } finally { await again.dispose(); }
  eq(requests("127.0.0.1:1") - deadBefore, 0, "requests to the dead source");
});

await check("privacy: no request carries the user's text", async () => {
  const bad = performance.getEntriesByType("resource").filter((e) => /John|customer|inserts/.test(decodeURIComponent(e.name)));
  eq(bad.map((e) => e.name), [], "requests containing text");
});

document.title = failed === 0 ? `PASS ${passed}/${passed}` : `FAIL ${failed} of ${passed + failed}`;
log(`\n${document.title}`);
(window as unknown as { __selftest: unknown }).__selftest = { done: true, passed, failed, lines };
