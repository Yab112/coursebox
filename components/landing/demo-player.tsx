"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Section } from "./primitives";

/**
 * Fig. 2: a working miniature of the course player, built in HTML so it loads instantly.
 * The lesson content is a short sample written for this demo, not material from the course.
 */
type Kind = "video" | "notes" | "question" | "problem";
type Lesson = { id: string; section: string; title: string; kind: Kind; meta: string };

const LESSONS: Lesson[] = [
  { id: "l11", section: "Lecture videos", title: "11 · Weighted Shortest Paths", kind: "video", meta: "Video · captions" },
  { id: "l12", section: "Lecture videos", title: "12 · Bellman-Ford", kind: "video", meta: "Video · captions" },
  { id: "n12", section: "Lecture notes", title: "Lecture 12 notes", kind: "notes", meta: "PDF · 3 pages" },
  { id: "q12", section: "In-class questions", title: "Running time of Bellman-Ford", kind: "question", meta: "Question" },
  { id: "ps5", section: "Problem sets", title: "Problem Set 5 · Problem 1", kind: "problem", meta: "PDF · solution locked" },
];

const DURATION = 45;
const CAPTIONS: Record<string, [number, string][]> = {
  l11: [
    [0, "A path's weight is the sum of the weights of its edges."],
    [11, "Dijkstra's algorithm needs every weight to be non-negative."],
    [23, "With a negative-weight cycle, some distances become −∞."],
    [35, "Next lecture: an algorithm that copes with negative weights."],
  ],
  l12: [
    [0, "Bellman-Ford: shortest paths from one source, negative weights allowed."],
    [11, "Relax every edge, and repeat that |V| − 1 times."],
    [23, "If an edge can still be relaxed after that, there's a negative cycle."],
    [35, "Total running time: O(|V| · |E|)."],
  ],
};

const NOTES = [
  {
    h: "Previously",
    body: ["Weighted graphs, shortest-path weight δ(s, v).", "DAG relaxation solves single-source shortest paths in O(|V| + |E|).", "Dijkstra handles general graphs, but only with non-negative weights."],
  },
  {
    h: "Relaxation",
    body: ["Keep an estimate d(v) ≥ δ(s, v) for every vertex.", "Relax edge (u, v): if d(v) > d(u) + w(u, v), lower d(v).", "After k rounds over all edges, every shortest path with ≤ k edges is found."],
  },
  {
    h: "Negative cycles",
    body: ["Simple paths have at most |V| − 1 edges, so |V| − 1 rounds suffice.", "One extra round: any edge that still relaxes lies on or after a negative cycle.", "Running time: O(|V| · |E|)."],
  },
];

const OPTIONS = ["O(|V| + |E|)", "O(|V| · |E|)", "O(|E| log |V|)", "O(|V|²)"];
const CORRECT = 1;

export function DemoPlayer() {
  const [current, setCurrent] = useState("l12");
  const [done, setDone] = useState<Set<string>>(() => new Set(["l11"]));
  const lesson = LESSONS.find((l) => l.id === current)!;
  const index = LESSONS.indexOf(lesson);

  // Per-lesson state survives switching lessons, like the real player.
  const [notesPage, setNotesPage] = useState(0);
  const [answer, setAnswer] = useState<number | null>(null);
  const [reveal, setReveal] = useState<"locked" | "confirm" | "open">("locked");
  const [video, setVideo] = useState<Record<string, number>>({});

  const go = (i: number) => setCurrent(LESSONS[Math.max(0, Math.min(LESSONS.length - 1, i))].id);
  const toggleDone = () =>
    setDone((d) => {
      const n = new Set(d);
      if (n.has(current)) n.delete(current);
      else n.add(current);
      return n;
    });

  const onKey = (e: React.KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "j") go(index + 1);
    else if (e.key === "k") go(index - 1);
    else if (e.key === "m") toggleDone();
    else return;
    e.preventDefault();
  };

  // Phones show the lessons as a horizontal strip: keep the current one in view without scrolling the page.
  const strip = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = strip.current;
    const el = nav?.querySelector<HTMLElement>("[aria-current]");
    if (!nav || !el || nav.scrollWidth <= nav.clientWidth) return;
    nav.scrollTo({ left: el.offsetLeft - 16, behavior: "smooth" });
  }, [current]);

  const pct = Math.round((done.size / LESSONS.length) * 100);
  let lastSection = "";

  return (
    <Section
      id="try"
      mark="02"
      label="Try it"
      title={
        <>
          Don&apos;t take our word for it. <em className="text-ink-2">Take the lesson.</em>
        </>
      }
    >
      <figure>
        <div onKeyDown={onKey} className="border border-ink bg-paper">
          {/* Top bar */}
          <div className="flex items-center gap-4 border-b border-rule px-4 py-3">
            <p className="min-w-0 flex-1 truncate font-display text-xl leading-none">Introduction to Algorithms</p>
            <div className="flex items-center gap-3">
              <div className="hidden h-1 w-28 bg-rule sm:block">
                <div className="h-full bg-ink transition-[width] duration-500" style={{ width: `${pct}%` }} />
              </div>
              <span className="font-code text-[11px] text-ink-3 tabular-nums">
                {done.size}/{LESSONS.length} done
              </span>
            </div>
          </div>

          <div className="grid lg:grid-cols-[17rem_1fr]">
            {/* Sidebar */}
            <nav ref={strip} aria-label="Demo lessons" className="scrollbar-thin relative flex overflow-x-auto border-b border-rule bg-panel lg:block lg:border-r lg:border-b-0">
              {LESSONS.map((l) => {
                const header = l.section !== lastSection ? l.section : null;
                lastSection = l.section;
                return (
                  <div key={l.id} className="shrink-0 lg:shrink">
                    {header && <p className="hidden px-4 pt-4 pb-1 font-code text-[10px] tracking-wide text-ink-3 uppercase lg:block">{header}</p>}
                    <button
                      type="button"
                      onClick={() => setCurrent(l.id)}
                      aria-current={l.id === current || undefined}
                      className={cn(
                        "flex w-56 items-start gap-3 px-4 py-2.5 text-left transition-colors lg:w-full",
                        l.id === current ? "bg-marker/80" : "hover:bg-paper",
                      )}
                    >
                      <Check on={done.has(l.id)} />
                      <span className="min-w-0">
                        <span className="block text-[14px] leading-snug">{l.title}</span>
                        <span className="block font-code text-[10px] text-ink-3">{l.meta}</span>
                      </span>
                    </button>
                  </div>
                );
              })}
            </nav>

            {/* Lesson */}
            <div className="flex min-w-0 flex-col lg:min-h-[30rem]">
              <div className="flex items-start justify-between gap-4 px-5 pt-5">
                <div className="min-w-0">
                  <p className="font-code text-[10px] tracking-wide text-ink-3 uppercase">{lesson.section}</p>
                  <h3 className="mt-1 text-lg font-semibold leading-snug">{lesson.title}</h3>
                </div>
                <button
                  type="button"
                  onClick={toggleDone}
                  className={cn(
                    "h-9 shrink-0 border px-3 text-[13px] font-medium transition-colors",
                    done.has(current) ? "border-ink bg-ink text-paper" : "border-ink hover:bg-ink hover:text-paper",
                  )}
                >
                  {done.has(current) ? "✓ Completed" : "Mark complete"}
                </button>
              </div>

              <div className="flex-1 p-5">
                {lesson.kind === "video" && (
                  <Video
                    key={lesson.id}
                    title={lesson.title}
                    captions={CAPTIONS[lesson.id]}
                    start={video[lesson.id] ?? 0}
                    onLeave={(t) => setVideo((v) => ({ ...v, [lesson.id]: t }))}
                  />
                )}
                {lesson.kind === "notes" && <Notes page={notesPage} setPage={setNotesPage} />}
                {lesson.kind === "question" && <Question answer={answer} setAnswer={setAnswer} />}
                {lesson.kind === "problem" && <Problem reveal={reveal} setReveal={setReveal} />}
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-rule px-5 py-3 text-[13px]">
                <button type="button" onClick={() => go(index - 1)} disabled={index === 0} className="text-ink-2 hover:text-ink disabled:opacity-30">
                  ← Previous
                </button>
                <span className="hidden font-code text-[10px] text-ink-3 sm:block">j / k to move · m to mark complete</span>
                <button type="button" onClick={() => go(index + 1)} disabled={index === LESSONS.length - 1} className="font-medium hover:underline disabled:opacity-30">
                  Next →
                </button>
              </div>
            </div>
          </div>
        </div>
        <figcaption className="mt-3 flex flex-col gap-1 text-[13px] text-ink-3 sm:flex-row sm:justify-between">
          <span>
            <span className="font-code">Fig. 2</span>: A working miniature of the course player. Lesson content is a short sample written for this demo.
          </span>
          <span className="font-code">Nothing here is saved.</span>
        </figcaption>
      </figure>
    </Section>
  );
}

function Check({ on }: { on: boolean }) {
  return (
    <span
      aria-label={on ? "Completed" : "Not completed"}
      className={cn(
        "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border text-[9px] transition-colors",
        on ? "border-ink bg-ink text-paper" : "border-ink-3",
      )}
    >
      {on && "✓"}
    </span>
  );
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const SPEEDS = [1, 1.5, 2];

function Video({ title, captions, start, onLeave }: { title: string; captions: [number, string][]; start: number; onLeave: (t: number) => void }) {
  const [t, setT] = useState(start);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [cc, setCc] = useState(true);
  const tRef = useRef(t);
  tRef.current = t;

  // Remember the position when the learner moves to another lesson.
  useEffect(() => () => onLeave(tRef.current), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setT((x) => {
        const next = Math.min(DURATION, x + 0.25 * speed);
        if (next >= DURATION) setPlaying(false);
        return next;
      });
    }, 250);
    return () => clearInterval(id);
  }, [playing, speed]);

  const caption = [...captions].reverse().find(([s]) => t >= s)?.[1];
  const toggle = () => {
    if (t >= DURATION) setT(0);
    setPlaying((p) => !p);
  };

  return (
    <div className="bg-[#16150f] text-[#ede8da] dark:border dark:border-rule">
      <button type="button" onClick={toggle} aria-label={playing ? "Pause" : "Play"} className="relative grid aspect-video w-full place-items-center">
        <span className="text-center">
          <span className="block font-code text-[10px] tracking-wide text-[#ede8da]/50 uppercase">6.006 · demo</span>
          <span className="mt-2 block font-display text-3xl sm:text-4xl">{title.replace(/^\d+ · /, "")}</span>
          {!playing && <span className="mt-5 inline-block border border-[#ede8da]/60 px-4 py-1.5 text-[13px]">{t > 0 && t < DURATION ? "Resume" : "Play"} ▸</span>}
        </span>
        {cc && caption && t > 0 && (
          <span className="absolute inset-x-6 bottom-4 text-center">
            <span className="bg-black/70 px-2 py-1 text-[13px] leading-6 sm:text-[15px]">{caption}</span>
          </span>
        )}
      </button>
      <div className="flex items-center gap-3 px-3 py-2 font-code text-[11px]">
        <button type="button" onClick={toggle} className="w-12 text-left hover:text-white">
          {playing ? "Pause" : "Play"}
        </button>
        <span className="tabular-nums text-[#ede8da]/70">
          {fmt(t)} / {fmt(DURATION)}
        </span>
        <input
          type="range"
          aria-label="Seek"
          min={0}
          max={DURATION}
          step={0.25}
          value={t}
          onChange={(e) => setT(Number(e.target.value))}
          className="h-1 min-w-0 flex-1 accent-[#fde27a]"
        />
        <button type="button" onClick={() => setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length])} className="w-9 hover:text-white" aria-label="Playback speed">
          {speed}×
        </button>
        <button type="button" onClick={() => setCc((c) => !c)} aria-pressed={cc} className={cn("px-1", cc ? "bg-[#ede8da] text-[#16150f]" : "hover:text-white")}>
          CC
        </button>
      </div>
    </div>
  );
}

function Notes({ page, setPage }: { page: number; setPage: (p: number) => void }) {
  const p = NOTES[page];
  return (
    <div className="bg-panel p-3 sm:p-6">
      <div className="mx-auto max-w-md bg-[#fffdf7] px-6 py-7 text-[#191813] shadow-[0_1px_0_#d6d0bf,0_8px_24px_-12px_rgba(0,0,0,0.25)] sm:px-9">
        <p className="flex justify-between font-code text-[10px] text-[#85816f]">
          <span>6.006 · Lecture 12</span>
          <span>{page + 1}</span>
        </p>
        <p className="mt-5 font-display text-2xl">{p.h}</p>
        <ul className="mt-3 list-disc space-y-2 pl-5 font-display text-[17px] leading-snug">
          {p.body.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      </div>
      <div className="mt-4 flex items-center justify-center gap-4 font-code text-[12px]">
        <button type="button" onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} className="px-2 disabled:opacity-30" aria-label="Previous page">
          ‹
        </button>
        <span className="tabular-nums">
          {page + 1} / {NOTES.length}
        </span>
        <button type="button" onClick={() => setPage(Math.min(NOTES.length - 1, page + 1))} disabled={page === NOTES.length - 1} className="px-2 disabled:opacity-30" aria-label="Next page">
          ›
        </button>
      </div>
      <p className="mt-2 text-center text-[12px] text-ink-3">Leave and come back: it reopens on this page.</p>
    </div>
  );
}

function Question({ answer, setAnswer }: { answer: number | null; setAnswer: (a: number) => void }) {
  return (
    <div className="max-w-lg">
      <p className="text-[17px]">For a graph with vertices V and edges E, how long does Bellman-Ford take?</p>
      <div className="mt-4 space-y-2">
        {OPTIONS.map((o, i) => {
          const picked = answer === i;
          return (
            <button
              key={o}
              type="button"
              onClick={() => setAnswer(i)}
              className={cn(
                "flex w-full items-center justify-between border px-4 py-2.5 text-left font-code text-[13px] transition-colors",
                picked ? "border-ink bg-marker/60" : "border-rule hover:border-ink",
              )}
            >
              {o}
              {picked && <span className="font-sans text-[12px] font-semibold">{i === CORRECT ? "✓ Correct" : "✗ Try again"}</span>}
            </button>
          );
        })}
      </div>
      {answer === CORRECT && <p className="mt-4 text-[14px] text-ink-2">Right: |V| − 1 rounds, and each round relaxes all |E| edges.</p>}
    </div>
  );
}

function Problem({ reveal, setReveal }: { reveal: "locked" | "confirm" | "open"; setReveal: (r: "locked" | "confirm" | "open") => void }) {
  return (
    <div className="max-w-xl">
      <p className="font-code text-[10px] tracking-wide text-ink-3 uppercase">Problem 1</p>
      <p className="mt-2 text-[17px] leading-relaxed">
        Show that if a negative-weight cycle is reachable from s, then after |V| − 1 rounds of Bellman-Ford some edge on that cycle can still be relaxed.
      </p>
      <div className="mt-6 border-t border-rule pt-5">
        {reveal === "open" ? (
          <div>
            <p className="font-code text-[10px] tracking-wide text-ink-3 uppercase">Solution</p>
            <p className="mt-2 leading-relaxed text-ink-2">
              Suppose no edge (u, v) on the cycle can be relaxed, so d(v) ≤ d(u) + w(u, v) for each of them. Adding these inequalities around
              the cycle, the d values cancel and leave 0 ≤ w(cycle). That contradicts the cycle&apos;s weight being negative.
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => setReveal(reveal === "locked" ? "confirm" : "open")}
              className="h-9 border border-ink px-4 text-[13px] font-medium transition-colors hover:bg-ink hover:text-paper"
            >
              {reveal === "locked" ? "Reveal solution" : "Yes, show it"}
            </button>
            <span className="text-[13px] text-ink-3">{reveal === "locked" ? "Locked so you try it first." : "Sure? Give it one more try first."}</span>
          </div>
        )}
      </div>
    </div>
  );
}
