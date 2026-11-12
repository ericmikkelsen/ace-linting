// SPDX-License-Identifier: GPL-3.0-only
// ACE has only the simple present tense. This recognises the ways people write other tenses, so the linter can
// say so plainly instead of "unknown word" or a spelling guess.

export type TenseKind = "past" | "future" | "perfect" | "progressive";
export type TenseHint = { kind: TenseKind; message: string };

const FUTURE = new Set(["will", "shall"]);
const PAST_HELPERS = new Set(["did", "was", "were", "had"]);
const PERFECT_HELPERS = new Set(["has", "have", "had"]);
const PROGRESSIVE_HELPERS = new Set(["is", "are", "am", "was", "were"]);

/** Common irregular past forms and participles. Used only for a word that is already an error, so it cannot mislabel valid text. */
const IRREGULAR = new Set(
  ("bought brought wrote written took taken gave given went gone said made saw seen came got gotten ran sat stood told found left " +
    "kept held lost paid sent spent met began begun ate eaten drank drunk drove driven flew flown knew known grew grown threw thrown " +
    "wore worn broke broken chose chosen spoke spoken forgot forgotten felt built sold heard thought taught caught fought sought won " +
    "became done been slept swept wept led fed fled sped shot lit bit hid slid").split(" "),
);

/** Words that end in -ed but are not past forms. */
const NOT_PAST = new Set(["need", "feed", "seed", "speed", "bleed", "breed", "greed", "indeed", "proceed", "succeed", "exceed", "hundred", "sacred", "naked", "wicked", "kindred", "hatred", "embed"]);

const looksPast = (w: string) => IRREGULAR.has(w) || (w.length > 4 && w.endsWith("ed") && !NOT_PAST.has(w));

const HOW = "ACE has only the present tense.";

/**
 * Is `word` (the word APE stopped at) a tense that ACE lacks? `previous` is the word before it and `opening` the first word
 * of the sentence (for questions that start with the helper).
 * Returns what to tell the user, or undefined when the word is not about tense.
 */
export function describeTense(word: string, previous?: string, opening?: string): TenseHint | undefined {
  const w = word.toLowerCase();
  const p = previous?.toLowerCase();
  // A question puts the helper first: "Has John bought a card?", "Is John buying a card?"
  const o = opening?.toLowerCase();
  if (o && PERFECT_HELPERS.has(o) && o !== w && looksPast(w)) return { kind: "perfect", message: `'${opening} ... ${word}' is a perfect tense, and ${HOW}` };
  if (o && PROGRESSIVE_HELPERS.has(o) && o !== w && w.length > 4 && w.endsWith("ing")) return { kind: "progressive", message: `'${opening} ... ${word}' is a progressive form, and ${HOW}` };
  if (FUTURE.has(w)) return { kind: "future", message: `'${word}' marks the future, and ${HOW}` };
  if (PAST_HELPERS.has(w)) return { kind: "past", message: `'${word}' is a past tense, and ${HOW}` };
  if (p && PERFECT_HELPERS.has(p) && looksPast(w)) return { kind: "perfect", message: `'${previous} ${word}' is a perfect tense, and ${HOW}` };
  if (p && PROGRESSIVE_HELPERS.has(p) && w.length > 4 && w.endsWith("ing")) return { kind: "progressive", message: `'${previous} ${word}' is a progressive form, and ${HOW}` };
  if (looksPast(w)) return { kind: "past", message: `'${word}' looks like a past tense, and ${HOW}` };
  return undefined;
}

/** What to write instead. */
export const TENSE_ADVICE =
  'Use the present tense ("John buys a card."), the passive ("A card is bought by John."), or say when it happens ("John buys a card on Monday.").';
