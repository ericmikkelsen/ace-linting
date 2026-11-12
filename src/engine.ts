// SPDX-License-Identifier: GPL-3.0-only
import type { ApeMessage, Diagnostic, ParsedText } from "./types.ts";
import { buildParsed } from "./parsed.ts";
import { toDiagnostics } from "./diagnostics.ts";
import { TIME_STUB } from "./glue.ts";
import type { RawAnswer } from "./ask.ts";

/** Files keyed by their path relative to the upstream folder (for APE: the contents of its `prolog/` folder). */
export type FileMap = Map<string, Uint8Array>;

export type EngineInput = {
  /** APE's `prolog/` folder, fetched from upstream (not shipped by us). */
  ape: FileMap;
  /** RACE's `prolog/` folder. Loaded on the first question; without it `ask` is unavailable. */
  race?: FileMap;
  /** Our own glue file (src/glue.ts). */
  glue: string;
};

/** The small part of swipl-wasm we use. */
export interface SwiplModule {
  FS: {
    mkdirTree(path: string): void;
    writeFile(path: string, data: Uint8Array | string): void;
  };
  prolog: {
    query(goal: string, bindings?: Record<string, unknown>): { once(): Record<string, unknown> & { success: boolean } };
  };
}
export type SwiplFactory = () => Promise<SwiplModule>;

export type EntryMessage = { severity: "error" | "warning"; message: string };

export type Engine = {
  lint(text: string): Diagnostic[];
  /** Diagnostics plus what APE understood (objects, events). */
  parse(text: string): { diagnostics: Diagnostic[]; parsed: ParsedText };
  /** Add APE lexicon terms (one per line, each ending in a period). Returns how many were read and any messages APE logged. */
  addEntries(prologText: string): { count: number; messages: EntryMessage[] };
  /** Remove APE lexicon terms from the user lexicon. Returns how many terms were read. */
  removeEntries(prologText: string): { count: number };
  /** Ask RACE. `text` and `question` must already be valid ACE. */
  ask(text: string, question: string): RawAnswer;
};

// RACE expects APE next to its own folder (../ape/ from /race/prolog), so both live under /race.
const APE_DIR = "/race/ape";
const RACE_DIR = "/race/prolog";

function writeFiles(swipl: SwiplModule, base: string, files: FileMap) {
  for (const [rel, bytes] of files) {
    const full = `${base}/${rel}`;
    swipl.FS.mkdirTree(full.split("/").slice(0, -1).join("/"));
    swipl.FS.writeFile(full, bytes);
  }
}

function toApeMessage(row: unknown[]): ApeMessage {
  const [importance, scope, sentence, token, subject, description] = row;
  const num = (v: unknown) => (typeof v === "number" ? v : null);
  return {
    importance: importance === "warning" ? "warning" : "error",
    scope: String(scope),
    sentence: num(sentence),
    token: num(token),
    subject: String(subject ?? ""),
    description: String(description ?? ""),
  };
}

/** Start APE inside a swipl-wasm runtime and return a synchronous lint function. */
export async function createEngine(input: EngineInput, factory: SwiplFactory): Promise<Engine> {
  const swipl = await factory();
  writeFiles(swipl, APE_DIR, input.ape);
  swipl.FS.mkdirTree("/ace/glue");
  swipl.FS.writeFile("/ace/glue/ace_glue.pl", input.glue);

  const run = (goal: string, bindings?: Record<string, unknown>) => swipl.prolog.query(goal, bindings).once();
  // Compile APE's grammar (about 0.2 s), then load the parser and our glue.
  if (!run(`working_directory(_, '${APE_DIR}/parser'), consult(fit_to_plp)`).success) throw new Error("APE grammar failed to compile");
  if (!run(`consult('${APE_DIR}/parser/ace_to_drs')`).success) throw new Error("APE failed to load");
  if (!run("consult('/ace/glue/ace_glue')").success) throw new Error("glue failed to load");

  const cache = new Map<string, { diagnostics: Diagnostic[]; parsed: ParsedText }>();
  let raceLoaded = false;
  const ensureRace = () => {
    if (raceLoaded) return;
    if (!input.race) throw new Error("RACE files were not provided (raceFiles or raceDir)");
    writeFiles(swipl, RACE_DIR, input.race);
    swipl.FS.writeFile("/race/time_stub.pl", TIME_STUB);
    if (!run("consult('/race/time_stub')").success) throw new Error("RACE time-limit stub failed to load");
    if (!run(`consult('${RACE_DIR}/race')`).success) throw new Error("RACE failed to load");
    raceLoaded = true;
  };
  const parse = (text: string) => {
    const hit = cache.get(text);
    if (hit) return hit;
    const r = run("ace_glue:lint_rows(Text, Messages, Tokens, Objects, Events, Properties, Modifiers)", { Text: text });
    if (!r.success) throw new Error("APE did not return a result");
    const messages = (r["Messages"] as unknown[][]).map(toApeMessage);
    const apeTokens = (r["Tokens"] as unknown[][]).map((s) => s.map(String));
    const result = {
      diagnostics: toDiagnostics(text, messages, { apeTokens }),
      parsed: buildParsed(text, { objects: r["Objects"] as unknown[][], events: r["Events"] as unknown[][], properties: r["Properties"] as unknown[][], modifiers: r["Modifiers"] as unknown[][] }, apeTokens),
    };
    cache.set(text, result);
    if (cache.size > 100) cache.delete(cache.keys().next().value as string);
    return result;
  };
  return {
    ask(text, question) {
      ensureRace();
      const r = run("ace_glue:ask_rows(Axioms, Query, Proofs, WhyNot, Messages)", { Axioms: text, Query: question });
      if (!r.success) throw new Error("RACE did not return a result");
      return {
        proofs: (r["Proofs"] as unknown[][]).map((lines) => lines.map(String)),
        whyNot: (r["WhyNot"] as unknown[]).map(String),
        messages: (r["Messages"] as unknown[]).map(String),
      };
    },
    removeEntries(prologText) {
      const r = run("ace_glue:remove_entries(Text, Count)", { Text: prologText });
      if (!r.success) throw new Error("APE could not remove the lexicon entries");
      cache.clear();
      return { count: Number(r["Count"]) };
    },
    addEntries(prologText) {
      const r = run("ace_glue:add_entries(Text, Count, Messages)", { Text: prologText });
      if (!r.success) throw new Error("APE rejected the lexicon entries");
      cache.clear(); // earlier results may no longer hold
      const messages = (r["Messages"] as unknown[][]).map((row) => {
        const m = toApeMessage(row);
        return { severity: m.importance, message: [m.subject, m.description].filter(Boolean).join(": ") };
      });
      return { count: Number(r["Count"]), messages };
    },
    lint: (text) => parse(text).diagnostics,
    parse,
  };
}
