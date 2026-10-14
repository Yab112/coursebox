import { describe, expect, it } from "vitest";
import type { CourseManifest } from "@/lib/analyzers";
import { loadFixture } from "./load-fixture";

const lessons = (m: CourseManifest) => m.sections.flatMap((s) => s.lessons);
const section = (m: CourseManifest, title: string, group?: string) =>
  m.sections.find((s) => s.title === title && (group === undefined || s.group === group))!;

describe("OCW 6.006 — videos, captions, notes, templates", async () => {
  const { manifest } = await loadFixture("ocw-6006").analyze();

  it("links captions and transcripts to videos instead of listing 3play files", () => {
    const l1 = lessons(manifest).find((l) => l.title.startsWith("Lecture 1:"))!;
    expect(l1.type).toBe("video");
    expect(l1.path).toBe("youtube:ZA-tUyM_y7s");
    expect((l1.meta?.captionPaths as string[]).length).toBeGreaterThan(0);
    expect(l1.meta?.transcriptPath).toMatch(/\.pdf$/);
    expect(lessons(manifest).some((l) => /3play|caption|transcript/i.test(l.title))).toBe(false);
  });

  it("attaches 'Lecture N' notes to the 'Lecture N' video", () => {
    const l12 = lessons(manifest).find((l) => l.title.startsWith("Lecture 12"))!;
    expect(l12.attachments?.map((a) => a.title)).toEqual(["Notes"]);
    expect(manifest.sections.some((s) => s.title === "Lecture Notes")).toBe(false);
  });

  it("pairs problem sets with solutions and templates, and quizzes with solutions", () => {
    const ps0 = section(manifest, "Assignments").lessons[0];
    expect(ps0.title).toBe("Problem Set 0");
    expect(ps0.solution?.path).toMatch(/ps0-solutions\.pdf$/);
    expect(ps0.attachments).toEqual([expect.objectContaining({ title: "Template", type: "other" })]);
    const quizzes = section(manifest, "Quizzes").lessons;
    expect(quizzes.map((q) => [q.title, !!q.solution])).toEqual([
      ["Quiz 1", true],
      ["Quiz 3", true], // parent-less resource re-homed by its type
    ]);
  });

  it("splits recitation notes out of 'Lecture Notes' and leaves nothing unplaced", () => {
    expect(section(manifest, "Problem-solving Notes").lessons.map((l) => l.title)).toEqual(["Recitation 1", "Recitation 2"]);
    expect(manifest.unplacedCount).toBe(0);
  });
});

describe("OCW 6.0001 — nested pages with in-class questions", async () => {
  const { manifest } = await loadFixture("ocw-60001").analyze();

  it("turns nested pages into a grouped section with an interactive page lesson first", () => {
    const s = section(manifest, "Lecture 1", "In-Class Questions and Video Solutions");
    expect(s.lessons[0]).toMatchObject({ type: "html", title: "In-class questions for Lecture 1" });
    expect(s.lessons[0].meta?.html).toContain("multiple-choice");
  });

  it("merges 'Lecture 1 Video Solutions' into 'Lecture 1' and de-duplicates videos", () => {
    const s = section(manifest, "Lecture 1", "In-Class Questions and Video Solutions");
    expect(s.lessons.slice(1).map((l) => l.title)).toEqual(["Shell vs. Editor", "Python vs. Math", "Bindings"]);
    expect(manifest.sections.some((x) => /video solutions/i.test(x.title))).toBe(false);
    const paths = lessons(manifest).map((l) => l.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("keeps the main lecture videos ahead of side material", () => {
    expect(manifest.sections[0].title).toBe("Lecture Videos");
  });
});

describe("OCW 18.06SC — units > sessions driven by page links", async () => {
  const { manifest } = await loadFixture("ocw-1806sc").analyze();
  const unit = "Unit I: Ax = b and the Four Subspaces";

  it("orders sessions by the site navigation, grouped under their unit", () => {
    expect(manifest.sections.filter((s) => s.group === unit).map((s) => s.title)).toEqual([
      "Introduction",
      "The Geometry of Linear Equations",
      "Column Space and Nullspace",
      "Exam 1",
    ]);
  });

  it("lists a session's items in the order the session page links them, with readable titles", () => {
    const s = section(manifest, "Column Space and Nullspace", unit);
    expect(s.lessons.map((l) => [l.type, l.title])).toEqual([
      ["html", "Session overview"],
      ["video", "Column Space and Nullspace"],
      ["pdf", "Lecture summary"],
      ["video", "Vector Subspaces"],
      ["pdf", "Problems"],
    ]);
    expect(s.lessons[4].solution?.path).toMatch(/sol\.pdf$/i);
  });

  it("pairs exam PDFs with their solution ('ex1' / 'ex1s')", () => {
    const exam = section(manifest, "Exam 1", unit).lessons.find((l) => l.type === "pdf")!;
    expect(exam.solution).toBeDefined();
  });

  it("does not list figures that are embedded in the session page", () => {
    expect(lessons(manifest).some((l) => l.type === "image")).toBe(false);
    expect(manifest.unplacedCount).toBe(0);
  });

  it("keeps unit pages out of the header tabs", () => {
    expect(manifest.extraPages?.some((p) => p.title === unit)).toBeFalsy();
  });
});
