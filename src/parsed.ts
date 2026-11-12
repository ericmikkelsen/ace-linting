// SPDX-License-Identifier: GPL-3.0-only
import type { ParsedArg, ParsedEvent, ParsedModifier, ParsedObject, ParsedProperty, ParsedText, Range, SentenceSpan, TokenSpan } from "./types.ts";
import { splitSentences, tokenizeSentence } from "./tokenize.ts";
import { agrees, shift } from "./diagnostics.ts";

/** Rows as the Prolog glue returns them (see `lint_rows` in glue.ts). */
export type FactRows = { objects: unknown[][]; events: unknown[][]; properties: unknown[][]; modifiers?: unknown[][] };

/** Turn the glue's fact rows into a ParsedText with character ranges. */
export function buildParsed(text: string, rows: FactRows, apeTokens: string[][]): ParsedText {
  const sentences = splitSentences(text);
  const tokenCache = new Map<number, TokenSpan[]>();

  /** Range of token `token` (1-based) in sentence `sentence`; the whole sentence when APE's tokens disagree with ours. */
  const rangeOf = (sentence: number, token: number): Range => {
    const s: SentenceSpan | undefined = sentences[sentence - 1];
    if (!s) return { start: 0, end: text.length };
    let tokens = tokenCache.get(sentence);
    if (!tokens) tokenCache.set(sentence, (tokens = tokenizeSentence(s.text)));
    const t = agrees(tokens, apeTokens[sentence - 1]) ? tokens[token - 1] : undefined;
    return t ? shift(s, t) : s.range;
  };

  const objects: ParsedObject[] = rows.objects.map(([id, noun, sentence, token]) => ({
    kind: "object", id: String(id), noun: String(noun), sentence: Number(sentence), range: rangeOf(Number(sentence), Number(token)),
  }));
  const properties: ParsedProperty[] = rows.properties.map(([id, adjective, sentence, token]) => ({
    kind: "property", id: String(id), adjective: String(adjective), sentence: Number(sentence), range: rangeOf(Number(sentence), Number(token)),
  }));
  const byId = new Map<string, ParsedArg>([...objects, ...properties].map((a) => [a.id, a]));
  const arg = (id: unknown): ParsedArg | undefined => {
    const key = String(id);
    if (key.startsWith("n:")) return { kind: "name", name: key.slice(2) };
    if (key.startsWith("s:")) return { kind: "string", value: key.slice(2) };
    return byId.get(key);
  };

  const modifiersOf = new Map<string, ParsedModifier[]>();
  for (const [eventId, kind, word, valueId] of rows.modifiers ?? []) {
    const value = kind === "pp" ? arg(valueId) : undefined;
    const modifier: ParsedModifier | undefined =
      kind === "adv" ? { adverb: String(word) } : value ? { preposition: String(word), value } : undefined;
    if (!modifier) continue;
    const list = modifiersOf.get(String(eventId)) ?? [];
    list.push(modifier);
    modifiersOf.set(String(eventId), list);
  }

  const events: ParsedEvent[] = rows.events.map(([id, verb, args, sentence, token, modality]) => {
    const [subject, object, indirect] = (args as unknown[]).map(arg);
    const boxes = (modality as unknown[] | undefined)?.map(String) ?? [];
    const modifiers = modifiersOf.get(String(id));
    return {
      id: String(id),
      verb: String(verb),
      sentence: Number(sentence),
      range: rangeOf(Number(sentence), Number(token)),
      ...(subject ? { subject } : {}),
      ...(object ? { object } : {}),
      ...(indirect ? { indirect } : {}),
      ...(boxes.length ? { modality: boxes } : {}),
      ...(modifiers ? { modifiers } : {}),
    };
  });
  return { text, sentences, objects, events };
}
