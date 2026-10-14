"use client";
import JSZip from "jszip";
import { ChevronLeft, Download, FolderArchive } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { basename, extname, fileType, isJunk, mimeType, naturalCompare } from "@/lib/analyzers/utils";
import { db } from "@/lib/db";
import { formatBytes } from "@/lib/utils";
import { FileIcon } from "../file-icon";
import { Button } from "../ui/button";

const PdfViewer = dynamic(() => import("./pdf-viewer"), { ssr: false, loading: () => <div className="skeleton h-full w-full" /> });

type Entry = { name: string; size: number; file: JSZip.JSZipObject };

/** Browse a .zip inside the course (problem-set bundles, starter code) without leaving the app. */
export function ArchiveViewer({ courseId, path }: { courseId: string; path: string }) {
  const [entries, setEntries] = useState<Entry[] | null>();
  const [error, setError] = useState<string>();
  const [open, setOpen] = useState<Entry>();
  const [content, setContent] = useState<{ url?: string; text?: string }>();

  useEffect(() => {
    let cancelled = false;
    setEntries(undefined);
    setOpen(undefined);
    db.files.get([courseId, path]).then(async (f) => {
      if (!f) return setEntries(null);
      try {
        const zip = await JSZip.loadAsync(f.blob);
        const list = Object.values(zip.files)
          .filter((e) => !e.dir && !isJunk(e.name))
          .map((e) => ({
            name: e.name,
            size: (e as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0,
            file: e,
          }))
          .sort((a, b) => naturalCompare(a.name, b.name));
        if (!cancelled) setEntries(list);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [courseId, path]);

  useEffect(() => {
    if (!open) return setContent(undefined);
    let url: string | undefined;
    const t = fileType(open.name);
    (async () => {
      if (["markdown", "text", "html"].includes(t)) setContent({ text: await open.file.async("string") });
      else {
        const blob = new Blob([await open.file.async("blob")], { type: mimeType(open.name) });
        url = URL.createObjectURL(blob);
        setContent({ url });
      }
    })();
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [open]);

  const download = async (e: Entry) => {
    const blob = await e.file.async("blob");
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u;
    a.download = basename(e.name);
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 10_000);
  };

  const total = useMemo(() => entries?.reduce((n, e) => n + e.size, 0) ?? 0, [entries]);

  if (error) return <p className="p-10 text-center text-sm text-muted">Could not open this archive: {error}</p>;
  if (entries === undefined) return <div className="skeleton h-full w-full" />;
  if (entries === null) return <p className="p-10 text-center text-sm text-muted">File not found.</p>;

  if (open) {
    const t = fileType(open.name);
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-surface px-3 py-1.5">
          <Button variant="ghost" size="sm" onClick={() => setOpen(undefined)}>
            <ChevronLeft /> Files
          </Button>
          <span className="truncate font-mono text-sm text-muted">{open.name}</span>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => download(open)}>
            <Download /> Download
          </Button>
        </div>
        <div className="min-h-0 flex-1">
          {!content ? (
            <div className="skeleton h-full w-full" />
          ) : t === "pdf" && content.url ? (
            <PdfViewer url={content.url} />
          ) : t === "image" && content.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={content.url} alt="" className="m-auto max-h-full max-w-full object-contain p-6" />
          ) : (t === "video" || t === "audio") && content.url ? (
            <video src={content.url} controls className="h-full w-full bg-black" />
          ) : t === "markdown" ? (
            <div className="scrollbar-thin h-full overflow-auto">
              <article className="prose prose-zinc mx-auto max-w-3xl px-6 py-8 dark:prose-invert">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content.text ?? ""}</ReactMarkdown>
              </article>
            </div>
          ) : content.text !== undefined ? (
            <pre className="scrollbar-thin h-full overflow-auto bg-surface p-4 font-mono text-[13px] leading-6">{content.text}</pre>
          ) : (
            <div className="grid h-full place-items-center">
              <Button onClick={() => download(open)}>
                <Download /> Download {basename(open.name)}
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="scrollbar-thin h-full overflow-auto">
      <div className="mx-auto max-w-3xl px-5 py-8">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-primary-soft text-primary">
            <FolderArchive className="size-5" />
          </span>
          <div>
            <p className="font-semibold">{basename(path).replace(/^[0-9a-f]{32}_/, "")}</p>
            <p className="text-sm text-muted">
              {entries.length} files · {formatBytes(total)} · click a file to open it
            </p>
          </div>
        </div>
        <ul className="overflow-hidden rounded-2xl border border-border bg-surface">
          {entries.map((e) => (
            <li key={e.name} className="flex items-center border-b border-border last:border-0">
              <button onClick={() => setOpen(e)} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-surface-2">
                <FileIcon type={fileType(e.name)} className="text-muted" />
                <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{e.name}</span>
                <span className="shrink-0 text-xs text-subtle">{extname(e.name).toUpperCase()} · {formatBytes(e.size)}</span>
              </button>
              <button onClick={() => download(e)} className="px-3 py-2.5 text-muted hover:text-foreground" aria-label={`Download ${e.name}`}>
                <Download className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
