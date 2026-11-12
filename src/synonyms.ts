// SPDX-License-Identifier: GPL-3.0-only
import type { SynonymRule } from "./types.ts";
import { addS } from "./inflect.ts";

export class SynonymError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SynonymError";
  }
}

const WORD = /^[a-z][a-z-]*$/;
const AN_EXCEPTIONS_A = /^(uni|use|usu|uti|one|eu)/;
const AN_EXCEPTIONS_AN = /^(hour|honest|heir)/;

/** "a" or "an" for the word that follows. */
function article(word: string): "a" | "an" {
  if (AN_EXCEPTIONS_AN.test(word)) return "an";
  if (AN_EXCEPTIONS_A.test(word)) return "a";
  return /^[aeiou]/.test(word) ? "an" : "a";
}

/**
 * Turn a rule into the ACE sentence(s) RACE will see. Nouns: "Every X is a Y."; adjectives: "Everything that is X is Y.".
 * Verbs and adverbs use variables, which RACE applies to people and things alike:
 *   transitive  "If somebody X buys something Y then X purchases Y."
 *   ditransitive "If somebody X brings something Y to somebody Z then X sends Y to Z."
 * (The earlier shape "... then he purchases it" worked only for some subjects and objects.)
 */
export function compileRule(rule: SynonymRule): string[] {
  for (const w of [rule.from, rule.to]) if (!WORD.test(w)) throw new SynonymError(`'${w}' is not a lowercase word`);
  const bad = (what: string) => { throw new SynonymError(what); };

  if (rule.class === "adverb") {
    if (typeof rule.verb !== "string" || !WORD.test(rule.verb)) bad("an adverb rule needs the verb it modifies (verb: 'wait')");
    if (rule.valency !== "intransitive" && rule.valency !== "transitive") bad("an adverb rule needs a valency: 'intransitive' or 'transitive'");
    const vs = rule.verbSg3 ?? addS(rule.verb);
    const one = (from: string, to: string) =>
      rule.valency === "transitive"
        ? `If somebody X ${vs} something Y ${from} then X ${vs} Y ${to}.`
        : `If somebody X ${vs} ${from} then X ${vs} ${to}.`;
    return rule.both ? [one(rule.from, rule.to), one(rule.to, rule.from)] : [one(rule.from, rule.to)];
  }

  if (rule.class === "verb") {
    if (rule.valency !== "intransitive" && rule.valency !== "transitive" && rule.valency !== "ditransitive") {
      bad("a verb rule needs a valency: 'intransitive', 'transitive' or 'ditransitive'");
    }
    for (const prep of [rule.fromPrep, rule.toPrep]) if (prep !== undefined && !WORD.test(prep)) bad(`'${prep}' is not a lowercase preposition`);
    const one = (from: string, to: string, fromSg3?: string, toSg3?: string, fromPrep = "to", toPrep = "to") => {
      const f = fromSg3 ?? addS(from);
      const t = toSg3 ?? addS(to);
      if (rule.valency === "intransitive") return `If somebody X ${f} then X ${t}.`;
      if (rule.valency === "transitive") return `If somebody X ${f} something Y then X ${t} Y.`;
      return `If somebody X ${f} something Y ${fromPrep} somebody Z then X ${t} Y ${toPrep} Z.`;
    };
    const out = [one(rule.from, rule.to, rule.fromSg3, rule.toSg3, rule.fromPrep, rule.toPrep)];
    if (rule.both) out.push(one(rule.to, rule.from, rule.toSg3, rule.fromSg3, rule.toPrep, rule.fromPrep));
    return out;
  }

  const one = (from: string, to: string) =>
    rule.class === "noun" ? `Every ${from} is ${article(to)} ${to}.` : `Everything that is ${from} is ${to}.`;
  return rule.both ? [one(rule.from, rule.to), one(rule.to, rule.from)] : [one(rule.from, rule.to)];
}

/** A stable key so the same rule is not stored twice and can be removed by an equal object. */
export function ruleKey(rule: SynonymRule): string {
  const r = rule as Record<string, unknown>;
  return JSON.stringify(["class", "valency", "verb", "from", "to", "fromSg3", "toSg3", "fromPrep", "toPrep", "verbSg3"].map((k) => r[k] ?? "").concat([String(!!rule.both)]));
}

/** The words a rule connects, for deciding whether it matters to a question. */
export function ruleWords(rule: SynonymRule): [string, string] {
  return [rule.from, rule.to];
}
