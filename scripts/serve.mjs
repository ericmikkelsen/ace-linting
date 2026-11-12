// Dev-only static server for the browser spike and demo. Serves the repo root plus /manifest.json.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(".");
const port = Number(process.env.PORT || 4177);
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".wasm": "application/wasm", ".pl": "text/plain", ".fit": "text/plain" };

function list(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? list(p, base) : e.isFile() ? [path.relative(base, p)] : [];
  });
}

http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/manifest.json") {
    res.setHeader("content-type", "application/json");
    return res.end(JSON.stringify({
      ape: list(path.join(root, "vendor/APE/prolog")).filter((f) => !f.endsWith(".plp")),
      race: list(path.join(root, "vendor/RACE/prolog")),
    }));
  }
  // stand-in for GitHub: /upstream/Attempto/{APE|RACE}/{commit}/{root}/{path} -> vendor/{APE|RACE}/{root}/{path}
  const up = /^\/upstream\/Attempto\/(APE|RACE)\/[0-9a-f]+\/([^/]+)\/(.+)$/.exec(decodeURIComponent(url.pathname));
  const file = up ? path.join(root, "vendor", up[1], up[2], up[3]) : path.join(root, decodeURIComponent(url.pathname));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; return res.end("not found"); }
  res.setHeader("content-type", types[path.extname(file)] || "application/octet-stream");
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`http://localhost:${port}/`));
