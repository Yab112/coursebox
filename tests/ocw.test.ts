import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { analyzeCourse } from "@/lib/analyzers";
import { ocwAnalyzer } from "@/lib/analyzers/ocw";

const dir = path.join(__dirname, "fixtures/ocw");

function walk(d: string, base = ""): string[] {
  return readdirSync(d).flatMap((n) => {
    const rel = base ? `${base}/${n}` : n;
    return statSync(path.join(d, n)).isDirectory() ? walk(path.join(d, n), rel) : [rel];
  });
}

const files = [
  ...walk(dir).filter((f) => f.endsWith(".json")),
  ...readFileSync(path.join(dir, "files.txt"), "utf8").split("\n").filter(Boolean),
];
const read = async (p: string) => readFileSync(path.join(dir, p), "utf8");

describe("MIT OCW analyzer", async () => {
  const { manifest, analyzer } = await analyzeCourse(files, read, { courseId: "c1", archiveName: "18.657-fall-2015" });

  it("is detected via root data.json", async () => {
    expect(analyzer).toBe("mit-ocw");
    expect(await ocwAnalyzer.detect(["foo/bar.pdf"], read)).toBe(false);
  });

  it("reads course metadata, parsing python-repr lists", () => {
    expect(manifest.title).toBe("Mathematics of Machine Learning");
    expect(manifest.instructor).toBe("Prof. Philippe Rigollet");
    expect(manifest.level).toBe("Graduate");
    expect(manifest.term).toBe("Fall 2015");
    expect(manifest.coverPath).toBe("static_resources/1db49f0074b5bdd4f63abac031cc5a63_18-657f15.jpg");
    expect(manifest.sourceKey).toBe("ocw:18.657-fall-2015");
  });

  it("orders sections: Lecture Notes before Assignments", () => {
    expect(manifest.sections.map((s) => s.title)).toEqual(["Lecture Notes", "Assignments"]);
  });

  it("puts full notes first, natural-sorts lectures and renames them with topics", () => {
    const titles = manifest.sections[0].lessons.map((l) => l.title);
    expect(titles[0]).toBe("Mathematics of Machine Learning Full Lecture Notes");
    expect(titles.slice(1)).toEqual(["L1 · Introduction", "L2 · Binary Classification", "L10 · Support Vector Machines"]);
    expect(manifest.sections[0].lessons[1].path).toBe("static_resources/7d229ed907a6d1410a3736c98a9d78d8_MIT18_657F15_L1.pdf");
    expect(manifest.sections[0].lessons[1].type).toBe("pdf");
  });

  it("pairs assignments with solutions and skips cover/thumbnail images", () => {
    const a = manifest.sections[1].lessons;
    expect(a.map((l) => l.title)).toEqual(["Assignment 1", "Assignment 2"]);
    expect(a[0].meta?.solution).toMatchObject({ path: "static_resources/d61d6c8e64ed20efff3e6ca4fc88742b_MIT18_657F15_PS1_Sol.pdf" });
    expect(a[1].meta?.solution).toBeUndefined();
    const all = manifest.sections.flatMap((s) => s.lessons.map((l) => l.path));
    expect(all.some((p) => p.endsWith(".jpg"))).toBe(false);
  });

  it("turns pages into extra pages with in-app lesson links", () => {
    const titles = manifest.extraPages!.map((p) => p.title);
    expect(titles.slice(0, 2)).toEqual(["Syllabus", "Calendar"]);
    const ln = manifest.extraPages!.find((p) => p.title === "Lecture Notes")!;
    expect(ln.html).toContain(`href="#lesson=${manifest.sections[0].lessons[1].id}"`);
  });

  it("keeps lesson ids stable across re-analysis", async () => {
    const again = await analyzeCourse(files, read, { courseId: "c1" });
    expect(again.manifest.sections[0].lessons.map((l) => l.id)).toEqual(manifest.sections[0].lessons.map((l) => l.id));
  });
});
