import { ACCENT_PRESETS, hexToRgb } from "./catalog";
import type { AppearanceSettings } from "./types";

export function applyAppearance(a: AppearanceSettings) {
  const root = document.documentElement;
  let theme = a.theme;
  if (theme === "system") {
    theme = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  root.dataset.theme = theme;
  root.dataset.sidebar = a.sidebar === "hidden" ? "hidden" : "auto";
  const hex = a.accent === "custom" ? a.customHex : ACCENT_PRESETS.find((p) => p.id === a.accent)?.hex ?? "#3b82f6";
  try {
    root.style.setProperty("--frost-accent", hexToRgb(hex));
  } catch {
    root.style.setProperty("--frost-accent", "59 130 246");
  }
}
