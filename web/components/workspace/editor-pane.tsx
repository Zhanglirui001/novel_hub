"use client";

import * as React from "react";
import { HardDriveDownload, Save } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBackupChapter, useBackupStatus } from "@/lib/queries";
import { cn, countChars } from "@/lib/utils";
import { ContinueGhostPanel } from "./continue-ghost-panel";
import { InlineDiffCard } from "./inline-diff-card";
import { InlineReviseOverlay } from "./inline-revise-overlay";
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
  dirty: "text-warning",
  saving: "text-muted-foreground",
  saved: "text-success",
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
    setSelection,
    registerEditor,
    reviseTarget,
    activeCandidateId,
    ghostAnchor,
    ghostStreaming,
    ghostLiveText,
    ghostCandidates,
    activeGhostId,
    acceptGhost,
    cancelGhost,
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
  // 预览模式：有目标 + 有 active 候选时，正文以「原地 diff」呈现，textarea 暂时让位。
  const previewing = !!reviseTarget && activeCandidateId != null;
  // 续写幽灵预览：光标处内联流式渲染，textarea 让位给只读正文。
  const ghosting = ghostAnchor !== null;
  const activeGhost = ghostCandidates.find((c) => c.id === activeGhostId) ?? null;
  const ghostText = ghostStreaming ? ghostLiveText : activeGhost?.text ?? "";

  // 续写态下的键盘落笔：Tab 采纳、Esc 放弃。
  React.useEffect(() => {
    if (!ghosting) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        cancelGhost();
      } else if (e.key === "Tab") {
        if (ghostStreaming || !activeGhost) return;
        e.preventDefault();
        acceptGhost();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [ghosting, ghostStreaming, activeGhost, acceptGhost, cancelGhost]);

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
          {ghosting ? (
            // 续写幽灵预览：光标前后为只读正文，光标处内联流式「幽灵文本」。
            <div className="prose-editor min-h-[60vh] w-full whitespace-pre-wrap break-words">
              <span className="text-foreground/80">{draft.slice(0, ghostAnchor ?? 0)}</span>
              {ghostText ? (
                <span className="italic text-primary/80">
                  {ghostText}
                  {ghostStreaming && <span className="ml-0.5 animate-pulse">▍</span>}
                </span>
              ) : (
                ghostStreaming && (
                  <span className="italic text-muted-foreground/60">构思中…</span>
                )
              )}
              <span className="text-foreground/80">{draft.slice(ghostAnchor ?? 0)}</span>
            </div>
          ) : previewing && reviseTarget ? (
            // 原地预览：前后文只读，中间嵌入 diff 卡。
            <div className="prose-editor min-h-[60vh] w-full whitespace-pre-wrap break-words">
              <span className="text-foreground/75">
                {draft.slice(0, reviseTarget.start)}
              </span>
              <InlineDiffCard />
              <span className="text-foreground/75">
                {draft.slice(reviseTarget.end)}
              </span>
            </div>
          ) : (
            <textarea
              ref={setRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onSelect={syncSelection}
              onMouseUp={syncSelection}
              onKeyUp={syncSelection}
              onBlur={() => {
                // 不在 blur 时清空选区——用户点击浮层/右栏按钮时 textarea 会失焦，
                // 选区信息仍要保留供浮层与版本面板使用。
              }}
              placeholder="在此落笔。写下正文，然后选中段落让 AI 分析、批注、就地修改。"
              className="prose-editor min-h-[60vh] w-full resize-none border-0 bg-transparent outline-none placeholder:text-muted-foreground/50"
              spellCheck={false}
            />
          )}
        </div>

        {/* 选中文字时浮出的内联批注/分析浮层（预览/续写态下隐藏） */}
        {!previewing && !ghosting && <InlineReviseOverlay />}
        {/* 续写：意图条 + 幽灵预览 HUD + 落笔控制（预览态下隐藏） */}
        {!previewing && <ContinueGhostPanel />}
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
