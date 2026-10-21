"use client";
import { Check, Copy, WrapText } from "lucide-react";
import { useEffect, useState } from "react";
import { languageLabel } from "@/lib/filetype";
import { highlightToHtml } from "@/lib/highlight";
import { cn } from "@/lib/utils";

/** Copies text and shows a tick for a moment. */
export function CopyButton({ text, className, label = "Copy" }: { text: string; className?: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
      className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-foreground", className)}
      aria-label={done ? "Copied" : label}
    >
      {done ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
      {done ? "Copied" : label}
    </button>
  );
}

/** Highlighted code, falling back to plain text while it loads or if the file is huge. */
export function Highlighted({ code, lang, wrap, numbers = true, className }: { code: string; lang?: string; wrap?: boolean; numbers?: boolean; className?: string }) {
  const [html, setHtml] = useState<string | null>();
  useEffect(() => {
    let live = true;
    setHtml(undefined);
    highlightToHtml(code, lang)
      .then((h) => live && setHtml(h))
      .catch(() => live && setHtml(null));
    return () => {
      live = false;
    };
  }, [code, lang]);

  const cls = cn("code-view font-mono text-[13px] leading-6", numbers && "code-numbers", wrap && "code-wrap", className);
  if (html) return <div className={cls} dangerouslySetInnerHTML={{ __html: html }} />;
  return (
    <div className={cls}>
      <pre className="shiki">
        <code>
          {code.split("\n").map((l, i) => (
            <span key={i} className="line">
              {l}
              {"\n"}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}

/** A whole code file: toolbar (language, lines, wrap, copy) over highlighted code. */
export function CodeView({ code, lang, truncated, toolbarExtra }: { code: string; lang?: string; truncated?: boolean; toolbarExtra?: React.ReactNode }) {
  const [wrap, setWrap] = useState(false);
  const lines = code.split("\n").length;
  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5 text-xs text-muted">
        <span className="rounded bg-surface-2 px-2 py-0.5 font-medium text-foreground">{languageLabel(lang)}</span>
        <span className="tabular-nums">{lines.toLocaleString()} lines</span>
        <div className="ml-auto flex items-center gap-1">
          {toolbarExtra}
          <button
            type="button"
            onClick={() => setWrap((w) => !w)}
            aria-pressed={wrap}
            className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-surface-2 hover:text-foreground", wrap && "bg-surface-2 text-foreground")}
          >
            <WrapText className="size-3.5" /> Wrap
          </button>
          <CopyButton text={code} />
        </div>
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto">
        <Highlighted code={code} lang={lang} wrap={wrap} className="p-4" />
        {truncated && <p className="px-4 pb-6 text-sm text-muted">… the file is longer than this. Download it to see everything.</p>}
      </div>
    </div>
  );
}
