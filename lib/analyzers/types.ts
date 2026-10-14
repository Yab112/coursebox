export type LessonType =
  | "pdf"
  | "video"
  | "audio"
  | "image"
  | "html"
  | "markdown"
  | "text"
  | "other";

export type Lesson = {
  id: string;
  title: string;
  order: number;
  type: LessonType;
  /** Path of the file inside the course (also the stable key used for progress). */
  path: string;
  meta?: Record<string, unknown>;
};

export type Section = { id: string; title: string; order: number; lessons: Lesson[] };

export type CourseManifest = {
  id: string;
  title: string;
  instructor?: string;
  description?: string;
  /** Sanitize before rendering. */
  descriptionHtml?: string;
  coverPath?: string;
  level?: string;
  term?: string;
  courseNumber?: string;
  /** Stable identity used to detect re-uploads of the same course. */
  sourceKey?: string;
  source: string;
  sections: Section[];
  extraPages?: { title: string; html: string }[];
};

export type ReadText = (path: string) => Promise<string>;

export type AnalyzeContext = {
  /** Name of the uploaded archive without extension. */
  archiveName?: string;
  courseId: string;
};

export interface Analyzer {
  name: string;
  detect(files: string[], read: ReadText): Promise<boolean>;
  analyze(files: string[], read: ReadText, ctx: AnalyzeContext): Promise<CourseManifest>;
}
