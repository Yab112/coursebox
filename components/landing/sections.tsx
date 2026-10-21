import { ArrowRight, Check, ChevronDown, Download, FileArchive, HardDrive, Library, ShieldCheck, Sparkles, Zap } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { type Feature, featuresBy } from "@/lib/features";
import { cn } from "@/lib/utils";
import { GITHUB_URL, GithubIcon, Section, SectionHeading, StatusBadge } from "./primitives";
import { LibraryLink } from "./site-nav";

const SOURCES = ["MIT OpenCourseWare", "Udemy-style downloads", "University course folders", "Any zip of videos & PDFs"];
const FORMATS = ["PDF", "MP4", "YouTube", "Markdown", "Jupyter", "HTML", "Code", "Images", "Subtitles", "Nested zips"];

export function Sources() {
  return (
    <div className="border-y border-border bg-surface px-4 py-10 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 lg:flex-row lg:justify-between">
        <p className="shrink-0 text-sm font-medium text-subtle">Works with</p>
        <ul className="flex flex-wrap justify-center gap-x-8 gap-y-3">
          {SOURCES.map((s) => (
            <li key={s} className="text-[15px] font-semibold text-muted">
              {s}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const STEPS = [
  {
    icon: Download,
    title: "Download a course",
    body: (
      <>
        Grab any course as a zip. On{" "}
        <a href="https://ocw.mit.edu" target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
          ocw.mit.edu
        </a>{" "}
        just choose <span className="font-medium text-foreground">Download course</span>.
      </>
    ),
  },
  {
    icon: FileArchive,
    title: "Drop the zip",
    body: <>It&apos;s unzipped in your browser and analyzed: sections, lessons, notes, solutions and captions all find their place.</>,
  },
  {
    icon: Library,
    title: "Start learning",
    body: <>Open it like any online course. Track progress, resume where you left off and keep every course in your library.</>,
  },
];

export function HowItWorks() {
  return (
    <Section id="how-it-works">
      <SectionHeading eyebrow="How it works" title="From zip to course in under a minute" />
      <ol className="relative grid gap-6 md:grid-cols-3">
        <div aria-hidden className="absolute top-7 right-[16%] left-[16%] hidden h-px bg-linear-to-r from-transparent via-border to-transparent md:block" />
        {STEPS.map((s, i) => (
          <li key={s.title} className="relative flex flex-col items-center text-center">
            <span className="relative grid size-14 place-items-center rounded-2xl border border-border bg-surface text-primary shadow-card">
              <s.icon className="size-6" />
              <span className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                {i + 1}
              </span>
            </span>
            <h3 className="mt-5 text-lg font-semibold">{s.title}</h3>
            <p className="mt-2 max-w-xs text-muted">{s.body}</p>
          </li>
        ))}
      </ol>
      <div className="mt-14 flex flex-wrap justify-center gap-2">
        {FORMATS.map((f) => (
          <span key={f} className="rounded-full border border-border bg-surface px-3 py-1 text-sm text-muted">
            {f}
          </span>
        ))}
      </div>
    </Section>
  );
}

function FeatureCard({ feature, className, children }: { feature: Feature; className?: string; children?: React.ReactNode }) {
  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-2xl border border-border bg-surface p-6 shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-pop",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="grid size-11 place-items-center rounded-xl bg-primary-soft text-primary transition-transform group-hover:scale-105">
          <feature.icon className="size-5" />
        </span>
        {feature.status !== "live" && <StatusBadge status={feature.status} />}
      </div>
      <h3 className="mt-5 text-lg font-semibold">{feature.title}</h3>
      <p className="mt-2 text-muted text-pretty">{feature.description}</p>
      {children}
    </div>
  );
}

export function Features() {
  return (
    <Section id="features">
      <SectionHeading
        eyebrow="Features"
        title="Everything a course needs, nothing it doesn't"
        description="CourseBox reads the structure that's already hidden in your downloads and gives it a proper home."
      />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {featuresBy("live").map((f) => (
          <FeatureCard key={f.id} feature={f} />
        ))}
      </div>
    </Section>
  );
}

/** Small illustrative previews for upcoming features, keyed by feature id. */
const PREVIEWS: Record<string, React.ReactNode> = {
  recap: (
    <div className="mt-6 rounded-xl border border-border bg-background p-4 text-sm">
      <p className="font-semibold">Lecture 12 · Bellman-Ford</p>
      <ul className="mt-2 space-y-1.5 text-muted">
        {["Finds shortest paths even with negative edge weights", "Relaxes every edge |V| − 1 times", "One more pass detects negative cycles"].map((t) => (
          <li key={t} className="flex gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-primary" /> {t}
          </li>
        ))}
      </ul>
    </div>
  ),
  quiz: (
    <div className="mt-6 rounded-xl border border-border bg-background p-4 text-sm">
      <p className="font-medium">What is Bellman-Ford&apos;s running time?</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {["O(|V| + |E|)", "O(|V|·|E|)", "O(|E| log |V|)", "O(|V|²)"].map((o, i) => (
          <span
            key={o}
            className={cn(
              "rounded-lg border px-3 py-1.5 font-mono text-xs",
              i === 1 ? "border-success bg-success-soft text-success" : "border-border text-muted",
            )}
          >
            {o}
          </span>
        ))}
      </div>
    </div>
  ),
};

export function Roadmap() {
  // Features with a preview take half a row each and go first; the rest fill rows of three.
  const featured = new Set(Object.keys(PREVIEWS));
  const soon = featuresBy("soon").sort((a, b) => Number(featured.has(b.id)) - Number(featured.has(a.id)));
  return (
    <Section id="roadmap" className="relative overflow-hidden">
      <div aria-hidden className="landing-glow pointer-events-none absolute top-1/3 left-1/2 -z-10 h-[420px] w-[760px] -translate-x-1/2 opacity-60" />
      <SectionHeading
        eyebrow="Roadmap"
        title={
          <>
            From course reader to <span className="landing-gradient-text">study partner</span>
          </>
        }
        description="CourseBox is growing. Here's what we're building next to help you actually learn what's in your courses, not just store them."
      />
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-6">
        {soon.map((f) => (
          <FeatureCard key={f.id} feature={f} className={featured.has(f.id) ? "lg:col-span-3" : "lg:col-span-2"}>
            {PREVIEWS[f.id]}
          </FeatureCard>
        ))}
      </div>
      <p className="mt-10 text-center text-muted">
        Have an idea?{" "}
        <a href={`${GITHUB_URL}/issues`} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
          Request a feature on GitHub
        </a>
      </p>
    </Section>
  );
}

const LOCAL_POINTS = [
  { icon: HardDrive, title: "Stored in your browser", body: "Courses are unzipped and kept in your browser's storage. Nothing is uploaded unless you choose to." },
  { icon: Zap, title: "Fast, even on bad Wi-Fi", body: "Lessons load straight from your device, so big PDFs and videos open instantly instead of streaming from a server." },
  { icon: ShieldCheck, title: "Sync only if you want", body: "A free account saves up to 2 courses and your progress, so you can continue on any device." },
];

export function LocalFirst() {
  return (
    <Section className="bg-surface">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">Local-first</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-balance sm:text-4xl">Your courses. Your device. Your pace.</h2>
          <p className="mt-4 text-lg text-muted text-pretty">
            No subscriptions, no tracking and no waiting for uploads. CourseBox does all the work right in your browser.
          </p>
          <ul className="mt-8 space-y-6">
            {LOCAL_POINTS.map((p) => (
              <li key={p.title} className="flex gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                  <p.icon className="size-5" />
                </span>
                <div>
                  <h3 className="font-semibold">{p.title}</h3>
                  <p className="mt-1 text-muted">{p.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="relative">
          <div aria-hidden className="landing-glow pointer-events-none absolute inset-0 -z-10 scale-110" />
          <div className="aspect-[1440/620] overflow-hidden rounded-2xl border border-border shadow-pop">
            <Image
              src="/screenshots/library-dark.png"
              alt="The CourseBox library in dark mode with course cards and progress"
              width={1440}
              height={900}
              className="h-full w-full object-cover object-top"
            />
          </div>
        </div>
      </div>
    </Section>
  );
}

const FAQ = [
  {
    q: "What kinds of courses can I import?",
    a: "Any .zip. MIT OpenCourseWare exports get special treatment (units, sessions, lecture notes, problem sets with solutions, in-class questions). Everything else, like Udemy-style downloads or a folder of videos and PDFs, is organized by its folders and file names.",
  },
  {
    q: "Do I need an account?",
    a: "No. Reading, progress tracking and your whole library work without one. An account is optional and only needed if you want your courses and progress saved and synced across devices.",
  },
  {
    q: "Where are my files stored?",
    a: "In your browser's own storage (IndexedDB) on your device. If you sign in and save a course, its files are uploaded to your account so you can open it elsewhere.",
  },
  {
    q: "Is it free?",
    a: "Yes. CourseBox is free and open source under the MIT license. Free accounts can keep up to 2 courses saved at a time.",
  },
  {
    q: "Which courses am I allowed to use?",
    a: "Only import material you have the right to use. MIT OpenCourseWare, for example, is published under a Creative Commons license for personal, non-commercial learning.",
  },
  {
    q: "When are AI recaps, notes and quizzes coming?",
    a: "They're next on the roadmap. Star or watch the GitHub repo to follow along, and open an issue if there's something you'd love to see.",
  },
];

export function Faq() {
  return (
    <Section id="faq">
      <SectionHeading eyebrow="FAQ" title="Questions, answered" />
      <div className="mx-auto max-w-3xl divide-y divide-border rounded-2xl border border-border bg-surface shadow-card">
        {FAQ.map((f) => (
          <details key={f.q} className="group px-6 [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 font-semibold">
              {f.q}
              <ChevronDown className="size-5 shrink-0 text-subtle transition-transform group-open:rotate-180" />
            </summary>
            <p className="-mt-1 pb-5 text-muted text-pretty">{f.a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}

export function FinalCta() {
  return (
    <section className="px-4 pb-20 sm:px-6 sm:pb-28">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-[#16171d] dark:border dark:border-border px-6 py-16 text-center text-white sm:px-12 sm:py-20">
        <div aria-hidden className="landing-cta-glow pointer-events-none absolute inset-0" />
        <div className="relative">
          <Sparkles className="mx-auto size-8 text-[#a5b4fc]" />
          <h2 className="mx-auto mt-5 max-w-2xl text-3xl font-bold tracking-tight text-balance sm:text-5xl">
            That course you downloaded deserves to be finished.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg text-white/70">Give it structure, track your progress and actually get through it.</p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <LibraryLink size="lg" className="w-full bg-white text-[#16171d] hover:bg-white/90 sm:w-auto" />
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-white/20 px-6 text-[15px] font-medium text-white transition-colors hover:bg-white/10 sm:w-auto"
            >
              <GithubIcon className="size-4.5" /> Star on GitHub
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-border px-4 py-10 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 sm:flex-row sm:justify-between">
        <div className="flex flex-col items-center gap-2 sm:items-start">
          <Logo />
          <p className="text-sm text-subtle">Your personal learning library for downloaded courses.</p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted">
          <Link href="/library" className="hover:text-foreground">
            Library
          </Link>
          <a href="#features" className="hover:text-foreground">
            Features
          </a>
          <a href="#roadmap" className="hover:text-foreground">
            Roadmap
          </a>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
            GitHub <ArrowRight className="size-3.5 -rotate-45" />
          </a>
          <span className="text-subtle">MIT License</span>
        </nav>
      </div>
    </footer>
  );
}
