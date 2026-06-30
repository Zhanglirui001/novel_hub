"use client";

import * as React from "react";
import { toast } from "sonner";

import { useSaveChapter } from "@/lib/queries";
import type { GenerationResult } from "@/lib/types";

const AUTOSAVE_DEBOUNCE_MS = 5000;
const DEFAULT_GROUP_TITLE = "默认卷";
const MAX_CHAPTER_TITLE_LENGTH = 255;

type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export interface EditorSelection {
  start: number;
  end: number;
  text: string;
}

// 正在被修改的选区目标——多个候选版本共享同一目标（同一 start/end/原文）。
export interface ReviseTarget {
  start: number;
  end: number;
  originalText: string; // diff 基准 = 被替换的原文
  prefix: string; // 重新生成所需上下文
  suffix: string;
}

// 一个候选修改版本。
export interface ReviseCandidate {
  id: string;
  label: string; // "版本 1"…
  resultText: string; // AI 原始输出
  editedText: string; // 可编辑工作副本，初值 = resultText
  annotation: string;
  analysis: string;
  consistencyScore: number;
}

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  context?: {
    chapterTitle: string;
    chapterGroupTitle: string;
    activeChapterId: number | null;
    hasSelection: boolean;
    selectionText?: string;
  };
}

interface WorkspaceState {
  projectId: number;
  // 编辑器当前内容（正文）
  draft: string;
  setDraft: (v: string) => void;
  // 章节标题
  chapterTitle: string;
  setChapterTitle: (v: string) => void;
  // 章节所属卷/分组
  chapterGroupTitle: string;
  setChapterGroupTitle: (v: string) => void;
  // 当前载入的章节 id（null = 新章节草稿）
  activeChapterId: number | null;
  loadChapter: (
    id: number | null,
    title: string,
    content: string,
    groupTitle?: string,
  ) => void;
  // 最近一次生成结果
  lastResult: GenerationResult | null;
  setLastResult: (r: GenerationResult | null) => void;
  // 右栏激活 tab，用于生成后自动跳转
  dockTab: string;
  setDockTab: (t: string) => void;
  // 编辑器选区，供「批注修改」面板读取
  selection: EditorSelection | null;
  setSelection: (s: EditorSelection | null) => void;
  // 选段修改：原地 diff 预览 + 多候选版本
  reviseTarget: ReviseTarget | null;
  candidates: ReviseCandidate[];
  activeCandidateId: string | null;
  // 设定新目标并清空旧候选（新一轮修改的起点）
  startReviseTarget: (t: ReviseTarget) => void;
  // 追加一个候选并设为 active；返回新候选 id
  addCandidate: (c: Omit<ReviseCandidate, "id" | "label">) => string;
  setActiveCandidate: (id: string) => void;
  updateCandidateText: (id: string, text: string) => void;
  removeCandidate: (id: string) => void;
  clearRevise: () => void;
  // 把指定区间替换为新文本，并把光标定位到末尾
  replaceRange: (start: number, end: number, text: string) => void;
  // 把 textarea ref 注册进来，方便重置选区/聚焦
  registerEditor: (el: HTMLTextAreaElement | null) => void;
  // AI 会话框：侧栏与全屏共享同一份状态
  chatMessages: ChatMessage[];
  chatDraft: string;
  setChatDraft: (v: string) => void;
  chatFullscreenOpen: boolean;
  setChatFullscreenOpen: (v: boolean) => void;
  sendChatMessage: (content: string) => void;
  clearChat: () => void;
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
  const [chapterGroupTitle, setChapterGroupTitle] = React.useState(DEFAULT_GROUP_TITLE);
  const [activeChapterId, setActiveChapterId] = React.useState<number | null>(null);
  const [lastResult, setLastResult] = React.useState<GenerationResult | null>(null);
  const [dockTab, setDockTab] = React.useState("create");
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = React.useState<string | null>(null);
  const [autosaveEnabled, setAutosaveEnabled] = React.useState(true);
  const [selection, setSelection] = React.useState<EditorSelection | null>(null);
  const [reviseTarget, setReviseTarget] = React.useState<ReviseTarget | null>(null);
  const [candidates, setCandidates] = React.useState<ReviseCandidate[]>([]);
  const [activeCandidateId, setActiveCandidateId] = React.useState<string | null>(null);
  const [chatMessages, setChatMessages] = React.useState<ChatMessage[]>([]);
  const [chatDraft, setChatDraft] = React.useState("");
  const [chatFullscreenOpen, setChatFullscreenOpen] = React.useState(false);

  // 候选 id / 序号计数器（环境禁用 Math.random / Date.now，用单调递增 ref）。
  const candidateSeq = React.useRef(0);
  const chatSeq = React.useRef(0);

  const editorRef = React.useRef<HTMLTextAreaElement | null>(null);
  const registerEditor = React.useCallback((el: HTMLTextAreaElement | null) => {
    editorRef.current = el;
  }, []);

  const saveChapter = useSaveChapter(projectId);

  // 用 ref 持最新值，避免 saveNow / debounce 闭包过期；同时用 ref 标记
  // 「刚 load」一段，防止 loadChapter 触发的 setState 被识别为 dirty。
  const draftRef = React.useRef(draft);
  const titleRef = React.useRef(chapterTitle);
  const groupTitleRef = React.useRef(chapterGroupTitle);
  const chapterIdRef = React.useRef<number | null>(activeChapterId);
  const skipDirtyRef = React.useRef(false);
  React.useEffect(() => { draftRef.current = draft; }, [draft]);
  React.useEffect(() => { titleRef.current = chapterTitle; }, [chapterTitle]);
  React.useEffect(() => { groupTitleRef.current = chapterGroupTitle; }, [chapterGroupTitle]);
  React.useEffect(() => { chapterIdRef.current = activeChapterId; }, [activeChapterId]);

  const clearRevise = React.useCallback(() => {
    setReviseTarget(null);
    setCandidates([]);
    setActiveCandidateId(null);
  }, []);

  const startReviseTarget = React.useCallback((t: ReviseTarget) => {
    setReviseTarget(t);
    setCandidates([]);
    setActiveCandidateId(null);
  }, []);

  const addCandidate = React.useCallback(
    (c: Omit<ReviseCandidate, "id" | "label">) => {
      candidateSeq.current += 1;
      const seq = candidateSeq.current;
      const id = `cand-${seq}`;
      const candidate: ReviseCandidate = { ...c, id, label: `版本 ${seq}` };
      setCandidates((prev) => [...prev, candidate]);
      setActiveCandidateId(id);
      return id;
    },
    [],
  );

  const setActiveCandidate = React.useCallback((id: string) => {
    setActiveCandidateId(id);
  }, []);

  const updateCandidateText = React.useCallback((id: string, text: string) => {
    setCandidates((prev) =>
      prev.map((c) => (c.id === id ? { ...c, editedText: text } : c)),
    );
  }, []);

  const removeCandidate = React.useCallback((id: string) => {
    setCandidates((prev) => {
      const next = prev.filter((c) => c.id !== id);
      setActiveCandidateId((active) =>
        active === id ? (next.length ? next[next.length - 1].id : null) : active,
      );
      if (next.length === 0) setReviseTarget(null);
      return next;
    });
  }, []);

  const loadChapter = React.useCallback(
    (
      id: number | null,
      title: string,
      content: string,
      groupTitle = DEFAULT_GROUP_TITLE,
    ) => {
      skipDirtyRef.current = true;
      setActiveChapterId(id);
      setChapterTitle(title);
      setChapterGroupTitle(groupTitle.trim() || DEFAULT_GROUP_TITLE);
      setDraft(content);
      setLastResult(null);
      setSelection(null);
      clearRevise();
      setSaveStatus(id ? "saved" : "idle");
    },
    [clearRevise],
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

  const sendChatMessage = React.useCallback(
    (content: string) => {
      const text = content.trim();
      if (!text) return;

      chatSeq.current += 1;
      const userId = `chat-user-${chatSeq.current}`;
      chatSeq.current += 1;
      const assistantId = `chat-assistant-${chatSeq.current}`;
      const context = {
        chapterTitle: chapterTitle.trim() || "未命名章节",
        chapterGroupTitle: chapterGroupTitle.trim() || DEFAULT_GROUP_TITLE,
        activeChapterId,
        hasSelection: Boolean(selection?.text),
        selectionText: selection?.text,
      };
      const selectedPreview = selection?.text.trim().slice(0, 120);
      const assistantContent = selectedPreview
        ? `我已看到你选中的片段，可以围绕节奏、画面感、人物动机和信息密度来处理。\n\n选区开头：${selectedPreview}${(context.selectionText?.length ?? 0) > 120 ? "…" : ""}\n\n你可以继续要求我：润色这段、改成更压抑的语气、扩写心理活动，或检查这段是否和前文设定冲突。`
        : `我会围绕当前章节「${context.chapterTitle}」协助你。\n\n可以让我继续写下一段、分析戏剧冲突、检查人物动机，或给出几版改写方向。若要精修某一段，先在正文中选中文字再发送给我。`;

      setChatMessages((prev) => [
        ...prev,
        { id: userId, role: "user", content: text, context },
        { id: assistantId, role: "assistant", content: assistantContent, context },
      ]);
    },
    [activeChapterId, chapterGroupTitle, chapterTitle, selection],
  );

  const clearChat = React.useCallback(() => {
    setChatMessages([]);
    setChatDraft("");
  }, []);

  const saveNow = React.useCallback(async () => {
    const title = titleRef.current.trim() || "未命名章节";
    const groupTitle = groupTitleRef.current.trim() || DEFAULT_GROUP_TITLE;
    const content = draftRef.current;
    if (title.length > MAX_CHAPTER_TITLE_LENGTH || groupTitle.length > MAX_CHAPTER_TITLE_LENGTH) {
      setSaveStatus("error");
      toast.error("章节标题或分组名称不能超过 255 个字符");
      return;
    }
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
        group_title: groupTitle,
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
  }, [draft, chapterTitle, chapterGroupTitle]);

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
    chapterGroupTitle,
    setChapterGroupTitle,
    activeChapterId,
    loadChapter,
    lastResult,
    setLastResult,
    dockTab,
    setDockTab,
    selection,
    setSelection,
    reviseTarget,
    candidates,
    activeCandidateId,
    startReviseTarget,
    addCandidate,
    setActiveCandidate,
    updateCandidateText,
    removeCandidate,
    clearRevise,
    replaceRange,
    registerEditor,
    chatMessages,
    chatDraft,
    setChatDraft,
    chatFullscreenOpen,
    setChatFullscreenOpen,
    sendChatMessage,
    clearChat,
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
