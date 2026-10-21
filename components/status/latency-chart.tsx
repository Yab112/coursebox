"use client";
import { useMemo, useRef, useState } from "react";
import type { HealthSample } from "@/lib/status";

/**
 * Response time over the samples the API has taken. One y-axis (ms), three series with fixed colours
 * (validated categorical slots 1-3), direct labels at the line ends, a crosshair tooltip on hover.
 */
const SERIES = [
  { key: "apiMs", label: "API", cls: "stroke-[var(--s1)]", dot: "bg-[var(--s1)]" },
  { key: "dbMs", label: "Database", cls: "stroke-[var(--s2)]", dot: "bg-[var(--s2)]" },
  { key: "storageMs", label: "Storage", cls: "stroke-[var(--s3)]", dot: "bg-[var(--s3)]" },
] as const;

const W = 720;
const H = 220;
const PAD = { l: 44, r: 96, t: 12, b: 26 };

const niceMax = (v: number) => {
  const steps = [10, 20, 50, 100, 200, 250, 500, 1000, 2000, 5000];
  return steps.find((s) => s >= v) ?? Math.ceil(v / 1000) * 1000;
};
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function LatencyChart({ history }: { history: HealthSample[] }) {
  const svg = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const { max, x, y, paths } = useMemo(() => {
    const vals = history.flatMap((s) => SERIES.map((se) => s[se.key]).filter((v): v is number => typeof v === "number"));
    const max = niceMax(Math.max(10, ...vals));
    const n = history.length;
    const x = (i: number) => PAD.l + (n <= 1 ? 0 : (i / (n - 1)) * (W - PAD.l - PAD.r));
    const y = (v: number) => PAD.t + (1 - v / max) * (H - PAD.t - PAD.b);
    const paths = SERIES.map((se) => {
      let d = "";
      history.forEach((s, i) => {
        const v = s[se.key];
        if (typeof v !== "number") return;
        d += `${d ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      });
      return d;
    });
    return { max, x, y, paths };
  }, [history]);

  if (history.length < 2)
    return (
      <p className="grid h-40 place-items-center rounded-xl border border-dashed border-border text-sm text-muted">
        Collecting data. The API takes a sample every two minutes.
      </p>
    );

  const last = history.length - 1;
  const ticks = [0, max / 2, max];
  // Direct labels at the right edge, nudged apart so they never overlap.
  const labels = SERIES.map((se, i) => ({ se, i, v: history[last][se.key] }))
    .filter((l): l is typeof l & { v: number } => typeof l.v === "number")
    .map((l) => ({ ...l, yy: y(l.v) }))
    .sort((a, b) => a.yy - b.yy);
  for (let i = 1; i < labels.length; i++) if (labels[i].yy - labels[i - 1].yy < 14) labels[i].yy = labels[i - 1].yy + 14;

  const onMove = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * last);
    setHover(Math.max(0, Math.min(last, i)));
  };
  const h = hover !== null ? history[hover] : null;

  return (
    <div className="latency-chart relative">
      <ul className="mb-2 flex flex-wrap gap-4 text-xs text-muted" aria-label="Legend">
        {SERIES.map((se) => (
          <li key={se.key} className="flex items-center gap-1.5">
            <span className={`h-0.5 w-4 rounded ${se.dot}`} /> {se.label}
          </li>
        ))}
      </ul>
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none select-none"
        role="img"
        aria-label={`Response times over the last ${history.length} checks`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} strokeDasharray={t ? "3 4" : undefined} />
            <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" className="fill-[var(--subtle)] text-[11px]">
              {Math.round(t)} ms
            </text>
          </g>
        ))}
        <text x={PAD.l} y={H - 6} className="fill-[var(--subtle)] text-[11px]">
          {time(history[0].at)}
        </text>
        <text x={W - PAD.r} y={H - 6} textAnchor="end" className="fill-[var(--subtle)] text-[11px]">
          {time(history[last].at)}
        </text>
        {paths.map((d, i) => d && <path key={SERIES[i].key} d={d} fill="none" className={SERIES[i].cls} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />)}
        {labels.map((l) => (
          <text key={l.se.key} x={W - PAD.r + 8} y={l.yy + 4} className="fill-[var(--foreground)] text-[11px]">
            {l.se.label} {l.v} ms
          </text>
        ))}
        {h && hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} className="stroke-[var(--subtle)]" strokeWidth={1} />
            {SERIES.map((se) => {
              const v = h[se.key];
              return typeof v === "number" ? <circle key={se.key} cx={x(hover)} cy={y(v)} r={4} className={`${se.cls} fill-[var(--surface)]`} strokeWidth={2} /> : null;
            })}
          </g>
        )}
      </svg>
      {h && hover !== null && (
        <div
          className="pointer-events-none absolute top-8 z-10 rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-pop"
          style={{ left: `${(x(hover) / W) * 100}%`, transform: hover > last / 2 ? "translateX(calc(-100% - 12px))" : "translateX(12px)" }}
        >
          <p className="mb-1 font-medium text-foreground">{new Date(h.at).toLocaleString()}</p>
          {SERIES.map((se) => (
            <p key={se.key} className="flex items-center gap-2 text-muted">
              <span className={`size-2 rounded-full ${se.dot}`} />
              {se.label} <span className="ml-auto pl-3 font-medium text-foreground tabular-nums">{h[se.key] ?? "–"} ms</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
