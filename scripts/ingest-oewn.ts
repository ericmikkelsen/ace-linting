// Turn Open English WordNet (and VerbNet frames) into normalized lexicon entries (JSON lines).
// Inputs live in the git-ignored cache (.cache/sources). Output: lexicon/oewn/oewn.jsonl (generated; validated later by build-lexicon).
// Usage: node scripts/ingest-oewn.ts [--oewn .cache/sources/oewn] [--verbnet .cache/sources/verbnet/src/verbnet3.4]
//        [--nouns N] [--verbs N] [--adjectives N] [--adverbs N]  (default: every plain lowercase lemma)
import fs from "node:fs";
import path from "node:path";
import { addS, regularPp, regularDegree } from "../src/inflect.ts";
import type { LexEntry, Valency } from "../src/lexicon.ts";

const args = process.argv.slice(2);
const opt = (name: string, fallback: string) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1]! : fallback; };
const oewnDir = opt("--oewn", ".cache/sources/oewn");
const vnDir = opt("--verbnet", ".cache/sources/verbnet/src/verbnet3.4");
const quota = { noun: +opt("--nouns", "1000000"), verb: +opt("--verbs", "1000000"), adjective: +opt("--adjectives", "1000000"), adverb: +opt("--adverbs", "1000000") };
const outFile = "lexicon/oewn/oewn.jsonl";

type Sense = { id: string; subcat?: string[] };
type PosBody = { sense?: Sense[]; form?: string[] };
type Entries = Record<string, Record<string, PosBody>>;

// --- read WordNet
const entries: Entries = {};
for (const f of fs.readdirSync(oewnDir).filter((n) => /^entries-.*\.json$/.test(n))) Object.assign(entries, JSON.parse(fs.readFileSync(path.join(oewnDir, f), "utf8")) as Entries);
const frames = JSON.parse(fs.readFileSync(path.join(oewnDir, "frames.json"), "utf8")) as Record<string, string>;

// WordNet frame ids -> valency (fallback when VerbNet has nothing)
const WN_INTR = new Set(["via", "vii", "via-pp", "via-adj", "via-at", "via-for", "via-on-anim", "via-on-inanim", "via-out-of", "via-to"]);
const WN_TR = new Set(["vtai", "vtaa", "vtia", "vtii", "vtai-pp", "vtaa-pp", "vtai-with", "vtai-on", "vtai-from", "vtaa-with", "vtaa-of"]);
const WN_DITR = new Set(["ditransitive", "vtai-to"]);
for (const k of [...WN_INTR, ...WN_TR, ...WN_DITR]) if (!(k in frames)) throw new Error(`unknown WordNet frame id ${k}`);

// lexicographer file number from a sense key (lemma%ss_type:lex_filenum:lex_id:...)
const lexnum = (senseId: string) => Number(senseId.split("%")[1]?.split(":")[1]);
const NOUN_PERSON = 18;

// --- read VerbNet: member verb -> valencies (union over the class file; deliberately permissive)
type Vn = { intr: boolean; tr: boolean; ditr: boolean; prep?: string };
const vn = new Map<string, Vn>();
if (fs.existsSync(vnDir)) {
  for (const f of fs.readdirSync(vnDir).filter((n) => n.endsWith(".xml"))) {
    const xml = fs.readFileSync(path.join(vnDir, f), "utf8");
    const primaries = [...xml.matchAll(/<DESCRIPTION[^>]*\bprimary="([^"]*)"/g)].map((m) => m[1]!.trim());
    const flags: Vn = { intr: false, tr: false, ditr: false };
    for (const p of primaries) {
      if (p === "NP V" || /^NP V PP\b/.test(p)) flags.intr = true;
      if (p === "NP V NP" || /^NP V NP PP\b/.test(p)) flags.tr = true;
      if (p === "NP V NP NP") flags.ditr = true;
      const prep = /^NP V NP PP\.(recipient|beneficiary)/.exec(p);
      if (prep) { flags.prep = prep[1] === "recipient" ? "to" : "for"; flags.ditr ||= false; }
    }
    for (const m of xml.matchAll(/<MEMBER\b[^>]*\bname="([a-z]+)"/g)) {
      const name = m[1]!;
      const cur = vn.get(name) ?? { intr: false, tr: false, ditr: false };
      cur.intr ||= flags.intr; cur.tr ||= flags.tr; cur.ditr ||= flags.ditr; cur.prep ??= flags.prep;
      vn.set(name, cur);
    }
  }
}

const overrides = JSON.parse(fs.readFileSync("lexicon/oewn/overrides.json", "utf8")) as { verbs: Record<string, { pp?: string }> };

const plainWord = /^[a-z]+$/;
type Cand = { lemma: string; senses: number; body: PosBody };
const rank = (a: Cand, b: Cand) => b.senses - a.senses || a.lemma.length - b.lemma.length || a.lemma.localeCompare(b.lemma);
const pick = (pos: string, n: number): Cand[] => {
  const all: Cand[] = [];
  for (const [lemma, byPos] of Object.entries(entries)) {
    const body = byPos[pos];
    if (body && plainWord.test(lemma) && body.sense?.length) all.push({ lemma, senses: body.sense.length, body });
  }
  return all.sort(rank).slice(0, n);
};

const out: LexEntry[] = [];
const skipped: string[] = [];

// nouns: all countable (WordNet has no countability); person senses -> human
for (const c of pick("n", quota.noun)) {
  const irregular = c.body.form?.[0];
  out.push({ class: "noun", lemma: c.lemma, ...(irregular && irregular !== addS(c.lemma) ? { plural: irregular } : {}), gender: lexnum(c.body.sense![0]!.id) === NOUN_PERSON ? "human" : "neutr", source: "oewn-2025" });
}

// verbs
const ING = /ing$/;
for (const c of pick("v", quota.verb)) {
  const forms = (c.body.form ?? []).filter((f) => !ING.test(f));
  let pp: string | undefined;
  let sg3: string | undefined;
  const sForm = forms.find((f) => /s$/.test(f) && f !== c.lemma);
  if (sForm && sForm !== addS(c.lemma)) sg3 = sForm;
  const pastLike = forms.filter((f) => f !== sForm);
  if (pastLike.length === 1) pp = pastLike[0];
  else if (pastLike.length >= 2) pp = pastLike.find((f) => /(en|n|ne)$/.test(f));
  else pp = regularPp(c.lemma);
  pp = overrides.verbs[c.lemma]?.pp ?? pp;
  if (pp === undefined) { skipped.push(`verb ${c.lemma}: past participle unclear`); continue; }

  const v = vn.get(c.lemma);
  const valencies: { valency: Valency; prep?: string }[] = [];
  let source = "oewn-2025";
  if (v && (v.intr || v.tr || v.ditr)) {
    source = "oewn-2025+verbnet-3.4";
    if (v.tr) valencies.push({ valency: "transitive" });
    if (v.intr) valencies.push({ valency: "intransitive" });
    if (v.ditr) valencies.push({ valency: "ditransitive", prep: v.prep ?? "to" });
  } else {
    const ids = new Set(c.body.sense!.flatMap((s) => s.subcat ?? []));
    if ([...ids].some((i) => WN_TR.has(i))) valencies.push({ valency: "transitive" });
    if ([...ids].some((i) => WN_INTR.has(i))) valencies.push({ valency: "intransitive" });
    if ([...ids].some((i) => WN_DITR.has(i))) valencies.push({ valency: "ditransitive", prep: "to" });
  }
  if (!valencies.length) { skipped.push(`verb ${c.lemma}: no usable frame`); continue; }
  for (const { valency, prep } of valencies) out.push({ class: "verb", lemma: c.lemma, valency, ...(sg3 ? { sg3 } : {}), pp, ...(prep ? { prep } : {}), source });
}

// adjectives and adverbs: degree forms from WordNet exceptions, else regular rules for short words
const degrees = (c: Cand): { comp?: string; sup?: string } => {
  const f = c.body.form ?? [];
  if (f.length === 2) {
    const sup = f.find((x) => /st$/.test(x));
    const comp = f.find((x) => x !== sup);
    if (sup && comp) return { comp, sup };
  }
  if (f.length === 0) { const d = regularDegree(c.lemma); if (d) return d; }
  return {};
};
for (const c of pick("a", quota.adjective)) out.push({ class: "adjective", lemma: c.lemma, ...degrees(c), source: "oewn-2025" });
for (const c of pick("r", quota.adverb)) out.push({ class: "adverb", lemma: c.lemma, ...(c.body.form?.length ? degrees(c) : {}), source: "oewn-2025" });

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, [
  "// Generated by scripts/ingest-oewn.ts from Open English WordNet 2025 (CC BY 4.0, on Princeton WordNet 3.1) and VerbNet 3.4. Do not edit.",
  "// See lexicon/licenses/ for the required notices.",
  ...out.map((e) => JSON.stringify(e)),
  "",
].join("\n"));
const count = (cls: string) => out.filter((e) => e.class === cls).length;
console.log(`wrote ${out.length} entries: ${count("noun")} nouns, ${count("verb")} verb entries, ${count("adjective")} adjectives, ${count("adverb")} adverbs; skipped ${skipped.length}`);
console.log(`verbs with VerbNet frames: ${out.filter((e) => e.source === "oewn-2025+verbnet-3.4").length}`);
if (skipped.length) fs.writeFileSync("lexicon/oewn/skipped.txt", skipped.join("\n") + "\n");
