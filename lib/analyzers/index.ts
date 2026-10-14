import { genericAnalyzer } from "./generic";
import { ocwAnalyzer } from "./ocw";
import { MANIFEST_VERSION, type AnalyzeContext, type Analyzer, type CourseManifest, type Lesson, type ReadText } from "./types";
import { basename, cleanTitle, dirname, fileType, isContentFile, isJunk, naturalCompare, stableId } from "./utils";

export * from "./types";

/** Order matters: the first adapter whose detect() returns true wins. Generic always matches. */
export const analyzers: Analyzer[] = [ocwAnalyzer, genericAnalyzer];

export async function analyzeCourse(
  files: string[],
  read: ReadText,
  ctx: AnalyzeContext,
): Promise<{ manifest: CourseManifest; analyzer: string }> {
  for (const a of analyzers) {
    if (await a.detect(files, read)) {
      const manifest = await a.analyze(files, read, ctx);
      ensureCoverage(manifest, files, a);
      manifest.version = MANIFEST_VERSION;
      return { manifest, analyzer: a.name };
    }
  }
  throw new Error("No analyzer matched");
}

/** Every path the manifest already shows somewhere. */
export function usedPaths(m: CourseManifest): Set<string> {
  const used = new Set<string>();
  const add = (p?: unknown) => typeof p === "string" && used.add(p);
  add(m.coverPath);
  add(m.overviewPath);
  for (const s of m.sections)
    for (const l of s.lessons) {
      add(l.path);
      add(l.solution?.path);
      l.attachments?.forEach((a) => add(a.path));
      (l.meta?.captionPaths as string[] | undefined)?.forEach(add);
      add(l.meta?.captionsPath);
      add(l.meta?.transcriptPath);
      (l.meta?.alternates as string[] | undefined)?.forEach(add);
      if (typeof l.meta?.html === "string") for (const x of l.meta.html.matchAll(/(static_resources\/[^"'?#\s]+)/g)) add(x[1]);
    }
  for (const p of m.extraPages ?? []) for (const x of p.html.matchAll(/data-course-src="([^"]+)"/g)) add(x[1]);
  return used;
}

/**
 * Safety net: content files no analyzer placed go to "Additional Materials",
 * so nothing in the zip is ever silently hidden.
 */
export function ensureCoverage(m: CourseManifest, files: string[], analyzer?: Analyzer) {
  const used = usedPaths(m);
  const left = files
    .filter((f) => !used.has(f) && !isJunk(f) && isContentFile(f) && !analyzer?.isAsset?.(f))
    .sort(naturalCompare);
  m.unplacedCount = left.length;
  if (!left.length) return;
  const lessons: Lesson[] = left.map((path, i) => {
    const dir = dirname(path);
    const t =
      cleanTitle(
        basename(path)
          .replace(/^[0-9a-f]{32}_/, "")
          .replace(/[A-Za-z0-9-]{20,}[_ ]?/g, ""), // opaque ids (drive/hash) carry no meaning
      ).title || basename(path);
    return { id: stableId(path), title: t, order: i, type: fileType(path), path, meta: dir ? { folder: dir } : undefined };
  });
  m.sections.push({ id: stableId("(additional)", "s"), title: "Additional Materials", order: m.sections.length, lessons });
}

/** Strip wrapping folders ("Course/Course/a.pdf" -> "a.pdf"), repeatedly. */
export function stripCommonRoot(paths: string[]): { root?: string; strip: (p: string) => string } {
  let prefix = "";
  let root: string | undefined;
  for (;;) {
    const rest = paths.map((p) => p.slice(prefix.length));
    const tops = new Set(rest.map((p) => (p.includes("/") ? p.split("/")[0] : "")));
    if (tops.size !== 1) break;
    const [top] = tops;
    if (!top) break;
    root ??= top; // outermost folder names the course
    prefix += top + "/";
  }
  return { root, strip: (p) => p.slice(prefix.length) };
}
