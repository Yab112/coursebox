/** Saving courses to the account (S3 via the API) and mirroring the account's library on this device. */
import { MANIFEST_VERSION, type CourseManifest } from "./analyzers/types";
import { api, ApiError, getToken, type ProgressItem } from "./api";
import { db, deleteCourse, type CourseRecord } from "./db";

const iso = (ms?: number) => (ms ? new Date(ms).toISOString() : undefined);

async function putWithRetry(url: string, headers: Record<string, string>, blob: Blob) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { method: "PUT", headers, body: blob });
      if (res.ok) return;
      if (res.status < 500 || attempt >= 2) throw new Error(`upload failed (${res.status})`);
    } catch (e) {
      if (attempt >= 2) throw e;
    }
    await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
  }
}

const saving = new Map<string, Promise<void>>();

/**
 * Uploads a local course (or a new version of it) to the signed-in account. Resumable: re-run on failure.
 * Concurrent calls for the same course share one upload (never two copies in the account).
 */
export function saveCourseToAccount(courseId: string, userId: string): Promise<void> {
  const running = saving.get(courseId);
  if (running) return running;
  const p = doSave(courseId, userId).finally(() => saving.delete(courseId));
  saving.set(courseId, p);
  return p;
}

async function doSave(courseId: string, userId: string) {
  const course = await db.courses.get(courseId);
  if (!course) throw new Error("Course not found");
  if (course.lazy) return; // came from the account, nothing to upload

  const files = await db.files.where("courseId").equals(courseId).toArray();
  const body = {
    title: course.manifest.title,
    sourceKey: course.sourceKey ?? null,
    analyzer: course.analyzer,
    archiveName: course.archiveName ?? null,
    clientRef: courseId, // makes a retried create return the same account course
    manifestVersion: course.manifest.version ?? MANIFEST_VERSION,
    manifest: course.manifest,
    files: files.map((f) => ({ path: f.path, size: f.size, mime: f.mime || "application/octet-stream" })),
  };

  // Record the owner up front so an upload interrupted by a reload is resumed for this account.
  await db.courses.update(courseId, { syncState: "uploading", syncProgress: 0, syncError: undefined, ownerId: userId });
  try {
    const firstSave = !course.remoteId;
    let res;
    try {
      res = firstSave ? await api.createCourse(body) : await api.reviseCourse(course.remoteId!, body);
    } catch (e) {
      // The account copy was deleted elsewhere: start over as a new course.
      if (!firstSave && e instanceof ApiError && e.status === 404) res = await api.createCourse(body);
      else throw e;
    }
    const remoteId = res.course.id;
    await db.courses.update(courseId, { remoteId, ownerId: userId });

    const byPath = new Map(files.map((f) => [f.path, f]));
    const total = res.needUpload.reduce((n, p) => n + (byPath.get(p)?.size ?? 0), 0) || 1;
    let done = 0;
    let lastReport = 0;
    const report = async () => {
      if (Date.now() - lastReport < 250 && done < total) return;
      lastReport = Date.now();
      await db.courses.update(courseId, { syncProgress: Math.min(1, done / total) });
    };

    const upload = async (paths: string[]) => {
      for (let i = 0; i < paths.length; i += 100) {
        const { uploads } = await api.uploadUrls(remoteId, paths.slice(i, i + 100));
        let k = 0;
        await Promise.all(
          Array.from({ length: 4 }, async () => {
            while (k < uploads.length) {
              const u = uploads[k++];
              const f = byPath.get(u.path)!;
              await putWithRetry(u.url, u.headers, f.blob);
              done += f.size;
              await report();
            }
          }),
        );
      }
    };
    await upload(res.needUpload);
    try {
      await api.complete(remoteId);
    } catch (e) {
      if (!(e instanceof ApiError && e.code === "upload_incomplete")) throw e;
      await upload((e.details?.missing as string[]) ?? []);
      await api.complete(remoteId);
    }

    await pushAllProgress(courseId, remoteId, { includeTime: firstSave });
    await db.courses.update(courseId, { syncState: "synced", syncProgress: 1 });
  } catch (e) {
    await db.courses.update(courseId, {
      syncState: "error",
      syncError: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}

/** Sends everything this device knows about a course's progress (after the first upload). */
async function pushAllProgress(courseId: string, remoteId: string, opts: { includeTime: boolean }) {
  const rows = await db.progress.where("courseId").equals(courseId).toArray();
  const items: ProgressItem[] = rows.map((p) => ({
    path: p.path,
    ...(p.completed !== undefined ? { completed: !!p.completed, changedAt: iso(p.changedAt ?? p.completedAt) } : {}),
    lastPage: p.lastPage,
    position: p.position,
    secondsDelta: opts.includeTime && p.seconds ? Math.min(3600, Math.round(p.seconds)) : undefined,
    lastOpenedAt: iso(p.lastOpenedAt),
  }));
  const state = await db.state.get(courseId);
  for (let i = 0; i < items.length || i === 0; i += 500) {
    await api.syncProgress(remoteId, {
      items: items.slice(i, i + 500),
      lastLessonPath: i === 0 ? state?.lastLessonPath : undefined,
      day: new Date().toLocaleDateString("en-CA"),
    });
    if (!items.length) break;
  }
}

/**
 * Makes this device's library match the account: courses saved from another device appear
 * (files download on demand), courses deleted elsewhere disappear.
 */
export async function syncLibrary(userId: string) {
  if (!getToken()) return;
  const { courses } = await api.listCourses();
  const remoteIds = new Set(courses.map((c) => c.id));
  const local = await db.courses.toArray();
  const byRemote = new Map(local.filter((c) => c.remoteId).map((c) => [c.remoteId!, c]));

  for (const rc of courses) {
    if (rc.status !== "ready" || byRemote.has(rc.id)) continue;
    const detail = await api.getCourse(rc.id);
    const now = Date.now();
    const record: CourseRecord = {
      id: rc.id,
      title: rc.title,
      sourceKey: rc.sourceKey ?? undefined,
      analyzer: rc.analyzer,
      archiveName: detail.archiveName ?? undefined,
      manifest: { ...(detail.manifest as CourseManifest), id: rc.id },
      fileCount: rc.fileCount,
      totalSize: rc.totalBytes,
      createdAt: Date.parse(rc.createdAt) || now,
      updatedAt: now,
      remoteId: rc.id,
      ownerId: userId,
      syncState: "synced",
      lazy: true,
    };
    await db.courses.put(record);
  }

  for (const c of local) {
    if (!c.remoteId || c.ownerId !== userId || remoteIds.has(c.remoteId) || c.syncState === "uploading") continue;
    if (c.lazy) await removeLocalCourse(c.id);
    else await db.courses.update(c.id, { remoteId: undefined, ownerId: undefined, syncState: "local" });
  }
}

/** Pulls the account's progress for a course into this device (last change wins). */
export async function pullProgress(courseId: string) {
  const course = await db.courses.get(courseId);
  if (!course?.remoteId || !getToken()) return;
  const remote = await api.getProgress(course.remoteId);
  await db.transaction("rw", [db.progress, db.state], async () => {
    for (const r of remote.items) {
      const cur = await db.progress.get([courseId, r.path]);
      const rOpened = r.lastOpenedAt ? Date.parse(r.lastOpenedAt) : 0;
      const rChanged = r.changedAt ? Date.parse(r.changedAt) : 0;
      const next = { ...(cur ?? { courseId, path: r.path }) };
      if (rChanged && rChanged >= (cur?.changedAt ?? 0)) {
        next.completed = r.completed;
        next.completedAt = r.completedAt ? Date.parse(r.completedAt) : undefined;
        next.changedAt = rChanged;
      }
      if (rOpened > (cur?.lastOpenedAt ?? 0)) {
        if (r.lastPage) next.lastPage = r.lastPage;
        if (r.position !== null) next.position = r.position;
        next.lastOpenedAt = rOpened;
      }
      next.seconds = Math.max(cur?.seconds ?? 0, r.seconds);
      await db.progress.put(next);
    }
    const st = await db.state.get(courseId);
    if (remote.lastLessonPath && !st?.lastLessonPath) await db.state.put({ courseId, lastLessonPath: remote.lastLessonPath, lastOpenedAt: Date.now() });
  });
}

export const removeLocalCourse = (courseId: string) => deleteCourse(courseId);

/** Deletes a course everywhere: the account copy (frees the slot and storage) and this device. */
export async function deleteCourseEverywhere(courseId: string) {
  const c = await db.courses.get(courseId);
  if (c?.remoteId && getToken()) {
    try {
      await api.deleteCourse(c.remoteId);
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 404)) throw e;
    }
  }
  await removeLocalCourse(courseId);
}

/** On sign-out, account courses leave this device (they're safe in the account); local-only ones stay. */
export async function forgetAccountCourses(userId: string) {
  const mine = await db.courses.filter((c) => c.ownerId === userId && !!c.remoteId).toArray();
  for (const c of mine) await removeLocalCourse(c.id);
}
