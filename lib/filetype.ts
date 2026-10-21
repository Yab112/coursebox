import { basename, extname } from "./analyzers/utils";

/**
 * Picks how to show a text-ish file: by extension, then file name, then shebang, then by looking at the
 * content itself. So `Makefile`, `run` (#!/bin/bash) or an unknown extension still open properly.
 */
export type ViewKind = "markdown" | "notebook" | "json" | "table" | "subtitles" | "html" | "code" | "text" | "binary";
export type Detected = { kind: ViewKind; lang?: string; delimiter?: string };

/** Extension -> Shiki language id. */
const LANG_BY_EXT: Record<string, string> = {
  py: "python", pyw: "python", pyi: "python",
  js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "jsx", ts: "typescript", mts: "typescript", cts: "typescript", tsx: "tsx",
  java: "java", c: "c", h: "c", cpp: "cpp", cc: "cpp", cxx: "cpp", hpp: "cpp", hh: "cpp", hxx: "cpp", ino: "cpp",
  cs: "csharp", go: "go", rs: "rust", rb: "ruby", php: "php", swift: "swift", kt: "kotlin", kts: "kotlin", scala: "scala",
  sh: "shellscript", bash: "shellscript", zsh: "shellscript", fish: "fish", ps1: "powershell", bat: "bat", cmd: "bat",
  m: "matlab", r: "r", jl: "julia", lua: "lua", pl: "perl", hs: "haskell", ml: "ocaml", mli: "ocaml", fs: "fsharp",
  ex: "elixir", exs: "elixir", erl: "erlang", clj: "clojure", cljs: "clojure", dart: "dart", zig: "zig", nim: "nim",
  scm: "scheme", ss: "scheme", rkt: "racket", lisp: "common-lisp", el: "emacs-lisp", vim: "viml",
  f: "fortran-fixed-form", for: "fortran-fixed-form", f90: "fortran-free-form", f95: "fortran-free-form",
  v: "verilog", sv: "system-verilog", vhd: "vhdl", vhdl: "vhdl", asm: "asm", s: "asm", sol: "solidity", wat: "wasm",
  sql: "sql", graphql: "graphql", gql: "graphql", proto: "proto", prisma: "prisma",
  html: "html", htm: "html", xml: "xml", xsd: "xml", xsl: "xml", plist: "xml", css: "css", scss: "scss", sass: "sass", less: "less",
  yaml: "yaml", yml: "yaml", toml: "toml", ini: "ini", cfg: "ini", conf: "ini", properties: "properties", env: "dotenv",
  json: "json", jsonc: "jsonc", json5: "json5", jsonl: "json", geojson: "json",
  tex: "latex", sty: "latex", cls: "latex", bib: "bibtex", rmd: "markdown", qmd: "markdown",
  gradle: "groovy", groovy: "groovy", cmake: "cmake", mk: "make", nix: "nix", tf: "hcl", hcl: "hcl",
  diff: "diff", patch: "diff", dockerfile: "docker", http: "http", csv: "csv", tsv: "tsv",
};

const LANG_BY_NAME: Record<string, string> = {
  makefile: "make", gnumakefile: "make", dockerfile: "docker", containerfile: "docker", "cmakelists.txt": "cmake",
  gemfile: "ruby", rakefile: "ruby", procfile: "shellscript", jenkinsfile: "groovy", vagrantfile: "ruby",
  ".bashrc": "shellscript", ".zshrc": "shellscript", ".profile": "shellscript", ".gitconfig": "ini", ".editorconfig": "ini",
};

const SHEBANG: [RegExp, string][] = [
  [/python/, "python"],
  [/\b(ba|z|k)?sh\b/, "shellscript"],
  [/node|deno|bun/, "javascript"],
  [/ruby/, "ruby"],
  [/perl/, "perl"],
  [/Rscript/, "r"],
  [/julia/, "julia"],
];

const TEXT_EXT = new Set(["txt", "text", "log", "out", "readme", "license", "nfo", "me", "1st"]);

/** Null bytes or many control characters in the first few KB mean it isn't text. */
export function looksBinary(sample: Uint8Array) {
  let control = 0;
  const n = Math.min(sample.length, 8192);
  for (let i = 0; i < n; i++) {
    const b = sample[i];
    if (b === 0) return true;
    if (b < 7 || (b > 13 && b < 32)) control++;
  }
  return n > 0 && control / n > 0.1;
}

export function detectFile(path: string, sample?: string): Detected {
  const ext = extname(path);
  const name = basename(path).toLowerCase();

  if (ext === "md" || ext === "markdown" || ext === "mdx" || ext === "mkd") return { kind: "markdown" };
  if (ext === "ipynb") return { kind: "notebook" };
  if (ext === "csv") return { kind: "table", delimiter: "," };
  if (ext === "tsv" || ext === "tab") return { kind: "table", delimiter: "\t" };
  if (ext === "srt" || ext === "vtt") return { kind: "subtitles" };
  if (ext === "html" || ext === "htm" || ext === "xhtml") return { kind: "html" };
  if (ext === "json" || ext === "geojson") return { kind: "json", lang: "json" };
  if (LANG_BY_EXT[ext]) return { kind: "code", lang: LANG_BY_EXT[ext] };
  if (LANG_BY_NAME[name]) return { kind: "code", lang: LANG_BY_NAME[name] };
  if (/^(readme|changelog|contributing|authors)$/.test(name) && sample && looksLikeMarkdown(sample)) return { kind: "markdown" };
  if (TEXT_EXT.has(ext)) return { kind: "text" };

  // No useful name: look inside.
  if (sample === undefined) return { kind: "text" };
  const first = sample.slice(0, 200);
  if (first.startsWith("#!")) {
    const line = first.split("\n")[0];
    const hit = SHEBANG.find(([re]) => re.test(line));
    return { kind: "code", lang: hit?.[1] ?? "shellscript" };
  }
  const trimmed = sample.trimStart();
  if ((trimmed.startsWith("{") || trimmed.startsWith("[")) && isJson(sample)) return { kind: "json", lang: "json" };
  if (/^<\?xml|^<svg[\s>]/i.test(trimmed)) return { kind: "code", lang: "xml" };
  if (/^<!doctype html|^<html[\s>]/i.test(trimmed)) return { kind: "html" };
  if (looksLikeMarkdown(sample)) return { kind: "markdown" };
  return { kind: "text" };
}

function isJson(s: string) {
  try {
    JSON.parse(s);
    return true;
  } catch {
    return false;
  }
}

/** Headings, lists, fences or links on several lines. */
function looksLikeMarkdown(s: string) {
  const lines = s.slice(0, 4000).split("\n");
  let score = 0;
  for (const l of lines) {
    if (/^#{1,6} \S/.test(l)) score += 2;
    else if (/^```/.test(l)) score += 2;
    else if (/^\s*([-*+]|\d+\.) \S/.test(l)) score += 1;
    else if (/\[[^\]]+\]\([^)]+\)/.test(l)) score += 1;
  }
  return score >= 3;
}

/** Display name for a Shiki language id. */
export function languageLabel(lang?: string) {
  if (!lang) return "Text";
  const special: Record<string, string> = {
    shellscript: "Shell", javascript: "JavaScript", typescript: "TypeScript", tsx: "TSX", jsx: "JSX", csharp: "C#", cpp: "C++",
    "fortran-free-form": "Fortran", "fortran-fixed-form": "Fortran", "system-verilog": "SystemVerilog", "common-lisp": "Lisp",
    "emacs-lisp": "Emacs Lisp", viml: "Vim script", latex: "LaTeX", bibtex: "BibTeX", graphql: "GraphQL", sql: "SQL",
    json: "JSON", jsonc: "JSON", json5: "JSON5", yaml: "YAML", toml: "TOML", html: "HTML", xml: "XML", css: "CSS", scss: "SCSS",
    php: "PHP", matlab: "MATLAB", docker: "Dockerfile", make: "Makefile", cmake: "CMake", hcl: "HCL", ocaml: "OCaml", r: "R",
    dotenv: ".env", fsharp: "F#", asm: "Assembly", wasm: "WebAssembly", vhdl: "VHDL",
  };
  return special[lang] ?? lang.charAt(0).toUpperCase() + lang.slice(1);
}
