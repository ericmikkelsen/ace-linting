// Dev server and build for the demo (demo/). The library bundle has its own config: vite.lib.config.ts.
import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";

const root = path.resolve(".");

/**
 * Development only. Stands in for GitHub so the demo works offline: /upstream/{repo}/{commit}/{root}/{path}
 * is served from the vendor/ checkouts (the pinned hashes are still checked in the browser). Also serves
 * the generated synonym index at /synonyms.json when it exists. Nothing here is part of the published package.
 */
function devUpstream(): Plugin {
  const handler = (req: { url?: string }, res: { statusCode: number; setHeader(k: string, v: string): void; end(b?: Buffer | string): void }, next: () => void) => {
    const url = decodeURIComponent((req.url ?? "").split("?")[0]!);
    let file: string | undefined;
    const m = /^\/upstream\/Attempto\/(APE|RACE)\/[0-9a-f]+\/([^/]+)\/(.+)$/.exec(url);
    if (m) file = path.join(root, "vendor", m[1]!, m[2]!, m[3]!);
    else if (url === "/synonyms.json") file = path.join(root, "lexicon/dist/synonyms.json");
    if (!file || !file.startsWith(root) || !fs.existsSync(file)) return next();
    res.statusCode = 200;
    res.setHeader("content-type", "application/octet-stream");
    res.end(fs.readFileSync(file));
  };
  return {
    name: "ace-dev-upstream",
    configureServer: (s) => { s.middlewares.use(handler); },
    configurePreviewServer: (s) => { s.middlewares.use(handler); },
  };
}

export default defineConfig({
  root: "demo",
  define: { __ACE_BROWSER__: true },
  worker: { format: "es" },
  server: { fs: { allow: [root] } },
  build: { outDir: "../demo-dist", emptyOutDir: true, target: "es2022" },
  plugins: [devUpstream()],
});
