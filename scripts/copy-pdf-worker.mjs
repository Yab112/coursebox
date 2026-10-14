// Copies the pdf.js worker + wasm decoders, cmaps and standard fonts that match the
// installed react-pdf into /public, so PDFs render fully offline.
import { cpSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const pdfjsDir = path.dirname(
  require.resolve("pdfjs-dist/package.json", { paths: [path.dirname(require.resolve("react-pdf"))] }),
);
mkdirSync("public/pdfjs", { recursive: true });
cpSync(path.join(pdfjsDir, "build/pdf.worker.min.mjs"), "public/pdf.worker.min.mjs");
for (const dir of ["wasm", "cmaps", "standard_fonts", "iccs"]) {
  cpSync(path.join(pdfjsDir, dir), `public/pdfjs/${dir}`, { recursive: true });
}
console.log("copied pdf.js worker and assets to public/");
