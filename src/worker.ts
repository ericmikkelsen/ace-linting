// Runs APE off the main thread. Works as a browser Web Worker or a Node worker thread.
import { createEngine, type Engine, type SwiplFactory } from "./engine.ts";
import { GLUE } from "./glue.ts";
import type { WorkerRequest, WorkerResponse } from "./protocol.ts";

type Port = { post(msg: WorkerResponse): void; onMessage(cb: (msg: WorkerRequest) => void): void };

async function getPort(): Promise<Port> {
  if (typeof (globalThis as { WorkerGlobalScope?: unknown }).WorkerGlobalScope !== "undefined") {
    const scope = globalThis as unknown as { postMessage(m: unknown): void; onmessage: ((e: MessageEvent) => void) | null };
    return { post: (m) => scope.postMessage(m), onMessage: (cb) => { scope.onmessage = (e) => cb(e.data as WorkerRequest); } };
  }
  const { parentPort } = await import("node:worker_threads");
  if (!parentPort) throw new Error("worker.ts must run inside a worker");
  const p = parentPort;
  return { post: (m) => p.postMessage(m), onMessage: (cb) => { p.on("message", cb); } };
}

async function swiplFactory(): Promise<SwiplFactory> {
  const mod = await import("swipl-wasm");
  const SWIPL = (mod as { default: (opts: object) => Promise<unknown> }).default;
  return (() => SWIPL({ arguments: ["-q"], print: () => {}, printErr: () => {} })) as unknown as SwiplFactory;
}

const port = await getPort();
let engine: Engine | undefined;

port.onMessage(async (req) => {
  try {
    if (req.type === "init") {
      engine = await createEngine({ ape: req.ape, ...(req.race ? { race: req.race } : {}), glue: GLUE }, await swiplFactory());
      port.post({ id: req.id, ok: true, type: "init" });
    } else if (req.type === "lint") {
      if (!engine) throw new Error("worker not initialised");
      port.post({ id: req.id, ok: true, type: "lint", diagnostics: engine.lint(req.text) });
    } else if (req.type === "ask") {
      if (!engine) throw new Error("worker not initialised");
      port.post({ id: req.id, ok: true, type: "ask", raw: engine.ask(req.text, req.question) });
    } else if (req.type === "addEntries") {
      if (!engine) throw new Error("worker not initialised");
      const r = engine.addEntries(req.prologText);
      port.post({ id: req.id, ok: true, type: "addEntries", count: r.count, messages: r.messages });
    }
  } catch (e) {
    port.post({ id: req.id, ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});
