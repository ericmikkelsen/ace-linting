// SPDX-License-Identifier: GPL-3.0-only
// Builds the browser bundle of the library into dist-browser/ (an ES module plus its worker).
import { defineConfig } from "vite";

export default defineConfig({
  // Relative asset URLs, so the worker is found next to the bundle wherever the package is hosted.
  base: "./",
  define: { __ACE_BROWSER__: true },
  worker: { format: "es" },
  build: {
    outDir: "dist-browser",
    emptyOutDir: true,
    target: "es2022",
    sourcemap: true,
    lib: { entry: "src/index.ts", formats: ["es"], fileName: "ace-linting" },
  },
});
