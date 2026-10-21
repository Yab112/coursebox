"use client";
import { AlertTriangle, CheckCircle2, Clock, Cloud, Database, HardDrive, Loader2, Mail, RefreshCw, Server, XCircle } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { FEATURES, STATUS_LABEL, type Feature } from "@/lib/features";
import { fetchStatus, uptimePercent, type ComponentHealth, type ComponentStatus, type StatusReport } from "@/lib/status";
import { cn, formatDuration } from "@/lib/utils";
import { LatencyChart } from "./latency-chart";

const REFRESH_MS = 30_000;

/** Status always carries an icon and words, never colour alone. */
const STATUS: Record<ComponentStatus | "unreachable", { label: string; Icon: typeof CheckCircle2; text: string; bg: string; bar: string }> = {
  operational: { label: "Operational", Icon: CheckCircle2, text: "text-success", bg: "bg-success-soft", bar: "bg-success" },
  degraded: { label: "Degraded", Icon: AlertTriangle, text: "text-warning", bg: "bg-warning-soft", bar: "bg-warning" },
  outage: { label: "Outage", Icon: XCircle, text: "text-[var(--danger)]", bg: "bg-[var(--danger-soft)]", bar: "bg-[var(--danger)]" },
  unreachable: { label: "Unreachable", Icon: XCircle, text: "text-[var(--danger)]", bg: "bg-[var(--danger-soft)]", bar: "bg-[var(--danger)]" },
};

const HEADLINE: Record<ComponentStatus | "unreachable", string> = {
  operational: "All systems operational",
  degraded: "Running, with something to look at",
  outage: "Part of CourseBox is down",
  unreachable: "The API isn't answering",
};

const ICONS: Record<ComponentHealth["id"], typeof Server> = { api: Server, database: Database, storage: HardDrive, email: Mail };

function ago(iso: string, now: number) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  return s < 5 ? "just now" : s < 60 ? `${s}s ago` : `${Math.round(s / 60)} min ago`;
}

export function StatusPage() {
  const [report, setReport] = useState<StatusReport>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [slow, setSlow] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const inflight = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    inflight.current?.abort();
    const ctl = new AbortController();
    inflight.current = ctl;
    setLoading(true);
    // Free hosting sleeps when idle; the first request can take up to a minute while it wakes.
    const slowTimer = setTimeout(() => setSlow(true), 3000);
    const timeout = setTimeout(() => ctl.abort(), 75_000);
    try {
      setReport(await fetchStatus(ctl.signal));
      setError(undefined);
    } catch (e) {
      // Ignore requests replaced by a newer one; a timeout of the current one is a real failure.
      if (inflight.current === ctl)
        setError(
          e instanceof Error && e.name === "AbortError"
            ? "No answer within 75 seconds"
            : e instanceof TypeError
              ? "Couldn't connect to the API"
              : e instanceof Error
                ? e.message
                : "Something went wrong",
        );
    } finally {
      clearTimeout(slowTimer);
      clearTimeout(timeout);
      if (inflight.current === ctl) {
        setLoading(false);
        setSlow(false);
      }
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), REFRESH_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(t);
      clearInterval(tick);
      inflight.current?.abort();
    };
  }, [load]);

  const overall: ComponentStatus | "unreachable" | undefined = error ? "unreachable" : report?.status;
  const s = overall ? STATUS[overall] : undefined;
  const uptime = report ? uptimePercent(report.history) : null;

  return (
    <div className="status-root min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/80 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-4 px-4 sm:px-6">
          <Logo />
          <span className="text-sm text-muted">Status</span>
          <div className="ml-auto flex items-center gap-1">
            <Link href="/library" className="rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-foreground">
              Library
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6 sm:py-12">
        {/* Overall */}
        <section aria-live="polite" className={cn("rounded-2xl border border-border p-6 sm:p-8", s?.bg ?? "bg-surface")}>
          <div className="flex flex-wrap items-start gap-4">
            {s ? <s.Icon className={cn("size-8 shrink-0", s.text)} /> : <Loader2 className="size-8 shrink-0 animate-spin text-muted" />}
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{overall ? HEADLINE[overall] : "Checking the API…"}</h1>
              <p className="mt-1 text-sm text-muted">
                {slow && loading
                  ? "Waking the API up. On the free plan it sleeps after 15 minutes idle, so this can take up to a minute."
                  : error
                    ? `${error}. ${report ? `Last good check ${ago(report.checkedAt, now)}.` : ""}`
                    : report
                      ? `Checked live ${ago(report.checkedAt, now)} · refreshes every 30 seconds`
                      : "Asking the API for a live health check"}
              </p>
            </div>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm hover:bg-surface-2 disabled:opacity-60"
            >
              <RefreshCw className={cn("size-4", loading && "animate-spin")} /> Refresh
            </button>
          </div>
        </section>

        {/* Components */}
        <section>
          <h2 className="mb-3 text-lg font-semibold">Components</h2>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {(report?.components ?? []).map((c) => {
              const cs = error ? STATUS.unreachable : STATUS[c.status];
              const Icon = ICONS[c.id];
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-4">
                  <Icon className="size-5 shrink-0 text-muted" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{c.name}</p>
                    <p className="text-sm text-muted">{c.detail}</p>
                  </div>
                  {typeof c.latencyMs === "number" && <span className="text-sm text-muted tabular-nums">{c.latencyMs} ms</span>}
                  <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", cs.bg, cs.text)}>
                    <cs.Icon className="size-3.5" /> {cs.label}
                  </span>
                </li>
              );
            })}
            {!report && error && <li className="px-5 py-6 text-sm text-muted">No component data while the API can&apos;t be reached.</li>}
            {!report && !error && (
              <li className="space-y-3 p-5">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="skeleton h-10 rounded-lg" />
                ))}
              </li>
            )}
          </ul>
        </section>

        {report && (
          <section className="grid gap-6 lg:grid-cols-3">
            <div className="rounded-2xl border border-border bg-surface p-5 lg:col-span-2">
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold">Response time</h2>
                <p className="text-xs text-muted">Last {report.history.length} checks since the API started</p>
              </div>
              <LatencyChart history={report.history} />

              <div className="mt-6">
                <div className="mb-2 flex items-baseline justify-between text-sm">
                  <span className="font-medium">Uptime</span>
                  <span className="text-muted tabular-nums">{uptime !== null ? `${uptime.toFixed(uptime === 100 ? 0 : 2)}% of checks` : "–"}</span>
                </div>
                <div className="flex h-8 items-end gap-0.5" role="img" aria-label="Status of each check, oldest first">
                  {report.history.map((h) => (
                    <span key={h.at} title={`${new Date(h.at).toLocaleString()} · ${STATUS[h.status].label}`} className={cn("h-full min-w-[3px] flex-1 rounded-sm opacity-80 hover:opacity-100", STATUS[h.status].bar)} />
                  ))}
                </div>
                <ul className="mt-2 flex flex-wrap gap-4 text-xs text-muted">
                  {(["operational", "degraded", "outage"] as const).map((k) => (
                    <li key={k} className="flex items-center gap-1.5">
                      {(() => {
                        const I = STATUS[k].Icon;
                        return <I className={cn("size-3.5", STATUS[k].text)} />;
                      })()}
                      {STATUS[k].label}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-subtle">
                  History lives in the API&apos;s memory. On the free plan the API sleeps after 15 idle minutes, so the history starts over when it wakes.
                </p>
              </div>
            </div>

            <dl className="space-y-4 rounded-2xl border border-border bg-surface p-5 text-sm">
              <h2 className="text-lg font-semibold">Service</h2>
              <Info icon={Clock} label="Running for" value={formatDuration(report.service.uptimeSeconds)} hint={`since ${new Date(report.service.startedAt).toLocaleString()}`} />
              <Info icon={Cloud} label="Region" value={report.service.region ?? "Not reported"} />
              <Info icon={Server} label="Version" value={`v${report.service.version}${report.service.commit ? ` · ${report.service.commit}` : ""}`} hint={`Node ${report.service.node}`} />
            </dl>
          </section>
        )}

        <Roadmap />
      </main>
    </div>
  );
}

function Info({ icon: Icon, label, value, hint }: { icon: typeof Clock; label: string; value: string; hint?: string }) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted" />
      <div>
        <dt className="text-xs text-muted">{label}</dt>
        <dd className="font-medium">{value}</dd>
        {hint && <dd className="text-xs text-subtle">{hint}</dd>}
      </div>
    </div>
  );
}

const COLUMNS: { title: string; pick: (f: Feature) => boolean; tone: string }[] = [
  { title: "In progress", pick: (f) => f.status === "building", tone: "bg-primary-soft text-primary" },
  { title: "Planned", pick: (f) => f.status === "soon", tone: "bg-surface-2 text-muted" },
  { title: "Recently shipped", pick: (f) => f.status === "live" && !!f.shipped, tone: "bg-success-soft text-success" },
];

function Roadmap() {
  return (
    <section>
      <h2 className="text-lg font-semibold">What we&apos;re working on</h2>
      <p className="mb-4 text-sm text-muted">The same list the product is built from, so it&apos;s always current.</p>
      <div className="grid gap-4 md:grid-cols-3">
        {COLUMNS.map((col) => {
          const items = FEATURES.filter(col.pick);
          return (
            <div key={col.title} className="rounded-2xl border border-border bg-surface p-4">
              <h3 className="mb-3 flex items-center justify-between text-sm font-semibold">
                {col.title}
                <span className="rounded-full bg-surface-2 px-2 text-xs font-medium text-muted tabular-nums">{items.length}</span>
              </h3>
              <ul className="space-y-2.5">
                {items.map((f) => (
                  <li key={f.id} className="rounded-xl border border-border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">{f.title}</p>
                      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", col.tone)}>{STATUS_LABEL[f.status]}</span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted">{f.description}</p>
                    {f.shipped && <p className="mt-1.5 text-[11px] text-subtle">Shipped {new Date(f.shipped).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</p>}
                  </li>
                ))}
                {!items.length && <li className="text-xs text-subtle">Nothing here right now.</li>}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
