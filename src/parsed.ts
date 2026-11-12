import type { ParsedArg, ParsedEvent, ParsedObject, ParsedProperty, ParsedText, Range, SentenceSpan, TokenSpan } from "./types.ts";
import { splitSentences, tokenizeSentence } from "./tokenize.ts";
import { agrees, shift } from "./diagnostics.ts";

/** Rows as the Prolog glue returns them (see `lint_rows` in glue.ts). */
export type FactRows = { objects: unknown[][]; events: unknown[][]; properties: unknown[][] };

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
    return key.startsWith("n:") ? { kind: "name", name: key.slice(2) } : byId.get(key);
  };

  const events: ParsedEvent[] = rows.events.map(([verb, args, sentence, token]) => {
    const [subject, object, indirect] = (args as unknown[]).map(arg);
    return {
      verb: String(verb),
      sentence: Number(sentence),
      range: rangeOf(Number(sentence), Number(token)),
      ...(subject ? { subject } : {}),
      ...(object ? { object } : {}),
      ...(indirect ? { indirect } : {}),
    };
  });
  return { text, sentences, objects, events };
}
