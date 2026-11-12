// Fetch APE and RACE from their upstream repositories at pinned commits and verify every file against a recorded hash.
// We ship none of their code: this runs on the user's machine (or in their browser) at first use.
import type { FileMap } from "./engine.ts";

export type UpstreamPin = {
  /** GitHub "owner/name". */
  repo: string;
  /** Full commit hash the files are fetched at. */
  commit: string;
  /** Folder inside the repo that holds the Prolog files. */
  root: string;
  files: { path: string; sha256: string }[];
};
export type UpstreamManifest = { ape: UpstreamPin; race: UpstreamPin };

export type Fetcher = (url: string) => Promise<Uint8Array>;
export type Store = {
  get(key: string): Promise<Uint8Array | undefined>;
  put(key: string, bytes: Uint8Array): Promise<void>;
};

/** Tried in order. `{repo}`, `{commit}`, `{root}` and `{path}` are filled in. Both serve the exact commit. */
export const DEFAULT_BASE_URLS = [
  "https://raw.githubusercontent.com/{repo}/{commit}/{root}/{path}",
  "https://cdn.jsdelivr.net/gh/{repo}@{commit}/{root}/{path}",
];

export class UpstreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpstreamError";
  }
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Plain `fetch`, which exists in browsers and in Node. */
export const webFetch: Fetcher = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
};

export function memoryStore(): Store {
  const map = new Map<string, Uint8Array>();
  return { get: async (k) => map.get(k), put: async (k, v) => { map.set(k, v); } };
}

export type LoadOptions = {
  fetch: Fetcher;
  /** Where verified files are kept between runs. Defaults to nothing (fetch every time). */
  store?: Store;
  baseUrls?: string[];
};

const fill = (template: string, pin: UpstreamPin, path: string) =>
  template.replace("{repo}", pin.repo).replace("{commit}", pin.commit).replace("{root}", pin.root).replace("{path}", path);

async function loadOne(pin: UpstreamPin, file: { path: string; sha256: string }, o: LoadOptions): Promise<Uint8Array> {
  const key = `${pin.repo}@${pin.commit}/${pin.root}/${file.path}`;
  const cached = await o.store?.get(key);
  if (cached && (await sha256Hex(cached)) === file.sha256) return cached; // a corrupt cache entry falls through to a fresh fetch

  let mismatch = false;
  let lastError = "no source configured";
  for (const base of o.baseUrls ?? DEFAULT_BASE_URLS) {
    const url = fill(base, pin, file.path);
    try {
      const bytes = await o.fetch(url);
      if ((await sha256Hex(bytes)) !== file.sha256) {
        mismatch = true;
        lastError = `bytes from ${url} do not match the pinned hash`;
        continue;
      }
      await o.store?.put(key, bytes); // only verified bytes are ever stored
      return bytes;
    } catch (e) {
      lastError = `${url}: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  throw new UpstreamError(
    mismatch
      ? `${pin.repo} ${file.path}: downloaded bytes do not match the pinned hash (${lastError}). Refusing to use them.`
      : `${pin.repo} ${file.path}: could not be fetched from any source (${lastError})`,
  );
}

async function loadPin(pin: UpstreamPin, o: LoadOptions): Promise<FileMap> {
  const out: FileMap = new Map();
  const queue = [...pin.files];
  const worker = async () => {
    for (let f = queue.shift(); f; f = queue.shift()) out.set(f.path, await loadOne(pin, f, o));
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  return out;
}

/** Fetch (or read from the store) every pinned file of APE and RACE, verified against the manifest. */
export async function loadUpstream(manifest: UpstreamManifest, o: LoadOptions): Promise<{ ape: FileMap; race: FileMap }> {
  const [ape, race] = await Promise.all([loadPin(manifest.ape, o), loadPin(manifest.race, o)]);
  return { ape, race };
}
