import { describe, expect, it } from "vitest";
import { analyzers } from "@/lib/analyzers";
import { buildXray } from "@/lib/xray";
import { loadFixture } from "./load-fixture";

describe("course X-ray", async () => {
  const f = loadFixture("ocw-6006");
  const { manifest, analyzer } = await f.analyze();
  const files = [...new Set(f.files), ".DS_Store", "__MACOSX/._data.json"];
  const xray = buildXray("6.006-spring-2020", analyzer, files, manifest, analyzers.find((a) => a.name === analyzer)?.isAsset);
  const byPath = new Map(xray.files.map((x) => [x.path, x.dest]));

  it("accounts for every file exactly once", () => {
    expect(xray.files.map((x) => x.path)).toEqual(files);
    expect(xray.stats.files).toBe(files.length);
  });

  it("mirrors the manifest's sections and lessons", () => {
    expect(xray.title).toBe("Introduction to Algorithms");
    expect(xray.sections.map((s) => s.title)).toEqual(manifest.sections.map((s) => s.title));
    expect(xray.stats.lessons).toBe(manifest.sections.reduce((n, s) => n + s.lessons.length, 0));
  });

  it("points lesson files, solutions and attachments at their lesson", () => {
    manifest.sections.forEach((s, si) =>
      s.lessons.forEach((l, li) => {
        if (byPath.has(l.path)) expect(byPath.get(l.path)).toEqual({ kind: "lesson", section: si, lesson: li });
        if (l.solution) expect(byPath.get(l.solution.path)).toEqual({ kind: "solution", section: si, lesson: li });
        for (const a of l.attachments ?? []) expect(byPath.get(a.path)).toMatchObject({ kind: "attachment", section: si, lesson: li });
      }),
    );
    expect(xray.stats.solutions).toBeGreaterThan(0);
  });

  it("marks metadata as structure and junk as junk", () => {
    expect(byPath.get("data.json")).toEqual({ kind: "structure" });
    expect(byPath.get(".DS_Store")).toEqual({ kind: "junk" });
    expect(byPath.get("__MACOSX/._data.json")).toEqual({ kind: "junk" });
    expect(xray.stats.skipped).toBeGreaterThanOrEqual(2);
  });
});
