// SPDX-License-Identifier: GPL-3.0-only
import type { Diagnostic } from "../src/index.ts";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * HTML for the layer behind an input: the same text with the diagnosed words wrapped in <mark>, so wavy underlines
 * line up with what the user typed. Overlapping ranges keep the first one; empty ranges are skipped.
 */
export function paintHtml(text: string, diagnostics: Diagnostic[]): string {
  const spans = diagnostics.filter((d) => d.range.end > d.range.start).sort((a, b) => a.range.start - b.range.start);
  let html = "";
  let at = 0;
  for (const d of spans) {
    if (d.range.start < at) continue;
    html += esc(text.slice(at, d.range.start)) + `<mark class="${d.severity}">${esc(text.slice(d.range.start, d.range.end))}</mark>`;
    at = d.range.end;
  }
  return `${html}${esc(text.slice(at))}\n`;
}
