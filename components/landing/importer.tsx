"use client";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { ImportPanel } from "@/components/library/import-panel";
import { useImporter } from "@/hooks/use-importer";
import { cn } from "@/lib/utils";

type Landing = {
  /** Opens the file picker. */
  pick: () => void;
  /** The zip being X-rayed (picked, or dropped anywhere on the page). */
  file: File | null;
  /** Imports the zip for real and opens the course. */
  open: (file: File) => void;
};
const LandingContext = createContext<Landing>({ pick: () => {}, file: null, open: () => {} });
export const useLanding = () => useContext(LandingContext);

export const XRAY_ID = "xray";

/** Every zip on the landing page goes through the X-ray first; importing is one click from there. */
export function LandingImporter({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { status, saveCourse } = useAuth();
  const importer = useImporter((id) => {
    if (status === "authed") saveCourse(id).catch(() => undefined);
    router.push(`/course/${id}`);
  });
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);

  const xray = (f: File) => {
    setFile(f);
    document.getElementById(XRAY_ID)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

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
      if (f) xray(f);
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
  }, []);

  return (
    <LandingContext.Provider value={{ pick: () => input.current?.click(), file, open: importer.start }}>
      {children}
      <input
        ref={input}
        type="file"
        accept=".zip,application/zip"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) xray(f);
          e.target.value = "";
        }}
      />
      {dragging && importer.state.phase === "idle" && (
        <div className="pointer-events-none fixed inset-4 z-50 grid place-items-center border-2 border-dashed border-ink bg-paper/90">
          <p className="px-6 text-center font-display text-5xl italic">Drop it. We&apos;ll X-ray it first.</p>
        </div>
      )}
      <ImportPanel state={importer.state} onCancel={importer.cancel} onUpdate={importer.updateExisting} onNew={importer.importAsNew} />
    </LandingContext.Provider>
  );
}

export function UploadButton({ className, children = "X-ray a course .zip" }: { className?: string; children?: React.ReactNode }) {
  const { pick } = useLanding();
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
