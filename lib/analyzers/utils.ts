import type { LessonType } from "./types";

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** Natural sort: "Lecture 2" < "Lecture 10". */
export const naturalCompare = (a: string, b: string) => collator.compare(a, b);

/** Short, deterministic id (FNV-1a) so lesson ids survive re-analysis. */
export function stableId(input: string, prefix = "l"): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${prefix}${(h >>> 0).toString(36)}`;
}

export const basename = (p: string) => p.split("/").pop() ?? p;
export const extname = (p: string) => {
  const b = basename(p);
  const i = b.lastIndexOf(".");
  return i > 0 ? b.slice(i + 1).toLowerCase() : "";
};
export const dirname = (p: string) => {
  const i = p.lastIndexOf("/");
  return i === -1 ? "" : p.slice(0, i);
};

const TYPE_BY_EXT: Record<string, LessonType> = {
  pdf: "pdf",
  mp4: "video", webm: "video", mov: "video", m4v: "video", mkv: "video", ogv: "video", avi: "video",
  mp3: "audio", wav: "audio", m4a: "audio", ogg: "audio", flac: "audio", aac: "audio", opus: "audio",
  png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image", svg: "image", bmp: "image", avif: "image",
  html: "html", htm: "html",
  md: "markdown", markdown: "markdown",
  txt: "text", csv: "text", tsv: "text", json: "text", xml: "text", srt: "text", vtt: "text",
  py: "text", js: "text", ts: "text", tsx: "text", jsx: "text", java: "text", c: "text", h: "text",
  cpp: "text", hpp: "text", cs: "text", go: "text", rs: "text", rb: "text", php: "text", sh: "text",
  m: "text", r: "text", jl: "text", tex: "text", sql: "text", yaml: "text", yml: "text", toml: "text",
  ipynb: "text", css: "text", scala: "text", kt: "text", swift: "text", lua: "text", hs: "text",
};

export function fileType(path: string): LessonType {
  return TYPE_BY_EXT[extname(path)] ?? "other";
}

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", m4v: "video/mp4", ogv: "video/ogg", mkv: "video/x-matroska",
  mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", ogg: "audio/ogg", flac: "audio/flac", aac: "audio/aac", opus: "audio/opus",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", bmp: "image/bmp", avif: "image/avif",
  html: "text/html", htm: "text/html", md: "text/markdown", txt: "text/plain", csv: "text/csv", json: "application/json",
  vtt: "text/vtt", srt: "text/plain", zip: "application/zip",
};

export function mimeType(path: string): string {
  return MIME_BY_EXT[extname(path)] ?? "application/octet-stream";
}

const JUNK_DIRS = new Set(["__MACOSX", "node_modules", "__pycache__", ".ipynb_checkpoints", "venv", ".venv", ".git", ".svn", ".idea", ".vscode"]);

/** Junk that never belongs in a course (OS metadata, hidden files, tooling folders). */
export function isJunk(path: string): boolean {
  const parts = path.split("/");
  if (parts.some((p) => JUNK_DIRS.has(p) || (p.startsWith(".") && p.length > 1))) return true;
  const b = parts[parts.length - 1].toLowerCase();
  return b === "thumbs.db" || b === "desktop.ini" || b === "" || b.endsWith(".pyc") || b.endsWith(".url") || b.endsWith(".lnk");
}

/** Build/site assets: never lessons when the course is a website export. */
export const ASSET_EXT = new Set(["css", "js", "mjs", "cjs", "map", "woff", "woff2", "ttf", "eot", "otf", "ico"]);

/** Files worth surfacing to a learner if no analyzer placed them. */
const CONTENT_EXT = new Set([
  "pdf", "mp4", "webm", "mov", "m4v", "mkv", "avi", "ogv", "mp3", "wav", "m4a", "ogg", "flac", "aac", "opus",
  "md", "markdown", "txt", "html", "htm", "ipynb", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "odt", "odp", "ods",
  "key", "pages", "numbers", "rtf", "epub", "tex", "csv", "tsv", "zip", "tar", "gz", "tgz", "7z", "rar",
  "py", "r", "m", "jl", "java", "c", "cpp", "h", "hpp", "cs", "go", "rs", "rb", "scala", "sql", "sh", "nb", "mat", "rmd",
  "png", "jpg", "jpeg", "gif", "webp", "svg",
]);

export function isContentFile(path: string): boolean {
  return CONTENT_EXT.has(extname(path));
}

/** "01 - intro_video.mp4" -> { title: "Intro Video", num: 1 } */
export function cleanTitle(name: string): { title: string; num?: number } {
  let base = name.replace(/\.[^.\/]+$/, "");
  let num: number | undefined;
  const m = base.match(/^\s*(\d+(?:\.\d+)?)\s*(?:[-_.):\]]+\s*|\s+)(?=\S)/);
  if (m) {
    num = parseFloat(m[1]);
    base = base.slice(m[0].length);
  }
  const words = base
    .replace(/[_]+/g, " ")
    .replace(/\s+[-–—|]+\s+/g, " · ")
    .replace(/(?<=[A-Za-z])-|-(?=[A-Za-z])/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const title = words
    .split(" ")
    .map((w) => (w === w.toLowerCase() && /^[a-z]/.test(w) ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
  return { title: title || name, num };
}

/**
 * OCW stores some lists as Python repr strings ("['Graduate']").
 * Accepts arrays, JSON strings, or Python-ish strings and always returns an array.
 */
export function parseLenientList<T = unknown>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value !== "string") return [];
  const s = value.trim();
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [v];
  } catch {
    /* fall through */
  }
  try {
    const json = s
      .replace(/\bNone\b/g, "null")
      .replace(/\bTrue\b/g, "true")
      .replace(/\bFalse\b/g, "false")
      // single-quoted python strings -> JSON strings
      .replace(/'((?:[^'\\]|\\.)*)'/g, (_m, inner: string) => JSON.stringify(inner.replace(/\\'/g, "'")));
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [v];
  } catch {
    return s.startsWith("[") ? [] : [s as unknown as T];
  }
}

export function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&rsquo;|&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
