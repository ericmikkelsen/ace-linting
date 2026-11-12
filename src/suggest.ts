// SPDX-License-Identifier: GPL-3.0-only
import type { Suggestion, SynonymRule, Unmatched } from "./types.ts";
import { setsOf, type SynonymIndex } from "./synonym-index.ts";
import { contentStems, stemsOf } from "./select.ts";
import { ruleKey } from "./synonyms.ts";

type Kind = { pos: "n" | "v" | "a"; valency?: "intransitive" | "transitive" | "ditransitive" };

/** Which words can get a rule: nouns, adjectives and verbs. Names and prepositions cannot, and an adverb needs to be tied to a verb. */
function kindOf(wordClass: string): Kind | undefined {
  if (/ditransitive verb/.test(wordClass)) return { pos: "v", valency: "ditransitive" };
  if (/intransitive verb/.test(wordClass)) return { pos: "v", valency: "intransitive" };
  if (/transitive verb/.test(wordClass)) return { pos: "v", valency: "transitive" };
  if (/noun/.test(wordClass)) return { pos: "n" };
  if (/adjective/.test(wordClass)) return { pos: "a" };
  return undefined;
}

/**
 * For each word of the question that RACE could not match, offer synonyms that appear in the text,
 * with the WordNet definition so the user can tell the senses apart, and a rule ready for `ace.synonyms.add`.
 * The rule reads "the text's word implies the question's word".
 */
export function suggest(unmatched: Unmatched[], text: string, index: SynonymIndex, perWord = 3): Suggestion[] {
  const inText = contentStems(text);
  const out: Suggestion[] = [];
  const seen = new Set<string>();
  const done = new Set<string>();
  for (const u of unmatched) {
    const kind = kindOf(u.wordClass);
    const word = u.word.replace(/^\(at least \d+\)\s*/, "");
    if (!kind || !/^[a-z][a-z-]*$/.test(word)) continue;
    const slot = `${kind.pos}/${kind.valency ?? ""}/${word}`;
    if (done.has(slot)) continue; // the same unmatched word listed twice
    done.add(slot);

    const found = new Map<string, { count: number; gloss: string }>();
    for (const id of setsOf(index[kind.pos], word)) {
      const [gloss, members] = index.synsets[id]!;
      for (const m of members) {
        if (m === word || !stemsOf(m).some((c) => inText.has(c))) continue;
        const hit = found.get(m);
        if (hit) hit.count++;
        else found.set(m, { count: 1, gloss });
      }
    }
    const ranked = [...found].sort((a, b) => b[1].count - a[1].count); // stable: ties keep WordNet's order
    let taken = 0;
    for (const [replacement, { gloss }] of ranked) {
      if (taken >= perWord) break;
      const rule: SynonymRule = kind.pos === "v"
        ? { class: "verb", valency: kind.valency!, from: replacement, to: word }
        : { class: kind.pos === "n" ? "noun" : "adjective", from: replacement, to: word };
      const key = ruleKey(rule);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ word, replacement, gloss, rule });
      taken++;
    }
  }
  return out;
}
