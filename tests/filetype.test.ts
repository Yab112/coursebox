import { bundledLanguages } from "shiki";
import { describe, expect, it } from "vitest";
import { detectFile, looksBinary } from "@/lib/filetype";

describe("file type detection", () => {
  it.each([
    ["notes/intro.md", "markdown"],
    ["lab1.ipynb", "notebook"],
    ["data/scores.csv", "table"],
    ["data/scores.tsv", "table"],
    ["lec1.srt", "subtitles"],
    ["captions.vtt", "subtitles"],
    ["page.html", "html"],
    ["config.json", "json"],
    ["notes.txt", "text"],
  ])("%s -> %s by extension", (path, kind) => {
    expect(detectFile(path).kind).toBe(kind);
  });

  it("finds the language for code by extension and by file name", () => {
    expect(detectFile("ps1/solver.py")).toEqual({ kind: "code", lang: "python" });
    expect(detectFile("src/main.rs").lang).toBe("rust");
    expect(detectFile("lab/fft.m").lang).toBe("matlab");
    expect(detectFile("sketch/blink.ino").lang).toBe("cpp");
    expect(detectFile("project/Makefile")).toEqual({ kind: "code", lang: "make" });
    expect(detectFile("Dockerfile").lang).toBe("docker");
    expect(detectFile("CMakeLists.txt").lang).toBe("cmake");
  });

  it("looks inside files without a useful name", () => {
    expect(detectFile("bin/run", "#!/usr/bin/env python3\nprint(1)\n")).toEqual({ kind: "code", lang: "python" });
    expect(detectFile("scripts/setup", "#!/bin/bash\nset -e\n").lang).toBe("shellscript");
    expect(detectFile("data/export", '{"a": [1, 2]}').kind).toBe("json");
    expect(detectFile("notes/README", "# Title\n\n- one\n- two\n\nSee [docs](x.md)\n").kind).toBe("markdown");
    expect(detectFile("figure", '<?xml version="1.0"?><svg/>').lang).toBe("xml");
    expect(detectFile("plain", "just some words\nand more words").kind).toBe("text");
    expect(detectFile("broken", "{ not json").kind).toBe("text");
  });

  it("tells binary from text", () => {
    expect(looksBinary(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0, 1, 2]))).toBe(true);
    expect(looksBinary(new TextEncoder().encode("hello\nworld\t✓"))).toBe(false);
  });

  it("only uses languages the highlighter has", () => {
    const paths = [
      "a.py", "a.js", "a.ts", "a.tsx", "a.java", "a.c", "a.cpp", "a.cs", "a.go", "a.rs", "a.rb", "a.php", "a.sh", "a.ps1", "a.m",
      "a.r", "a.jl", "a.lua", "a.hs", "a.ml", "a.ex", "a.scm", "a.rkt", "a.lisp", "a.f90", "a.f", "a.v", "a.sv", "a.vhd", "a.asm",
      "a.sql", "a.yaml", "a.toml", "a.ini", "a.tex", "a.bib", "a.css", "a.scss", "a.xml", "a.gradle", "a.diff", "a.proto", "a.sol",
      "a.env", "a.tf", "a.nix", "a.zig", "a.dart", "a.kt", "a.swift", "a.scala", "a.clj", "a.erl", "a.pl", "a.bat", "a.vim",
      "Makefile", "Dockerfile", "CMakeLists.txt", "Gemfile",
    ];
    const missing = paths.map((p) => detectFile(p).lang!).filter((l) => !(l in bundledLanguages));
    expect(missing).toEqual([]);
  });
});
