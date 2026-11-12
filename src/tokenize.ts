import type { SentenceSpan, TokenSpan } from "./types.ts";

/**
 * Split text into ACE sentences, each ending with . ? or !
 * A period followed directly by a digit or letter (3.5, e.g.) does not end a sentence.
 * Quoted strings ("...") never end a sentence. Trailing text with no terminator is kept as a final sentence.
 * Ranges are character offsets into the original text, and exclude leading whitespace.
 */
export function splitSentences(text: string): SentenceSpan[] {
  const spans: SentenceSpan[] = [];
  let start = -1;
  let inQuote = false;
  const push = (end: number) => {
    spans.push({ index: spans.length + 1, text: text.slice(start, end), range: { start, end } });
    start = -1;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (start === -1) {
      if (/\s/.test(ch)) continue;
      start = i;
    }
    if (ch === '"') inQuote = !inQuote;
    else if (!inQuote && (ch === "." || ch === "?" || ch === "!")) {
      const next = text[i + 1];
      if (ch === "." && next !== undefined && /[\p{L}\p{N}]/u.test(next)) continue;
      push(i + 1);
    }
  }
  if (start !== -1) push(text.trimEnd().length);
  return spans;
}

/**
 * Tokenize one sentence the way APE numbers tokens: words and numbers are tokens, quoted strings are one token,
 * and each punctuation mark (including the final . ? !) is a token. Token 1 is the first word.
 * Ranges are character offsets into the sentence's own text.
 */
export function tokenizeSentence(sentence: string): TokenSpan[] {
  const tokens: TokenSpan[] = [];
  const re = /"[^"]*"|\d+(?:\.\d+)?|[\p{L}\p{N}_][\p{L}\p{N}_'-]*|[^\s]/gu;
  for (const m of sentence.matchAll(re)) {
    tokens.push({ text: m[0], range: { start: m.index, end: m.index + m[0].length } });
  }
  return tokens;
}
