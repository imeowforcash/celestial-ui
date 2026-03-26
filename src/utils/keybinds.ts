export type KeybindAction =
  | "toggleSidebar"
  | "toggleAccountsPanel"
  | "toggleExplorer"
  | "executeScript"
  | "newScript"
  | "newFolder"
  | "deleteActiveScript"
  | "openRoblox"
  | "openSettings";

export type Keybinds = Record<KeybindAction, string>;

export const defaultKeybinds: Keybinds = {
  toggleSidebar: "Mod+B",
  toggleAccountsPanel: "Mod+Shift+A",
  toggleExplorer: "Mod+Shift+E",
  executeScript: "Mod+Enter",
  newScript: "Mod+N",
  newFolder: "Mod+Shift+N",
  deleteActiveScript: "Mod+Backspace",
  openRoblox: "Mod+Shift+R",
  openSettings: "Mod+Comma",
};

const keybindActionIds: KeybindAction[] = [
  "toggleSidebar",
  "toggleAccountsPanel",
  "toggleExplorer",
  "executeScript",
  "newScript",
  "newFolder",
  "deleteActiveScript",
  "openRoblox",
  "openSettings",
];

export interface ParsedKeybind {
  key: string;
  mod: boolean;
  shift: boolean;
  alt: boolean;
}

const MODIFIER_TOKENS = new Set(["MOD", "CMD", "COMMAND", "META", "CTRL", "CONTROL"]);
const SHIFT_TOKENS = new Set(["SHIFT"]);
const ALT_TOKENS = new Set(["ALT", "OPTION"]);
const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta"]);

const KEY_ALIASES: Record<string, string> = {
  ",": "Comma",
  " ": "Space",
};

const DISPLAY_KEY_MAP_MAC: Record<string, string> = {
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Enter: "↵",
  Backspace: "⌫",
  Delete: "⌦",
  Comma: ",",
  Space: "Space",
};

const DISPLAY_KEY_MAP_WIN: Record<string, string> = {
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Enter: "Enter",
  Backspace: "Backspace",
  Delete: "Delete",
  Comma: ",",
  Space: "Space",
};

const ACE_KEY_MAP: Record<string, string> = {
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Comma: ",",
  Enter: "Enter",
  Backspace: "Backspace",
  Delete: "Delete",
  Space: "Space",
  Escape: "Esc",
};

export function sanitizeKeybinds(overrides: unknown): Partial<Keybinds> {
  if (!overrides || typeof overrides !== "object") return {};
  const source = overrides as Record<string, unknown>;

  return keybindActionIds.reduce((acc, actionId) => {
    const value = source[actionId];
    if (typeof value === "string" && value.length > 0) {
      acc[actionId] = value;
    }
    return acc;
  }, {} as Partial<Keybinds>);
}

export function mergeKeybinds(overrides?: unknown): Keybinds {
  return { ...defaultKeybinds, ...sanitizeKeybinds(overrides) };
}

export function isMacPlatform(): boolean {
  return true;
}

export function normalizeKey(key: string): string | null {
  if (!key) return null;
  if (MODIFIER_KEYS.has(key)) return null;
  if (KEY_ALIASES[key]) return KEY_ALIASES[key];
  if (key.length === 1) return key.toUpperCase();
  return key;
}

export function comboFromEvent(event: KeyboardEvent): string | null {
  const normalizedKey = normalizeKey(event.key);
  if (!normalizedKey) return null;

  const parts: string[] = [];
  if (event.metaKey || event.ctrlKey) parts.push("Mod");
  if (event.shiftKey) parts.push("Shift");
  if (event.altKey) parts.push("Alt");
  parts.push(normalizedKey);
  return parts.join("+");
}

export function parseCombo(combo: string): ParsedKeybind | null {
  if (!combo || typeof combo !== 'string') return null;
  const tokens = combo.split("+").map((token) => token.trim()).filter(Boolean);
  if (tokens.length === 0) return null;

  let mod = false;
  let shift = false;
  let alt = false;
  let keyToken: string | null = null;

  for (const token of tokens) {
    const upper = token.toUpperCase();
    if (MODIFIER_TOKENS.has(upper)) {
      mod = true;
      continue;
    }
    if (SHIFT_TOKENS.has(upper)) {
      shift = true;
      continue;
    }
    if (ALT_TOKENS.has(upper)) {
      alt = true;
      continue;
    }
    keyToken = token;
  }

  if (!keyToken) return null;
  const normalizedKey = normalizeKey(keyToken);
  if (!normalizedKey) return null;

  return {
    key: normalizedKey,
    mod,
    shift,
    alt,
  };
}

export function parseKeybinds(keybinds: Keybinds): Record<KeybindAction, ParsedKeybind | null> {
  return Object.keys(keybinds).reduce((acc, actionId) => {
    const typedAction = actionId as KeybindAction;
    acc[typedAction] = parseCombo(keybinds[typedAction]);
    return acc;
  }, {} as Record<KeybindAction, ParsedKeybind | null>);
}

export function matches(parsed: ParsedKeybind | null, event: KeyboardEvent): boolean {
  if (!parsed) return false;
  const normalizedKey = normalizeKey(event.key);
  if (!normalizedKey) return false;

  const modPressed = event.metaKey || event.ctrlKey;
  if (parsed.mod !== modPressed) return false;
  if (parsed.shift !== event.shiftKey) return false;
  if (parsed.alt !== event.altKey) return false;

  return parsed.key === normalizedKey;
}

export function formatDisplay(combo: string, isMac: boolean): string {
  const parsed = parseCombo(combo);
  if (!parsed) return "";

  const parts: string[] = [];
  if (parsed.mod) parts.push(isMac ? "⌘" : "Ctrl");
  if (parsed.shift) parts.push(isMac ? "⇧" : "Shift");
  if (parsed.alt) parts.push(isMac ? "⌥" : "Alt");

  const keyLabel = isMac
    ? (DISPLAY_KEY_MAP_MAC[parsed.key] || parsed.key)
    : (DISPLAY_KEY_MAP_WIN[parsed.key] || parsed.key);

  parts.push(keyLabel);
  return parts.join(" ");
}

export function toAceBind(combo: string): { win: string; mac: string } {
  const parsed = parseCombo(combo);
  if (!parsed) return { win: "", mac: "" };

  const key = ACE_KEY_MAP[parsed.key] || parsed.key;
  const winParts: string[] = [];
  const macParts: string[] = [];

  if (parsed.mod) {
    winParts.push("Ctrl");
    macParts.push("Cmd");
  }
  if (parsed.shift) {
    winParts.push("Shift");
    macParts.push("Shift");
  }
  if (parsed.alt) {
    winParts.push("Alt");
    macParts.push("Alt");
  }

  winParts.push(key);
  macParts.push(key);

  return { win: winParts.join("-"), mac: macParts.join("-") };
}

type MonacoApi = {
  KeyMod: {
    CtrlCmd: number;
    Shift: number;
    Alt: number;
  };
  KeyCode: Record<string, number | string>;
};

export function toMonacoKeybind(combo: string, monaco: MonacoApi): number | null {
  const parsed = parseCombo(combo);
  if (!parsed) return null;

  const keyFromChar = (() => {
    if (parsed.key.length !== 1) return null;
    if (/^[A-Z]$/.test(parsed.key)) return `Key${parsed.key}`;
    if (/^[0-9]$/.test(parsed.key)) return `Digit${parsed.key}`;
    return null;
  })();

  const keyNameMap: Record<string, string> = {
    ArrowUp: "UpArrow",
    ArrowDown: "DownArrow",
    ArrowLeft: "LeftArrow",
    ArrowRight: "RightArrow",
    Comma: "Comma",
    Enter: "Enter",
    Backspace: "Backspace",
    Delete: "Delete",
    Space: "Space",
    Escape: "Escape",
  };

  const keyName = keyFromChar || keyNameMap[parsed.key];
  if (!keyName || typeof monaco.KeyCode[keyName] !== "number") {
    return null;
  }

  let binding = monaco.KeyCode[keyName];
  if (parsed.mod) binding |= monaco.KeyMod.CtrlCmd;
  if (parsed.shift) binding |= monaco.KeyMod.Shift;
  if (parsed.alt) binding |= monaco.KeyMod.Alt;

  return binding;
}

export function getKeybindFuckers(keybinds: Keybinds): Set<KeybindAction> {
  const entries = new Map<string, KeybindAction[]>();
  (Object.keys(keybinds) as KeybindAction[]).forEach((actionId) => {
    const combo = keybinds[actionId];
    if (!combo) return;
    const list = entries.get(combo) || [];
    list.push(actionId);
    entries.set(combo, list);
  });

  const conflicts = new Set<KeybindAction>();
  entries.forEach((actions) => {
    if (actions.length > 1) {
      actions.forEach((actionId) => conflicts.add(actionId));
    }
  });

  return conflicts;
}
