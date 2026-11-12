// Public output types for ace-linting. Everything that crosses the worker boundary is one of these.

/** A half-open character range into the original text: text.slice(start, end). */
export type Range = { start: number; end: number };

export type Severity = "error" | "warning";

/** The kinds of message APE produces, plus codes we add ourselves. */
export type DiagnosticCode =
  | "ape/character"
  | "ape/word"
  | "ape/sentence"
  | "ape/anaphor"
  | "ape/pronoun"
  | "ace-linting/unmapped"
  | (string & {}); // plugin codes, e.g. "types/subject-type"

export type Diagnostic = {
  severity: Severity;
  code: DiagnosticCode;
  message: string;
  range: Range;
  /** 1-based sentence number, or 0 when the message is not tied to a sentence. */
  sentence: number;
  suggestion?: string;
  /** True when we could not map the message to a specific token and underlined the whole sentence instead. */
  approximate?: boolean;
};

/** A message as APE reports it, already converted from the Prolog term message(Importance, Scope, Sentence-Token, Subject, Description). */
export type ApeMessage = {
  importance: Severity;
  scope: "character" | "word" | "sentence" | "anaphor" | "pronoun" | (string & {});
  /** 1-based sentence number, or null when APE gave none. */
  sentence: number | null;
  /** 1-based token number within the sentence (first word is 1), or null when APE gave none. */
  token: number | null;
  subject: string;
  description: string;
};

export type SentenceSpan = { index: number; text: string; range: Range };

export type TokenSpan = { text: string; range: Range };
