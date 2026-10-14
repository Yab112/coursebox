/**
 * Streams progress changes to the account, batched every few seconds.
 * The queue is mirrored in localStorage, so changes made right before a reload or a closed tab
 * are sent on the next visit instead of being lost.
 */
import { api, getToken, type ProgressItem } from "./api";
import { db, onProgressChange } from "./db";

type Queue = Record<string, { items: Record<string, ProgressItem>; lastLessonPath?: string }>;
const STORE = "coursebox.syncQueue";

let queue: Queue = {};
let timer: ReturnType<typeof setTimeout> | undefined;
let flushing = false;
let started = false;

function persist() {
  try {
    if (Object.keys(queue).length) localStorage.setItem(STORE, JSON.stringify(queue));
    else localStorage.removeItem(STORE);
  } catch {}
}

function load(): Queue {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? "{}") as Queue;
  } catch {
    return {};
  }
}

function schedule(ms = 4000) {
  timer ??= setTimeout(() => void flush(), ms);
}

function merge(a: ProgressItem | undefined, b: ProgressItem): ProgressItem {
  if (!a) return b;
  const seconds = Math.min(3600, (a.secondsDelta ?? 0) + (b.secondsDelta ?? 0));
  return { ...a, ...b, secondsDelta: seconds || undefined };
}

function entry(courseId: string) {
  return (queue[courseId] ??= { items: {} });
}

export async function flush(keepalive = false) {
  timer = undefined;
  if (flushing) return schedule(1000);
  if (!getToken()) return;
  flushing = true;
  try {
    for (const courseId of Object.keys(queue)) {
      const course = await db.courses.get(courseId);
      if (!course?.remoteId) {
        // Not in the account (yet). The first upload sends all progress anyway, so only keep
        // changes for courses that are being saved right now.
        if (course?.syncState !== "uploading") delete queue[courseId];
        continue;
      }
      if (course.syncState === "uploading") continue;
      const sent = queue[courseId];
      // Only drop the persisted copy once the server has it (a reload mid-request must not lose it).
      delete queue[courseId];
      try {
        await api.syncProgress(
          course.remoteId,
          { items: Object.values(sent.items), lastLessonPath: sent.lastLessonPath, day: new Date().toLocaleDateString("en-CA") },
          keepalive,
        );
        persist();
      } catch {
        // Offline or a server hiccup: put the changes back (newer ones win) and retry later.
        const cur = entry(courseId);
        for (const [path, it] of Object.entries(sent.items)) cur.items[path] = merge(it, cur.items[path] ?? { path });
        cur.lastLessonPath ??= sent.lastLessonPath;
        schedule(15_000);
      }
    }
  } finally {
    flushing = false;
    persist();
    if (Object.keys(queue).length) schedule();
  }
}

export function noteLastLesson(courseId: string, path: string) {
  entry(courseId).lastLessonPath = path;
  persist();
  schedule();
}

/** Call once on the client. */
export function startProgressSync() {
  if (started || typeof window === "undefined") return;
  started = true;
  queue = load();
  if (Object.keys(queue).length) schedule(1500);

  onProgressChange(({ courseId, path, patch, secondsDelta }) => {
    if (!getToken()) return;
    const item: ProgressItem = { path };
    if (patch.completed !== undefined) {
      item.completed = patch.completed;
      item.changedAt = new Date(patch.changedAt ?? Date.now()).toISOString();
    }
    if (patch.lastPage) item.lastPage = patch.lastPage;
    if (patch.position !== undefined) item.position = patch.position;
    if (patch.lastOpenedAt) item.lastOpenedAt = new Date(patch.lastOpenedAt).toISOString();
    if (secondsDelta) item.secondsDelta = secondsDelta;
    const e = entry(courseId);
    e.items[path] = merge(e.items[path], item);
    persist();
    schedule();
  });
  window.addEventListener("pagehide", () => void flush(true));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flush(true);
  });
}
