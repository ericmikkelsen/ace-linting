// SPDX-License-Identifier: GPL-3.0-only
import { addS, regularPp } from "./inflect.ts";

export type Gender = "neutr" | "masc" | "fem" | "human";
export type Valency = "intransitive" | "transitive" | "ditransitive";

/** Where an entry came from. Every entry carries one so a source can be dropped and the lexicon rebuilt. */
type Base = { lemma: string; source?: string };

export type LexEntry =
  | (Base & { class: "noun"; plural?: string; gender?: Gender })
  | (Base & { class: "noun-mass"; gender?: Gender })
  | (Base & { class: "verb"; valency: Valency; sg3?: string; pp?: string; prep?: string })
  | (Base & { class: "adjective"; comp?: string; sup?: string })
  | (Base & { class: "adverb"; comp?: string; sup?: string });

/** Quote a Prolog atom when it is not a plain lowercase word. */
export function atom(text: string): string {
  return /^[a-z][a-zA-Z0-9_]*$/.test(text) ? text : `'${text.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

export class LexiconError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LexiconError";
  }
}

/** Convert one entry into APE lexicon terms (one per line, each ending in a period). */
export function toApeLines(e: LexEntry): string[] {
  const l = atom(e.lemma);
  switch (e.class) {
    case "noun": {
      const g = e.gender ?? "neutr";
      return [`noun_sg(${l}, ${l}, ${g}).`, `noun_pl(${atom(e.plural ?? addS(e.lemma))}, ${l}, ${g}).`];
    }
    case "noun-mass":
      return [`noun_mass(${l}, ${l}, ${e.gender ?? "neutr"}).`];
    case "verb": {
      const sg3 = atom(e.sg3 ?? addS(e.lemma));
      const ppForm = e.pp ?? regularPp(e.lemma);
      if (ppForm === undefined) throw new LexiconError(`verb '${e.lemma}' needs an explicit past participle (pp)`);
      const pp = atom(ppForm);
      const k = e.valency === "intransitive" ? "iv" : e.valency === "transitive" ? "tv" : "dv";
      if (k === "dv") {
        const prep = atom(e.prep ?? "");
        return [`dv_finsg(${sg3}, ${l}, ${prep}).`, `dv_infpl(${l}, ${l}, ${prep}).`, `dv_pp(${pp}, ${l}, ${prep}).`];
      }
      if (k === "iv") return [`iv_finsg(${sg3}, ${l}).`, `iv_infpl(${l}, ${l}).`];
      return [`tv_finsg(${sg3}, ${l}).`, `tv_infpl(${l}, ${l}).`, `tv_pp(${pp}, ${l}).`];
    }
    case "adjective": {
      const out = [`adj_itr(${l}, ${l}).`];
      if (e.comp) out.push(`adj_itr_comp(${atom(e.comp)}, ${l}).`);
      if (e.sup) out.push(`adj_itr_sup(${atom(e.sup)}, ${l}).`);
      return out;
    }
    case "adverb": {
      const out = [`adv(${l}, ${l}).`];
      if (e.comp) out.push(`adv_comp(${atom(e.comp)}, ${l}).`);
      if (e.sup) out.push(`adv_sup(${atom(e.sup)}, ${l}).`);
      return out;
    }
  }
}

/**
 * Groups of sentences that must parse with no errors once the entry is loaded: every group must pass,
 * and a group passes when at least one of its sentences does. They use words APE already knows
 * (customer, card, machine, inserts, gives, is, two) so a failure points at the new entry.
 */
export function templatesFor(e: LexEntry): string[][] {
  switch (e.class) {
    case "noun":
      return [[`A customer inserts a ${e.lemma}.`], [`A customer inserts two ${e.plural ?? addS(e.lemma)}.`]];
    case "noun-mass":
      return [[`A customer inserts some ${e.lemma}.`]];
    case "verb": {
      const sg3 = e.sg3 ?? addS(e.lemma);
      if (e.valency === "intransitive") return [[`A customer ${sg3}.`], [`Two customers ${e.lemma}.`]];
      if (e.valency === "transitive") {
        const pp = e.pp ?? regularPp(e.lemma);
        return [[`A customer ${sg3} a card.`], [`Two customers ${e.lemma} a card.`], ...(pp ? [[`A card is ${pp} by a customer.`]] : [])];
      }
      const prep = e.prep ? ` ${e.prep}` : " to";
      return [[`A customer ${sg3} a card${prep} a machine.`]];
    }
    case "adjective":
      return [[`A customer is ${e.lemma}.`], ...(e.comp ? [[`A customer is ${e.comp} than a card.`]] : [])];
    case "adverb":
      return [[`A customer ${e.lemma} inserts a card.`, `A customer inserts a card ${e.lemma}.`]];
  }
}

/** Parse JSON-lines text into entries. Blank lines and lines starting with // are skipped. */
export function parseEntries(jsonl: string): LexEntry[] {
  const entries: LexEntry[] = [];
  jsonl.split("\n").forEach((line, i) => {
    const t = line.trim();
    if (!t || t.startsWith("//")) return;
    let value: unknown;
    try {
      value = JSON.parse(t);
    } catch {
      throw new LexiconError(`line ${i + 1}: not valid JSON`);
    }
    entries.push(checkEntry(value, i + 1));
  });
  return entries;
}

const CLASSES = new Set(["noun", "noun-mass", "verb", "adjective", "adverb"]);
const VALENCIES = new Set(["intransitive", "transitive", "ditransitive"]);
const GENDERS = new Set(["neutr", "masc", "fem", "human"]);

export function checkEntry(value: unknown, line?: number): LexEntry {
  const where = line ? `line ${line}: ` : "";
  const v = value as Record<string, unknown> | null;
  if (!v || typeof v !== "object") throw new LexiconError(`${where}entry must be an object`);
  if (typeof v["class"] !== "string" || !CLASSES.has(v["class"])) throw new LexiconError(`${where}unknown class '${String(v["class"])}'`);
  const lemma = v["lemma"];
  if (typeof lemma !== "string" || !/^[a-z][a-z-]*$/.test(lemma)) throw new LexiconError(`${where}lemma must be lowercase letters (hyphens allowed): '${String(lemma)}'`);
  if (v["gender"] !== undefined && !GENDERS.has(String(v["gender"]))) throw new LexiconError(`${where}bad gender '${String(v["gender"])}'`);
  if (v["class"] === "verb" && !VALENCIES.has(String(v["valency"]))) throw new LexiconError(`${where}verb needs valency intransitive, transitive or ditransitive`);
  return v as unknown as LexEntry;
}
