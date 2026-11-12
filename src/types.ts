// SPDX-License-Identifier: GPL-3.0-only
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

/** A sentence that took part in a proof: one of the user's own, or a synonym rule. */
export type ProofAxiom = {
  /** 1-based sentence number in the text passed to `ask`; 0 for a line that came from a synonym rule. */
  sentence: number;
  text: string;
  /** Set when this line is a compiled synonym rule rather than one of the user's sentences. */
  synonym?: SynonymRule;
};

/**
 * Two words the user says mean the same thing, compiled into an ACE sentence that appears in proofs.
 * `from => to` (add `both: true` for the reverse too). Verbs need a valency because the sentence shapes differ.
 */
export type SynonymRule =
  | { class: "noun" | "adjective"; from: string; to: string; both?: boolean }
  | {
      class: "verb";
      valency: "intransitive" | "transitive" | "ditransitive";
      from: string;
      to: string;
      both?: boolean;
      /** Third-person singular forms when they are not regular ("has"). */
      fromSg3?: string;
      toSg3?: string;
      /** Ditransitive only: the preposition each verb takes before the third argument. Default "to". */
      fromPrep?: string;
      toPrep?: string;
    }
  /** An adverb means the same as another one when it modifies this verb. It cannot be stated for every verb at once. */
  | { class: "adverb"; verb: string; valency: "intransitive" | "transitive"; from: string; to: string; both?: boolean; verbSg3?: string };

/** What a question word stood for in a proof, e.g. `who = John`. */
export type Substitution = { word: string; value: string };

export type Proof = { axioms: ProofAxiom[]; substitutions: Substitution[] };

/** A word of the question that RACE could not match, e.g. `{ wordClass: "adjective", word: "happy" }`. */
export type Unmatched = { wordClass: string; word: string };

export type AskResult =
  | { status: "answered"; answers: Substitution[]; proofs: Proof[]; messages: string[] }
  /** Nothing can be proved from the text. This never means "no". */
  | { status: "unknown"; unmatched: Unmatched[]; messages: string[]; suggestions: Suggestion[] }
  /** The text or the question is not valid ACE. */
  | { status: "invalid"; text: Diagnostic[]; question: Diagnostic[] }
  | { status: "timeout" };

/** An argument of an event: a noun phrase from the text, a proper name, or an adjective ("is happy"). */
export type ParsedObject = { kind: "object"; id: string; noun: string; sentence: number; range: Range };
export type ParsedProperty = { kind: "property"; id: string; adjective: string; sentence: number; range: Range };
export type ParsedArg = ParsedObject | ParsedProperty | { kind: "name"; name: string } | { kind: "string"; value: string };

/** One verb with its arguments. `range` is the verb token; for "be" the object can be a property. */
export type ParsedEvent = {
  /** The event's discourse referent, shared by its modifiers. */
  id: string;
  verb: string;
  sentence: number;
  range: Range;
  subject?: ParsedArg;
  object?: ParsedArg;
  indirect?: ParsedArg;
  /**
   * The boxes the event sits in, outermost first: "must", "can", "should", "may", "not", "naf", "question",
   * "command", "if", "then", "or". Absent for a plain fact. "I must finish a report." is ["must"].
   */
  modality?: string[];
  /** Prepositional phrases and adverbs on the event: "before \"2026-11-13\"" is { preposition: "before", value: { kind: "string", ... } }. */
  modifiers?: ParsedModifier[];
};

export type ParsedModifier = { preposition: string; value: ParsedArg } | { adverb: string };

/**
 * What APE understood. Pronouns and "the X" are already resolved, so an event's subject can be an object
 * introduced in an earlier sentence (same `id`, with that sentence's range).
 */
export type ParsedText = { text: string; sentences: SentenceSpan[]; objects: ParsedObject[]; events: ParsedEvent[] };

/**
 * A plugin adds diagnostics after APE has parsed a text. It cannot change or remove APE's own diagnostics.
 * Returned diagnostics get the plugin's name as a code prefix ("types/subject") unless they already have it.
 */
export type Plugin = {
  name: string;
  afterParse?(parsed: ParsedText): Diagnostic[] | void | Promise<Diagnostic[] | void>;
};

/**
 * A synonym that appears in the text for a word of the question that RACE could not match.
 * Accepting it means calling `ace.synonyms.add(suggestion.rule)`.
 */
export type Suggestion = {
  /** The word from the question. */
  word: string;
  /** The word from the text that may mean the same. */
  replacement: string;
  /** WordNet's definition of the sense, so the user can tell senses apart. */
  gloss: string;
  rule: SynonymRule;
};
