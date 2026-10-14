"use client";
import { Check, ChevronLeft, ChevronRight, Download, Eye, FileText, Lock } from "lucide-react";
import { FileIcon } from "../file-icon";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useFileUrl } from "@/hooks/use-file-url";
import type { Lesson, LessonType } from "@/lib/analyzers/types";
import { downloadFile, openFileInTab, type FlatLesson } from "@/lib/course";
import { updateProgress, type ProgressRecord } from "@/lib/db";
import { cn, formatDuration } from "@/lib/utils";
import { Button } from "../ui/button";
import { ArchiveViewer } from "../viewers/archive-viewer";
import { CourseHtml } from "../viewers/course-html";
import { MediaViewer, YouTubeViewer } from "../viewers/media-viewer";
import { FallbackViewer, HtmlFileViewer, ImageViewer, MarkdownViewer, TextViewer } from "../viewers/simple-viewers";

const PdfViewer = dynamic(() => import("../viewers/pdf-viewer"), {
  ssr: false,
  loading: () => <div className="skeleton h-full w-full" />,
});

type ViewProps = {
  courseId: string;
  lesson: Pick<Lesson, "id" | "path" | "type" | "title" | "meta">;
  progress?: ProgressRecord;
  onComplete: () => void;
  onLesson: (id: string) => void;
  onPath: (p: string) => boolean;
  toolbarExtra?: React.ReactNode;
};

function FileViewer({ courseId, lesson, progress, onComplete, onLesson, onPath, toolbarExtra }: ViewProps) {
  const { path, type } = lesson;
  const isStored = !path.startsWith("youtube:") && !path.startsWith("remote:");
  const needsUrl = isStored && (["pdf", "video", "audio", "image"] as LessonType[]).includes(type);
  const url = useFileUrl(courseId, needsUrl ? path : undefined);

  if (typeof lesson.meta?.html === "string")
    return (
      <div className="scrollbar-thin h-full overflow-auto">
        <article className="mx-auto max-w-3xl px-5 py-10 sm:px-8">
          <CourseHtml html={lesson.meta.html} courseId={courseId} onLesson={onLesson} interactive />
        </article>
      </div>
    );
  if (path.startsWith("youtube:"))
    return <YouTubeViewer id={path.slice(8)} start={progress?.position} remoteUrl={lesson.meta?.remoteUrl as string | undefined} courseId={courseId} captionPaths={lesson.meta?.captionPaths as string[] | undefined} />;
  if (path.startsWith("remote:"))
    return <MediaViewer kind="video" src={path.slice(7)} courseId={courseId} initialPosition={progress?.position} onEnded={onComplete} />;

  if (needsUrl && url === undefined) return <div className="skeleton h-full w-full" />;
  if (needsUrl && url === null)
    return <FallbackViewer path={path} onDownload={() => downloadFile(courseId, path)} />;

  switch (type) {
    case "pdf":
      return (
        <PdfViewer
          key={path}
          url={url!}
          initialPage={progress?.lastPage ?? 1}
          toolbarExtra={toolbarExtra}
          onPageChange={(page, total) => {
            updateProgress(courseId, path, { lastPage: page });
            if (total > 1 && page === total && !progress?.completed) onComplete();
          }}
        />
      );
    case "video":
    case "audio": {
      const caps = (lesson.meta?.captionPaths as string[] | undefined) ?? (lesson.meta?.captionsPath ? [lesson.meta.captionsPath as string] : []);
      return (
        <MediaViewer
          key={path}
          kind={type}
          src={url!}
          courseId={courseId}
          captionPaths={caps}
          initialPosition={progress?.position}
          onPosition={(s) => updateProgress(courseId, path, { position: s })}
          onEnded={onComplete}
        />
      );
    }
    case "image":
      return <ImageViewer url={url!} alt={lesson.title} />;
    case "markdown":
      return <MarkdownViewer courseId={courseId} path={path} onPath={onPath} />;
    case "html":
      return <HtmlFileViewer courseId={courseId} path={path} onLesson={onLesson} onPath={onPath} />;
    case "text":
      return <TextViewer courseId={courseId} path={path} />;
    default:
      if (/\.zip$/i.test(path)) return <ArchiveViewer courseId={courseId} path={path} />;
      return <FallbackViewer path={path} size={lesson.meta?.size as number | undefined} onDownload={() => downloadFile(courseId, path)} />;
  }
}

export function LessonView({
  courseId,
  lesson,
  progress,
  progressFor,
  prev,
  next,
  onNavigate,
  onToggleComplete,
  onPath,
}: {
  courseId: string;
  lesson: FlatLesson;
  progress?: ProgressRecord;
  progressFor: (path: string) => ProgressRecord | undefined;
  prev?: FlatLesson;
  next?: FlatLesson;
  onNavigate: (id: string) => void;
  onToggleComplete: (path: string, done: boolean) => void;
  onPath: (p: string) => boolean;
}) {
  const solution = lesson.solution;
  const attachments = lesson.attachments ?? [];
  /** "main", an attachment path, or "solution" */
  const [view, setView] = useState<string>("main");
  const [revealPrompt, setRevealPrompt] = useState(false);
  const revealed = !!(solution && progressFor(solution.path)?.lastOpenedAt);

  useEffect(() => {
    setView("main");
    setRevealPrompt(false);
  }, [lesson.id]);

  const att = attachments.find((a) => a.path === view);
  const active: Pick<Lesson, "id" | "path" | "type" | "title" | "meta"> =
    view === "solution" && solution
      ? { id: lesson.id + ":sol", path: solution.path, type: solution.type, title: solution.title }
      : att
        ? { id: lesson.id + ":" + att.path, path: att.path, type: att.type, title: att.title }
        : lesson;
  const completed = !!progress?.completed;
  const isStored = !active.path.startsWith("youtube:") && !active.path.startsWith("remote:") && typeof active.meta?.html !== "string";
  const transcript = lesson.meta?.transcriptPath as string | undefined;
  const hasTabs = !!solution || attachments.length > 0;

  const revealSolution = () => {
    updateProgress(courseId, solution!.path, { lastOpenedAt: Date.now() });
    setView("solution");
    setRevealPrompt(false);
  };

  const actions = (
    <>
      {transcript && (
        <Button variant="ghost" size="sm" onClick={() => openFileInTab(courseId, transcript)}>
          <FileText /> <span className="hidden sm:inline">Transcript</span>
        </Button>
      )}
      {isStored && (
        <Button variant="ghost" size="sm" onClick={() => downloadFile(courseId, active.path)} aria-label="Download">
          <Download /> <span className="hidden md:inline">Download</span>
        </Button>
      )}
    </>
  );

  const tabClass = (on: boolean) =>
    cn(
      "inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1 font-medium transition-colors",
      on ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground",
    );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Lesson header */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-surface px-4 py-3 sm:px-6">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-muted">
            {lesson.section.group ? `${lesson.section.group} › ` : ""}
            {lesson.section.title}
          </p>
          <h1 className="truncate text-[17px] font-semibold tracking-tight sm:text-lg">{lesson.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          {!!progress?.seconds && progress.seconds >= 60 && (
            <span className="hidden text-xs text-subtle xl:inline">{formatDuration(progress.seconds)} studied</span>
          )}
          {active.type !== "pdf" && actions}
          <Button
            variant={completed ? "success" : "primary"}
            size="sm"
            onClick={() => onToggleComplete(lesson.path, !completed)}
            title="Toggle complete (m)"
          >
            <Check /> {completed ? "Completed" : "Mark complete"}
          </Button>
        </div>
      </div>

      {/* Lesson / resources / solution switcher */}
      {hasTabs && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-surface px-4 py-2 sm:px-6">
          <div className="scrollbar-thin inline-flex max-w-full overflow-x-auto rounded-lg bg-surface-2 p-1 text-sm" role="tablist">
            <button role="tab" aria-selected={view === "main"} onClick={() => setView("main")} className={tabClass(view === "main")}>
              <FileIcon type={lesson.type} className="size-3.5" /> {solution ? "Problem" : "Lesson"}
            </button>
            {attachments.map((a) => (
              <button key={a.path} role="tab" aria-selected={view === a.path} onClick={() => setView(a.path)} className={tabClass(view === a.path)} title={a.title}>
                <FileIcon type={a.type} className="size-3.5" /> <span className="max-w-[12rem] truncate">{a.title}</span>
              </button>
            ))}
            {solution && (
              <button
                role="tab"
                aria-selected={view === "solution"}
                onClick={() => (revealed ? setView("solution") : setRevealPrompt(true))}
                className={tabClass(view === "solution")}
              >
                {revealed ? <Eye className="size-3.5" /> : <Lock className="size-3.5" />} Solution
              </button>
            )}
          </div>
          {revealPrompt && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted">Try the problems first. Reveal anyway?</span>
              <Button size="sm" onClick={revealSolution}>
                Reveal solution
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setRevealPrompt(false)}>
                Not yet
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Viewer */}
      <div className="min-h-0 flex-1 bg-viewer">
        <FileViewer
          key={active.path}
          courseId={courseId}
          lesson={active}
          progress={view === "main" ? progress : progressFor(active.path)}
          onComplete={() => view === "main" && !completed && onToggleComplete(lesson.path, true)}
          onLesson={onNavigate}
          onPath={onPath}
          toolbarExtra={actions}
        />
      </div>

      {/* Prev / next */}
      <div className="flex shrink-0 items-center gap-3 border-t border-border bg-surface px-3 py-2.5 sm:px-6">
        <Button variant="outline" size="sm" disabled={!prev} onClick={() => prev && onNavigate(prev.id)} title="Previous lesson (k)" className="max-w-[45%]">
          <ChevronLeft /> <span className="truncate">{prev ? prev.title : "Previous"}</span>
        </Button>
        <span className="mx-auto hidden text-xs text-subtle sm:inline">
          <kbd className="rounded border border-border px-1.5 py-0.5 font-mono">k</kbd> /{" "}
          <kbd className="rounded border border-border px-1.5 py-0.5 font-mono">j</kbd> to move,{" "}
          <kbd className="rounded border border-border px-1.5 py-0.5 font-mono">m</kbd> to mark complete
        </span>
        <Button
          size="sm"
          disabled={!next}
          onClick={() => next && onNavigate(next.id)}
          title="Next lesson (j)"
          className="ml-auto max-w-[45%] sm:ml-0"
        >
          <span className="truncate">{next ? next.title : "Last lesson"}</span> <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
