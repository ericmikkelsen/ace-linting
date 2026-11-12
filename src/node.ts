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
