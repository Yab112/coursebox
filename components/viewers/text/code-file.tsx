"use client";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, Download, Pencil, Play, RotateCcw, Square } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { basename, dirname } from "@/lib/analyzers/utils";
import { db } from "@/lib/db";
import { languageLabel } from "@/lib/filetype";
import type { Output } from "@/lib/notebook";
import { appendOutput, folderFiles, PythonSession, type PyState } from "@/lib/python";
import { cn } from "@/lib/utils";
import { CodeView } from "./code-view";
import { RunPanel } from "./run-panel";

const CodeEditor = dynamic(() => import("./editor"), { ssr: false, loading: () => <div className="skeleton m-4 h-40 rounded-lg" /> });

const btn = "inline-flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-surface-2 hover:text-foreground";

function download(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Runs Python for one file: a session per open file, created on first run. */
export function usePython() {
  const [state, setState] = useState<PyState>({ kind: "idle" });
  const session = useRef<PythonSession | null>(null);
  useEffect(() => () => session.current?.stop(), []);
  const get = () => (session.current ??= new PythonSession(setState));
  return { state, get, stop: () => session.current?.stop() };
}

/**
 * A course code file you can edit (your own copy, saved on this device; the original is never changed) and,
 * for Python, run in the browser.
 */
export function CodeFile({ code, lang, path, courseId, truncated }: { code: string; lang?: string; path: string; courseId: string; truncated?: boolean }) {
  const edit = useLiveQuery(() => db.edits.get([courseId, path]), [courseId, path]);
  const [editing, setEditing] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [saved, setSaved] = useState(true);
  const [confirmReset, setConfirmReset] = useState(false);
  const [outputs, setOutputs] = useState<Output[] | null>(null);
  const py = usePython();
  const mounted = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const mine = edit?.text;
  const text = editing ? (draft ?? mine ?? code) : showOriginal ? code : (mine ?? code);
  const runnable = lang === "python";
  const running = py.state.kind === "busy" || py.state.kind === "loading";

  const save = async (value: string) => {
    clearTimeout(saveTimer.current);
    if (value === code) await db.edits.delete([courseId, path]);
    else await db.edits.put({ courseId, path, text: value, updatedAt: Date.now() });
    setSaved(true);
  };
  const onChange = (value: string) => {
    setDraft(value);
    setSaved(false);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(value), 500);
  };
  useEffect(() => () => clearTimeout(saveTimer.current), []);

  const run = async () => {
    if (running) return;
    const source = text;
    setOutputs([]);
    const session = py.get();
    if (!mounted.current) {
      mounted.current = true;
      // Code often opens files next to it ("data.csv"): give the interpreter the same folder.
      session.addFiles(await folderFiles(courseId, dirname(path))).catch(() => undefined);
    }
    await session.run(source, (o) => setOutputs((prev) => appendOutput(prev ?? [], o)));
  };

  const reset = async () => {
    if (!confirmReset) return setConfirmReset(true);
    await db.edits.delete([courseId, path]);
    setDraft(null);
    setConfirmReset(false);
    setEditing(false);
  };

  const runButton = runnable && (
    <button
      type="button"
      onClick={running ? py.stop : run}
      className={cn("inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium", running ? "text-[var(--danger)] hover:bg-surface-2" : "bg-primary text-primary-foreground hover:bg-primary-hover")}
      title="Run (Shift+Enter in the editor)"
    >
      {running ? <Square className="size-3 fill-current" /> : <Play className="size-3.5 fill-current" />} {running ? "Stop" : "Run"}
    </button>
  );

  const panel = outputs && <RunPanel outputs={outputs} state={py.state} onStop={py.stop} onClear={() => setOutputs(null)} />;

  if (editing)
    return (
      <div className="flex h-full flex-col bg-surface">
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-1.5 text-xs text-muted">
          <span className="rounded bg-surface-2 px-2 py-0.5 font-medium text-foreground">{languageLabel(lang)}</span>
          <span className="rounded bg-primary-soft px-2 py-0.5 font-medium text-primary">Editing your copy</span>
          <span className="tabular-nums">{saved ? "Saved on this device" : "Saving…"}</span>
          <div className="ml-auto flex items-center gap-1">
            {mine !== undefined && (
              <button type="button" onClick={reset} onBlur={() => setConfirmReset(false)} className={cn(btn, confirmReset && "text-[var(--danger)]")}>
                <RotateCcw className="size-3.5" /> {confirmReset ? "Click again to discard your changes" : "Reset to original"}
              </button>
            )}
            <button type="button" onClick={() => download(text, basename(path))} className={btn}>
              <Download className="size-3.5" /> Download
            </button>
            {runButton}
            <button
              type="button"
              onClick={async () => {
                if (draft !== null) await save(draft);
                setDraft(null);
                setEditing(false);
              }}
              className={cn(btn, "font-medium text-foreground")}
            >
              <Check className="size-3.5" /> Done
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <CodeEditor value={text} filename={path} onChange={onChange} onSave={() => draft !== null && save(draft)} onRun={runnable ? run : undefined} autoFocus />
        </div>
        {panel}
      </div>
    );

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        <CodeView
          code={text}
          lang={lang}
          truncated={truncated}
          toolbarExtra={
            <>
              {mine !== undefined && (
                <span className="inline-flex rounded-md bg-surface-2 p-0.5">
                  {(["Mine", "Original"] as const).map((l) => (
                    <button
                      key={l}
                      type="button"
                      aria-pressed={(l === "Original") === showOriginal}
                      onClick={() => setShowOriginal(l === "Original")}
                      className={cn("rounded px-2 py-0.5", (l === "Original") === showOriginal ? "bg-surface font-medium text-foreground shadow-sm" : "hover:text-foreground")}
                    >
                      {l}
                    </button>
                  ))}
                </span>
              )}
              {!truncated && (
                <button
                  type="button"
                  onClick={() => {
                    setShowOriginal(false);
                    setEditing(true);
                  }}
                  className={btn}
                >
                  <Pencil className="size-3.5" /> {mine !== undefined ? "Edit" : "Edit a copy"}
                </button>
              )}
              {runButton}
            </>
          }
        />
      </div>
      {panel}
    </div>
  );
}

