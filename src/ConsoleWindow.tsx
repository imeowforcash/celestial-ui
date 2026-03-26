import { useState, useEffect, useLayoutEffect, useMemo } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { useSettingsLoading, useUiSettings } from "./contexts/SettingsContext";
import TrafficLights from "./components/TrafficLights";
import Console from "./pages/Console";
import { Toaster } from "./components/ui/sonner";
import { cn } from "./utils/ui";
import shellStyles from "./styles/AppShell.module.css";

function ConsoleWindow() {
  const [isFocused, setIsFocused] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { currentTheme, setTheme } = useUiSettings();
  const { isLoading } = useSettingsLoading();

  const appWindow = useMemo(() => getCurrentWindow(), []);

  useLayoutEffect(() => {
    const themeValue = currentTheme.toLowerCase().replace(/\s+/g, '-');
    document.body.setAttribute('data-theme', themeValue);
    document.documentElement.setAttribute('data-theme', themeValue);
  }, [currentTheme]);

  useEffect(() => {
    const unlisten = listen<string>("theme-changed", (event) => {
      setTheme(event.payload);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [setTheme]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    
    const setupListener = async () => {
      unlisten = await appWindow.onFocusChanged(({ payload: focused }) => {
        setIsFocused(focused);
      });
    };

    setupListener();

    return () => {
      if (unlisten) unlisten();
    };
  }, [appWindow]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    
    const setupFullscreenListener = async () => {
      unlisten = await appWindow.onResized(async () => {
        const fs = await appWindow.isFullscreen();
        setIsFullscreen(fs);
      });
    };
    
    appWindow.isFullscreen().then(setIsFullscreen);
    
    setupFullscreenListener();

    return () => {
      if (unlisten) unlisten();
    };
  }, [appWindow]);

  if (isLoading) {
    return null;
  }

  return (
    <div 
      className={cn(shellStyles["app-container"], !isFocused && shellStyles.unfocused)} 
      data-theme={currentTheme.toLowerCase().replace(/\s+/g, '-')}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className={cn(shellStyles["app-bg"], shellStyles.noselect)} data-fullscreen={isFullscreen}>
        <div className={shellStyles["main-layout"]}>
          <Console isStandalone={true} />
        </div>
      </div>
      {!isFullscreen && (
        <div data-tauri-drag-region className={cn(shellStyles.titlebar, shellStyles["standalone-console-titlebar"])}>
          <div className={shellStyles["traffic-lights-wrapper"]}>
            <TrafficLights isFocused={isFocused} />
          </div>
          <div className={shellStyles["titlebar-separator"]}></div>
          <span className={cn(shellStyles.noselect, shellStyles["app-title"])}>Console</span>
        </div>
      )}
      <Toaster />
    </div>
  );
}

export default ConsoleWindow;
