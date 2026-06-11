"use client";

import { FilePlus, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { useChapters } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { useWorkspace } from "./workspace-context";

export function ChapterRail() {
  const { projectId, activeChapterId, loadChapter } = useWorkspace();
  const { data: chapters, isLoading } = useChapters(projectId);

  async function openChapter(id: number) {
    try {
      const ch = await api.getChapter(id);
      loadChapter(ch.id, ch.title, ch.content);
    } catch {
      /* toast handled elsewhere; keep rail resilient */
    }
  }

  function newChapter() {
    const n = (chapters?.length ?? 0) + 1;
    loadChapter(null, `第${n}章`, "");
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b p-4">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          章节
        </span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={newChapter}>
          <FilePlus className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1 soft-scroll">
        <div className="space-y-1 p-2">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))
          ) : !chapters || chapters.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              还没有章节，点上方 + 开始写第一章。
            </p>
          ) : (
            chapters.map((ch) => (
              <button
                key={ch.id}
                onClick={() => openChapter(ch.id)}
                className={cn(
                  "flex w-full items-start gap-2 rounded-lg px-3 py-2.5 text-left transition-colors",
                  activeChapterId === ch.id
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-muted"
                )}
              >
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {ch.title}
                  </span>
                  <span className="text-xs text-muted-foreground">v{ch.version}</span>
                </span>
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
