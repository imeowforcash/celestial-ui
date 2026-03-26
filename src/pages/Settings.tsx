import React, { useEffect, useLayoutEffect, useMemo, useCallback, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/utils/ui";
import { useEditorSettings, useKeybindSettings, useRuntimeSettings, useUiSettings } from "../contexts/SettingsContext";
import { comboFromEvent, formatDisplay, isMacPlatform, KeybindAction } from "../utils/keybinds";
import styles from "../styles/SettingsSurface.module.css";

type KeybindCaptureProps = {
  actionId: KeybindAction;
  combo: string;
  isMac: boolean;
  isActive: boolean;
  onChange: (actionId: KeybindAction, combo: string) => void;
};

const KeybindCapture = React.memo(({
  actionId,
  combo,
  isMac,
  isActive,
  onChange,
}: KeybindCaptureProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [buttonWidth, setButtonWidth] = useState<number | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const measureRef = useRef<HTMLSpanElement | null>(null);

  const displayValue = useMemo(() => {
    if (!combo || typeof combo !== "string") return "Unassigned";
    const formatted = formatDisplay(combo, isMac);
    return formatted || "Unassigned";
  }, [combo, isMac]);

  const stopRecording = useCallback(() => {
    setIsRecording(false);
  }, []);

  const handleToggleRecording = useCallback(() => {
    setIsRecording((prev) => !prev);
  }, []);

  const displayText = isRecording ? "..." : displayValue;

  useEffect(() => {
    if (!isActive) {
      stopRecording();
    }
  }, [isActive, stopRecording]);

  useEffect(() => {
    if (!isRecording) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (event.key === "Escape") {
        stopRecording();
        return;
      }

      const nextCombo = comboFromEvent(event);
      if (nextCombo) {
        onChange(actionId, nextCombo);
        stopRecording();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [actionId, isRecording, onChange, stopRecording]);

  useEffect(() => {
    if (!isRecording) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && buttonRef.current?.contains(target)) {
        return;
      }
      stopRecording();
    };

    const handleWindowBlur = () => {
      stopRecording();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        stopRecording();
      }
    };

    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("blur", handleWindowBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("blur", handleWindowBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isRecording, stopRecording]);

  useLayoutEffect(() => {
    if (!isActive) {
      return;
    }

    const buttonElement = buttonRef.current;
    const measureElement = measureRef.current;

    if (!buttonElement || !measureElement) {
      return;
    }

    const computedStyles = window.getComputedStyle(buttonElement);
    const horizontalPadding = parseFloat(computedStyles.paddingLeft) + parseFloat(computedStyles.paddingRight);
    const horizontalBorder = parseFloat(computedStyles.borderLeftWidth) + parseFloat(computedStyles.borderRightWidth);
    const nextWidth = Math.ceil(measureElement.getBoundingClientRect().width + horizontalPadding + horizontalBorder);

    setButtonWidth(nextWidth);
  }, [displayText, isActive]);

  return (
    <>
      <button
        type="button"
        className={cn(
          styles["key-btn"],
          isRecording && styles.recording,
        )}
        ref={buttonRef}
        onClick={handleToggleRecording}
        onBlur={stopRecording}
        style={buttonWidth === null ? undefined : { width: `${buttonWidth}px` }}
      >
        {displayText}
      </button>
      <span ref={measureRef} className={styles["key-measure"]} aria-hidden="true">
        {displayText}
      </span>
    </>
  );
});

type SettingsProps = {
  isActive: boolean;
};

const Settings: React.FC<SettingsProps> = ({ isActive }) => {
  const {
    appTitle,
    setAppTitle,
    currentTheme,
    setTheme,
    availableThemes,
    executor,
    setExecutor,
  } = useUiSettings();

  const {
    hideFileExtensions,
    setHideFileExtensions,
    disableLinting,
    setDisableLinting,
    wordWrapEnabled,
    setWordWrapEnabled,
    smoothTypingEnabled,
    setSmoothTypingEnabled,
    disableIndentGuides,
    setDisableIndentGuides,
  } = useEditorSettings();

  const {
    loadFpsUnlockStatus,
    showRawLogs,
    setShowRawLogs,
    autoWatchLogs,
    setAutoWatchLogs,
    preventUpdates,
    setPreventUpdates,
    disableTrayIcon,
    setDisableTrayIcon,
    hideTrayFolder,
    setHideTrayFolder,
    discordRpcEnabled,
    setDiscordRpcEnabled,
    unlockFps,
    setUnlockFps,
    hideMultiInstanceButton,
    setHideMultiInstanceButton,
    placeEditorButtonsInOtherPlace,
    setPlaceEditorButtonsInOtherPlace,
    autoHideSidebar,
    setAutoHideSidebar,
    disableHistory,
    setDisableHistory,
  } = useRuntimeSettings();

  const {
    keybinds,
    setKeybind,
  } = useKeybindSettings();

  useEffect(() => {
    loadFpsUnlockStatus();
  }, [loadFpsUnlockStatus]);

  const themeOptions = useMemo(() => availableThemes.map((theme) => ({
    value: theme,
    label: theme,
  })), [availableThemes]);

  const executorOptions = useMemo(() => ([
    { value: "opium", label: "Opiumware" },
    { value: "ms", label: "Macsploit" },
    { value: "hydro", label: "Hydrogen" },
  ]), []);

  const isMac = useMemo(() => isMacPlatform(), []);

  const keybindRows = useMemo(() => ([
    { actionId: "toggleSidebar" as KeybindAction, label: "Toggle Sidebar" },
    { actionId: "toggleAccountsPanel" as KeybindAction, label: "Toggle Accounts Panel" },
    { actionId: "toggleExplorer" as KeybindAction, label: "Toggle Explorer" },
    { actionId: "executeScript" as KeybindAction, label: "Execute Script" },
    { actionId: "newScript" as KeybindAction, label: "New Script" },
    { actionId: "newFolder" as KeybindAction, label: "New Folder" },
    { actionId: "deleteActiveScript" as KeybindAction, label: "Delete Active Script" },
    { actionId: "openRoblox" as KeybindAction, label: "Open Roblox" },
    { actionId: "openSettings" as KeybindAction, label: "Open Settings" },
  ]), []);

  const switchFilesDisplay = isMac ? "⌘ ↑ / ↓" : "Ctrl Up / Down";
  const switchPagesDisplay = isMac ? "⌘ 1-6" : "Ctrl 1-6";

  const handleKeybindChange = useCallback((actionId: KeybindAction, combo: string) => {
    const hasDuplicate = Object.entries(keybinds).some(([existingAction, existingCombo]) => {
      return existingAction !== actionId && existingCombo === combo;
    });

    if (hasDuplicate) {
      toast("Please, don't do that.", { duration: 2000 });
      return;
    }

    setKeybind(actionId, combo);
  }, [keybinds, setKeybind]);

  return (
    <div className={styles.main}>
      <div className={styles.group}>
        <Label htmlFor="app-title-input">App Title</Label>
        <Input
          id="app-title-input"
          type="text"
          value={appTitle}
          onChange={(e) => setAppTitle(e.target.value)}
          placeholder="Celestial UI"
        />
      </div>

      <div className={styles.group} style={{ marginTop: '12px' }}>
        <Label htmlFor="theme-select">Theme</Label>
        <Select
          id="theme-select"
          value={currentTheme}
          onChange={setTheme}
          options={themeOptions}
          placeholder="Select theme..."
        />
      </div>

      <div className={styles.group} style={{ marginTop: '12px' }}>
        <Label htmlFor="executor-select">Executor</Label>
        <Select
          id="executor-select"
          value={executor}
          onChange={setExecutor}
          options={executorOptions}
          placeholder="Select executor..."
        />
      </div>

      <div className={styles.group} style={{ marginTop: '12px' }}>
        <Field orientation="horizontal">
          <Checkbox 
            id="discord-rpc" 
            checked={!discordRpcEnabled}
            onChange={(e) => setDiscordRpcEnabled(!e.target.checked)}
          />
          <FieldLabel htmlFor="discord-rpc" onClick={() => setDiscordRpcEnabled(!discordRpcEnabled)}>
            Disable RPC
          </FieldLabel>
        </Field>
      </div>

      <div className={styles.group} style={{ marginTop: '12px' }}>
        <Field orientation="horizontal">
          <Checkbox 
            id="hide-file-extensions" 
            checked={hideFileExtensions}
            onChange={(e) => setHideFileExtensions(e.target.checked)}
          />
          <FieldLabel htmlFor="hide-file-extensions" onClick={() => setHideFileExtensions(!hideFileExtensions)}>
            Hide file extensions
          </FieldLabel>
        </Field>
      </div>

      <div className={styles.group} style={{ marginTop: '12px' }}>
        <Field orientation="horizontal">
          <Checkbox
            id="hide-multi-instance-button"
            checked={hideMultiInstanceButton}
            onChange={(e) => setHideMultiInstanceButton(e.target.checked)}
          />
          <FieldLabel htmlFor="hide-multi-instance-button" onClick={() => setHideMultiInstanceButton(!hideMultiInstanceButton)}>
            Hide multi-instance button
          </FieldLabel>
        </Field>
      </div>

      <div className={styles.group} style={{ marginTop: '12px' }}>
        <Field orientation="horizontal">
          <Checkbox
            id="place-editor-buttons-in-other-place"
            checked={placeEditorButtonsInOtherPlace}
            onChange={(e) => setPlaceEditorButtonsInOtherPlace(e.target.checked)}
          />
          <FieldLabel htmlFor="place-editor-buttons-in-other-place" onClick={() => setPlaceEditorButtonsInOtherPlace(!placeEditorButtonsInOtherPlace)}>
            Place editor buttons in the other place
          </FieldLabel>
        </Field>
      </div>

      <div className={styles.group} style={{ marginTop: '12px' }}>
        <Field orientation="horizontal">
          <Checkbox
            id="auto-hide-sidebar"
            checked={autoHideSidebar}
            onChange={(e) => setAutoHideSidebar(e.target.checked)}
          />
          <FieldLabel htmlFor="auto-hide-sidebar" onClick={() => setAutoHideSidebar(!autoHideSidebar)}>
            Automatically hide and show sidebar
          </FieldLabel>
        </Field>
      </div>

      <div className={styles.group} style={{ marginTop: '12px' }}>
        <Field orientation="vertical">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Checkbox
              id="disable-linting"
              checked={disableLinting}
              onChange={(e) => setDisableLinting(e.target.checked)}
            />
            <FieldLabel htmlFor="disable-linting" onClick={() => setDisableLinting(!disableLinting)}>
              Disable linting
            </FieldLabel>
          </div>
        </Field>
      </div>

      <div className={styles.group} style={{ marginTop: '12px' }}>
        <Field orientation="vertical">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Checkbox
              id="word-wrap"
              checked={wordWrapEnabled}
              onChange={(e) => setWordWrapEnabled(e.target.checked)}
            />
            <FieldLabel htmlFor="word-wrap" onClick={() => setWordWrapEnabled(!wordWrapEnabled)}>
              Word wrap
            </FieldLabel>
          </div>
        </Field>
      </div>

      <div className={styles.group} style={{ marginTop: '12px' }}>
        <Field orientation="vertical">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Checkbox
              id="smooth-typing"
              checked={smoothTypingEnabled}
              onChange={(e) => setSmoothTypingEnabled(e.target.checked)}
            />
            <FieldLabel htmlFor="smooth-typing" onClick={() => setSmoothTypingEnabled(!smoothTypingEnabled)}>
              Smooth typing
            </FieldLabel>
          </div>
        </Field>
      </div>

      <div className={styles.group} style={{ marginTop: '12px' }}>
        <Field orientation="vertical">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Checkbox
              id="disable-history"
              checked={disableHistory}
              onChange={(e) => setDisableHistory(e.target.checked)}
            />
            <FieldLabel htmlFor="disable-history" onClick={() => setDisableHistory(!disableHistory)}>
              Disable history
            </FieldLabel>
          </div>
          <FieldDescription>
            This will delete your existing history and hide the button.
          </FieldDescription>
        </Field>
      </div>

      <div className={styles.group} style={{ marginTop: '12px' }}>
        <Field orientation="vertical">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Checkbox
              id="disable-indent-guides"
              checked={disableIndentGuides}
              onChange={(e) => setDisableIndentGuides(e.target.checked)}
            />
            <FieldLabel htmlFor="disable-indent-guides" onClick={() => setDisableIndentGuides(!disableIndentGuides)}>
              Disable indent guides
            </FieldLabel>
          </div>
          <FieldDescription>
            Enable this if you're working with large scripts to prevent lag.
          </FieldDescription>
        </Field>
      </div>

      <div className={styles.group} style={{ marginTop: '12px' }}>
        <Field orientation="vertical">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Checkbox
              id="prevent-updates"
              checked={preventUpdates}
              onChange={(e) => setPreventUpdates(e.target.checked)}
            />
            <FieldLabel htmlFor="prevent-updates" onClick={() => setPreventUpdates(!preventUpdates)}>
              Prevent updates
            </FieldLabel>
          </div>
          <FieldDescription>
            Enable this if you're scared of me adding something malicious to Celestial in future updates.
          </FieldDescription>
        </Field>
      </div>

      <div className={styles.group} style={{ marginTop: '12px' }}>
        <Field orientation="vertical">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Checkbox 
              id="show-raw-logs" 
              checked={showRawLogs}
              onChange={(e) => setShowRawLogs(e.target.checked)}
            />
            <FieldLabel htmlFor="show-raw-logs" onClick={() => setShowRawLogs(!showRawLogs)}>
              Show raw console logs
            </FieldLabel>
          </div>
          <FieldDescription>
            Console logs are filtered to only show useful information, turning this on will remove the filter.
          </FieldDescription>
        </Field>
      </div>

      <div className={styles.group} style={{ marginTop: '12px' }}>
        <Field orientation="vertical">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Checkbox 
              id="auto-watch-logs" 
              checked={autoWatchLogs}
              onChange={(e) => setAutoWatchLogs(e.target.checked)}
            />
            <FieldLabel htmlFor="auto-watch-logs" onClick={() => setAutoWatchLogs(!autoWatchLogs)}>
              Automatically watch logs
            </FieldLabel>
          </div>
          <FieldDescription>
            Automatically start watching console logs when the app starts.
          </FieldDescription>
        </Field>
      </div>

      <div className={styles.group} style={{ marginTop: '12px' }}>
        <Field orientation="vertical">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Checkbox 
              id="unlock-fps" 
              checked={unlockFps}
              onChange={(e) => setUnlockFps(e.target.checked)}
            />
            <FieldLabel htmlFor="unlock-fps" onClick={() => setUnlockFps(!unlockFps)}>
              Unlock FPS
            </FieldLabel>
          </div>
          <FieldDescription>
            You will need to adjust the "Maximum Frame Rate" in Roblox for this to work. Restart Roblox to apply.
          </FieldDescription>
        </Field>
      </div>

      <div style={{ height: '1px', background: 'var(--border-secondary)', marginTop: '24px' }} />

      <div className={styles.head} style={{ marginTop: '16px', marginBottom: '12px', color: 'var(--text-primary)', fontSize: '15px', fontWeight: 600 }}>Menu Bar</div>

      <div className={styles.group} style={{ marginTop: '12px' }}>
        <Field orientation="vertical">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Checkbox
              id="disable-tray-icon"
              checked={disableTrayIcon}
              onChange={(e) => setDisableTrayIcon(e.target.checked)}
            />
            <FieldLabel htmlFor="disable-tray-icon" onClick={() => setDisableTrayIcon(!disableTrayIcon)}>
              Disable tray icon
            </FieldLabel>
          </div>
        </Field>
      </div>

      <div className={styles.group} style={{ marginTop: '12px' }}>
        <Field orientation="vertical">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Checkbox
              id="hide-tray-folder"
              checked={hideTrayFolder}
              onChange={(e) => setHideTrayFolder(e.target.checked)}
            />
            <FieldLabel htmlFor="hide-tray-folder" onClick={() => setHideTrayFolder(!hideTrayFolder)}>
              Hide tray folder
            </FieldLabel>
          </div>
        </Field>
      </div>

      <div style={{ height: '1px', background: 'var(--border-secondary)', marginTop: '24px' }} />

      <div className={styles.head} style={{ marginTop: '16px', marginBottom: '12px', color: 'var(--text-primary)', fontSize: '15px', fontWeight: 600 }}>Keyboard Shortcuts</div>

      <div className={styles.group} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {keybindRows.map((row) => (
          <div key={row.actionId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
            <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>{row.label}</span>
            <KeybindCapture
              actionId={row.actionId}
              combo={keybinds[row.actionId]}
              isMac={isMac}
              isActive={isActive}
              onChange={handleKeybindChange}
            />
          </div>
        ))}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
          <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Switch Files</span>
          <button
            type="button"
            className={styles["key-static"]}
            onClick={() => toast("No, you can't change these.", { duration: 2000 })}
          >
            {switchFilesDisplay}
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
          <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Switch Pages</span>
          <button
            type="button"
            className={styles["key-static"]}
            onClick={() => toast("No, you can't change these.", { duration: 2000 })}
          >
            {switchPagesDisplay}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Settings;
