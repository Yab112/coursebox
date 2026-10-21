"use client";
import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Section } from "./primitives";

const FIGURES = [
  {
    id: "2a",
    label: "The course page",
    caption: "Title, instructors, term and what's inside, read from the course's own metadata. MIT 18.06SC, Linear Algebra.",
    src: "/screenshots/course-home.png",
  },
  {
    id: "2b",
    label: "A lecture with its notes",
    caption: "The lecture video and its PDF notes side by side as one lesson. The PDF reopens on the page you left.",
    src: "/screenshots/lecture-with-notes.png",
  },
  {
    id: "2c",
    label: "Units and sessions",
    caption: "Large courses keep the shape the instructors gave them: units, then sessions, then lessons.",
    src: "/screenshots/units-sessions.png",
  },
  {
    id: "2d",
    label: "In-class questions",
    caption: "Multiple-choice questions from the original course still work, with right and wrong feedback. MIT 6.0001.",
    src: "/screenshots/in-class-questions.png",
  },
  {
    id: "2e",
    label: "Where every file went",
    caption: "The All files tab lists each file in the zip and where it ended up, so you can check nothing was lost.",
    src: "/screenshots/all-files.png",
  },
];

export function Showcase() {
  const [active, setActive] = useState(FIGURES[0].id);
  const fig = FIGURES.find((f) => f.id === active) ?? FIGURES[0];

  return (
    <Section id="figures" mark="02" label="Figures" title="What it looks like with a real course in it.">
      <div className="grid gap-8 lg:grid-cols-9 lg:gap-6">
        <div role="tablist" aria-label="Screenshots" aria-orientation="vertical" className="-mx-4 flex gap-1 overflow-x-auto px-4 lg:col-span-3 lg:mx-0 lg:flex-col lg:px-0">
          {FIGURES.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              id={`fig-${f.id}`}
              aria-selected={f.id === active}
              aria-controls="fig-panel"
              onClick={() => setActive(f.id)}
              className={cn(
                "flex shrink-0 items-baseline gap-3 border-b-2 py-2 pr-3 text-left text-[15px] transition-colors lg:border-b-0 lg:border-l-2 lg:pl-4",
                f.id === active ? "border-ink text-ink" : "border-transparent text-ink-3 hover:text-ink",
              )}
            >
              <span className="font-code text-[11px]">{f.id}</span>
              {f.label}
            </button>
          ))}
        </div>
        <figure id="fig-panel" role="tabpanel" aria-labelledby={`fig-${fig.id}`} className="lg:col-span-6">
          <div className="border border-ink bg-panel p-2 sm:p-3">
            <Image key={fig.id} src={fig.src} alt={fig.caption} width={1440} height={900} className="landing-fade h-auto w-full border border-rule" />
          </div>
          <figcaption className="mt-3 text-[13px] text-ink-3">
            <span className="font-code">Fig. {fig.id}</span>: {fig.caption}
          </figcaption>
        </figure>
      </div>
    </Section>
  );
}
