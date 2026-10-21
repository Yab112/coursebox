"use client";
import "katex/dist/katex.min.css";
import { useTheme } from "next-themes";
import { isValidElement, useEffect, useId, useMemo, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { useFileUrl } from "@/hooks/use-file-url";
import { languageLabel } from "@/lib/filetype";
import { headingsOf, normalizeMath, type Heading } from "@/lib/markdown";

export { headingsOf };
import { cn } from "@/lib/utils";
import { resolvePath } from "../course-html";
import { CopyButton, Highlighted } from "./code-view";

export const PROSE =
  "prose prose-zinc max-w-none dark:prose-invert prose-a:text-primary prose-headings:tracking-tight prose-headings:scroll-mt-6 " +
  "prose-pre:m-0 prose-pre:bg-transparent prose-pre:p-0 prose-code:before:content-none prose-code:after:content-none " +
  "prose-code:rounded prose-code:bg-surface-2 prose-code:px-1 prose-code:py-0.5 prose-code:font-normal prose-img:rounded-lg";

/** A fenced code block: language label, copy button, highlighted code. */
export function FenceBlock({ code, lang }: { code: string; lang?: string }) {
  return (
    <div className="not-prose my-5 overflow-hidden rounded-xl border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border bg-surface-2/60 px-3 py-1 text-xs text-muted">
        <span>{lang ? languageLabel(lang) : "Code"}</span>
        <CopyButton text={code} />
      </div>
      <div className="scrollbar-thin overflow-x-auto">
        <Highlighted code={code} lang={lang} numbers={false} className="px-4 py-3" />
      </div>
    </div>
  );
}

/** ```mermaid diagrams, rendered by Mermaid (loaded only when a diagram appears). */
function Mermaid({ code }: { code: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const { resolvedTheme } = useTheme();
  const [svg, setSvg] = useState<string | null>();
  useEffect(() => {
    let live = true;
    import("mermaid")
      .then(async ({ default: mermaid }) => {
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: resolvedTheme === "dark" ? "dark" : "default" });
        const { svg } = await mermaid.render(`mmd${id}`, code);
        if (live) setSvg(svg);
      })
      .catch(() => live && setSvg(null));
    return () => {
      live = false;
    };
  }, [code, id, resolvedTheme]);
  if (svg === null) return <FenceBlock code={code} lang="mermaid" />;
  if (!svg) return <div className="skeleton my-5 h-40 rounded-xl" />;
  return <div className="not-prose my-5 flex justify-center overflow-x-auto rounded-xl border border-border bg-surface p-4" dangerouslySetInnerHTML={{ __html: svg }} />;
}

function CourseImage({ courseId, baseDir, src, alt }: { courseId?: string; baseDir: string; src?: string; alt?: string }) {
  const external = !src || !courseId || /^(https?:|data:)/i.test(src);
  const url = useFileUrl(courseId ?? "", external ? undefined : resolvePath(baseDir, src!));
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={external ? src : (url ?? undefined)} alt={alt ?? ""} />;
}

/**
 * GitHub-flavoured Markdown with math ($…$, $$…$$), highlighted code, Mermaid diagrams, course-relative
 * images and links. Raw HTML stays off, so course files can't inject markup.
 */
export function Markdown({
  text,
  courseId,
  baseDir = "",
  onPath,
  className,
}: {
  text: string;
  courseId?: string;
  baseDir?: string;
  onPath?: (p: string) => boolean;
  className?: string;
}) {
  const components = useMemo<Components>(
    () => ({
      pre: ({ children }) => {
        const child = isValidElement<{ className?: string; children?: React.ReactNode }>(children) ? children : null;
        const lang = child?.props.className?.match(/language-([\w+#.-]+)/)?.[1]?.toLowerCase();
        const code = String(child?.props.children ?? "").replace(/\n$/, "");
        return lang === "mermaid" ? <Mermaid code={code} /> : <FenceBlock code={code} lang={lang} />;
      },
      img: ({ src, alt }) => <CourseImage courseId={courseId} baseDir={baseDir} src={typeof src === "string" ? src : undefined} alt={alt} />,
      a: ({ href, children }) => (
        <a
          href={href}
          target={href && /^https?:/.test(href) ? "_blank" : undefined}
          rel="noopener noreferrer"
          onClick={(e) => {
            if (!href) return;
            if (href.startsWith("#")) {
              e.preventDefault();
              document.getElementById(decodeURIComponent(href.slice(1)))?.scrollIntoView({ behavior: "smooth" });
            } else if (!/^[a-z]+:/i.test(href) && onPath?.(resolvePath(baseDir, href.split(/[?#]/)[0]))) e.preventDefault();
          }}
        >
          {children}
        </a>
      ),
      table: ({ children }) => (
        <div className="scrollbar-thin overflow-x-auto">
          <table>{children}</table>
        </div>
      ),
    }),
    [courseId, baseDir, onPath],
  );

  return (
    <div className={cn(PROSE, className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeSlug, [rehypeKatex, { throwOnError: false, strict: "ignore" }]]} components={components}>
        {normalizeMath(text)}
      </ReactMarkdown>
    </div>
  );
}

/** Table of contents beside long documents. */
export function Toc({ headings }: { headings: Heading[] }) {
  const [active, setActive] = useState<string>();
  useEffect(() => {
    const els = headings.map((h) => document.getElementById(h.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive(top.target.id);
      },
      { rootMargin: "0px 0px -70% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [headings]);

  return (
    <nav aria-label="On this page" className="text-[13px]">
      <p className="mb-2 font-semibold text-foreground">On this page</p>
      <ul className="space-y-1 border-l border-border">
        {headings.map((h) => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(h.id)?.scrollIntoView({ behavior: "smooth" });
              }}
              className={cn(
                "-ml-px block border-l py-0.5 transition-colors",
                h.depth === 3 ? "pl-6" : "pl-3",
                active === h.id ? "border-primary text-primary" : "border-transparent text-muted hover:text-foreground",
              )}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
