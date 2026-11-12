import type { Diagnostic, ParsedText } from "./types.ts";
import type { FileMap, EntryMessage } from "./engine.ts";
import type { RawAnswer } from "./ask.ts";

/** Messages from the main thread to the worker. */
export type WorkerRequest =
  | { id: number; type: "init"; ape: FileMap; race?: FileMap }
  | { id: number; type: "lint"; text: string }
  | { id: number; type: "addEntries"; prologText: string }
  | { id: number; type: "ask"; text: string; question: string };

/** Messages from the worker back to the main thread. */
export type WorkerResponse =
  | { id: number; ok: true; type: "init" }
  | { id: number; ok: true; type: "lint"; diagnostics: Diagnostic[]; parsed: ParsedText }
  | { id: number; ok: true; type: "addEntries"; count: number; messages: EntryMessage[] }
  | { id: number; ok: true; type: "ask"; raw: RawAnswer }
  | { id: number; ok: false; error: string };
