import Link from "next/link";
import { featuresBy, STATUS_LABEL } from "@/lib/features";
import { UploadButton } from "./importer";
import { GITHUB_URL, Marker, Section } from "./primitives";
import { LibraryLink } from "./site-nav";

export function Syllabus() {
  return (
    <Section
      id="syllabus"
      mark="01"
      label="Syllabus"
      title={
        <>
          A pile of files goes in. <em className="text-ink-2">A course comes out.</em>
        </>
      }
    >
      <ol className="border-t border-ink">
        {featuresBy("live").filter((f) => f.landing !== false).map((f, i) => (
          <li key={f.id} className="grid gap-2 border-b border-rule py-6 sm:grid-cols-[5rem_1fr_1.4fr] sm:gap-6 sm:py-8">
            <span className="font-display text-4xl leading-none text-ink-3 tabular-nums">{String(i + 1).padStart(2, "0")}</span>
            <h3 className="text-lg font-semibold leading-snug">{f.title}</h3>
            <p className="leading-relaxed text-ink-2">{f.description}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

const STEPS = [
  {
    n: "i.",
    title: "Get the zip",
    body: (
      <>
        On{" "}
        <a href="https://ocw.mit.edu" target="_blank" rel="noreferrer" className="landing-link">
          ocw.mit.edu
        </a>{" "}
        open any course and choose <em>Download course</em>. Any other zip of course files works too.
      </>
    ),
  },
  { n: "ii.", title: "Drop it here", body: <>It&apos;s unzipped and sorted inside your browser, usually in under a minute. Nothing is uploaded.</> },
  { n: "iii.", title: "Study", body: <>Work through it lesson by lesson. Progress, last page and study time are saved as you go.</> },
];

export function Steps() {
  return (
    <section className="border-t border-rule bg-panel px-4 py-14 sm:px-6">
      <ol className="mx-auto grid max-w-6xl divide-y divide-rule md:grid-cols-3 md:divide-x md:divide-y-0">
        {STEPS.map((s) => (
          <li key={s.n} className="py-6 md:px-8 md:py-0 md:first:pl-0 md:last:pr-0">
            <p className="font-display text-3xl italic text-ink-3">{s.n}</p>
            <h3 className="mt-2 text-lg font-semibold">{s.title}</h3>
            <p className="mt-2 leading-relaxed text-ink-2">{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

const PRIVACY = [
  ["Where files live", "In your browser's own storage (IndexedDB), on this device."],
  ["What gets uploaded", "Nothing, unless you sign in and choose to save a course to your account."],
  ["What an account adds", "Up to 2 saved courses and your progress, on any device you sign in from."],
  ["What we track", "Nothing. There are no analytics in CourseBox."],
];

export function LocalFirst() {
  return (
    <Section mark="03" label="Your files">
      <p className="max-w-4xl font-display text-4xl leading-[1.1] text-balance sm:text-6xl">
        Your courses stay on your computer. <Marker>Nothing leaves your browser</Marker> unless you ask it to.
      </p>
      <dl className="mt-12 grid border-t border-ink sm:grid-cols-2">
        {PRIVACY.map(([k, v]) => (
          <div key={k} className="border-b border-rule py-5 sm:odd:pr-8 sm:even:border-l sm:even:pl-8">
            <dt className="font-code text-[11px] tracking-wide text-ink-3 uppercase">{k}</dt>
            <dd className="mt-1.5 text-[17px] leading-relaxed">{v}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

export function NextTerm() {
  return (
    <Section
      id="next-term"
      mark="04"
      label="Next term"
      title={
        <>
          Today it organizes your courses. <em className="text-ink-2">Next, it helps you learn them.</em>
        </>
      }
    >
      <table className="w-full border-t border-ink text-left">
        <thead className="sr-only">
          <tr>
            <th>Feature</th>
            <th>What it does</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {[...featuresBy("building"), ...featuresBy("soon")].map((f) => (
            <tr key={f.id} className="grid border-b border-rule py-5 sm:table-row sm:py-0">
              <td className="align-top font-semibold sm:w-[30%] sm:py-6 sm:pr-6">{f.title}</td>
              <td className="mt-1 align-top leading-relaxed text-ink-2 sm:mt-0 sm:py-6 sm:pr-6">{f.description}</td>
              <td
                className={`mt-3 align-top font-code text-[11px] tracking-wide whitespace-nowrap uppercase sm:mt-0 sm:w-28 sm:py-7 sm:text-right ${f.status === "building" ? "text-ink" : "text-ink-3"}`}
              >
                {f.status === "building" && <span className="landing-marker">{STATUS_LABEL[f.status]}</span>}
                {f.status !== "building" && STATUS_LABEL[f.status]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-8 text-ink-2">
        Something missing?{" "}
        <a href={`${GITHUB_URL}/issues`} target="_blank" rel="noreferrer" className="landing-link">
          Suggest it on GitHub
        </a>
        .
      </p>
    </Section>
  );
}

const FAQ = [
  {
    q: "What can I import?",
    a: "Any .zip. MIT OpenCourseWare downloads get the most help: units, sessions, notes attached to lectures, problem sets paired with solutions, and in-class questions. Udemy-style downloads and plain folders are sorted by their folder and file names.",
  },
  {
    q: "Do I need an account?",
    a: "No. Importing, reading, progress and the whole library work without one. Sign up only if you want courses and progress on more than one device.",
  },
  {
    q: "Does it cost anything?",
    a: "No. CourseBox is free and open source under the MIT license. Free accounts can keep 2 courses saved at a time.",
  },
  {
    q: "Which courses may I use?",
    a: "Only material you have the right to use. MIT OpenCourseWare, for example, is published under a Creative Commons license for personal, non-commercial study.",
  },
  {
    q: "What if it sorts my course wrong?",
    a: "Nothing is dropped: unrecognized files go to Additional Materials, and the All files tab shows where everything went. Open an issue with the folder layout so the analyzer can learn it.",
  },
  {
    q: "When do recaps, notes and quizzes arrive?",
    a: "They're the next things being built. Watch the GitHub repository to follow along.",
  },
];

export function OfficeHours() {
  return (
    <Section id="office-hours" mark="05" label="Office hours" title="Questions people ask.">
      <dl className="grid gap-x-12 border-t border-ink md:grid-cols-2">
        {FAQ.map((f) => (
          <div key={f.q} className="border-b border-rule py-6">
            <dt className="font-display text-2xl leading-snug">{f.q}</dt>
            <dd className="mt-2 leading-relaxed text-ink-2">{f.a}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

export function Closing() {
  return (
    <section className="border-t border-ink px-4 py-20 sm:px-6 sm:py-32">
      <div className="mx-auto max-w-6xl text-center">
        <p className="font-code text-xs tracking-wide text-ink-3 uppercase">End of syllabus</p>
        <h2 className="mx-auto mt-6 max-w-4xl font-display text-6xl leading-none text-balance sm:text-8xl">
          Class is <em>in session.</em>
        </h2>
        <p className="mx-auto mt-6 max-w-md text-lg text-ink-2">Pick the course you&apos;ve been meaning to finish and drop it on this page.</p>
        <div className="mt-10 flex flex-col items-center justify-center gap-5 sm:flex-row sm:gap-8">
          <UploadButton />
          <LibraryLink />
        </div>
      </div>
    </section>
  );
}

export function Colophon() {
  return (
    <footer className="border-t border-rule px-4 py-8 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 text-[13px] text-ink-3 sm:flex-row sm:items-center sm:justify-between">
        <p>
          <span className="font-display text-lg text-ink">CourseBox</span>
          <span className="mx-2">·</span>
          Set in Instrument Serif, Inter and JetBrains Mono. MIT License.
        </p>
        <nav aria-label="Footer" className="flex gap-6">
          <Link href="/library" className="hover:text-ink">
            Library
          </Link>
          <Link href="/status" className="hover:text-ink">
            Status
          </Link>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="hover:text-ink">
            GitHub ↗
          </a>
        </nav>
      </div>
    </footer>
  );
}
