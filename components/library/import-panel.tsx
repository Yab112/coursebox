"use client";
import { AlertTriangle, FileArchive, Loader2, RefreshCw, X } from "lucide-react";
import type { ImportState } from "@/hooks/use-importer";
import { formatBytes } from "@/lib/utils";
import { Button } from "../ui/button";
import { Progress } from "../ui/progress";

export function ImportPanel({
  state,
  onCancel,
  onUpdate,
  onNew,
}: {
  state: ImportState;
  onCancel: () => void;
  onUpdate: (id: string) => void;
  onNew: () => void;
}) {
  if (state.phase === "idle") return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-pop">
        <div className="mb-5 flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
            <FileArchive className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted">Importing</p>
            <p className="truncate font-semibold">{state.fileName}</p>
          </div>
          {state.phase !== "confirm" && (
            <Button variant="ghost" size="icon" onClick={onCancel} aria-label="Close">
              <X />
            </Button>
          )}
        </div>

        {state.phase === "working" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted">
              <Loader2 className="size-4 animate-spin text-primary" />
              {state.message}
              <span className="ml-auto tabular-nums">{Math.round(state.progress * 100)}%</span>
            </div>
            <Progress value={state.progress * 100} className="h-2" />
            <p className="text-xs text-subtle">Everything stays on this device, in your browser&apos;s storage.</p>
          </div>
        )}

        {state.phase === "confirm" && (
          <div className="space-y-4">
            <div className="rounded-xl bg-warning-soft p-4 text-sm">
              <p className="font-medium text-warning">You already have this course</p>
              <p className="mt-1 text-muted">
                &ldquo;{state.existing.title}&rdquo; is already in your library. Update it with this file and keep your progress, or add it as a separate copy.
              </p>
            </div>
            <p className="text-xs text-subtle">
              New version: {state.preview.lessonCount} lessons · {state.preview.fileCount} files · {formatBytes(state.preview.totalSize)}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row-reverse">
              <Button onClick={() => onUpdate(state.existing.id)} className="flex-1">
                <RefreshCw /> Update existing
              </Button>
              <Button variant="outline" onClick={onNew} className="flex-1">
                Add as new
              </Button>
              <Button variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {state.phase === "error" && (
          <div className="space-y-4">
            <div className="flex gap-3 rounded-xl bg-warning-soft p-4 text-sm">
              <AlertTriangle className="size-5 shrink-0 text-warning" />
              <p>{state.message}</p>
            </div>
            <Button variant="outline" className="w-full" onClick={onCancel}>
              Close
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
