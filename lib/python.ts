import pyodidePkg from "pyodide/package.json";
import type { Output } from "./notebook";
import type { PyRequest, PyResponse } from "./python-protocol";

/**
 * A Python session (one Pyodide worker, public/python-worker.mjs). The interpreter is served from /pyodide (copied
 * from the npm package at build time); extra packages come from Pyodide's CDN the first time code imports them. Stopping terminates the
 * worker, which is the only reliable way to interrupt an infinite loop; the next run starts a fresh interpreter.
 */
export type PyState = { kind: "idle" } | { kind: "loading"; message: string } | { kind: "ready"; version: string } | { kind: "busy"; message?: string } | { kind: "failed"; message: string };

const PACKAGES = process.env.NEXT_PUBLIC_PYODIDE_PACKAGES ?? `https://cdn.jsdelivr.net/pyodide/v${pyodidePkg.version}/full/`;

export class PythonSession {
  private worker?: Worker;
  private ready?: Promise<void>;
  private nextId = 1;
  private handlers = new Map<number, (r: PyResponse) => void>();
  private version = "";

  constructor(private readonly onState: (s: PyState) => void) {}

  private start() {
    if (this.ready) return this.ready;
    const w = new Worker("/python-worker.mjs", { type: "module" });
    this.worker = w;
    this.ready = new Promise<void>((resolve, reject) => {
      w.onmessage = (ev: MessageEvent<PyResponse>) => {
        const m = ev.data;
        if (m.type === "status") this.onState(this.handlers.size ? { kind: "busy", message: m.message } : { kind: "loading", message: m.message });
        else if (m.type === "ready") {
          this.version = m.version;
          this.onState({ kind: "ready", version: m.version });
          resolve();
        } else if (m.type === "fatal") {
          this.onState({ kind: "failed", message: m.message });
          reject(new Error(m.message));
        } else this.handlers.get(m.id)?.(m);
      };
      w.onerror = (e) => {
        const message = e.message || "Python couldn't start";
        this.onState({ kind: "failed", message });
        reject(new Error(message));
      };
    });
    this.onState({ kind: "loading", message: "Loading Python…" });
    w.postMessage({ type: "init", indexURL: `${location.origin}/pyodide/`, packageBaseUrl: PACKAGES } satisfies PyRequest);
    return this.ready;
  }

  /** Puts files (e.g. the CSVs next to a notebook) in the interpreter's working directory. */
  async addFiles(files: { name: string; data: ArrayBuffer }[]) {
    await this.start();
    this.worker!.postMessage({ type: "files", files } satisfies PyRequest, files.map((f) => f.data));
  }

  /** Runs code; `onOutput` receives Jupyter-style outputs as they happen. */
  async run(code: string, onOutput: (o: Output) => void): Promise<void> {
    await this.start();
    const worker = this.worker;
    const id = this.nextId++;
    this.onState({ kind: "busy" });
    await new Promise<void>((resolve) => {
      this.handlers.set(id, (m) => {
        if (m.type === "stream") onOutput({ output_type: "stream", name: m.name, text: m.text });
        else if (m.type === "error") onOutput({ output_type: "error", traceback: [m.traceback] });
        else if (m.type === "result") {
          if (m.text || m.html) {
            const data: Record<string, string> = {};
            if (m.html) data["text/html"] = m.html;
            if (m.text) data["text/plain"] = m.text;
            onOutput({ output_type: "execute_result", data });
          }
          for (const png of m.images) onOutput({ output_type: "display_data", data: { "image/png": png } });
        } else if (m.type === "done") {
          this.handlers.delete(id);
          resolve();
        }
      });
      this.worker!.postMessage({ type: "run", id, code } satisfies PyRequest);
    });
    // Not after stop(): that worker is gone and the state is already "idle".
    if (this.worker === worker && !this.handlers.size) this.onState({ kind: "ready", version: this.version });
  }

  /** Kills the interpreter (and anything running in it). */
  stop() {
    this.worker?.terminate();
    this.worker = undefined;
    this.ready = undefined;
    for (const h of this.handlers.values()) h({ type: "done", id: 0 });
    this.handlers.clear();
    this.onState({ kind: "idle" });
  }
}

/** Same-folder course files for the interpreter's working directory (notebooks reading "data.csv"). */
export const MOUNT_LIMITS = { fileBytes: 15 * 1024 ** 2, totalBytes: 60 * 1024 ** 2 };

/** Reads the course files that sit in `dir` (not subfolders) within the size limits above. */
export async function folderFiles(courseId: string, dir: string): Promise<{ name: string; data: ArrayBuffer }[]> {
  const { db } = await import("./db");
  const rows = await db.files.where("courseId").equals(courseId).toArray();
  const prefix = dir ? `${dir}/` : "";
  const out: { name: string; data: ArrayBuffer }[] = [];
  let total = 0;
  for (const r of rows) {
    if (!r.path.startsWith(prefix) || r.path.slice(prefix.length).includes("/")) continue;
    if (r.size > MOUNT_LIMITS.fileBytes || total + r.size > MOUNT_LIMITS.totalBytes) continue;
    total += r.size;
    out.push({ name: r.path.slice(prefix.length), data: await r.blob.arrayBuffer() });
  }
  return out;
}

/** Adds an output, merging consecutive prints to the same stream into one block (like Jupyter). */
export function appendOutput(list: Output[], o: Output): Output[] {
  const last = list.at(-1);
  if (o.output_type === "stream" && last?.output_type === "stream" && last.name === o.name)
    return [...list.slice(0, -1), { ...last, text: String(last.text ?? "") + String(o.text ?? "") }];
  return [...list, o];
}
