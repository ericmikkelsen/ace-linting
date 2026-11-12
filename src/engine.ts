import type { ApeMessage, Diagnostic } from "./types.ts";
import { toDiagnostics } from "./diagnostics.ts";

/** Files keyed by their path relative to the upstream folder (for APE: the contents of its `prolog/` folder). */
export type FileMap = Map<string, Uint8Array>;

export type EngineInput = {
  /** APE's `prolog/` folder, fetched from upstream (not shipped by us). */
  ape: FileMap;
  /** Our own glue file (`prolog/ace_glue.pl`). */
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
  /** Add APE lexicon terms (one per line, each ending in a period). Returns how many were read and any messages APE logged. */
  addEntries(prologText: string): { count: number; messages: EntryMessage[] };
};

const APE_DIR = "/ace/ape";

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

  const cache = new Map<string, Diagnostic[]>();
  return {
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
    lint(text) {
      const hit = cache.get(text);
      if (hit) return hit;
      const r = run("ace_glue:lint_rows(Text, Messages, Tokens)", { Text: text });
      if (!r.success) throw new Error("APE did not return a result");
      const messages = (r["Messages"] as unknown[][]).map(toApeMessage);
      const apeTokens = (r["Tokens"] as unknown[][]).map((s) => s.map(String));
      const diagnostics = toDiagnostics(text, messages, { apeTokens });
      cache.set(text, diagnostics);
      if (cache.size > 100) cache.delete(cache.keys().next().value as string);
      return diagnostics;
    },
  };
}
