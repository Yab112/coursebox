"use client";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Xray, XrayDest, XrayFile } from "@/lib/xray";
import type { XrayResponse } from "@/lib/xray.worker";
import { cn } from "@/lib/utils";
import { useLanding, XRAY_ID } from "./importer";

/**
 * Fig. 1: the real analyzer, run in the browser. It starts on a sample (MIT 6.006's file list) and X-rays any
 * zip the visitor drops, showing where every file goes before anything is imported.
 */
const SAMPLE_URL = "/samples/mit-6006.xray.json";
const MAX_ROWS = 400;

type Phase = { kind: "loading" } | { kind: "reading"; name: string } | { kind: "error"; message: string } | { kind: "ready" };

export function XrayFigure() {
  const { file, open, pick } = useLanding();
  const [xray, setXray] = useState<Xray | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [scanned, setScanned] = useState(0);
  const [run, setRun] = useState(0);
  const [hover, setHover] = useState<{ section: number; lesson: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const seen = useRef(false);
  const isSample = !file;

  // The sample loads right away and starts scanning once it scrolls into view.
  useEffect(() => {
    fetch(SAMPLE_URL)
      .then((r) => r.json())
      .then((x: Xray) => {
        if (file) return;
        setXray(x);
        setPhase({ kind: "ready" });
      })
      .catch(() => setPhase({ kind: "error", message: "The sample couldn't load. Drop your own zip instead." }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !seen.current) {
        seen.current = true;
        setRun((r) => r + 1);
      }
    }, { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // A visitor's own zip: read it in a worker; nothing is stored.
  useEffect(() => {
    if (!file) return;
    if (!/\.zip$/i.test(file.name)) {
      setPhase({ kind: "error", message: `${file.name} isn't a .zip file.` });
      return;
    }
    setPhase({ kind: "reading", name: file.name });
    setHover(null);
    const w = new Worker(new URL("../../lib/xray.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (ev: MessageEvent<XrayResponse>) => {
      if (ev.data.type === "done") {
        setXray(ev.data.xray);
        setPhase({ kind: "ready" });
        seen.current = true;
        setRun((r) => r + 1);
      } else setPhase({ kind: "error", message: ev.data.message });
      w.terminate();
    };
    w.postMessage(file);
    return () => w.terminate();
  }, [file]);

  // The scan: a beam walks the file list; each file lights up with where it went.
  const total = xray?.files.length ?? 0;
  useEffect(() => {
    if (!xray || !run) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setScanned(total);
      return;
    }
    setScanned(0);
    const duration = Math.min(4200, Math.max(1800, total * 28));
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const n = Math.min(total, Math.floor(((now - t0) / duration) * total));
      setScanned(n);
      if (n < total) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [xray, run, total]);

  // Keep the beam in view inside the list, without moving the page.
  useEffect(() => {
    const ol = list.current;
    const row = ol?.children[Math.min(scanned, ol.children.length - 1)] as HTMLElement | undefined;
    if (!ol || !row || scanned >= total) return;
    ol.scrollTop = row.offsetTop - ol.clientHeight * 0.6;
  }, [scanned, total]);

  const done = !!xray && scanned >= total;
  const shown = xray?.files.slice(0, MAX_ROWS) ?? [];

  // When each lesson (and so its section) appears: the first of its files to be scanned.
  const revealAt = useMemo(() => {
    const at = new Map<string, number>();
    xray?.files.forEach((f, i) => {
      if (!("section" in f.dest)) return;
      const k = `${f.dest.section}:${f.dest.lesson}`;
      if (!at.has(k)) at.set(k, i);
    });
    return at;
  }, [xray]);
  const lessonVisible = (s: number, l: number) => scanned > (revealAt.get(`${s}:${l}`) ?? total - 1) || done;

  const counts = useMemo(() => {
    const c = { files: 0, sections: 0, lessons: 0, solutions: 0, skipped: 0 };
    if (!xray) return c;
    c.files = Math.min(scanned, total);
    xray.files.slice(0, c.files).forEach((f) => {
      if (f.dest.kind === "junk" || f.dest.kind === "site") c.skipped++;
    });
    xray.sections.forEach((s, si) => {
      const vis = s.lessons.filter((_, li) => lessonVisible(si, li));
      if (vis.length) c.sections++;
      c.lessons += vis.length;
      c.solutions += vis.filter((l) => l.solution).length;
    });
    return c;
  }, [xray, scanned, total]); // eslint-disable-line react-hooks/exhaustive-deps

  const lit = useCallback(
    (d: XrayDest) => !!hover && "section" in d && d.section === hover.section && d.lesson === hover.lesson,
    [hover],
  );

  const pointLesson = (section: number, lesson: number) => {
    if (!done) return;
    setHover({ section, lesson });
    const i = xray!.files.findIndex((f) => "section" in f.dest && f.dest.section === section && f.dest.lesson === lesson);
    const ol = list.current;
    const row = i >= 0 && i < MAX_ROWS ? (ol?.children[i] as HTMLElement | undefined) : undefined;
    if (ol && row && (row.offsetTop < ol.scrollTop || row.offsetTop > ol.scrollTop + ol.clientHeight - 24))
      ol.scrollTo({ top: row.offsetTop - 40, behavior: "smooth" });
  };

  return (
    <figure id={XRAY_ID} className="scroll-mt-24">
      <div
        ref={root}
        className="xray-film overflow-hidden border border-ink text-[#e9e4d6] dark:border-[#3a372e]"
        onDragOver={(e) => e.preventDefault()}
      >
        {/* Header */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[#2a2822] px-4 py-3 font-code text-[11px]">
          <span className="text-[#fde27a]">X-RAY</span>
          <span className="min-w-0 truncate text-[#e9e4d6]">{xray ? `${xray.archive}.zip` : "…"}</span>
          {isSample && <span className="border border-[#5d594f] px-1.5 text-[10px] text-[#8d887a] uppercase">sample</span>}
          <span className="ml-auto text-[#8d887a]">{xray ? `analyzer: ${xray.analyzer}` : ""}</span>
        </div>

        <div className="relative grid lg:grid-cols-[1.15fr_1fr]">
          {/* Files */}
          <div className="min-w-0 border-b border-[#2a2822] lg:border-r lg:border-b-0">
            <p className="flex justify-between px-4 pt-3 pb-2 font-code text-[10px] tracking-wide text-[#8d887a] uppercase">
              <span>What&apos;s in the zip</span>
              <span className="tabular-nums">
                {counts.files}/{total}
              </span>
            </p>
            <ol ref={list} className="scrollbar-thin relative h-64 overflow-y-auto pb-3 font-code text-[11.5px] leading-[22px] lg:h-[26rem]">
              {shown.map((f, i) => (
                <Row key={`${i}:${f.path}`} file={f} index={i} state={i < scanned ? "done" : i === scanned ? "beam" : "todo"} lit={lit(f.dest)} xray={xray!} />
              ))}
              {total > MAX_ROWS && (
                <li className="px-4 pt-1 text-[#8d887a]">
                  … {total - MAX_ROWS} more files, all counted
                </li>
              )}
            </ol>
          </div>

          {/* Course */}
          <div className="min-w-0">
            <p className="px-5 pt-3 pb-2 font-code text-[10px] tracking-wide text-[#8d887a] uppercase">What CourseBox makes of it</p>
            <div className="scrollbar-thin h-72 overflow-y-auto px-5 pb-4 lg:h-[26rem]">
              {xray && (counts.lessons > 0 || done) && (
                <div className="xray-in mb-4">
                  <p className="font-display text-[28px] leading-tight text-white">{xray.title}</p>
                  {xray.byline && <p className="mt-1 text-[12px] text-[#8d887a]">{xray.byline}</p>}
                </div>
              )}
              {xray?.sections.map((s, si) => {
                const lessons = s.lessons.map((l, li) => ({ l, li })).filter(({ li }) => lessonVisible(si, li));
                if (!lessons.length) return null;
                return (
                  <div key={si} className="xray-in mb-3">
                    {s.group && <p className="font-code text-[10px] text-[#fde27a]/80 uppercase">{s.group}</p>}
                    <p className="border-b border-[#2a2822] pb-1 font-code text-[10px] tracking-wide text-[#8d887a] uppercase">
                      § {si + 1} {s.title}
                    </p>
                    <ul>
                      {lessons.map(({ l, li }) => (
                        <li key={li}>
                          <button
                            type="button"
                            onMouseEnter={() => pointLesson(si, li)}
                            onFocus={() => pointLesson(si, li)}
                            onClick={() => pointLesson(si, li)}
                            onMouseLeave={() => setHover(null)}
                            className={cn(
                              "xray-in flex w-full items-baseline gap-2.5 px-1 py-1 text-left text-[13.5px] transition-colors",
                              hover?.section === si && hover.lesson === li ? "bg-[#fde27a] text-[#16150f]" : "hover:bg-white/5",
                            )}
                          >
                            <span aria-hidden className="w-3 shrink-0 text-center font-code text-[11px] opacity-70">
                              {GLYPH[l.type] ?? "·"}
                            </span>
                            <span className="min-w-0 flex-1 truncate">{l.title}</span>
                            {l.attachments > 0 && <span className="shrink-0 font-code text-[10px] opacity-60">+{l.attachments}</span>}
                            {l.solution && <span className="shrink-0 font-code text-[10px] opacity-80">solution locked</span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>

          {phase.kind !== "ready" && (
            <div className="absolute inset-0 grid place-items-center bg-[#0f0f0c]/85 px-6 text-center">
              {phase.kind === "error" ? (
                <div>
                  <p className="font-display text-2xl">{phase.message}</p>
                  <button type="button" onClick={pick} className="mt-4 font-code text-[12px] text-[#fde27a] underline underline-offset-4">
                    Choose another zip
                  </button>
                </div>
              ) : (
                <p className="font-display text-2xl italic">
                  {phase.kind === "reading" ? `Reading ${phase.name}…` : "Loading the sample…"}
                  <span className="xray-blink">▍</span>
                </p>
              )}
            </div>
          )}
        </div>

        {/* Result */}
        <div className="flex flex-col gap-4 border-t border-[#2a2822] px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <dl className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
            <Stat n={counts.files} label="files" />
            <span aria-hidden className="font-display text-2xl text-[#5d594f]">→</span>
            <Stat n={counts.sections} label="sections" />
            <Stat n={counts.lessons} label="lessons" />
            <Stat n={counts.solutions} label="solutions paired" />
            <Stat n={counts.skipped} label="set aside" />
          </dl>
          <div className="flex flex-wrap items-center gap-3">
            {done && (
              <button type="button" onClick={() => setRun((r) => r + 1)} className="h-10 px-3 font-code text-[11px] text-[#8d887a] hover:text-white">
                ↻ Replay
              </button>
            )}
            {isSample ? (
              <button type="button" onClick={pick} className="h-10 bg-[#fde27a] px-5 text-[14px] font-medium text-[#16150f] hover:bg-[#fff0a8]">
                X-ray your own zip
              </button>
            ) : (
              <button
                type="button"
                disabled={!done}
                onClick={() => file && open(file)}
                className="h-10 bg-[#fde27a] px-5 text-[14px] font-medium text-[#16150f] hover:bg-[#fff0a8] disabled:opacity-40"
              >
                Open this course →
              </button>
            )}
          </div>
        </div>
      </div>
      <figcaption className="mt-3 flex flex-col gap-1 text-[13px] text-ink-3 lg:flex-row lg:justify-between lg:gap-8">
        <span>
          <span className="font-code">Fig. 1</span>: The real CourseBox analyzer, running in your browser.{" "}
          {isSample ? (
            <>The sample is the file list of MIT OpenCourseWare 6.006 (© MIT, CC BY-NC-SA 4.0). Drop your own zip anywhere on this page.</>
          ) : (
            <>Nothing has been uploaded or saved. Opening it imports it into your library.</>
          )}
        </span>
        <span className="shrink-0 font-code">{done ? "Point at a lesson to find its files." : " "}</span>
      </figcaption>
    </figure>
  );
}

const GLYPH: Record<string, string> = { video: "▶", pdf: "▤", audio: "♪", image: "▣", html: "◇", markdown: "¶", text: "¶" };

const Stat = ({ n, label }: { n: number; label: string }) => (
  <div className="flex items-baseline gap-1.5">
    <dd className="font-display text-3xl leading-none text-white tabular-nums">{n}</dd>
    <dt className="font-code text-[10px] text-[#8d887a]">{label}</dt>
  </div>
);

/** OCW file names start with a 32-char hash; show just a bit of it. */
const shorten = (p: string) => p.replace(/([0-9a-f]{6})[0-9a-f]{26}_/g, "$1…_");

function tag(d: XrayDest, x: Xray) {
  const sec = "section" in d ? x.sections[d.section] : undefined;
  const lesson = sec && "lesson" in d ? sec.lessons[d.lesson] : undefined;
  switch (d.kind) {
    case "lesson":
      return `→ ${sec?.title}`;
    case "solution":
      return `→ solution · ${lesson?.title}`;
    case "attachment":
      return `→ attached · ${lesson?.title}`;
    case "captions":
      return `→ captions · ${lesson?.title}`;
    case "cover":
      return "→ cover image";
    case "overview":
      return "→ overview";
    case "structure":
      return "· read for structure";
    case "junk":
      return "✕ junk";
    case "site":
      return "✕ website file";
  }
}

const Row = memo(function Row({ file, index, state, lit, xray }: { file: XrayFile; index: number; state: "todo" | "beam" | "done"; lit: boolean; xray: Xray }) {
  const skipped = file.dest.kind === "junk" || file.dest.kind === "site";
  const placed = "section" in file.dest;
  const path = shorten(file.path);
  const slash = path.lastIndexOf("/");
  return (
    <li
      className={cn(
        "grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-2 px-4 transition-colors duration-200 sm:grid-cols-[2.25rem_minmax(0,1fr)_auto]",
        state === "todo" && "opacity-30",
        state === "beam" && "bg-[#fde27a] text-[#16150f] transition-none",
        lit && "bg-[#fde27a] text-[#16150f]",
      )}
    >
      <span className="text-right opacity-50 tabular-nums">{index + 1}</span>
      <span className={cn("truncate", skipped && state === "done" && "line-through opacity-50")}>
        <span className="opacity-50">{path.slice(0, slash + 1)}</span>
        {path.slice(slash + 1)}
      </span>
      {state === "done" && (
        <span
          className={cn(
            "col-start-2 max-w-56 truncate text-[10.5px] sm:col-start-auto",
            lit ? "" : placed ? "text-[#fde27a]" : "text-[#8d887a]",
          )}
        >
          {tag(file.dest, xray)}
        </span>
      )}
    </li>
  );
});
