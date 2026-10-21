"use client";
import { indentWithTab } from "@codemirror/commands";
import { LanguageDescription } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { Compartment, EditorState, Prec } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView, keymap } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { useTheme } from "next-themes";
import { useEffect, useRef } from "react";

/**
 * CodeMirror 6. Language support is matched from the file name and loaded on demand. Ctrl/Cmd+S calls `onSave`
 * (the caller autosaves anyway) instead of the browser's "save page".
 */
export default function CodeEditor({
  value,
  filename,
  onChange,
  onSave,
  onRun,
  autoFocus,
  minimal,
}: {
  value: string;
  filename: string;
  onChange: (v: string) => void;
  onSave?: () => void;
  /** Shift+Enter, like Jupyter. */
  onRun?: () => void;
  autoFocus?: boolean;
  /** No line numbers or gutter (notebook cells). */
  minimal?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const cbs = useRef({ onChange, onSave, onRun });
  cbs.current = { onChange, onSave, onRun };
  const { resolvedTheme } = useTheme();
  const theme = useRef(new Compartment());
  const lang = useRef(new Compartment());

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          // Above basicSetup's bindings, so Shift+Enter runs instead of inserting a line.
          Prec.highest(
            keymap.of([
              { key: "Mod-s", preventDefault: true, run: () => (cbs.current.onSave?.(), true) },
              { key: "Shift-Enter", run: () => (cbs.current.onRun ? (cbs.current.onRun(), true) : false) },
            ]),
          ),
          keymap.of([indentWithTab]),
          EditorView.updateListener.of((u) => u.docChanged && cbs.current.onChange(u.state.doc.toString())),
          theme.current.of(resolvedTheme === "dark" ? oneDark : []),
          lang.current.of([]),
          EditorView.theme({
            "&": { height: minimal ? "auto" : "100%", fontSize: "13px", backgroundColor: "transparent" },
            ".cm-scroller": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", lineHeight: "1.6" },
            ".cm-gutters": minimal ? { display: "none" } : {},
          }),
        ],
      }),
    });
    view.current = v;
    if (autoFocus) v.focus();
    const desc = LanguageDescription.matchFilename(languages, filename);
    desc?.load().then((support) => v.dispatch({ effects: lang.current.reconfigure(support) }));
    return () => v.destroy();
    // The editor owns its document after mount; `value` only seeds it.
  }, [filename]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    view.current?.dispatch({ effects: theme.current.reconfigure(resolvedTheme === "dark" ? oneDark : []) });
  }, [resolvedTheme]);

  return <div ref={host} className={minimal ? "" : "h-full"} />;
}
