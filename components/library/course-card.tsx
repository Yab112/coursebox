"use client";
import { BookOpen, Cloud, CloudOff, CloudUpload, Loader2, MoreVertical, PlayCircle, RotateCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useFileUrl } from "@/hooks/use-file-url";
import type { CourseRecord } from "@/lib/db";
import { cn, gradientFor } from "@/lib/utils";
import { useAuth } from "../auth/auth-provider";
import { Progress } from "../ui/progress";

export function CourseCover({ course, className }: { course: CourseRecord; className?: string }) {
  const url = useFileUrl(course.id, course.manifest.coverPath);
  return (
    <div className={cn("relative overflow-hidden bg-surface-2", className)} style={url ? undefined : { background: gradientFor(course.title) }}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : url === null ? (
        <div className="absolute inset-0 grid place-items-center text-white/90">
          <BookOpen className="size-10" strokeWidth={1.5} />
        </div>
      ) : (
        <div className="skeleton absolute inset-0" />
      )}
    </div>
  );
}

export function CourseCard({
  course,
  completed,
  total,
  onDelete,
}: {
  course: CourseRecord;
  completed: number;
  total: number;
  onDelete: () => void;
}) {
  const pct = total ? (completed / total) * 100 : 0;
  const m = course.manifest;
  const [menu, setMenu] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const { status, saveCourse, openAuth } = useAuth();
  const authed = status === "authed";
  const saved = course.syncState === "synced" && !!course.remoteId;
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) {
        setMenu(false);
        setConfirming(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-card transition-all hover:-translate-y-0.5 hover:shadow-pop">
      <Link href={`/course/${course.id}`} className="flex flex-1 flex-col">
        <div className="relative">
          <CourseCover course={course} className="aspect-[16/9]" />
          <div className="absolute inset-0 grid place-items-center bg-black/0 opacity-0 transition-all group-hover:bg-black/25 group-hover:opacity-100">
            <PlayCircle className="size-12 text-white drop-shadow" strokeWidth={1.5} />
          </div>
          {m.courseNumber && (
            <span className="absolute left-3 top-3 rounded-md bg-black/60 px-2 py-0.5 text-xs font-medium text-white backdrop-blur">
              {m.courseNumber}
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-primary">{m.source}</p>
          <h3 className="line-clamp-2 font-semibold leading-snug">{m.title}</h3>
          {m.instructor && <p className="line-clamp-1 text-sm text-muted">{m.instructor}</p>}
          <div className="mt-auto pt-4">
            <SyncBadge course={course} authed={authed} onRetry={() => saveCourse(course.id).catch(() => undefined)} />
            <Progress value={pct} />
            <div className="mt-2 flex justify-between text-xs text-muted">
              <span>{pct >= 100 ? "Completed 🎉" : completed ? `${Math.round(pct)}% complete` : "Not started"}</span>
              <span>
                {completed}/{total} lessons
              </span>
            </div>
          </div>
        </div>
      </Link>

      <div ref={menuRef} className="absolute right-2 top-2">
        <button
          onClick={() => setMenu((v) => !v)}
          className="grid size-8 place-items-center rounded-lg bg-black/50 text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 focus:opacity-100"
          aria-label="Course options"
        >
          <MoreVertical className="size-4" />
        </button>
        {menu && (
          <div className="absolute right-0 mt-1 w-60 rounded-xl border border-border bg-surface p-1 shadow-pop">
            {!saved && course.syncState !== "uploading" && (
              <button
                onClick={() => {
                  setMenu(false);
                  if (authed) saveCourse(course.id).catch(() => undefined);
                  else openAuth("signup", { saveCourseId: course.id, reason: "Create an account to keep this course and your progress." });
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2"
              >
                <CloudUpload className="size-4" /> Save to account
              </button>
            )}
            <button
              onClick={() => (confirming ? onDelete() : setConfirming(true))}
              className="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-500 hover:bg-surface-2"
            >
              <Trash2 className="mt-0.5 size-4 shrink-0" />
              <span>
                {confirming ? "Click again to delete" : saved ? "Delete course" : "Remove course"}
                {saved && <span className="block text-xs text-muted">From your account and this device. Frees a course slot.</span>}
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SyncBadge({ course, authed, onRetry }: { course: CourseRecord; authed: boolean; onRetry: () => void }) {
  const base = "mb-2 flex items-center gap-1.5 text-xs";
  if (course.syncState === "uploading")
    return (
      <p className={cn(base, "text-primary")}>
        <Loader2 className="size-3.5 animate-spin" /> Saving to account… {Math.round((course.syncProgress ?? 0) * 100)}%
      </p>
    );
  if (course.syncState === "error")
    return (
      <p className={cn(base, "text-warning")} title={course.syncError}>
        <CloudOff className="size-3.5" /> Not saved: {course.syncError?.slice(0, 60)}
        {authed && (
          <button onClick={(e) => (e.preventDefault(), onRetry())} className="ml-auto inline-flex items-center gap-1 font-medium text-primary hover:underline">
            <RotateCw className="size-3" /> Retry
          </button>
        )}
      </p>
    );
  if (course.syncState === "synced" && course.remoteId)
    return (
      <p className={cn(base, "text-success")}>
        <Cloud className="size-3.5" /> Saved to your account
      </p>
    );
  return (
    <p className={cn(base, "text-subtle")}>
      <CloudOff className="size-3.5" /> This device only
    </p>
  );
}

export function CourseCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="skeleton aspect-[16/9]" />
      <div className="space-y-2 p-4">
        <div className="skeleton h-3 w-1/3 rounded" />
        <div className="skeleton h-4 w-4/5 rounded" />
        <div className="skeleton h-3 w-1/2 rounded" />
        <div className="skeleton mt-6 h-1.5 w-full rounded" />
      </div>
    </div>
  );
}
