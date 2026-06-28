"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Save, Sparkles, HardDriveDownload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBackupChapter, useBackupStatus } from "@/lib/queries";
import { countChars, cn } from "@/lib/utils";
import { useWorkspace } from "./workspace-context";

const STATUS_LABEL: Record<string, string> = {
  idle: "未保存草稿",
  dirty: "未保存修改",
  saving: "保存中…",
  saved: "已保存",
  error: "保存失败",
};

const STATUS_TONE: Record<string, string> = {
  idle: "text-muted-foreground",
  dirty: "text-amber-600 dark:text-amber-400",
  saving: "text-muted-foreground",
  saved: "text-emerald-600 dark:text-emerald-400",
  error: "text-destructive",
};

export function EditorPane() {
  const {
    draft,
    setDraft,
    chapterTitle,
    setChapterTitle,
    activeChapterId,
    saveStatus,
    lastSavedAt,
    autosaveEnabled,
    setAutosaveEnabled,
    saveNow,
    selection,
    setSelection,
    registerEditor,
    setDockTab,
  } = useWorkspace();

  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  const queryClient = useQueryClient();
  const backupStatus = useBackupStatus(activeChapterId);
  const backupMutation = useBackupChapter();

  // 章节有保存动作 → 备份状态可能变 stale,主动重拉一次。
  React.useEffect(() => {
    if (saveStatus === "saved" && activeChapterId !== null) {
      queryClient.invalidateQueries({
        queryKey: ["backup-status", activeChapterId],
      });
    }
  }, [saveStatus, activeChapterId, queryClient]);

  async function handleBackup() {
    if (activeChapterId === null) {
      toast.error("当前章节尚未保存到数据库,无法备份");
      return;
    }
    try {
      await backupMutation.mutateAsync(activeChapterId);
      toast.success("已备份到本地 .txt");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "备份失败");
    }
  }

  const setRef = React.useCallback(
    (el: HTMLTextAreaElement | null) => {
      textareaRef.current = el;
      registerEditor(el);
    },
    [registerEditor],
  );

  const syncSelection = React.useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    if (end > start) {
      setSelection({ start, end, text: el.value.slice(start, end) });
    } else {
      setSelection(null);
    }
  }, [setSelection]);

  const canSave = saveStatus === "dirty" || saveStatus === "error";
  const hasSelection = !!selection && selection.text.trim().length > 0;

  const openInlineRevise = React.useCallback(() => {
    if (!hasSelection) return;
    setDockTab("revise");
  }, [hasSelection, setDockTab]);

  return (
    <div className="flex h-full flex-col">
      {/* 标题 + 保存控件 */}
      <div className="flex items-center gap-3 border-b px-8 py-5">
        <Input
          value={chapterTitle}
          onChange={(e) => setChapterTitle(e.target.value)}
          placeholder="章节标题"
          className="display-title h-auto flex-1 border-0 bg-transparent px-0 text-2xl shadow-none focus-visible:ring-0"
        />
        <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={autosaveEnabled}
            onChange={(e) => setAutosaveEnabled(e.target.checked)}
            className="h-3.5 w-3.5 cursor-pointer accent-primary"
          />
          自动保存
        </label>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void saveNow()}
          disabled={!canSave}
          title="保存（Ctrl/Cmd+S）"
        >
          <Save className="h-4 w-4" />
          保存
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleBackup}
          disabled={
            activeChapterId === null ||
            backupMutation.isPending ||
            backupStatus.data?.status === "up_to_date"
          }
          title={backupTitle(backupStatus.data?.status)}
        >
          <HardDriveDownload className="h-4 w-4" />
          {backupMutation.isPending ? "备份中…" : "备份"}
        </Button>
      </div>

      {/* 正文：限定阅读栏宽，杂志沉浸感 */}
      <div className="relative flex-1 overflow-y-auto soft-scroll">
        <div className="mx-auto max-w-2xl px-8 py-8">
          <textarea
            ref={setRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onSelect={syncSelection}
            onMouseUp={syncSelection}
            onKeyUp={syncSelection}
            onBlur={() => {
              // 不在 blur 时清空选区——用户点击右栏按钮时 textarea 会失焦,
              // 选区信息仍要保留供 InlineRevisePanel 使用。
            }}
            placeholder="在此落笔。写下正文，然后在右侧让 AI 续写、润色，并守护设定一致性。"
            className="prose-editor min-h-[60vh] w-full resize-none border-0 bg-transparent outline-none placeholder:text-muted-foreground/50"
            spellCheck={false}
          />
        </div>

        {/* 选中文字时浮出的「AI 分析」入口 */}
        {hasSelection && (
          <div className="pointer-events-none sticky bottom-4 flex justify-center">
            <Button
              size="sm"
              onClick={openInlineRevise}
              className="pointer-events-auto shadow-lg"
              title="对选中文字进行 AI 分析与批注修改"
            >
              <Sparkles className="h-4 w-4" />
              AI 分析选段（{countChars(selection!.text)} 字）
            </Button>
          </div>
        )}
      </div>

      {/* 状态条 */}
      <div className="flex items-center justify-between border-t px-8 py-2.5 text-xs text-muted-foreground">
        <span>{countChars(draft)} 字</span>
        <span className="flex items-center gap-3">
          <span className={STATUS_TONE[saveStatus]}>{STATUS_LABEL[saveStatus]}</span>
          {lastSavedAt && saveStatus === "saved" && (
            <span className="text-muted-foreground/70">{lastSavedAt}</span>
          )}
          {activeChapterId !== null && backupStatus.data && (
            <BackupBadge
              status={backupStatus.data.status}
              backedUpAt={backupStatus.data.backed_up_at ?? null}
            />
          )}
          <span className="max-w-[12rem] truncate" title={chapterTitle}>
            {activeChapterId ? chapterTitle : "新章节"}
          </span>
        </span>
      </div>
    </div>
  );
}

const BACKUP_BADGE_TONE: Record<string, string> = {
  not_backed_up: "text-muted-foreground bg-muted/40",
  up_to_date: "text-emerald-700 bg-emerald-500/10 dark:text-emerald-400",
  stale: "text-amber-700 bg-amber-500/15 dark:text-amber-400",
};

const BACKUP_BADGE_LABEL: Record<string, string> = {
  not_backed_up: "未备份",
  up_to_date: "已备份",
  stale: "待重新备份",
};

function BackupBadge({
  status,
  backedUpAt,
}: {
  status: string;
  backedUpAt: string | null;
}) {
  const label = BACKUP_BADGE_LABEL[status] ?? status;
  const title = backedUpAt ? `上次备份 ${backedUpAt}` : "尚未备份过这一章";
  return (
    <span
      title={title}
      className={cn(
        "rounded-full px-2 py-0.5 text-[0.7rem] font-medium",
        BACKUP_BADGE_TONE[status],
      )}
    >
      {label}
    </span>
  );
}

function backupTitle(status: string | undefined) {
  if (status === "up_to_date") return "已备份且与当前内容一致";
  if (status === "stale") return "章节已更新,点击重新备份";
  if (status === "not_backed_up") return "尚未备份,点击生成 .txt";
  return "备份当前章节到 .txt";
}
