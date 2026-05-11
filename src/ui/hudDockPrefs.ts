export type HudDockId = "toolbar" | "left" | "right";

const key = (id: HudDockId) => `3dsp.hud.${id}`;

export function loadHudDockExpanded(id: HudDockId, defaultExpanded = true): boolean {
  try {
    const v = localStorage.getItem(key(id));
    if (v === "0") return false;
    if (v === "1") return true;
  } catch {
    /* storage unavailable */
  }
  return defaultExpanded;
}

export function saveHudDockExpanded(id: HudDockId, expanded: boolean): void {
  try {
    localStorage.setItem(key(id), expanded ? "1" : "0");
  } catch {
    /* ignore */
  }
}
