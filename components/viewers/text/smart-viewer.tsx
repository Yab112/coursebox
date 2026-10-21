"use client";
import { useEffect, useMemo, useState } from "react";
import { dirname } from "@/lib/analyzers/utils";
import { getFile } from "@/lib/files";
import { detectFile, looksBinary, type Detected } from "@/lib/filetype";
import { CodeFile } from "./code-file";
import { CodeView } from "./code-view";
import { TextSkeleton } from "./skeleton";
import { JsonView, SubtitlesView, TableView } from "./data-views";
import { headingsOf, Markdown, Toc } from "./markdown";
import { NotebookView } from "./notebook";

const MAX_TEXT = 2_000_000;

type Loaded = { text: string; truncated: boolean; size: number } | { binary: true; size: number } | null;

/** Reads a stored course file as text (up to 2 MB), or reports it as binary. */
export function useCourseText(courseId: string, path: string) {
  const [state, setState] = useState<Loaded>();
  useEffect(() => {
    let live = true;
    setState(undefined);
    getFile(courseId, path).then(async (blob) => {
      if (!live) return;
      if (!blob) return setState(null);
      const head = new Uint8Array(await blob.slice(0, 8192).arrayBuffer());
      if (looksBinary(head)) return live && setState({ binary: true, size: blob.size });
      const text = await blob.slice(0, MAX_TEXT).text();
      if (live) setState({ text, truncated: blob.size > MAX_TEXT, size: blob.size });
    });
    return () => {
      live = false;
    };
  }, [courseId, path]);
  return state;
}

/** A Markdown file as a document, with a table of contents when it's long enough to need one. */
export function MarkdownDocument({ text, courseId, path, onPath }: { text: string; courseId?: string; path: string; onPath?: (p: string) => boolean }) {
  const headings = useMemo(() => headingsOf(text), [text]);
  const toc = headings.length >= 3;
  return (
    <div className="scrollbar-thin h-full overflow-auto">
      <div className="mx-auto flex max-w-6xl gap-10 px-5 py-10 sm:px-8">
        <article className="mx-auto min-w-0 max-w-3xl flex-1">
          <Markdown text={text} courseId={courseId} baseDir={dirname(path)} onPath={onPath} />
        </article>
        {toc && (
          <aside className="sticky top-6 hidden w-56 shrink-0 self-start xl:block">
            <Toc headings={headings} />
          </aside>
        )}
      </div>
    </div>
  );
}

/**
 * Shows text the best way for what it is: Markdown as a document, notebooks as notebooks, JSON as a tree,
 * CSV as a table, subtitles as a transcript, everything else as highlighted code or plain text.
 */
export function TextContent({
  text,
  path,
  truncated,
  courseId,
  onPath,
  renderHtml,
}: {
  text: string;
  path: string;
  truncated?: boolean;
  /** Set for files stored in a course (lets Markdown/notebooks load the course's images). */
  courseId?: string;
  onPath?: (p: string) => boolean;
  renderHtml?: () => React.ReactNode;
}) {
  const detected: Detected = useMemo(() => detectFile(path, text.slice(0, 8192)), [path, text]);
  switch (detected.kind) {
    case "markdown":
      return <MarkdownDocument text={text} courseId={courseId} path={path} onPath={onPath} />;
    case "notebook":
      return <NotebookView text={text} courseId={courseId} path={path} baseDir={dirname(path)} />;
    case "json":
      return <JsonView text={text} truncated={truncated} />;
    case "table":
      return <TableView text={text} delimiter={detected.delimiter!} truncated={truncated} />;
    case "subtitles":
      return <SubtitlesView text={text} lang={path.toLowerCase().endsWith(".vtt") ? "vtt" : "srt"} />;
    case "html":
      return renderHtml ? renderHtml() : <CodeView code={text} lang="html" truncated={truncated} />;
    case "code":
      return courseId ? <CodeFile code={text} lang={detected.lang} path={path} courseId={courseId} truncated={truncated} /> : <CodeView code={text} lang={detected.lang} truncated={truncated} />;
    default:
      return courseId ? <CodeFile code={text} path={path} courseId={courseId} truncated={truncated} /> : <CodeView code={text} truncated={truncated} />;
  }
}

/** Loads a stored course file and shows it with `TextContent`, or `renderBinary` if it isn't text. */
export function SmartViewer({
  courseId,
  path,
  onPath,
  renderHtml,
  renderBinary,
}: {
  courseId: string;
  path: string;
  onPath?: (p: string) => boolean;
  renderHtml?: () => React.ReactNode;
  renderBinary: (size: number) => React.ReactNode;
}) {
  const loaded = useCourseText(courseId, path);
  if (loaded === undefined) return <TextSkeleton />;
  if (loaded === null) return renderBinary(0);
  if ("binary" in loaded) return renderBinary(loaded.size);
  return <TextContent text={loaded.text} truncated={loaded.truncated} path={path} courseId={courseId} onPath={onPath} renderHtml={renderHtml} />;
}
