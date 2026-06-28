"use client";

import * as React from "react";
import {
  Check,
  Moon,
  Sun,
  BookOpen,
  Leaf,
  Stars,
  Palette,
} from "lucide-react";
import { type Theme, useTheme } from "@/components/theme-provider";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ThemeOption = {
  value: Theme;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  /** 主题预览色：背景 / 主色，用于色板小圆点 */
  swatch: { bg: string; fg: string };
};

// 新增主题时：在此登记，并同步 globals.css 的 class 与 providers.tsx 的 themes 列表。
const THEMES: ThemeOption[] = [
  {
    value: "light",
    label: "明亮",
    hint: "近纯白 · 墨黑字",
    icon: Sun,
    swatch: { bg: "#FCFCFD", fg: "#4f46e5" },
  },
  {
    value: "dark",
    label: "暗黑",
    hint: "深石板 · 夜间",
    icon: Moon,
    swatch: { bg: "#16161a", fg: "#7c83ff" },
  },
  {
    value: "sepia",
    label: "纸张",
    hint: "暖米黄 · 久读护眼",
    icon: BookOpen,
    swatch: { bg: "#F1E9D8", fg: "#b35a2b" },
  },
  {
    value: "green",
    label: "绿豆沙",
    hint: "柔和绿 · 护眼",
    icon: Leaf,
    swatch: { bg: "#CCE8CF", fg: "#2f7a59" },
  },
  {
    value: "night",
    label: "夜蓝",
    hint: "深空蓝 · 低蓝光",
    icon: Stars,
    swatch: { bg: "#111A2B", fg: "#4aa3e0" },
  },
];

export function ThemePicker() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => setMounted(true), []);

  // 点击外部 / Esc 关闭
  React.useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const active = mounted
    ? THEMES.find((t) => t.value === theme) ?? THEMES[0]
    : undefined;
  const ActiveIcon = active?.icon ?? Palette;

  return (
    <div ref={rootRef} className="relative">
      <Button
        variant="ghost"
        size="icon"
        aria-label="选择主题"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <ActiveIcon className="h-[1.2rem] w-[1.2rem]" />
      </Button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md animate-fade-in"
        >
          <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
            阅读主题
          </p>
          {THEMES.map((t) => {
            const Icon = t.icon;
            const selected = mounted && theme === t.value;
            return (
              <button
                key={t.value}
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => {
                  setTheme(t.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors",
                  "hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground",
                  selected && "bg-accent/60"
                )}
              >
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border"
                  style={{ backgroundColor: t.swatch.bg }}
                  aria-hidden
                >
                  <Icon className="h-3 w-3" style={{ color: t.swatch.fg }} />
                </span>
                <span className="flex flex-col">
                  <span className="leading-tight">{t.label}</span>
                  <span className="text-xs leading-tight text-muted-foreground">
                    {t.hint}
                  </span>
                </span>
                {selected && (
                  <Check className="ml-auto h-4 w-4 shrink-0 text-primary" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
