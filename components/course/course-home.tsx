"use client";
import { BarChart3, BookOpen, Calendar, CheckCircle2, Clock, GraduationCap, Loader2, PlayCircle, RefreshCw, User } from "lucide-react";
import { useMemo, useState } from "react";
import type { LessonType } from "@/lib/analyzers/types";
import type { FlatLesson } from "@/lib/course";
import type { CourseRecord, ProgressRecord } from "@/lib/db";
import { cn, formatBytes, formatDuration } from "@/lib/utils";
import { FileIcon, TYPE_LABEL } from "../file-icon";
import { CourseCover } from "../library/course-card";
import { Button } from "../ui/button";
import { Progress } from "../ui/progress";
import { CourseHtml } from "../viewers/course-html";

export function CourseHome({
  course,
  lessons,
  progress,
  resume,
  onOpen,
  onReanalyze,
}: {
  course: CourseRecord;
  lessons: FlatLesson[];
  progress: Map<string, ProgressRecord>;
  resume?: FlatLesson;
  onOpen: (lessonId: string) => void;
  onReanalyze: () => Promise<string>;
}) {
  const m = course.manifest;
  const tabs = ["Overview", ...(m.extraPages ?? []).map((p) => p.title)];
  const [tab, setTab] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [expanded, setExpanded] = useState(false);

  const done = lessons.filter((l) => progress.get(l.path)?.completed).length;
  const pct = lessons.length ? (done / lessons.length) * 100 : 0;
  const seconds = lessons.reduce((n, l) => n + (progress.get(l.path)?.seconds ?? 0), 0);
  const started = lessons.some((l) => progress.get(l.path)?.lastOpenedAt || progress.get(l.path)?.completed);

  const typeCounts = useMemo(() => {
    const c = new Map<LessonType, number>();
    for (const l of lessons) c.set(l.type, (c.get(l.type) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [lessons]);

  const reanalyze = async () => {
    setBusy(true);
    setNotice(undefined);
    try {
      setNotice(await onReanalyze());
    } catch (e) {
      setNotice(`Re-analysis failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="scrollbar-thin h-full overflow-y-auto">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border bg-[#14151c] text-white">
        <div className="absolute inset-0 opacity-30 blur-3xl saturate-150">
          <CourseCover course={course} className="h-full w-full" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-[#14151c] via-[#14151c]/90 to-[#14151c]/60" />
        <div className="relative mx-auto grid max-w-6xl gap-8 px-5 py-10 sm:px-8 lg:grid-cols-[1fr_340px] lg:py-14">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-sm text-white/70">
              <span className="font-medium text-indigo-300">{m.source}</span>
              {m.courseNumber && <span>· {m.courseNumber}</span>}
            </div>
            <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">{m.title}</h1>
            {m.description && (
              <p className={cn("mt-4 max-w-2xl text-[15px] leading-relaxed text-white/80", !expanded && "line-clamp-3")}>
                {m.description}
              </p>
            )}
            {m.description && m.description.length > 220 && (
              <button onClick={() => setExpanded((v) => !v)} className="mt-1 text-sm font-medium text-indigo-300 hover:underline">
                {expanded ? "Show less" : "Show more"}
              </button>
            )}
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/75">
              {m.instructor && (
                <span className="flex items-center gap-1.5">
                  <User className="size-4" /> {m.instructor}
                </span>
              )}
              {m.level && (
                <span className="flex items-center gap-1.5">
                  <BarChart3 className="size-4" /> {m.level}
                </span>
              )}
              {m.term && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="size-4" /> {m.term}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <BookOpen className="size-4" /> {lessons.length} lessons
              </span>
            </div>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              {resume && (
                <Button size="lg" onClick={() => onOpen(resume.id)} className="max-w-full">
                  <PlayCircle className="!size-5" />
                  <span className="truncate">{started ? `Continue: ${resume.title}` : "Start course"}</span>
                </Button>
              )}
              <Button
                size="lg"
                variant="ghost"
                onClick={reanalyze}
                disabled={busy}
                className="text-white/80 hover:bg-white/10 hover:text-white"
                title="Re-run the structure analyzer. Your progress is kept."
              >
                {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />} Re-analyze structure
              </Button>
            </div>
            {notice && <p className="mt-3 text-sm text-white/70">{notice}</p>}
          </div>

          <div className="hidden lg:block">
            <div className="overflow-hidden rounded-2xl bg-white/5 ring-1 ring-white/10 backdrop-blur">
              <CourseCover course={course} className="aspect-[16/10]" />
              <div className="space-y-4 p-5">
                <div>
                  <div className="mb-2 flex justify-between text-sm">
                    <span className="font-medium">Your progress</span>
                    <span className="tabular-nums text-white/70">{Math.round(pct)}%</span>
                  </div>
                  <Progress value={pct} className="bg-white/10" />
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl bg-white/5 p-3">
                    <CheckCircle2 className="mb-1 size-4 text-emerald-400" />
                    <p className="font-semibold tabular-nums">
                      {done}/{lessons.length}
                    </p>
                    <p className="text-xs text-white/60">lessons done</p>
                  </div>
                  <div className="rounded-xl bg-white/5 p-3">
                    <Clock className="mb-1 size-4 text-indigo-300" />
                    <p className="font-semibold tabular-nums">{formatDuration(seconds)}</p>
                    <p className="text-xs text-white/60">time studied</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Tabs */}
      <div className="sticky top-0 z-10 border-b border-border bg-surface/90 backdrop-blur">
        <div className="scrollbar-thin mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 sm:px-6">
          {tabs.map((t, i) => (
            <button
              key={t}
              onClick={() => setTab(i)}
              className={cn(
                "relative shrink-0 px-3 py-3.5 text-sm font-medium transition-colors",
                tab === i ? "text-foreground" : "text-muted hover:text-foreground",
              )}
            >
              {t}
              {tab === i && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary" />}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
        {tab === 0 ? (
          <div className="grid gap-10 lg:grid-cols-[1fr_300px]">
            <div className="min-w-0 space-y-10">
              {m.descriptionHtml && (
                <section>
                  <h2 className="mb-3 text-xl font-semibold tracking-tight">About this course</h2>
                  <CourseHtml html={m.descriptionHtml} courseId={course.id} onLesson={onOpen} />
                </section>
              )}
              <section>
                <h2 className="mb-1 text-xl font-semibold tracking-tight">Course content</h2>
                <p className="mb-4 text-sm text-muted">
                  {m.sections.length} sections · {lessons.length} lessons
                </p>
                <div className="overflow-hidden rounded-2xl border border-border bg-surface">
                  {m.sections.map((s, si) => {
                    const sDone = s.lessons.filter((l) => progress.get(l.path)?.completed).length;
                    return (
                      <details key={s.id} className="group border-b border-border last:border-0" open={si === 0}>
                        <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-4 hover:bg-surface-2">
                          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-sm font-semibold text-primary">{si + 1}</span>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium">{s.title}</p>
                            <p className="text-xs text-muted">
                              {s.lessons.length} lessons · {sDone} done
                            </p>
                          </div>
                          <div className="hidden w-28 sm:block">
                            <Progress value={s.lessons.length ? (sDone / s.lessons.length) * 100 : 0} />
                          </div>
                        </summary>
                        <ul className="pb-2">
                          {s.lessons.map((l) => {
                            const p = progress.get(l.path);
                            return (
                              <li key={l.id}>
                                <button
                                  onClick={() => onOpen(l.id)}
                                  className="flex w-full items-center gap-3 px-5 py-2 pl-[4.25rem] text-left text-sm hover:bg-surface-2"
                                >
                                  <FileIcon type={l.type} className="text-muted" />
                                  <span className="min-w-0 flex-1 truncate">{l.title}</span>
                                  {p?.completed && <CheckCircle2 className="size-4 shrink-0 text-success" />}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </details>
                    );
                  })}
                </div>
              </section>
            </div>

            <aside className="space-y-4">
              <div className="rounded-2xl border border-border bg-surface p-5">
                <h3 className="mb-3 flex items-center gap-2 font-semibold">
                  <GraduationCap className="size-4 text-primary" /> This course includes
                </h3>
                <ul className="space-y-2.5 text-sm">
                  {typeCounts.map(([t, n]) => (
                    <li key={t} className="flex items-center gap-2.5 text-muted">
                      <FileIcon type={t} className="text-foreground" />
                      <span>
                        <span className="font-medium text-foreground">{n}</span> {TYPE_LABEL[t]}
                        {n === 1 ? "" : "s"}
                      </span>
                    </li>
                  ))}
                  {m.extraPages?.length ? (
                    <li className="flex items-center gap-2.5 text-muted">
                      <BookOpen className="size-4 text-foreground" />
                      {m.extraPages.map((p) => p.title).join(", ")}
                    </li>
                  ) : null}
                </ul>
                <p className="mt-4 border-t border-border pt-3 text-xs text-subtle">
                  {course.fileCount} files · {formatBytes(course.totalSize)} · analyzed with {course.analyzer}
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-surface p-5 lg:hidden">
                <div className="mb-2 flex justify-between text-sm">
                  <span className="font-medium">Your progress</span>
                  <span className="tabular-nums text-muted">{Math.round(pct)}%</span>
                </div>
                <Progress value={pct} />
                <p className="mt-2 text-xs text-muted">
                  {done}/{lessons.length} lessons · {formatDuration(seconds)} studied
                </p>
              </div>
            </aside>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl">
            <h2 className="mb-6 text-2xl font-semibold tracking-tight">{tabs[tab]}</h2>
            <CourseHtml html={m.extraPages![tab - 1].html} courseId={course.id} onLesson={onOpen} />
          </div>
        )}
      </div>
    </div>
  );
}
