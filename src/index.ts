// SPDX-License-Identifier: GPL-3.0-only
import type { AskResult, Diagnostic, ParsedText, Plugin, SynonymRule } from "./types.ts";
import type { FileMap } from "./engine.ts";
import type { WorkerRequest, WorkerResponse } from "./protocol.ts";
import { loadUpstream, webFetch, memoryStore, type Store } from "./upstream.ts";
import { idbStore } from "./idb-store.ts";
import { BROWSER_BUILD } from "./env.ts";
import { UPSTREAM } from "./upstream-manifest.ts";
import { toApeLines, checkEntry, templatesFor, entryKey, matchesRef, sameEntry, formsOf, warnedWord, type LexEntry, type LexRef, type LexiconChange } from "./lexicon.ts";
import { splitSentences } from "./tokenize.ts";
import { selectRelevant, contentStems, stem } from "./select.ts";
import { compileRule, ruleKey, SynonymError } from "./synonyms.ts";
import { suggest } from "./suggest.ts";
import type { SynonymIndex } from "./synonym-index.ts";
import { toAskResult } from "./ask.ts";
import type { EntryMessage } from "./engine.ts";

export type { Diagnostic, DiagnosticCode, Range, Severity, ApeMessage, AskResult, Proof, ProofAxiom, Substitution, Unmatched, ParsedText, ParsedEvent, ParsedArg, ParsedObject, ParsedProperty, Plugin, SynonymRule, Suggestion } from "./types.ts";
export { buildIndex, type SynonymIndex, type RawSynset } from "./synonym-index.ts";
export { suggest } from "./suggest.ts";
export { typeCheck, type TypeSchema } from "./plugins/types.ts";
export type { FileMap } from "./engine.ts";
export { debounce } from "./debounce.ts";
export { DEFAULT_BASE_URLS, UpstreamError, loadUpstream, type UpstreamManifest } from "./upstream.ts";
export type { LexEntry, Gender, Valency, LexRef, LexiconChange } from "./lexicon.ts";
export { parseEntries, toApeLines, templatesFor, LexiconError } from "./lexicon.ts";
export type { EntryMessage } from "./engine.ts";

// Node-only helpers (file system) are loaded on demand so browser bundles never pull in node:fs.
const nodeHelpers = (): Promise<typeof import("./node.ts")> =>
  BROWSER_BUILD ? Promise.reject(new Error("Node helpers are not available in the browser build")) : import("./node.ts");
const inNode = () => !BROWSER_BUILD && typeof process !== "undefined" && !!process.versions?.node;

export type AceOptions = {
  /** APE's `prolog/` files, keyed by relative path. When neither this nor `apeDir` is given, the pinned upstream is fetched and verified. */
  apeFiles?: FileMap;
  /** Where the pinned upstream files come from and where verified copies are kept. Used only when no local files are given. */
  upstream?: {
    /** Node: folder for verified files (default `~/.cache/ace-linting`, or `$ACE_LINTING_CACHE`). */
    cacheDir?: string;
    /** URL templates tried in order; see DEFAULT_BASE_URLS. */
    baseUrls?: string[];
  };
  /** Node only: path to a local APE checkout's `prolog/` folder (development). */
  apeDir?: string;
  /** RACE's `prolog/` files. Needed for `ask`. Fetched from upstream by the fetch-and-verify step. */
  raceFiles?: FileMap;
  /** Node only: path to a local RACE checkout's `prolog/` folder (development). */
  raceDir?: string;
  /** Lexicon entries to load at start. */
  lexicon?: LexEntry[];
  /**
   * WordNet synonym sets, used to suggest synonym rules when a question comes back unknown. Give the index or a function
   * that loads it; the function is called once, on the first unknown answer. Without it, `suggestions` is empty.
   */
  synonymIndex?: SynonymIndex | (() => Promise<SynonymIndex>);
};

export type AskOptions = {
  /** The notes, as ACE sentences. */
  text: string;
  /** One ACE question. */
  question: string;
  /** Give up after this many milliseconds (default 5000). The worker is restarted and the result is `timeout`. */
  timeoutMs?: number;
  /**
   * Choose which sentences (0-based indices) to try first. The default narrows long texts to sentences related to the
   * question and tries everything when that finds nothing. Whatever you return, `ask` retries with all sentences before
   * answering "unknown".
   */
  select?: (sentences: string[], question: string) => number[];
};

export type LintResult = { diagnostics: Diagnostic[] };
export type CallOptions = { signal?: AbortSignal };

export type AddResult = { count: number; messages: EntryMessage[] };

export type Ace = {
  /** APE's diagnostics plus those added by plugins. */
  lint(text: string, options?: CallOptions): Promise<LintResult>;
  /** What APE understood: objects and events with character ranges and resolved pronouns. */
  parse(text: string, options?: CallOptions): Promise<ParsedText>;
  /**
   * Add a plugin. Its diagnostics are added to APE's on every `lint`; it cannot change or remove APE's.
   * Returns a function that removes it. Two plugins cannot share a name.
   */
  use(plugin: Plugin): () => void;
  /**
   * Synonym rules the user owns. Each compiles to an ACE sentence that is appended to the text for `ask`
   * (when its words matter to the question), so it shows up in the proof. Nothing is inferred silently.
   */
  synonyms: {
    /** Checks the rule's words with APE first; rejects with the reason when they are not valid ACE. */
    add(rule: SynonymRule): Promise<void>;
    remove(rule: SynonymRule): void;
    list(): SynonymRule[];
  };
  /**
   * Answer a question from the text with RACE. Invalid ACE is reported as `invalid` with diagnostics;
   * a question that cannot be proved is `unknown`, never "no".
   */
  ask(options: AskOptions): Promise<AskResult>;
  /**
   * The user's words. `add` checks each entry (conflicts with function words or other classes, parsing in sample sentences)
   * and keeps only what is safe; `remove` takes words out again; `list` shows what is in. APE's built-in words cannot be removed:
   * an entry for a word it already knows adds forms next to the built-in ones.
   */
  lexicon: {
    add(entries: LexEntry | LexEntry[], options?: { validate?: boolean }): Promise<LexiconChange>;
    remove(refs: LexRef | LexRef[]): Promise<{ removed: LexEntry[] }>;
    list(): LexEntry[];
  };
  /** Add lexicon entries without any checking (the fast path for a large trusted list). Prefer `lexicon.add`. APE's own conflict warnings (word defined twice, function-word redefinition) come back in `messages`. */
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
  if (typeof (globalThis as { Worker?: unknown }).Worker !== "undefined" && typeof (globalThis as { window?: unknown }).window !== "undefined") {
    // Browser. This exact `new Worker(new URL(...))` form is what bundlers such as Vite recognise and build the worker from.
    const w = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    return {
      post: (m) => w.postMessage(m),
      onMessage: (cb) => { w.onmessage = (e) => cb(e.data as WorkerResponse); },
      onError: (cb) => { w.onerror = (e) => cb(new Error(e.message)); },
      terminate: async () => { w.terminate(); },
    };
  }
  if (BROWSER_BUILD) throw new AceError("Web Workers are not available here");
  const isSource = import.meta.url.endsWith(".ts");
  const url = new URL(isSource ? "./worker.ts" : "./worker.js", import.meta.url);
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

/** Verified upstream files persist in IndexedDB when the browser has it, and live in memory otherwise. */
function browserStore(): Store {
  return typeof indexedDB !== "undefined" ? idbStore() : memoryStore();
}

class CallTimeout extends Error {}

/** Above this many sentences, `ask` first tries only the sentences related to the question. */
const SELECT_ABOVE = 20;

export async function createAce(options: AceOptions = {}): Promise<Ace> {
  let ape = options.apeFiles ?? (options.apeDir ? (await nodeHelpers()).readTree(options.apeDir) : undefined);
  let race = options.raceFiles ?? (options.raceDir ? (await nodeHelpers()).readTree(options.raceDir) : undefined);
  if (!ape) {
    // No local files: fetch the pinned upstream, checking every file against its recorded hash.
    const node = inNode() ? await nodeHelpers() : undefined;
    const fetched = await loadUpstream(UPSTREAM, {
      fetch: webFetch,
      store: node ? node.fileStore(options.upstream?.cacheDir ?? node.defaultCacheDir()) : browserStore(),
      ...(options.upstream?.baseUrls ? { baseUrls: options.upstream.baseUrls } : {}),
    }).catch((e: unknown) => { throw new AceError(`could not get APE and RACE: ${e instanceof Error ? e.message : String(e)}`); });
    ape = fetched.ape;
    race ??= fetched.race;
  }

  let worker!: WorkerLike;
  let nextId = 1;
  let disposed = false;
  const pending = new Map<number, { resolve: (r: WorkerResponse) => void; reject: (e: Error) => void }>();
  /** The user's lexicon as it stands now, replayed into a fresh worker after a restart. */
  const lexicon = new Map<string, LexEntry>();
  const textOf = (entries: LexEntry[]) => entries.map((e) => toApeLines(e).join("\n")).join("\n");

  const failAll = (err: Error) => {
    for (const p of pending.values()) p.reject(err);
    pending.clear();
  };

  const start = async () => {
    const w = await startWorker();
    worker = w;
    w.onMessage((msg) => {
      if (worker !== w) return; // from a worker we already replaced
      const p = pending.get(msg.id);
      if (!p) return; // aborted or disposed
      pending.delete(msg.id);
      p.resolve(msg);
    });
    w.onError((err) => { if (worker === w) failAll(new AceError(`worker crashed: ${err.message}`)); });
  };

  const call = (req: WithoutId<WorkerRequest>, opts: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<WorkerResponse> => {
    if (disposed) return Promise.reject(new AceError("Ace instance is disposed"));
    if (opts.signal?.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
    const id = nextId++;
    return new Promise<WorkerResponse>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const done = <T>(fn: (v: T) => void) => (v: T) => { if (timer) clearTimeout(timer); fn(v); };
      pending.set(id, { resolve: done(resolve), reject: done(reject) });
      opts.signal?.addEventListener("abort", () => {
        if (pending.delete(id)) done(reject)(new DOMException("Aborted", "AbortError"));
      }, { once: true });
      if (opts.timeoutMs !== undefined) {
        timer = setTimeout(() => { if (pending.delete(id)) reject(new CallTimeout()); }, opts.timeoutMs);
      }
      worker.post({ ...req, id } as WorkerRequest);
    });
  };

  const initWorker = async () => {
    const init = await call({ type: "init", ape, ...(race ? { race } : {}) });
    if (!init.ok) throw new AceError(`could not start APE: ${init.error}`);
    if (lexicon.size) {
      const res = await call({ type: "addEntries", prologText: textOf([...lexicon.values()]) });
      if (!res.ok) throw new AceError(`could not restore the lexicon: ${res.error}`);
    }
  };

  /** Throw away the worker (it may be stuck) and start a fresh one with the same lexicon. */
  const restart = async () => {
    const old = worker;
    failAll(new AceError("worker restarted after a timeout"));
    await old.terminate();
    await start();
    await initWorker();
  };

  await start();
  try {
    await initWorker();
  } catch (e) {
    await worker.terminate();
    throw e;
  }

  const workerAdd = async (entries: LexEntry[]): Promise<AddResult> => {
    const res = await call({ type: "addEntries", prologText: textOf(entries) });
    if (!res.ok) throw new AceError(res.error);
    if (res.type !== "addEntries") throw new AceError("unexpected worker response");
    return { count: res.count, messages: res.messages };
  };
  const workerRemove = async (entries: LexEntry[]) => {
    if (!entries.length) return;
    const res = await call({ type: "removeEntries", prologText: textOf(entries) });
    if (!res.ok) throw new AceError(res.error);
  };

  /** The fast path for a large trusted list: no conflict handling, no sample sentences. */
  const addEntries = async (entries: LexEntry[]): Promise<AddResult> => {
    const checked = entries.map((e) => checkEntry(e));
    const result = await workerAdd(checked);
    for (const e of checked) lexicon.set(entryKey(e), e);
    return result;
  };
  if (options.lexicon?.length) await addEntries(options.lexicon);

  const fromWorker = async (text: string, opts: CallOptions) => {
    const res = await call({ type: "lint", text }, opts);
    if (!res.ok) throw new AceError(res.error);
    if (res.type !== "lint") throw new AceError("unexpected worker response");
    assertDiagnostics(res.diagnostics);
    return res;
  };

  const plugins = new Map<string, Plugin>();
  const pluginProblem = (text: string, message: string): Diagnostic => ({
    severity: "warning", code: "ace-linting/plugin-error", message, range: { start: 0, end: text.length }, sentence: 0, approximate: true,
  });
  const runPlugins = async (parsed: ParsedText): Promise<Diagnostic[]> => {
    const out: Diagnostic[] = [];
    for (const plugin of [...plugins.values()]) {
      if (!plugin.afterParse) continue;
      try {
        const added = (await plugin.afterParse(parsed)) ?? [];
        assertDiagnostics(added);
        if (added.some((d) => d.range.end > parsed.text.length)) throw new AceError("a diagnostic range is outside the text");
        for (const d of added) out.push({ ...d, code: d.code.startsWith(`${plugin.name}/`) ? d.code : `${plugin.name}/${d.code}` });
      } catch (e) {
        out.push(pluginProblem(parsed.text, `Plugin '${plugin.name}' failed: ${e instanceof Error ? e.message : String(e)}`));
      }
    }
    return out;
  };

  const lint = async (text: string, opts: CallOptions = {}): Promise<LintResult> => {
    const res = await fromWorker(text, opts);
    return { diagnostics: [...res.diagnostics, ...(await runPlugins(res.parsed))] };
  };

  const hasErrors = (ds: Diagnostic[]) => ds.some((d) => d.severity === "error");

  /** One RACE call with a deadline. Returns undefined on timeout (after restarting the worker). */
  const askOnce = async (text: string, question: string, sentenceMap: (number | SynonymRule)[], timeoutMs: number) => {
    try {
      const res = await call({ type: "ask", text, question }, { timeoutMs });
      if (!res.ok) throw new AceError(res.error);
      if (res.type !== "ask") throw new AceError("unexpected worker response");
      return toAskResult(res.raw, sentenceMap);
    } catch (e) {
      if (!(e instanceof CallTimeout)) throw e;
      await restart();
      return undefined;
    }
  };

  let indexPromise: Promise<SynonymIndex> | undefined;
  const getIndex = () => {
    const src = options.synonymIndex;
    if (!src) return undefined;
    return (indexPromise ??= Promise.resolve(typeof src === "function" ? src() : src));
  };
  const rules = new Map<string, SynonymRule>();
  const addRule = async (rule: SynonymRule) => {
    let sentences: string[];
    try {
      sentences = compileRule(rule);
    } catch (e) {
      throw new AceError(e instanceof SynonymError ? e.message : String(e));
    }
    for (const sentence of sentences) {
      const { diagnostics } = await fromWorker(sentence, {});
      const errors = diagnostics.filter((d) => d.severity === "error");
      if (errors.length) {
        const words = errors.filter((d) => d.code === "ape/word").map((d) => `'${sentence.slice(d.range.start, d.range.end)}'`);
        throw new AceError(`the rule ${rule.from} => ${rule.to} is not valid ACE (${sentence})${words.length ? `: unknown ${[...new Set(words)].join(", ")}` : ""}`);
      }
    }
    rules.set(ruleKey(rule), rule);
  };
  /** The rule sentences that matter given what is being asked, following chains (A=>B, B=>C) to a fixed point. */
  const relevantRules = (textAndQuestion: string): { sentence: string; rule: SynonymRule }[] => {
    const known = contentStems(textAndQuestion);
    const chosen = new Set<SynonymRule>();
    for (let grew = true; grew; ) {
      grew = false;
      for (const rule of rules.values()) {
        if (chosen.has(rule)) continue;
        if (known.has(stem(rule.from)) || known.has(stem(rule.to))) {
          chosen.add(rule);
          known.add(stem(rule.from));
          known.add(stem(rule.to));
          grew = true;
        }
      }
    }
    return [...chosen].flatMap((rule) => compileRule(rule).map((sentence) => ({ sentence, rule })));
  };

  const lexiconAdd = async (input: LexEntry | LexEntry[], opts: { validate?: boolean } = {}): Promise<LexiconChange> => {
    const validate = opts.validate ?? true;
    const entries = (Array.isArray(input) ? input : [input]).map((e) => checkEntry(e));
    entries.forEach((e) => toApeLines(e)); // fail now, before anything changes, on an entry that cannot be written
    const change: LexiconChange = { added: [], replaced: [], unchanged: [], rejected: [], warnings: [] };

    // Entries for the same word and class in one call: the last one wins.
    const latest = new Map<string, LexEntry>();
    for (const e of entries) latest.set(entryKey(e), e);
    const pending: { entry: LexEntry; old?: LexEntry }[] = [];
    for (const [key, entry] of latest) {
      const old = lexicon.get(key);
      if (old && sameEntry(old, entry)) change.unchanged.push(entry);
      else pending.push(old ? { entry, old } : { entry });
    }
    if (!pending.length) return change;

    // Take out what is being replaced, put in the new terms, and see what APE objects to.
    await workerRemove(pending.flatMap((p) => (p.old ? [p.old] : [])));
    const { messages } = await workerAdd(pending.map((p) => p.entry));

    const dropped = new Map<LexEntry, string>();
    const warned = new Map<string, string>();
    for (const m of messages) warned.set(warnedWord(m.message), m.message);
    for (const [word, message] of warned) {
      const group = pending.filter((p) => formsOf(p.entry).includes(word));
      if (!group.length) { change.warnings.push(message); continue; }
      // Two new entries sharing a form: keep the first. One entry clashing with something already there (a function
      // word, another class, an older entry): it does not stay.
      for (const p of group.slice(group.length === 1 ? 0 : 1)) if (!dropped.has(p.entry)) dropped.set(p.entry, message);
    }
    if (validate) {
      for (const p of pending) {
        if (dropped.has(p.entry)) continue;
        for (const group of templatesFor(p.entry)) {
          let ok = false;
          for (const sentence of group) {
            const { diagnostics } = await fromWorker(sentence, {});
            if (!diagnostics.some((d) => d.severity === "error")) { ok = true; break; }
          }
          if (!ok) { dropped.set(p.entry, `does not parse in: ${group.join(" | ")}`); break; }
        }
      }
    }
    // Undo what could not stay: remove its terms, and put back the entry it was replacing.
    const toUndo = pending.filter((p) => dropped.has(p.entry));
    if (toUndo.length) {
      await workerRemove(toUndo.map((p) => p.entry));
      const restore = toUndo.flatMap((p) => (p.old ? [p.old] : []));
      if (restore.length) await workerAdd(restore);
    }
    for (const p of pending) {
      const reason = dropped.get(p.entry);
      if (reason !== undefined) { change.rejected.push({ entry: p.entry, reason }); continue; }
      lexicon.set(entryKey(p.entry), p.entry);
      (p.old ? change.replaced : change.added).push(p.entry);
    }
    return change;
  };

  const lexiconRemove = async (input: LexRef | LexRef[]): Promise<{ removed: LexEntry[] }> => {
    const refs = Array.isArray(input) ? input : [input];
    const removed = [...lexicon.values()].filter((e) => refs.some((r) => matchesRef(e, r)));
    await workerRemove(removed);
    for (const e of removed) lexicon.delete(entryKey(e));
    return { removed };
  };

  return {
    addEntries,
    lexicon: { add: lexiconAdd, remove: lexiconRemove, list: () => [...lexicon.values()] },
    lint,
    synonyms: { add: addRule, remove: (rule) => { rules.delete(ruleKey(rule)); }, list: () => [...rules.values()] },
    async parse(text, opts = {}) {
      return (await fromWorker(text, opts)).parsed;
    },
    use(plugin) {
      if (plugins.has(plugin.name)) throw new AceError(`a plugin named '${plugin.name}' is already in use`);
      plugins.set(plugin.name, plugin);
      return () => { if (plugins.get(plugin.name) === plugin) plugins.delete(plugin.name); };
    },
    async ask({ text, question, timeoutMs = 5000, select }) {
      if (!race) throw new AceError("ask needs RACE's files: pass raceFiles or raceDir to createAce");
      // Only APE's own diagnostics decide whether the input is valid ACE; plugin findings (such as type warnings) do not block a question.
      const [t, q] = await Promise.all([fromWorker(text, {}), fromWorker(question, {})]);
      if (hasErrors(t.diagnostics) || hasErrors(q.diagnostics)) {
        return { status: "invalid", text: t.diagnostics.filter((d) => d.severity === "error"), question: q.diagnostics.filter((d) => d.severity === "error") };
      }

      const sentences = splitSentences(text).map((s) => s.text);
      const all = sentences.map((_, i) => i);
      const chosen = select ? select(sentences, question) : sentences.length > SELECT_ABOVE ? selectRelevant(sentences, question) : all;
      const sendText = (idx: number[]) => idx.map((i) => sentences[i]!).join(" ");
      const numbers = (idx: number[]) => idx.map((i) => i + 1);
      // Synonym rules that matter for this attempt are appended after the user's sentences, so their numbering is unchanged.
      const attempt = (idx: number[]) => {
        const extras = relevantRules(`${sendText(idx)} ${question}`);
        return {
          text: [sendText(idx), ...extras.map((x) => x.sentence)].filter(Boolean).join(" "),
          map: [...numbers(idx), ...extras.map((x) => x.rule)],
        };
      };

      const first = attempt(chosen);
      let result = await askOnce(first.text, question, first.map, timeoutMs);
      // The narrowed text may have dropped a needed sentence: retry once with everything before saying "unknown".
      if (result?.status === "unknown" && chosen.length < all.length) {
        const second = attempt(all);
        result = await askOnce(second.text, question, second.map, timeoutMs);
      }
      if (result?.status === "unknown") {
        const index = await getIndex();
        if (index) result = { ...result, suggestions: suggest(result.unmatched, text, index) };
      }
      return result ?? { status: "timeout" };
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      failAll(new AceError("Ace instance is disposed"));
      await worker.terminate();
    },
  };
}
