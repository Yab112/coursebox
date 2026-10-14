"use client";
import DOMPurify from "dompurify";
import { useEffect, useMemo, useRef } from "react";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";

/** Resolve "../img/a.png" against the directory of the current file. */
export function resolvePath(baseDir: string, rel: string) {
  const parts = (baseDir ? baseDir.split("/") : []).concat(rel.split("/"));
  const out: string[] = [];
  for (const p of parts) {
    if (p === "" || p === ".") continue;
    if (p === "..") out.pop();
    else out.push(p);
  }
  return decodeURIComponent(out.join("/"));
}

/**
 * Sanitized course HTML. Internal links `#lesson=<id>` and relative links to course files
 * are routed to `onNavigate`; images are loaded from IndexedDB.
 */
export function CourseHtml({
  html,
  courseId,
  baseDir = "",
  onLesson,
  onPath,
  className,
}: {
  html: string;
  courseId: string;
  baseDir?: string;
  onLesson?: (lessonId: string) => void;
  onPath?: (path: string) => boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const clean = useMemo(
    () =>
      DOMPurify.sanitize(html, {
        FORBID_TAGS: ["style", "script", "iframe", "form", "input", "button"],
        FORBID_ATTR: ["style"],
        ADD_ATTR: ["target"],
      }),
    [html],
  );

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const urls: string[] = [];
    root.querySelectorAll("a[href]").forEach((a) => {
      const href = a.getAttribute("href")!;
      if (/^https?:|^mailto:/i.test(href)) {
        a.setAttribute("target", "_blank");
        a.setAttribute("rel", "noopener noreferrer");
      }
    });
    root.querySelectorAll<HTMLImageElement>("img").forEach(async (img) => {
      const rel = img.getAttribute("data-course-src") ?? img.getAttribute("src");
      if (!rel || /^(https?:|data:|blob:)/i.test(rel)) return;
      const path = img.hasAttribute("data-course-src") ? rel : resolvePath(baseDir, rel.split(/[?#]/)[0]);
      const f = await db.files.get([courseId, path]);
      if (f) {
        const u = URL.createObjectURL(f.blob);
        urls.push(u);
        img.src = u;
      }
    });
    return () => urls.forEach(URL.revokeObjectURL);
  }, [clean, courseId, baseDir]);

  return (
    <div
      ref={ref}
      className={cn("course-html prose prose-zinc max-w-none dark:prose-invert prose-a:text-primary prose-headings:tracking-tight", className)}
      onClick={(e) => {
        const a = (e.target as HTMLElement).closest("a");
        const href = a?.getAttribute("href");
        if (!href) return;
        const m = href.match(/^#lesson=(.+)$/);
        if (m) {
          e.preventDefault();
          onLesson?.(m[1]);
          return;
        }
        if (!/^([a-z]+:|#|\/\/)/i.test(href) && onPath) {
          if (onPath(resolvePath(baseDir, href.split(/[?#]/)[0]))) e.preventDefault();
        }
      }}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
