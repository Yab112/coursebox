import { FileAudio, FileCode, FileImage, FileQuestion, FileText, FileType2, Globe, PlayCircle } from "lucide-react";
import type { LessonType } from "@/lib/analyzers/types";
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
