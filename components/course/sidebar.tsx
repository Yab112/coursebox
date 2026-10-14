"use client";
import { Check, ChevronDown, Home, Search, X } from "lucide-react";
import { forwardRef, useEffect, useMemo, useState } from "react";
import type { CourseManifest } from "@/lib/analyzers/types";
import type { ProgressRecord } from "@/lib/db";
import { cn, formatDuration } from "@/lib/utils";
import { FileIcon, TYPE_LABEL } from "../file-icon";
import { Progress } from "../ui/progress";

export const CourseSidebar = forwardRef<
  HTMLInputElement,
  {
    manifest: CourseManifest;
    progress: Map<string, ProgressRecord>;
    currentLessonId?: string;
    onSelect: (lessonId: string) => void;
    onHome: () => void;
    onToggleComplete: (path: string, done: boolean) => void;
    onClose?: () => void;
  }
>(function CourseSidebar({ manifest, progress, currentLessonId, onSelect, onHome, onToggleComplete, onClose }, searchRef) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const total = manifest.sections.reduce((n, s) => n + s.lessons.length, 0);
  const done = manifest.sections.reduce((n, s) => n + s.lessons.filter((l) => progress.get(l.path)?.completed).length, 0);

  // Expand the section of the current lesson (or the first section) by default.
  useEffect(() => {
    const sec = manifest.sections.find((s) => s.lessons.some((l) => l.id === currentLessonId)) ?? manifest.sections[0];
    if (sec) setOpen((o) => (o[sec.id] ? o : { ...o, [sec.id]: true }));
  }, [currentLessonId, manifest]);

  // Scroll the active lesson into view.
  useEffect(() => {
    if (!currentLessonId) return;
    requestAnimationFrame(() =>
      document.querySelector(`[data-lesson="${currentLessonId}"]`)?.scrollIntoView({ block: "nearest" }),
    );
  }, [currentLessonId]);

  const q = query.trim().toLowerCase();
  const sections = useMemo(
    () =>
      manifest.sections
        .map((s) => ({ ...s, lessons: q ? s.lessons.filter((l) => l.title.toLowerCase().includes(q)) : s.lessons }))
        .filter((s) => !q || s.lessons.length),
    [manifest, q],
  );

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="shrink-0 space-y-3 border-b border-border p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Course content</h2>
          {onClose && (
            <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 lg:hidden" aria-label="Close menu">
              <X className="size-4" />
            </button>
          )}
        </div>
        <div>
          <Progress value={total ? (done / total) * 100 : 0} />
          <p className="mt-1.5 text-xs text-muted">
            {done} of {total} lessons complete
          </p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && (setQuery(""), e.currentTarget.blur())}
            placeholder="Search lessons  ( / )"
            className="h-9 w-full rounded-lg border border-border bg-surface-2 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-subtle focus:border-primary focus:bg-surface"
          />
        </div>
      </div>

      <nav className="scrollbar-thin min-h-0 flex-1 overflow-y-auto pb-6">
        <button
          onClick={onHome}
          className={cn(
            "flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left text-sm font-medium hover:bg-surface-2",
            !currentLessonId && "bg-primary-soft text-primary",
          )}
        >
          <Home className="size-4" /> Course overview
        </button>

        {sections.map((s, si) => {
          const isOpen = !!q || !!open[s.id];
          const sDone = s.lessons.filter((l) => progress.get(l.path)?.completed).length;
          return (
            <div key={s.id} className="border-b border-border">
              <button
                onClick={() => setOpen((o) => ({ ...o, [s.id]: !isOpen }))}
                className="flex w-full items-start gap-3 bg-surface-2/60 px-4 py-3 text-left hover:bg-surface-2"
                aria-expanded={isOpen}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-subtle">Section {si + 1}</p>
                  <p className="text-sm font-semibold leading-snug">{s.title}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {sDone}/{s.lessons.length} done
                  </p>
                </div>
                <ChevronDown className={cn("mt-1 size-4 shrink-0 text-muted transition-transform duration-200", isOpen && "rotate-180")} />
              </button>
              <div className={cn("grid transition-[grid-template-rows] duration-200 ease-out", isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
                <ul className="overflow-hidden">
                  {s.lessons.map((l) => {
                    const p = progress.get(l.path);
                    const active = l.id === currentLessonId;
                    return (
                      <li key={l.id}>
                        <div
                          data-lesson={l.id}
                          className={cn(
                            "group flex items-start gap-3 border-l-[3px] border-transparent px-4 py-2.5 transition-colors hover:bg-surface-2",
                            active && "border-primary bg-primary-soft hover:bg-primary-soft",
                          )}
                        >
                          <button
                            onClick={() => onToggleComplete(l.path, !p?.completed)}
                            aria-label={p?.completed ? "Mark incomplete" : "Mark complete"}
                            className={cn(
                              "mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-full border-2 transition-colors",
                              p?.completed ? "border-success bg-success text-white" : "border-border hover:border-primary",
                            )}
                          >
                            {p?.completed && <Check className="size-3" strokeWidth={3.5} />}
                          </button>
                          <button onClick={() => onSelect(l.id)} className="min-w-0 flex-1 text-left">
                            <p className={cn("text-sm leading-snug", active ? "font-medium text-foreground" : "text-foreground/90")}>{l.title}</p>
                            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                              <FileIcon type={l.type} className="size-3.5" />
                              {l.path.startsWith("youtube:") ? "YouTube" : TYPE_LABEL[l.type]}
                              {!!l.meta?.solution && <span className="rounded bg-warning-soft px-1.5 text-[10px] font-medium text-warning">+ solution</span>}
                              {!!p?.seconds && p.seconds >= 60 && <span className="text-subtle">· {formatDuration(p.seconds)}</span>}
                            </p>
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          );
        })}
        {q && !sections.length && <p className="p-6 text-center text-sm text-muted">No lessons match &ldquo;{query}&rdquo;.</p>}
      </nav>
    </div>
  );
});
