// SPDX-License-Identifier: GPL-3.0-only
// Download and verify APE and RACE into the local cache (what createAce does on first use). Usage: npm run fetch:upstream
import { loadUpstream, webFetch } from "../src/upstream.ts";
import { UPSTREAM } from "../src/upstream-manifest.ts";
import { defaultCacheDir, fileStore } from "../src/node.ts";

const dir = defaultCacheDir();
const { ape, race } = await loadUpstream(UPSTREAM, { fetch: webFetch, store: fileStore(dir) });
console.log(`verified ${ape.size} APE files and ${race.size} RACE files in ${dir}`);
