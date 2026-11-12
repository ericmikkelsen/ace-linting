import type { AskResult, ProofAxiom, Substitution, SynonymRule, Unmatched } from "./types.ts";

/** What the Prolog side returns for one question: proofs as lines of text, unmatched words, and RACE's own messages. */
export type RawAnswer = { proofs: string[][]; whyNot: string[]; messages: string[] };

const NUMBERED = /^(\d+): (.*)$/s;
const SUBSTITUTION = /^Substitution: (\S+) = (.*)$/s;

/**
 * Turn RACE's raw output into an AskResult. `sentenceMap[i]` is the original (1-based) sentence number of the
 * i-th sentence that was sent to RACE, so proofs refer to the user's own numbering even when only some sentences were sent.
 * An entry can instead be a synonym rule, for a sentence we appended on the user's behalf.
 */
export function toAskResult(raw: RawAnswer, sentenceMap: (number | SynonymRule)[]): Extract<AskResult, { status: "answered" | "unknown" }> {
  if (raw.proofs.length === 0) {
    const unmatched: Unmatched[] = raw.whyNot.map((entry) => {
      const at = entry.indexOf(": ");
      return at < 0 ? { wordClass: "", word: entry } : { wordClass: entry.slice(0, at), word: entry.slice(at + 2) };
    });
    return { status: "unknown", unmatched, messages: raw.messages, suggestions: [] };
  }

  const answers: Substitution[] = [];
  const seen = new Set<string>();
  const proofs = raw.proofs.map((lines) => {
    const axioms: ProofAxiom[] = [];
    const substitutions: Substitution[] = [];
    for (const line of lines) {
      const sub = SUBSTITUTION.exec(line);
      if (sub) {
        const s = { word: sub[1]!, value: sub[2]! };
        substitutions.push(s);
        const key = `${s.word}\u0000${s.value}`;
        if (!seen.has(key)) { seen.add(key); answers.push(s); }
        continue;
      }
      const numbered = NUMBERED.exec(line);
      if (numbered) {
        const n = Number(numbered[1]);
        const origin = sentenceMap[n - 1] ?? n;
        axioms.push(typeof origin === "number" ? { sentence: origin, text: numbered[2]! } : { sentence: 0, text: numbered[2]!, synonym: origin });
      }
    }
    return { axioms, substitutions };
  });
  return { status: "answered", answers, proofs, messages: raw.messages };
}
