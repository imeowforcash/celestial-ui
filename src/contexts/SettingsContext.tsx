import { createContext, useContext, useState, useEffect, ReactNode, useMemo, useCallback, useRef, type Context } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import { KeybindAction, Keybinds, defaultKeybinds, mergeKeybinds } from "../utils/keybinds";
import {
  DEFAULT_EDITOR_FONT_FAMILY,
  DEFAULT_EDITOR_FONT_SIZE,
  DEFAULT_UI_FONT_FAMILY,
  DEFAULT_UI_FONT_SIZE,
} from "../utils/fontConfig";
import {
  loadSettings,
  saveSetting,
  readExplorerData,
  saveExplorerData,
  readThemeData,
  saveTheme,
  readStuff,
  saveStuff,
} from "../utils/appData";

interface UiSettingsContextType {
  appTitle: string;
  accountsPanelOnLeft: boolean;
  setAppTitle: (title: string) => void;
  explorerWidth: number;
  explorerOnLeft: boolean;
  setAccountsPanelOnLeft: (value: boolean) => void;
  setExplorerWidth: (width: number) => void;
  setExplorerOnLeft: (value: boolean) => void;
  commitExplorerWidth: (width: number) => void;
  currentTheme: string;
  setTheme: (theme: string) => void;
  availableThemes: string[];
  sidebarOnRight: boolean;
  tightSpacing: boolean;
  sidebarVisible: boolean;
  setSidebarOnRight: (value: boolean) => void;
  setTightSpacing: (value: boolean) => void;
  setSidebarVisible: (visible: boolean) => void;
  toggleSidebar: () => void;
  executor: string;
  setExecutor: (value: string) => void;
}

interface FontSettingsContextType {
  editorFontFamily: string;
  editorFontSize: number;
  setEditorFontFamily: (value: string) => void;
  setEditorFontSize: (value: number) => void;
  UIFontFamily: string;
  UIFontSize: number;
  setUiFontFamily: (value: string) => void;
  setUiFontSize: (value: number) => void;
}

interface EditorSettingsContextType {
  hideFileExtensions: boolean;
  setHideFileExtensions: (value: boolean) => void;
  addKingVon: boolean;
  setAddKingVon: (value: boolean) => void;
  disableLinting: boolean;
  setDisableLinting: (value: boolean) => void;
  wordWrapEnabled: boolean;
  setWordWrapEnabled: (value: boolean) => void;
  smoothTypingEnabled: boolean;
  setSmoothTypingEnabled: (value: boolean) => void;
  disableIndentGuides: boolean;
  setDisableIndentGuides: (value: boolean) => void;
}

interface RuntimeSettingsContextType {
  showRawLogs: boolean;
  setShowRawLogs: (value: boolean) => void;
  autoWatchLogs: boolean;
  setAutoWatchLogs: (value: boolean) => void;
  preventUpdates: boolean;
  setPreventUpdates: (value: boolean) => void;
  disableTrayIcon: boolean;
  setDisableTrayIcon: (value: boolean) => void;
  hideTrayFolder: boolean;
  setHideTrayFolder: (value: boolean) => void;
  unlockFps: boolean;
  setUnlockFps: (value: boolean) => void;
  hideMultiInstanceButton: boolean;
  setHideMultiInstanceButton: (value: boolean) => void;
  hideRobloxButton: boolean;
  setHideRobloxButton: (value: boolean) => void;
  editorButtonsElsewhere: boolean;
  setPlaceEditorButtonsInOtherPlace: (value: boolean) => void;
  autoHideSidebar: boolean;
  setAutoHideSidebar: (value: boolean) => void;
  useHubble: boolean;
  setUseHubble: (value: boolean) => Promise<void>;
  disableHistory: boolean;
  setDisableHistory: (value: boolean) => void;
  loadFpsUnlockStatus: () => Promise<void>;
}

interface KeybindSettingsContextType {
  keybinds: Keybinds;
  setKeybind: (actionId: KeybindAction, combo: string) => void;
  resetKeybind: (actionId: KeybindAction) => void;
  resetAllKeybinds: () => void;
}

interface SettingsLoadingContextType {
  isLoading: boolean;
}

const UiSettingsContext = createContext<UiSettingsContextType | undefined>(undefined);
const FontSettingsContext = createContext<FontSettingsContextType | undefined>(undefined);
const EditorSettingsContext = createContext<EditorSettingsContextType | undefined>(undefined);
const RuntimeSettingsContext = createContext<RuntimeSettingsContextType | undefined>(undefined);
const KeybindSettingsContext = createContext<KeybindSettingsContextType | undefined>(undefined);
const SettingsLoadingContext = createContext<SettingsLoadingContextType | undefined>(undefined);

const DEFAULT_THEME = "Generic";
const HUBBLE_TOAST_ID = "hubble-setup";

type WindowWithInitialTheme = Window & {
  __INITIAL_THEME__?: string;
  __INITIAL_HIDE_TRAY_FOLDER__?: boolean;
  __INITIAL_SIDEBAR_VISIBLE__?: boolean;
  __INITIAL_SIDEBAR_ON_RIGHT__?: boolean;
};

function getInitialTheme(): string {
  const seededTheme = (window as WindowWithInitialTheme).__INITIAL_THEME__;
  if (typeof seededTheme === "string" && seededTheme.trim().length > 0) {
    return seededTheme;
  }

  return DEFAULT_THEME;
}

function getTrayFolderHide(): boolean {
  return (window as WindowWithInitialTheme).__INITIAL_HIDE_TRAY_FOLDER__ === true;
}

function getSidebarVisible(): boolean {
  const seededSidebarVisible = (window as WindowWithInitialTheme).__INITIAL_SIDEBAR_VISIBLE__;
  if (typeof seededSidebarVisible === "boolean") {
    return seededSidebarVisible;
  }

  return true;
}

function getSidebarOnRight(): boolean {
  return (window as WindowWithInitialTheme).__INITIAL_SIDEBAR_ON_RIGHT__ === true;
}

type ExecutorValue = "hydro" | "opium" | "ms";

function normalizeTheCutor(value: string): ExecutorValue | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "hydro" || normalized === "hydrogen") {
    return "hydro";
  }
  if (normalized === "opium" || normalized === "opiumware") {
    return "opium";
  }
  if (normalized === "ms" || normalized === "macsploit") {
    return "ms";
  }
  return null;
}

function useRequiredContext<T>(context: Context<T | undefined>, name: string): T {
  const value = useContext(context);
  if (value === undefined) {
    throw new Error(`${name} must be used within a SettingsProvider`);
  }
  return value;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const initialTheme = getInitialTheme();
  const initialHideTrayFolder = getTrayFolderHide();
  const initialSidebarVisible = getSidebarVisible();
  const initialSidebarOnRight = getSidebarOnRight();

  const [accountsPanelOnLeft, setAccountsPanelOnLeftState] = useState(true);
  const [appTitle, setAppTitleState] = useState("Celestial UI");
  const [editorFontFamily, setEditorFontFamilyState] = useState(DEFAULT_EDITOR_FONT_FAMILY);
  const [editorFontSize, setEditorFontSizeState] = useState(DEFAULT_EDITOR_FONT_SIZE);
  const [hideFileExtensions, setHideFileExtensionsState] = useState(false);
  const [showRawLogs, setShowRawLogsState] = useState(false);
  const [autoWatchLogs, setAutoWatchLogsState] = useState(false);
  const [preventUpdates, setPreventUpdatesState] = useState(false);
  const [disableTrayIcon, setDisableTrayIconState] = useState(true);
  const [hideTrayFolder, setHideTrayFolderState] = useState(initialHideTrayFolder);
  const [unlockFps, setUnlockFpsState] = useState(false);
  const [hideMultiInstanceButton, setHideMultiInstanceButtonState] = useState(false);
  const [hideRobloxButton, setHideRobloxButtonState] = useState(false);
  const [editorButtonsElsewhere, setEditorButtonsElsewhereState] = useState(false);
  const [autoHideSidebar, setAutoHideSidebarState] = useState(false);
  const [useHubble, setUseHubbleState] = useState(false);
  const [disableHistory, setDisableHistoryState] = useState(false);
  const [addKingVon, setAddKingVonState] = useState(false);
  const [disableLinting, setDisableLintingState] = useState(false);
  const [wordWrapEnabled, setWordWrapEnabledState] = useState(false);
  const [smoothTypingEnabled, setSmoothTypingEnabledState] = useState(false);
  const [disableIndentGuides, setDisableIndentGuidesState] = useState(false);
  const [explorerWidth, setExplorerWidthState] = useState(200);
  const [explorerOnLeft, setExplorerOnLeftState] = useState(false);
  const [currentTheme, setCurrentTheme] = useState(initialTheme);
  const [availableThemes, setAvailableThemes] = useState<string[]>(["Generic"]);
  const [sidebarOnRight, setSidebarOnRightState] = useState(initialSidebarOnRight);
  const [tightSpacing, setTightSpacingState] = useState(false);
  const [sidebarVisible, setSidebarVisibleState] = useState(initialSidebarVisible);
  const [UIFontFamily, setUIFontFamilyState] = useState(DEFAULT_UI_FONT_FAMILY);
  const [UIFontSize, setUIFontSizeState] = useState(DEFAULT_UI_FONT_SIZE);
  const [executor, setExecutorState] = useState<ExecutorValue>("opium");
  const [keybinds, setKeybindsState] = useState<Keybinds>(defaultKeybinds);
  const [isLoading, setIsLoading] = useState(true);
  const setupRef = useRef<Promise<void> | null>(null);
  const wantsHubbleRef = useRef(false);
  const startupHubbleCheckRef = useRef(false);

  useEffect(() => {
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty("--ui-font-family", UIFontFamily);
    rootStyle.setProperty("--ui-font-size", `${UIFontSize}px`);
    rootStyle.setProperty("--editor-font-family", editorFontFamily);
    rootStyle.setProperty("--editor-font-size", `${editorFontSize}px`);
  }, [editorFontFamily, editorFontSize, UIFontFamily, UIFontSize]);

  useEffect(() => {
    const unlisten = listen<{ key: string; value: boolean }>("settings-changed", (event) => {
      const { key, value } = event.payload;
      if (key === "showRawLogs") setShowRawLogsState(value);
      if (key === "autoWatchLogs") setAutoWatchLogsState(value);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    const unlisten = listen<string>("hubble-status", (event) => {
      if (event.payload === "downloading") {
        toast.loading("Downloading Hubble", { id: HUBBLE_TOAST_ID });
        return;
      }

      if (event.payload === "compiling") {
        toast.loading("Compiling Hubble", { id: HUBBLE_TOAST_ID });
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;
    const settingsTask = loadSettings();
    const stuffTask = readStuff();

    const loadImportantStuff = async () => {
      const [settings, themeData, stuff] = await Promise.all([
        settingsTask,
        readThemeData(),
        stuffTask,
      ]);

      if (isCancelled) {
        return;
      }

      setAppTitleState(settings.title ?? "Celestial UI");
      setEditorFontFamilyState(typeof settings.editorFontFamily === "string" ? settings.editorFontFamily : DEFAULT_EDITOR_FONT_FAMILY);
      setEditorFontSizeState(typeof settings.editorFontSize === "number" ? settings.editorFontSize : DEFAULT_EDITOR_FONT_SIZE);
      setHideFileExtensionsState(settings.hideFileExtensions === true);
      setShowRawLogsState(settings.showRawLogs === true);
      setAutoWatchLogsState(settings.autoWatchLogs === true);
      setPreventUpdatesState(settings.preventUpdates === true);
      setDisableTrayIconState(settings.disableTrayIcon === true);
      setHideTrayFolderState(settings.hideTrayFolder === true);
      setHideMultiInstanceButtonState(settings.hideMultiInstanceButton === true);
      setHideRobloxButtonState(settings.hideRobloxButton === true);
      setEditorButtonsElsewhereState(settings.editorButtonsElsewhere === true);
      setAutoHideSidebarState(settings.autoHideSidebar === true);
      const wantsHubble = settings.useHubble === true;
      wantsHubbleRef.current = wantsHubble;
      startupHubbleCheckRef.current = wantsHubble;
      setUseHubbleState(false);
      setDisableHistoryState(settings.disableHistory === true);
      setAddKingVonState(settings.addKingVon === true);
      setDisableLintingState(settings.disableLinting === true);
      setWordWrapEnabledState(settings.wordWrapEnabled === true);
      setSmoothTypingEnabledState(settings.smoothTypingEnabled === true);
      setDisableIndentGuidesState(settings.disableIndentGuides === true);
      if (settings.autoHideSidebar === true) {
        setSidebarVisibleState(false);
      } else if (stuff.sidebarVisible !== undefined) {
        setSidebarVisibleState(stuff.sidebarVisible === true);
      }
      if (stuff.sidebarOnRight !== undefined) {
        setSidebarOnRightState(stuff.sidebarOnRight === true);
      }
      const normalizedKeybinds = mergeKeybinds(settings.keybinds as Partial<Keybinds> | undefined);
      setKeybindsState(normalizedKeybinds);

      setCurrentTheme(themeData.currentTheme);
      setAvailableThemes(themeData.availableThemes);
      setUIFontFamilyState(typeof settings.UIFontFamily === "string" ? settings.UIFontFamily : DEFAULT_UI_FONT_FAMILY);
      setUIFontSizeState(typeof settings.UIFontSize === "number" ? settings.UIFontSize : DEFAULT_UI_FONT_SIZE);
      setTightSpacingState(stuff.tightSpacing === true);
      setIsLoading(false);
    };

    const loadLessImportantStuff = async () => {
      const [explorerData, stuff] = await Promise.all([readExplorerData(), stuffTask]);

      if (isCancelled) {
        return;
      }

      if (typeof explorerData.explorerWidth === "number") {
        setExplorerWidthState(explorerData.explorerWidth);
      }

      if (stuff.accountsPanelOnLeft === false) {
        setAccountsPanelOnLeftState(false);
      }

      if (stuff.explorerOnLeft === true) {
        setExplorerOnLeftState(true);
      }

      if (typeof stuff.executor === "string") {
        const executorValue = normalizeTheCutor(stuff.executor);
        if (executorValue) {
          setExecutorState(executorValue);
        }
      }
    };

    void loadImportantStuff();
    void loadLessImportantStuff();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isLoading || !startupHubbleCheckRef.current) {
      return;
    }

    let isCancelled = false;
    let firstFrame = 0;
    let secondFrame = 0;

    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        void invoke<boolean>("is_hubble_ready")
          .catch(() => false)
          .then((isReady) => {
            if (isCancelled) {
              return;
            }

            startupHubbleCheckRef.current = false;
            setUseHubbleState(isReady);
            if (!isReady) {
              wantsHubbleRef.current = false;
              saveSetting("useHubble", false);
            }
          });
      });
    });

    return () => {
      isCancelled = true;
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [isLoading]);

  const setAppTitle = useCallback((newTitle: string) => {
    setAppTitleState(newTitle);
    saveSetting("title", newTitle);
  }, []);

  const setEditorFontFamily = useCallback((value: string) => {
    setEditorFontFamilyState(value);
    saveSetting("editorFontFamily", value);
  }, []);

  const setEditorFontSize = useCallback((value: number) => {
    setEditorFontSizeState(value);
    saveSetting("editorFontSize", value);
  }, []);

  const setAccountsPanelOnLeft = useCallback((value: boolean) => {
    setAccountsPanelOnLeftState(value);
    saveStuff("accountsPanelOnLeft", value);
  }, []);

  const setHideFileExtensions = useCallback((value: boolean) => {
    setHideFileExtensionsState(value);
    saveSetting("hideFileExtensions", value);
  }, []);

  const setShowRawLogs = useCallback((value: boolean) => {
    setShowRawLogsState(value);
    saveSetting("showRawLogs", value);
    emit("settings-changed", { key: "showRawLogs", value }).catch(() => {});
  }, []);

  const setAutoWatchLogs = useCallback((value: boolean) => {
    setAutoWatchLogsState(value);
    saveSetting("autoWatchLogs", value);
    emit("settings-changed", { key: "autoWatchLogs", value }).catch(() => {});
  }, []);

  const setPreventUpdates = useCallback((value: boolean) => {
    setPreventUpdatesState(value);
    saveSetting("preventUpdates", value);
  }, []);

  const setDisableTrayIcon = useCallback((value: boolean) => {
    setDisableTrayIconState(value);
    saveSetting("disableTrayIcon", value);
    invoke("set_tray_icon_disabled", { disabled: value }).catch(() => {});
  }, []);

  const setHideTrayFolder = useCallback((value: boolean) => {
    setHideTrayFolderState(value);
    saveSetting("hideTrayFolder", value);
    invoke("set_tray_folder_hidden", { hidden: value }).catch(() => {});
  }, []);

  const setHideMultiInstanceButton = useCallback((value: boolean) => {
    setHideMultiInstanceButtonState(value);
    saveSetting("hideMultiInstanceButton", value);
    if (value) {
      saveStuff("showAccountsPanel", false);
    }
  }, []);

  const setHideRobloxButton = useCallback((value: boolean) => {
    setHideRobloxButtonState(value);
    saveSetting("hideRobloxButton", value);
  }, []);

  const setPlaceEditorButtonsInOtherPlace = useCallback((value: boolean) => {
    setEditorButtonsElsewhereState(value);
    saveSetting("editorButtonsElsewhere", value);
  }, []);

  const setAutoHideSidebar = useCallback((value: boolean) => {
    setAutoHideSidebarState(value);
    saveSetting("autoHideSidebar", value);
    if (value) {
      setSidebarVisibleState(false);
      saveStuff("sidebarVisible", false);
      return;
    }
    setSidebarVisibleState(true);
    saveStuff("sidebarVisible", true);
  }, []);

  const setUseHubble = useCallback(async (value: boolean) => {
    wantsHubbleRef.current = value;

    if (!value) {
      toast.dismiss(HUBBLE_TOAST_ID);
      setUseHubbleState(false);
      saveSetting("useHubble", false);
      return;
    }

    if (useHubble) {
      return;
    }

    if (setupRef.current) {
      await setupRef.current;
      return;
    }

    const setupTask = (async () => {
      try {
        await invoke("ensure_hubble_ready");
        if (!wantsHubbleRef.current) {
          return;
        }
        toast.dismiss(HUBBLE_TOAST_ID);
        setUseHubbleState(true);
        saveSetting("useHubble", true);
      } catch {
        toast.dismiss(HUBBLE_TOAST_ID);
      } finally {
        setupRef.current = null;
      }
    })();

    setupRef.current = setupTask;
    await setupTask;
  }, [useHubble]);

  const setDisableHistory = useCallback(async (value: boolean) => {
    setDisableHistoryState(value);
    saveSetting("disableHistory", value);

    if (!value) {
      return;
    }

    await Promise.all([
      saveStuff("showHistoryPanel", false),
      invoke("clear_history").catch(() => {}),
    ]);
  }, []);

  const setAddKingVon = useCallback((value: boolean) => {
    setAddKingVonState(value);
    saveSetting("addKingVon", value);
  }, []);

  const setDisableLinting = useCallback((value: boolean) => {
    setDisableLintingState(value);
    saveSetting("disableLinting", value);
  }, []);

  const setWordWrapEnabled = useCallback((value: boolean) => {
    setWordWrapEnabledState(value);
    saveSetting("wordWrapEnabled", value);
  }, []);

  const setSmoothTypingEnabled = useCallback((value: boolean) => {
    setSmoothTypingEnabledState(value);
    saveSetting("smoothTypingEnabled", value);
  }, []);

  const setDisableIndentGuides = useCallback((value: boolean) => {
    setDisableIndentGuidesState(value);
    saveSetting("disableIndentGuides", value);
  }, []);

  const setUnlockFps = useCallback(async (value: boolean) => {
    try {
      await invoke("set_fps_unlock", { enabled: value });
      setUnlockFpsState(value);
    } catch {
    }
  }, []);

  const loadFpsUnlockStatus = useCallback(async () => {
    try {
      const fpsStatus = await invoke<boolean>("get_fps_unlock_status");
      setUnlockFpsState(fpsStatus);
    } catch {
    }
  }, []);

  const setExplorerWidth = useCallback((newWidth: number) => {
    setExplorerWidthState(newWidth);
  }, []);

  const setExplorerOnLeft = useCallback((value: boolean) => {
    setExplorerOnLeftState(value);
    saveStuff("explorerOnLeft", value);
  }, []);

  const commitExplorerWidth = useCallback((finalWidth: number) => {
    saveExplorerData("explorerWidth", finalWidth);
  }, []);

  const setTheme = useCallback((theme: string) => {
    setCurrentTheme(theme);
    saveTheme(theme);
    emit("theme-changed", theme).catch(() => {});
  }, []);

  const setSidebarVisible = useCallback((visible: boolean) => {
    setSidebarVisibleState(visible);
    saveStuff("sidebarVisible", visible);
  }, []);

  const setSidebarOnRight = useCallback((value: boolean) => {
    setSidebarOnRightState(value);
    saveStuff("sidebarOnRight", value);
  }, []);

  const setTightSpacing = useCallback((value: boolean) => {
    setTightSpacingState(value);
    saveStuff("tightSpacing", value);
  }, []);

  const setUiFontFamily = useCallback((value: string) => {
    setUIFontFamilyState(value);
    saveSetting("UIFontFamily", value);
  }, []);

  const setUiFontSize = useCallback((value: number) => {
    setUIFontSizeState(value);
    saveSetting("UIFontSize", value);
  }, []);

  const setExecutor = useCallback((value: string) => {
    const normalized = normalizeTheCutor(value) ?? "opium";
    if (normalized === executor) {
      return;
    }
    setExecutorState(normalized);
    saveStuff("executor", normalized);
    invoke("clear_clients").catch(() => {});
  }, [executor]);

  const toggleSidebar = useCallback(() => {
    setSidebarVisibleState((prev) => {
      const next = !prev;
      saveStuff("sidebarVisible", next);
      return next;
    });
  }, []);

  const setKeybind = useCallback((actionId: KeybindAction, combo: string) => {
    setKeybindsState((prev) => {
      const next = { ...prev, [actionId]: combo };
      saveSetting("keybinds", next);
      return next;
    });
  }, []);

  const resetKeybind = useCallback((actionId: KeybindAction) => {
    setKeybindsState((prev) => {
      const next = { ...prev, [actionId]: defaultKeybinds[actionId] };
      saveSetting("keybinds", next);
      return next;
    });
  }, []);

  const resetAllKeybinds = useCallback(() => {
    const next = { ...defaultKeybinds };
    setKeybindsState(next);
    saveSetting("keybinds", next);
  }, []);

  const uiValue = useMemo<UiSettingsContextType>(() => ({
    accountsPanelOnLeft,
    appTitle,
    setAppTitle,
    setAccountsPanelOnLeft,
    explorerWidth,
    explorerOnLeft,
    setExplorerWidth,
    setExplorerOnLeft,
    commitExplorerWidth,
    currentTheme,
    setTheme,
    availableThemes,
    sidebarOnRight,
    tightSpacing,
    sidebarVisible,
    setSidebarOnRight,
    setTightSpacing,
    setSidebarVisible,
    toggleSidebar,
    executor,
    setExecutor,
  }), [
    accountsPanelOnLeft,
    appTitle,
    setAppTitle,
    setAccountsPanelOnLeft,
    explorerWidth,
    explorerOnLeft,
    setExplorerWidth,
    setExplorerOnLeft,
    commitExplorerWidth,
    currentTheme,
    setTheme,
    availableThemes,
    sidebarOnRight,
    tightSpacing,
    sidebarVisible,
    setSidebarOnRight,
    setTightSpacing,
    setSidebarVisible,
    toggleSidebar,
    executor,
    setExecutor,
  ]);

  const fontValue = useMemo<FontSettingsContextType>(() => ({
    editorFontFamily,
    editorFontSize,
    setEditorFontFamily,
    setEditorFontSize,
    UIFontFamily,
    UIFontSize,
    setUiFontFamily,
    setUiFontSize,
  }), [
    editorFontFamily,
    editorFontSize,
    setEditorFontFamily,
    setEditorFontSize,
    UIFontFamily,
    UIFontSize,
    setUiFontFamily,
    setUiFontSize,
  ]);

  const editorValue = useMemo<EditorSettingsContextType>(() => ({
    hideFileExtensions,
    setHideFileExtensions,
    addKingVon,
    setAddKingVon,
    disableLinting,
    setDisableLinting,
    wordWrapEnabled,
    setWordWrapEnabled,
    smoothTypingEnabled,
    setSmoothTypingEnabled,
    disableIndentGuides,
    setDisableIndentGuides,
  }), [
    hideFileExtensions,
    setHideFileExtensions,
    addKingVon,
    setAddKingVon,
    disableLinting,
    setDisableLinting,
    wordWrapEnabled,
    setWordWrapEnabled,
    smoothTypingEnabled,
    setSmoothTypingEnabled,
    disableIndentGuides,
    setDisableIndentGuides,
  ]);

  const runtimeValue = useMemo<RuntimeSettingsContextType>(() => ({
    showRawLogs,
    setShowRawLogs,
    autoWatchLogs,
    setAutoWatchLogs,
    preventUpdates,
    setPreventUpdates,
    disableTrayIcon,
    setDisableTrayIcon,
    hideTrayFolder,
    setHideTrayFolder,
    unlockFps,
    setUnlockFps,
    hideMultiInstanceButton,
    setHideMultiInstanceButton,
    hideRobloxButton,
    setHideRobloxButton,
    editorButtonsElsewhere,
    setPlaceEditorButtonsInOtherPlace,
    autoHideSidebar,
    setAutoHideSidebar,
    useHubble,
    setUseHubble,
    disableHistory,
    setDisableHistory,
    loadFpsUnlockStatus,
  }), [
    showRawLogs,
    setShowRawLogs,
    autoWatchLogs,
    setAutoWatchLogs,
    preventUpdates,
    setPreventUpdates,
    disableTrayIcon,
    setDisableTrayIcon,
    hideTrayFolder,
    setHideTrayFolder,
    unlockFps,
    setUnlockFps,
    hideMultiInstanceButton,
    setHideMultiInstanceButton,
    hideRobloxButton,
    setHideRobloxButton,
    editorButtonsElsewhere,
    setPlaceEditorButtonsInOtherPlace,
    autoHideSidebar,
    setAutoHideSidebar,
    useHubble,
    setUseHubble,
    disableHistory,
    setDisableHistory,
    loadFpsUnlockStatus,
  ]);

  const keybindValue = useMemo<KeybindSettingsContextType>(() => ({
    keybinds,
    setKeybind,
    resetKeybind,
    resetAllKeybinds,
  }), [keybinds, setKeybind, resetKeybind, resetAllKeybinds]);

  const loadingValue = useMemo<SettingsLoadingContextType>(() => ({ isLoading }), [isLoading]);

  return (
    <SettingsLoadingContext.Provider value={loadingValue}>
      <UiSettingsContext.Provider value={uiValue}>
        <FontSettingsContext.Provider value={fontValue}>
          <EditorSettingsContext.Provider value={editorValue}>
            <RuntimeSettingsContext.Provider value={runtimeValue}>
              <KeybindSettingsContext.Provider value={keybindValue}>
                {children}
              </KeybindSettingsContext.Provider>
            </RuntimeSettingsContext.Provider>
          </EditorSettingsContext.Provider>
        </FontSettingsContext.Provider>
      </UiSettingsContext.Provider>
    </SettingsLoadingContext.Provider>
  );
}

export function useUiSettings(): UiSettingsContextType {
  return useRequiredContext(UiSettingsContext, "useUiSettings");
}

export function useFontSettings(): FontSettingsContextType {
  return useRequiredContext(FontSettingsContext, "useFontSettings");
}

export function useEditorSettings(): EditorSettingsContextType {
  return useRequiredContext(EditorSettingsContext, "useEditorSettings");
}

export function useRuntimeSettings(): RuntimeSettingsContextType {
  return useRequiredContext(RuntimeSettingsContext, "useRuntimeSettings");
}

export function useKeybindSettings(): KeybindSettingsContextType {
  return useRequiredContext(KeybindSettingsContext, "useKeybindSettings");
}

export function useSettingsLoading(): SettingsLoadingContextType {
  return useRequiredContext(SettingsLoadingContext, "useSettingsLoading");
}
