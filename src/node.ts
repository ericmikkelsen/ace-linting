import fs from "node:fs";
import path from "node:path";
import type { FileMap } from "./engine.ts";

/** Read every file under `dir` into a FileMap keyed by relative path. Generated grammar files (.plp) are skipped. */
export function readTree(dir: string): FileMap {
  const files: FileMap = new Map();
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && !e.name.endsWith(".plp")) files.set(path.relative(dir, p), fs.readFileSync(p));
    }
  };
  walk(dir);
  return files;
}

import os from "node:os";
import type { Store } from "./upstream.ts";

/** A folder-backed store for verified upstream files. Writes are atomic so a crash never leaves a half-written file. */
export function fileStore(dir: string): Store {
  return {
    async get(key) {
      try {
        return new Uint8Array(await fs.promises.readFile(path.join(dir, key)));
      } catch {
        return undefined;
      }
    },
    async put(key, bytes) {
      const file = path.join(dir, key);
      await fs.promises.mkdir(path.dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      await fs.promises.writeFile(tmp, bytes);
      await fs.promises.rename(tmp, file);
    },
  };
}

export function defaultCacheDir(): string {
  return process.env["ACE_LINTING_CACHE"] ?? path.join(os.homedir(), ".cache", "ace-linting");
}

/** Read a synonym index built by `npm run build:synonyms`. */
export async function loadSynonymIndex(file: string): Promise<import("./synonym-index.ts").SynonymIndex> {
  return JSON.parse(await fs.promises.readFile(file, "utf8")) as import("./synonym-index.ts").SynonymIndex;
}
