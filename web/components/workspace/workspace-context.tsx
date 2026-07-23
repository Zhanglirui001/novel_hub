"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "@/lib/api";
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
} from "@/lib/queries";
import type {
  ChapterSummary,
  ChatSessionMessage,
  ChatSessionSummary,
  ContinueStreamEvent,
  GenerationResult,
  GhostCandidate,
  GhostStages,
  WritingDirective,
} from "@/lib/types";
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
  // ghost 续写：意图条 → 流式幽灵预览 → 就地落笔
  ghostAnchor: number | null;
  ghostStreaming: boolean;
  ghostStages: GhostStages;
  ghostCandidates: GhostCandidate[];
  activeGhostId: string | null;
  ghostLiveText: string;
  startGhost: () => void;
  runContinue: (instruction: string, opts?: { directive?: WritingDirective | null; mainline?: string; useGlobalMainline?: boolean }) => void;
  setActiveGhost: (id: string) => void;
  acceptGhost: () => void;
  cancelGhost: () => void;
  chatSessions: ChatSession[];
  activeChatSessionId: number | null;
  activeChatSession: ChatSession | null;
  chatMessages: ChatMessage[];
  chatDraft: string;
  setChatDraft: (v: string) => void;
  chatFullscreenOpen: boolean;
  setChatFullscreenOpen: (v: boolean) => void;
  /** 当前全屏的功能面板 tab（null 表示未全屏）。通用于所有 dock 面板。 */
  fullscreenTab: string | null;
  setFullscreenTab: (v: string | null) => void;
  createChatSession: (title?: string) => number;
  selectChatSession: (id: number) => void;
  sendChatMessage: (content: string) => void;
  chatStreaming: boolean;
  streamingContent: string;
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

// 把一条 stage 事件折叠进 HUD 状态。
function foldGhostStage(prev: GhostStages, event: ContinueStreamEvent): GhostStages {
  if (event.type !== "stage") return prev;
  switch (event.key) {
    case "intent":
      return { ...prev, intent: event.directive };
    case "retrieve": {
      const picked = event.picked ?? {};
      const count =
        (picked.characters?.length ?? 0) +
        (picked.world_rules?.length ?? 0) +
        (picked.terms?.length ?? 0);
      return { ...prev, retrieveCount: count };
    }
    case "guard":
      return { ...prev, score: event.score, issues: event.issues, repairing: false };
    case "repair":
      return { ...prev, repairing: true };
    case "reader":
      return { ...prev, reaction: event.reaction };
    default:
      return prev;
  }
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
  const [ghostAnchor, setGhostAnchor] = React.useState<number | null>(null);
  const [ghostStreaming, setGhostStreaming] = React.useState(false);
  const [ghostStages, setGhostStages] = React.useState<GhostStages>({});
  const [ghostCandidates, setGhostCandidates] = React.useState<GhostCandidate[]>([]);
  const [activeGhostId, setActiveGhostId] = React.useState<string | null>(null);
  const [ghostLiveText, setGhostLiveText] = React.useState("");
  const [chatDraft, setChatDraft] = React.useState("");
  // 通用面板全屏：记录当前全屏的 tab。聊天的开关是它的一个特例（tab === "chat"）。
  const [fullscreenTab, setFullscreenTab] = React.useState<string | null>(null);
  const chatFullscreenOpen = fullscreenTab === "chat";
  const setChatFullscreenOpen = React.useCallback(
    (v: boolean) => setFullscreenTab(v ? "chat" : null),
    [],
  );
  const [activeChatSessionId, setActiveChatSessionId] = React.useState<number | null>(null);
  const [chatStreaming, setChatStreaming] = React.useState(false);
  const [streamingContent, setStreamingContent] = React.useState("");
  const [pendingUserMessage, setPendingUserMessage] = React.useState<ChatMessage | null>(null);
  const streamAbortRef = React.useRef<AbortController | null>(null);

  const candidateSeq = React.useRef(0);
  const editorRef = React.useRef<HTMLTextAreaElement | null>(null);
  const registerEditor = React.useCallback((el: HTMLTextAreaElement | null) => {
    editorRef.current = el;
  }, []);

  // ghost 续写：在 async 流回调里需要读到最新值，用 ref 镜像。
  const ghostSeq = React.useRef(0);
  const ghostAbortRef = React.useRef<AbortController | null>(null);
  const ghostAnchorRef = React.useRef<number | null>(null);
  const ghostStreamingRef = React.useRef(false);
  const ghostCandidatesRef = React.useRef<GhostCandidate[]>([]);
  const activeGhostIdRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    ghostAnchorRef.current = ghostAnchor;
  }, [ghostAnchor]);
  React.useEffect(() => {
    ghostStreamingRef.current = ghostStreaming;
  }, [ghostStreaming]);
  React.useEffect(() => {
    ghostCandidatesRef.current = ghostCandidates;
  }, [ghostCandidates]);
  React.useEffect(() => {
    activeGhostIdRef.current = activeGhostId;
  }, [activeGhostId]);

  const saveChapter = useSaveChapter(projectId);
  const createChatSessionMutation = useCreateChatSession(projectId);
  const chatSessionsQuery = useChatSessions(projectId);
  const chatMessagesQuery = useChatMessages(activeChatSessionId);
  const clearChatSessionMutation = useClearChatSession(projectId, activeChatSessionId);
  const queryClient = useQueryClient();
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
    () => {
      const persisted: ChatMessage[] = (chatMessagesQuery.data ?? []).map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.created_at,
        context: message.context,
      }));
      // 流式过程中，用乐观的用户气泡与实时助手气泡补足尚未落库的两条消息。
      if (pendingUserMessage) {
        persisted.push(pendingUserMessage);
        persisted.push({
          id: -1,
          role: "assistant",
          content: streamingContent,
          createdAt: pendingUserMessage.createdAt,
        });
      }
      return persisted;
    },
    [chatMessagesQuery.data, pendingUserMessage, streamingContent],
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
    // 切章时丢弃未落笔的幽灵续写。
    ghostAbortRef.current?.abort();
    ghostAbortRef.current = null;
    setGhostAnchor(null);
    setGhostStreaming(false);
    setGhostStages({});
    setGhostCandidates([]);
    setActiveGhostId(null);
    setGhostLiveText("");
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
    if (!text || activeChatSessionId === null || chatStreaming) return;

    const sessionId = activeChatSessionId;
    const nowIso = new Date().toISOString();
    setPendingUserMessage({ id: -2, role: "user", content: text, createdAt: nowIso });
    setStreamingContent("");
    setChatStreaming(true);
    setChatDraft("");

    const controller = new AbortController();
    streamAbortRef.current = controller;

    let assembled = "";
    let streamError: string | null = null;

    api
      .streamChatMessage(
        sessionId,
        {
          content: text,
          chapter_title: chapterTitle.trim() || "未命名章节",
          chapter_group_title: chapterGroupTitle.trim() || DEFAULT_GROUP_TITLE,
          active_chapter_id: activeChapterId,
          selection_text: selection?.text ?? null,
        },
        {
          signal: controller.signal,
          onEvent: (event) => {
            if (event.type === "delta") {
              assembled += event.text;
              setStreamingContent(assembled);
            } else if (event.type === "error") {
              streamError = event.message;
            } else if (event.type === "done") {
              // 用后端落库结果覆盖本地缓存，拿到真实 id 与时间戳。
              queryClient.setQueryData(["chat-messages", event.session.id], (prev: unknown) => {
                const existing = Array.isArray(prev) ? prev : [];
                return [...existing, ...event.messages];
              });
              queryClient.invalidateQueries({ queryKey: ["chat-sessions", projectId] });
            }
          },
        },
      )
      .then(() => {
        if (streamError) toast.error(streamError);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        toast.error(error instanceof Error ? error.message : "发送失败");
      })
      .finally(() => {
        setChatStreaming(false);
        setStreamingContent("");
        setPendingUserMessage(null);
        streamAbortRef.current = null;
      });
  }, [
    activeChapterId,
    activeChatSessionId,
    chapterGroupTitle,
    chapterTitle,
    chatStreaming,
    projectId,
    queryClient,
    selection?.text,
  ]);

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

  // ---- ghost 续写：意图条 → 流式幽灵预览 → 就地落笔 ----------------------

  const cancelGhost = React.useCallback(() => {
    ghostAbortRef.current?.abort();
    ghostAbortRef.current = null;
    setGhostAnchor(null);
    setGhostStreaming(false);
    setGhostStages({});
    setGhostCandidates([]);
    setActiveGhostId(null);
    setGhostLiveText("");
  }, []);

  const startGhost = React.useCallback(() => {
    const el = editorRef.current;
    const caret = el ? el.selectionStart ?? draftRef.current.length : draftRef.current.length;
    ghostAbortRef.current?.abort();
    ghostAbortRef.current = null;
    ghostAnchorRef.current = caret; // 同步置位，便于同一 tick 内紧接着调用 runContinue（如「据此起笔」）
    setGhostAnchor(caret);
    setGhostStreaming(false);
    setGhostStages({});
    setGhostCandidates([]);
    setActiveGhostId(null);
    setGhostLiveText("");
  }, []);

  const setActiveGhost = React.useCallback((id: string) => {
    setActiveGhostId(id);
  }, []);

  const runContinue = React.useCallback(
    (
      instruction: string,
      opts?: { directive?: WritingDirective | null; mainline?: string; useGlobalMainline?: boolean },
    ) => {
      const anchor = ghostAnchorRef.current;
      if (anchor == null || ghostStreamingRef.current) return;

      const mainline = (opts?.mainline ?? "").trim();
      const useGlobalMainline = opts?.useGlobalMainline ?? true;

      // 解析续写素材：光标前有正文 → 段中续写；空章节 → 起笔，承接上一章结尾。
      const resolveSource = async (): Promise<{ tail: string; mode: "continue" | "opening" } | null> => {
        const tail = draftRef.current.slice(0, anchor);
        if (tail.trim()) return { tail, mode: "continue" };

        // 空章节：找上一章末尾作为起笔素材。
        const currentId = chapterIdRef.current;
        const list = queryClient.getQueryData<ChapterSummary[]>(["chapters", projectId]);
        if (currentId != null && list && list.length > 0) {
          const sorted = [...list].sort((a, b) => {
            if (a.group_title !== b.group_title) return a.group_title < b.group_title ? -1 : 1;
            if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
            return a.id - b.id;
          });
          const idx = sorted.findIndex((c) => c.id === currentId);
          if (idx > 0) {
            try {
              const prev = await api.getChapter(sorted[idx - 1].id);
              const prevTail = (prev.content ?? "").trim().slice(-1600);
              if (prevTail) return { tail: prevTail, mode: "opening" };
            } catch {
              // 取上一章失败时退回主线兜底。
            }
          }
        }
        // 无上一章正文，但有主线也可起笔。
        if (mainline) return { tail: "", mode: "opening" };
        return null;
      };

      setGhostStreaming(true);
      setGhostLiveText("");
      setGhostStages({});

      const controller = new AbortController();
      ghostAbortRef.current = controller;

      let assembled = "";
      let streamError: string | null = null;

      resolveSource()
        .then((source) => {
          if (!source) {
            toast.error("光标前没有正文，且未找到上一章可承接");
            setGhostStreaming(false);
            ghostAbortRef.current = null;
            return;
          }
          return api
            .streamContinue(
              {
                project_id: projectId,
                tail_text: source.tail,
                instruction: instruction.trim(),
                directive: opts?.directive ?? null,
                chapter_title: titleRef.current.trim() || "未命名章节",
                budget: "medium",
                target_latency_ms: 6000,
                mode: source.mode,
                mainline,
                use_global_mainline: useGlobalMainline,
              },
              {
                signal: controller.signal,
                onEvent: (event) => {
                  if (event.type === "delta") {
                    assembled = event.replace != null ? event.replace : assembled + event.text;
                    setGhostLiveText(assembled);
                  } else if (event.type === "stage") {
                    setGhostStages((prev) => foldGhostStage(prev, event));
                  } else if (event.type === "done") {
                    ghostSeq.current += 1;
                    const id = `ghost-${ghostSeq.current}`;
                    const candidate: GhostCandidate = {
                      id,
                      label: `版本 ${ghostSeq.current}`,
                      text: event.result_text,
                      score: event.consistency_score,
                      issues: event.issues,
                      readerReaction: event.reader_reaction,
                      directive: event.directive,
                    };
                    setGhostCandidates((prev) => [...prev, candidate]);
                    setActiveGhostId(id);
                    setGhostStages((prev) => ({
                      ...prev,
                      intent: event.directive,
                      score: event.consistency_score,
                      issues: event.issues,
                      reaction: event.reader_reaction,
                      repairing: false,
                    }));
                  } else if (event.type === "error") {
                    streamError = event.message;
                  }
                },
              },
            )
            .then(() => {
              if (streamError) toast.error(streamError);
            });
        })
        .catch((error) => {
          if (controller.signal.aborted) return;
          toast.error(error instanceof Error ? error.message : "续写失败");
        })
        .finally(() => {
          setGhostStreaming(false);
          setGhostLiveText("");
          ghostAbortRef.current = null;
        });
    },
    [projectId],
  );

  const acceptGhost = React.useCallback(() => {
    const anchor = ghostAnchorRef.current;
    const candidate = ghostCandidatesRef.current.find((c) => c.id === activeGhostIdRef.current);
    if (anchor == null || !candidate) return;

    // 光标前若非以空白结尾，补一个换行，避免和前文黏在一起。
    const before = draftRef.current.slice(0, anchor);
    const needsBreak = before.length > 0 && !/\s$/.test(before);
    const insertText = (needsBreak ? "\n\n" : "") + candidate.text;

    cancelGhost();
    replaceRange(anchor, anchor, insertText);
    window.setTimeout(() => void saveNow(), 0);

    // 采纳后端钩子：写「续写落笔」时间线 + 回流风格样本刷新活画像。
    // fire-and-forget——落笔已成功，钩子失败不打断写作，只静默忽略。
    void api
      .acceptContinue({
        project_id: projectId,
        chapter_title: titleRef.current.trim() || "未命名章节",
        accepted_text: candidate.text,
        directive: candidate.directive,
        consistency_score: candidate.score,
      })
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["timeline", projectId] });
        queryClient.invalidateQueries({ queryKey: ["style-profile", projectId] });
      })
      .catch(() => {
        /* 静默：采纳落笔与保存已完成，后端钩子失败不影响写作 */
      });
  }, [cancelGhost, replaceRange, saveNow, projectId, queryClient]);

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
    ghostAnchor,
    ghostStreaming,
    ghostStages,
    ghostCandidates,
    activeGhostId,
    ghostLiveText,
    startGhost,
    runContinue,
    setActiveGhost,
    acceptGhost,
    cancelGhost,
    chatSessions,
    activeChatSessionId,
    activeChatSession,
    chatMessages,
    chatDraft,
    setChatDraft,
    chatFullscreenOpen,
    setChatFullscreenOpen,
    fullscreenTab,
    setFullscreenTab,
    createChatSession,
    selectChatSession,
    sendChatMessage,
    chatStreaming,
    streamingContent,
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
