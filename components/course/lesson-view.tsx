"use client";
import { Check, ChevronLeft, ChevronRight, Download, Eye, FileText, Lock } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useFileUrl } from "@/hooks/use-file-url";
import type { Lesson, LessonType } from "@/lib/analyzers/types";
import { downloadFile, openFileInTab, type FlatLesson } from "@/lib/course";
import { updateProgress, type ProgressRecord } from "@/lib/db";
import { cn, formatDuration } from "@/lib/utils";
import { Button } from "../ui/button";
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

  if (path.startsWith("youtube:")) return <YouTubeViewer id={path.slice(8)} start={progress?.position} />;
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
      return <FallbackViewer path={path} size={lesson.meta?.size as number | undefined} onDownload={() => downloadFile(courseId, path)} />;
  }
}

export function LessonView({
  courseId,
  lesson,
  progress,
  solutionProgress,
  prev,
  next,
  onNavigate,
  onToggleComplete,
  onPath,
}: {
  courseId: string;
  lesson: FlatLesson;
  progress?: ProgressRecord;
  solutionProgress?: ProgressRecord;
  prev?: FlatLesson;
  next?: FlatLesson;
  onNavigate: (id: string) => void;
  onToggleComplete: (path: string, done: boolean) => void;
  onPath: (p: string) => boolean;
}) {
  const solution = lesson.meta?.solution as { path: string; title: string; type: LessonType } | undefined;
  const [view, setView] = useState<"main" | "solution">("main");
  const [revealPrompt, setRevealPrompt] = useState(false);
  const revealed = !!solutionProgress?.lastOpenedAt;

  useEffect(() => {
    setView("main");
    setRevealPrompt(false);
  }, [lesson.id]);

  const active = view === "solution" && solution ? { id: lesson.id + ":sol", path: solution.path, type: solution.type, title: solution.title } : lesson;
  const completed = !!progress?.completed;
  const isStored = !active.path.startsWith("youtube:") && !active.path.startsWith("remote:");
  const transcript = lesson.meta?.transcriptPath as string | undefined;

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

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Lesson header */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-surface px-4 py-3 sm:px-6">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-muted">{lesson.section.title}</p>
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

      {/* Assignment / solution switcher */}
      {solution && (
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-surface px-4 py-2 sm:px-6">
          <div className="inline-flex rounded-lg bg-surface-2 p-1 text-sm">
            <button
              onClick={() => setView("main")}
              className={cn("rounded-md px-3 py-1 font-medium transition-colors", view === "main" ? "bg-surface shadow-sm" : "text-muted")}
            >
              Problem
            </button>
            <button
              onClick={() => (revealed ? setView("solution") : setRevealPrompt(true))}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition-colors",
                view === "solution" ? "bg-surface shadow-sm" : "text-muted",
              )}
            >
              {revealed ? <Eye className="size-3.5" /> : <Lock className="size-3.5" />} Solution
            </button>
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
          progress={view === "solution" ? solutionProgress : progress}
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
