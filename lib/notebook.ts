/** Jupyter notebook parsing: nbformat 4, plus the older nbformat 3 shape. */
export type Multi = string | string[];
export type Output = {
  output_type: "stream" | "execute_result" | "display_data" | "error" | "pyout" | "pyerr";
  name?: string;
  text?: Multi;
  data?: Record<string, Multi | object>;
  execution_count?: number | null;
  ename?: string;
  evalue?: string;
  traceback?: string[];
};
export type Cell = { cell_type: "markdown" | "code" | "raw"; source: Multi; execution_count?: number | null; outputs?: Output[] };
export type Notebook = { cells: Cell[]; lang?: string };

export const join = (s?: Multi | object) => (Array.isArray(s) ? s.join("") : typeof s === "string" ? s : s ? JSON.stringify(s, null, 2) : "");

/** nbformat 4, plus the older nbformat 3 (worksheets / input / prompt_number) shape. */
export function parseNotebook(text: string): Notebook | null {
  let nb: Record<string, unknown>;
  try {
    nb = JSON.parse(text);
  } catch {
    return null;
  }
  const meta = (nb.metadata ?? {}) as { language_info?: { name?: string }; kernelspec?: { language?: string } };
  const lang = (meta.language_info?.name ?? meta.kernelspec?.language ?? "python").toLowerCase();
  if (Array.isArray(nb.cells)) return { cells: nb.cells as Cell[], lang };
  const ws = (nb.worksheets as { cells?: Record<string, unknown>[] }[] | undefined)?.[0]?.cells;
  if (!Array.isArray(ws)) return null;
  return {
    lang,
    cells: ws.map((c) => {
      const type = c.cell_type === "code" ? "code" : c.cell_type === "markdown" || c.cell_type === "heading" ? "markdown" : "raw";
      const src = join(c.input as Multi) || join(c.source as Multi);
      return {
        cell_type: type,
        source: c.cell_type === "heading" ? `${"#".repeat(Number(c.level) || 1)} ${src}` : src,
        execution_count: (c.prompt_number as number) ?? null,
        outputs: ((c.outputs as Record<string, unknown>[]) ?? []).map((o) => {
          const data: Record<string, Multi> = {};
          for (const [k, mime] of [["png", "image/png"], ["jpeg", "image/jpeg"], ["svg", "image/svg+xml"], ["html", "text/html"], ["latex", "text/latex"], ["text", "text/plain"]])
            if (o[k] !== undefined) data[mime] = o[k] as Multi;
          return {
            output_type: o.output_type === "pyerr" ? "error" : o.output_type === "stream" ? "stream" : "display_data",
            name: o.stream as string,
            text: o.text as Multi,
            data,
            ename: o.ename as string,
            evalue: o.evalue as string,
            traceback: o.traceback as string[],
          } as Output;
        }),
      } as Cell;
    }),
  };
}

