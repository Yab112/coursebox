"use client";
import { Download, FileQuestion } from "lucide-react";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useFileUrl } from "@/hooks/use-file-url";
import { basename, dirname, extname } from "@/lib/analyzers/utils";
import { db } from "@/lib/db";
import { cn, formatBytes } from "@/lib/utils";
import { Button } from "../ui/button";
import { CourseHtml, resolvePath } from "./course-html";

const MAX_TEXT = 2_000_000;

export function useFileText(courseId: string, path: string) {
  const [text, setText] = useState<string | null>();
  const [size, setSize] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setText(undefined);
    db.files.get([courseId, path]).then(async (f) => {
      if (cancelled) return;
      if (!f) return setText(null);
      setSize(f.size);
      const t = await f.blob.slice(0, MAX_TEXT).text();
      if (!cancelled) setText(t);
    });
    return () => {
      cancelled = true;
    };
  }, [courseId, path]);
  return { text, truncated: size > MAX_TEXT };
}

function Reading({ children }: { children: React.ReactNode }) {
  return (
    <div className="scrollbar-thin h-full overflow-auto">
      <article className="mx-auto max-w-3xl px-5 py-10 sm:px-8">{children}</article>
    </div>
  );
}

function Loading() {
  return (
    <div className="mx-auto max-w-3xl space-y-3 px-8 py-10">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="skeleton h-4 rounded" style={{ width: `${60 + ((i * 37) % 40)}%` }} />
      ))}
    </div>
  );
}

function CourseImage({ courseId, baseDir, src, alt }: { courseId: string; baseDir: string; src?: string; alt?: string }) {
  const external = !src || /^(https?:|data:)/i.test(src);
  const url = useFileUrl(courseId, external ? undefined : resolvePath(baseDir, src!));
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={external ? src : (url ?? undefined)} alt={alt ?? ""} className="rounded-lg" />;
}

export function MarkdownViewer({ courseId, path, onPath }: { courseId: string; path: string; onPath?: (p: string) => boolean }) {
  const { text } = useFileText(courseId, path);
  if (text === undefined) return <Loading />;
  const baseDir = dirname(path);
  return (
    <Reading>
      <div className="prose prose-zinc max-w-none dark:prose-invert prose-a:text-primary prose-headings:tracking-tight prose-pre:bg-surface-2 prose-pre:text-foreground prose-code:before:content-none prose-code:after:content-none prose-code:rounded prose-code:bg-surface-2 prose-code:px-1 prose-code:py-0.5 prose-code:font-normal">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            img: ({ src, alt }) => <CourseImage courseId={courseId} baseDir={baseDir} src={typeof src === "string" ? src : undefined} alt={alt} />,
            a: ({ href, children }) => (
              <a
                href={href}
                target={href && /^https?:/.test(href) ? "_blank" : undefined}
                rel="noopener noreferrer"
                onClick={(e) => {
                  if (href && !/^([a-z]+:|#)/i.test(href) && onPath?.(resolvePath(baseDir, href.split(/[?#]/)[0]))) e.preventDefault();
                }}
              >
                {children}
              </a>
            ),
          }}
        >
          {text ?? ""}
        </ReactMarkdown>
      </div>
    </Reading>
  );
}

export function HtmlFileViewer({
  courseId,
  path,
  onLesson,
  onPath,
}: {
  courseId: string;
  path: string;
  onLesson?: (id: string) => void;
  onPath?: (p: string) => boolean;
}) {
  const { text } = useFileText(courseId, path);
  if (text === undefined) return <Loading />;
  const body = text?.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? text ?? "";
  return (
    <Reading>
      <CourseHtml html={body} courseId={courseId} baseDir={dirname(path)} onLesson={onLesson} onPath={onPath} />
    </Reading>
  );
}

type NbCell = { cell_type: string; source: string | string[]; outputs?: { text?: string | string[]; data?: Record<string, string | string[]> }[] };
const joinSrc = (s?: string | string[]) => (Array.isArray(s) ? s.join("") : (s ?? ""));

function NotebookViewer({ text }: { text: string }) {
  let cells: NbCell[] = [];
  try {
    cells = JSON.parse(text).cells ?? [];
  } catch {
    return <CodeBlock text={text} />;
  }
  return (
    <Reading>
      <div className="space-y-4">
        {cells.map((c, i) =>
          c.cell_type === "markdown" ? (
            <div key={i} className="prose prose-zinc max-w-none dark:prose-invert">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{joinSrc(c.source)}</ReactMarkdown>
            </div>
          ) : (
            <div key={i} className="overflow-hidden rounded-xl border border-border">
              <pre className="scrollbar-thin overflow-x-auto bg-surface-2 p-4 font-mono text-[13px] leading-relaxed">{joinSrc(c.source)}</pre>
              {c.outputs?.map((o, j) => {
                const png = o.data?.["image/png"];
                const txt = o.text ?? o.data?.["text/plain"];
                return png ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={j} alt="" src={`data:image/png;base64,${joinSrc(png)}`} className="bg-white p-2" />
                ) : txt ? (
                  <pre key={j} className="scrollbar-thin overflow-x-auto border-t border-border p-4 font-mono text-[12.5px] text-muted">
                    {joinSrc(txt)}
                  </pre>
                ) : null;
              })}
            </div>
          ),
        )}
      </div>
    </Reading>
  );
}

function CodeBlock({ text, truncated }: { text: string; truncated?: boolean }) {
  const lines = text.split("\n");
  return (
    <div className="scrollbar-thin h-full overflow-auto bg-surface">
      <pre className="min-w-fit p-4 font-mono text-[13px] leading-6">
        {lines.map((l, i) => (
          <div key={i} className="flex">
            <span className="mr-4 inline-block w-10 shrink-0 select-none text-right text-subtle">{i + 1}</span>
            <span className="whitespace-pre">{l || " "}</span>
          </div>
        ))}
        {truncated && <div className="mt-4 text-muted">… file truncated, download to see everything</div>}
      </pre>
    </div>
  );
}

export function TextViewer({ courseId, path }: { courseId: string; path: string }) {
  const { text, truncated } = useFileText(courseId, path);
  if (text === undefined) return <Loading />;
  if (extname(path) === "ipynb" && text) return <NotebookViewer text={text} />;
  return <CodeBlock text={text ?? ""} truncated={truncated} />;
}

export function ImageViewer({ url, alt }: { url: string; alt: string }) {
  const [zoomed, setZoomed] = useState(false);
  return (
    <div className="scrollbar-thin flex h-full overflow-auto bg-viewer p-6">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt}
        onClick={() => setZoomed((z) => !z)}
        className={cn("m-auto rounded-lg shadow-card", zoomed ? "max-w-none cursor-zoom-out" : "max-h-full max-w-full cursor-zoom-in object-contain")}
      />
    </div>
  );
}

export function FallbackViewer({ path, size, onDownload }: { path: string; size?: number; onDownload: () => void }) {
  return (
    <div className="grid h-full place-items-center bg-viewer p-6">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8 text-center shadow-card">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-surface-2 text-muted">
          <FileQuestion className="size-7" />
        </span>
        <p className="mt-4 break-all font-semibold">{basename(path)}</p>
        <p className="mt-1 text-sm text-muted">
          {extname(path).toUpperCase() || "File"}
          {size ? ` · ${formatBytes(size)}` : ""} · can&apos;t be previewed here
        </p>
        <Button className="mt-6 w-full" onClick={onDownload}>
          <Download /> Download file
        </Button>
      </div>
    </div>
  );
}
