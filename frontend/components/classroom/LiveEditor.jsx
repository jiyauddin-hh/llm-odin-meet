"use client";

import dynamic from "next/dynamic";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Spinner } from "@/components/ui";
import { QC_THEME, defineQcTheme } from "@/lib/monacoTheme";

const Monaco = dynamic(() => import("@monaco-editor/react"), { ssr: false, loading: () => <Spinner label="Loading editor…" /> });

const MONACO_LANG = { python: "python", javascript: "javascript", cpp: "cpp", java: "java", go: "go" };

/**
 * Monaco wrapper for the classroom. Local typing is reported as Monaco change
 * deltas through onEdit; remote deltas are applied straight to the model with
 * a guard so they don't echo back. The pen holder's caret and selection are
 * drawn for viewers as decorations.
 */
const LiveEditor = forwardRef(function LiveEditor({ language, readOnly, onEdit, onCursor, remoteLabel, fontSize = 14 }, ref) {
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const applying = useRef(false);
  const pending = useRef(null);
  const decorations = useRef(null);
  const cursorTimer = useRef(null);
  const readOnlyRef = useRef(readOnly);
  const onEditRef = useRef(onEdit);
  const onCursorRef = useRef(onCursor);
  const onMountRef = useRef(null);
  readOnlyRef.current = readOnly;
  onEditRef.current = onEdit;
  onCursorRef.current = onCursor;

  useEffect(() => {
    editorRef.current?.updateOptions({ readOnly, domReadOnly: readOnly });
  }, [readOnly]);

  useEffect(() => {
    editorRef.current?.updateOptions({ fontSize });
  }, [fontSize]);

  useEffect(() => () => clearTimeout(cursorTimer.current), []);

  const withModel = (fn) => {
    const ed = editorRef.current;
    const model = ed?.getModel();
    if (!ed || !model) return null;
    applying.current = true;
    try {
      return fn(model, ed);
    } finally {
      applying.current = false;
    }
  };

  useImperativeHandle(ref, () => ({
    setContent(text) {
      if (!editorRef.current) {
        pending.current = text;
        return;
      }
      withModel((model) => {
        if (model.getValue() === text) return;
        model.applyEdits([{ range: model.getFullModelRange(), text }]);
      });
    },
    /** Applies remote deltas and returns the resulting length (null if not mounted). */
    applyEdits(changes) {
      return withModel((model) => {
        model.applyEdits(changes.map((c) => ({ range: c.range, text: c.text })));
        return model.getValueLength();
      });
    },
    getValue() {
      return editorRef.current?.getModel()?.getValue() ?? pending.current ?? "";
    },
    isMounted() {
      return !!editorRef.current;
    },
    focus() {
      editorRef.current?.focus();
    },
    showCursor(cursor) {
      const ed = editorRef.current;
      const monaco = monacoRef.current;
      const model = ed?.getModel();
      if (!ed || !monaco || !model) return;
      if (!cursor) {
        decorations.current?.clear();
        return;
      }
      const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
      const line = clamp(cursor.lineNumber || 1, 1, model.getLineCount());
      const col = clamp(cursor.column || 1, 1, model.getLineMaxColumn(line));
      const decs = [
        {
          range: new monaco.Range(line, 1, line, 1),
          options: { isWholeLine: true, className: "qc-remote-line" },
        },
        {
          range: new monaco.Range(line, col, line, col),
          options: {
            beforeContentClassName: "qc-remote-caret",
            afterContentClassName: "qc-remote-caret-label",
            stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
          },
        },
      ];
      const s = cursor.selection;
      if (s && (s.startLineNumber !== s.endLineNumber || s.startColumn !== s.endColumn)) {
        decs.push({
          range: new monaco.Range(s.startLineNumber, s.startColumn, s.endLineNumber, s.endColumn),
          options: { className: "qc-remote-selection" },
        });
      }
      decorations.current ??= ed.createDecorationsCollection();
      decorations.current.set(decs);
      ed.revealLineInCenterIfOutsideViewport(line);
    },
  }));

  onMountRef.current = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    const model = editor.getModel();
    model?.setEOL(monaco.editor.EndOfLineSequence.LF);
    editor.updateOptions({ readOnly: readOnlyRef.current, domReadOnly: readOnlyRef.current });
    if (pending.current != null) {
      const text = pending.current;
      pending.current = null;
      withModel((m) => m.applyEdits([{ range: m.getFullModelRange(), text }]));
    }
    editor.onDidChangeCursorSelection((e) => {
      if (readOnlyRef.current || applying.current) return;
      clearTimeout(cursorTimer.current);
      cursorTimer.current = setTimeout(() => {
        const sel = e.selection;
        onCursorRef.current?.({
          lineNumber: sel.positionLineNumber,
          column: sel.positionColumn,
          selection: sel.isEmpty()
            ? null
            : { startLineNumber: sel.startLineNumber, startColumn: sel.startColumn, endLineNumber: sel.endLineNumber, endColumn: sel.endColumn },
        });
      }, 40);
    });
  };

  const handleChange = (value, ev) => {
    if (applying.current || readOnlyRef.current) return;
    if (!ev?.changes?.length) return;
    onEditRef.current?.(
      ev.changes.map((c) => ({
        range: {
          startLineNumber: c.range.startLineNumber,
          startColumn: c.range.startColumn,
          endLineNumber: c.range.endLineNumber,
          endColumn: c.range.endColumn,
        },
        rangeOffset: c.rangeOffset,
        rangeLength: c.rangeLength,
        text: c.text,
      })),
      value ?? "",
    );
  };

  // The label shown next to the remote caret is set through CSS so Monaco
  // can keep its decoration DOM minimal.
  const label = (remoteLabel || "").replace(/["\\]/g, "");

  return (
    <>
      <style>{`.qc-remote-caret-label::after{content:"${label}";}`}</style>
      <Monaco
        theme={QC_THEME}
        beforeMount={defineQcTheme}
        language={MONACO_LANG[language] || "plaintext"}
        defaultValue=""
        onMount={(e, m) => onMountRef.current(e, m)}
        onChange={handleChange}
        options={{
          fontSize,
          fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace",
          fontLigatures: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 4,
          padding: { top: 14, bottom: 14 },
          lineNumbersMinChars: 3,
          guides: { indentation: true, bracketPairs: false },
          bracketPairColorization: { enabled: true },
          smoothScrolling: true,
          cursorBlinking: "smooth",
          renderLineHighlight: "gutter",
          readOnly,
          domReadOnly: readOnly,
          readOnlyMessage: { value: "Only the person holding the pen can type" },
        }}
      />
    </>
  );
});

export default LiveEditor;
