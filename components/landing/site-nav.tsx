"use client";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowRight, Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";
import { GITHUB_URL, GithubIcon } from "./primitives";

const LINKS = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#roadmap", label: "Roadmap" },
  { href: "#faq", label: "FAQ" },
];

/** "Open library", or "Continue learning" once this browser already has courses. */
export function LibraryLink({ className, size = "md" }: { className?: string; size?: "md" | "lg" }) {
  const count = useLiveQuery(() => db.courses.count());
  return (
    <Link
      href="/library"
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors",
        size === "lg" ? "h-12 px-6 text-[15px]" : "h-9 px-4 text-sm",
        className,
      )}
    >
      {count ? "Continue learning" : "Open library"}
      {!!count && <span className="rounded-full bg-primary-soft px-1.5 text-xs font-semibold text-primary tabular-nums">{count}</span>}
      <ArrowRight className="size-4" />
    </Link>
  );
}

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b transition-colors",
        scrolled || open ? "border-border bg-surface/80 backdrop-blur-lg" : "border-transparent",
      )}
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6" aria-label="Main">
        <Logo />
        <ul className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-foreground">
                {l.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="ml-auto flex items-center gap-1">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="CourseBox on GitHub"
            className="hidden size-9 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground sm:grid"
          >
            <GithubIcon className="size-4.5" />
          </a>
          <ThemeToggle />
          <LibraryLink className="ml-2 hidden bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover sm:inline-flex" />
          <button
            type="button"
            className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-2 md:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </nav>
      {open && (
        <div className="border-t border-border px-4 pb-4 md:hidden">
          <ul className="flex flex-col py-2">
            {LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2.5 text-[15px] text-muted hover:bg-surface-2 hover:text-foreground">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
          <LibraryLink className="w-full bg-primary text-primary-foreground hover:bg-primary-hover" />
        </div>
      )}
    </header>
  );
}
