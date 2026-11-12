// SPDX-License-Identifier: GPL-3.0-only
// Build the lexicon: read source files, validate every entry against a real APE, write the generated lexicon and a provenance report.
// Usage: node scripts/build-lexicon.ts [--ape vendor/APE/prolog] [--out lexicon/dist]
import fs from "node:fs";
import path from "node:path";
import { createAce, parseEntries, toApeLines, templatesFor, LexiconError, type LexEntry } from "../src/index.ts";

const args = process.argv.slice(2);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
};
const apeDir = opt("--ape", "vendor/APE/prolog");
const outDir = opt("--out", "lexicon/dist");
const sourceDirs = ["lexicon/core", "lexicon/oewn"].filter((d) => fs.existsSync(d)); // earlier sources win on duplicates

// Words APE already has in its built-in lexicon (informational: overlaps are reported, not removed).
function builtInWords(): Set<string> {
  const text = fs.readFileSync(path.join(apeDir, "lexicon/clex_lexicon.pl"), "utf8");
  const words = new Set<string>();
  for (const m of text.matchAll(/^[a-z_]+\(\s*'?([^',()]+)'?\s*,/gm)) words.add(m[1]!);
  return words;
}

const entries: LexEntry[] = [];
const duplicates: string[] = [];
const seen = new Set<string>();
const sourceRank = new Map<LexEntry, number>();
const keyOf = (e: LexEntry) => `${e.class === "noun-mass" ? "noun" : e.class === "verb" ? `verb-${e.valency}` : e.class}:${e.lemma}`;
for (const dir of sourceDirs) {
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".jsonl")).sort()) {
    for (const e of parseEntries(fs.readFileSync(path.join(dir, f), "utf8"))) {
      const k = keyOf(e);
      if (seen.has(k)) duplicates.push(`${e.source ?? dir}: ${k}`);
      else { seen.add(k); entries.push(e); sourceRank.set(e, sourceDirs.indexOf(dir)); }
    }
  }
}

const builtIn = builtInWords();
const accepted: LexEntry[] = [];
const rejected: { entry: LexEntry; why: string }[] = [];
const overlaps: string[] = [];

// Pass 0: entries that cannot be converted (for example a verb whose participle is unclear).
const convertible = entries.filter((e) => { try { toApeLines(e); return true; } catch (err) { rejected.push({ entry: e, why: (err as LexiconError).message }); return false; } });

// Pass 1: load everything into a scratch APE and collect the words it warns about (function words, double definitions,
// a word that is both an adverb and a noun, ...). For each warned word the best entry wins and the rest are rejected:
// earlier source first (our core before WordNet), then noun, verb, adjective, adverb. Repeat until APE stops warning.
const CLASS_RANK: Record<string, number> = { noun: 0, "noun-mass": 0, verb: 1, adjective: 2, adverb: 3 };
const formsOf = (e: LexEntry) => toApeLines(e).map((l) => /^[a-z_]+\(\s*'?([^',()]+)'?\s*,/.exec(l)?.[1] ?? "");
let usable = convertible;
for (let round = 1; round <= 5; round++) {
  const scratch = await createAce({ apeDir });
  const first = await scratch.addEntries(usable);
  await scratch.dispose();
  const warned = new Map<string, string>();
  for (const m of first.messages) {
    const word = m.message.split(":")[0]!.trim();
    if (word) warned.set(word, m.message);
  }
  if (warned.size === 0) break;
  const drop = new Map<LexEntry, string>();
  for (const [word, message] of warned) {
    const group = usable.filter((e) => formsOf(e).includes(word));
    group.sort((x, y) => (sourceRank.get(x) ?? 0) - (sourceRank.get(y) ?? 0) || (CLASS_RANK[x.class] ?? 9) - (CLASS_RANK[y.class] ?? 9));
    // A single entry that APE warns about conflicts with APE's own lexicon or function words: reject it. Otherwise keep the best one.
    for (const e of group.slice(group.length === 1 ? 0 : 1)) if (!drop.has(e)) drop.set(e, `APE warns about '${word}': ${message}`);
  }
  for (const [e, why] of drop) rejected.push({ entry: e, why });
  usable = usable.filter((e) => !drop.has(e));
  console.log(`conflict round ${round}: ${warned.size} warned words, ${drop.size} entries rejected`);
}

// Pass 2: a clean APE with only the usable entries; each must parse in its template sentences.
const ace = await createAce({ apeDir });
const load = await ace.addEntries(usable);
const loadErrors = load.messages.filter((m) => m.severity === "error");
if (loadErrors.length) throw new Error(`APE reported errors loading the usable entries: ${loadErrors.slice(0, 3).map((m) => m.message).join("; ")}`);

for (const e of usable) {
  let why: string | undefined;
  for (const group of templatesFor(e)) {
    let ok = false;
    for (const sentence of group) {
      const { diagnostics } = await ace.lint(sentence);
      if (!diagnostics.some((d) => d.severity === "error")) { ok = true; break; }
    }
    if (!ok) { why = `does not parse in: ${group.join(" | ")}`; break; }
  }
  if (why) rejected.push({ entry: e, why });
  else {
    accepted.push(e);
    if (builtIn.has(e.lemma)) overlaps.push(`${e.class} ${e.lemma}`);
  }
}
await ace.dispose();

fs.mkdirSync(outDir, { recursive: true });
const header = [
  "% Generated by scripts/build-lexicon.ts. Do not edit.",
  "% Sources and licenses: see PROVENANCE.md next to this file and lexicon/licenses/.",
  "",
];
fs.writeFileSync(path.join(outDir, "lexicon.pl"), [...header, ...accepted.flatMap(toApeLines), ""].join("\n"));

const bySource = new Map<string, number>();
for (const e of accepted) bySource.set(e.source ?? "(none)", (bySource.get(e.source ?? "(none)") ?? 0) + 1);
const report = [
  "# Lexicon provenance (generated)",
  "",
  "| Source | Entries |",
  "|---|---|",
  ...[...bySource].map(([s, n]) => `| ${s} | ${n} |`),
  "",
  `Accepted: ${accepted.length}. Rejected: ${rejected.length}. Duplicates dropped (earlier source wins): ${duplicates.length}. Overlap with APE's built-in lexicon: ${overlaps.length}.`,
  "",
  ...(rejected.length ? ["## Rejected", "", ...rejected.map((r) => `- ${r.entry.class} ${r.entry.lemma}: ${r.why}`), ""] : []),
  ...(overlaps.length ? ["## Also in APE's built-in lexicon", "", ...overlaps.map((o) => `- ${o}`), ""] : []),
];
fs.writeFileSync(path.join(outDir, "PROVENANCE.md"), report.join("\n"));

console.log(`accepted ${accepted.length}, rejected ${rejected.length}, duplicates dropped ${duplicates.length}, overlap with built-in ${overlaps.length}`);
for (const r of rejected.slice(0, 40)) console.log(`  rejected ${r.entry.class} ${r.entry.lemma}: ${r.why}`);
if (rejected.length) process.exitCode = 1;
