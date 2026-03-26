import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { readDir, readTextFile, writeTextFile, exists, mkdir } from "@tauri-apps/plugin-fs";
import { toast } from "sonner";
import { homeDir, join } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { saveStuff, readStuff, readExplorerData, saveExplorerData } from "../utils/appData";
import { matches, parseKeybinds } from "../utils/keybinds";
import { CELESTIAL_AUTOEXEC_LUA } from "../utils/template";
import { useEditorSettings, useKeybindSettings, useRuntimeSettings, useUiSettings } from "../contexts/SettingsContext";

import AccountsPanel, { Account, AccountJoinMode } from "../components/editor/AccountsPanel";
import Explorer, { TreeItem } from "../components/editor/Explorer";
import HistoryPanel, { HistoryPanelEntry } from "../components/editor/HistoryPanel";
import MonacoCodeEditor from "../components/editor/CodeEditor";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { SIDE_PANEL_SWITCH_DELAY_MS } from "../components/editor/sidePanelMotion";
import { cn } from "@/utils/ui";
import editorStyles from "../components/editor/EditorShared.module.css";
import uiStyles from "../components/ui/UiPrimitives.module.css";

interface EditorProps {
  onExecuteRef?: React.MutableRefObject<(() => void) | null>;
  onExecuteScriptTextRef?: React.MutableRefObject<((payload: ExecuteScriptPayload) => void) | null>;
  isActive: boolean;
  onCurrentFileChange?: (fileName: string | null) => void;
  onInitialReady?: () => void;
}

interface ExecuteScriptPayload {
  script: string;
  name?: string | null;
}

interface HistoryItem {
  id: number;
  name: string;
  executed_at: number;
}

interface HistoryEntry extends HistoryItem {
  content: string;
}

interface JoinOverlayState {
  userIds: string[];
  mode: AccountJoinMode;
  placeId: string;
  link: string;
  submitting: boolean;
}

type SidePanel = "accounts" | "history";

const isJoinOverlayReady = (joinOverlay: JoinOverlayState | null): boolean => {
  if (!joinOverlay) {
    return false;
  }

  if (joinOverlay.mode === "place") {
    return joinOverlay.placeId.trim().length > 0;
  }

  return joinOverlay.link.trim().length > 0;
};

function makeIdTree(baseId: string, data: Record<string, TreeItem>): string {
  if (!data[baseId]) {
    return baseId;
  }

  let counter = 1;
  let candidate = `${baseId}__${counter}`;
  while (data[candidate]) {
    counter += 1;
    candidate = `${baseId}__${counter}`;
  }
  return candidate;
}

const Editor: React.FC<EditorProps> = ({
  onExecuteRef,
  onExecuteScriptTextRef,
  isActive,
  onCurrentFileChange,
  onInitialReady,
}) => {
  const EXPLORER_MIN_WIDTH = 980;
  const { explorerWidth, setExplorerWidth, commitExplorerWidth, executor } = useUiSettings();
  const {
    hideFileExtensions,
    disableLinting,
    wordWrapEnabled,
    smoothTypingEnabled,
    disableIndentGuides,
  } = useEditorSettings();
  const { hideMultiInstanceButton, placeEditorButtonsInOtherPlace, hideTrayFolder, disableHistory } = useRuntimeSettings();
  const { keybinds } = useKeybindSettings();
  
  const [isExplorerDragging, setIsExplorerDragging] = useState(false);
  const currentWidthRef = useRef(explorerWidth);
  const [liveExplorerWidth, setLiveExplorerWidth] = useState<number | null>(null);
  const [code, setCode] = useState("-- Select a file");

  const [showExplorer, setShowExplorer] = useState(true);
  const [windowWidth, setWindowWidth] = useState<number>(window.innerWidth);
  const desiredShowExplorerRef = useRef(true);
  const [animateExplorerVisibilityTransitions, setAnimateExplorerVisibilityTransitions] = useState(false);

  const [activeSidePanel, setActiveSidePanel] = useState<SidePanel | null>(null);
  const activeSidePanelRef = useRef<SidePanel | null>(null);
  const pendingSidePanelRef = useRef<SidePanel | null>(null);
  const sidePanelSwitchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [animateSidePanelVisibilityTransitions, setAnimateSidePanelVisibilityTransitions] = useState(false);
  const [hasHydratedPanelVisibility, setHasHydratedPanelVisibility] = useState(false);
  const [accountsWidth, setAccountsWidth] = useState(180);
  
  const [splitRatio, setSplitRatio] = useState(50);
  const splitRatioRef = useRef(50);
  const [isSplitDragging, setIsSplitDragging] = useState(false);
  const accountsWidthRef = useRef(180);
  
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [runningAccounts, setRunningAccounts] = useState<string[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [joinOverlay, setJoinOverlay] = useState<JoinOverlayState | null>(null);
  const [executionHistory, setExecutionHistory] = useState<HistoryItem[]>([]);
  const [primaryBufferPath, setPrimaryBufferPath] = useState<string[] | null>(null);

  const [treeData, setTreeData] = useState<Record<string, TreeItem>>({
    root: { name: "Root", children: [] },
  });
  
  const treeDataRef = useRef(treeData);
  useEffect(() => {
    treeDataRef.current = treeData;
  }, [treeData]);
  useEffect(() => {
    activeSidePanelRef.current = activeSidePanel;
  }, [activeSidePanel]);

  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  
  const setTreeDataWithRef = useCallback((newData: Record<string, TreeItem> | ((prev: Record<string, TreeItem>) => Record<string, TreeItem>)) => {
    if (typeof newData === 'function') {
      setTreeData(prev => {
        const result = newData(prev);
        treeDataRef.current = result;
        return result;
      });
    } else {
      treeDataRef.current = newData;
      setTreeData(newData);
    }
  }, []);
  
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  const [secondaryFilePath, setSecondaryFilePath] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const secondarySaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleExecuteRef = useRef<(() => void) | null>(null);
  const [secondaryCode, setSecondaryCode] = useState("-- Select a file");
  const [activeEditor, setActiveEditor] = useState<"primary" | "secondary">("primary");
  const primaryEditorRef = useRef<HTMLDivElement | null>(null);
  const secondaryEditorRef = useRef<HTMLDivElement | null>(null);
  const [editorDropTarget, setEditorDropTarget] = useState<"primary" | "secondary" | null>(null);
  const splitViewSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorReadyNotifiedRef = useRef(false);
  const hasObservedHideTrayFolderRef = useRef(false);

  const editorReady = useCallback(() => {
    if (editorReadyNotifiedRef.current) {
      return;
    }
    editorReadyNotifiedRef.current = true;
    onInitialReady?.();
  }, [onInitialReady]);

  const handleNewScriptRef = useRef<(() => void) | null>(null);
  const handleNewFolderRef = useRef<(() => void) | null>(null);
  const handleDeleteRef = useRef<(() => Promise<void>) | null>(null);
  const navigateFilesRef = useRef<((direction: number) => void) | null>(null);
  const toggleExplorerRef = useRef<(() => void) | null>(null);

  const [pendingRenameId, setPendingRenameId] = useState<string | null>(null);
  const clearPendingRenameId = useCallback(() => setPendingRenameId(null), []);

  const parsedKeybinds = useMemo(() => parseKeybinds(keybinds), [keybinds]);
  const showAccountsPanel = activeSidePanel === "accounts";
  const showHistoryPanel = activeSidePanel === "history";
  const historyDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }),
    [],
  );
  const historyEntries = useMemo<HistoryPanelEntry[]>(
    () =>
      executionHistory.map((entry) => {
        const title = entry.name?.trim() ? entry.name : "Untitled Script";
        const subtitle = historyDateFormatter.format(new Date(entry.executed_at * 1000));
        return { id: entry.id, title, subtitle };
      }),
    [executionHistory, historyDateFormatter],
  );
  const joinOverlayReady = useMemo(() => isJoinOverlayReady(joinOverlay), [joinOverlay]);
  const joinOverlayTargetUserIds = useMemo(() => {
    if (!joinOverlay) {
      return [] as string[];
    }

    const targetUserIds = new Set<string>();

    for (const userId of joinOverlay.userIds) {
      if (!runningAccounts.includes(userId)) {
        targetUserIds.add(userId);
      }
    }

    for (const userId of selectedAccounts) {
      if (!runningAccounts.includes(userId)) {
        targetUserIds.add(userId);
      }
    }

    return [...targetUserIds];
  }, [joinOverlay, runningAccounts, selectedAccounts]);
  const joinOverlayCanSubmit = joinOverlayReady && joinOverlayTargetUserIds.length > 0;
  const explorerSelectedItems = useMemo(
    () => (joinOverlay ? [] : selectedItems),
    [joinOverlay, selectedItems],
  );
  const explorerCurrentFilePath = joinOverlay ? null : currentFilePath;
  const explorerSplitFilePath = joinOverlay ? null : secondaryFilePath;

  const saveSplitViewState = useCallback(async (primaryFile: string | null, secondaryFile: string | null) => {
    const enabled = Boolean(primaryFile && secondaryFile);

    await Promise.all([
      saveStuff("splitViewEnabled", enabled),
      saveStuff("splitViewPrimaryFile", primaryFile),
      saveStuff("splitViewOtherFile", secondaryFile),
    ]);
  }, []);

  const refreshExecutionHistory = useCallback(async () => {
    if (disableHistory) {
      setExecutionHistory([]);
      return;
    }

    const history = await invoke<HistoryItem[]>("list_history").catch(() => null);
    if (history) {
      setExecutionHistory(history);
    }
  }, [disableHistory]);

  const saveSidePanel = useCallback(async (panel: SidePanel | null) => {
    await Promise.all([
      saveStuff("showAccountsPanel", panel === "accounts"),
      saveStuff("showHistoryPanel", panel === "history"),
    ]);
  }, []);

  const clearQueuedSidePanel = useCallback(() => {
    if (sidePanelSwitchTimerRef.current) {
      clearTimeout(sidePanelSwitchTimerRef.current);
      sidePanelSwitchTimerRef.current = null;
    }
    pendingSidePanelRef.current = null;
  }, []);

  const applyActiveSidePanel = useCallback((panel: SidePanel | null) => {
    activeSidePanelRef.current = panel;
    setActiveSidePanel(panel);
    void saveSidePanel(panel);
  }, [saveSidePanel]);

  const clearPrimaryHistoryBuffer = useCallback(() => {
    setPrimaryBufferPath(null);
  }, []);

  const getExecutionDisplayName = useCallback((filePath: string | null, fallbackName?: string | null) => {
    if (filePath) {
      const parts = filePath.split("/");
      return parts[parts.length - 1] || "Untitled Script";
    }

    if (fallbackName && fallbackName.trim()) {
      return fallbackName.trim();
    }

    return "Untitled Script";
  }, []);

  const primaryBufferName = primaryBufferPath?.[primaryBufferPath.length - 1] ?? null;

  const requestSidePanel = useCallback((nextPanel: SidePanel | null) => {
    setAnimateSidePanelVisibilityTransitions(true);

    if (sidePanelSwitchTimerRef.current) {
      pendingSidePanelRef.current = nextPanel;
      return;
    }

    const currentPanel = activeSidePanelRef.current;
    if (currentPanel === nextPanel) {
      clearQueuedSidePanel();
      applyActiveSidePanel(null);
      return;
    }

    if (currentPanel !== null && nextPanel !== null) {
      pendingSidePanelRef.current = nextPanel;
      applyActiveSidePanel(null);
      sidePanelSwitchTimerRef.current = setTimeout(() => {
        sidePanelSwitchTimerRef.current = null;
        const queuedPanel = pendingSidePanelRef.current;
        pendingSidePanelRef.current = null;
        if (queuedPanel) {
          applyActiveSidePanel(queuedPanel);
        }
      }, SIDE_PANEL_SWITCH_DELAY_MS);
      return;
    }

    clearQueuedSidePanel();
    applyActiveSidePanel(nextPanel);
  }, [applyActiveSidePanel, clearQueuedSidePanel]);

  const openJoinOverlay = useCallback((userIds: string[], mode: AccountJoinMode) => {
    setJoinOverlay({
      userIds,
      mode,
      placeId: "",
      link: "",
      submitting: false,
    });
  }, []);

  const closeJoinOverlay = useCallback(() => {
    setJoinOverlay((prev) => {
      if (!prev || prev.submitting) {
        return prev;
      }

      return null;
    });
  }, []);

  const updateJoinOverlayField = useCallback((field: "placeId" | "link", value: string) => {
    setJoinOverlay((prev) => (prev ? { ...prev, [field]: value } : prev));
  }, []);

  const handleJoinOverlaySubmit = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!joinOverlay || !joinOverlayCanSubmit) {
      return;
    }

    const request = joinOverlay.mode === "place"
      ? { kind: "place", placeId: joinOverlay.placeId.trim() }
      : { kind: "serverLink", link: joinOverlay.link.trim() };
    const targetUserIds = joinOverlayTargetUserIds;

    setJoinOverlay((prev) => (prev ? { ...prev, submitting: true } : prev));

    let hadFailure = false;
    const joinedUserIds: string[] = [];

    try {
      for (let index = 0; index < targetUserIds.length; index += 1) {
        const userId = targetUserIds[index];

        try {
          await invoke("launch_instance_join", { userId, request });
          joinedUserIds.push(userId);
        } catch {
          hadFailure = true;
        }

        if (index < targetUserIds.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 3500));
        }
      }
    } finally {
      if (joinedUserIds.length > 0) {
        const joinedUserIdsSet = new Set(joinedUserIds);
        setSelectedAccounts((prev) => prev.filter((userId) => !joinedUserIdsSet.has(userId)));
      }

      if (hadFailure) {
        const joinedUserIdsSet = new Set(joinedUserIds);
        setJoinOverlay((prev) => (
          prev
            ? {
                ...prev,
                userIds: targetUserIds.filter((userId) => !joinedUserIdsSet.has(userId)),
                submitting: false,
              }
            : prev
        ));
      } else {
        setJoinOverlay(null);
      }
    }
  }, [joinOverlay, joinOverlayCanSubmit, joinOverlayTargetUserIds]);

  useEffect(() => {
    if (onCurrentFileChange) {
      const primaryName = currentFilePath
        ? currentFilePath.split('/').pop() || null
        : primaryBufferPath?.[primaryBufferPath.length - 1] || null;
      const secondaryName = secondaryFilePath ? secondaryFilePath.split('/').pop() || null : null;
      let rpcName: string | null = primaryName;

      if (primaryName && secondaryName) {
        rpcName = `${primaryName} and ${secondaryName}`;
      } else if (!primaryName && secondaryName) {
        rpcName = secondaryName;
      }

      onCurrentFileChange(rpcName);
    }
  }, [currentFilePath, onCurrentFileChange, primaryBufferPath, secondaryFilePath]);

  const handleNewScript = useCallback(async () => {
    await (async () => {
      const rootChildren = treeData.root?.children || [];
      const firstFolderId = rootChildren.find(id => id !== "autoexec" && id.startsWith("folder-"));
      
      if (!firstFolderId) {
        return;
      }
      
      const folder = treeData[firstFolderId];
      if (!folder || !folder.path) {
        return;
      }
      
      let fileName = "Script.lua";
      let counter = 1;
      
      const existingFiles = (folder.children || [])
        .map(childId => treeData[childId]?.name)
        .filter(Boolean);
      
      while (existingFiles.includes(fileName)) {
        fileName = `Script (${counter}).lua`;
        counter++;
      }
      
      const filePath = `${folder.path}/${fileName}`;
      await writeTextFile(filePath, "-- New script\n");
      
      const baseFileId = `${firstFolderId}-${fileName}`;
      const newFileId = makeIdTree(baseFileId, treeDataRef.current);
      setTreeDataWithRef(prev => {
        const newTree = { ...prev };
        newTree[newFileId] = {
          name: fileName,
          path: filePath,
        };
        const parentFolder = newTree[firstFolderId];
        if (parentFolder && parentFolder.children) {
          newTree[firstFolderId] = {
            ...parentFolder,
            children: [...parentFolder.children, newFileId],
          };
        }
        return newTree;
      });
      
      if (!expandedItems.includes(firstFolderId)) {
        const newExpanded = [...expandedItems, firstFolderId];
        setExpandedItems(newExpanded);
        saveExplorerData("expandedFolders", newExpanded);
      }
      
      setCode("-- New script\n");
      setCurrentFilePath(filePath);
      clearPrimaryHistoryBuffer();
      await saveExplorerData("lastOpenedFile", filePath);
      
      setPendingRenameId(newFileId);
    })().catch(() => {
    });
  }, [clearPrimaryHistoryBuffer, expandedItems, treeData]);

  const handleNewFolder = useCallback(async () => {
    await (async () => {
      const home = await homeDir();
      const celestialPath = await join(home, "Documents", "Celestial");
      
      let folderName = "New Folder";
      let counter = 1;
      
      const existingFolders = (treeData.root?.children || [])
        .filter(id => id.startsWith("folder-"))
        .map(id => treeData[id]?.name)
        .filter(Boolean);
      
      while (existingFolders.includes(folderName)) {
        folderName = `New Folder (${counter})`;
        counter++;
      }
      
      const folderPath = await join(celestialPath, folderName);
      await mkdir(folderPath, { recursive: true });
      
      const baseFolderId = `folder-${folderName}`;
      const newFolderId = makeIdTree(baseFolderId, treeDataRef.current);
      setTreeDataWithRef(prev => {
        const newTree = { ...prev };
        newTree[newFolderId] = {
          name: folderName,
          path: folderPath,
          children: [],
        };
        const rootChildren = [...(prev.root?.children || [])];
        const autoexecIndex = rootChildren.indexOf("autoexec");
        if (autoexecIndex >= 0) {
          rootChildren.splice(autoexecIndex, 0, newFolderId);
        } else {
          rootChildren.push(newFolderId);
        }
        newTree.root = { ...prev.root, children: rootChildren };
        return newTree;
      });
      
      const newExpanded = [...expandedItems, newFolderId];
      setExpandedItems(newExpanded);
      saveExplorerData("expandedFolders", newExpanded);
      
      setPendingRenameId(newFolderId);
    })().catch(() => {
    });
  }, [treeData, expandedItems]);

  useEffect(() => {
    handleNewScriptRef.current = handleNewScript;
  }, [handleNewScript]);

  useEffect(() => {
    handleNewFolderRef.current = handleNewFolder;
  }, [handleNewFolder]);

  const refreshExplorer = useCallback(async (isInitial = false) => {
    await (async () => {
      const home = await homeDir();
      const celestialPath = await join(home, "Documents", "Celestial");
      
      const celestialEntries = await readDir(celestialPath).catch(() => []);
      
      const userFolders = celestialEntries
        .filter(entry => entry.isDirectory)
        .filter(entry => !entry.name?.startsWith('.'))
        .filter(entry => !(hideTrayFolder && entry.name === "Tray"));
      
      if (userFolders.length === 0) {
        const defaultFolderPath = await join(celestialPath, "Scripts");
        const createdDefault = await mkdir(defaultFolderPath, { recursive: true })
          .then(() => true)
          .catch(() => false);
        if (createdDefault) {
          userFolders.push({
            name: "Scripts",
            isDirectory: true,
            isFile: false,
            isSymlink: false,
          });
        }
      }
      
      const newTreeData: Record<string, TreeItem> = {
        root: { name: "Root", children: [] },
        autoexec: { name: "Auto-Execute", children: [] },
      };
      
      const rootChildren: string[] = [];
      
      const folderPromises = userFolders.map(async (folder) => {
        const folderId = `folder-${folder.name}`;
        const folderPath = await join(celestialPath, folder.name);
        
        const folderEntries = await readDir(folderPath).catch(() => []);
        
        const fileIds: string[] = [];
        const fileData: Record<string, TreeItem> = {};
        
        folderEntries
          .filter(entry => !entry.isDirectory)
          .filter(entry => entry.name?.toLowerCase().endsWith('.lua') || entry.name?.toLowerCase().endsWith('.luau') || entry.name?.toLowerCase().endsWith('.txt'))
          .filter(entry => !entry.name?.startsWith('.'))
          .forEach(entry => {
            const fileId = `${folderId}-${entry.name}`;
            fileIds.push(fileId);
            fileData[fileId] = {
              name: entry.name || '',
              path: `${folderPath}/${entry.name}`,
            };
          });
        
        return {
          folderId,
          folderPath,
          folderName: folder.name,
          fileIds,
          fileData,
        };
      });
      
      const folderResults = await Promise.all(folderPromises);
      
      for (const result of folderResults) {
        rootChildren.push(result.folderId);
        Object.assign(newTreeData, result.fileData);
        newTreeData[result.folderId] = {
          name: result.folderName,
          path: result.folderPath,
          children: result.fileIds,
        };
      }
      
      rootChildren.push("autoexec");
      newTreeData.root.children = rootChildren;
      
      const autoExecPath = executor === "opium"
        ? await join(home, "Opiumware", "autoexec")
        : executor === "ms"
          ? await join(home, "Documents", "Macsploit Automatic Execution")
          : await join(home, "Hydrogen", "autoexecute");

      await mkdir(autoExecPath, { recursive: true }).catch(() => {});
      
      const celestialLuaPath = await join(autoExecPath, "celestial.lua");
      const celestialLuaExists = await exists(celestialLuaPath).catch(() => true);
      if (!celestialLuaExists) {
        await writeTextFile(celestialLuaPath, CELESTIAL_AUTOEXEC_LUA).catch(() => {});
      }
      
      const autoExecEntries = await readDir(autoExecPath).catch(() => null);
      if (autoExecEntries) {
        const autoExecChildren: string[] = [];
        
        autoExecEntries
          .filter(entry => !entry.isDirectory)
          .filter(entry => !entry.name?.startsWith('.'))
          .forEach(entry => {
            const fileId = `autoexec-${entry.name}`;
            autoExecChildren.push(fileId);
            newTreeData[fileId] = {
              name: entry.name || '',
              path: `${autoExecPath}/${entry.name}`,
            };
          });
        
        newTreeData.autoexec.children = autoExecChildren;
        newTreeData.autoexec.path = autoExecPath;
      } else {
        newTreeData.autoexec.path = autoExecPath;
      }
      
      const explorerData = await readExplorerData().catch(() => null);
      if (explorerData?.treeOrder) {
        const savedOrder = explorerData.treeOrder;
        let orderChanged = false;
        const cleanedOrder: Record<string, string[]> = {};
        
        for (const [parentId, savedChildren] of Object.entries(savedOrder)) {
          if (!newTreeData[parentId] || !newTreeData[parentId].children) {
            orderChanged = true;
            continue;
          }
          
          const currentChildren = newTreeData[parentId].children!;
          const reordered = savedChildren.filter(id => currentChildren.includes(id));
          const newChildren = currentChildren.filter(id => !savedChildren.includes(id));
          newTreeData[parentId].children = [...reordered, ...newChildren];
          cleanedOrder[parentId] = newTreeData[parentId].children!;
          
          if (reordered.length !== savedChildren.length) {
            orderChanged = true;
          }
        }
        
        if (orderChanged) {
          await saveExplorerData('treeOrder', cleanedOrder);
        }
      }
      
      setTreeDataWithRef(newTreeData);
      
      if (isInitial) {
        const explorerData = await readExplorerData().catch(() => null);
        if (explorerData) {
          if (explorerData.lastOpenedFile) {
            const fileExists = await exists(explorerData.lastOpenedFile);
            if (fileExists) {
              const content = await readTextFile(explorerData.lastOpenedFile);
              setCode(content);
              setCurrentFilePath(explorerData.lastOpenedFile);
              clearPrimaryHistoryBuffer();
            } else {
              await saveExplorerData("lastOpenedFile", null);
            }
          }

          if (explorerData.expandedFolders && Array.isArray(explorerData.expandedFolders)) {
            const validFolders = explorerData.expandedFolders.filter(id => 
              newTreeData[id] !== undefined
            );
            setExpandedItems(validFolders);
            if (validFolders.length !== explorerData.expandedFolders.length) {
              await saveExplorerData("expandedFolders", validFolders);
            }
          }
        }
        
        const stuff = await readStuff().catch(() => null);
        if (stuff) {
          setAnimateExplorerVisibilityTransitions(false);
          setAnimateSidePanelVisibilityTransitions(false);

          if (stuff.accountsWidth && typeof stuff.accountsWidth === 'number') {
            setAccountsWidth(stuff.accountsWidth);
            accountsWidthRef.current = stuff.accountsWidth;
          }

          if (!disableHistory && stuff.showHistoryPanel === true) {
            applyActiveSidePanel("history");
          } else if (stuff.showAccountsPanel === true) {
            applyActiveSidePanel("accounts");
          }

          if (typeof stuff.showExplorer === 'boolean') {
            desiredShowExplorerRef.current = stuff.showExplorer;
            setShowExplorer(stuff.showExplorer);
          }

          const splitEnabled = stuff.splitViewEnabled === true;
          const splitPrimary = typeof stuff.splitViewPrimaryFile === "string" ? stuff.splitViewPrimaryFile : null;
          const splitOther = typeof stuff.splitViewOtherFile === "string" ? stuff.splitViewOtherFile : null;

          if (splitEnabled && splitPrimary && splitOther) {
            const [primaryExists, secondaryExists] = await Promise.all([
              exists(splitPrimary),
              exists(splitOther),
            ]);

            if (primaryExists && secondaryExists) {
              const [primaryContent, secondaryContent] = await Promise.all([
                readTextFile(splitPrimary),
                readTextFile(splitOther),
              ]);
              setCode(primaryContent);
              setCurrentFilePath(splitPrimary);
              setSecondaryCode(secondaryContent);
              setSecondaryFilePath(splitOther);
              setActiveEditor("primary");
              clearPrimaryHistoryBuffer();
            } else {
              await saveSplitViewState(null, null);
            }
          }
        }

        setHasHydratedPanelVisibility(true);

      }
    })().catch(() => {
    }).finally(() => {
      if (isInitial) {
        editorReady();
      }
    });
  }, [applyActiveSidePanel, clearPrimaryHistoryBuffer, disableHistory, executor, hideTrayFolder, editorReady, saveSplitViewState, setAccounts, setCode, setCurrentFilePath, setExpandedItems, setTreeDataWithRef]);

  useEffect(() => {
    void refreshExplorer(true);
  }, []);

  useEffect(() => {
    if (!hasObservedHideTrayFolderRef.current) {
      hasObservedHideTrayFolderRef.current = true;
      return;
    }

    void refreshExplorer(false);
  }, [hideTrayFolder, refreshExplorer]);

  useEffect(() => {
    void refreshExplorer(false);
  }, [executor, refreshExplorer]);

  useEffect(() => {
    let cancelled = false;
    const frameId = requestAnimationFrame(() => {
      void invoke<Account[]>("get_accounts")
        .then((savedAccounts) => {
          if (!cancelled && Array.isArray(savedAccounts)) {
            setAccounts(savedAccounts);
          }
        })
        .catch(() => {
        });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
    };
  }, []);

  useEffect(() => {
    const unlisten = listen("refresh-explorer", () => {
      refreshExplorer(false);
    });
    
    return () => {
      unlisten.then(f => f());
    };
  }, [refreshExplorer]);

  useEffect(() => {
    if (!hasHydratedPanelVisibility) {
      return;
    }

    const frameId = requestAnimationFrame(() => {
      setAnimateExplorerVisibilityTransitions(true);
      setAnimateSidePanelVisibilityTransitions(true);
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [hasHydratedPanelVisibility]);

  useEffect(() => {
    return () => {
      clearQueuedSidePanel();
    };
  }, [clearQueuedSidePanel]);

  useEffect(() => {
    if (hideMultiInstanceButton || disableHistory) {
      let reEnableFrameId: number | null = null;
      setAnimateSidePanelVisibilityTransitions(false);
      const frameId = requestAnimationFrame(() => {
        if (hideMultiInstanceButton || activeSidePanelRef.current === "history") {
          clearQueuedSidePanel();
          applyActiveSidePanel(null);
        }
        if (disableHistory) {
          setExecutionHistory([]);
        }
        if (hasHydratedPanelVisibility) {
          reEnableFrameId = requestAnimationFrame(() => {
            setAnimateSidePanelVisibilityTransitions(true);
          });
        }
      });

      return () => {
        cancelAnimationFrame(frameId);
        if (reEnableFrameId !== null) {
          cancelAnimationFrame(reEnableFrameId);
        }
      };
    }
  }, [applyActiveSidePanel, clearQueuedSidePanel, disableHistory, hasHydratedPanelVisibility, hideMultiInstanceButton]);

  const handleFileOpen = useCallback(async (path: string) => {
    await (async () => {
      if (currentFilePath && saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        await writeTextFile(currentFilePath, code);
      }
      
      const content = await readTextFile(path);
      setCode(content);
      setCurrentFilePath(path);
      setActiveEditor("primary");
      clearPrimaryHistoryBuffer();

      await saveExplorerData("lastOpenedFile", path);
      if (secondaryFilePath) {
        await saveSplitViewState(path, secondaryFilePath);
      }
    })().catch(() => {
    });
  }, [clearPrimaryHistoryBuffer, code, currentFilePath, saveSplitViewState, secondaryFilePath]);

  const handleSplitViewOpen = useCallback(async (path: string) => {
    if (!path || path === currentFilePath) {
      return;
    }
    if (path === secondaryFilePath) {
      setActiveEditor("secondary");
      return;
    }

    if (secondaryFilePath && secondarySaveTimerRef.current) {
      clearTimeout(secondarySaveTimerRef.current);
      secondarySaveTimerRef.current = null;
      const persistedSecondary = await writeTextFile(secondaryFilePath, secondaryCode)
        .then(() => true)
        .catch(() => false);
      if (!persistedSecondary) {
        return;
      }
    }

    const content = await readTextFile(path).catch(() => null);
    if (content === null) {
      return;
    }

    setSecondaryCode(content);
    setSecondaryFilePath(path);
    setActiveEditor("secondary");
    await saveSplitViewState(currentFilePath, path).catch(() => {});
  }, [currentFilePath, saveSplitViewState, secondaryCode, secondaryFilePath]);

  const closeSplitView = useCallback(async (target: "primary" | "secondary" = "secondary") => {
    const nextPrimaryFilePath = target === "primary" ? secondaryFilePath : currentFilePath;
    if (secondaryFilePath && secondarySaveTimerRef.current) {
      clearTimeout(secondarySaveTimerRef.current);
      secondarySaveTimerRef.current = null;
      await writeTextFile(secondaryFilePath, secondaryCode).catch(() => {});
    }

    if (target === "primary") {
      if (currentFilePath && saveTimerRef.current) {
          clearTimeout(saveTimerRef.current);
          saveTimerRef.current = null;
          await writeTextFile(currentFilePath, code).catch(() => {});
      }

      setCode(secondaryCode);
      setCurrentFilePath(secondaryFilePath);
      clearPrimaryHistoryBuffer();
      
      if (secondaryFilePath) {
        saveExplorerData("lastOpenedFile", secondaryFilePath).catch(() => {});
      }
    }

    setSecondaryFilePath(null);
    setSecondaryCode("-- Select a file");
    setActiveEditor("primary");
    await saveSplitViewState(nextPrimaryFilePath ?? null, null);
  }, [clearPrimaryHistoryBuffer, code, currentFilePath, secondaryCode, secondaryFilePath, saveSplitViewState]);

  const saveCurrentFile = useCallback(async (content: string) => {
    if (!currentFilePath) return;
    await writeTextFile(currentFilePath, content).catch(() => {});
  }, [currentFilePath]);

  const saveSecondaryFile = useCallback(async (content: string) => {
    if (!secondaryFilePath) return;
    await writeTextFile(secondaryFilePath, content).catch(() => {});
  }, [secondaryFilePath]);

  const handleCodeChange = useCallback(async (newValue: string) => {
    setCode(newValue);
    
    if (!currentFilePath && newValue !== "-- Select a file" && newValue.trim() !== "") {
      await (async () => {
        const rootChildren = treeData.root?.children || [];
        const firstFolderId = rootChildren.find(id => id !== "autoexec" && id.startsWith("folder-"));
        
        if (!firstFolderId) {
          return;
        }
        
        const folder = treeData[firstFolderId];
        if (!folder || !folder.path) {
          return;
        }
        
        let fileName = "Script.lua";
        let counter = 1;
        
        const existingFiles = (folder.children || [])
          .map(childId => treeData[childId]?.name)
          .filter(Boolean);
        
        while (existingFiles.includes(fileName)) {
          fileName = `Script (${counter}).lua`;
          counter++;
        }
        
        const filePath = `${folder.path}/${fileName}`;
        
        await writeTextFile(filePath, newValue);
        setCurrentFilePath(filePath);
        clearPrimaryHistoryBuffer();
        
        const baseItemId = `${firstFolderId}-${fileName}`;
        const newItemId = makeIdTree(baseItemId, treeDataRef.current);
        setTreeDataWithRef(prev => {
          const newTree = { ...prev };
          newTree[newItemId] = {
            name: fileName,
            path: filePath,
          };
          const parentFolder = newTree[firstFolderId];
          if (parentFolder && parentFolder.children) {
            newTree[firstFolderId] = {
              ...parentFolder,
              children: [...parentFolder.children, newItemId],
            };
          }
          return newTree;
        });
      })().catch(() => {
      });
      return;
    }
    
    if (currentFilePath) {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = setTimeout(() => {
        saveCurrentFile(newValue);
      }, 500);
    }
  }, [clearPrimaryHistoryBuffer, currentFilePath, saveCurrentFile, treeData]);

  const handleSecondaryCodeChange = useCallback((newValue: string) => {
    setSecondaryCode(newValue);

    if (secondaryFilePath) {
      if (secondarySaveTimerRef.current) {
        clearTimeout(secondarySaveTimerRef.current);
      }
      secondarySaveTimerRef.current = setTimeout(() => {
        saveSecondaryFile(newValue);
      }, 500);
    }
  }, [secondaryFilePath, saveSecondaryFile]);

  useEffect(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, [currentFilePath]);

  useEffect(() => {
    if (secondarySaveTimerRef.current) {
      clearTimeout(secondarySaveTimerRef.current);
      secondarySaveTimerRef.current = null;
    }
  }, [secondaryFilePath]);

  useEffect(() => {
    if (splitViewSaveTimerRef.current) {
      clearTimeout(splitViewSaveTimerRef.current);
    }

    splitViewSaveTimerRef.current = setTimeout(() => {
      saveSplitViewState(currentFilePath, secondaryFilePath).catch(() => {});
    }, 300);

    return () => {
      if (splitViewSaveTimerRef.current) {
        clearTimeout(splitViewSaveTimerRef.current);
      }
    };
  }, [currentFilePath, secondaryFilePath, saveSplitViewState]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      if (secondarySaveTimerRef.current) {
        clearTimeout(secondarySaveTimerRef.current);
      }
    };
  }, []);


  const executeWithCode = useCallback(async (script: string, name: string) => {
    let selectedRunningAccounts: string[] = [];

    if (showAccountsPanel) {
      const running = await invoke<string[]>('get_running_instances').catch(() => [] as string[]);
      selectedRunningAccounts = selectedAccounts.filter((userId) => running.includes(userId));

      if (running.length > 0 && selectedRunningAccounts.length === 0) {
        toast.error("Select at least one instance to execute");
        return;
      }
    }

    if (showAccountsPanel && selectedRunningAccounts.length > 0) {
      const result = await invoke('execute_via_bridge', { userIds: selectedRunningAccounts, script, executor, name })
        .then(() => ({ ok: true as const }))
        .catch((err) => ({ ok: false as const, err }));
      if (result.ok && showHistoryPanel) {
        void refreshExecutionHistory();
      }
      return;
    }

    if (executor === "opium") {
      const result = await invoke("execute_with_executor", { script, port: "ALL", name, executor })
        .then(() => ({ ok: true as const }))
        .catch((err) => ({ ok: false as const, err }));
      if (result.ok && showHistoryPanel) {
        void refreshExecutionHistory();
      }
      return;
    }

    if (executor === "ms") {
      const result = await invoke("execute_with_executor", { script, port: "ALL", name, executor })
        .then(() => ({ ok: true as const }))
        .catch((err) => ({ ok: false as const, err }));
      if (!result.ok) {
        toast.error("Macsploit execution failed");
      }
      if (result.ok && showHistoryPanel) {
        void refreshExecutionHistory();
      }
      return;
    }

    const key = await invoke<string>('get_hydrogen_key').catch(() => "");
    if (!key || !key.trim()) {
      return;
    }

    const installed = await invoke<boolean>('is_hydrogen_installed').catch(() => false);
    if (!installed) {
      toast.error("You don't have Hydrogen installed");
      return;
    }
    
    const running = await invoke<string[]>('get_running_instances').catch(() => [] as string[]);
    if (running.length > 1) {
      return;
    }

    const result = await invoke('execute_with_executor', { script, name, executor })
      .then(() => ({ ok: true as const }))
      .catch((err) => ({ ok: false as const, err }));
    if (result.ok && showHistoryPanel) {
      void refreshExecutionHistory();
    }
  }, [executor, refreshExecutionHistory, selectedAccounts, showAccountsPanel, showHistoryPanel]);

  const handleExecutePrimary = useCallback(() => {
    setActiveEditor("primary");
    executeWithCode(code, getExecutionDisplayName(currentFilePath, primaryBufferName));
  }, [code, currentFilePath, executeWithCode, getExecutionDisplayName, primaryBufferName]);

  const handleExecuteSecondary = useCallback(() => {
    setActiveEditor("secondary");
    executeWithCode(secondaryCode, getExecutionDisplayName(secondaryFilePath));
  }, [executeWithCode, getExecutionDisplayName, secondaryCode, secondaryFilePath]);

  useEffect(() => {
    const executeActive = () => {
      if (secondaryFilePath) {
        executeWithCode(code, getExecutionDisplayName(currentFilePath, primaryBufferName));
        executeWithCode(secondaryCode, getExecutionDisplayName(secondaryFilePath));
        return;
      }

      const script = activeEditor === "secondary" ? secondaryCode : code;
      const name = activeEditor === "secondary"
        ? getExecutionDisplayName(secondaryFilePath)
        : getExecutionDisplayName(currentFilePath, primaryBufferName);
      executeWithCode(script, name);
    };

    handleExecuteRef.current = executeActive;
    if (onExecuteRef) {
      onExecuteRef.current = executeActive;
    }
    if (onExecuteScriptTextRef) {
      onExecuteScriptTextRef.current = ({ script, name }) => {
        executeWithCode(script, getExecutionDisplayName(null, name ?? "Tray Script"));
      };
    }
    return () => {
      if (onExecuteRef) {
        onExecuteRef.current = null;
      }
      if (onExecuteScriptTextRef) {
        onExecuteScriptTextRef.current = null;
      }
    };
  }, [activeEditor, code, currentFilePath, executeWithCode, getExecutionDisplayName, onExecuteRef, onExecuteScriptTextRef, primaryBufferName, secondaryCode, secondaryFilePath]);

  useEffect(() => {
    currentWidthRef.current = explorerWidth;
  }, [explorerWidth]);

  const startResizing = useCallback((mouseDownEvent: React.MouseEvent) => {
    mouseDownEvent.preventDefault();
    mouseDownEvent.stopPropagation();

    const startX = mouseDownEvent.clientX;
    const startWidth = explorerWidth;
    const stopSelection = (event: Event) => {
      event.preventDefault();
    };

    currentWidthRef.current = startWidth;
    setLiveExplorerWidth(startWidth);
    setIsExplorerDragging(true);

    const doDrag = (mouseMoveEvent: MouseEvent) => {
      const currentX = mouseMoveEvent.clientX;
      const diff = currentX - startX;
      const newWidth = Math.min(Math.max(startWidth - diff, 150), 250);
      
      currentWidthRef.current = newWidth;
      setLiveExplorerWidth(newWidth);
    };

    const stopDrag = () => {
      document.removeEventListener('mousemove', doDrag);
      document.removeEventListener('mouseup', stopDrag);
      document.removeEventListener('selectstart', stopSelection);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = '';
      document.body.style.webkitUserSelect = '';
      
      setExplorerWidth(currentWidthRef.current);
      commitExplorerWidth(currentWidthRef.current);
      setLiveExplorerWidth(null);
      setIsExplorerDragging(false);
    };

    document.addEventListener('mousemove', doDrag);
    document.addEventListener('mouseup', stopDrag);
    document.addEventListener('selectstart', stopSelection);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';
  }, [explorerWidth, setExplorerWidth, commitExplorerWidth]);

  const startAccountsResizing = useCallback((mouseDownEvent: React.MouseEvent) => {
    const startX = mouseDownEvent.clientX;
    const startWidth = accountsWidth;
    
    accountsWidthRef.current = startWidth;

    const doDrag = (mouseMoveEvent: MouseEvent) => {
      const currentX = mouseMoveEvent.clientX;
      const diff = currentX - startX;
      const newWidth = Math.min(Math.max(startWidth + diff, 150), 250);
      
      accountsWidthRef.current = newWidth;
      setAccountsWidth(newWidth);
    };

    const stopDrag = async () => {
      document.removeEventListener('mousemove', doDrag);
      document.removeEventListener('mouseup', stopDrag);
      document.body.style.cursor = 'default';
      
      await saveStuff('accountsWidth', accountsWidthRef.current);
    };

    document.addEventListener('mousemove', doDrag);
    document.addEventListener('mouseup', stopDrag);
    document.body.style.cursor = 'col-resize';
  }, [accountsWidth]);

  const startSplitResizing = useCallback((mouseDownEvent: React.MouseEvent) => {
    const splitContainer = mouseDownEvent.currentTarget.parentElement;
    if (!splitContainer) return;
    
    const containerRect = splitContainer.getBoundingClientRect();
    const containerWidth = containerRect.width;
    const startX = mouseDownEvent.clientX;
    const startRatio = splitRatio;
    
    splitRatioRef.current = startRatio;
    setIsSplitDragging(true);

    const doDrag = (mouseMoveEvent: MouseEvent) => {
      const currentX = mouseMoveEvent.clientX;
      const deltaX = currentX - startX;
      const deltaPercent = (deltaX / containerWidth) * 100;
      const newRatio = Math.min(Math.max(startRatio + deltaPercent, 30), 70);
      
      splitRatioRef.current = newRatio;
      setSplitRatio(newRatio);
    };

    const stopDrag = () => {
      document.removeEventListener('mousemove', doDrag);
      document.removeEventListener('mouseup', stopDrag);
      document.body.style.cursor = 'default';
      setIsSplitDragging(false);
    };

    document.addEventListener('mousemove', doDrag);
    document.addEventListener('mouseup', stopDrag);
    document.body.style.cursor = 'col-resize';
  }, [splitRatio]);

  useEffect(() => {
    if (!showAccountsPanel) return;
    
    const refreshAccounts = async () => {
      const savedAccounts = await invoke<Account[]>('get_accounts').catch(() => null);
      if (savedAccounts) {
        setAccounts(savedAccounts);
        const knownIds = new Set(savedAccounts.map((account) => account.user_id));
        setSelectedAccounts((prev) => prev.filter((id) => knownIds.has(id)));
      }
    };
    refreshAccounts();
    
    const checkRunning = async () => {
      const running = await invoke<string[]>('get_running_instances').catch(() => null);
      if (running) {
        setRunningAccounts(running);
      }
    };
    
    checkRunning();
    
    const interval = setInterval(checkRunning, 3000);
    
    return () => clearInterval(interval);
  }, [showAccountsPanel]);

  const toggleExplorer = useCallback(() => {
    if (windowWidth < EXPLORER_MIN_WIDTH) {
      return;
    }
    setAnimateExplorerVisibilityTransitions(true);
    setShowExplorer(prev => {
      const newState = !prev;
      desiredShowExplorerRef.current = newState;
      saveStuff('showExplorer', newState);
      return newState;
    });
  }, [windowWidth]);

  const toggleAccountsPanel = useCallback(() => {
    requestSidePanel(showAccountsPanel ? null : "accounts");
  }, [requestSidePanel, showAccountsPanel]);

  const toggleHistoryPanel = useCallback(() => {
    if (disableHistory) {
      return;
    }
    requestSidePanel(showHistoryPanel ? null : "history");
  }, [disableHistory, requestSidePanel, showHistoryPanel]);

  const handleOpenHistoryEntry = useCallback(async (id: number) => {
    const entry = await invoke<HistoryEntry>("get_history", { id }).catch(() => null);
    if (!entry) {
      return;
    }

    if (currentFilePath && saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      await writeTextFile(currentFilePath, code).catch(() => {});
    }

    setCode(entry.content);
    setCurrentFilePath(null);
    setPrimaryBufferPath(["History", entry.name]);
    setActiveEditor("primary");
  }, [code, currentFilePath]);

  useEffect(() => {
    if (!showHistoryPanel || disableHistory) {
      return;
    }

    void refreshExecutionHistory();
  }, [disableHistory, refreshExecutionHistory, showHistoryPanel]);

  useEffect(() => {
    toggleExplorerRef.current = toggleExplorer;
  }, [toggleExplorer]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isActive) return;

      if (matches(parsedKeybinds.toggleAccountsPanel, e)) {
        e.preventDefault();
        e.stopPropagation();
        toggleAccountsPanel();
      }

      if (matches(parsedKeybinds.toggleExplorer, e)) {
        e.preventDefault();
        e.stopPropagation();
        toggleExplorer();
      }

      if (matches(parsedKeybinds.newFolder, e)) {
        e.preventDefault();
        handleNewFolder();
      } else if (matches(parsedKeybinds.newScript, e)) {
        e.preventDefault();
        handleNewScript();
      }

      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
      
      if (!isInput && matches(parsedKeybinds.deleteActiveScript, e)) {
        e.preventDefault();
        if (handleDeleteRef.current) {
          handleDeleteRef.current();
        }
      }

      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key === 'ArrowUp') {
        e.preventDefault();
        if (navigateFilesRef.current) {
          navigateFilesRef.current(-1);
        }
      } else if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key === 'ArrowDown') {
        e.preventDefault();
        if (navigateFilesRef.current) {
          navigateFilesRef.current(1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNewFolder, handleNewScript, isActive, parsedKeybinds, toggleAccountsPanel, toggleExplorer]);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!joinOverlay) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !joinOverlay.submitting) {
        setJoinOverlay(null);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [joinOverlay]);

  useEffect(() => {
    if (windowWidth < EXPLORER_MIN_WIDTH) {
      if (showExplorer) {
        desiredShowExplorerRef.current = true;
        let reEnableFrameId: number | null = null;
        setAnimateExplorerVisibilityTransitions(false);
        const frameId = requestAnimationFrame(() => {
          setShowExplorer(false);
          if (hasHydratedPanelVisibility) {
            reEnableFrameId = requestAnimationFrame(() => {
              setAnimateExplorerVisibilityTransitions(true);
            });
          }
        });

        return () => {
          cancelAnimationFrame(frameId);
          if (reEnableFrameId !== null) {
            cancelAnimationFrame(reEnableFrameId);
          }
        };
      }
      return;
    }

    if (!showExplorer && desiredShowExplorerRef.current) {
      let reEnableFrameId: number | null = null;
      setAnimateExplorerVisibilityTransitions(false);
      const frameId = requestAnimationFrame(() => {
        setShowExplorer(true);
        if (hasHydratedPanelVisibility) {
          reEnableFrameId = requestAnimationFrame(() => {
            setAnimateExplorerVisibilityTransitions(true);
          });
        }
      });

      return () => {
        cancelAnimationFrame(frameId);
        if (reEnableFrameId !== null) {
          cancelAnimationFrame(reEnableFrameId);
        }
      };
    }
  }, [showExplorer, windowWidth, hasHydratedPanelVisibility]);

  const focusPrimaryEditor = useCallback(() => {
    setActiveEditor("primary");
  }, []);

  const focusSecondaryEditor = useCallback(() => {
    setActiveEditor("secondary");
  }, []);

  const showCloseSplit = secondaryFilePath !== null;
  const primaryPaneClassName = useMemo(() => {
    return cn(
      editorStyles["editor-pane"],
      editorDropTarget === "primary" && editorStyles["drop-overlay"],
    );
  }, [editorDropTarget]);

  const secondaryPaneClassName = useMemo(() => {
    return cn(
      editorStyles["editor-pane"],
      editorDropTarget === "secondary" && editorStyles["drop-overlay"],
    );
  }, [editorDropTarget]);

  const setDropTarget = useCallback((target: "primary" | "secondary" | null) => {
    setEditorDropTarget(target);
  }, []);

  const getEditorDropTarget = useCallback((x: number, y: number) => {
    const primaryRect = primaryEditorRef.current?.getBoundingClientRect();
    if (primaryRect && x >= primaryRect.left && x <= primaryRect.right && y >= primaryRect.top && y <= primaryRect.bottom) {
      return "primary" as const;
    }

    const secondaryRect = secondaryEditorRef.current?.getBoundingClientRect();
    if (secondaryRect && x >= secondaryRect.left && x <= secondaryRect.right && y >= secondaryRect.top && y <= secondaryRect.bottom) {
      return "secondary" as const;
    }

    return null;
  }, []);

  const handleDropOnEditor = useCallback((path: string, target: "primary" | "secondary") => {
    setEditorDropTarget(null);

    if (!secondaryFilePath) {
      handleSplitViewOpen(path);
      return;
    }

    if (target === "secondary") {
      handleSplitViewOpen(path);
      return;
    }

    handleFileOpen(path);
  }, [handleFileOpen, handleSplitViewOpen, secondaryFilePath]);

  const displayedExplorerWidth = liveExplorerWidth ?? explorerWidth;
  const editorSurfaceClassName = useMemo(() => {
    return cn(
      secondaryFilePath ? editorStyles["editor-split"] : editorStyles["editor-single"],
      isExplorerDragging && editorStyles["editor-resizing"],
    );
  }, [isExplorerDragging, joinOverlay, secondaryFilePath]);

  return (
    <div className={editorStyles.workspace}>
      
      
      <AccountsPanel
        showAccountsPanel={showAccountsPanel}
        animateVisibilityTransitions={animateSidePanelVisibilityTransitions}
        accountsWidth={accountsWidth}
        accounts={accounts}
        runningAccounts={runningAccounts}
        selectedAccounts={selectedAccounts}
        joinTargetUserIds={joinOverlayTargetUserIds}
        setSelectedAccounts={setSelectedAccounts}
        startAccountsResizing={startAccountsResizing}
        onOpenJoinOverlay={openJoinOverlay}
      />

      <HistoryPanel
        showHistoryPanel={showHistoryPanel}
        animateVisibilityTransitions={animateSidePanelVisibilityTransitions}
        panelWidth={accountsWidth}
        entries={historyEntries}
        onOpenEntry={handleOpenHistoryEntry}
        startPanelResizing={startAccountsResizing}
      />
      
      
      <div className={editorSurfaceClassName}>
        <div 
          className={primaryPaneClassName} 
          ref={primaryEditorRef}
          style={secondaryFilePath ? { flex: `0 0 calc(${splitRatio}% - 6px)` } : undefined}
        >
          <MonacoCodeEditor
            editorId="celestial-editor-primary"
            code={code}
            currentFilePath={currentFilePath}
            currentBufferPath={primaryBufferPath}
            onCodeChange={handleCodeChange}
            onExecute={handleExecutePrimary}
            onCloseSplit={() => closeSplitView("primary")}
            showCloseSplit={showCloseSplit}
            onEditorFocus={focusPrimaryEditor}
            showAccountsPanel={showAccountsPanel}
            showHistoryPanel={showHistoryPanel}
            hideMultiInstanceButton={hideMultiInstanceButton}
            disableHistory={disableHistory}
            placeEditorButtonsInOtherPlace={placeEditorButtonsInOtherPlace}
            disableLinting={disableLinting}
            wordWrapEnabled={wordWrapEnabled}
            smoothTypingEnabled={smoothTypingEnabled}
            disableIndentGuides={disableIndentGuides}
            onToggleAccountsPanel={toggleAccountsPanel}
            onToggleHistoryPanel={toggleHistoryPanel}
            handleNewScriptRef={handleNewScriptRef}
            handleNewFolderRef={handleNewFolderRef}
            navigateFilesRef={navigateFilesRef}
            toggleExplorerRef={toggleExplorerRef}
            handleExecuteRef={handleExecuteRef}
          />
        </div>
        {secondaryFilePath && (
          <>
            <div 
              className={cn(editorStyles["split-resize-handle"], isSplitDragging && editorStyles.dragging)}
              onMouseDown={startSplitResizing}
              role="separator"
              aria-orientation="vertical"
            />
            <div 
              className={secondaryPaneClassName} 
              ref={secondaryEditorRef}
              style={{ flex: `0 0 calc(${100 - splitRatio}% - 6px)` }}
            >
              <MonacoCodeEditor
                editorId="celestial-editor-secondary"
                code={secondaryCode}
                currentFilePath={secondaryFilePath}
                onCodeChange={handleSecondaryCodeChange}
                onExecute={handleExecuteSecondary}
                onCloseSplit={closeSplitView}
                showCloseSplit={showCloseSplit}
                onEditorFocus={focusSecondaryEditor}
                showAccountsPanel={showAccountsPanel}
                showHistoryPanel={showHistoryPanel}
                hideMultiInstanceButton={hideMultiInstanceButton}
                disableHistory={disableHistory}
                placeEditorButtonsInOtherPlace={placeEditorButtonsInOtherPlace}
                disableLinting={disableLinting}
                wordWrapEnabled={wordWrapEnabled}
                smoothTypingEnabled={smoothTypingEnabled}
                disableIndentGuides={disableIndentGuides}
                onToggleAccountsPanel={toggleAccountsPanel}
                onToggleHistoryPanel={toggleHistoryPanel}
                handleNewScriptRef={handleNewScriptRef}
                handleNewFolderRef={handleNewFolderRef}
                navigateFilesRef={navigateFilesRef}
                toggleExplorerRef={toggleExplorerRef}
                handleExecuteRef={handleExecuteRef}
              />
            </div>
          </>
        )}

        {joinOverlay && (
          <div className={editorStyles["editor-join-overlay"]}>
            <div className={editorStyles["editor-join-overlay-surface"]}>
              <form className={editorStyles["editor-join-overlay-form"]} onSubmit={handleJoinOverlaySubmit}>
                {joinOverlay.mode === "place" ? (
                  <label className={editorStyles["editor-join-overlay-field"]}>
                    <span className={uiStyles["ui-field-label"]}>Game ID</span>
                    <Input
                      autoFocus
                      inputMode="url"
                      value={joinOverlay.placeId}
                      onChange={(event) => updateJoinOverlayField("placeId", event.target.value)}
                      placeholder="189707"
                    />
                  </label>
                ) : (
                  <label className={editorStyles["editor-join-overlay-field"]}>
                    <span className={uiStyles["ui-field-label"]}>Server Link</span>
                    <Input
                      autoFocus
                      value={joinOverlay.link}
                      onChange={(event) => updateJoinOverlayField("link", event.target.value)}
                      placeholder="https://www.roblox.com/share?code=6c658017bd7ff144a0bc5db3ca8ffed7&type=Server"
                    />
                  </label>
                )}

                <div className={editorStyles["editor-join-overlay-actions"]}>
                  <Button
                    type="button"
                    variant="outline"
                    className={editorStyles["editor-join-overlay-button"]}
                    onClick={closeJoinOverlay}
                    disabled={joinOverlay.submitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className={editorStyles["editor-join-overlay-button"]}
                    disabled={joinOverlay.submitting || !joinOverlayCanSubmit}
                  >
                    Join
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
      
      
      <Explorer
        isEditorActive={isActive}
        showExplorer={showExplorer}
        animateVisibilityTransitions={animateExplorerVisibilityTransitions}
        explorerWidth={displayedExplorerWidth}
        isDragging={isExplorerDragging}
        treeData={treeData}
        treeDataRef={treeDataRef}
        setTreeDataWithRef={setTreeDataWithRef}
        expandedItems={expandedItems}
        setExpandedItems={setExpandedItems}
        selectedItems={explorerSelectedItems}
        setSelectedItems={setSelectedItems}
        currentFilePath={explorerCurrentFilePath}
        splitFilePath={explorerSplitFilePath}
        setCurrentFilePath={setCurrentFilePath}
        setCode={setCode}
        handleFileOpen={handleFileOpen}
        onSplitViewOpen={handleSplitViewOpen}
        onCloseSplit={closeSplitView}
        getEditorDropTarget={getEditorDropTarget}
        onDropOnEditor={handleDropOnEditor}
        onEditorDragTargetChange={setDropTarget}
        hideFileExtensions={hideFileExtensions}
        startResizing={startResizing}
        handleNewScript={handleNewScript}
        handleNewFolder={handleNewFolder}
        pendingRenameId={pendingRenameId}
        clearPendingRenameId={clearPendingRenameId}
        handleDeleteRef={handleDeleteRef}
        navigateFilesRef={navigateFilesRef}
      />
    </div>
  );
};

export default Editor;
