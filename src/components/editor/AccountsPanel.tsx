import React, { useCallback, useRef, useEffect, memo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence, LazyMotion, domAnimation, m } from "motion/react";
import { toast } from "sonner";
import { KillIcon, PowerIcon } from "../../assets/Icons";
import { cn } from "@/utils/ui";
import { getSidePanelContainerMotion, getSidePanelContentMotion } from "./sidePanelMotion";
import { getContextPos } from "./contextMenuPosition";
import styles from "./EditorShared.module.css";

export interface Account {
  user_id: string;
  username: string;
  display_name: string;
  avatar_hash: string | null;
}

interface AccountsPanelProps {
  showAccountsPanel: boolean;
  animateVisibilityTransitions: boolean;
  accountsWidth: number;
  accounts: Account[];
  runningAccounts: string[];
  selectedAccounts: string[];
  joinTargetUserIds?: string[] | null;
  setSelectedAccounts: React.Dispatch<React.SetStateAction<string[]>>;
  startAccountsResizing: (e: React.MouseEvent) => void;
  onOpenJoinOverlay: (userIds: string[], mode: AccountJoinMode) => void;
}

interface AccountsContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  userId?: string;
}

export type AccountJoinMode = "place" | "serverLink";

const getAccountInitials = (name: string): string => {
  const parts = name.split(" ");
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
};

const JoinGameIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="6" x2="10" y1="11" y2="11"/>
    <line x1="8" x2="8" y1="9" y2="13"/>
    <line x1="15" x2="15.01" y1="12" y2="12"/>
    <line x1="18" x2="18.01" y1="10" y2="10"/>
    <path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z"/>
  </svg>
);

const JoinServerIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  </svg>
);

const AccountsPanel: React.FC<AccountsPanelProps> = memo(({
  showAccountsPanel,
  animateVisibilityTransitions,
  accountsWidth,
  accounts,
  runningAccounts,
  selectedAccounts,
  joinTargetUserIds,
  setSelectedAccounts,
  startAccountsResizing,
  onOpenJoinOverlay,
}) => {
  const [accountsContextMenu, setAccountsContextMenu] = React.useState<AccountsContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    userId: undefined,
  });
  const [menuPos, setMenuPos] = React.useState({
    left: 0,
    top: 0,
  });
  const accountsContextMenuRef = useRef<HTMLDivElement>(null);
  const contextMenuUserId = accountsContextMenu.userId;
  const contextMenuAccountRunning = contextMenuUserId
    ? runningAccounts.includes(contextMenuUserId)
    : false;
  const startableAccounts = selectedAccounts.filter((userId) => !runningAccounts.includes(userId));
  const hasMultipleStartSelection = startableAccounts.length > 1;
  const shouldUseSelectedStartAction = hasMultipleStartSelection && (
    !contextMenuUserId || startableAccounts.includes(contextMenuUserId)
  );
  const shouldUseSelectedJoinAction = shouldUseSelectedStartAction;
  const startActionLabel = shouldUseSelectedStartAction
    ? "Start Selected"
    : contextMenuUserId
      ? "Start Instance"
      : "Start All";

  const toggleSelectedAccount = useCallback((userId: string) => {
    setSelectedAccounts((prev) => (
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    ));
  }, [setSelectedAccounts]);

  const launchSingleInstance = useCallback(async (userId: string) => {
    try {
      await invoke("launch_instance", { userId });
    } catch {
    }
  }, []);

  const handleAccountClick = useCallback(async (e: React.MouseEvent, userId: string) => {
    if (e.metaKey || e.ctrlKey) {
      toggleSelectedAccount(userId);
      return;
    }

    const isRunning = runningAccounts.includes(userId);

    if (isRunning) {
      toggleSelectedAccount(userId);
      return;
    }

    await launchSingleInstance(userId);
  }, [launchSingleInstance, runningAccounts, toggleSelectedAccount]);

  const handleAccountsContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setAccountsContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      userId: undefined,
    });
  }, []);

  const handleAccountContextMenu = useCallback((e: React.MouseEvent, userId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setAccountsContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      userId,
    });
  }, []);

  const handleStartAllInstances = useCallback(async () => {
    setAccountsContextMenu((prev) => ({ ...prev, visible: false }));

    for (const account of accounts) {
      if (runningAccounts.includes(account.user_id)) {
        continue;
      }

      try {
        await invoke("launch_instance", { userId: account.user_id });
        await new Promise((resolve) => setTimeout(resolve, 3500));
      } catch {
      }
    }
  }, [accounts, runningAccounts]);

  const handleStartSelectedInstances = useCallback(async () => {
    setAccountsContextMenu((prev) => ({ ...prev, visible: false }));

    for (const userId of startableAccounts) {
      await launchSingleInstance(userId);
      await new Promise((resolve) => setTimeout(resolve, 3500));
    }
  }, [launchSingleInstance, startableAccounts]);

  const handleKillAllInstances = useCallback(async () => {
    setAccountsContextMenu((prev) => ({ ...prev, visible: false }));

    try {
      await invoke("kill_all_roblox_instances");
    } catch {
    }
  }, []);

  const handleStartInstance = useCallback(async (userId: string) => {
    setAccountsContextMenu((prev) => ({ ...prev, visible: false }));

    await launchSingleInstance(userId);
  }, [launchSingleInstance]);

  const handleKillInstance = useCallback(async (userId: string) => {
    setAccountsContextMenu((prev) => ({ ...prev, visible: false }));

    try {
      await invoke("kill_roblox_instance", { userId });
    } catch {
    }
  }, []);

  const openJoinOverlay = useCallback((mode: AccountJoinMode, userIds: string[]) => {
    setAccountsContextMenu((prev) => ({ ...prev, visible: false }));

    if (userIds.length === 0) {
      return;
    }

    if (userIds.some((userId) => runningAccounts.includes(userId))) {
      toast.error("Stop this instance first", { duration: 2500 });
      return;
    }

    onOpenJoinOverlay(userIds, mode);
  }, [onOpenJoinOverlay, runningAccounts]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (accountsContextMenuRef.current && !accountsContextMenuRef.current.contains(e.target as Node)) {
        setAccountsContextMenu((prev) => ({ ...prev, visible: false }));
      }
    };

    if (accountsContextMenu.visible) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [accountsContextMenu.visible]);

  React.useLayoutEffect(() => {
    if (!accountsContextMenu.visible || !accountsContextMenuRef.current) {
      return;
    }

    const { width, height } = accountsContextMenuRef.current.getBoundingClientRect();
    setMenuPos(getContextPos(
      accountsContextMenu.x,
      accountsContextMenu.y,
      width,
      height,
    ));
  }, [
    accountsContextMenu.visible,
    accountsContextMenu.x,
    accountsContextMenu.y,
    contextMenuAccountRunning,
    contextMenuUserId,
    shouldUseSelectedJoinAction,
  ]);

  const containerMotion = getSidePanelContainerMotion(animateVisibilityTransitions);
  const panelMotion = getSidePanelContentMotion(animateVisibilityTransitions);

  return (
    <>
      <LazyMotion features={domAnimation}>
        <AnimatePresence initial={false}>
          {showAccountsPanel && (
            <m.div
              initial={containerMotion.initial}
              animate={containerMotion.animate}
              exit={containerMotion.exit}
              style={{ display: "flex", height: "100%", overflow: "visible" }}
            >
              <m.div
                className={styles.accounts}
                style={{ width: accountsWidth, flexShrink: 0 }}
                initial={panelMotion.initial}
                animate={panelMotion.animate}
                exit={panelMotion.exit}
                onContextMenu={handleAccountsContextMenu}
              >
                <div className={styles.list}>
                  {accounts.length === 0 ? (
                    <div className={styles.empty}>Empty</div>
                  ) : (
                    accounts.map((account) => {
                      const isRunning = runningAccounts.includes(account.user_id);
                      const isSelected = selectedAccounts.includes(account.user_id);
                      const isJoinTarget = joinTargetUserIds?.includes(account.user_id) ?? false;
                      return (
                        <div
                          key={account.user_id}
                          className={cn(
                            styles.account,
                            isRunning && styles.running,
                            isSelected && styles.selected,
                            isJoinTarget && styles.join,
                          )}
                          onClick={(e) => handleAccountClick(e, account.user_id)}
                          onContextMenu={(e) => handleAccountContextMenu(e, account.user_id)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              if (runningAccounts.includes(account.user_id)) {
                                toggleSelectedAccount(account.user_id);
                                return;
                              }
                              void launchSingleInstance(account.user_id);
                            }
                          }}
                        >
                          <div className={styles.pfp}>
                            {account.avatar_hash ? (
                              <img
                                src={account.avatar_hash}
                                alt={account.display_name}
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = "none";
                                  (e.target as HTMLImageElement).parentElement!.textContent = getAccountInitials(account.display_name);
                                }}
                              />
                            ) : (
                              getAccountInitials(account.display_name)
                            )}
                          </div>
                          <div className={styles.info}>
                            <p className={styles.title}>{account.display_name}</p>
                            <p className={styles.sub}>@{account.username}</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </m.div>
              <div
                className={styles["side-resize"]}
                onMouseDown={startAccountsResizing}
                role="separator"
                aria-orientation="vertical"
              ></div>
            </m.div>
          )}
        </AnimatePresence>
      </LazyMotion>

      {accountsContextMenu.visible && (
        <div
          ref={accountsContextMenuRef}
          className={styles["context-menu"]}
          style={{
            position: "fixed",
            left: menuPos.left,
            top: menuPos.top,
          }}
        >
          {accountsContextMenu.userId ? (
            <>
              {contextMenuAccountRunning ? (
                <button className={cn(styles["context-menu-item"], styles.delete)} onClick={() => handleKillInstance(accountsContextMenu.userId!)}>
                  <KillIcon width="18" height="18" />
                  <span>Kill Instance</span>
                </button>
              ) : (
                <>
                  <button
                    className={styles["context-menu-item"]}
                    onClick={shouldUseSelectedStartAction ? handleStartSelectedInstances : () => handleStartInstance(accountsContextMenu.userId!)}
                  >
                    <PowerIcon width="18" height="18" />
                    <span>{startActionLabel}</span>
                  </button>
                  <button
                    className={styles["context-menu-item"]}
                    onClick={() => openJoinOverlay("place", shouldUseSelectedJoinAction ? startableAccounts : [accountsContextMenu.userId!])}
                  >
                    <JoinGameIcon />
                    <span>Join Game</span>
                  </button>
                  <button
                    className={styles["context-menu-item"]}
                    onClick={() => openJoinOverlay("serverLink", shouldUseSelectedJoinAction ? startableAccounts : [accountsContextMenu.userId!])}
                  >
                    <JoinServerIcon />
                    <span>Join Server</span>
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              <button
                className={styles["context-menu-item"]}
                onClick={shouldUseSelectedStartAction ? handleStartSelectedInstances : handleStartAllInstances}
              >
                <PowerIcon width="18" height="18" />
                <span>{startActionLabel}</span>
              </button>
              {shouldUseSelectedJoinAction && (
                <>
                  <button
                    className={styles["context-menu-item"]}
                    onClick={() => openJoinOverlay("place", startableAccounts)}
                  >
                    <JoinGameIcon />
                    <span>Join Game</span>
                  </button>
                  <button
                    className={styles["context-menu-item"]}
                    onClick={() => openJoinOverlay("serverLink", startableAccounts)}
                  >
                    <JoinServerIcon />
                    <span>Join Server</span>
                  </button>
                </>
              )}
              <button className={cn(styles["context-menu-item"], styles.delete)} onClick={handleKillAllInstances}>
                <KillIcon width="18" height="18" />
                <span>Kill All</span>
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
});

AccountsPanel.displayName = "AccountsPanel";

export default AccountsPanel;
