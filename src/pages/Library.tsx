import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { RScriptsIcon, ScriptBloxIcon } from "@/assets/Icons";
import { readStuff, saveStuff, getCachedStuff, readExplorerData } from "@/utils/appData";
import { cn } from "@/utils/ui";
import ScriptCard, { PresetScript } from "@/components/ScriptCard";
import { getScripts, getScriptById, Script, TrendingScript } from "@/services/rscripts";
import { searchScriptBloxScripts, getScriptBloxRaw, ScriptBloxScript } from "@/services/scriptblox";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { exists, readDir } from "@tauri-apps/plugin-fs";
import { cleanScriptName } from "@/utils/scriptUtils";
import { toast } from "sonner";
import infBanner from "@/assets/inf.avif";
import namelessBanner from "@/assets/nameless.avif";
import morfBanner from "@/assets/morf.avif";
import celestialLogo from "@/assets/celestial.png";
import settingsStyles from "../styles/SettingsSurface.module.css";
import uiStyles from "@/components/ui/UiPrimitives.module.css";

interface LibraryProps {
  onKeepMountedChange?: (keepMounted: boolean) => void;
  onSearchQueryChange?: (query: string) => void;
}

type ScriptApi = "rscripts" | "scriptblox";
type LibraryScript = Script | TrendingScript | ScriptBloxScript | PresetScript;
interface SearchCacheEntry {
  scripts: LibraryScript[];
  hasMore: boolean;
  page: number;
}

const PRESET_SCRIPTS: PresetScript[] = [
  { _id: "preset-infinite-yield", title: "Infinite Yield", image: infBanner, createdAt: "2014-01-01T00:00:00.000Z", isPreset: true },
  { _id: "preset-nameless-admin", title: "Nameless Admin", image: namelessBanner, createdAt: "2019-01-01T00:00:00.000Z", isPreset: true },
  { _id: "preset-morfos", title: "MorfOS", image: morfBanner, createdAt: "2025-06-01T00:00:00.000Z", isPreset: true },
];

const PRESET_SCRIPT_DOWNLOADS: Record<string, { fileName: string; content: string }> = {
  "preset-infinite-yield": {
    fileName: "InfiniteYield.lua",
    content: 'loadstring(game:HttpGet("https://raw.githubusercontent.com/EdgeIY/infiniteyield/master/source"))()',
  },
  "preset-nameless-admin": {
    fileName: "Nameless.lua",
    content: 'loadstring(game:HttpGet("https://raw.githubusercontent.com/ltseverydayyou/Nameless-Admin/main/Source.lua"))()',
  },
  "preset-morfos": {
    fileName: "MorfOS.lua",
    content: 'loadstring(game:HttpGet("https://raw.githubusercontent.com/formidy/morfOS/refs/heads/main/main.lua"))()',
  },
};

const EMPTY_STATE_LOGO_STYLE: React.CSSProperties = {
  backgroundColor: "var(--text-primary)",
  WebkitMaskImage: `url(${celestialLogo})`,
  maskImage: `url(${celestialLogo})`,
  WebkitMaskRepeat: "no-repeat",
  maskRepeat: "no-repeat",
  WebkitMaskPosition: "center",
  maskPosition: "center",
  WebkitMaskSize: "contain",
  maskSize: "contain",
};

const Library: React.FC<LibraryProps> = ({ onKeepMountedChange, onSearchQueryChange }) => {
  const cachedStuff = getCachedStuff();
  const [scriptApi, setScriptApi] = useState<ScriptApi>(cachedStuff?.scriptApi === "scriptblox" ? "scriptblox" : "rscripts");
  const [scriptsSourceApi, setScriptsSourceApi] = useState<ScriptApi>(cachedStuff?.scriptApi === "scriptblox" ? "scriptblox" : "rscripts");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [scripts, setScripts] = useState<LibraryScript[]>(PRESET_SCRIPTS);
  const [loadingInitial, setLoadingInitial] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchCacheRef = useRef<Record<string, SearchCacheEntry>>({});

  const makeCacheKey = useCallback((api: ScriptApi, query: string) => {
    return `${api}::${query.trim().toLowerCase()}`;
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }

      if (e.key === 'Escape' && document.activeElement === searchInputRef.current) {
        searchInputRef.current?.blur();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const fetchPage = useCallback(async (
    api: ScriptApi,
    pageNum: number,
    query: string,
    isMore: boolean,
    applyToState = true
  ) => {
    const finishLoading = () => {
      if (!applyToState) {
        return;
      }
      if (isMore) {
        setLoadingMore(false);
      } else {
        setLoadingInitial(false);
      }
    };

    const startLoading = () => {
      if (!applyToState) {
        return;
      }
      if (isMore) {
        setLoadingMore(true);
      } else {
        setLoadingInitial(true);
      }
    };

    if (!query) {
      if (applyToState && !isMore) {
        setScripts(PRESET_SCRIPTS);
        setScriptsSourceApi(api);
        setHasMore(false);
      }
      return;
    }

    const cacheKey = makeCacheKey(api, query);
    if (!isMore) {
      const cached = searchCacheRef.current[cacheKey];
      if (cached) {
        if (applyToState) {
          setScripts(cached.scripts);
          setScriptsSourceApi(api);
          setHasMore(cached.hasMore);
          setPage(cached.page);
        }
        return;
      }
    }

    startLoading();

    try {
      if (api === "rscripts") {
        const res = await getScripts({
          q: query,
          page: pageNum,
          orderBy: 'likes',
          sort: 'desc',
          notPaid: true,
          noKeySystem: true,
          unpatched: true
        });
        const nextHasMore = pageNum < res.info.maxPages;

        if (isMore && applyToState) {
          setScriptsSourceApi(api);
          setScripts(prev => {
            const newScripts = res.scripts.filter(s => !prev.some(p => p._id === s._id));
            const mergedScripts = [...prev, ...newScripts];
            searchCacheRef.current[cacheKey] = {
              scripts: mergedScripts,
              hasMore: nextHasMore,
              page: pageNum,
            };
            return mergedScripts;
          });
        } else {
          searchCacheRef.current[cacheKey] = {
            scripts: res.scripts,
            hasMore: nextHasMore,
            page: pageNum,
          };
          if (applyToState) {
            setScripts(res.scripts);
            setScriptsSourceApi(api);
          }
        }

        if (applyToState) {
          setHasMore(nextHasMore);
        }
      } else {
        const res = await searchScriptBloxScripts({
          q: query,
          page: pageNum,
          mode: 'free',
          key: 0,
          patched: 0,
          sortBy: 'likeCount',
          order: 'desc'
        });
        const nextHasMore = pageNum < res.result.totalPages;

        if (isMore && applyToState) {
          setScriptsSourceApi(api);
          setScripts(prev => {
            const newScripts = res.result.scripts.filter(s => !prev.some(p => p._id === s._id));
            const mergedScripts = [...prev, ...newScripts];
            searchCacheRef.current[cacheKey] = {
              scripts: mergedScripts,
              hasMore: nextHasMore,
              page: pageNum,
            };
            return mergedScripts;
          });
        } else {
          searchCacheRef.current[cacheKey] = {
            scripts: res.result.scripts,
            hasMore: nextHasMore,
            page: pageNum,
          };
          if (applyToState) {
            setScripts(res.result.scripts);
            setScriptsSourceApi(api);
          }
        }

        if (applyToState) {
          setHasMore(nextHasMore);
        }
      }
    } catch {
      if (applyToState && !isMore) {
        setScripts([]);
      }
    } finally {
      finishLoading();
    }
  }, [makeCacheKey]);

  useEffect(() => {
    const loadScriptApi = async () => {
      const stuff = await readStuff().catch(() => null);
      if (!stuff) {
        return;
      }

      if (stuff.scriptApi && typeof stuff.scriptApi === 'string') {
        setScriptApi(stuff.scriptApi === "scriptblox" ? "scriptblox" : "rscripts");
      } else {
        saveStuff('scriptApi', "rscripts");
      }
    };
    loadScriptApi();
  }, []);


  const submitSearchNow = useCallback(() => {
    setDebouncedQuery(searchQuery);
    setPage(1);
  }, [searchQuery]);

  useEffect(() => {
    searchCacheRef.current = {};
  }, [debouncedQuery]);

  useEffect(() => {
    onKeepMountedChange?.(debouncedQuery.length > 0);
    onSearchQueryChange?.(debouncedQuery);
  }, [debouncedQuery, onKeepMountedChange, onSearchQueryChange]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }
    container.scrollTo({ top: 0, behavior: "auto" });
  }, [debouncedQuery]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!debouncedQuery) {
        void fetchPage(scriptApi, 1, debouncedQuery, false, true);
        return;
      }

      const inactiveApi: ScriptApi = scriptApi === "rscripts" ? "scriptblox" : "rscripts";
      void Promise.all([
        fetchPage(scriptApi, 1, debouncedQuery, false, true),
        fetchPage(inactiveApi, 1, debouncedQuery, false, false),
      ]);
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [debouncedQuery, scriptApi, fetchPage]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      
      if (!loadingInitial && !loadingMore && hasMore && debouncedQuery) {
        const scrollProgress = (scrollTop + clientHeight) / scrollHeight;
        if (scrollProgress >= 0.7) {
          const nextPage = page + 1;
          setPage(nextPage);
          void fetchPage(scriptApi, nextPage, debouncedQuery, true, true);
        }
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [page, debouncedQuery, hasMore, loadingInitial, loadingMore, fetchPage]);

  const handleApiChange = (api: ScriptApi) => {
    if (scriptApi === api) return;
    let nextPage = 1;
    if (debouncedQuery) {
      const cached = searchCacheRef.current[makeCacheKey(api, debouncedQuery)];
      if (cached) {
        setScripts(cached.scripts);
        setScriptsSourceApi(api);
        setHasMore(cached.hasMore);
        nextPage = cached.page;
      }
    }
    setPage(nextPage);
    setScriptApi(api);
    saveStuff('scriptApi', api);
  };

  const getPrimaryScriptsFolderName = useCallback(async (scriptsPath: string): Promise<string> => {
    const explorerData = await readExplorerData().catch(() => null);
    if (explorerData) {
      const rootOrder = explorerData.treeOrder?.root;
      if (Array.isArray(rootOrder)) {
        const firstFolderId = rootOrder.find(
          (id) =>
            typeof id === 'string' &&
            id.startsWith('folder-') &&
            id.toLowerCase() !== 'folder-tray'
        );
        if (firstFolderId && firstFolderId.startsWith('folder-')) {
          return firstFolderId.replace('folder-', '');
        }
      }
    }

    const entries = await readDir(scriptsPath).catch(() => null);
    if (entries) {
      const firstFolder = entries.find(
        (entry) =>
          entry.isDirectory &&
          entry.name &&
          !entry.name.startsWith('.') &&
          entry.name.toLowerCase() !== 'tray'
      );
      if (firstFolder?.name) {
        return firstFolder.name;
      }
    }

    return 'Scripts';
  }, []);

  const handleDownload = async (script: LibraryScript) => {
    const isRScriptsTrending = (s: any): s is TrendingScript => {
      return 'script' in s && s.script && 'title' in s.script && !('slug' in s);
    };

    const isScriptBlox = (s: any): s is ScriptBloxScript => {
      return scriptApi === 'scriptblox' && 'slug' in s;
    };

    const isPreset = (s: any): s is PresetScript => {
      return s && typeof s === 'object' && s.isPreset === true;
    };

    await (async () => {
      let fileName = "";
      let content = "";

      if (isPreset(script)) {
        const preset = PRESET_SCRIPT_DOWNLOADS[script._id];
        if (!preset) {
          return;
        }
        fileName = preset.fileName;
        content = preset.content;
      } else {
        const downloadTarget = script;
        let title: string;
        let gameName: string | null = null;

        if (isScriptBlox(downloadTarget)) {
          title = downloadTarget.title;
          gameName = downloadTarget.game?.name || null;

          if (downloadTarget.script) {
            content = downloadTarget.script;
          } else {
            content = await getScriptBloxRaw(downloadTarget._id);
          }
        } else if (isRScriptsTrending(downloadTarget)) {
          title = downloadTarget.script.title;
          const fullScript = await getScriptById(downloadTarget._id);
          if (!fullScript || !fullScript.rawScript) return;
          const response = await fetch(fullScript.rawScript);
          if (!response.ok) throw new Error(`Failed to fetch script: ${response.statusText}`);
          content = await response.text();
        } else {
          const s = downloadTarget as Script;
          title = s.title;
          gameName = s.game?.title || null;

          if (s.rawScript) {
            const response = await fetch(s.rawScript);
            if (!response.ok) throw new Error(`Failed to fetch script: ${response.statusText}`);
            content = await response.text();
          } else {
            const fullScript = await getScriptById(s._id);
            if (!fullScript || !fullScript.rawScript) return;
            const response = await fetch(fullScript.rawScript);
            if (!response.ok) throw new Error(`Failed to fetch script: ${response.statusText}`);
            content = await response.text();
          }
        }

        fileName = cleanScriptName(title, gameName);
      }

      const scriptsPath = await invoke<string>('get_scripts_path');
      const primaryFolder = await getPrimaryScriptsFolderName(scriptsPath);
      const targetPath = `${scriptsPath}/${primaryFolder}/${fileName}`;
      const alreadyAdded = await exists(targetPath);
      if (alreadyAdded) {
        toast.info("Script Already Added", { duration: 2000 });
        return;
      }

      await invoke("save_script", { content, fileName });
      await invoke("refresh_tray_menu").catch(() => null);
      await emit("refresh-explorer");
      toast.success("Script Downloaded", { duration: 2000 });
    })().catch(() => {});
  };

  const isPresetScript = (script: LibraryScript): script is PresetScript => {
    return (script as PresetScript).isPreset === true;
  };
  const isSearchLoading = loadingInitial && debouncedQuery.trim().length > 0;
  const showGhostRow = scripts.length > 0 && scripts.every(isPresetScript);

  return (
    <div className={settingsStyles.main} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div className={uiStyles["ui-grid-gap"]} style={{ flexDirection: 'row', alignItems: 'center', marginTop: '-4px' }}>
        <div className="relative flex-1">
          <Input
            ref={searchInputRef}
            type="text"
            placeholder="Search for scripts..."
            className="w-full"
            style={{ paddingRight: isSearchLoading ? '32px' : '12px' }}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submitSearchNow();
                (e.target as HTMLElement).blur();
              }
            }}
          />
          {isSearchLoading && (
            <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
              <svg
                role="status"
                aria-label="Loading"
                className="h-4 w-4 animate-spin text-[var(--text-secondary)]"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
                <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </div>
          )}
        </div>
        <ButtonGroup className="[&>*:first-child]:rounded-l-xl [&>*:last-child]:rounded-r-xl">
          <Button 
            variant={scriptApi === "rscripts" ? "default" : "outline"}
            size="icon"
            onClick={() => handleApiChange("rscripts")}
            className={cn(
              scriptApi === "rscripts" 
                ? "bg-[var(--text-primary)] hover:bg-[var(--text-primary)] text-[var(--bg-panel)]" 
                : "bg-[var(--bg-input)]"
            )}
          >
            <RScriptsIcon className="size-6" />
          </Button>
          <Button 
            variant={scriptApi === "scriptblox" ? "default" : "outline"}
            size="icon"
            onClick={() => handleApiChange("scriptblox")}
            className={cn(
              scriptApi === "scriptblox" 
                ? "bg-[var(--text-primary)] hover:bg-[var(--text-primary)] text-[var(--bg-panel)]" 
                : "bg-[var(--bg-input)]"
            )}
          >
            <ScriptBloxIcon className="size-5" />
          </Button>
        </ButtonGroup>
      </div>

      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto no-scrollbar">
        {scripts.length > 0 ? (
            <>
            {showGhostRow && (
              <>
                <div
                  className="flex items-center justify-center text-base font-semibold text-[var(--text-secondary)]"
                  style={{ minHeight: '170px' }}
                >
                  Search to get started
                </div>
                <div style={{ height: '1px', background: 'var(--border-secondary)', marginTop: '24px', marginBottom: '16px' }} />
              </>
            )}
            <div className="grid gap-4 pb-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
                {scripts.map((script) => (
                    <ScriptCard 
                      key={isPresetScript(script) ? script._id : `${scriptsSourceApi}-${script._id}`} 
                      script={script} 
                      onClick={handleDownload}
                      isBlox={scriptsSourceApi === 'scriptblox'}
                    />
                ))}
            </div>
            {loadingMore && (
                <div className="flex items-center justify-center py-4 text-[var(--text-secondary)] text-sm">
                    Loading more...
                </div>
            )}
            </>
        ) : (
            !loadingInitial && (
              <div className="flex h-full -translate-y-1 flex-col items-center justify-center gap-1.5 text-[var(--text-secondary)]">
                <div
                  role="img"
                  aria-label="Celestial"
                  className="h-20 w-20"
                  style={EMPTY_STATE_LOGO_STYLE}
                />
                <span className="text-base font-semibold leading-tight">Nothing here</span>
              </div>
            )
        )}
      </div>
    </div>
  );
};

export default Library;
