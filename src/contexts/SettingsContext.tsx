import { createContext, useContext, useState, useEffect, ReactNode, useMemo, useCallback, type Context } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { KeybindAction, Keybinds, defaultKeybinds, mergeKeybinds } from "../utils/keybinds";
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

export interface UiSettingsContextType {
  appTitle: string;
  setAppTitle: (title: string) => void;
  explorerWidth: number;
  setExplorerWidth: (width: number) => void;
  commitExplorerWidth: (width: number) => void;
  currentTheme: string;
  setTheme: (theme: string) => void;
  availableThemes: string[];
  sidebarVisible: boolean;
  setSidebarVisible: (visible: boolean) => void;
  toggleSidebar: () => void;
  executor: string;
  setExecutor: (value: string) => void;
}

export interface EditorSettingsContextType {
  hideFileExtensions: boolean;
  setHideFileExtensions: (value: boolean) => void;
  disableLinting: boolean;
  setDisableLinting: (value: boolean) => void;
  wordWrapEnabled: boolean;
  setWordWrapEnabled: (value: boolean) => void;
  smoothTypingEnabled: boolean;
  setSmoothTypingEnabled: (value: boolean) => void;
  disableIndentGuides: boolean;
  setDisableIndentGuides: (value: boolean) => void;
}

export interface RuntimeSettingsContextType {
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
  discordRpcEnabled: boolean;
  setDiscordRpcEnabled: (value: boolean) => void;
  unlockFps: boolean;
  setUnlockFps: (value: boolean) => void;
  hideMultiInstanceButton: boolean;
  setHideMultiInstanceButton: (value: boolean) => void;
  placeEditorButtonsInOtherPlace: boolean;
  setPlaceEditorButtonsInOtherPlace: (value: boolean) => void;
  autoHideSidebar: boolean;
  setAutoHideSidebar: (value: boolean) => void;
  disableHistory: boolean;
  setDisableHistory: (value: boolean) => void;
  loadFpsUnlockStatus: () => Promise<void>;
}

export interface KeybindSettingsContextType {
  keybinds: Keybinds;
  setKeybind: (actionId: KeybindAction, combo: string) => void;
  resetKeybind: (actionId: KeybindAction) => void;
  resetAllKeybinds: () => void;
}

export interface SettingsLoadingContextType {
  isLoading: boolean;
}

const UiSettingsContext = createContext<UiSettingsContextType | undefined>(undefined);
const EditorSettingsContext = createContext<EditorSettingsContextType | undefined>(undefined);
const RuntimeSettingsContext = createContext<RuntimeSettingsContextType | undefined>(undefined);
const KeybindSettingsContext = createContext<KeybindSettingsContextType | undefined>(undefined);
const SettingsLoadingContext = createContext<SettingsLoadingContextType | undefined>(undefined);

const DEFAULT_THEME = "Generic";

type WindowWithInitialTheme = Window & {
  __CELESTIAL_INITIAL_THEME__?: string;
  __CELESTIAL_INITIAL_HIDE_TRAY_FOLDER__?: boolean;
  __CELESTIAL_INITIAL_SIDEBAR_VISIBLE__?: boolean;
};

function getInitialTheme(): string {
  const seededTheme = (window as WindowWithInitialTheme).__CELESTIAL_INITIAL_THEME__;
  if (typeof seededTheme === "string" && seededTheme.trim().length > 0) {
    return seededTheme;
  }

  return DEFAULT_THEME;
}

function getTrayFolderHide(): boolean {
  return (window as WindowWithInitialTheme).__CELESTIAL_INITIAL_HIDE_TRAY_FOLDER__ === true;
}

function getSidebarVisible(): boolean {
  const seededSidebarVisible = (window as WindowWithInitialTheme).__CELESTIAL_INITIAL_SIDEBAR_VISIBLE__;
  if (typeof seededSidebarVisible === "boolean") {
    return seededSidebarVisible;
  }

  return true;
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

  const [appTitle, setAppTitleState] = useState("Celestial UI");
  const [hideFileExtensions, setHideFileExtensionsState] = useState(false);
  const [showRawLogs, setShowRawLogsState] = useState(false);
  const [autoWatchLogs, setAutoWatchLogsState] = useState(false);
  const [preventUpdates, setPreventUpdatesState] = useState(false);
  const [disableTrayIcon, setDisableTrayIconState] = useState(true);
  const [hideTrayFolder, setHideTrayFolderState] = useState(initialHideTrayFolder);
  const [discordRpcEnabled, setDiscordRpcEnabledState] = useState(true);
  const [unlockFps, setUnlockFpsState] = useState(false);
  const [hideMultiInstanceButton, setHideMultiInstanceButtonState] = useState(false);
  const [placeEditorButtonsInOtherPlace, setPlaceEditorButtonsInOtherPlaceState] = useState(false);
  const [autoHideSidebar, setAutoHideSidebarState] = useState(false);
  const [disableHistory, setDisableHistoryState] = useState(false);
  const [disableLinting, setDisableLintingState] = useState(false);
  const [wordWrapEnabled, setWordWrapEnabledState] = useState(false);
  const [smoothTypingEnabled, setSmoothTypingEnabledState] = useState(false);
  const [disableIndentGuides, setDisableIndentGuidesState] = useState(false);
  const [explorerWidth, setExplorerWidthState] = useState(200);
  const [currentTheme, setCurrentThemeState] = useState(initialTheme);
  const [availableThemes, setAvailableThemesState] = useState<string[]>(["Generic"]);
  const [sidebarVisible, setSidebarVisibleState] = useState(initialSidebarVisible);
  const [executor, setExecutorState] = useState<ExecutorValue>("opium");
  const [keybinds, setKeybindsState] = useState<Keybinds>(defaultKeybinds);
  const [isLoading, setIsLoading] = useState(true);

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
    let isCancelled = false;

    const loadImportantStuff = async () => {
      const [settings, themeData] = await Promise.all([
        loadSettings(),
        readThemeData(),
      ]);

      if (isCancelled) {
        return;
      }

      setAppTitleState(settings.title || "Celestial UI");
      setHideFileExtensionsState(settings.hideFileExtensions === true);
      setShowRawLogsState(settings.showRawLogs === true);
      setAutoWatchLogsState(settings.autoWatchLogs === true);
      setPreventUpdatesState(settings.preventUpdates === true);
      setDisableTrayIconState(settings.disableTrayIcon === true);
      setHideTrayFolderState(settings.hideTrayFolder === true);
      setDiscordRpcEnabledState(settings.discordRpcEnabled !== false);
      setHideMultiInstanceButtonState(settings.hideMultiInstanceButton === true);
      setPlaceEditorButtonsInOtherPlaceState(settings.placeEditorButtonsInOtherPlace === true);
      setAutoHideSidebarState(settings.autoHideSidebar === true);
      setDisableHistoryState(settings.disableHistory === true);
      setDisableLintingState(settings.disableLinting === true);
      setWordWrapEnabledState(settings.wordWrapEnabled === true);
      setSmoothTypingEnabledState(settings.smoothTypingEnabled === true);
      setDisableIndentGuidesState(settings.disableIndentGuides === true);
      if (settings.autoHideSidebar === true) {
        setSidebarVisibleState(false);
      }
      const normalizedKeybinds = mergeKeybinds(settings.keybinds as Partial<Keybinds> | undefined);
      setKeybindsState(normalizedKeybinds);

      const rawKeybinds = settings.keybinds as Record<string, unknown> | undefined;
      if (
        rawKeybinds &&
        (
          "switchFilePrev" in rawKeybinds ||
          "switchFileNext" in rawKeybinds ||
          "switchPage1" in rawKeybinds ||
          "switchPage2" in rawKeybinds ||
          "switchPage3" in rawKeybinds ||
          "switchPage4" in rawKeybinds ||
          "switchPage5" in rawKeybinds ||
          "switchPage6" in rawKeybinds
        )
      ) {
        saveSetting("keybinds", normalizedKeybinds);
      }

      setCurrentThemeState(themeData.currentTheme);
      setAvailableThemesState(themeData.availableThemes);
      setIsLoading(false);
    };

    const loadLessImportantStuff = async () => {
      const [explorerData, stuff, settings] = await Promise.all([readExplorerData(), readStuff(), loadSettings()]);

      if (isCancelled) {
        return;
      }

      if (typeof explorerData.explorerWidth === "number") {
        setExplorerWidthState(explorerData.explorerWidth);
      }

      if (stuff.sidebarVisible !== undefined && settings.autoHideSidebar !== true) {
        setSidebarVisibleState(stuff.sidebarVisible === true);
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

  const setAppTitle = useCallback((newTitle: string) => {
    setAppTitleState(newTitle);
    saveSetting("title", newTitle);
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

  const setDiscordRpcEnabled = useCallback((value: boolean) => {
    setDiscordRpcEnabledState(value);
    saveSetting("discordRpcEnabled", value);
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
  }, []);

  const setHideMultiInstanceButton = useCallback((value: boolean) => {
    setHideMultiInstanceButtonState(value);
    saveSetting("hideMultiInstanceButton", value);
    if (value) {
      saveStuff("showAccountsPanel", false);
    }
  }, []);

  const setPlaceEditorButtonsInOtherPlace = useCallback((value: boolean) => {
    setPlaceEditorButtonsInOtherPlaceState(value);
    saveSetting("placeEditorButtonsInOtherPlace", value);
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

  const commitExplorerWidth = useCallback((finalWidth: number) => {
    saveExplorerData("explorerWidth", finalWidth);
  }, []);

  const setTheme = useCallback((theme: string) => {
    setCurrentThemeState(theme);
    saveTheme(theme);
    emit("theme-changed", theme).catch(() => {});
  }, []);

  const setSidebarVisible = useCallback((visible: boolean) => {
    setSidebarVisibleState(visible);
    saveStuff("sidebarVisible", visible);
  }, []);

  const setExecutor = useCallback((value: string) => {
    const normalized = normalizeTheCutor(value) ?? "opium";
    if (normalized === executor) {
      return;
    }
    setExecutorState(normalized);
    saveStuff("executor", normalized);
    // need to clear clients so it doesnt use old exec and crash
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
    appTitle,
    setAppTitle,
    explorerWidth,
    setExplorerWidth,
    commitExplorerWidth,
    currentTheme,
    setTheme,
    availableThemes,
    sidebarVisible,
    setSidebarVisible,
    toggleSidebar,
    executor,
    setExecutor,
  }), [
    appTitle,
    setAppTitle,
    explorerWidth,
    setExplorerWidth,
    commitExplorerWidth,
    currentTheme,
    setTheme,
    availableThemes,
    sidebarVisible,
    setSidebarVisible,
    toggleSidebar,
    executor,
    setExecutor,
  ]);

  const editorValue = useMemo<EditorSettingsContextType>(() => ({
    hideFileExtensions,
    setHideFileExtensions,
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
    discordRpcEnabled,
    setDiscordRpcEnabled,
    unlockFps,
    setUnlockFps,
    hideMultiInstanceButton,
    setHideMultiInstanceButton,
    placeEditorButtonsInOtherPlace,
    setPlaceEditorButtonsInOtherPlace,
    autoHideSidebar,
    setAutoHideSidebar,
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
    discordRpcEnabled,
    setDiscordRpcEnabled,
    unlockFps,
    setUnlockFps,
    hideMultiInstanceButton,
    setHideMultiInstanceButton,
    placeEditorButtonsInOtherPlace,
    setPlaceEditorButtonsInOtherPlace,
    autoHideSidebar,
    setAutoHideSidebar,
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
        <EditorSettingsContext.Provider value={editorValue}>
          <RuntimeSettingsContext.Provider value={runtimeValue}>
            <KeybindSettingsContext.Provider value={keybindValue}>
              {children}
            </KeybindSettingsContext.Provider>
          </RuntimeSettingsContext.Provider>
        </EditorSettingsContext.Provider>
      </UiSettingsContext.Provider>
    </SettingsLoadingContext.Provider>
  );
}

export function useUiSettings(): UiSettingsContextType {
  return useRequiredContext(UiSettingsContext, "useUiSettings");
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
