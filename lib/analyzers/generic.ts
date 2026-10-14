import type { Analyzer, Attachment, CourseManifest, Lesson, LessonType, Section } from "./types";
import { ASSET_EXT, basename, cleanTitle, dirname, extname, fileType, isJunk, naturalCompare, stableId } from "./utils";

/**
 * Fallback adapter for any folder layout:
 *  - folders become sections; deep trees get a group heading ("Week 1" › "Lecture 2")
 *  - files that belong together become ONE lesson with attachments:
 *      "01 - Intro.mp4" + "01 - Intro.pdf" (same stem / number as a video)
 *      "1. Intro.mp4"  + "1.1 slides.pdf"   (Udemy resource numbering)
 *      "Lecture 2/{video.mp4, slides.pdf}"   (one folder per lesson)
 *  - subtitles become captions, README becomes the overview, website assets are skipped
 */

const COVER_RE = /^(cover|thumbnail|poster|folder|course[-_ ]?(image|cover|art))\.(jpe?g|png|webp|gif)$/i;
const README_RE = /^(readme|index|about|overview|introduction)\.(md|markdown)$/i;
const CAPTION_EXT = new Set(["srt", "vtt"]);
const ASSET_DIR_RE = /(^|\/)(assets?|static|css|js|scripts?|fonts?|vendor|lib|libs|images?|img|media|[^/]*_files)(\/|$)/i;
const ROOT_GROUPS: { title: string; types: LessonType[] }[] = [
  { title: "Videos", types: ["video"] },
  { title: "Audio", types: ["audio"] },
  { title: "PDFs", types: ["pdf"] },
  { title: "Readings", types: ["html", "markdown"] },
  { title: "Code & Text", types: ["text"] },
  { title: "Images", types: ["image"] },
  { title: "Other Files", types: ["other"] },
];

/** Which file of a bundle is the "main" one. Lower is better. */
const PRIMARY_RANK: Record<LessonType, number> = { video: 0, audio: 1, pdf: 2, markdown: 3, html: 4, text: 5, image: 6, other: 7 };

const stripExt = (p: string) => p.replace(/\.[^./]+$/, "");
/** "lesson.en.srt" -> "lesson", "slides.pdf.pdf" -> "slides" */
const stemOf = (p: string) => stripExt(stripExt(basename(p)).replace(/\.(pdf|en|[a-z]{2}(-[a-z]{2})?)$/i, "")).toLowerCase();
/** Leading lesson number: "01 - x" -> "1", "1. x" -> "1", "1.1 x" -> "1" (resource of lesson 1) */
const leadNum = (name: string) => name.match(/^\s*0*(\d+)(?=[\s._)\-\]])/)?.[1];
const isUdemyResource = (name: string) => /^\s*\d+\.\d+[\s_-]/.test(name);

type Draft = Lesson & { num?: number; sortName: string };

function prettyTitle(name: string) {
  return cleanTitle(name.replace(/(\.[a-z0-9]{2,4})\1$/i, "$1")); // "slides.pdf.pdf"
}

function attachment(path: string): Attachment {
  return { path, title: prettyTitle(basename(path)).title, type: fileType(path) };
}

function bestPrimary(paths: string[]): string {
  return [...paths].sort((a, b) => PRIMARY_RANK[fileType(a)] - PRIMARY_RANK[fileType(b)] || naturalCompare(a, b))[0];
}

export const genericAnalyzer: Analyzer = {
  name: "generic-folders",

  async detect() {
    return true;
  },

  isAsset(path) {
    return ASSET_EXT.has(extname(path)) || (ASSET_DIR_RE.test(dirname(path)) && fileType(path) === "image");
  },

  async analyze(allFiles, read, ctx): Promise<CourseManifest> {
    let files = allFiles.filter((f) => !isJunk(f)).sort(naturalCompare);

    // Website exports: hide css/js/fonts and asset folders' non-document files.
    const isWebsite = files.some((f) => fileType(f) === "html");
    files = files.filter((f) => {
      if (ASSET_EXT.has(extname(f))) return false;
      if (isWebsite && ASSET_DIR_RE.test(dirname(f)) && !["pdf", "video", "audio"].includes(fileType(f))) return false;
      return true;
    });

    const cover = files.find((f) => !f.includes("/") && COVER_RE.test(basename(f))) ?? files.find((f) => COVER_RE.test(basename(f)));
    const readme = files.find((f) => !f.includes("/") && README_RE.test(basename(f)));

    // Captions attach to the video with the same stem in the same folder.
    const videoByStem = new Map<string, string>();
    for (const f of files) if (["video", "audio"].includes(fileType(f))) videoByStem.set(`${dirname(f)}|${stemOf(f)}`, f);
    const captionsFor = new Map<string, string[]>();
    const consumed = new Set<string>([cover, readme].filter(Boolean) as string[]);
    for (const f of files) {
      if (!CAPTION_EXT.has(extname(f))) continue;
      const v = videoByStem.get(`${dirname(f)}|${stemOf(f)}`);
      if (v) {
        captionsFor.set(v, [...(captionsFor.get(v) ?? []), f]);
        consumed.add(f);
      }
    }

    const remaining = files.filter((f) => !consumed.has(f));
    const byDir = new Map<string, string[]>();
    const childDirs = new Map<string, Set<string>>();
    for (const f of remaining) {
      const d = dirname(f);
      byDir.set(d, [...(byDir.get(d) ?? []), f]);
      // register all ancestor relationships
      let cur = d;
      while (cur) {
        const parent = dirname(cur);
        if (!childDirs.has(parent)) childDirs.set(parent, new Set());
        childDirs.get(parent)!.add(cur);
        cur = parent;
      }
    }

    const makeLesson = (primary: string, others: string[], titleOverride?: string): Draft => {
      const name = basename(primary);
      const { title, num } = titleOverride ? cleanTitle(titleOverride) : prettyTitle(name);
      const meta: Record<string, unknown> = {};
      const caps = captionsFor.get(primary);
      if (caps) meta.captionPaths = caps;
      const atts = others.sort(naturalCompare).map(attachment);
      return {
        id: stableId(primary),
        title,
        order: 0,
        type: fileType(primary),
        path: primary,
        attachments: atts.length ? atts : undefined,
        meta: Object.keys(meta).length ? meta : undefined,
        num,
        sortName: titleOverride ?? name,
      };
    };

    /** Bundle the files of one folder into lessons. */
    const bundleFolder = (list: string[]): Draft[] => {
      const media = list.filter((f) => ["video", "audio"].includes(fileType(f)));
      const groups = new Map<string, string[]>();

      // 1) same stem as a media file  2) Udemy "N.M" resources -> lesson N  3) same number as exactly one media file
      const mediaByStem = new Map(media.map((m) => [stemOf(m), m]));
      const mediaByNum = new Map<string, string[]>();
      for (const m of media) {
        const n = leadNum(basename(m));
        if (n) mediaByNum.set(n, [...(mediaByNum.get(n) ?? []), m]);
      }
      for (const f of list) {
        let owner = f;
        if (!media.includes(f)) {
          const name = basename(f);
          const n = leadNum(name);
          const byStem = mediaByStem.get(stemOf(f));
          const byNum = n && mediaByNum.get(n)?.length === 1 ? mediaByNum.get(n)![0] : undefined;
          if (byStem) owner = byStem;
          else if (byNum && (isUdemyResource(name) || media.length > 0)) owner = byNum;
        }
        groups.set(owner, [...(groups.get(owner) ?? []), f]);
      }
      return [...groups.entries()].map(([owner, members]) => makeLesson(owner, members.filter((m) => m !== owner)));
    };

    /** A leaf folder that is really one lesson: one clear main file plus extras. */
    const asSingleLesson = (dir: string): Draft | undefined => {
      if (childDirs.get(dir)?.size) return undefined;
      const list = byDir.get(dir) ?? [];
      if (!list.length || list.length > 12) return undefined;
      // Files numbered on their own ("01 - Intro.mp4", "02 - Setup.md") mean this folder is a section.
      const nums = new Set(list.filter((f) => !isUdemyResource(basename(f))).map((f) => leadNum(basename(f))).filter(Boolean));
      if (nums.size >= 2) return undefined;
      if (list.filter((f) => ["markdown", "html"].includes(fileType(f))).length > 1) return undefined;
      const media = list.filter((f) => ["video", "audio"].includes(fileType(f)));
      if (media.length > 1) return undefined;
      if (!media.length) {
        const docs = list.filter((f) => ["pdf", "markdown", "html"].includes(fileType(f)));
        if (docs.length !== 1) return undefined;
      }
      const primary = media[0] ?? bestPrimary(list);
      return makeLesson(primary, list.filter((f) => f !== primary), basename(dir));
    };

    const sortLessons = (ls: Draft[]): Lesson[] =>
      ls
        .sort((a, b) => {
          if (a.num !== undefined && b.num !== undefined && a.num !== b.num) return a.num - b.num;
          return naturalCompare(a.sortName, b.sortName);
        })
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        .map(({ num, sortName, ...l }, i) => ({ ...l, order: i }));

    const sections: Section[] = [];
    const allAtRoot = remaining.every((f) => !f.includes("/"));

    if (allAtRoot) {
      const drafts = bundleFolder(remaining);
      for (const g of ROOT_GROUPS) {
        const ls = drafts.filter((d) => g.types.includes(d.type));
        if (ls.length) sections.push({ id: stableId(g.title, "s"), title: g.title, order: 0, lessons: sortLessons(ls) });
      }
    } else {
      const folderLessons = new Map<string, Draft>(); // leaf dir -> lesson
      for (const dir of byDir.keys()) {
        if (!dir) continue;
        const parent = dirname(dir);
        const siblings = [...(childDirs.get(parent) ?? [])];
        // Only treat leaves as lessons when their siblings follow the same pattern.
        const leafSiblings = siblings.filter((s) => asSingleLesson(s));
        if (leafSiblings.length >= 2 && leafSiblings.length >= siblings.length * 0.6) {
          const l = asSingleLesson(dir);
          if (l) folderLessons.set(dir, l);
        }
      }

      const sectionDrafts = new Map<string, Draft[]>();
      for (const [dir, list] of byDir) {
        if (folderLessons.has(dir)) {
          const parent = dirname(dir);
          sectionDrafts.set(parent, [...(sectionDrafts.get(parent) ?? []), folderLessons.get(dir)!]);
        } else {
          sectionDrafts.set(dir, [...(sectionDrafts.get(dir) ?? []), ...bundleFolder(list)]);
        }
      }

      const dirs = [...sectionDrafts.keys()].sort((a, b) => (a === "" ? -1 : b === "" ? 1 : naturalCompare(a, b)));
      const depthOf = (d: string) => (d ? d.split("/").length : 0);
      const deep = dirs.some((d) => depthOf(d) >= 2);
      for (const d of dirs) {
        const segs = d ? d.split("/").map((s) => cleanTitle(s).title) : [];
        let title = d === "" ? "Course Files" : segs.join(" / ");
        let group: string | undefined;
        if (deep && segs.length >= 2) {
          group = segs[0];
          title = segs.slice(1).join(" / ");
        } else if (deep && segs.length === 1 && dirs.some((o) => o.startsWith(d + "/"))) {
          group = segs[0];
          title = "Overview";
        }
        sections.push({ id: stableId(d || "(root)", "s"), title, group, order: 0, lessons: sortLessons(sectionDrafts.get(d)!) });
      }
    }

    sections.forEach((s, i) => (s.order = i));

    // Title & description from the README when there is one.
    let title = cleanTitle(ctx.archiveName ?? "Untitled course").title;
    let description: string | undefined;
    if (readme) {
      try {
        const md = await read(readme);
        const h1 = md.match(/^#\s+(.+)$/m)?.[1]?.trim();
        if (h1 && h1.length < 120) title = h1.replace(/[*_`]/g, "");
        description = md
          .split(/\n\s*\n/)
          .map((p) => p.trim())
          .find((p) => p && !p.startsWith("#") && !p.startsWith("!") && !p.startsWith("|") && !p.startsWith("```"))
          ?.replace(/[*_`>]/g, "")
          .slice(0, 600);
      } catch {}
    }

    return {
      id: ctx.courseId,
      title,
      description,
      overviewPath: readme,
      coverPath: cover,
      sourceKey: `folder:${(ctx.archiveName ?? title).toLowerCase()}`,
      source: "Folder",
      sections,
    };
  },
};
