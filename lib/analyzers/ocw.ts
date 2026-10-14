import type { Analyzer, CourseManifest, Lesson, ReadText, Section } from "./types";
import { basename, extname, fileType, naturalCompare, parseLenientList, stableId, stripTags } from "./utils";

/**
 * MIT OpenCourseWare "new-style" offline export:
 *   data.json, pages/<slug>/data.json, resources/<slug>/data.json, static_resources/<hash>_<name>.ext
 */

type OcwResource = {
  title?: string;
  description?: string;
  file?: string;
  file_type?: string;
  file_size?: number;
  learning_resource_types?: unknown;
  parent_title?: string;
  resourcetype?: string;
  video_metadata?: { youtube_id?: string; youtube_description?: string };
  video_files?: {
    archive_url?: string;
    video_captions_file?: string;
    video_transcript_file?: string;
    video_thumbnail_file?: string;
  };
};

const SKIP_EXT = new Set(["js", "mjs", "cjs", "css", "map", "woff", "woff2", "ttf", "eot", "ico"]);

/** Section display order. First matching pattern wins; unknown sections go last. */
const SECTION_ORDER: RegExp[] = [
  /video|lecture video|lecture recording/i,
  /lecture note|^notes$|lecture summar/i,
  /slide/i,
  /lecture/i,
  /recitation|tutorial/i,
  /assignment|problem set|homework|pset/i,
  /project/i,
  /exam|quiz|midterm|final/i,
  /solution/i,
  /reading|textbook|reference/i,
  /tool|software|code/i,
];

function sectionRank(title: string): number {
  if (/^other$/i.test(title)) return SECTION_ORDER.length + 1;
  const i = SECTION_ORDER.findIndex((r) => r.test(title));
  return i === -1 ? SECTION_ORDER.length : i;
}

const PAGE_ORDER = ["syllabus", "calendar", "readings", "lecture-notes", "assignments"];

function isSolution(slug: string, title: string, lrt: string[]): boolean {
  return (
    /-solutions?$/.test(slug) ||
    /\bsolutions?\b/i.test(title) ||
    lrt.some((t) => /solution/i.test(t))
  );
}

function isFullNotes(title: string): boolean {
  return /\b(full|complete|all)\b/i.test(title) && /\bnotes?\b/i.test(title);
}

/** "Lecture 4 Notes" -> "L4", "Session 3" -> "S3" */
function shortPrefix(title: string): string | undefined {
  const m = title.match(/^\s*(lecture|lec|session|ses|recitation|rec|class|week)\s*#?\s*(\d+[a-z]?)/i);
  if (!m) return undefined;
  const kind = m[1].toLowerCase();
  const letter = kind.startsWith("rec") ? "R" : kind.startsWith("s") ? "S" : kind === "week" ? "W" : kind === "class" ? "C" : "L";
  return `${letter}${m[2]}`;
}

function cleanLinkText(text: string): string {
  return stripTags(text)
    .replace(/\((?:PDF|PPT|PPTX|ZIP|MP4|DOCX?|TXT)[^)]*\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** All `<a href="../../resources/<slug>/...">text</a>` links in an OCW page body. */
function resourceLinks(html: string): { slug: string; text: string }[] {
  const out: { slug: string; text: string }[] = [];
  const re = /<a\b[^>]*href="[^"]*?resources\/([^/"#?]+)\/?(?:index\.html?)?"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push({ slug: m[1], text: cleanLinkText(m[2]) });
  return out;
}

async function readJson<T>(read: ReadText, path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await read(path)) as T;
  } catch {
    return undefined;
  }
}

export const ocwAnalyzer: Analyzer = {
  name: "mit-ocw",

  async detect(files, read) {
    if (!files.includes("data.json")) return false;
    try {
      return (await read("data.json")).includes('"course_title"');
    } catch {
      return false;
    }
  },

  async analyze(files, read, ctx): Promise<CourseManifest> {
    const root = (await readJson<Record<string, unknown>>(read, "data.json")) ?? {};
    const fileSet = new Set(files);

    // static_resources/<hash>_<name> indexed by basename
    const staticByBase = new Map<string, string>();
    for (const f of files) {
      if (f.startsWith("static_resources/")) staticByBase.set(basename(f), f);
    }
    const resolveFile = (file?: string): string | undefined => {
      if (!file) return undefined;
      const clean = file.replace(/^\.\//, "");
      if (fileSet.has(clean)) return clean;
      return staticByBase.get(basename(clean));
    };

    // ---- course metadata
    const title = String(root.course_title ?? ctx.archiveName ?? "Untitled course");
    const instructors = parseLenientList<{ title?: string } | string>(root.instructors)
      .map((i) => (typeof i === "string" ? i : i?.title))
      .filter(Boolean) as string[];
    const level = parseLenientList<string>(root.level).join(", ") || undefined;
    const term = [root.term, root.year].filter(Boolean).join(" ") || undefined;
    const coverPath =
      resolveFile(typeof root.image_src === "string" ? root.image_src : undefined) ??
      resolveFile((root.course_image_metadata as OcwResource | undefined)?.file);
    const coverBase = coverPath ? basename(coverPath) : undefined;
    const description =
      typeof root.course_description === "string"
        ? root.course_description.replace(/\{\{%[\s\S]*?%\}\}/g, "").trim()
        : undefined;
    const courseNumber = typeof root.primary_course_number === "string" ? root.primary_course_number : undefined;

    // ---- resources -> lessons
    type Raw = { slug: string; lesson: Lesson; section: string; solution: boolean; sortKey: string };
    const raws: Raw[] = [];
    const resourceFiles = files.filter((f) => /^resources\/[^/]+\/data\.json$/.test(f)).sort(naturalCompare);

    for (const rf of resourceFiles) {
      const slug = rf.split("/")[1];
      const r = await readJson<OcwResource>(read, rf);
      if (!r) continue;

      const lrt = parseLenientList<string>(r.learning_resource_types).map(String);
      const youtubeId = r.video_metadata?.youtube_id?.trim() || undefined;
      const isVideo = r.resourcetype === "Video" || !!youtubeId;
      const local = resolveFile(r.file);

      let path: string | undefined = local;
      let type = local ? fileType(local) : "other";
      const meta: Record<string, unknown> = { slug };
      if (r.description) meta.description = stripTags(r.description);

      if (isVideo) {
        const archive = r.video_files?.archive_url?.trim();
        const localVideo = archive ? resolveFile(archive) : undefined;
        path = localVideo ?? (local && fileType(local) === "video" ? local : undefined) ?? (youtubeId ? `youtube:${youtubeId}` : undefined);
        type = "video";
        if (youtubeId) meta.youtubeId = youtubeId;
        if (archive && !localVideo) meta.remoteUrl = archive;
        const captions = resolveFile(r.video_files?.video_captions_file);
        const transcript = resolveFile(r.video_files?.video_transcript_file);
        if (captions) meta.captionsPath = captions;
        if (transcript) meta.transcriptPath = transcript;
        if (!path && archive) path = `remote:${archive}`;
      }

      if (!path) continue; // nothing playable/viewable
      const b = basename(path);
      if (coverBase && b === coverBase) continue;
      if (/-th\.(jpe?g|png)$/i.test(b) || /thumbnail/i.test(r.title ?? "")) continue;
      if (SKIP_EXT.has(extname(path))) continue;
      if (r.resourcetype === "Image" && !r.parent_title && !lrt.length) continue; // decorative images

      const t = (r.title ?? b).trim();
      const solution = isSolution(slug, t, lrt);
      const section = r.parent_title?.trim() || lrt[0] || "Other";
      if (r.file_size) meta.size = r.file_size;

      raws.push({
        slug,
        section,
        solution,
        sortKey: t,
        lesson: { id: stableId(path), title: t, order: 0, type, path, meta },
      });
    }

    // ---- topic names from pages (e.g. pages/lecture-notes: "Binary Classification")
    const pageFiles = files.filter((f) => /^pages\/[^/]+\/data\.json$/.test(f));
    const pages: { slug: string; title: string; html: string }[] = [];
    for (const pf of pageFiles) {
      const p = await readJson<{ title?: string; content?: string }>(read, pf);
      if (!p?.content?.trim()) continue;
      pages.push({ slug: pf.split("/")[1], title: p.title ?? pf.split("/")[1], html: p.content });
    }

    const bySlug = new Map(raws.map((r) => [r.slug, r]));
    for (const page of pages) {
      if (!/lecture|video|session|class|recitation/i.test(page.slug)) continue;
      for (const link of resourceLinks(page.html)) {
        const raw = bySlug.get(link.slug);
        if (!raw || !link.text || link.text.length < 3) continue;
        const prefix = shortPrefix(raw.lesson.title);
        if (!prefix) continue;
        if (link.text.toLowerCase() === raw.lesson.title.toLowerCase()) continue;
        raw.lesson.meta = { ...raw.lesson.meta, originalTitle: raw.lesson.title, topic: link.text };
        raw.lesson.title = `${prefix} · ${link.text}`;
      }
    }

    // ---- pair assignments with their solutions
    const normalize = (s: string) => s.toLowerCase().replace(/\bsolutions?\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
    const nonSolutions = raws.filter((r) => !r.solution);
    const paired = new Set<Raw>();
    for (const sol of raws.filter((r) => r.solution)) {
      const baseSlug = sol.slug.replace(/-solutions?$/, "");
      const target =
        (baseSlug !== sol.slug ? nonSolutions.find((r) => r.slug === baseSlug) : undefined) ??
        nonSolutions.find((r) => normalize(r.sortKey) === normalize(sol.sortKey) && r.section === sol.section);
      if (!target || target.lesson.meta?.solution) continue;
      target.lesson.meta = {
        ...target.lesson.meta,
        solution: { path: sol.lesson.path, title: sol.lesson.title, type: sol.lesson.type },
      };
      paired.add(sol);
    }

    // ---- group into sections
    const groups = new Map<string, Raw[]>();
    for (const r of raws) {
      if (paired.has(r)) continue;
      const key = r.solution && !/solution/i.test(r.section) ? "Solutions" : r.section;
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }

    const sections: Section[] = [...groups.entries()]
      .sort(([a], [b]) => sectionRank(a) - sectionRank(b) || naturalCompare(a, b))
      .map(([sectionTitle, items], si) => {
        items.sort((a, b) => {
          const fa = isFullNotes(a.sortKey) ? 0 : 1;
          const fb = isFullNotes(b.sortKey) ? 0 : 1;
          return fa - fb || naturalCompare(a.sortKey, b.sortKey);
        });
        return {
          id: stableId(sectionTitle, "s"),
          title: sectionTitle,
          order: si,
          lessons: items.map((r, i) => ({ ...r.lesson, order: i })),
        };
      });

    // ---- extra pages (syllabus, calendar...) with resource links pointing to lessons
    const lessonIdBySlug = new Map<string, string>();
    for (const r of raws) {
      if (paired.has(r)) {
        const base = sections.flatMap((s) => s.lessons).find((l) => (l.meta?.solution as { path?: string })?.path === r.lesson.path);
        if (base) lessonIdBySlug.set(r.slug, base.id);
      } else lessonIdBySlug.set(r.slug, r.lesson.id);
    }
    const rewriteLinks = (html: string) =>
      html
        .replace(/href="[^"]*?resources\/([^/"#?]+)\/?(?:index\.html?)?"/gi, (m, slug: string) => {
          const id = lessonIdBySlug.get(slug);
          return id ? `href="#lesson=${id}"` : m;
        })
        .replace(/src="[^"]*?(static_resources\/[^"]+)"/gi, (_m, p: string) => `data-course-src="${p}"`);

    const extraPages = pages
      .sort((a, b) => {
        const ia = PAGE_ORDER.indexOf(a.slug);
        const ib = PAGE_ORDER.indexOf(b.slug);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || naturalCompare(a.title, b.title);
      })
      .map((p) => ({ title: p.title, html: rewriteLinks(p.html) }));

    const descriptionHtml = typeof root.course_description_html === "string" ? root.course_description_html : undefined;
    const shortId = typeof root.site_short_id === "string" ? root.site_short_id : undefined;

    return {
      id: ctx.courseId,
      title,
      instructor: instructors.join(", ") || undefined,
      description,
      descriptionHtml,
      coverPath,
      level,
      term,
      courseNumber,
      sourceKey: `ocw:${shortId ?? ([courseNumber, term].filter(Boolean).join("-") || title)}`,
      source: "MIT OpenCourseWare",
      sections,
      extraPages,
    };
  },
};
