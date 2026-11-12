// Browser spike worker: load swipl-wasm, assemble APE + RACE in the virtual FS, parse and answer.
importScripts("/node_modules/swipl-wasm/dist/swipl/swipl-bundle.js");

const ms = (t) => Math.round(performance.now() - t);
const quote = (s) => "'" + s.replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";

async function main() {
  const out = { timings: {} };
  let t = performance.now();
  const swipl = await SWIPL({ arguments: ["-q"], print: () => {}, printErr: () => {} });
  out.timings.runtime = ms(t);

  t = performance.now();
  const manifest = await (await fetch("/manifest.json")).json();
  const put = async (urlBase, vfsBase, files) => {
    await Promise.all(files.map(async (f) => {
      const buf = new Uint8Array(await (await fetch(`${urlBase}/${f}`)).arrayBuffer());
      const dir = `${vfsBase}/${f}`.split("/").slice(0, -1).join("/");
      swipl.FS.mkdirTree(dir);
      swipl.FS.writeFile(`${vfsBase}/${f}`, buf);
    }));
  };
  await put("/vendor/APE/prolog", "/race/ape", manifest.ape);
  await put("/vendor/RACE/prolog", "/race/prolog", manifest.race);
  out.timings.fetchFiles = ms(t);
  out.fileCount = manifest.ape.length + manifest.race.length;

  const run = (g) => swipl.prolog.query(g).once();
  t = performance.now();
  run("working_directory(_, '/race/ape/parser'), consult(fit_to_plp)");
  out.timings.grammar = ms(t);

  swipl.FS.writeFile("/race/time_stub.pl", ":- meta_predicate user:call_with_time_limit(+, 0).\nuser:call_with_time_limit(_T, G) :- once(G).\n");
  run("consult('/race/time_stub')");
  t = performance.now();
  run("consult('/race/prolog/race')");
  out.timings.loadRace = ms(t);

  t = performance.now();
  const p = run(`ace_to_drs:acetext_to_drs(${quote("Every customer inserts.")}, S, T, D, M), format(atom(Ms), '~q', [M])`);
  out.timings.parseBad = ms(t);
  out.parseBadMessages = p.Ms;

  const axioms = "John is a customer. Mary is a customer. John inserts a card. Every customer who inserts a card is happy.";
  out.answers = {};
  for (const q of ["Is John happy?", "Who is happy?", "Is Mary happy?"]) {
    t = performance.now();
    const r = run(`race:answer_query(${quote(axioms)}, ${quote(q)}, [], M, RT, P, W), format(atom(Ps), '~q', [P]), format(atom(Ws), '~q', [W])`);
    out.answers[q] = { ms: ms(t), proofs: r.Ps, whynot: r.Ws };
  }
  return out;
}
main().then((r) => postMessage({ ok: true, r }), (e) => postMessage({ ok: false, error: String(e && e.stack || e) }));
