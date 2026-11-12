// Build the synonym index from Open English WordNet (in the git-ignored cache) for words in our generated lexicon.
// Run `npm run build:lexicon` first. Usage: node scripts/build-synonyms.ts [--oewn .cache/sources/oewn] [--out lexicon/dist/synonyms.json]
import fs from "node:fs";
import path from "node:path";
import { buildIndex, type RawSynset } from "../src/synonym-index.ts";

const args = process.argv.slice(2);
const opt = (name: string, fallback: string) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1]! : fallback; };
const oewnDir = opt("--oewn", ".cache/sources/oewn");
const out = opt("--out", "lexicon/dist/synonyms.json");
const lexiconFile = "lexicon/dist/lexicon.pl";
if (!fs.existsSync(lexiconFile)) throw new Error(`${lexiconFile} not found: run npm run build:lexicon first`);

// Words we can write rules about: every word form that appears in the generated lexicon.
const allowed = new Set<string>();
for (const m of fs.readFileSync(lexiconFile, "utf8").matchAll(/^[a-z_]+\(\s*'?([^',()]+)'?\s*,/gm)) allowed.add(m[1]!);

const synsets: RawSynset[] = [];
for (const f of fs.readdirSync(oewnDir).filter((n) => /^(noun|verb|adj)\..*\.json$/.test(n)).sort()) {
  const file = JSON.parse(fs.readFileSync(path.join(oewnDir, f), "utf8")) as Record<string, { members?: string[]; definition?: string[]; partOfSpeech?: string }>;
  for (const s of Object.values(file)) {
    if (s.members && s.partOfSpeech) synsets.push({ pos: s.partOfSpeech, members: s.members, definition: (s.definition ?? [""])[0] ?? "" });
  }
}

const index = buildIndex(synsets, allowed);
fs.mkdirSync(path.dirname(out), { recursive: true });
const json = JSON.stringify(index);
fs.writeFileSync(out, json);
console.log(`${index.synsets.length} synonym sets from ${synsets.length}; ${Object.keys(index.n).length} nouns, ${Object.keys(index.v).length} verbs, ${Object.keys(index.a).length} adjectives; ${(json.length / 1e6).toFixed(1)} MB`);
