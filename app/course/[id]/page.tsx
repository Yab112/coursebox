"use client";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Menu } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccountMenu } from "@/components/auth/account-menu";
import { SavePrompt } from "@/components/auth/save-prompt";
import { CourseHome } from "@/components/course/course-home";
import { LessonView } from "@/components/course/lesson-view";
import { CourseSidebar } from "@/components/course/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { ProgressRing } from "@/components/ui/progress";
import { downloadFile, flattenLessons, reanalyzeCourse } from "@/lib/course";
import { MANIFEST_VERSION } from "@/lib/analyzers/types";
import { pullProgress } from "@/lib/cloud";
import { noteLastLesson } from "@/lib/sync";
import { addStudyTime, db, updateProgress, type ProgressRecord } from "@/lib/db";
import { cn } from "@/lib/utils";

const TICK = 5; // seconds between study-time samples

export default function CoursePage() {
  return (
    <Suspense fallback={<PlayerSkeleton />}>
      <CoursePlayer />
    </Suspense>
  );
}

function CoursePlayer() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const lessonId = search.get("lesson") ?? undefined;
  const searchRef = useRef<HTMLInputElement>(null);
  const [drawer, setDrawer] = useState(false);

  const course = useLiveQuery(() => db.courses.get(id).then((c) => c ?? null), [id]);
  const progressRows = useLiveQuery(() => db.progress.where("courseId").equals(id).toArray(), [id]);
  const courseState = useLiveQuery(() => db.state.get(id).then((s) => s ?? null), [id]);

  const progress = useMemo(() => new Map<string, ProgressRecord>((progressRows ?? []).map((p) => [p.path, p])), [progressRows]);
  const lessons = useMemo(() => (course ? flattenLessons(course.manifest) : []), [course]);
  const idx = lessons.findIndex((l) => l.id === lessonId);
  const lesson = idx >= 0 ? lessons[idx] : undefined;

  const resume = useMemo(() => {
    const last = courseState?.lastLessonPath && lessons.find((l) => l.path === courseState.lastLessonPath);
    return last || lessons.find((l) => !progress.get(l.path)?.completed) || lessons[0];
  }, [courseState, lessons, progress]);

  const go = useCallback(
    (lid?: string) => {
      router.replace(lid ? `/course/${id}?lesson=${lid}` : `/course/${id}`, { scroll: false });
      setDrawer(false);
    },
    [id, router],
  );

  const toggleComplete = useCallback(
    (path: string, done: boolean) => updateProgress(id, path, { completed: done, completedAt: done ? Date.now() : undefined, changedAt: Date.now() }),
    [id],
  );

  const openPath = useCallback(
    (path: string) => {
      const l = lessons.find((x) => x.path === path);
      if (l) {
        go(l.id);
        return true;
      }
      downloadFile(id, path);
      return false;
    },
    [lessons, go, id],
  );

  // Account courses: bring in progress made on other devices.
  const remoteId = course?.remoteId;
  useEffect(() => {
    if (!remoteId) return;
    pullProgress(id).catch(() => undefined);
    const onVisible = () => document.visibilityState === "visible" && pullProgress(id).catch(() => undefined);
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [id, remoteId]);

  // Courses imported with an older analyzer are re-analyzed once (progress is keyed by path, so it survives).
  const upgraded = useRef(false);
  useEffect(() => {
    if (!course || upgraded.current || (course.manifest.version ?? 1) >= MANIFEST_VERSION) return;
    upgraded.current = true;
    reanalyzeCourse(id).catch(() => {});
  }, [course, id]);

  // Remember the last opened lesson.
  useEffect(() => {
    if (!lesson) return;
    const now = Date.now();
    db.state.put({ courseId: id, lastLessonPath: lesson.path, lastOpenedAt: now });
    updateProgress(id, lesson.path, { lastOpenedAt: now });
    noteLastLesson(id, lesson.path);
  }, [id, lesson?.path]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (course) document.title = lesson ? `${lesson.title} · ${course.manifest.title}` : course.manifest.title;
  }, [course, lesson]);

  // Study time: only counts while the tab is visible.
  useEffect(() => {
    if (!lesson) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") addStudyTime(id, lesson.path, TICK);
    }, TICK * 1000);
    return () => clearInterval(t);
  }, [id, lesson?.path]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard shortcuts: j/k next/prev, m toggle complete, / search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable=true]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "j" && lessons.length) go(lessons[Math.min(lessons.length - 1, idx + 1)].id);
      else if (e.key === "k" && idx > 0) go(lessons[idx - 1].id);
      else if (e.key === "m" && lesson) toggleComplete(lesson.path, !progress.get(lesson.path)?.completed);
      else if (e.key === "/") {
        e.preventDefault();
        setDrawer(true);
        searchRef.current?.focus();
      } else if (e.key === "Escape") setDrawer(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lessons, idx, lesson, progress, go, toggleComplete]);

  if (course === undefined) return <PlayerSkeleton />;
  if (course === null)
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <div>
          <p className="text-lg font-semibold">Course not found</p>
          <p className="mt-1 text-muted">It may have been removed from this browser.</p>
          <Link href="/" className="mt-4 inline-block font-medium text-primary hover:underline">
            Back to library
          </Link>
        </div>
      </div>
    );

  const done = lessons.filter((l) => progress.get(l.path)?.completed).length;
  const pct = lessons.length ? (done / lessons.length) * 100 : 0;

  return (
    <div className="flex h-dvh flex-col">
      {/* Top bar */}
      <header className="z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface px-2 sm:px-4">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setDrawer(true)} aria-label="Open course menu">
          <Menu />
        </Button>
        <Link href="/" className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-foreground">
          <ArrowLeft className="size-4" /> <span className="hidden sm:inline">Library</span>
        </Link>
        <div className="mx-1 hidden h-6 w-px bg-border sm:block" />
        <button onClick={() => go()} className="min-w-0 truncate text-left text-[15px] font-semibold hover:text-primary">
          {course.manifest.title}
        </button>
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden items-center gap-2 sm:flex" title={`${done} of ${lessons.length} lessons complete`}>
            <ProgressRing value={pct} size={30} />
            <span className="text-sm tabular-nums text-muted">{Math.round(pct)}%</span>
          </div>
          <ThemeToggle />
          <AccountMenu compact />
        </div>
      </header>
      {course.syncState !== "synced" && <SavePrompt courseId={id} title={course.manifest.title} />}

      <div className="relative flex min-h-0 flex-1">
        {/* Sidebar: static on desktop, drawer on mobile */}
        <div
          onClick={() => setDrawer(false)}
          className={cn("fixed inset-0 z-30 bg-black/40 transition-opacity lg:hidden", drawer ? "opacity-100" : "pointer-events-none opacity-0")}
        />
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 w-[85vw] max-w-[360px] border-r border-border shadow-pop transition-transform duration-300 ease-out lg:static lg:z-auto lg:w-[340px] lg:max-w-none lg:translate-x-0 lg:shadow-none",
            drawer ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <CourseSidebar
            ref={searchRef}
            manifest={course.manifest}
            progress={progress}
            currentLessonId={lesson?.id}
            onSelect={go}
            onHome={() => go()}
            onToggleComplete={toggleComplete}
            onClose={() => setDrawer(false)}
          />
        </aside>

        <main className="min-w-0 flex-1">
          {lesson ? (
            <LessonView
              courseId={id}
              lesson={lesson}
              progress={progress.get(lesson.path)}
              progressFor={(p) => progress.get(p)}
              prev={lessons[idx - 1]}
              next={lessons[idx + 1]}
              onNavigate={go}
              onToggleComplete={toggleComplete}
              onPath={openPath}
            />
          ) : (
            <CourseHome
              course={course}
              lessons={lessons}
              progress={progress}
              resume={resume}
              onOpen={go}
              onReanalyze={async () => {
                const m = await reanalyzeCourse(id);
                const n = m.sections.reduce((a, s) => a + s.lessons.length, 0);
                return `Found ${n} lessons in ${m.sections.length} sections. Progress kept.`;
              }}
            />
          )}
        </main>
      </div>
    </div>
  );
}

function PlayerSkeleton() {
  return (
    <div className="flex h-dvh flex-col">
      <div className="h-14 border-b border-border bg-surface" />
      <div className="flex flex-1">
        <div className="hidden w-[340px] space-y-3 border-r border-border bg-surface p-4 lg:block">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="skeleton h-10 rounded-lg" />
          ))}
        </div>
        <div className="flex-1 p-8">
          <div className="skeleton h-64 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
