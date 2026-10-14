"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { db, newId, type CourseRecord } from "@/lib/db";
import type { ImportPreview, WorkerRequest, WorkerResponse } from "@/lib/import.worker";

export type ImportState =
  | { phase: "idle" }
  | { phase: "working"; fileName: string; message: string; progress: number }
  | { phase: "confirm"; fileName: string; preview: ImportPreview; existing: CourseRecord }
  | { phase: "error"; fileName: string; message: string };

export function useImporter(onDone: (courseId: string) => void) {
  const [state, setState] = useState<ImportState>({ phase: "idle" });
  const workerRef = useRef<Worker | null>(null);
  const fileNameRef = useRef("");
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const send = (m: WorkerRequest) => workerRef.current?.postMessage(m);

  const store = useCallback((courseId: string, replace: boolean) => {
    setState({ phase: "working", fileName: fileNameRef.current, message: "Saving files…", progress: 0 });
    send({ type: "store", courseId, replace });
  }, []);

  useEffect(() => () => workerRef.current?.terminate(), []);

  const start = useCallback(
    (file: File) => {
      if (!/\.zip$/i.test(file.name)) {
        setState({ phase: "error", fileName: file.name, message: "Please drop a .zip file." });
        return;
      }
      workerRef.current?.terminate();
      const w = new Worker(new URL("../lib/import.worker.ts", import.meta.url), { type: "module" });
      workerRef.current = w;
      fileNameRef.current = file.name;
      navigator.storage?.persist?.().catch(() => {});

      w.onmessage = async (ev: MessageEvent<WorkerResponse>) => {
        const m = ev.data;
        if (m.type === "status") {
          setState({ phase: "working", fileName: file.name, message: m.message, progress: m.progress ?? 0 });
        } else if (m.type === "analyzed") {
          const existing = m.preview.sourceKey
            ? await db.courses.where("sourceKey").equals(m.preview.sourceKey).first()
            : undefined;
          if (existing) setState({ phase: "confirm", fileName: file.name, preview: m.preview, existing });
          else store(newId(), false);
        } else if (m.type === "done") {
          setState({ phase: "idle" });
          w.terminate();
          workerRef.current = null;
          onDoneRef.current(m.courseId);
        } else if (m.type === "error") {
          setState({ phase: "error", fileName: file.name, message: m.message });
          w.terminate();
          workerRef.current = null;
        }
      };
      w.onerror = (e) => setState({ phase: "error", fileName: file.name, message: e.message || "Import failed" });
      setState({ phase: "working", fileName: file.name, message: "Starting…", progress: 0 });
      send({ type: "open", file });
    },
    [store],
  );

  const cancel = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    setState({ phase: "idle" });
  }, []);

  return {
    state,
    start,
    cancel,
    updateExisting: (id: string) => store(id, true),
    importAsNew: () => store(newId(), false),
  };
}
