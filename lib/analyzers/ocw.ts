import type { Analyzer, Attachment, CourseManifest, Lesson, ReadText, Section } from "./types";
import { basename, extname, fileType, naturalCompare, parseLenientList, stableId, stripTags } from "./utils";

/**
 * MIT OpenCourseWare "new-style" offline export:
 *   data.json, pages/<slug>/data.json, resources/<slug>/data.json, static_resources/<hash>_<name>.ext,
 *   video_galleries/<slug>/data.json
 *
 * What it does beyond a plain listing:
 *  - captions / transcripts ("3play" files) are linked to their video instead of showing up as lessons
 *  - "Lecture N" notes are attached to the "Lecture N" video (Udemy-style lesson resources)
 *  - problem sets / quizzes are paired with their solutions (locked) and templates (attachments)
 *  - mixed sections are split by resource type, orphaned resources are re-homed by type
 *  - lecture topics from pages/lecture-notes rename bare "Lecture 4 Notes" titles
 */

type OcwFileRef = { file?: string; language?: string };
type OcwResource = {
  title?: string;
  description?: string;
  file?: string | null;
  file_type?: string;
  file_size?: number | string;
  learning_resource_types?: unknown;
  parent_title?: string | null;
  resourcetype?: string;
  video_metadata?: { youtube_id?: string };
  video_files?: {
    archive_url?: string;
    video_captions_file?: string;
    video_transcript_file?: string;
    video_captions_resources?: OcwFileRef[];
    video_transcript_resources?: OcwFileRef[];
  };
};

const SKIP_EXT = new Set(["js", "mjs", "cjs", "css", "map", "woff", "woff2", "ttf", "eot", "ico"]);
const CAPTION_EXT = new Set(["srt", "vtt", "webvtt"]);

/** Section display order. First matching pattern wins; unknown sections go last. */
const SECTION_ORDER: RegExp[] = [
  /lecture video|video lecture|lecture recording/i,
  /video/i,
  /lecture note|^notes$|lecture summar/i,
  /slide/i,
  /lecture/i,
  /recitation|tutorial|problem.solving|problem session/i,
  /assignment|problem set|homework|pset/i,
  /practice/i,
  /project|lab/i,
  /exam|quiz|midterm|final/i,
  /solution/i,
  /reading|textbook|reference/i,
  /tool|software|code/i,
];

function sectionRank(title: string): number {
  if (/^(other|additional)/i.test(title)) return SECTION_ORDER.length + 1;
  const i = SECTION_ORDER.findIndex((r) => r.test(title));
  return i === -1 ? SECTION_ORDER.length : i;
}

const PAGE_ORDER = ["syllabus", "calendar", "readings", "lecture-notes", "assignments"];

const COMPANION_RE = /^(template|templates|code|starter code|data|data files?|files?|supporting files?|handout|figures?|slides|zip|images?)$/i;

function isSolutionResource(slug: string, title: string, lrt: string[]): boolean {
  return /[-_]sol(ution)?s?(_pdf)?$/i.test(slug) || /\bsol(ution)?s?\b/i.test(title) || lrt.some((t) => /solution/i.test(t));
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

/** ("lecture", "12") from "Lecture 12: Bellman-Ford" / "Lec 12 slides". */
function unitKey(title: string): string | undefined {
  const m = title.match(/^\s*(lecture|lec|problem session|recitation|rec|tutorial|session|class)\.?\s*#?\s*(\d+)\b/i);
  if (!m) return undefined;
  const k = m[1].toLowerCase();
  const kind = k.startsWith("lec") ? "lecture" : k.startsWith("rec") ? "recitation" : k;
  return `${kind}:${parseInt(m[2])}`;
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

type Page = { slug: string; depth: number; title: string; html: string; description?: string; parentTitle?: string };

type Raw = {
  slug: string;
  lesson: Lesson;
  section: string;
  lrt: string[];
  solution: boolean;
  /** title used for sorting/pairing (before topic renames) */
  key: string;
  youtubeId?: string;
  group?: string;
  /** page lessons sort first in their section */
  first?: boolean;
  /** the course page (unit/session) this item belongs to, and its position among the page's links */
  page?: Page;
  pos?: number;
};


export const ocwAnalyzer: Analyzer = {
  name: "mit-ocw",

  isAsset(path) {
    return (
      /^(static_shared|download)\//.test(path) ||
      /(^|\/)(data\.json|index\.html?|index\.xml|sitemap\.xml|robots\.txt|content_map\.json|favicon\.ico|\.keep)$/.test(path) ||
      /-th\.(jpe?g|png)$/i.test(path) ||
      SKIP_EXT.has(extname(path)) ||
      CAPTION_EXT.has(extname(path))
    );
  },

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

    const staticByBase = new Map<string, string>();
    for (const f of files) if (f.startsWith("static_resources/")) staticByBase.set(basename(f), f);
    const resolveFile = (file?: string | null): string | undefined => {
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
        ? root.course_description.replace(/\{\{[%<][\s\S]*?[%>]\}\}/g, "").trim()
        : undefined;
    const courseNumber = typeof root.primary_course_number === "string" ? root.primary_course_number : undefined;

    // ---- read every resource
    const resources: { slug: string; r: OcwResource }[] = [];
    for (const rf of files.filter((f) => /^resources\/[^/]+\/data\.json$/.test(f)).sort(naturalCompare)) {
      const r = await readJson<OcwResource>(read, rf);
      if (r) resources.push({ slug: rf.split("/")[1], r });
    }

    // Captions/transcripts referenced by videos are never lessons on their own.
    const refList = (r: OcwResource, kind: "captions" | "transcript") => {
      const vf = r.video_files ?? {};
      const list =
        kind === "captions"
          ? [vf.video_captions_file, ...(vf.video_captions_resources ?? []).map((x) => x.file)]
          : [vf.video_transcript_file, ...(vf.video_transcript_resources ?? []).map((x) => x.file)];
      return [...new Set(list.map(resolveFile).filter(Boolean) as string[])];
    };
    const videoAssets = new Set<string>();
    for (const { r } of resources) {
      refList(r, "captions").forEach((p) => videoAssets.add(p));
      refList(r, "transcript").forEach((p) => videoAssets.add(p));
    }

    // ---- page tree (pages/<a>/<b>/data.json). Nested pages are course content, top-level ones are tabs.
    const pages: Page[] = [];
    for (const pf of files.filter((f) => /^pages\/.+\/data\.json$/.test(f)).sort(naturalCompare)) {
      const p = await readJson<{ title?: string; content?: string; description?: string; parent_title?: string }>(read, pf);
      if (!p) continue;
      const slug = pf.slice("pages/".length, -"/data.json".length);
      pages.push({
        slug,
        depth: slug.split("/").length,
        title: (p.title ?? slug).trim(),
        html: p.content ?? "",
        description: p.description?.trim(),
        parentTitle: p.parent_title?.trim(),
      });
    }
    const pageBySlug = new Map(pages.map((p) => [p.slug, p]));
    const nestedByTitle = new Map<string, Page>();
    for (const p of pages) if (p.depth >= 2 && !nestedByTitle.has(p.title)) nestedByTitle.set(p.title, p);
    /** Title of the top-level ancestor ("Unit I: ...") of a nested page. */
    const rootTitle = (p: Page) => pageBySlug.get(p.slug.split("/")[0])?.title ?? p.parentTitle;
    /** "Lecture 1 Video Solutions" merges into its sibling "Lecture 1" when that exists. */
    const sectionForPage = (p: Page) => {
      const base = p.title.replace(/\s*[-:–]?\s*(video solutions?|solutions?|videos?)$/i, "").trim();
      const sib = base !== p.title ? pageBySlug.get(p.slug.split("/").slice(0, -1).concat(base.toLowerCase().replace(/[^a-z0-9]+/g, "-")).join("/")) : undefined;
      return sib ? sib.title : p.title;
    };
    const textOf = (html: string) => stripTags(html.replace(/\{\{[%<][\s\S]*?[%>]\}\}/g, "")).length;

    // ---- resources -> raw lessons
    const raws: Raw[] = [];
    const orphanMedia: { r: OcwResource; path: string }[] = []; // captions/transcripts not linked yet
    for (const { slug, r } of resources) {
      const lrt = parseLenientList<string>(r.learning_resource_types).map(String);
      const youtubeId = r.video_metadata?.youtube_id?.trim() || undefined;
      const isVideo = r.resourcetype === "Video";
      const local = resolveFile(r.file);
      const t = (r.title ?? (local ? basename(local) : slug)).trim();

      if (!isVideo) {
        if (!local || videoAssets.has(local)) continue;
        const looksLikeVideoAsset =
          CAPTION_EXT.has(extname(local)) ||
          /^3play (caption|pdf) file$/i.test(t) ||
          (!r.parent_title && /\b(transcript|captions?)\b/i.test(t));
        if (looksLikeVideoAsset) {
          orphanMedia.push({ r, path: local });
          continue;
        }
      }

      let path: string | undefined = local;
      let type = local ? fileType(local) : "other";
      const meta: Record<string, unknown> = { slug };
      if (r.description && stripTags(r.description)) meta.description = stripTags(r.description);

      if (isVideo) {
        const archive = r.video_files?.archive_url?.trim() || undefined;
        const localVideo = resolveFile(archive) ?? (local && fileType(local) === "video" ? local : undefined);
        const remoteFile = r.file && fileType(r.file) === "video" ? `https://ocw.mit.edu${r.file}` : undefined;
        path =
          localVideo ??
          (youtubeId ? `youtube:${youtubeId}` : archive ? `remote:${archive}` : remoteFile ? `remote:${remoteFile}` : undefined);
        type = "video";
        if (youtubeId) meta.youtubeId = youtubeId;
        if (!localVideo && (archive || remoteFile)) meta.remoteUrl = archive || remoteFile;
        const caps = refList(r, "captions");
        const trans = refList(r, "transcript");
        if (caps.length) meta.captionPaths = caps;
        if (trans.length) meta.transcriptPath = trans[0];
      }

      if (!path) continue;
      const b = basename(path);
      if (coverBase && b === coverBase) continue;
      if (/-th\.(jpe?g|png)$/i.test(b) || /thumbnail/i.test(t)) continue;
      if (SKIP_EXT.has(extname(path))) continue;
      if (r.resourcetype === "Image" && !r.parent_title && !lrt.length) continue; // decorative images
      if (r.file_size && Number(r.file_size)) meta.size = Number(r.file_size);

      raws.push({
        slug,
        lrt,
        key: t,
        youtubeId,
        solution: isSolutionResource(slug, t, lrt),
        section: r.parent_title?.trim() || "",
        lesson: { id: stableId(path), title: t, order: 0, type, path, meta },
      });
    }

    // Link leftover captions/transcripts to videos by YouTube id (metadata or file name).
    const videosByYt = new Map(raws.filter((x) => x.youtubeId).map((x) => [x.youtubeId!, x]));
    for (const o of orphanMedia) {
      const yt = o.r.video_metadata?.youtube_id || [...videosByYt.keys()].find((id) => basename(o.path).includes(id));
      const v = yt ? videosByYt.get(yt) : undefined;
      if (!v) continue;
      const m = (v.lesson.meta ??= {});
      if (CAPTION_EXT.has(extname(o.path))) m.captionPaths = [...new Set([...((m.captionPaths as string[]) ?? []), o.path])];
      else m.transcriptPath ??= o.path;
    }

    // Duplicate caption/transcript files (no resource entry) named after a video's YouTube id.
    const claimed = new Set(raws.map((x) => x.lesson.path));
    for (const x of raws) {
      const m = x.lesson.meta ?? {};
      [...((m.captionPaths as string[]) ?? []), m.transcriptPath as string].forEach((p) => p && claimed.add(p));
    }
    for (const f of staticByBase.values()) {
      if (claimed.has(f)) continue;
      const id = [...videosByYt.keys()].find((yt) => basename(f).includes(yt));
      if (!id) continue;
      const m = (videosByYt.get(id)!.lesson.meta ??= {});
      if (fileType(f) === "pdf" && !m.transcriptPath) m.transcriptPath = f;
      else m.alternates = [...((m.alternates as string[]) ?? []), f];
    }

    // ---- page-driven structure: nested pages (units > sessions) own the resources they file or link
    const navIdx = new Map<string, number>();
    if (fileSet.has("index.html")) {
      try {
        const nav = await read("index.html");
        for (const m of nav.matchAll(/pages\/([a-z0-9][a-z0-9/_-]*?)\/index\.html/gi)) if (!navIdx.has(m[1])) navIdx.set(m[1], navIdx.size);
      } catch {}
    }
    const pageOrder = (p: Page) => navIdx.get(p.slug) ?? 10_000 + pages.indexOf(p);
    const linksOf = new Map(pages.map((p) => [p.slug, resourceLinks(p.html)]));
    const rawBySlug = new Map(raws.map((x) => [x.slug, x]));
    const pageOf = new Map<Raw, Page>();
    for (const x of raws) {
      const p = nestedByTitle.get(x.section);
      if (p) pageOf.set(x, p);
    }
    for (const p of [...pages].filter((p) => p.depth >= 2).sort((a, b) => pageOrder(a) - pageOrder(b))) {
      for (const link of linksOf.get(p.slug) ?? []) {
        const x = rawBySlug.get(link.slug);
        if (x && !pageOf.has(x)) pageOf.set(x, p);
      }
    }
    // Small top-level pages that own a few resources ("Final Exam", "Final Course Review") become sections too,
    // but only in courses already organised by pages; big index pages stay as tabs.
    if (pageOf.size) {
      for (const p of pages.filter((p) => p.depth === 1)) {
        const owned = raws.filter((x) => !pageOf.has(x) && x.section === p.title);
        if (owned.length >= 1 && owned.length <= 12 && !/syllabus|calendar|resource index/i.test(p.title)) owned.forEach((x) => pageOf.set(x, p));
      }
    }
    const looksLikeFilename = (t: string) => /\.(pdf|zip|py|m|mp4|pptx?|docx?|txt|ipynb)$/i.test(t) || /^MIT\d/i.test(t);
    for (const [x, p] of pageOf) {
      const links = linksOf.get(p.slug) ?? [];
      const i = links.findIndex((l) => l.slug === x.slug);
      x.pos = i === -1 ? 999 : i;
      x.section = p.depth === 1 ? p.title : sectionForPage(p);
      x.group = p.depth === 1 ? undefined : rootTitle(p);
      x.page = p;
      if (looksLikeFilename(x.lesson.title) && i !== -1 && links[i].text.length > 2) {
        const t = links[i].text.replace(/^(read|watch|view|download)( the)?( accompanying)?\s+/i, "");
        x.lesson.title = t[0].toUpperCase() + t.slice(1);
        x.key = x.lesson.title;
      }
    }

    // ---- section names for the rest: re-home orphans by type, split mixed sections by type
    const loose = raws.filter((x) => !x.page);
    const mainType = (x: Raw) => x.lrt.find((l) => !/solution/i.test(l));
    const parentByLrt = new Map<string, Map<string, number>>();
    for (const x of loose) {
      const t = mainType(x);
      if (!x.section || !t) continue;
      const m = parentByLrt.get(t) ?? new Map<string, number>();
      m.set(x.section, (m.get(x.section) ?? 0) + 1);
      parentByLrt.set(t, m);
    }
    for (const x of loose) {
      if (x.section && !/resource index/i.test(x.section)) continue;
      const t = mainType(x);
      const best = t ? [...(parentByLrt.get(t)?.entries() ?? [])].sort((a, b) => b[1] - a[1])[0]?.[0] : undefined;
      x.section = best ?? t ?? (x.lesson.type === "video" ? "Videos" : "Other");
    }
    const bySection = new Map<string, Raw[]>();
    for (const x of loose) bySection.set(x.section, [...(bySection.get(x.section) ?? []), x]);
    for (const [sec, items] of bySection) {
      const types = new Map<string, Raw[]>();
      for (const x of items) {
        if (x.solution) continue;
        const t = mainType(x) ?? sec;
        types.set(t, [...(types.get(t) ?? []), x]);
      }
      const big = [...types.entries()].filter(([, v]) => v.length >= 2);
      if (big.length >= 2) for (const [t, v] of big) if (t !== sec) v.forEach((x) => (x.section = t));
    }

    // ---- pages with real text become lessons (session overviews, in-class questions, unit intros)
    const sectionsWithVideo = new Set(raws.filter((x) => x.lesson.type === "video").map((x) => x.section));
    const ownerPages = new Set(pageOf.values());
    const pageDrivenRoots = new Set([...ownerPages].filter((p) => p.depth >= 2).map((p) => p.slug.split("/")[0]));
    for (const p of pages) {
      const isUnitRoot = p.depth === 1 && pageDrivenRoots.has(p.slug);
      const isTopOwner = p.depth === 1 && ownerPages.has(p);
      if ((p.depth < 2 && !isUnitRoot && !isTopOwner) || textOf(p.html) < 120) continue;
      // A page that only embeds the videos already listed in its section adds nothing.
      if (/\bvideos?\b/i.test(`${p.title} ${p.description ?? ""}`) && sectionsWithVideo.has(sectionForPage(p))) continue;
      const desc = p.description
        ?.replace(/^this (page|section) (contains|includes|provides)\s*(an? |the )?/i, "")
        .replace(/\.$/, "");
      const hasOwnItems = [...pageOf.values()].includes(p);
      const title = isUnitRoot
        ? "Unit overview"
        : isTopOwner
          ? "Overview"
        : hasOwnItems && /overview/i.test(p.html)
          ? "Session overview"
          : desc && desc.length < 70
            ? desc[0].toUpperCase() + desc.slice(1)
            : p.title;
      const path = `pages/${p.slug}/data.json`;
      raws.push({
        slug: `page:${p.slug}`,
        lrt: [],
        key: title,
        solution: false,
        first: true,
        page: p,
        pos: -1,
        section: isUnitRoot ? "Introduction" : isTopOwner ? p.title : sectionForPage(p),
        group: isUnitRoot ? p.title : isTopOwner ? undefined : rootTitle(p),
        lesson: { id: stableId(path), title, order: 0, type: "html", path, meta: { html: p.html, page: p.slug } },
      });
    }
    // Same video filed twice (questions page + solutions page): keep one.
    const keptByPath = new Map<string, Raw>();
    for (let i = 0; i < raws.length; i++) {
      let kept = keptByPath.get(raws[i].lesson.path);
      if (!kept) {
        keptByPath.set(raws[i].lesson.path, raws[i]);
        continue;
      }
      // Prefer the copy that belongs to a unit/session page over a flat gallery listing.
      if (raws[i].page && !kept.page) {
        const k = raws.indexOf(kept);
        [raws[k], raws[i]] = [raws[i], raws[k]];
        kept = raws[k];
        keptByPath.set(kept.lesson.path, kept);
      }
      // fold the duplicate's captions/transcripts into the copy we keep
      const dm = raws[i].lesson.meta ?? {};
      const km = (kept.lesson.meta ??= {});
      const extra = [
        ...((dm.captionPaths as string[]) ?? []),
        ...((dm.alternates as string[]) ?? []),
        dm.transcriptPath as string | undefined,
      ].filter((p): p is string => !!p && p !== km.transcriptPath && !((km.captionPaths as string[]) ?? []).includes(p));
      if (extra.length) km.alternates = [...new Set([...((km.alternates as string[]) ?? []), ...extra])];
      raws.splice(i--, 1);
    }

    // Images already shown inside their page (session figures, TA photos) are not separate lessons.
    for (let i = 0; i < raws.length; i++) {
      const x = raws[i];
      if (x.lesson.type === "image" && pages.some((p) => p.html.includes(basename(x.lesson.path)))) raws.splice(i--, 1);
    }

    // ---- topic names from pages (e.g. pages/lecture-notes: "Binary Classification")
    const bySlug = new Map(raws.map((r) => [r.slug, r]));
    for (const page of pages) {
      if (!/lecture|video|session|class|recitation/i.test(page.slug)) continue;
      for (const link of resourceLinks(page.html)) {
        const raw = bySlug.get(link.slug);
        if (!raw || !link.text || link.text.length < 3) continue;
        const prefix = shortPrefix(raw.lesson.title);
        if (!prefix || /[:·]/.test(raw.lesson.title)) continue; // already carries a topic
        if (link.text.toLowerCase() === raw.lesson.title.toLowerCase()) continue;
        if (unitKey(link.text) && unitKey(link.text) === unitKey(raw.lesson.title)) continue; // "Recitation 1 notes"
        raw.lesson.meta = { ...raw.lesson.meta, originalTitle: raw.lesson.title, topic: link.text };
        raw.lesson.title = `${prefix} · ${link.text}`;
      }
    }

    // ---- pair with solutions, attach templates/companions
    const normalize = (s: string) =>
      s
        .toLowerCase()
        .replace(/\b(sol(ution)?s?|questions?)\b/g, " ")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
    const solBase = (slug: string) => slug.replace(/[-_]?(sol(ution)?s?|s)(_pdf)?$/i, "");
    const probBase = (slug: string) => slug.replace(/[-_]?(prob(lem)?s?|questions?|q)(_pdf)?$/i, "");
    const absorbed = new Set<Raw>();
    const mains = raws.filter((r) => !r.solution && !r.first);
    for (const sol of raws.filter((r) => r.solution)) {
      const sameSection = (r: Raw) => r.section === sol.section && r.group === sol.group;
      const free = (r: Raw) => !r.lesson.solution;
      const b = solBase(sol.slug);
      const target =
        mains.find((r) => free(r) && b !== sol.slug && (r.slug === b || probBase(r.slug) === b)) ??
        mains.find((r) => free(r) && normalize(r.key) === normalize(sol.key) && sameSection(r)) ??
        mains.find((r) => free(r) && normalize(r.key) === normalize(sol.key)) ??
        // session pages: the solution right after its problems
        (sol.page && sol.pos !== undefined
          ? mains.filter((r) => free(r) && r.page === sol.page && (r.pos ?? 999) < sol.pos! && r.lesson.type === sol.lesson.type).at(-1)
          : undefined);
      if (!target) continue;
      target.lesson.solution = { path: sol.lesson.path, title: sol.lesson.title, type: sol.lesson.type };
      absorbed.add(sol);
    }
    for (const x of mains) {
      if (absorbed.has(x)) continue;
      const owner = mains.find(
        (o) =>
          o !== x &&
          !absorbed.has(o) &&
          o.section === x.section &&
          x.key.toLowerCase().startsWith(o.key.toLowerCase() + " ") &&
          COMPANION_RE.test(x.key.slice(o.key.length).trim()),
      );
      if (!owner) continue;
      owner.lesson.attachments = [
        ...(owner.lesson.attachments ?? []),
        { path: x.lesson.path, title: x.key.slice(owner.key.length).trim(), type: x.lesson.type },
      ];
      absorbed.add(x);
    }

    // ---- "Lecture N" notes/slides ride along with the "Lecture N" video (type-organised courses only)
    const videos = raws.filter((r) => r.lesson.type === "video" && !absorbed.has(r) && !r.page);
    if (videos.length >= 3) {
      const videoByUnit = new Map<string, Raw[]>();
      for (const v of videos) {
        const k = unitKey(v.key);
        if (k) videoByUnit.set(k, [...(videoByUnit.get(k) ?? []), v]);
      }
      for (const x of raws) {
        if (absorbed.has(x) || x.page || x.lesson.type === "video" || x.lesson.solution || x.solution) continue;
        const k = unitKey(x.key);
        const vs = k ? videoByUnit.get(k) : undefined;
        if (!vs || vs.length !== 1) continue;
        const label = /notes?/i.test(x.section)
          ? "Notes"
          : /slide/i.test(x.section)
            ? "Slides"
            : /^(other|videos?)$/i.test(x.section) || !x.section
              ? x.key.replace(/^.*?:\s*/, "").slice(0, 40) || "Resource"
              : x.section.replace(/s$/, "");
        const typed =
          x.lesson.type === "text" ? "Code" : x.lesson.type === "other" ? `${extname(x.lesson.path).toUpperCase()} files` : label;
        const existing = vs[0].lesson.attachments ?? [];
        const title = existing.some((a) => a.title === typed) ? `${typed} ${existing.filter((a) => a.title.startsWith(typed)).length + 1}` : typed;
        const att: Attachment = { path: x.lesson.path, title, type: x.lesson.type };
        vs[0].lesson.attachments = [...existing, att, ...(x.lesson.attachments ?? [])];
        absorbed.add(x);
      }
    }

    // ---- group into sections
    const groups = new Map<string, Raw[]>();
    for (const r of raws) {
      if (absorbed.has(r)) continue;
      const sec = r.solution && !/solution/i.test(r.section) ? "Solutions" : r.section;
      const key = r.group ? `${r.group}\u0000${sec}` : sec;
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }
    const isPageDriven = (items: Raw[]) => items.some((r) => r.page);

    // Sections that hold the same kind of numbered unit ("Problem Session 1-5" / "6-9") merge into one.
    const kindOf = (items: Raw[]) => {
      if (isPageDriven(items)) return undefined;
      const kinds = new Set(items.map((r) => unitKey(r.key)?.split(":")[0] ?? "?"));
      const types = new Set(items.map((r) => r.lesson.type));
      return kinds.size === 1 && !kinds.has("?") && types.size === 1 ? `${[...kinds][0]}|${[...types][0]}` : undefined;
    };
    const typeRank = (key: string) => sectionRank(key.split("\u0000")[0]);
    const seenKind = new Map<string, string>();
    for (const [name, items] of [...groups.entries()].sort(([a], [b]) => typeRank(a) - typeRank(b) || naturalCompare(a, b))) {
      const k = kindOf(items);
      if (!k) continue;
      const first = seenKind.get(k);
      if (first) {
        groups.get(first)!.push(...items);
        groups.delete(name);
      } else seenKind.set(k, name);
    }

    // Order: page-driven sections follow the site's navigation; when they hold most of the course they lead.
    const total = raws.length - absorbed.size || 1;
    const pageShare = [...groups.values()].filter(isPageDriven).reduce((n, v) => n + v.length, 0) / total;
    // Units lead only when they carry the lectures themselves (18.06SC), not side material (6.0001 in-class questions).
    const lectureRank = SECTION_ORDER.findIndex((r) => r.source === "lecture");
    const looseLectures =
      [...groups.entries()].filter(([k, v]) => !isPageDriven(v) && typeRank(k) <= lectureRank).reduce((n, [, v]) => n + v.length, 0) / total >= 0.15;
    const pagesLead = pageShare >= 0.5 && !looseLectures;
    const sortTuple = (key: string, items: Raw[]): [number, number] => {
      if (!isPageDriven(items)) return [typeRank(key), 0];
      const pg = items.filter((r) => r.page).map((r) => (r.page!.depth === 1 ? pageOrder(r.page!) - 0.5 : pageOrder(r.page!)));
      return [pagesLead ? -1 : typeRank(key), Math.min(...pg)];
    };

    const sections: Section[] = [...groups.entries()]
      .map(([k, v]) => ({ k, v, t: sortTuple(k, v) }))
      .sort((a, b) => a.t[0] - b.t[0] || a.t[1] - b.t[1] || naturalCompare(a.k, b.k))
      .map(({ k: groupKey, v: items }, si) => {
        const sectionTitle = groupKey.split("\u0000").pop()!;
        items.sort((a, b) => {
          const fa = a.first ? -1 : isFullNotes(a.key) ? 0 : 1;
          const fb = b.first ? -1 : isFullNotes(b.key) ? 0 : 1;
          return fa - fb || (a.pos ?? 999) - (b.pos ?? 999) || naturalCompare(a.key, b.key);
        });
        return {
          id: stableId(groupKey, "s"),
          title: sectionTitle,
          group: items.find((r) => r.group)?.group,
          order: si,
          lessons: items.map((r, i) => ({ ...r.lesson, order: i })),
        };
      });

    // ---- extra pages (syllabus, calendar...) with resource links pointing to lessons
    const lessonIdByPath = new Map<string, string>();
    for (const l of sections.flatMap((s) => s.lessons)) {
      lessonIdByPath.set(l.path, l.id);
      if (l.solution) lessonIdByPath.set(l.solution.path, l.id);
      l.attachments?.forEach((a) => lessonIdByPath.set(a.path, l.id));
    }
    const lessonIdBySlug = new Map<string, string>();
    for (const r of raws) {
      const id = lessonIdByPath.get(r.lesson.path);
      if (id) lessonIdBySlug.set(r.slug, id);
    }
    const rewriteLinks = (html: string) =>
      html
        .replace(/href="[^"]*?resources\/([^/"#?]+)\/?(?:index\.html?)?"/gi, (m, slug: string) => {
          const id = lessonIdBySlug.get(slug);
          return id ? `href="#lesson=${id}"` : m;
        })
        .replace(/src="[^"]*?(static_resources\/[^"]+)"/gi, (_m, p: string) => `data-course-src="${p}"`)
        .replace(/\{\{[%<][\s\S]*?[%>]\}\}/g, "");

    for (const l of sections.flatMap((x) => x.lessons)) if (typeof l.meta?.html === "string") l.meta.html = rewriteLinks(l.meta.html);

    const extraPages = pages
      .filter((p) => p.depth === 1 && textOf(p.html) > 0 && !/resource-index/.test(p.slug) && !pageDrivenRoots.has(p.slug) && !ownerPages.has(p))
      .sort((a, b) => {
        const ia = PAGE_ORDER.indexOf(a.slug);
        const ib = PAGE_ORDER.indexOf(b.slug);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || pageOrder(a) - pageOrder(b);
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
