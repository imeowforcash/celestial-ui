import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from '@tauri-apps/api/app';
import { appDataDir, join } from "@tauri-apps/api/path";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { exists, readDir } from "@tauri-apps/plugin-fs";
import { toast } from "sonner";
import { useUiSettings } from "../contexts/SettingsContext";
import settingsStyles from "../styles/SettingsSurface.module.css";
import uiStyles from "@/components/ui/Field.module.css";

let discordInviteCache: string | null | undefined;
let inviteLoading: Promise<string | null> | null = null;
let announcementCache: string | null | undefined;
let announcementLoading: Promise<string | null> | null = null;
let hubbleStatusCache: HubbleStatus | undefined;
let hubbleStatusLoading: Promise<HubbleStatus> | null = null;

type HubbleStatus = "Installed" | "Missing Files" | "Not Installed";

async function getInvite(): Promise<string | null> {
  if (discordInviteCache !== undefined) return discordInviteCache;
  if (inviteLoading) return inviteLoading;

  inviteLoading = (async () => {
    try {
      const invite = await invoke<string>("get_discord_invite");
      return invite.length > 0 ? invite : null;
    } catch {
      return null;
    }
  })();

  const invite = await inviteLoading;
  discordInviteCache = invite;
  inviteLoading = null;
  return invite;
}

async function getAnnouncement(): Promise<string | null> {
  if (announcementCache !== undefined) return announcementCache;
  if (announcementLoading) return announcementLoading;

  announcementLoading = (async () => {
    try {
      const announcement = await invoke<string>("get_announcement");
      return announcement.length > 0 ? announcement : null;
    } catch {
      return null;
    }
  })();

  const announcement = await announcementLoading;
  announcementCache = announcement;
  announcementLoading = null;
  return announcement;
}

const appMetaLineStyle: React.CSSProperties = {
  color: 'var(--text-primary)',
  fontSize: '14px',
};

const discordLineStyle: React.CSSProperties = {
  ...appMetaLineStyle,
  cursor: 'pointer',
  userSelect: 'none',
};

async function resolveHubbleStatus(): Promise<HubbleStatus> {
  try {
    const isReady = await invoke<boolean>("is_hubble_ready").catch(() => false);
    if (isReady) {
      return "Installed";
    }

    const hubbleDir = await join(await appDataDir(), "hubble");
    const hubbleDirExists = await exists(hubbleDir);

    if (!hubbleDirExists) {
      return "Not Installed";
    }

    const entries = await readDir(hubbleDir).catch(() => []);
    if (entries.length === 0) {
      return "Not Installed";
    }

    return "Missing Files";
  } catch {
    return "Missing Files";
  }
}

async function getHubbleStatus(): Promise<HubbleStatus> {
  if (hubbleStatusCache !== undefined) return hubbleStatusCache;
  if (hubbleStatusLoading) return hubbleStatusLoading;

  hubbleStatusLoading = resolveHubbleStatus();

  const hubbleStatus = await hubbleStatusLoading;
  hubbleStatusCache = hubbleStatus;
  hubbleStatusLoading = null;
  return hubbleStatus;
}

async function refreshHubbleStatus(): Promise<HubbleStatus> {
  return resolveHubbleStatus();
}

interface StatsTabProps {
  isActive: boolean;
}

const StatsTab: React.FC<StatsTabProps> = ({ isActive }) => {
  const { executor } = useUiSettings();
  const isHydrogenExecutor = executor === "hydro";
  const [key, setKey] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [expiration, setExpiration] = useState<string>('');
  const [keyLoading, setKeyLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [appVersion, setAppVersion] = useState<string>('');
  const [discordInvite, setDiscordInvite] = useState<string | null>(discordInviteCache ?? null);
  const [discordInviteLoading, setDiscordInviteLoading] = useState(discordInviteCache === undefined);
  const [hubbleStatus, setHubbleStatus] = useState<HubbleStatus>(hubbleStatusCache ?? "Not Installed");
  const [announcement, setAnnouncement] = useState<string | null>(announcementCache ?? null);
  const [announcementLoading, setAnnouncementLoading] = useState(announcementCache === undefined);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const loadData = async () => {
      if (isHydrogenExecutor) {
        try {
          const hydrogenKey = await invoke<string>("get_hydrogen_key");
          setKey(hydrogenKey);
          setInputValue(hydrogenKey);
        } catch {
          setKey("");
          setInputValue("");
        }
      } else {
        setKey("");
        setInputValue("");
        setExpiration('');
      }
      setKeyLoading(false);

      try {
        const v = await getVersion();
        setAppVersion(v);
      } catch {
      }

    };
    loadData();
  }, [isHydrogenExecutor]);

  useEffect(() => {
    let cancelled = false;

    if (hubbleStatusCache !== undefined) {
      return;
    }

    const loadHubbleStatus = async () => {
      const nextHubbleStatus = await getHubbleStatus();
      if (cancelled) return;
      setHubbleStatus(nextHubbleStatus);
    };

    void loadHubbleStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const loadHubbleStatus = async () => {
      const nextHubbleStatus = await refreshHubbleStatus();
      hubbleStatusCache = nextHubbleStatus;
      setHubbleStatus(nextHubbleStatus);
    };

    void loadHubbleStatus();
  }, [isActive]);

  useEffect(() => {
    let cancelled = false;

    if (discordInviteCache !== undefined) {
      return;
    }

    const loadInvite = async () => {
      const invite = await getInvite();
      if (cancelled) return;
      setDiscordInvite(invite);
      setDiscordInviteLoading(false);
    };
    void loadInvite();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (announcementCache !== undefined) {
      return;
    }

    const loadAnnouncement = async () => {
      const nextAnnouncement = await getAnnouncement();
      if (cancelled) return;
      setAnnouncement(nextAnnouncement);
      setAnnouncementLoading(false);
    };
    void loadAnnouncement();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const checkExpiration = async () => {
      if (!isHydrogenExecutor) {
        return;
      }
      if (!key) {
        setExpiration('');
        return;
      }

      const result = await invoke<{ formatted: string } | null>("get_key_expiration").catch(() => {
        setExpiration('');
        return null;
      });

      if (!result) {
        return;
      }

      setExpiration(`Expires: ${result.formatted}`);
    };
    checkExpiration();
  }, [isActive, isHydrogenExecutor, key]);

  const saveKey = useCallback(async (newKey: string) => {
    if (!isHydrogenExecutor) {
      return;
    }
    const cleanKey = newKey.replace(/\s/g, '');

    if (cleanKey === key.replace(/\s/g, '')) {
      return;
    }

    setIsSaving(true);

    try {
      await invoke("save_hydrogen_key", { key: cleanKey });
      setKey(cleanKey);
      setInputValue(cleanKey);
      setIsSaving(false);
      setTimeout(() => {
        toast.success("Key saved successfully", { duration: 2000 });
      }, 250);
    } catch {
      setIsSaving(false);
      setTimeout(() => {
        toast.error("Invalid key", { duration: 3000 });
      }, 250);
      setInputValue(key);
    }
  }, [isHydrogenExecutor, key]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value.replace(/\s/g, '');
    setInputValue(newValue);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      saveKey(newValue);
    }, 1500);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      saveKey(inputValue);
      (e.target as HTMLElement).blur();
    }
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const copyDiscordInvite = useCallback(async () => {
    if (!discordInvite) return;
    try {
      await writeText(discordInvite);
      toast.success("Invite Copied", { duration: 2000 });
    } catch {
    }
  }, [discordInvite]);

  const handleDiscordKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLSpanElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        copyDiscordInvite();
      }
    },
    [copyDiscordInvite]
  );

  let expirationText = expiration;
  if (expirationText.length === 0 && !keyLoading) {
    expirationText = "No expiration info";
  }

  return (
    <div
      className={settingsStyles.main}
      onPointerDownCapture={(e) => {
        const target = e.target as HTMLElement;
        if (target.tagName !== 'INPUT') {
          (document.activeElement as HTMLElement)?.blur();
        }
      }}
    >
      {isHydrogenExecutor && (
        <div className={settingsStyles.group}>
          <Label className={settingsStyles.label} htmlFor="key-input">Key</Label>
          <Input
            id="key-input"
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={keyLoading ? "Loading..." : "Enter your key"}
            disabled={keyLoading || isSaving}
          />
          {isSaving ? (
            <span className={uiStyles["ui-field-description"]}>Validating...</span>
          ) : (
            <span className={uiStyles["ui-field-description"]}>{expirationText}</span>
          )}
        </div>
      )}

      {appVersion && (
        <div className={settingsStyles.group} style={{ marginTop: isHydrogenExecutor ? '12px' : 0 }}>
          <span className={settingsStyles.label} style={appMetaLineStyle}>App Version: {appVersion}</span>
          <span className={settingsStyles.label} style={appMetaLineStyle}>
            Hubble: {hubbleStatus}
          </span>
          <span
            className={settingsStyles.label}
            style={discordLineStyle}
            role="button"
            tabIndex={discordInvite ? 0 : -1}
            aria-disabled={!discordInvite}
            onClick={discordInvite ? copyDiscordInvite : undefined}
            onKeyDown={discordInvite ? handleDiscordKeyDown : undefined}
          >
            Discord: {discordInviteLoading ? "Loading..." : (discordInvite ?? "Unavailable")}
          </span>
          {(announcementLoading || announcement) && (
            <span className={settingsStyles.label} style={appMetaLineStyle}>
              Announcement: {announcementLoading ? "Loading..." : announcement}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default StatsTab;
