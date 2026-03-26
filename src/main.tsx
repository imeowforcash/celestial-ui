import React from "react";
import ReactDOM from "react-dom/client";
import "./fonts.css";
import "./App.css";
import App from "./App";
import ConsoleWindow from "./ConsoleWindow";
import { SettingsProvider } from "./contexts/SettingsContext";
import { loadSettings, readStuff, readThemeData } from "./utils/appData";

type SeededWindow = Window & {
  __CELESTIAL_INITIAL_THEME__?: string;
  __CELESTIAL_INITIAL_HIDE_TRAY_FOLDER__?: boolean;
  __CELESTIAL_INITIAL_SIDEBAR_VISIBLE__?: boolean;
};

const DEFAULT_THEME = "Generic";

const normalizeTheme = (themeName: string): string => themeName.toLowerCase().replace(/\s+/g, "-");

const applyThemeToDocument = (themeName: string): void => {
  const normalizedTheme = normalizeTheme(themeName);
  document.documentElement.setAttribute("data-theme", normalizedTheme);
  document.body.setAttribute("data-theme", normalizedTheme);
};

const isConsoleMode = window.location.search.includes("mode=console") || 
                      window.location.hash.includes("mode=console") ||
                      window.location.href.includes("mode=console");

const bootstrap = async (): Promise<void> => {
  let initialTheme = DEFAULT_THEME;
  let initialHideTrayFolder = true;
  let initialSidebarVisible = true;
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

  if (stuffResult.status === "fulfilled" && autoHideSidebar !== true) {
    initialSidebarVisible = stuffResult.value.sidebarVisible ?? initialSidebarVisible;
  }

  (window as SeededWindow).__CELESTIAL_INITIAL_THEME__ = initialTheme;
  (window as SeededWindow).__CELESTIAL_INITIAL_HIDE_TRAY_FOLDER__ = initialHideTrayFolder;
  (window as SeededWindow).__CELESTIAL_INITIAL_SIDEBAR_VISIBLE__ = initialSidebarVisible;
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
