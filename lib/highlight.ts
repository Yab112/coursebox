import type { HighlighterGeneric } from "shiki";

/**
 * VS Code-quality syntax highlighting (Shiki). Loaded on first use, and each language's grammar is fetched
 * only when a file in that language is opened, so none of this weighs on the rest of the app.
 */
let highlighter: Promise<HighlighterGeneric<string, string>> | undefined;

/** Beyond this, files are shown without colours so the page stays responsive. */
export const HIGHLIGHT_LIMIT = { chars: 400_000, lines: 12_000 };

export async function highlightToHtml(code: string, lang: string | undefined): Promise<string | null> {
  if (code.length > HIGHLIGHT_LIMIT.chars || code.split("\n", HIGHLIGHT_LIMIT.lines + 1).length > HIGHLIGHT_LIMIT.lines) return null;
  const shiki = await import("shiki");
  highlighter ??= shiki.createHighlighter({ themes: ["github-light", "github-dark"], langs: [] }) as Promise<HighlighterGeneric<string, string>>;
  const h = await highlighter;
  const id = lang && (lang in shiki.bundledLanguages || lang in shiki.bundledLanguagesAlias) ? lang : "text";
  if (id !== "text" && !h.getLoadedLanguages().includes(id)) await h.loadLanguage(id as Parameters<typeof h.loadLanguage>[0]);
  return h.codeToHtml(code, { lang: id, themes: { light: "github-light", dark: "github-dark" }, defaultColor: "light" });
}
