/// <reference lib="webworker" />
import JSZip from "jszip";
import { analyzeCourse, stripCommonRoot } from "./analyzers";
import { isJunk, mimeType } from "./analyzers/utils";
import { db, type FileRecord } from "./db";

export type WorkerRequest =
  | { type: "open"; file: File }
  | { type: "store"; courseId: string; replace: boolean };

export type ImportPreview = {
  title: string;
  sourceKey?: string;
  analyzer: string;
  fileCount: number;
  totalSize: number;
  lessonCount: number;
};

export type WorkerResponse =
  | { type: "status"; message: string; progress?: number }
  | { type: "analyzed"; preview: ImportPreview }
  | { type: "done"; courseId: string }
  | { type: "error"; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const post = (m: WorkerResponse) => ctx.postMessage(m);

let zip: JSZip | null = null;
let entries: { zipPath: string; path: string; size: number }[] = [];
let archiveName = "";

const sizeOf = (e: JSZip.JSZipObject) =>
  (e as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;

/** Site chrome in OCW exports that the course reader never needs. */
const OCW_SKIP = /^(static_shared\/|.*\.map$)/;

async function analyze(courseId: string) {
  const files = entries.map((e) => e.path);
  const byPath = new Map(entries.map((e) => [e.path, e.zipPath]));
  const read = async (p: string) => {
    const zp = byPath.get(p);
    if (!zp || !zip) throw new Error(`missing ${p}`);
    return zip.file(zp)!.async("string");
  };
  return analyzeCourse(files, read, { courseId, archiveName });
}

ctx.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  try {
    if (msg.type === "open") {
      archiveName = msg.file.name.replace(/\.zip$/i, "");
      post({ type: "status", message: "Reading archive…", progress: 0 });
      zip = await JSZip.loadAsync(msg.file);
      const raw = Object.values(zip.files).filter((f) => !f.dir && !isJunk(f.name));
      const { root, strip } = stripCommonRoot(raw.map((f) => f.name));
      if (root) archiveName = root;
      entries = raw.map((f) => ({ zipPath: f.name, path: strip(f.name), size: sizeOf(f) }));

      post({ type: "status", message: "Analyzing structure…", progress: 0 });
      const { manifest, analyzer } = await analyze("preview");
      if (analyzer === "mit-ocw") entries = entries.filter((e) => !OCW_SKIP.test(e.path));

      post({
        type: "analyzed",
        preview: {
          title: manifest.title,
          sourceKey: manifest.sourceKey,
          analyzer,
          fileCount: entries.length,
          totalSize: entries.reduce((n, e) => n + e.size, 0),
          lessonCount: manifest.sections.reduce((n, s) => n + s.lessons.length, 0),
        },
      });
      return;
    }

    if (msg.type === "store") {
      if (!zip) throw new Error("No archive open");
      const { courseId, replace } = msg;
      const existing = replace ? await db.courses.get(courseId) : undefined;
      if (replace) await db.files.where("courseId").equals(courseId).delete();

      const total = entries.reduce((n, e) => n + e.size, 0) || 1;
      let doneBytes = 0;
      let batch: FileRecord[] = [];
      let batchBytes = 0;
      const flush = async () => {
        if (batch.length) await db.files.bulkPut(batch);
        batch = [];
        batchBytes = 0;
      };

      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const data = await zip.file(e.zipPath)!.async("blob");
        const blob = new Blob([data], { type: mimeType(e.path) });
        batch.push({ courseId, path: e.path, blob, size: blob.size, mime: blob.type });
        batchBytes += blob.size;
        doneBytes += e.size || blob.size;
        if (batch.length >= 25 || batchBytes > 48 * 1024 * 1024) await flush();
        if (i % 5 === 0 || i === entries.length - 1) {
          post({
            type: "status",
            message: `Saving files ${i + 1} / ${entries.length}`,
            progress: Math.min(1, doneBytes / total),
          });
        }
      }
      await flush();

      post({ type: "status", message: "Building course…", progress: 1 });
      const { manifest, analyzer } = await analyze(courseId);
      const now = Date.now();
      await db.courses.put({
        id: courseId,
        title: manifest.title,
        sourceKey: manifest.sourceKey,
        analyzer,
        archiveName,
        manifest,
        fileCount: entries.length,
        totalSize: entries.reduce((n, e) => n + e.size, 0),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        // Keep the link to the account copy; the new version is uploaded as a revision.
        remoteId: existing?.remoteId,
        ownerId: existing?.ownerId,
        syncState: existing?.remoteId ? "local" : undefined,
        lazy: false,
      });
      zip = null;
      entries = [];
      post({ type: "done", courseId });
    }
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
