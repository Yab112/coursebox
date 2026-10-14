import { analyzeCourse } from "./analyzers";
import type { CourseManifest, Lesson, Section } from "./analyzers/types";
import { basename } from "./analyzers/utils";
import { db } from "./db";

export type FlatLesson = Lesson & { section: Section; index: number };

export function flattenLessons(m: CourseManifest): FlatLesson[] {
  let index = 0;
  return m.sections.flatMap((section) => section.lessons.map((l) => ({ ...l, section, index: index++ })));
}

/** Re-runs the analyzers on stored files. Progress is keyed by path, so it survives. */
export async function reanalyzeCourse(courseId: string) {
  const course = await db.courses.get(courseId);
  if (!course) throw new Error("Course not found");
  const keys = await db.files.where("courseId").equals(courseId).primaryKeys();
  const files = keys.map((k) => k[1]);
  const read = async (p: string) => {
    const f = await db.files.get([courseId, p]);
    if (!f) throw new Error(`missing ${p}`);
    return f.blob.text();
  };
  const { manifest, analyzer } = await analyzeCourse(files, read, { courseId, archiveName: course.archiveName });
  await db.courses.update(courseId, { manifest, analyzer, title: manifest.title, sourceKey: manifest.sourceKey, updatedAt: Date.now() });
  return manifest;
}

export async function downloadFile(courseId: string, path: string) {
  const f = await db.files.get([courseId, path]);
  if (!f) return;
  const url = URL.createObjectURL(f.blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = basename(path).replace(/^[0-9a-f]{32}_/, "");
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function openFileInTab(courseId: string, path: string) {
  const f = await db.files.get([courseId, path]);
  if (!f) return;
  window.open(URL.createObjectURL(f.blob), "_blank", "noopener");
}
