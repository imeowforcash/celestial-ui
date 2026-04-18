import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { RScriptsIcon, ScriptBloxIcon } from "@/assets/Icons";
import { readStuff, saveStuff, getCachedStuff, readExplorerData } from "@/utils/appData";
import { useRuntimeSettings } from "@/contexts/SettingsContext";
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
import uiStyles from "@/components/ui/Field.module.css";

interface LibraryProps {
  isActive: boolean;
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

interface HubbleCandidate {
  id: string;
  title: string;
  description?: string | null;
  gameName?: string | null;
}

interface HubbleDecision {
  id: string;
  score: number;
  accepted: boolean;
}

interface SourcePageResult {
  scripts: LibraryScript[];
  hasMore: boolean;
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

const isPresetScript = (value: unknown): value is PresetScript => {
  return typeof value === "object" && value !== null && "isPreset" in value && value.isPreset === true;
};

const isTrendingScript = (value: unknown): value is TrendingScript => {
  return typeof value === "object"
    && value !== null
    && "script" in value
    && typeof value.script === "object"
    && value.script !== null
    && "title" in value.script
    && !("slug" in value);
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

const RSCRIPTS_BATCH_SIZE = 8;
const SCRIPTBLOX_BATCH_SIZE = 8;

const NumberTicker: React.FC<{ value: number }> = ({ value }) => {
  const [displayValue, setDisplayValue] = useState(value);
  const displayValueRef = useRef(value);

  useEffect(() => {
    displayValueRef.current = displayValue;
  }, [displayValue]);

  useEffect(() => {
    if (value <= displayValueRef.current) {
      setDisplayValue(value);
      return;
    }

    const startValue = displayValueRef.current;
    const delta = value - startValue;
    const startedAt = performance.now();
    const duration = Math.min(Math.max(delta * 24, 160), 480);
    let frame = 0;

    const tick = (now: number) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      const nextValue = startValue + Math.round(delta * progress);
      setDisplayValue(nextValue);

      if (progress < 1) {
        frame = window.requestAnimationFrame(tick);
      }
    };

    frame = window.requestAnimationFrame(tick);

    return () => window.cancelAnimationFrame(frame);
  }, [value]);

  return (
    <span
      className="inline-block text-right"
      style={{ fontVariantNumeric: 'tabular-nums', minWidth: '4ch' }}
    >
      {displayValue}
    </span>
  );
};

const Library: React.FC<LibraryProps> = ({ isActive, onKeepMountedChange, onSearchQueryChange }) => {
  const { useHubble } = useRuntimeSettings();
  const cachedStuff = getCachedStuff();
  const [scriptApi, setScriptApi] = useState<ScriptApi>(cachedStuff?.scriptApi === "scriptblox" ? "scriptblox" : "rscripts");
  const [sourceApi, setScriptsSourceApi] = useState<ScriptApi>(cachedStuff?.scriptApi === "scriptblox" ? "scriptblox" : "rscripts");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [scripts, setScripts] = useState<LibraryScript[]>(PRESET_SCRIPTS);
  const [loadingInitial, setLoadingInitial] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const [filteredCount, setFilteredCount] = useState(0);
  const scriptsRef = useRef<LibraryScript[]>(PRESET_SCRIPTS);
  const nextPageRef = useRef<number | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchCacheRef = useRef<Record<string, SearchCacheEntry>>({});
  const fetchRequestRef = useRef(0);
  const initialLoadRef = useRef(0);
  const moreLoadRef = useRef(0);
  const latestApiRef = useRef<ScriptApi>(scriptApi);
  const latestQueryRef = useRef(debouncedQuery);
  const filterCountRef = useRef(0);

  useEffect(() => {
    scriptsRef.current = scripts;
  }, [scripts]);

  useEffect(() => {
    latestApiRef.current = scriptApi;
  }, [scriptApi]);

  useEffect(() => {
    latestQueryRef.current = debouncedQuery;
  }, [debouncedQuery]);

  const makeCacheKey = useCallback((api: ScriptApi, query: string) => {
    return `${api}::${useHubble ? "hubble" : "plain"}::${query.trim().toLowerCase()}`;
  }, [useHubble]);

  const getBatchSize = useCallback((api: ScriptApi, observedCount: number) => {
    const defaultBatchSize = api === "scriptblox" ? SCRIPTBLOX_BATCH_SIZE : RSCRIPTS_BATCH_SIZE;
    return Math.max(observedCount, defaultBatchSize);
  }, []);

  const buildHubbleCandidates = useCallback((api: ScriptApi, nextScripts: LibraryScript[]): HubbleCandidate[] => {
    return nextScripts.map((script) => {
      if (api === "scriptblox") {
        const bloxScript = script as ScriptBloxScript & { description?: string | null };
        return {
          id: bloxScript._id,
          title: bloxScript.title,
          description: bloxScript.description ?? null,
          gameName: bloxScript.game?.name ?? null,
        };
      }

      const rscript = script as Script;
      return {
        id: rscript._id,
        title: rscript.title,
        description: rscript.description ?? null,
        gameName: rscript.game?.title ?? null,
      };
    });
  }, []);

  const pickHubbleScripts = useCallback(async (api: ScriptApi, query: string, nextScripts: LibraryScript[]) => {
    if (!useHubble || !query.trim() || nextScripts.length === 0) {
      return nextScripts;
    }

    const decisions = await invoke<HubbleDecision[]>("filter_hubble_candidates", {
      query,
      candidates: buildHubbleCandidates(api, nextScripts),
    }).catch(() => {
      return null;
    });

    if (!decisions || decisions.length === 0) {
      return nextScripts;
    }

    const acceptedScores = new Map(
      decisions
        .filter((entry) => entry.accepted)
        .map((entry) => [entry.id, entry.score])
    );

    return nextScripts
      .filter((script) => acceptedScores.has(script._id))
      .sort((left, right) => (acceptedScores.get(right._id) ?? 0) - (acceptedScores.get(left._id) ?? 0));
  }, [buildHubbleCandidates, useHubble]);

  const fetchSourcePage = useCallback(async (api: ScriptApi, pageNum: number, query: string): Promise<SourcePageResult> => {
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

      const inferredHasMore = res.info.maxPages <= 1 && res.scripts.length >= RSCRIPTS_BATCH_SIZE;
      const hasMore = pageNum < res.info.maxPages || inferredHasMore;

      return {
        scripts: res.scripts,
        hasMore,
      };
    }

    const res = await searchScriptBloxScripts({
      q: query,
      page: pageNum,
      mode: 'free',
      key: 0,
      patched: 0,
      sortBy: 'likeCount',
      order: 'desc'
    });

    const hasMore = pageNum < res.result.totalPages;
    return {
      scripts: res.result.scripts,
      hasMore,
    };
  }, []);

  const loadPlainPage = useCallback(async (
    api: ScriptApi,
    pageNum: number,
    query: string,
    isMore: boolean,
    applyToState: boolean
  ): Promise<SearchCacheEntry> => {
    const sourcePage = await fetchSourcePage(api, pageNum, query);

    if (!isMore || !applyToState) {
      return {
        scripts: sourcePage.scripts,
        hasMore: sourcePage.hasMore,
        page: pageNum,
      };
    }

    const previousScripts = scriptsRef.current;
    const newScripts = sourcePage.scripts.filter((script) => !previousScripts.some((entry) => entry._id === script._id));

    return {
      scripts: [...previousScripts, ...newScripts],
      hasMore: sourcePage.hasMore,
      page: pageNum,
    };
  }, [fetchSourcePage]);

  const loadHubblePage = useCallback(async (
    api: ScriptApi,
    pageNum: number,
    query: string,
    isMore: boolean,
    applyToState: boolean,
    onProgress?: (count: number) => void
  ): Promise<SearchCacheEntry> => {
    const existingScripts = isMore && applyToState ? scriptsRef.current : [];
    const seenIds = new Set(existingScripts.map((script) => script._id));
    const acceptedScripts: LibraryScript[] = [];
    let currentSourcePage = pageNum;
    let lastFetchedPage = pageNum;
    let hasMore = false;
    let targetBatchSize = getBatchSize(api, 0);
    let nextFilteredCount = 0;

    while (true) {
      const sourcePage = await fetchSourcePage(api, currentSourcePage, query);
      lastFetchedPage = currentSourcePage;
      hasMore = sourcePage.hasMore;

      if (currentSourcePage === pageNum) {
        targetBatchSize = getBatchSize(api, sourcePage.scripts.length);
      }

      const nextScripts = sourcePage.scripts.filter((script) => !seenIds.has(script._id));
      nextFilteredCount += nextScripts.length;
      onProgress?.(nextFilteredCount);
      const pickedScripts = await pickHubbleScripts(api, query, nextScripts);

      for (const script of pickedScripts) {
        if (seenIds.has(script._id)) {
          continue;
        }
        seenIds.add(script._id);
        acceptedScripts.push(script);
      }

      if (
        acceptedScripts.length >= targetBatchSize ||
        sourcePage.scripts.length === 0 ||
        !hasMore
      ) {
        break;
      }

      currentSourcePage += 1;
    }

    return {
      scripts: isMore && applyToState ? [...existingScripts, ...acceptedScripts] : acceptedScripts,
      hasMore,
      page: lastFetchedPage,
    };
  }, [fetchSourcePage, getBatchSize, pickHubbleScripts]);

  useEffect(() => {
    if (!isActive) {
      return;
    }

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
  }, [isActive]);

  const fetchPage = useCallback(async (
    api: ScriptApi,
    pageNum: number,
    query: string,
    isMore: boolean,
    applyToState = true
  ) => {
    const requestId = applyToState ? ++fetchRequestRef.current : 0;
    const loadingRequestId = applyToState
      ? isMore
        ? ++moreLoadRef.current
        : ++initialLoadRef.current
      : 0;
    const filteredRequestId = applyToState ? ++filterCountRef.current : 0;
    const canApplyState = () => {
      if (!applyToState) {
        return false;
      }
      if (requestId !== fetchRequestRef.current) {
        return false;
      }
      if (api !== latestApiRef.current) {
        return false;
      }
      return query === latestQueryRef.current;
    };

    const finishLoading = () => {
      if (!applyToState) {
        return;
      }
      if (isMore) {
        if (loadingRequestId !== moreLoadRef.current) {
          return;
        }
        setLoadingMore(false);
      } else {
        if (loadingRequestId !== initialLoadRef.current) {
          return;
        }
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
      if (!isMore && canApplyState()) {
        setScripts(PRESET_SCRIPTS);
        setScriptsSourceApi(api);
        setHasMore(false);
        setFilteredCount(0);
      }
      return;
    }

    const cacheKey = makeCacheKey(api, query);
    if (!isMore) {
      const cached = searchCacheRef.current[cacheKey];
      if (cached) {
        if (canApplyState()) {
          setScripts(cached.scripts);
          setScriptsSourceApi(api);
          setHasMore(cached.hasMore);
          setPage(cached.page);
          setFilteredCount(0);
        }
        return;
      }
    }

    if (!isMore && applyToState && useHubble) {
      setScripts([]);
      setScriptsSourceApi(api);
      setFilteredCount(0);
    }

    startLoading();

    try {
      const nextPage = useHubble
        ? await loadHubblePage(api, pageNum, query, isMore, applyToState, (count) => {
            if (!applyToState || filteredRequestId !== filterCountRef.current) {
              return;
            }
            if (!canApplyState()) {
              return;
            }
            setFilteredCount(count);
          })
        : await loadPlainPage(api, pageNum, query, isMore, applyToState);

      searchCacheRef.current[cacheKey] = nextPage;

      if (canApplyState()) {
        setScripts(nextPage.scripts);
        setScriptsSourceApi(api);
        setHasMore(nextPage.hasMore);
        setPage(nextPage.page);
        if (!useHubble) {
          setFilteredCount(0);
        }
      }
    } catch {
      if (!isMore && canApplyState()) {
        setScripts([]);
      }
    } finally {
      finishLoading();
    }
  }, [loadHubblePage, loadPlainPage, makeCacheKey, useHubble]);

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
    setDebouncedQuery(searchQuery.trim());
    setPage(1);
  }, [searchQuery]);

  useEffect(() => {
    searchCacheRef.current = {};
  }, [debouncedQuery, useHubble]);

  useEffect(() => {
    nextPageRef.current = null;
  }, [debouncedQuery, scriptApi, useHubble]);

  useEffect(() => {
    onKeepMountedChange?.(debouncedQuery.length > 0);
    onSearchQueryChange?.(debouncedQuery);
  }, [debouncedQuery, onKeepMountedChange, onSearchQueryChange]);

  useEffect(() => {
    if (!useHubble || debouncedQuery) {
      return;
    }
    setFilteredCount(0);
  }, [debouncedQuery, useHubble]);

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
      if (useHubble) {
        void fetchPage(scriptApi, 1, debouncedQuery, false, true);
        return;
      }

      void Promise.all([fetchPage(scriptApi, 1, debouncedQuery, false, true), fetchPage(inactiveApi, 1, debouncedQuery, false, false)]);
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [debouncedQuery, scriptApi, fetchPage, useHubble]);

  const loadMorePage = useCallback((nextPage: number) => {
    if (!debouncedQuery || loadingInitial || loadingMore || !hasMore) {
      return;
    }

    if (nextPageRef.current === nextPage) {
      return;
    }

    nextPageRef.current = nextPage;
    void fetchPage(scriptApi, nextPage, debouncedQuery, true, true).finally(() => {
      if (nextPageRef.current === nextPage) {
        nextPageRef.current = null;
      }
    });
  }, [debouncedQuery, fetchPage, hasMore, loadingInitial, loadingMore, scriptApi]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      
      if (!loadingInitial && !loadingMore && hasMore && debouncedQuery) {
        const scrollProgress = (scrollTop + clientHeight) / scrollHeight;
        if (scrollProgress >= 0.7) {
          loadMorePage(page + 1);
        }
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [debouncedQuery, hasMore, loadMorePage, loadingInitial, loadingMore, page]);

  useEffect(() => {
    if (!useHubble || !debouncedQuery || loadingInitial || loadingMore || !hasMore) {
      return;
    }

    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    const scrollHeight = Math.max(container.scrollHeight, 1);
    const viewportBottom = container.scrollTop + container.clientHeight;
    const shouldLoadMore =
      container.scrollHeight <= container.clientHeight ||
      viewportBottom / scrollHeight >= 0.7;

    if (shouldLoadMore) {
      loadMorePage(page + 1);
    }
  }, [debouncedQuery, hasMore, loadMorePage, loadingInitial, loadingMore, page, scripts, useHubble]);

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

  const getMainFolderName = useCallback(async (scriptsPath: string): Promise<string> => {
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
    await (async () => {
      let fileName = "";
      let content = "";

      if (isPresetScript(script)) {
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

        if (sourceApi === "scriptblox") {
          const bloxScript = downloadTarget as ScriptBloxScript;
          title = bloxScript.title;
          gameName = bloxScript.game?.name ?? null;

          if (bloxScript.script) {
            content = bloxScript.script;
          } else {
            content = await getScriptBloxRaw(bloxScript._id);
          }
        } else if (isTrendingScript(downloadTarget)) {
          title = downloadTarget.script.title;
          const fullScript = await getScriptById(downloadTarget._id);
          if (!fullScript || !fullScript.rawScript) return;
          const response = await fetch(fullScript.rawScript);
          if (!response.ok) throw new Error(response.statusText);
          content = await response.text();
        } else {
          const s = downloadTarget as Script;
          title = s.title;
          gameName = s.game?.title ?? null;

          if (s.rawScript) {
            const response = await fetch(s.rawScript);
            if (!response.ok) throw new Error(response.statusText);
            content = await response.text();
          } else {
            const fullScript = await getScriptById(s._id);
            if (!fullScript || !fullScript.rawScript) return;
            const response = await fetch(fullScript.rawScript);
            if (!response.ok) throw new Error(response.statusText);
            content = await response.text();
          }
        }

        fileName = cleanScriptName(title, gameName);
      }

      const scriptsPath = await invoke<string>('get_scripts_path');
      const primaryFolder = await getMainFolderName(scriptsPath);
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

  const isSearchLoading = loadingInitial && debouncedQuery.trim().length > 0;
  const showGhostRow = scripts.length > 0 && scripts.every(isPresetScript);
  const isShowingHubbleProgress = useHubble && debouncedQuery.trim().length > 0 && (loadingInitial || loadingMore);
  const filteredLabel = (
    <>
      <NumberTicker value={filteredCount} /> Scripts filtered
    </>
  );

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
                      key={isPresetScript(script) ? script._id : `${sourceApi}-${script._id}`} 
                      script={script} 
                      onClick={handleDownload}
                      isBlox={sourceApi === 'scriptblox'}
                    />
                ))}
            </div>
            {loadingMore && (
                <div className="flex items-center justify-center py-4 text-[var(--text-secondary)] text-sm">
                    {useHubble ? filteredLabel : "Loading more..."}
                </div>
            )}
            </>
        ) : (
            (isShowingHubbleProgress || !loadingInitial) && (
              <div className="flex h-full -translate-y-1 flex-col items-center justify-center gap-1.5 text-[var(--text-secondary)]">
                {isShowingHubbleProgress ? (
                  <span className="text-base font-semibold leading-tight">{filteredLabel}</span>
                ) : (
                  <>
                    <div
                      role="img"
                      className="h-20 w-20"
                      style={EMPTY_STATE_LOGO_STYLE}
                    />
                    <span className="text-base font-semibold leading-tight">Nothing here</span>
                  </>
                )}
              </div>
            )
        )}
      </div>
    </div>
  );
};

export default Library;
