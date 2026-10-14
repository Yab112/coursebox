import type { Analyzer, CourseManifest, Lesson, LessonType, Section } from "./types";
import { basename, cleanTitle, dirname, extname, fileType, isJunk, naturalCompare, stableId } from "./utils";

/**
 * Fallback adapter: folders become sections, files become lessons.
 * Works for Udemy-style downloads ("01 - Intro/01 - Welcome.mp4") and arbitrary folders.
 */

const COVER_RE = /^(cover|thumbnail|poster|folder|course[-_ ]?image)\.(jpe?g|png|webp|gif)$/i;
const CAPTION_EXT = new Set(["srt", "vtt"]);
const ROOT_GROUPS: { title: string; types: LessonType[] }[] = [
  { title: "Videos", types: ["video"] },
  { title: "PDFs", types: ["pdf"] },
  { title: "Documents", types: ["html", "markdown", "text"] },
  { title: "Audio", types: ["audio"] },
  { title: "Images", types: ["image"] },
  { title: "Other Files", types: ["other"] },
];

const stripExt = (p: string) => p.replace(/\.[^./]+$/, "");

export const genericAnalyzer: Analyzer = {
  name: "generic-folders",

  async detect() {
    return true;
  },

  async analyze(allFiles, _read, ctx): Promise<CourseManifest> {
    const files = allFiles.filter((f) => !isJunk(f)).sort(naturalCompare);

    const cover = files.find((f) => COVER_RE.test(basename(f)));

    // Subtitles next to a video ("lesson.mp4" + "lesson.en.srt") become captions, not lessons.
    const videos = new Map<string, string>();
    for (const f of files) if (fileType(f) === "video") videos.set(stripExt(f).toLowerCase(), f);
    const captionsFor = new Map<string, string[]>();
    const captionFiles = new Set<string>();
    for (const f of files) {
      if (!CAPTION_EXT.has(extname(f))) continue;
      let key = stripExt(f).toLowerCase();
      let video = videos.get(key);
      while (!video && /\.[^./]+$/.test(key)) {
        key = stripExt(key); // "lesson.en" -> "lesson"
        video = videos.get(key);
      }
      if (video) {
        captionsFor.set(video, [...(captionsFor.get(video) ?? []), f]);
        captionFiles.add(f);
      }
    }

    const lessonFiles = files.filter((f) => f !== cover && !captionFiles.has(f));

    const toLesson = (path: string): Lesson & { num?: number } => {
      const { title, num } = cleanTitle(basename(path));
      const meta: Record<string, unknown> = {};
      const caps = captionsFor.get(path);
      if (caps) meta.captionPaths = caps;
      return { id: stableId(path), title, order: 0, type: fileType(path), path, meta, num };
    };

    const sortLessons = (ls: (Lesson & { num?: number })[]): Lesson[] =>
      ls
        .sort((a, b) => {
          if (a.num !== undefined && b.num !== undefined && a.num !== b.num) return a.num - b.num;
          return naturalCompare(basename(a.path), basename(b.path));
        })
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        .map(({ num: _num, ...l }, i) => ({ ...l, order: i }));

    const sections: Section[] = [];
    const allAtRoot = lessonFiles.every((f) => !f.includes("/"));

    if (allAtRoot) {
      for (const g of ROOT_GROUPS) {
        const ls = lessonFiles.filter((f) => g.types.includes(fileType(f))).map(toLesson);
        if (ls.length) sections.push({ id: stableId(g.title, "s"), title: g.title, order: 0, lessons: sortLessons(ls) });
      }
    } else {
      const byDir = new Map<string, string[]>();
      for (const f of lessonFiles) {
        const d = dirname(f);
        byDir.set(d, [...(byDir.get(d) ?? []), f]);
      }
      const dirs = [...byDir.keys()].sort((a, b) => {
        if (a === "") return -1;
        if (b === "") return 1;
        return naturalCompare(a, b);
      });
      for (const d of dirs) {
        const title = d === "" ? "Course Files" : d.split("/").map((seg) => cleanTitle(seg).title).join(" / ");
        sections.push({
          id: stableId(d || "(root)", "s"),
          title,
          order: 0,
          lessons: sortLessons(byDir.get(d)!.map(toLesson)),
        });
      }
    }

    sections.forEach((s, i) => (s.order = i));

    const rawTitle = ctx.archiveName ?? "Untitled course";
    const title = cleanTitle(rawTitle).title;
    const readme = files.find((f) => /^readme\.(md|txt)$/i.test(f));

    return {
      id: ctx.courseId,
      title,
      coverPath: cover,
      sourceKey: `folder:${title.toLowerCase()}`,
      source: readme ? "Folder (with README)" : "Folder",
      sections,
    };
  },
};
