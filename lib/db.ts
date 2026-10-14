import Dexie, { type EntityTable } from "dexie";
import type { CourseManifest } from "./analyzers/types";

export type CourseRecord = {
  id: string;
  title: string;
  sourceKey?: string;
  analyzer: string;
  archiveName?: string;
  manifest: CourseManifest;
  fileCount: number;
  totalSize: number;
  createdAt: number;
  updatedAt: number;
  /** Id of the copy saved in the user's account, when there is one. */
  remoteId?: string;
  /** Which account the remote copy belongs to. */
  ownerId?: string;
  /** "local": this device only; "uploading"/"error": saving to the account; "synced": saved. */
  syncState?: "local" | "uploading" | "synced" | "error";
  syncError?: string;
  /** 0..1 while uploading. */
  syncProgress?: number;
  /** Files are fetched from the account on demand (course added from another device). */
  lazy?: boolean;
};

export type FileRecord = {
  courseId: string;
  path: string;
  blob: Blob;
  size: number;
  mime: string;
};

export type ProgressRecord = {
  courseId: string;
  /** Lesson path: stable across re-analysis. */
  path: string;
  completed?: boolean;
  completedAt?: number;
  /** When `completed` was last toggled (ms); decides conflicts between devices. */
  changedAt?: number;
  lastPage?: number;
  /** Seconds into a video/audio. */
  position?: number;
  seconds?: number;
  lastOpenedAt?: number;
};

export type CourseState = {
  courseId: string;
  lastLessonPath?: string;
  lastOpenedAt?: number;
};

/** Seconds studied per day per course (feeds the Phase 3 heatmap). */
export type ActivityRecord = { day: string; courseId: string; seconds: number };

export const db = new Dexie("coursebox") as Dexie & {
  courses: EntityTable<CourseRecord, "id">;
  files: Dexie.Table<FileRecord, [string, string]>;
  progress: Dexie.Table<ProgressRecord, [string, string]>;
  state: EntityTable<CourseState, "courseId">;
  activity: Dexie.Table<ActivityRecord, [string, string]>;
};

db.version(1).stores({
  courses: "id, sourceKey, updatedAt",
  files: "[courseId+path], courseId",
  progress: "[courseId+path], courseId",
  state: "courseId, lastOpenedAt",
  activity: "[day+courseId], courseId, day",
});
db.version(2).stores({
  courses: "id, sourceKey, updatedAt, remoteId",
});

/** Progress changes are broadcast so the account sync can pick them up (lib/sync.ts). */
type ProgressChange = { courseId: string; path: string; patch: Partial<ProgressRecord>; secondsDelta?: number };
const listeners = new Set<(c: ProgressChange) => void>();
export function onProgressChange(fn: (c: ProgressChange) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const emit = (c: ProgressChange) => listeners.forEach((fn) => fn(c));

export async function deleteCourse(courseId: string) {
  await db.transaction("rw", [db.courses, db.files, db.progress, db.state, db.activity], async () => {
    await db.files.where("courseId").equals(courseId).delete();
    await db.progress.where("courseId").equals(courseId).delete();
    await db.activity.where("courseId").equals(courseId).delete();
    await db.state.delete(courseId);
    await db.courses.delete(courseId);
  });
}

export async function updateProgress(courseId: string, path: string, patch: Partial<ProgressRecord>, opts: { silent?: boolean } = {}) {
  await db.transaction("rw", db.progress, async () => {
    const cur = await db.progress.get([courseId, path]);
    await db.progress.put({ ...(cur ?? { courseId, path }), ...patch });
  });
  if (!opts.silent) emit({ courseId, path, patch });
}

export async function addStudyTime(courseId: string, path: string, seconds: number) {
  const day = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD local
  await db.transaction("rw", [db.progress, db.activity], async () => {
    const cur = await db.progress.get([courseId, path]);
    await db.progress.put({ ...(cur ?? { courseId, path }), seconds: (cur?.seconds ?? 0) + seconds });
    const a = await db.activity.get([day, courseId]);
    await db.activity.put({ day, courseId, seconds: (a?.seconds ?? 0) + seconds });
  });
  emit({ courseId, path, patch: {}, secondsDelta: seconds });
}

export function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
}
