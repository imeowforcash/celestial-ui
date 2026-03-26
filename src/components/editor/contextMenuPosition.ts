export const CONTEXT_MENU_VIEWPORT_PADDING = 8;

export function getContextPos(
  x: number,
  y: number,
  width: number,
  height: number,
) {
  return {
    left: Math.max(
      CONTEXT_MENU_VIEWPORT_PADDING,
      Math.min(
        x,
        window.innerWidth - width - CONTEXT_MENU_VIEWPORT_PADDING,
      ),
    ),
    top: Math.max(
      CONTEXT_MENU_VIEWPORT_PADDING,
      Math.min(
        y,
        window.innerHeight - height - CONTEXT_MENU_VIEWPORT_PADDING,
      ),
    ),
  };
}
