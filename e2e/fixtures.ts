/**
 * Builds the course zips used by the e2e suite from committed, license-safe fixtures:
 *  - OCW zips: the real OCW metadata JSON in tests/fixtures/* plus tiny generated PDFs for every listed file
 *  - a generic "folder" course with video + captions, bundled resources, markdown, code, a nested zip and a README
 */
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import JSZip from "jszip";

const ROOT = path.resolve(__dirname, "..");
export const OUT = path.join(ROOT, "e2e", ".fixtures");

/** A valid one-page PDF that says `text`. */
export function tinyPdf(text: string): Buffer {
  const esc = text.replace(/[()\\]/g, "\\$&");
  const stream = `BT /F1 24 Tf 72 720 Td (${esc}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("")}`;
  body += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

function walk(dir: string, base = ""): string[] {
  return readdirSync(dir).flatMap((n) => {
    const rel = base ? `${base}/${n}` : n;
    return statSync(path.join(dir, n)).isDirectory() ? walk(path.join(dir, n), rel) : [rel];
  });
}

async function ocwZip(fixture: string, out: string) {
  const dir = path.join(ROOT, "tests", "fixtures", fixture);
  const zip = new JSZip();
  for (const f of walk(dir)) if (f !== "files.txt") zip.file(f, readFileSync(path.join(dir, f)));
  const listed = readFileSync(path.join(dir, "files.txt"), "utf8").split("\n").filter(Boolean);
  for (const f of listed) {
    if (f.endsWith(".pdf")) zip.file(f, tinyPdf(path.basename(f)));
    else if (/\.(vtt|webvtt)$/.test(f)) zip.file(f, "WEBVTT\n\n00:00.000 --> 00:02.000\nHello\n");
    else if (f.endsWith(".srt")) zip.file(f, "1\n00:00:00,000 --> 00:00:02,000\nHello\n");
    else zip.file(f, `placeholder for ${f}`);
  }
  writeFileSync(path.join(OUT, out), await zip.generateAsync({ type: "nodebuffer" }));
}

async function genericZip(out: string) {
  const zip = new JSZip();
  const root = zip.folder("Python Crash Course")!;
  const video = readFileSync(path.join(ROOT, "e2e", "assets", "sample.mp4"));
  root.file("README.md", "# Python Crash Course\n\nLearn Python from zero with short videos and exercises.\n\n## What you get\n\n- videos\n- notebooks\n");
  root.file("cover.png", Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"));
  const s1 = root.folder("01 - Getting Started")!;
  s1.file("01 - Welcome.mp4", video);
  s1.file("01 - Welcome.en.srt", "1\n00:00:00,200 --> 00:00:03,500\nWelcome to the course!\n");
  s1.file("01 - Welcome.pdf", tinyPdf("Welcome slides"));
  s1.file("02 - Setup notes.md", "# Setup\n\nInstall **Python 3.12** and run `python --version`.\n");
  const s2 = root.folder("02 - Basics")!;
  s2.file("1. Variables.mp4", video);
  s2.file("1.1 variables-cheatsheet.pdf.pdf", tinyPdf("Cheatsheet"));
  s2.file("2. hello.py", 'print("hello world")\n');
  const inner = new JSZip();
  inner.file("exercise.py", "def add(a, b):\n    return a + b\n");
  inner.file("instructions.md", "# Exercise\n\nImplement `add`.\n");
  s2.file("3. exercise-bundle.zip", await inner.generateAsync({ type: "nodebuffer" }));
  writeFileSync(path.join(OUT, out), await zip.generateAsync({ type: "nodebuffer" }));
}

export default async function globalSetup() {
  mkdirSync(OUT, { recursive: true });
  await ocwZip("ocw", "ocw-18657.zip");
  await ocwZip("ocw-60001", "ocw-60001.zip");
  await ocwZip("ocw-1806sc", "ocw-1806sc.zip");
  await genericZip("python-crash-course.zip");
}
