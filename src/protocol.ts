import type { Diagnostic } from "./types.ts";
import type { FileMap, EntryMessage } from "./engine.ts";

/** Messages from the main thread to the worker. */
export type WorkerRequest =
  | { id: number; type: "init"; ape: FileMap }
  | { id: number; type: "lint"; text: string }
  | { id: number; type: "addEntries"; prologText: string };

/** Messages from the worker back to the main thread. */
export type WorkerResponse =
  | { id: number; ok: true; type: "init" }
  | { id: number; ok: true; type: "lint"; diagnostics: Diagnostic[] }
  | { id: number; ok: true; type: "addEntries"; count: number; messages: EntryMessage[] }
  | { id: number; ok: false; error: string };
