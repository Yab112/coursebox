import type { CourseManifest, LessonType } from "./analyzers";
import { isContentFile, isJunk } from "./analyzers/utils";

/**
 * An "X-ray" of a course zip: every file in it and where the analyzer put it. Built from a real
 * analysis, so the landing page can show exactly what importing the zip would produce.
 */
export type XrayDest =
  | { kind: "lesson" | "solution" | "attachment" | "captions"; section: number; lesson: number }
  | { kind: "cover" | "overview" | "structure" | "junk" | "site" };

export type XrayFile = { path: string; dest: XrayDest };

export type XrayLesson = { title: string; type: LessonType; solution: boolean; attachments: number };
export type XraySection = { title: string; group?: string; lessons: XrayLesson[] };

export type Xray = {
  archive: string;
  analyzer: string;
  title: string;
  /** "6.006 · Spring 2020 · Erik Demaine, …" */
  byline: string;
  files: XrayFile[];
  sections: XraySection[];
  stats: { files: number; sections: number; lessons: number; solutions: number; skipped: number };
};

/** Paths that are only read to understand the course (OCW metadata and page HTML). */
const STRUCTURE_RE = /(^|\/)data\.json$|^(pages|resources)\/.*\.html?$|^(index\.html?|sitemap\.xml|imsmanifest\.xml)$/i;

export function buildXray(
  archive: string,
  analyzer: string,
  files: string[],
  manifest: CourseManifest,
  isAsset?: (path: string) => boolean,
): Xray {
  const dest = new Map<string, XrayDest>();
  const set = (p: unknown, d: XrayDest) => {
    if (typeof p === "string" && !dest.has(p)) dest.set(p, d);
  };

  set(manifest.coverPath, { kind: "cover" });
  set(manifest.overviewPath, { kind: "overview" });
  manifest.sections.forEach((s, si) =>
    s.lessons.forEach((l, li) => {
      const at = { section: si, lesson: li };
      set(l.path, { kind: "lesson", ...at });
      ((l.meta?.alternates as string[] | undefined) ?? []).forEach((p) => set(p, { kind: "lesson", ...at }));
      set(l.solution?.path, { kind: "solution", ...at });
      l.attachments?.forEach((a) => set(a.path, { kind: "attachment", ...at }));
      ((l.meta?.captionPaths as string[] | undefined) ?? []).forEach((p) => set(p, { kind: "captions", ...at }));
      set(l.meta?.captionsPath, { kind: "captions", ...at });
      set(l.meta?.transcriptPath, { kind: "captions", ...at });
    }),
  );

  const out: XrayFile[] = files.map((path) => {
    const d = dest.get(path);
    if (d) return { path, dest: d };
    if (isJunk(path)) return { path, dest: { kind: "junk" } };
    if (STRUCTURE_RE.test(path)) return { path, dest: { kind: "structure" } };
    if (isAsset?.(path) || !isContentFile(path)) return { path, dest: { kind: "site" } };
    return { path, dest: { kind: "structure" } };
  });

  const sections = manifest.sections.map((s) => ({
    title: s.title,
    group: s.group,
    lessons: s.lessons.map((l) => ({ title: l.title, type: l.type, solution: !!l.solution, attachments: l.attachments?.length ?? 0 })),
  }));

  return {
    archive,
    analyzer,
    title: manifest.title,
    byline: [manifest.courseNumber, manifest.term, manifest.instructor].filter(Boolean).join(" · "),
    files: out,
    sections,
    stats: {
      files: files.length,
      sections: sections.length,
      lessons: sections.reduce((n, s) => n + s.lessons.length, 0),
      solutions: sections.reduce((n, s) => n + s.lessons.filter((l) => l.solution).length, 0),
      skipped: out.filter((f) => f.dest.kind === "junk" || f.dest.kind === "site").length,
    },
  };
}
