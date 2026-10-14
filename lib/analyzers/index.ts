import { genericAnalyzer } from "./generic";
import { ocwAnalyzer } from "./ocw";
import type { AnalyzeContext, Analyzer, CourseManifest, ReadText } from "./types";

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
      return { manifest: await a.analyze(files, read, ctx), analyzer: a.name };
    }
  }
  throw new Error("No analyzer matched");
}

/** If every path shares one top-level folder, strip it ("MyCourse/a.pdf" -> "a.pdf"). */
export function stripCommonRoot(paths: string[]): { root?: string; strip: (p: string) => string } {
  const tops = new Set(paths.map((p) => (p.includes("/") ? p.split("/")[0] : "")));
  if (tops.size === 1) {
    const [root] = tops;
    if (root) return { root, strip: (p) => p.slice(root.length + 1) };
  }
  return { strip: (p) => p };
}
