/** SRT / WebVTT parsing. */
export type Cue = { start: number; end: number; text: string };

const toSeconds = (t: string) => {
  const parts = t.replace(",", ".").split(":").map(Number);
  return parts.reduce((acc, p) => acc * 60 + p, 0);
};

/** SRT and WebVTT cues. */
export function parseCues(text: string): Cue[] {
  const cues: Cue[] = [];
  for (const block of text.replace(/\r/g, "").split(/\n{2,}/)) {
    const lines = block.split("\n");
    const i = lines.findIndex((l) => l.includes("-->"));
    if (i < 0) continue;
    const [a, b] = lines[i].split("-->").map((s) => s.trim().split(/\s/)[0]);
    const body = lines
      .slice(i + 1)
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .trim();
    if (body) cues.push({ start: toSeconds(a), end: toSeconds(b), text: body });
  }
  return cues;
}

