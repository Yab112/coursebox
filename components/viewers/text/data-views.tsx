"use client";
import { ArrowDown, ArrowUp, ChevronRight, Search } from "lucide-react";
import Papa from "papaparse";
import { useMemo, useState } from "react";
import { parseCues } from "@/lib/subtitles";
import { cn } from "@/lib/utils";
import { CodeView, CopyButton } from "./code-view";

/** Toolbar toggle between a structured view and the raw file. */
function ModeToggle<T extends string>({ modes, mode, setMode }: { modes: [T, string][]; mode: T; setMode: (m: T) => void }) {
  return (
    <div className="inline-flex rounded-md bg-surface-2 p-0.5">
      {modes.map(([m, label]) => (
        <button
          key={m}
          type="button"
          onClick={() => setMode(m)}
          aria-pressed={mode === m}
          className={cn("rounded px-2 py-0.5 text-xs", mode === m ? "bg-surface font-medium text-foreground shadow-sm" : "text-muted hover:text-foreground")}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ---------- JSON ----------

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

function JsonNode({ name, value, depth }: { name?: string; value: Json; depth: number }) {
  const isObj = value !== null && typeof value === "object";
  const [open, setOpen] = useState(depth < 2);
  const key = name !== undefined && <span className="text-[#0550ae] dark:text-[#79c0ff]">{JSON.stringify(name)}</span>;

  if (!isObj) {
    const cls =
      typeof value === "string"
        ? "text-[#0a3069] dark:text-[#a5d6ff]"
        : typeof value === "number"
          ? "text-[#953800] dark:text-[#ffa657]"
          : "text-[#cf222e] dark:text-[#ff7b72]";
    return (
      <div className="pl-5">
        {key}
        {key && <span className="text-muted">: </span>}
        <span className={cn(cls, "break-all")}>{JSON.stringify(value)}</span>
      </div>
    );
  }
  const entries: [string | undefined, Json][] = Array.isArray(value) ? value.map((v) => [undefined, v]) : Object.entries(value);
  const [l, r] = Array.isArray(value) ? ["[", "]"] : ["{", "}"];
  return (
    <div className={depth ? "pl-5" : ""}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="-ml-5 inline-flex items-center hover:text-foreground" aria-expanded={open}>
        <ChevronRight className={cn("size-4 text-subtle transition-transform", open && "rotate-90")} />
        <span className="ml-1">
          {key}
          {key && <span className="text-muted">: </span>}
          <span className="text-muted">{l}</span>
        </span>
      </button>
      {open ? (
        <>
          {entries.map(([k, v], i) => (
            <JsonNode key={i} name={k} value={v} depth={depth + 1} />
          ))}
          <div className="text-muted">{r}</div>
        </>
      ) : (
        <span className="text-subtle">
          {" "}
          {entries.length} {Array.isArray(value) ? (entries.length === 1 ? "item" : "items") : entries.length === 1 ? "key" : "keys"} {r}
        </span>
      )}
    </div>
  );
}

export function JsonView({ text, truncated }: { text: string; truncated?: boolean }) {
  const parsed = useMemo(() => {
    try {
      return { ok: true as const, value: JSON.parse(text) as Json };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  }, [text]);
  const [mode, setMode] = useState<"tree" | "raw">(parsed.ok && !truncated ? "tree" : "raw");
  const pretty = useMemo(() => (parsed.ok ? JSON.stringify(parsed.value, null, 2) : text), [parsed, text]);
  const toggle = parsed.ok && !truncated && <ModeToggle modes={[["tree", "Tree"], ["raw", "Raw"]]} mode={mode} setMode={setMode} />;

  if (mode === "raw") return <CodeView code={pretty} lang="json" truncated={truncated} toolbarExtra={toggle} />;
  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5 text-xs text-muted">
        <span className="rounded bg-surface-2 px-2 py-0.5 font-medium text-foreground">JSON</span>
        <div className="ml-auto flex items-center gap-1">
          {toggle}
          <CopyButton text={pretty} />
        </div>
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto p-4 pl-8 font-mono text-[13px] leading-6">
        <JsonNode value={parsed.ok ? parsed.value : null} depth={0} />
      </div>
    </div>
  );
}

// ---------- CSV / TSV ----------

const MAX_ROWS = 5000;
const numeric = (s: string) => s.trim() !== "" && !Number.isNaN(Number(s.replace(/,/g, "")));

export function TableView({ text, delimiter, truncated }: { text: string; delimiter: string; truncated?: boolean }) {
  const [mode, setMode] = useState<"table" | "raw">("table");
  const [sort, setSort] = useState<{ col: number; dir: 1 | -1 } | null>(null);
  const [query, setQuery] = useState("");

  const { header, rows } = useMemo(() => {
    const res = Papa.parse<string[]>(text.trim(), { delimiter, skipEmptyLines: true });
    const all = res.data;
    // A first row with no numbers and different "shape" from the data reads as a header.
    const first = all[0] ?? [];
    const hasHeader = all.length > 1 && first.every((c) => !numeric(c)) && all[1].some((c) => numeric(c) || c !== "");
    return { header: hasHeader ? first : first.map((_, i) => `Column ${i + 1}`), rows: hasHeader ? all.slice(1) : all };
  }, [text, delimiter]);

  const shown = useMemo(() => {
    let r = query ? rows.filter((row) => row.some((c) => c.toLowerCase().includes(query.toLowerCase()))) : rows;
    if (sort) {
      const num = r.every((row) => row[sort.col] === undefined || row[sort.col] === "" || numeric(row[sort.col]));
      r = [...r].sort((a, b) => {
        const x = a[sort.col] ?? "";
        const y = b[sort.col] ?? "";
        return sort.dir * (num ? Number(x.replace(/,/g, "")) - Number(y.replace(/,/g, "")) : x.localeCompare(y, undefined, { numeric: true }));
      });
    }
    return r;
  }, [rows, query, sort]);

  const toggle = <ModeToggle modes={[["table", "Table"], ["raw", "Raw"]]} mode={mode} setMode={setMode} />;
  if (mode === "raw") return <CodeView code={text} lang={delimiter === "\t" ? "tsv" : "csv"} truncated={truncated} toolbarExtra={toggle} />;

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-1.5 text-xs text-muted">
        <span className="rounded bg-surface-2 px-2 py-0.5 font-medium text-foreground">{delimiter === "\t" ? "TSV" : "CSV"}</span>
        <span className="tabular-nums">
          {rows.length.toLocaleString()} rows · {header.length} columns
        </span>
        <label className="relative ml-auto">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter rows"
            aria-label="Filter rows"
            className="h-7 w-40 rounded-md border border-border bg-surface pr-2 pl-7 text-xs outline-none focus:border-primary"
          />
        </label>
        {toggle}
        <CopyButton text={text} />
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto">
        <table className="min-w-full border-collapse text-[13px]">
          <thead className="sticky top-0 z-10 bg-surface-2">
            <tr>
              <th className="w-12 border-b border-border px-3 py-2 text-right font-normal text-subtle">#</th>
              {header.map((h, i) => (
                <th key={i} className="border-b border-border p-0 text-left font-semibold whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => setSort((s) => (s?.col === i ? (s.dir === 1 ? { col: i, dir: -1 } : null) : { col: i, dir: 1 }))}
                    className="flex w-full items-center gap-1 px-3 py-2 hover:text-primary"
                  >
                    {h}
                    {sort?.col === i && (sort.dir === 1 ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.slice(0, MAX_ROWS).map((row, r) => (
              <tr key={r} className="even:bg-surface-2/40 hover:bg-primary-soft/40">
                <td className="border-b border-border px-3 py-1.5 text-right text-subtle tabular-nums">{r + 1}</td>
                {header.map((_, c) => (
                  <td key={c} className={cn("max-w-md truncate border-b border-border px-3 py-1.5", numeric(row[c] ?? "") && "text-right tabular-nums")} title={row[c]}>
                    {row[c]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {(shown.length > MAX_ROWS || truncated) && (
          <p className="p-4 text-sm text-muted">
            Showing the first {Math.min(shown.length, MAX_ROWS).toLocaleString()} rows{truncated ? " of a longer file" : ""}. Download it to see everything.
          </p>
        )}
      </div>
    </div>
  );
}

// ---------- Subtitles ----------

const clock = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return `${h ? `${h}:` : ""}${String(m).padStart(h ? 2 : 1, "0")}:${String(sec).padStart(2, "0")}`;
};

export function SubtitlesView({ text, lang }: { text: string; lang: string }) {
  const cues = useMemo(() => parseCues(text), [text]);
  const [mode, setMode] = useState<"transcript" | "raw">(cues.length ? "transcript" : "raw");
  const [query, setQuery] = useState("");
  const toggle = cues.length > 0 && <ModeToggle modes={[["transcript", "Transcript"], ["raw", "Raw"]]} mode={mode} setMode={setMode} />;
  if (mode === "raw") return <CodeView code={text} lang={lang} toolbarExtra={toggle} />;

  const q = query.toLowerCase();
  const shown = q ? cues.filter((c) => c.text.toLowerCase().includes(q)) : cues;
  const transcript = cues.map((c) => c.text).join(" ");
  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-1.5 text-xs text-muted">
        <span className="rounded bg-surface-2 px-2 py-0.5 font-medium text-foreground">Transcript</span>
        <span className="tabular-nums">
          {cues.length} lines · {clock(cues.at(-1)?.end ?? 0)}
        </span>
        <label className="relative ml-auto">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search transcript"
            aria-label="Search transcript"
            className="h-7 w-44 rounded-md border border-border bg-surface pr-2 pl-7 text-xs outline-none focus:border-primary"
          />
        </label>
        {toggle}
        <CopyButton text={transcript} label="Copy text" />
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto">
        <ol className="mx-auto max-w-3xl px-5 py-6">
          {shown.map((c, i) => (
            <li key={i} className="grid grid-cols-[4.5rem_1fr] gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-2">
              <span className="pt-0.5 font-mono text-xs text-subtle tabular-nums">{clock(c.start)}</span>
              <span className="leading-relaxed">{c.text}</span>
            </li>
          ))}
          {!shown.length && <li className="px-2 text-muted">No lines match “{query}”.</li>}
        </ol>
      </div>
    </div>
  );
}
