import type { Diagnostic } from "./types.ts";
import type { FileMap } from "./engine.ts";
import type { WorkerRequest, WorkerResponse } from "./protocol.ts";
import { readTree } from "./node.ts";
import { toApeLines, checkEntry, type LexEntry } from "./lexicon.ts";
import type { EntryMessage } from "./engine.ts";

export type { Diagnostic, DiagnosticCode, Range, Severity, ApeMessage } from "./types.ts";
export type { FileMap } from "./engine.ts";
export { debounce } from "./debounce.ts";
export type { LexEntry, Gender, Valency } from "./lexicon.ts";
export { parseEntries, toApeLines, templatesFor, LexiconError } from "./lexicon.ts";
export type { EntryMessage } from "./engine.ts";

export type AceOptions = {
  /** APE's `prolog/` files, keyed by relative path. Fetched from upstream by the fetch-and-verify step. */
  apeFiles?: FileMap;
  /** Node only: path to a local APE checkout's `prolog/` folder (development). */
  apeDir?: string;
  /** Lexicon entries to load at start. */
  lexicon?: LexEntry[];
};

export type LintResult = { diagnostics: Diagnostic[] };
export type CallOptions = { signal?: AbortSignal };

export type AddResult = { count: number; messages: EntryMessage[] };

export type Ace = {
  lint(text: string, options?: CallOptions): Promise<LintResult>;
  /** Add lexicon entries. APE's own conflict warnings (word defined twice, function-word redefinition) come back in `messages`. */
  addEntries(entries: LexEntry[]): Promise<AddResult>;
  /** Stop the worker. Pending calls reject. */
  dispose(): Promise<void>;
};

type WithoutId<T> = T extends unknown ? Omit<T, "id"> : never;

export class AceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AceError";
  }
}

// What a worker looks like to us, in Node and in browsers.
type WorkerLike = {
  post(msg: WorkerRequest): void;
  onMessage(cb: (msg: WorkerResponse) => void): void;
  onError(cb: (err: Error) => void): void;
  terminate(): Promise<void>;
};

async function startWorker(): Promise<WorkerLike> {
  const isSource = import.meta.url.endsWith(".ts");
  const url = new URL(isSource ? "./worker.ts" : "./worker.js", import.meta.url);
  if (typeof (globalThis as { Worker?: unknown }).Worker !== "undefined" && typeof (globalThis as { window?: unknown }).window !== "undefined") {
    const w = new Worker(url, { type: "module" });
    return {
      post: (m) => w.postMessage(m),
      onMessage: (cb) => { w.onmessage = (e) => cb(e.data as WorkerResponse); },
      onError: (cb) => { w.onerror = (e) => cb(new Error(e.message)); },
      terminate: async () => { w.terminate(); },
    };
  }
  const { Worker: NodeWorker } = await import("node:worker_threads");
  const w = new NodeWorker(url);
  return {
    post: (m) => w.postMessage(m),
    onMessage: (cb) => { w.on("message", cb); },
    onError: (cb) => { w.on("error", cb); },
    terminate: async () => { await w.terminate(); },
  };
}

const SEVERITIES = new Set(["error", "warning"]);
function assertDiagnostics(value: unknown): asserts value is Diagnostic[] {
  const ok =
    Array.isArray(value) &&
    value.every(
      (d) =>
        d &&
        SEVERITIES.has(d.severity) &&
        typeof d.code === "string" &&
        typeof d.message === "string" &&
        Number.isInteger(d.sentence) &&
        Number.isInteger(d.range?.start) &&
        Number.isInteger(d.range?.end) &&
        d.range.start <= d.range.end,
    );
  if (!ok) throw new AceError("worker returned malformed diagnostics");
}

export async function createAce(options: AceOptions = {}): Promise<Ace> {
  const ape = options.apeFiles ?? (options.apeDir ? readTree(options.apeDir) : undefined);
  if (!ape) throw new AceError("createAce needs apeFiles or apeDir (APE's prolog/ files)");

  const worker = await startWorker();
  let nextId = 1;
  let disposed = false;
  const pending = new Map<number, { resolve: (r: WorkerResponse) => void; reject: (e: Error) => void }>();

  const failAll = (err: Error) => {
    for (const p of pending.values()) p.reject(err);
    pending.clear();
  };
  worker.onMessage((msg) => {
    const p = pending.get(msg.id);
    if (!p) return; // aborted or disposed
    pending.delete(msg.id);
    p.resolve(msg);
  });
  worker.onError((err) => failAll(new AceError(`worker crashed: ${err.message}`)));

  const call = (req: WithoutId<WorkerRequest>, signal?: AbortSignal): Promise<WorkerResponse> => {
    if (disposed) return Promise.reject(new AceError("Ace instance is disposed"));
    if (signal?.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
    const id = nextId++;
    return new Promise<WorkerResponse>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      signal?.addEventListener("abort", () => {
        if (pending.delete(id)) reject(new DOMException("Aborted", "AbortError"));
      }, { once: true });
      worker.post({ ...req, id } as WorkerRequest);
    });
  };

  const init = await call({ type: "init", ape });
  if (!init.ok) {
    await worker.terminate();
    throw new AceError(`could not start APE: ${init.error}`);
  }

  const addEntries = async (entries: LexEntry[]): Promise<AddResult> => {
    const prologText = entries.map((e) => toApeLines(checkEntry(e)).join("\n")).join("\n");
    const res = await call({ type: "addEntries", prologText });
    if (!res.ok) throw new AceError(res.error);
    if (res.type !== "addEntries") throw new AceError("unexpected worker response");
    return { count: res.count, messages: res.messages };
  };
  if (options.lexicon?.length) await addEntries(options.lexicon);

  return {
    addEntries,
    async lint(text, opts = {}) {
      const res = await call({ type: "lint", text }, opts.signal);
      if (!res.ok) throw new AceError(res.error);
      if (res.type !== "lint") throw new AceError("unexpected worker response");
      assertDiagnostics(res.diagnostics);
      return { diagnostics: res.diagnostics };
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      failAll(new AceError("Ace instance is disposed"));
      await worker.terminate();
    },
  };
}
