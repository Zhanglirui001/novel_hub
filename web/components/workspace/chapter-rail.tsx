"use client";

import { FilePlus, FileText, FolderPlus, MoveRight, Pencil, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import {
  useChapters,
  useDeleteChapter,
  useMoveChapter,
  useRenameChapter,
} from "@/lib/queries";
import { cn } from "@/lib/utils";
import type { ChapterSummary } from "@/lib/types";
import { useWorkspace } from "./workspace-context";

const DEFAULT_GROUP_TITLE = "默认卷";

type ChapterGroup = {
  title: string;
  chapters: ChapterSummary[];
};

function normalizeGroupTitle(title?: string) {
  return title?.trim() || DEFAULT_GROUP_TITLE;
}

function groupChapters(chapters: ChapterSummary[] = []): ChapterGroup[] {
  const groups = new Map<string, ChapterSummary[]>();
  for (const chapter of chapters) {
    const title = normalizeGroupTitle(chapter.group_title);
    const list = groups.get(title) ?? [];
    list.push(chapter);
    groups.set(title, list);
  }
  return Array.from(groups, ([title, list]) => ({ title, chapters: list }));
}

export function ChapterRail() {
  const {
    projectId,
    activeChapterId,
    chapterGroupTitle,
    loadChapter,
  } = useWorkspace();
  const { data: chapters, isLoading } = useChapters(projectId);
  const queryClient = useQueryClient();
  const renameChapter = useRenameChapter(projectId);
  const moveChapter = useMoveChapter(projectId);
  const deleteChapter = useDeleteChapter(projectId);
  const groups = groupChapters(chapters);

  async function openChapter(id: number) {
    try {
      const ch = await api.getChapter(id);
      loadChapter(ch.id, ch.title, ch.content, ch.group_title);
    } catch {
      /* toast handled elsewhere; keep rail resilient */
    }
  }

  async function newChapter(groupTitle = preferredGroupTitle()) {
    // 在已有标题集合外找一个最小的「第N章」,避免 PUT /chapters 走到「按 title 上插」
    // 时撞到同卷旧章导致覆盖而非新增。
    const normalizedGroup = normalizeGroupTitle(groupTitle);
    const titles = new Set(
      (chapters ?? [])
        .filter((c) => normalizeGroupTitle(c.group_title) === normalizedGroup)
        .map((c) => c.title),
    );
    let n = (chapters?.length ?? 0) + 1;
    while (titles.has(`第${n}章`)) n += 1;
    const title = `第${n}章`;
    const sortOrder = Math.max(
      -1,
      ...(chapters ?? [])
        .filter((c) => normalizeGroupTitle(c.group_title) === normalizedGroup)
        .map((c) => c.sort_order),
    ) + 1;

    try {
      const res = await api.saveChapter({
        project_id: projectId,
        title,
        content: "",
        group_title: normalizedGroup,
        sort_order: sortOrder,
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
            group_title: normalizedGroup,
            sort_order: sortOrder,
            version: res.version,
            updated_at: res.updated_at,
          },
        ],
      );
      loadChapter(res.chapter_id, title, "", normalizedGroup);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "新增章节失败");
    }
  }

  function preferredGroupTitle() {
    const active = chapters?.find((ch) => ch.id === activeChapterId);
    return normalizeGroupTitle(active?.group_title ?? chapterGroupTitle ?? groups.at(-1)?.title);
  }

  async function newGroup() {
    const next = window.prompt("新建卷/分组", nextGroupTitle());
    if (next === null) return;
    const groupTitle = normalizeGroupTitle(next);
    await newChapter(groupTitle);
  }

  function nextGroupTitle() {
    return `第${groups.length + 1}卷`;
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
        loadChapter(fresh.id, fresh.title, fresh.content, fresh.group_title);
      }
    } catch (err) {
      queryClient.setQueryData(["chapters", projectId], prev);
      toast.error(err instanceof Error ? err.message : "重命名失败");
    }
  }

  async function handleMove(ch: ChapterSummary) {
    const next = window.prompt("移动到卷/分组", normalizeGroupTitle(ch.group_title));
    if (next === null) return;
    const groupTitle = normalizeGroupTitle(next);
    if (groupTitle === normalizeGroupTitle(ch.group_title)) return;

    const prev = queryClient.getQueryData<ChapterSummary[]>([
      "chapters",
      projectId,
    ]);
    const sortOrder = Math.max(
      -1,
      ...(prev ?? [])
        .filter((c) => normalizeGroupTitle(c.group_title) === groupTitle)
        .map((c) => c.sort_order),
    ) + 1;
    queryClient.setQueryData<ChapterSummary[]>(["chapters", projectId], (cur) =>
      (cur ?? []).map((c) =>
        c.id === ch.id ? { ...c, group_title: groupTitle, sort_order: sortOrder } : c,
      ),
    );
    try {
      await moveChapter.mutateAsync({ chapterId: ch.id, groupTitle, sortOrder });
      if (activeChapterId === ch.id) {
        const fresh = await api.getChapter(ch.id);
        loadChapter(fresh.id, fresh.title, fresh.content, fresh.group_title);
      }
    } catch (err) {
      queryClient.setQueryData(["chapters", projectId], prev);
      toast.error(err instanceof Error ? err.message : "移动章节失败");
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
        loadChapter(null, "第1章", "", preferredGroupTitle());
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
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={newGroup} title="新建卷/分组">
            <FolderPlus className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => newChapter()} title="新建章节">
            <FilePlus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 soft-scroll">
        <div className="space-y-1 p-1.5">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))
          ) : !chapters || chapters.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              还没有章节，点上方 + 开始写第一章。
            </p>
          ) : (
            groups.map((group) => (
              <section key={group.title} className="space-y-0">
                <div className="flex items-center justify-between px-2 py-0">
                  <span className="truncate text-xs font-medium text-muted-foreground">
                    {group.title}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-4 w-4 text-muted-foreground"
                    onClick={() => newChapter(group.title)}
                    title="在本卷新增章节"
                  >
                    <FilePlus className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {group.chapters.map((ch) => (
                  <ChapterRow
                    key={ch.id}
                    ch={ch}
                    active={activeChapterId === ch.id}
                    onOpen={() => openChapter(ch.id)}
                    onRename={() => handleRename(ch)}
                    onMove={() => handleMove(ch)}
                    onDelete={() => handleDelete(ch)}
                  />
                ))}
              </section>
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
  onMove,
  onDelete,
}: {
  ch: ChapterSummary;
  active: boolean;
  onOpen: () => void;
  onRename: () => void;
  onMove: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "group relative ml-3 flex w-[calc(100%-0.75rem)] items-center gap-1.5 rounded-md pl-2 pr-1.5 py-0.5 transition-colors",
        active ? "bg-accent text-accent-foreground" : "hover:bg-muted",
      )}
    >
      <button
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
      >
        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium leading-5">{ch.title}</span>
      </button>

      {/* hover/active 时浮现的操作按钮。空间紧凑,用 7×7 ghost button。 */}
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={(e) => {
            e.stopPropagation();
            onMove();
          }}
          title="移动到卷/分组"
        >
          <MoveRight className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
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
