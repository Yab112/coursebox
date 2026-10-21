"use client";
import DOMPurify from "dompurify";
import { Code2, EyeOff } from "lucide-react";
import { useMemo, useState } from "react";
import { parseAnsi } from "@/lib/ansi";
import { join, parseNotebook, type Output } from "@/lib/notebook";
import { languageLabel } from "@/lib/filetype";
import { cn } from "@/lib/utils";
import { CodeView, CopyButton, Highlighted } from "./code-view";
import { Markdown } from "./markdown";

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

function OutputView({ o }: { o: Output }) {
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

function Prompt({ label, n }: { label: "In" | "Out"; n?: number | null }) {
  return (
    <span className={cn("hidden w-16 shrink-0 pt-3 pr-2 text-right font-mono text-[11px] select-none sm:block", label === "In" ? "text-primary" : "text-[#cf222e] dark:text-[#ff7b72]")}>
      {label}&nbsp;[{n ?? " "}]:
    </span>
  );
}

export function NotebookView({ text, courseId, baseDir }: { text: string; courseId?: string; baseDir?: string }) {
  const nb = useMemo(() => parseNotebook(text), [text]);
  const [hideCode, setHideCode] = useState(false);
  if (!nb) return <CodeView code={text} lang="json" />;
  const lang = nb.lang === "ipython" ? "python" : nb.lang;
  const codeCells = nb.cells.filter((c) => c.cell_type === "code").length;

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5 text-xs text-muted">
        <span className="rounded bg-surface-2 px-2 py-0.5 font-medium text-foreground">Jupyter notebook</span>
        <span>
          {languageLabel(lang)} · {nb.cells.length} cells · {codeCells} code
        </span>
        <button
          type="button"
          onClick={() => setHideCode((h) => !h)}
          aria-pressed={hideCode}
          className={cn("ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-surface-2 hover:text-foreground", hideCode && "bg-surface-2 text-foreground")}
        >
          {hideCode ? <Code2 className="size-3.5" /> : <EyeOff className="size-3.5" />} {hideCode ? "Show code" : "Hide code"}
        </button>
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-4xl space-y-3 px-3 py-6 sm:px-6">
          {nb.cells.map((c, i) => {
            const src = join(c.source);
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
            const result = c.outputs?.find((o) => o.output_type === "execute_result");
            return (
              <div key={i} className="space-y-1">
                {!hideCode && (
                  <div className="flex">
                    <Prompt label="In" n={c.execution_count} />
                    <div className="group relative min-w-0 flex-1 overflow-hidden rounded-lg border border-border bg-surface-2/50">
                      <CopyButton text={src} className="absolute top-1.5 right-1.5 z-10 bg-surface opacity-0 shadow-sm group-hover:opacity-100 focus:opacity-100" />
                      <div className="scrollbar-thin overflow-x-auto">
                        <Highlighted code={src} lang={lang} numbers={false} className="px-4 py-2.5" />
                      </div>
                    </div>
                  </div>
                )}
                {!!c.outputs?.length && (
                  <div className="flex">
                    {result ? <Prompt label="Out" n={result.execution_count ?? c.execution_count} /> : <span className="hidden w-16 shrink-0 sm:block" />}
                    <div className="min-w-0 flex-1 overflow-hidden rounded-lg">
                      {c.outputs.map((o, j) => (
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
