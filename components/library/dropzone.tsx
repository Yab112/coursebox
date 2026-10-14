"use client";
import { UploadCloud } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function Dropzone({ onFile, compact }: { onFile: (f: File) => void; compact?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <button
      type="button"
      onClick={() => input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      className={cn(
        "group flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-surface text-center transition-all hover:border-primary hover:bg-primary-soft/40",
        compact ? "min-h-full gap-2 p-6" : "gap-3 px-6 py-16",
        over && "scale-[1.01] border-primary bg-primary-soft",
      )}
    >
      <span className={cn("grid place-items-center rounded-2xl bg-primary-soft text-primary transition-transform group-hover:-translate-y-0.5", compact ? "size-12" : "size-16")}>
        <UploadCloud className={compact ? "size-6" : "size-8"} />
      </span>
      <span className={cn("font-semibold", compact ? "text-[15px]" : "text-lg")}>Add a course</span>
      <span className="max-w-sm text-sm text-muted">
        Drop a course <span className="font-medium text-foreground">.zip</span> here or click to browse. MIT OCW exports and plain folders of videos, PDFs and notes both work.
      </span>
      <input
        ref={input}
        type="file"
        accept=".zip,application/zip"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
    </button>
  );
}
