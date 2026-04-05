import React, { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { List, useListRef, useDynamicRowHeight, RowComponentProps } from "react-window";
import { PlayIcon, PauseIcon, DeleteIcon, CopyIcon, PIPIcon, PinIcon, PinOffIcon } from "../assets/Icons";

import { useRuntimeSettings } from "../contexts/SettingsContext";
import { getContextPos } from "../utils/contextMenu";
import { cn } from "@/utils/ui";
import styles from "./Console.module.css";

interface ConsoleProps {
  onKeepMountedChange?: (keepMounted: boolean) => void;
  onWatchingChange?: (isWatching: boolean) => void;
  isStandalone?: boolean;
}

interface LogEntry {
  id: number;
  content: string;
  type: 'print' | 'warn' | 'error';
  timestamp: Date;
}

interface IncomingLog {
  content: string;
  type: 'print' | 'warn' | 'error';
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  type: 'log' | 'empty';
}

interface LogRowProps {
  logs: LogEntry[];
  selectedIds: Set<number>;
  onRowClick: (e: React.MouseEvent, index: number) => void;
  onContextMenu: (e: React.MouseEvent, index: number) => void;
  getLogColor: (type: 'print' | 'warn' | 'error') => string;
  formatTime: (date: Date) => string;
}

const LogRow = React.memo(({ index, style, logs, selectedIds, onRowClick, onContextMenu, getLogColor, formatTime }: RowComponentProps<LogRowProps>) => {
  const entry = logs[index];
  if (!entry) return null;

  const adjustedStyle = index === 0 
    ? { ...style, paddingTop: 16 } 
    : style;

  const isSelected = selectedIds.has(entry.id);

  return (
    <div
      style={adjustedStyle}
      className={cn(
        styles.row,
        isSelected && styles.selected,
      )}
      onClick={(e) => onRowClick(e, index)}
      onContextMenu={(e) => onContextMenu(e, index)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onRowClick(e as unknown as React.MouseEvent, index);
        }
      }}
    >
      <span className={styles.time}>{formatTime(entry.timestamp)}</span>
      <span className={styles.text} style={{ color: getLogColor(entry.type) }}>{entry.content}</span>
    </div>
  );
}, (prevProps, nextProps) => {
  const prevEntry = prevProps.logs[prevProps.index];
  const nextEntry = nextProps.logs[nextProps.index];
  
  if (prevEntry?.id !== nextEntry?.id) return false;
  
  if (prevEntry && nextEntry) {
    const prevSelected = prevProps.selectedIds.has(prevEntry.id);
    const nextSelected = nextProps.selectedIds.has(nextEntry.id);
    if (prevSelected !== nextSelected) return false;
  }
  
  if (prevProps.index !== nextProps.index) return false;

  const prevStyle = prevProps.style as React.CSSProperties;
  const nextStyle = nextProps.style as React.CSSProperties;
  if (
    prevStyle.transform !== nextStyle.transform ||
    prevStyle.top !== nextStyle.top ||
    prevStyle.height !== nextStyle.height ||
    prevStyle.width !== nextStyle.width
  ) {
    return false;
  }
  
  return true;
});

const Console: React.FC<ConsoleProps> = ({ onKeepMountedChange, onWatchingChange, isStandalone = false }) => {
  const { showRawLogs, autoWatchLogs } = useRuntimeSettings();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isWatching, setIsWatching] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0, type: 'log' });
  const [contextMenuPos, setContextMenuPos] = useState({ left: 0, top: 0 });
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [isPIPActive, setIsPIPActive] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [anchorIndex, setAnchorIndex] = useState<number | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useListRef(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const logIdCounter = useRef(0);
  const prevLogsLength = useRef(0);
  const logsRef = useRef<LogEntry[]>([]);
  const isWatchingRef = useRef(isWatching);
  const rawLogsSettingRef = useRef(showRawLogs);
  
  const dynamicRowHeight = useDynamicRowHeight({ defaultRowHeight: 19 });

  useEffect(() => {
    logsRef.current = logs;
  }, [logs]);

  useEffect(() => {
    isWatchingRef.current = isWatching;
  }, [isWatching]);

  const startWatcher = useCallback(async () => {
    try {
      await invoke("start_log_watcher", { showRawLogs });
      setIsWatching(true);
    } catch (err) {
    }
  }, [showRawLogs]);

  const stopWatcher = useCallback(async () => {
    try {
      await invoke("stop_log_watcher");
      setIsWatching(false);
    } catch (err) {
    }
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
    setSelectedIds(new Set());
    setAnchorIndex(null);
    logIdCounter.current = 0;
  }, []);

  const togglePin = useCallback(async () => {
    if (!isStandalone) return;
    try {
      const window = getCurrentWindow();
      const newPinnedState = !isPinned;
      await window.setAlwaysOnTop(newPinnedState);
      setIsPinned(newPinnedState);
    } catch (err) {
    }
    setContextMenu({ visible: false, x: 0, y: 0, type: 'log' });
  }, [isStandalone, isPinned]);

  const handleRowClick = useCallback((e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    
    setContextMenu({ visible: false, x: 0, y: 0, type: 'log' });
    
    const entry = logs[index];
    if (!entry) return;

    if (e.shiftKey && anchorIndex !== null) {
      const start = Math.min(anchorIndex, index);
      const end = Math.max(anchorIndex, index);
      const newSelected = new Set<number>();
      for (let i = start; i <= end; i++) {
        if (logs[i]) {
          newSelected.add(logs[i].id);
        }
      }
      setSelectedIds(newSelected);
    } else if (e.metaKey || e.ctrlKey) {
      setSelectedIds(prev => {
        const newSet = new Set(prev);
        if (newSet.has(entry.id)) {
          newSet.delete(entry.id);
        } else {
          newSet.add(entry.id);
        }
        return newSet;
      });
      setAnchorIndex(index);
    } else {
      setSelectedIds(new Set([entry.id]));
      setAnchorIndex(index);
    }
  }, [logs, anchorIndex]);

  useEffect(() => {
    if (isPIPActive && !isStandalone) return;
    
    const unlisten = listen<IncomingLog[]>("log_batch", (event) => {
      if (!isWatching) return;
      
      const newEntries: LogEntry[] = event.payload.map((entry) => ({
        id: logIdCounter.current++,
        content: entry.content,
        type: entry.type,
        timestamp: new Date(),
      }));
      
      if (newEntries.length > 0) {
        setLogs((prev) => {
          const next = [...prev, ...newEntries];
          return next.length > 2000 ? next.slice(next.length - 2000) : next;
        });
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [isWatching, isPIPActive, isStandalone]);

  useEffect(() => {
    if (!isWatching) {
      rawLogsSettingRef.current = showRawLogs;
      return;
    }
    if (rawLogsSettingRef.current === showRawLogs) return;
    rawLogsSettingRef.current = showRawLogs;
    invoke("start_log_watcher", { showRawLogs }).catch(() => {});
  }, [isWatching, showRawLogs]);

  useEffect(() => {
    if (isStandalone) {
      return;
    }
    
    const unlistenRequest = listen("pip-request-state", async () => {
      const stateToTransfer = {
        logs: logsRef.current.map(log => ({
          ...log,
          timestamp: log.timestamp.toISOString(),
        })),
        isWatching: isWatchingRef.current,
        logIdCounter: logIdCounter.current,
      };
      
      try {
        await emit("pip-state-response", stateToTransfer);
      } catch {
        return;
      }
      
      setIsPIPActive(true);
      if (isWatchingRef.current) {
        void stopWatcher();
      }
      setLogs([]);
      setSelectedIds(new Set());
      setAnchorIndex(null);
    });
    
    const unlistenClose = listen("pip-closed", () => {
      setIsPIPActive(false);
    });

    return () => {
      unlistenRequest.then((fn) => fn());
      unlistenClose.then((fn) => fn());
    };
  }, [isStandalone, stopWatcher]);

  useEffect(() => {
    if (!isStandalone) return;
    
    const unlistenState = listen<{
      logs: Array<{ id: number; content: string; type: 'print' | 'warn' | 'error'; timestamp: string }>;
      isWatching: boolean;
      logIdCounter: number;
    }>("pip-state-response", (event) => {
      const { logs: transferredLogs, isWatching: wasWatching, logIdCounter: counter } = event.payload;
      
      const restoredLogs = transferredLogs.map(log => ({
        ...log,
        timestamp: new Date(log.timestamp),
      }));
      setLogs(restoredLogs);
      logIdCounter.current = counter;
      
      if (wasWatching) {
        startWatcher();
      }
    });
    
    emit("pip-request-state").catch(() => {});
    
    const window = getCurrentWindow();
    const unlistenClose = window.onCloseRequested(async () => {
      await emit("pip-closed").catch(() => {});
    });

    return () => {
      unlistenState.then((fn) => fn());
      unlistenClose.then((fn) => fn());
    };
  }, [isStandalone, startWatcher]);

  useEffect(() => {
    if (autoWatchLogs && !isWatching && !isStandalone && !isPIPActive) {
      const timer = window.setTimeout(() => {
        void startWatcher();
      }, 0);

      return () => {
        window.clearTimeout(timer);
      };
    }
  }, [autoWatchLogs, isWatching, isStandalone, isPIPActive, startWatcher]);

  useEffect(() => {
    onKeepMountedChange?.(isWatching);
    onWatchingChange?.(isWatching);
    
    if (isStandalone) {
      emit('pip-watching-changed', isWatching).catch(() => {});
    }
  }, [isWatching, onKeepMountedChange, onWatchingChange, isStandalone]);

  useEffect(() => {
    if (logs.length > prevLogsLength.current) {
      if (listRef.current && listRef.current.element) {
        const el = listRef.current.element;
        const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
        if (isNearBottom) {
          const lastIndex = logs.length - 1;
          try {
            listRef.current.scrollToRow({ index: lastIndex, align: "end" });
          } catch (e) {
          }
        }
      }
    }
    prevLogsLength.current = logs.length;
  }, [logs.length, listRef]);

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        setContainerSize({ width, height });
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    
    const resizeObserver = new ResizeObserver(updateSize);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener('resize', updateSize);
      resizeObserver.disconnect();
    };
  }, []);

  useLayoutEffect(() => {
    if (!contextMenu.visible || !contextMenuRef.current) {
      return;
    }

    const { width, height } = contextMenuRef.current.getBoundingClientRect();
    setContextMenuPos(getContextPos(
      contextMenu.x,
      contextMenu.y,
      width,
      height,
    ));
  }, [contextMenu.type, contextMenu.visible, contextMenu.x, contextMenu.y, isStandalone, selectedIds.size]);

  const handleContextMenu = useCallback((e: React.MouseEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    
    const entry = logs[index];
    if (!entry) return;
    
    if (!selectedIds.has(entry.id)) {
      setSelectedIds(new Set([entry.id]));
      setAnchorIndex(index);
    }
    
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      type: 'log',
    });
  }, [logs, selectedIds]);

  const handleEmptyContextMenu = useCallback((e: React.MouseEvent) => {
    if (!isStandalone) return;
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      type: 'empty',
    });
  }, [isStandalone]);

  const handleCopy = useCallback(async () => {
    if (selectedIds.size === 0) {
      setContextMenu({ visible: false, x: 0, y: 0, type: 'log' });
      return;
    }
    
    const selectedLogs = logs.filter(log => selectedIds.has(log.id));
    const content = selectedLogs.map(log => log.content).join('\n');
    
    try {
      await writeText(content);
    } catch (err) {
    }
    setContextMenu({ visible: false, x: 0, y: 0, type: 'log' });
  }, [selectedIds, logs]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu({ visible: false, x: 0, y: 0, type: 'log' });
      }
      
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setSelectedIds(new Set());
        setAnchorIndex(null);
      }
    };
    
    const handleBlur = () => {
      setContextMenu({ visible: false, x: 0, y: 0, type: 'log' });
      setSelectedIds(new Set());
      setAnchorIndex(null);
    };
    
    document.addEventListener('click', handleClick);
    window.addEventListener('blur', handleBlur);
    
    return () => {
      document.removeEventListener('click', handleClick);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  const getLogColor = useCallback((type: 'print' | 'warn' | 'error'): string => {
    switch (type) {
      case 'error': return "var(--log-error)";
      case 'warn': return "var(--log-warn)";
      default: return "var(--log-print)";
    }
  }, []);

  const formatTime = useCallback((date: Date): string => {
    return date.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
  }, []);

  const rowProps = useMemo<LogRowProps>(() => ({
    logs,
    selectedIds,
    onRowClick: handleRowClick,
    onContextMenu: handleContextMenu,
    getLogColor,
    formatTime,
  }), [logs, selectedIds, handleRowClick, handleContextMenu, getLogColor, formatTime]);

  const handleOpenPIP = useCallback(async () => {
    try {
      await invoke("open_console_window");
    } catch (err) {
    }
  }, []);

  return (
      <div className={styles.root}>
        <div className={styles.wrap}>
          
          {isPIPActive && !isStandalone ? (
            <div className={styles.empty}>
              Console is in PIP mode
            </div>
          ) : (
            <>
              
              <div className={styles.btns}>
                <button 
                  className={styles.btn} 
                  onClick={clearLogs}
                >
                  <DeleteIcon width={24} height={24} />
                </button>
                
                {!isStandalone && (
                  <button
                    className={styles.btn}
                    onClick={handleOpenPIP}
                  >
                    <PIPIcon width={24} height={24} />
                  </button>
                )}
                <button
                  className={cn(styles.btn, isWatching && styles.active)}
                  onClick={isWatching ? stopWatcher : startWatcher}
                >
                  {isWatching ? (
                    <PauseIcon width={24} height={24} />
                  ) : (
                    <PlayIcon width={24} height={24} />
                  )}
                </button>
              </div>
              
              <div
                ref={containerRef}
                className={styles.logs}
                onContextMenu={logs.length === 0 ? handleEmptyContextMenu : undefined}
                onPointerDownCapture={(e) => {
                  if (e.target !== e.currentTarget) return;
                  setContextMenu({ visible: false, x: 0, y: 0, type: 'log' });
                  setSelectedIds(new Set());
                  setAnchorIndex(null);
                }}
              >
                {logs.length === 0 ? (
                  <div className={styles.empty} onContextMenu={handleEmptyContextMenu}>
                    {isWatching ? "Empty" : "Press the start button"}
                  </div>
                ) : containerSize.height > 0 && (
                  <List
                    listRef={listRef}
                    style={{ height: containerSize.height, width: '100%', paddingBottom: 60 }}
                    rowCount={logs.length}
                    rowHeight={dynamicRowHeight}
                    overscanCount={10}
                    rowComponent={LogRow as (props: RowComponentProps<LogRowProps>) => React.ReactElement | null}
                    rowProps={rowProps}
                  />
                )}
              </div>
            </>
          )}
        </div>
        
        
        {contextMenu.visible && (
          <div
            ref={contextMenuRef}
            className={styles.menu}
            style={{
              position: 'fixed',
              left: contextMenuPos.left,
              top: contextMenuPos.top,
              zIndex: 1000,
            }}
          >
            
            {contextMenu.type === 'log' && selectedIds.size > 0 && (
              <>
                <button className={styles.item} onClick={handleCopy}>
                  <CopyIcon width={18} height={18} />
                  Copy{selectedIds.size > 1 ? ` (${selectedIds.size})` : ''}
                </button>
                {isStandalone && <div className={styles.sep} />}
              </>
            )}
            
            
            {isStandalone && (
              <button className={styles.item} onClick={togglePin}>
                {isPinned ? (
                  <>
                    <PinOffIcon width={18} height={18} />
                    Unpin Window
                  </>
                ) : (
                  <>
                    <PinIcon width={18} height={18} />
                    Pin Window
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>
  );
};

export default Console;
