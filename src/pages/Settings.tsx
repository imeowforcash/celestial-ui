import React, { useEffect, useLayoutEffect, useMemo, useCallback, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Select, type SelectOption } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { cn } from "@/utils/ui";
import { useEditorSettings, useFontSettings, useKeybindSettings, useRuntimeSettings, useUiSettings } from "../contexts/SettingsContext";
import { comboFromEvent, formatDisplay, KeybindAction } from "../utils/keybinds";
import { CODE_FONT_OPTIONS, UI_FONT_OPTIONS } from "../utils/fontConfig";
import styles from "../styles/SettingsSurface.module.css";

type KeybindCaptureProps = {
  actionId: KeybindAction;
  combo: string;
  isActive: boolean;
  onChange: (actionId: KeybindAction, combo: string) => void;
};

const KeybindCapture = React.memo(({
  actionId,
  combo,
  isActive,
  onChange,
}: KeybindCaptureProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [buttonWidth, setButtonWidth] = useState<number | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const measureRef = useRef<HTMLSpanElement | null>(null);

  const displayValue = useMemo(() => {
    if (!combo || typeof combo !== "string") return "Unassigned";
    const formatted = formatDisplay(combo);
    if (formatted !== "") {
      return formatted;
    }
    return "Unassigned";
  }, [combo]);

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

type ToggleSettingRowProps = {
  id: string;
  label: string;
  checked: boolean;
  onToggle: (next: boolean) => void;
  description?: string;
  orientation?: "horizontal" | "vertical";
};

const ToggleSettingRow: React.FC<ToggleSettingRowProps> = ({
  id,
  label,
  checked,
  onToggle,
  description,
  orientation = "vertical",
}) => (
  <div className={cn(styles.group, styles["group-spaced"])}>
    <Field orientation={orientation}>
      <div className={styles["row-inline"]}>
        <Checkbox
          id={id}
          checked={checked}
          onChange={(event) => onToggle(event.target.checked)}
        />
        <FieldLabel htmlFor={id} onClick={() => onToggle(!checked)}>
          {label}
        </FieldLabel>
      </div>
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  </div>
);

type SelectSettingRowProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder: string;
};

const SelectSettingRow: React.FC<SelectSettingRowProps> = ({
  id,
  label,
  value,
  onChange,
  options,
  placeholder,
}) => (
  <div className={cn(styles.group, styles["group-spaced"])}>
    <Label htmlFor={id}>{label}</Label>
    <Select
      id={id}
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
    />
  </div>
);

type SliderSettingRowProps = {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
};

const SliderSettingRow: React.FC<SliderSettingRowProps> = ({
  id,
  label,
  value,
  onChange,
  min,
  max,
  step,
}) => (
  <div className={cn(styles.group, styles["group-spaced"])}>
    <Field orientation="vertical">
      <Label htmlFor={id}>{label}</Label>
      <Slider
        id={id}
        value={[value]}
        onValueChange={(next) => onChange(next[0])}
        min={min}
        max={max}
        step={step}
      />
    </Field>
  </div>
);

const SectionDivider = () => <div className={styles["section-divider"]} />;

const SectionHead = ({ title }: { title: string }) => (
  <div className={cn(styles.head, styles["section-head"])}>{title}</div>
);

const EXECUTOR_OPTIONS: SelectOption[] = [
  { value: "opium", label: "Opiumware" },
  { value: "ms", label: "Macsploit" },
  { value: "hydro", label: "Hydrogen" },
];

const KEYBIND_ROWS: Array<{ actionId: KeybindAction; label: string }> = [
  { actionId: "toggleSidebar", label: "Toggle Sidebar" },
  { actionId: "toggleAccountsPanel", label: "Toggle Accounts Panel" },
  { actionId: "toggleExplorer", label: "Toggle Explorer" },
  { actionId: "executeScript", label: "Execute Script" },
  { actionId: "newScript", label: "New Script" },
  { actionId: "newFolder", label: "New Folder" },
  { actionId: "deleteActiveScript", label: "Delete Active Script" },
  { actionId: "openRoblox", label: "Open Roblox" },
  { actionId: "killRoblox", label: "Kill Roblox" },
  { actionId: "openSettings", label: "Open Settings" },
];

type SettingsProps = {
  isActive: boolean;
};

const Settings: React.FC<SettingsProps> = ({ isActive }) => {
  const {
    accountsPanelOnLeft,
    appTitle,
    setAppTitle,
    currentTheme,
    setTheme,
    availableThemes,
    explorerOnLeft,
    executor,
    setAccountsPanelOnLeft,
    setExplorerOnLeft,
    setExecutor,
    sidebarOnRight,
    setSidebarOnRight,
    tightSpacing,
    setTightSpacing,
  } = useUiSettings();

  const {
    editorFontFamily,
    editorFontSize,
    setEditorFontFamily,
    setEditorFontSize,
    UIFontFamily,
    UIFontSize,
    setUiFontFamily,
    setUiFontSize,
  } = useFontSettings();

  const {
    hideFileExtensions,
    setHideFileExtensions,
    addKingVon,
    setAddKingVon,
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
    unlockFps,
    setUnlockFps,
    hideMultiInstanceButton,
    setHideMultiInstanceButton,
    hideRobloxButton,
    setHideRobloxButton,
    editorButtonsElsewhere,
    setPlaceEditorButtonsInOtherPlace,
    autoHideSidebar,
    setAutoHideSidebar,
    useHubble,
    setUseHubble,
    disableHistory,
    setDisableHistory,
  } = useRuntimeSettings();

  const { keybinds, setKeybind } = useKeybindSettings();

  useEffect(() => {
    loadFpsUnlockStatus();
  }, [loadFpsUnlockStatus]);

  const themeOptions = useMemo(() => availableThemes.map((theme) => ({
    value: theme,
    label: theme,
  })), [availableThemes]);

  const switchFilesDisplay = "⌘ ↑ / ↓";
  const switchPagesDisplay = "⌘ 1-6";

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

  const topRows: ToggleSettingRowProps[] = [
    {
      id: "hide-file-extensions",
      label: "Hide file extensions",
      checked: hideFileExtensions,
      onToggle: setHideFileExtensions,
      orientation: "horizontal",
    },
    {
      id: "hide-roblox-button",
      label: "Hide Roblox button",
      checked: hideRobloxButton,
      onToggle: setHideRobloxButton,
      orientation: "horizontal",
    },
    {
      id: "hide-multi-instance-button",
      label: "Hide multi-instance button",
      checked: hideMultiInstanceButton,
      onToggle: setHideMultiInstanceButton,
      orientation: "horizontal",
    },
    {
      id: "place-editor-buttons-in-other-place",
      label: "Place editor buttons in the other place",
      checked: editorButtonsElsewhere,
      onToggle: setPlaceEditorButtonsInOtherPlace,
      orientation: "horizontal",
    },
    {
      id: "auto-hide-sidebar",
      label: "Automatically hide and show sidebar",
      checked: autoHideSidebar,
      onToggle: setAutoHideSidebar,
      orientation: "horizontal",
    },
    {
      id: "disable-linting",
      label: "Disable linting",
      checked: disableLinting,
      onToggle: setDisableLinting,
    },
    {
      id: "word-wrap",
      label: "Word wrap",
      checked: wordWrapEnabled,
      onToggle: setWordWrapEnabled,
    },
    {
      id: "smooth-typing",
      label: "Smooth typing",
      checked: smoothTypingEnabled,
      onToggle: setSmoothTypingEnabled,
    },
    {
      id: "use-hubble",
      label: "Use Hubble",
      checked: useHubble,
      onToggle: (value) => { void setUseHubble(value); },
      description: "Hubble is a local model trained by Celestial to improve script search results. Searches may take longer.",
    },
    {
      id: "disable-history",
      label: "Disable history",
      checked: disableHistory,
      onToggle: (value) => { void setDisableHistory(value); },
      description: "This will delete your existing history and hide the button.",
    },
    {
      id: "disable-indent-guides",
      label: "Disable indent guides",
      checked: disableIndentGuides,
      onToggle: setDisableIndentGuides,
      description: "Enable this if you're working with large scripts to prevent lag.",
    },
    {
      id: "prevent-updates",
      label: "Prevent updates",
      checked: preventUpdates,
      onToggle: setPreventUpdates,
      description: "Enable this if you're scared of me adding something malicious to Celestial in future updates.",
    },
    {
      id: "show-raw-logs",
      label: "Show raw console logs",
      checked: showRawLogs,
      onToggle: setShowRawLogs,
      description: "Console logs are filtered to only show useful information, turning this on will remove the filter.",
    },
    {
      id: "auto-watch-logs",
      label: "Automatically watch logs",
      checked: autoWatchLogs,
      onToggle: setAutoWatchLogs,
      description: "Automatically start watching console logs when the app starts.",
    },
    {
      id: "unlock-fps",
      label: "Unlock FPS",
      checked: unlockFps,
      onToggle: setUnlockFps,
      description: "You will need to adjust the \"Maximum Frame Rate\" in Roblox for this to work. Restart Roblox to apply.",
    },
  ];

  const customizationRows: ToggleSettingRowProps[] = [
    {
      id: "explorer-on-the-left",
      label: "Explorer on the left",
      checked: explorerOnLeft,
      onToggle: setExplorerOnLeft,
    },
    {
      id: "accounts-panel-on-the-right",
      label: "Account panel on the right",
      checked: !accountsPanelOnLeft,
      onToggle: (value) => setAccountsPanelOnLeft(!value),
    },
    {
      id: "sidebar-on-the-right",
      label: "Sidebar on the right",
      checked: sidebarOnRight,
      onToggle: setSidebarOnRight,
    },
    {
      id: "tight-spacing",
      label: "Tight Spacing",
      checked: tightSpacing,
      onToggle: setTightSpacing,
    },
  ];

  const menuRows: ToggleSettingRowProps[] = [
    {
      id: "disable-tray-icon",
      label: "Disable tray icon",
      checked: disableTrayIcon,
      onToggle: setDisableTrayIcon,
    },
    {
      id: "hide-tray-folder",
      label: "Hide tray folder",
      checked: hideTrayFolder,
      onToggle: setHideTrayFolder,
    },
  ];

  return (
    <div className={cn(styles.main, styles["main-no-top-padding"])}>
      <div className={cn(styles.group, styles["group-spaced"])}>
        <Label htmlFor="app-title-input">App Title</Label>
        <Input
          id="app-title-input"
          type="text"
          value={appTitle}
          onChange={(event) => setAppTitle(event.target.value)}
          placeholder="Celestial UI"
        />
      </div>

      <SelectSettingRow
        id="executor-select"
        label="Executor"
        value={executor}
        onChange={setExecutor}
        options={EXECUTOR_OPTIONS}
        placeholder="Select executor..."
      />

      {topRows.map((row) => (
        <ToggleSettingRow key={row.id} {...row} />
      ))}

      <SectionDivider />
      <SectionHead title="Customization" />

      {customizationRows.map((row) => (
        <ToggleSettingRow key={row.id} {...row} />
      ))}

      <ToggleSettingRow
        id="add-king-von"
        label="Add King Von"
        checked={addKingVon}
        onToggle={setAddKingVon}
      />

      <SelectSettingRow
        id="theme-select"
        label="Theme"
        value={currentTheme}
        onChange={setTheme}
        options={themeOptions}
        placeholder="Select theme..."
      />

      <SelectSettingRow
        id="ui-font-select"
        label="UI Font"
        value={UIFontFamily}
        onChange={setUiFontFamily}
        options={UI_FONT_OPTIONS}
        placeholder="Select UI font..."
      />

      <SelectSettingRow
        id="code-font-select"
        label="Code Font"
        value={editorFontFamily}
        onChange={setEditorFontFamily}
        options={CODE_FONT_OPTIONS}
        placeholder="Select code font..."
      />

      <SliderSettingRow
        id="ui-font-size"
        label="UI Font Size"
        value={UIFontSize}
        onChange={setUiFontSize}
        min={10}
        max={22}
        step={2}
      />

      <SliderSettingRow
        id="code-font-size"
        label="Code Font Size"
        value={editorFontSize}
        onChange={setEditorFontSize}
        min={9.5}
        max={17.5}
        step={2}
      />

      <SectionDivider />
      <SectionHead title="Menu Bar" />

      {menuRows.map((row) => (
        <ToggleSettingRow key={row.id} {...row} />
      ))}

      <SectionDivider />
      <SectionHead title="Keyboard Shortcuts" />

      <div className={cn(styles.group, styles["group-spaced"], styles["keybind-group"])}>
        {KEYBIND_ROWS.map((row) => (
          <div key={row.actionId} className={styles["keybind-row"]}>
            <span className={styles["keybind-label"]}>{row.label}</span>
            <KeybindCapture
              actionId={row.actionId}
              combo={keybinds[row.actionId]}
              isActive={isActive}
              onChange={handleKeybindChange}
            />
          </div>
        ))}

        <div className={styles["keybind-row"]}>
          <span className={styles["keybind-label"]}>Switch Files</span>
          <button
            type="button"
            className={styles["key-static"]}
            onClick={() => toast("No, you can't change these.", { duration: 2000 })}
          >
            {switchFilesDisplay}
          </button>
        </div>

        <div className={styles["keybind-row"]}>
          <span className={styles["keybind-label"]}>Switch Pages</span>
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
