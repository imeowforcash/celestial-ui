import React, { useCallback, useRef, useEffect, memo, useMemo } from "react";
import { createPortal } from "react-dom";
import MonacoEditor, { loader, type BeforeMount, type OnMount } from "@monaco-editor/react";
import * as Monaco from "monaco-editor/esm/vs/editor/editor.api";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import "monaco-editor/esm/vs/editor/contrib/suggest/browser/suggestController.js";
import "monaco-editor/esm/vs/editor/contrib/snippet/browser/snippetController2.js";
import "monaco-editor/min/vs/style.css";
import { writeText as clipboardWriteText, readText as clipboardReadText } from "@tauri-apps/plugin-clipboard-manager";
import { CopyIcon, PasteIcon, SplitviewIcon } from "../../assets/Icons";
import { cn } from "@/utils/ui";
import { useKeybindSettings, useUiSettings } from "../../contexts/SettingsContext";
import { toMonacoKeybind } from "../../utils/keybinds";
import {
  CONTEXT_MENU_VIEWPORT_PADDING,
  getContextPos,
} from "./contextMenuPosition";
import styles from "./EditorShared.module.css";

declare global {
  interface Window {
    MonacoEnvironment?: {
      getWorker?: (_workerId: string, _label: string) => Worker;
    };
  }
}

loader.config({ monaco: Monaco });

const existingEnvironment = window.MonacoEnvironment;
if (!existingEnvironment || typeof existingEnvironment.getWorker !== "function") {
  window.MonacoEnvironment = {
    getWorker: () => new EditorWorker(),
  };
}

type LuaDefinitionsModule = typeof import("../../utils/defs");
type validatorModule = typeof import("../../utils/validator");

let defsPromise: Promise<LuaDefinitionsModule> | null = null;
let validatorPromise: Promise<validatorModule> | null = null;
let luaLanguageConfigured = false;
let completionDisposable: Monaco.IDisposable | null = null;
let usageCommandRegistered = false;

const MARKER_OWNER = "celestial-lua-lint";
const COMPLETION_USAGE_COMMAND_ID = "celestial.recordCompletionUsage";
const MIN_LINES_FOR_SCROLLBAR = 50;

const loadDefs = (): Promise<LuaDefinitionsModule> => {
  if (!defsPromise) {
    defsPromise = import("../../utils/defs");
  }
  return defsPromise;
};

const loadValidatorModule = (): Promise<validatorModule> => {
  if (!validatorPromise) {
    validatorPromise = import("../../utils/validator");
  }
  return validatorPromise;
};

const LUA_KEYWORDS = [
  "and", "break", "do", "else", "elseif", "end", "false", "for", "function", "if", "in",
  "local", "nil", "not", "or", "repeat", "return", "then", "true", "until", "while", "continue",
];

interface ThemePalette {
  base: "vs" | "vs-dark";
  comment: string;
  string: string;
  number: string;
  keyword: string;
  variable: string;
  functionColor: string;
  constant: string;
  operator: string;
  punctuation: string;
  cursor: string;
  selection: string;
}

const THEME_PALETTES: Record<string, ThemePalette> = {
  generic: {
    base: "vs-dark",
    comment: "#6a6a6a",
    string: "#a5d6a7",
    number: "#f9a870",
    keyword: "#c792ea",
    variable: "#e0e0e0",
    functionColor: "#82aaff",
    constant: "#82aaff",
    operator: "#89ddff",
    punctuation: "#929292",
    cursor: "#e0e0e0",
    selection: "#ffffff26",
  },
  blindness: {
    base: "vs",
    comment: "#6a737d",
    string: "#22863a",
    number: "#005cc5",
    keyword: "#d73a49",
    variable: "#6f42c1",
    functionColor: "#005cc5",
    constant: "#005cc5",
    operator: "#005cc5",
    punctuation: "#586069",
    cursor: "#1a1a1a",
    selection: "#00000026",
  },
  "dark-grape": {
    base: "vs-dark",
    comment: "#8a5a9e",
    string: "#e5a040",
    number: "#ff6b8a",
    keyword: "#b040e5",
    variable: "#c484e1",
    functionColor: "#eadaf2",
    constant: "#ff6b8a",
    operator: "#e087cb",
    punctuation: "#8a5a9e",
    cursor: "#b040e5",
    selection: "#b440e540",
  },
  "ugly-green": {
    base: "vs-dark",
    comment: "#5cb352",
    string: "#daa520",
    number: "#44daa2",
    keyword: "#95e88c",
    variable: "#44daa2",
    functionColor: "#dbf8da",
    constant: "#44daa2",
    operator: "#44daa2",
    punctuation: "#5cb352",
    cursor: "#44daa2",
    selection: "#44daa240",
  },
  "evil-and-gay": {
    base: "vs-dark",
    comment: "#b05a98",
    string: "#e5a040",
    number: "#f836c9",
    keyword: "#e087cb",
    variable: "#f836c9",
    functionColor: "#f2e9f0",
    constant: "#f836c9",
    operator: "#f836c9",
    punctuation: "#b05a98",
    cursor: "#f836c9",
    selection: "#f836c940",
  },
  "soft-twink": {
    base: "vs",
    comment: "#6a9fd4",
    string: "#22863a",
    number: "#55a2f3",
    keyword: "#d73a49",
    variable: "#3d87d6",
    functionColor: "#005cc5",
    constant: "#55a2f3",
    operator: "#3d87d6",
    punctuation: "#6a9fd4",
    cursor: "#3d87d6",
    selection: "#55a2f333",
  },
  "catppuccin-mocha": {
    base: "vs-dark",
    comment: "#6c7086",
    string: "#a6e3a1",
    number: "#fab387",
    keyword: "#cba6f7",
    variable: "#cdd6f4",
    functionColor: "#89b4fa",
    constant: "#fab387",
    operator: "#89dceb",
    punctuation: "#9399b2",
    cursor: "#f5e0dc",
    selection: "#cba6f733",
  },
  "cheetos-and-cream": {
    base: "vs",
    comment: "#bf8040",
    string: "#e67700",
    number: "#ff8533",
    keyword: "#cc5500",
    variable: "#ff6a00",
    functionColor: "#ff6a00",
    constant: "#ff8533",
    operator: "#ff6a00",
    punctuation: "#bf8040",
    cursor: "#ff6a00",
    selection: "#ff6a0033",
  },
  "cold-night": {
    base: "vs-dark",
    comment: "#7d92ad",
    string: "#93ddb3",
    number: "#f5d88a",
    keyword: "#e8a8d8",
    variable: "#97c8e8",
    functionColor: "#6eb9e0",
    constant: "#f18080",
    operator: "#97c8e8",
    punctuation: "#7d92ad",
    cursor: "#97c8e8",
    selection: "#5159664d",
  },
};

const expandShortHex = (hex: string): string => {
  if (hex.length === 3 || hex.length === 4) {
    return hex.split("").map((ch) => ch + ch).join("");
  }
  return hex;
};

const stripHash = (color: string): string => {
  const trimmed = color.trim();
  if (!trimmed.startsWith("#")) {
    return trimmed;
  }
  const expanded = expandShortHex(trimmed.slice(1));
  if (expanded.length > 6) {
    return expanded.slice(0, 6);
  }
  return expanded;
};

const getCssVar = (name: string, fallback: string): string => {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
};

const normalizeMonacoColor = (value: string, fallback: string): string => {
  const trimmed = value.trim();
  const hexMatch = trimmed.match(/^#([0-9a-fA-F]{3,8})$/);
  if (hexMatch) {
    return `#${expandShortHex(hexMatch[1])}`;
  }

  const rgbaMatch = trimmed.match(/^rgba?\\((\\d+)\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)(?:\\s*,\\s*(\\d*\\.?\\d+))?\\)$/i);
  if (!rgbaMatch) {
    return fallback;
  }

  const r = Math.max(0, Math.min(255, Number(rgbaMatch[1])));
  const g = Math.max(0, Math.min(255, Number(rgbaMatch[2])));
  const b = Math.max(0, Math.min(255, Number(rgbaMatch[3])));
  const alphaRaw = rgbaMatch[4] === undefined ? 1 : Number(rgbaMatch[4]);
  const alpha = Math.max(0, Math.min(1, Number.isNaN(alphaRaw) ? 1 : alphaRaw));

  const toHex = (num: number): string => num.toString(16).padStart(2, "0");
  const alphaHex = alpha < 1 ? toHex(Math.round(alpha * 255)) : "";
  return `#${toHex(r)}${toHex(g)}${toHex(b)}${alphaHex}`;
};

const getCssColorVar = (name: string, fallback: string): string => (
  normalizeMonacoColor(getCssVar(name, fallback), fallback)
);

const normalizeTheme = (themeName: string): string => themeName.toLowerCase().replace(/\s+/g, "-");
const getThemePalette = (normalizedThemeName: string): string => (
  THEME_PALETTES[normalizedThemeName] ? normalizedThemeName : "generic"
);

const applyMonacoTheme = (monaco: typeof Monaco, normalizedThemeName: string): string => {
  const themeName = getThemePalette(normalizedThemeName);
  const palette = THEME_PALETTES[themeName];
  const monacoThemeName = `celestial-${themeName}`;

  monaco.editor.defineTheme(monacoThemeName, {
    base: palette.base,
    inherit: true,
    rules: [
      { token: "comment", foreground: stripHash(palette.comment) },
      { token: "string", foreground: stripHash(palette.string) },
      { token: "number", foreground: stripHash(palette.number) },
      { token: "keyword", foreground: stripHash(palette.keyword) },
      { token: "identifier", foreground: stripHash(palette.variable) },
      { token: "support.function", foreground: stripHash(palette.functionColor) },
      { token: "constant.language", foreground: stripHash(palette.constant) },
      { token: "operator", foreground: stripHash(palette.operator) },
      { token: "delimiter", foreground: stripHash(palette.punctuation) },
      { token: "delimiter.bracket", foreground: stripHash(palette.punctuation) },
    ],
    colors: {
      "editor.background": getCssColorVar("--bg-panel", palette.base === "vs" ? "#ffffff" : "#131313"),
      "editor.foreground": getCssColorVar("--text-primary", palette.variable),
      "editorLineNumber.foreground": getCssColorVar("--text-tertiary", "#666666"),
      "editorLineNumber.activeForeground": getCssColorVar("--text-primary", palette.variable),
      "editorLineNumber.background": getCssColorVar("--bg-panel", "#131313"),
      "editorCursor.foreground": palette.cursor,
      "editor.selectionBackground": palette.selection,
      "editor.selectionHighlightBackground": "#00000000",
      "editor.wordHighlightBackground": "#00000000",
      "editor.wordHighlightStrongBackground": "#00000000",
      "editor.findMatchBackground": getCssColorVar("--editor-find-match-bg", "#ffd70066"),
      "editor.findMatchHighlightBackground": getCssColorVar("--editor-find-match-bg", "#ffd70033"),
      "editor.findRangeHighlightBackground": "#00000000",
      "editor.lineHighlightBackground": getCssColorVar("--bg-secondary", "#1f1f1f"),
      "editor.lineHighlightBorder": "#00000000",
      "editorGutter.background": getCssColorVar("--bg-panel", "#131313"),
      "editorIndentGuide.background1": getCssColorVar("--text-unfocused", "#414346"),
      "editorIndentGuide.activeBackground1": getCssColorVar("--text-unfocused", "#414346"),
      "editorSuggestWidget.background": getCssColorVar("--bg-panel", "#131313"),
      "editorSuggestWidget.border": getCssColorVar("--border-secondary", "#2a2a2a"),
      "editorSuggestWidget.foreground": getCssColorVar("--text-primary", "#e0e0e0"),
      "editorSuggestWidget.selectedBackground": getCssColorVar("--bg-secondary", "#1f1f1f"),
      "editorSuggestWidget.highlightForeground": getCssColorVar("--editor-highlight-color", "#66d9ef"),
      "editorSuggestWidget.selectedForeground": getCssColorVar("--text-primary", "#e0e0e0"),
      "editorHoverWidget.background": getCssColorVar("--bg-panel", "#131313"),
      "editorHoverWidget.border": getCssColorVar("--border-secondary", "#2a2a2a"),
      "editorHoverWidget.foreground": getCssColorVar("--text-secondary", "#929292"),
      "editorWidget.background": getCssColorVar("--bg-panel", "#131313"),
      "editorWidget.border": getCssColorVar("--border-secondary", "#2a2a2a"),
      "scrollbarSlider.background": getCssColorVar("--border-resize-hover", "#333333"),
      "scrollbarSlider.hoverBackground": getCssColorVar("--border-resize-hover", "#333333"),
      "scrollbarSlider.activeBackground": getCssColorVar("--text-placeholder", "#555555"),
    },
  });

  monaco.editor.setTheme(monacoThemeName);
  return monacoThemeName;
};

const mapCompletionKind = (
  monaco: typeof Monaco,
  meta: string,
): Monaco.languages.CompletionItemKind => {
  const normalized = meta.toLowerCase();
  if (normalized.includes("keyword") || normalized.includes("logical")) {
    return monaco.languages.CompletionItemKind.Keyword;
  }
  if (normalized.includes("property")) {
    return monaco.languages.CompletionItemKind.Property;
  }
  if (normalized.includes("method")) {
    return monaco.languages.CompletionItemKind.Method;
  }
  if (normalized.includes("class")) {
    return monaco.languages.CompletionItemKind.Class;
  }
  if (normalized.includes("module")) {
    return monaco.languages.CompletionItemKind.Module;
  }
  if (normalized.includes("variable") || normalized.includes("member")) {
    return monaco.languages.CompletionItemKind.Variable;
  }
  return monaco.languages.CompletionItemKind.Function;
};

const isInsideCommentOrString = (line: string): boolean => {
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (!inSingle && !inDouble && char === "-" && next === "-") {
      return true;
    }

    if (char === "\\") {
      i += 1;
      continue;
    }

    if (!inDouble && char === "'") {
      inSingle = !inSingle;
      continue;
    }

    if (!inSingle && char === '"') {
      inDouble = !inDouble;
    }
  }

  return inSingle || inDouble;
};

const shouldSuppressCompletions = (line: string): boolean => {
  if (/\d+[a-z]+$/i.test(line)) {
    return true;
  }

  const openParens = (line.match(/\(/g) || []).length;
  const closeParens = (line.match(/\)/g) || []).length;
  return openParens > closeParens;
};

const makeSkid = async (monaco: typeof Monaco): Promise<void> => {
  if (!luaLanguageConfigured) {
    monaco.languages.register({ id: "lua" });

    monaco.languages.setLanguageConfiguration("lua", {
      comments: {
        lineComment: "--",
        blockComment: ["--[[", "]]"],
      },
      brackets: [
        ["{", "}"],
        ["[", "]"],
        ["(", ")"],
      ],
      autoClosingPairs: [
        { open: "{", close: "}" },
        { open: "[", close: "]" },
        { open: "(", close: ")" },
        { open: '"', close: '"' },
        { open: "'", close: "'" },
      ],
      surroundingPairs: [
        { open: "{", close: "}" },
        { open: "[", close: "]" },
        { open: "(", close: ")" },
        { open: '"', close: '"' },
        { open: "'", close: "'" },
      ],
    });

    monaco.languages.setMonarchTokensProvider("lua", {
      defaultToken: "",
      tokenPostfix: ".lua",
      keywords: LUA_KEYWORDS,
      operators: [
        "+", "-", "*", "/", "%", "^", "#",
        "==", "~=", "<=", ">=", "<", ">", "=",
        "..", "...", ":",
      ],
      symbols: /[=><!~?:&|+\-*/^%.]+/,
      tokenizer: {
        root: [
          [/[a-zA-Z_][\w]*(?=\s*\()/, { cases: { "@keywords": "keyword", "@default": "support.function" } }],
          [/[a-zA-Z_][\w]*/, { cases: { "@keywords": "keyword", "true|false|nil": "constant.language", "@default": "identifier" } }],
          [/0[xX][0-9a-fA-F]+/, "number"],
          [/\d*\.\d+([eE][\-+]?\d+)?/, "number"],
          [/\d+/, "number"],
          [/--\[\[/, { token: "comment", next: "@commentBlock" }],
          [/--.*$/, "comment"],
          [/"/, { token: "string.quote", bracket: "@open", next: "@stringDouble" }],
          [/'/, { token: "string.quote", bracket: "@open", next: "@stringSingle" }],
          [/[{}()\[\]]/, "delimiter.bracket"],
          [/[;,.]/, "delimiter"],
          [/@symbols/, { cases: { "@operators": "operator", "@default": "" } }],
          [/\s+/, "white"],
        ],
        stringDouble: [
          [/[^\\"]+/, "string"],
          [/\\./, "string.escape"],
          [/"/, { token: "string.quote", bracket: "@close", next: "@pop" }],
        ],
        stringSingle: [
          [/[^\\']+/, "string"],
          [/\\./, "string.escape"],
          [/'/, { token: "string.quote", bracket: "@close", next: "@pop" }],
        ],
        commentBlock: [
          [/[^\]]+/, "comment"],
          [/\]\](?:--)?/, { token: "comment", next: "@pop" }],
          [/\]/, "comment"],
        ],
      },
    });

    luaLanguageConfigured = true;
  }

  if (!usageCommandRegistered) {
    const registerCommand = (monaco.editor as unknown as {
      registerCommand?: (id: string, handler: (_accessor: unknown, ...args: unknown[]) => void) => Monaco.IDisposable;
    }).registerCommand;

    if (typeof registerCommand === "function") {
      registerCommand(COMPLETION_USAGE_COMMAND_ID, (_accessor, value) => {
        if (typeof value !== "string") {
          return;
        }

        void loadDefs().then(({ updateUsageCount }) => {
          if (typeof updateUsageCount === "function") {
            updateUsageCount(value);
          }
        });
      });
      usageCommandRegistered = true;
    }
  }

  if (!completionDisposable) {
    completionDisposable = monaco.languages.registerCompletionItemProvider("lua", {
      triggerCharacters: [":", "."],
      provideCompletionItems: async (model, position) => {
        let defsModule: LuaDefinitionsModule;
        try {
          defsModule = await loadDefs();
        } catch {
          return { suggestions: [] };
        }
        const defs = typeof defsModule.getDefs === "function"
          ? defsModule.getDefs()
          : Array.isArray(defsModule.definitions)
            ? defsModule.definitions
            : [];

        const fullLine = model.getLineContent(position.lineNumber);
        const lineBeforeCursor = fullLine.substring(0, Math.max(0, position.column - 1));

        if (isInsideCommentOrString(lineBeforeCursor) || shouldSuppressCompletions(lineBeforeCursor)) {
          return { suggestions: [] };
        }

        const word = model.getWordUntilPosition(position);
        const range: Monaco.IRange = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        const triggerCharIndex = position.column - word.word.length - 2;
        const triggerChar = triggerCharIndex >= 0 ? fullLine.charAt(triggerCharIndex) : "";

        let validItems = defs;
        if (triggerChar === ":") {
          validItems = defs.filter((item) => item.meta === "Method");
        } else if (triggerChar === ".") {
          validItems = defs.filter((item) => (
            item.meta === "Method"
            || item.meta === "Property"
            || item.meta === "Member"
            || item.value.includes(".")
          ));
        } else {
          validItems = defs.filter((item) => item.meta !== "Method" && item.meta !== "Property");
        }

        validItems.sort((a, b) => (b.score || 0) - (a.score || 0));

        const suggestions: Monaco.languages.CompletionItem[] = validItems.map((item, index) => {
          const rankingWeight = Math.max(0, Math.min(999999, item.score || 0));
          const sortWeight = String(999999 - rankingWeight).padStart(6, "0");

          return {
            label: item.caption,
            kind: mapCompletionKind(monaco, item.meta),
            detail: item.meta,
            documentation: item.docText ? { value: item.docText } : undefined,
            insertText: item.snippet || item.value,
            insertTextRules: item.snippet
              ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
              : undefined,
            range,
            sortText: `${sortWeight}-${String(index).padStart(6, "0")}-${item.caption}`,
            filterText: `${item.caption} ${item.value}`,
            command: usageCommandRegistered
              ? {
                  id: COMPLETION_USAGE_COMMAND_ID,
                  title: "Record completion usage",
                  arguments: [item.value],
                }
              : undefined,
          };
        });

        return { suggestions };
      },
    });
  }
};

interface EditorContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  hasSelection: boolean;
  selectedText: string;
  selectionRange: Monaco.IRange | null;
}

interface CodeEditorProps {
  editorId: string;
  code: string;
  currentFilePath: string | null;
  currentBufferPath?: string[] | null;
  onCodeChange: (newValue: string) => void;
  onExecute: () => void;
  onCloseSplit?: () => void;
  showCloseSplit?: boolean;
  onEditorFocus?: () => void;
  showAccountsPanel: boolean;
  showHistoryPanel: boolean;
  hideMultiInstanceButton: boolean;
  disableHistory: boolean;
  placeEditorButtonsInOtherPlace: boolean;
  disableLinting: boolean;
  wordWrapEnabled: boolean;
  smoothTypingEnabled: boolean;
  disableIndentGuides: boolean;
  onToggleAccountsPanel: () => void;
  onToggleHistoryPanel: () => void;
  handleNewScriptRef: React.MutableRefObject<(() => void) | null>;
  handleNewFolderRef: React.MutableRefObject<(() => void) | null>;
  navigateFilesRef: React.MutableRefObject<((direction: number) => void) | null>;
  toggleExplorerRef: React.MutableRefObject<(() => void) | null>;
  handleExecuteRef: React.MutableRefObject<(() => void) | null>;
}

const BreadcrumbSeparator = () => (
  <span className={styles["editor-breadcrumb-separator"]}>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6" />
    </svg>
  </span>
);

const HistoryIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-history-icon lucide-history">
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
    <path d="M12 7v5l4 2" />
  </svg>
);

const CodeEditor: React.FC<CodeEditorProps> = memo(({
  editorId,
  code,
  currentFilePath,
  currentBufferPath = null,
  onCodeChange,
  onExecute,
  onCloseSplit,
  showCloseSplit = false,
  onEditorFocus,
  showAccountsPanel,
  showHistoryPanel,
  hideMultiInstanceButton,
  disableHistory,
  placeEditorButtonsInOtherPlace,
  disableLinting,
  wordWrapEnabled,
  smoothTypingEnabled,
  disableIndentGuides,
  onToggleAccountsPanel,
  onToggleHistoryPanel,
  handleNewScriptRef,
  handleNewFolderRef,
  navigateFilesRef,
  toggleExplorerRef,
  handleExecuteRef,
}) => {
  const [isFocused, setIsFocused] = React.useState(false);
  const [hasSelection, setHasSelection] = React.useState(false);
  const [isMonacoReady, setIsMonacoReady] = React.useState(false);
  const { keybinds } = useKeybindSettings();
  const { currentTheme } = useUiSettings();

  const [editorContextMenu, setEditorContextMenu] = React.useState<EditorContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    hasSelection: false,
    selectedText: "",
    selectionRange: null,
  });
  const [editorContextMenuPosition, setEditorContextMenuPosition] = React.useState({
    left: 0,
    top: 0,
  });

  const editorContextMenuRef = useRef<HTMLDivElement>(null);
  const editorShellRef = useRef<HTMLDivElement>(null);
  const monacoEditorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const actionsRef = useRef<Monaco.IDisposable[]>([]);
  const editorDisposablesRef = useRef<Monaco.IDisposable[]>([]);
  const scrollbarHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const layoutScrollbarSuppressionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPointerInsideEditorRef = useRef(false);
  const suppressScrollbarRevealRef = useRef(false);
  const hideScrollbarRef = useRef(false);
  const normalizedThemeName = useMemo(
    () => normalizeTheme(currentTheme || "generic"),
    [currentTheme],
  );
  const monacoThemeName = useMemo(
    () => `celestial-${getThemePalette(normalizedThemeName)}`,
    [normalizedThemeName],
  );
  const editorBehaviorOptions = useMemo(() => ({
    wordWrap: wordWrapEnabled ? "on" as const : "off" as const,
    cursorBlinking: smoothTypingEnabled ? "smooth" as const : "blink" as const,
    cursorSmoothCaretAnimation: smoothTypingEnabled ? "on" as const : "off" as const,
    smoothScrolling: smoothTypingEnabled,
    guides: {
      indentation: !disableIndentGuides,
    },
  }), [disableIndentGuides, smoothTypingEnabled, wordWrapEnabled]);

  const disposeActions = useCallback(() => {
    actionsRef.current.forEach((disposable) => disposable.dispose());
    actionsRef.current = [];
  }, []);

  const disposeEditorDisposables = useCallback(() => {
    editorDisposablesRef.current.forEach((disposable) => disposable.dispose());
    editorDisposablesRef.current = [];
  }, []);

  const registerKeybind = useCallback(() => {
    const editor = monacoEditorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) {
      return;
    }

    disposeActions();

    const registerAction = (
      actionName: string,
      keybinding: number | null,
      run: () => void,
    ) => {
      const keybindings = keybinding !== null ? [keybinding] : undefined;
      const action = editor.addAction({
        id: `${editorId}.${actionName}`,
        label: actionName,
        keybindings,
        run: () => {
          run();
        },
      });
      actionsRef.current.push(action);
    };

    registerAction("executeScript", toMonacoKeybind(keybinds.executeScript, monaco), () => {
      if (handleExecuteRef.current) {
        handleExecuteRef.current();
      }
    });

    registerAction("newScript", toMonacoKeybind(keybinds.newScript, monaco), () => {
      if (handleNewScriptRef.current) {
        handleNewScriptRef.current();
      }
    });

    registerAction("newFolder", toMonacoKeybind(keybinds.newFolder, monaco), () => {
      if (handleNewFolderRef.current) {
        handleNewFolderRef.current();
      }
    });

    registerAction("toggleExplorer", toMonacoKeybind(keybinds.toggleExplorer, monaco), () => {
      if (toggleExplorerRef.current) {
        toggleExplorerRef.current();
      }
    });

    registerAction("prevFile", monaco.KeyMod.CtrlCmd | monaco.KeyCode.UpArrow, () => {
      if (navigateFilesRef.current) {
        navigateFilesRef.current(-1);
      }
    });

    registerAction("nextFile", monaco.KeyMod.CtrlCmd | monaco.KeyCode.DownArrow, () => {
      if (navigateFilesRef.current) {
        navigateFilesRef.current(1);
      }
    });
  }, [
    disposeActions,
    editorId,
    handleExecuteRef,
    handleNewFolderRef,
    handleNewScriptRef,
    keybinds.executeScript,
    keybinds.newFolder,
    keybinds.newScript,
    keybinds.toggleExplorer,
    navigateFilesRef,
    toggleExplorerRef,
  ]);

  const applyCurrentTheme = useCallback(() => {
    if (!monacoRef.current) {
      return;
    }

    applyMonacoTheme(monacoRef.current, normalizedThemeName);
  }, [normalizedThemeName]);

  const handleBeforeMount: BeforeMount = useCallback((monaco) => {
    void makeSkid(monaco);
    applyMonacoTheme(monaco, normalizedThemeName);
  }, [normalizedThemeName]);

  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    monacoEditorRef.current = editor;
    monacoRef.current = monaco;
    setIsMonacoReady(true);

    void makeSkid(monaco);
    applyMonacoTheme(monaco, normalizedThemeName);

    editor.updateOptions({
      hover: {
        enabled: false,
      },
      find: {
        addExtraSpaceOnTop: false,
        seedSearchStringFromSelection: "never",
      },
    });

    disposeEditorDisposables();
    const editorDomNode = editor.getDomNode();

    const showScrollbarTemporarily = () => {
      if (hideScrollbarRef.current) {
        return;
      }

      const shellNode = editorShellRef.current;
      if (!shellNode) {
        return;
      }

      shellNode.classList.add("monaco-scrollbar-active");
      if (scrollbarHideTimeoutRef.current) {
        clearTimeout(scrollbarHideTimeoutRef.current);
      }

      scrollbarHideTimeoutRef.current = setTimeout(() => {
        shellNode.classList.remove("monaco-scrollbar-active");
      }, 1500);
    };

    const hideScrollbarImmediately = () => {
      if (scrollbarHideTimeoutRef.current) {
        clearTimeout(scrollbarHideTimeoutRef.current);
        scrollbarHideTimeoutRef.current = null;
      }
      editorShellRef.current?.classList.remove("monaco-scrollbar-active");
    };

    const suppressScrollbarRevealTemporarily = () => {
      suppressScrollbarRevealRef.current = true;
      hideScrollbarImmediately();

      if (layoutScrollbarSuppressionTimeoutRef.current) {
        clearTimeout(layoutScrollbarSuppressionTimeoutRef.current);
      }

      layoutScrollbarSuppressionTimeoutRef.current = setTimeout(() => {
        suppressScrollbarRevealRef.current = false;
        layoutScrollbarSuppressionTimeoutRef.current = null;
      }, 120);
    };

    const syncScrollbarLock = () => {
      const shellNode = editorShellRef.current;
      if (!shellNode) {
        return;
      }

      const lineCount = editor.getModel()?.getLineCount() ?? 0;
      const shouldHide = lineCount < MIN_LINES_FOR_SCROLLBAR;
      hideScrollbarRef.current = shouldHide;
      shellNode.classList.toggle("monaco-scrollbar-disabled", shouldHide);

      if (shouldHide) {
        hideScrollbarImmediately();
      }
    };

    const handleEditorPointerMove = (event: MouseEvent) => {
      if (!editorDomNode || hideScrollbarRef.current) {
        return;
      }

      suppressScrollbarRevealRef.current = false;

      const rect = editorDomNode.getBoundingClientRect();
      const activationLaneWidth = 18;
      if (event.clientX >= rect.right - activationLaneWidth) {
        showScrollbarTemporarily();
      }
    };

    const handleEditorPointerEnter = (event: MouseEvent) => {
      isPointerInsideEditorRef.current = true;
      handleEditorPointerMove(event);
    };

    const handleEditorWheel = () => {
      if (hideScrollbarRef.current) {
        return;
      }

      suppressScrollbarRevealRef.current = false;
      showScrollbarTemporarily();
    };

    const handleEditorPointerLeave = () => {
      isPointerInsideEditorRef.current = false;
      suppressScrollbarRevealRef.current = false;
      hideScrollbarImmediately();
    };

    if (editorDomNode) {
      editorDomNode.addEventListener("mousemove", handleEditorPointerMove);
      editorDomNode.addEventListener("mouseenter", handleEditorPointerEnter);
      editorDomNode.addEventListener("wheel", handleEditorWheel, { passive: true });
      editorDomNode.addEventListener("mouseleave", handleEditorPointerLeave);
    }

    const selectDisposable = editor.onDidChangeCursorSelection((event) => {
      const model = editor.getModel();
      if (!model) {
        setHasSelection(false);
        return;
      }

      const selectedText = model.getValueInRange(event.selection);
      setHasSelection(selectedText.length > 0);
    });

    const focusDisposable = editor.onDidFocusEditorWidget(() => {
      setIsFocused(true);
      if (onEditorFocus) {
        onEditorFocus();
      }
    });

    const blurDisposable = editor.onDidBlurEditorWidget(() => {
      setIsFocused(false);
      setTimeout(() => {
        const activeElement = document.activeElement;
        const isFindWidget = activeElement && activeElement.closest(".monaco-editor .find-widget");
        if (isFindWidget) {
          return;
        }

        const position = editor.getPosition();
        if (!position) {
          return;
        }

        editor.setSelection(new monaco.Selection(
          position.lineNumber,
          position.column,
          position.lineNumber,
          position.column,
        ));
      }, 10);
    });

    const modelDisposable = editor.onDidChangeModel(() => {
      suppressScrollbarRevealRef.current = true;
      hideScrollbarImmediately();
      syncScrollbarLock();
      setHasSelection(false);
      const model = editor.getModel();
      if (model) {
        monaco.editor.setModelMarkers(model, MARKER_OWNER, []);
      }
    });

    const layoutDispose = editor.onDidLayoutChange(() => {
      suppressScrollbarRevealTemporarily();
    });

    const contentSizeDisposable = editor.onDidContentSizeChange(() => {
      syncScrollbarLock();
    });

    const scrollDisposable = editor.onDidScrollChange(() => {
      if (isPointerInsideEditorRef.current && !suppressScrollbarRevealRef.current) {
        showScrollbarTemporarily();
      }
    });

    syncScrollbarLock();

    let findWidgetObserver: MutationObserver | null = null;
    if (editorDomNode) {
      findWidgetObserver = new MutationObserver((mutations) => {
        const findWidget = editorDomNode.querySelector(".find-widget");
        if (!findWidget || !findWidget.classList.contains("visible")) {
          return;
        }

        const findController = editor.getContribution("editor.contrib.findController") as {
          toggleReplace?: () => void;
          _widget?: {
            _findInput?: {
              inputBox?: {
                options?: {
                  showHistoryHint?: () => boolean;
                };
                setPlaceHolder?: (placeHolder: string) => void;
                input?: HTMLInputElement;
              };
            };
          };
        } | null;

        if (findWidget.classList.contains("replaceToggled")) {
          if (findController?.toggleReplace) {
            findController.toggleReplace();
          }
        }

        const findInputBox = findController?._widget?._findInput?.inputBox;
        if (findInputBox?.options) {
          findInputBox.options.showHistoryHint = () => false;
        }
        findInputBox?.setPlaceHolder?.("Find");
        if (findInputBox?.input) {
          findInputBox.input.placeholder = "Find";
        }

        const elementsWithTitle = findWidget.querySelectorAll("[title]");
        elementsWithTitle.forEach((el) => {
          el.removeAttribute("title");
        });

        mutations.forEach((mutation) => {
          if (mutation.type !== "attributes" || mutation.attributeName !== "title") {
            return;
          }

          const target = mutation.target;
          if (!(target instanceof HTMLElement)) {
            return;
          }

          if (target.closest(".find-widget")) {
            target.removeAttribute("title");
          }
        });
      });

      findWidgetObserver.observe(editorDomNode, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "title"],
      });
    }

    editorDisposablesRef.current = [
      selectDisposable,
      focusDisposable,
      blurDisposable,
      layoutDispose,
      contentSizeDisposable,
      scrollDisposable,
      modelDisposable,
      {
        dispose: () => {
          if (!editorDomNode) {
            return;
          }
          editorDomNode.removeEventListener("mousemove", handleEditorPointerMove);
          editorDomNode.removeEventListener("mouseenter", handleEditorPointerEnter);
          editorDomNode.removeEventListener("wheel", handleEditorWheel);
          editorDomNode.removeEventListener("mouseleave", handleEditorPointerLeave);
        },
      },
      { dispose: () => findWidgetObserver?.disconnect() },
    ];

    editor.addAction({
      id: `${editorId}.unfocusEditor`,
      label: "unfocusEditor",
      precondition: "editorTextFocus && !findWidgetVisible",
      keybindings: [monaco.KeyCode.Escape],
      run: () => {
        const textArea = editor.getDomNode()?.querySelector("textarea");
        if (textArea instanceof HTMLElement) {
          textArea.blur();
        }
        setIsFocused(false);
      },
    });

    registerKeybind();
  }, [disposeEditorDisposables, editorId, normalizedThemeName, onEditorFocus, registerKeybind]);

  useEffect(() => {
    if (!isMonacoReady) {
      return;
    }

    registerKeybind();
  }, [isMonacoReady, registerKeybind]);

  useEffect(() => {
    if (!isMonacoReady) {
      return;
    }

    applyCurrentTheme();
  }, [applyCurrentTheme, isMonacoReady]);

  useEffect(() => {
    const editor = monacoEditorRef.current;
    if (!editor) {
      return;
    }

    editor.updateOptions({
      ...editorBehaviorOptions,
      hover: {
        enabled: false,
      },
      find: {
        addExtraSpaceOnTop: false,
        seedSearchStringFromSelection: "never",
      },
    });
  }, [editorBehaviorOptions]);

  useEffect(() => {
    const editor = monacoEditorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) {
      return;
    }

    if (code.length !== 0) {
      return;
    }

    setHasSelection(false);
    editor.setSelection(new monaco.Selection(1, 1, 1, 1));
    editor.setPosition(new monaco.Position(1, 1));
  }, [code]);

  useEffect(() => {
    const editor = monacoEditorRef.current;
    const monaco = monacoRef.current;
    const model = editor?.getModel();

    if (!editor || !monaco || !model) {
      return;
    }

    if (disableLinting || code.trim().length === 0) {
      monaco.editor.setModelMarkers(model, MARKER_OWNER, []);
      setHasSelection(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      const runValidation = async () => {
        try {
          const { validator: validatorClass } = await loadValidatorModule();
          if (cancelled) {
            return;
          }

          const validatorInstance = new validatorClass();
          const newAnnotations = validatorInstance.validate(code);

          const codeLines = code.split("\n");

          const markers: Monaco.editor.IMarkerData[] = newAnnotations.map((annotation) => {
            const line = codeLines[annotation.row] || "";
            let startCol = annotation.column;
            let endCol = line.length;

            let wordStart = startCol;
            while (wordStart > 0 && /\w/.test(line[wordStart - 1])) {
              wordStart -= 1;
            }

            let wordEnd = startCol;
            while (wordEnd < line.length && /\w/.test(line[wordEnd])) {
              wordEnd += 1;
            }

            if (wordEnd > wordStart) {
              startCol = wordStart;
              endCol = wordEnd;
            } else {
              const trimmedStart = line.search(/\S/);
              if (trimmedStart >= 0) {
                startCol = trimmedStart;
                endCol = line.length;
              } else {
                startCol = 0;
                endCol = Math.max(1, line.length);
              }
            }

            const startColumn = Math.max(1, startCol + 1);
            const endColumn = line.length === 0
              ? startColumn
              : Math.max(startColumn + 1, endCol + 1);

            return {
              startLineNumber: annotation.row + 1,
              endLineNumber: annotation.row + 1,
              startColumn,
              endColumn,
              message: annotation.text,
              severity: annotation.type === "error"
                ? monaco.MarkerSeverity.Error
                : annotation.type === "warning"
                  ? monaco.MarkerSeverity.Warning
                  : monaco.MarkerSeverity.Info,
            };
          });

          if (!cancelled) {
            monaco.editor.setModelMarkers(model, MARKER_OWNER, markers);
          }
        } catch {
          if (!cancelled) {
            monaco.editor.setModelMarkers(model, MARKER_OWNER, []);
          }
        }
      };

      void runValidation();
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [code, disableLinting]);

  useEffect(() => {
    return () => {
      if (scrollbarHideTimeoutRef.current) {
        clearTimeout(scrollbarHideTimeoutRef.current);
        scrollbarHideTimeoutRef.current = null;
      }
      if (layoutScrollbarSuppressionTimeoutRef.current) {
        clearTimeout(layoutScrollbarSuppressionTimeoutRef.current);
        layoutScrollbarSuppressionTimeoutRef.current = null;
      }
      editorShellRef.current?.classList.remove("monaco-scrollbar-active");

      const monaco = monacoRef.current;
      const model = monacoEditorRef.current?.getModel();
      if (monaco && model) {
        monaco.editor.setModelMarkers(model, MARKER_OWNER, []);
      }

      disposeActions();
      disposeEditorDisposables();
      monacoEditorRef.current = null;
      monacoRef.current = null;
    };
  }, [disposeActions, disposeEditorDisposables]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (editorContextMenuRef.current && !editorContextMenuRef.current.contains(event.target as Node)) {
        setEditorContextMenu((prev) => ({ ...prev, visible: false }));
      }
    };

    if (editorContextMenu.visible) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [editorContextMenu.visible]);

  React.useLayoutEffect(() => {
    if (!editorContextMenu.visible || !editorContextMenuRef.current) {
      return;
    }

    const { width, height } = editorContextMenuRef.current.getBoundingClientRect();
    setEditorContextMenuPosition(getContextPos(
      editorContextMenu.x,
      editorContextMenu.y,
      width,
      height,
    ));
  }, [
    editorContextMenu.hasSelection,
    editorContextMenu.visible,
    editorContextMenu.x,
    editorContextMenu.y,
    showCloseSplit,
  ]);

  const handleEditorContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    const editor = monacoEditorRef.current;
    const model = editor?.getModel();

    const selectionRange = editor?.getSelection() || null;
    const selectedText = selectionRange && model
      ? model.getValueInRange(selectionRange)
      : "";

    setEditorContextMenu({
      visible: true,
      x: event.clientX,
      y: event.clientY,
      hasSelection: selectedText.length > 0,
      selectedText,
      selectionRange,
    });
  }, []);

  const handleEditorCopy = useCallback(async () => {
    const textToCopy = editorContextMenu.selectedText;
    setEditorContextMenu((prev) => ({ ...prev, visible: false }));

    if (!textToCopy) {
      return;
    }

    try {
      await clipboardWriteText(textToCopy);
    } catch {
    }
  }, [editorContextMenu.selectedText]);

  const handleEditorPaste = useCallback(async () => {
    const range = editorContextMenu.selectionRange;
    const editor = monacoEditorRef.current;

    setEditorContextMenu((prev) => ({ ...prev, visible: false }));

    if (!editor || !range) {
      return;
    }

    try {
      const text = await clipboardReadText();
      editor.executeEdits("editor-context-menu-paste", [{
        range,
        text,
        forceMoveMarkers: true,
      }]);
      editor.focus();
    } catch {
    }
  }, [editorContextMenu.selectionRange]);

  const handleCloseSplit = useCallback(() => {
    setEditorContextMenu((prev) => ({ ...prev, visible: false }));
    if (onCloseSplit) {
      onCloseSplit();
    }
  }, [onCloseSplit]);

  const breadcrumbContent = useMemo(() => {
    if (!currentFilePath) {
      if (currentBufferPath && currentBufferPath.length > 0) {
        return (
          <>
            {currentBufferPath.map((part, index) => (
              <span key={`${part}-${index}`} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                {index > 0 && <BreadcrumbSeparator />}
                <span className={cn(styles["editor-breadcrumb-item"], index === currentBufferPath.length - 1 && styles.file)}>
                  {part}
                </span>
              </span>
            ))}
          </>
        );
      }

      return (
        <>
          <span className={styles["editor-breadcrumb-item"]}>Celestial</span>
          <BreadcrumbSeparator />
          <span className={styles["editor-breadcrumb-item"]}>File Selection</span>
        </>
      );
    }

    const parts = currentFilePath.split("/");
    const autoexecIndex = parts.findIndex((part) => part === "autoexecute" || part === "autoexec" || part === "Macsploit Automatic Execution");
    if (autoexecIndex !== -1) {
      const fileName = parts[parts.length - 1];
      return (
        <>
          <span className={styles["editor-breadcrumb-item"]}>Auto-Execute</span>
          {fileName && (
            <>
              <BreadcrumbSeparator />
              <span className={cn(styles["editor-breadcrumb-item"], styles.file)}>{fileName}</span>
            </>
          )}
        </>
      );
    }

    const celestialIndex = parts.indexOf("Celestial");
    if (celestialIndex !== -1 && celestialIndex < parts.length - 1) {
      const relevantParts = parts.slice(celestialIndex + 1);
      return (
        <>
          <span className={styles["editor-breadcrumb-item"]}>Celestial</span>
          {relevantParts.map((part, index) => {
            const pathKey = relevantParts.slice(0, index + 1).join("/");
            const isFilePart = index === relevantParts.length - 1;
            return (
              <span key={pathKey} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <BreadcrumbSeparator />
                <span className={cn(styles["editor-breadcrumb-item"], isFilePart && styles.file)}>
                  {part}
                </span>
              </span>
            );
          })}
        </>
      );
    }

    const fileName = parts[parts.length - 1];
    return fileName ? <span className={cn(styles["editor-breadcrumb-item"], styles.file)}>{fileName}</span> : null;
  }, [currentBufferPath, currentFilePath]);

  const editorContainerClasses = useMemo(() => {
    return cn(
      styles["editor-container"],
      styles["editor-shell"],
      !isFocused && styles["editor-unfocused"],
      hasSelection && styles["editor-has-selection"],
    );
  }, [hasSelection, isFocused]);

  const modelPath = useMemo(() => {
    if (!currentFilePath) {
      return `celestial://${editorId}/__untitled__`;
    }

    return `celestial://${editorId}/${encodeURIComponent(currentFilePath)}`;
  }, [currentFilePath, editorId]);

  const editorOptions = useMemo<Monaco.editor.IStandaloneEditorConstructionOptions>(() => ({
    lineNumbers: "on",
    lineNumbersMinChars: 6,
    lineDecorationsWidth: 8,
    glyphMargin: false,
    tabSize: 2,
    insertSpaces: true,
    detectIndentation: false,
    scrollBeyondLastLine: true,
    minimap: { enabled: false },
    fontFamily: "'Roboto Mono', monospace",
    fontSize: 13.5,
    lineHeight: 16,
    ...editorBehaviorOptions,
    quickSuggestions: {
      other: true,
      comments: false,
      strings: false,
    },
    suggest: {
      showIcons: false,
      showInlineDetails: false,
    },
    suggestOnTriggerCharacters: true,
    snippetSuggestions: "inline",
    contextmenu: false,
    renderLineHighlight: "line",
    renderValidationDecorations: "on",
    bracketPairColorization: { enabled: false },
    folding: false,
    showFoldingControls: "never",
    stickyScroll: { enabled: false },
    unicodeHighlight: {
      nonBasicASCII: false,
      invisibleCharacters: false,
      ambiguousCharacters: false,
      includeComments: false,
      includeStrings: false,
    },
    padding: {
      top: 0,
      bottom: 0,
    },
    overviewRulerLanes: 0,
    overviewRulerBorder: false,
    hideCursorInOverviewRuler: true,
    scrollbar: {
      horizontal: "hidden",
      vertical: "auto",
      verticalScrollbarSize: 7,
      alwaysConsumeMouseWheel: true,
      useShadows: false,
    },
    hover: {
      enabled: false,
    },
    find: {
      addExtraSpaceOnTop: false,
      seedSearchStringFromSelection: "never",
    },
  }), [editorBehaviorOptions]);

  const editorContextMenuStyle = useMemo(() => ({
    position: "fixed" as const,
    left: editorContextMenuPosition.left,
    top: editorContextMenuPosition.top,
    maxHeight: `calc(100vh - ${CONTEXT_MENU_VIEWPORT_PADDING * 2}px)`,
    maxWidth: `calc(100vw - ${CONTEXT_MENU_VIEWPORT_PADDING * 2}px)`,
    overflowY: "auto" as const,
    overflowX: "hidden" as const,
  }), [editorContextMenuPosition.left, editorContextMenuPosition.top]);

  return (
    <div
      ref={editorShellRef}
      className={editorContainerClasses}
      style={{ overflow: "hidden" }}
      onContextMenu={handleEditorContextMenu}
    >
      <div className={styles["editor-breadcrumb"]}>
        <div className={styles["editor-breadcrumb-path"]}>{breadcrumbContent}</div>
        {placeEditorButtonsInOtherPlace && (
          <div className={styles["editor-breadcrumb-actions"]}>
            {!hideMultiInstanceButton && !disableHistory && (
              <button
                className={cn(styles["editor-action-icon-button"], showHistoryPanel && styles.active)}
                onClick={onToggleHistoryPanel}
                aria-label="Toggle history panel"
                title="Toggle history panel"
              >
                <HistoryIcon />
              </button>
            )}

            {!hideMultiInstanceButton && (
              <button
                className={cn(styles["editor-action-icon-button"], showAccountsPanel && styles.active)}
                onClick={onToggleAccountsPanel}
                aria-label="Toggle accounts panel"
                title="Toggle accounts panel"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <path d="M16 3.128a4 4 0 0 1 0 7.744" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                  <circle cx="9" cy="7" r="4" />
                </svg>
              </button>
            )}

            <button
              className={styles["editor-action-icon-button"]}
              onClick={onExecute}
              aria-label="Execute script"
              title="Execute script"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" />
              </svg>
            </button>
          </div>
        )}
      </div>

      <MonacoEditor
        path={modelPath}
        theme={monacoThemeName}
        defaultLanguage="lua"
        language="lua"
        value={code}
        beforeMount={handleBeforeMount}
        onMount={handleEditorMount}
        onChange={(newValue) => onCodeChange(newValue ?? "")}
        saveViewState
        options={editorOptions}
        loading={null}
      />

      {!placeEditorButtonsInOtherPlace && (
        <>
          <button
            className={styles["execute-button"]}
            onClick={onExecute}
            aria-label="Execute script"
            title="Execute script"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" />
            </svg>
          </button>

          {!hideMultiInstanceButton && !disableHistory && (
            <button
              className={cn(styles["history-toggle-button"], showHistoryPanel && styles.active)}
              onClick={onToggleHistoryPanel}
              aria-label="Toggle history panel"
              title="Toggle history panel"
            >
              <HistoryIcon />
            </button>
          )}

          {!hideMultiInstanceButton && (
            <button
              className={cn(styles["accounts-toggle-button"], showAccountsPanel && styles.active)}
              onClick={onToggleAccountsPanel}
              aria-label="Toggle accounts panel"
              title="Toggle accounts panel"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <path d="M16 3.128a4 4 0 0 1 0 7.744" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <circle cx="9" cy="7" r="4" />
              </svg>
            </button>
          )}
        </>
      )}

      {editorContextMenu.visible && createPortal(
        <div
          ref={editorContextMenuRef}
          className={styles["context-menu"]}
          style={editorContextMenuStyle}
        >
          {editorContextMenu.hasSelection && (
            <button className={styles["context-menu-item"]} onClick={handleEditorCopy}>
              <CopyIcon />
              <span>Copy</span>
            </button>
          )}
          <button className={styles["context-menu-item"]} onClick={handleEditorPaste}>
            <PasteIcon />
            <span>Paste</span>
          </button>
          {showCloseSplit && (
            <button className={styles["context-menu-item"]} onClick={handleCloseSplit}>
              <SplitviewIcon />
              <span>Close Split</span>
            </button>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
});

CodeEditor.displayName = "CodeEditor";

export default CodeEditor;
