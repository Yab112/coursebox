"use client";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { ImportPanel } from "@/components/library/import-panel";
import { useImporter } from "@/hooks/use-importer";
import { cn } from "@/lib/utils";

const PickContext = createContext<() => void>(() => {});

/** One importer for the whole landing page: any upload button opens it, and a zip can be dropped anywhere. */
export function LandingImporter({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { status, saveCourse } = useAuth();
  const importer = useImporter((id) => {
    if (status === "authed") saveCourse(id).catch(() => undefined);
    router.push(`/course/${id}`);
  });
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

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

  return (
    <PickContext.Provider value={() => input.current?.click()}>
      {children}
      <input
        ref={input}
        type="file"
        accept=".zip,application/zip"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) importer.start(f);
          e.target.value = "";
        }}
      />
      {dragging && importer.state.phase === "idle" && (
        <div className="pointer-events-none fixed inset-4 z-50 grid place-items-center border-2 border-dashed border-ink bg-paper/90">
          <p className="font-display text-5xl italic">Drop it. We&apos;ll take it from here.</p>
        </div>
      )}
      <ImportPanel state={importer.state} onCancel={importer.cancel} onUpdate={importer.updateExisting} onNew={importer.importAsNew} />
    </PickContext.Provider>
  );
}

export function UploadButton({ className, children = "Upload a course .zip" }: { className?: string; children?: React.ReactNode }) {
  const pick = useContext(PickContext);
  return (
    <button
      type="button"
      onClick={pick}
      className={cn(
        "inline-flex h-12 items-center justify-center bg-ink px-6 text-[15px] font-medium text-paper transition-colors hover:bg-ink-2",
        className,
      )}
    >
      {children}
    </button>
  );
}
