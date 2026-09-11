"use client";

import * as React from "react";
import { Minus, PanelsTopLeft, Square, X } from "lucide-react";
import packageInfo from "../package.json";

const isDesktop = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function withWindow(action: "minimize" | "maximize" | "close") {
  if (!isDesktop()) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const current = getCurrentWindow();
  if (action === "minimize") await current.minimize();
  if (action === "maximize") await current.toggleMaximize();
  if (action === "close") await current.close();
}

export function DesktopTitlebar() {
  const [desktop, setDesktop] = React.useState(false);
  React.useEffect(() => setDesktop(isDesktop()), []);
  if (!desktop) return null;

  return (
    <div className="desktop-titlebar flex h-9 shrink-0 select-none items-center border-b bg-background/95">
      <div data-tauri-drag-region className="flex h-full min-w-0 flex-1 items-center gap-2 px-3">
        <span className="grid size-5 place-items-center rounded-md bg-primary text-primary-foreground"><PanelsTopLeft className="size-3" /></span>
        <span className="text-xs font-semibold tracking-wide">Novel Hub · v{packageInfo.version}</span>
        <span className="hidden text-[11px] text-muted-foreground sm:inline">本地 AI 创作工作台</span>
      </div>
      <div className="desktop-window-controls flex h-full items-stretch">
        <button className="w-11 hover:bg-muted" aria-label="最小化" onClick={() => void withWindow("minimize")}><Minus className="mx-auto size-3.5" /></button>
        <button className="w-11 hover:bg-muted" aria-label="最大化" onClick={() => void withWindow("maximize")}><Square className="mx-auto size-3" /></button>
        <button className="w-11 hover:bg-destructive hover:text-destructive-foreground" aria-label="关闭" onClick={() => void withWindow("close")}><X className="mx-auto size-3.5" /></button>
      </div>
    </div>
  );
}
