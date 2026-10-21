"use client";
import { Loader2, Square, Trash2 } from "lucide-react";
import type { Output } from "@/lib/notebook";
import type { PyState } from "@/lib/python";
import { cn } from "@/lib/utils";
import { OutputView } from "./notebook";

/** "Python 3.14 ready", "Installing numpy…", etc. */
export function PyStatus({ state, className }: { state: PyState; className?: string }) {
  const text =
    state.kind === "idle"
      ? "Python starts when you run code"
      : state.kind === "loading"
        ? state.message
        : state.kind === "busy"
          ? (state.message ?? "Running…")
          : state.kind === "ready"
            ? `Python ${state.version.replace(/^(\d)(\d+)\..*/, "$1.$2")} ready`
            : `Python couldn't start: ${state.message}`;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", state.kind === "failed" ? "text-[var(--danger)]" : "text-muted", className)}>
      {(state.kind === "loading" || state.kind === "busy") && <Loader2 className="size-3.5 animate-spin" />}
      {state.kind === "ready" && <span className="size-2 rounded-full bg-success" />}
      {text}
    </span>
  );
}

/** Output of running a code file, docked under it. */
export function RunPanel({ outputs, state, onStop, onClear }: { outputs: Output[]; state: PyState; onStop: () => void; onClear: () => void }) {
  const running = state.kind === "busy" || state.kind === "loading";
  return (
    <div className="flex max-h-[45%] min-h-32 shrink-0 flex-col border-t border-border bg-surface">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5">
        <span className="text-xs font-semibold">Output</span>
        <PyStatus state={state} />
        <div className="ml-auto flex items-center gap-1">
          {running && (
            <button type="button" onClick={onStop} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-[var(--danger)] hover:bg-surface-2">
              <Square className="size-3 fill-current" /> Stop
            </button>
          )}
          <button type="button" onClick={onClear} disabled={running} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-foreground disabled:opacity-40">
            <Trash2 className="size-3.5" /> Clear
          </button>
        </div>
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto">
        {outputs.map((o, i) => (
          <OutputView key={i} o={o} />
        ))}
        {!outputs.length && !running && <p className="px-4 py-3 text-xs text-subtle">No output.</p>}
      </div>
    </div>
  );
}
