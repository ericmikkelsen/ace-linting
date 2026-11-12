// SPDX-License-Identifier: GPL-3.0-only
// Spike part 2: RACE answering questions in swipl-wasm (Node).
import SWIPL from "swipl-wasm";
import fs from "node:fs";
import path from "node:path";

const ms = (t) => Math.round(performance.now() - t);
function copyInto(FS, hostDir, vfsDir) {
  FS.mkdirTree(vfsDir);
  for (const e of fs.readdirSync(hostDir, { withFileTypes: true })) {
    const h = path.join(hostDir, e.name), v = `${vfsDir}/${e.name}`;
    if (e.isDirectory()) copyInto(FS, h, v);
    else if (e.isFile()) FS.writeFile(v, fs.readFileSync(h));
  }
}
const quote = (s) => "'" + s.replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";

let t = performance.now();
const swipl = await SWIPL({ arguments: ["-q"], print: () => {}, printErr: (m) => { if (!/Singleton|singleton|Reading|Writing|^Warning: \/race|^ERROR: \/race\/prolog\/race.pl:52/.test(m)) console.error("[err]", m); } });
console.log("runtime ms", ms(t));
copyInto(swipl.FS, "vendor/APE/prolog", "/race/ape");
copyInto(swipl.FS, "vendor/RACE/prolog", "/race/prolog");

const run = (g) => swipl.prolog.query(g).once();
t = performance.now();
console.log("grammar", run("working_directory(_, '/race/ape/parser'), consult(fit_to_plp)").success, ms(t));
// library(time) (alarms) is not in swipl-wasm; run without an in-Prolog time limit and rely on terminating the worker.
swipl.FS.writeFile("/race/time_stub.pl", ":- meta_predicate user:call_with_time_limit(+, 0).\nuser:call_with_time_limit(_Time, Goal) :- once(Goal).\n");
run("consult('/race/time_stub')");
t = performance.now();
console.log("load race", JSON.stringify(run("consult('/race/prolog/race')")), "ms", ms(t));

const axioms = "John is a customer. Mary is a customer. John inserts a card. Every customer who inserts a card is happy.";
for (const query of ["Is John happy?", "Who is happy?", "Is Mary happy?"]) {
  t = performance.now();
  const r = run(`race:answer_query(${quote(axioms)}, ${quote(query)}, [], M, RT, P, W), format(atom(Ms), '~q', [M]), format(atom(Ps), '~q', [P]), format(atom(Ws), '~q', [W])`);
  console.log("\nQ:", query, "| ok:", r.success, "| ms", ms(t));
  if (r.success) console.log(" messages:", r.Ms, "\n proofs:", r.Ps, "\n whynot:", r.Ws);
}
