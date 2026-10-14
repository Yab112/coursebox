import { describe, expect, it } from "vitest";
import { analyzeCourse, stripCommonRoot } from "@/lib/analyzers";
import { cleanTitle, parseLenientList } from "@/lib/analyzers/utils";

const read = async () => "";

describe("generic folder analyzer", () => {
  it("maps folders to sections and natural-sorts lessons by leading numbers", async () => {
    const files = [
      "02 - Advanced/10 - wrap up.mp4",
      "02 - Advanced/2 - deep_dive.mp4",
      "02 - Advanced/2 - deep_dive.en.srt",
      "01 - Getting Started/01 - intro_video.mp4",
      "01 - Getting Started/02 - slides.pdf",
      "__MACOSX/01 - Getting Started/._01 - intro_video.mp4",
      ".DS_Store",
      "cover.jpg",
    ];
    const { manifest, analyzer } = await analyzeCourse(files, read, { courseId: "x", archiveName: "my_cool-course" });
    expect(analyzer).toBe("generic-folders");
    expect(manifest.title).toBe("My Cool Course");
    expect(manifest.coverPath).toBe("cover.jpg");
    expect(manifest.sections.map((s) => s.title)).toEqual(["Getting Started", "Advanced"]);
    expect(manifest.sections[0].lessons.map((l) => [l.title, l.type])).toEqual([
      ["Intro Video", "video"],
      ["Slides", "pdf"],
    ]);
    const adv = manifest.sections[1].lessons;
    expect(adv.map((l) => l.title)).toEqual(["Deep Dive", "Wrap Up"]);
    expect(adv[0].meta?.captionPaths).toEqual(["02 - Advanced/2 - deep_dive.en.srt"]);
  });

  it("flattens nested folders into 'Folder / Subfolder' titles", async () => {
    const { manifest } = await analyzeCourse(["week_1/day-2/notes.md", "week_1/a.txt"], read, { courseId: "x" });
    expect(manifest.sections.map((s) => s.title)).toEqual(["Week 1", "Week 1 / Day 2"]);
  });

  it("groups root-level files by type", async () => {
    const { manifest } = await analyzeCourse(["b.pdf", "a.mp4", "notes.md", "weird.xyz"], read, { courseId: "x" });
    expect(manifest.sections.map((s) => s.title)).toEqual(["Videos", "PDFs", "Documents", "Other Files"]);
    expect(manifest.sections[3].lessons[0].type).toBe("other");
  });

  it("strips a single wrapping root folder", () => {
    const { root, strip } = stripCommonRoot(["Course/a.pdf", "Course/b/c.mp4"]);
    expect(root).toBe("Course");
    expect(strip("Course/b/c.mp4")).toBe("b/c.mp4");
    expect(stripCommonRoot(["a.pdf", "b/c.pdf"]).root).toBeUndefined();
  });

  it("cleans titles", () => {
    expect(cleanTitle("01 - intro_video.mp4")).toEqual({ title: "Intro Video", num: 1 });
    expect(cleanTitle("Lecture 3.pdf").title).toBe("Lecture 3");
    expect(parseLenientList("['Graduate', 'Undergraduate']")).toEqual(["Graduate", "Undergraduate"]);
  });
});
