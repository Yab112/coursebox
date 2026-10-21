import { Captions, FileAudio, FileCode, FileImage, FileJson, FileQuestion, FileSpreadsheet, FileText, FileType2, Globe, NotebookText, PlayCircle } from "lucide-react";
import type { LessonType } from "@/lib/analyzers/types";
import { detectFile, languageLabel } from "@/lib/filetype";
import { cn } from "@/lib/utils";

const ICONS = {
  pdf: FileText,
  video: PlayCircle,
  audio: FileAudio,
  image: FileImage,
  html: Globe,
  markdown: FileType2,
  text: FileCode,
  other: FileQuestion,
} as const;

export const TYPE_LABEL: Record<LessonType, string> = {
  pdf: "PDF",
  video: "Video",
  audio: "Audio",
  image: "Image",
  html: "Page",
  markdown: "Reading",
  text: "Text",
  other: "File",
};

export function FileIcon({ type, className }: { type: LessonType; className?: string }) {
  const Icon = ICONS[type] ?? FileQuestion;
  return <Icon className={cn("size-4", className)} />;
}

/** A more specific label and icon for text files, from their name ("Notebook", "CSV", "Python"…). */
export function fileKind(path: string, type: LessonType): { label: string; Icon: typeof FileCode } {
  if (type !== "text" && type !== "other") return { label: TYPE_LABEL[type], Icon: ICONS[type] ?? FileQuestion };
  const d = detectFile(path);
  const ext = path.split(".").pop()?.toUpperCase() ?? "";
  switch (d.kind) {
    case "notebook":
      return { label: "Notebook", Icon: NotebookText };
    case "table":
      return { label: ext === "TSV" ? "TSV" : "CSV", Icon: FileSpreadsheet };
    case "json":
      return { label: "JSON", Icon: FileJson };
    case "subtitles":
      return { label: "Subtitles", Icon: Captions };
    case "markdown":
      return { label: "Reading", Icon: FileType2 };
    case "code":
      return { label: languageLabel(d.lang), Icon: FileCode };
    default:
      return { label: type === "text" ? "Text" : "File", Icon: type === "text" ? FileText : FileQuestion };
  }
}

export function KindIcon({ path, type, className }: { path: string; type: LessonType; className?: string }) {
  const { Icon } = fileKind(path, type);
  return <Icon className={cn("size-4", className)} />;
}
