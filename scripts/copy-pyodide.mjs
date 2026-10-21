// Copies Pyodide's core runtime (Python compiled to WebAssembly) into /public/pyodide, so "Run" works without a
// third-party CDN for the interpreter itself. Extra packages (numpy, pandas...) still load from Pyodide's CDN.
import { cpSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const dir = path.dirname(require.resolve("pyodide/package.json"));
mkdirSync("public/pyodide", { recursive: true });
for (const f of ["pyodide.mjs", "pyodide.asm.mjs", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"]) {
  cpSync(path.join(dir, f), path.join("public/pyodide", f));
}
console.log("copied pyodide runtime to public/pyodide");
