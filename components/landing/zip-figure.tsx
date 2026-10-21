"use client";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Fig. 1: part of a real MIT OCW export (6.006, Spring 2020) on the left and the course CourseBox builds
 * from it on the right. Pointing at a course item highlights the files it was built from.
 */
const FILES = [
  "data.json",
  "pages/lecture-notes/data.json",
  "resources/lecture-11-weighted-shortest-paths/data.json",
  "static_resources/3f1c0a…_MIT6_006S20_lec11.pdf",
  "resources/lecture-12-bellman-ford/data.json",
  "static_resources/9a0e7d…_MIT6_006S20_lec12.pdf",
  "static_resources/52be19…_MIT6_006S20_lec12_300k.srt",
  "static_resources/b77d42…_MIT6_006S20_ps5.pdf",
  "static_resources/c41a88…_MIT6_006S20_ps5_sol.pdf",
  "static_resources/0d9e11…_6-006s20.jpg",
  "css/course_v2.css",
  "js/course_v2.js",
  "favicon.ico",
];

/** Phones: drop the folders, except for generic names like data.json that need their parent to mean anything. */
function shortPath(f: string) {
  const parts = f.split("/");
  if (parts.length === 1) return f;
  return "…/" + parts.slice(parts.at(-1) === "data.json" ? -2 : -1).join("/");
}

type Item = { id: string; files: number[] };
const ITEMS: Record<string, Item> = {
  course: { id: "course", files: [0, 9] },
  l11: { id: "l11", files: [2, 3] },
  l12: { id: "l12", files: [1, 4, 5, 6] },
  ps5: { id: "ps5", files: [7, 8] },
  junk: { id: "junk", files: [10, 11, 12] },
};
const CYCLE = ["l12", "ps5", "course", "l11", "junk"];

export function ZipFigure() {
  const [active, setActive] = useState("l12");
  const [paused, setPaused] = useState(false);

  // Walk through the mapping on its own until someone points at it.
  useEffect(() => {
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setActive((a) => CYCLE[(CYCLE.indexOf(a) + 1) % CYCLE.length]), 2600);
    return () => clearInterval(t);
  }, [paused]);

  const lit = new Set(ITEMS[active]?.files);
  const point = (id: string) => ({
    onMouseEnter: () => {
      setPaused(true);
      setActive(id);
    },
    onFocus: () => {
      setPaused(true);
      setActive(id);
    },
    onClick: () => {
      setPaused(true);
      setActive(id);
    },
    "data-active": active === id || undefined,
  });

  return (
    <figure>
      <div className="grid border border-ink lg:grid-cols-[1fr_auto_1fr]">
        {/* The zip, as it arrives */}
        <div className="min-w-0 bg-panel">
          <div className="flex items-baseline justify-between border-b border-rule px-4 py-2.5 font-code text-[11px] text-ink-3">
            <span>6.006-spring-2020.zip</span>
            <span>MIT OCW export</span>
          </div>
          <ol className="py-2 font-code text-[12px] leading-6">
            {FILES.map((f, i) => {
              const junk = ITEMS.junk.files.includes(i);
              return (
                <li
                  key={f}
                  className={cn(
                    "flex gap-3 truncate px-4 transition-colors duration-300",
                    lit.has(i) ? "bg-marker text-ink" : junk ? "text-ink-3 line-through decoration-ink-3/60" : "text-ink-2",
                  )}
                >
                  <span className="w-5 shrink-0 text-right text-ink-3 tabular-nums">{i + 1}</span>
                  <span className="hidden truncate sm:inline">{f}</span>
                  <span className="truncate sm:hidden">{shortPath(f)}</span>
                </li>
              );
            })}
            <li className="px-4 pl-12 text-ink-3">… and the rest of the zip</li>
          </ol>
        </div>

        <div aria-hidden className="hidden w-14 place-items-center border-x border-rule font-display text-3xl text-ink-3 lg:grid">
          →
        </div>

        {/* The course CourseBox builds */}
        <div className="min-w-0 border-t border-rule bg-paper lg:border-t-0">
          <div className="flex items-baseline justify-between border-b border-rule px-4 py-2.5 font-code text-[11px] text-ink-3">
            <span>coursebox / introduction-to-algorithms</span>
            <span>analyzed with mit-ocw</span>
          </div>
          <div className="space-y-1 p-3 text-[14px]">
            <FigRow {...point("course")}>
              <p className="font-code text-[11px] text-ink-3 uppercase">6.006 · Spring 2020 · Undergraduate</p>
              <p className="font-display text-2xl leading-tight">Introduction to Algorithms</p>
              <p className="text-[13px] text-ink-2">Erik Demaine, Jason Ku, Justin Solomon</p>
            </FigRow>

            <p className="px-3 pt-3 font-code text-[11px] text-ink-3 uppercase">Lecture videos</p>
            <FigRow {...point("l11")}>
              <Lesson n="11" title="Weighted Shortest Paths" note="notes attached" state="done" />
            </FigRow>
            <FigRow {...point("l12")}>
              <Lesson n="12" title="Bellman-Ford" note="notes + captions attached" state="current" />
            </FigRow>

            <p className="px-3 pt-3 font-code text-[11px] text-ink-3 uppercase">Problem sets</p>
            <FigRow {...point("ps5")}>
              <Lesson n="5" title="Problem Set 5" note="solution locked until you reveal it" state="todo" />
            </FigRow>

            <FigRow {...point("junk")}>
              <p className="font-code text-[12px] text-ink-3">3 website files set aside, nothing lost</p>
            </FigRow>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 flex flex-col gap-1 text-[13px] text-ink-3 sm:flex-row sm:justify-between">
        <span>
          <span className="font-code">Fig. 1</span>: Part of a real MIT OpenCourseWare download, and the course CourseBox makes of it.
        </span>
        <span className="font-code">Point at a lesson to see where it came from.</span>
      </figcaption>
    </figure>
  );
}

function FigRow({ children, ...props }: { children: React.ReactNode } & React.HTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className="block w-full px-3 py-2 text-left transition-colors duration-300 data-active:bg-marker/70 hover:bg-panel focus-visible:outline-offset-0"
      {...props}
    >
      {children}
    </button>
  );
}

function Lesson({ n, title, note, state }: { n: string; title: string; note: string; state: "done" | "current" | "todo" }) {
  return (
    <div className="flex items-start gap-3">
      <span
        aria-hidden
        className={cn(
          "mt-1 grid size-4 shrink-0 place-items-center rounded-full border text-[9px]",
          state === "done" ? "border-ink bg-ink text-paper" : "border-ink-3",
          state === "current" && "border-ink",
        )}
      >
        {state === "done" ? "✓" : state === "current" ? <span className="size-1.5 rounded-full bg-ink" /> : null}
      </span>
      <span className="min-w-0">
        <span className="font-code text-[12px] text-ink-3">{n.padStart(2, "0")}</span>{" "}
        <span className="font-medium">{title}</span>
        <span className="block text-[12px] text-ink-3">{note}</span>
      </span>
    </div>
  );
}
