import React from "react";
import ReactDOM from "react-dom/client";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import "./styles/fonts.css";
import "./styles/globals.css";
import App from "./App";
import ConsoleWindow from "./ConsoleWindow";
import { SettingsProvider } from "./contexts/SettingsContext";
import { loadSettings, readStuff, readThemeData } from "./utils/appData";

type SeededWindow = Window & {
  __INITIAL_THEME__?: string;
  __INITIAL_HIDE_TRAY_FOLDER__?: boolean;
  __INITIAL_SIDEBAR_VISIBLE__?: boolean;
  __INITIAL_SIDEBAR_ON_RIGHT__?: boolean;
};

const DEFAULT_THEME = "Generic";

type MonacoWindow = Window & {
  MonacoEnvironment?: {
    getWorker?: (_workerId: string, _label: string) => Worker;
  };
};

const normalizeTheme = (themeName: string): string => themeName.toLowerCase().replace(/\s+/g, "-");

const applyThemeToDocument = (themeName: string): void => {
  const normalizedTheme = normalizeTheme(themeName);
  document.documentElement.setAttribute("data-theme", normalizedTheme);
  document.body.setAttribute("data-theme", normalizedTheme);
};

const isConsoleMode = window.location.href.includes("mode=console");

const monacoWindow = window as MonacoWindow;
const currentMonacoEnvironment = monacoWindow.MonacoEnvironment;
if (!currentMonacoEnvironment || typeof currentMonacoEnvironment.getWorker !== "function") {
  if (currentMonacoEnvironment) {
    monacoWindow.MonacoEnvironment = {
      ...currentMonacoEnvironment,
      getWorker: () => new EditorWorker(),
    };
  } else {
    monacoWindow.MonacoEnvironment = {
      getWorker: () => new EditorWorker(),
    };
  }
}

const bootstrap = async (): Promise<void> => {
  let initialTheme = DEFAULT_THEME;
  let initialHideTrayFolder = true;
  let initialSidebarVisible = true;
  let initialSidebarOnRight = false;
  let autoHideSidebar = false;

  const [themeDataResult, settingsResult, stuffResult] = await Promise.allSettled([
    readThemeData(),
    loadSettings(),
    readStuff(),
  ]);

  if (themeDataResult.status === "fulfilled") {
    initialTheme = themeDataResult.value.currentTheme;
  }

  if (settingsResult.status === "fulfilled") {
    const settings = settingsResult.value;
    initialHideTrayFolder = settings.hideTrayFolder === true;
    autoHideSidebar = settings.autoHideSidebar === true;
    if (autoHideSidebar) {
      initialSidebarVisible = false;
    }
  }

  if (stuffResult.status === "fulfilled") {
    const stuff = stuffResult.value;
    if (autoHideSidebar !== true && stuff.sidebarVisible !== undefined) {
      initialSidebarVisible = stuff.sidebarVisible === true;
    }
    if (stuff.sidebarOnRight === true) {
      initialSidebarOnRight = true;
    }
  }

  (window as SeededWindow).__INITIAL_THEME__ = initialTheme;
  (window as SeededWindow).__INITIAL_HIDE_TRAY_FOLDER__ = initialHideTrayFolder;
  (window as SeededWindow).__INITIAL_SIDEBAR_VISIBLE__ = initialSidebarVisible;
  (window as SeededWindow).__INITIAL_SIDEBAR_ON_RIGHT__ = initialSidebarOnRight;
  applyThemeToDocument(initialTheme);

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <SettingsProvider>
        {isConsoleMode ? <ConsoleWindow /> : <App />}
      </SettingsProvider>
    </React.StrictMode>,
  );
};

void bootstrap();
