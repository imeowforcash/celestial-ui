const SIDE_PANEL_EASE: [number, number, number, number] = [0.32, 0.72, 0, 1];
const SIDE_PANEL_WIDTH_DURATION = 0.4;
const SIDE_PANEL_SLIDE_DURATION = 0.6;
export const SIDE_PANEL_SWITCH_DELAY_MS = (SIDE_PANEL_WIDTH_DURATION + SIDE_PANEL_SLIDE_DURATION) * 1000;

const SIDE_PANEL_CONTAINER_MOTION = {
  initial: { width: 0 },
  animate: {
    width: "auto",
    transition: { duration: SIDE_PANEL_WIDTH_DURATION, ease: SIDE_PANEL_EASE },
  },
  exit: {
    width: 0,
    transition: {
      duration: SIDE_PANEL_WIDTH_DURATION,
      ease: SIDE_PANEL_EASE,
      delay: SIDE_PANEL_SLIDE_DURATION,
    },
  },
};

const SIDE_PANEL_CONTAINER_INSTANT_MOTION = {
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

const SIDE_PANEL_CONTENT_MOTION = {
  initial: { y: "calc(100% + 15px)" },
  animate: {
    y: 0,
    transition: {
      duration: SIDE_PANEL_SLIDE_DURATION,
      ease: SIDE_PANEL_EASE,
      delay: SIDE_PANEL_WIDTH_DURATION,
    },
  },
  exit: {
    y: "calc(100% + 15px)",
    transition: { duration: SIDE_PANEL_SLIDE_DURATION, ease: SIDE_PANEL_EASE },
  },
};

const SIDE_PANEL_CONTENT_INSTANT_MOTION = {
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

export const getSidePanelContainerMotion = (animateVisibilityTransitions: boolean) =>
  animateVisibilityTransitions ? SIDE_PANEL_CONTAINER_MOTION : SIDE_PANEL_CONTAINER_INSTANT_MOTION;

export const getSidePanelContentMotion = (animateVisibilityTransitions: boolean) =>
  animateVisibilityTransitions ? SIDE_PANEL_CONTENT_MOTION : SIDE_PANEL_CONTENT_INSTANT_MOTION;
