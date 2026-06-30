"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft, PanelLeft } from "lucide-react";

import { ThemePicker } from "@/components/theme-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useProject } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { AssistantDock } from "./assistant-dock";
import { ChapterRail } from "./chapter-rail";
import { ChatPanel } from "./chat-panel";
import { EditorPane } from "./editor-pane";
import { useWorkspace } from "./workspace-context";

export function WorkspaceShell() {
  const { projectId, chatFullscreenOpen, setChatFullscreenOpen } = useWorkspace();
  const { data: project, isLoading } = useProject(projectId);
  const [railOpen, setRailOpen] = React.useState(true);

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
        </div>
        <ThemePicker />
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

      <Dialog open={chatFullscreenOpen} onOpenChange={setChatFullscreenOpen}>
        <DialogContent className="fixed right-0 top-0 h-screen w-[96vw] max-w-none translate-x-0 translate-y-0 rounded-none border-l p-0 sm:rounded-none md:w-[88vw] lg:w-[82vw]">
          <div className="flex h-full min-h-0 flex-col">
            <DialogHeader className="border-b px-6 py-4 pr-12 text-left">
              <DialogTitle>AI 聊天</DialogTitle>
              <DialogDescription>
                围绕当前章节、选中文字和正文内容进行讨论。
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1">
              <ChatPanel fullscreen />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
