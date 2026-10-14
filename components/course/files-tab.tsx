"use client";
import { Download, ExternalLink, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CourseManifest } from "@/lib/analyzers/types";
import { basename, fileType, naturalCompare } from "@/lib/analyzers/utils";
import { downloadFile, openFileInTab } from "@/lib/course";
import { listCourseFiles } from "@/lib/files";
import { cn, formatBytes } from "@/lib/utils";
import { FileIcon } from "../file-icon";

type Placement = { label: string; lessonId?: string };

/** Where every stored file ended up, so nothing in the zip is ever invisible. */
function placements(m: CourseManifest) {
  const map = new Map<string, Placement>();
  const put = (p: unknown, pl: Placement) => typeof p === "string" && !map.has(p) && map.set(p, pl);
  put(m.coverPath, { label: "Course cover" });
  put(m.overviewPath, { label: "Course overview" });
  for (const s of m.sections) {
    const where = s.group ? `${s.group} › ${s.title}` : s.title;
    for (const l of s.lessons) {
      put(l.path, { label: `${where} › ${l.title}`, lessonId: l.id });
      if (l.solution) put(l.solution.path, { label: `${l.title} › solution`, lessonId: l.id });
      l.attachments?.forEach((a) => put(a.path, { label: `${l.title} › ${a.title}`, lessonId: l.id }));
      (l.meta?.captionPaths as string[] | undefined)?.forEach((c) => put(c, { label: `${l.title} › captions`, lessonId: l.id }));
      put(l.meta?.transcriptPath, { label: `${l.title} › transcript`, lessonId: l.id });
      (l.meta?.alternates as string[] | undefined)?.forEach((c) => put(c, { label: `${l.title} › alternate file`, lessonId: l.id }));
    }
  }
  return map;
}

export function FilesTab({ courseId, manifest, onOpen }: { courseId: string; manifest: CourseManifest; onOpen: (id: string) => void }) {
  const [rows, setRows] = useState<{ path: string; size: number }[]>();
  useEffect(() => {
    listCourseFiles(courseId).then(setRows);
  }, [courseId]);
  const [q, setQ] = useState("");
  const [onlyUnused, setOnlyUnused] = useState(false);
  const place = useMemo(() => placements(manifest), [manifest]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows ?? [])
      .filter((r) => (!needle || r.path.toLowerCase().includes(needle)) && (!onlyUnused || !place.has(r.path)))
      .sort((a, b) => naturalCompare(a.path, b.path));
  }, [rows, q, onlyUnused, place]);

  if (!rows) return <div className="skeleton h-64 rounded-2xl" />;
  const used = rows.filter((r) => place.has(r.path)).length;

  return (
    <div>
      <p className="mb-4 text-sm text-muted">
        {rows.length} files in this course. {used} are shown as lessons, resources, captions or transcripts. The rest are
        site files (metadata, page HTML, styles) that the course doesn&apos;t need.
      </p>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter files"
            className="h-9 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={onlyUnused} onChange={(e) => setOnlyUnused(e.target.checked)} className="accent-[var(--primary)]" />
          Only files not shown in the course
        </label>
      </div>
      <ul className="overflow-hidden rounded-2xl border border-border bg-surface text-sm">
        {list.slice(0, 1500).map((r) => {
          const p = place.get(r.path);
          return (
            <li key={r.path} className="flex items-center gap-3 border-b border-border px-4 py-2 last:border-0">
              <FileIcon type={fileType(r.path)} className="shrink-0 text-muted" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-[12.5px]" title={r.path}>
                  {basename(r.path)}
                </p>
                <p className={cn("truncate text-xs", p ? "text-primary" : "text-subtle")}>
                  {p ? p.label : r.path.includes("/") ? r.path.slice(0, r.path.lastIndexOf("/")) : "site file"}
                </p>
              </div>
              <span className="hidden shrink-0 text-xs text-subtle sm:inline">{formatBytes(r.size)}</span>
              {p?.lessonId ? (
                <button onClick={() => onOpen(p.lessonId!)} className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary-soft">
                  Open
                </button>
              ) : (
                <button onClick={() => openFileInTab(courseId, r.path)} className="shrink-0 p-1 text-muted hover:text-foreground" aria-label="Open in new tab">
                  <ExternalLink className="size-4" />
                </button>
              )}
              <button onClick={() => downloadFile(courseId, r.path)} className="shrink-0 p-1 text-muted hover:text-foreground" aria-label="Download">
                <Download className="size-4" />
              </button>
            </li>
          );
        })}
        {!list.length && <li className="p-6 text-center text-muted">No files match.</li>}
      </ul>
      {list.length > 1500 && <p className="mt-2 text-xs text-subtle">Showing the first 1500 — use the filter to narrow down.</p>}
    </div>
  );
}
