/**
 * Turns ANSI-coloured terminal text (Jupyter tracebacks) into styled segments. Only SGR colour/bold codes
 * are understood; everything else is dropped.
 */
export type AnsiSegment = { text: string; fg?: string; bold?: boolean };

const COLORS = ["#6e7781", "#cf222e", "#116329", "#9a6700", "#0550ae", "#8250df", "#1b7c83", "#6e7781"];
const BRIGHT = ["#57606a", "#ff8182", "#1a7f37", "#bf8700", "#218bff", "#a475f9", "#3192aa", "#8c959f"];

export function parseAnsi(input: string): AnsiSegment[] {
  const out: AnsiSegment[] = [];
  let fg: string | undefined;
  let bold = false;
  const re = /\x1b\[([\d;]*)m/g;
  let last = 0;
  for (let m = re.exec(input); m; m = re.exec(input)) {
    if (m.index > last) out.push({ text: input.slice(last, m.index), fg, bold });
    last = re.lastIndex;
    const codes = (m[1] || "0").split(";").map(Number);
    for (let i = 0; i < codes.length; i++) {
      const c = codes[i];
      if (c === 0) [fg, bold] = [undefined, false];
      else if (c === 1) bold = true;
      else if (c === 22) bold = false;
      else if (c >= 30 && c <= 37) fg = COLORS[c - 30];
      else if (c >= 90 && c <= 97) fg = BRIGHT[c - 90];
      else if (c === 39) fg = undefined;
      else if (c === 38 && codes[i + 1] === 5) i += 2; // 256-colour: skip
      else if (c === 38 && codes[i + 1] === 2) i += 4; // truecolour: skip
    }
  }
  if (last < input.length) out.push({ text: input.slice(last), fg, bold });
  // Strip any other escape sequences that slipped through.
  return out.map((s) => ({ ...s, text: s.text.replace(/\x1b\[[\d;?]*[A-Za-z]/g, "") })).filter((s) => s.text);
}
