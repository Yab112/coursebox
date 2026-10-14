export type LessonType =
  | "pdf"
  | "video"
  | "audio"
  | "image"
  | "html"
  | "markdown"
  | "text"
  | "other";

/** A secondary file that belongs to a lesson (slides next to a video, code, a handout...). */
export type Attachment = {
  path: string;
  title: string;
  type: LessonType;
};

export type Lesson = {
  id: string;
  title: string;
  order: number;
  type: LessonType;
  /** Path of the main file inside the course (also the stable key used for progress). */
  path: string;
  /** Extra files shown as tabs next to the main file. */
  attachments?: Attachment[];
  /** Shown behind a "Reveal solution" step. */
  solution?: Attachment;
  meta?: Record<string, unknown>;
};

export type Section = {
  id: string;
  title: string;
  order: number;
  /** Optional higher-level heading ("Unit I", "Week 1") rendered above consecutive sections. */
  group?: string;
  description?: string;
  lessons: Lesson[];
};

/** Bump when analyzers change in a way that should re-run on stored courses. */
export const MANIFEST_VERSION = 2;

export type CourseManifest = {
  id: string;
  version?: number;
  title: string;
  instructor?: string;
  description?: string;
  /** Sanitize before rendering. */
  descriptionHtml?: string;
  /** A README-like markdown file rendered on the overview tab. */
  overviewPath?: string;
  coverPath?: string;
  level?: string;
  term?: string;
  courseNumber?: string;
  /** Stable identity used to detect re-uploads of the same course. */
  sourceKey?: string;
  source: string;
  sections: Section[];
  extraPages?: { title: string; html: string }[];
  /** Files placed by the coverage pass (nothing the analyzer recognised). */
  unplacedCount?: number;
};

export type ReadText = (path: string) => Promise<string>;

export type AnalyzeContext = {
  /** Name of the uploaded archive (or its single root folder) without extension. */
  archiveName?: string;
  courseId: string;
};

export interface Analyzer {
  name: string;
  detect(files: string[], read: ReadText): Promise<boolean>;
  analyze(files: string[], read: ReadText, ctx: AnalyzeContext): Promise<CourseManifest>;
  /** Site chrome / build assets that should never surface as course content. */
  isAsset?(path: string): boolean;
}
