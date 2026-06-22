"use client";

import * as React from "react";
import { Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { countChars } from "@/lib/utils";
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
  } = useWorkspace();

  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

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
      </div>

      {/* 正文：限定阅读栏宽，杂志沉浸感 */}
      <div className="relative flex-1 overflow-y-auto soft-scroll">
        <div className="mx-auto max-w-2xl px-8 py-8">
          {previewing && reviseTarget ? (
            // 原地预览：前后文只读，中间嵌入 diff 卡。
            <div className="prose-editor min-h-[60vh] w-full whitespace-pre-wrap break-words">
              <span className="text-foreground/60">
                {draft.slice(0, reviseTarget.start)}
              </span>
              <InlineDiffCard />
              <span className="text-foreground/60">
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

        {/* 选中文字时浮出的内联批注/分析浮层（预览模式下隐藏） */}
        {!previewing && <InlineReviseOverlay />}
      </div>

      {/* 状态条 */}
      <div className="flex items-center justify-between border-t px-8 py-2.5 text-xs text-muted-foreground">
        <span>{countChars(draft)} 字</span>
        <span className="flex items-center gap-3">
          <span className={STATUS_TONE[saveStatus]}>{STATUS_LABEL[saveStatus]}</span>
          {lastSavedAt && saveStatus === "saved" && (
            <span className="text-muted-foreground/70">{lastSavedAt}</span>
          )}
          <span>
            {activeChapterId ? `章节 #${activeChapterId}` : "新章节"}
          </span>
        </span>
      </div>
    </div>
  );
}
