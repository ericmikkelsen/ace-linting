// Spike: can APE (and later RACE) run under swipl-wasm in Node?
import SWIPL from "swipl-wasm";
import fs from "node:fs";
import path from "node:path";

const ape = path.resolve("vendor/APE");
const ms = (t) => Math.round(performance.now() - t);

function copyInto(FS, hostDir, vfsDir) {
  FS.mkdirTree(vfsDir);
  for (const e of fs.readdirSync(hostDir, { withFileTypes: true })) {
    const h = path.join(hostDir, e.name), v = `${vfsDir}/${e.name}`;
    if (e.isDirectory()) copyInto(FS, h, v);
    else if (e.isFile()) FS.writeFile(v, fs.readFileSync(h));
  }
}
const q = (swipl, goal) => swipl.prolog.query(goal).once();

let t = performance.now();
const swipl = await SWIPL({ arguments: ["-q"], print: console.log, printErr: console.error });
console.log("runtime load ms", ms(t));

t = performance.now();
copyInto(swipl.FS, path.join(ape, "prolog"), "/ape/prolog");
console.log("copy APE into virtual fs ms", ms(t));

t = performance.now();
let r = q(swipl, "working_directory(_, '/ape/prolog/parser'), consult(fit_to_plp)");
console.log("compile grammar (fit_to_plp)", r.success, "ms", ms(t));
console.log("plp files:", swipl.FS.readdir("/ape/prolog/parser").filter((f) => f.endsWith(".plp")));

t = performance.now();
r = q(swipl, "consult('/ape/prolog/parser/ace_to_drs')");
console.log("load ace_to_drs", r.success, "ms", ms(t));

for (const text of ["Every customer inserts a card.", "Every customer inserts.", "The coffee executes the command."]) {
  t = performance.now();
  const goal = `ace_to_drs:acetext_to_drs(${JSON.stringify(text).replace(/^"|"$/g, "'")}, S, T, D, M), format(atom(Ds), '~q', [D]), format(atom(Ms), '~q', [M]), format(atom(Ss), '~q', [S])`;
  r = q(swipl, goal);
  console.log("\nTEXT:", text, "| ok:", r.success, "| ms", ms(t));
  if (r.success) console.log(" sentences:", r.Ss, "\n drs:", r.Ds, "\n messages:", r.Ms);
}
