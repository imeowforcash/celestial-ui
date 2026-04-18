import { appDataDir, join } from "@tauri-apps/api/path";
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
import { Keybinds, mergeKeybinds } from "./keybinds";
import {
  DEFAULT_EDITOR_FONT_FAMILY,
  DEFAULT_EDITOR_FONT_SIZE,
  DEFAULT_UI_FONT_FAMILY,
  DEFAULT_UI_FONT_SIZE,
} from "./fontConfig";

export interface AppSettings {
  title?: string;
  addKingVon?: boolean;
  disableLinting?: boolean;
  wordWrapEnabled?: boolean;
  smoothTypingEnabled?: boolean;
  disableIndentGuides?: boolean;
  editorFontFamily?: string;
  editorFontSize?: number;
  useHubble?: boolean;
  disableHistory?: boolean;
  autoHideSidebar?: boolean;
  editorButtonsElsewhere?: boolean;
  preventUpdates?: boolean;
  disableTrayIcon?: boolean;
  hideTrayFolder?: boolean;
  hideRobloxButton?: boolean;
  UIFontFamily?: string;
  UIFontSize?: number;
  keybinds?: Keybinds;
  [key: string]: unknown;
}

export interface AppStuff {
  accountsWidth?: number;
  accountsPanelOnLeft?: boolean;
  analyticsId?: string;
  defaultAccountId?: string;
  explorerOnLeft?: boolean;
  tightSpacing?: boolean;
  showAccountsPanel?: boolean;
  showHistoryPanel?: boolean;
  showExplorer?: boolean;
  sidebarOnRight?: boolean;
  sidebarVisible?: boolean;
  executor?: string;
  scriptApi?: string;
  splitEnabled?: boolean;
  splitLeftFile?: string | null;
  splitRightFile?: string | null;
  [key: string]: unknown;
}

export interface ExplorerData {
  explorerWidth?: number;
  lastOpenedFile?: string | null;
  expandedFolders?: string[];
  treeOrder?: Record<string, string[]>;
}

export interface ThemeData {
  currentTheme: string;
  availableThemes: string[];
}

const defaultThemes = ["Generic", "Blackhole", "Blindness", "Dark Grape", "Ugly Green", "Evil and Gay", "Soft Twink", "Catppuccin Mocha", "Cheetos and Cream", "Cold Night", "Misanthropic"];
const fallbackDefaults: AppSettings = {
  disableTrayIcon: true,
  editorFontFamily: DEFAULT_EDITOR_FONT_FAMILY,
  editorFontSize: DEFAULT_EDITOR_FONT_SIZE,
  hideTrayFolder: true,
  UIFontFamily: DEFAULT_UI_FONT_FAMILY,
  UIFontSize: DEFAULT_UI_FONT_SIZE,
};

let appDataPath: string | null = null;
let stuffCache: AppStuff | null = null;
let settingsCache: AppSettings | null = null;
let defaultsCache: AppSettings | null = null;
let explorerCache: ExplorerData | null = null;
let themeCache: ThemeData | null = null;

let stuffTimeout: ReturnType<typeof setTimeout> | null = null;
let settingsTimeout: ReturnType<typeof setTimeout> | null = null;
let explorerTimeout: ReturnType<typeof setTimeout> | null = null;
let themeTimeout: ReturnType<typeof setTimeout> | null = null;

const DEBOUNCE_DELAY = 500;

async function appDatapath(): Promise<string> {
  if (!appDataPath) {
    appDataPath = await appDataDir();
  }
  return appDataPath;
}

async function getDataPath(fileName: string): Promise<string> {
  return join(await appDatapath(), fileName);
}

async function readDataFile(fileName: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readTextFile(await getDataPath(fileName)));
  } catch {
    return {};
  }
}

async function writeDataFile(fileName: string, data: unknown): Promise<void> {
  const filePath = await getDataPath(fileName);
  await writeTextFile(filePath, JSON.stringify(data, null, 2));
}

function queueSave(
  timer: ReturnType<typeof setTimeout> | null,
  save: () => Promise<void>,
): ReturnType<typeof setTimeout> {
  if (timer) {
    clearTimeout(timer);
  }

  return setTimeout(() => {
    void save().catch(() => {});
  }, DEBOUNCE_DELAY);
}

async function readDefaults(): Promise<AppSettings> {
  if (defaultsCache !== null) {
    return defaultsCache;
  }

  const defaultsFromFile = await readDataFile("defaults.json") as AppSettings;
  defaultsCache = { ...fallbackDefaults, ...defaultsFromFile };
  return defaultsCache;
}

async function readSettings(): Promise<AppSettings> {
  if (settingsCache !== null) {
    return settingsCache;
  }

  settingsCache = await readDataFile("settings.json") as AppSettings;
  return settingsCache;
}

export async function readStuff(): Promise<AppStuff> {
  if (stuffCache !== null) {
    return stuffCache;
  }

  stuffCache = await readDataFile("stuff.json") as AppStuff;
  return stuffCache;
}

export function getCachedStuff(): AppStuff | null {
  return stuffCache;
}

export async function readExplorerData(): Promise<ExplorerData> {
  if (explorerCache !== null) {
    return explorerCache;
  }

  explorerCache = await readDataFile("explorer.json") as ExplorerData;
  return explorerCache;
}

export async function loadSettings(): Promise<AppSettings> {
  const defaults = await readDefaults();
  const settings = await readSettings();
  const merged = { ...defaults, ...settings } as AppSettings;
  const mergedKeybinds = mergeKeybinds(merged.keybinds as Partial<Keybinds> | undefined);
  return { ...merged, keybinds: mergedKeybinds };
}

export async function saveSetting(key: string, value: unknown): Promise<void> {
  if (settingsCache === null) {
    settingsCache = await readSettings();
  }

  settingsCache[key] = value;
  settingsTimeout = queueSave(settingsTimeout, () => writeDataFile("settings.json", settingsCache ?? {}));
}

export async function saveStuff(key: string, value: unknown): Promise<void> {
  if (stuffCache === null) {
    stuffCache = await readStuff();
  }

  stuffCache[key] = value;
  stuffTimeout = queueSave(stuffTimeout, () => writeDataFile("stuff.json", stuffCache ?? {}));
}

export async function saveExplorerData(key: keyof ExplorerData, value: unknown): Promise<void> {
  if (explorerCache === null) {
    explorerCache = await readExplorerData();
  }

  (explorerCache as Record<string, unknown>)[key] = value;
  explorerTimeout = queueSave(explorerTimeout, () => writeDataFile("explorer.json", explorerCache ?? {}));
}

export async function readThemeData(): Promise<ThemeData> {
  if (themeCache !== null) {
    return themeCache;
  }

  const parsed = await readDataFile("themes.json");
  const currentTheme = typeof parsed.currentTheme === "string" ? parsed.currentTheme : "Generic";
  const availableThemes = Array.isArray(parsed.availableThemes)
    ? parsed.availableThemes.filter((theme): theme is string => typeof theme === "string")
    : [];

  themeCache = {
    currentTheme,
    availableThemes: [...new Set([...availableThemes, ...defaultThemes])],
  };

  return themeCache;
}

export async function saveTheme(themeName: string): Promise<void> {
  if (themeCache === null) {
    themeCache = await readThemeData();
  }

  themeCache.currentTheme = themeName;
  themeTimeout = queueSave(themeTimeout, () => writeDataFile("themes.json", themeCache ?? {}));
}
