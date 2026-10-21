"use client";
import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";
import { GITHUB_URL } from "./primitives";

const LINKS = [
  { href: "#syllabus", label: "Syllabus" },
  { href: "#figures", label: "Figures" },
  { href: "#next-term", label: "Next term" },
  { href: "#office-hours", label: "Office hours" },
];

/** "Open your library", or "Continue learning" once this browser already has courses. */
export function LibraryLink({ className }: { className?: string }) {
  const count = useLiveQuery(() => db.courses.count());
  return (
    <Link href="/library" className={cn("landing-link text-[15px] font-medium", className)}>
      {count ? `Continue learning (${count} ${count === 1 ? "course" : "courses"})` : "Open your library"} →
    </Link>
  );
}

export function SiteNav() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-paper/90 backdrop-blur">
      <nav className="mx-auto flex h-14 max-w-6xl items-center gap-8 px-4 sm:px-6" aria-label="Main">
        <Link href="/" className="font-display text-2xl leading-none">
          CourseBox
        </Link>
        <ul className="hidden items-center gap-6 md:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="text-sm text-ink-2 transition-colors hover:text-ink">
                {l.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="ml-auto flex items-center gap-4">
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="hidden text-sm text-ink-2 hover:text-ink sm:inline">
            GitHub ↗
          </a>
          <ThemeToggle />
          <Link href="/library" className="hidden h-9 items-center border border-ink px-4 text-sm font-medium transition-colors hover:bg-ink hover:text-paper sm:inline-flex">
            Library
          </Link>
          <button
            type="button"
            className="font-code text-xs uppercase md:hidden"
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? "Close" : "Menu"}
          </button>
        </div>
      </nav>
      {open && (
        <ul className="border-t border-rule px-4 py-2 md:hidden">
          {[...LINKS, { href: "/library", label: "Library" }].map((l) => (
            <li key={l.href} className="border-b border-rule last:border-0">
              <a href={l.href} onClick={() => setOpen(false)} className="block py-3 font-display text-2xl">
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      )}
    </header>
  );
}
