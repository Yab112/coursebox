import { cn } from "@/lib/utils";

export const GITHUB_URL = "https://github.com/Yab112/coursebox";

/** A syllabus-style section: a § label in the margin and content beside it. */
export function Section({
  id,
  mark,
  label,
  title,
  className,
  children,
}: {
  id?: string;
  mark: string;
  label: string;
  title?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={cn("scroll-mt-16 border-t border-rule px-4 py-16 sm:px-6 sm:py-24", className)}>
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-12 lg:gap-6">
        <div className="lg:col-span-3">
          <p className="font-code text-xs tracking-wide text-ink-3 uppercase">
            § {mark} — {label}
          </p>
        </div>
        <div className="lg:col-span-9">
          {title && <h2 className="mb-10 max-w-3xl font-display text-4xl leading-[1.05] text-balance sm:mb-14 sm:text-6xl">{title}</h2>}
          {children}
        </div>
      </div>
    </section>
  );
}

/** Highlighter stroke behind a few words. Used sparingly. */
export function Marker({ children }: { children: React.ReactNode }) {
  return <mark className="landing-marker">{children}</mark>;
}
