import type { FeatureStatus } from "@/lib/features";
import { cn } from "@/lib/utils";

export const GITHUB_URL = "https://github.com/Yab112/coursebox";

export function Section({ id, className, children }: { id?: string; className?: string; children: React.ReactNode }) {
  return (
    <section id={id} className={cn("scroll-mt-20 px-4 py-20 sm:px-6 sm:py-28", className)}>
      <div className="mx-auto max-w-6xl">{children}</div>
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  className,
}: {
  eyebrow: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto mb-12 max-w-2xl text-center sm:mb-16", className)}>
      <p className="text-sm font-semibold uppercase tracking-wider text-primary">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-bold tracking-tight text-balance sm:text-4xl">{title}</h2>
      {description && <p className="mt-4 text-lg text-muted text-pretty">{description}</p>}
    </div>
  );
}

const STATUS_LABEL: Record<FeatureStatus, string> = { live: "Available", beta: "Beta", soon: "Coming soon" };

export function StatusBadge({ status, className }: { status: FeatureStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        status === "live" && "bg-success-soft text-success",
        status === "beta" && "bg-warning-soft text-warning",
        status === "soon" && "bg-primary-soft text-primary",
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full bg-current", status === "soon" && "animate-pulse")} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.26 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}

/** A light browser-window frame around product screenshots. */
export function BrowserFrame({ children, className, url = "coursebox.app" }: { children: React.ReactNode; className?: string; url?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-2xl border border-border bg-surface shadow-pop", className)}>
      <div className="flex items-center gap-2 border-b border-border bg-surface-2 px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-[#ff5f57]" />
        <span className="size-2.5 rounded-full bg-[#febc2e]" />
        <span className="size-2.5 rounded-full bg-[#28c840]" />
        <span className="mx-auto hidden rounded-md bg-surface px-3 py-0.5 text-[11px] text-subtle sm:block">{url}</span>
        <span className="hidden w-12 sm:block" />
      </div>
      {children}
    </div>
  );
}
