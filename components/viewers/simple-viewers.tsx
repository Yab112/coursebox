"use client";
import { Download, FileQuestion } from "lucide-react";
import { useEffect, useState } from "react";
import { basename, dirname, extname } from "@/lib/analyzers/utils";
import { getFile } from "@/lib/files";
import { cn, formatBytes } from "@/lib/utils";
import { Button } from "../ui/button";
import { CourseHtml } from "./course-html";
import dynamic from "next/dynamic";

const Markdown = dynamic(() => import("./text/markdown").then((m) => m.Markdown), { ssr: false, loading: () => <div className="skeleton h-40 rounded-xl" /> });

const MAX_TEXT = 2_000_000;

export function useFileText(courseId: string, path: string) {
  const [text, setText] = useState<string | null>();
  const [size, setSize] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setText(undefined);
    getFile(courseId, path).then(async (blob) => {
      if (cancelled) return;
      if (!blob) return setText(null);
      setSize(blob.size);
      const t = await blob.slice(0, MAX_TEXT).text();
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

/** Markdown without its own scroll container (course overview README). */
export function MarkdownBody({ courseId, path }: { courseId: string; path: string }) {
  const { text } = useFileText(courseId, path);
  if (text === undefined) return <div className="skeleton h-40 rounded-xl" />;
  return <Markdown text={text ?? ""} courseId={courseId} baseDir={dirname(path)} />;
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
    <div className="scrollbar-thin flex h-full overflow-auto bg-viewer p-6">
      <div className="m-auto w-full max-w-sm shrink-0 rounded-2xl border border-border bg-surface p-8 text-center shadow-card">
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
