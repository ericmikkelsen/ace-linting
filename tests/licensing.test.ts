// SPDX-License-Identifier: GPL-3.0-only
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const read = (f: string) => fs.readFileSync(f, "utf8");
const files = (dir: string, ext: RegExp): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p, ext) : ext.test(e.name) ? [p] : [];
  });

test("every TypeScript file of ours carries the GPL-3.0-only SPDX header", () => {
  const ours = [...files("src", /\.ts$/), ...files("scripts", /\.(ts|mjs)$/), ...files("tests", /\.ts$/), ...files("demo", /\.ts$/), "vite.config.ts", "vite.lib.config.ts"];
  const missing = ours.filter((f) => !read(f).split("\n").slice(0, 3).some((l) => l.includes("SPDX-License-Identifier: GPL-3.0-only")));
  assert.deepEqual(missing, [], "files without the header");
});

test("the hand-written core vocabulary says it is CC0 and has the full CC0 text next to the other licenses", () => {
  assert.match(read("lexicon/core/core.jsonl").split("\n").slice(0, 3).join("\n"), /SPDX-License-Identifier: CC0-1\.0/);
  assert.match(read("lexicon/licenses/CC0-1.0.txt"), /Creative Commons Legal Code/);
  assert.match(read("lexicon/licenses/CC0-1.0.txt"), /CC0 1\.0 Universal/);
});

test("the package's own license text is the GNU GPL version 3", () => {
  const text = read("LICENSE");
  assert.match(text, /GNU GENERAL PUBLIC LICENSE/);
  assert.match(text, /Version 3, 29 June 2007/);
  assert.equal(JSON.parse(read("package.json")).license, "GPL-3.0-only");
});

test("every license file we keep is named in THIRD_PARTY_LICENSES.md or lexicon/NOTICE.md", () => {
  const where = read("THIRD_PARTY_LICENSES.md") + read("lexicon/NOTICE.md");
  const kept = [...files("lexicon/licenses", /./), ...files("licenses", /./)];
  assert.ok(kept.length >= 5, "license files are present");
  const unnamed = kept.filter((f) => !where.includes(path.basename(f)));
  assert.deepEqual(unnamed, [], "license files not mentioned in the notices");
});

test("every core lexicon entry carries a source tag", () => {
  const lines = read("lexicon/core/core.jsonl").split("\n").filter((l) => l.trim() && !l.startsWith("//"));
  assert.ok(lines.length > 100);
  const untagged = lines.filter((l) => !(JSON.parse(l) as { source?: string }).source);
  assert.deepEqual(untagged, []);
});

test("the README has a Licensing section that names the package license and the runtime downloads", () => {
  const readme = read("README.md");
  assert.match(readme, /^## Licensing/m);
  assert.match(readme, /GPL-3\.0-only/);
  assert.match(readme, /APE/);
  assert.match(readme, /RACE/);
  assert.match(readme, /Open English WordNet/);
});

// --- the published package

type Packed = { files: { path: string; size: number }[]; unpackedSize: number; size: number };
function pack(): Packed {
  execFileSync("npm", ["run", "build"], { stdio: "ignore" });
  execFileSync("npm", ["run", "build:browser"], { stdio: "ignore" });
  const out = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  return (JSON.parse(out) as Packed[])[0]!;
}

test("the tarball carries the licenses, the notices, the source and both builds, and none of APE, RACE or their lexicon", () => {
  const p = pack();
  const names = p.files.map((f) => f.path);
  for (const must of [
    "LICENSE", "README.md", "THIRD_PARTY_LICENSES.md", "package.json",
    "lexicon/NOTICE.md", "lexicon/licenses/CC0-1.0.txt", "lexicon/licenses/oewn-LICENSE.md",
    "lexicon/licenses/oewn-WNDB_License.txt", "lexicon/licenses/verbnet-3.x-license.txt", "licenses/swipl-wasm-LICENSE.txt",
    "lexicon/core/core.jsonl", "src/index.ts", "scripts/build-lexicon.ts",
    "dist/index.js", "dist/index.d.ts", "dist-browser/ace-linting.js",
  ]) assert.ok(names.includes(must), `missing from the package: ${must}`);

  const forbidden = names.filter((n) => /(^|\/)(vendor|\.cache|node_modules|tests|demo)(\/|$)/.test(n) || /(^|\/)(APE|RACE)(\/|$)/.test(n) || /\.plp$/.test(n) || /clex_lexicon\.pl$/.test(n));
  assert.deepEqual(forbidden, [], "files that must not ship");
  assert.ok(!names.includes("lexicon/dist/lexicon.pl"), "the generated .pl duplicate is left out");
});

test("the package stays within the 50 MB budget", () => {
  const p = pack();
  assert.ok(p.unpackedSize < 50 * 1024 * 1024, `unpacked size ${(p.unpackedSize / 1e6).toFixed(1)} MB`);
});

test("no single file in the package is larger than 8 MB except the Prolog runtime and the generated lexicon data", () => {
  const p = pack();
  const allowed = /(^dist-browser\/assets\/dist-[^/]+\.js$)|(^lexicon\/oewn\/oewn\.jsonl$)/;
  const big = p.files.filter((f) => f.size > 8 * 1024 * 1024 && !allowed.test(f.path)).map((f) => `${f.path} (${(f.size / 1e6).toFixed(1)} MB)`);
  assert.deepEqual(big, []);
});

test("package.json points Node and browsers at the right builds and has a files list", () => {
  const pkg = JSON.parse(read("package.json")) as { main: string; types: string; exports: Record<string, unknown>; files: string[]; engines: { node: string } };
  assert.equal(pkg.main, "./dist/index.js");
  assert.equal(pkg.types, "./dist/index.d.ts");
  const root = pkg.exports["."] as Record<string, string>;
  assert.deepEqual(Object.keys(root), ["types", "browser", "import", "default"], "condition order matters");
  assert.equal(root["browser"], "./dist-browser/ace-linting.js");
  assert.ok(pkg.files.includes("licenses") && pkg.files.includes("lexicon/licenses"));
  assert.ok(pkg.engines.node);
});
