"use client";

import { Input } from "@/components/ui/input";
import { countChars } from "@/lib/utils";
import { useWorkspace } from "./workspace-context";

export function EditorPane() {
  const { draft, setDraft, chapterTitle, setChapterTitle, activeChapterId } =
    useWorkspace();

  return (
    <div className="flex h-full flex-col">
      {/* 标题 */}
      <div className="border-b px-8 py-5">
        <Input
          value={chapterTitle}
          onChange={(e) => setChapterTitle(e.target.value)}
          placeholder="章节标题"
          className="display-title h-auto border-0 bg-transparent px-0 text-2xl shadow-none focus-visible:ring-0"
        />
      </div>

      {/* 正文：限定阅读栏宽，杂志沉浸感 */}
      <div className="flex-1 overflow-y-auto soft-scroll">
        <div className="mx-auto max-w-2xl px-8 py-8">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="在此落笔。写下正文，然后在右侧让 AI 续写、润色，并守护设定一致性。"
            className="prose-editor min-h-[60vh] w-full resize-none border-0 bg-transparent outline-none placeholder:text-muted-foreground/50"
            spellCheck={false}
          />
        </div>
      </div>

      {/* 状态条 */}
      <div className="flex items-center justify-between border-t px-8 py-2.5 text-xs text-muted-foreground">
        <span>{countChars(draft)} 字</span>
        <span>
          {activeChapterId ? `章节 #${activeChapterId}` : "未保存草稿"}
        </span>
      </div>
    </div>
  );
}
