import React, { memo } from "react";
import { AnimatePresence, LazyMotion, domAnimation, m } from "motion/react";
import { getSidePanelContainerMotion, getSidePanelContentMotion } from "./sidePanelMotion";
import styles from "./EditorShared.module.css";

export interface HistoryPanelEntry {
  id: number;
  title: string;
  subtitle: string;
}

interface HistoryPanelProps {
  showHistoryPanel: boolean;
  animateVisibilityTransitions: boolean;
  panelWidth: number;
  entries: HistoryPanelEntry[];
  onOpenEntry: (id: number) => void;
  startPanelResizing: (e: React.MouseEvent) => void;
}

const HistoryPanel: React.FC<HistoryPanelProps> = memo(({
  showHistoryPanel,
  animateVisibilityTransitions,
  panelWidth,
  entries,
  onOpenEntry,
  startPanelResizing,
}) => {
  const containerMotion = getSidePanelContainerMotion(animateVisibilityTransitions);
  const panelMotion = getSidePanelContentMotion(animateVisibilityTransitions);

  return (
    <LazyMotion features={domAnimation}>
      <AnimatePresence initial={false}>
        {showHistoryPanel && (
          <m.div
            initial={containerMotion.initial}
            animate={containerMotion.animate}
            exit={containerMotion.exit}
            style={{ display: "flex", height: "100%", overflow: "visible" }}
          >
            <m.div
              className={styles.history}
              style={{ width: panelWidth, flexShrink: 0 }}
              initial={panelMotion.initial}
              animate={panelMotion.animate}
              exit={panelMotion.exit}
            >
              <div className={styles.list}>
                {entries.length === 0 ? (
                  <div className={styles.empty}>Empty</div>
                ) : (
                  entries.map((entry) => {
                    return (
                      <div
                        key={entry.id}
                        className={styles.entry}
                        onClick={() => onOpenEntry(entry.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onOpenEntry(entry.id);
                          }
                        }}
                      >
                        <div className={styles.info}>
                          <p className={styles.title}>{entry.title}</p>
                          <p className={styles.sub}>{entry.subtitle}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </m.div>
            <div
              className={styles["side-resize"]}
              onMouseDown={startPanelResizing}
              role="separator"
              aria-orientation="vertical"
            />
          </m.div>
        )}
      </AnimatePresence>
    </LazyMotion>
  );
});

HistoryPanel.displayName = "HistoryPanel";

export default HistoryPanel;
