// SPDX-License-Identifier: GPL-3.0-only
import type { Diagnostic, ParsedArg, ParsedEvent, Plugin } from "../types.ts";

/**
 * ACE has no word types ("A coffee executes a command." is valid ACE), so this optional plugin adds them.
 * It checks, for each verb listed in the schema, that its subject and object nouns have an accepted type.
 */
export type TypeSchema = {
  /** Type hierarchy: a type and the types it also counts as. Optional. */
  types?: Record<string, string[]>;
  /** Noun lemma to its type. A noun with no type here is never reported. */
  nouns: Record<string, string>;
  /** Verb lemma to the types it accepts as subject and as object. A missing list means anything goes. */
  verbs: Record<string, { subject?: string[]; object?: string[] }>;
};

function isA(type: string, accepted: string[], types: Record<string, string[]>): boolean {
  const seen = new Set<string>();
  const todo = [type];
  for (let t = todo.pop(); t !== undefined; t = todo.pop()) {
    if (accepted.includes(t)) return true;
    if (seen.has(t)) continue;
    seen.add(t);
    todo.push(...(types[t] ?? []));
  }
  return false;
}

export function typeCheck(schema: TypeSchema): Plugin {
  const types = schema.types ?? {};
  return {
    name: "types",
    afterParse(parsed) {
      const out: Diagnostic[] = [];
      const check = (e: ParsedEvent, a: ParsedArg | undefined, accepted: string[] | undefined, role: "subject" | "object") => {
        if (!a || a.kind !== "object" || !accepted) return;
        const type = schema.nouns[a.noun];
        if (type === undefined || isA(type, accepted, types)) return;
        out.push({
          severity: "error",
          code: role,
          message: `A ${a.noun} is a ${type}, but '${e.verb}' expects its ${role} to be ${accepted.join(" or ")}.`,
          // point at the noun when it is in the verb's sentence, otherwise (pronoun, "the X") at the verb
          range: a.sentence === e.sentence ? a.range : e.range,
          sentence: e.sentence,
        });
      };
      for (const e of parsed.events) {
        const rule = schema.verbs[e.verb];
        if (!rule) continue;
        check(e, e.subject, rule.subject, "subject");
        check(e, e.object, rule.object, "object");
      }
      return out;
    },
  };
}
