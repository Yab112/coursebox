/**
 * Print the structure CourseBox detects for a course zip or folder.
 *   npm run analyze -- path/to/course.zip [--json]
 * Paste the output into an issue when a layout isn't recognized well.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { analyzeCourse, stripCommonRoot } from "../lib/analyzers/index.ts";
import { isJunk } from "../lib/analyzers/utils.ts";

async function load(target: string) {
  if (statSync(target).isDirectory()) {
    const walk = (d: string, base = ""): string[] =>
      readdirSync(d).flatMap((n) => {
        const rel = base ? `${base}/${n}` : n;
        return statSync(path.join(d, n)).isDirectory() ? walk(path.join(d, n), rel) : [rel];
      });
    const files = walk(target).filter((f) => !isJunk(f));
    return { files, name: path.basename(target), read: async (p: string) => readFileSync(path.join(target, p), "utf8") };
  }
  const zip = await JSZip.loadAsync(readFileSync(target));
  const raw = Object.values(zip.files).filter((f) => !f.dir && !isJunk(f.name)).map((f) => f.name);
  const { root, strip } = stripCommonRoot(raw);
  const map = new Map(raw.map((r) => [strip(r), r]));
  return {
    files: [...map.keys()],
    name: root ?? path.basename(target).replace(/\.zip$/i, ""),
    read: async (p: string) => zip.file(map.get(p)!)!.async("string"),
  };
}

const [target, flag] = process.argv.slice(2);
if (!target) {
  console.error("usage: npm run analyze -- <course.zip | folder> [--json]");
  process.exit(1);
}
const { files, name, read } = await load(target);
const { manifest, analyzer } = await analyzeCourse(files, read, { courseId: "cli", archiveName: name });

if (flag === "--json") {
  console.log(JSON.stringify(manifest, null, 2));
} else {
  const n = manifest.sections.reduce((a, s) => a + s.lessons.length, 0);
  console.log(`${manifest.title}  [${analyzer}]  ${files.length} files → ${manifest.sections.length} sections, ${n} lessons`);
  if (manifest.extraPages?.length) console.log(`pages: ${manifest.extraPages.map((p) => p.title).join(", ")}`);
  let group: string | undefined;
  for (const s of manifest.sections) {
    if (s.group !== group) console.log(`\n## ${s.group ?? "More materials"}`);
    group = s.group;
    console.log(`\n  ${s.title} (${s.lessons.length})`);
    for (const l of s.lessons) {
      const extras = [
        l.attachments?.length ? `+${l.attachments.map((a) => a.title).join(", ")}` : "",
        l.solution ? "+solution" : "",
        (l.meta?.captionPaths as string[] | undefined)?.length ? "+cc" : "",
        l.meta?.transcriptPath ? "+transcript" : "",
      ].filter(Boolean);
      console.log(`    - [${l.type}] ${l.title}${extras.length ? "  " + extras.join(" ") : ""}`);
    }
  }
  console.log(`\nunplaced files moved to "Additional Materials": ${manifest.unplacedCount ?? 0}`);
}
