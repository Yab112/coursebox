/**
 * Product feature registry. The landing page renders from this list, so shipping a feature
 * means flipping its `status` to "live" (and optionally giving it an `href`).
 */
export type FeatureStatus = "live" | "building" | "beta" | "soon";

export type Feature = {
  id: string;
  title: string;
  description: string;
  status: FeatureStatus;
  /** Where the feature lives in the app, once it exists. */
  href?: string;
  /** When it went live (shown as "Recently shipped" on the status page). */
  shipped?: string;
  /** false keeps a live feature off the landing page's syllabus (e.g. account plumbing). */
  landing?: boolean;
};

export const FEATURES: Feature[] = [
  {
    id: "structure",
    title: "Smart structure detection",
    description:
      "MIT OCW units and sessions, Udemy-style numbered folders or a plain pile of files. CourseBox works out sections, lessons and order for you.",
    status: "live",
  },
  {
    id: "player",
    title: "A real course player",
    description:
      "PDFs that remember your page, videos with speed and captions, Markdown, notebooks, code and HTML, all in one clean viewer.",
    status: "live",
  },
  {
    id: "progress",
    title: "Progress that sticks",
    description:
      "Mark lessons complete, continue where you left off, and see study time counted only while you're actually on the page.",
    status: "live",
  },
  {
    id: "solutions",
    title: "Problem sets with solutions",
    description:
      "Assignments and exams are paired with their solutions, locked behind a reveal button so you try first.",
    status: "live",
  },
  {
    id: "reanalyze",
    title: "Re-import without losing progress",
    description:
      "Drop a newer version of a course or re-run the analyzer. Progress is matched by file, so nothing resets.",
    status: "live",
  },
  {
    id: "sync",
    title: "Optional sync across devices",
    description:
      "Reading never needs an account. Create a free one to save your courses and pick up on any device.",
    status: "live",
  },
  {
    id: "viewers",
    title: "Every file, read properly",
    description:
      "Markdown with math and diagrams, Jupyter notebooks with their outputs, highlighted code in 200 languages, CSV tables, JSON trees and subtitle transcripts.",
    status: "live",
    shipped: "2026-10-21",
  },
  {
    id: "password-reset",
    title: "Password reset by email",
    description: "Forgot your password? Get a 6-digit code by email and you're back in, with other devices signed out.",
    status: "live",
    shipped: "2026-10-21",
    landing: false,
  },
  {
    id: "editor",
    title: "Edit code and run Python",
    description: "Edit your own copy of any code file, and run Python files and notebook cells right in your browser.",
    status: "building",
  },
  {
    id: "catalog",
    title: "Course catalog",
    description: "Browse ready-to-study open courses and add them to your library in one click, no zip needed.",
    status: "soon",
  },
  {
    id: "recap",
    title: "AI lesson recaps",
    description: "A short recap of every lecture and PDF, so you can review a whole unit in minutes before an exam.",
    status: "soon",
  },
  {
    id: "notes",
    title: "Short note generation",
    description: "Turn long lecture notes into concise, structured study notes you can edit and export to Markdown.",
    status: "soon",
  },
  {
    id: "quiz",
    title: "Quizzes from your material",
    description: "Practice questions generated from the lessons you studied, with instant feedback and spaced review.",
    status: "soon",
  },
  {
    id: "byo-storage",
    title: "Bring your own storage",
    description: "Keep your saved courses in your own S3, Cloudflare R2 or Backblaze bucket, with no course limit.",
    status: "soon",
  },
  {
    id: "highlights",
    title: "Notes & highlights",
    description: "Pin notes to a PDF page or video timestamp and keep every highlight searchable in one place.",
    status: "soon",
  },
];

export const featuresBy = (status: FeatureStatus) => FEATURES.filter((f) => f.status === status);

export const STATUS_LABEL: Record<FeatureStatus, string> = { live: "Shipped", building: "In progress", beta: "Beta", soon: "Planned" };
