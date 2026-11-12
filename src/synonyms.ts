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
 * Turn a rule into the ACE sentence(s) RACE will see. These are the shapes verified against RACE:
 * nouns "Every X is a Y.", adjectives "Everything that is X is Y.", verbs "If somebody Xs something then he Ys it."
 */
export function compileRule(rule: SynonymRule): string[] {
  for (const w of [rule.from, rule.to]) if (!WORD.test(w)) throw new SynonymError(`'${w}' is not a lowercase word`);
  const one = (from: string, to: string, fromSg3?: string, toSg3?: string): string => {
    switch (rule.class) {
      case "noun":
        return `Every ${from} is ${article(to)} ${to}.`;
      case "adjective":
        return `Everything that is ${from} is ${to}.`;
      case "verb": {
        const f = fromSg3 ?? addS(from);
        const t = toSg3 ?? addS(to);
        return rule.valency === "transitive" ? `If somebody ${f} something then he ${t} it.` : `If somebody ${f} then he ${t}.`;
      }
    }
  };
  if (rule.class === "verb" && rule.valency !== "intransitive" && rule.valency !== "transitive") {
    throw new SynonymError("a verb rule needs a valency: 'intransitive' or 'transitive'");
  }
  const out = [one(rule.from, rule.to, rule.class === "verb" ? rule.fromSg3 : undefined, rule.class === "verb" ? rule.toSg3 : undefined)];
  if (rule.both) out.push(one(rule.to, rule.from, rule.class === "verb" ? rule.toSg3 : undefined, rule.class === "verb" ? rule.fromSg3 : undefined));
  return out;
}

/** A stable key so the same rule is not stored twice and can be removed by an equal object. */
export function ruleKey(rule: SynonymRule): string {
  return JSON.stringify([rule.class, rule.class === "verb" ? rule.valency : "", rule.from, rule.to, !!rule.both, rule.class === "verb" ? rule.fromSg3 ?? "" : "", rule.class === "verb" ? rule.toSg3 ?? "" : ""]);
}
