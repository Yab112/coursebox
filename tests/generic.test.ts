import { describe, expect, it } from "vitest";
import { analyzeCourse, stripCommonRoot } from "@/lib/analyzers";
import { cleanTitle, parseLenientList } from "@/lib/analyzers/utils";

const noRead = async () => "";
const analyze = (files: string[], archiveName?: string, read = noRead) =>
  analyzeCourse(files, read, { courseId: "x", archiveName }).then((r) => r.manifest);
const titles = (m: Awaited<ReturnType<typeof analyze>>) => m.sections.map((s) => s.title);

describe("generic folder analyzer", () => {
  it("maps folders to sections and natural-sorts lessons by leading numbers", async () => {
    const m = await analyze(
      [
        "02 - Advanced/10 - wrap up.mp4",
        "02 - Advanced/2 - deep_dive.mp4",
        "02 - Advanced/2 - deep_dive.en.srt",
        "01 - Getting Started/01 - intro_video.mp4",
        "01 - Getting Started/02 - slides.pdf",
        "__MACOSX/01 - Getting Started/._01 - intro_video.mp4",
        ".DS_Store",
        "cover.jpg",
      ],
      "my_cool-course",
    );
    expect(m.title).toBe("My Cool Course");
    expect(m.coverPath).toBe("cover.jpg");
    expect(titles(m)).toEqual(["Getting Started", "Advanced"]);
    expect(m.sections[0].lessons.map((l) => [l.title, l.type])).toEqual([
      ["Intro Video", "video"],
      ["Slides", "pdf"],
    ]);
    const adv = m.sections[1].lessons;
    expect(adv.map((l) => l.title)).toEqual(["Deep Dive", "Wrap Up"]);
    expect(adv[0].meta?.captionPaths).toEqual(["02 - Advanced/2 - deep_dive.en.srt"]);
    expect(m.unplacedCount).toBe(0);
  });

  it("bundles files that share a video's stem or number into one lesson", async () => {
    const m = await analyze([
      "S1/01 - Intro.mp4",
      "S1/01 - Intro.pdf",
      "S1/01 - Intro.en.vtt",
      "S1/02 - Variables.mp4",
      "S1/02 - exercises.zip",
      "S1/03 - Reading.pdf",
    ]);
    const ls = m.sections[0].lessons;
    expect(ls.map((l) => l.title)).toEqual(["Intro", "Variables", "Reading"]);
    expect(ls[0].attachments?.map((a) => a.path)).toEqual(["S1/01 - Intro.pdf"]);
    expect(ls[0].meta?.captionPaths).toEqual(["S1/01 - Intro.en.vtt"]);
    expect(ls[1].attachments?.map((a) => a.title)).toEqual(["Exercises"]);
  });

  it("attaches Udemy 'N.M' resources to lecture N", async () => {
    const m = await analyze([
      "1. Welcome/1. Introduction.mp4",
      "1. Welcome/1. Introduction.srt",
      "1. Welcome/1.1 course-slides.pdf.pdf",
      "1. Welcome/2. Setup.mp4",
      "1. Welcome/2.1 setup guide.html",
      "1. Welcome/2.2 starter-code.zip",
    ]);
    const [intro, setup] = m.sections[0].lessons;
    expect(intro.title).toBe("Introduction");
    expect(intro.attachments?.map((a) => a.title)).toEqual(["Course Slides"]);
    expect(setup.attachments?.map((a) => a.path)).toEqual(["1. Welcome/2.1 setup guide.html", "1. Welcome/2.2 starter-code.zip"]);
  });

  it("treats one-folder-per-lesson layouts as lessons inside week sections", async () => {
    const m = await analyze([
      "Week 1/Lecture 1 - Basics/video.mp4",
      "Week 1/Lecture 1 - Basics/slides.pdf",
      "Week 1/Lecture 2 - Loops/video.mp4",
      "Week 1/Lecture 2 - Loops/code.py",
      "Week 2/Lecture 3 - Functions/lecture.mp4",
      "Week 2/Lecture 4 - Recursion/notes.pdf",
      "Week 2/Lecture 4 - Recursion/extra.txt",
    ]);
    expect(titles(m)).toEqual(["Week 1", "Week 2"]);
    expect(m.sections[0].lessons.map((l) => l.title)).toEqual(["Lecture 1 · Basics", "Lecture 2 · Loops"]);
    expect(m.sections[0].lessons[0].attachments?.[0].path).toBe("Week 1/Lecture 1 - Basics/slides.pdf");
    expect(m.sections[1].lessons[1]).toMatchObject({ type: "pdf", path: "Week 2/Lecture 4 - Recursion/notes.pdf" });
  });

  it("keeps numbered folders as sections even when each has a single video", async () => {
    const m = await analyze([
      "Course/01 - Getting Started/01 - Welcome.mp4",
      "Course/01 - Getting Started/01 - Welcome.pdf",
      "Course/01 - Getting Started/02 - Setup notes.md",
      "Course/02 - Basics/1. Variables.mp4",
      "Course/02 - Basics/1.1 cheatsheet.pdf",
      "Course/02 - Basics/2. hello.py",
      "Course/02 - Basics/3. bundle.zip",
    ]);
    expect(titles(m)).toEqual(["Getting Started", "Basics"]);
    expect(m.sections[0].lessons.map((l) => l.title)).toEqual(["Welcome", "Setup Notes"]);
    expect(m.sections[1].lessons.map((l) => l.title)).toEqual(["Variables", "Hello", "Bundle"]);
  });

  it("groups deep trees under their top folder", async () => {
    const m = await analyze(["week_1/day-2/notes.md", "week_1/day-2/more.md", "week_1/a.txt", "week_2/b.pdf"]);
    expect(m.sections.map((s) => [s.group, s.title])).toEqual([
      ["Week 1", "Overview"],
      ["Week 1", "Day 2"],
      [undefined, "Week 2"],
    ]);
  });

  it("groups root-level files by type", async () => {
    const m = await analyze(["b.pdf", "a.mp4", "notes.md", "weird.xyz"]);
    expect(titles(m)).toEqual(["Videos", "PDFs", "Readings", "Other Files"]);
    expect(m.sections[3].lessons[0].type).toBe("other");
  });

  it("uses README for title, description and overview", async () => {
    const read = async () => "# Deep Learning 101\n\nA hands-on course about neural nets.\n\n## Setup\n";
    const m = await analyze(["README.md", "01 intro.pdf"], "dl", read);
    expect(m.title).toBe("Deep Learning 101");
    expect(m.description).toBe("A hands-on course about neural nets.");
    expect(m.overviewPath).toBe("README.md");
    expect(m.sections.flatMap((s) => s.lessons).map((l) => l.path)).toEqual(["01 intro.pdf"]);
  });

  it("skips website assets and tooling folders", async () => {
    const m = await analyze([
      "site/index.html",
      "site/page2.html",
      "site/css/style.css",
      "site/js/app.js",
      "site/images/logo.png",
      "site/node_modules/x/index.js",
      "code/.ipynb_checkpoints/a-checkpoint.ipynb",
      "code/a.ipynb",
    ]);
    const paths = m.sections.flatMap((s) => s.lessons).map((l) => l.path);
    expect(paths.sort()).toEqual(["code/a.ipynb", "site/index.html", "site/page2.html"]);
  });

  it("strips nested wrapping folders", () => {
    const { root, strip } = stripCommonRoot(["Course/Course/a.pdf", "Course/Course/b/c.mp4"]);
    expect(root).toBe("Course");
    expect(strip("Course/Course/b/c.mp4")).toBe("b/c.mp4");
    expect(stripCommonRoot(["a.pdf", "b/c.pdf"]).root).toBeUndefined();
  });

  it("cleans titles", () => {
    expect(cleanTitle("01 - intro_video.mp4")).toEqual({ title: "Intro Video", num: 1 });
    expect(cleanTitle("Lecture 3.pdf").title).toBe("Lecture 3");
    expect(parseLenientList("['Graduate', 'Undergraduate']")).toEqual(["Graduate", "Undergraduate"]);
  });
});

describe("coverage safety net", () => {
  it("puts content files no analyzer placed into Additional Materials", async () => {
    // The OCW analyzer would ignore stray files; simulate with an OCW-detected course.
    const read = async (p: string) => (p === "data.json" ? JSON.stringify({ course_title: "T" }) : "{}");
    const { manifest } = await analyzeCourse(
      ["data.json", "static_resources/abc_extra-handout.pdf", "static_shared/js/app.js", "favicon.ico"],
      read,
      { courseId: "x" },
    );
    const extra = manifest.sections.find((s) => s.title === "Additional Materials");
    expect(extra?.lessons.map((l) => l.path)).toEqual(["static_resources/abc_extra-handout.pdf"]);
    expect(manifest.unplacedCount).toBe(1);
  });
});
