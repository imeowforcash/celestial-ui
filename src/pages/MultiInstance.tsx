import React, { useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { Input } from "@/components/ui/input";
import { readStuff, saveStuff } from "@/utils/appData";
import { getContextPos } from "@/utils/contextMenu";
import { toast } from "sonner";
import { cn } from "@/utils/ui";
import settingsStyles from "../styles/SettingsSurface.module.css";
import styles from "./MultiInstance.module.css";

import { RefreshIcon, DeleteIcon, CheckIcon, HeartIcon } from "../assets/Icons";

interface Account {
  user_id: string;
  username: string;
  display_name: string;
  avatar_hash: string | null;
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  accountId: string;
  mode: 'account' | 'empty';
}

interface MultiInstanceProps {
  isActive: boolean;
}

const MultiInstance: React.FC<MultiInstanceProps> = ({ isActive }) => {
  const [cookieInput, setCookieInput] = useState('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [defaultAccountId, setDefaultAccountId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isBrowserLoginStarting, setIsBrowserLoginStarting] = useState(false);
  const [isSelfHealing, setIsSelfHealing] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    accountId: '',
    mode: 'account',
  });
  const [contextMenuPos, setContextMenuPos] = useState({ left: 0, top: 0 });
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const isBusy = isLoading || isSelfHealing;

  useEffect(() => {
    const loadData = async () => {
      const stuff = await readStuff();
      setDefaultAccountId(stuff.defaultAccountId ?? null);

      const nextAccounts = await invoke<Account[]>('get_accounts').catch(() => []);
      setAccounts(nextAccounts);
    };
    loadData();
  }, []);

  const handleSelectAccount = useCallback(async (userId: string) => {
    try {
      await invoke('set_default_account', { userId });
      
      await saveStuff('defaultAccountId', userId);
      setDefaultAccountId(userId);
      toast.success("Switched default account", { duration: 2000 });
    } catch {
    }
  }, []);

  const getInitials = (name: string): string => {
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };


  const handleAddAccount = useCallback(async () => {
    if (!cookieInput.trim() || isBusy) return;
    
    setIsLoading(true);
    
    try {
      const newAccount = await invoke<Account>('add_account', { cookie: cookieInput.trim() });
      
      setAccounts(prev => {
        const existing = prev.findIndex(a => a.user_id === newAccount.user_id);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = newAccount;
          return updated;
        }
        return [...prev, newAccount];
      });
      emit("account-added", newAccount).catch(() => {});
      
      setCookieInput('');
      setIsLoading(false);
    } catch {
      setIsLoading(false);
    }
  }, [cookieInput, isBusy]);

  const handleBrowserLogin = useCallback(async () => {
    if (isBusy || isBrowserLoginStarting) return;

    setIsBrowserLoginStarting(true);

    try {
      await invoke("start_roblox_browser_login");
    } catch {
    } finally {
      setIsBrowserLoginStarting(false);
    }
  }, [isBrowserLoginStarting, isBusy]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddAccount();
      (e.target as HTMLElement).blur();
    }
  };

  const handleContextMenu = useCallback((e: React.MouseEvent, accountId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      accountId,
      mode: 'account',
    });
  }, []);

  const handleEmptyContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      accountId: '',
      mode: 'empty',
    });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(prev => ({ ...prev, visible: false }));
  }, []);

  const handleRefresh = useCallback(async () => {
    const userId = contextMenu.accountId;
    closeContextMenu();
    
    try {
      const updatedAccount = await invoke<Account>('refresh_account', { userId });
      setAccounts(prev => prev.map(a => a.user_id === userId ? updatedAccount : a));
    } catch {
    }
  }, [contextMenu.accountId, closeContextMenu]);

  const handleDelete = useCallback(async () => {
    const userId = contextMenu.accountId;
    closeContextMenu();
    
    try {
      await invoke('delete_account', { userId });
      setAccounts(prev => prev.filter(a => a.user_id !== userId));
    } catch {
    }
  }, [contextMenu.accountId, closeContextMenu]);

  const handleSelfHeal = useCallback(async () => {
    closeContextMenu();

    if (isBusy) {
      return;
    }

    setIsSelfHealing(true);

    try {
      const restoredAccounts = await invoke<Account[]>('self_heal_accounts');
      setAccounts(restoredAccounts);

      if (restoredAccounts.length > 0) {
        toast.success("Recovered accounts", { duration: 2000 });
      } else {
        toast.error("No accounts found", { duration: 2000 });
      }
    } catch {
    } finally {
      setIsSelfHealing(false);
    }
  }, [closeContextMenu, isBusy]);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const handleClick = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        closeContextMenu();
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [closeContextMenu, isActive]);

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
  }, [contextMenu.mode, contextMenu.visible, contextMenu.x, contextMenu.y]);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    let unlistenAdded: (() => void) | undefined;

    const setup = async () => {
      unlistenAdded = await listen<Account>("browser-login-account-added", (event) => {
        const imported = event.payload;
        setAccounts(prev => {
          const existing = prev.findIndex(a => a.user_id === imported.user_id);
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = imported;
            return updated;
          }
          return [...prev, imported];
        });
        toast.success("Account added", { duration: 2000 });
      });
    };

    setup();

    return () => {
      if (unlistenAdded) unlistenAdded();
    };
  }, [isActive]);

  return (
      <div className={settingsStyles.main} style={{ display: 'flex', flexDirection: 'column' }}>
        
        <div className={cn(styles.cookie, isBusy && styles.loading)} style={{ marginTop: '-4px' }}>
          <div className={styles["cookie-row"]}>
            <Input
              id="cookie-input"
              type="text"
              placeholder={isLoading ? "Adding account..." : "Paste cookie here..."}
              value={cookieInput}
              onChange={(e) => setCookieInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isBusy}
            />
            <button
              type="button"
              className={styles["login-btn"]}
              onClick={() => {
                void handleBrowserLogin();
              }}
              disabled={isBusy || isBrowserLoginStarting}
            >
              {isBrowserLoginStarting ? "Opening..." : "Browser Login"}
            </button>
          </div>
        </div>

        
        {accounts.length === 0 ? (
          <div className={styles.empty} onContextMenu={handleEmptyContextMenu}>
            <p className={styles["empty-title"]}>Empty</p>
          </div>
        ) : (
          <div className={styles.list}>
            {accounts.map((account) => (
              <div 
                key={account.user_id} 
                className={cn(styles.account, defaultAccountId === account.user_id && styles.selected)}
                onClick={() => handleSelectAccount(account.user_id)}
                onContextMenu={(e) => handleContextMenu(e, account.user_id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    void handleSelectAccount(account.user_id);
                  }
                }}
              >
                <div className={styles.pfp}>
                  {account.avatar_hash ? (
                    <img 
                      src={account.avatar_hash} 
                      alt={account.display_name}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                        (e.target as HTMLImageElement).parentElement!.textContent = getInitials(account.display_name);
                      }}
                    />
                  ) : (
                    getInitials(account.display_name)
                  )}
                </div>
                <div className={styles.info}>
                  <p className={styles.name}>{account.display_name}</p>
                  <p className={styles.user}>@{account.username}</p>
                </div>
                {defaultAccountId === account.user_id && (
                  <div className={styles.check}>
                    <CheckIcon />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        
        {contextMenu.visible && (
          <div
            ref={contextMenuRef}
            className={styles.menu}
            style={{
              position: 'fixed',
              left: contextMenuPos.left,
              top: contextMenuPos.top,
            }}
          >
            {contextMenu.mode === 'empty' ? (
              <button className={styles["menu-item"]} onClick={handleSelfHeal}>
                <HeartIcon width={18} height={18} />
                <span>Self Heal</span>
              </button>
            ) : (
              <>
                <button className={styles["menu-item"]} onClick={handleRefresh}>
                  <RefreshIcon />
                  <span>Refresh</span>
                </button>
                <div className={styles.sep} />
                <button className={cn(styles["menu-item"], styles.delete)} onClick={handleDelete}>
                  <DeleteIcon />
                  <span>Delete</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>
  );
};

export default MultiInstance;
