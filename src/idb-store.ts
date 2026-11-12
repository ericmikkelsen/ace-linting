// SPDX-License-Identifier: GPL-3.0-only
import type { Store } from "./upstream.ts";

const STORE = "files";

function open(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("could not open IndexedDB"));
  });
}

const wrap = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });

/**
 * A browser store for verified upstream files that survives page loads. Files are checked against their
 * pinned hashes when read, so a corrupted or tampered entry is simply fetched again.
 * Any failure (private windows, blocked storage) acts like an empty store rather than breaking linting.
 */
export function idbStore(name = "ace-linting"): Store {
  let db: Promise<IDBDatabase> | undefined;
  const get = () => (db ??= open(name));
  return {
    async get(key) {
      try {
        const value = (await wrap((await get()).transaction(STORE).objectStore(STORE).get(key))) as Uint8Array | ArrayBuffer | undefined;
        return value === undefined ? undefined : new Uint8Array(value);
      } catch {
        return undefined;
      }
    },
    async put(key, bytes) {
      try {
        await wrap((await get()).transaction(STORE, "readwrite").objectStore(STORE).put(bytes, key));
      } catch {
        /* storage unavailable: the next load fetches again */
      }
    },
  };
}
