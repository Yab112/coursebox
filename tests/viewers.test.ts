import { describe, expect, it } from "vitest";
import { parseAnsi } from "@/lib/ansi";
import { headingsOf, normalizeMath } from "@/lib/markdown";
import { join, parseNotebook } from "@/lib/notebook";
import { parseCues } from "@/lib/subtitles";

describe("markdown helpers", () => {
  it("turns one-line $$…$$ into display math, but not inside code fences", () => {
    expect(normalizeMath("Intro\n$$x^2$$\nafter")).toBe("Intro\n\n$$\nx^2\n$$\n\nafter");
    expect(normalizeMath("```\n$$not math$$\n```")).toBe("```\n$$not math$$\n```");
    expect(normalizeMath("inline $a$ and $$b$$ here")).toBe("inline $a$ and $$b$$ here");
  });

  it("collects h2/h3 headings with GitHub-style ids, skipping code fences", () => {
    const md = "# Title\n## Set up\n```\n## not a heading\n```\n### The **math**\n## Set up\n";
    expect(headingsOf(md)).toEqual([
      { depth: 2, text: "Set up", id: "set-up" },
      { depth: 3, text: "The math", id: "the-math" },
      { depth: 2, text: "Set up", id: "set-up-1" },
    ]);
  });
});

describe("notebooks", () => {
  it("reads nbformat 4 with its language", () => {
    const nb = parseNotebook(JSON.stringify({ metadata: { language_info: { name: "R" } }, cells: [{ cell_type: "code", source: ["x <- 1\n", "x"], outputs: [] }] }));
    expect(nb?.lang).toBe("r");
    expect(join(nb!.cells[0].source)).toBe("x <- 1\nx");
  });

  it("converts nbformat 3 worksheets, headings and outputs", () => {
    const nb = parseNotebook(
      JSON.stringify({
        worksheets: [
          {
            cells: [
              { cell_type: "heading", level: 2, source: "Results" },
              { cell_type: "code", input: "plot()", prompt_number: 3, outputs: [{ output_type: "pyout", png: "iVBOR", text: "<Figure>" }, { output_type: "pyerr", ename: "E", evalue: "bad" }] },
            ],
          },
        ],
      }),
    );
    expect(join(nb!.cells[0].source)).toBe("## Results");
    expect(nb!.cells[1]).toMatchObject({ cell_type: "code", execution_count: 3 });
    expect(nb!.cells[1].outputs![0].data).toMatchObject({ "image/png": "iVBOR", "text/plain": "<Figure>" });
    expect(nb!.cells[1].outputs![1]).toMatchObject({ output_type: "error", ename: "E" });
  });

  it("returns null for something that isn't a notebook", () => {
    expect(parseNotebook("{ nope")).toBeNull();
    expect(parseNotebook('{"hello": 1}')).toBeNull();
  });
});

describe("subtitles", () => {
  it("parses SRT and WebVTT cues, dropping tags", () => {
    expect(parseCues("1\r\n00:00:01,000 --> 00:00:04,500\r\nHello <i>there</i>\r\n\r\n2\r\n00:01:02,000 --> 00:01:03,000\r\nSecond\r\nline\r\n")).toEqual([
      { start: 1, end: 4.5, text: "Hello there" },
      { start: 62, end: 63, text: "Second line" },
    ]);
    expect(parseCues("WEBVTT\n\n01:00:00.000 --> 01:00:02.000 align:start\n<v Prof>Welcome back\n")).toEqual([{ start: 3600, end: 3602, text: "Welcome back" }]);
  });
});

describe("ANSI tracebacks", () => {
  it("keeps the text and colours, drops escape codes", () => {
    const segs = parseAnsi("\x1b[0;31mZeroDivisionError\x1b[0m: division by zero \x1b[38;5;241m1\x1b[39m");
    expect(segs.map((s) => s.text).join("")).toBe("ZeroDivisionError: division by zero 1");
    expect(segs[0]).toMatchObject({ text: "ZeroDivisionError", fg: "#cf222e" });
    expect(segs[1].fg).toBeUndefined();
  });
});
