// SPDX-License-Identifier: GPL-3.0-only
// Choose which sentences to send to RACE. This only narrows the search; RACE still proves the answer,
// and the caller retries with every sentence when the narrowed text gives "unknown".

const STOP = new Set(
  ("a an the is are was were be been being do does did who whom whose what which how when where why that this these those " +
    "if then else every each all no not nor and or of to in on at by with for from as it its he him his she her they them their " +
    "somebody someone something nobody nothing everybody everything there than has have had can may must will shall").split(" "),
);

/**
 * Candidate base forms of a word, so "purchases", "purchased" and "purchase" meet: strip -s, -es, -ed, -ing and -ies,
 * with and without a restored final "e". Over-generating is fine here: matching is used to narrow a text, never to answer.
 */
export function stemsOf(word: string): string[] {
  const w = word.toLowerCase();
  const out = new Set([w]);
  const add = (x: string) => { if (x.length >= 3) out.add(x); };
  if (w.endsWith("ies")) add(`${w.slice(0, -3)}y`);
  if (w.endsWith("es")) add(w.slice(0, -2));
  if (w.endsWith("s") && !w.endsWith("ss")) add(w.slice(0, -1));
  if (w.endsWith("ed")) { add(w.slice(0, -2)); add(w.slice(0, -1)); if (w.endsWith("ied")) add(`${w.slice(0, -3)}y`); }
  if (w.endsWith("ing")) { add(w.slice(0, -3)); add(`${w.slice(0, -3)}e`); }
  return [...out];
}

export function contentStems(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/[\p{L}][\p{L}'-]*/gu)) {
    const w = m[0].toLowerCase();
    if (!STOP.has(w)) for (const c of stemsOf(w)) out.add(c);
  }
  return out;
}

/**
 * Indices (0-based, ascending) of the sentences worth trying: those sharing a content word with the question,
 * plus, for up to three rounds, those sharing a content word with an already chosen sentence.
 * `related` links words the user has said mean the same (synonym rules): RACE can only use a sentence through
 * such a rule, so words reachable through it count as if they were in the question. It may be a chain.
 * When nothing matches, every index is returned.
 */
export function selectRelevant(sentences: string[], question: string, related?: (stem: string) => Iterable<string>): number[] {
  const expand = (words: Set<string>): Set<string> => {
    const out = new Set(words);
    if (!related) return out;
    const todo = [...words];
    for (let w = todo.pop(); w !== undefined; w = todo.pop()) {
      for (const r of related(w)) if (!out.has(r)) { out.add(r); todo.push(r); }
    }
    return out;
  };
  const stems = sentences.map(contentStems);
  const wanted = expand(contentStems(question));
  const chosen = new Set<number>();
  const take = (words: Set<string>) => {
    let grew = false;
    stems.forEach((s, i) => {
      if (chosen.has(i)) return;
      for (const w of s) if (words.has(w)) { chosen.add(i); grew = true; return; }
    });
    return grew;
  };
  if (!take(wanted)) return sentences.map((_, i) => i);
  for (let round = 0; round < 3; round++) {
    const known = new Set<string>(wanted);
    for (const i of chosen) for (const w of stems[i]!) known.add(w);
    if (!take(expand(known))) break;
  }
  return [...chosen].sort((a, b) => a - b);
}
