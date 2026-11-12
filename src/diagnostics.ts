// SPDX-License-Identifier: GPL-3.0-only
import type { ApeMessage, Diagnostic, Range, SentenceSpan, TokenSpan } from "./types.ts";
import { splitSentences, tokenizeSentence } from "./tokenize.ts";
import { describeTense, TENSE_ADVICE } from "./tense.ts";

/** Tokens of one sentence as APE reports them (APE's list starts with a '^' marker, which callers should drop). */
export type ApeSentenceTokens = string[];

export type MapOptions = {
  /** APE's own token lists per sentence, used to cross-check our tokenizer. If a sentence disagrees, we fall back to whole-sentence ranges for it. */
  apeTokens?: ApeSentenceTokens[];
};

function whole(sentence: SentenceSpan | undefined, text: string): Range {
  return sentence ? sentence.range : { start: 0, end: text.length };
}

export function shift(sentence: SentenceSpan, token: TokenSpan): Range {
  return { start: sentence.range.start + token.range.start, end: sentence.range.start + token.range.end };
}

export function agrees(ours: TokenSpan[], theirs: ApeSentenceTokens | undefined): boolean {
  if (!theirs) return true; // nothing to check against
  if (ours.length !== theirs.length) return false;
  return ours.every((t, i) => t.text.toLowerCase() === String(theirs[i]).toLowerCase());
}

/** Convert APE messages into diagnostics with character ranges into `text`. */
export function toDiagnostics(text: string, messages: ApeMessage[], options: MapOptions = {}): Diagnostic[] {
  const sentences = splitSentences(text);
  const tokenCache = new Map<number, TokenSpan[]>();
  const tokensOf = (s: SentenceSpan) => {
    let t = tokenCache.get(s.index);
    if (!t) tokenCache.set(s.index, (t = tokenizeSentence(s.text)));
    return t;
  };

  const out: Diagnostic[] = [];
  const hinted = new Set<string>(); // ranges already explained as a tense
  for (const m of messages) {
    const sentence = m.sentence !== null ? sentences[m.sentence - 1] : undefined;
    const base = {
      severity: m.importance,
      code: `ape/${m.scope}`,
      sentence: sentence ? sentence.index : 0,
    } as const;
    // APE accepts an unknown capitalized word as a proper name and only warns; say that, not "unknown word".
    const asName = m.scope === "word" && /Interpreted as an? .*proper name/.test(m.description);
    const suggestion = asName
      ? "If this is a common word, write it in lowercase and add it to the lexicon."
      : m.scope === "word" ? m.description || undefined : undefined;

    const fallback = (message: string): Diagnostic => ({
      ...base,
      message,
      range: whole(sentence, text),
      ...(suggestion ? { suggestion } : {}),
      approximate: true,
    });

    if (!sentence) {
      out.push(fallback(m.subject || m.description));
      continue;
    }
    const tokens = tokensOf(sentence);
    const trusted = agrees(tokens, options.apeTokens?.[sentence.index - 1]);

    if (m.scope === "word") {
      // APE gives the word but no token number: underline every occurrence in the sentence.
      const word = m.subject.toLowerCase();
      const hits = tokens.filter((t) => t.text.toLowerCase() === word);
      const message = asName ? `'${m.subject}' is not in the lexicon, so it is treated as a proper name.` : `Unknown or unsupported word '${m.subject}'.`;
      if (!trusted || hits.length === 0) out.push(fallback(message));
      else for (const t of hits) {
        const range = shift(sentence, t);
        const tense = describeTense(t.text, tokens[tokens.indexOf(t) - 1]?.text);
        if (tense) {
          const apeHint = /^Use the prefix/.test(m.description) ? ` If it is not a verb form: ${m.description}` : "";
          hinted.add(`${range.start}-${range.end}`);
          out.push({ ...base, message: tense.message, range, suggestion: `${TENSE_ADVICE}${apeHint}` });
        } else out.push({ ...base, message, range, ...(suggestion ? { suggestion } : {}) });
      }
      continue;
    }

    if (m.token === null) {
      out.push(fallback(m.subject || m.description));
      continue;
    }
    // What APE puts in `subject` and `description` depends on the scope.
    const message =
      m.scope === "sentence" ? "This is not valid ACE at or after this point." : m.subject || m.description;
    const hint = m.scope === "anaphor" || m.scope === "pronoun" ? m.description : undefined;
    if (!trusted) {
      out.push({ ...fallback(message), ...(hint ? { suggestion: hint } : {}) });
      continue;
    }
    // APE can report the position just past the last token (something is missing): point at the last token.
    const token = tokens[Math.min(m.token, tokens.length) - 1];
    if (!token) {
      out.push({ ...fallback(message), ...(hint ? { suggestion: hint } : {}) });
      continue;
    }
    const range = shift(sentence, token);
    if (m.scope === "sentence") {
      const at = tokens.indexOf(token);
      // APE reads "has bought" as "has" plus a noun and stops at the next word, so also look one word back for a
      // helper plus participle ("has bought", "is buying").
      const back = tokens[at - 1];
      const earlier = back ? describeTense(back.text, tokens[at - 2]?.text) : undefined;
      const here = describeTense(token.text, tokens[at - 1]?.text);
      const found = here ? { tense: here, at: token } : earlier && (earlier.kind === "perfect" || earlier.kind === "progressive") && back ? { tense: earlier, at: back } : undefined;
      if (found) {
        const r = shift(sentence, found.at);
        hinted.add(`${r.start}-${r.end}`);
        out.push({ ...base, message: found.tense.message, range: r, suggestion: TENSE_ADVICE });
        continue;
      }
      // the generic "not valid ACE here" adds nothing when a tense explanation already points at the same word
      if (hinted.has(`${range.start}-${range.end}`)) continue;
    }
    out.push({ ...base, message, range, ...(hint ? { suggestion: hint } : {}) });
  }
  return out;
}
