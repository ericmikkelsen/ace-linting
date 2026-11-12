// Choose which sentences to send to RACE. This only narrows the search; RACE still proves the answer,
// and the caller retries with every sentence when the narrowed text gives "unknown".

const STOP = new Set(
  ("a an the is are was were be been being do does did who whom whose what which how when where why that this these those " +
    "if then else every each all no not nor and or of to in on at by with for from as it its he him his she her they them their " +
    "somebody someone something nobody nothing everybody everything there than has have had can may must will shall").split(" "),
);

/** A crude stem: enough to match "purchase" with "purchases" and "insert" with "inserted". */
function stem(word: string): string {
  const w = word.toLowerCase();
  if (w.length > 4 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("es")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("ed")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s")) return w.slice(0, -1);
  return w;
}

function contentStems(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/[\p{L}][\p{L}'-]*/gu)) {
    const w = m[0].toLowerCase();
    if (!STOP.has(w)) out.add(stem(w));
  }
  return out;
}

/**
 * Indices (0-based, ascending) of the sentences worth trying: those sharing a content word with the question,
 * plus, for up to three rounds, those sharing a content word with an already chosen sentence.
 * When nothing matches, every index is returned.
 */
export function selectRelevant(sentences: string[], question: string): number[] {
  const stems = sentences.map(contentStems);
  const wanted = contentStems(question);
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
    if (!take(known)) break;
  }
  return [...chosen].sort((a, b) => a - b);
}
