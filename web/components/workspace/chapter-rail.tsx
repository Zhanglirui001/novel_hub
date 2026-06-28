"use client";

import { FilePlus, FileText, Pencil, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import {
  useChapters,
  useDeleteChapter,
  useRenameChapter,
} from "@/lib/queries";
import { cn } from "@/lib/utils";
import type { ChapterSummary } from "@/lib/types";
import { useWorkspace } from "./workspace-context";

export function ChapterRail() {
  const { projectId, activeChapterId, loadChapter } = useWorkspace();
  const { data: chapters, isLoading } = useChapters(projectId);
  const queryClient = useQueryClient();
  const renameChapter = useRenameChapter(projectId);
  const deleteChapter = useDeleteChapter(projectId);

  async function openChapter(id: number) {
    try {
      const ch = await api.getChapter(id);
      loadChapter(ch.id, ch.title, ch.content);
    } catch {
      /* toast handled elsewhere; keep rail resilient */
    }
  }

  async function newChapter() {
    // 在已有标题集合外找一个最小的「第N章」,避免 PUT /chapters 走到「按 title 上插」
    // 时撞到旧章导致覆盖而非新增。
    const titles = new Set((chapters ?? []).map((c) => c.title));
    let n = (chapters?.length ?? 0) + 1;
    while (titles.has(`第${n}章`)) n += 1;
    const title = `第${n}章`;

    try {
      const res = await api.saveChapter({
        project_id: projectId,
        title,
        content: "",
        chapter_id: null,
      });
      // 直接把新章插进 react-query 缓存,避免再发一次 GET /chapters 等待 refetch。
      queryClient.setQueryData<ChapterSummary[]>(
        ["chapters", projectId],
        (prev) => [
          ...(prev ?? []),
          {
            id: res.chapter_id,
            title,
            version: res.version,
            updated_at: res.updated_at,
          },
        ],
      );
      loadChapter(res.chapter_id, title, "");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "新增章节失败");
    }
  }

  async function handleRename(ch: ChapterSummary) {
    const next = window.prompt("重命名章节", ch.title);
    if (next === null) return;
    const title = next.trim();
    if (!title || title === ch.title) return;

    // 乐观更新:先改本地缓存,失败再回滚。
    const prev = queryClient.getQueryData<ChapterSummary[]>([
      "chapters",
      projectId,
    ]);
    queryClient.setQueryData<ChapterSummary[]>(["chapters", projectId], (cur) =>
      (cur ?? []).map((c) => (c.id === ch.id ? { ...c, title } : c)),
    );
    try {
      await renameChapter.mutateAsync({ chapterId: ch.id, title });
      // 当前打开的就是这章,把编辑器标题也同步上(loadChapter 会触发 dirty,
      // 这里只走表层 setState 比较安全:重新加载这一章的最新内容即可)。
      if (activeChapterId === ch.id) {
        const fresh = await api.getChapter(ch.id);
        loadChapter(fresh.id, fresh.title, fresh.content);
      }
    } catch (err) {
      queryClient.setQueryData(["chapters", projectId], prev);
      toast.error(err instanceof Error ? err.message : "重命名失败");
    }
  }

  async function handleDelete(ch: ChapterSummary) {
    if (!window.confirm(`删除《${ch.title}》?此操作不可撤销。`)) return;

    const prev = queryClient.getQueryData<ChapterSummary[]>([
      "chapters",
      projectId,
    ]);
    queryClient.setQueryData<ChapterSummary[]>(["chapters", projectId], (cur) =>
      (cur ?? []).filter((c) => c.id !== ch.id),
    );
    try {
      await deleteChapter.mutateAsync(ch.id);
      // 删的就是当前打开的章节,把编辑器清回新建草稿态。
      if (activeChapterId === ch.id) {
        loadChapter(null, "第1章", "");
      }
    } catch (err) {
      queryClient.setQueryData(["chapters", projectId], prev);
      toast.error(err instanceof Error ? err.message : "删除失败");
    }
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
              <ChapterRow
                key={ch.id}
                ch={ch}
                active={activeChapterId === ch.id}
                onOpen={() => openChapter(ch.id)}
                onRename={() => handleRename(ch)}
                onDelete={() => handleDelete(ch)}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function ChapterRow({
  ch,
  active,
  onOpen,
  onRename,
  onDelete,
}: {
  ch: ChapterSummary;
  active: boolean;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "group relative flex w-full items-start gap-2 rounded-lg pl-3 pr-2 py-2.5 transition-colors",
        active ? "bg-accent text-accent-foreground" : "hover:bg-muted",
      )}
    >
      <button
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-start gap-2 text-left"
      >
        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{ch.title}</span>
          <span className="text-xs text-muted-foreground">v{ch.version}</span>
        </span>
      </button>

      {/* hover/active 时浮现的操作按钮。空间紧凑,用 7×7 ghost button。 */}
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={(e) => {
            e.stopPropagation();
            onRename();
          }}
          title="重命名"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="删除"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
