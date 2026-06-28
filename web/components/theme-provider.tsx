"use client";

import * as React from "react";

const STORAGE_KEY = "theme";
const THEMES = ["light", "dark", "sepia", "green", "night"] as const;
export type Theme = (typeof THEMES)[number];

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  themes: readonly Theme[];
};

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

function isTheme(value: string | null): value is Theme {
  return THEMES.includes(value as Theme);
}

function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return isTheme(stored) ? stored : "light";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove(...THEMES);
  if (theme !== "light") root.classList.add(theme);
  root.style.colorScheme = theme === "dark" || theme === "night" ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>(getStoredTheme);

  React.useEffect(() => {
    applyTheme(theme);
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  React.useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY && isTheme(event.newValue)) {
        setThemeState(event.newValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value = React.useMemo<ThemeContextValue>(
    () => ({ theme, setTheme: setThemeState, themes: THEMES }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = React.useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
