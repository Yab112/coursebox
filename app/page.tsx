"use client";
import { useLiveQuery } from "dexie-react-hooks";
import { BookOpenCheck, Clock, Library, UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CourseCard, CourseCardSkeleton } from "@/components/library/course-card";
import { Dropzone } from "@/components/library/dropzone";
import { ImportPanel } from "@/components/library/import-panel";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { useImporter } from "@/hooks/use-importer";
import { db, deleteCourse } from "@/lib/db";
import { formatBytes, formatDuration } from "@/lib/utils";

export default function LibraryPage() {
  const router = useRouter();
  const importer = useImporter((id) => router.push(`/course/${id}`));
  const courses = useLiveQuery(() => db.courses.toArray());
  const progress = useLiveQuery(() => db.progress.toArray());
  const states = useLiveQuery(() => db.state.toArray());
  const [dragging, setDragging] = useState(false);
  const [usage, setUsage] = useState<number>();

  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => setUsage(e.usage));
  }, [courses?.length]);

  // Drop a zip anywhere on the page.
  useEffect(() => {
    let depth = 0;
    const enter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      depth++;
      setDragging(true);
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const over = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => {
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const f = e.dataTransfer?.files?.[0];
      if (f) importer.start(f);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, [importer.start]); // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => {
    const per = new Map<string, { completed: number; total: number }>();
    let completedAll = 0;
    let seconds = 0;
    for (const c of courses ?? []) {
      const paths = new Set(c.manifest.sections.flatMap((s) => s.lessons.map((l) => l.path)));
      const done = (progress ?? []).filter((p) => p.courseId === c.id && p.completed && paths.has(p.path)).length;
      per.set(c.id, { completed: done, total: paths.size });
      completedAll += done;
    }
    for (const p of progress ?? []) seconds += p.seconds ?? 0;
    return { per, completedAll, seconds };
  }, [courses, progress]);

  const sorted = useMemo(() => {
    const last = new Map((states ?? []).map((s) => [s.courseId, s.lastOpenedAt ?? 0]));
    return [...(courses ?? [])].sort(
      (a, b) => (last.get(b.id) ?? b.createdAt) - (last.get(a.id) ?? a.createdAt),
    );
  }, [courses, states]);

  const loading = courses === undefined;
  const empty = !loading && courses.length === 0;

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/80 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Logo />
          <div className="ml-auto flex items-center gap-1">
            {usage !== undefined && <span className="mr-2 hidden text-xs text-subtle sm:inline">{formatBytes(usage)} stored locally</span>}
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-8 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">My learning</h1>
            <p className="mt-2 text-muted">Your personal library of courses. Pick up right where you left off.</p>
          </div>
          {!empty && !loading && (
            <div className="flex gap-3">
              <Stat icon={<Library />} label="Courses" value={String(courses.length)} />
              <Stat icon={<BookOpenCheck />} label="Lessons done" value={String(stats.completedAll)} />
              <Stat icon={<Clock />} label="Time studied" value={formatDuration(stats.seconds)} />
            </div>
          )}
        </div>

        {loading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <CourseCardSkeleton key={i} />
            ))}
          </div>
        ) : empty ? (
          <div className="mx-auto max-w-2xl">
            <Dropzone onFile={importer.start} />
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {sorted.map((c) => (
              <CourseCard
                key={c.id}
                course={c}
                completed={stats.per.get(c.id)?.completed ?? 0}
                total={stats.per.get(c.id)?.total ?? 0}
                onDelete={() => deleteCourse(c.id)}
              />
            ))}
            <Dropzone onFile={importer.start} compact />
          </div>
        )}
      </main>

      {dragging && importer.state.phase === "idle" && (
        <div className="pointer-events-none fixed inset-0 z-40 grid place-items-center bg-primary/10 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-primary bg-surface px-12 py-10 shadow-pop">
            <UploadCloud className="size-10 text-primary" />
            <p className="text-lg font-semibold">Drop to add course</p>
          </div>
        </div>
      )}

      <ImportPanel
        state={importer.state}
        onCancel={importer.cancel}
        onUpdate={importer.updateExisting}
        onNew={importer.importAsNew}
      />
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-2.5 shadow-card">
      <span className="text-primary [&_svg]:size-4.5">{icon}</span>
      <div>
        <p className="text-base font-semibold leading-tight tabular-nums">{value}</p>
        <p className="text-[11px] uppercase tracking-wide text-subtle">{label}</p>
      </div>
    </div>
  );
}
