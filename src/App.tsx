import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, Suspense, lazy } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getVersion } from '@tauri-apps/api/app';
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { toast } from "sonner";
import TrafficLights from "./components/TrafficLights";
import SidebarButton from "./components/SidebarButton";
import { CodeIcon, TerminalIcon, ServerIcon, SettingsIcon, StatsIcon, LibraryIcon } from "./assets/Icons";
import { useEditorSettings, useKeybindSettings, useRuntimeSettings, useSettingsLoading, useUiSettings } from "./contexts/SettingsContext";
import Editor from "./pages/Editor";
import { Toaster } from "./components/ui/sonner";
import { Button } from "./components/ui/button";
import celestialLogo from "./assets/celestial.png";
import von from "./assets/von.avif";
import { AnimatePresence, LazyMotion, domAnimation, m } from "motion/react";
import { matches, parseKeybinds } from "./utils/keybinds";
import { cn } from "./utils/ui";
import shellStyles from "./styles/AppShell.module.css";

const VIEWS = ['editor', 'console', 'library', 'multi-instance', 'stats', 'settings'] as const;
type ViewType = typeof VIEWS[number];
const SIDEBAR_REVEAL_EDGE_PX = 20;
const SIDEBAR_HIDE_THRESHOLD_PX = 84;
const SIDEBAR_GAP_PX = 12;
const SIDEBAR_GAP_TIGHT_PX = 8;

interface ExecuteScriptPayload {
  script: string;
  name?: string | null;
}

interface ImportDroppedScriptsResult {
  added: string[];
  duplicates: string[];
  rejected: string[];
}

const loadConsolePage = () => import("./pages/Console");
const loadSettingsPage = () => import("./pages/Settings");
const loadMultiInstancePage = () => import("./pages/MultiInstance");
const loadStatsPage = () => import("./pages/StatsTab");
const loadLibraryPage = () => import("./pages/Library");

const Console = lazy(loadConsolePage);
const Settings = lazy(loadSettingsPage);
const MultiInstance = lazy(loadMultiInstancePage);
const StatsTab = lazy(loadStatsPage);
const Library = lazy(loadLibraryPage);

type IdleTaskWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

const scheduleIdleTask = (task: () => void, timeout = 1000): (() => void) => {
  const idleWindow = window as IdleTaskWindow;
  if (typeof idleWindow.requestIdleCallback === "function" && typeof idleWindow.cancelIdleCallback === "function") {
    const idleHandle = idleWindow.requestIdleCallback(task, { timeout });
    return () => idleWindow.cancelIdleCallback?.(idleHandle);
  }

  const timeoutHandle = window.setTimeout(task, timeout);
  return () => window.clearTimeout(timeoutHandle);
};

const preloadNonCriticalViews = async (): Promise<void> => {
  await Promise.all([
    loadConsolePage(),
    loadLibraryPage(),
    loadSettingsPage(),
    loadMultiInstancePage(),
    loadStatsPage(),
  ]);
};

const isEditableElement = (element: Element | null): boolean => {
  return element instanceof HTMLElement && Boolean(
    element.closest("input, textarea, select, [contenteditable='true']"),
  );
};

const isDroppableScriptPath = (path: string): boolean => {
  const lowerPath = path.toLowerCase();
  return lowerPath.endsWith(".lua") || lowerPath.endsWith(".luau");
};

function App() {
  const [activeView, setActiveView] = useState<ViewType>('editor');
  const [isOutdated, setIsOutdated] = useState<boolean>(false);
  const [updateInfo, setUpdateInfo] = useState<{ currentVersion: string; latestVersion: string; changelog: string } | null>(null);
  const [documentsAccessDenied, setDocumentsAccessDenied] = useState(false);
  const [documentsOverlayDismissed, setDocumentsOverlayDismissed] = useState(false);
  const [keepConsoleMounted, setKeepConsoleMounted] = useState(false);
  const [keepLibraryMounted, setKeepLibraryMounted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasLiquidGlass, setHasLiquidGlass] = useState(false);
  const [mountNonEditorViews, setMountNonEditorViews] = useState(false);
  const [isEditorReady, setIsEditorReady] = useState(false);
  
  const { appTitle, currentTheme, sidebarOnRight, tightSpacing, sidebarVisible, setSidebarVisible, toggleSidebar } = useUiSettings();
  const { addKingVon } = useEditorSettings();
  const { autoHideSidebar, preventUpdates } = useRuntimeSettings();
  const { keybinds } = useKeybindSettings();
  const { isLoading } = useSettingsLoading();

  const appVersionPromiseRef = useRef<Promise<string> | null>(null);
  const getAppVersion = useCallback((): Promise<string> => {
    if (!appVersionPromiseRef.current) {
      appVersionPromiseRef.current = getVersion();
    }
    return appVersionPromiseRef.current;
  }, []);

  const checkDocumentsAccess = useCallback(() => {
    void invoke<boolean>("check_documents_access")
      .then((hasAccess) => {
        setDocumentsAccessDenied(!hasAccess);
        if (hasAccess) {
          setDocumentsOverlayDismissed(false);
        }
      })
      .catch(() => {
        setDocumentsAccessDenied(false);
      });
  }, []);

  const handleTitlebarPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest("button, input, textarea, select, [contenteditable='true']")) {
      return;
    }

    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) {
      activeElement.blur();
    }
  }, []);

  useEffect(() => {
    if (isLoading || !isEditorReady) {
      return;
    }

    let isCancelled = false;
    const cancelIdleTask = scheduleIdleTask(() => {
      void preloadNonCriticalViews()
        .then(() => {
          if (!isCancelled) {
            setMountNonEditorViews(true);
          }
        })
        .catch(() => {});
    }, 600);

    return () => {
      isCancelled = true;
      cancelIdleTask();
    };
  }, [isEditorReady, isLoading]);

  const preloadView = useCallback(async (view: ViewType): Promise<void> => {
    if (view === "editor") {
      return;
    }

    const loaders: Record<Exclude<ViewType, "editor">, () => Promise<unknown>> = {
      console: loadConsolePage,
      library: loadLibraryPage,
      "multi-instance": loadMultiInstancePage,
      stats: loadStatsPage,
      settings: loadSettingsPage,
    };

    await loaders[view]();
  }, []);

  const setActiveViewSafely = useCallback((view: ViewType) => {
    if (view === "editor") {
      setActiveView("editor");
      return;
    }

    void preloadView(view)
      .then(() => {
        setActiveView(view);
      })
      .catch(() => {
        setActiveView(view);
      });
  }, [preloadView]);

  useLayoutEffect(() => {
    const themeValue = currentTheme.toLowerCase().replace(/\s+/g, '-');
    document.body.setAttribute('data-theme', themeValue);
    document.documentElement.setAttribute('data-theme', themeValue);
  }, [currentTheme]);

  useEffect(() => {
    if (preventUpdates) {
      setIsOutdated(false);
      setUpdateInfo(null);
      return;
    }

    let isCancelled = false;
    const cancelIdleTask = scheduleIdleTask(() => {
      const checkVersion = async () => {
        try {
          const [currentVersion, data] = await Promise.all([
            getAppVersion(),
            invoke<{ version: string; changelog: string }>("get_latest_version"),
          ]);
          if (isCancelled) {
            return;
          }
          const latestVersion = data.version;

          const compareVersion = (v1: string, v2: string): number => {
            const parts1 = v1.split('.').map(Number);
            const parts2 = v2.split('.').map(Number);

            for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
              const p1 = parts1[i] ?? 0;
              const p2 = parts2[i] ?? 0;
              if (p1 < p2) return -1;
              if (p1 > p2) return 1;
            }
            return 0;
          };

          const isOutdatedResult = compareVersion(currentVersion, latestVersion) < 0;
          setIsOutdated(isOutdatedResult);
          if (isOutdatedResult) {
            setUpdateInfo({
              currentVersion,
              latestVersion,
              changelog: data.changelog
            });
          }
        } catch {
          if (!isCancelled) {
            setIsOutdated(false);
          }
        }
      };

      void checkVersion();
    }, 1200);

    return () => {
      isCancelled = true;
      cancelIdleTask();
    };
  }, [getAppVersion, preventUpdates]);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    const cancelIdleTask = scheduleIdleTask(checkDocumentsAccess, 700);
    return () => {
      cancelIdleTask();
    };
  }, [checkDocumentsAccess, isLoading]);

  useEffect(() => {
    void invoke<number>("get_macos_version")
      .then((major) => {
        if (major >= 26) {
          setHasLiquidGlass(true);
        }
      })
      .catch(() => {});
  }, []);

  const appWindow = useMemo(() => getCurrentWindow(), []);
  const executeRef = useRef<(() => void) | null>(null);
  const executeScriptTextRef = useRef<((payload: ExecuteScriptPayload) => void) | null>(null);

  const parsedKeybinds = useMemo(() => parseKeybinds(keybinds), [keybinds]);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};

    void appWindow.onResized(async () => {
      const fs = await appWindow.isFullscreen();
      setIsFullscreen(fs);
    }).then((unlisten) => {
      if (disposed) {
        unlisten();
        return;
      }

      cleanup = unlisten;
    });

    appWindow.isFullscreen().then(setIsFullscreen);

    return () => {
      disposed = true;
      cleanup();
    };
  }, [appWindow]);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};

    void listen<{ name: string; content: string }>("tray-execute-script", (event) => {
      executeScriptTextRef.current?.({
        script: event.payload.content,
        name: event.payload.name,
      });
    }).then((unlisten) => {
      if (disposed) {
        unlisten();
        return;
      }

      cleanup = unlisten;
    });

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};

    void appWindow.onDragDropEvent(async (event) => {
      if (event.payload.type !== "drop") {
        return;
      }

      const validPaths = event.payload.paths.filter(isDroppableScriptPath);
      if (validPaths.length === 0) {
        return;
      }

      try {
        const result = await invoke<ImportDroppedScriptsResult>("import_dropped_scripts", {
          paths: validPaths,
        });

        if (result.added.length > 0) {
          const importMessage = result.added.length === 1
            ? "1 Script Imported"
            : `${result.added.length} Scripts Imported`;

          if (result.duplicates.length > 0) {
            toast.success(importMessage, {
              description: result.duplicates.length === 1
                ? "Script Already Added"
                : `${result.duplicates.length} Script Already Added`,
              duration: 2500,
            });
            return;
          }

          toast.success(importMessage, { duration: 2500 });
          return;
        }

        if (result.duplicates.length > 0) {
          toast.info(
            result.duplicates.length === 1
              ? "Script Already Added"
              : `${result.duplicates.length} Script Already Added`,
            { duration: 2500 },
          );
          return;
        }
      } catch {
      }
    }).then((unlisten) => {
      if (disposed) {
        unlisten();
        return;
      }

      cleanup = unlisten;
    });

    return () => {
      disposed = true;
      cleanup();
    };
  }, [appWindow]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        const keyNum = parseInt(e.key, 10);
        if (keyNum >= 1 && keyNum <= VIEWS.length) {
          e.preventDefault();
          setActiveViewSafely(VIEWS[keyNum - 1]);
          return;
        }
      }

      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "a") {
        if (activeView === "editor" && !isEditableElement(document.activeElement)) {
          e.preventDefault();
          return;
        }
      }

      if (matches(parsedKeybinds.executeScript, e)) {
        e.preventDefault();
        if (executeRef.current) {
          executeRef.current();
        }
        return;
      }

      if (!autoHideSidebar && matches(parsedKeybinds.toggleSidebar, e)) {
        e.preventDefault();
        toggleSidebar();
        return;
      }

      if (matches(parsedKeybinds.openSettings, e)) {
        e.preventDefault();
        setActiveViewSafely('settings');
        return;
      }

      if (matches(parsedKeybinds.openRoblox, e)) {
        e.preventDefault();
        invoke('open_roblox').catch(() => {});
        return;
      }

      if (matches(parsedKeybinds.killRoblox, e)) {
        e.preventDefault();
        invoke('kill_all_roblox_instances').catch(() => {});
        return;
      }

    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeView, autoHideSidebar, parsedKeybinds, setActiveViewSafely, toggleSidebar]);

  useEffect(() => {
    if (!autoHideSidebar) {
      return;
    }

    let frame: number | null = null;
    let latestClientX = 0;

    const processMove = () => {
      frame = null;
      const edgeDistance = sidebarOnRight ? window.innerWidth - latestClientX : latestClientX;

      if (!sidebarVisible && edgeDistance <= SIDEBAR_REVEAL_EDGE_PX) {
        setSidebarVisible(true);
        return;
      }

      if (sidebarVisible && edgeDistance > SIDEBAR_HIDE_THRESHOLD_PX) {
        setSidebarVisible(false);
      }
    };

    const handleMouseMove = (event: MouseEvent) => {
      latestClientX = event.clientX;
      if (frame === null) {
        frame = window.requestAnimationFrame(processMove);
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [autoHideSidebar, setSidebarVisible, sidebarOnRight, sidebarVisible]);

  const handleSetEditor = useCallback(() => setActiveViewSafely('editor'), [setActiveViewSafely]);
  const handleSetConsole = useCallback(() => setActiveViewSafely('console'), [setActiveViewSafely]);
  const handleSetLibrary = useCallback(() => setActiveViewSafely('library'), [setActiveViewSafely]);
  const handleSetMultiInstance = useCallback(() => setActiveViewSafely('multi-instance'), [setActiveViewSafely]);
  const handleSetStats = useCallback(() => setActiveViewSafely('stats'), [setActiveViewSafely]);
  const handleSetSettings = useCallback(() => setActiveViewSafely('settings'), [setActiveViewSafely]);
  const handleEditorInitialReady = useCallback(() => {
    setIsEditorReady(true);
  }, []);

  const showDocumentsAccessOverlay = documentsAccessDenied && !documentsOverlayDismissed;
  const appTitlebar = !isFullscreen ? (
    <div data-tauri-drag-region className={shellStyles.titlebar} onPointerDownCapture={handleTitlebarPointerDown}>
      <TrafficLights />
      {appTitle && (
        <>
          <div className={shellStyles["titlebar-separator"]}></div>
          <span className={cn(shellStyles.noselect, shellStyles["app-title"])}>{appTitle}</span>
        </>
      )}
    </div>
  ) : null;

  if (showDocumentsAccessOverlay) {
    const handleGoAway = () => {
      setDocumentsOverlayDismissed(true);
    };

    return (
      <div
        className={shellStyles["app-container"]}
        data-theme={currentTheme.toLowerCase().replace(/\s+/g, '-')}
        data-tight-spacing={tightSpacing}
      >
        <div className={cn(shellStyles["app-bg"], shellStyles.noselect)} data-fullscreen={isFullscreen}>
          <div className={shellStyles["main-layout"]} style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            paddingBottom: '80px'
          }}>
            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
              <div
                role="img"
                style={{
                  width: '120px',
                  height: '120px',
                  marginBottom: '8px',
                  backgroundColor: 'var(--text-primary)',
                  WebkitMaskImage: `url(${celestialLogo})`,
                  maskImage: `url(${celestialLogo})`,
                  WebkitMaskRepeat: 'no-repeat',
                  maskRepeat: 'no-repeat',
                  WebkitMaskPosition: 'center',
                  maskPosition: 'center',
                  WebkitMaskSize: 'contain',
                  maskSize: 'contain',
                }}
              />
              <h1 style={{ fontSize: '24px', fontWeight: '600', color: 'var(--text-primary)', margin: 0 }}>Really? Denied me permission?</h1>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                alignItems: 'center',
                width: '320px'
              }}>
                <div style={{
                  color: 'var(--text-secondary)',
                  fontSize: '13px',
                  background: 'var(--bg-input)',
                  padding: '12px',
                  borderRadius: '1rem',
                  border: '1px solid var(--border-secondary)',
                  width: '100%',
                  textAlign: 'left',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word'
                }}>
                  Celestial needs access to the Documents folder to store scripts. Give the app permission if you want to create or save anything.
                </div>

                <Button variant="outline" onClick={handleGoAway} style={{ borderRadius: '0.8rem', width: '100%' }}>Go Away</Button>
              </div>
            </div>
          </div>
        </div>
        {appTitlebar}
        <Toaster />
      </div>
    );
  }

  if (isOutdated === true) {
    const handleCopyScript = async () => {
      const updateScript = 'curl -fsSL "https://usecelestial.xyz/app.sh" | bash';
      await writeText(updateScript);
      toast.success("Copied script, paste it in your terminal.");
    };

    const handleGoAway = () => {
      setIsOutdated(false);
    };

    return (
      <div 
        className={shellStyles["app-container"]} 
        data-theme={currentTheme.toLowerCase().replace(/\s+/g, '-')}
        data-tight-spacing={tightSpacing}
      >
        <div className={cn(shellStyles["app-bg"], shellStyles.noselect)} data-fullscreen={isFullscreen}>
          <div className={shellStyles["main-layout"]} style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            justifyContent: 'center',
            height: '100%',
            paddingBottom: '80px'
          }}>
            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
              <div
                role="img"
                style={{
                  width: '120px',
                  height: '120px',
                  marginBottom: '8px',
                  backgroundColor: 'var(--text-primary)',
                  WebkitMaskImage: `url(${celestialLogo})`,
                  maskImage: `url(${celestialLogo})`,
                  WebkitMaskRepeat: 'no-repeat',
                  maskRepeat: 'no-repeat',
                  WebkitMaskPosition: 'center',
                  maskPosition: 'center',
                  WebkitMaskSize: 'contain',
                  maskSize: 'contain',
                }}
              />
              <h1 style={{ fontSize: '24px', fontWeight: '600', color: 'var(--text-primary)', margin: 0 }}>An update is available</h1>
              {updateInfo && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center', width: '320px' }}>
                  <div style={{ display: 'flex', gap: '48px', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>Current</span>
                      <span style={{ fontSize: '18px', color: 'var(--text-primary)', fontWeight: 600 }}>{updateInfo.currentVersion}</span>
                    </div>

                    <div style={{ color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center' }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>Latest</span>
                      <span style={{ fontSize: '18px', color: 'var(--text-primary)', fontWeight: 600 }}>{updateInfo.latestVersion}</span>
                    </div>
                  </div>
                  
                  <div style={{ 
                    color: 'var(--text-secondary)', 
                    fontSize: '13px', 
                    background: 'var(--bg-input)',
                    padding: '12px',
                    borderRadius: '1rem',
                    border: '1px solid var(--border-secondary)',
                    width: '100%',
                    textAlign: 'left',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word'
                  }}>
                    {updateInfo.changelog}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', width: '100%' }}>
                    <Button variant="outline" onClick={handleCopyScript} style={{ borderRadius: '0.8rem' }}>Copy Update Command</Button>
                    <Button variant="outline" onClick={handleGoAway} style={{ borderRadius: '0.8rem' }}>Go Away</Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        {appTitlebar}
        <Toaster />
      </div>
    );
  }

  const isUiLoading = isLoading || !isEditorReady;
  let sidebarGap = SIDEBAR_GAP_PX;
  if (tightSpacing) {
    sidebarGap = SIDEBAR_GAP_TIGHT_PX;
  }
  const sidebarSlide = 60 + (tightSpacing ? 8 : 12);
  const sidebar = (
    <LazyMotion features={domAnimation}>
      <AnimatePresence initial={false}>
        {sidebarVisible && (
          <m.div
            key={sidebarOnRight ? "sidebar-right" : "sidebar-left"}
            initial={{ width: 0, ...(sidebarOnRight ? { marginLeft: 0 } : { marginRight: 0 }) }}
            animate={{ width: 60, ...(sidebarOnRight ? { marginLeft: sidebarGap } : { marginRight: sidebarGap }) }}
            exit={{ width: 0, ...(sidebarOnRight ? { marginLeft: 0 } : { marginRight: 0 }) }}
            transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
            style={{ overflow: 'visible', display: 'flex', flexDirection: 'column', alignItems: sidebarOnRight ? 'flex-end' : 'flex-start', minWidth: 0, order: sidebarOnRight ? 1 : 0 }}
          >
            <m.aside
              className={shellStyles.sidebar}
              initial={{ x: sidebarOnRight ? sidebarSlide : -sidebarSlide }}
              animate={{ x: 0 }}
              exit={{ x: sidebarOnRight ? sidebarSlide : -sidebarSlide }}
              transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
              style={{ width: 60, height: '100%', flexShrink: 0 }}
            >
              <SidebarButton
                isActive={activeView === 'editor'}
                onClick={handleSetEditor}
              >
                <CodeIcon />
              </SidebarButton>
              <SidebarButton
                isActive={activeView === 'console'}
                onClick={handleSetConsole}
              >
                <TerminalIcon />
              </SidebarButton>
              <SidebarButton
                isActive={activeView === 'library'}
                onClick={handleSetLibrary}
              >
                <LibraryIcon />
              </SidebarButton>
              <SidebarButton
                isActive={activeView === 'multi-instance'}
                onClick={handleSetMultiInstance}
              >
                <ServerIcon />
              </SidebarButton>
              <SidebarButton
                isActive={activeView === 'stats'}
                onClick={handleSetStats}
              >
                <StatsIcon />
              </SidebarButton>
              <SidebarButton
                isActive={activeView === 'settings'}
                onClick={handleSetSettings}
              >
                <SettingsIcon />
              </SidebarButton>
            </m.aside>
          </m.div>
        )}
      </AnimatePresence>
    </LazyMotion>
  );

  return (
    <div 
      className={cn(shellStyles["app-container"], isUiLoading && shellStyles["app-loading"])} 
      data-theme={currentTheme.toLowerCase().replace(/\s+/g, '-')}
      data-tight-spacing={tightSpacing}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className={cn(shellStyles["app-bg"], shellStyles.noselect)} data-fullscreen={isFullscreen} data-liquid-glass={hasLiquidGlass}>
        <div className={shellStyles["main-layout"]}>
          {sidebar}
          
          <div style={{ display: activeView === 'editor' ? 'contents' : 'none' }}>
            <Editor 
              onExecuteRef={executeRef}
              onExecuteScriptTextRef={executeScriptTextRef}
              isActive={activeView === 'editor'}
              onInitialReady={handleEditorInitialReady}
            />
          </div>
          
          {(activeView === 'console' || keepConsoleMounted || mountNonEditorViews) && (
            <Suspense fallback={null}>
              <div style={{ display: activeView === 'console' ? 'contents' : 'none' }}>
                <Console 
                  onKeepMountedChange={setKeepConsoleMounted} 
                />
              </div>
            </Suspense>
          )}
          
          {(activeView === 'library' || keepLibraryMounted || mountNonEditorViews) && (
            <Suspense fallback={null}>
              <div style={{ display: activeView === 'library' ? 'contents' : 'none' }}>
                <Library 
                  isActive={activeView === 'library'}
                  onKeepMountedChange={setKeepLibraryMounted} 
                />
              </div>
            </Suspense>
          )}
          
            {(activeView === 'multi-instance' || mountNonEditorViews) && (
              <Suspense fallback={null}>
                <div style={{ display: activeView === 'multi-instance' ? 'contents' : 'none' }}>
                  <MultiInstance isActive={activeView === 'multi-instance'} />
                </div>
              </Suspense>
            )}
            
            {(activeView === 'stats' || mountNonEditorViews) && (
              <Suspense fallback={null}>
                <div style={{ display: activeView === 'stats' ? 'contents' : 'none' }}>
                  <StatsTab isActive={activeView === 'stats'} />
                </div>
              </Suspense>
            )}
           
           {(activeView === 'settings' || mountNonEditorViews) && (
            <Suspense fallback={null}>
              <div style={{ display: activeView === 'settings' ? 'contents' : 'none' }}>
                <Settings isActive={activeView === 'settings'} />
              </div>
            </Suspense>
          )}
          {addKingVon && (
            <img
              src={von}
              alt=""
              style={{
                position: "absolute",
                right: 0,
                top: "50%",
                transform: "translateY(-50%)",
                height: "100%",
                maxHeight: "100%",
                width: "auto",
                pointerEvents: "none",
                zIndex: "6769"
              }}
            />
          )}
        </div>
      </div>
      {appTitlebar}
      <Toaster />
    </div>
  );
}

export default App;
