// SPDX-License-Identifier: GPL-3.0-only
import { test } from "node:test";
import assert from "node:assert/strict";
import { paintHtml } from "../demo/paint.ts";
import type { Diagnostic } from "../src/index.ts";

const d = (start: number, end: number, severity: "error" | "warning" = "error"): Diagnostic => ({ severity, code: "x", message: "m", range: { start, end }, sentence: 1 });

test("text without diagnostics is shown as is, with a trailing newline so the last line has height", () => {
  assert.equal(paintHtml("Is John happy?", []), "Is John happy?\n");
});

test("a diagnostic wraps its range in a mark with its severity", () => {
  assert.equal(paintHtml("Did John buy", [d(0, 3)]), '<mark class="error">Did</mark> John buy\n');
  assert.equal(paintHtml("A zorblax", [d(2, 9, "warning")]), 'A <mark class="warning">zorblax</mark>\n');
});

test("markup in the text is escaped", () => {
  assert.equal(paintHtml("a < b & c", [d(2, 3)]), 'a <mark class="error">&lt;</mark> b &amp; c\n');
});

test("overlapping diagnostics keep the first, empty ranges are skipped, and order does not matter", () => {
  assert.equal(paintHtml("abcdef", [d(2, 5), d(0, 3)]), '<mark class="error">abc</mark>def\n'.replace("abc", "abc"));
  assert.equal(paintHtml("abcdef", [d(1, 1)]), "abcdef\n");
});
