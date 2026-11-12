// SPDX-License-Identifier: GPL-3.0-only
// A compact index of WordNet synonym sets, used only to *suggest* synonym rules (never to answer silently).

/** Each set is [definition, members]; the maps give, per word, the sets it belongs to (indices into `synsets`). */
export type SynonymIndex = {
  synsets: [string, string[]][];
  n: Record<string, number[]>;
  v: Record<string, number[]>;
  a: Record<string, number[]>;
};

/** One synonym set as read from WordNet: part of speech (n, v, a, s for satellite adjectives, r), members and a definition. */
export type RawSynset = { pos: string; members: string[]; definition: string };

const PLAIN = /^[a-z]+$/;

/** The sets a word belongs to, ignoring anything inherited from Object.prototype. */
export function setsOf(map: Record<string, number[]>, word: string): number[] {
  return Object.hasOwn(map, word) ? map[word]! : [];
}

/**
 * Keep single plain lowercase words that are in `allowed` (our lexicon, so any rule built from them is valid ACE),
 * drop sets left with fewer than two members, and map each word to its sets.
 */
export function buildIndex(synsets: RawSynset[], allowed: Set<string>): SynonymIndex {
  const out: SynonymIndex = { synsets: [], n: {}, v: {}, a: {} };
  for (const s of synsets) {
    const key = s.pos === "n" ? "n" : s.pos === "v" ? "v" : s.pos === "a" || s.pos === "s" ? "a" : undefined;
    if (!key) continue;
    const members = [...new Set(s.members.filter((m) => PLAIN.test(m) && allowed.has(m)))];
    if (members.length < 2) continue;
    const id = out.synsets.push([s.definition, members]) - 1;
    for (const m of members) {
      // own-property checks: "constructor" and "valueOf" are English words and also keys every object inherits
      const map = out[key];
      if (Object.hasOwn(map, m)) map[m]!.push(id);
      else map[m] = [id];
    }
  }
  return out;
}
