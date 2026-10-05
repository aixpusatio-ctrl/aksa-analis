import { useCallback, useEffect, useState } from "react";
import type { ThemeMode } from "@shared/types.ts";

const STORAGE_KEY = "scraper.theme";

function readStoredTheme(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    /* private browsing / blocked storage */
  }
  return "system";
}

function apply(mode: ThemeMode): void {
  const dark = mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

/**
 * Theme state, persisted locally so the inline script in `index.html` can
 * apply it before first paint.
 */
export function useTheme(): { theme: ThemeMode; setTheme: (mode: ThemeMode) => void; isDark: boolean } {
  const [theme, setThemeState] = useState<ThemeMode>(readStoredTheme);
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains("dark"));

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
    apply(mode);
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  useEffect(() => {
    apply(theme);
    setIsDark(document.documentElement.classList.contains("dark"));

    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      apply("system");
      setIsDark(media.matches);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  return { theme, setTheme, isDark };
}
