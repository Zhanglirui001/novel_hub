"use client";

import * as React from "react";
import { toast } from "sonner";

import { useSaveChapter } from "@/lib/queries";
import type { GenerationResult } from "@/lib/types";

const AUTOSAVE_DEBOUNCE_MS = 5000;

type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export interface EditorSelection {
  start: number;
  end: number;
  text: string;
}

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
  // 编辑器选区，供「批注修改」面板读取
  selection: EditorSelection | null;
  setSelection: (s: EditorSelection | null) => void;
  // 把指定区间替换为新文本，并把光标定位到末尾
  replaceRange: (start: number, end: number, text: string) => void;
  // 把 textarea ref 注册进来，方便重置选区/聚焦
  registerEditor: (el: HTMLTextAreaElement | null) => void;
  // 保存相关
  saveStatus: SaveStatus;
  lastSavedAt: string | null;
  autosaveEnabled: boolean;
  setAutosaveEnabled: (v: boolean) => void;
  saveNow: () => Promise<void>;
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
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = React.useState<string | null>(null);
  const [autosaveEnabled, setAutosaveEnabled] = React.useState(true);
  const [selection, setSelection] = React.useState<EditorSelection | null>(null);

  const editorRef = React.useRef<HTMLTextAreaElement | null>(null);
  const registerEditor = React.useCallback((el: HTMLTextAreaElement | null) => {
    editorRef.current = el;
  }, []);

  const saveChapter = useSaveChapter(projectId);

  // 用 ref 持最新值，避免 saveNow / debounce 闭包过期；同时用 ref 标记
  // 「刚 load」一段，防止 loadChapter 触发的 setState 被识别为 dirty。
  const draftRef = React.useRef(draft);
  const titleRef = React.useRef(chapterTitle);
  const chapterIdRef = React.useRef<number | null>(activeChapterId);
  const skipDirtyRef = React.useRef(false);
  React.useEffect(() => { draftRef.current = draft; }, [draft]);
  React.useEffect(() => { titleRef.current = chapterTitle; }, [chapterTitle]);
  React.useEffect(() => { chapterIdRef.current = activeChapterId; }, [activeChapterId]);

  const loadChapter = React.useCallback(
    (id: number | null, title: string, content: string) => {
      skipDirtyRef.current = true;
      setActiveChapterId(id);
      setChapterTitle(title);
      setDraft(content);
      setLastResult(null);
      setSelection(null);
      setSaveStatus(id ? "saved" : "idle");
    },
    [],
  );

  const replaceRange = React.useCallback(
    (start: number, end: number, text: string) => {
      const current = draftRef.current;
      const safeStart = Math.max(0, Math.min(start, current.length));
      const safeEnd = Math.max(safeStart, Math.min(end, current.length));
      const next = current.slice(0, safeStart) + text + current.slice(safeEnd);
      setDraft(next);
      const caret = safeStart + text.length;
      setSelection(null);
      // 等 textarea 完成下一次渲染后，把光标放到替换末尾。
      window.setTimeout(() => {
        const el = editorRef.current;
        if (!el) return;
        el.focus();
        try { el.setSelectionRange(caret, caret); } catch { /* ignore */ }
      }, 0);
    },
    [],
  );

  const saveNow = React.useCallback(async () => {
    const title = titleRef.current.trim() || "未命名章节";
    const content = draftRef.current;
    if (!content.trim()) {
      // 空白稿不落盘，避免误生成空章。
      return;
    }
    setSaveStatus("saving");
    try {
      const res = await saveChapter.mutateAsync({
        project_id: projectId,
        title,
        content,
        chapter_id: chapterIdRef.current,
      });
      chapterIdRef.current = res.chapter_id;
      setActiveChapterId(res.chapter_id);
      setLastSavedAt(res.updated_at);
      setSaveStatus("saved");
    } catch (err) {
      setSaveStatus("error");
      toast.error(err instanceof Error ? err.message : "保存失败");
    }
  }, [projectId, saveChapter]);

  // 内容变化 → dirty。loadChapter 后第一次 effect 跳过。
  React.useEffect(() => {
    if (skipDirtyRef.current) {
      skipDirtyRef.current = false;
      return;
    }
    setSaveStatus((prev) => (prev === "saving" ? prev : "dirty"));
  }, [draft, chapterTitle]);

  // dirty + 自动保存开启 → 5s 去抖触发 saveNow
  React.useEffect(() => {
    if (!autosaveEnabled) return;
    if (saveStatus !== "dirty") return;
    const timer = window.setTimeout(() => { void saveNow(); }, AUTOSAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [autosaveEnabled, saveStatus, saveNow]);

  // Ctrl/Cmd+S 立即保存
  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        void saveNow();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [saveNow]);

  // 关页面前对未保存修改给出原生确认。
  React.useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (saveStatus === "dirty" || saveStatus === "saving") {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [saveStatus]);

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
    selection,
    setSelection,
    replaceRange,
    registerEditor,
    saveStatus,
    lastSavedAt,
    autosaveEnabled,
    setAutosaveEnabled,
    saveNow,
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
