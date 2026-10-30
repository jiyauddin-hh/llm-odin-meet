// Monaco theme in the site's palette (ink surfaces, brand violet, accent cyan),
// so the editor doesn't sit as a grey VS Code box inside the dark UI.
export const QC_THEME = "qc-night";

export function defineQcTheme(monaco) {
  monaco.editor.defineTheme(QC_THEME, {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "64748b", fontStyle: "italic" },
      { token: "keyword", foreground: "c4b5fd" },
      { token: "string", foreground: "86efac" },
      { token: "number", foreground: "fcd34d" },
      { token: "type", foreground: "67e8f9" },
      { token: "type.identifier", foreground: "67e8f9" },
      { token: "delimiter", foreground: "94a3b8" },
    ],
    colors: {
      "editor.background": "#0b0d17",
      "editor.foreground": "#e2e8f0",
      "editorGutter.background": "#0b0d17",
      "editorLineNumber.foreground": "#3b4560",
      "editorLineNumber.activeForeground": "#cbd5e1",
      "editor.lineHighlightBackground": "#141827",
      "editor.lineHighlightBorder": "#00000000",
      "editor.selectionBackground": "#8b5cf64d",
      "editor.inactiveSelectionBackground": "#8b5cf626",
      "editorCursor.foreground": "#a78bfa",
      "editorIndentGuide.background1": "#1b2032",
      "editorIndentGuide.activeBackground1": "#313a52",
      "editorBracketMatch.background": "#8b5cf626",
      "editorBracketMatch.border": "#8b5cf680",
      "editorWidget.background": "#11141f",
      "editorWidget.border": "#232a3d",
      "editorSuggestWidget.background": "#11141f",
      "editorSuggestWidget.selectedBackground": "#232a3d",
      "scrollbarSlider.background": "#313a5266",
      "scrollbarSlider.hoverBackground": "#4a5572aa",
      "scrollbarSlider.activeBackground": "#4a5572",
    },
  });
}
