"use client";
import DOMPurify from "dompurify";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, Code2, EyeOff, Pencil, Play, RotateCcw, Square } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { parseAnsi } from "@/lib/ansi";
import { db } from "@/lib/db";
import { join, parseNotebook, type Output } from "@/lib/notebook";
import { appendOutput, folderFiles } from "@/lib/python";
import { languageLabel } from "@/lib/filetype";
import { cn } from "@/lib/utils";
import { CodeView, CopyButton, Highlighted } from "./code-view";
import { usePython } from "./code-file";
import { Markdown } from "./markdown";
import { PyStatus } from "./run-panel";

const CodeEditor = dynamic(() => import("./editor"), { ssr: false, loading: () => <div className="skeleton m-2 h-16 rounded" /> });

const SAFE_HTML = { USE_PROFILES: { html: true, svg: true }, FORBID_TAGS: ["style", "script", "iframe", "form"], FORBID_ATTR: ["style"] };

function Ansi({ text }: { text: string }) {
  return (
    <>
      {parseAnsi(text).map((s, i) => (
        <span key={i} style={s.fg ? { color: s.fg } : undefined} className={s.bold ? "font-semibold" : undefined}>
          {s.text}
        </span>
      ))}
    </>
  );
}

export function OutputView({ o }: { o: Output }) {
  if (o.output_type === "stream")
    return (
      <pre className={cn("px-4 py-2 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap", o.name === "stderr" && "bg-[#fff8f8] text-[#9a1c1c] dark:bg-[#2a1515] dark:text-[#ffb4b4]")}>
        <Ansi text={join(o.text)} />
      </pre>
    );
  if (o.output_type === "error")
    return (
      <pre className="bg-[#fff8f8] px-4 py-2 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap dark:bg-[#2a1515]">
        {o.traceback?.length ? <Ansi text={o.traceback.join("\n")} /> : `${o.ename}: ${o.evalue}`}
      </pre>
    );
  const d = o.data ?? {};
  if (d["text/html"]) {
    const html = DOMPurify.sanitize(join(d["text/html"]), SAFE_HTML);
    return <div className="nb-html scrollbar-thin overflow-x-auto px-4 py-3" dangerouslySetInnerHTML={{ __html: html }} />;
  }
  if (d["image/svg+xml"])
    return <div className="overflow-x-auto bg-white p-2" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(join(d["image/svg+xml"]), { USE_PROFILES: { svg: true } }) }} />;
  for (const mime of ["image/png", "image/jpeg", "image/gif"])
    if (d[mime])
      // eslint-disable-next-line @next/next/no-img-element
      return <img alt="Cell output" src={`data:${mime};base64,${join(d[mime]).replace(/\s/g, "")}`} className="max-w-full bg-white p-2" />;
  if (d["text/markdown"]) return <Markdown text={join(d["text/markdown"])} className="px-4 py-3" />;
  if (d["text/latex"]) return <Markdown text={join(d["text/latex"]).replace(/^\s*\$?\$?|\$?\$?\s*$/g, "$$$$\n").trim()} className="px-4 py-3" />;
  if (d["application/json"]) return <pre className="px-4 py-2 font-mono text-[12.5px]">{join(d["application/json"])}</pre>;
  if (d["text/plain"])
    return (
      <pre className="px-4 py-2 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap">
        <Ansi text={join(d["text/plain"])} />
      </pre>
    );
  return null;
}

function Prompt({ label, n }: { label: "In" | "Out"; n?: number | "*" | null }) {
  return (
    <span className={cn("hidden w-16 shrink-0 pt-3 pr-2 text-right font-mono text-[11px] select-none sm:block", label === "In" ? "text-primary" : "text-[#cf222e] dark:text-[#ff7b72]")}>
      {label}&nbsp;[{n ?? " "}]:
    </span>
  );
}

/** Saves `sources` (cell index -> code) into a copy of the notebook JSON; outputs stay as they were. */
function withSources(raw: string, sources: Record<number, string>) {
  const nb = JSON.parse(raw);
  for (const [i, src] of Object.entries(sources)) if (nb.cells?.[Number(i)]) nb.cells[Number(i)].source = src;
  return JSON.stringify(nb);
}

/**
 * A Jupyter notebook like Jupyter shows it, and runnable: each code cell has Run (Shift+Enter while editing),
 * cells can be edited (your copy, saved on this device), and Run all / Restart drive one Python session.
 * Files next to the notebook are available to it, so `pd.read_csv("data.csv")` works.
 */
export function NotebookView({ text, courseId, path, baseDir }: { text: string; courseId?: string; path?: string; baseDir?: string }) {
  const edit = useLiveQuery(() => (courseId && path ? db.edits.get([courseId, path]) : undefined), [courseId, path]);
  const [showOriginal, setShowOriginal] = useState(false);
  const source = !showOriginal && edit ? edit.text : text;
  const nb = useMemo(() => parseNotebook(source), [source]);
  const editable = !!courseId && !!path && Array.isArray((nb as { cells?: unknown })?.cells) && /"cells"\s*:/.test(text);

  const [hideCode, setHideCode] = useState(false);
  const [editingCell, setEditingCell] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [runs, setRuns] = useState<Record<number, { outputs: Output[]; count: number | "*" }>>({});
  const counter = useRef(0);
  const generation = useRef(0);
  const py = usePython();
  const mounted = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(saveTimer.current), []);

  if (!nb) return <CodeView code={text} lang="json" />;
  const lang = nb.lang === "ipython" ? "python" : nb.lang;
  const canRun = lang === "python";
  const codeCells = nb.cells.filter((c) => c.cell_type === "code").length;
  const running = py.state.kind === "busy" || py.state.kind === "loading";
  const srcOf = (i: number) => drafts[i] ?? join(nb.cells[i].source);

  const setDraft = (i: number, v: string) => {
    const next = { ...drafts, [i]: v };
    setDrafts(next);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (!courseId || !path) return;
      const updated = withSources(source, next);
      if (updated === withSources(text, {})) db.edits.delete([courseId, path]);
      else db.edits.put({ courseId, path, text: updated, updatedAt: Date.now() });
    }, 500);
  };

  const runCell = async (i: number) => {
    const session = py.get();
    if (!mounted.current && courseId) {
      mounted.current = true;
      session.addFiles(await folderFiles(courseId, baseDir ?? "")).catch(() => undefined);
    }
    setRuns((r) => ({ ...r, [i]: { outputs: [], count: "*" } }));
    const n = ++counter.current;
    let failed = false;
    await session.run(srcOf(i), (o) => {
      if (o.output_type === "error") failed = true;
      setRuns((r) => ({ ...r, [i]: { ...r[i], outputs: appendOutput(r[i]?.outputs ?? [], o) } }));
    });
    setRuns((r) => ({ ...r, [i]: { ...r[i], count: n } }));
    return failed;
  };

  const runAll = async () => {
    const g = generation.current;
    for (let i = 0; i < nb.cells.length; i++) {
      if (nb.cells[i].cell_type !== "code") continue;
      if (generation.current !== g) break; // stopped or restarted meanwhile
      // Stop at the first error, like Jupyter's "Run all".
      if (await runCell(i)) break;
    }
  };

  const stop = () => {
    generation.current++;
    py.stop();
  };

  const restart = () => {
    stop();
    mounted.current = false;
    counter.current = 0;
    setRuns({});
  };

  const tb = "inline-flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-surface-2 hover:text-foreground disabled:opacity-40";

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-1.5 text-xs text-muted">
        <span className="rounded bg-surface-2 px-2 py-0.5 font-medium text-foreground">Jupyter notebook</span>
        <span>
          {languageLabel(lang)} · {nb.cells.length} cells · {codeCells} code
        </span>
        {canRun && <PyStatus state={py.state} />}
        <div className="ml-auto flex flex-wrap items-center gap-1">
          {edit && (
            <span className="inline-flex rounded-md bg-surface-2 p-0.5">
              {(["Mine", "Original"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  aria-pressed={(l === "Original") === showOriginal}
                  onClick={() => {
                    setShowOriginal(l === "Original");
                    setDrafts({});
                    setEditingCell(null);
                  }}
                  className={cn("rounded px-2 py-0.5", (l === "Original") === showOriginal ? "bg-surface font-medium text-foreground shadow-sm" : "hover:text-foreground")}
                >
                  {l}
                </button>
              ))}
            </span>
          )}
          {canRun && (
            <>
              <button type="button" onClick={runAll} disabled={running} className={cn(tb, "font-medium text-foreground")}>
                <Play className="size-3.5 fill-current" /> Run all
              </button>
              {running ? (
                <button type="button" onClick={stop} className={cn(tb, "text-[var(--danger)]")}>
                  <Square className="size-3 fill-current" /> Stop
                </button>
              ) : (
                <button type="button" onClick={restart} disabled={py.state.kind === "idle"} className={tb}>
                  <RotateCcw className="size-3.5" /> Restart
                </button>
              )}
            </>
          )}
          <button type="button" onClick={() => setHideCode((h) => !h)} aria-pressed={hideCode} className={cn(tb, hideCode && "bg-surface-2 text-foreground")}>
            {hideCode ? <Code2 className="size-3.5" /> : <EyeOff className="size-3.5" />} {hideCode ? "Show code" : "Hide code"}
          </button>
        </div>
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-4xl space-y-3 px-3 py-6 sm:px-6">
          {nb.cells.map((c, i) => {
            const src = srcOf(i);
            if (c.cell_type === "markdown")
              return (
                <div key={i} className="flex">
                  <span className="hidden w-16 shrink-0 sm:block" />
                  <Markdown text={src} courseId={courseId} baseDir={baseDir} className="min-w-0 flex-1 px-1" />
                </div>
              );
            if (c.cell_type === "raw")
              return (
                <pre key={i} className="ml-0 rounded-lg bg-surface-2 p-3 font-mono text-[12.5px] whitespace-pre-wrap sm:ml-16">
                  {src}
                </pre>
              );
            const live = runs[i];
            const outputs = live ? live.outputs : (c.outputs ?? []);
            const count = live ? live.count : c.execution_count;
            const result = outputs.find((o) => o.output_type === "execute_result");
            const isEditing = editingCell === i;
            return (
              <div key={i} className="space-y-1">
                {!hideCode && (
                  <div className="flex">
                    <Prompt label="In" n={count} />
                    <div
                      className={cn(
                        "group relative min-w-0 flex-1 overflow-hidden rounded-lg border bg-surface-2/50",
                        isEditing ? "border-primary" : count === "*" ? "border-primary/50" : "border-border",
                      )}
                    >
                      <div className="absolute top-1.5 right-1.5 z-10 flex gap-1 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
                        {canRun && (
                          <button
                            type="button"
                            onClick={() => runCell(i)}
                            disabled={running}
                            aria-label={`Run cell ${i + 1}`}
                            className="inline-flex items-center gap-1 rounded-md bg-surface px-2 py-1 text-xs text-primary shadow-sm hover:bg-primary-soft disabled:opacity-40"
                          >
                            <Play className="size-3 fill-current" /> Run
                          </button>
                        )}
                        {editable && (
                          <button
                            type="button"
                            onClick={() => setEditingCell(isEditing ? null : i)}
                            aria-label={isEditing ? `Stop editing cell ${i + 1}` : `Edit cell ${i + 1}`}
                            className="inline-flex items-center gap-1 rounded-md bg-surface px-2 py-1 text-xs text-muted shadow-sm hover:text-foreground"
                          >
                            {isEditing ? <Check className="size-3" /> : <Pencil className="size-3" />} {isEditing ? "Done" : "Edit"}
                          </button>
                        )}
                        <CopyButton text={src} className="bg-surface shadow-sm" />
                      </div>
                      {isEditing ? (
                        <div className="py-1.5">
                          <CodeEditor
                            value={src}
                            filename={`cell.${lang === "python" ? "py" : (lang ?? "txt")}`}
                            onChange={(v) => setDraft(i, v)}
                            onRun={canRun ? () => runCell(i) : undefined}
                            autoFocus
                            minimal
                          />
                        </div>
                      ) : (
                        <div className="scrollbar-thin overflow-x-auto" onDoubleClick={() => editable && setEditingCell(i)}>
                          <Highlighted code={src} lang={lang} numbers={false} className="px-4 py-2.5" />
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {!!outputs.length && (
                  <div className="flex">
                    {result ? <Prompt label="Out" n={typeof count === "number" ? count : result.execution_count} /> : <span className="hidden w-16 shrink-0 sm:block" />}
                    <div className="min-w-0 flex-1 overflow-hidden rounded-lg">
                      {outputs.map((o, j) => (
                        <OutputView key={j} o={o} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
