import type { ProgressRecord } from "@/lib/db";
import { cn } from "@/lib/utils";

export type Status = "done" | "started" | "new";

export function lessonStatus(p?: ProgressRecord): Status {
  if (p?.completed) return "done";
  if (p?.lastOpenedAt || p?.seconds || p?.position || (p?.lastPage ?? 1) > 1) return "started";
  return "new";
}

export function sectionStatus(lessons: { path: string }[], progress: Map<string, ProgressRecord>): Status {
  const s = lessons.map((l) => lessonStatus(progress.get(l.path)));
  if (s.length && s.every((x) => x === "done")) return "done";
  return s.some((x) => x !== "new") ? "started" : "new";
}

const LABEL: Record<Status, string> = { done: "Completed", started: "In progress", new: "Not started" };

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded px-1.5 text-[10px] font-medium leading-4",
        status === "done" && "bg-success-soft text-success",
        status === "started" && "bg-primary-soft text-primary",
        status === "new" && "bg-surface-2 text-subtle",
        className,
      )}
    >
      {LABEL[status]}
    </span>
  );
}
