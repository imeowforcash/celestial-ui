import React, { useCallback, useRef, useEffect, memo, useMemo } from "react";
import { createPortal } from "react-dom";
import { readTextFile, writeTextFile, remove, rename, mkdir } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence, LazyMotion, domAnimation, m } from "motion/react";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  DragEndEvent,
  DragStartEvent,
  DragMoveEvent,
  DragCancelEvent,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
} from "@dnd-kit/core";
import { useTree } from "@headless-tree/react";
import {
  syncDataLoaderFeature,
  selectionFeature,
  hotkeysCoreFeature,
  expandAllFeature,
} from "@headless-tree/core";
import cn from "classnames";
import styles from "./EditorShared.module.css";
import { saveExplorerData } from "../../utils/appData";
import {
  FolderIcon,
  FolderOpenIcon,
  FileIcon,
  LuaIcon,
  LuauIcon,
  RenameIcon,
  DuplicateIcon,
  DeleteIcon,
  NewFileIcon,
  NewFolderIcon,
  SplitviewIcon,
} from "../../assets/Icons";
import {
  CONTEXT_MENU_VIEWPORT_PADDING,
  getContextPos,
} from "./contextMenuPosition";

export interface TreeItem {
  name: string;
  path?: string;
  children?: string[];
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  itemId: string;
  itemPath: string;
  itemName: string;
  isFolder: boolean;
  isAutoexec: boolean;
  isProtectedFolder: boolean;
}

interface ExplorerContextMenuState {
  visible: boolean;
  x: number;
  y: number;
}

interface DeletedItem {
  itemId: string;
  itemPath: string;
  itemName: string;
  isFolder: boolean;
  parentId: string;
  content?: string;
  children?: { id: string; name: string; path: string; content: string }[];
  wasCurrentFile?: boolean;
}

function findParentTree(itemId: string, data: Record<string, TreeItem>): string | null {
  for (const [parentId, parentData] of Object.entries(data)) {
    if (parentData.children?.includes(itemId)) {
      return parentId;
    }
  }
  return null;
}

function isFolderNodeInTree(itemId: string, data: Record<string, TreeItem>): boolean {
  return Array.isArray(data[itemId]?.children);
}

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

function isProtectedFolderNodeInTree(itemId: string, data: Record<string, TreeItem>): boolean {
  if (itemId === "autoexec") {
    return true;
  }

  const item = data[itemId];
  if (!item || !Array.isArray(item.children) || item.name !== "Tray") {
    return false;
  }

  return findParentTree(itemId, data) === "root";
}

function folderHasItemName(
  folderId: string,
  name: string,
  data: Record<string, TreeItem>,
  skipId?: string,
): boolean {
  const folder = data[folderId];
  if (!folder?.children) {
    return false;
  }

  return folder.children.some((childId) => childId !== skipId && data[childId]?.name === name);
}

const DraggableItem: React.FC<{
  id: string;
  droppingId: string | null;
  dragDisabled?: boolean;
  children: React.ReactNode;
}> = ({ id, droppingId, dragDisabled = false, children }) => {
  const { attributes, listeners, setNodeRef: setDraggableRef, isDragging } = useDraggable({
    id,
    disabled: dragDisabled,
  });
  
  const { isOver, setNodeRef: setDroppableRef } = useDroppable({
    id,
  });
  
  const isHidden = isDragging || droppingId === id;
  
  const style: React.CSSProperties = {
    visibility: isHidden ? 'hidden' : 'visible',
    backgroundColor: isOver ? 'rgba(255, 255, 255, 0.03)' : undefined,
  };
  
  const setRefs = (node: HTMLDivElement | null) => {
    setDraggableRef(node);
    setDroppableRef(node);
  };
  
  return (
    <div ref={setRefs} style={style} {...listeners} {...attributes}>
      {children}
    </div>
  );
};

const DroppableFolder: React.FC<{
  id: string;
  droppingId: string | null;
  dragDisabled?: boolean;
  children: React.ReactNode;
}> = ({ id, droppingId, dragDisabled = false, children }) => {
  const { isOver, setNodeRef: setDroppableRef } = useDroppable({
    id,
  });
  
  const { attributes, listeners, setNodeRef: setDraggableRef, isDragging } = useDraggable({
    id,
    disabled: dragDisabled,
  });
  
  const isHidden = isDragging || droppingId === id;
  
  const style: React.CSSProperties = {
    backgroundColor: isOver ? 'rgba(255, 255, 255, 0.05)' : undefined,
    visibility: isHidden ? 'hidden' : 'visible',
  };
  
  const setRefs = (node: HTMLDivElement | null) => {
    setDroppableRef(node);
    setDraggableRef(node);
  };
  
  return (
    <div ref={setRefs} style={style} {...listeners} {...attributes}>
      {children}
    </div>
  );
};

interface ExplorerProps {
  isEditorActive: boolean;
  showExplorer: boolean;
  animateVisibilityTransitions: boolean;
  explorerWidth: number;
  isDragging: boolean;
  treeData: Record<string, TreeItem>;
  treeDataRef: React.MutableRefObject<Record<string, TreeItem>>;
  setTreeDataWithRef: (newData: Record<string, TreeItem> | ((prev: Record<string, TreeItem>) => Record<string, TreeItem>)) => void;
  expandedItems: string[];
  setExpandedItems: React.Dispatch<React.SetStateAction<string[]>>;
  selectedItems: string[];
  setSelectedItems: React.Dispatch<React.SetStateAction<string[]>>;
  currentFilePath: string | null;
  splitFilePath: string | null;
  setCurrentFilePath: React.Dispatch<React.SetStateAction<string | null>>;
  setCode: React.Dispatch<React.SetStateAction<string>>;
  handleFileOpen: (path: string) => Promise<void>;
  onSplitViewOpen: (path: string) => void;
  onCloseSplit: (target?: "primary" | "secondary") => void;
  getEditorDropTarget: (x: number, y: number) => "primary" | "secondary" | null;
  onDropOnEditor: (path: string, target: "primary" | "secondary") => void;
  onEditorDragTargetChange: (target: "primary" | "secondary" | null) => void;
  hideFileExtensions: boolean;
  startResizing: (e: React.MouseEvent) => void;
  handleNewScript: () => Promise<void>;
  handleNewFolder: () => Promise<void>;
  pendingRenameId: string | null;
  clearPendingRenameId: () => void;
  handleDeleteRef: React.MutableRefObject<(() => Promise<void>) | null>;
  navigateFilesRef: React.MutableRefObject<((direction: number) => void) | null>;
}

const EXPLORER_EASE: [number, number, number, number] = [0.32, 0.72, 0, 1];
const EXPLORER_WIDTH_DURATION = 0.4;
const EXPLORER_SLIDE_DURATION = 0.6;
const RENAME_SEGMENT_SEPARATOR_REGEX = /[_\-\s]/;

const EXPLORER_CONTAINER_MOTION = {
  initial: { width: 0 },
  animate: {
    width: "auto",
    transition: { duration: EXPLORER_WIDTH_DURATION, ease: EXPLORER_EASE },
  },
  exit: {
    width: 0,
    transition: {
      duration: EXPLORER_WIDTH_DURATION,
      ease: EXPLORER_EASE,
      delay: EXPLORER_SLIDE_DURATION,
    },
  },
};

const EXPLORER_CONTAINER_INSTANT_MOTION = {
  initial: { width: "auto" },
  animate: {
    width: "auto",
    transition: { duration: 0 },
  },
  exit: {
    width: 0,
    transition: { duration: 0 },
  },
};

const EXPLORER_PANEL_MOTION = {
  initial: { y: "calc(100% + 15px)" },
  animate: {
    y: 0,
    transition: {
      duration: EXPLORER_SLIDE_DURATION,
      ease: EXPLORER_EASE,
      delay: EXPLORER_WIDTH_DURATION,
    },
  },
  exit: {
    y: "calc(100% + 15px)",
    transition: { duration: EXPLORER_SLIDE_DURATION, ease: EXPLORER_EASE },
  },
};

const EXPLORER_PANEL_INSTANT_MOTION = {
  initial: { y: 0 },
  animate: {
    y: 0,
    transition: { duration: 0 },
  },
  exit: {
    y: "calc(100% + 15px)",
    transition: { duration: 0 },
  },
};

const cx = cn.bind(styles);


const Explorer: React.FC<ExplorerProps> = memo(({
  isEditorActive,
  showExplorer,
  animateVisibilityTransitions,
  explorerWidth,
  isDragging,
  treeData,
  treeDataRef,
  setTreeDataWithRef,
  expandedItems,
  setExpandedItems,
  selectedItems,
  setSelectedItems,
  currentFilePath,
  splitFilePath,
  setCurrentFilePath,
  setCode,
  handleFileOpen,
  onSplitViewOpen,
  onCloseSplit,
  getEditorDropTarget,
  onDropOnEditor,
  onEditorDragTargetChange,
  hideFileExtensions,
  startResizing,
  handleNewScript,
  handleNewFolder,
  pendingRenameId,
  clearPendingRenameId,
  handleDeleteRef,
  navigateFilesRef,
}) => {
  const [contextMenu, setContextMenu] = React.useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    itemId: "",
    itemPath: "",
    itemName: "",
    isFolder: false,
    isAutoexec: false,
    isProtectedFolder: false,
  });
  
  const [renamingItemId, setRenamingItemId] = React.useState<string | null>(null);
  const [renameValue, setRenameValue] = React.useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [contextMenuPosition, setContextMenuPosition] = React.useState({
    left: 0,
    top: 0,
  });
  
  const [explorerContextMenu, setExplorerContextMenu] = React.useState<ExplorerContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
  });
  const explorerContextMenuRef = useRef<HTMLDivElement>(null);
  const [explorerContextMenuPosition, setExplorerContextMenuPosition] = React.useState({
    left: 0,
    top: 0,
  });
  
  const [activeDragId, setActiveDragId] = React.useState<string | null>(null);
  const [droppingId, setDroppingId] = React.useState<string | null>(null);
  const [treeRenderVersion, setTreeRenderVersion] = React.useState(0);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );
  
  const MAX_DELETED_ITEMS = 10;
  const [deletedItemsStack, setDeletedItemsStack] = React.useState<DeletedItem[]>([]);
  const refreshTrayMenu = useCallback(async () => {
    await invoke("refresh_tray_menu").catch(() => null);
  }, []);

  const treeConfig = useMemo(() => ({
    rootItemId: "root",
    getItemName: (item: any) => item.getItemData()?.name ?? "",
    isItemFolder: (item: any) => !!item.getItemData()?.children,
    indent: 16,
    dataLoader: {
      getItem: (itemId: string) => treeDataRef.current[itemId] ?? { name: "" },
      getChildren: (itemId: string) => {
        const children = treeDataRef.current[itemId]?.children || [];
        return children.filter((childId: string) => treeDataRef.current[childId] !== undefined);
      },
    },
    features: [
      syncDataLoaderFeature,
      selectionFeature,
      hotkeysCoreFeature,
      expandAllFeature,
    ],
  }), [treeDataRef]);

  const tree = useTree<TreeItem>({
    ...treeConfig,
    state: {
      expandedItems,
      selectedItems,
    },
    setExpandedItems: (newItems) => {
      setExpandedItems(newItems);
      saveExplorerData("expandedFolders", newItems);
    },
    setSelectedItems: (newItems) => {
      setSelectedItems(newItems);
    },
  });

  useEffect(() => {
    tree.rebuildTree();
    const frameId = requestAnimationFrame(() => {
      setDroppingId(null);
      setTreeRenderVersion((prev) => prev + 1);
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [treeData]);

  useEffect(() => {
    if (pendingRenameId && treeData[pendingRenameId]) {
      const item = treeData[pendingRenameId];
      const pendingId = pendingRenameId;
      const pendingName = item.name;
      const frameId = requestAnimationFrame(() => {
        setRenamingItemId(pendingId);
        setRenameValue(pendingName);
        clearPendingRenameId();
      });

      return () => {
        cancelAnimationFrame(frameId);
      };
    }
  }, [pendingRenameId, treeData, clearPendingRenameId]);

  const saveTreeOrder = useCallback((data: Record<string, TreeItem>) => {
    const order: Record<string, string[]> = {};
    for (const [id, item] of Object.entries(data)) {
      if (item.children) {
        order[id] = item.children;
      }
    }
    saveExplorerData('treeOrder', order);
  }, []);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
    onEditorDragTargetChange(null);
  }, [onEditorDragTargetChange]);

  const handleDragMove = useCallback((event: DragMoveEvent) => {
    const draggedId = event.active.id as string;
    if (activeDragId !== draggedId) {
      onEditorDragTargetChange(null);
      return;
    }

    const draggedItem = treeDataRef.current[draggedId];
    if (!draggedItem?.path || draggedItem.children) {
      onEditorDragTargetChange(null);
      return;
    }

    const dragRect = event.active.rect.current.translated ?? event.active.rect.current.initial;
    if (!dragRect) {
      onEditorDragTargetChange(null);
      return;
    }

    const centerX = dragRect.left + dragRect.width / 2;
    const centerY = dragRect.top + dragRect.height / 2;
    const target = getEditorDropTarget(centerX, centerY);
    onEditorDragTargetChange(target);
  }, [activeDragId, getEditorDropTarget, onEditorDragTargetChange, treeDataRef]);

  const handleDragCancel = useCallback((_event: DragCancelEvent) => {
    setActiveDragId(null);
    setDroppingId(null);
    onEditorDragTargetChange(null);
  }, [onEditorDragTargetChange]);

  useEffect(() => {
    if (!activeDragId) {
      return;
    }

    const forceClearDragState = () => {
      setActiveDragId(null);
      setDroppingId(null);
      onEditorDragTargetChange(null);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        forceClearDragState();
      }
    };

    window.addEventListener("pointerup", forceClearDragState, true);
    window.addEventListener("mouseup", forceClearDragState, true);
    window.addEventListener("blur", forceClearDragState);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pointerup", forceClearDragState, true);
      window.removeEventListener("mouseup", forceClearDragState, true);
      window.removeEventListener("blur", forceClearDragState);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [activeDragId, onEditorDragTargetChange]);

  const handleFileToFolder = useCallback(async (
    draggedId: string,
    draggedItem: TreeItem,
    targetId: string,
    targetItem: TreeItem,
    oldParentId: string
  ) => {
    const fileName = draggedItem.name;
    if (folderHasItemName(targetId, fileName, treeDataRef.current, draggedId)) {
      return;
    }

    const newPath = `${targetItem.path}/${fileName}`;

    const moved = await rename(draggedItem.path!, newPath)
      .then(() => true)
      .catch(() => false);
    if (!moved) {
      return;
    }

      setTreeDataWithRef(prev => {
        const newTree = { ...prev };
        
        const oldParent = newTree[oldParentId];
        if (oldParent?.children) {
          newTree[oldParentId] = {
            ...oldParent,
            children: oldParent.children.filter(id => id !== draggedId),
          };
        }
        
        delete newTree[draggedId];

        const baseItemId = targetId === "autoexec"
          ? `autoexec-${fileName}`
          : `${targetId}-${fileName}`;
        const newItemId = makeIdTree(baseItemId, newTree);
        
        newTree[newItemId] = {
          name: fileName,
          path: newPath,
        };
        
        const newParent = newTree[targetId];
        if (newParent?.children) {
          newTree[targetId] = {
            ...newParent,
            children: [...newParent.children, newItemId],
          };
        }
        
        return newTree;
      });
      
      if (currentFilePath === draggedItem.path) {
        setCurrentFilePath(newPath);
      }
  }, [currentFilePath, setCurrentFilePath, setTreeDataWithRef]);

  const handleReorderSameParent = useCallback((
    draggedId: string,
    targetId: string,
    parentId: string,
    insertBelow: boolean,
    isFolder: boolean
  ) => {
    setTreeDataWithRef(prev => {
      const newTree = { ...prev };
      const parent = newTree[parentId];
      
      if (parent?.children) {
        const children = [...parent.children];
        const draggedIndex = children.indexOf(draggedId);
        const targetIndex = children.indexOf(targetId);
        
        if (draggedIndex !== -1 && targetIndex !== -1) {
          if (isFolder) {
            const targetWasFirst = targetIndex === 0;
            const draggedWasFirst = draggedIndex === 0;
            children.splice(draggedIndex, 1);
            const newTargetIndex = children.indexOf(targetId);
            
            let insertIndex: number;
            if (draggedWasFirst) {
              insertIndex = newTargetIndex + 1;
            } else if (targetWasFirst) {
              insertIndex = newTargetIndex;
            } else {
              insertIndex = insertBelow ? newTargetIndex + 1 : newTargetIndex;
            }
            children.splice(insertIndex, 0, draggedId);
          } else {
            children.splice(draggedIndex, 1);
            const newTargetIndex = children.indexOf(targetId);
            const insertIndex = insertBelow ? newTargetIndex + 1 : newTargetIndex;
            children.splice(insertIndex, 0, draggedId);
          }
          
          newTree[parentId] = {
            ...parent,
            children,
          };
        }
      }
      
      saveTreeOrder(newTree);
      return newTree;
    });
  }, [saveTreeOrder, setTreeDataWithRef]);

  const handleFileToDifferentFolder = useCallback(async (
    draggedId: string,
    draggedItem: TreeItem,
    targetId: string,
    targetParentId: string,
    targetParent: TreeItem,
    oldParentId: string,
    insertBelow: boolean
  ) => {
    const fileName = draggedItem.name;
    if (folderHasItemName(targetParentId, fileName, treeDataRef.current, draggedId)) {
      return;
    }

    const newPath = `${targetParent.path}/${fileName}`;

    const moved = await rename(draggedItem.path!, newPath)
      .then(() => true)
      .catch(() => false);
    if (!moved) {
      return;
    }

      setTreeDataWithRef(prev => {
        const newTree = { ...prev };
        
        const oldParent = newTree[oldParentId];
        if (oldParent?.children) {
          newTree[oldParentId] = {
            ...oldParent,
            children: oldParent.children.filter(id => id !== draggedId),
          };
        }
        
        delete newTree[draggedId];

        const baseItemId = targetParentId === "autoexec"
          ? `autoexec-${fileName}`
          : `${targetParentId}-${fileName}`;
        const newItemId = makeIdTree(baseItemId, newTree);
        
        newTree[newItemId] = {
          name: fileName,
          path: newPath,
        };
        
        const newParent = newTree[targetParentId];
        if (newParent?.children) {
          const targetIndex = newParent.children.indexOf(targetId);
          const newChildren = [...newParent.children];
          const insertIndex = insertBelow ? targetIndex + 1 : targetIndex;
          newChildren.splice(insertIndex, 0, newItemId);
          newTree[targetParentId] = {
            ...newParent,
            children: newChildren,
          };
        }
        
        saveTreeOrder(newTree);
        return newTree;
      });
      
      if (currentFilePath === draggedItem.path) {
        setCurrentFilePath(newPath);
      }
  }, [currentFilePath, saveTreeOrder, setCurrentFilePath, setTreeDataWithRef]);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    const draggedId = active.id as string;
    
    setDroppingId(draggedId);
    setActiveDragId(null);
    onEditorDragTargetChange(null);

    const currentTreeData = treeDataRef.current;
    const draggedItem = currentTreeData[draggedId];
    const isDraggedFolder = !!draggedItem?.children;
    const dragRect = active.rect.current.translated ?? active.rect.current.initial;
    if (!over && dragRect && draggedItem?.path && !isDraggedFolder) {
      const centerX = dragRect.left + dragRect.width / 2;
      const centerY = dragRect.top + dragRect.height / 2;
      const dropTarget = getEditorDropTarget(centerX, centerY);
      if (dropTarget) {
        onDropOnEditor(draggedItem.path, dropTarget);
        requestAnimationFrame(() => setDroppingId(null));
        return;
      }
    }
    
    if (!over || active.id === over.id) {
      requestAnimationFrame(() => setDroppingId(null));
      return;
    }
    
    const targetId = over.id as string;
    
    let insertBelow = false;
    if (active.rect.current.translated && over.rect) {
      const draggedCenterY = active.rect.current.translated.top + active.rect.current.translated.height / 2;
      const targetCenterY = over.rect.top + over.rect.height / 2;
      insertBelow = draggedCenterY > targetCenterY;
    }
    
    const targetItem = currentTreeData[targetId];
    
    if (!draggedItem?.path || !targetItem) {
      requestAnimationFrame(() => setDroppingId(null));
      return;
    }
    
    const isTargetFolder = !!targetItem.children;
    const oldParentId = findParentTree(draggedId, currentTreeData) ?? "";
    const targetParentId = findParentTree(targetId, currentTreeData) ?? "";
    
    if (!isDraggedFolder && isTargetFolder && targetItem.path) {
      if (oldParentId !== targetId) {
        await handleFileToFolder(draggedId, draggedItem, targetId, targetItem, oldParentId);
      }
      requestAnimationFrame(() => setDroppingId(null));
      return;
    }
    
    if (!isDraggedFolder && !isTargetFolder && oldParentId === targetParentId) {
      handleReorderSameParent(draggedId, targetId, oldParentId, insertBelow, false);
      requestAnimationFrame(() => setDroppingId(null));
      return;
    }
    
    if (!isDraggedFolder && !isTargetFolder && oldParentId !== targetParentId) {
      const targetParent = treeData[targetParentId];
      if (targetParent?.path) {
        await handleFileToDifferentFolder(
          draggedId, draggedItem, targetId, targetParentId, targetParent, oldParentId, insertBelow
        );
      }
      requestAnimationFrame(() => setDroppingId(null));
      return;
    }
    
    if (isDraggedFolder && isTargetFolder && oldParentId === targetParentId) {
      handleReorderSameParent(draggedId, targetId, oldParentId, insertBelow, true);
      requestAnimationFrame(() => setDroppingId(null));
      return;
    }
    
    requestAnimationFrame(() => setDroppingId(null));
  }, [getEditorDropTarget, handleFileToFolder, handleFileToDifferentFolder, handleReorderSameParent, onDropOnEditor, onEditorDragTargetChange, treeData, treeDataRef]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(prev => ({ ...prev, visible: false }));
      }
    };
    
    if (isEditorActive && contextMenu.visible) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [contextMenu.visible, isEditorActive]);

  const getFilenameStemEnd = useCallback((value: string) => {
    const lastDotIndex = value.lastIndexOf(".");
    return lastDotIndex > 0 ? lastDotIndex : value.length;
  }, []);

  const selectFilenameStem = useCallback((input: HTMLInputElement | null) => {
    if (!input) {
      return;
    }

    const value = input.value;
    input.setSelectionRange(0, getFilenameStemEnd(value));
  }, [getFilenameStemEnd]);

  const selectRenameSegment = useCallback((input: HTMLInputElement | null, interactionIndex: number) => {
    if (!input) {
      return;
    }

    const value = input.value;
    const stemEnd = getFilenameStemEnd(value);
    if (stemEnd <= 0) {
      input.select();
      return;
    }

    const clampedIndex = Math.max(0, Math.min(interactionIndex, stemEnd - 1));
    const currentChar = value[clampedIndex] ?? "";
    const previousChar = clampedIndex > 0 ? value[clampedIndex - 1] : "";
    const separatorIndex = RENAME_SEGMENT_SEPARATOR_REGEX.test(currentChar)
      ? clampedIndex
      : RENAME_SEGMENT_SEPARATOR_REGEX.test(previousChar)
        ? clampedIndex - 1
        : -1;

    if (separatorIndex !== -1) {
      input.select();
      return;
    }

    let start = clampedIndex;
    while (start > 0 && !RENAME_SEGMENT_SEPARATOR_REGEX.test(value[start - 1])) {
      start -= 1;
    }

    let end = clampedIndex + 1;
    while (end < stemEnd && !RENAME_SEGMENT_SEPARATOR_REGEX.test(value[end])) {
      end += 1;
    }

    input.setSelectionRange(start, end);
  }, [getFilenameStemEnd]);

  useEffect(() => {
    if (renamingItemId) {
      const timer = setTimeout(() => {
        if (renameInputRef.current) {
          renameInputRef.current.focus();
          selectFilenameStem(renameInputRef.current);
        }
      }, 10);
      return () => clearTimeout(timer);
    }
  }, [renamingItemId, selectFilenameStem]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (explorerContextMenuRef.current && !explorerContextMenuRef.current.contains(e.target as Node)) {
        setExplorerContextMenu(prev => ({ ...prev, visible: false }));
      }
    };
    
    if (isEditorActive && explorerContextMenu.visible) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [explorerContextMenu.visible, isEditorActive]);

  useEffect(() => {
    const handleUndo = async (e: KeyboardEvent) => {
      if (!isEditorActive) {
        return;
      }

      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && deletedItemsStack.length > 0) {
        e.preventDefault();
        
        const lastDeleted = deletedItemsStack[deletedItemsStack.length - 1];

        await (async () => {
          if (lastDeleted.isFolder) {
            await mkdir(lastDeleted.itemPath, { recursive: true });
            
            for (const child of lastDeleted.children || []) {
              await writeTextFile(child.path, child.content);
            }
            
            setTreeDataWithRef(prev => {
              const newTree = { ...prev };
              
              const childIds: string[] = [];
              (lastDeleted.children || []).forEach(child => {
                newTree[child.id] = {
                  name: child.name,
                  path: child.path,
                };
                childIds.push(child.id);
              });
              
              newTree[lastDeleted.itemId] = {
                name: lastDeleted.itemName,
                path: lastDeleted.itemPath,
                children: childIds,
              };
              
              const rootChildren = [...(prev.root?.children || [])];
              const autoexecIndex = rootChildren.indexOf("autoexec");
              if (autoexecIndex >= 0) {
                rootChildren.splice(autoexecIndex, 0, lastDeleted.itemId);
              } else {
                rootChildren.push(lastDeleted.itemId);
              }
              newTree.root = { ...prev.root, children: rootChildren };
              
              return newTree;
            });
          } else {
            await writeTextFile(lastDeleted.itemPath, lastDeleted.content || "");
            
            setTreeDataWithRef(prev => {
              const newTree = { ...prev };
              newTree[lastDeleted.itemId] = {
                name: lastDeleted.itemName,
                path: lastDeleted.itemPath,
              };
              
              const parent = newTree[lastDeleted.parentId];
              if (parent && parent.children) {
                newTree[lastDeleted.parentId] = {
                  ...parent,
                  children: [...parent.children, lastDeleted.itemId],
                };
              }
              
              return newTree;
            });
          }
          
          if (lastDeleted.wasCurrentFile && lastDeleted.content !== undefined) {
            setCode(lastDeleted.content);
            setCurrentFilePath(lastDeleted.itemPath);
          }
          
          setDeletedItemsStack(prev => prev.slice(0, -1));
        })().catch(() => {
        });
      }
    };
    
    document.addEventListener('keydown', handleUndo);
    return () => document.removeEventListener('keydown', handleUndo);
  }, [deletedItemsStack, isEditorActive, setCode, setCurrentFilePath, setTreeDataWithRef]);

  const handleExplorerContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setExplorerContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
    });
  }, []);

  const handleContextMenu = useCallback((
    e: React.MouseEvent, 
    itemId: string, 
    itemPath: string, 
    itemName: string,
    isFolder: boolean,
    isAutoexec: boolean,
    isProtectedFolder: boolean
  ) => {
    e.preventDefault();
    e.stopPropagation();

    if (!selectedItems.includes(itemId)) {
      setSelectedItems([itemId]);
    }
    
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      itemId,
      itemPath,
      itemName,
      isFolder,
      isAutoexec,
      isProtectedFolder,
    });
  }, [selectedItems, setSelectedItems]);

  const handleRename = useCallback(() => {
    if (contextMenu.isProtectedFolder) {
      setContextMenu(prev => ({ ...prev, visible: false }));
      return;
    }
    setRenamingItemId(contextMenu.itemId);
    setRenameValue(contextMenu.itemName);
    setContextMenu(prev => ({ ...prev, visible: false }));
  }, [contextMenu.isProtectedFolder, contextMenu.itemId, contextMenu.itemName]);

  const commitRename = useCallback(async () => {
    if (!renamingItemId || !renameValue.trim()) {
      setRenamingItemId(null);
      return;
    }
    
    const item = treeData[renamingItemId];
    if (!item || !item.path) {
      setRenamingItemId(null);
      return;
    }

    if (isProtectedFolderNodeInTree(renamingItemId, treeData)) {
      setRenamingItemId(null);
      return;
    }
    
    const oldPath = item.path;
    const newName = renameValue.trim();
    const dir = oldPath.substring(0, oldPath.lastIndexOf('/'));
    const newPath = `${dir}/${newName}`;
    
    if (item.name === newName) {
      setRenamingItemId(null);
      return;
    }
    
    const isFolder = isFolderNodeInTree(renamingItemId, treeData);
    const parentId = findParentTree(renamingItemId, treeData);
    
    if (parentId) {
      const siblingNames = (treeData[parentId]?.children || [])
        .filter(childId => childId !== renamingItemId)
        .map(childId => treeData[childId]?.name)
        .filter(Boolean);
      
      if (siblingNames.includes(newName)) {
        setRenamingItemId(null);
        return;
      }
    }
    
    const renamed = await rename(oldPath, newPath)
      .then(() => true)
      .catch(() => false);
    if (!renamed) {
      setRenamingItemId(null);
      return;
    }

      if (isFolder) {
        const oldChildren = item.children || [];

        setTreeDataWithRef(prev => {
          const newTree = { ...prev };

          newTree[renamingItemId] = {
            ...item,
            name: newName,
            path: newPath,
          };

          oldChildren.forEach(childId => {
            const childItem = prev[childId];
            if (childItem) {
              newTree[childId] = {
                ...childItem,
                path: `${newPath}/${childItem.name}`,
              };
            }
          });

          return newTree;
        });
        
        if (currentFilePath?.startsWith(oldPath + "/")) {
          const fileName = currentFilePath.substring(oldPath.length + 1);
          setCurrentFilePath(`${newPath}/${fileName}`);
        }
        
      } else {
        setTreeDataWithRef(prev => {
          const newTree = { ...prev };

          newTree[renamingItemId] = {
            ...item,
            name: newName,
            path: newPath,
          };

          return newTree;
        });
        
        if (currentFilePath === oldPath) {
          setCurrentFilePath(newPath);
        }
      }
    
    setRenamingItemId(null);
    await refreshTrayMenu();
  }, [renamingItemId, renameValue, treeData, currentFilePath, setCurrentFilePath, setTreeDataWithRef, refreshTrayMenu]);

  const handleDuplicate = useCallback(async () => {
    const { itemId, itemPath, itemName } = contextMenu;
    setContextMenu(prev => ({ ...prev, visible: false }));
    
    if (!itemPath) return;
    
    const isFolder = isFolderNodeInTree(itemId, treeData);
    if (isFolder) return;

    await (async () => {
      const content = await readTextFile(itemPath);
      const dir = itemPath.substring(0, itemPath.lastIndexOf('/'));
      
      const ext = itemName.includes('.') ? itemName.substring(itemName.lastIndexOf('.')) : '';
      const baseName = itemName.includes('.') ? itemName.substring(0, itemName.lastIndexOf('.')) : itemName;
      
      const parentId = findParentTree(itemId, treeData);
      if (!parentId) {
        return;
      }
      const isAutoexecFile = parentId === "autoexec";
      
      const siblingNames = (treeData[parentId]?.children || [])
        .map(childId => treeData[childId]?.name)
        .filter(Boolean);
      
      let newName = `${baseName} (Copy)${ext}`;
      let counter = 2;
      while (siblingNames.includes(newName)) {
        newName = `${baseName} (Copy ${counter})${ext}`;
        counter++;
      }
      
      const newPath = `${dir}/${newName}`;
      
      await writeTextFile(newPath, content);
      
      setTreeDataWithRef(prev => {
        const newTree = { ...prev };
        const baseItemId = isAutoexecFile
          ? `autoexec-${newName}`
          : `${parentId}-${newName}`;
        const newItemId = makeIdTree(baseItemId, newTree);
        
        newTree[newItemId] = {
          name: newName,
          path: newPath,
        };
        
        const parent = newTree[parentId];
        if (parent && parent.children) {
          newTree[parentId] = {
            ...parent,
            children: [...parent.children, newItemId],
          };
        }
        
        return newTree;
      });
      await refreshTrayMenu();
    })().catch(() => {
    });
  }, [contextMenu, treeData, setTreeDataWithRef, refreshTrayMenu]);

  const handleSplitView = useCallback(() => {
    const { itemPath } = contextMenu;
    setContextMenu(prev => ({ ...prev, visible: false }));
    if (itemPath) {
      onSplitViewOpen(itemPath);
    }
  }, [contextMenu, onSplitViewOpen]);

  const handleCloseSplitFromContextMenu = useCallback(() => {
    const { itemPath } = contextMenu;
    setContextMenu(prev => ({ ...prev, visible: false }));

    if (!itemPath || !splitFilePath) {
      return;
    }

    if (itemPath === splitFilePath) {
      onCloseSplit("secondary");
      return;
    }

    if (itemPath === currentFilePath) {
      onCloseSplit("primary");
    }
  }, [contextMenu, currentFilePath, onCloseSplit, splitFilePath]);


  const handleDelete = useCallback(async () => {
    if (renamingItemId) return;

    let { itemId, itemPath, itemName } = contextMenu;
    
    if ((!itemPath || !contextMenu.visible) && currentFilePath) {
      for (const [id, item] of Object.entries(treeData)) {
        if (item.path === currentFilePath) {
          itemId = id;
          itemPath = item.path;
          itemName = item.name;
          break;
        }
      }
    }

    setContextMenu(prev => ({ ...prev, visible: false }));
    
    if (!itemPath) return;
    
    const isFolder = isFolderNodeInTree(itemId, treeData);
    const parentId = findParentTree(itemId, treeData);
    if (!parentId) return;
    
    if (isFolder) {
      if (isProtectedFolderNodeInTree(itemId, treeData)) {
        return;
      }

      const userFolders = (treeData.root?.children || []).filter(
        (id) => id !== "autoexec" && isFolderNodeInTree(id, treeData)
      );
      if (userFolders.length <= 1) {
        return;
      }
    }
    
    await (async () => {
      if (isFolder) {
        const folderItem = treeData[itemId];
        const childrenData: { id: string; name: string; path: string; content: string }[] = [];
        
        for (const childId of folderItem?.children || []) {
          const child = treeData[childId];
          if (child && child.path) {
            const content = await readTextFile(child.path).catch(() => null);
            if (content !== null) {
              childrenData.push({
                id: childId,
                name: child.name,
                path: child.path,
                content,
              });
            }
          }
        }
        
        setDeletedItemsStack(prev => {
          const newStack = [...prev, {
            itemId,
            itemPath,
            itemName,
            isFolder: true,
            parentId,
            children: childrenData,
          }];
          return newStack.slice(-MAX_DELETED_ITEMS);
        });
      } else {
        const content = await readTextFile(itemPath).catch(() => null);
        if (content !== null) {
          setDeletedItemsStack(prev => {
            const newStack = [...prev, {
              itemId,
              itemPath,
              itemName,
              isFolder: false,
              parentId,
              content,
              wasCurrentFile: currentFilePath === itemPath,
            }];
            return newStack.slice(-MAX_DELETED_ITEMS);
          });
        }
      }
      
      await remove(itemPath, { recursive: true });
      
      if (isFolder) {
        const folderItem = treeData[itemId];
        const childrenToDelete = folderItem?.children || [];
        
        setTreeDataWithRef(prev => {
          const newTree = { ...prev };
          
          childrenToDelete.forEach(childId => {
            delete newTree[childId];
          });
          
          delete newTree[itemId];
          
          const rootChildren = (prev.root?.children || []).filter(id => id !== itemId);
          newTree.root = { ...prev.root, children: rootChildren };
          
          return newTree;
        });

        const removedPrimaryFromFolder = currentFilePath?.startsWith(itemPath + "/") === true;
        const removedSecondaryFromFolder = splitFilePath?.startsWith(itemPath + "/") === true;

        if (removedSecondaryFromFolder) {
          onCloseSplit("secondary");
        } else if (removedPrimaryFromFolder && splitFilePath) {
          onCloseSplit("primary");
        }
        
        if (removedPrimaryFromFolder) {
          setCode("-- Select a file");
          setCurrentFilePath(null);
          saveExplorerData("lastOpenedFile", null);
        }
        
        requestAnimationFrame(() => tree.rebuildTree());
      } else {
        setTreeDataWithRef(prev => {
          const newTree = { ...prev };
          
          delete newTree[itemId];
          
          const parent = newTree[parentId];
          if (parent && parent.children) {
            newTree[parentId] = {
              ...parent,
              children: parent.children.filter(childId => childId !== itemId),
            };
          }
          
          return newTree;
        });

        if (splitFilePath === itemPath) {
          onCloseSplit("secondary");
        } else if (currentFilePath === itemPath && splitFilePath) {
          onCloseSplit("primary");
        }
        
        if (currentFilePath === itemPath) {
          setCode("-- Select a file");
          setCurrentFilePath(null);
          saveExplorerData("lastOpenedFile", null);
        }
        
        requestAnimationFrame(() => tree.rebuildTree());
      }
      await refreshTrayMenu();
    })().catch(() => {});
  }, [contextMenu, currentFilePath, onCloseSplit, renamingItemId, splitFilePath, tree, treeData, setCode, setCurrentFilePath, setTreeDataWithRef, refreshTrayMenu]);

  const handleNewScriptInFolder = useCallback(async () => {
    const { itemId, itemPath } = contextMenu;
    setContextMenu(prev => ({ ...prev, visible: false }));
    
    if (!itemPath) return;
    
    await (async () => {
      let fileName = "Script.lua";
      let counter = 1;
      
      const folder = treeDataRef.current[itemId];
      const existingFiles = (folder?.children || [])
        .map(childId => treeDataRef.current[childId]?.name)
        .filter(Boolean);
      
      while (existingFiles.includes(fileName)) {
        fileName = `Script (${counter}).lua`;
        counter++;
      }
      
      const filePath = `${itemPath}/${fileName}`;
      await writeTextFile(filePath, "-- New script\n");
      
      const isAutoexec = itemId === "autoexec";
      const baseFileId = isAutoexec ? `autoexec-${fileName}` : `${itemId}-${fileName}`;
      const newFileId = makeIdTree(baseFileId, treeDataRef.current);
      
      setTreeDataWithRef(prev => {
        const newTree = { ...prev };
        newTree[newFileId] = {
          name: fileName,
          path: filePath,
        };
        const parentFolder = newTree[itemId];
        if (parentFolder && parentFolder.children) {
          newTree[itemId] = {
            ...parentFolder,
            children: [...parentFolder.children, newFileId],
          };
        }
        return newTree;
      });

      requestAnimationFrame(() => {
        tree.rebuildTree();
      });
      
      setExpandedItems(prev => {
        if (prev.includes(itemId)) {
          return prev;
        }

        const next = [...prev, itemId];
        saveExplorerData("expandedFolders", next);
        return next;
      });
      
      setCode("-- New script\n");
      setCurrentFilePath(filePath);
      await saveExplorerData("lastOpenedFile", filePath);
      
      requestAnimationFrame(() => {
        setRenamingItemId(newFileId);
        setRenameValue(fileName);
      });
      await refreshTrayMenu();
    })().catch(() => {
    });
  }, [contextMenu, setCode, setCurrentFilePath, setExpandedItems, setTreeDataWithRef, tree, treeDataRef, refreshTrayMenu]);

  const handleExplorerNewScript = useCallback(async () => {
    setExplorerContextMenu(prev => ({ ...prev, visible: false }));
    await handleNewScript();
  }, [handleNewScript]);

  const handleExplorerNewFolder = useCallback(async () => {
    setExplorerContextMenu(prev => ({ ...prev, visible: false }));
    await handleNewFolder();
  }, [handleNewFolder]);

  useEffect(() => {
    if (handleDeleteRef) {
      handleDeleteRef.current = handleDelete;
    }
  }, [handleDelete, handleDeleteRef]);

  const navigateFiles = useCallback((direction: number) => {
    const items = tree.getItems();
    if (items.length === 0) return;

    let currentIndex = -1;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.isFolder() && item.getItemData().path === currentFilePath) {
        currentIndex = i;
        break;
      }
    }

    if (currentIndex === -1) {
      if (items.length > 0) {
        currentIndex = direction > 0 ? -1 : items.length;
      } else {
        return;
      }
    }

    let nextIndex = currentIndex + direction;
    let attempts = 0;
    const maxAttempts = items.length;

    while (attempts < maxAttempts) {
      if (nextIndex < 0 || nextIndex >= items.length) {
        break;
      }

      const item = items[nextIndex];
      if (!item.isFolder() && item.getItemData().path) {
        handleFileOpen(item.getItemData().path!);
        break;
      }

      nextIndex += direction;
      attempts++;
    }
  }, [tree, currentFilePath, handleFileOpen]);

  useEffect(() => {
    if (navigateFilesRef) {
      navigateFilesRef.current = navigateFiles;
    }
  }, [navigateFiles, navigateFilesRef]);

  const contextMenuStyle = useMemo(() => ({
    position: "fixed" as const,
    left: contextMenuPosition.left,
    top: contextMenuPosition.top,
    maxHeight: `calc(100vh - ${CONTEXT_MENU_VIEWPORT_PADDING * 2}px)`,
    maxWidth: `calc(100vw - ${CONTEXT_MENU_VIEWPORT_PADDING * 2}px)`,
    overflowY: "auto" as const,
    overflowX: "hidden" as const,
  }), [contextMenuPosition.left, contextMenuPosition.top]);

  const explorerContextMenuStyle = useMemo(() => ({
    position: "fixed" as const,
    left: explorerContextMenuPosition.left,
    top: explorerContextMenuPosition.top,
    maxHeight: `calc(100vh - ${CONTEXT_MENU_VIEWPORT_PADDING * 2}px)`,
    maxWidth: `calc(100vw - ${CONTEXT_MENU_VIEWPORT_PADDING * 2}px)`,
    overflowY: "auto" as const,
    overflowX: "hidden" as const,
  }), [explorerContextMenuPosition.left, explorerContextMenuPosition.top]);

  const canSplitView = useMemo(() => {
    if (!contextMenu.itemPath || contextMenu.isFolder) {
      return false;
    }
    if (contextMenu.itemPath === currentFilePath || contextMenu.itemPath === splitFilePath) {
      return false;
    }
    return selectedItems.length > 0;
  }, [contextMenu, currentFilePath, selectedItems.length, splitFilePath]);

  const canCloseSplitView = useMemo(() => {
    if (!splitFilePath || !contextMenu.itemPath || contextMenu.isFolder) {
      return false;
    }

    return contextMenu.itemPath === currentFilePath || contextMenu.itemPath === splitFilePath;
  }, [contextMenu, currentFilePath, splitFilePath]);

  React.useLayoutEffect(() => {
    if (!isEditorActive || !contextMenu.visible || !contextMenuRef.current) {
      return;
    }

    const { width, height } = contextMenuRef.current.getBoundingClientRect();
    setContextMenuPosition(getContextPos(
      contextMenu.x,
      contextMenu.y,
      width,
      height,
    ));
  }, [
    canCloseSplitView,
    canSplitView,
    contextMenu.isFolder,
    contextMenu.isProtectedFolder,
    contextMenu.visible,
    contextMenu.x,
    contextMenu.y,
    isEditorActive,
  ]);

  React.useLayoutEffect(() => {
    if (!isEditorActive || !explorerContextMenu.visible || !explorerContextMenuRef.current) {
      return;
    }

    const { width, height } = explorerContextMenuRef.current.getBoundingClientRect();
    setExplorerContextMenuPosition(getContextPos(
      explorerContextMenu.x,
      explorerContextMenu.y,
      width,
      height,
    ));
  }, [
    explorerContextMenu.visible,
    explorerContextMenu.x,
    explorerContextMenu.y,
    isEditorActive,
  ]);

  const containerMotion = animateVisibilityTransitions ? EXPLORER_CONTAINER_MOTION : EXPLORER_CONTAINER_INSTANT_MOTION;
  const panelMotion = animateVisibilityTransitions ? EXPLORER_PANEL_MOTION : EXPLORER_PANEL_INSTANT_MOTION;


  return (
    <>
      <LazyMotion features={domAnimation}>
        <AnimatePresence initial={false}>
          {showExplorer && (
            <m.div
              initial={containerMotion.initial}
              animate={containerMotion.animate}
              exit={containerMotion.exit}
              style={{ display: "flex", height: "100%", overflow: "visible" }}
            >
              <div
                className={cx("resize-handle", { dragging: isDragging })}
                onMouseDown={startResizing}
                role="separator"
                aria-orientation="vertical"
              ></div>
              <m.div 
                className={styles["explorer-container"]} 
                style={{ width: explorerWidth }}
                initial={panelMotion.initial}
                animate={panelMotion.animate}
                exit={panelMotion.exit}
                onContextMenu={handleExplorerContextMenu}
              >
              <DndContext
                sensors={sensors}
                collisionDetection={pointerWithin}
                onDragStart={handleDragStart}
                onDragMove={handleDragMove}
                onDragEnd={handleDragEnd}
                onDragCancel={handleDragCancel}
              >
                <div {...tree.getContainerProps()} className={styles.tree} data-tree-version={treeRenderVersion}>
                  {tree.getItems().map((item) => {
                    const itemProps = item.getProps();
                    const isRenaming = renamingItemId === item.getId();
                    const isFile = !item.isFolder();
                    const itemId = item.getId();
                    
                    if (!item.getItemName()) return null;
                    
                    const treeItemContent = (
                      <div
                        {...itemProps}
                        className={cx("tree-item", {
                          focused: item.isFocused(),
                          expanded: item.isExpanded(),
                          selected: item.isSelected(),
                          folder: item.isFolder(),
                          active: isFile && (currentFilePath === item.getItemData().path || splitFilePath === item.getItemData().path),
                        })}
                        style={{ paddingLeft: `${12 + item.getItemMeta().level * 16}px` }}
                        onClick={(e) => {
                          if (isRenaming) {
                            e.stopPropagation();
                            return;
                          }
                          if (itemProps.onClick) {
                            itemProps.onClick(e);
                          }
                          if (isFile && item.getItemData().path) {
                            handleFileOpen(item.getItemData().path!);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (itemProps.onKeyDown) {
                            itemProps.onKeyDown(e);
                          }
                          if (isRenaming) {
                            e.stopPropagation();
                            return;
                          }
                          if ((e.key === 'Enter' || e.key === ' ') && isFile && item.getItemData().path) {
                            e.preventDefault();
                            handleFileOpen(item.getItemData().path!);
                          }
                        }}
                        onContextMenu={(e) => {
                          const isUserFolder = item.isFolder() && itemId !== "root" && itemId !== "autoexec";
                          const isAutoexecFolder = itemId === "autoexec";
                          const isAutoexecFile = !item.isFolder() && findParentTree(itemId, treeDataRef.current) === "autoexec";
                          const isProtectedFolder = item.isFolder() && isProtectedFolderNodeInTree(itemId, treeDataRef.current);
                          
                          if ((isFile || isUserFolder || isAutoexecFolder) && item.getItemData().path) {
                            handleContextMenu(
                              e, 
                              itemId, 
                              item.getItemData().path!, 
                              item.getItemName(),
                              isUserFolder || isAutoexecFolder,
                              isAutoexecFolder || isAutoexecFile,
                              isProtectedFolder
                            );
                          } else {
                            e.preventDefault();
                          }
                        }}
                        role="treeitem"
                        tabIndex={typeof itemProps.tabIndex === "number" ? itemProps.tabIndex : 0}
                      >
                        <span className={styles["tree-item-icon"]}>
                          {item.isFolder() 
                            ? (item.isExpanded() ? <FolderOpenIcon /> : <FolderIcon />)
                            : (item.getItemName().toLowerCase().endsWith('.lua') ? <LuaIcon /> : item.getItemName().toLowerCase().endsWith('.luau') ? <LuauIcon /> : <FileIcon />)
                          }
                        </span>
                        {isRenaming ? (
                          <input
                            ref={renameInputRef}
                            type="text"
                            className={styles["rename-input"]}
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={commitRename}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                commitRename();
                              } else if (e.key === 'Escape') {
                                setRenamingItemId(null);
                              }
                            }}
                            onMouseDownCapture={(e) => {
                              if (e.detail >= 3) {
                                e.preventDefault();
                                selectFilenameStem(e.currentTarget);
                                return;
                              }

                              if (e.detail === 2) {
                                const selectionStart = e.currentTarget.selectionStart ?? 0;
                                e.preventDefault();
                                selectRenameSegment(e.currentTarget, selectionStart);
                              }
                            }}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <span className={styles["tree-item-name"]}>
                            {hideFileExtensions && isFile
                              ? item.getItemName().replace(/\.[^.]+$/, '')
                              : item.getItemName()}
                          </span>
                        )}
                      </div>
                    );
                    
                    if (isFile) {
                      return (
                        <DraggableItem
                          key={itemId}
                          id={itemId}
                          droppingId={droppingId}
                          dragDisabled={renamingItemId !== null}
                        >
                          {treeItemContent}
                        </DraggableItem>
                      );
                    } else {
                      return (
                        <DroppableFolder
                          key={itemId}
                          id={itemId}
                          droppingId={droppingId}
                          dragDisabled={renamingItemId !== null}
                        >
                          {treeItemContent}
                        </DroppableFolder>
                      );
                    }
                  })}
                </div>
                
                {createPortal(
                  <DragOverlay dropAnimation={null}>
                    {activeDragId && treeData[activeDragId] ? (
                      <div className={styles["drag-overlay-item"]}>
                        <span className={styles["tree-item-icon"]}>
                          {treeData[activeDragId].children 
                            ? <FolderIcon />
                            : (treeData[activeDragId].name.toLowerCase().endsWith('.lua') ? <LuaIcon /> : treeData[activeDragId].name.toLowerCase().endsWith('.luau') ? <LuauIcon /> : <FileIcon />)
                          }
                        </span>
                        <span className={styles["tree-item-name"]}>{treeData[activeDragId].name}</span>
                      </div>
                    ) : null}
                  </DragOverlay>,
                  document.body
                )}
              </DndContext>
              
              </m.div>
            </m.div>
          )}
        </AnimatePresence>
      </LazyMotion>
      {isEditorActive && contextMenu.visible && createPortal(
        <div
          ref={contextMenuRef}
          className={styles["context-menu"]}
          style={contextMenuStyle}
        >
          {contextMenu.isFolder && contextMenu.isProtectedFolder && (
            <button className={styles["context-menu-item"]} onClick={handleNewScriptInFolder}>
              <NewFileIcon />
              <span>New Script</span>
            </button>
          )}

          {contextMenu.isFolder && !contextMenu.isProtectedFolder && (
            <>
              <button className={styles["context-menu-item"]} onClick={handleNewScriptInFolder}>
                <NewFileIcon />
                <span>New Script</span>
              </button>
              <div className={styles["context-menu-separator"]} />
              <button className={styles["context-menu-item"]} onClick={handleRename}>
                <RenameIcon />
                <span>Rename</span>
              </button>
              <button className={cx("context-menu-item", "delete")} onClick={handleDelete}>
                <DeleteIcon />
                <span>Delete</span>
              </button>
            </>
          )}

          {!contextMenu.isFolder && (
            <>
              <button className={styles["context-menu-item"]} onClick={handleRename}>
                <RenameIcon />
                <span>Rename</span>
              </button>
              <button className={styles["context-menu-item"]} onClick={handleDuplicate}>
                <DuplicateIcon />
                <span>Duplicate</span>
              </button>
              {canCloseSplitView && (
                <button className={styles["context-menu-item"]} onClick={handleCloseSplitFromContextMenu}>
                  <SplitviewIcon />
                  <span>Close Split</span>
                </button>
              )}
              {canSplitView && (
                <>
                  <button className={styles["context-menu-item"]} onClick={handleSplitView}>
                    <SplitviewIcon />
                    <span>Splitview</span>
                  </button>
                </>
              )}
              <div className={styles["context-menu-separator"]} />
              <button className={cx("context-menu-item", "delete")} onClick={handleDelete}>
                <DeleteIcon />
                <span>Delete</span>
              </button>
            </>
          )}
        </div>,
        document.body
      )}

      {isEditorActive && explorerContextMenu.visible && createPortal(
        <div
          ref={explorerContextMenuRef}
          className={styles["context-menu"]}
          style={explorerContextMenuStyle}
        >
          <button className={styles["context-menu-item"]} onClick={handleExplorerNewScript}>
            <NewFileIcon />
            <span>New Script</span>
          </button>
          <button className={styles["context-menu-item"]} onClick={handleExplorerNewFolder}>
            <NewFolderIcon />
            <span>New Folder</span>
          </button>
        </div>,
        document.body
      )}
    </>
  );
});

Explorer.displayName = 'Explorer';

export default Explorer;
export type { ExplorerProps };
