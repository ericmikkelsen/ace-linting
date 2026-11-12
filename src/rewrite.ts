// SPDX-License-Identifier: GPL-3.0-only
// Rewrites the common helper-word tenses into ACE that RACE can use (docs/tense.md, P3):
//   "John has bought a card."      -> "John bought a card."          (the perfect is read as the simple past)
//   "Did John buy a card?"         -> "Who bought a card?"            (checked for John afterwards)
//   "Did the customer buy a card?" -> "Is there a customer that bought a card?"
// Only patterns that are safe to rewrite are touched; everything else is left exactly as written.
import type { Range } from "./types.ts";
import { splitSentences, tokenizeSentence } from "./tokenize.ts";

export type TenseLookup = {
  /** The past form of a verb given its infinitive ("buy" -> "bought"), or undefined when unknown or the verb has no past form. */
  pastOfLemma(word: string): string | undefined;
  /** The past form of the verb that has this participle ("bought" -> "bought", "written" -> "wrote"). */
  pastOfParticiple(word: string): string | undefined;
};

/** One replacement, in coordinates of the original text. */
export type Edit = {
  start: number;
  end: number;
  replacement: string;
  note: string;
  /** For a yes/no question about a named subject: the name the answers must contain ("Did John buy a card?" -> "John"). */
  who?: string;
};

const DETERMINERS = new Set(["a", "an", "the", "this", "that", "these", "those", "some", "every", "each", "no", "my", "your", "his", "her", "its", "our", "their"]);
const PREPOSITIONS = new Set(["to", "for", "by", "in", "on", "at", "with", "from", "of", "into", "onto", "about"]);
const PRONOUNS = new Set(["him", "her", "it", "them", "me", "us", "you"]);
const NUMBER_WORDS = new Set(["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"]);
const HELPERS = new Set(["has", "have", "had"]);

const capitalized = (w: string) => /^\p{Lu}/u.test(w);
const article = (word: string) => (/^(uni|use|usu|one|eu)/i.test(word) ? "a" : /^(hour|honest|heir)/i.test(word) ? "an" : /^[aeiou]/i.test(word) ? "an" : "a");

/** After a participle that is the verb of the sentence comes an article, a name, a pronoun, a preposition, a number or the end; a plain noun means it is an adjective. */
function verbLike(next: { text: string } | undefined): boolean {
  if (!next) return true;
  const w = next.text.toLowerCase();
  return /^[.!?,;]$/.test(next.text) || DETERMINERS.has(w) || PREPOSITIONS.has(w) || PRONOUNS.has(w) || NUMBER_WORDS.has(w) || capitalized(next.text) || /^\d/.test(w);
}

export function planRewrites(text: string, lookup: TenseLookup): Edit[] {
  const edits: Edit[] = [];
  for (const s of splitSentences(text)) {
    const at = s.range.start;
    const tokens = tokenizeSentence(s.text).map((t) => ({ text: t.text, start: at + t.range.start, end: at + t.range.end }));
    const last = tokens[tokens.length - 1];
    if (last?.text === "?") {
      const q = questionEdit(text, s.range, tokens, lookup);
      if (q) edits.push(q);
      continue;
    }
    for (let i = 0; i + 1 < tokens.length; i++) {
      if (!HELPERS.has(tokens[i]!.text.toLowerCase())) continue;
      const past = lookup.pastOfParticiple(tokens[i + 1]!.text);
      if (past === undefined || !verbLike(tokens[i + 2])) continue;
      edits.push({ start: tokens[i]!.start, end: tokens[i + 1]!.end, replacement: past, note: `"${text.slice(tokens[i]!.start, tokens[i + 1]!.end)}" is read as the past tense "${past}"` });
      i++;
    }
  }
  return edits;
}

type Tok = { text: string; start: number; end: number };

function questionEdit(text: string, sentence: Range, tokens: Tok[], lookup: TenseLookup): Edit | undefined {
  const helper = tokens[0]?.text.toLowerCase();
  if (helper !== "did" && !HELPERS.has(helper ?? "")) return undefined;
  if (tokens.some((t) => /^(not|n't)$/i.test(t.text))) return undefined;
  const pastOf = helper === "did" ? lookup.pastOfLemma : lookup.pastOfParticiple;

  // the verb: the first word that is a verb form and does not follow a determiner (so "the plan" keeps "plan" as a noun)
  let j = -1;
  for (let k = 2; k < tokens.length - 1; k++) {
    if (pastOf(tokens[k]!.text) !== undefined && !DETERMINERS.has(tokens[k - 1]!.text.toLowerCase())) { j = k; break; }
  }
  if (j < 0) return undefined;
  const past = pastOf(tokens[j]!.text)!;
  const subject = tokens.slice(1, j);
  const rest = text.slice(tokens[j]!.end, tokens[tokens.length - 1]!.start);

  // a named subject: "Did John buy ...?" -> "Who bought ...?", checked for John afterwards
  if (subject.length === 1 && capitalized(subject[0]!.text)) {
    return { start: sentence.start, end: sentence.end, replacement: `Who ${past}${rest}?`, note: `read as "Who ${past}${rest}?" and checked for ${subject[0]!.text}`, who: subject[0]!.text };
  }
  // a noun phrase: needs a determiner, and a singular head
  const first = subject[0]!;
  const head = subject[subject.length - 1]!;
  if (!DETERMINERS.has(first.text.toLowerCase()) || subject.length < 2) return undefined;
  if (/s$/i.test(head.text) && !/ss$/i.test(head.text)) return undefined; // plural: "Is there a customers" is not ACE
  const noun = text.slice(subject[1]!.start, head.end);
  const replacement = `Is there ${article(noun)} ${noun} that ${past}${rest}?`;
  return { start: sentence.start, end: sentence.end, replacement, note: `read as "${replacement}"` };
}

export function applyEdits(text: string, edits: Edit[]): string {
  let out = "";
  let at = 0;
  for (const e of [...edits].sort((a, b) => a.start - b.start)) {
    out += text.slice(at, e.start) + e.replacement;
    at = e.end;
  }
  return out + text.slice(at);
}

/**
 * Map a range in the rewritten text back to the original. A range that touches rewritten words maps to the whole
 * span those words replaced; anything else just shifts by the length changes before it.
 */
export function mapRangeBack(range: Range, edits: Edit[]): Range {
  let delta = 0;
  for (const e of [...edits].sort((a, b) => a.start - b.start)) {
    const ns = e.start + delta;
    const ne = ns + e.replacement.length;
    if (range.start < ne && range.end > ns) return { start: e.start, end: e.end };
    if (ne <= range.start) delta += e.replacement.length - (e.end - e.start);
    else break;
  }
  return { start: range.start - delta, end: range.end - delta };
}
