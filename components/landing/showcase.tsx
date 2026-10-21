"use client";
import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { BrowserFrame, Section, SectionHeading } from "./primitives";

const SHOTS = [
  {
    id: "course",
    label: "Course overview",
    caption: "Course header, description, what's included and your progress, built from the course's own metadata.",
    src: "/screenshots/course-home.png",
    url: "coursebox.app/course/linear-algebra",
  },
  {
    id: "lecture",
    label: "Lecture + notes",
    caption: "Lecture videos with their notes attached. PDFs open on the page you left off.",
    src: "/screenshots/lecture-with-notes.png",
    url: "coursebox.app/course/introduction-to-algorithms",
  },
  {
    id: "units",
    label: "Units & sessions",
    caption: "Big courses like MIT 18.06SC are grouped into units and sessions, just like the original.",
    src: "/screenshots/units-sessions.png",
    url: "coursebox.app/course/linear-algebra",
  },
  {
    id: "questions",
    label: "In-class questions",
    caption: "Multiple-choice questions from the course stay interactive, with instant right or wrong feedback.",
    src: "/screenshots/in-class-questions.png",
    url: "coursebox.app/course/intro-to-python",
  },
  {
    id: "files",
    label: "Every file accounted for",
    caption: "The All files tab shows where every file in the zip went. Nothing gets silently dropped.",
    src: "/screenshots/all-files.png",
    url: "coursebox.app/course/linear-algebra",
  },
];

export function Showcase() {
  const [active, setActive] = useState(SHOTS[0].id);
  const shot = SHOTS.find((s) => s.id === active) ?? SHOTS[0];

  return (
    <Section id="tour" className="bg-surface">
      <SectionHeading
        eyebrow="Take a look"
        title="Feels like Coursera. Runs on your files."
        description="Every screen below is CourseBox running on a real MIT OpenCourseWare download."
      />
      <div role="tablist" aria-label="Product screenshots" className="scrollbar-thin -mx-4 mb-8 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:justify-center sm:px-0">
        {SHOTS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            id={`tab-${s.id}`}
            aria-selected={s.id === active}
            aria-controls="tour-panel"
            onClick={() => setActive(s.id)}
            className={cn(
              "shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
              s.id === active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted hover:border-primary/40 hover:text-foreground",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div id="tour-panel" role="tabpanel" aria-labelledby={`tab-${shot.id}`} className="mx-auto max-w-5xl">
        <BrowserFrame url={shot.url}>
          <Image key={shot.id} src={shot.src} alt={shot.caption} width={1440} height={900} className="landing-fade h-auto w-full" />
        </BrowserFrame>
        <p className="mx-auto mt-6 max-w-xl text-center text-muted">{shot.caption}</p>
      </div>
    </Section>
  );
}
