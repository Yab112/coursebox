"use client";
import { ArrowRight, Check, CircleCheck, Sparkles, UploadCloud } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { ImportPanel } from "@/components/library/import-panel";
import { useImporter } from "@/hooks/use-importer";
import { cn } from "@/lib/utils";
import { BrowserFrame } from "./primitives";
import { LibraryLink } from "./site-nav";

const PROMISES = ["Free and open source", "No account needed", "Files stay on your device"];

export function Hero() {
  const router = useRouter();
  const { status, saveCourse } = useAuth();
  const importer = useImporter((id) => {
    if (status === "authed") saveCourse(id).catch(() => undefined);
    router.push(`/course/${id}`);
  });
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <section
      className="relative overflow-hidden px-4 pt-14 pb-20 sm:px-6 sm:pt-20 sm:pb-28"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) importer.start(f);
      }}
    >
      <div aria-hidden className="landing-grid pointer-events-none absolute inset-0 -z-10" />
      <div aria-hidden className="landing-glow pointer-events-none absolute -top-40 left-1/2 -z-10 h-[520px] w-[900px] -translate-x-1/2" />

      <div className="mx-auto max-w-6xl">
        <div className="landing-rise mx-auto max-w-3xl text-center">
          <a
            href="#roadmap"
            className="group inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 py-1 pr-3 pl-1 text-sm text-muted shadow-card backdrop-blur transition-colors hover:border-primary/50 hover:text-foreground"
          >
            <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary">
              <Sparkles className="size-3" /> Next
            </span>
            <span className="sm:hidden">AI study tools are coming</span>
            <span className="hidden sm:inline">AI recaps, short notes &amp; quizzes are on the way</span>
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </a>

          <h1 className="mt-7 text-4xl font-bold tracking-tight text-balance sm:text-6xl sm:leading-[1.05]">
            Turn any course download into <span className="landing-gradient-text">your own learning space</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted text-pretty sm:text-xl">
            Drop in an MIT OpenCourseWare export, a Udemy-style folder or any zip of videos and PDFs. CourseBox organizes it into a
            clean course player with progress tracking, right in your browser.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => input.current?.click()}
              className={cn(
                "inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 text-[15px] font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary-hover sm:w-auto",
                over && "ring-4 ring-ring",
              )}
            >
              <UploadCloud className="size-4.5" />
              {over ? "Drop to import" : "Upload a course zip"}
            </button>
            <LibraryLink size="lg" className="w-full border border-border bg-surface text-foreground hover:bg-surface-2 sm:w-auto" />
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
          </div>
          <p className="mt-3 hidden text-sm text-subtle sm:block">or drag a .zip anywhere onto this section</p>

          <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted">
            {PROMISES.map((p) => (
              <li key={p} className="flex items-center gap-1.5">
                <Check className="size-4 text-success" /> {p}
              </li>
            ))}
          </ul>
        </div>

        <div className="landing-rise relative mx-auto mt-16 max-w-5xl [animation-delay:150ms] sm:mt-20">
          <BrowserFrame url="coursebox.app/course/introduction-to-algorithms">
            <Image
              src="/screenshots/lecture-with-notes.png"
              alt="CourseBox playing MIT 6.006 Lecture 12 with its PDF notes, the lesson sidebar on the left"
              width={1440}
              height={900}
              priority
              className="h-auto w-full"
            />
          </BrowserFrame>

          <div className="absolute -bottom-6 -left-4 hidden w-60 rounded-xl border border-border bg-surface p-4 shadow-pop md:block lg:-left-10">
            <div className="flex items-center justify-between text-xs text-muted">
              <span>Introduction to Algorithms</span>
              <span className="font-semibold text-foreground tabular-nums">64%</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full w-[64%] rounded-full bg-primary" />
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-sm font-medium">
              <CircleCheck className="size-4 text-success" /> Lecture 12 complete
            </p>
          </div>

          <div className="absolute -top-6 -right-4 hidden w-64 rounded-xl border border-border bg-surface p-4 shadow-pop md:block lg:-right-10">
            <div className="flex items-center gap-2">
              <span className="grid size-7 place-items-center rounded-lg bg-primary-soft text-primary">
                <Sparkles className="size-3.5" />
              </span>
              <p className="text-sm font-semibold">Lesson recap</p>
              <span className="ml-auto rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                Soon
              </span>
            </div>
            <div className="mt-3 space-y-1.5">
              <div className="h-2 w-full rounded-full bg-surface-2" />
              <div className="h-2 w-11/12 rounded-full bg-surface-2" />
              <div className="h-2 w-3/4 rounded-full bg-surface-2" />
            </div>
          </div>
        </div>
      </div>

      <ImportPanel state={importer.state} onCancel={importer.cancel} onUpdate={importer.updateExisting} onNew={importer.importAsNew} />
    </section>
  );
}
