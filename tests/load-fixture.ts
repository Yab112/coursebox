import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { analyzeCourse } from "@/lib/analyzers";

/** Loads a JSON-only OCW fixture: real metadata + `files.txt` listing the binary files that would exist. */
export function loadFixture(name: string) {
  const dir = path.join(__dirname, "fixtures", name);
  const walk = (d: string, base = ""): string[] =>
    readdirSync(d).flatMap((n) => {
      const rel = base ? `${base}/${n}` : n;
      return statSync(path.join(d, n)).isDirectory() ? walk(path.join(d, n), rel) : [rel];
    });
  const listed = existsSync(path.join(dir, "files.txt"))
    ? readFileSync(path.join(dir, "files.txt"), "utf8").split("\n").filter(Boolean)
    : [];
  const files = [...walk(dir).filter((f) => f !== "files.txt"), ...listed];
  const read = async (p: string) => readFileSync(path.join(dir, p), "utf8");
  return { files, read, analyze: () => analyzeCourse(files, read, { courseId: "c1", archiveName: name }) };
}
