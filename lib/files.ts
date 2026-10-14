/**
 * Single entry point for reading course files.
 * Local IndexedDB is the cache; courses saved to the account fetch missing files from storage on demand.
 */
import { mimeType } from "./analyzers/utils";
import { api, getToken } from "./api";
import { db } from "./db";

const urlCache = new Map<string, { url: string; exp: number }>();
const inflight = new Map<string, Promise<Blob | undefined>>();

// Batch presign requests made in the same tick (a page full of images, an analyzer pass...).
let pending: { remoteId: string; path: string; resolve: (u: string | undefined) => void }[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;

function flush() {
  timer = undefined;
  const batch = pending;
  pending = [];
  const byCourse = new Map<string, typeof batch>();
  for (const p of batch) byCourse.set(p.remoteId, [...(byCourse.get(p.remoteId) ?? []), p]);
  for (const [remoteId, items] of byCourse) {
    for (let i = 0; i < items.length; i += 200) {
      const chunk = items.slice(i, i + 200);
      api
        .fileUrls(remoteId, [...new Set(chunk.map((c) => c.path))])
        .then(({ urls }) => {
          for (const c of chunk) {
            const url = urls[c.path];
            if (url) urlCache.set(`${remoteId}|${c.path}`, { url, exp: Date.now() + 50 * 60_000 });
            c.resolve(url);
          }
        })
        .catch(() => chunk.forEach((c) => c.resolve(undefined)));
    }
  }
}

/** A short-lived URL for a file of a course saved in the account. */
export function remoteFileUrl(remoteId: string, path: string): Promise<string | undefined> {
  const hit = urlCache.get(`${remoteId}|${path}`);
  if (hit && hit.exp > Date.now()) return Promise.resolve(hit.url);
  return new Promise((resolve) => {
    pending.push({ remoteId, path, resolve });
    timer ??= setTimeout(flush, 15);
  });
}

async function remoteIdOf(courseId: string) {
  if (!getToken()) return undefined;
  return (await db.courses.get(courseId))?.remoteId;
}

/** File contents, downloading and caching them if this device doesn't have them yet. */
export function getFile(courseId: string, path: string): Promise<Blob | undefined> {
  const key = `${courseId}|${path}`;
  const running = inflight.get(key);
  if (running) return running;
  const p = (async () => {
    const local = await db.files.get([courseId, path]);
    if (local) return local.blob;
    const remoteId = await remoteIdOf(courseId);
    if (!remoteId) return undefined;
    const url = await remoteFileUrl(remoteId, path);
    if (!url) return undefined;
    const res = await fetch(url);
    if (!res.ok) return undefined;
    const blob = new Blob([await res.blob()], { type: mimeType(path) });
    await db.files.put({ courseId, path, blob, size: blob.size, mime: blob.type });
    return blob;
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/**
 * URL to play/show a file. Local files become object URLs; large media of account courses
 * stream straight from storage (with Range support) instead of downloading first.
 */
export async function getPlayableUrl(courseId: string, path: string, stream: boolean): Promise<{ url: string; revoke?: () => void } | undefined> {
  const local = await db.files.get([courseId, path]);
  if (local) {
    const url = URL.createObjectURL(local.blob);
    return { url, revoke: () => URL.revokeObjectURL(url) };
  }
  const remoteId = await remoteIdOf(courseId);
  if (!remoteId) return undefined;
  if (stream) {
    const url = await remoteFileUrl(remoteId, path);
    return url ? { url } : undefined;
  }
  const blob = await getFile(courseId, path);
  if (!blob) return undefined;
  const url = URL.createObjectURL(blob);
  return { url, revoke: () => URL.revokeObjectURL(url) };
}

/** Downloads (and caches) many files at once, e.g. before re-analysing an account course. */
export async function prefetch(courseId: string, paths: string[], concurrency = 6) {
  let i = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (i < paths.length) await getFile(courseId, paths[i++]);
    }),
  );
}

/** Every file path of a course: the local cache plus, for account courses, the server's list. */
export async function listCourseFiles(courseId: string): Promise<{ path: string; size: number; cached: boolean }[]> {
  const local = await db.files.where("courseId").equals(courseId).toArray((fs) => fs.map((f) => ({ path: f.path, size: f.size })));
  const course = await db.courses.get(courseId);
  if (!course?.remoteId || !course.lazy || !getToken()) return local.map((f) => ({ ...f, cached: true }));
  const cached = new Set(local.map((f) => f.path));
  try {
    const remote = await api.getCourse(course.remoteId);
    return remote.files.map((f) => ({ path: f.path, size: f.size, cached: cached.has(f.path) }));
  } catch {
    return local.map((f) => ({ ...f, cached: true }));
  }
}
