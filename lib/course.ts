import { analyzeCourse } from "./analyzers";
import type { CourseManifest, Lesson, Section } from "./analyzers/types";
import { basename } from "./analyzers/utils";
import { api, getToken } from "./api";
import { db } from "./db";
import { getFile, listCourseFiles, prefetch } from "./files";

export type FlatLesson = Lesson & { section: Section; index: number };

export function flattenLessons(m: CourseManifest): FlatLesson[] {
  let index = 0;
  return m.sections.flatMap((section) => section.lessons.map((l) => ({ ...l, section, index: index++ })));
}

/** Re-runs the analyzers on stored files. Progress is keyed by path, so it survives. */
export async function reanalyzeCourse(courseId: string) {
  const course = await db.courses.get(courseId);
  if (!course) throw new Error("Course not found");
  const files = (await listCourseFiles(courseId)).map((f) => f.path);
  // Analyzers only read metadata/text files; make sure those are on this device first.
  await prefetch(courseId, files.filter((p) => /\.(json|html?|xml|md|markdown|txt)$/i.test(p)));
  const read = async (p: string) => {
    const blob = await getFile(courseId, p);
    if (!blob) throw new Error(`missing ${p}`);
    return blob.text();
  };
  const { manifest, analyzer } = await analyzeCourse(files, read, { courseId, archiveName: course.archiveName });
  await db.courses.update(courseId, { manifest, analyzer, title: manifest.title, sourceKey: manifest.sourceKey, updatedAt: Date.now() });
  // Keep the account copy's structure in step (other devices pick it up).
  if (course.remoteId && getToken())
    await api
      .patchCourse(course.remoteId, { manifest, manifestVersion: manifest.version, analyzer, title: manifest.title })
      .catch(() => undefined);
  return manifest;
}

export async function downloadFile(courseId: string, path: string) {
  const blob = await getFile(courseId, path);
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = basename(path).replace(/^[0-9a-f]{32}_/, "");
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function openFileInTab(courseId: string, path: string) {
  const blob = await getFile(courseId, path);
  if (!blob) return;
  window.open(URL.createObjectURL(blob), "_blank", "noopener");
}
