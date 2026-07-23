"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft, Network, PanelLeft } from "lucide-react";

import { ThemePicker } from "@/components/theme-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useProject } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { AssistantDock } from "./assistant-dock";
import { ChapterRail } from "./chapter-rail";
import { DailyCheckin } from "./daily-checkin";
import { getDockTab } from "./dock-tabs";
import { EditorPane } from "./editor-pane";
import { useWorkspace } from "./workspace-context";

const PANEL_FULLSCREEN_MIN_WIDTH = 640;
const PANEL_FULLSCREEN_MAX_GAP = 24;

function getPanelFullscreenMaxWidth() {
  return Math.max(PANEL_FULLSCREEN_MIN_WIDTH, window.innerWidth - PANEL_FULLSCREEN_MAX_GAP);
}

function getPanelFullscreenMinWidth() {
  return Math.min(PANEL_FULLSCREEN_MIN_WIDTH, getPanelFullscreenMaxWidth());
}

function clampPanelFullscreenWidth(width: number) {
  return Math.max(getPanelFullscreenMinWidth(), Math.min(width, getPanelFullscreenMaxWidth()));
}

export function WorkspaceShell() {
  const { projectId, fullscreenTab, setFullscreenTab } = useWorkspace();
  const { data: project, isLoading } = useProject(projectId);
  const [railOpen, setRailOpen] = React.useState(true);
  const [panelFullscreenWidth, setPanelFullscreenWidth] = React.useState<number | null>(null);
  const fullscreenOpen = fullscreenTab !== null;
  const fullscreenEntry = getDockTab(fullscreenTab);
  const FullscreenPanel = fullscreenEntry?.Panel;

  const startPanelFullscreenResize = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const handle = event.currentTarget;
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const dialog = handle.closest("[data-panel-fullscreen-dialog]") as HTMLElement | null;
    const startWidth = dialog?.getBoundingClientRect().width ?? panelFullscreenWidth ?? getPanelFullscreenMaxWidth();
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";

    function onPointerMove(moveEvent: PointerEvent) {
      setPanelFullscreenWidth(clampPanelFullscreenWidth(startWidth + startX - moveEvent.clientX));
    }

    function stopResize() {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
      if (handle.hasPointerCapture(pointerId)) {
        handle.releasePointerCapture(pointerId);
      }
    }

    if (handle.hasPointerCapture(pointerId)) {
      handle.releasePointerCapture(pointerId);
    }
    handle.setPointerCapture(pointerId);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
  }, [panelFullscreenWidth]);

  React.useEffect(() => {
    if (!fullscreenOpen || panelFullscreenWidth === null) return;

    function onResize() {
      setPanelFullscreenWidth((width) => (width === null ? width : clampPanelFullscreenWidth(width)));
    }

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [fullscreenOpen, panelFullscreenWidth]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* 顶栏 */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/" aria-label="返回书架">
              <ChevronLeft className="h-4 w-4" />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setRailOpen((o) => !o)}
            aria-label="切换章节栏"
          >
            <PanelLeft className="h-4 w-4" />
          </Button>
          {isLoading ? (
            <Skeleton className="h-5 w-32" />
          ) : (
            <h1 className="display-title text-lg">{project?.name ?? "作品"}</h1>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 border-teal-200 bg-teal-50 px-2.5 text-teal-800 hover:border-teal-300 hover:bg-teal-100 hover:text-teal-950"
            asChild
          >
            <Link href={`/projects/${projectId}/inspiration`} aria-label="打开灵感画板">
              <Network className="size-3.5" />
              <span>灵感</span>
              <span className="hidden text-[11px] text-teal-600 sm:inline">画板</span>
            </Link>
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <DailyCheckin projectId={projectId} />
          <ThemePicker />
        </div>
      </header>

      {/* 三栏 */}
      <div className="flex flex-1 overflow-hidden">
        <aside
          className={cn(
            "shrink-0 overflow-hidden border-r transition-all duration-300",
            railOpen ? "w-60" : "w-0"
          )}
        >
          <div className="h-full w-60">
            <ChapterRail />
          </div>
        </aside>

        <main className="flex-1 overflow-hidden">
          <EditorPane />
        </main>

        <aside className="hidden w-[26rem] shrink-0 border-l lg:block">
          <AssistantDock />
        </aside>
      </div>

      <Dialog open={fullscreenOpen} onOpenChange={(open) => !open && setFullscreenTab(null)}>
        <DialogContent
          data-panel-fullscreen-dialog
          className="fixed left-auto right-0 top-0 h-screen w-[96vw] max-w-none translate-x-0 translate-y-0 rounded-none border-l p-0 sm:rounded-none md:w-[88vw] lg:w-[82vw]"
          style={panelFullscreenWidth === null ? undefined : { width: `${panelFullscreenWidth}px` }}
        >
          <div
            data-panel-resize-handle
            role="separator"
            aria-orientation="vertical"
            aria-label="从左边缘拖拽调整面板宽度"
            className="group absolute inset-y-16 left-0 z-20 w-6 cursor-ew-resize touch-none"
            onPointerDown={startPanelFullscreenResize}
            onDoubleClick={() => setPanelFullscreenWidth(null)}
          >
            <div className="absolute left-0 top-0 h-full w-1 bg-border transition-colors group-hover:bg-primary group-active:bg-primary" />
            <div className="absolute left-1 top-1/2 h-12 w-2 -translate-y-1/2 rounded-full bg-border/80 transition-colors group-hover:bg-primary group-active:bg-primary" />
          </div>
          <div className="flex h-full min-h-0 flex-col pl-5">
            <DialogHeader className="border-b px-6 py-4 pr-12 text-left">
              <DialogTitle>{fullscreenEntry?.label ?? "面板"}</DialogTitle>
              <DialogDescription>
                {fullscreenTab === "chat"
                  ? "围绕当前章节、选中文字和正文内容进行讨论。"
                  : `全屏展开「${fullscreenEntry?.label ?? ""}」，空间更充裕。可从左边缘拖拽调整宽度。`}
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1">
              {FullscreenPanel ? (
                fullscreenTab === "chat" ? (
                  <FullscreenPanel fullscreen />
                ) : (
                  <ScrollArea className="h-full soft-scroll">
                    <div className="mx-auto max-w-3xl px-6 py-5">
                      <FullscreenPanel />
                    </div>
                  </ScrollArea>
                )
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
