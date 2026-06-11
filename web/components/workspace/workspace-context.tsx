"use client";

import * as React from "react";

import type { GenerationResult } from "@/lib/types";

interface WorkspaceState {
  projectId: number;
  // 编辑器当前内容（正文）
  draft: string;
  setDraft: (v: string) => void;
  // 章节标题
  chapterTitle: string;
  setChapterTitle: (v: string) => void;
  // 当前载入的章节 id（null = 新章节草稿）
  activeChapterId: number | null;
  loadChapter: (id: number | null, title: string, content: string) => void;
  // 最近一次生成结果
  lastResult: GenerationResult | null;
  setLastResult: (r: GenerationResult | null) => void;
  // 右栏激活 tab，用于生成后自动跳转
  dockTab: string;
  setDockTab: (t: string) => void;
}

const WorkspaceContext = React.createContext<WorkspaceState | null>(null);

export function WorkspaceProvider({
  projectId,
  children,
}: {
  projectId: number;
  children: React.ReactNode;
}) {
  const [draft, setDraft] = React.useState("");
  const [chapterTitle, setChapterTitle] = React.useState("第1章");
  const [activeChapterId, setActiveChapterId] = React.useState<number | null>(null);
  const [lastResult, setLastResult] = React.useState<GenerationResult | null>(null);
  const [dockTab, setDockTab] = React.useState("create");

  const loadChapter = React.useCallback(
    (id: number | null, title: string, content: string) => {
      setActiveChapterId(id);
      setChapterTitle(title);
      setDraft(content);
      setLastResult(null);
    },
    []
  );

  const value: WorkspaceState = {
    projectId,
    draft,
    setDraft,
    chapterTitle,
    setChapterTitle,
    activeChapterId,
    loadChapter,
    lastResult,
    setLastResult,
    dockTab,
    setDockTab,
  };

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = React.useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace 必须在 WorkspaceProvider 内使用");
  return ctx;
}
