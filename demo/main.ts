// SPDX-License-Identifier: GPL-3.0-only
import { createAce, parseEntries, debounce, type Ace, type Diagnostic, type AskResult, type SynonymRule } from "../src/index.ts";
import type { SynonymIndex } from "../src/synonym-index.ts";
import coreLexicon from "../lexicon/core/core.jsonl?raw";
import { paintHtml } from "./paint.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const notes = $<HTMLTextAreaElement>("notes");
const backdrop = $("backdrop");
const statusEl = $("status");

notes.value = "John is a customer. Mary is a customer. John inserts a card. Every customer who inserts a card is happy.\nJohn buys a card.";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function listDiagnostics(ul: HTMLElement, text: string, ds: Diagnostic[]) {
  ul.replaceChildren(...ds.map((d) => {
    const li = document.createElement("li");
    li.className = d.severity;
    const word = text.slice(d.range.start, d.range.end);
    li.innerHTML = `<code>${esc(word.length > 40 ? word.slice(0, 40) + "…" : word)}</code> — ${esc(d.message)}${d.suggestion ? ` <span class="muted">(${esc(d.suggestion)})</span>` : ""}`;
    return li;
  }));
}

const params = new URLSearchParams(location.search);
const remote = params.get("remote") === "1"; // fetch from GitHub instead of the local dev stand-in

async function start(): Promise<Ace> {
  const t0 = performance.now();
  const ace = await createAce({
    lexicon: parseEntries(coreLexicon),
    upstream: remote ? {} : { baseUrls: [`${location.origin}/upstream/{repo}/{commit}/{root}/{path}`] },
    synonymIndex: async (): Promise<SynonymIndex> => {
      const res = await fetch("/synonyms.json");
      if (!res.ok) throw new Error("no synonym index in this build");
      return res.json() as Promise<SynonymIndex>;
    },
  });
  statusEl.textContent = `Ready in ${Math.round(performance.now() - t0)} ms (${remote ? "files from GitHub or this browser's saved copy" : "files from the dev server or this browser's saved copy"}, checked against pinned hashes).`;
  return ace;
}

const ace = await start().catch((e: unknown) => { statusEl.textContent = `Could not start: ${e instanceof Error ? e.message : String(e)}`; throw e; });

/** Lint a text box as the user types: wavy underlines on a layer behind it, and the reasons in a list below. */
function watch(input: HTMLInputElement | HTMLTextAreaElement, layer: HTMLElement, list: HTMLElement) {
  const relint = debounce(async () => {
    const text = input.value;
    const { diagnostics } = await ace.lint(text);
    if (text !== input.value) return; // edited meanwhile
    layer.innerHTML = paintHtml(text, diagnostics);
    listDiagnostics(list, text, diagnostics);
    // the whole box shows the verdict too: red border for an error, amber for a warning
    input.dataset["state"] = diagnostics.some((d) => d.severity === "error") ? "error" : diagnostics.some((d) => d.severity === "warning") ? "warning" : "ok";
  }, 150);
  const sync = () => { layer.scrollTop = input.scrollTop; layer.scrollLeft = input.scrollLeft; };
  const refresh = () => { layer.innerHTML = paintHtml(input.value, []); delete input.dataset["state"]; void relint(); sync(); };
  input.addEventListener("input", refresh);
  for (const ev of ["scroll", "keyup", "click", "select"]) input.addEventListener(ev, sync);
  refresh();
}
watch(notes, backdrop, $("diagnostics"));
watch($<HTMLInputElement>("question"), $("q-backdrop"), $("q-diagnostics"));

function renderRules() {
  const rules = ace.synonyms.list();
  $("rule-count").textContent = String(rules.length);
  $("rules").replaceChildren(...rules.map((r) => {
    const li = document.createElement("li");
    li.textContent = `${r.from} ⇒ ${r.to} (${r.class})  `;
    const b = document.createElement("button");
    b.className = "small"; b.textContent = "Remove";
    b.onclick = () => { ace.synonyms.remove(r); renderRules(); void ask(); };
    li.append(b);
    return li;
  }));
}

function render(r: AskResult) {
  const out = $("answer");
  if (r.status === "answered") {
    const proofs = r.proofs.map((p) => `<li>${p.axioms.map((a) => (a.synonym ? `<em>rule: ${esc(a.synonym.from)} ⇒ ${esc(a.synonym.to)}</em>` : `${a.sentence}: ${esc(a.text)}`)).join(" · ")}${p.substitutions.length ? ` <span class="muted">${p.substitutions.map((s) => `${esc(s.word)} = ${esc(s.value)}`).join(", ")}</span>` : ""}</li>`).join("");
    out.innerHTML = `<div class="answered">Yes — proved.</div>${r.answers.length ? `<p>Answers: ${r.answers.map((a) => `<code>${esc(a.value)}</code>`).join(", ")}</p>` : ""}<p class="muted">Because:</p><ul>${proofs}</ul>`;
  } else if (r.status === "unknown") {
    out.innerHTML = `<div class="unknown">Unknown — this cannot be proved from the notes (that is not the same as no).</div>${r.unmatched.length ? `<p class="muted">Not matched: ${r.unmatched.map((u) => `${esc(u.wordClass)} <code>${esc(u.word)}</code>`).join(", ")}</p>` : ""}`;
    for (const s of r.suggestions) {
      const p = document.createElement("p");
      p.innerHTML = `Did you mean <code>${esc(s.replacement)}</code> for <code>${esc(s.word)}</code>? <span class="muted">${esc(s.gloss)}</span> `;
      const b = document.createElement("button");
      b.className = "small"; b.textContent = "Treat as the same";
      b.onclick = async () => { await ace.synonyms.add(s.rule as SynonymRule); renderRules(); await ask(); };
      p.append(b);
      out.append(p);
    }
  } else if (r.status === "invalid") {
    out.innerHTML = `<div class="bad">Not valid ACE.</div><ul>${[...r.text, ...r.question].map((d) => `<li>${esc(d.message)}</li>`).join("")}</ul>`;
  } else {
    out.innerHTML = `<div class="bad">Timed out.</div>`;
  }
}

async function ask() {
  const question = $<HTMLInputElement>("question").value;
  $("answer").textContent = "Thinking…";
  render(await ace.ask({ text: notes.value, question }));
}
$("ask").addEventListener("submit", (e) => { e.preventDefault(); void ask().catch((err: unknown) => { $("answer").textContent = String(err); }); });
