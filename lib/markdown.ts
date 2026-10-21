import GithubSlugger from "github-slugger";

export type Heading = { depth: number; text: string; id: string };

/** h2/h3 headings (outside code fences) with the same ids rehype-slug gives them. */
export function headingsOf(md: string): Heading[] {
  const slugger = new GithubSlugger();
  const out: Heading[] = [];
  let fence = false;
  for (const line of md.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    if (fence) continue;
    const m = line.match(/^(#{1,3})\s+(.+?)\s*#*\s*$/);
    if (!m) continue;
    const text = m[2].replace(/[*_`]|\[([^\]]+)\]\([^)]*\)/g, "$1");
    const id = slugger.slug(text);
    if (m[1].length > 1) out.push({ depth: m[1].length, text, id });
  }
  return out;
}

/** `$$ … $$` alone on one line becomes a display equation (remark-math wants the $$ on their own lines). */
export function normalizeMath(md: string) {
  let fence = false;
  return md
    .split("\n")
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) fence = !fence;
      if (fence) return line;
      const m = line.match(/^(\s*)\$\$(.+?)\$\$\s*$/);
      return m ? `${m[1]}\n$$\n${m[2].trim()}\n$$\n` : line;
    })
    .join("\n");
}

