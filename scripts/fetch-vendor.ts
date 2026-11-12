// SPDX-License-Identifier: GPL-3.0-only
// Check out APE and RACE into vendor/ for development and tests, at the commits pinned in
// src/upstream-manifest.ts. These used to be git submodules, but RACE has its own APE submodule
// at a path that is a symlink, which git refuses to clone recursively. That broke installing
// this package as a git dependency, because npm always clones with --recurse-submodules.
// Here each repository is fetched on its own, without submodules: RACE's APE link then points
// at vendor/APE.
//
// Usage:
//   npm run vendor                              the pinned commits (does nothing if already there)
//   npm run vendor -- --ape=<sha> --race=<sha>  other commits; then run npm run pin:upstream
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { UPSTREAM } from "../src/upstream-manifest.ts";

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));

for (const [key, dir] of [["ape", "vendor/APE"], ["race", "vendor/RACE"]] as const) {
  const { repo, commit: pinned } = UPSTREAM[key];
  const commit = args[key] ?? pinned;
  if (current(dir) === commit) {
    console.log(`${dir} is at ${commit.slice(0, 7)}`);
    continue;
  }
  mkdirSync(dir, { recursive: true });
  if (!existsSync(`${dir}/.git`)) {
    git(dir, "init", "-q");
    git(dir, "remote", "add", "origin", `https://github.com/${repo}.git`);
  }
  git(dir, "fetch", "-q", "--depth=1", "origin", commit);
  git(dir, "checkout", "-q", "--force", "FETCH_HEAD");
  console.log(`${dir} checked out at ${commit.slice(0, 7)}`);
}

function current(dir: string): string | null {
  try {
    return execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

function git(dir: string, ...rest: string[]) {
  execFileSync("git", ["-C", dir, ...rest], { stdio: "inherit" });
}
