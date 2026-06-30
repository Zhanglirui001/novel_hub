"use client";

import * as React from "react";
import { toast } from "sonner";

import {
  useBackupChapter,
  useChatMessages,
  useChatSessions,
  useClearChatSession,
  useCreateChatSession,
  useDeleteChapter,
  useMoveChapter,
  useProject,
  useProjects,
  useRenameChapter,
  useSaveChapter,
  useSendChatMessage,
} from "@/lib/queries";
import type { ChatSessionMessage, ChatSessionSummary, GenerationResult } from "@/lib/types";

const AUTOSAVE_DEBOUNCE_MS = 5000;
const DEFAULT_GROUP_TITLE = "默认卷";
const MAX_CHAPTER_TITLE_LENGTH = 255;

type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export interface EditorSelection {
  start: number;
  end: number;
  text: string;
}

export interface ReviseTarget {
  start: number;
  end: number;
  originalText: string;
  prefix: string;
  suffix: string;
}

export interface ReviseCandidate {
  id: string;
  label: string;
  resultText: string;
  editedText: string;
  annotation: string;
  analysis: string;
  consistencyScore: number;
}

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  id: number;
  role: ChatRole;
  content: string;
  createdAt: string;
  context?: ChatSessionMessage["context"];
}

export interface ChatSession {
  id: number;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  lastMessagePreview: string;
}

interface WorkspaceState {
  projectId: number;
  draft: string;
  setDraft: (v: string) => void;
  chapterTitle: string;
  setChapterTitle: (v: string) => void;
  chapterGroupTitle: string;
  setChapterGroupTitle: (v: string) => void;
  activeChapterId: number | null;
  loadChapter: (id: number | null, title: string, content: string, groupTitle?: string) => void;
  lastResult: GenerationResult | null;
  setLastResult: (r: GenerationResult | null) => void;
  dockTab: string;
  setDockTab: (t: string) => void;
  selection: EditorSelection | null;
  setSelection: (s: EditorSelection | null) => void;
  reviseTarget: ReviseTarget | null;
  candidates: ReviseCandidate[];
  activeCandidateId: string | null;
  startReviseTarget: (t: ReviseTarget) => void;
  addCandidate: (c: Omit<ReviseCandidate, "id" | "label">) => string;
  setActiveCandidate: (id: string) => void;
  updateCandidateText: (id: string, text: string) => void;
  removeCandidate: (id: string) => void;
  clearRevise: () => void;
  replaceRange: (start: number, end: number, text: string) => void;
  registerEditor: (el: HTMLTextAreaElement | null) => void;
  chatSessions: ChatSession[];
  activeChatSessionId: number | null;
  activeChatSession: ChatSession | null;
  chatMessages: ChatMessage[];
  chatDraft: string;
  setChatDraft: (v: string) => void;
  chatFullscreenOpen: boolean;
  setChatFullscreenOpen: (v: boolean) => void;
  createChatSession: (title?: string) => number;
  selectChatSession: (id: number) => void;
  sendChatMessage: (content: string) => void;
  clearChat: () => void;
  saveStatus: SaveStatus;
  lastSavedAt: string | null;
  autosaveEnabled: boolean;
  setAutosaveEnabled: (v: boolean) => void;
  saveNow: () => Promise<void>;
}

const WorkspaceContext = React.createContext<WorkspaceState | null>(null);

function mapSessions(rows: ChatSessionSummary[] | undefined): ChatSession[] {
  return (rows ?? [])
    .slice()
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at) || b.id - a.id)
    .map((session) => ({
      id: session.id,
      title: session.title,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
      messageCount: session.message_count,
      lastMessagePreview: session.last_message_preview,
    }));
}

export function WorkspaceProvider({ projectId, children }: { projectId: number; children: React.ReactNode }) {
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
  const [chatDraft, setChatDraft] = React.useState("");
  const [chatFullscreenOpen, setChatFullscreenOpen] = React.useState(false);
  const [activeChatSessionId, setActiveChatSessionId] = React.useState<number | null>(null);

  const candidateSeq = React.useRef(0);
  const editorRef = React.useRef<HTMLTextAreaElement | null>(null);
  const registerEditor = React.useCallback((el: HTMLTextAreaElement | null) => {
    editorRef.current = el;
  }, []);

  const saveChapter = useSaveChapter(projectId);
  const createChatSessionMutation = useCreateChatSession(projectId);
  const chatSessionsQuery = useChatSessions(projectId);
  const chatMessagesQuery = useChatMessages(activeChatSessionId);
  const sendChatMessageMutation = useSendChatMessage(projectId, activeChatSessionId);
  const clearChatSessionMutation = useClearChatSession(projectId, activeChatSessionId);
  useProjects();
  useProject(projectId);
  useBackupChapter();
  useDeleteChapter(projectId);
  useMoveChapter(projectId);
  useRenameChapter(projectId);

  const draftRef = React.useRef(draft);
  const titleRef = React.useRef(chapterTitle);
  const groupTitleRef = React.useRef(chapterGroupTitle);
  const chapterIdRef = React.useRef<number | null>(activeChapterId);
  const skipDirtyRef = React.useRef(false);
  React.useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  React.useEffect(() => {
    titleRef.current = chapterTitle;
  }, [chapterTitle]);
  React.useEffect(() => {
    groupTitleRef.current = chapterGroupTitle;
  }, [chapterGroupTitle]);
  React.useEffect(() => {
    chapterIdRef.current = activeChapterId;
  }, [activeChapterId]);

  const chatSessions = React.useMemo(() => mapSessions(chatSessionsQuery.data), [chatSessionsQuery.data]);
  const activeChatSession = React.useMemo(
    () => chatSessions.find((session) => session.id === activeChatSessionId) ?? null,
    [activeChatSessionId, chatSessions],
  );
  const chatMessages: ChatMessage[] = React.useMemo(
    () =>
      (chatMessagesQuery.data ?? []).map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.created_at,
        context: message.context,
      })),
    [chatMessagesQuery.data],
  );

  React.useEffect(() => {
    if (activeChatSessionId !== null) return;
    if (chatSessions.length === 0) return;
    setActiveChatSessionId(chatSessions[0].id);
  }, [activeChatSessionId, chatSessions]);

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

  const addCandidate = React.useCallback((c: Omit<ReviseCandidate, "id" | "label">) => {
    candidateSeq.current += 1;
    const id = `cand-${candidateSeq.current}`;
    const candidate: ReviseCandidate = { ...c, id, label: `版本 ${candidateSeq.current}` };
    setCandidates((prev) => [...prev, candidate]);
    setActiveCandidateId(id);
    return id;
  }, []);

  const setActiveCandidate = React.useCallback((id: string) => {
    setActiveCandidateId(id);
  }, []);

  const updateCandidateText = React.useCallback((id: string, text: string) => {
    setCandidates((prev) => prev.map((c) => (c.id === id ? { ...c, editedText: text } : c)));
  }, []);

  const removeCandidate = React.useCallback((id: string) => {
    setCandidates((prev) => {
      const next = prev.filter((c) => c.id !== id);
      setActiveCandidateId((active) => (active === id ? (next.length ? next[next.length - 1].id : null) : active));
      if (next.length === 0) setReviseTarget(null);
      return next;
    });
  }, []);

  const loadChapter = React.useCallback((id: number | null, title: string, content: string, groupTitle = DEFAULT_GROUP_TITLE) => {
    skipDirtyRef.current = true;
    setActiveChapterId(id);
    setChapterTitle(title);
    setChapterGroupTitle(groupTitle.trim() || DEFAULT_GROUP_TITLE);
    setDraft(content);
    setLastResult(null);
    setSelection(null);
    clearRevise();
    setSaveStatus(id ? "saved" : "idle");
  }, [clearRevise]);

  const replaceRange = React.useCallback((start: number, end: number, text: string) => {
    const current = draftRef.current;
    const safeStart = Math.max(0, Math.min(start, current.length));
    const safeEnd = Math.max(safeStart, Math.min(end, current.length));
    const next = current.slice(0, safeStart) + text + current.slice(safeEnd);
    setDraft(next);
    const caret = safeStart + text.length;
    setSelection(null);
    window.setTimeout(() => {
      const el = editorRef.current;
      if (!el) return;
      el.focus();
      try {
        el.setSelectionRange(caret, caret);
      } catch {
        /* ignore */
      }
    }, 0);
  }, []);

  const createChatSession = React.useCallback((title?: string) => {
    const provisional = title?.trim() || `会话 ${chatSessions.length + 1}`;
    const createdPromise = createChatSessionMutation.mutateAsync({ title: provisional });
    void createdPromise
      .then((session) => {
        setActiveChatSessionId(session.id);
        toast.success("已创建新会话");
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "创建会话失败");
      });
    setChatDraft("");
    return activeChatSessionId ?? 0;
  }, [activeChatSessionId, chatSessions.length, createChatSessionMutation]);

  const selectChatSession = React.useCallback((id: number) => {
    setActiveChatSessionId(id);
    setChatDraft("");
  }, []);

  const sendChatMessage = React.useCallback((content: string) => {
    const text = content.trim();
    if (!text || activeChatSessionId === null) return;
    sendChatMessageMutation.mutate(
      {
        content: text,
        chapter_title: chapterTitle.trim() || "未命名章节",
        chapter_group_title: chapterGroupTitle.trim() || DEFAULT_GROUP_TITLE,
        active_chapter_id: activeChapterId,
        selection_text: selection?.text ?? null,
      },
      {
        onSuccess: () => setChatDraft(""),
        onError: (error) => toast.error(error instanceof Error ? error.message : "发送失败"),
      },
    );
  }, [activeChapterId, activeChatSessionId, chapterGroupTitle, chapterTitle, selection?.text, sendChatMessageMutation]);

  const clearChat = React.useCallback(() => {
    if (activeChatSessionId === null) return;
    clearChatSessionMutation.mutate(undefined, {
      onSuccess: () => setChatDraft(""),
      onError: (error) => toast.error(error instanceof Error ? error.message : "清空失败"),
    });
  }, [activeChatSessionId, clearChatSessionMutation]);

  const saveNow = React.useCallback(async () => {
    const title = titleRef.current.trim() || "未命名章节";
    const groupTitle = groupTitleRef.current.trim() || DEFAULT_GROUP_TITLE;
    const content = draftRef.current;
    if (title.length > MAX_CHAPTER_TITLE_LENGTH || groupTitle.length > MAX_CHAPTER_TITLE_LENGTH) {
      setSaveStatus("error");
      toast.error("章节标题或分组名称不能超过 255 个字符");
      return;
    }
    if (!content.trim()) return;
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

  React.useEffect(() => {
    if (skipDirtyRef.current) {
      skipDirtyRef.current = false;
      return;
    }
    setSaveStatus((prev) => (prev === "saving" ? prev : "dirty"));
  }, [draft, chapterTitle, chapterGroupTitle]);

  React.useEffect(() => {
    if (!autosaveEnabled) return;
    if (saveStatus !== "dirty") return;
    const timer = window.setTimeout(() => {
      void saveNow();
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [autosaveEnabled, saveNow, saveStatus]);

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
    chatSessions,
    activeChatSessionId,
    activeChatSession,
    chatMessages,
    chatDraft,
    setChatDraft,
    chatFullscreenOpen,
    setChatFullscreenOpen,
    createChatSession,
    selectChatSession,
    sendChatMessage,
    clearChat,
    saveStatus,
    lastSavedAt,
    autosaveEnabled,
    setAutosaveEnabled,
    saveNow,
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = React.useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace 必须在 WorkspaceProvider 内使用");
  return ctx;
}
